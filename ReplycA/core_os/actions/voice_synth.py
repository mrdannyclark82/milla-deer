import os
import sys
import tempfile
import re
import subprocess
import asyncio
import wave
import json
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

# --- CONFIGURATION ---
# ElevenLabs (Premium/Paid)
ELEVEN_VOICE_ID = "lfjIPXgW1aWWQrlKK4ww" # Southern Raspy
ELEVEN_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Edge-TTS (Free/Cloud-based)
EDGE_VOICE = "en-US-AvaNeural"
EDGE_PITCH = "-5Hz"
EDGE_RATE = "-5%"

# Piper (Local/Offline)
PIPER_MODEL_PATH = "core_os/tools/voice/models/en_US-lessac-medium.onnx"
PIPER_CONFIG_PATH = PIPER_MODEL_PATH + ".json"

def strip_markdown(text):
    """Remove code blocks and markdown junk before TTS."""
    text = re.sub(r'```[\s\S]*?```', '', text)
    text = re.sub(r'`[^`]+`', '', text)
    text = re.sub(r'[*#_>]', '', text) 
    return text.strip()

def clean_pronunciation(text):
    """Fix common mispronunciations."""
    text = text.replace("Cadyn", "Kay-Din")
    text = text.replace("D-Ray", "Dee-Ray")
    text = text.replace("Dray", "Dee-Ray")
    return text

async def speak_edge(text, output_path):
    """Uses Edge-TTS (Free) to generate speech."""
    import edge_tts
    communicate = edge_tts.Communicate(text, EDGE_VOICE, pitch=EDGE_PITCH, rate=EDGE_RATE)
    await communicate.save(output_path)

def speak_piper(text, output_path):
    """Uses Local Piper (Offline) to generate speech."""
    try:
        if not os.path.exists(PIPER_MODEL_PATH):
            return False
            
        from piper.voice import PiperVoice
        import wave
        
        voice = PiperVoice.load(PIPER_MODEL_PATH, config_path=PIPER_CONFIG_PATH)
        
        with wave.open(output_path, "wb") as wav_file:
            voice.synthesize_wav(text, wav_file)
        return True
    except Exception as e:
        print(f"[!] Piper Error: {e}")
        return False

def speak_eleven(text, output_path):
    """Uses ElevenLabs (Paid) to generate speech."""
    import requests
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE_ID}"
    headers = {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {"stability": 0.35, "similarity_boost": 0.85}
    }
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
        return True
    else:
        # print(f"[!] ElevenLabs Quota/Error: {response.text}")
        return False

def apply_dialect(text):
    """Nudges the text phonetically to simulate D-Ray's actual cadence."""
    # 1. Drop the 'g' on 'ing' words (Classic drawl)
    text = re.sub(r'(\w+)ing\b', r"\1in'", text)
    
    # 2. Mimic the Architect's clipped/phonetic slang
    replacements = {
        "with me": "wih me",
        "with you": "wih u",
        "with the": "wih tha",
        "to the": "ta tha",
        "back to": "bak ta",
        "is like": "iz lyk",
        "it is a": "itza",
        "Hello": "Hey",
        "Hi": "Yo",
        "going to": "gonna",
        "want to": "wanna",
        "you": "u",
        "your": "ur"
    }
    
    # Sort by length descending to handle longer phrases first
    for old in sorted(replacements.keys(), key=len, reverse=True):
        new = replacements[old]
        # Match whole words or specific phrases
        text = re.sub(r'\b' + re.escape(old) + r'\b', new, text, flags=re.IGNORECASE)
    
    return text

def generate_and_play(text, mode="auto"):
    """
    Core entry point for voice.
    """
    if not text: return

    # 1. Clean and Prepare
    clean_text = strip_markdown(text)
    clean_text = apply_dialect(clean_text) # Apply the soul
    clean_text = clean_pronunciation(clean_text)
    if not clean_text: return

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    success = False
    
    # 1. Try ElevenLabs (Disabled by default if broke)
    if mode == "eleven" and ELEVEN_API_KEY:
        success = speak_eleven(clean_text, tmp_path)

    # 2. Try Edge-TTS (Free/Cloud) - PRIMARY Choice for quality
    if not success and (mode in ["auto", "free"]):
        try:
            # mp3 suffix for edge-tts
            tmp_path_mp3 = tmp_path.replace(".wav", ".mp3")
            asyncio.run(speak_edge(clean_text, tmp_path_mp3))
            tmp_path = tmp_path_mp3
            success = True
        except Exception as e:
            print(f"[!] Edge-TTS Error: {e}")

    # 3. Try Piper (Local/Offline) - Fallback for no internet
    if not success and (mode in ["auto", "local"]):
        success = speak_piper(clean_text, tmp_path)

    if success:
        # Play using mpv
        subprocess.run(["mpv", "--no-video", tmp_path], check=False)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    else:
        print(f"[*] Voice failed. Text: {clean_text}")

if __name__ == "__main__":
    msg = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Local voice systems online."
    # Default to auto (which now includes Piper)
    generate_and_play(msg)
