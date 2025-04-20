import env_config
import storage_manager
import os
import requests
import mimetypes
from datetime import datetime
from google.cloud import storage
from requests_toolbelt.multipart.encoder import MultipartEncoder

class MediaHandler:
    def __init__(self, phone_number_id=None, whatsapp_token=None):
        # Google Cloud Storage
        self.storage_client = storage.Client()
        self.MEDIA_BUCKET = "aerial-acre-455118-a9-media"
        
        # Configurações do WhatsApp
        self.PHONE_NUMBER_ID = phone_number_id
        self.WHATSAPP_TOKEN = whatsapp_token
        
        # Para compatibilidade local, ainda mantém a referência ao diretório local
        self.MEDIA_DIR = "media"
        
        # Cria diretórios locais (útil apenas para desenvolvimento local)
        if not os.path.exists(self.MEDIA_DIR):
            os.makedirs(self.MEDIA_DIR)
            os.makedirs(os.path.join(self.MEDIA_DIR, "images"))
            os.makedirs(os.path.join(self.MEDIA_DIR, "audio"))
            os.makedirs(os.path.join(self.MEDIA_DIR, "video"))
            os.makedirs(os.path.join(self.MEDIA_DIR, "documents"))
    
    def download_media(self, media_id, whatsapp_token):
        try:
            url = f"https://graph.facebook.com/v16.0/{media_id}"
            headers = {
                "Authorization": f"Bearer {whatsapp_token}"
            }
            
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                print(f"Erro ao obter URL da mídia: {response.text}")
                return None
            
            media_data = response.json()
            media_url = media_data.get("url")
            mime_type = media_data.get("mime_type", "application/octet-stream")
            
            response = requests.get(media_url, headers=headers)
            if response.status_code != 200:
                print(f"Erro ao baixar mídia: {response.status_code}")
                return None
            
            extension = mimetypes.guess_extension(mime_type) or ""
            media_type = self._get_media_type(mime_type)
            
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            filename = f"{media_id}_{timestamp}{extension}"
            
            # Caminho para o Storage e caminho relativo para retornar
            gcs_path = f"{media_type}/{filename}"
            
            # Usar o storage_manager para salvar o arquivo
            storage_manager.save_media_file(gcs_path, response.content, mime_type)
            
            print(f"Mídia salva: {gcs_path}")
            
            # Retorna o caminho relativo para uso posterior
            return gcs_path
        
        except Exception as e:
            print(f"Erro ao baixar mídia: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
        
    def upload_media(self, media_path, whatsapp_token, mime_type=None):
        try:
            print(f"MediaHandler.upload_media: INÍCIO - Media path: {media_path}")
            print(f"MediaHandler.upload_media: Mime type: {mime_type}")
            print(f"MediaHandler.upload_media: Token: {whatsapp_token[:5]}...")

            # Verifica se o caminho é uma URL do GCS ou local
            is_gcs_url = media_path and ('storage.googleapis.com' in media_path or 'storage.cloud.google.com' in media_path)
            is_local_path = media_path and (not media_path.startswith('http'))
            
            print(f"MediaHandler.upload_media: É URL GCS? {is_gcs_url}")
            print(f"MediaHandler.upload_media: É caminho local? {is_local_path}")

            # Lê o conteúdo do arquivo
            file_content = None
            file_name = os.path.basename(media_path)

            if is_gcs_url:
                # Extrai o caminho do bucket/blob da URL GCS
                if 'storage.googleapis.com' in media_path:
                    path_parts = media_path.split('storage.googleapis.com/')[1].split('/', 1)
                    bucket_name = path_parts[0]
                    blob_name = path_parts[1] if len(path_parts) > 1 else ''
                else:
                    print(f"Formato de URL GCS não reconhecido: {media_path}")
                    return None

                # Obtém o conteúdo do arquivo do GCS
                bucket = self.storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)

                file_content = blob.download_as_bytes()
                file_name = os.path.basename(blob_name)
                print(f"Arquivo carregado do GCS: {len(file_content)} bytes")

            elif is_local_path:
                # NOVA LÓGICA: Tenta primeiro acessar do GCS usando o bucket configurado
                try:
                    # Normaliza o caminho
                    if media_path.startswith('/media/'):
                        blob_path = media_path[7:]
                    elif media_path.startswith('media/'):
                        blob_path = media_path[6:]
                    else:
                        blob_path = media_path
                    
                    print(f"MediaHandler.upload_media: Tentando acessar do GCS: {blob_path}")
                    
                    # Tenta buscar do GCS
                    bucket = self.storage_client.bucket(self.MEDIA_BUCKET)
                    blob = bucket.blob(blob_path)
                    
                    if blob.exists():
                        file_content = blob.download_as_bytes()
                        file_name = os.path.basename(blob_path)
                        print(f"Arquivo carregado do GCS (caminho relativo): {len(file_content)} bytes")
                    else:
                        print(f"Arquivo não encontrado no GCS: {blob_path}")
                        
                        # Alternativa: talvez o caminho já inclua o tipo de mídia
                        if '/' not in blob_path and blob_path.startswith(('image', 'video', 'audio', 'document')):
                            print(f"Tentando com caminho completo no GCS")
                            if blob.exists():
                                file_content = blob.download_as_bytes()
                                file_name = os.path.basename(blob_path)
                                print(f"Arquivo carregado do GCS (caminho completo): {len(file_content)} bytes")
                        
                except Exception as e:
                    print(f"Erro ao buscar do GCS: {str(e)}")
                
                # Se não conseguiu do GCS, tenta localmente (para desenvolvimento)
                if not file_content:
                    try:
                        # Normaliza o caminho
                        if media_path.startswith('/media/'):
                            local_path = media_path[1:]  # Remove a barra inicial
                        elif not media_path.startswith('media/'):
                            local_path = os.path.join('media', media_path)
                        else:
                            local_path = media_path
                        
                        print(f"MediaHandler.upload_media: Tentando acessar localmente: {local_path}")
                        
                        with open(local_path, 'rb') as file:
                            file_content = file.read()
                        print(f"Arquivo carregado localmente: {len(file_content)} bytes")
                    except FileNotFoundError:
                        print(f"Arquivo não encontrado localmente: {local_path}")
                        return None
                    except Exception as e:
                        print(f"Erro ao acessar arquivo local: {str(e)}")
                        return None
            else:
                print(f"Formato de caminho não suportado: {media_path}")
                return None

            if not file_content:
                print("Nenhum conteúdo de arquivo obtido.")
                return None
            
            print(f"MediaHandler.upload_media: Conteúdo do arquivo obtido: {len(file_content)} bytes")
            print(f"Detalhes do arquivo: nome={file_name}, tamanho={len(file_content)} bytes, mime_type={mime_type}")
            
            # Determina o tipo MIME pelo caminho se não foi explicitamente fornecido
            if not mime_type:
                file_ext = os.path.splitext(file_name)[1].lower()
                mime_type = self._get_mime_type(file_ext)
                
                # Verifica se é um WEBM e se é válido
                if file_ext == '.webm' and not self._is_valid_webm(file_content):
                    print("Erro: Arquivo WEBM inválido ou corrompido.")
                    return None

            # Cria o formulário multipart
            multipart_data = MultipartEncoder(
                fields={
                    'messaging_product': 'whatsapp',
                    'file': (file_name, file_content, mime_type)
                }
            )

            headers = {
                'Authorization': f'Bearer {whatsapp_token}',
                'Content-Type': multipart_data.content_type
            }

            url = f"https://graph.facebook.com/v16.0/{self.PHONE_NUMBER_ID}/media"

            print(f"MediaHandler.upload_media: Enviando upload para {url} com tipo MIME: {mime_type}")
            response = requests.post(
                url,
                headers=headers,
                data=multipart_data
            )

            print(f"MediaHandler.upload_media: Resposta da API: {response.status_code} - {response.text[:100]}")

            if response.status_code == 200:
                response_data = response.json()
                media_id = response_data.get('id')
                print(f"Upload bem-sucedido. Media ID: {media_id}")
                return media_id
            else:
                print(f"Erro ao enviar mídia: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            print(f"Erro ao enviar mídia: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
        
    def _get_media_type(self, mime_type):
        if mime_type.startswith('audio/'):
            return 'audio'
        elif mime_type.startswith('image/'):
            return 'image'
        elif mime_type.startswith('video/'):
            return 'video'
        else:
            return 'unknown'
    
    def _is_valid_webm(self, file_content):
        """Verifica se o conteúdo do arquivo WEBM é válido"""
        # WEBM válido deve começar com os bytes 0x1A 0x45 0xDF 0xA3
        if len(file_content) >= 4:
            return (
                file_content[0] == 0x1A and 
                file_content[1] == 0x45 and 
                file_content[2] == 0xDF and 
                file_content[3] == 0xA3
            )
        return False
            
 # No arquivo media_handler.py, modifique a função _get_mime_type

# Substitua completamente a função _get_mime_type em media_handler.py

    def _get_mime_type(self, file_ext):
        """Determina o tipo MIME com base na extensão do arquivo"""
        # Para arquivos de imagem
        if file_ext in ['.jpg', '.jpeg']:
            return 'image/jpeg'
        elif file_ext == '.png':
            return 'image/png'
        # Para arquivos de vídeo
        elif file_ext in ['.mp4', '.mpeg4']:
            return 'video/mp4'
        # Para arquivos de áudio - IMPORTANTE: WhatsApp só aceita audio/ogg
        elif file_ext in ['.ogg', '.oga', ]:
            return 'audio/ogg;'
        elif file_ext == '.ogg':
            # IMPORTANTE: Para o WhatsApp, todos os áudios devem ser audio/ogg
            return 'audio/ogg;'
        elif file_ext in ['.wav', '.wave', '.mp3', '.m4a']:
            # IMPORTANTE: Para o WhatsApp, todos os áudios devem ser audio/ogg
            # Isso é apenas um hack. Em uma implementação ideal, faríamos conversão real
            return 'audio/ogg'
        # Para documentos
        elif file_ext == '.pdf':
            return 'application/pdf'
        elif file_ext in ['.doc', '.docx']:
            return 'application/msword'
        # Tipo genérico para outros arquivos
        else:
            return 'application/octet-stream'