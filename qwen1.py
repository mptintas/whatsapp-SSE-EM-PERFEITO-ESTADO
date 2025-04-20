import storage_manager
import json
import os
import requests
from datetime import datetime
from api_key_manager import APIKeyManager
from google.cloud import storage

# Inicializar o cliente do Google Cloud Storage
storage_client = storage.Client()
conversation_bucket_name = "aerial-acre-455118-a9-conversations"

# Inicializar o gerenciador de chaves
api_key_manager = APIKeyManager(config_file="config.json")

# Variável InputWhats
InputWhats = ""

def ler_arquivo(nome_arquivo):
    """Lê um arquivo local ou do Google Cloud Storage"""
    try:
        # Primeiro tenta carregar localmente (para desenvolvimento)
        if os.path.exists(nome_arquivo):
            with open(nome_arquivo, 'r', encoding='utf-8') as arquivo:
                return arquivo.read()
        
        # Se não encontrar localmente, tenta buscar no bucket
        try:
            bucket = storage_client.bucket(conversation_bucket_name)
            blob = bucket.blob(nome_arquivo)
            if blob.exists():
                return blob.download_as_string().decode('utf-8')
        except Exception as e:
            print(f"Erro ao ler arquivo do GCS {nome_arquivo}: {e}")
        
        print(f"Arquivo {nome_arquivo} não encontrado localmente nem no GCS.")
        return ""
    except Exception as e:
        print(f"Erro ao ler o arquivo {nome_arquivo}: {e}")
        return ""

def salvar_historico(phone_number, historico):
    """Salva o histórico de conversa no Google Cloud Storage"""
    try:
        # Salvar no Google Cloud Storage
        bucket = storage_client.bucket(conversation_bucket_name)
        blob = bucket.blob(f'{phone_number}.json')
        
        # Converter para JSON e salvar
        json_data = json.dumps(historico, ensure_ascii=False, indent=4)
        blob.upload_from_string(json_data, content_type='application/json')
        
        print(f"Histórico da conversa com {phone_number} salvo no GCS.")
        
        # Também tenta salvar localmente para desenvolvimento
        try:
            if not os.path.exists('conversations'):
                os.makedirs('conversations')
                
            with open(f'conversations/{phone_number}.json', 'w', encoding='utf-8') as arquivo:
                json.dump(historico, arquivo, ensure_ascii=False, indent=4)
            print(f"Histórico também salvo localmente.")
        except Exception as e:
            print(f"Nota: Não foi possível salvar localmente: {e}")
            
    except Exception as e:
        print(f"Erro ao salvar o histórico no GCS: {e}")
        
        # Tenta salvar localmente se falhar no GCS
        try:
            if not os.path.exists('conversations'):
                os.makedirs('conversations')
                
            with open(f'conversations/{phone_number}.json', 'w', encoding='utf-8') as arquivo:
                json.dump(historico, arquivo, ensure_ascii=False, indent=4)
            print(f"Histórico salvo apenas localmente devido a erro no GCS.")
        except Exception as sub_e:
            print(f"Erro crítico: Não foi possível salvar o histórico nem no GCS nem localmente: {sub_e}")

def carregar_historico(phone_number):
    """Carrega o histórico de conversa do Google Cloud Storage ou localmente"""
    try:
        # Tentar ler do GCS primeiro
        bucket = storage_client.bucket(conversation_bucket_name)
        blob = bucket.blob(f'{phone_number}.json')
        
        if blob.exists():
            json_data = blob.download_as_string()
            return json.loads(json_data)
        
        # Se não encontrou no GCS, tenta ler localmente
        historico_file = f"conversations/{phone_number}.json"
        if os.path.exists(historico_file):
            with open(historico_file, 'r', encoding='utf-8') as arquivo:
                return json.load(arquivo)
                
        # Se não encontrou em nenhum lugar, retorna um histórico vazio
        return {"messages": []}
    except Exception as e:
        print(f"Erro ao carregar histórico para {phone_number}: {e}")
        return {"messages": []}

