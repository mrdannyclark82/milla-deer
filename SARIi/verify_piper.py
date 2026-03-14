import main
import sys

print("Testing Piper TTS...")
try:
    text = "This is a verification test for Piper Text to Speech."
    print(f"Invoking speak_piper with: '{text}'")
    main.speak_piper(text)
    print("Execution complete.")
except Exception as e:
    print(f"Error: {e}")
