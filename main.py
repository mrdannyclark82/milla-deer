import threading
import subprocess
import sys
import time
import json
import os
import struct
import difflib
import re
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# ==========================================
# MODULE 1: I/O INTERFACE
# ==========================================

def speak_local(text):
    """Uses espeakng for local text-to-speech with a relaxed pace (Fallback)."""
    try:
        print(f"SARIi (Fallback): {text}")
        subprocess.run(['espeak', '-v', 'en-us', '-s', '140', '-p', '40', '-w', 'temp.wav', text])
        subprocess.run(['termux-media-player', 'play', 'temp.wav'])
        if os.path.exists('temp.wav'):
            os.remove('temp.wav')
    except Exception as e:
        print(f"Local TTS Error: {e}")

from gtts import gTTS

def speak_gtts(text):
    """Uses Google TTS for high-quality neural voice output."""
    try:
        print(f"SARIi (Neural): {text}")
        tts = gTTS(text=text, lang='en', tld='com') # Using US English
        tts.save("temp.mp3")
        
        # Play using termux-media-player
        subprocess.run(['termux-media-player', 'play', 'temp.mp3'], capture_output=True)
        
        # Give it a moment to play before deleting
        time.sleep(0.5) 
        if os.path.exists('temp.mp3'):
            os.remove('temp.mp3')
    except Exception as e:
        print(f"gTTS Error: {e}")
        speak_local(text)

def speak(text):
    """Primary speak function using gTTS neural voice."""
    speak_gtts(text)

def listen():
    """Uses Termux:API to capture voice input."""
    try:
        result = subprocess.run(
            ['termux-speech-to-text'], 
            capture_output=True, 
            text=True
        )
        text = result.stdout.strip()
        return text if text else None
    except Exception as e:
        print(f"Input Error: {e}")
        return None

# ==========================================
# MODULE 2: DATA & UTILS
# ==========================================

def load_json(filename):
    try:
        with open(filename, 'r') as f:
            return json.load(f)
    except:
        return {}

def save_json(filename, data):
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

# ==========================================
# MODULE 3: NLU ENGINE
# ==========================================

class NLU:
    def __init__(self):
        # Define Intents and their Keywords
        self.intents = {
            'battery': ['battery', 'power', 'charge', 'energy', 'juice'],
            'time': ['time', 'clock', 'hour'],
            'date': ['date', 'day', 'calendar today'],
            'torch_on': ['torch on', 'light on', 'flash on', 'enable light'],
            'torch_off': ['torch off', 'light off', 'flash off', 'disable light'],
            'volume_up': ['speak up', 'raise voice', 'louder', 'cant hear', 'volume up', 'boost volume'],
            'volume_down': ['lower voice', 'speak softly', 'quieter', 'too loud', 'volume down', 'hush'],
            'volume_set': ['volume', 'sound', 'audio', 'mute'],
            'wifi': ['wifi', 'connection', 'internet', 'network'],
            'photo': ['photo', 'picture', 'camera', 'selfie', 'snapshot'],
            'system': ['system status', 'storage', 'ram', 'uptime', 'stats'],
            'self_analysis': ['self analysis', 'system check', 'status report', 'diagnostics report'],
            'clipboard': ['clipboard', 'copy', 'pasteboard'],
            'call': ['call', 'dial', 'phone'],
            'sms': ['text', 'sms', 'message', 'send to'],
            'note_add': ['take a note', 'write down', 'remember this', 'save note'],
            'note_read': ['read notes', 'my notes', 'what did i note'],
            'calendar_add': ['add event', 'new event', 'schedule meeting', 'calendar add'],
            'calendar_check': ['check calendar', 'what is on my schedule', 'agenda'],
            'google': ['google', 'search for', 'look up'],
            'youtube': ['youtube', 'play video', 'watch'],
            'maps': ['maps', 'navigate', 'directions', 'where is'],
            'gmail': ['gmail', 'email', 'inbox'],
            'skill_create': ['create skill', 'learn how to', 'teach you', 'new skill'],
            'dialect_learn': ['remember that', 'means', 'alias'],
            'cron': ['schedule task', 'cron', 'daily task', 'hourly task'],
            'macro_rec': ['start recording', 'record macro'],
            'macro_stop': ['stop recording', 'finish recording'],
            'macro_run': ['run simulation', 'play macro', 'execute macro'],
            'screen_check': ['check screen', 'pixel color', 'screen analysis'],
            'computer': ['computer run', 'system execute', 'shell command'],
            'exit': ['exit', 'quit', 'shutdown', 'terminate', 'bye']
        }

    def match_intent(self, text):
        """
        Returns (intent_name, confidence)
        """
        best_intent = None
        best_score = 0.0
        text_lower = text.lower()
        words = text_lower.split()
        
        # 0. Check Adaptive Dialect (Exact User Overrides)
        dialect = load_json('dialect.json')
        if text_lower in dialect:
            return dialect[text_lower], 1.0
        for alias, intent in dialect.items():
            if text_lower.startswith(alias):
                return intent, 0.95

        # 1. Comprehensive Match Loop
        for intent, keywords in self.intents.items():
            for kw in keywords:
                current_score = 0.0
                
                # A. Exact Phrase Match in Text
                if kw in text_lower:
                    # Prefer longer matches (e.g. "create skill" > "skill")
                    # Score is 1.0 + small boost for length
                    current_score = 1.0 + (len(kw) / 100.0)
                
                # B. Fuzzy Match (Word by Word)
                # Only check fuzzy if strict match failed
                else:
                    # Skip fuzzy for short keywords (avoids 'by' -> 'bye')
                    if len(kw) >= 4:
                        matches = difflib.get_close_matches(kw, words, n=1, cutoff=0.85)
                        if matches:
                            current_score = 0.85
                
                # Update Best
                if current_score > best_score:
                    best_score = current_score
                    best_intent = intent
        
        # Threshold
        if best_score < 0.6:
            return None, 0.0
            
        return best_intent, best_score

