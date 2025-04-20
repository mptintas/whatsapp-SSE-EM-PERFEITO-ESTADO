import json
import os
import random
import threading
import time

class APIKeyManager:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(APIKeyManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, config_file=None):
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        self._initialized = True
        self.api_keys = []
        self.key_usage = {}  # Para rastrear o uso de cada chave
        self.lock = threading.Lock()
        self.last_reload = time.time()
        self.reload_interval = 300  # Recarregar configuração a cada 5 minutos
        self.config_file = config_file
        
        # Carregar chaves
        self._load_api_keys(config_file)
    
    def _load_api_keys(self, config_file=None):
        """Carrega as chaves API de um arquivo de configuração ou variáveis de ambiente"""
        import os
        
        # Imprimir informações de diagnóstico
        current_dir = os.getcwd()
        print(f"Diretório de trabalho atual: {current_dir}")
        
        if config_file:
            # Verifica se o caminho é absoluto ou relativo
            if os.path.isabs(config_file):
                config_path = config_file
            else:
                config_path = os.path.join(current_dir, config_file)
                
            print(f"Tentando carregar arquivo de configuração: {config_path}")
            print(f"O arquivo existe? {os.path.exists(config_path)}")
            
            # Salva o caminho completo para recarregamentos futuros
            self.config_file = config_path
        else:
            # Se nenhum arquivo for especificado, usa o valor já armazenado
            config_path = self.config_file
        
        self.api_keys = []
        
        # Tentar carregar do arquivo de configuração
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    if "claude_api_keys" in config:
                        self.api_keys = config["claude_api_keys"]
                        print(f"Chaves Claude carregadas do arquivo: {len(self.api_keys)}")
                    elif "deepseek_api_keys" in config:  # Compatibilidade com nome anterior
                        self.api_keys = config["deepseek_api_keys"]
                        print(f"Chaves carregadas do arquivo (nome antigo): {len(self.api_keys)}")
            except Exception as e:
                print(f"Erro ao carregar chaves API do arquivo de configuração: {e}")
        
        # Se não encontrou chaves ou não tem arquivo de configuração, tenta variáveis de ambiente
        if not self.api_keys:
            i = 1
            while True:
                key_name = f"CLAUDE_API_KEY_{i}"
                if key_name in os.environ:
                    self.api_keys.append(os.environ[key_name])
                    i += 1
                else:
                    break
                    
            # Se também não encontrou nenhuma chave do Claude, tenta o formato antigo
            if not self.api_keys:
                i = 1
                while True:
                    key_name = f"DEEPSEEK_API_KEY_{i}"
                    if key_name in os.environ:
                        self.api_keys.append(os.environ[key_name])
                        i += 1
                    else:
                        break
        
        # Inicializar contadores de uso
        for key in self.api_keys:
            if key not in self.key_usage:
                self.key_usage[key] = {
                    "total_calls": 0,
                    "success_calls": 0,
                    "error_calls": 0,
                    "last_used": 0,
                    "active": True
                }
        
        print(f"Carregadas {len(self.api_keys)} chaves API")
    
    def maybe_reload_keys(self):
        """Verifica se é hora de recarregar as chaves"""
        current_time = time.time()
        if current_time - self.last_reload > self.reload_interval:
            self._load_api_keys(self.config_file)
            self.last_reload = current_time
    
    def _select_key_strategy(self):
        """Estratégia para selecionar a próxima chave API"""
        # Implementação de "Round Robin" com verificação de status
        active_keys = [k for k in self.api_keys if self.key_usage[k]["active"]]
        if not active_keys:
            # Reativar todas as chaves se todas estiverem inativas
            for key in self.api_keys:
                self.key_usage[key]["active"] = True
            active_keys = self.api_keys
        
        # Aqui você pode implementar diferentes estratégias:
        # 1. Round Robin (circular)
        # 2. Menos usado
        # 3. Mais recentemente usado
        # 4. Aleatório ponderado
        
        # Por simplicidade, usamos round robin básico:
        least_recently_used = sorted(active_keys, key=lambda k: self.key_usage[k]["last_used"])[0]
        return least_recently_used
    
    def get_api_key(self):
        """Obtém a próxima chave API disponível"""
        with self.lock:
            self.maybe_reload_keys()
            
            if not self.api_keys:
                raise Exception("Nenhuma chave API configurada")
            
            selected_key = self._select_key_strategy()
            self.key_usage[selected_key]["last_used"] = time.time()
            self.key_usage[selected_key]["total_calls"] += 1
            
            return selected_key
    
    def report_success(self, api_key):
        """Registra um uso bem-sucedido da chave API"""
        with self.lock:
            if api_key in self.key_usage:
                self.key_usage[api_key]["success_calls"] += 1
    
    def report_error(self, api_key, error_type=None):
        """Registra um erro no uso da chave API"""
        with self.lock:
            if api_key in self.key_usage:
                self.key_usage[api_key]["error_calls"] += 1
                
                # Desativar temporariamente a chave para certos tipos de erro
                if error_type in ["rate_limit", "quota_exceeded", "invalid_key", "authentication_error"]:
                    self.key_usage[api_key]["active"] = False
                    print(f"Chave API {api_key[:8]}... desativada temporariamente devido a erro: {error_type}")