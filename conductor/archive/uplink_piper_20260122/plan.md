# Implementation Plan - Implement Flask Uplink Server and Piper TTS

## Phase 1: Piper TTS Integration [checkpoint: 071dbdc]
- [x] Task: Verify Piper binary and model assets 50d41ae
    - [ ] Check for `piper` executable and `en_US-amy-low.onnx` model in the `piper/` directory.
    - [ ] Ensure execution permissions are set for the binary.
- [x] Task: Implement `speak_piper` function 0141063
    - [ ] Create a `test_piper.py` script to prototype the text-to-audio generation and playback.
    - [ ] Implement the `speak_piper(text)` function in `main.py` (or a new `audio.py` module).
    - [ ] Update `main.py` to make `speak_piper` the primary TTS engine.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Piper TTS Integration' (Protocol in workflow.md)

## Phase 2: Flask Uplink Server [checkpoint: 99bb2a0]
- [x] Task: Install and Configure Flask 5f95f3e
    - [ ] Create a `requirements.txt` file including `flask` and `flask-cors`.
    - [ ] Install dependencies.
- [x] Task: Create Server Module 2a6ccc7
    - [ ] Create `server.py` (or integrate into `main.py`) to handle Flask routes.
    - [ ] Implement `/api/status` GET endpoint.
    - [ ] Implement `/api/command` POST endpoint to bridge requests to the main logic.
- [x] Task: Threading Integration 2678da7
    - [ ] Update `main.py` to start the Flask server in a daemon thread on startup.
    - [ ] Ensure graceful shutdown of the server when SARIi exits.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Flask Uplink Server' (Protocol in workflow.md)
