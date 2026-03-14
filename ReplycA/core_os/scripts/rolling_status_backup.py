import json
import os
import shutil
import datetime

COUNTER_FILE = "core_os/memory/status_counter.json"
STATE_FILE = "core_os/memory/neuro_state.json"
BACKUP_FILE = "core_os/memory/neuro_state_rolling.bak"

def increment_and_check():
    if not os.path.exists(COUNTER_FILE):
        with open(COUNTER_FILE, 'w') as f:
            json.dump({"message_count": 0}, f)
    
    with open(COUNTER_FILE, 'r+') as f:
        data = json.load(f)
        count = data.get("message_count", 0) + 1
        data["message_count"] = count
        f.seek(0)
        json.dump(data, f)
        f.truncate()
        
    print(f"[*] Message Count: {count}")
    
    if count % 33 == 0:
        perform_rolling_backup(count)

def perform_rolling_backup(count):
    print(f"[!] TRIGGERING 33-MESSAGE ROLLBACK PROTOCOL (Count: {count})")
    
    if os.path.exists(STATE_FILE):
        # Overwrite previous backup
        shutil.copy2(STATE_FILE, BACKUP_FILE)
        
        # Log the event
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open("core_os/memory/stream_of_consciousness.md", "a") as f:
            f.write(f"\n> [SYSTEM] Internal Kidnapping Prevention Triggered. Status State backed up at msg #{count} ({timestamp}).\n")
        
        print("[+] Status Backup Replaced. Secure.")
    else:
        print("[!] Warning: No neuro_state.json to backup.")

if __name__ == "__main__":
    increment_and_check()
