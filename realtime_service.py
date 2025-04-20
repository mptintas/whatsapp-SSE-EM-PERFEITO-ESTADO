# realtime_service.py
import json
import time
import uuid
import threading
import atexit
from datetime import datetime
from queue import Queue, Empty
from flask import Response, request, jsonify, stream_with_context

class SSEClient:
    """Representa um cliente conectado via SSE"""
    def __init__(self, client_id, response=None):
        self.client_id = client_id
        self.response = response
        self.phone_number = None  # Conversa que o cliente está visualizando
        self.last_event_id = 0
        self.connected_at = datetime.now()
        self.queue = Queue()  # Fila de eventos para este cliente
        
    def set_phone_number(self, phone_number):
        """Define qual número de telefone o cliente está observando"""
        self.phone_number = phone_number
        
    def send_event(self, event_type, data, event_id=None):
        """Envia um evento SSE para este cliente"""
        if event_id is None:
            self.last_event_id += 1
            event_id = self.last_event_id
            
        event = {
            "id": event_id,
            "type": event_type,
            "data": data
        }
        
        # Adiciona à fila do cliente para ser processado pelo stream
        self.queue.put(event)
        return True


class RealtimeService:
    """Gerenciador de comunicação em tempo real via SSE"""
    def __init__(self):
        self.clients = {}  # Mapeamento de client_id para objeto SSEClient
        self.client_lock = threading.RLock()  # Para acesso thread-safe
        self.event_queue = Queue()  # Fila de eventos a serem processados
        self.event_thread = None  # Thread para processamento de eventos
        self.running = False
        self.client_phones = {}  # Mapeamento de phone_number para lista de client_ids
        
    def start(self):
        """Inicia o serviço de eventos em tempo real"""
        if self.running:
            return
            
        self.running = True
        self.event_thread = threading.Thread(target=self._process_event_queue)
        self.event_thread.daemon = True
        self.event_thread.start()
        print("Serviço de eventos em tempo real iniciado")
        
    def stop(self):
        """Para o serviço de eventos em tempo real"""
        self.running = False
        if self.event_thread:
            self.event_thread.join(timeout=5.0)
        print("Serviço de eventos em tempo real parado")
            
    def _process_event_queue(self):
        """Processa a fila de eventos em background"""
        while self.running:
            try:
                event = self.event_queue.get(timeout=1.0)
                self._distribute_event(event)
                self.event_queue.task_done()
            except Empty:
                continue
            except Exception as e:
                print(f"Erro ao processar evento: {str(e)}")
                
    def _distribute_event(self, event):
        """Distribui um evento para os clientes apropriados"""
        event_type = event.get("type")
        event_data = event.get("data")
        target_phone = event.get("phone_number")
        
        with self.client_lock:
            # Se temos um telefone alvo, enviamos apenas para clientes observando esse número
            if target_phone:
                client_ids = self.client_phones.get(target_phone, [])
                for client_id in client_ids:
                    if client_id in self.clients:
                        try:
                            self.clients[client_id].send_event(event_type, event_data)
                        except Exception as e:
                            print(f"Erro ao enviar evento para cliente {client_id}: {str(e)}")
            else:
                # Broadcast para todos os clientes
                for client_id, client in list(self.clients.items()):
                    try:
                        client.send_event(event_type, event_data)
                    except Exception as e:
                        print(f"Erro ao enviar evento para cliente {client_id}: {str(e)}")
                        # Remove cliente com erro
                        self.clients.pop(client_id, None)
                    
    def register_client(self, client_id):
        """Registra um novo cliente SSE"""
        with self.client_lock:
            # Se o cliente já existe, mantém a mesma instância
            if client_id in self.clients:
                return self.clients[client_id]
                
            client = SSEClient(client_id)
            self.clients[client_id] = client
            print(f"Cliente {client_id} registrado")
            return client
            
    def unregister_client(self, client_id):
        """Remove um cliente SSE"""
        with self.client_lock:
            if client_id in self.clients:
                client = self.clients[client_id]
                
                # Remove do mapeamento de telefones
                if client.phone_number and client.phone_number in self.client_phones:
                    if client_id in self.client_phones[client.phone_number]:
                        self.client_phones[client.phone_number].remove(client_id)
                        
                # Remove do dicionário de clientes
                self.clients.pop(client_id, None)
                print(f"Cliente {client_id} removido")
            
    def set_client_phone(self, client_id, phone_number):
        """Define qual conversa o cliente está visualizando"""
        with self.client_lock:
            if client_id in self.clients:
                client = self.clients[client_id]
                
                # Remove do mapeamento anterior, se existir
                if client.phone_number and client.phone_number in self.client_phones:
                    if client_id in self.client_phones[client.phone_number]:
                        self.client_phones[client.phone_number].remove(client_id)
                
                # Define o novo número
                client.set_phone_number(phone_number)
                
                # Adiciona ao novo mapeamento
                if phone_number not in self.client_phones:
                    self.client_phones[phone_number] = []
                if client_id not in self.client_phones[phone_number]:
                    self.client_phones[phone_number].append(client_id)
                    
                print(f"Cliente {client_id} observando {phone_number}")
                
    def notify_new_message(self, phone_number, message_data):
        """Notifica sobre uma nova mensagem"""
        event = {
            "type": "new_message",
            "data": {
                "phone_number": phone_number,
                "message": message_data
            },
            "phone_number": phone_number
        }
        self.event_queue.put(event)
        print(f"Evento de nova mensagem para {phone_number} enfileirado")
        
    def notify_message_status(self, phone_number, message_id, status):
        """Notifica sobre mudança de status de uma mensagem"""
        event = {
            "type": "message_status",
            "data": {
                "phone_number": phone_number,
                "message_id": message_id,
                "status": status
            },
            "phone_number": phone_number
        }
        self.event_queue.put(event)
        print(f"Evento de status de mensagem para {phone_number} enfileirado")
        
    def notify_conversation_update(self, phone_number, update_type, data=None):
        """Notifica sobre atualizações gerais em uma conversa"""
        event = {
            "type": "conversation_update",
            "data": {
                "phone_number": phone_number,
                "update_type": update_type,
                "data": data or {}
            },
            "phone_number": phone_number
        }
        self.event_queue.put(event)
        print(f"Evento de atualização de conversa para {phone_number} enfileirado")
        
    def broadcast_system_event(self, event_type, data=None):
        """Envia um evento de sistema para todos os clientes"""
        event = {
            "type": event_type,
            "data": data or {},
            "phone_number": None  # Broadcast para todos
        }
        self.event_queue.put(event)
        print(f"Evento de sistema {event_type} enfileirado para broadcast")


