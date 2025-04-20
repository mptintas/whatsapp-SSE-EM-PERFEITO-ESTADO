/**
 * persistence_handler.js
 * 
 * Módulo responsável pelo gerenciamento de persistência de estado e configurações
 * Permite restaurar o estado da aplicação entre sessões e recarregamentos
 */

(function(App) {
    // Classe principal para gerenciamento de persistência
    class PersistenceHandler {
        constructor() {
            // Configurações padrão
            this.defaultSettings = {
                notifications: true,
                enterToSend: true,
                lastConversation: null,
                unreadCounters: {},
                lastActive: Date.now(),
                tabId: this.generateUUID()
            };
            
            // Estado atual
            this.settings = {};
            this._eventListeners = [];
            
            // Inicialização
            this.init();
        }
        
        // Inicializa o gerenciador de persistência
        init() {
            console.log("Inicializando gerenciador de persistência...");
            
            // Carrega configurações salvas ou usa padrões
            this.loadSettings();
            
            // Configura observadores de URL
            this.setupUrlHandling();
            
            // Configura sincronização entre abas
            this.setupTabSynchronization();
            
            // Estende os métodos do App
            this.extendAppMethods();
            
            // Restaura o estado da última sessão
            this.restoreLastState();
            
            // Configura evento de salvamento automático ao fechar
            window.addEventListener('beforeunload', () => {
                this.saveScrollPositions();
            });
            
            // Registra atividade periódica desta aba
            setInterval(() => this.registerTabActivity(), 30000);
            this.registerTabActivity();
            
            console.log("Gerenciador de persistência inicializado");
        }
        
        // Carrega configurações do localStorage
        loadSettings() {
            try {
                const savedSettings = localStorage.getItem('app_settings');
                if (savedSettings) {
                    this.settings = JSON.parse(savedSettings);
                    console.log("Configurações carregadas do armazenamento local");
                } else {
                    // Usa configurações padrão se não houver salvas
                    this.settings = {...this.defaultSettings};
                    console.log("Usando configurações padrão");
                }
                
                // Garante que todas as propriedades padrão existam
                for (const key in this.defaultSettings) {
                    if (this.settings[key] === undefined) {
                        this.settings[key] = this.defaultSettings[key];
                    }
                }
            } catch (error) {
                console.error("Erro ao carregar configurações:", error);
                this.settings = {...this.defaultSettings};
            }
        }
        
        // Salva as configurações no localStorage
        saveSettings() {
            try {
                localStorage.setItem('app_settings', JSON.stringify(this.settings));
            } catch (error) {
                console.error("Erro ao salvar configurações:", error);
            }
        }
        
        // Salva a conversa atual no localStorage e URL
        saveCurrentConversation(phoneNumber) {
            if (!phoneNumber) return;
            
            // Atualiza as configurações
            this.settings.lastConversation = phoneNumber;
            this.saveSettings();
            
            // Atualiza a URL sem recarregar a página
            const url = new URL(window.location);
            url.searchParams.set('phone', phoneNumber);
            window.history.pushState({phone: phoneNumber}, '', url);
            
            console.log(`Conversa ${phoneNumber} salva como atual`);
        }
        
        // Restaura o estado completo da última sessão
        restoreLastState() {
            // Restaura a última conversa
            const conversationRestored = this.restoreLastConversation();
            
            // Restaura posições de scroll
            setTimeout(() => {
                this.restoreScrollPositions();
            }, 500);
            
            console.log("Estado da aplicação restaurado");
            return conversationRestored;
        }
        
        // Restaura a última conversa ativa
        restoreLastConversation() {
            // Primeiro verifica parâmetros de URL
            const urlParams = new URLSearchParams(window.location.search);
            const phoneFromUrl = urlParams.get('phone');
            
            if (phoneFromUrl) {
                console.log(`Restaurando conversa ${phoneFromUrl} da URL`);
                // Verifica se a conversa existe antes de carregar
                this.loadConversationIfExists(phoneFromUrl);
                return true;
            }
            
            // Se não houver na URL, tenta do localStorage
            const lastPhone = this.settings.lastConversation;
            if (lastPhone) {
                console.log(`Restaurando última conversa ${lastPhone}`);
                this.loadConversationIfExists(lastPhone);
                return true;
            }
            
            console.log("Nenhuma conversa anterior para restaurar");
            return false;
        }
        
        // Verifica se a conversa existe antes de carregar
        loadConversationIfExists(phoneNumber) {
            // Verifica se o elemento da conversa existe no DOM
            const conversationElement = document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`);
            
            if (conversationElement) {
                // Usa o método existente para carregar a conversa
                App.loadConversation(phoneNumber);
                return true;
            } else {
                // Tenta buscar a conversa do servidor
                fetch(`/conversation/${phoneNumber}`)
                    .then(response => {
                        if (response.ok) {
                            return response.json();
                        }
                        throw new Error("Conversa não encontrada");
                    })
                    .then(data => {
                        // Verifica se a conversa já foi adicionada ao DOM (pode ter sido carregada durante a requisição)
                        if (!document.querySelector(`.conversation-item[data-phone="${phoneNumber}"]`)) {
                            // Cria um novo elemento na lista de conversas
                            this.createConversationElement(phoneNumber, data);
                        }
                        
                        // Carrega a conversa
                        App.loadConversation(phoneNumber);
                    })
                    .catch(error => {
                        console.warn(`Conversa ${phoneNumber} não pôde ser restaurada:`, error);
                        // Remove dos dados salvos já que não existe mais
                        if (this.settings.lastConversation === phoneNumber) {
                            this.settings.lastConversation = null;
                            this.saveSettings();
                        }
                    });
                return false;
            }
        }
        
        // Cria um elemento de conversa na lista
        createConversationElement(phoneNumber, data) {
            const conversationList = document.getElementById('conversation-list');
            if (!conversationList) return;
            
            const newConversation = document.createElement('div');
            newConversation.className = 'conversation-item';
            newConversation.setAttribute('data-phone', phoneNumber);
            newConversation.onclick = function() { App.loadConversation(phoneNumber); };
            
            const name = data.name || "Novo Contato";
            const profilePic = data.profile_pic || "";
            const mode = data.mode || "auto";
            
            newConversation.innerHTML = `
                <div class="conversation-avatar">
                    ${profilePic ? 
                        `<img src="${App.getMediaUrl(profilePic)}" alt="${name}">` : 
                        `<div class="avatar-placeholder">${name[0].toUpperCase()}</div>`}
                </div>
                <div class="conversation-info">
                    <div class="name">${name}</div>
                    <div class="phone">${phoneNumber}</div>
                </div>
                <div class="conversation-actions-hover">
                    <button class="action-btn delete-btn" onclick="event.stopPropagation(); App.confirmDeleteConversation('${phoneNumber}')">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="action-btn archive-btn" onclick="event.stopPropagation(); alert('Função de arquivar será implementada em breve!')">
                        <i class="fas fa-archive"></i>
                    </button>
                </div>
                <div class="conversation-mode">
                    <div class="mode-toggle ${mode === 'human' ? 'human-mode' : 'auto-mode'}" 
                            onclick="event.stopPropagation(); App.toggleMode()">
                        <i class="fas ${mode === 'human' ? 'fa-user' : 'fa-robot'}"></i>
                    </div>
                </div>
            `;
            
            // Adiciona à lista de conversas
            conversationList.prepend(newConversation);
        }
        
        // Salva posições de scroll
        saveScrollPositions() {
            const messageArea = document.getElementById('message-area');
            const conversationList = document.getElementById('conversation-list');
            
            if (messageArea) {
                this.settings.messageAreaScroll = messageArea.scrollTop;
            }
            
            if (conversationList) {
                this.settings.conversationListScroll = conversationList.scrollTop;
            }
            
            this.saveSettings();
        }
        
        // Restaura posições de scroll
        restoreScrollPositions() {
            const messageArea = document.getElementById('message-area');
            const conversationList = document.getElementById('conversation-list');
            
            if (messageArea && this.settings.messageAreaScroll !== undefined) {
                messageArea.scrollTop = this.settings.messageAreaScroll;
            }
            
            if (conversationList && this.settings.conversationListScroll !== undefined) {
                conversationList.scrollTop = this.settings.conversationListScroll;
            }
        }
        
        // Configura o tratamento de URL
        setupUrlHandling() {
            // Observa mudanças na URL
            window.addEventListener('popstate', (event) => {
                console.log("Navegação detectada:", event.state);
                
                // Restaura estado baseado no evento de histórico
                if (event.state && event.state.phone) {
                    this.loadConversationIfExists(event.state.phone);
                } else {
                    // Se não houver estado, limpa a conversa atual
                    this.clearCurrentConversation();
                }
            });
            
            // Inicializa o estado do histórico
            const currentState = {
                phone: this.settings.lastConversation
            };
            
            // Substitui o estado atual sem modificar a URL
            window.history.replaceState(currentState, '', window.location.href);
        }
        
        // Gera URL compartilhável para a conversa atual
        generateShareableUrl() {
            if (!App.currentConversation) return null;
            
            const url = new URL(window.location.origin);
            url.pathname = window.location.pathname;
            url.searchParams.set('phone', App.currentConversation);
            
            return url.toString();
        }
        
        // Compartilha a URL da conversa atual
        shareConversationUrl() {
            const url = this.generateShareableUrl();
            if (!url) {
                alert("Selecione uma conversa para compartilhar");
                return;
            }
            
            // Usa a API de compartilhamento se disponível
            if (navigator.share) {
                navigator.share({
                    title: 'Conversa WhatsApp',
                    text: 'Acesse esta conversa:',
                    url: url
                })
                .then(() => console.log('URL compartilhada com sucesso'))
                .catch((error) => console.error('Erro ao compartilhar:', error));
            } else {
                // Fallback: copia para a área de transferência
                navigator.clipboard.writeText(url)
                    .then(() => {
                        alert("URL copiada para a área de transferência");
                    })
                    .catch((error) => {
                        console.error('Erro ao copiar URL:', error);
                        alert("Não foi possível copiar a URL: " + error);
                    });
            }
        }
        
        // Limpa a conversa atual
        clearCurrentConversation() {
            App.currentConversation = null;
            App.currentConversation = null;
            
            // Atualiza a interface
            document.getElementById('message-area').innerHTML = 
                '<div class="empty-state">Selecione uma conversa para ver as mensagens</div>';
            document.getElementById('ai-message-area').innerHTML = 
                '<div class="empty-state">Informações da IA aparecerão aqui quando uma conversa estiver ativa</div>';
            document.getElementById('current-contact-name').textContent = 'Selecione uma conversa';
            document.getElementById('current-contact-avatar').innerHTML = '<div class="avatar-placeholder">?</div>';
            document.getElementById('toggle-mode-btn').style.display = 'none';
            
            // Remove seleção na lista de conversas
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Atualiza o estado salvo
            this.settings.lastConversation = null;
            this.saveSettings();
            
            // Atualiza a URL sem recarregar a página
            const url = new URL(window.location);
            url.searchParams.delete('phone');
            window.history.pushState({phone: null}, '', url);
        }
        
        // Configura sincronização entre abas
        setupTabSynchronization() {
            // Escuta eventos de storage para detectar mudanças em outras abas
            window.addEventListener('storage', (event) => {
                if (event.key === 'app_settings') {
                    console.log("Configurações alteradas em outra aba");
                    
                    try {
                        // Recarrega as configurações do localStorage
                        const newSettings = JSON.parse(event.newValue);
                        
                        // Atualiza apenas se forem diferentes das atuais
                        if (JSON.stringify(this.settings) !== JSON.stringify(newSettings)) {
                            // Preserva o ID desta aba
                            const currentTabId = this.settings.tabId;
                            
                            // Atualiza as configurações
                            this.settings = newSettings;
                            
                            // Restaura o ID desta aba
                            this.settings.tabId = currentTabId;
                            
                            // Atualiza contadores de não lidos
                            if (this.settings.unreadCounters) {
                            App.notificationManager.updateUnreadCounters(this.settings.unreadCounters);
                            }
                            // Se a conversa atual mudou, atualiza
                            if (App.currentConversation !== this.settings.lastConversation && this.settings.lastConversation) {
                                this.loadConversationIfExists(this.settings.lastConversation);
                            }
                        }
                    } catch (error) {
                        console.error("Erro ao processar alterações de outra aba:", error);
                    }
                }
            });
        }
        
        // Registra que esta aba está ativa
        registerTabActivity() {
            // Atualiza timestamp de última atividade
            this.settings.lastActive = Date.now();
            this.saveSettings();
            
            // Armazena também separadamente para outras abas consultarem
            localStorage.setItem(`tab_activity_${this.settings.tabId}`, this.settings.lastActive.toString());
            
            // Limpa registros de abas antigas (mais de 1 hora)
            this.cleanupOldTabs();
        }
        
        // Remove registros de abas inativas
        cleanupOldTabs() {
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith('tab_activity_')) {
                    const lastActive = parseInt(localStorage.getItem(key) || '0');
                    if (lastActive < oneHourAgo) {
                        localStorage.removeItem(key);
                    }
                }
            }
        }
        
        // Gera um UUID para identificação da aba
        generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        
        // Atualiza uma configuração específica
        updateSetting(key, value) {
            if (key in this.settings) {
                this.settings[key] = value;
                this.saveSettings();
                console.log(`Configuração ${key} atualizada para ${value}`);
                return true;
            }
            return false;
        }
        
        // Atualiza contadores de mensagens não lidas
        updateUnreadCounters(unreadCounts) {
            this.settings.unreadCounters = unreadCounts;
            this.saveSettings();
        }
        
        // Limpa todos os dados salvos
        clearAllData() {
            if (confirm("Tem certeza que deseja limpar todas as configurações salvas? Isso não afetará suas conversas.")) {
                localStorage.removeItem('app_settings');
                localStorage.removeItem('sse_client_id');
                
                // Remove também dados de atividade de abas
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('tab_activity_')) {
                        localStorage.removeItem(key);
                    }
                }
                
                // Recarrega a página para aplicar as configurações padrão
                window.location.reload();
            }
        }
        
        // Método para estender os métodos do App
        extendAppMethods() {
            console.log("Estendendo métodos do App com funcionalidades de persistência");
            
            // Salva referência ao método original de carregamento de conversa
            const originalLoadConversation = App.loadConversation;
            
            // Sobrescreve o método com versão que salva o estado
            App.loadConversation = function(phoneNumber) {
                // Chama o método original
                originalLoadConversation.call(App, phoneNumber);
                
                // Salva o estado da conversa
                if (App.persistenceHandler) {
                    App.persistenceHandler.saveCurrentConversation(phoneNumber);
                }
            };
            
            // Adiciona método para compartilhar conversa
            App.shareConversation = function() {
                if (App.persistenceHandler) {
                    App.persistenceHandler.shareConversationUrl();
                }
            };
            
            // Adiciona método para salvar configurações
            App.saveSetting = function(key, value) {
                if (App.persistenceHandler) {
                    return App.persistenceHandler.updateSetting(key, value);
                }
                return false;
            };
            
            // Adiciona método para obter configurações
            App.getSetting = function(key) {
                if (App.persistenceHandler && App.persistenceHandler.settings) {
                    return App.persistenceHandler.settings[key];
                }
                return null;
            };
            
            // Integração com o gerenciador de notificações
            if (App.notificationManager) {
                // Salva referência ao método original
                const originalUpdateTotalUnreadCount = App.notificationManager.updateTotalUnreadCount;
                
                // Sobrescreve o método para salvar contadores
                App.notificationManager.updateTotalUnreadCount = function() {
                    // Chama o método original
                    originalUpdateTotalUnreadCount.call(App.notificationManager);
                    
                    // Salva os contadores no persistenceHandler
                    if (App.persistenceHandler) {
                        App.persistenceHandler.updateUnreadCounters(this.unreadCounts);
                    }
                };
                
                // Adiciona método para atualizar contadores a partir do persistenceHandler
                App.notificationManager.updateUnreadCounters = function(counters) {
                    // Atualiza apenas se houver mudanças
                    if (JSON.stringify(this.unreadCounts) !== JSON.stringify(counters)) {
                        this.unreadCounts = {...counters};
                        this.updateTotalUnreadCount();
                        
                        // Atualiza badges na interface
                        for (const [phone, count] of Object.entries(this.unreadCounts)) {
                            this.updateConversationBadge(phone, count);
                        }
                    }
                };
                
                // Carrega contadores salvos
                if (App.persistenceHandler.settings.unreadCounters) {
                    App.notificationManager.updateUnreadCounters(App.persistenceHandler.settings.unreadCounters);
                }
            }
            
            // Adiciona comando para compartilhar conversa
            if (App.registerCommand) {
                App.registerCommand('compartilhar', {
                    description: 'Compartilhar link para esta conversa',
                    handler: () => App.shareConversation()
                });
            }
        }
    }
    
    // Adiciona estilos CSS necessários
    function addStyles() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* Estilos para compartilhamento */
            .share-button {
                background-color: #25D366;
                color: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                margin-left: 10px;
                transition: background-color 0.3s;
            }
            
            .share-button:hover {
                background-color: #128C7E;
            }
            
            /* Estilos para notificação de cópia */
            .copy-notification {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 1000;
                animation: fadeInOut 2s ease-in-out;
            }
            
            @keyframes fadeInOut {
                0% { opacity: 0; }
                20% { opacity: 1; }
                80% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(styleElement);
    }
    
    // Adiciona botão de compartilhamento à interface
    function addShareButton() {
        const headerActions = document.querySelector('.conversation-actions');
        if (!headerActions) return;
        
        // Verifica se o botão já existe
        if (headerActions.querySelector('.share-button')) return;
        
        // Cria o botão
        const shareButton = document.createElement('button');
        shareButton.className = 'share-button';
        shareButton.innerHTML = '<i class="fas fa-share-alt"></i>';
        shareButton.title = 'Compartilhar link para esta conversa';
        shareButton.onclick = () => App.shareConversation();
        
        // Adiciona à interface
        headerActions.appendChild(shareButton);
    }
    
    // Inicializa o módulo quando o documento estiver pronto
    function initialize() {
        console.log("Inicializando módulo persistence_handler.js");
        
        // Adiciona estilos CSS
        addStyles();
        
        // Adiciona botão de compartilhamento
        setTimeout(addShareButton, 500);
        
        // Instancia e expõe o gerenciador de persistência no objeto App
        App.persistenceHandler = new PersistenceHandler();
        
        // Observa mudanças na interface para adicionar botão de compartilhamento quando necessário
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && 
                    (mutation.target.classList.contains('header') || 
                     mutation.target.classList.contains('conversation-actions'))) {
                    addShareButton();
                }
            }
        });
        
        // Observa mudanças no header
        const header = document.querySelector('.header');
        if (header) {
            observer.observe(header, { childList: true, subtree: true });
        }
    }
    
    // Verifica se o documento já está carregado
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})(window.App || (window.App = {}));



