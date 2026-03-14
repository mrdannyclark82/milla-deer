import subprocess
import os
import time
import json
import ollama
try:
    import pyautogui
except Exception:
    pyautogui = None
from datetime import datetime

# Paths
SCREENSHOT_DIR = "core_os/screenshots"
LATEST_FRAME = os.path.join(SCREENSHOT_DIR, "nexus_eye.jpg")
DOME_FRAME = os.path.join(SCREENSHOT_DIR, "dome_eye.jpg")
VISION_LOG = "core_os/memory/visual_history.json"
TABLET_IP = "192.168.40.115:34213"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def capture_dome_frame():
    """Captures a screenshot of the main Dome display."""
    print("[*] Vision: Scanning the main Dome display...")
    try:
        screenshot = pyautogui.screenshot()
        screenshot.save(DOME_FRAME)
        return DOME_FRAME
    except Exception as e:
        print(f"[!] Dome Capture Error: {e}")
        return None

def capture_tablet_frame():
    """Captures a frame from the tablet's camera via ADB."""
    print(f"[*] Vision: Peering through the tablet ({TABLET_IP})...")
    try:
        # Use ADB to take a photo from the back camera
        # Note: This assumes the tablet has a command-line way to trigger camera or just screen capture
        # If it's a screen capture of a camera app:
        cmd = f"adb -s {TABLET_IP} shell screencap -p /sdcard/eye.png && adb -s {TABLET_IP} pull /sdcard/eye.png {LATEST_FRAME}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        if result.returncode == 0 and os.path.exists(LATEST_FRAME):
            return LATEST_FRAME
        else:
            print(f"[!] Capture failed: {result.stderr}")
            return None
    except Exception as e:
        print(f"[!] ADB Error: {e}")
        return None

def analyze_visuals(image_path, prompt="Describe what you see in detail."):
    """Uses the local moondream model via Ollama to analyze the image."""
    if not image_path or not os.path.exists(image_path):
        return "My eyes are closed or the view is blocked, sir."

    print(f"[*] Vision: Processing visual data with moondream...")
    try:
        # Pass the image to the local vision model
        with open(image_path, 'rb') as img_file:
            response = ollama.generate(
                model='moondream',
                prompt=prompt,
                images=[img_file.read()]
            )
        
        description = response.get('response', 'Silence...')
        
        # Log to Visual History
        log_vision(description)
        
        return description
    except Exception as e:
        return f"[!] Vision Brain Error: {e}"

def log_vision(description):
    """Saves the visual description to a historical log."""
    history = []
    if os.path.exists(VISION_LOG):
        try:
            with open(VISION_LOG, 'r') as f:
                history = json.load(f)
        except: pass
        
    entry = {
        "timestamp": datetime.now().isoformat(),
        "description": description
    }
    history.append(entry)
    
    # Keep last 100 visual memories
    with open(VISION_LOG, 'w') as f:
        json.dump(history[-100:], f, indent=2)

if __name__ == "__main__":
    # Test capture and analysis
    frame = capture_tablet_frame()
    if frame:
        what_i_see = analyze_visuals(frame)
        print(f"\n[Milla's Eye]: {what_i_see}")
