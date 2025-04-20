import env_config
import storage_manager
import requests
import os
import json
import uuid
from datetime import datetime
from qwen1 import process_message
from media_handler import MediaHandler
from audio_processor import AudioProcessor
from google.cloud import storage

class WhatsAppManager:
    def __init__(self):
        self.VERIFICATION_TOKEN = "EAAJjZBmxpkYgBOyEx31oz53K3694dZCg81dZA17ym3W9rCFjmax29HMwcdgq8iZBawUoNw1vzTlYSGAbIWTN4MRkWZBA0wMpwfLfI6dHaaMyhUZC1qZADUbZBZCNMhOw8a0AI2sBHpBLtbEbMrhBGZBNh81teK7z0ZBX338LZBTHRXYr96YTytPiv1JRD5Vyiis5pl5yhpUHzjHDhgZDZD"
        self.WHATSAPP_TOKEN = "EAAJjZBmxpkYgBOyEx31oz53K3694dZCg81dZA17ym3W9rCFjmax29HMwcdgq8iZBawUoNw1vzTlYSGAbIWTN4MRkWZBA0wMpwfLfI6dHaaMyhUZC1qZADUbZBZCNMhOw8a0AI2sBHpBLtbEbMrhBGZBNh81teK7z0ZBX338LZBTHRXYr96YTytPiv1JRD5Vyiis5pl5yhpUHzjHDhgZDZD"
        self.PHONE_NUMBER_ID = "637338086121702"
        self.conversations = {}
        self.last_message_id = None
        # Configuração do Google Cloud Storage
        self.storage_client = storage.Client()
        self.CONVERSATION_BUCKET = "aerial-acre-455118-a9-conversations"
        
        self.media_handler = MediaHandler(
            phone_number_id=self.PHONE_NUMBER_ID, 
            whatsapp_token=self.WHATSAPP_TOKEN
        )
        
        # Para compatibilidade local, cria o diretório de conversas se estiver rodando localmente
        self.CONVERSATION_DIR = "conversations"
        if not os.path.exists(self.CONVERSATION_DIR):
            os.makedirs(self.CONVERSATION_DIR)
            
        self.load_conversations()
        self.audio_processor = AudioProcessor(model_size="base")
        
        # Referência para o serviço de tempo real (será definido pelo main.py)
        self.realtime_service = None

    def get_last_message_id(self):
        return self.last_message_id
    
    def update_last_message(self, new_id):
        self.last_message_id = new_id
        return True

    def get_conversation_history(self, phone_number):
        return self.conversations.get(phone_number, {})
    
    def toggle_conversation_mode(self, phone_number):
        if phone_number in self.conversations:
            current_mode = self.conversations[phone_number].get("mode", "auto")
            new_mode = "human" if current_mode == "auto" else "auto"
            self.conversations[phone_number]["mode"] = new_mode
            self.save_conversation(phone_number)
            print(f"Modo da conversa com {phone_number} alterado para: {new_mode}")
            return new_mode
        print(f"Tentativa de alternar modo para número inexistente: {phone_number}")
        return None

    def load_conversations(self):
        try:
            # Carregar conversas usando o gerenciador de armazenamento
            print("Carregando conversas...")
            
            # No GCS, vamos listar todos os arquivos no bucket
            if env_config.IS_CLOUD_ENVIRONMENT:
                storage_client = storage.Client()
                bucket = storage_client.bucket(env_config.CONVERSATIONS_BUCKET)
                blobs = bucket.list_blobs()
                
                for blob in blobs:
                    if blob.name.endswith('.json'):
                        try:
                            phone_number = blob.name.split(".")[0]
                            data = storage_manager.load_json(blob.name)
                            
                            if data:
                                # Processamento normal do arquivo de conversa
                                self.conversations[phone_number] = data
                                # Garantir que tenha o campo mode
                                if "mode" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["mode"] = "auto"
                                # Garantir que tenha o campo unread_count
                                if "unread_count" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["unread_count"] = 0
                                # Garantir que tenha o campo processed_message_ids
                                if "processed_message_ids" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["processed_message_ids"] = []
                        except Exception as e:
                            print(f"Erro ao carregar arquivo {blob.name}: {str(e)}")
            else:
                # Localmente, vamos listar arquivos no diretório
                if not os.path.exists(env_config.LOCAL_CONVERSATIONS_DIR):
                    os.makedirs(env_config.LOCAL_CONVERSATIONS_DIR)
                    return
                    
                for filename in os.listdir(env_config.LOCAL_CONVERSATIONS_DIR):
                    if filename.endswith('.json'):
                        try:
                            phone_number = filename.split(".")[0]
                            filepath = os.path.join(env_config.LOCAL_CONVERSATIONS_DIR, filename)
                            data = storage_manager.load_json(filepath)
                            
                            if data:
                                # Processamento normal do arquivo de conversa
                                self.conversations[phone_number] = data
                                # Garantir que tenha o campo mode
                                if "mode" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["mode"] = "auto"
                                # Garantir que tenha o campo unread_count
                                if "unread_count" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["unread_count"] = 0
                                # Garantir que tenha o campo processed_message_ids
                                if "processed_message_ids" not in self.conversations[phone_number]:
                                    self.conversations[phone_number]["processed_message_ids"] = []
                        except Exception as e:
                            print(f"Erro ao carregar arquivo {filepath}: {str(e)}")
                
            print(f"{len(self.conversations)} conversas carregadas.")
        except Exception as e:
            print(f"Erro ao carregar conversas: {str(e)}")

    def save_conversation(self, phone_number):
        try:
            # Obter os dados da conversa
            conversation_data = self.conversations.get(phone_number, {})
            
            # Caminho do arquivo
            file_path = f"{phone_number}.json"
            
            # Salvar usando o gerenciador de armazenamento
            storage_manager.save_json(file_path, conversation_data)
            print(f"Conversa com {phone_number} salva.")
            
        except Exception as e:
            print(f"Erro ao salvar conversa: {str(e)}")

    def handle_incoming_message(self, data):
        try:
            print(f"Dados recebidos via webhook: {data}")
            phone_number = None
            if "messages" in data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}):
                phone_number = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("contacts", [{}])[0].get("wa_id", "")
                client_name = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("contacts", [{}])[0].get("profile", {}).get("name", "Desconhecido")
                
                # Inicializa a conversa se não existir
                if phone_number not in self.conversations:
                    self.conversations[phone_number] = {
                        "name": client_name,
                        "profile_pic": "",
                        "mode": "auto",
                        "messages": [],
                        "processed_message_ids": [],  # Inicializa a lista de IDs processados
                        "unread_count": 0  # Inicializa contador de mensagens não lidas
                    }
                
                # Verifica se existe o campo processed_message_ids
                if "processed_message_ids" not in self.conversations[phone_number]:
                    self.conversations[phone_number]["processed_message_ids"] = []
                
                # Verifica se existe o campo unread_count
                if "unread_count" not in self.conversations[phone_number]:
                    self.conversations[phone_number]["unread_count"] = 0
                
                message = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("messages", [{}])[0]
                message_id = message.get("id", "")
                
                # Verifica se a mensagem já foi processada
                if message_id in self.conversations[phone_number]["processed_message_ids"]:
                    print(f"Mensagem {message_id} já foi processada anteriormente. Ignorando.")
                    return phone_number
                
                profile_pic = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("contacts", [{}])[0].get("profile", {}).get("profile_picture", "")
                if profile_pic:
                    print(f"FOTO DE PERFIL DETECTADA: {profile_pic}")
                    self.conversations[phone_number]["profile_pic"] = profile_pic
                
                message_type = message.get("type", "")
                message_content = None
                media_url = None
                
                # Gera um ID único para a mensagem se não tiver um ID do WhatsApp
                unique_message_id = message_id if message_id else str(uuid.uuid4())
                
                if message_type == "text":
                    message_content = message.get("text", {}).get("body", "")
                    media_url = None
                    message_obj = {
                        "id": unique_message_id,
                        "type": "text",
                        "content": message_content,
                        "from": "cliente",
                        "timestamp": datetime.now().strftime("%H:%M %d/%m/%y"),
                        "status": "received"
                    }
                    
                elif message_type in ["image", "audio", "video", "document"]:
                    media_id = message.get(message_type, {}).get("id", "")
                    print(f"DEBUG - ID de mídia de {message_type} recebido: {media_id}")
                    
                    if not media_id:
                        print(f"ERRO - ID de mídia de {message_type} está vazio ou nulo!")
                        media_url = None
                    else:
                        media_url = self.media_handler.download_media(media_id, self.WHATSAPP_TOKEN)
                        print(f"Mídia baixada com URL: {media_url}")
                    
                    caption = message.get(message_type, {}).get("caption", "")
                    
                    # Processar áudio para texto se for mensagem de áudio
                    transcription = ""
                    
                    if message_type == "audio" and media_url:
                        # Verificar se media_url já tem o prefixo "media\"
                        audio_path = media_url
                        if not audio_path.startswith('media\\') and not audio_path.startswith('media/'):
                            audio_path = os.path.join('media', audio_path)
                        
                        print(f"Caminho para transcrição: {audio_path}")
                        # Transcrever o áudio
                        transcription = self.audio_processor.transcribe_audio(audio_path)
                        print(f"Áudio transcrito: {transcription}")
                    
                    message_obj = {
                        "id": unique_message_id,
                        "type": message_type,
                        "content": caption,
                        "media_url": media_url,
                        "from": "cliente",
                        "timestamp": datetime.now().strftime("%H:%M %d/%m/%y"),
                        "status": "received"
                    }
                    
                    # Adicionar a transcrição ao objeto da mensagem, se houver
                    if message_type == "audio" and transcription:
                        message_obj["transcription"] = transcription
                else:
                    print(f"Tipo de mensagem desconhecido: {message_type}")
                    return None
                
                # Adiciona a mensagem à conversa
                self.conversations[phone_number]["messages"].append(message_obj)
                
                # Incrementa o contador de mensagens não lidas
                self.conversations[phone_number]["unread_count"] += 1
                
                # Após processar a mensagem, adiciona o ID à lista de processados
                self.conversations[phone_number]["processed_message_ids"].append(message_id)
                self.save_conversation(phone_number)
                
                print(f"Mensagem do cliente {client_name} ({phone_number}) recebida: Tipo={message_type}")

                # Notifica serviço de tempo real sobre a nova mensagem (se disponível)
                if hasattr(self, 'realtime_service') and self.realtime_service:
                    self.realtime_service.notify_new_message(phone_number, message_obj)
                    self.realtime_service.notify_conversation_update(
                        phone_number,
                        "unread_updated",
                        {"unread_count": self.conversations[phone_number]["unread_count"]}
                    )

                if self.conversations[phone_number]["mode"] == "auto":
                    self.conversations[phone_number]["status"] = "processing"
                    self.save_conversation(phone_number)

                    resposta_qwen = None
                    try:
                        if message_type == "text":
                            resposta_qwen = process_message(message_content, phone_number)
                        elif message_type == "audio" and transcription:
                        # Usar o texto transcrito do áudio para processar a resposta
                            resposta_qwen = process_message(transcription, phone_number)
                        else:
                            media_desc = f"[Cliente enviou {message_type}]"
                            if caption:
                                media_desc += f" com a legenda: '{caption}'"
                            resposta_qwen = process_message(media_desc, phone_number)
        
                        # Enviar a resposta ao cliente
                        if resposta_qwen:
                            self.send_message_to_whatsapp(phone_number, resposta_qwen)
        
                        # Atualizar status para "idle" após processamento bem-sucedido
                        self.conversations[phone_number]["status"] = "idle"
                        self.save_conversation(phone_number)
                    except Exception as e:
                        print(f"Erro ao processar resposta automática: {str(e)}")
                        # Atualizar status para "error" em caso de falha
                        self.conversations[phone_number]["status"] = "error"
                        self.save_conversation(phone_number)
                        import traceback
                        traceback.print_exc()
                
                # Retorna o número de telefone para ser usado pelo emissor de eventos Socket.IO
                return phone_number

        except Exception as e:
            print(f"Erro ao processar mensagem: {str(e)}")
            import traceback
            traceback.print_exc()
            return None


    def send_message_to_whatsapp(self, to_number, message, media_type=None, media_path=None):
        try:
            print(f"DEBUG: Iniciando envio - Tipo: {media_type}, Mídia: {media_path}")
            
            url = f"https://graph.facebook.com/v16.0/{self.PHONE_NUMBER_ID}/messages"
            headers = {
                "Authorization": f"Bearer {self.WHATSAPP_TOKEN}",
                "Content-Type": "application/json"
            }

            # Gera um ID único para a mensagem
            message_id = str(uuid.uuid4())

            # Determina o modo atual da conversa (auto ou humano)
            if to_number not in self.conversations:
                self.conversations[to_number] = {
                    "name": "Desconhecido",
                    "profile_pic": "",
                    "mode": "auto",
                    "messages": [],
                    "unread_count": 0
                }
            
            sender = "qwen" if self.conversations[to_number]["mode"] == "auto" else "vendedor"
            timestamp = datetime.now().strftime("%H:%M %d/%m/%y")
            
            # Mensagem de texto simples (sem mídia)
            if media_type is None:
                payload = {
                    "messaging_product": "whatsapp",
                    "to": to_number,
                    "type": "text",
                    "text": {
                        "body": message
                    }
                }
                
                # Cria objeto de mensagem com status inicial "sending"
                message_obj = {
                    "id": message_id,
                    "type": "text",
                    "content": message,
                    "from": sender,
                    "timestamp": timestamp,
                    "status": "sending"
                }
            else:
                # Lida com envio de mídia
                if media_path.startswith(('http://', 'https://')):
                    # URL externa
                    media_payload = {
                        "link": media_path
                    }
                    if media_type != "audio" and message:
                        media_payload["caption"] = message
                else:
                    # Arquivo local ou no Cloud Storage
                    print(f"DEBUG: Enviando mídia do tipo {media_type}: {media_path}")
                    
                    # Upload de mídia com tratamento de erro
                    try:
                        # INÍCIO DOS LOGS DE ÁUDIO
                        if media_type == "audio":
                            mime_type = "voide/ogg" if media_type == "audio" else None
                            print(f"DEBUG ÁUDIO: Iniciando processamento de mensagem de áudio")
                            print(f"DEBUG ÁUDIO: Caminho do arquivo: {media_path}")
                            print(f"DEBUG ÁUDIO: MIME type sendo usado: {mime_type or 'Não especificado (será detectado)'}")
                        # FIM DOS LOGS DE ÁUDIO
                        
                        if media_type == "audio":
                            mime_type = "audio/ogg;"
                            print("FORÇANDO ÁUDIO COMO audio/ogg")
                            media_id = self.media_handler.upload_media(media_path, self.WHATSAPP_TOKEN, mime_type)
                            
                            payload = {
                                "messaging_product": "whatsapp",
                                "to": to_number,
                                "type": "audio",
                                "audio": {
                                    "id": media_id
                                }
                            }
                        else:
                            mime_type = None
                            media_id = self.media_handler.upload_media(media_path, self.WHATSAPP_TOKEN, mime_type)

                        # MAIS LOGS DE ÁUDIO
                        if media_type == "audio":
                            print(f"DEBUG ÁUDIO: Resultado do upload: media_id={media_id}")
                            if not media_id:
                                print(f"DEBUG ÁUDIO: FALHA no upload do áudio - verifique logs anteriores")
                            else:
                                print(f"DEBUG ÁUDIO: Upload do áudio bem-sucedido, continuando com envio")

                        if not media_id:
                            print(f"Falha ao obter ID de mídia para {media_path}")
                            
                            # Cria objeto de mensagem com status de falha
                            message_obj = {
                                "id": message_id,
                                "type": media_type,
                                "content": message,
                                "media_url": media_path,
                                "from": sender,
                                "timestamp": timestamp,
                                "status": "failed"
                            }
                            
                            # Registra na conversa a falha
                            self.conversations[to_number]["messages"].append(message_obj)
                            self.save_conversation(to_number)
                            
                            # Notifica sobre falha no envio
                            if hasattr(self, 'realtime_service') and self.realtime_service:
                                self.realtime_service.notify_message_status(
                                    to_number,
                                    message_id,
                                    "failed"
                                )
                            
                            return False

                        media_payload = {
                            "id": media_id
                        }
                        # Adiciona legenda apenas para mídias que não são áudio
                        if media_type != "audio" and message:
                            media_payload["caption"] = message
                            
                        print(f"DEBUG: Media ID obtido: {media_id}")
                    except Exception as e:
                        print(f"Erro no upload de mídia: {str(e)}")
                        
                        # Cria objeto de mensagem com status de falha
                        message_obj = {
                            "id": message_id,
                            "type": media_type,
                            "content": message,
                            "media_url": media_path,
                            "from": sender,
                            "timestamp": timestamp,
                            "status": "failed"
                        }
                        
                        # Registra na conversa a falha
                        self.conversations[to_number]["messages"].append(message_obj)
                        self.save_conversation(to_number)
                        
                        # Notifica sobre falha no envio
                        if hasattr(self, 'realtime_service') and self.realtime_service:
                            self.realtime_service.notify_message_status(
                                to_number,
                                message_id,
                                "failed"
                            )
                        
                        return False

                # Payload final para envio de mídia
                payload = {
                    "messaging_product": "whatsapp",
                    "to": to_number,
                    "type": media_type,
                    media_type: media_payload
                }
                
                # Cria objeto de mensagem com status inicial "sending"
                message_obj = {
                    "id": message_id,
                    "type": media_type,
                    "content": message,
                    "media_url": media_path,
                    "from": sender,
                    "timestamp": timestamp,
                    "status": "sending"
                }

            # Adiciona a mensagem à conversa com status inicial "sending"
            self.conversations[to_number]["messages"].append(message_obj)
            self.save_conversation(to_number)
            
            # Notifica sobre mensagem em envio
            if hasattr(self, 'realtime_service') and self.realtime_service:
                self.realtime_service.notify_new_message(to_number, message_obj)

            print(f"Enviando payload: {payload}")  # Debug para ver o payload enviado
            response = requests.post(url, json=payload, headers=headers)
            print(f"RESPOSTA DETALHADA DA API: Status={response.status_code}, Corpo={response.text}")

            # Verifica a resposta
            if response.status_code == 200:
                print(f"Mensagem enviada com sucesso para {to_number}")
                
                # Atualiza o status da mensagem para "delivered"
                for msg in self.conversations[to_number]["messages"]:
                    if msg.get("id") == message_id:
                        msg["status"] = "delivered"
                        break
                
                self.save_conversation(to_number)
                
                # Notifica sobre mudança de status
                if hasattr(self, 'realtime_service') and self.realtime_service:
                    self.realtime_service.notify_message_status(
                        to_number,
                        message_id,
                        "delivered"
                    )
                
                return True
            else:
                print(f"Falha ao enviar mensagem para {to_number}: {response.text}")
                
                # Atualiza o status da mensagem para "failed"
                for msg in self.conversations[to_number]["messages"]:
                    if msg.get("id") == message_id:
                        msg["status"] = "failed"
                        break
                
                self.save_conversation(to_number)
                
                # Notifica sobre falha no envio
                if hasattr(self, 'realtime_service') and self.realtime_service:
                    self.realtime_service.notify_message_status(
                        to_number,
                        message_id,
                        "failed"
                    )
                
                return False
        except Exception as e:
            print(f"Erro ao enviar mensagem: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # Cria ou atualiza uma mensagem com status de falha
            found = False
            for msg in self.conversations.get(to_number, {}).get("messages", []):
                if msg.get("id") == message_id:
                    msg["status"] = "failed"
                    found = True
                    break
                    
            if not found and to_number in self.conversations:
                sender = "qwen" if self.conversations[to_number]["mode"] == "auto" else "vendedor"
                # Cria uma nova mensagem com status de falha
                error_message_obj = {
                    "id": message_id,
                    "type": media_type or "text",
                    "content": message,
                    "from": sender,
                    "timestamp": datetime.now().strftime("%H:%M %d/%m/%y"),
                    "status": "failed"
                }
                
                if media_path:
                    error_message_obj["media_url"] = media_path
                    
                self.conversations[to_number]["messages"].append(error_message_obj)
                # Salva a conversa mesmo após erro
            if to_number in self.conversations:
                self.save_conversation(to_number)
                
                # Notifica sobre falha no envio
                if hasattr(self, 'realtime_service') and self.realtime_service:
                    self.realtime_service.notify_message_status(
                        to_number,
                        message_id,
                        "failed"
                    )
            
            return False
    
    def delete_conversation(self, phone_number):
        """Remove uma conversa do dicionário de conversas"""
        try:
            if phone_number in self.conversations:
                del self.conversations[phone_number]
                print(f"[SUCESSO] Conversa {phone_number} deletada")  # Usando print em vez de logger
                return True
            print(f"[AVISO] Conversa {phone_number} não encontrada")  # Usando print em vez de logger
            return False
        except Exception as e:
            print(f"[ERRO] Falha ao deletar {phone_number}: {str(e)}")  # Usando print em vez de logger
            return False
            
    def mark_messages_read(self, phone_number):
        """Marca todas as mensagens de um número como lidas"""
        try:
            if phone_number in self.conversations:
                # Verifica se o contador já está em zero
                if self.conversations[phone_number].get("unread_count", 0) == 0:
                    return True  # Já está marcado como lido
                
                # Zera o contador de mensagens não lidas
                self.conversations[phone_number]["unread_count"] = 0
                
                # Salva a conversa atualizada
                self.save_conversation(phone_number)
                
                print(f"Mensagens para {phone_number} marcadas como lidas")
                
                # Notifica o serviço de tempo real sobre a atualização (se disponível)
                if hasattr(self, 'realtime_service') and self.realtime_service:
                    self.realtime_service.notify_conversation_update(
                        phone_number,
                        "unread_updated",
                        {"unread_count": 0}
                    )
                
                return True
            else:
                print(f"Conversa {phone_number} não encontrada para marcar como lida")
                return False
        except Exception as e:
            print(f"Erro ao marcar mensagens como lidas para {phone_number}: {str(e)}")
            import traceback
            traceback.print_exc()
            return False
            
    def set_realtime_service(self, service):
        """Define o serviço de tempo real a ser usado para notificações"""
        self.realtime_service = service
        print("Serviço de tempo real configurado no WhatsAppManager")