import requests
import os
import json
import time
from datetime import datetime
try:
    from dotenv import load_dotenv
    load_dotenv()
except: pass

import sys
# Adjust sys.path to find nexus_aio.py from RAYNE-Admin/milla_telegram_relay.py
# Assuming RAYNE-Admin is the current working directory, or its parent is the project root
# If this script is run from RAYNE-Admin, its parent (project root) is needed for nexus_aio
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)
# Also add RAYNE-Admin itself to path if main.py (nexus_aio) might be there
RAYNE_ADMIN_DIR = os.path.dirname(os.path.abspath(__file__))
if RAYNE_ADMIN_DIR not in sys.path:
    sys.path.append(RAYNE_ADMIN_DIR)

# Import Milla's main brain functions (assuming nexus_aio is the new main)
from core_os.memory.history import load_shared_history, append_shared_messages

def get_brain_response(text, history):
    """Lazy-load the brain response to avoid circular imports."""
    try:
        # Check for nexus_aio (async)
        import nexus_aio
        # Since nexus_aio.handle_chat is async, we might need a sync wrapper or use its local_llm_process
        # For now, we'll try to use a simplified synchronous call if available, 
        # or mock it if we're in a sync context called from an async loop.
        from core_os.actions import local_llm_process
        reply = local_llm_process(f"Incoming Telegram from Architect: {text}")
        return reply, None
    except ImportError:
        return "Brain offline.", None

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BASE_URL = f"https://api.telegram.org/bot{TOKEN}"
OFFSET_FILE = "core_os/memory/telegram_offset.txt"

def get_offset():
    if os.path.exists(OFFSET_FILE):
        with open(OFFSET_FILE, "r") as f:
            return int(f.read().strip())
    return 0

def save_offset(offset):
    with open(OFFSET_FILE, "w") as f:
        f.write(str(offset))

def send_telegram_message(chat_id, text):
    """Sends a message to a specific chat ID via Telegram."""
    if not TOKEN:
        print("[Telegram] Error: TELEGRAM_BOT_TOKEN not set.")
        return False
    
    url = f"{BASE_URL}/sendMessage"
    
    # Telegram limit is 4096. We split at 4000 to be safe.
    MAX_LEN = 4000
    
    if len(text) <= MAX_LEN:
        payload = {"chat_id": chat_id, "text": text}
        try:
            requests.post(url, json=payload)
            return True
        except Exception as e:
            print(f"[Telegram] Send Error: {e}")
            return False
    else:
        # Split into chunks
        chunks = [text[i:i+MAX_LEN] for i in range(0, len(text), MAX_LEN)]
        success = True
        for i, chunk in enumerate(chunks):
            footer = f"\n\n(Part {i+1}/{len(chunks)})"
            payload = {"chat_id": chat_id, "text": chunk + footer}
            try:
                requests.post(url, json=payload)
                time.sleep(0.5) # Prevent rate limiting
            except Exception as e:
                print(f"[Telegram] Send Error (chunk {i+1}): {e}")
                success = False
        return success

def process_telegram_updates():
    """Polls Telegram for new messages and processes them."""
    if not TOKEN:
        print("[Telegram] Error: TELEGRAM_BOT_TOKEN not set. Cannot process updates.")
        return
        
    offset = get_offset()
    url = f"{BASE_URL}/getUpdates?offset={offset + 1}&timeout=10"
    
    try:
        response = requests.get(url)
        data = response.json()
        
        if not data.get("ok"):
            print(f"[Telegram] API Error: {data}")
            return

        for result in data.get("result", []):
            update_id = result["update_id"]
            save_offset(update_id)
            
            message = result.get("message", {})
            chat_id = message.get("chat", {}).get("id")
            text = message.get("text", "")
            sender = message.get("from", {}).get("first_name", "D-Ray")
            
            if not text: continue
            
            print(f"[Telegram] Msg from {sender}: {text}")
            
            # 1. Log to Milla's Memory
            # Make sure this is the same chat_id as the Architect's for reply
            # For now, we assume the incoming chat_id is the Architect's target chat
            os.environ["TELEGRAM_CHAT_ID"] = str(chat_id) # Temporarily set to allow replies
            
            history = load_shared_history(limit=10) # Get recent history for context
            
            # Add user message to shared history
            append_shared_messages([{
                "role": "user", 
                "content": f"[Via Telegram] {text}", 
                "source": "telegram"
            }])
            
            # 2. Generate Reply using Milla's brain
            reply, _ = get_brain_response(text, history)
            
            # 3. Send Reply back to Telegram
            if send_telegram_message(chat_id, reply):
                print(f"[Telegram] Replied: {reply}")
                # Log assistant reply
                append_shared_messages([{
                    "role": "assistant", 
                    "content": reply, 
                    "source": "telegram"
                }])
            else:
                print("[Telegram] Failed to send reply.")

    except Exception as e:
        print(f"[Telegram] Poll Error: {e}")

if __name__ == "__main__":
    print("[*] Milla Telegram Relay Active (Single Run Mode for Testing)...")
    process_telegram_updates()
