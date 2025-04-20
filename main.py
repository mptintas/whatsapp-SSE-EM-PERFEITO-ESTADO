from WhatsApp_Manager import WhatsAppManager
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect
import os
import logging
from google.cloud import storage
from flask_cors import CORS  
from datetime import datetime
from realtime_service import initialize_realtime_service

# Configuração de logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    handlers=[logging.StreamHandler()])
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

# Inicializa o gerenciador do WhatsApp
whatsapp_manager = WhatsAppManager()

# Inicializa o serviço de tempo real
realtime_service = initialize_realtime_service(app, whatsapp_manager)

# Anexa o WhatsApp manager ao app para uso nas rotas criadas por realtime_service
app.whatsapp_manager = whatsapp_manager

# Inicializa o cliente do Google Cloud Storage
storage_client = storage.Client()
media_bucket_name = "aerial-acre-455118-a9-media"

# Rota para servir arquivos de mídia
@app.route('/media/<path:filename>')
def serve_media(filename):
    try:
        logger.info(f"Solicitação de mídia: {filename}")
        
        # Tenta servir do Google Cloud Storage
        bucket = storage_client.bucket(media_bucket_name)
        blob = bucket.blob(filename)
        
        if blob.exists():
            # Gera URL pública e redireciona
            public_url = blob.public_url
            logger.info(f"Redirecionando para URL pública: {public_url}")
            return redirect(public_url)
        
        # Se não encontrou no GCS, tenta localmente (para desenvolvimento)
        # Determina o tipo de mídia com base no caminho
        if filename.startswith('images/'):
            return send_from_directory('media', filename)
        elif filename.startswith('audio/'):
            return send_from_directory('media', filename)
        elif filename.startswith('video/'):
            return send_from_directory('media', filename)
        elif filename.startswith('documents/'):
            return send_from_directory('media', filename)
        else:
            logger.warning(f"Tipo de mídia não suportado: {filename}")
            return "Arquivo não encontrado", 404
    except Exception as e:
        logger.error(f"Erro ao servir mídia {filename}: {str(e)}")
        # Tenta localmente como fallback
        try:
            # Determina o tipo de mídia com base no caminho
            if filename.startswith('images/') or filename.startswith('audio/') or filename.startswith('video/') or filename.startswith('documents/'):
                return send_from_directory('media', filename)
            else:
                return "Arquivo não encontrado", 404
        except:
            return "Erro ao servir mídia", 500

@app.route('/')
def index():
    try:
        # Renderiza a página inicial com as conversas existentes
        conversations = whatsapp_manager.conversations
        logger.info(f"Página inicial carregada com {len(conversations)} conversas")
        return render_template('index.html', conversations=conversations)
    except Exception as e:
        logger.error(f"Erro na página inicial: {str(e)}")
        return "Erro ao carregar a página", 500

