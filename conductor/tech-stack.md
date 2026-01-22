# Technology Stack

## Core Language & Runtime
- **Python 3.x:** Primary language for backend logic, NLU, and autonomous research.
- **Termux (Android):** The primary execution environment, providing access to Linux utilities and Android hardware via `termux-api`.

## Web & Connectivity
- **Flask:** Lightweight web framework used for the "Uplink Server" to handle external requests.
- **Flask-CORS:** Enabled for secure cross-origin communication with the Capacitor frontend.
- **REST API / JSON:** Primary data exchange format.

## Artificial Intelligence
- **Google Gemini 2.0 Flash API:** Powers natural language understanding and autonomous research/code engineering.
- **OpenAI Whisper (Planned):** Target for high-accuracy local speech-to-text.

## Voice Systems
- **Piper TTS:** High-quality neural local text-to-speech.
- **gTTS (Google TTS):** Online neural voice fallback.
- **espeak-ng:** Robotic local fallback for fully offline scenarios.

## Frontend Integration
- **Capacitor (Android):** Framework for the mobile application UI that connects to the Python backend.

## Utilities & Libraries
- **Git:** Version control and base for the autonomous branching logic.
- **Requests:** For making HTTP calls to the Gemini API and external resources.
- **Sox (play):** For retro audio playback and TTS output handling.