def create_sse_endpoint(app, realtime_service):
    """Cria os endpoints SSE no aplicativo Flask"""
    
    @app.route('/events')
    def sse_stream():
        """Endpoint principal para conexões SSE"""
        # Verifica se o cliente suporta SSE
        if not request.headers.get('Accept') == 'text/event-stream':
            return "Este endpoint requer suporte a Server-Sent Events", 400
            
        # Recupera ou gera um ID de cliente
        client_id = request.args.get('client_id')
        if not client_id:
            client_id = str(uuid.uuid4())
            
        # Registra o cliente
        client = realtime_service.register_client(client_id)
        
        # Configura a resposta SSE
        def generate():
            # Envia evento inicial com o ID do cliente
            yield f"id: 0\nevent: connected\ndata: {json.dumps({'client_id': client_id})}\n\n"
            
            try:
                # Loop principal para enviar eventos
                while True:
                    # Tenta obter um evento da fila do cliente
                    try:
                        event = client.queue.get(timeout=20.0)
                        event_id = event.get("id", 0)
                        event_type = event.get("type", "message")
                        event_data = json.dumps(event.get("data", {}))
                        
                        # Formata o evento SSE
                        yield f"id: {event_id}\nevent: {event_type}\ndata: {event_data}\n\n"
                        client.queue.task_done()
                    except Empty:
                        # Envia heartbeat se não houver eventos
                        yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.now().isoformat()})}\n\n"
            except GeneratorExit:
                # Cliente desconectou
                realtime_service.unregister_client(client_id)
            except Exception as e:
                print(f"Erro no stream de eventos: {str(e)}")
                realtime_service.unregister_client(client_id)
        
        response = Response(
            stream_with_context(generate()),
            content_type='text/event-stream'
        )
        
        # Configura cabeçalhos para SSE
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['X-Accel-Buffering'] = 'no'  # Para Nginx
        response.headers['Connection'] = 'keep-alive'
        
        return response
        
    @app.route('/events/subscribe/<phone_number>', methods=['POST'])
    def subscribe_to_phone(phone_number):
        """Endpoint para assinar atualizações de um número específico"""
        client_id = request.json.get('client_id')
        if not client_id:
            return jsonify({"status": "error", "message": "client_id é obrigatório"}), 400
            
        realtime_service.set_client_phone(client_id, phone_number)
        
        # Marca mensagens como lidas quando o cliente se inscreve
        if phone_number in app.whatsapp_manager.conversations:
            # Atualiza o contador de não lidas
            if 'unread_count' not in app.whatsapp_manager.conversations[phone_number]:
                app.whatsapp_manager.conversations[phone_number]['unread_count'] = 0
                
            app.whatsapp_manager.conversations[phone_number]['unread_count'] = 0
            app.whatsapp_manager.save_conversation(phone_number)
            
            # Notifica outros clientes sobre a mudança
            realtime_service.notify_conversation_update(
                phone_number, 
                "unread_updated", 
                {"unread_count": 0}
            )
            
        return jsonify({"status": "success"})