@app.route('/send_location', methods=['POST'])
def send_location():
    try:
        data = request.json
        to_number = data.get("to_number")
        latitude = data.get("latitude")
        longitude = data.get("longitude")
        
        logger.info(f"Enviando localização para {to_number}: {latitude}, {longitude}")
        
        # Crie uma mensagem com a localização
        message = f"Minha localização atual: https://maps.google.com/?q={latitude},{longitude}"
        
        # Use a função existente para enviar mensagem de texto
        success = whatsapp_manager.send_message_to_whatsapp(to_number, message)
        
        if success:
            logger.info(f"Localização enviada com sucesso para {to_number}")
            return jsonify({"status": "success"}), 200
        else:
            logger.warning(f"Falha ao enviar localização para {to_number}")
            return jsonify({"status": "error"}), 500
    except Exception as e:
        logger.error(f"Erro ao enviar localização: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/send_message', methods=['POST'])
def send_message():
    try:
        logger.info("ROTA SEND_MESSAGE: Dados recebidos: %s", request.json)
        # Envia uma mensagem para um número via API do WhatsApp
        data = request.json
        to_number = data.get("to_number")
        message = data.get("message")
        media_path = data.get("media_path")
        media_type = data.get("media_type")
        
        logger.info(f"Enviando mensagem para {to_number}. Mídia: {media_type if media_type else 'Nenhuma'}")
        
        # Primeiro definimos a variável success
        if media_path and media_type:
            success = whatsapp_manager.send_message_to_whatsapp(to_number, message, media_type, media_path)
        else:
            success = whatsapp_manager.send_message_to_whatsapp(to_number, message)
        
        # Depois verificamos seu valor
        if success:
            logger.info(f"Mensagem enviada com sucesso para {to_number}")
            return jsonify({"status": "success"}), 200
        else:
            logger.warning(f"Falha ao enviar mensagem para {to_number}")
            return jsonify({"status": "error"}), 500
    except Exception as e:
        logger.error(f"Erro ao enviar mensagem: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/toggle_mode/<phone_number>', methods=['POST'])
def toggle_conversation_mode(phone_number):
    try:
        # Alterna o modo da conversa entre automático e humano
        new_mode = whatsapp_manager.toggle_conversation_mode(phone_number)
        if new_mode:
            logger.info(f"Modo de conversa alterado para {phone_number}: {new_mode}")
            # Notificar outros clientes sobre a mudança de modo
            if hasattr(app, 'realtime_service'):
                app.realtime_service.notify_conversation_update(
                    phone_number, 
                    "mode_updated", 
                    {"mode": new_mode}
                )
            return jsonify({"status": "success", "mode": new_mode}), 200
        else:
            logger.warning(f"Conversa não encontrada para alternar modo: {phone_number}")
            return jsonify({"status": "error", "message": "Conversa não encontrada"}), 404
    except Exception as e:
        logger.error(f"Erro ao alternar modo de conversa: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/upload_media', methods=['POST'])
def upload_media():
    try:
        # Endpoint para fazer upload de mídia do cliente
        if 'file' not in request.files:
            logger.warning("Tentativa de upload sem arquivo")
            return jsonify({"status": "error", "message": "Nenhum arquivo enviado"}), 400
        
        file = request.files['file']
        if file.filename == '':
            logger.warning("Nome de arquivo vazio no upload")
            return jsonify({"status": "error", "message": "Nome de arquivo vazio"}), 400
        
        # Determinar o tipo de mídia
        if file.content_type.startswith('image/'):
            media_type = 'images'
        elif file.content_type.startswith('audio/'):
            media_type = 'audio'
        elif file.content_type.startswith('video/'):
            media_type = 'video'
        else:
            media_type = 'documents'
        
        # Salvar o arquivo no Google Cloud Storage
        filename = f"{file.filename}"
        gcs_path = f"{media_type}/{filename}"
        
        # Fazer upload para o GCS
        bucket = storage_client.bucket(media_bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_string(
            file.read(),
            content_type=file.content_type
        )
        
        # Tornar o arquivo publicamente acessível
        blob.make_public()
        
        logger.info(f"Mídia carregada para o GCS: {gcs_path}")
        
        # Para desenvolvimento local, também salva localmente
        try:
            media_dir = os.path.join('media', media_type)
            if not os.path.exists(media_dir):
                os.makedirs(media_dir)
                
            filepath = os.path.join(media_dir, filename)
            file.seek(0)  # Voltar ao início do arquivo
            file.save(filepath)
            logger.info(f"Mídia também salva localmente em: {filepath}")
        except Exception as e:
            logger.warning(f"Não foi possível salvar localmente (isso é normal no App Engine): {str(e)}")
        
        return jsonify({
            "status": "success", 
            "media_path": gcs_path, 
            "media_type": media_type.rstrip('s')  # Remove o 's' para corresponder ao tipo da API
        }), 200
    except Exception as e:
        logger.error(f"Erro no upload de mídia: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/webhook', methods=['POST'])
def webhook():
    try:
        data = request.json
        logger.info("Mensagem recebida via webhook")
        
        # Processa a mensagem recebida
        updated_phone = whatsapp_manager.handle_incoming_message(data)
        
        # Nota: Não precisamos enviar notificações manualmente aqui
        # O enhanced_handle_incoming_message em realtime_service.py cuidará disso
        
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        logger.error(f"Erro ao processar mensagem do webhook: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/all_conversations', methods=['GET'])
def get_all_conversations():
    try:
        # Retorna apenas os dados de todas as conversas
        return jsonify(whatsapp_manager.conversations), 200
    except Exception as e:
        logger.error(f"Erro ao obter todas as conversas: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/delete_conversation/<phone_number>', methods=['POST'])
def delete_conversation(phone_number):
    try:
        # Verifica se a conversa existe
        if phone_number in whatsapp_manager.conversations:
            # Remove a conversa da memória
            del whatsapp_manager.conversations[phone_number]
            
            # Tenta remover o arquivo do Google Cloud Storage
            try:
                bucket_name = "aerial-acre-455118-a9-conversations"  # Nome do seu bucket
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(f"{phone_number}.json")
                blob.delete()
                logger.info(f"Arquivo de conversa {phone_number}.json removido do GCS")
            except Exception as storage_error:
                logger.warning(f"Erro ao deletar arquivo no GCS: {str(storage_error)}")
            
            # Notifica os clientes sobre a exclusão da conversa
            if hasattr(app, 'realtime_service'):
                app.realtime_service.broadcast_system_event(
                    "conversation_deleted",
                    {"phone_number": phone_number}
                )
            
            logger.info(f"Conversa {phone_number} deletada com sucesso")
            return jsonify({"status": "success"}), 200
        else:
            logger.warning(f"Conversa não encontrada para deletar: {phone_number}")
            return jsonify({"status": "error", "message": "Conversa não encontrada"}), 404
    except Exception as e:
        logger.error(f"Erro ao deletar conversa {phone_number}: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/conversation/<phone_number>', methods=['GET'])
def get_conversation(phone_number):
    try:
        # Verifica se a conversa existe
        if phone_number in whatsapp_manager.conversations:
            # Retorna os dados da conversa
            return jsonify(whatsapp_manager.conversations[phone_number]), 200
        else:
            # Conversa não encontrada
            return jsonify({"status": "error", "message": "Conversa não encontrada"}), 404
    except Exception as e:
        logger.error(f"Erro ao obter conversa {phone_number}: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/events/status', methods=['GET'])
def sse_status():
    """Endpoint para verificar o status do serviço SSE"""
    if hasattr(app, 'realtime_service'):
        return jsonify({
            "status": "online",
            "clients": len(app.realtime_service.clients),
            "timestamp": datetime.now().isoformat()
        }), 200
    else:
        return jsonify({
            "status": "offline",
            "message": "Serviço de eventos em tempo real não está ativo"
        }), 503

@app.after_request
def add_header(response):
    # Adiciona cabeçalhos para evitar cache
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.route('/debug_media_send', methods=['POST'])
def debug_media_send():
    try:
        data = request.json
        to_number = data.get("to_number")
        message = data.get("message", "Teste de diagnóstico")
        media_path = data.get("media_path")
        media_type = data.get("media_type", "image")
        
        logger.info(f"DEBUG ROTA: Iniciando teste de envio de mídia para {to_number}")
        logger.info(f"DEBUG ROTA: Mídia: {media_type} - {media_path}")
        
        # Forçar modo humano para teste
        if to_number in whatsapp_manager.conversations:
            original_mode = whatsapp_manager.conversations[to_number].get("mode", "auto")
            whatsapp_manager.conversations[to_number]["mode"] = "human"
            logger.info(f"DEBUG ROTA: Modo original: {original_mode}, alterado para: human")
        
        # Tenta enviar a mensagem
        result = whatsapp_manager.send_message_to_whatsapp(to_number, message, media_type, media_path)
        
        # Restaura o modo original
        if to_number in whatsapp_manager.conversations:
            whatsapp_manager.conversations[to_number]["mode"] = original_mode
            logger.info(f"DEBUG ROTA: Restaurado modo: {original_mode}")
        
        # Retorna o resultado
        return jsonify({
            "status": "success" if result else "error",
            "message": "Mensagem enviada com sucesso" if result else "Falha ao enviar mensagem"
        })
    except Exception as e:
        logger.error(f"DEBUG ROTA ERROR: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/test_audio_send', methods=['GET'])
def test_audio_send():
    try:
        # Use um arquivo de áudio de teste que sabemos que existe no GCS
        test_audio_path = "audio/test_audio.ogg"  # Ajuste para um caminho que exista no seu bucket
        test_phone = "5511964648888"  # Ajuste para um número válido
        
        logger.info(f"TESTE DE ÁUDIO: Iniciando teste com {test_audio_path}")
        
        # Teste direto da função de upload de mídia
        mime_type = "audio/ogg"
        media_id = whatsapp_manager.media_handler.upload_media(test_audio_path, whatsapp_manager.WHATSAPP_TOKEN, mime_type)
        
        logger.info(f"TESTE DE ÁUDIO: Resultado do upload: {media_id}")
        
        if not media_id:
            return jsonify({"status": "error", "stage": "upload", "message": "Falha ao fazer upload do áudio"})
        
        # Tenta enviar a mensagem
        result = whatsapp_manager.send_message_to_whatsapp(test_phone, "", "audio", test_audio_path)
        
        logger.info(f"TESTE DE ÁUDIO: Resultado do envio: {result}")
        
        return jsonify({
            "status": "success" if result else "error",
            "stage": "send" if media_id else "upload",
            "media_id": media_id,
            "message": "Teste completo" if result else "Falha no envio"
        })
    except Exception as e:
        logger.error(f"TESTE DE ÁUDIO ERROR: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({"status": "error", "message": str(e), "traceback": traceback.format_exc()}), 500

if __name__ == "__main__":
    logger.info("Iniciando servidor Flask na porta 5000...")
    app.run(debug=True, port=5000)