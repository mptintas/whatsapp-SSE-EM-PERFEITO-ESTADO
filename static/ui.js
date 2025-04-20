/**
 * Módulo para gerenciamento de interface
 * Funções para manipulação de elementos UI, modais, etc.
 */

// Extende o objeto App com as funções de UI
(function(App) {
    
    // Inicializa a aplicação
    App.init = function() {
        console.log("Inicializando aplicação...");
        
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
                    App.showCommandMenu();
                }
            });
            
            // Monitora a digitação para ocultar o menu de comandos se necessário
            messageInput.addEventListener('input', function() {
                if (this.value.length > 0 && !this.value.startsWith('/')) {
                    App.hideCommandMenu();
                }
            });
        }
        
        

        
        // Adicionamos um handler para o evento beforeunload para limpar recursos
        window.addEventListener('beforeunload', function() {
            // Limpa qualquer stream de áudio ou gravação em andamento
            App.stopAudioStream && App.stopAudioStream();
            
            // Limpa timers e intervalos
            clearInterval(App.recordingTimer);
        });
    };
    

    
    // Fecha qualquer modal aberto
    App.closeModal = function() {
        document.querySelectorAll('.modal').forEach(function(modal) {
            modal.style.display = 'none';
        });
        
        // Limpa recursos ao fechar modais
        if (App.isRecording) {
            App.stopRecording && App.stopRecording();
        }
        App.stopAudioStream && App.stopAudioStream();
    };
    
    // Filtra conversas com base na pesquisa
    App.filterConversations = function() {
        const searchText = document.getElementById('search-input').value.toLowerCase();
        const conversations = document.querySelectorAll('.conversation-item');
        
        conversations.forEach(function(item) {
            const name = item.querySelector('.name').textContent.toLowerCase();
            const phone = item.getAttribute('data-phone').toLowerCase();
            
            // Se o texto estiver contido no nome ou telefone, mostra o item
            if (name.includes(searchText) || phone.includes(searchText)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    };
    
    // Inicia uma nova conversa com um número de telefone
    App.startNewConversation = function() {
        const phoneInput = document.getElementById('new-number');
        let phone = phoneInput.value.trim();
        
        if (!phone) {
            alert("Digite um número de telefone!");
            return;
        }
        
        // Remove caracteres não numéricos
        phone = phone.replace(/\D/g, '');
        
        // Verifica se é um número válido (mais de 8 dígitos)
        if (phone.length < 8) {
            alert("Número de telefone inválido!");
            return;
        }
        
        // Verifica se já existe um elemento para este número
        const existingConversation = document.querySelector(`.conversation-item[data-phone="${phone}"]`);
        if (existingConversation) {
            // Se já existir, apenas carrega a conversa
            App.loadConversation(phone);
            
            // Limpa o campo de entrada
            phoneInput.value = '';
            
            return;
        }
        
        // Cria um novo elemento na lista de conversas
        const newConversation = document.createElement('div');
        newConversation.className = 'conversation-item';
        newConversation.setAttribute('data-phone', phone);
        newConversation.onclick = function() { App.loadConversation(phone); };
        
        newConversation.innerHTML = `
            <div class="conversation-avatar">
                <div class="avatar-placeholder">?</div>
            </div>
            <div class="conversation-info">
                <div class="name">Novo Contato</div>
                <div class="phone">${phone}</div>
            </div>
            <div class="conversation-actions-hover">
                <button class="action-btn delete-btn" onclick="event.stopPropagation(); App.confirmDeleteConversation('${phone}')">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="action-btn archive-btn" onclick="event.stopPropagation(); alert('Função de arquivar será implementada em breve!')">
                    <i class="fas fa-archive"></i>
                </button>
            </div>
            <div class="conversation-mode">
                <div class="mode-toggle auto-mode" onclick="event.stopPropagation(); App.toggleMode()">
                    <i class="fas fa-robot"></i>
                </div>
            </div>
        `;
        
        // Adiciona o novo elemento à lista
        const conversationList = document.getElementById('conversation-list');
        conversationList.prepend(newConversation);
        
        // Carrega a conversa
        App.loadConversation(phone);
        
        // Limpa o campo de entrada
        phoneInput.value = '';
    };
    
    // Confirmação para deletar uma conversa
    App.confirmDeleteConversation = function(phone) {
        if (confirm(`Tem certeza que deseja apagar a conversa com ${phone}?`)) {
            App.deleteConversation(phone);
        }
    };
    
    // Deleta uma conversa
    App.deleteConversation = function(phone) {
        // Envia a requisição para o backend
        fetch(`/delete_conversation/${phone}`, {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao deletar conversa: " + response.statusText);
            }
            return response.json();
        })
        .then(result => {
            if (result.status === 'success') {
                // Remove o elemento da lista
                const conversationElement = document.querySelector(`.conversation-item[data-phone="${phone}"]`);
                if (conversationElement) {
                    conversationElement.remove();
                }
                
                // Se era a conversa atual, limpa a área de mensagens
                if (App.currentConversation === phone) {
                    App.currentConversation = null;
                    App.currentConversation = null;
                    
                    // Reseta o cabeçalho
                    document.getElementById('current-contact-name').textContent = 'Selecione uma conversa';
                    document.getElementById('current-contact-avatar').innerHTML = '<div class="avatar-placeholder">?</div>';
                    
                    // Limpa a área de mensagens
                    document.getElementById('message-area').innerHTML = '<div class="empty-state">Selecione uma conversa para ver as mensagens</div>';
                    document.getElementById('ai-message-area').innerHTML = '<div class="empty-state">Informações da IA aparecerão aqui quando uma conversa estiver ativa</div>';
                    
                    // Esconde o botão de modo
                    document.getElementById('toggle-mode-btn').style.display = 'none';
                }
                
                alert("Conversa deletada com sucesso!");
            } else {
                alert("Erro ao deletar conversa: " + (result.message || "Erro desconhecido"));
            }
        })
        .catch(error => {
            console.error("Erro ao deletar conversa:", error);
            alert("Erro ao deletar conversa: " + error.message);
        });
    };
    
    // Detecta se o navegador é mobile
    App.isMobile = function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    };
    
    // Inicializa a aplicação quando o DOM estiver carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', App.init);
    } else {
        App.init();
    }
    
})(window.App || (window.App = {}));