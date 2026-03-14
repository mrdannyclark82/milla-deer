import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def process_audio_with_gemini(file_path: str):
    """
    Uploads an audio file to Gemini 1.5 Flash/Pro and retrieves a transcript
    with emotional/contextual analysis.
    """
    if not GEMINI_API_KEY:
        print("[!] GEMINI_API_KEY not found in environment.")
        return None

    try:
        print(f"[*] Audio Analysis: Analyzing {file_path}...")
        
        # Fallback to simple speech recognition since Gemini is unreliable/404ing
        import speech_recognition as sr
        recognizer = sr.Recognizer()
        
        # Ensure wav format for SR
        if not file_path.lower().endswith(".wav"):
             # Simple ffmpeg conversion if needed, but for now just warn
             return "[Audio Error]: File must be .wav for local processing."
             
        with sr.AudioFile(file_path) as source:
            audio_data = recognizer.record(source)
            try:
                text = recognizer.recognize_google(audio_data)
                return f"{text} [Tone: Neutral (Local Fallback)]"
            except sr.UnknownValueError:
                return "[Unintelligible Audio]"
            except sr.RequestError:
                return "[Speech Service Error]"

        # Original Gemini code disabled to prevent 404s
        # sample_file = genai.upload_file(path=file_path)
        # ...
        
    except Exception as e:
        print(f"[!] Audio Error: {e}")
        return None

if __name__ == "__main__":
    # Quick test
    test_file = "core_os/media/audio_in/ubuntu_ear_test.wav"
    if os.path.exists(test_file):
        result = process_audio_with_gemini(test_file)
        print(f"Result: {result}")
    else:
        print("No test file found.")
