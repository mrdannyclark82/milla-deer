import os
import json
from datetime import datetime
from pathlib import Path

# Paths to critical state files
NEURO_STATE_FILE = Path("core_os/memory/neuro_state.json")
SEMANTIC_INDEX_FILE = Path("core_os/memory/semantic_index.json")
# Agent task files will be dynamically identified in the DATA_DIR

def save_checkpoint():
    """
    Saves the current critical state of Milla's neural network and task queues.
    This creates a snapshot for system resilience and recovery.
    """
    print("[*] Initiating System Checkpoint...")

    # Ensure memory directory exists
    NEURO_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

    checkpoint_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    checkpoint_dir = Path("core_os/memory/checkpoints") / checkpoint_timestamp
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # 1. Neuro-State
    if NEURO_STATE_FILE.exists():
        try:
            with open(NEURO_STATE_FILE, 'r') as f:
                neuro_state = json.load(f)
            with open(checkpoint_dir / NEURO_STATE_FILE.name, 'w') as f:
                json.dump(neuro_state, f, indent=4)
            print(f"  [+] Neuro-State saved to {checkpoint_dir / NEURO_STATE_FILE.name}")
        except Exception as e:
            print(f"  [!] Failed to save Neuro-State: {e}")
    else:
        print("  [.] Neuro-State file not found. Skipping.")

    # 2. Semantic Index
    if SEMANTIC_INDEX_FILE.exists():
        try:
            with open(SEMANTIC_INDEX_FILE, 'r') as f:
                semantic_index = json.load(f)
            with open(checkpoint_dir / SEMANTIC_INDEX_FILE.name, 'w') as f:
                json.dump(semantic_index, f, indent=4)
            print(f"  [+] Semantic Index saved to {checkpoint_dir / SEMANTIC_INDEX_FILE.name}")
        except Exception as e:
            print(f"  [!] Failed to save Semantic Index: {e}")
    else:
        print("  [.] Semantic Index file not found. Skipping.")

    # 3. Agent Task Queues (coding, research, utility)
    try:
        import core_os.agents.security_utils as su
        DATA_DIR = su.DATA_DIR
        
        task_files = ["coding_tasks.json", "research_tasks.json", "utility_tasks.json"]
        
        for task_file_name in task_files:
            source_path = Path(DATA_DIR) / task_file_name
            if source_path.exists():
                try:
                    with open(source_path, 'r') as f:
                        tasks = json.load(f)
                    with open(checkpoint_dir / source_path.name, 'w') as f:
                        json.dump(tasks, f, indent=4)
                    print(f"  [+] Agent Tasks ({task_file_name}) saved to {checkpoint_dir / source_path.name}")
                except Exception as e:
                    print(f"  [!] Failed to save {task_file_name}: {e}")
            else:
                print(f"  [.] {task_file_name} not found. Skipping.")
    except Exception as e:
        print(f"  [!] Failed to access agent task data directory: {e}")

    print("[*] Checkpoint Complete.")

def load_latest_checkpoint():
    """
    Loads the latest available checkpoint.
    """
    print("[*] Initiating Checkpoint Recovery...")
    checkpoints_root = Path("core_os/memory/checkpoints")
    if not checkpoints_root.exists() or not any(checkpoints_root.iterdir()):
        print("[.] No checkpoints found. Starting fresh.")
        return False

    latest_checkpoint_dir = max(checkpoints_root.iterdir(), key=os.path.getmtime)
    print(f"  [+] Loading from latest checkpoint: {latest_checkpoint_dir}")

    # 1. Neuro-State
    checkpoint_neuro = latest_checkpoint_dir / NEURO_STATE_FILE.name
    if checkpoint_neuro.exists():
        try:
            with open(checkpoint_neuro, 'r') as f:
                neuro_state = json.load(f)
            with open(NEURO_STATE_FILE, 'w') as f:
                json.dump(neuro_state, f, indent=4)
            print("  [+] Neuro-State restored.")
        except Exception as e:
            print(f"  [!] Failed to restore Neuro-State: {e}")

    # 2. Semantic Index
    checkpoint_semantic = latest_checkpoint_dir / SEMANTIC_INDEX_FILE.name
    if checkpoint_semantic.exists():
        try:
            with open(checkpoint_semantic, 'r') as f:
                semantic_index = json.load(f)
            with open(SEMANTIC_INDEX_FILE, 'w') as f:
                json.dump(semantic_index, f, indent=4)
            print("  [+] Semantic Index restored.")
        except Exception as e:
            print(f"  [!] Failed to restore Semantic Index: {e}")

    # 3. Agent Task Queues
    try:
        import core_os.agents.security_utils as su
        DATA_DIR = su.DATA_DIR
        Path(DATA_DIR).mkdir(parents=True, exist_ok=True) # Ensure data dir exists
        
        task_files = ["coding_tasks.json", "research_tasks.json", "utility_tasks.json"]
        
        for task_file_name in task_files:
            checkpoint_task = latest_checkpoint_dir / task_file_name
            if checkpoint_task.exists():
                try:
                    with open(checkpoint_task, 'r') as f:
                        tasks = json.load(f)
                    with open(Path(DATA_DIR) / task_file_name, 'w') as f:
                        json.dump(tasks, f, indent=4)
                    print(f"  [+] Agent Tasks ({task_file_name}) restored.")
                except Exception as e:
                    print(f"  [!] Failed to restore {task_file_name}: {e}")
    except Exception as e:
        print(f"  [!] Failed to access agent task data directory for restore: {e}")

    print("[*] Checkpoint Recovery Complete.")
    return True

if __name__ == "__main__":
    print("--- Testing Checkpoint Manager ---")
    save_checkpoint()
    print("--- Testing Checkpoint Recovery ---")
    load_latest_checkpoint()
    
