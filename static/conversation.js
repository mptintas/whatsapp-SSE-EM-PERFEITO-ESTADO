/**
 * conversation.js
 * Módulo para gerenciamento de conversas
 * Funções para carregar, enviar mensagens e gerenciar o estado das conversas
 */

// Extende o objeto App com as funções de conversas
(function(App) {
    
    // Método para alternar entre os modos automático e humano
    App.toggleMode = function() {
        if (!App.currentPhone) {
            alert("Selecione uma conversa primeiro!");
            return;
        }
        
        // Desabilita o botão durante a requisição
        const toggleButton = document.getElementById('toggle-mode-btn');
        toggleButton.disabled = true;
        
        fetch(`/toggle_mode/${App.currentPhone}`, {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao alternar o modo da conversa");
            }
            return response.json();
        })
        .then(data => {
            if (data.status === 'success') {
                // Atualiza o botão com o novo modo
                const newMode = data.mode;
                
                // Atualiza a interface
                toggleButton.className = newMode === 'human' ? 'human-mode' : 'auto-mode';
                toggleButton.innerHTML = newMode === 'human' ? 
                    '<i class="fas fa-user"></i> Modo Humano' : 
                    '<i class="fas fa-robot"></i> Modo Automático';
                    
                // Atualiza também o ícone na lista de conversas
                const conversationToggle = document.querySelector(`.conversation-item[data-phone="${App.currentPhone}"] .mode-toggle`);
                if (conversationToggle) {
                    conversationToggle.className = `mode-toggle ${newMode === 'human' ? 'human-mode' : 'auto-mode'}`;
                    conversationToggle.innerHTML = `<i class="fas ${newMode === 'human' ? 'fa-user' : 'fa-robot'}"></i>`;
                }
                
                // Atualiza o estado da conversa atual
                if (App.currentConversation) {
                    App.currentConversation.mode = newMode;
                }
                
                console.log(`Modo da conversa alterado para: ${newMode}`);
            } else {
                alert("Erro ao alternar o modo: " + (data.message || "Erro desconhecido"));
            }
        })
        .catch(error => {
            console.error("Erro ao alternar o modo:", error);
            alert("Erro ao alternar o modo: " + error.message);
        })
        .finally(() => {
            toggleButton.disabled = false;
        });
    };

    // Método central para atualizar o estado da aplicação
    App.updateAppState = function(phoneNumber, conversationData) {
        // Atualiza o estado interno de maneira consistente
        App.currentPhone = phoneNumber;
        App.currentConversation = conversationData;
        
        // Notifica outros módulos sobre a mudança de estado
        if (App.persistenceHandler) {
            App.persistenceHandler.saveCurrentConversation(phoneNumber);
        }
        
        // Atualiza a interface
        App.updateConversationHeader(conversationData);
    };

    // Carregar uma conversa - versão otimizada com suporte a notificações
    App.loadConversation = function(phoneNumber) {
        console.log(`Carregando conversa: ${phoneNumber}`);
        
        if (!phoneNumber) {
            console.error("Número de telefone inválido");
            return;
        }
        
        // Limpa qualquer seleção anterior
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Marca a conversa como ativa na lista
        const conversationElement = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
        if (conversationElement) {
            conversationElement.classList.add('active');
        }
        
        // Solicita os dados da conversa ao servidor
        fetch(`/conversation/${phoneNumber}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erro ao carregar conversa: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Atualiza o estado global
                App.updateAppState(phoneNumber, data);
                
                // Carrega as mensagens
                App.renderConversationMessages(data);
                
                // Inscreve para atualizações em tempo real via notificações
                App.subscribeToConversationUpdates(phoneNumber);
                
                // Marca as mensagens como lidas
                App.markMessagesAsRead(phoneNumber);
            })
            .catch(error => {
                console.error("Erro ao carregar conversa:", error);
                App.showNotification(`Erro ao carregar conversa: ${error.message}`, true);
            });
    };
    
    // Atualiza o cabeçalho da conversa
    App.updateConversationHeader = function(conversation) {
        // Atualiza nome do contato
        const nameElement = document.getElementById('current-contact-name');
        if (nameElement) {
            nameElement.textContent = conversation.name || "Cliente";
        }
        
        // Atualiza avatar do contato
        const avatarElement = document.getElementById('current-contact-avatar');
        if (avatarElement) {
            if (conversation.profile_pic) {
                avatarElement.innerHTML = `<img src="${App.getMediaUrl(conversation.profile_pic)}" alt="${conversation.name || 'Cliente'}">`;
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
    };
    
    // Renderiza as mensagens da conversa
    App.renderConversationMessages = function(conversation) {
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
            App.renderOptimizedMessages(conversation, 50);
        } else {
            // Renderiza cada mensagem
            conversation.messages.forEach(msg => {
                const messageElement = App.createMessageElement(msg);
                messageArea.appendChild(messageElement);
            });
            
            // Rola para a última mensagem
            messageArea.scrollTop = messageArea.scrollHeight;
        }
        
        // Atualiza área de mensagens da IA
        App.updateAIMessages(conversation);
    };
    
    // Renderização otimizada para conversas longas
    App.renderOptimizedMessages = function(conversation, limit = 50) {
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
            const messageElement = App.createMessageElement(msg);
            messageArea.appendChild(messageElement);
        });
        
        // Adiciona botão "Carregar mais" se houver mais mensagens
        if (conversation.messages.length > limit) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.className = 'load-more-btn';
            loadMoreButton.textContent = 'Carregar mensagens anteriores';
            loadMoreButton.onclick = () => App.loadMoreMessages(conversation, limit);
            
            const loadMoreContainer = document.createElement('div');
            loadMoreContainer.className = 'load-more-container';
            loadMoreContainer.appendChild(loadMoreButton);
            
            messageArea.insertBefore(loadMoreContainer, messageArea.firstChild);
        }
        
        // Rola para a última mensagem
        messageArea.scrollTop = messageArea.scrollHeight;
    };
    
    // Carrega mais mensagens para conversas longas
    App.loadMoreMessages = function(conversation, pageSize = 50) {
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
            const messageElement = App.createMessageElement(msg);
            messageArea.insertBefore(messageElement, messageArea.firstChild);
        });
        
        // Adiciona o botão novamente se ainda houver mais mensagens
        if (startIndex > 0) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.className = 'load-more-btn';
            loadMoreButton.textContent = 'Carregar mensagens anteriores';
            loadMoreButton.onclick = () => App.loadMoreMessages(conversation, pageSize);
            
            const newLoadMoreContainer = document.createElement('div');
            newLoadMoreContainer.className = 'load-more-container';
            newLoadMoreContainer.appendChild(loadMoreButton);
            
            messageArea.insertBefore(newLoadMoreContainer, messageArea.firstChild);
        }
    };
    
    // Atualiza a área de mensagens da IA
    App.updateAIMessages = function(conversation) {
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
            const messageElement = App.createAIMessageElement(msg);
            aiMessageArea.appendChild(messageElement);
        });
        
        // Rola para a última mensagem
        aiMessageArea.scrollTop = aiMessageArea.scrollHeight;
    };
    
    // Inscreve para atualizações em tempo real
    App.subscribeToConversationUpdates = function(phoneNumber) {
        // Verifica se o sistema de notificações está disponível
        if (App.notificationManager) {
            App.notificationManager.subscribeToPhone(phoneNumber);
        } else {
            console.warn("Sistema de notificações não disponível. As mensagens não serão atualizadas em tempo real.");
        }
    };
    
    // Marca as mensagens como lidas
    App.markMessagesAsRead = function(phoneNumber) {
        fetch(`/mark_read/${phoneNumber}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            console.log(`Mensagens para ${phoneNumber} marcadas como lidas:`, data);
            
            // Atualiza contadores locais se o gerenciador de notificações estiver disponível
            if (App.notificationManager) {
                App.notificationManager.unreadCounts[phoneNumber] = 0;
                App.notificationManager.updateTotalUnreadCount();
            }
            
            // Atualiza badge na interface
            const conversationItem = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
            if (conversationItem) {
                const badge = conversationItem.querySelector('.unread-badge');
                if (badge) badge.remove();
                conversationItem.classList.remove('has-unread');
            }
        })
        .catch(error => {
            console.error(`Erro ao marcar mensagens como lidas para ${phoneNumber}:`, error);
        });
    };
    
    // Função unificada para atualizar as mensagens de uma conversa
    App.updateConversationMessages = function(phoneNumber, newMessage) {
        // Verifica se é a conversa atual
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
                    App.updateAppState(phoneNumber, data);
                    
                    // Renderiza as mensagens
                    App.renderConversationMessages(data);
                })
                .catch(error => {
                    console.error("Erro ao atualizar mensagens:", error);
                    App.showNotification("Erro ao atualizar mensagens", true);
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
            const messageElement = App.createMessageElement(newMessage);
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
                    const aiMessageElement = App.createAIMessageElement(newMessage);
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
    
    // Função para mostrar notificações na interface
    App.showNotification = function(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = 'notification' + (isError ? ' error' : '');
        notification.innerHTML = `<i class="fas fa-${isError ? 'exclamation-circle' : 'check-circle'}"></i> ${message}`;
        document.body.appendChild(notification);
        
        // Remove a notificação após alguns segundos
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    };
    
    // Adiciona um feedback visual temporário de mensagem sendo enviada
    App.addTemporaryMessage = function(message, mediaInfo) {
        if (!App.currentPhone) return;
        
        const messageArea = document.getElementById('message-area');
        if (!messageArea) return;
        
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
    };
    
    // Envia uma mensagem para um contato - versão com feedback visual imediato
    App.sendMessage = function() {
        // Bloqueia múltiplos envios
        if (App.isSubmitting) return;
        App.isSubmitting = true;
    
        if (!App.currentPhone) {
            App.showNotification("Selecione uma conversa primeiro!", true);
            App.isSubmitting = false;
            return;
        }
        
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();
        
        if (!message && !App.mediaInfo) {
            App.showNotification("Digite uma mensagem ou selecione uma mídia!", true);
            App.isSubmitting = false;
            return;
        }
        
        const data = {
            to_number: App.currentPhone,
            message: message
        };
        
        if (App.mediaInfo) {
            data.media_path = App.mediaInfo.path;
            data.media_type = App.mediaInfo.type;
        }
        
        const sendButton = document.getElementById('send-button');
        sendButton.disabled = true;
        
        // Feedback visual imediato
        App.addTemporaryMessage(message, App.mediaInfo);
        messageInput.value = '';
        
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
            // Limpa a mídia após envio
            App.mediaInfo = null;
            
            console.log("Mensagem enviada com sucesso");
            
            // O sistema de notificações cuidará da atualização da interface
        })
        .catch(error => {
            console.error("Erro:", error);
            App.showNotification("Não foi possível enviar a mensagem", true);
            
            // Remove mensagens temporárias em caso de erro
            document.querySelectorAll('.temp-message').forEach(el => el.remove());
            
            // Restaura a mensagem não enviada
            messageInput.value = message;
        })
        .finally(() => {
            App.isSubmitting = false;
            sendButton.disabled = false;
        });
    };
    
    // Envia uma localização para um contato
    App.sendLocation = function(lat, lng) {
        if (!App.currentPhone) return;
        
        // Desabilita o botão durante o envio
        const sendButton = document.getElementById('send-button');
        sendButton.disabled = true;
        
        // Adiciona mensagem temporária na interface para feedback imediato
        const messageArea = document.getElementById('message-area');
        const tempMsg = document.createElement('div');
        tempMsg.className = 'message vendedor temp-message status-sending';
        tempMsg.innerHTML = `
            <div class="message-location">
                <img src="https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=13&size=300x150&markers=color:red%7C${lat},${lng}" 
                    alt="Localização" onclick="App.openLocation(${lat}, ${lng})">
                <div class="location-caption">
                    <i class="fas fa-map-marker-alt"></i> Localização Compartilhada
                </div>
            </div>
            <div class="message-time">
                Enviando...
                <div class="message-status"><i class="fas fa-clock"></i></div>
            </div>
        `;
        messageArea.appendChild(tempMsg);
        messageArea.scrollTop = messageArea.scrollHeight;
        
        // Envia a requisição para o backend
        fetch('/send_location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to_number: App.currentPhone,
                latitude: lat,
                longitude: lng
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao enviar localização: " + response.statusText);
            }
            return response.json();
        })
        .then(result => {
            if (result.status === 'success') {
                console.log("Localização enviada com sucesso");
                // O sistema de notificações cuidará da atualização da interface
            } else {
                // Mostra erro e remove a mensagem temporária
                tempMsg.remove();
                App.showNotification("Erro ao enviar localização: " + (result.message || "Erro desconhecido"), true);
            }
        })
        .catch(error => {
            // Mostra erro e remove a mensagem temporária
            tempMsg.remove();
            console.error("Erro ao enviar localização:", error);
            App.showNotification("Erro ao enviar localização: " + error.message, true);
        })
        .finally(() => {
            sendButton.disabled = false;
            // Limpa a localização armazenada
            App.currentLocation = null;
        });
    };
    
    // Abre uma localização no Google Maps
    App.openLocation = function(lat, lng) {
        // Abre a localização no Google Maps em uma nova aba
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    };
    
    // Exibe detalhes do perfil
    App.showProfileDetails = function() {
        if (!App.currentPhone || !App.currentConversation) return;
        
        const profile = App.currentConversation;
        const profilePic = profile.profile_pic || '';
        const name = profile.name || 'Cliente';
        const about = profile.about || 'Disponível'; // Campo a ser adicionado no backend
        
        // Cria um modal de perfil
        const modal = document.createElement('div');
        modal.className = 'modal profile-modal';
        modal.style.display = 'block';
        
        modal.innerHTML = `
            <div class="modal-content profile-content">
                <span class="close" onclick="App.closeModal()">&times;</span>
                <div class="profile-header">
                    <div class="profile-image">
                        ${profilePic ? 
                        `<img src="${App.getMediaUrl(profilePic)}" alt="${name}" onclick="App.zoomImage('${profilePic}')">` : 
                        `<div class="avatar-placeholder large">${name[0].toUpperCase()}</div>`}
                    </div>
                    <h2>${name}</h2>
                    <p class="profile-about">${about}</p>
                </div>
                <div class="profile-info">
                    <div class="info-item">
                        <i class="fas fa-phone"></i>
                        <span>${App.currentPhone}</span>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-bell"></i>
                        <span>Notificações: Ativadas</span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="notification-toggle" checked>
                            <label for="notification-toggle"></label>
                        </div>
                    </div>
                    <div class="danger-zone">
                        <button class="danger-btn" onclick="App.confirmDeleteConversation('${App.currentPhone}'); App.closeModal();">
                            <i class="fas fa-trash"></i> Apagar Conversa
                        </button>
                        <button class="block-btn" onclick="alert('Funcionalidade de bloqueio será implementada em breve!')">
                            <i class="fas fa-ban"></i> Bloquear Contato
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Fecha o modal se clicar fora do conteúdo
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                App.closeModal();
            }
        });
    };

    // Funções para gerenciar opções de mensagens
    App.showMessageOptions = function(event, messageId) {
        event.stopPropagation();
        
        // Remove qualquer menu de opções existente
        const existingMenu = document.getElementById('message-options-menu');
        if (existingMenu) existingMenu.remove();
        
        // Cria o menu de opções
        const optionsMenu = document.createElement('div');
        optionsMenu.id = 'message-options-menu';
        optionsMenu.className = 'options-menu';
        optionsMenu.innerHTML = `
            <div class="option" onclick="App.replyToMessage('${messageId}')">
                <i class="fas fa-reply"></i> Responder
            </div>
            <div class="option" onclick="App.forwardMessage('${messageId}')">
                <i class="fas fa-share"></i> Encaminhar
            </div>
            <div class="option" onclick="App.copyMessageText('${messageId}')">
                <i class="fas fa-copy"></i> Copiar
            </div>
            <div class="option delete" onclick="App.deleteMessage('${messageId}')">
            <i class="fas fa-trash"></i> Apagar
            </div>
        `;
        
        // Posiciona o menu próximo ao botão de opções
        const button = event.currentTarget;
        const rect = button.getBoundingClientRect();
        
        optionsMenu.style.top = `${rect.bottom + window.scrollY}px`;
        optionsMenu.style.left = `${rect.left + window.scrollX - 120}px`;
        
        document.body.appendChild(optionsMenu);
        
        // Fecha o menu se clicar fora dele
        document.addEventListener('click', function closeMenu(e) {
            if (!optionsMenu.contains(e.target) && e.target !== button) {
                optionsMenu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    };
    
    App.replyToMessage = function(messageId) {
        // Implementação futura para responder a mensagens específicas
        App.showNotification("Função de responder será implementada em breve!");
        document.getElementById('message-options-menu')?.remove();
    };
    
    App.forwardMessage = function(messageId) {
        // Implementação futura para encaminhar mensagens
        App.showNotification("Função de encaminhar será implementada em breve!");
        document.getElementById('message-options-menu')?.remove();
    };
    
    App.copyMessageText = function(messageId) {
        // Copia o texto da mensagem para a área de transferência
        const message = document.querySelector(`.message[data-message-id="${messageId}"]`);
        const textElement = message?.querySelector('.message-text');
        
        if (textElement) {
            const text = textElement.textContent;
            navigator.clipboard.writeText(text)
                .then(() => {
                    // Feedback visual
                    App.showNotification("Texto copiado!");
                })
                .catch(err => {
                    console.error('Erro ao copiar texto: ', err);
                    App.showNotification('Não foi possível copiar o texto: ' + err, true);
                });
        }
        
        document.getElementById('message-options-menu')?.remove();
    };
    
    App.deleteMessage = function(messageId) {
        if (confirm("Tem certeza que deseja apagar esta mensagem?")) {
            // Implementação temporária - remove visualmente o elemento até que o backend seja implementado
            const message = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (message) {
                message.classList.add('deleted');
                setTimeout(() => {
                    message.innerHTML = '<div class="deleted-message"><i class="fas fa-ban"></i> Mensagem apagada</div>';
                }, 300);
            }
            
            // Implementação futura para deletar do backend
            // fetch(`/delete_message/${messageId}`, {
            //     method: 'POST'
            // }).then(/* ... */);
        }
        
        document.getElementById('message-options-menu')?.remove();
    };
    
    // Função para selecionar uma mensagem
    App.selectMessage = function(element) {
        // Remove seleção anterior
        document.querySelectorAll('.message.selected').forEach(msg => {
            msg.classList.remove('selected');
        });
        
        // Adiciona seleção à mensagem clicada
        element.classList.add('selected');
    };
    
    // Função para adicionar indicador de status da aplicação
    App.updateAppStatus = function(status, message = '') {
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
    };
    
})(window.App || (window.App = {}));