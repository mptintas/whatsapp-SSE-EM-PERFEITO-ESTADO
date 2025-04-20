from google.cloud import storage
import os
import json
import mimetypes
import sys

def migrar_conversas():
    """Migra arquivos de conversa do diretório local para o bucket GCS"""
    print("Iniciando migração de conversas...")
    
    storage_client = storage.Client()
    bucket = storage_client.bucket("aerial-acre-455118-a9-conversations")
    
    # Listar e fazer upload de todos os arquivos de conversa
    conversation_dir = "conversations"
    
    if not os.path.exists(conversation_dir):
        print(f"Diretório {conversation_dir} não encontrado!")
        return 0
    
    total_arquivos = 0
    
    for filename in os.listdir(conversation_dir):
        if filename.endswith('.json'):
            file_path = os.path.join(conversation_dir, filename)
            
            # Ler o arquivo
            try:
                with open(file_path, 'r', encoding='utf-8') as file:
                    data = json.load(file)
                
                # Criar blob e fazer upload
                blob = bucket.blob(filename)
                blob.upload_from_string(
                    json.dumps(data, ensure_ascii=False),
                    content_type='application/json'
                )
                print(f"Enviado {filename} para o GCS")
                total_arquivos += 1
            except Exception as e:
                print(f"Erro ao enviar {filename}: {str(e)}")
    
    print(f"Migração de conversas concluída. Total de {total_arquivos} arquivos enviados.")
    return total_arquivos

def migrar_media():
    """Migra arquivos de mídia do diretório local para o bucket GCS"""
    print("Iniciando migração de arquivos de mídia...")
    
    storage_client = storage.Client()
    bucket = storage_client.bucket("aerial-acre-455118-a9-media")
    
    media_dir = "media"
    
    if not os.path.exists(media_dir):
        print(f"Diretório {media_dir} não encontrado!")
        return 0
    
    total_arquivos = 0
    
    # Subdiretórios de mídia
    subdirs = ["images", "audio", "video", "documents"]
    
    for subdir in subdirs:
        full_subdir = os.path.join(media_dir, subdir)
        
        if not os.path.exists(full_subdir):
            print(f"Subdiretório {full_subdir} não encontrado, pulando...")
            continue
        
        for filename in os.listdir(full_subdir):
            file_path = os.path.join(full_subdir, filename)
            
            if os.path.isfile(file_path):
                try:
                    # Determinar o tipo MIME
                    mime_type, _ = mimetypes.guess_type(file_path)
                    if mime_type is None:
                        # Tipos comuns baseados no subdiretório
                        if subdir == "images":
                            mime_type = "image/jpeg"
                        elif subdir == "audio":
                            mime_type = "audio/ogg"
                        elif subdir == "video":
                            mime_type = "video/mp4"
                        elif subdir == "documents":
                            mime_type = "application/pdf"
                        else:
                            mime_type = "application/octet-stream"
                    
                    # Caminho relativo no bucket (ex: "images/foto.jpg")
                    gcs_path = f"{subdir}/{filename}"
                    
                    # Carregar o arquivo
                    with open(file_path, 'rb') as file_data:
                        # Criar blob e fazer upload
                        blob = bucket.blob(gcs_path)
                        blob.upload_from_file(
                            file_data,
                            content_type=mime_type
                        )
                        # Tornar o arquivo público
                        blob.make_public()
                        
                        print(f"Enviado {gcs_path} para o GCS como {mime_type}")
                        total_arquivos += 1
                except Exception as e:
                    print(f"Erro ao enviar {file_path}: {str(e)}")
    
    print(f"Migração de mídia concluída. Total de {total_arquivos} arquivos enviados.")
    return total_arquivos

def main():
    print("=== FERRAMENTA DE MIGRAÇÃO PARA GOOGLE CLOUD STORAGE ===")
    print("Certifique-se de que está autenticado no Google Cloud antes de continuar.")
    print("Este script irá migrar arquivos locais para os buckets do Google Cloud Storage.")
    print()
    
    while True:
        print("\nEscolha uma opção:")
        print("1 - Migrar apenas conversas (arquivos JSON)")
        print("2 - Migrar apenas arquivos de mídia (imagens, áudios, vídeos, documentos)")
        print("3 - Migrar tudo (conversas e mídia)")
        print("4 - Sair")
        
        escolha = input("\nDigite o número da opção desejada: ")
        
        if escolha == "1":
            migrar_conversas()
        elif escolha == "2":
            migrar_media()
        elif escolha == "3":
            total_conv = migrar_conversas()
            total_media = migrar_media()
            print(f"\nMigração completa! {total_conv} conversas e {total_media} arquivos de mídia enviados.")
        elif escolha == "4":
            print("Saindo...")
            break
        else:
            print("Opção inválida! Por favor, escolha uma opção válida.")

if __name__ == "__main__":
    main()