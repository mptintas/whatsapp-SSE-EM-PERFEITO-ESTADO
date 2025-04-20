import env_config
import storage_manager
import os
import requests
import json
import tempfile
from pathlib import Path
from google.cloud import storage

class AudioProcessor:
    def __init__(self, model_size=None):
        """
        Inicializa o processador de áudio com a API da OpenAI
        O parâmetro model_size é mantido para compatibilidade, mas não é utilizado
        """
        # Chave da API da OpenAI
        self.api_key = "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"
        # Inicializa cliente do GCS
        self.storage_client = storage.Client()
        self.media_bucket_name = "aerial-acre-455118-a9-media"
        print("Inicializado AudioProcessor com OpenAI API e suporte a Google Cloud Storage")
    
    def transcribe_audio(self, audio_path, language="pt"):
        """
        Transcreve um arquivo de áudio para texto usando a API Whisper da OpenAI
        
        Parâmetros:
        - audio_path: caminho para o arquivo de áudio (local ou GCS)
        - language: código do idioma (por exemplo, "pt" para português)
        
        Retorna:
        - Texto transcrito
        """
        try:
            print(f"Tentando transcrever áudio: {audio_path}")
            
            # Usar o storage_manager para baixar o arquivo temporariamente se necessário
            temp_file = storage_manager.download_media(audio_path)
            
            print(f"Arquivo temporário criado: {temp_file}")
            print(f"Tamanho: {os.path.getsize(temp_file)} bytes")
            
            # Preparar a requisição para a API da OpenAI
            headers = {
                "Authorization": f"Bearer {self.api_key}"
            }
            
            # URL da API
            url = "https://api.openai.com/v1/audio/transcriptions"
            
            # Abrir o arquivo para envio
            with open(temp_file, "rb") as audio_file:
                # Definir os parâmetros
                files = {
                    "file": (Path(temp_file).name, audio_file, "audio/ogg")
                }
                data = {
                    "model": "whisper-1",
                    "language": language,
                    "response_format": "json"
                }
                
                print(f"Enviando requisição para API OpenAI Whisper...")
                
                # Fazer a requisição
                response = requests.post(url, headers=headers, files=files, data=data)
                
                # Verificar se a requisição foi bem sucedida
                if response.status_code == 200:
                    result = response.json()
                    transcribed_text = result.get("text", "").strip()
                    print(f"Transcrição bem-sucedida: '{transcribed_text}'")
                    return transcribed_text
                else:
                    error_msg = f"Erro na API: {response.status_code} - {response.text}"
                    print(error_msg)
                    return f"[{error_msg}]"
                
        except Exception as e:
            error_message = f"Erro ao transcrever áudio: {str(e)}"
            print(error_message)
            import traceback
            traceback.print_exc()
            return f"[Falha na transcrição de áudio: {str(e)}]"
        finally:
            # Limpar arquivo temporário se ele existir e não for o caminho original
            if 'temp_file' in locals() and os.path.exists(temp_file):
                try:
                    os.unlink(temp_file)
                    print(f"Arquivo temporário removido: {temp_file}")
                except:
                    pass