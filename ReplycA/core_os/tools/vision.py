import os
import time
import base64
from io import BytesIO
try:
    import pyautogui
except Exception:
    pyautogui = None
import ollama

def capture_and_analyze():
    if not pyautogui:
        return "Error: pyautogui not installed or no display detected."
    
    try:
        # 1. Capture Screen
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        filename = f"core_os/screenshots/screen_{timestamp}.png"
        os.makedirs("core_os/screenshots", exist_ok=True)
        
        screenshot = pyautogui.screenshot()
        screenshot.save(filename)
        
        # 2. Convert to Bytes for Ollama
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        img_bytes = buffered.getvalue()
        
        # 3. Send to Ollama (Vision)
        # Defaulting to ministral-3:14b-cloud as requested
        vision_model = "ministral-3:14b-cloud"

        print(f"[*] Analyzing screen with {vision_model}...")
        
        response = ollama.chat(
            model=vision_model,
            messages=[{
                'role': 'user',
                'content': 'Describe what is on this screen in detail. What is the user looking at?',
                'images': [img_bytes]
            }]
        )
        
        analysis = response['message']['content']
        return f"[Visual Input]: {analysis}"

    except Exception as e:
        return f"Vision Error: {str(e)}"

if __name__ == "__main__":
    print(capture_and_analyze())
