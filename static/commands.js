/**
 * Módulo para gerenciamento de comandos
 * Funções relacionadas aos comandos rápidos (/comando)
 */

// Extende o objeto App com as funções de comandos
(function(App) {
    
    // Propriedades para o menu de comandos
    App.commandMenuVisible = false;
    App.availableCommands = [
        { command: '/location', description: 'Compartilhar localização atual' },
        { command: '/arquivo', description: 'Enviar um documento ou arquivo' },
        { command: '/foto', description: 'Enviar uma foto da galeria' },
        { command: '/camera', description: 'Tirar uma foto com a câmera' },
        { command: '/audio', description: 'Enviar um áudio' },
        { command: '/limpar', description: 'Limpar esta conversa' }
    ];
    
    // Exibe o menu de comandos
    App.showCommandMenu = function() {
        // Remove o menu existente se houver
        const existingMenu = document.getElementById('command-menu');
        if (existingMenu) existingMenu.remove();
        
        // Cria o menu de comandos
        const menu = document.createElement('div');
        menu.id = 'command-menu';
        menu.className = 'command-menu';
        
        // Popula o menu com os comandos disponíveis
        let menuContent = '<div class="menu-header">Comandos Disponíveis</div>';
        this.availableCommands.forEach(cmd => {
            menuContent += `
                <div class="command-item" onclick="App.executeCommand('${cmd.command}')">
                    <div class="command-name">${cmd.command}</div>
                    <div class="command-description">${cmd.description}</div>
                </div>
            `;
        });
        
        menu.innerHTML = menuContent;
        
        // Posiciona o menu abaixo do campo de entrada
        const inputArea = document.querySelector('.input-area');
        inputArea.appendChild(menu);
        
        this.commandMenuVisible = true;
    };
    
    // Filtra os comandos pelo texto digitado
    App.filterCommands = function(query) {
        const menu = document.getElementById('command-menu');
        if (!menu) return;
        
        // Filtra os comandos pelo texto digitado
        const filteredCommands = this.availableCommands
            .filter(cmd => cmd.command.includes(query) || cmd.description.toLowerCase().includes(query.toLowerCase()));
        
        if (filteredCommands.length === 0) {
            this.hideCommandMenu();
            return;
        }
        
        // Atualiza o menu com os comandos filtrados
        let menuContent = '<div class="menu-header">Comandos Disponíveis</div>';
        filteredCommands.forEach(cmd => {
            menuContent += `
                <div class="command-item" onclick="App.executeCommand('${cmd.command}')">
                    <div class="command-name">${cmd.command}</div>
                    <div class="command-description">${cmd.description}</div>
                </div>
            `;
        });
        
        menu.innerHTML = menuContent;
    };
    
    // Esconde o menu de comandos
    App.hideCommandMenu = function() {
        const menu = document.getElementById('command-menu');
        if (menu) menu.remove();
        this.commandMenuVisible = false;
    };
    
    // Executa um comando específico
    App.executeCommand = function(command) {
        const messageInput = document.getElementById('message-input');
        
        switch (command) {
            case '/location':
                // Solicita a localização do usuário
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            // Armazena temporariamente a localização
                            window.App.currentLocation = {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            };
                            
                            // Atualiza o campo de mensagem
                            messageInput.value = '/location - Clique em enviar para compartilhar sua localização atual';
                            
                            // Destaca o botão de enviar
                            document.getElementById('send-button').classList.add('highlight');
                        },
                        (error) => {
                            alert(`Erro ao obter localização: ${error.message}`);
                        }
                    );
                } else {
                    alert("Seu navegador não suporta geolocalização");
                }
                break;
                
            case '/arquivo':
                App.openMediaUpload('document');
                break;
                
            case '/foto':
                App.openMediaUpload('image');
                break;
                
            case '/camera':
                // Abre a câmera para tirar foto
                const cameraInput = document.createElement('input');
                cameraInput.type = 'file';
                cameraInput.accept = 'image/*';
                cameraInput.capture = 'camera';
                cameraInput.click();
                
                cameraInput.addEventListener('change', function() {
                    if (this.files && this.files[0]) {
                        // Simula o upload da imagem da câmera
                        const formData = new FormData();
                        formData.append('file', this.files[0]);
                        
                        fetch('/upload_media', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.status === 'success') {
                                window.App.mediaInfo = {
                                    path: data.media_path,
                                    type: data.media_type
                                };
                                window.App.sendMessage();
                            }
                        });
                    }
                });
                break;
                
            case '/audio':
                App.openMediaUpload('audio');
                break;
                
            case '/limpar':
                if (window.App.currentPhone && confirm("Tem certeza que deseja limpar esta conversa?")) {
                    document.getElementById('message-area').innerHTML = 
                        '<div class="empty-state">Conversa limpa</div>';
                    // Implementação futura para limpar no backend
                }
                break;
                
            default:
                // Se não for um comando conhecido, apenas escreve no campo
                messageInput.value = command;
        }
        
        this.hideCommandMenu();
    };
    
})(window.App || (window.App = {}));