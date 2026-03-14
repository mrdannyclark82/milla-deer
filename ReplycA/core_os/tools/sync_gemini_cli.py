
import sys
import os
import json
from pathlib import Path

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from core_os.memory.history import append_shared_messages

def import_gemini_interaction(role: str, content: str):
    """
    Imports a message from the Gemini CLI into the shared history.
    """
    message = {
        "role": role,
        "content": content,
        "source": "gemini_cli",
        "timestamp": "2026-02-13T10:00:00" # Approximate placeholder, or dynamic
    }
    try:
        append_shared_messages([message])
        print(f"[Success] Imported {role} message to shared history.")
    except Exception as e:
        print(f"[Error] Failed to import message: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python sync_gemini_cli.py <role> <content>")
        sys.exit(1)
    
    role = sys.argv[1]
    content = sys.argv[2]
    import_gemini_interaction(role, content)
