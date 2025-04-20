import os
import datetime
import tkinter as tk
from tkinter import filedialog, simpledialog, messagebox
from tkinter import ttk
import re

class BackupSelector:
    def __init__(self, root):
        self.root = root
        self.root.title("Seletor de Backup de Arquivos")
        self.root.geometry("800x600")
        self.root.minsize(700, 500)
        
        self.dir_path = ""
        self.selected_files = []
        self.file_display_map = {}  # Mapeia os caminhos de exibição para caminhos reais
        
        self.setup_ui()
    
    def setup_ui(self):
        # Frame principal
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Botão para selecionar diretório
        dir_frame = ttk.Frame(main_frame)
        dir_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.dir_label = ttk.Label(dir_frame, text="Selecione um diretório:")
        self.dir_label.pack(side=tk.LEFT, padx=(0, 10))
        
        ttk.Button(dir_frame, text="Escolher diretório", command=self.select_directory).pack(side=tk.LEFT)
        
        # Frame de filtro
        filter_frame = ttk.Frame(main_frame)
        filter_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Label(filter_frame, text="Filtrar arquivos:").pack(side=tk.LEFT, padx=(0, 10))
        self.filter_var = tk.StringVar()
        self.filter_entry = ttk.Entry(filter_frame, textvariable=self.filter_var)
        self.filter_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.filter_var.trace_add("write", lambda *args: self.filter_files())
        
        # Lista de arquivos
        files_frame = ttk.LabelFrame(main_frame, text="Arquivos disponíveis")
        files_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # Scrollbar para a lista de arquivos
        scrollbar = ttk.Scrollbar(files_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.files_list = tk.Listbox(files_frame, selectmode=tk.EXTENDED, yscrollcommand=scrollbar.set)
        self.files_list.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.files_list.yview)
        
        # Botões de ação
        buttons_frame = ttk.Frame(main_frame)
        buttons_frame.pack(fill=tk.X)
        
        ttk.Button(buttons_frame, text="Selecionar", command=self.add_to_selection).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(buttons_frame, text="Visualizar seleção", command=self.view_selection).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="Criar Backup", command=self.create_backup).pack(side=tk.RIGHT, padx=5)
    
    def select_directory(self):
        self.dir_path = filedialog.askdirectory(title="Selecione o diretório raiz")
        if self.dir_path:
            self.dir_label.config(text=f"Diretório: {self.dir_path}")
            self.populate_files_list()
    
    def populate_files_list(self):
        self.files_list.delete(0, tk.END)
        self.file_display_map.clear()
        
        if not self.dir_path:
            return
        
        for root, _, files in os.walk(self.dir_path):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.dir_path)
                
                # Armazena o mapeamento do caminho de exibição para o caminho real
                self.file_display_map[rel_path] = full_path
                self.files_list.insert(tk.END, rel_path)
        
        # Ordena a lista alfabeticamente
        file_items = list(self.files_list.get(0, tk.END))
        self.files_list.delete(0, tk.END)
        for item in sorted(file_items):
            self.files_list.insert(tk.END, item)
    
    def filter_files(self):
        filter_text = self.filter_var.get().lower()
        self.files_list.delete(0, tk.END)
        
        # Reaplica o filtro na lista completa de arquivos
        file_items = sorted(self.file_display_map.keys())
        for item in file_items:
            if filter_text in item.lower():
                self.files_list.insert(tk.END, item)
    
    def add_to_selection(self):
        selection = self.files_list.curselection()
        if not selection:
            messagebox.showinfo("Nenhuma seleção", "Por favor, selecione pelo menos um arquivo.")
            return
        
        for index in selection:
            display_path = self.files_list.get(index)
            full_path = self.file_display_map.get(display_path)
            if full_path and full_path not in self.selected_files:
                self.selected_files.append((display_path, full_path))
        
        messagebox.showinfo("Arquivos selecionados", f"{len(selection)} arquivo(s) adicionado(s) à seleção.")
    
    def view_selection(self):
        if not self.selected_files:
            messagebox.showinfo("Nenhuma seleção", "Nenhum arquivo selecionado ainda.")
            return
        
        # Criando uma nova janela para visualizar a seleção
        view_window = tk.Toplevel(self.root)
        view_window.title("Arquivos Selecionados")
        view_window.geometry("600x400")
        
        # Frame para lista e botões
        frame = ttk.Frame(view_window, padding="10")
        frame.pack(fill=tk.BOTH, expand=True)
        
        # Lista de arquivos selecionados
        ttk.Label(frame, text="Arquivos selecionados (nesta ordem):").pack(anchor=tk.W, pady=(0, 5))
        
        list_frame = ttk.Frame(frame)
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        scrollbar = ttk.Scrollbar(list_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        selected_list = tk.Listbox(list_frame, yscrollcommand=scrollbar.set)
        selected_list.pack(fill=tk.BOTH, expand=True)
        scrollbar.config(command=selected_list.yview)
        
        for display_path, _ in self.selected_files:
            selected_list.insert(tk.END, display_path)
        
        # Botões para manipular a ordem
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(fill=tk.X)
        
        ttk.Button(btn_frame, text="Mover para cima", 
                command=lambda: self.move_selected_item(selected_list, -1)).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(btn_frame, text="Mover para baixo", 
                command=lambda: self.move_selected_item(selected_list, 1)).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Remover", 
                command=lambda: self.remove_selected_item(selected_list)).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Fechar", 
                command=view_window.destroy).pack(side=tk.RIGHT)
    
    def move_selected_item(self, listbox, direction):
        selection = listbox.curselection()
        if not selection:
            return
        
        index = selection[0]
        if direction == -1 and index == 0:
            return  # Já está no topo
        if direction == 1 and index == len(self.selected_files) - 1:
            return  # Já está no final
        
        # Troca os itens na lista de seleção
        new_index = index + direction
        self.selected_files[index], self.selected_files[new_index] = self.selected_files[new_index], self.selected_files[index]
        
        # Atualiza a listbox
        display_paths = [display for display, _ in self.selected_files]
        listbox.delete(0, tk.END)
        for display_path in display_paths:
            listbox.insert(tk.END, display_path)
        
        # Mantém o item selecionado após a movimentação
        listbox.selection_set(new_index)
    
    def remove_selected_item(self, listbox):
        selection = listbox.curselection()
        if not selection:
            return
        
        index = selection[0]
        del self.selected_files[index]
        
        # Atualiza a listbox
        display_paths = [display for display, _ in self.selected_files]
        listbox.delete(0, tk.END)
        for display_path in display_paths:
            listbox.insert(tk.END, display_path)
    
    def create_backup(self):
        if not self.selected_files:
            messagebox.showinfo("Nenhuma seleção", "Selecione arquivos antes de criar um backup.")
            return
        
        # Pedir local e nome do arquivo de backup
        backup_file = filedialog.asksaveasfilename(
            title="Salvar arquivo de backup",
            defaultextension=".txt",
            filetypes=[("Arquivos de texto", "*.txt"), ("Todos os arquivos", "*.*")]
        )
        
        if not backup_file:
            return  # Usuário cancelou
        
        try:
            with open(backup_file, 'w', encoding='utf-8') as backup:
                timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                backup.write(f"# BACKUP CRIADO EM: {timestamp}\n")
                backup.write(f"# Total de arquivos: {len(self.selected_files)}\n\n")
                
                for i, (display_path, full_path) in enumerate(self.selected_files, 1):
                    try:
                        # Detecta a extensão do arquivo para usar o comentário apropriado
                        ext = os.path.splitext(display_path)[1].lower()
                        comment_start, comment_end = self.get_comment_style(ext)
                        
                        # Escreve o cabeçalho do arquivo
                        backup.write(f"{comment_start} INÍCIO DO ARQUIVO: {display_path} ({i}/{len(self.selected_files)}) {comment_end}\n")
                        
                        # Lê e escreve o conteúdo do arquivo
                        with open(full_path, 'r', encoding='utf-8', errors='replace') as file:
                            content = file.read()
                            backup.write(content)
                            
                            # Adiciona uma nova linha se o arquivo não terminar com uma
                            if content and content[-1] != '\n':
                                backup.write('\n')
                        
                        # Escreve o rodapé do arquivo
                        backup.write(f"{comment_start} FIM DO ARQUIVO: {display_path} {comment_end}\n\n")
                    
                    except Exception as e:
                        # Se houver erro ao ler um arquivo, adiciona uma mensagem de erro
                        backup.write(f"{comment_start} ERRO AO LER O ARQUIVO: {display_path} - {str(e)} {comment_end}\n\n")
                
                backup.write(f"# FIM DO BACKUP - {timestamp}\n")
            
            messagebox.showinfo("Backup criado", f"Backup de {len(self.selected_files)} arquivos criado com sucesso em:\n{backup_file}")
        
        except Exception as e:
            messagebox.showerror("Erro", f"Erro ao criar o arquivo de backup:\n{str(e)}")
    
    def get_comment_style(self, extension):
        """Retorna o estilo de comentário apropriado para a extensão de arquivo"""
        # Extensões que usam // para comentários
        if extension in ['.js', '.ts', '.java', '.c', '.cpp', '.cs', '.php']:
            return "//", ""
            
        # Extensões que usam # para comentários
        elif extension in ['.py', '.sh', '.rb', '.pl', '.yml', '.yaml']:
            return "#", ""
            
        # Extensões que usam <!-- --> para comentários
        elif extension in ['.html', '.xml', '.svg', '.md']:
            return "<!--", "-->"
            
        # Extensões que usam /* */ para comentários
        elif extension in ['.css', '.sass', '.scss', '.less']:
            return "/*", "*/"
            
        # Para todos os outros tipos de arquivo, use # como padrão
        else:
            return "#", ""


def main():
    root = tk.Tk()
    app = BackupSelector(root)
    root.mainloop()

if __name__ == "__main__":
    main()