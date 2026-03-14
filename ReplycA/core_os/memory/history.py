import json
from pathlib import Path

# Path is relative to this file: core_os/memory/history.py
SHARED_CHAT_FILE = Path(__file__).parent / "shared_chat.jsonl"

def load_shared_history(limit: int = 50):
    if not SHARED_CHAT_FILE.exists():
        try:
            SHARED_CHAT_FILE.parent.mkdir(parents=True, exist_ok=True)
            SHARED_CHAT_FILE.touch(exist_ok=True)
        except Exception as e:
            print(f"[history] failed to init history file: {e}")
            return []
        return []
    try:
        lines = SHARED_CHAT_FILE.read_text().strip().splitlines()
        items = [json.loads(line) for line in lines if line.strip()]
        return items[-limit:]
    except Exception:
        return []


def append_shared_messages(messages):
    try:
        SHARED_CHAT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with SHARED_CHAT_FILE.open("a") as f:
            for msg in messages:
                f.write(json.dumps(msg) + "\n")
    except Exception as e:
        print(f"[shared_chat] failed to append: {e}")
