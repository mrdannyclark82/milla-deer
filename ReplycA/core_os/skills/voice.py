import os
import subprocess
import tempfile
import re
from core_os.memory.agent_memory import memory

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def clean_text_for_speech(text: str) -> str:
    text = re.sub(r'^\s*(\*\*|\[).*?$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-=_]{3,}.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\*\s*\(.*?\)\s*\*?', '', text, flags=re.DOTALL)
    text = re.sub(r'\(.*?\)', '', text) 
    text = re.sub(r'[\*#`_\[\]>]', '', text)
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    text = re.sub(r'http\S+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def speak_response(text: str):
    try:
        if not text: return
        voice_script = os.path.join(os.path.dirname(os.path.dirname(__file__)), "actions", "voice_synth.py")
        log_file = os.path.join(PROJECT_ROOT, "milla_voice.log")
        if os.path.exists(voice_script):
            with open(log_file, "a") as f:
                subprocess.Popen(["python3", voice_script, text], stdout=f, stderr=f)
        else:
            print(f"[*] Voice script not found at {voice_script}")
    except Exception as e:
        print(f"[!] Speech Link Error: {e}")

def listen_for_voice_command():
    try:
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        with sr.Microphone() as source:
            print("[Listening...]")
            recognizer.adjust_for_ambient_noise(source, duration=1)
            audio = recognizer.listen(source, timeout=10, phrase_time_limit=15)
            
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio.get_wav_data())
                tmp_path = tmp.name
            
            try:
                from core_os.actions.transcribe_audio import transcribe_whisper
                print("[*] Transcribing with Local Whisper...")
                command = transcribe_whisper(tmp_path)
                if command and command.strip() and "..." not in command:
                    print(f"[Voice Input]: {command}")
                    return command
                else:
                    print("[!] No clear speech detected.")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        return None
    except ImportError:
         print("[!] speech_recognition or dependencies not installed.")
         return None
    except Exception as e:
        print(f"[!] Mic/Whisper Error: {e}")
        return None