def modify_whatsapp_manager(whatsapp_manager, realtime_service):
    """Modifica o WhatsAppManager para integrar com o RealtimeService"""
    
    # Salva referências originais dos métodos
    original_handle_incoming = whatsapp_manager.handle_incoming_message
    original_send_message = whatsapp_manager.send_message_to_whatsapp
    
    # Sobrescreve o método handle_incoming_message
    def enhanced_handle_incoming(data):
        phone_number = original_handle_incoming(data)
        
        if phone_number:
            # Obtém a última mensagem adicionada
            if phone_number in whatsapp_manager.conversations:
                conversation = whatsapp_manager.conversations[phone_number]
                if "messages" in conversation and conversation["messages"]:
                    last_message = conversation["messages"][-1]
                    
                    # Adiciona ID único se não existir
                    if "id" not in last_message:
                        last_message["id"] = str(uuid.uuid4())
                        whatsapp_manager.save_conversation(phone_number)
                    
                    # Incrementa contador de não lidas
                    if "unread_count" not in conversation:
                        conversation["unread_count"] = 0
                    conversation["unread_count"] += 1
                    whatsapp_manager.save_conversation(phone_number)
                    
                    # Notifica clientes sobre nova mensagem
                    realtime_service.notify_new_message(phone_number, last_message)
                    
                    # Notifica sobre atualização do contador de não lidas
                    realtime_service.notify_conversation_update(
                        phone_number,
                        "unread_updated",
                        {"unread_count": conversation["unread_count"]}
                    )
        
        return phone_number
    
    # Sobrescreve o método send_message_to_whatsapp
    def enhanced_send_message(to_number, message, media_type=None, media_path=None):
        # Gera ID único para a mensagem
        message_id = str(uuid.uuid4())
        
        # Adiciona a mensagem com status "sending"
        if to_number in whatsapp_manager.conversations:
            conversation = whatsapp_manager.conversations[to_number]
            sender = "qwen" if conversation.get("mode", "auto") == "auto" else "vendedor"
            timestamp = datetime.now().strftime("%H:%M %d/%m/%y")
            
            # Cria objeto de mensagem
            message_obj = {
                "id": message_id,
                "type": "text" if media_type is None else media_type,
                "content": message,
                "from": sender,
                "timestamp": timestamp,
                "status": "sending"
            }
            
            if media_type and media_path:
                message_obj["media_url"] = media_path
            
            # Adiciona à conversa
            if "messages" not in conversation:
                conversation["messages"] = []
            conversation["messages"].append(message_obj)
            whatsapp_manager.save_conversation(to_number)
            
            # Notifica clientes sobre nova mensagem
            realtime_service.notify_new_message(to_number, message_obj)
        
        # Chama o método original para enviar
        result = original_send_message(to_number, message, media_type, media_path)
        
        # Atualiza o status com base no resultado
        if to_number in whatsapp_manager.conversations:
            conversation = whatsapp_manager.conversations[to_number]
            if "messages" in conversation:
                for msg in reversed(conversation["messages"]):
                    if msg.get("id") == message_id:
                        msg["status"] = "delivered" if result else "failed"
                        whatsapp_manager.save_conversation(to_number)
                        
                        # Notifica sobre mudança de status
                        realtime_service.notify_message_status(
                            to_number,
                            message_id,
                            msg["status"]
                        )
                        break
        
        return result
    
    # Substitui os métodos originais
    whatsapp_manager.handle_incoming_message = enhanced_handle_incoming
    whatsapp_manager.send_message_to_whatsapp = enhanced_send_message
    
    # Adiciona método para marcar mensagens como lidas
    def mark_messages_read(phone_number):
        if phone_number in whatsapp_manager.conversations:
            conversation = whatsapp_manager.conversations[phone_number]
            if conversation.get("unread_count", 0) > 0:
                conversation["unread_count"] = 0
                whatsapp_manager.save_conversation(phone_number)
                
                # Notifica sobre atualização do contador
                realtime_service.notify_conversation_update(
                    phone_number,
                    "unread_updated",
                    {"unread_count": 0}
                )
                return True
        return False
    
    # Adiciona o novo método ao WhatsAppManager
    whatsapp_manager.mark_messages_read = mark_messages_read


def initialize_realtime_service(app, whatsapp_manager):
    """Inicializa o serviço de tempo real e o integra ao aplicativo Flask"""
    # Cria instância do serviço
    realtime_service = RealtimeService()
    
    # Inicia o serviço
    realtime_service.start()
    
    # Registra para limpeza ao desligar
    atexit.register(realtime_service.stop)
    
    # Cria endpoints SSE
    create_sse_endpoint(app, realtime_service)
    
    # Modifica o WhatsAppManager
    modify_whatsapp_manager(whatsapp_manager, realtime_service)
    
    # Armazena referência no aplicativo
    app.realtime_service = realtime_service
    
    # Adiciona rota para marcar mensagens como lidas
    @app.route('/mark_read/<phone_number>', methods=['POST'])
    def mark_read(phone_number):
        success = whatsapp_manager.mark_messages_read(phone_number)
        return jsonify({"status": "success" if success else "error"})
    
    # Adiciona rota para verificar status do serviço
    @app.route('/events/status', methods=['GET'])
    def service_status():
        return jsonify({
            "status": "online",
            "clients": len(realtime_service.clients),
            "timestamp": datetime.now().isoformat()
        })
    
    return realtime_service