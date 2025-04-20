from flask import Flask, request, jsonify, render_template

class WebhookServer:
    def __init__(self, whatsapp_manager):
        self.app = Flask(__name__)
        self.whatsapp_manager = whatsapp_manager
        self.setup_routes()

    def setup_routes(self):
        @self.app.route('/')
        def index():
            conversations = self.whatsapp_manager.conversations
            return render_template('index.html', conversations=conversations)

        @self.app.route('/webhook', methods=['GET'])
        def verify_webhook():
            mode = request.args.get("hub.mode")
            token = request.args.get("hub.verify_token")
            challenge = request.args.get("hub.challenge")

            if mode and token == self.whatsapp_manager.VERIFICATION_TOKEN:
                print("Webhook verificado com sucesso!")
                return challenge, 200
            else:
                print("Token inválido!")
                return "Token inválido", 403

        @self.app.route('/webhook', methods=['POST'])
        def webhook():
            try:
                data = request.json
                print(f"Mensagem recebida via webhook: {data}")
                self.whatsapp_manager.handle_incoming_message(data)
                return jsonify({"status": "ok"}), 200
            except Exception as e:
                print(f"Erro ao processar mensagem do webhook: {str(e)}")
                return jsonify({"status": "error", "message": str(e)}), 500

    def run(self, port=5000):
        print(f"Iniciando servidor webhook na porta {port}...")
        self.app.run(port=port)