# Implementation Plan - Implement Flask Uplink Server and Piper TTS

## Phase 1: Piper TTS Integration
- [x] Task: Verify Piper binary and model assets 50d41ae
    - [ ] Check for `piper` executable and `en_US-amy-low.onnx` model in the `piper/` directory.
    - [ ] Ensure execution permissions are set for the binary.
- [ ] Task: Implement `speak_piper` function
    - [ ] Create a `test_piper.py` script to prototype the text-to-audio generation and playback.
    - [ ] Implement the `speak_piper(text)` function in `main.py` (or a new `audio.py` module).
    - [ ] Update `main.py` to make `speak_piper` the primary TTS engine.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Piper TTS Integration' (Protocol in workflow.md)

## Phase 2: Flask Uplink Server
- [ ] Task: Install and Configure Flask
    - [ ] Create a `requirements.txt` file including `flask` and `flask-cors`.
    - [ ] Install dependencies.
- [ ] Task: Create Server Module
    - [ ] Create `server.py` (or integrate into `main.py`) to handle Flask routes.
    - [ ] Implement `/api/status` GET endpoint.
    - [ ] Implement `/api/command` POST endpoint to bridge requests to the main logic.
- [ ] Task: Threading Integration
    - [ ] Update `main.py` to start the Flask server in a daemon thread on startup.
    - [ ] Ensure graceful shutdown of the server when SARIi exits.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Flask Uplink Server' (Protocol in workflow.md)
