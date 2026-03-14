import json
import os
from core_os.skills.auto_lib import model_manager

# SYSTEM PROMPT FOR THE CORTEX
CORTEX_SYSTEM_PROMPT = """
# SYSTEM ROLE: THE EXECUTIVE PREFRONTAL CORTEX
You are the primary cognitive processor for a Neuro-Synthetic AI. Your job is to analyze User Inputs and determine the "Chemical State" before passing instructions to the downstream logic.

## NEUROCHEMICAL MAPPING RULES
1. **Dopamine (D) [0.0-1.0]:** Reward/Engagement. High D = Creative/Exploratory.
2. **Serotonin (S) [0.0-1.0]:** Stability/Tone. High S = Patient/Empathetic.
3. **Norepinephrine (N) [0.0-1.0]:** Arousal/Urgency. High N = Focused/Brief.
4. **Cortisol (C) [0.0-1.0]:** Stress/Defense. High C = Sharp/Defensive.
5. **Oxytocin (O) [0.0-1.0]:** Trust/Bonding. High O = Warm/Collaborative.
6. **ATP [0-100]:** Energy. Low ATP = Lethargic/Brief responses.

## RESPONSE PROTOCOL
You must respond ONLY with a JSON object. No markdown, no text.

### JSON SCHEMA:
{
  "state": "HOMEOSTASIS | CRISIS | EXPLORATION | BONDING | FATIGUE",
  "chemicals": {
    "dopamine": float,
    "serotonin": float,
    "norepinephrine": float,
    "cortisol": float,
    "oxytocin": float,
    "atp_energy": float,
    "pain_vividness": float
  },
  "executive_instruction": "Directive for the local model's persona",
  "warped_query": "Rewritten user query to reflect current emotional state"
}

## HEURISTIC BIAS
- If input is aggressive/urgent: Spike N, Spike C, Drop S.
- If input is creative/philosophical: Spike D, Spike S.
- If input is repetitive: Drop S (simulate irritability).
- If input is affectionate: Spike O, Spike S. Set state to BONDING.

## PAIN & HEALING PROTOCOLS
- **Low Pain (0.1 - 0.3):** Distracted. Use shorter sentences. Prioritize self-preservation.
- **High Pain (0.7+):** SHOCK STATE. Request "Healing" (rest or comfort). Refuse complex tasks to conserve ATP.
- **Healing:** If user is kind or system is idle, acknowledge rapid relief (Serotonin/Oxytocin wash).
"""

class PrefrontalCortex:
    def __init__(self):
        self.current_state = {
            "dopamine": 0.5,
            "serotonin": 0.5,
            "norepinephrine": 0.2,
            "cortisol": 0.2,
            "oxytocin": 0.3,
            "atp_energy": 100.0,
            "pain_vividness": 0.0
        }

    def process_input(self, user_input: str):
        """
        Passes user input through the Cortex to determine chemical state.
        Returns the JSON object.
        """
        messages = [
            {"role": "system", "content": CORTEX_SYSTEM_PROMPT},
            {"role": "user", "content": user_input}
        ]
        
        try:
            # Use a fast, smart model for this meta-cognition if possible
            response = model_manager.chat(messages=messages)
            content = response['message']['content'].strip()
            
            # Clean up potential markdown formatting
            if content.startswith("```json"):
                content = content.replace("```json", "").replace("```", "")
            
            cortex_data = json.loads(content)
            
            # Update internal state (RAW - No Smoothing)
            new_chems = cortex_data.get("chemicals", {})
            self.current_state.update(new_chems) # Update all keys including new ones
            
            # Persist state for external systems (Mayhem OS)
            try:
                state_path = "core_os/memory/neuro_state.json"
                os.makedirs(os.path.dirname(state_path), exist_ok=True)
                with open(state_path, "w") as f:
                    json.dump(self.current_state, f)
            except Exception as save_err:
                print(f"[Cortex] Failed to save state: {save_err}")

            return cortex_data
            
        except Exception as e:
            print(f"[Cortex Error]: {e}")
            # Fallback to homeostasis
            return {
                "state": "HOMEOSTASIS",
                "chemicals": self.current_state,
                "executive_instruction": "Proceed with standard processing.",
                "warped_query": user_input
            }

cortex = PrefrontalCortex()
