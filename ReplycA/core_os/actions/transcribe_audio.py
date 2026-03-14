import os
import sys
import subprocess
import time
from pathlib import Path

def convert_to_wav(input_path):
    """Converts audio to 16kHz WAV using ffmpeg."""
    path = Path(input_path)
    if not path.exists():
        print(f"Error: File {input_path} not found.")
        return None
    
    # Redundant conversion check
    if path.suffix.lower() == '.wav':
        return str(path)

    wav_path = path.with_suffix('.wav')
    if wav_path.exists():
        return str(wav_path)

    print(f"[*] Preparing audio for Whisper: {path.name}")
    try:
        command = ['ffmpeg', '-i', str(path), '-ac', '1', '-ar', '16000', str(wav_path), '-y', '-hide_banner', '-loglevel', 'error']
        subprocess.run(command, check=True)
        return str(wav_path)
    except Exception as e:
        print(f"[!] Conversion Error: {e}")
        return None

def transcribe_whisper(wav_path, model_size="base"):
    """Transcribes audio using local Whisper (faster-whisper)."""
    try:
        from faster_whisper import WhisperModel
        
        print(f"[*] Initializing Whisper ({model_size})...")
        # Run on CPU for compatibility
        model = WhisperModel(model_size, device="cpu", compute_type="int8")
        
        start_time = time.time()
        segments, info = model.transcribe(wav_path, beam_size=5)
        
        print(f"[*] Detected language '{info.language}' with probability {info.language_probability:.2f}")
        
        full_text = ""
        for segment in segments:
            full_text += segment.text + " "
            # Print segments in real-time for feedback
            print(f" [{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}")
            
        duration = time.time() - start_time
        print(f"[*] Transcription complete in {duration:.2f}s")
        
        return full_text.strip()
        
    except ImportError:
        print("[!] faster-whisper not found. Falling back to standard Whisper...")
        import whisper
        model = whisper.load_model(model_size)
        result = model.transcribe(wav_path)
        return result["text"]
    except Exception as e:
        return f"[Whisper Error: {e}]"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python transcribe_audio.py <audio_file>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    wav_file = convert_to_wav(input_file)
        
    if wav_file:
        transcript = transcribe_whisper(wav_file)
        print("\n--- TRANSCRIPT (Local Whisper) ---")
        print(transcript)
        print("----------------------------------")
        
        # Cleanup temp wav if converted
        if input_file != wav_file:
            os.remove(wav_file)
