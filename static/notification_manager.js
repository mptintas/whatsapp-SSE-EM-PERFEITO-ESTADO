/**
 * notification_manager.js
 * 
 * Módulo responsável pelo gerenciamento de notificações e estados de leitura
 * Integra-se com o sistema SSE para atualizações em tempo real
 */

(function(App) {
    // Classe principal para gerenciamento de notificações
    class NotificationManager {
        constructor() {
            // Estado interno
            this.unreadCounts = {};           // Contador de mensagens não lidas por conversa
            this.totalUnreadCount = 0;        // Contador total de mensagens não lidas
            this.originalTitle = document.title; // Título original da página
            this.notificationsEnabled = false;   // Estado de permissão para notificações
            this.pageVisible = true;            // Estado de visibilidade da página
            this.titleInterval = null;          // Intervalo para alternar o título
            this.connected = false;             // Estado da conexão SSE
            this.reconnecting = false;          // Flag para controlar reconexões
            this.eventQueue = [];               // Fila de eventos pendentes
            
            // Inicialização
            this.init();
        }
        
        // Inicializa o gerenciador de notificações
        init() {
            console.log("Inicializando gerenciador de notificações...");
            
            // Verificar suporte a notificações
            this.checkNotificationSupport();
            
            // Monitorar visibilidade da página
            this.setupVisibilityTracking();
            
            // Estender métodos do App
            this.extendAppMethods();
            
            // Conectar ao serviço SSE
            this.connectToSSE();
            
            // Carregar contadores de mensagens não lidas
            this.loadUnreadCounts();
        }
        
        // Verifica se o navegador suporta notificações e solicita permissão
        checkNotificationSupport() {
            if (!("Notification" in window)) {
                console.log("Este navegador não suporta notificações desktop");
                return;
            }
            
            // Se já temos permissão
            if (Notification.permission === "granted") {
                this.notificationsEnabled = true;
                console.log("Notificações já estão habilitadas");
            } 
            // Se ainda não pedimos permissão
            else if (Notification.permission !== "denied") {
                Notification.requestPermission().then(permission => {
                    this.notificationsEnabled = (permission === "granted");
                    console.log("Permissão de notificações:", permission);
                });
            }
        }
        
        // Configura o monitoramento de visibilidade da página
        setupVisibilityTracking() {
            // Eventos de visibilidade
            document.addEventListener("visibilitychange", () => {
                this.pageVisible = !document.hidden;
                
                // Se a página ficar visível, parar a alternância do título
                if (this.pageVisible) {
                    this.stopTitleNotification();
                    
                    // Se temos uma conversa ativa, marcar como lida
                    if (App.currentPhone) {
                        this.markAsRead(App.currentPhone);
                    }
                }
            });
            
            // Eventos de foco da janela
            window.addEventListener("focus", () => {
                this.pageVisible = true;
                this.stopTitleNotification();
                
                // Se temos uma conversa ativa, marcar como lida
                if (App.currentPhone) {
                    this.markAsRead(App.currentPhone);
                }
            });
            
            window.addEventListener("blur", () => {
                this.pageVisible = false;
            });
            
            console.log("Monitoramento de visibilidade configurado");
        }
        
        // Método para conectar ao serviço SSE
        connectToSSE() {
            try {
                // Recupera o ID de cliente do localStorage ou cria um novo
                let clientId = localStorage.getItem('sse_client_id');
                if (!clientId) {
                    clientId = this.generateUUID();
                    localStorage.setItem('sse_client_id', clientId);
                }
                
                console.log("Conectando ao servidor SSE com ID:", clientId);
                
                // Inicia a conexão SSE
                const eventSource = new EventSource(`/events?client_id=${clientId}`);
                
                // Configura handlers para eventos
                eventSource.addEventListener("connected", (event) => {
                    const data = JSON.parse(event.data);
                    console.log("Conectado ao servidor SSE com ID:", data.client_id);
                    this.connected = true;
                    this.reconnecting = false;
                    
                    // Atualiza o status da aplicação
                    if (App.updateAppStatus) {
                        App.updateAppStatus('online', 'Conectado ao servidor');
                    }
                    
                    // Se temos uma conversa ativa, inscrever nela
                    if (App.currentPhone) {
                        this.subscribeToPhone(App.currentPhone);
                    }
                    
                    // Dispara evento de conexão estabelecida
                    this.dispatchEvent('sse-connected');
                });
                
                // Evento de nova mensagem
                eventSource.addEventListener("new_message", (event) => {
                    const data = JSON.parse(event.data);
                    this.handleNewMessage(data);
                });
                
                // Evento de atualização de status de mensagem
                eventSource.addEventListener("message_status", (event) => {
                    const data = JSON.parse(event.data);
                    this.updateMessageStatus(data);
                });
                
                // Evento de atualização de conversa
                eventSource.addEventListener("conversation_update", (event) => {
                    const data = JSON.parse(event.data);
                    this.handleConversationUpdate(data);
                });
                
                // Evento de heartbeat (manter conexão viva)
                eventSource.addEventListener("heartbeat", () => {
                    // Apenas para manter a conexão ativa
                    console.log("Heartbeat recebido do servidor SSE");
                });
                
                // Tratamento de erros
                eventSource.onerror = (error) => {
                    console.error("Erro na conexão SSE:", error);
                    this.connected = false;
                    
                    // Atualiza o status da aplicação
                    if (App.updateAppStatus) {
                        App.updateAppStatus('offline', 'Conexão perdida');
                    }
                    
                    // Dispara evento de desconexão
                    this.dispatchEvent('sse-disconnected');
                    
                    // Tentar reconectar após um tempo
                    if (!this.reconnecting) {
                        this.reconnecting = true;
                        setTimeout(() => {
                            if (!this.connected) {
                                console.log("Tentando reconectar ao servidor SSE...");
                                
                                // Fecha a conexão atual antes de tentar uma nova
                                eventSource.close();
                                
                                // Tenta nova conexão
                                this.connectToSSE();
                            }
                            this.reconnecting = false;
                        }, 5000);
                    }
                };
                
                // Armazena a referência para poder fechar depois
                this.eventSource = eventSource;
                
                // Garantir que a conexão seja fechada ao sair da página
                window.addEventListener('beforeunload', () => {
                    if (this.eventSource) {
                        console.log("Fechando conexão SSE");
                        this.eventSource.close();
                    }
                });
            } catch (error) {
                console.error("Erro ao conectar ao SSE:", error);
                
                // Atualiza o status da aplicação
                if (App.updateAppStatus) {
                    App.updateAppStatus('error', 'Erro de conexão');
                }
                
                // Agenda tentativa de reconexão
                if (!this.reconnecting) {
                    this.reconnecting = true;
                    setTimeout(() => {
                        this.connectToSSE();
                        this.reconnecting = false;
                    }, 5000);
                }
            }
        }
        
        // Inscreve-se para receber atualizações de um número específico
        subscribeToPhone(phoneNumber) {
            if (!this.connected) {
                console.log("Não é possível inscrever-se: SSE não conectado");
                // Tenta reconectar se não estiver conectado
                if (!this.reconnecting) {
                    this.reconnecting = true;
                    console.log("Tentando estabelecer conexão SSE...");
                    this.connectToSSE();
                    
                    // Agenda nova tentativa de inscrição após um curto intervalo
                    setTimeout(() => {
                        this.reconnecting = false;
                        this.subscribeToPhone(phoneNumber);
                    }, 1000);
                }
                return;
            }
            
            const clientId = localStorage.getItem('sse_client_id');
            if (!clientId) {
                console.log("Não é possível inscrever-se: ID de cliente não encontrado");
                return;
            }
            
            console.log(`Inscrevendo-se para atualizações do número ${phoneNumber}`);
            
            fetch(`/events/subscribe/${phoneNumber}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ client_id: clientId })
            })
            .then(response => response.json())
            .then(data => {
                console.log(`Inscrito para atualizações do número ${phoneNumber}`);
                
                // Marca mensagens como lidas quando nos inscrevemos
                this.markAsRead(phoneNumber);
            })
            .catch(error => {
                console.error(`Erro ao inscrever no número ${phoneNumber}:`, error);
            });
        }
        
        // Marca mensagens como lidas no servidor
        markAsRead(phoneNumber) {
            // Certifica-se que phoneNumber é uma string válida
            if (!phoneNumber || typeof phoneNumber !== 'string') {
                console.error(`Tentativa de marcar como lido um número inválido: ${phoneNumber}`);
                return;
            }
            
            console.log(`Marcando mensagens como lidas para ${phoneNumber}`);
            
            fetch(`/mark_read/${phoneNumber}`, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // Atualiza o contador local
                    this.unreadCounts[phoneNumber] = 0;
                    this.updateTotalUnreadCount();
                    
                    // Atualiza a interface
                    this.updateConversationBadge(phoneNumber, 0);
                    console.log(`Mensagens marcadas como lidas para ${phoneNumber}`);
                }
            })
            .catch(error => {
                console.error(`Erro ao marcar mensagens como lidas para ${phoneNumber}:`, error);
            });
        }
        
        // Manipula evento de nova mensagem
        handleNewMessage(data) {
            const phoneNumber = data.phone_number;
            const message = data.message;
            
            console.log(`Nova mensagem recebida de ${phoneNumber}:`, message);
            
            // Verifica se a mensagem é de um cliente (não enviada por nós)
            if (message.from === 'cliente') {
                // Incrementa contador de não lidas se não estamos visualizando esta conversa
                if (App.currentPhone !== phoneNumber || !this.pageVisible) {
                    this.incrementUnreadCount(phoneNumber);
                    
                    // Exibe notificação se a página não estiver visível
                    if (!this.pageVisible) {
                        this.showNotification(phoneNumber, message);
                    }
                }
            }
            
            // Atualiza a interface se for a conversa atual
            if (App.currentPhone === phoneNumber) {
                // Usa a função unificada para atualizar mensagens
                if (App.updateConversationMessages) {
                    App.updateConversationMessages(phoneNumber, message);
                } else {
                    console.warn("App.updateConversationMessages não está disponível");
                }
            } else {
                // Atualiza a lista de conversas para mostrar a última mensagem
                this.updateConversationPreview(phoneNumber, message);
            }
        }
        
        // Manipula atualizações de conversa
        handleConversationUpdate(data) {
            const phoneNumber = data.phone_number;
            const updateType = data.update_type;
            const updateData = data.data;
            
            console.log(`Atualização de conversa ${phoneNumber}, tipo: ${updateType}`, updateData);
            
            if (updateType === 'unread_updated') {
                const unreadCount = updateData.unread_count;
                
                // Atualiza o contador local
                this.unreadCounts[phoneNumber] = unreadCount;
                this.updateTotalUnreadCount();
                
                // Atualiza a interface
                this.updateConversationBadge(phoneNumber, unreadCount);
            } else if (updateType === 'mode_updated') {
                // Atualiza o modo da conversa na interface
                if (App.currentPhone === phoneNumber && updateData.mode) {
                    const modeButton = document.getElementById('toggle-mode-btn');
                    if (modeButton) {
                        modeButton.className = updateData.mode === 'human' ? 'human-mode' : 'auto-mode';
                        modeButton.innerHTML = updateData.mode === 'human' ? 
                            '<i class="fas fa-user"></i> Modo Humano' : 
                            '<i class="fas fa-robot"></i> Modo Automático';
                    }
                }
            }
        }
        
        // Manipula eventos de sistema
        handleSystemEvent(data) {
            const eventType = data.type;
            const eventData = data.data;
            
            console.log(`Evento de sistema recebido: ${eventType}`, eventData);
            
            if (eventType === 'conversation_deleted') {
                const phoneNumber = eventData.phone_number;
                
                // Remove conversa da lista se ela for excluída
                const conversationItem = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
                if (conversationItem) {
                    conversationItem.remove();
                }
                
                // Se é a conversa atual, limpa área de mensagens
                if (App.currentPhone === phoneNumber) {
                    App.currentPhone = null;
                    App.currentConversation = null;
                    
                    const messageArea = document.getElementById('message-area');
                    if (messageArea) {
                        messageArea.innerHTML = '<div class="empty-state">Selecione uma conversa para ver as mensagens</div>';
                    }
                    
                    const aiMessageArea = document.getElementById('ai-message-area');
                    if (aiMessageArea) {
                        aiMessageArea.innerHTML = '<div class="empty-state">Informações da IA aparecerão aqui quando uma conversa estiver ativa</div>';
                    }
                    
                    // Oculta botões específicos da conversa
                    const toggleModeBtn = document.getElementById('toggle-mode-btn');
                    if (toggleModeBtn) toggleModeBtn.style.display = 'none';
                    
                    // Limpa informações do contato
                    const contactName = document.getElementById('current-contact-name');
                    if (contactName) contactName.textContent = 'Selecione uma conversa';
                    
                    const contactAvatar = document.getElementById('current-contact-avatar');
                    if (contactAvatar) contactAvatar.innerHTML = '<div class="avatar-placeholder">?</div>';
                }
            }
        }
        
        // Incrementa o contador de mensagens não lidas
        incrementUnreadCount(phoneNumber) {
            if (!this.unreadCounts[phoneNumber]) {
                this.unreadCounts[phoneNumber] = 0;
            }
            
            this.unreadCounts[phoneNumber]++;
            this.updateTotalUnreadCount();
            
            console.log(`Incrementado contador para ${phoneNumber}: ${this.unreadCounts[phoneNumber]}`);
            
            // Atualiza a interface
            this.updateConversationBadge(phoneNumber, this.unreadCounts[phoneNumber]);
            
            // Inicia notificação no título se a página não estiver visível
            if (!this.pageVisible) {
                this.startTitleNotification();
            }
        }
        
        // Atualiza o contador total de mensagens não lidas
        updateTotalUnreadCount() {
            this.totalUnreadCount = Object.values(this.unreadCounts).reduce((total, count) => total + count, 0);
            
            console.log(`Total de mensagens não lidas: ${this.totalUnreadCount}`);
            
            // Atualiza o título da página se necessário
            if (this.totalUnreadCount > 0 && !this.titleInterval) {
                document.title = `(${this.totalUnreadCount}) ${this.originalTitle}`;
            } else if (this.totalUnreadCount === 0 && !this.titleInterval) {
                document.title = this.originalTitle;
            }
        }
        
        // Inicia a notificação no título (alternando)
        startTitleNotification() {
            if (this.titleInterval) return;
            
            console.log("Iniciando notificação no título");
            
            let showCount = true;
            this.titleInterval = setInterval(() => {
                if (showCount) {
                    document.title = `(${this.totalUnreadCount}) ${this.originalTitle}`;
                } else {
                    document.title = this.originalTitle;
                }
                showCount = !showCount;
            }, 1000);
        }
        
        // Para a notificação no título
        stopTitleNotification() {
            if (this.titleInterval) {
                clearInterval(this.titleInterval);
                this.titleInterval = null;
                
                console.log("Notificação no título parada");
                
                // Restaura o título com o contador, se houver mensagens não lidas
                if (this.totalUnreadCount > 0) {
                    document.title = `(${this.totalUnreadCount}) ${this.originalTitle}`;
                } else {
                    document.title = this.originalTitle;
                }
            }
        }
        
        // Exibe uma notificação desktop
        showNotification(phoneNumber, message) {
            if (!this.notificationsEnabled) {
                console.log("Notificações não estão habilitadas");
                return;
            }
            
            // Obtém informações da conversa
            const conversation = this.getConversationInfo(phoneNumber);
            const name = conversation ? conversation.name : phoneNumber;
            
            console.log(`Exibindo notificação para mensagem de ${name}`);
            
            // Se App.showNotification estiver disponível, use-o para notificações internas
            if (this.pageVisible && App.showNotification) {
                App.showNotification(`Nova mensagem de ${name}: ${message.type === 'text' ? message.content : `[${message.type.toUpperCase()}]`}`);
                return;
            }
            
            // Cria o conteúdo da notificação
            let title = `Nova mensagem de ${name}`;
            let options = {
                body: message.type === 'text' ? message.content : `[${message.type.toUpperCase()}]`,
                icon: conversation && conversation.profile_pic ? App.getMediaUrl(conversation.profile_pic) : '/static/images/default-avatar.png',
                tag: `whatsapp-${phoneNumber}`, // Agrupa notificações do mesmo contato
                requireInteraction: false // Não requer interação do usuário para fechar
            };
            
            // Cria e exibe a notificação
            const notification = new Notification(title, options);
            
            // Adiciona evento de clique na notificação
            notification.onclick = () => {
                // Foca na janela e carrega a conversa
                window.focus();
                App.loadConversation(phoneNumber);
                notification.close();
            };
            
            // Fecha automaticamente após 5 segundos
            setTimeout(() => {
                notification.close();
            }, 5000);
        }
        
        // Atualiza o badge de não lidas na lista de conversas
        updateConversationBadge(phoneNumber, count) {
            const conversationItem = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
            if (!conversationItem) {
                console.log(`Conversa ${phoneNumber} não encontrada na interface`);
                return;
            }
            
            // Remove badge existente
            const existingBadge = conversationItem.querySelector('.unread-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            
            // Adiciona novo badge se houver mensagens não lidas
            if (count > 0) {
                const badge = document.createElement('div');
                badge.className = 'unread-badge';
                badge.textContent = count > 99 ? '99+' : count;
                
                // Adiciona o badge na posição correta
                const conversationInfo = conversationItem.querySelector('.conversation-info');
                conversationInfo.appendChild(badge);
                
                // Adiciona classe para destacar a conversa
                conversationItem.classList.add('has-unread');
                
                console.log(`Badge adicionado para ${phoneNumber}: ${count}`);
            } else {
                // Remove classe de destaque
                conversationItem.classList.remove('has-unread');
                console.log(`Badge removido para ${phoneNumber}`);
            }
        }
        
        // Atualiza a prévia da conversa na lista
        updateConversationPreview(phoneNumber, message) {
            const conversationItem = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
            if (!conversationItem) {
                console.log(`Conversa ${phoneNumber} não encontrada para atualizar prévia`);
                return;
            }
            
            // Cria ou atualiza o elemento de prévia
            let previewElement = conversationItem.querySelector('.message-preview');
            if (!previewElement) {
                previewElement = document.createElement('div');
                previewElement.className = 'message-preview';
                
                // Adiciona após o nome/telefone
                const conversationInfo = conversationItem.querySelector('.conversation-info');
                conversationInfo.appendChild(previewElement);
            }
            
            // Define o conteúdo da prévia
            if (message.type === 'text') {
                previewElement.textContent = message.content.length > 30 ? 
                    message.content.substring(0, 27) + '...' : 
                    message.content;
            } else {
                previewElement.textContent = `[${message.type.toUpperCase()}]`;
            }
            
            console.log(`Prévia atualizada para ${phoneNumber}`);
            
            // Move a conversa para o topo da lista
            const conversationList = document.getElementById('conversation-list');
            if (conversationList && conversationList.firstChild) {
                conversationList.insertBefore(conversationItem, conversationList.firstChild);
                console.log(`Conversa ${phoneNumber} movida para o topo da lista`);
            }
        }
        
        // Atualiza os indicadores de status das mensagens
        updateMessageStatus(data) {
            const phoneNumber = data.phone_number;
            const messageId = data.message_id;
            const status = data.status;
            
            console.log(`Atualizando status de mensagem ${messageId} para ${status}`);
            
            // Atualiza apenas se for a conversa atual
            if (App.currentPhone !== phoneNumber) {
                console.log("Ignorando atualização de status para conversa não ativa");
                return;
            }
            
            // Encontra o elemento da mensagem
            const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (!messageElement) {
                console.log(`Elemento de mensagem ${messageId} não encontrado`);
                return;
            }
            
            // Remove classes de status anteriores
            messageElement.classList.remove('status-sending', 'status-sent', 'status-delivered', 'status-failed');
            
            // Adiciona a classe de status atual
            messageElement.classList.add(`status-${status}`);
            
            // Atualiza o ícone de status
            let statusIcon = messageElement.querySelector('.message-status');
            if (!statusIcon) {
                statusIcon = document.createElement('div');
                statusIcon.className = 'message-status';
                messageElement.querySelector('.message-time').appendChild(statusIcon);
            }
            
            // Define o ícone apropriado
            switch (status) {
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
            
            console.log(`Status de mensagem ${messageId} atualizado para ${status}`);
        }
        
        // Obtém informações de uma conversa
        getConversationInfo(phoneNumber) {
            // Primeiro tenta obter da conversa atual
            if (App.currentPhone === phoneNumber && App.currentConversation) {
                return App.currentConversation;
            }
            
            // Tenta obter da lista de conversas
            const conversationItem = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
            if (conversationItem) {
                const name = conversationItem.querySelector('.name').textContent;
                const profilePic = conversationItem.querySelector('.conversation-avatar img')?.src;
                
                return {
                    name: name,
                    profile_pic: profilePic,
                    phone: phoneNumber
                };
            }
            
            // Retorna informações básicas se não encontrar
            return {
                name: phoneNumber,
                profile_pic: null,
                phone: phoneNumber
            };
        }
        
        // Dispara evento personalizado
        dispatchEvent(eventName, data) {
            // Cria e dispara um evento personalizado
            const event = new CustomEvent(eventName, {
                detail: data || {},
                bubbles: true,
                cancelable: true
            });
            
            window.dispatchEvent(event);
        }
        
        // Gera um UUID v4 para identificação de cliente
        generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        // Carrega os contadores de mensagens não lidas
        loadUnreadCounts() {
            console.log("Carregando contadores de mensagens não lidas");
            
            // Busca todas as conversas do servidor
            fetch('/all_conversations')
                .then(response => response.json())
                .then(conversations => {
                    // Inicializa os contadores
                    this.unreadCounts = {};
                    
                    // Processa cada conversa
                    for (const [phoneNumber, conversation] of Object.entries(conversations)) {
                        const unreadCount = conversation.unread_count || 0;
                        this.unreadCounts[phoneNumber] = unreadCount;
                        
                        // Atualiza a interface
                        this.updateConversationBadge(phoneNumber, unreadCount);
                    }
                    
                    // Atualiza o contador total
                    this.updateTotalUnreadCount();
                    
                    console.log("Contadores de mensagens não lidas carregados");
                })
                .catch(error => {
                    console.error("Erro ao carregar contadores de mensagens não lidas:", error);
                });
        }
        
        // Adiciona uma mensagem temporária à interface
        addTemporaryMessage(message, mediaInfo) {
            if (!App.currentPhone) return;
            
            console.log("Adicionando mensagem temporária");
            
            const messageArea = document.getElementById('message-area');
            const tempMsg = document.createElement('div');
            tempMsg.className = 'message vendedor temp-message status-sending';
            
            // Conteúdo da mensagem
            let content = '';
            
            if (mediaInfo) {
                // Mensagem com mídia
                switch (mediaInfo.type) {
                    case 'image':
                        content = `
                            <div class="message-media">
                                <img src="${mediaInfo.path}" alt="Imagem">
                            </div>
                            ${message ? `<div class="message-caption">${message}</div>` : ''}
                        `;
                        break;
                    case 'audio':
                        content = `
                            <div class="message-media">
                                <audio controls src="${mediaInfo.path}"></audio>
                            </div>
                            ${message ? `<div class="message-caption">${message}</div>` : ''}
                        `;
                        break;
                    case 'video':
                        content = `
                            <div class="message-media">
                                <video controls src="${mediaInfo.path}"></video>
                            </div>
                            ${message ? `<div class="message-caption">${message}</div>` : ''}
                        `;
                        break;
                    case 'document':
                        const fileName = mediaInfo.path.split('/').pop();
                        content = `
                            <div class="message-document">
                                <a href="${mediaInfo.path}" class="document-link" target="_blank">
                                    <i class="fas fa-file"></i> ${fileName}
                                </a>
                            </div>
                            ${message ? `<div class="message-caption">${message}</div>` : ''}
                        `;
                        break;
                }
            } else {
                // Mensagem de texto simples
                content = `<div class="message-text">${message}</div>`;
            }
            
            // Adiciona o conteúdo e o indicador de status
            tempMsg.innerHTML = `
                ${content}
                <div class="message-time">
                    Enviando...
                    <div class="message-status"><i class="fas fa-clock"></i></div>
                </div>
            `;
            
            // Adiciona à área de mensagens
            messageArea.appendChild(tempMsg);
            
            // Rola para o final
            messageArea.scrollTop = messageArea.scrollHeight;
            
            console.log("Mensagem temporária adicionada");
        }
        
        // Método para estender os métodos do App
        extendAppMethods() {
            console.log("Estendendo métodos do App");
            
            // Verifica se o método App.createMessageElement existe antes de estendê-lo
            if (App.createMessageElement) {
                // Salva referência ao método original
                const originalCreateMessageElement = App.createMessageElement;
                
                // Sobrescreve o método com versão estendida
                App.createMessageElement = function(msg) {
                    try {
                        // Chama o método original
                        const element = originalCreateMessageElement.call(App, msg);
                        
                        // Adiciona ID da mensagem como atributo do elemento
                        if (msg.id) {
                            element.dataset.messageId = msg.id;
                        }
                        
                        // Adiciona indicador de status para mensagens enviadas por nós
                        if (msg.from === 'vendedor' || msg.from === 'qwen') {
                            // Adiciona classe de status
                            element.classList.add(`status-${msg.status || 'sent'}`);
                            // Adiciona ícone de status
                            const timeElement = element.querySelector('.message-time');
                            if (timeElement) {
                                const statusIcon = document.createElement('div');
                                statusIcon.className = 'message-status';
                                
                                // Define o ícone apropriado
                                switch (msg.status) {
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
                                    default:
                                        statusIcon.innerHTML = '<i class="fas fa-check"></i>';
                                }
                                
                                timeElement.appendChild(statusIcon);
                            }
                        }
                        
                        return element;
                    } catch (error) {
                        console.error("Erro ao estender createMessageElement:", error);
                        
                        // Fallback em caso de erro
                        const messageElement = document.createElement('div');
                        messageElement.className = `message ${msg.from}`;
                        
                        // Conteúdo simplificado da mensagem
                        let content = msg.type === 'text' 
                            ? `<div class="message-text">${msg.content}</div>` 
                            : `<div class="message-text">[${msg.type.toUpperCase()}] ${msg.content || ''}</div>`;

                        messageElement.innerHTML = `
                            ${content}
                            <div class="message-time">${msg.timestamp || ''}</div>
                        `;
                        
                        return messageElement;
                    }
                };
            } else {
                console.warn("App.createMessageElement não encontrado. A extensão do método foi ignorada.");
            }
            
            // Verifica se o método App.loadConversation existe antes de estendê-lo
            if (App.loadConversation) {
                // Salva referência ao método original
                const originalLoadConversation = App.loadConversation;
                
                // Sobrescreve o método com versão estendida
                App.loadConversation = function(phoneNumber) {
                    console.log(`Carregando conversa ${phoneNumber} com notificações`);
                    
                    try {
                        // Chama o método original
                        originalLoadConversation.call(App, phoneNumber);
                        
                        // Adiciona comportamento de notificação
                        if (App.notificationManager) {
                            // Inscreve-se para atualizações deste número
                            App.notificationManager.subscribeToPhone(phoneNumber);
                            
                            // Marca mensagens como lidas
                            App.notificationManager.markAsRead(phoneNumber);
                        }
                    } catch (error) {
                        console.error("Erro ao carregar conversa com notificações:", error);
                        // Tenta carregar sem extensões se falhar
                        try {
                            // Fallback: carrega a conversa diretamente
                            fetch('/conversation/' + phoneNumber)
                                .then(response => response.json())
                                .then(data => {
                                    if (App.updateAppState) {
                                        App.updateAppState(phoneNumber, data);
                                    } else {
                                        App.currentPhone = phoneNumber;
                                        App.currentConversation = data;
                                    }
                                })
                                .catch(err => {
                                    console.error("Erro no fallback:", err);
                                });
                        } catch (fallbackError) {
                            console.error("Erro fatal ao carregar conversa:", fallbackError);
                        }
                    }
                };
            } else {
                console.warn("App.loadConversation não encontrado. A extensão do método foi ignorada.");
            }
            
            // Adiciona método para atualizar mensagens se não existir
            if (!App.updateConversationMessages) {
                App.updateConversationMessages = function(phoneNumber, newMessage) {
                    // Verificação mais robusta
                    if (App.currentPhone !== phoneNumber) return;
                    
                    const messageArea = document.getElementById('message-area');
                    if (!messageArea) return;
                    
                    // Se não tiver uma mensagem específica, atualiza a conversa inteira
                    if (!newMessage) {
                        // Busca os dados atualizados da conversa
                        fetch(`/conversation/${phoneNumber}`)
                            .then(response => response.json())
                            .then(data => {
                                // Atualiza o objeto de conversa atual
                                if (App.updateAppState) {
                                    App.updateAppState(phoneNumber, data);
                                } else {
                                    App.currentPhone = phoneNumber;
                                    App.currentConversation = data;
                                }
                                
                                // Renderiza as mensagens
                                if (App.renderConversationMessages) {
                                    App.renderConversationMessages(data);
                                }
                            })
                            .catch(error => {
                                console.error("Erro ao atualizar mensagens:", error);
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
                        let messageElement;
                        try {
                            messageElement = App.createMessageElement(newMessage);
                        } catch (error) {
                            console.error("Erro ao criar elemento de mensagem:", error);
                            
                            // Fallback simples
                            messageElement = document.createElement('div');
                            messageElement.className = `message ${newMessage.from}`;
                            messageElement.innerHTML = `
                                <div class="message-text">${newMessage.content || ''}</div>
                                <div class="message-time">${newMessage.timestamp || ''}</div>
                            `;
                        }
                        
                        messageArea.appendChild(messageElement);
                        
                        // Remove qualquer mensagem temporária com o mesmo conteúdo
                        document.querySelectorAll('.temp-message').forEach(el => {
                            if (el.querySelector('.message-text')?.textContent === newMessage.content) {
                                el.remove();
                            }
                        });
                        
                        // Atualiza o objeto da conversa atual
                        if (App.currentConversation && App.currentConversation.messages) {
                            App.currentConversation.messages.push(newMessage);
                        }
                        
                        // Atualiza área de IA se necessário
                        if (newMessage.from === 'cliente' || newMessage.from === 'qwen' || newMessage.from === 'deepseek') {
                            const aiMessageArea = document.getElementById('ai-message-area');
                            if (aiMessageArea) {
                                let aiMessageElement;
                                
                                try {
                                    aiMessageElement = App.createAIMessageElement(newMessage);
                                } catch (error) {
                                    console.error("Erro ao criar elemento de mensagem da IA:", error);
                                    
                                    // Fallback simples
                                    aiMessageElement = document.createElement('div');
                                    aiMessageElement.className = `message ${newMessage.from}`;
                                    aiMessageElement.innerHTML = `
                                        <div class="message-text">${newMessage.content || ''}</div>
                                        <div class="message-time">${newMessage.timestamp || ''}</div>
                                    `;
                                }
                                
                                aiMessageArea.appendChild(aiMessageElement);
                                aiMessageArea.scrollTop = aiMessageArea.scrollHeight;
                            }
                        }
                        
                        // Rola para a nova mensagem se estava no final
                        if (wasAtBottom) {
                            messageArea.scrollTop = messageArea.scrollHeight;
                        }
                    }
                };
            }
            
            console.log("Métodos do App estendidos com sucesso");
        }
    }
    
    // Adiciona estilos CSS necessários
    function addStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* Estilos para badges de mensagens não lidas */
            .unread-badge {
                background-color: #25D366;
                color: white;
                border-radius: 50%;
                min-width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: bold;
                margin-left: 8px;
                padding: 0 4px;
            }

            /* Destaque para conversas com mensagens não lidas */
            .conversation-item.has-unread {
                font-weight: bold;
                background-color: rgba(37, 211, 102, 0.1);
            }

            /* Prévia da última mensagem */
            .message-preview {
                font-size: 12px;
                color: #666;
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 200px;
            }

            /* Indicadores de status de mensagem */
            .message-status {
                display: inline-block;
                margin-left: 5px;
                font-size: 12px;
            }

            .status-sending .message-status {
                color: #999;
            }

            .status-sent .message-status {
                color: #999;
            }

            .status-delivered .message-status {
                color: #25D366;
            }

            .status-failed .message-status {
                color: #FF3B30;
            }
            
            /* Mensagem temporária */
            .temp-message {
                opacity: 0.7;
            }
            
            /* Estilos para o indicador de status de conexão */
            .status-indicator {
                position: fixed;
                bottom: 10px;
                left: 10px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background-color: #999;
                z-index: 1000;
                transition: background-color 0.3s;
            }

            .status-indicator.online {
                background-color: #25D366;
            }

            .status-indicator.offline {
                background-color: #FF3B30;
            }

            .status-indicator.connecting {
                background-color: #FFCC00;
                animation: pulse 1s infinite;
            }

            .status-indicator.hidden {
                opacity: 0;
            }

            @keyframes pulse {
                0% { opacity: 0.5; }
                50% { opacity: 1; }
                100% { opacity: 0.5; }
            }
        `;
        document.head.appendChild(styleElement);
        console.log("Estilos CSS adicionados");
    }
    
    // Inicializa o módulo quando o documento estiver pronto
    function initialize() {
        console.log("Inicializando módulo notification_manager.js");
        
        // Adiciona estilos CSS
        addStyles();
        
        // Instancia e expõe o gerenciador de notificações no objeto App
        App.notificationManager = new NotificationManager();
    }
    
    // Verifica se o documento já está carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})(window.App || (window.App = {}));