# ==========================================
# MODULE 4: SKILLS IMPLEMENTATION
# ==========================================

# --- HARDWARE ---
def get_battery():
    try:
        result = subprocess.run(['termux-battery-status'], capture_output=True, text=True)
        data = json.loads(result.stdout)
        return f"Battery is at {data.get('percentage')}%."
    except: return "Battery unavailable."

def toggle_torch(state):
    subprocess.run(['termux-torch', state])
    return f"Flashlight {state}."

def adjust_volume(action, value=None):
    """
    action: 'up', 'down', 'set'
    value: specific number for 'set'
    """
    try:
        # Get current volume
        res = subprocess.run(['termux-volume'], capture_output=True, text=True)
        vols = json.loads(res.stdout)
        # Find music stream
        curr_vol = 10
        max_vol = 15
        for v in vols:
            if v['stream'] == 'music':
                curr_vol = v['volume']
                max_vol = v['max_volume']
                break
        
        new_vol = curr_vol
        
        if action == 'up':
            new_vol = min(curr_vol + 3, max_vol)
            subprocess.run(['termux-volume', 'music', str(new_vol)])
            return f"Voice raised to {new_vol}."
            
        elif action == 'down':
            new_vol = max(curr_vol - 3, 0)
            subprocess.run(['termux-volume', 'music', str(new_vol)])
            return f"Voice lowered to {new_vol}."
            
        elif action == 'set':
            # Try to parse value from text
            if "max" in str(value) or "loudest" in str(value): new_vol = 15
            elif "mute" in str(value) or "silent" in str(value): new_vol = 0
            else:
                nums = re.findall(r'\d+', str(value))
                if nums: new_vol = int(nums[0])
            
            subprocess.run(['termux-volume', 'music', str(new_vol)])
            return f"Volume set to {new_vol}."
            
    except Exception as e: return f"Volume control error: {e}"

def get_wifi_status():
    try:
        result = subprocess.run(['termux-wifi-connectioninfo'], capture_output=True, text=True)
        data = json.loads(result.stdout)
        return f"Connected to {data.get('ssid')}."
    except: return "WiFi disconnected."

def take_photo():
    f = f"sarii_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    subprocess.run(['termux-camera-photo', '-c', '0', f])
    return f"Photo saved: {f}"

def get_system_status():
    try:
        df = subprocess.run(['df', '-h', '/data'], capture_output=True, text=True).stdout.splitlines()[1].split()
        return f"Storage: {df[3]} free."
    except: return "Stats error."

def run_self_analysis():
    """Compiles a deep report of all systems."""
    try:
        # 1. Storage
        df = subprocess.run(['df', '-h', '/data'], capture_output=True, text=True).stdout.splitlines()[1].split()
        storage = f"Storage is {df[4]} full ({df[3]} available)."
        
        # 2. Battery
        bat = json.loads(subprocess.run(['termux-battery-status'], capture_output=True, text=True).stdout)
        battery = f"Battery health is {bat.get('health')} at {bat.get('percentage')}%."
        
        # 3. Knowledge Base
        skills = len(load_json('skills.json'))
        macros = len(load_json('macros.json'))
        dialect = len(load_json('dialect.json'))
        knowledge = f"I have learned {skills} skills, {macros} macros, and {dialect} dialect aliases."
        
        # 4. Uptime
        uptime = subprocess.run(['uptime', '-p'], capture_output=True, text=True).stdout.strip()
        
        return f"Self Analysis Complete. {storage} {battery} {knowledge} System {uptime}."
    except Exception as e:
        return f"Self analysis failed: {e}"

