# Specification: Implement Flask Uplink Server and Piper TTS

## 1. Overview
This track focuses on two critical upgrades for SARIi:
1.  **Uplink Server:** Setting up a Flask-based REST API server to allow external applications (specifically the Capacitor Android UI) to communicate with the Python backend.
2.  **Piper TTS:** Replacing the robotic espeak fallback with Piper (Neural TTS) for a high-quality, natural voice experience.

## 2. Requirements

### 2.1 Flask Uplink Server
-   **Endpoint:** `/api/command` (POST) to receive text commands from the frontend.
-   **Endpoint:** `/api/status` (GET) to return the current system status (battery, wifi, etc.).
-   **CORS:** Enable Cross-Origin Resource Sharing to allow requests from the Capacitor app.
-   **Threading:** The server must run in a separate thread to avoid blocking SARIis main loop.

### 2.2 Piper TTS Integration
-   **Binary:** Ensure the `piper` binary is executable and accessible.
-   **Model:** Verify the `en_US-amy-low.onnx` model and its config are correctly placed.
-   **Function:** Implement a `speak_piper(text)` function that generates audio to a temporary file and plays it using `sox` or `aplay`.
-   **Integration:** Update the main `speak()` function to prioritize Piper, falling back to espeak only if Piper fails.

## 3. Acceptance Criteria
-   [ ] The Flask server starts successfully on port 5000 (or configured port).
-   [ ] A `curl` POST request to `/api/command` triggers SARIis NLU logic.
-   [ ] SARIi speaks responses using the Piper voice by default.
-   [ ] If Piper fails (e.g., missing binary), SARIi falls back to espeak without crashing.
