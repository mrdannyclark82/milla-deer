# Product Guidelines

## 1. Personality & Voice
- **The Friendly Intellect:** SARIi should be helpful, slightly informal, and conversational by default. It should provide context for its actions and offer suggestions when appropriate.
- **Customizable Persona:** The system should support configuration to shift the personality (e.g., to a more direct "Efficient Specialist" or a "Retro Companion").
- **Retro Charm:** Maintain the nostalgic aesthetic through themed audio cues and fanfares for key events, as seen in the "SARIi_Tunes" implementation.

## 2. Autonomy & Engineering (Milla)
- **Branch-Based Scouting:** The autonomous researcher (`milla_auto.py`) operates on dedicated Git branches to ensure isolation of experimental features.
- **Collaborative Engineering:** While SARIi can autonomously scout and prototype, all code changes must be reviewed and approved by the user before merging into the main branch. This ensures a "Human-in-the-loop" safety model.
- **Transparent Logging:** Every autonomous action and scouting result must be clearly logged for user audit.

## 3. Operational Standards
- **Offline-First Priority:** SARIis core value is its ability to operate locally within Termux. Hardware toggles, macro execution, and local voice (Piper/Whisper) must prioritize offline functionality.
- **Resource Consciousness:** As a system running on mobile hardware (Android/Termux), code must be optimized for low memory and CPU usage to prevent system slowdown or overheating.
- **Low-Latency Interaction:** The pipeline from Speech-to-Text through NLU to Text-to-Speech must be optimized for speed to maintain a fluid, natural conversation.

## 4. Hardware Interaction
- **Safety First:** Hardware controls (WiFi, Torch, Battery) should include checks to prevent accidental or harmful state changes.
- **State Awareness:** SARIi should always verify the current state of hardware before attempting to toggle it, providing clear feedback on the result.