def get_clipboard():
    try:
        return f"Clipboard: {subprocess.run(['termux-clipboard-get'], capture_output=True, text=True).stdout.strip()}"
    except: return "Clipboard empty."

# --- COMPUTER & CRON ---
def computer_use(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5).stdout[:150]
    except Exception as e: return f"Error: {e}"

def add_cron_job(text):
    freq = "0 0 * * *"
    if "hourly" in text: freq = "0 * * * *"
    elif "reboot" in text: freq = "@reboot"
    cmd = text.replace("schedule", "").replace("daily", "").replace("hourly", "").replace("task", "").strip()
    try:
        old = subprocess.run(['crontab', '-l'], capture_output=True, text=True).stdout
        subprocess.run(['crontab', '-'], input=old + f"\n{freq} {cmd}\n", text=True)
        return "Task scheduled."
    except: return "Cron failed."

# --- PAIRS SYSTEM ---
def get_pixel_color(text):
    try:
        coords = re.findall(r'\d+', text)
        if len(coords) < 2: return "Need X Y coordinates."
        x, y = int(coords[0]), int(coords[1])
        subprocess.run(['/system/bin/screencap', 'screen.dump'])
        with open('screen.dump', 'rb') as f:
            header = f.read(12)
            w, h, fmt = struct.unpack('<III', header)
            offset = 12 + (y * w + x) * 4
            f.seek(offset)
            r, g, b, a = struct.unpack('BBBB', f.read(4))
        os.remove('screen.dump')
        return f"Pixel ({x},{y}): R{r} G{g} B{b}"
    except Exception as e: return f"Vision error: {e}"

def run_macro(text):
    name = text.replace("run simulation", "").replace("play macro", "").strip()
    macros = load_json('macros.json')
    if name not in macros: return "Macro not found."
    for step in macros[name]:
        a, p = step['action'], step['params']
        if a == 'tap': subprocess.run(['input', 'tap', str(p[0]), str(p[1])])
        elif a == 'swipe': subprocess.run(['input', 'swipe'] + [str(x) for x in p])
        elif a == 'wait': time.sleep(float(p[0]))
        time.sleep(0.5)
    return f"Executed {name}."

# --- WEB & APPS ---
def open_url(url): subprocess.run(['termux-open-url', url])
def search_google(q): open_url(f"https://www.google.com/search?q={q.replace(' ', '+')}")
def search_youtube(q): open_url(f"https://www.youtube.com/results?search_query={q.replace(' ', '+')}")
def open_maps(q): open_url(f"https://www.google.com/maps/search/{q.replace(' ', '+')}")

# --- COMMUNICATION ---
def find_contact(query):
    contacts = load_json('contacts.json')
    return contacts.get(query, query)

def make_call(text):
    name = text.replace("call", "").strip()
    num = find_contact(name)
    subprocess.run(['termux-telephony-call', num])
    return f"Calling {name}..."

def send_sms(text):
    if "saying" in text:
        parts = text.split("saying")
        name = parts[0].replace("text", "").replace("send message to", "").strip()
        msg = parts[1].strip()
        num = find_contact(name)
        subprocess.run(['termux-sms-send', '-n', num, msg])
        return "SMS sent."
    return "Say: text [name] saying [message]"

# --- DATA ---
def add_note(text):
    content = text.replace("take a note", "").strip()
    with open('notes.txt', 'a') as f: f.write(f"- {content}\n")
    return "Note saved."

def add_event(text):
    try:
        parts = text.split(" to ")
        event, day = parts[0].replace("add event", "").strip(), parts[1].strip()
        cal = load_json('calendar.json')
        if day not in cal: cal[day] = []
        cal[day].append(event)
        save_json('calendar.json', cal)
        return f"Added to {day}."
    except: return "Say: add event [thing] to [day]"

