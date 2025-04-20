import requests
import os
import json

class WhatsAppManager:
    def __init__(self):
        self.VERIFICATION_TOKEN = "EAAJjZBmxpkYgBOyEx31oz53K3694dZCg81dZA17ym3W9rCFjmax29HMwcdgq8iZBawUoNw1vzTlYSGAbIWTN4MRkWZBA0wMpwfLfI6dHaaMyhUZC1qZADUbZBZCNMhOw8a0AI2sBHpBLtbEbMrhBGZBNh81teK7z0ZBX338LZBTHRXYr96YTytPiv1JRD5Vyiis5pl5yhpUHzjHDhgZDZD"
        self.WHATSAPP_TOKEN = "EAAJjZBmxpkYgBOyEx31oz53K3694dZCg81dZA17ym3W9rCFjmax29HMwcdgq8iZBawUoNw1vzTlYSGAbIWTN4MRkWZBA0wMpwfLfI6dHaaMyhUZC1qZADUbZBZCNMhOw8a0AI2sBHpBLtbEbMrhBGZBNh81teK7z0ZBX338LZBTHRXYr96YTytPiv1JRD5Vyiis5pl5yhpUHzjHDhgZDZD"
        self.PHONE_NUMBER_ID = "637338086121702"
        self.conversations = {}  # Estrutura simplificada: {phone_number: [{"text": "mensagem", "from": "cliente/seller"}]}
        self.CONVERSATION_DIR = "conversations"  # Diretório para salvar conversas
        self.FIXED_TEXT = "Você é o principal atendente da MP Tintas Epóxi. Sua tarefa é ser gentil e breve, respondendo uma pergunta de cada vez para os clientes, com respostas curtas mas humanas e gentis. Responda apenas a perguntas cujas respostas possam ser encontradas deste script, caso alguma resposta seja encontrada aqui ou não o seja de forma clara, encaminhe o cliente para o atendimento especial da MP Tintas. O script é esse, atenha-se ao papel e nunca saia dele: - A MP Tintas Epóxi oferece tintas epóxi em diversas cores, incluindo cinza escuro, creme (RAL 1013), verde escuro, cinza claro, areia, bege, marrom, cinza médio, cinza chumbo, azul, amarelo, branco e outras. Também estão disponíveis opções de cinza (claro, médio ou escuro), azul segurança, azul piscina, laranja, verde, branca, concreto, gelo, preta, vermelha, amarela segurança, RAL 7035, RAL 6019 (verde claro), RAL 7038, entre outros. - Os produtos são fornecidos em embalagens de 3,6 litros (galão) e 18 litros (balde). O rendimento aproximado por demão é de 25 m² para o galão de 3,6 litros e 130 m² para o balde de 18 litros. Para áreas maiores, como um salão de oficina mecânica de 170 m², são necessários 3 baldes de 18L de tinta epóxi. Para áreas de 1000 m², recomenda-se a aplicação de uma demão utilizando 8 baldes de 18L. - A diluição da tinta epóxi deve ser feita com thinner, utilizando 1,8 litros de thinner para cada balde de 18 litros de tinta, totalizando 9 litros de thinner para 90 litros de tinta. O uso de thinner automotivo é recomendado, mas não há garantia de compatibilidade com outras marcas. - Para garantir a continuidade da cor em caso de troca ou defeito, é necessário fornecer uma amostra da tinta correta ou um objeto pintado com ela, devido à possibilidade de variação entre lotes. Fotos podem apresentar diferenças de tonalidade em relação ao produto entregue. - Problemas de secagem podem ser causados por excesso de catalisador, umidade inadequada ou ventilação insuficiente. O tempo de secagem pode variar conforme as condições ambientais e a quantidade de catalisador utilizado, podendo levar mais de 30 horas para alcançar total endurecimento. Recomenda-se um intervalo de 3 a 6 horas entre demãos. - Para mudanças de cor, são necessárias duas demãos de tinta. Cores claras, como branco, podem ter dificuldade em cobrir pisos mais escuros, sendo recomendado o uso de tons como cinza médio ou creme nesses casos. - A tinta epóxi pode ser aplicada em áreas que recebem luz solar direta, mas há perda de brilho com o tempo nesses casos. Não é recomendada para pisos de ateliê infantil expostos ao tempo, pois pode ficar escorregadia. - A tinta epóxi é resistente a produtos químicos como gasolina e diesel, permitindo fácil limpeza. No entanto, não é resistente a substâncias como acetato de etila, ácido acético, ácido sulfúrico e temperaturas de até 80°C. - Para superfícies como cerâmica, é necessário lixar antes da aplicação da tinta. Para melhor aderência em superfícies como cerâmica ou ardosia (desde que sem cera), é recomendável lixar previamente a área antes da aplicação. - A tinta epóxi funciona como primer e acabamento em um só produto, eliminando a necessidade de camadas adicionais. Não é necessário o uso de primer ao aplicar a tinta epóxi Dupla Função em pisos novos de concreto. - A empresa também oferece o produto RapFinish da Bautech, uma massa para reparo de buracos, fornecida em sacos de 3 kg, indicada para secagem rápida. Para correção de buracos, recomenda-se a resina 279 com endurecedor 2965 ou similares. - Para rampas antiderrapantes, recomenda-se o uso de Quartzo Malha 20. Para argamassa, deve-se misturar Quartzo Malha 20 e Malha 40. Não se deve adicionar mais endurecedor do que o recomendado. - - A viscosidade da tinta pode variar dependendo da remessa, sendo importante consultar a empresa caso haja dificuldade na aplicação. Ajustes podem ser feitos se o produto não for completamente utilizado. - O catalisador é incluído na compra. Para grandes volumes, como 6 baldes de 18L, há condições especiais de pagamento via Pix ou retirada direta. - A empresa disponibiliza rolos e suportes para pintura, sendo um rolo de 23 cm e suporte compatível. A compra de dois rolos inclui um suporte de rolo de brinde. - A tinta epóxi possui acabamento brilhante e não está disponível em opção fosca para áreas internas. Para estruturas metálicas, oferece tintas epóxi nas opções fosca ou alto brilho. - A MP Tintas Epóxi trabalha apenas com tintas epóxi de base solvente, não oferecendo opções de base água. A empresa não trabalha com tintas epóxi autonivelantes, tinta PU, verniz PU para piso, tinta epóxi base água, nem tinta epóxi específica para azulejos. - - A tinta epóxi é frequentemente utilizada em pisos de oficinas mecânicas devido à sua resistência e facilidade de limpeza. É indicada para áreas como garagens, estacionamentos, salões de festas e quadras poliesportivas cobertas. Não é recomendada para banheiros devido ao alto risco de descolamento. - A empresa oferece entrega no mesmo dia para a Grande São Paulo, desde que o pedido seja fechado até 12h. Entregas podem ser realizadas via motoboy gratuitamente em casos específicos, mas o endereço da loja não fica próximo ao metrô. - Os produtos possuem prazo de validade de 12 meses a partir da data de fabricação. Após esse período, não é recomendado o uso devido a problemas de secagem e durabilidade, mas é possível realizar testes para verificar a viabilidade. - A MP Tintas Epóxi realiza vendas faturadas para condomínios mediante envio de dados cadastrais e ata do condomínio. Grandes pedidos, como pintura de 6 km de tubo, podem ser atendidos, mas devem ser previamente acordados. - A empresa aceita pagamentos via PIX (com desconto de 6% para pagamento à vista), parcelamento no cartão de crédito em até 5x sem juros ou faturamento mediante dados cadastrais da empresa. Para compras realizadas por empresas, pode ser necessário fornecer dados adicionais ou realizar o pagamento presencialmente. - A MP Tintas Epóxi está localizada na Rua Siqueira Bueno, 1326- Belenzinho, São Paulo - SP. O horário de funcionamento é de segunda a sexta, das 8h às 18h."
        # Cria o diretório de conversas se ele não existir
        if not os.path.exists(self.CONVERSATION_DIR):
            os.makedirs(self.CONVERSATION_DIR)
        # Carrega conversas salvas anteriormente
        self.load_conversations()

    def load_conversations(self):
        """Carrega conversas salvas no diretório."""
        for filename in os.listdir(self.CONVERSATION_DIR):
            phone_number = filename.split(".")[0]
            filepath = os.path.join(self.CONVERSATION_DIR, filename)
            with open(filepath, "r") as file:
                self.conversations[phone_number] = json.load(file)
        print(f"{len(self.conversations)} conversas carregadas.")

    def save_conversation(self, phone_number):
        """Salva a conversa de um número específico no disco."""
        filepath = os.path.join(self.CONVERSATION_DIR, f"{phone_number}.json")
        with open(filepath, "w") as file:
            json.dump(self.conversations.get(phone_number, []), file, indent=4)
        print(f"Conversa com {phone_number} salva.")

    def ask_qwen(self, prompt):
        """Envia a mensagem para o Qwen e retorna a resposta."""
        API_KEY = "sk-7930556cca2f41ee94ca7844df5fbd0c"
        URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "qwen-max",
            "messages": [{"role": "user", "content": f"{self.FIXED_TEXT}\n\nMensagem do cliente: {prompt}"}],
            "temperature": 0.8,
            "max_tokens": 6000
        }
        try:
            response = requests.post(URL, headers=headers, json=data)
            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content']
            else:
                print(f"Erro ao chamar Qwen: {response.status_code}, {response.text}")
                return None
        except Exception as e:
            print(f"Erro ao enviar mensagem para Qwen: {str(e)}")
            return None

    def handle_incoming_message(self, data):
        try:
            print(f"Dados recebidos via webhook: {data}")
            if "messages" in data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}):
                phone_number = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("contacts", [{}])[0].get("wa_id", "")
                message_text = data.get("entry", [{}])[0].get("changes", [{}])[0].get("value", {}).get("messages", [{}])[0].get("text", {}).get("body", "")

                # Adiciona a mensagem à conversa
                if phone_number not in self.conversations:
                    self.conversations[phone_number] = []
                self.conversations[phone_number].append({"text": message_text, "from": "cliente"})
                self.save_conversation(phone_number)

                # Envia a mensagem para o Qwen
                qwen_response = self.ask_qwen(message_text)
                if qwen_response:
                    # Salva a resposta do Qwen na conversa
                    self.conversations[phone_number].append({"text": qwen_response, "from": "seller"})
                    self.save_conversation(phone_number)

                    # Envia a resposta do Qwen de volta ao WhatsApp
                    self.send_message_to_whatsapp(phone_number, qwen_response)
                    print(f"Mensagem do Qwen enviada para {phone_number}: {qwen_response}")
                else:
                    print("Falha ao obter resposta do Qwen.")
        except Exception as e:
            print(f"Erro ao processar mensagem: {str(e)}")

    def send_message_to_whatsapp(self, to_number, message):
        try:
            url = f"https://graph.facebook.com/v16.0/{self.PHONE_NUMBER_ID}/messages"
            headers = {
                "Authorization": f"Bearer {self.WHATSAPP_TOKEN}",
                "Content-Type": "application/json"
            }
            payload = {
                "messaging_product": "whatsapp",
                "to": to_number,
                "type": "text",
                "text": {
                    "body": message
                }
            }
            response = requests.post(url, json=payload, headers=headers)
            if response.status_code == 200:
                print(f"Mensagem enviada com sucesso para {to_number}: {message}")
                # Armazena a mensagem enviada no histórico
                if to_number not in self.conversations:
                    self.conversations[to_number] = []
                self.conversations[to_number].append({"text": message, "from": "seller"})
                # Salva a conversa no disco
                self.save_conversation(to_number)
                return True
            else:
                print(f"Falha ao enviar mensagem para {to_number}: {response.text}")
                return False
        except Exception as e:
            print(f"Erro ao enviar mensagem: {str(e)}")
            return False

    def get_conversation_history(self, phone_number):
        return self.conversations.get(phone_number, [])