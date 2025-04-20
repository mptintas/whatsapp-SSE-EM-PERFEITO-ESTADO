/**
 * Módulo de gerenciamento de mídia com gravação de áudio - Adaptado para Google Cloud Storage
 */
(function(App) {
    console.log("Media.js: Inicializando módulo de mídia");
    console.log("Bibliotecas disponíveis:", {
        Recorder: typeof Recorder !== 'undefined',
        OpusRecorder: typeof OpusRecorder !== 'undefined',
        RecorderExists: typeof window.Recorder !== 'undefined'
      });

    // Variáveis para controle de gravação de áudio
    App.audioRecorder = null;
    App.audioChunks = [];
    App.isRecording = false;
    App.recordingTimer = null;
    App.recordingDuration = 0;
    App.recordingStream = null;

    // Inicializa o recorder de forma simplificada
    App.initRecorder = function() {
        console.log("Iniciando setup do recorder de áudio");
        
        // Verifica se a biblioteca está disponível
        if (typeof Recorder === 'undefined') {
            console.error("ERRO: Biblioteca Recorder não encontrada no escopo global");
            return Promise.reject(new Error("Biblioteca Opus-Recorder não encontrada. Verifique se o script foi carregado corretamente."));
        }
        
        console.log("Biblioteca Recorder encontrada:", Recorder);
        
        // Se já tivermos um recorder, apenas retorna
        if (App.audioRecorder) {
            console.log("Recorder já inicializado, reutilizando");
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            console.log("Solicitando permissão para acessar o microfone...");
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    console.log("Permissão de microfone concedida, configurando recorder");
                    
                    // Armazena o stream para fechar depois
                    App.recordingStream = stream;
                    
                    try {
                        // Configura o recorder com configurações mais simples
                        App.audioRecorder = new Recorder({
                            encoderPath: '/static/encoderWorker.min.js',  // Caminho relativo ao seu servidor
                            leaveStreamOpen: true,
                            numberOfChannels: 1,
                            encoderSampleRate: 16000,
                            encoderApplication: 2048
                        });
                        
                        // Inicializa com o stream de áudio
                        App.audioRecorder.ondataavailable = (typedArray) => {
                            console.log("Dados de áudio disponíveis:", typedArray.length, "bytes");
                        };
                        
                        App.audioRecorder.onstart = () => {
                            console.log("Gravação de áudio iniciada");
                        };
                        
                        App.audioRecorder.onstop = () => {
                            console.log("Gravação de áudio finalizada");
                        };
                        
                        App.audioRecorder.onerror = (err) => {
                            console.error("Erro no recorder:", err);
                        };
                        
                        App.audioRecorder.start(stream);
                        console.log("Recorder inicializado com sucesso");
                        resolve();
                    } catch (error) {
                        console.error("Erro ao configurar recorder:", error);
                        reject(error);
                    }
                })
                .catch(error => {
                    console.error('Erro ao acessar microfone:', error);
                    reject(error);
                });
        });
    };

    // Função de abertura do modal de áudio
    App.openMediaUpload = function(type) {
        console.log("openMediaUpload chamado com tipo:", type);

        // Se for áudio, abre o modal de gravação
        if (type === 'audio') {
            console.log("Abrindo modal de gravação de áudio");
            App.openAudioRecorder();
            return;
        }
        
        // Resto do código original para outros tipos de mídia
        App.mediaType = type;
        
        const typeNames = {
            'image': 'Imagem',
            'audio': 'Áudio',
            'video': 'Vídeo',
            'document': 'Documento'
        };
        document.getElementById('upload-title').textContent = `Enviar ${typeNames[type] || 'Mídia'}`;
        
        const fileInput = document.getElementById('media-file');
        switch (type) {
            case 'image':
                fileInput.accept = 'image/*';
                break;
            case 'audio':
                fileInput.accept = 'audio/*';
                break;
            case 'video':
                fileInput.accept = 'video/*';
                break;
            case 'document':
                fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.txt';
                break;
        }
        
        fileInput.value = '';
        document.getElementById('media-caption').value = '';
        
        document.getElementById('media-upload-modal').style.display = 'block';
    };

    // Upload de mídia - Adaptado para Google Cloud Storage
    App.uploadMedia = function() {
        console.log("Iniciando upload de mídia");
        
        if (!App.currentPhone) {
            alert("Selecione uma conversa primeiro!");
            App.closeModal();
            return;
        }
        
        const fileInput = document.getElementById('media-file');
        const caption = document.getElementById('media-caption').value.trim();
        
        if (!fileInput.files || !fileInput.files[0]) {
            alert("Selecione um arquivo!");
            return;
        }
        
        // Bloquear o botão durante o upload
        const uploadBtn = document.getElementById('upload-media-btn');
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Enviando...';
        
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        
        fetch('/upload_media', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            console.log("Resposta do upload:", response);
            if (!response.ok) {
                throw new Error("Erro ao fazer upload: " + response.statusText);
            }
            return response.json();
        })
        .then(result => {
            console.log("Resultado do upload:", result);
            
            if (result.status === 'success') {
                // Fecha o modal primeiro
                App.closeModal();
                
                // Armazena informações da mídia para envio
                // Nenhuma modificação necessária aqui, o backend já retorna o caminho correto
                App.mediaInfo = {
                    path: result.media_path,
                    type: result.media_type
                };
                
                // Define a legenda no campo de mensagem se houver
                if (caption) {
                    document.getElementById('message-input').value = caption;
                }
                
                // Envia a mensagem
                App.sendMessage();
            } else {
                alert("Erro ao fazer upload: " + (result.message || "Erro desconhecido"));
            }
        })
        .catch(error => {
            console.error("Erro ao fazer upload:", error);
            alert("Erro ao fazer upload: " + error.message);
        })
        .finally(() => {
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Enviar';
        });
    };

    // Função simplificada para abrir modal de gravação de áudio
    App.openAudioRecorder = function() {
        console.log("Método openAudioRecorder chamado");

        // Verifica se o modal de gravação já existe
        let audioRecorderModal = document.getElementById('audio-recorder-modal');
        
        // Se não existir, cria o modal simplificado
        if (!audioRecorderModal) {
            console.log("Criando novo modal de gravação de áudio");
            audioRecorderModal = document.createElement('div');
            audioRecorderModal.id = 'audio-recorder-modal';
            audioRecorderModal.className = 'modal';
            audioRecorderModal.innerHTML = `
                <div class="modal-content audio-recorder">
                    <span class="close" onclick="App.closeAudioRecorder()">&times;</span>
                    <h3>Gravar Mensagem de Voz</h3>
                    
                    <div class="recording-timer" id="recording-timer">00:00</div>
                    
                    <div class="audio-controls">
                        <button id="start-recording-btn" class="recording-btn" onclick="App.startRecording()">
                            <i class="fas fa-microphone"></i> Iniciar Gravação
                        </button>
                        <button id="stop-recording-btn" class="recording-btn" style="display: none;" onclick="App.stopRecording()">
                            <i class="fas fa-stop"></i> Parar Gravação
                        </button>
                        <button id="cancel-recording-btn" class="cancel-btn" onclick="App.cancelRecording()">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                    
                    <div id="audio-preview" class="audio-preview" style="display: none;">
                        <audio id="recorded-audio" controls></audio>
                        <div class="preview-controls">
                            <button onclick="App.redoRecording()">
                                <i class="fas fa-redo"></i> Regravar
                            </button>
                            <button onclick="App.sendRecordedAudio()">
                                <i class="fas fa-paper-plane"></i> Enviar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Adiciona o modal ao documento
            document.body.appendChild(audioRecorderModal);
        }
        
        // Limpa estados anteriores
        App.audioChunks = [];
        App.isRecording = false;
        App.recordingDuration = 0;
        document.getElementById('recording-timer').textContent = '00:00';
        
        // Esconde o preview se estava visível
        const audioPreview = document.getElementById('audio-preview');
        if (audioPreview) {
            audioPreview.style.display = 'none';
        }
        
        // Exibe o modal
        console.log("Exibindo modal de gravação de áudio");
        audioRecorderModal.style.display = 'block';
        
        // Botões de controle
        const startBtn = document.getElementById('start-recording-btn');
        const stopBtn = document.getElementById('stop-recording-btn');
        
        if (startBtn) startBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
    };

    // Função para iniciar a gravação
    App.startRecording = function() {
        console.log("Iniciando gravação de áudio");
        
        // Limpa os chunks anteriores
        App.audioChunks = [];
        
        // Inicializa o recorder se necessário
        App.initRecorder()
            .then(() => {
                // Inicia a gravação
                App.audioRecorder.start();
                App.isRecording = true;
                
                // Atualiza a interface
                const startBtn = document.getElementById('start-recording-btn');
                const stopBtn = document.getElementById('stop-recording-btn');
                
                if (startBtn) startBtn.style.display = 'none';
                if (stopBtn) stopBtn.style.display = 'inline-block';
                
                // Inicia o timer
                App.recordingDuration = 0;
                App.recordingTimer = setInterval(function() {
                    App.recordingDuration++;
                    const minutes = Math.floor(App.recordingDuration / 60);
                    const seconds = App.recordingDuration % 60;
                    document.getElementById('recording-timer').textContent = 
                        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }, 1000);
            })
            .catch(error => {
                alert('Não foi possível iniciar a gravação: ' + error.message);
                console.error('Erro ao iniciar gravação:', error);
            });
    };

    // Função para parar a gravação
    App.stopRecording = function() {
        console.log("Parando gravação de áudio");
        if (App.audioRecorder && App.isRecording) {
            App.isRecording = false;
            
            // Para o timer
            clearInterval(App.recordingTimer);
            
            // Para a gravação e recebe o blob
            App.audioRecorder.stop();
            
            // Configura o evento para obter os dados gravados
            App.audioRecorder.ondataavailable = function(typedArray) {
                // Cria um blob OGG/Opus compatível com WhatsApp
                const audioBlob = new Blob([typedArray], { type: 'audio/ogg;' });
                console.log("Áudio OGG/Opus criado:", audioBlob.size, "bytes");
                
                // Cria URL e atualiza reprodutor de áudio
                const audioUrl = URL.createObjectURL(audioBlob);
                const audioPreview = document.getElementById('audio-preview');
                const recordedAudio = document.getElementById('recorded-audio');
                
                if (audioPreview && recordedAudio) {
                    recordedAudio.src = audioUrl;
                    audioPreview.style.display = 'block';
                }
                
                // Armazena o blob para envio
                App.recordedAudioBlob = audioBlob;
            };
        }
    };

    // Cancela a gravação
    App.cancelRecording = function() {
        console.log("Cancelando gravação de áudio");
        if (App.isRecording) {
            if (App.audioRecorder) {
                App.audioRecorder.stop();
            }
            App.isRecording = false;
            
            // Para o timer
            clearInterval(App.recordingTimer);
        }
        
        // Interrompe o stream
        App.stopAudioStream();
        
        // Fecha o modal
        App.closeAudioRecorder();
    };

    // Fecha o modal de gravação de áudio
    App.closeAudioRecorder = function() {
        console.log("Fechando modal de gravação de áudio");
        // Interrompe a gravação se estiver em andamento
        if (App.isRecording) {
            App.cancelRecording();
        }
        
        // Fecha o modal
        const modal = document.getElementById('audio-recorder-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    // Reinicia a gravação
    App.redoRecording = function() {
        console.log("Refazendo gravação");
        // Esconde o preview
        const audioPreview = document.getElementById('audio-preview');
        if (audioPreview) {
            audioPreview.style.display = 'none';
        }
        
        // Reseta o timer
        App.recordingDuration = 0;
        document.getElementById('recording-timer').textContent = '00:00';
        
        // Exibe o botão de iniciar
        const startBtn = document.getElementById('start-recording-btn');
        const stopBtn = document.getElementById('stop-recording-btn');
        
        if (startBtn) startBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
    };

    // Interrompe o stream de áudio
    App.stopAudioStream = function() {
        console.log("Parando stream de áudio");
        if (App.recordingStream) {
            App.recordingStream.getTracks().forEach(track => track.stop());
            App.recordingStream = null;
        }
    };

    // Função para enviar o áudio
    App.sendRecordedAudio = function() {
        console.log("Enviando áudio gravado");
        if (!App.recordedAudioBlob) {
            console.error('Nenhum áudio disponível para envio');
            alert('Nenhum áudio disponível para envio');
            return;
        }
        
        if (!App.currentPhone) {
            console.error('Nenhuma conversa selecionada');
            alert("Selecione uma conversa primeiro!");
            App.closeAudioRecorder();
            return;
        }
        
        // Mostra indicador de carregamento
        document.getElementById('audio-preview').innerHTML = '<div class="loading">Enviando áudio...</div>';
        
        // Criar FormData com o arquivo OGG
        const formData = new FormData();
        formData.append('file', App.recordedAudioBlob, `637338086121702_${Date.now()}.oga`);
        
        // Enviar para o servidor
        fetch('/upload_media', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            console.log("Resposta do upload:", response.status, response.statusText);
            if (!response.ok) {
                throw new Error("Erro ao fazer upload: " + response.statusText);
            }
            return response.json();
        })
        .then(result => {
            console.log("Resultado do upload:", result);
            if (result.status === 'success') {
                console.log(`Áudio OGG enviado com sucesso para GCS: ${result.media_path}`);
                // Fecha o modal primeiro
                App.closeAudioRecorder();
                
                // Envia a mensagem diretamente ao servidor
                return fetch('/send_message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        to_number: App.currentPhone,
                        message: "", // Sem legenda
                        media_path: result.media_path,
                        media_type: 'audio'
                    })
                });
            } else {
                throw new Error("Erro ao fazer upload: " + (result.message || "Erro desconhecido"));
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Erro ao enviar mensagem: " + response.statusText);
            }
            return response.json();
        })
        .then(sendResult => {
            console.log("Resultado do envio de mensagem:", sendResult);
            if (sendResult.status === 'success') {
                // Recarrega a conversa para exibir a nova mensagem
                setTimeout(() => {
                    App.loadConversation(App.currentPhone);
                }, 500);
            } else {
                alert("Erro ao enviar áudio: " + (sendResult.message || "Erro desconhecido"));
            }
        })
        .catch(error => {
            console.error("Erro completo:", error);
            alert("Erro ao enviar áudio: " + error.message);
            App.closeAudioRecorder();
        });
    };
})(window.App || (window.App = {}));