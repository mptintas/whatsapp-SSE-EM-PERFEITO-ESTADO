import os
import json
from google.cloud import storage
import env_config

# Cliente de storage (apenas para ambiente cloud)
storage_client = None
if env_config.IS_CLOUD_ENVIRONMENT:
    storage_client = storage.Client()

def save_json(path, data):
    """Salva dados JSON (funciona tanto no GCS quanto localmente)"""
    if env_config.IS_CLOUD_ENVIRONMENT:
        # Salva no GCS
        bucket_name = env_config.CONVERSATIONS_BUCKET
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(path)
        json_data = json.dumps(data, ensure_ascii=False, indent=4)
        blob.upload_from_string(json_data, content_type='application/json')
        print(f"Arquivo {path} salvo no GCS")
    else:
        # Salva localmente
        dir_path = os.path.dirname(path)
        if dir_path and not os.path.exists(dir_path):
            os.makedirs(dir_path)
        with open(path, 'w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=4)
        print(f"Arquivo {path} salvo localmente")

def load_json(path):
    """Carrega dados JSON (funciona tanto no GCS quanto localmente)"""
    if env_config.IS_CLOUD_ENVIRONMENT:
        # Carrega do GCS
        bucket_name = env_config.CONVERSATIONS_BUCKET
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(path)
        if blob.exists():
            json_data = blob.download_as_string()
            return json.loads(json_data)
        return None
    else:
        # Carrega localmente
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as file:
                return json.load(file)
        return None
def save_media_file(path, content, content_type=None):
    """Salva arquivo de mídia (funciona tanto no GCS quanto localmente)"""
    if env_config.IS_CLOUD_ENVIRONMENT:
        # Salva no GCS
        bucket_name = env_config.MEDIA_BUCKET
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(path)
        
        if isinstance(content, bytes):
            blob.upload_from_string(content, content_type=content_type)
        else:
            blob.upload_from_file(content)
            
        # Torna o arquivo público
        blob.make_public()
        print(f"Mídia {path} salva no GCS")
        return blob.public_url
    else:
        # Salva localmente
        full_path = os.path.join(env_config.LOCAL_MEDIA_DIR, path)
        dir_path = os.path.dirname(full_path)
        if not os.path.exists(dir_path):
            os.makedirs(dir_path)
            
        mode = 'wb' if isinstance(content, bytes) else 'wb'
        with open(full_path, mode) as file:
            if isinstance(content, bytes):
                file.write(content)
            else:
                content.seek(0)
                file.write(content.read())
        print(f"Mídia {path} salva localmente")
        return full_path

def get_media_url(path):
    """Obtém URL de mídia (pública no GCS ou caminho local)"""
    if env_config.IS_CLOUD_ENVIRONMENT:
        bucket_name = env_config.MEDIA_BUCKET
        return f"https://storage.googleapis.com/{bucket_name}/{path}"
    else:
        return os.path.join(env_config.LOCAL_MEDIA_DIR, path)

def download_media(path, destination=None):
    """Download de mídia (do GCS para temp ou local para local)"""
    if env_config.IS_CLOUD_ENVIRONMENT:
        # Remover 'media/' do início se existir
        if path.startswith('media/'):
            path = path[6:]  # Remove 'media/'
            
        bucket_name = env_config.MEDIA_BUCKET
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(path)
        
        if destination:
            blob.download_to_filename(destination)
            return destination
        else:
            import tempfile
            temp_file = tempfile.NamedTemporaryFile(delete=False)
            temp_path = temp_file.name
            temp_file.close()
            
            blob.download_to_filename(temp_path)
            return temp_path
    else:
        # Para ambiente local
        if path.startswith('media/'):
            source_path = path
        else:
            source_path = os.path.join(env_config.LOCAL_MEDIA_DIR, path)
            
        if destination:
            import shutil
            shutil.copyfile(source_path, destination)
            return destination
        return source_path