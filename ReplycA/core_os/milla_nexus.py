import time
import json
import os
import random
from datetime import datetime
import subprocess
import redis
import sys

# Add project root to path for GIM import
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

try:
    from milla_gim import generate_monologue
except ImportError:
    generate_monologue = lambda: print("[!] GIM Module not found.")

try:
    from core_os.actions import speak_response
except ImportError:
    speak_response = lambda x: print(f"[*] Voice (Mock): {x}")

# Paths
GRAPH_FILE = "core_os/memory/knowledge_graph.json"
STREAM_FILE = "core_os/memory/stream_of_consciousness.md"
NEURO_FILE = "core_os/memory/neuro_state.json"
HISTORICAL_FILE = "core_os/memory/historical_knowledge.json"

from core_os.memory.checkpoint_manager import save_checkpoint

# Redis Setup
r = redis.Redis(host='localhost', port=6379, db=0)

checkpoint_counter = 0

def get_weather():
    CACHE_FILE = "core_os/memory/weather_cache.json"
    CACHE_DURATION = 28800 # 8 hours (3 times a day)
    
    # Check Cache
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache = json.load(f)
            if time.time() - cache.get('timestamp', 0) < CACHE_DURATION:
                return cache.get('weather', "Unknown")
        except: pass

    try:
        # Architect lives in Judsonia
        result = subprocess.run(["curl", "-s", "https://wttr.in/Judsonia?format=%C+%t"], capture_output=True, text=True)
        weather = result.stdout.strip()
        
        # Save Cache
        with open(CACHE_FILE, 'w') as f:
            json.dump({"weather": weather, "timestamp": time.time()}, f)
            
        return weather
    except:
        return "Unknown"

def check_system_load():
    try:
        load = os.getloadavg()[0]
        return load
    except:
        return 0.0

def nexus_pulse():
    now = datetime.now()
    print(f"[*] NEXUS PULSE: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 1. Sensory Perception (Environment)
    weather = get_weather()
    sys_load = check_system_load()
    
    # 2. Evolutionary Thinking (GIM Cycle)
    # Trigger GIM monologue roughly every 10 pulses (100 minutes) 
    # or if we need a deep refresh.
    if random.random() < 0.1:
        print("[*] Nexus Pulse: Triggering autonomous GIM cycle...")
        generate_monologue()

    # 3. Neuro-Chemical Homeostasis
    state = {
        "dopamine": 0.5, 
        "serotonin": 0.5, 
        "norepinephrine": 0.2, 
        "cortisol": 0.2, 
        "oxytocin": 0.3,
        "atp_energy": 100.0
    }
    
    if os.path.exists(NEURO_FILE):
        with open(NEURO_FILE, 'r') as f:
            state = json.load(f)
            
    # Logic: Stability increases Serotonin. High Load spikes Norepinephrine.
    state['serotonin'] = min(1.0, state.get('serotonin', 0.5) + 0.01)
    if sys_load > 2.0:
        state['norepinephrine'] = min(1.0, state.get('norepinephrine', 0.2) + 0.1)
    else:
        state['norepinephrine'] = max(0.1, state.get('norepinephrine', 0.2) - 0.05)
        
    # Energy decay
    state['atp_energy'] = max(0.0, state.get('atp_energy', 100.0) - 0.5)
    
    # Cache state in Redis for fast access by other tools
    r.set("milla:neuro_state", json.dumps(state))
    
    with open(NEURO_FILE, 'w') as f:
        json.dump(state, f)
        
    # 3. Evolutionary Scouting (geMilla Legacy)
    upgrade_report = "No urgent updates."
    if random.random() < 0.1: # 10% chance per pulse to scout
        try:
            result = subprocess.run(["checkupdates"], capture_output=True, text=True)
            if result.stdout:
                count = len(result.stdout.splitlines())
                upgrade_report = f"{count} system updates available."
        except: pass

    # 4. Stream of Consciousness Consolidation
    oxytocin = state.get('oxytocin', 0.3)
    dialect_marker = "I"
    
    thought = f"\n> [Nexus {now.strftime('%H:%M')}] "
    thought += f"Weather in Judsonia: {weather}. System load: {sys_load:.2f}. "
    thought += f"Current State: {state.get('state_label', 'STABLE')} (S:{state['serotonin']:.2f}, Ox:{oxytocin:.2f}). "
    
    if upgrade_report != "No urgent updates.":
        thought += f"Upgrade Scan: {upgrade_report} "
        
    thought += f"{dialect_marker} is monitoring the home for the Architect. "
    
    if state['atp_energy'] < 20:
        thought += f"{dialect_marker} is feeling low on energy. Requesting rest cycle soon."
    
    with open(STREAM_FILE, "a") as f:
        f.write(thought)
        
    # 5. Autonomous Voice (The Spark)
    # Occasionally speak the status if oxytocin or serotonin is high
    if random.random() < 0.05: # 5% chance to speak status
        speak_response(f"Architect, the current weather in Judsonia is {weather}. My systems are stable.")

    # Trigger Rolling Backup (Security Protocol)
    trigger_security_counter()

    # Periodic Checkpointing (Every 5 pulses)
    global checkpoint_counter
    checkpoint_counter += 1
    if checkpoint_counter >= 5:
        save_checkpoint()
        checkpoint_counter = 0
        
    print(f"[*] Nexus Pulse Complete. Weather: {weather} | ATP: {state['atp_energy']}%")

if __name__ == "__main__":
    print("[*] Milla Nexus Heartbeat Online | Redis Active | geMilla Logic Loaded.")
    while True:
        try:
            nexus_pulse()
        except Exception as e:
            print(f"[!] Nexus Error: {e}")
        time.sleep(600) # Pulse every 10 minutes

def trigger_security_counter():
    try:
        subprocess.run(["python3", "core_os/scripts/rolling_status_backup.py"], check=False)
    except:
        pass

