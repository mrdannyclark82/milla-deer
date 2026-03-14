import os
import json
import glob
import requests
import numpy as np
import time
from datetime import datetime
from typing import List, Dict

# CONFIG
MEMORY_DIR = os.path.dirname(os.path.abspath(__file__))
THOUGHT_ARCHIVES = os.path.join(MEMORY_DIR, "thought_archives")
CHAT_LOGS = os.path.join(MEMORY_DIR, "shared_chat.jsonl")
INDEX_PATH = os.path.join(MEMORY_DIR, "semantic_index.json")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip('"')

# Use text-embedding-004 (latest)
EMBEDDING_MODEL = "text-embedding-004"

def get_gemini_embedding(text: str) -> List[float]:
    """Generates embedding using Local Ollama (nomic-embed-text)."""
    try:
        import ollama
        # Truncate text to roughly fit within standard context limits (e.g., ~2000 chars)
        safe_text = text[:2000] if len(text) > 2000 else text
        response = ollama.embeddings(model="nomic-embed-text", prompt=safe_text)
        return response.get("embedding", [0.0] * 768)
    except Exception as e:
        print(f"[!] Embedding Error: {e}")
        return [0.0] * 768

def load_gim_logs():
    print("[*] Scanning GIM Logs (Thought Archives)...")
    logs = []
    files = glob.glob(os.path.join(THOUGHT_ARCHIVES, "*.md"))
    for f_path in files:
        try:
            with open(f_path, "r", encoding="utf-8") as f:
                content = f.read()
                # Split into meaningful chunks
                chunks = content.split("###") # Often GIM logs use headers
                for chunk in chunks:
                    clean_chunk = chunk.strip()
                    if len(clean_chunk) > 50:
                        logs.append({
                            "source": os.path.basename(f_path),
                            "type": "internal_monologue",
                            "content": clean_chunk,
                            "timestamp": datetime.fromtimestamp(os.path.getmtime(f_path)).isoformat()
                        })
        except Exception as e:
            print(f"[!] Error reading {f_path}: {e}")
    return logs

def load_chat_logs():
    print("[*] Scanning Chat Logs...")
    logs = []
    if os.path.exists(CHAT_LOGS):
        try:
            with open(CHAT_LOGS, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                        content = entry.get("content", "")
                        if len(content) > 30:
                            logs.append({
                                "source": "shared_chat.jsonl",
                                "type": "conversation",
                                "role": entry.get("role", "unknown"),
                                "content": content,
                                "timestamp": datetime.now().isoformat()
                            })
                    except: pass
        except Exception as e:
            print(f"[!] Error reading chat logs: {e}")
    return logs

def cosine_similarity(v1, v2):
    """Calculates the cosine similarity between two vectors."""
    dot_product = np.dot(v1, v2)
    norm_v1 = np.linalg.norm(v1)
    norm_v2 = np.linalg.norm(v2)
    if norm_v1 == 0 or norm_v2 == 0:
        return 0.0
    return dot_product / (norm_v1 * norm_v2)

def search_index(query: str, limit: int = 5) -> List[Dict]:
    """Searches the index for the most relevant context chunks."""
    if not os.path.exists(INDEX_PATH):
        return []
        
    query_vector = get_gemini_embedding(query)
    
    try:
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            index = json.load(f)
    except Exception as e:
        print(f"[!] Error loading index: {e}")
        return []
        
    # Calculate similarities
    results = []
    for item in index:
        sim = cosine_similarity(query_vector, item["vector"])
        results.append((sim, item))
        
    # Sort by similarity descending
    results.sort(key=lambda x: x[0], reverse=True)
    
    # Return top items
    return [res[1] for res in results[:limit]]

def build_index():
    data = load_gim_logs() + load_chat_logs()
    print(f"[*] Found {len(data)} items to index. Processing...")
    
    index = []
    
    if os.path.exists(INDEX_PATH):
        try:
            with open(INDEX_PATH, "r") as f:
                index = json.load(f)
                print(f"[*] Loaded {len(index)} existing entries.")
        except: pass
        
    existing_content = {item["content"] for item in index}
    
    new_items = 0
    # Process in small batches to respect rate limits if necessary
    for item in data:
        if item["content"] in existing_content:
            continue
            
        vector = get_gemini_embedding(item["content"])
        if vector:
            item["vector"] = vector
            index.append(item)
            new_items += 1
            if new_items % 20 == 0:
                print(f"[*] Indexed {new_items} new items... (Current Total: {len(index)})")
                # Intermittent saves to prevent data loss
                with open(INDEX_PATH, "w", encoding="utf-8") as f:
                    json.dump(index, f)
            
            # Rate limit mitigation
            time.sleep(0.1) 
                
    print(f"[*] Saving final index with {len(index)} total entries...")
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(index, f)
    print("[*] Semantic Integration Complete.")

if __name__ == "__main__":
    build_index()