# Product Definition

# Initial Concept
Autonomous Python-based voice assistant running in Termux on Android.

## 1. Vision
SARIi (System Assistant for Research & Intelligence) is an autonomous, local-first voice assistant running in Termux on Android. It bridges the gap between low-level hardware control, intelligent research automation, and modern voice interfaces, empowering developers and enthusiasts with a private, customizable AI companion.

## 2. Target Users
- **Developers & Enthusiasts:** Users familiar with Termux and Android who want a hackable, extensible voice assistant.
- **Researchers:** Individuals needing an autonomous agent to scout trends, gather intelligence, and prototype new features.
- **Privacy Advocates:** Users who prioritize local processing (Piper TTS, Whisper STT) and hardware control without reliance on cloud-only ecosystems.

## 3. Core Features
- **Voice Interaction:**
    - High-quality local Text-to-Speech (TTS) using Piper (Neural).
    - High-accuracy local Speech-to-Text (STT) using Whisper.
    - Fallback support for espeak.
- **Hardware Control:** Direct toggling of Android hardware features (Battery, Torch, WiFi) via Termux API.
- **Autonomous Research:** Self-directed feature scouting and code engineering via `milla_auto.py` and Gemini 2.0 Flash API.
- **Uplink Server:** A Flask-based backend to expose SARIis capabilities to external interfaces (e.g., Capacitor UI).
- **Macro System:** Recording and playback of custom command sequences.
- **Retro Audio:** Themed audio feedback using local sound assets.

## 4. Immediate Goals (Next Phase)
- **Local Voice Upgrade:** Fully integrate Whisper STT to complement Piper TTS.
- **Uplink Expansion:** Enhance the Flask server with WebSocket support for real-time status updates.
- **UI Integration:** Connect the existing Android Capacitor frontend to the Python backend via the new Uplink Server.