def enviar_para_deepseek(prompt):
    # Obter uma chave API do gerenciador
    api_key = api_key_manager.get_api_key()
    
    # Debug info - ver primeiros e últimos caracteres do prompt
    print(f"DEBUG: Tamanho do prompt = {len(prompt)} caracteres")
    print(f"DEBUG: Primeiros 100 caracteres: {prompt[:100]}")
    print(f"DEBUG: Últimos 100 caracteres: {prompt[-100:] if len(prompt) > 100 else prompt}")
    
    URL = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
    }
    
    # Construir o payload para a API
    data = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 4000,
        "messages": [{"role": "user", "content": prompt}]
    }
    
    # Debug da requisição
    print(f"DEBUG: Headers enviados: {headers}")
    print(f"DEBUG: Configuração do modelo: {data['model']}, max_tokens: {data['max_tokens']}")

    try:
        # Fazer a requisição
        print(f"Enviando requisição para API do Claude...")
        response = requests.post(URL, headers=headers, json=data)
        
        # Debug da resposta
        print(f"GATILHO DE MENSAGEM ENVIADA PELA IA: {response.status_code}")
        print(f"DEBUG: Headers da resposta: {dict(response.headers)}")
        
        # Verificar erros de API
        if response.status_code >= 400:
            # Tentar capturar o erro detalhado
            error_text = response.text[:500]  # Limitar para não poluir logs
            print(f"Erro na API Claude: Status {response.status_code}, Resposta: {error_text}")
            
            # Tentar extrair mais detalhes se for JSON
            try:
                error_data = response.json()
                print(f"DEBUG: Detalhes do erro JSON: {error_data}")
                error_type = error_data.get("error", {}).get("type", "unknown")
                api_key_manager.report_error(api_key, error_type)
            except:
                print("DEBUG: A resposta de erro não é um JSON válido")
                error_type = "unknown"
                api_key_manager.report_error(api_key, error_type)
            
            # Em caso de erro, tentar novamente com outra chave
            if response.status_code in [401, 429, 500]:
                print(f"Erro de API (status {response.status_code}), tentando com outra chave")
                return retry_deepseek(prompt, 1)
            elif response.status_code == 400:
                # Para erro 400, tentar detectar problema específico
                print("Erro 400 (Bad Request) - Problema na estrutura da requisição")
                # Tentar com uma entrada mais simples
                simplified_prompt = "Olá, isto é um teste de comunicação."
                return retry_deepseek(simplified_prompt, 1)
            
            response.raise_for_status()
        
        # Registrar uso bem-sucedido
        api_key_manager.report_success(api_key)
        
        # Extrair a resposta da API do Claude
        response_data = response.json()
        content = response_data.get("content", [{}])
        print(f"DEBUG: Resposta extraída: {content}")
        response_text = content[0].get("text", "") if content else ""
        return response_text
    except requests.exceptions.RequestException as e:
        print(f"Erro ao enviar solicitação para a API do Claude: {e}")
        api_key_manager.report_error(api_key)
        return retry_deepseek(prompt, 1)

def retry_deepseek(prompt, retry_count, max_retries=4):
    """Função auxiliar para tentar novamente com chaves diferentes"""
    if retry_count > max_retries:
        print(f"Todas as {max_retries} tentativas falharam")
        return "Desculpe, estamos enfrentando problemas técnicos temporários. Por favor, tente novamente em alguns minutos."
        
    print(f"Tentativa {retry_count} com chave alternativa")
    return enviar_para_deepseek(prompt)  # O gerenciador fornecerá uma chave diferente

def process_message(message, phone_number):
    global InputWhats
    InputWhats = message

    instrucao_fixa = ler_arquivo("instrucaoFixa.txt")
    dados = ler_arquivo("Dados.txt")

    # Carregar histórico
    historico_data = storage_manager.load_json(f"{phone_number}.json")
    historico_conversa = historico_data.get("messages", []) if historico_data else []
    
    if not historico_conversa:
        historico_conversa = ["Primeiro Contato Deste Cliente"]
    
    # Construir o prompt para o Claude    
    InputDeepSeek = f"{InputWhats}\n\n{instrucao_fixa}\n\n{dados}\n\nHistórico:\n{json.dumps(historico_conversa, ensure_ascii=False, indent=4)}"

    resposta_deepseek = enviar_para_deepseek(InputDeepSeek)

    if resposta_deepseek is not None:
        print("Resposta do Claude:", resposta_deepseek)

        nova_mensagem = {
            "type": "text",
            "content": message,
            "from": "cliente",
            "timestamp": datetime.now().strftime("%H:%M %d/%m/%y")
        }
        
        nova_resposta = {
            "type": "text",
            "content": resposta_deepseek,
            "from": "deepseek",  # Mantendo o nome para compatibilidade
            "timestamp": datetime.now().strftime("%H:%M %d/%m/%y")
        }

        # Atualizar o histórico
        historico_existente = storage_manager.load_json(f"{phone_number}.json") or {"messages": []}
        
        if "messages" not in historico_existente:
            historico_existente["messages"] = []
            
        historico_existente["messages"].extend([nova_mensagem, nova_resposta])

        # Salvar o histórico atualizado
        storage_manager.save_json(f"{phone_number}.json", historico_existente)

        return resposta_deepseek
    else:
        print("Não foi possível obter uma resposta do Claude.")
        return None