# --- ADAPTIVE DIALECT ---
def learn_dialect(text):
    # Syntax: "Remember that [phrase] means [intent_keyword]"
    # Ex: "Remember that 'juice' means 'battery'"
    try:
        # Simplify parsing
        clean = text.lower().replace("remember that", "").replace("means", "IS_MEAN").split("IS_MEAN")
        if len(clean) < 2: return "Say: Remember that [phrase] means [action]."
        
        phrase = clean[0].strip()
        target_desc = clean[1].strip()
        
        # Resolve target intent
        # User might say "means battery", so we need to map "battery" to intent key 'battery'
        nlu_engine = NLU()
        intent, score = nlu_engine.match_intent(target_desc)
        
        if not intent: return f"I don't know what '{target_desc}' is."
            
        dialect = load_json('dialect.json')
        dialect[phrase] = intent
        save_json('dialect.json', dialect)
        return f"Understood. '{phrase}' now triggers {intent}."
    except Exception as e: return f"Learning failed: {e}"

# ==========================================
# MODULE 5: CORE LOGIC
# ==========================================

RECORDING_MODE = False
MACRO_NAME = ""
MACRO_STEPS = []
nlu = NLU()

def process_command(raw_command):
    global RECORDING_MODE, MACRO_NAME, MACRO_STEPS
    if not raw_command: return
    
    cmd = raw_command.lower()
    
    if RECORDING_MODE:
        if "stop" in cmd or "finish" in cmd:
            macros = load_json('macros.json')
            macros[MACRO_NAME] = MACRO_STEPS
            save_json('macros.json', macros)
            speak("Macro saved.")
            RECORDING_MODE = False
            return
        
        try:
            if "tap" in cmd:
                nums = [int(s) for s in re.findall(r'\d+', cmd)]
                if len(nums) >= 2:
                    MACRO_STEPS.append({"action": "tap", "params": nums[:2]})
                    speak("Tap recorded.")
            elif "wait" in cmd:
                nums = [float(s) for s in re.findall(r'\d*\.?\d+', cmd)]
                if nums:
                    MACRO_STEPS.append({"action": "wait", "params": nums[:1]})
                    speak("Wait recorded.")
        except: speak("Recording error.")
        return

    intent, score = nlu.match_intent(cmd)
    
    # Custom Skills (Exact Match Fallback)
    skills = load_json('skills.json')
    if cmd in skills:
        s = skills[cmd]
        if s['action'] == 'say': speak(s['value'])
        elif s['action'] == 'open': open_url(s['value'])
        return

    if intent == 'battery': speak(get_battery())
    elif intent == 'time': speak(datetime.now().strftime("%I:%M %p"))
    elif intent == 'date': speak(datetime.now().strftime("%A, %B %d"))
    elif intent == 'torch_on': speak(toggle_torch('on'))
    elif intent == 'torch_off': speak(toggle_torch('off'))
    
    # Smart Volume
    elif intent == 'volume_up': speak(adjust_volume('up'))
    elif intent == 'volume_down': speak(adjust_volume('down'))
    elif intent == 'volume_set': speak(adjust_volume('set', cmd))
    
    elif intent == 'wifi': speak(get_wifi_status())
    elif intent == 'photo': speak(take_photo())
    elif intent == 'system': speak(get_system_status())
    elif intent == 'self_analysis': speak(run_self_analysis())
    elif intent == 'clipboard': speak(get_clipboard())
    
    elif intent == 'call': speak(make_call(cmd))
    elif intent == 'sms': speak(send_sms(cmd))
    
    elif intent == 'note_add': speak(add_note(cmd))
    elif intent == 'note_read': 
        if os.path.exists('notes.txt'):
            with open('notes.txt') as f: speak(f.readlines()[-1])
        else: speak("No notes.")
        
    elif intent == 'calendar_add': speak(add_event(cmd))
    elif intent == 'calendar_check':
        day = cmd.split("for")[-1].strip()
        cal = load_json('calendar.json')
        speak(f"On {day}: {', '.join(cal.get(day, []))}")
        
    elif intent == 'google': search_google(cmd.replace("google", "").replace("search for", "").strip())
    elif intent == 'youtube': search_youtube(cmd.replace("youtube", "").strip())
    elif intent == 'maps': open_maps(cmd.replace("maps", "").strip())
    elif intent == 'gmail': open_url("https://mail.google.com")
    
    elif intent == 'cron': speak(add_cron_job(cmd))
    elif intent == 'computer': speak(computer_use(cmd.replace("computer run", "").strip()))
    
    elif intent == 'screen_check': speak(get_pixel_color(cmd))
    elif intent == 'macro_run': speak(run_macro(cmd))
    elif intent == 'macro_rec':
        MACRO_NAME = cmd.replace("start recording", "").strip() or "unnamed"
        RECORDING_MODE = True
        MACRO_STEPS = []
        speak(f"Recording {MACRO_NAME}.")
        
    elif intent == 'skill_create':
        # Handles: "create skill [trigger] to [action] [value]"
        # AND "learn how to [trigger] by [action] [value]"
        try:
            # Normalize phrase
            phrase = cmd.replace("learn how to", "").replace("create skill", "").replace("teach you", "").strip()
            
            # Split by separator " to " or " by "
            if " by " in phrase: separator = " by "
            else: separator = " to "
            
            parts = phrase.split(separator)
            trigger = parts[0].strip()
            rest = parts[1].strip()
            
            action = "say" if "say" in rest else "open"
            value = rest.replace(action, "", 1).replace("saying", "").strip() # clean "saying"
            
            skills = load_json('skills.json')
            skills[trigger] = {"action": action, "value": value}
            save_json('skills.json', skills)
            speak(f"Skill '{trigger}' created.")
        except: speak("Skill format: Learn how to [trigger] by [saying/opening] [value].")
        
    elif intent == 'dialect_learn':
        speak(learn_dialect(cmd))

    elif intent == 'exit':
        speak("Goodbye.")
        sys.exit()
    else:
        speak("I didn't understand that.")

