import threading
print("DEBUG: SARIi script started.")
import subprocess
import sys
import time
import requests
import json
import os
import struct
import difflib
import re
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# --- RETRO THEME PLAYER ---
class RetroPlayer:
    def __init__(self, tunes_dir="SARIi_Tunes"):
        self.tunes_dir = tunes_dir
        self.current_proc = None
        self.song_map = {
            "glass joe": "03 Glass Joe's Theme.mp3",
            "dungeon": "03. Dungeon Theme.mp3",
            "triforce": "09. Triforce Shard Collected.mp3",
            "match": "10 Match BGM.mp3",
            "rescue": "14. Zelda Is Rescued.mp3",
            "punchout": "03 Glass Joe's Theme.mp3",
            "zelda": "03. Dungeon Theme.mp3",
            "victory": "09. Triforce Shard Collected.mp3"
        }

    def play(self, theme_name, loop=True):
        self.stop()
        filename = self.song_map.get(theme_name.lower())
        if not filename:
            for k, v in self.song_map.items():
                if k in theme_name.lower():
                    filename = v
                    break
        if not filename: filename = theme_name

        path = os.path.join(self.tunes_dir, filename)
        if os.path.exists(path):
            print(f"[*] Playing theme: {filename}")
            cmd = ['play', '-q', path]
            if loop: cmd += ['repeat', '99']
            self.current_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            print(f"[!] Theme not found: {path}")

    def stop(self):
        if self.current_proc:
            self.current_proc.terminate()
            self.current_proc = None
        subprocess.run(['pkill', 'play'], capture_output=True)

retro_player = RetroPlayer()

def play_fanfare(sound_name):
    """Plays retro game sounds from the SARIi_Tunes folder."""
    retro_player.play(sound_name, loop=False)

# ==========================================
# MODULE 1: I/O INTERFACE
# ==========================================

def speak_local(text):
    """Uses espeakng for local text-to-speech with a relaxed pace (Fallback)."""
    try:
        print(f"SARIi (Fallback): {text}")
        subprocess.run(['espeak', '-v', 'en-us', '-s', '140', '-p', '40', '-w', 'temp.wav', text])
        subprocess.run(['play', '-q', 'temp.wav'])
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
        
        # Play using sox play
        subprocess.run(['play', '-q', 'temp.mp3'], capture_output=True)
        
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
            'exit': ['exit', 'quit', 'shutdown', 'terminate', 'bye'],
            # NEW SKILLS
            'analyze_code': ['analyze folder', 'review code', 'scan project', 'check code'],
            'joke': ['tell me a joke', 'make me laugh', 'funny', 'joke'],
            'play_music': ['play victory music', 'play zelda', 'play punch out', 'play retro sound'],
            'ollama': ['ask ollama', 'hey ollama', 'consult ollama', 'local ai']
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

# --- OLLAMA INTEGRATION ---
def ask_ollama(text):
    """Queries the local Ollama instance."""
    prompt = text.replace("ask ollama", "").replace("hey ollama", "").replace("consult ollama", "").strip()
    if not prompt: return "What should I ask?"
    
    speak(f"Asking local brain: {prompt}")
    try:
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": "termux-assistant", # Using the model from your ollama_chat.py
            "prompt": f"You are SARIi, a helpful AI assistant. Keep response concise (under 2 sentences). User asks: {prompt}",
            "stream": False
        }
        response = requests.post(url, json=payload, timeout=30)
        if response.status_code == 200:
            res_text = response.json().get('response', '')
            return res_text
        else:
            return f"Ollama returned status {response.status_code}"
    except Exception as e:
        return f"Could not reach Ollama. Is it running? Error: {e}"

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
    if not name: return "Who should I call?"
    
    num = find_contact(name)
    
    # Check if 'num' is actually a number (or close to it)
    if num == name: 
        # Means find_contact failed to find a number
        # Check if user actually spoke a number (digits)
        if not any(char.isdigit() for char in name):
             return f"I don't have a number for {name}. Please add them to contacts."
    
    subprocess.run(['termux-telephony-call', num])
    return f"Calling {name}..."

