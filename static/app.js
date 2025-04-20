/** 
 * app.js
 * 
 * Principal módulo da aplicação
 * Contém o objeto global App e funções principais
 */

// Objeto global que será usado pelos event handlers
window.App = {
    // Estado da aplicação
    currentPhone: null,
    currentConversation: null,
    mediaType: null,
    mediaInfo: null,
    currentLocation: null,
    isSubmitting: false,
    settings: {}, // Adicione esta linha para inicializar settings
    
    // Inicialização da aplicação - ponto central para todos os módulos
    init: function() {
        console.log("Inicializando WhatsApp Web Admin");
        
        // Configura o evento de tecla nos campos de mensagem
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keydown', function(e) {
                // Envia ao pressionar Enter (sem Shift)
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    App.sendMessage();
                }
                
                // Exibe o menu de comandos ao digitar / (e não tiver nada antes)
                if (e.key === '/' && this.selectionStart === 0) {
                    App.showCommandMenu && App.showCommandMenu();
                }
            });
            
            // Monitora a digitação para ocultar o menu de comandos se necessário
            messageInput.addEventListener('input', function() {
                if (this.value.length > 0 && !this.value.startsWith('/')) {
                    App.hideCommandMenu && App.hideCommandMenu();
                }
            });
        }
        
        // Configura o filtro de busca
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', this.filterConversations);
        }
        
        // Configura handler para botão de envio
        const sendButton = document.getElementById('send-button');
        if (sendButton) {
            sendButton.addEventListener('click', this.sendMessage);
        }
        
        // Adicionamos um handler para o evento beforeunload para limpar recursos
        window.addEventListener('beforeunload', function() {
            // Limpa qualquer stream de áudio ou gravação em andamento
            App.stopAudioStream && App.stopAudioStream();
            
            // Limpa timers e intervalos
            clearInterval(App.recordingTimer);
            
            // Salva scroll e outras configurações se houver persistência
            App.persistenceHandler && App.persistenceHandler.saveScrollPositions();
        });

        // Inicializa módulos independentes
        this.initializeModules();
    },
    SSEMessageHandler: function(options) {
        this.options = options || {};
        
        // Método para conectar ao servidor SSE
        this.connect = function() {
            console.log("Conectando ao servidor SSE...");
            
            try {
                // Recupera o ID de cliente do localStorage ou cria um novo
                let clientId = localStorage.getItem('sse_client_id');
                if (!clientId) {
                    clientId = this.generateUUID();
                    localStorage.setItem('sse_client_id', clientId);
                }
                
                // Verifica se o endpoint está disponível antes de conectar
                fetch('/events/status')
                    .then(response => response.json())
                    .then(data => {
                        if (data.status === 'online') {
                            // Inicia a conexão SSE
                            this.connectSSE(clientId);
                        } else {
                            console.log("Servidor SSE não está disponível");
                            window.dispatchEvent(new Event('sse-disconnected'));
                        }
                    })
                    .catch(error => {
                        console.error("Erro ao verificar status do servidor SSE:", error);
                        window.dispatchEvent(new Event('sse-disconnected'));
                    });
            } catch (error) {
                console.error("Erro ao conectar ao SSE:", error);
                window.dispatchEvent(new Event('sse-disconnected'));
            }
        };
        
        // Método auxiliar para conectar ao SSE
        this.connectSSE = function(clientId) {
            try {
                // Inicia a conexão SSE
                const evtSource = new EventSource(`/events?client_id=${clientId}`);
                
                // Configura handlers para eventos
                evtSource.addEventListener("connected", (event) => {
                    const data = JSON.parse(event.data);
                    console.log("Conectado ao servidor SSE com ID:", data.client_id);
                    this.sseConnected = true;
                    
                    // Dispara evento de conexão
                    window.dispatchEvent(new Event('sse-connected'));
                });
                
                // Evento de nova mensagem
                evtSource.addEventListener("new_message", (event) => {
                    const data = JSON.parse(event.data);
                    console.log("Nova mensagem recebida:", data);
                    
                    // Processa a mensagem
                    if (App.notificationManager) {
                        App.notificationManager.handleNewMessage(data);
                    }
                });
                
                // Evento de heartbeat (manter conexão viva)
                evtSource.addEventListener("heartbeat", () => {
                    console.log("Heartbeat recebido do servidor SSE");
                });
                
                // Tratamento de erros
                evtSource.onerror = (error) => {
                    console.error("Erro na conexão SSE:", error);
                    this.sseConnected = false;
                    
                    // Dispara evento de desconexão
                    window.dispatchEvent(new Event('sse-disconnected'));
                    
                    // Tentar reconectar após um tempo
                    setTimeout(() => {
                        if (!this.sseConnected) {
                            console.log("Tentando reconectar ao servidor SSE...");
                            this.connect();
                        }
                    }, 5000);
                };
                
                // Armazena a referência para poder fechar depois
                this.evtSource = evtSource;
                this.sseConnected = true;
            } catch (error) {
                console.error("Erro ao conectar ao SSE:", error);
                this.sseConnected = false;
                window.dispatchEvent(new Event('sse-disconnected'));
            }
        };
        
        // Método para desconectar do servidor SSE
        this.disconnect = function() {
            if (this.evtSource) {
                console.log("Desconectando do servidor SSE");
                this.evtSource.close();
                this.evtSource = null;
            }
        };
        
        // Método auxiliar para gerar UUID
        this.generateUUID = function() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };
        
        return this;
    },
    // Inicializa todos os módulos externos
    initializeModules: function() {
        // Os módulos devem se registrar automaticamente ao serem carregados
        // Esta função serve para inicializações adicionais ou verificações
        console.log("Verificando inicialização de módulos...");
        
        // Verifica se o módulo de notificações foi inicializado
        if (!this.notificationManager) {
            console.warn("Módulo de notificações não inicializado!");
        }
        
        // Verifica se o módulo de persistência foi inicializado
        if (!this.persistenceHandler) {
            console.warn("Módulo de persistência não inicializado!");
        }
        
        // Verifica se o módulo de comandos foi inicializado
        if (!this.commandManager && this.registerCommand) {
            // Registra comandos básicos se o módulo estiver disponível
            this.registerCommand('ajuda', {
                description: 'Mostra todos os comandos disponíveis',
                handler: () => this.showAllCommands && this.showAllCommands()
            });
        }
    },
    
    // Função para filtrar conversas baseado na busca
    filterConversations: function() {
        const searchText = document.getElementById('search-input').value.toLowerCase();
        const conversations = document.querySelectorAll('.conversation-item');
        
        conversations.forEach(convo => {
            const name = convo.querySelector('.name').textContent.toLowerCase();
            const phone = convo.querySelector('.phone').textContent.toLowerCase();
            
            if (name.includes(searchText) || phone.includes(searchText)) {
                convo.style.display = 'flex';
            } else {
                convo.style.display = 'none';
            }
        });
    },
    
    // Inicia uma nova conversa com um número específico
    startNewConversation: function() {
        const phoneInput = document.getElementById('new-number');
        const phoneNumber = phoneInput.value.trim();
        
        if (!phoneNumber) {
            this.showNotification("Digite um número de telefone!", true);
            return;
        }
        
        // Verifica se a conversa já existe
        const existingConvo = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
        if (existingConvo) {
            // Se já existe, apenas carrega
            this.loadConversation(phoneNumber);
            phoneInput.value = '';
            return;
        }
        
        // Atualiza o estado da aplicação
        this.currentPhone = phoneNumber;
        
        // Limpa a entrada
        phoneInput.value = '';
        
        // Inicia a conversa (enviando uma mensagem inicial)
        const messageInput = document.getElementById('message-input');
        messageInput.value = "Olá! Estou iniciando uma nova conversa.";
        
        // Envia a mensagem
        this.sendMessage();
    },

    // Método unificado para atualizar o estado da aplicação
    updateAppState: function(phoneNumber, conversationData) {
        // Atualiza o estado interno de maneira consistente
        this.currentPhone = phoneNumber;
        this.currentConversation = conversationData;
        
        // Notifica outros módulos sobre a mudança de estado
        if (this.persistenceHandler) {
            this.persistenceHandler.saveCurrentConversation(phoneNumber);
        }
        
        // Atualiza a interface
        this.updateConversationHeader(conversationData);
    },

    // Função para mostrar notificações na interface
    showNotification: function(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = 'notification' + (isError ? ' error' : '');
        notification.innerHTML = `<i class="fas fa-${isError ? 'exclamation-circle' : 'check-circle'}"></i> ${message}`;
        document.body.appendChild(notification);
        
        // Remove a notificação após alguns segundos
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    },

    // Função para determinar se uma URL é do GCS
    isGcsUrl: function(url) {
        return url && (
            url.includes('storage.googleapis.com') || 
            url.includes('storage.cloud.google.com')
        );
    },
    
    // Função para obter a URL completa (local ou GCS)
    getMediaUrl: function(mediaPath) {
        // Verificar se o caminho é nulo ou vazio
        if (!mediaPath) {
            console.log("Aviso: Caminho de mídia nulo ou vazio");
            return ''; // Retorna uma string vazia para evitar erros
        }
        
        // Se já for uma URL completa do GCS, usa ela diretamente
        if (this.isGcsUrl(mediaPath)) {
            return mediaPath;
        }
        
        // Se for um caminho relativo
        if (typeof mediaPath === 'string') {
            // Verifica se começa com /media/ e remove se necessário
            if (mediaPath.startsWith('/media/')) {
                mediaPath = mediaPath.substring(7);
            }
            
            // Tenta localizar no GCS primeiro
            const bucketName = 'aerial-acre-455118-a9-media';
            return `https://storage.googleapis.com/${bucketName}/${mediaPath}`;
        }
        
        // Fallback para o caminho local
        return `/media/${mediaPath}`;
    },

    // Carrega uma conversa do servidor
    loadConversation: function(phone) {
        console.log("Carregando conversa:", phone);
        
        fetch('/conversation/' + phone)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro ao carregar conversa: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Atualiza o estado da aplicação
                this.updateAppState(phone, data);
                
                // Renderiza as mensagens
                this.renderConversationMessages(data);
                
                // Marca a conversa ativa na lista
                document.querySelectorAll('.conversation-item').forEach(item => {
                    item.classList.remove('active');
                    if (item.getAttribute('data-phone') === phone) {
                        item.classList.add('active');
                    }
                });
                
                // Inscreve-se para atualizações em tempo real
                if (this.notificationManager) {
                    this.notificationManager.subscribeToPhone(phone);
                }
                
                // Marca as mensagens como lidas
                this.markMessagesAsRead(phone);
            })
            .catch(error => {
                console.error("Erro ao carregar conversa:", error);
                this.showNotification("Erro ao carregar conversa: " + error.message, true);
            });
    },

    // Renderiza as mensagens da conversa
    renderConversationMessages: function(conversation) {
        // Área de mensagens principal
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;
        
        // Limpa a área de mensagens
        messageArea.innerHTML = '';
        
        // Verifica se há mensagens
        if (!conversation.messages || conversation.messages.length === 0) {
            messageArea.innerHTML = '<div class="empty-state">Nenhuma mensagem encontrada</div>';
            
            // Limpa também a área de IA
            const aiMessageArea = document.getElementById('ai-message-area');
            if (aiMessageArea) {
                aiMessageArea.innerHTML = '<div class="empty-state">Nenhuma interação com a IA ainda</div>';
            }
            return;
        }
        
        // Se houver muitas mensagens, usar renderização otimizada
        if (conversation.messages.length > 50) {
            this.renderOptimizedMessages(conversation, 50);
        } else {
            // Renderiza cada mensagem
            conversation.messages.forEach(msg => {
                const messageElement = this.createMessageElement(msg);
                messageArea.appendChild(messageElement);
            });
            
            // Rola para a última mensagem
            messageArea.scrollTop = messageArea.scrollHeight;
        }
        
        // Atualiza área de mensagens da IA
        this.updateAIMessages(conversation);
    },
    
    // Atualiza o cabeçalho da conversa
    updateConversationHeader: function(conversation) {
        // Atualiza nome do contato
        const nameElement = document.getElementById('current-contact-name');
        if (nameElement) {
            nameElement.textContent = conversation.name || "Cliente";
        }
        
        // Atualiza avatar do contato
        const avatarElement = document.getElementById('current-contact-avatar');
        if (avatarElement) {
            if (conversation.profile_pic) {
                avatarElement.innerHTML = `<img src="${this.getMediaUrl(conversation.profile_pic)}" alt="${conversation.name || 'Cliente'}">`;
            } else {
                const initial = ((conversation.name || 'Cliente')[0] || '?').toUpperCase();
                avatarElement.innerHTML = `<div class="avatar-placeholder">${initial}</div>`;
            }
        }
        
        // Atualiza botão de modo
        const modeButton = document.getElementById('toggle-mode-btn');
        if (modeButton) {
            modeButton.style.display = 'inline-block';
            modeButton.className = conversation.mode === 'human' ? 'human-mode' : 'auto-mode';
            modeButton.innerHTML = conversation.mode === 'human' ? 
                '<i class="fas fa-user"></i> Modo Humano' : 
                '<i class="fas fa-robot"></i> Modo Automático';
        }
        
        // Atualiza botão de compartilhamento
        const shareButton = document.getElementById('share-conversation-btn');
        if (shareButton) {
            shareButton.style.display = 'inline-block';
        }
    },

    // Renderização otimizada para conversas longas
    renderOptimizedMessages: function(conversation, limit = 50) {
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;
        
        // Limpa a área de mensagens
        messageArea.innerHTML = '';
        
        // Verifica se há mensagens
        if (!conversation.messages || conversation.messages.length === 0) {
            messageArea.innerHTML = '<div class="empty-state">Nenhuma mensagem encontrada</div>';
            return;
        }
        
        // Pega apenas as últimas 'limit' mensagens
        const messages = conversation.messages.slice(-limit);
        
        // Renderiza cada mensagem
        messages.forEach(msg => {
            const messageElement = this.createMessageElement(msg);
            messageArea.appendChild(messageElement);
        });
        
        // Adiciona botão "Carregar mais" se houver mais mensagens
        if (conversation.messages.length > limit) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.className = 'load-more-btn';
            loadMoreButton.textContent = 'Carregar mensagens anteriores';
            loadMoreButton.onclick = () => this.loadMoreMessages(conversation, limit);
            
            const loadMoreContainer = document.createElement('div');
            loadMoreContainer.className = 'load-more-container';
            loadMoreContainer.appendChild(loadMoreButton);
            
            messageArea.insertBefore(loadMoreContainer, messageArea.firstChild);
        }
        
        // Rola para a última mensagem
        messageArea.scrollTop = messageArea.scrollHeight;
    },
    
    // Carrega mais mensagens para conversas longas
    loadMoreMessages: function(conversation, pageSize = 50) {
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;
        
        // Número atual de mensagens
        const currentCount = messageArea.querySelectorAll('.message').length;
        
        // Próximo lote de mensagens
        const startIndex = Math.max(0, conversation.messages.length - currentCount - pageSize);
        const endIndex = conversation.messages.length - currentCount;
        const nextMessages = conversation.messages.slice(startIndex, endIndex);
        
        // Remove o botão "Carregar mais" existente
        const loadMoreContainer = messageArea.querySelector('.load-more-container');
        if (loadMoreContainer) {
            loadMoreContainer.remove();
        }
        
        // Adiciona as novas mensagens no início
        nextMessages.forEach(msg => {
            const messageElement = this.createMessageElement(msg);
            messageArea.insertBefore(messageElement, messageArea.firstChild);
        });
        
        // Adiciona o botão novamente se ainda houver mais mensagens
        if (startIndex > 0) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.className = 'load-more-btn';
            loadMoreButton.textContent = 'Carregar mensagens anteriores';
            loadMoreButton.onclick = () => this.loadMoreMessages(conversation, pageSize);
            
            const newLoadMoreContainer = document.createElement('div');
            newLoadMoreContainer.className = 'load-more-container';
            newLoadMoreContainer.appendChild(loadMoreButton);
            
            messageArea.insertBefore(newLoadMoreContainer, messageArea.firstChild);
        }
    },

    // Marca as mensagens como lidas
    markMessagesAsRead: function(phone) {
        fetch(`/mark_read/${phone}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            console.log(`Mensagens para ${phone} marcadas como lidas:`, data);
            
            // Atualiza contadores locais se o gerenciador de notificações estiver disponível
            if (this.notificationManager) {
                this.notificationManager.unreadCounts[phone] = 0;
                this.notificationManager.updateTotalUnreadCount();
                this.notificationManager.updateConversationBadge(phone, 0);
            }
        })
        .catch(error => {
            console.error(`Erro ao marcar mensagens como lidas para ${phone}:`, error);
        });
    },

    // Método auxiliar para criar elemento de mensagem
    createMessageElement: function(msg) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${msg.from}`;
        
        // Adiciona ID da mensagem como atributo se existir
        if (msg.id) {
            messageElement.dataset.messageId = msg.id;
        }
        
        // Adiciona classe de status se for uma mensagem enviada por nós
        if ((msg.from === 'vendedor' || msg.from === 'qwen') && msg.status) {
            messageElement.classList.add(`status-${msg.status}`);
        }
        
        // Conteúdo da mensagem
        let content = '';
        switch(msg.type) {
            case 'text':
                content = `<div class="message-text">${msg.content}</div>`;
                break;
            case 'image':
                const imageUrl = this.getMediaUrl(msg.media_url);
                content = `
                    <div class="message-media">
                        <img src="${imageUrl}" alt="Imagem" onclick="App.zoomImage('${imageUrl}')">
                    </div>
                    ${msg.content ? `<div class="message-caption">${msg.content}</div>` : ''}
                `;
                break;
            case 'audio':
                const audioUrl = this.getMediaUrl(msg.media_url);
                content = `
                    <div class="message-media">
                        <audio controls src="${audioUrl}"></audio>
                    </div>
                    ${msg.content ? `<div class="message-caption">${msg.content}</div>` : ''}
                `;
                break;
            case 'video':
                const videoUrl = this.getMediaUrl(msg.media_url);
                content = `
                    <div class="message-media">
                        <video controls src="${videoUrl}"></video>
                    </div>
                    ${msg.content ? `<div class="message-caption">${msg.content}</div>` : ''}
                `;
                break;
            case 'document':
                const docUrl = this.getMediaUrl(msg.media_url);
                const fileName = msg.media_url.split('/').pop();
                content = `
                    <div class="message-document">
                        <a href="${docUrl}" class="document-link" target="_blank">
                            <i class="fas fa-file"></i> ${fileName}
                        </a>
                    </div>
                    ${msg.content ? `<div class="message-caption">${msg.content}</div>` : ''}
                `;
                break;
            case 'location':
                content = `
                    <div class="message-location">
                        <img src="https://maps.googleapis.com/maps/api/staticmap?center=${msg.latitude},${msg.longitude}&zoom=13&size=300x150&markers=color:red%7C${msg.latitude},${msg.longitude}" 
                          alt="Localização" onclick="App.openLocation(${msg.latitude}, ${msg.longitude})">
                        <div class="location-caption">
                            <i class="fas fa-map-marker-alt"></i> Localização
                        </div>
                    </div>
                `;
                break;
        }
        
        // Prepara o html da mensagem
        let messageHtml = `
            <div class="message-options">
                <button class="options-btn" onclick="App.showMessageOptions(event, '${msg.id || ''}')">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
            ${content}
            <div class="message-time">${msg.timestamp || ''}`;
            
        // Adiciona ícone de status para mensagens enviadas
        if ((msg.from === 'vendedor' || msg.from === 'qwen') && msg.status) {
            let statusIcon = '';
            switch(msg.status) {
                case 'sending':
                    statusIcon = '<i class="fas fa-clock"></i>';
                    break;
                case 'sent':
                    statusIcon = '<i class="fas fa-check"></i>';
                    break;
                case 'delivered':
                    statusIcon = '<i class="fas fa-check-double"></i>';
                    break;
                case 'failed':
                    statusIcon = '<i class="fas fa-exclamation-triangle"></i>';
                    break;
            }
            messageHtml += `<div class="message-status">${statusIcon}</div>`;
        }
        
        // Fecha a div de hora
        messageHtml += `</div>`;
        
        messageElement.innerHTML = messageHtml;
        return messageElement;
    },

    // Método auxiliar para criar elemento de mensagem da IA
    createAIMessageElement: function(msg) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${msg.from}`;
        
        // Conteúdo da mensagem simplificado
        let content = msg.type === 'text' 
            ? `<div class="message-text">${msg.content}</div>` 
            : `<div class="message-text">[${msg.type.toUpperCase()}] ${msg.content || ''}</div>`;

        messageElement.innerHTML = `
            ${content}
            <div class="message-time">${msg.timestamp || ''}</div>
        `;

        return messageElement;
    },
    
    // Atualiza a área de mensagens da IA
    updateAIMessages: function(conversation) {
        const aiMessageArea = document.getElementById('ai-message-area');
        if (!aiMessageArea) return;
        
        // Filtra mensagens relevantes para a IA
        const aiInteractions = conversation.messages.filter(msg => 
            msg.from === 'cliente' || msg.from === 'qwen' || msg.from === 'deepseek'
        );
        
        // Limpa a área
        aiMessageArea.innerHTML = '';
        
        // Verifica se há mensagens
        if (!aiInteractions || aiInteractions.length === 0) {
            aiMessageArea.innerHTML = '<div class="empty-state">Nenhuma interação com a IA ainda</div>';
            return;
        }
        
        // Renderiza cada mensagem
        aiInteractions.forEach(msg => {
            const messageElement = this.createAIMessageElement(msg);
            aiMessageArea.appendChild(messageElement);
        });
        
        // Rola para a última mensagem
        aiMessageArea.scrollTop = aiMessageArea.scrollHeight;
    },
    
    // Método unificado para enviar mensagens
    sendMessage: function() {
        // Bloqueia múltiplos envios
        if (this.isSubmitting) return;
        this.isSubmitting = true;
    
        if (!this.currentPhone) {
            this.showNotification("Selecione uma conversa primeiro!", true);
            this.isSubmitting = false;
            return;
        }
        
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (!message && !this.mediaInfo) {
            this.showNotification("Digite uma mensagem ou selecione uma mídia!", true);
            this.isSubmitting = false;
            return;
        }
        
        const data = {
            to_number: this.currentPhone,
            message: message
        };
        
        if (this.mediaInfo) {
            data.media_path = this.mediaInfo.path;
            data.media_type = this.mediaInfo.type;
        }
        
        // Desabilita o botão durante o envio
        const sendButton = document.getElementById('send-button');
        sendButton.disabled = true;
        
        // Feedback visual imediato
        if (this.notificationManager && this.notificationManager.addTemporaryMessage) {
            this.notificationManager.addTemporaryMessage(message, this.mediaInfo);
        }
        
        // Limpa o campo de mensagem para interface responsiva
        messageInput.value = '';
        
        // Envia a requisição
        fetch('/send_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao enviar mensagem");
            }
            return response.json();
        })
        .then(result => {
            // Limpa a mídia após envio bem-sucedido
            this.mediaInfo = null;
            
            // Remove mensagens temporárias (caso ainda existam)
            document.querySelectorAll('.temp-message').forEach(el => el.remove());
            
            console.log("Mensagem enviada com sucesso");
        })
        .catch(error => {
            console.error("Erro:", error);
            this.showNotification("Não foi possível enviar a mensagem", true);
            
            // Remove mensagens temporárias em caso de erro
            document.querySelectorAll('.temp-message').forEach(el => el.remove());
            
            // Restaura a mensagem não enviada no campo
            messageInput.value = message;
        })
        .finally(() => {
            this.isSubmitting = false;
            sendButton.disabled = false;
        });
    },

    // Função para atualizar o estado da aplicação e interface
    updateAppStatus: function(status, message = '') {
        const statusIndicator = document.getElementById('app-status-indicator') || 
            (() => {
                const indicator = document.createElement('div');
                indicator.id = 'app-status-indicator';
                indicator.className = 'status-indicator';
                document.body.appendChild(indicator);
                return indicator;
            })();
        
        statusIndicator.className = 'status-indicator ' + status;
        statusIndicator.innerHTML = message;
        
        // Esconde após alguns segundos para mensagens temporárias
        if (status !== 'offline' && status !== 'connecting') {
            setTimeout(() => {
                statusIndicator.className = 'status-indicator hidden';
            }, 3000);
        }
    },

    // Abre diálogo de confirmação para deletar conversa
    confirmDeleteConversation: function(phone) {
        if (confirm("Tem certeza que deseja apagar esta conversa?")) {
            fetch(`/delete_conversation/${phone}`, {
                method: 'POST'
            })
            .then(response => {
                if (!response.ok) {
                    if (response.status === 404) {
                        // Implementação temporária (caso a rota backend não exista ainda)
                        const convoItem = document.querySelector(`.conversation-item[data-phone="${phone}"]`);
                        if (convoItem) convoItem.remove();
                        
                        if (phone === this.currentPhone) {
                            this.currentPhone = null;
                            this.currentConversation = null;
                            document.getElementById('message-area').innerHTML = 
                                '<div class="empty-state">Selecione uma conversa para ver as mensagens</div>';
                            document.getElementById('ai-message-area').innerHTML = 
                                '<div class="empty-state">Informações da IA aparecerão aqui quando uma conversa estiver ativa</div>';
                            document.getElementById('toggle-mode-btn').style.display = 'none';
                            document.getElementById('current-contact-name').textContent = 'Selecione uma conversa';
                            document.getElementById('current-contact-avatar').innerHTML = '<div class="avatar-placeholder">?</div>';
                            
                            // Esconde o botão de compartilhar
                            const shareButton = document.getElementById('share-conversation-btn');
                            if (shareButton) shareButton.style.display = 'none';
                        }
                        
                        this.showNotification("Conversa removida com sucesso!");
                        return new Promise(resolve => resolve({}));
                    }
                    throw new Error("Erro ao apagar conversa: " + response.statusText);
                }
                return response.json();
            })
            .then(data => {
                if (!data.status || data.status === 'success') {
                    // Remove o elemento da lista
                    const convoItem = document.querySelector(`.conversation-item[data-phone="${phone}"]`);
                    if (convoItem) convoItem.remove();
                    
                    // Se era a conversa atual, limpa a área de mensagens
                    if (phone === this.currentPhone) {
                        this.currentPhone = null;
                        this.currentConversation = null;
                        document.getElementById('message-area').innerHTML = 
                            '<div class="empty-state">Selecione uma conversa para ver as mensagens</div>';
                        document.getElementById('ai-message-area').innerHTML = 
                            '<div class="empty-state">Informações da IA aparecerão aqui quando uma conversa estiver ativa</div>';
                        document.getElementById('toggle-mode-btn').style.display = 'none';
                        document.getElementById('current-contact-name').textContent = 'Selecione uma conversa';
                        document.getElementById('current-contact-avatar').innerHTML = '<div class="avatar-placeholder">?</div>';
                        
                        // Esconde o botão de compartilhar
                        const shareButton = document.getElementById('share-conversation-btn');
                        if (shareButton) shareButton.style.display = 'none';
                    }
                    
                    this.showNotification("Conversa apagada com sucesso!");
                } else {
                    this.showNotification("Erro ao apagar conversa: " + (data.message || "Erro desconhecido"), true);
                }
            })
            .catch(error => {
                console.error("Erro ao apagar conversa:", error);
                this.showNotification("Erro ao apagar conversa: " + error.message, true);
            });
        }
    },
    
    // Detecta se o dispositivo é móvel
    isMobile: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    // Abre uma imagem em tamanho ampliado
    zoomImage: function(imageUrl) {
        // Usa a função getMediaUrl para garantir URL correta
        imageUrl = this.getMediaUrl(imageUrl);
        
        // Cria um modal para mostrar a imagem ampliada
        const modal = document.createElement('div');
        modal.className = 'modal zoom-modal';
        modal.innerHTML = `
            <div class="modal-content image-zoom">
                <span class="close" onclick="App.closeModal()">&times;</span>
                <img src="${imageUrl}" alt="Imagem ampliada">
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        // Fecha o modal ao clicar fora da imagem
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                App.closeModal();
            }
        });
    },
    
    // Fecha qualquer modal aberto
    closeModal: function() {
        const mediaUploadModal = document.getElementById('media-upload-modal');
        if (mediaUploadModal) {
            mediaUploadModal.style.display = 'none';
        }
        
        // Fecha também outros modais que possam estar abertos
        const allModals = document.querySelectorAll('.modal');
        allModals.forEach(modal => {
            if (modal.id !== 'media-upload-modal') {
                modal.remove();
            } else {
                modal.style.display = 'none';
            }
        });
        
        // Limpa menus de comandos
        if(this.hideCommandMenu) {
            this.hideCommandMenu();
        }
    },
    
    // Função unificada para atualizar mensagens de conversa
    updateConversationMessages: function(phoneNumber, newMessage) {
        // Verifica se é a conversa atual
        if (this.currentPhone !== phoneNumber) return;
        
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;
        
        // Se não tiver uma mensagem específica, atualiza a conversa inteira
        if (!newMessage) {
            // Busca os dados atualizados da conversa
            fetch(`/conversation/${phoneNumber}`)
                .then(response => response.json())
                .then(data => {
                    // Atualiza o objeto de conversa atual
                    this.updateAppState(phoneNumber, data);
                    
                    // Renderiza as mensagens
                    this.renderConversationMessages(data);
                })
                .catch(error => {
                    console.error("Erro ao atualizar mensagens:", error);
                    this.showNotification("Erro ao atualizar mensagens", true);
                });
            return;
        }
        
        // Verifica se está no final da área de mensagens (para decidir se deve rolar)
        const wasAtBottom = messageArea.scrollHeight - messageArea.scrollTop <= messageArea.clientHeight + 50;
        
        // Procura mensagem existente pelo ID
        let existingMessage = null;
        if (newMessage.id) {
            existingMessage = messageArea.querySelector(`.message[data-message-id="${newMessage.id}"]`);
        }
        
        if (existingMessage) {
            // Atualiza mensagem existente (ex: status)
            if (newMessage.status) {
                // Remove classes de status anteriores
                existingMessage.classList.remove('status-sending', 'status-sent', 'status-delivered', 'status-failed');
                
                // Adiciona a nova classe de status
                existingMessage.classList.add(`status-${newMessage.status}`);
                
                // Atualiza o ícone de status
                let statusIcon = existingMessage.querySelector('.message-status');
                if (statusIcon) {
                    switch (newMessage.status) {
                        case 'sending':
                            statusIcon.innerHTML = '<i class="fas fa-clock"></i>';
                            break;
                        case 'sent':
                            statusIcon.innerHTML = '<i class="fas fa-check"></i>';
                            break;
                        case 'delivered':
                            statusIcon.innerHTML = '<i class="fas fa-check-double"></i>';
                            break;
                        case 'failed':
                            statusIcon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                            break;
                    }
                }
            }
        } else {
            // Adiciona nova mensagem
            const messageElement = this.createMessageElement(newMessage);
            messageArea.appendChild(messageElement);
            
            // Remove qualquer mensagem temporária com o mesmo conteúdo
            document.querySelectorAll('.temp-message').forEach(el => {
                if (el.querySelector('.message-text')?.textContent === newMessage.content) {
                    el.remove();
                }
            });
            
            // Atualiza o objeto da conversa atual
            if (this.currentConversation && this.currentConversation.messages) {
                this.currentConversation.messages.push(newMessage);
            }
            
            // Atualiza área de IA se necessário
            if (newMessage.from === 'cliente' || newMessage.from === 'qwen' || newMessage.from === 'deepseek') {
                const aiMessageArea = document.getElementById('ai-message-area');
                if (aiMessageArea) {
                    const aiMessageElement = this.createAIMessageElement(newMessage);
                    aiMessageArea.appendChild(aiMessageElement);
                    aiMessageArea.scrollTop = aiMessageArea.scrollHeight;
                }
            }
            
            // Rola para a nova mensagem se estava no final
            if (wasAtBottom) {
                messageArea.scrollTop = messageArea.scrollHeight;
            }
        }
    }

}; // Chave de fechamento do objeto App

// Inicializa a aplicação quando o DOM estiver carregado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init.bind(App));
} else {
    App.init();
}