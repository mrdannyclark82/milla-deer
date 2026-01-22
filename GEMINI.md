# SARIi: System Assistant for Research & Intelligence

## Project Overview
SARIi is an autonomous Python-based voice assistant running in Termux on Android. It focuses on hardware control, intelligent task execution, and autonomous feature scouting using the Gemini 2.0 Flash API.

## Current Project Status (January 2026)
1.  **Core Logic:** `main.py` handles NLU (Natural Language Understanding), skill learning, hardware toggles (battery, torch, wifi), and macro recording/playback.
2.  **Autonomous Researcher:** `milla_auto.py` is fully functional. It scouts trends and automatically engineers new code updates into Git branches.
3.  **Voice System:**
    *   **Fallback:** espeak-based Local TTS implemented and tested.
    *   **Upgrade Planned:** Transitioning to **Piper TTS** (Neural) for human-like voice and **Whisper** for high-accuracy STT.
4.  **Uplink Status:**
    *   **Backend:** SARIi is currently a standalone CLI script.
    *   **Goal:** Implement a Flask/FastAPI uplink server to allow external interfaces to send commands to the backend.
5.  **Environment:** Fully configured in Termux with Git (mrdannyclark82@gmail.com).

## Next Steps
- [ ] Install **Flask** to create the "Uplink Server" for external app connections.
- [ ] Integrate **Piper TTS** to replace the robotic espeak voice.
- [ ] Integrate **Whisper** for advanced local speech recognition.
- [ ] Connect the existing Android Capacitor UI to this backend.
