// Função completa para estabelecer conexão SSE e lidar com atualizações
function setupSSEConnection() {
    // Gera um ID único para este cliente
    const clientId = 'client-' + Math.random().toString(36).substr(2, 9);
    
    // Estabelece conexão SSE
    const eventSource = new EventSource(`/events?client_id=${clientId}`);
    
    // Handler para mensagens genéricas
    eventSource.onmessage = function(e) {
        console.log("Evento SSE recebido:", e.data);
    };
    
    // Handler para novos eventos de mensagem
    eventSource.addEventListener('new_message', function(e) {
        const data = JSON.parse(e.data);
        console.log("Nova mensagem recebida:", data);
        
        // Atualiza a interface com a nova mensagem
        if (data.phone_number === currentConversationPhone) {
            // Se for a conversa atual, adiciona a mensagem ao chat
            addMessageToChat(data.message);
        } else {
            // Se for outra conversa, atualiza a lista de conversas
            updateConversationList(data.phone_number);
        }
    });
    
    // Handler para atualizações de status de mensagem
    eventSource.addEventListener('message_status', function(e) {
        const data = JSON.parse(e.data);
        console.log("Atualização de status:", data);
        updateMessageStatus(data.message_id, data.status);
    });
    
    // Handler para atualizações de conversa
    eventSource.addEventListener('conversation_update', function(e) {
        const data = JSON.parse(e.data);
        console.log("Atualização de conversa:", data);
        
        if (data.update_type === 'unread_updated') {
            updateUnreadCount(data.phone_number, data.data.unread_count);
        }
    });
    
    // Handler para erros
    eventSource.onerror = function(e) {
        console.error("Erro na conexão SSE:", e);
        // Reconecta após 5 segundos
        setTimeout(setupSSEConnection, 5000);
    };
    
    // Retorna o eventSource para possível fechamento
    return eventSource;
}

// Funções auxiliares que precisam ser implementadas no frontend
function addMessageToChat(message) {
    // Implementação específica do seu frontend para adicionar mensagem ao chat
    const chatContainer = document.getElementById('chat-messages');
    const messageElement = createMessageElement(message);
    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateConversationList(phoneNumber) {
    // Implementação para atualizar a lista de conversas
    const conversationElement = document.querySelector(`.conversation[data-phone="${phoneNumber}"]`);
    if (conversationElement) {
        // Atualiza o elemento existente
        conversationElement.classList.add('has-new-messages');
    } else {
        // Adiciona nova conversa à lista
        addNewConversationToList(phoneNumber);
    }
}

function updateMessageStatus(messageId, status) {
    // Atualiza o status visual da mensagem
    const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
    if (messageElement) {
        messageElement.setAttribute('data-status', status);
    }
}

function updateUnreadCount(phoneNumber, count) {
    // Atualiza o contador de não lidas
    const badge = document.querySelector(`.conversation[data-phone="${phoneNumber}"] .unread-badge`);
    if (badge) {
        badge.textContent = count > 0 ? count : '';
        badge.style.display = count > 0 ? 'block' : 'none';
    }
}

// Inicia a conexão SSE quando a página carrega
document.addEventListener('DOMContentLoaded', function() {
    window.sseConnection = setupSSEConnection();
    
    // Assina a conversa atual
    if (currentConversationPhone) {
        fetch(`/events/subscribe/${currentConversationPhone}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: window.sseConnection.clientId
            })
        });
    }
});