def send_sms(text):
    if "saying" in text:
        parts = text.split("saying")
        name = parts[0].replace("text", "").replace("send message to", "").replace("send sms to", "").strip()
        msg = parts[1].strip()
        
        if not name or not msg: return "Say: text [name] saying [message]"

        num = find_contact(name)
        
        if num == name and not any(char.isdigit() for char in name):
             return f"I don't have a number for {name}."
             
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
        
    elif intent == 'analyze_code':
        speak(analyze_folder(cmd))

    elif intent == 'ollama':
        speak(ask_ollama(cmd))
        
    elif intent == 'joke':
        speak(tell_joke())
        
    elif intent == 'play_music':
        # Handles: "play zelda", "play punch out", "stop music"
        if "stop" in cmd or "quiet" in cmd:
            retro_player.stop()
            speak("Music stopped.")
        else:
            theme = cmd.replace("play", "").replace("music", "").strip()
            if not theme: theme = "zelda" # default
            retro_player.play(theme)

    elif intent == 'exit':
        speak("Goodbye.")
        sys.exit()
    else:
        # Fallback to Ollama for general conversation
        speak(ask_ollama(cmd))

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
    return jsonify({"status": "online", "system": "SARIi", "version": "6.2"})

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

def ensure_ollama_running():
    print("[*] Checking Ollama status...")
    try:
        requests.get("http://localhost:11434", timeout=1)
        print("[*] Ollama is already running.")
    except:
        print("[*] Ollama not found. Starting server...")
        try:
            subprocess.Popen(['ollama', 'serve'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("[*] Waiting for Ollama to initialize...")
            for _ in range(15):
                try:
                    requests.get("http://localhost:11434", timeout=1)
                    print("[*] Ollama is now online.")
                    return
                except:
                    time.sleep(1)
            print("[!] Warning: Ollama server started but is not yet responsive.")
        except Exception as e:
            print(f"[!] Failed to start Ollama: {e}")

def main():
    # Ensure Ollama is running
    ensure_ollama_running()

    # Start Uplink Server in a background thread
    print("[*] Starting Uplink Server on port 5000...")
    threading.Thread(target=run_server, daemon=True).start()
    
    # Start Personality Engine
    threading.Thread(target=idle_behavior_loop, daemon=True).start()
    
    speak("SARIi v6.2 (Analyst Edition) online.")
    while True:
        print("\n[Listening...]")
        user_input = listen()
        if user_input:
            print(f"> {user_input}")
            process_command(user_input)
        time.sleep(1)


# -----------------------------------------------------

# --- AUTO-GENERATED FEATURE: Edge TTS ---
# Reasoning: To enhance privacy and reduce reliance on external services like gTTS, 
# integrating a local, high-quality TTS engine is beneficial. 

import edge_tts
import asyncio
import glob
import random

# --- MODULE 7: CODE ANALYST & PERSONALITY ---

def analyze_folder(path_arg):
    """Reads code files in a folder and asks Gemini for a review."""
    target_path = path_arg.replace("analyze", "").replace("review", "").replace("folder", "").strip()
    if not target_path: target_path = "."
    
    # Resolve relative paths
    if target_path == ".": abs_path = os.getcwd()
    else:
        # Check if user meant a folder relative to home
        if not target_path.startswith("/") and not target_path.startswith("."):
            abs_path = os.path.join(os.path.expanduser("~"), target_path)
        else:
            abs_path = os.path.abspath(target_path)
    
    if not os.path.exists(abs_path):
        return f"I can't find the folder: {target_path}"

    speak(f"Scanning project {os.path.basename(abs_path)}...")
    
    # Gather code content
    code_summary = ""
    file_count = 0
    extensions = ['*.py', '*.tsx', '*.ts', '*.js', '*.html', '*.json', '*.md']
    
    for ext in extensions:
        for filepath in glob.glob(os.path.join(abs_path, '**', ext), recursive=True):
            if "node_modules" in filepath or ".git" in filepath or "build" in filepath: continue
            
            try:
                with open(filepath, 'r') as f:
                    content = f.read()
                    if len(content) > 5000: content = content[:5000] + "...(truncated)"
                    code_summary += f"\n--- FILE: {os.path.basename(filepath)} ---\n{content}\n"
                    file_count += 1
            except: pass
            
            if file_count >= 10: break # Increased context limit
        if file_count >= 10: break

    if not code_summary: return "No code files found to analyze."

    # Ask Gemini
    try:
        import google.generativeai as genai
        GOOGLE_KEY = os.getenv("GOOGLE_API_KEY")
        if not GOOGLE_KEY: return "I need a GOOGLE_API_KEY to think."
        
        genai.configure(api_key=GOOGLE_KEY)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""
        ROLE: Senior Software Architect.
        TASK: Analyze this code snippet from folder '{os.path.basename(abs_path)}'.
        1. Summarize what this project does.
        2. Identify 1 potential bug or issue.
        3. Suggest 1 improvement.
        
        CODE:
        {code_summary}
        """
        
        response = model.generate_content(prompt)
        
        # PLAY ZELDA VICTORY AFTER ANALYSIS
        play_fanfare("zelda")
        
        return f"Analysis complete. {response.text}"
        
    except Exception as e:
        return f"My brain hurts. Error: {e}"

# --- PERSONALITY ENGINE ---
IDLE_TIMER = 0

def idle_behavior_loop():
    """Runs in background to make SARIi feel alive."""
    global IDLE_TIMER
    behaviors = [
        lambda: speak("Hmph. Just looking at some data."),
        lambda: speak("I wonder if I can optimize my own code..."),
        lambda: speak("Do you ever feel like you're just living in a terminal?"),
        lambda: speak("*humming* Hmm hmm hmmm..."),
        lambda: speak("*fart noise* ... Excuse me. My buffer overflowed."),
        lambda: speak("I am ready when you are."),
        lambda: speak("Did you know that in Python, 'import this' reveals the Zen of Python?"),
    ]
    
    while True:
        time.sleep(60) # Check every minute
        IDLE_TIMER += 1
        
        # Trigger random event every 5-10 minutes of silence
        if IDLE_TIMER > random.randint(5, 10):
            action = random.choice(behaviors)
            action()
            IDLE_TIMER = 0

def tell_joke():
    jokes = [
        "Why do Python programmers have low vision? Because they don't C sharp.",
        "I tried to catch some fog earlier. I mist.",
        "A SQL query walks into a bar, walks up to two tables and asks... can I join you?",
        "Why was the JavaScript developer sad? Because he didn't know how to null his feelings.",
        "I'd tell you a UDP joke, but you might not get it."
    ]
    return random.choice(jokes)

def speak_piper(text):
    """Uses Piper for high-quality local neural voice output."""
    try:
        print(f"SARIi (Piper): {text}")
        # Absolute path based on current working directory
        piper_dir = os.path.join(os.getcwd(), 'piper')
        piper_binary = os.path.join(piper_dir, 'piper', 'piper')
        model_path = os.path.join(piper_dir, 'en_US-amy-low.onnx')
        output_file = "temp_piper.wav"

        # Check if assets exist
        if not os.path.exists(piper_binary):
            raise FileNotFoundError(f"Piper binary not found at {piper_binary}")
        if not os.path.exists(model_path):
             raise FileNotFoundError(f"Piper model not found at {model_path}")

        # Execute Piper
        subprocess.run([piper_binary, '--model', model_path, '--output_file', output_file], 
                       input=text.encode('utf-8'), 
                       capture_output=True, 
                       check=True)
        
        # Play audio
        subprocess.run(['play', '-q', output_file], capture_output=True)
        
        # Cleanup
        if os.path.exists(output_file):
            os.remove(output_file)
            
    except Exception as e:
        print(f"Piper TTS Error: {e}")
        speak_local(text)

async def speak_edge_tts(text):
    """Uses Edge TTS for high-quality local neural voice output."""
    try:
        print(f"SARIi (Edge Neural): {text}")
        voice = "en-US-JennyNeural"  # Choose a suitable voice
        output_file = "temp.wav"

        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_file)

        subprocess.run(['play', '-q', output_file], capture_output=True)

        # Give it a moment to play before deleting
        time.sleep(0.5)
        if os.path.exists(output_file):
            os.remove(output_file)
    except Exception as e:
        print(f"Edge TTS Error: {e}")
        speak_local(text)

def speak(text):
    """Primary speak function using Piper neural voice."""
    global IDLE_TIMER
    IDLE_TIMER = 0
    speak_piper(text)

# Modify gTTS fallback function to include asyncio
def speak_gtts(text):
    """Uses Google TTS for high-quality neural voice output as a fallback."""
    try:
        print(f"SARIi (Neural): {text}")
        tts = gTTS(text=text, lang='en', tld='com') # Using US English
        tts.save("temp.mp3")
        
        # Play using sox play
        subprocess.run(['play', '-q', 'temp.mp3'], capture_output=True)
        
        # Give it a moment to play before deleting
        time.sleep(0.5) 
        if os.path.exists('temp.mp3'):
            os.remove('temp.mp3')
    except Exception as e:
        print(f"gTTS Error: {e}")
        speak_local(text)

# --- NLU UPDATE ---
# We inject the new intents into the existing NLU class at runtime or redefine match_intent
# For simplicity in this append-style edit, we handle it in process_command.

# -----------------------------------------------------

# -----------------------------------------------------
if __name__ == "__main__":
    main()
