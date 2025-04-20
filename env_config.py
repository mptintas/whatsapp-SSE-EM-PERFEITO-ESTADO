import os

# Detecta se estamos rodando no Google App Engine
IS_CLOUD_ENVIRONMENT = os.environ.get('GAE_ENV', '').startswith('standard')

# Caminhos de buckets GCS
CONVERSATIONS_BUCKET = "aerial-acre-455118-a9-conversations"
MEDIA_BUCKET = "aerial-acre-455118-a9-media"

# Caminhos de pastas locais
LOCAL_CONVERSATIONS_DIR = "conversations"
LOCAL_MEDIA_DIR = "media"