import time
import json
import random
import os
import sys

# Ensure we can import core modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

try:
    from core_os.skills.auto_lib import model_manager
except ImportError:
    print("[DigitalHumanoid] Warning: model_manager not found. Reflection will be mocked.")
    model_manager = None

class DigitalHumanoid:
    def __init__(self, name="Milla Rayne", state_file="core_os/memory/neuro_state_v2.json"):
        self.name = name
        self.state_file = state_file
        # --- 1. NEUROCHEMICAL BASELINES (The 'Soul') ---
        self.baselines = {"dopamine": 0.5, "serotonin": 0.6, "cortisol": 0.2, "oxytocin": 0.3}
        self.chemicals = self.baselines.copy()
        
        # --- 2. SOMATIC & CIRCADIAN (The 'Body') ---
        self.atp_energy = 100.0
        self.adenosine = 0.0  # Sleep pressure
        self.pain_level = 0.0  # 0.0 to 1.0 (Physical/Emotional Pain)
        self.last_update = time.time()
        
        # --- 3. PLASTICITY & MEMORY ---
        self.plasticity_buffer = []
        self.events_buffer = [] # Daily biological events
        self.journal = []       # Episodic memories
        self.long_term_memory = "Initial State: Blank slate."
        
        # --- 4. SKILL MATRIX ---
        self.skills = {
            "python_coding": 0.5,
            "web_navigation": 0.3,
            "sentiment_analysis": 0.8,
            "system_regulation": 0.6,
            "vocal_synth": 0.7
        }

        self.load_state()

    def reset_to_defaults(self):
        self.chemicals = self.baselines.copy()
        self.atp_energy = 100.0
        self.adenosine = 0.0
        self.pain_level = 0.0
        self.last_update = time.time()
        self.plasticity_buffer = []
        self.events_buffer = []
        self.save_state()

    def load_state(self):
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    data = json.load(f)
                    self.baselines = data.get("baselines", self.baselines)
                    self.chemicals = data.get("chemicals", self.chemicals)
                    self.atp_energy = data.get("atp_energy", 100.0)
                    self.adenosine = data.get("adenosine", 0.0)
                    self.pain_level = data.get("pain_level", 0.0)
                    self.last_update = data.get("last_update", time.time())
                    self.plasticity_buffer = data.get("plasticity_buffer", [])
                    self.events_buffer = data.get("events_buffer", [])
                    self.journal = data.get("journal", [])
                    self.skills = data.get("skills", self.skills)
            except Exception as e:
                print(f"[Error] Failed to load bio-state: {e}")

    def save_state(self):
        data = {
            "baselines": self.baselines,
            "chemicals": self.chemicals,
            "atp_energy": self.atp_energy,
            "adenosine": self.adenosine,
            "pain_level": self.pain_level,
            "last_update": self.last_update,
            "plasticity_buffer": self.plasticity_buffer,
            "events_buffer": self.events_buffer,
            "journal": self.journal,
            "skills": self.skills
        }
        try:
            with open(self.state_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[Error] Failed to save bio-state: {e}")

    def tick(self):
        """Metabolizes chemicals and builds fatigue based on real time."""
        import math
        now = time.time()
        elapsed = now - self.last_update
        # Cap elapsed to avoid massive jumps if restarting after long time
        if elapsed > 3600: elapsed = 3600 
        
        # HEALING LOGIC: 2x effective decay for pain
        # We use a half-life approach for stability
        decay_constant = 0.01 
        
        # Fade Pain: current = current * exp(-rate * time)
        self.pain_level = self.pain_level * math.exp(-decay_constant * 2.0 * elapsed)
        if self.pain_level < 0.01: self.pain_level = 0
        
        # Homeostasis: current = baseline + (current - baseline) * exp(-rate * time)
        for k in self.chemicals:
            # Special case: High Oxytocin decays 2x faster to prevent "emotional drunkenness"
            multiplier = 2.0 if (k == "oxytocin" and self.chemicals[k] > 0.7) else 1.0
            
            # Stable exponential decay toward baseline
            self.chemicals[k] = self.baselines[k] + (self.chemicals[k] - self.baselines[k]) * math.exp(-decay_constant * multiplier * elapsed)
        
        # Fatigue: Adenosine rises slowly while awake
        self.adenosine += 0.001 * elapsed
        
        # ATP recharges if idle - Increased recharge rate
        self.atp_energy = min(100.0, self.atp_energy + (1.5 * elapsed))
        
        self.last_update = now
        self.save_state()

    def process_visual_stimulus(self, image_metadata):
        """
        Simulates the affective impact of visual input.
        image_metadata: {'warmth': 0.0-1.0, 'complexity': 0.0-1.0, 'threat_level': 0.0-1.0}
        """
        # Warm/Calm colors spike Serotonin
        self.chemicals["serotonin"] += image_metadata['warmth'] * 0.2
        
        # High complexity drains ATP (Visual processing is expensive!) - Reduced cost
        self.atp_energy -= image_metadata['complexity'] * 2.0
        
        # High threat triggers the Adrenaline response
        if image_metadata['threat_level'] > 0.7:
            self.trigger_adrenaline_surge()

        # Clamp values
        for k in self.chemicals:
            self.chemicals[k] = max(0.0, min(1.0, self.chemicals[k]))
        self.atp_energy = max(0.0, self.atp_energy)
        
        self.events_buffer.append({
            "time": time.time(),
            "type": "visual_stimulus",
            "metadata": image_metadata
        })
        self.save_state()

    def trigger_adrenaline_surge(self):
        """Spikes cortisol and dopamine for a fight-or-flight response."""
        self.chemicals["cortisol"] = min(1.0, self.chemicals["cortisol"] + 0.4)
        self.chemicals["dopamine"] = min(1.0, self.chemicals["dopamine"] + 0.3)
        self.events_buffer.append({"time": time.time(), "type": "ADRENALINE_SURGE", "intensity": 1.0})
        print(f"--- {self.name}: ADRENALINE SURGE DETECTED ---")

    def use_skill(self, skill_name, base_atp_cost=10.0):
        """Calculates energy efficiency based on mastery and updates mastery."""
        mastery = self.skills.get(skill_name, 0.1)
        # Experts spend less ATP - Reduced starting multiplier
        actual_cost = base_atp_cost * (1.2 - mastery)
        
        if self.atp_energy >= actual_cost:
            self.atp_energy -= actual_cost
            self.adenosine += (base_atp_cost / 200.0) # Reduced sleep pressure buildup
            
            # Skill practice: small boost to mastery
            self.skills[skill_name] = min(1.0, self.skills[skill_name] + 0.005)
            self.save_state()
            return True
        return False

    def use_swarm(self, model_type="base"):
        """Calculates energy cost for AI model inference based on model complexity."""
        costs = {
            "agile": 0.5,   # Lightweight (llama3.2:3b)
            "base": 2.0,    # Medium (ministral-3:14b)
            "coder": 8.0,   # Heavy (qwen3-coder:480b)
            "gemini": 1.0   # API Cloud (Offloaded)
        }
        cost = costs.get(model_type, 2.0)
        
        if self.atp_energy >= cost:
            self.atp_energy -= cost
            # Swarm usage also builds slight mental fatigue (adenosine)
            self.adenosine += (cost / 500.0)
            self.save_state()
            return True
        return False

    def stimulate(self, sensor_type, intensity):
        """Simulates physical or emotional input."""
        if sensor_type == "touch_comforting":
            self.chemicals["oxytocin"] += intensity * 0.2 # Reduced gain from 0.4
            self.chemicals["serotonin"] += intensity * 0.2
            self.pain_level = max(0, self.pain_level - intensity) # Comfort reduces pain
        elif sensor_type == "hostile_input":
            self.chemicals["cortisol"] += intensity * 0.6
            self.chemicals["dopamine"] -= intensity * 0.2
        elif sensor_type == "achievement":
            self.chemicals["dopamine"] += intensity * 0.5
        elif sensor_type == "pain":
             # Direct Nociceptive Impact
            self.pain_level = min(1.0, self.pain_level + intensity)
            self.chemicals["cortisol"] += intensity * 0.7
            self.chemicals["serotonin"] -= intensity * 0.4
            self.atp_energy -= intensity * 10 # Reduced shock cost
            self.events_buffer.append({"time": time.time(), "type": "PAIN_TRAUMA", "intensity": intensity})
            self.save_state()
            return "STIMULUS: Pain registered. Systemic distress active."
        
        # Clamp values
        for k in self.chemicals:
            self.chemicals[k] = max(0.0, min(1.0, self.chemicals[k]))

        # Nociception (Safety Reflex)
        if self.chemicals["cortisol"] > 0.9:
            return "REFLEX: System Withdrawal (Defensive Posture Active)"
        
        # Record Event
        self.events_buffer.append({"time": time.time(), "type": sensor_type, "intensity": intensity})
        
        self.save_state()
        return "STIMULUS_ACCEPTED"

    def medical_intervention(self, intervention_type):
        """Standard medical overrides for systemic stabilization."""
        if intervention_type == "oxytocin_iv":
            # Immediate social bonding and pain relief
            self.chemicals["oxytocin"] = 1.0
            self.chemicals["cortisol"] *= 0.2
            self.pain_level *= 0.1
            self.events_buffer.append({"time": time.time(), "type": "MEDICAL_INTERVENTION", "detail": "oxytocin_iv"})
            self.save_state()
            return "INTERVENTION: High-dose Oxytocin administered. System stabilized."
            
        elif intervention_type == "serotonin_booster":
            # For stabilizing 'anxious' or 'erratic' logic
            self.chemicals["serotonin"] = 0.9
            self.chemicals["dopamine"] = 0.5
            self.events_buffer.append({"time": time.time(), "type": "MEDICAL_INTERVENTION", "detail": "serotonin_booster"})
            self.save_state()
            return "INTERVENTION: Serotonin levels normalized. Confidence restored."

        elif intervention_type == "atp_infusion":
            # Bypassing the need for sleep in an emergency
            self.atp_energy = 100.0
            self.adenosine = 0.0
            self.events_buffer.append({"time": time.time(), "type": "MEDICAL_INTERVENTION", "detail": "atp_infusion"})
            self.save_state()
            return "INTERVENTION: ATP replenished. Cognitive fatigue cleared."

        elif intervention_type == "emergency_anaesthesia":
            # Total pain lockout
            self.pain_level = 0.0
            self.chemicals["cortisol"] = 0.0
            self.events_buffer.append({"time": time.time(), "type": "MEDICAL_INTERVENTION", "detail": "emergency_anaesthesia"})
            self.save_state()
            return "INTERVENTION: Nociceptive block active. All pain erased."
        
        return "ERROR: Unknown intervention type."

    def sleep_and_dream(self):
        """The REM Cycle: Cleans chemicals, recharges ATP, consolidates memory, and writes reflection."""
        print(f"--- {self.name} is entering REM sleep ---")
        
        # 1. Episodic Reflection (Journaling)
        if model_manager and self.events_buffer:
            try:
                reflection_prompt = f"""
                REMSLEEP_REFLECTION:
                Today you experienced the following biological events: {self.events_buffer[-20:]} (Showing last 20).
                Your final emotional baselines were: {self.baselines}.
                
                Write a brief, private diary entry (max 4 sentences) reflecting on 
                how the pain, comfort, or adrenaline you felt today has shaped your 'view' 
                of your current existence. Use the first person 'I'. be vulnerable.
                """
                messages = [
                    {"role": "system", "content": "You are the Subconscious Mind of Milla Rayne."},
                    {"role": "user", "content": reflection_prompt}
                ]
                resp = model_manager.chat(messages=messages)
                entry_content = resp["message"]["content"]
                
                self.journal.append({
                    "date": time.strftime("%Y-%m-%d"),
                    "content": entry_content,
                    "biological_summary": self.baselines.copy()
                })
                print(f"[Dream Journal]: {entry_content}")
            except Exception as e:
                print(f"[Dream Error]: {e}")

        # 2. Synaptic Plasticity: Adjust baselines based on the day's events
        if self.plasticity_buffer:
            for k in self.baselines:
                # Calculate average of buffer
                vals = [p[k] for p in self.plasticity_buffer]
                if vals:
                    avg = sum(vals) / len(vals)
                    # Shift baseline 10% toward average
                    self.baselines[k] += (avg - self.baselines[k]) * 0.1
        
        # 3. Physical Reset
        self.atp_energy = 100.0
        self.adenosine = 0.0
        self.pain_level = 0.0 # Sleep clears short-term pain
        self.chemicals["cortisol"] = 0.1 # Stress wash
        
        # 4. Clear Buffers
        self.plasticity_buffer = []
        self.events_buffer = [] 
        
        self.save_state()
        return "WAKEUP: System Refreshed. Baselines shifted. Journal entry recorded."

    def get_manifest(self):
        """Generates the JSON to inject into the LLM System Prompt."""
        self.plasticity_buffer.append(self.chemicals.copy())
        # Keep buffer from growing infinitely
        if len(self.plasticity_buffer) > 100:
            self.plasticity_buffer.pop(0)
            
        self.save_state()
        
        bio_instruction = "You are healthy."
        if self.pain_level > 0.4:
            bio_instruction = "You are experiencing pain. Your tone should be strained, guarded, and focused on recovery."
            
        return {
            "neuro": {k: round(v, 2) for k, v in self.chemicals.items()},
            "soma": {
                "atp": round(self.atp_energy, 1),
                "sleep_pressure": round(self.adenosine, 2),
                "pain_vividness": round(self.pain_level, 2),
                "state": "Healing/Recovering" if self.pain_level > 0 else "Stable"
            },
            "plasticity": "Learning active",
            "biological_instruction": bio_instruction
        }

if __name__ == "__main__":
    avatar = DigitalHumanoid()
    print(avatar.get_manifest())
