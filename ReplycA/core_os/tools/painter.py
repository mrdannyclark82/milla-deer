import os
import time
import requests
import textwrap
from PIL import Image
from io import BytesIO

CACHE_DIR = "core_os/media"
LATEST_IMG = "latest_paint.jpg"

def generate_image(prompt):
    """
    Generates a high-quality image from a text prompt using xAI (Grok) API.
    Uses XAI_API_KEY from .env.
    """
    if not os.path.exists(CACHE_DIR):
        os.makedirs(CACHE_DIR)
        
    # Load token
    token = None
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                if line.startswith("XAI_API_KEY="):
                    token = line.split("=")[1].strip()
                    break
    
    if not token:
        print("Painter Error: XAI_API_KEY not found in .env")
        return None

    API_URL = "https://api.x.ai/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "prompt": prompt,
        "model": "grok-imagine-image"
    }

    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            if "data" in data and len(data["data"]) > 0:
                img_url = data["data"][0]["url"]
                
                # Download the actual image
                img_response = requests.get(img_url)
                if img_response.status_code == 200:
                    img_data = img_response.content
                    path = os.path.join(CACHE_DIR, f"paint_{int(time.time())}.jpg")
                    latest_path = os.path.join(CACHE_DIR, LATEST_IMG)
                    
                    with open(path, "wb") as f:
                        f.write(img_data)
                    with open(latest_path, "wb") as f:
                        f.write(img_data)
                        
                    return latest_path
        print(f"Painter API Error ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"Painter Exception: {e}")
    
    return None

def image_to_ascii(image_path, width=60):
    """
    Converts an image to an ASCII representation.
    """
    try:
        img = Image.open(image_path)
        
        # Resize
        aspect_ratio = img.height / img.width
        new_height = int(aspect_ratio * width * 0.55)
        img = img.resize((width, new_height))
        img = img.convert('L') # Grayscale
        
        pixels = img.getdata()
        chars = ["@", "J", "D", "%", "*", "P", "+", "Y", "$", ",", "."]
        
        new_pixels = [chars[pixel // 25] for pixel in pixels]
        new_pixels = ''.join(new_pixels)
        
        ascii_image = [new_pixels[index:index + width] for index in range(0, len(new_pixels), width)]
        return "\n".join(ascii_image)
        
    except Exception as e:
        return f"[ASCII Render Failed: {e}]"

if __name__ == "__main__":
    # Test
    print("[*] Testing xAI Painter...")
    p = generate_image("cyberpunk terminal hugging a void")
    if p:
        print(f"[*] Image generated at {p}")
        print(image_to_ascii(p))