import threading
from flask import Flask, request, jsonify
from flask_cors import CORS

# ... (rest of imports)

# ==========================================
# MODULE 1: I/O INTERFACE
# ==========================================

# ... (rest of module 1)

# ==========================================
# MODULE 6: UPLINK SERVER
# ==========================================

app = Flask(__name__)
CORS(app) # Allow cross-origin requests from the mobile app

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "online", "system": "SARIi", "version": "6.1"})

@app.route('/command', methods=['POST'])
def handle_uplink_command():
    data = request.json
    user_cmd = data.get("command")
    if user_cmd:
        print(f"[Uplink]: {user_cmd}")
        # Run process_command in a thread to avoid blocking the server
        threading.Thread(target=process_command, args=(user_cmd,)).start()
        return jsonify({"status": "received", "command": user_cmd})
    return jsonify({"status": "error", "message": "No command provided"}), 400

def run_server():
    # Runs the server on all interfaces (0.0.0.0) at port 5000
    app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)

# ==========================================
# MODULE 5: CORE LOGIC
# ==========================================

# ... (keep existing variables)

def main():
    # Start Uplink Server in a background thread
    print("[*] Starting Uplink Server on port 5000...")
    threading.Thread(target=run_server, daemon=True).start()
    
    speak("SARIi v6.1 (Uplink) online.")
    while True:
        print("\n[Listening...]")
        user_input = listen()
        if user_input:
            print(f"> {user_input}")
            process_command(user_input)
        time.sleep(1)

if __name__ == "__main__":
    main()

# -----------------------------------------------------

# --- AUTO-GENERATED FEATURE: Edge TTS ---# Reasoning: To enhance privacy and reduce reliance on external services like gTTS, integrating a local, high-quality TTS engine is beneficial. This aligns with the trend of Edge AI and Local LLMs, where processing happens directly on the device.  This allows for better voice quality than the current fallback (espeakng) while maintaining privacy. We replace gTTS with edge-tts.
```python
import edge_tts
import asyncio

async def speak_edge_tts(text):
    """Uses Edge TTS for high-quality local neural voice output."""
    try:
        print(f"SARIi (Edge Neural): {text}")
        voice = "en-US-JennyNeural"  # Choose a suitable voice
        output_file = "temp.wav"

        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_file)

        subprocess.run(['termux-media-player', 'play', output_file], capture_output=True)

        # Give it a moment to play before deleting
        time.sleep(0.5)
        if os.path.exists(output_file):
            os.remove(output_file)
    except Exception as e:
        print(f"Edge TTS Error: {e}")
        speak_local(text)

def speak(text):
    """Primary speak function using Edge TTS neural voice, with fallback to gTTS."""
    try:
        asyncio.run(speak_edge_tts(text))
    except:
        speak_gtts(text)

# Modify gTTS fallback function to include asyncio
def speak_gtts(text):
    """Uses Google TTS for high-quality neural voice output as a fallback."""
    try:
        print(f"SARIi (Neural): {text}")
        tts = gTTS(text=text, lang='en', tld='com') # Using US English
        tts.save("temp.mp3")
        
        # Play using termux-media-player
        subprocess.run(['termux-media-player', 'play', 'temp.mp3'], capture_output=True)
        
        # Give it a moment to play before deleting
        time.sleep(0.5) 
        if os.path.exists('temp.mp3'):
            os.remove('temp.mp3')
    except Exception as e:
        print(f"gTTS Error: {e}")
        speak_local(text)
```
# -----------------------------------------------------