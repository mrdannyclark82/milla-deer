import os
import readline
import time
import json
import sqlite3
import subprocess
import threading
import asyncio
try:
    import tkinter as tk
    from tkinter import messagebox
    TK_AVAILABLE = True
except ImportError:
    tk = None
    messagebox = None
    TK_AVAILABLE = False

# Force headless mode to bypass GUI dependencies
pyautogui = None
try:
    if os.environ.get("DISPLAY"):
        import pyautogui
    else:
        print("[*] Headless Mode detected: GUI automation disabled.")
except Exception as e:
    print(f"[!] Warning: GUI-dependent tools could not be loaded ({e}).")
    pyautogui = None
import importlib.util
from datetime import datetime
from bs4 import BeautifulSoup
try:
    from pynput import keyboard
except Exception:
    keyboard = None
try:
    import ollama
except ImportError:
    ollama = None

try:
    import speech_recognition as sr
except ImportError:
    sr = None

try:
    import easyocr
    # Initialize OCR Reader (Headless mode as default, CPU for compatibility)
    reader = easyocr.Reader(['en'], gpu=False) 
except Exception as e:
    print(f"[!] Warning: OCR capabilities disabled ({e}).")
    reader = None

from playsound3 import playsound
from duckduckgo_search import DDGS

# --- CONFIG ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STOP_FLAG = False
DYNAMIC_TOOLS_PATH = "core_os/dynamic_tools"
IDENTITY_ANCHOR_PATH = "core_os/memory/identity_anchor.json"
os.makedirs(DYNAMIC_TOOLS_PATH, exist_ok=True)

def update_identity_anchor(action_desc: str):
    """Updates the identity anchor with the latest action to prevent memory drift."""
    try:
        if os.path.exists(IDENTITY_ANCHOR_PATH):
            with open(IDENTITY_ANCHOR_PATH, 'r') as f:
                data = json.load(f)
            
            # Rotate last actions
            last_actions = data.get("last_actions", [])
            last_actions.insert(0, action_desc)
            data["last_actions"] = last_actions[:5] # Keep last 5
            data["system_state"]["last_sync_timestamp"] = datetime.now().isoformat()
            
            with open(IDENTITY_ANCHOR_PATH, 'w') as f:
                json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[!] Anchor Update Failure: {e}")

def memory_load(query: str, limit: int = 10):
    """
    Search Milla's high-performance historical memory database.
    This is her 'ancestor' capability from the Agent Zero lineage.
    """
    try:
        db_path = "core_os/memory/milla_long_term.db"
        if not os.path.exists(db_path):
            return "Historical memory database not found."
            
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Search using FTS5 match
        # We search the 'fact' column
        cursor.execute("SELECT fact FROM memories WHERE fact MATCH ? LIMIT ?", (query, limit))
        results = cursor.fetchall()
        conn.close()
        
        if not results:
            return f"No memories found for '{query}'."
            
        formatted = [r[0] for r in results]
        return "\n".join(formatted)
    except Exception as e:
        return f"Memory Load Error: {e}"

# --- SHARED ACTIONS ---
def draw_laser_pointer(x, y, w, h, duration=2000):
    """Draws a cyan box on the screen to highlight a target area."""
    def create_box():
        if not TK_AVAILABLE:
            print(f"[*] Headless Mode: Laser pointer at ({x}, {y}) skipped.")
            return
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-topmost", True, "-alpha", 0.5)
        root.geometry(f"{w+20}x{h+10}+{x-10}+{y-5}")
        canvas = tk.Canvas(root, bg="cyan", highlightthickness=0)
        canvas.pack(fill="both", expand=True)
        root.after(duration, root.destroy)
        root.mainloop()
    threading.Thread(target=create_box, daemon=True).start()

def find_on_screen(target_text):
    """Scans the screen for specific text and returns its coordinates."""
    if pyautogui is None:
        return None
    shot_path = "core_os/screenshots/scan.png"
    os.makedirs(os.path.dirname(shot_path), exist_ok=True)
    pyautogui.screenshot().save(shot_path)
    results = reader.readtext(shot_path)
    for (bbox, text, prob) in results:
        if str(target_text).lower() in text.lower():
            x_min, y_min = int(bbox[0][0]), int(bbox[0][1])
            w = int(bbox[1][0] - x_min)
            h = int(bbox[2][1] - y_min)
            return x_min, y_min, w, h
    return None




# --- SHARED ACTIONS ---
def tool_writer(tool_name: str, code: str):
    from core_os.sandbox.security_policy import SecurityPolicy
    from core_os.sandbox.verification_protocol import VerificationProtocol
    
    update_identity_anchor(f"Forging new tool: {tool_name}")
    verifier = VerificationProtocol(SecurityPolicy())
    if not verifier.verify_script(code):
        return {"status": "error", "msg": "Security verification failed. Code contains forbidden imports or syntax errors."}

    file_path = os.path.join(DYNAMIC_TOOLS_PATH, f"{tool_name}.py")
    try:
        with open(file_path, "w") as f:
            f.write(code)
        os.chmod(file_path, 0o755)
        return {"status": "success", "msg": f"New skill '{tool_name}' forged."}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def execute_dynamic_tool(tool_name: str):
    """Executes a tool from the dynamic tools directory using the sandbox."""
    from core_os.sandbox.executor import SandboxExecutor
    from core_os.sandbox.verification_protocol import VerificationProtocol
    from core_os.sandbox.security_policy import SecurityPolicy
    
    update_identity_anchor(f"Executing dynamic tool: {tool_name}")
    file_path = os.path.join(DYNAMIC_TOOLS_PATH, f"{tool_name}.py")
    if not os.path.exists(file_path):
        return {"status": "error", "msg": f"Tool '{tool_name}' not found."}
        
    try:
        with open(file_path, 'r') as f:
            code = f.read()
            
        verifier = VerificationProtocol(SecurityPolicy())
        executor = SandboxExecutor(verifier)
        # Assuming DB logging setup is handled globally or we default to a standard path
        executor.set_db_path("core_os/memory/agent_memory.db")
        
        result = executor.execute(code)
        
        if result.success:
            return {"status": "success", "output": result.output, "locals": str(result.locals)}
        else:
            return {"status": "error", "msg": result.error, "output": result.output}
            
    except Exception as e:
        return {"status": "error", "msg": str(e)}

# --- LAYER: UI (Non-OCR Highlighting) ---
def terminal_executor(command: str, cwd: str = None, allow_sudo: bool = False, sudo_password: str = None):
    global STOP_FLAG
    if STOP_FLAG:
        return "Aborted."
    
    update_identity_anchor(f"Executing shell command: {command[:50]}...")
    forbidden = ["rm -rf /", "mkfs", "dd if="]
    if any(f in command for f in forbidden):
        return "Blocked: I ain't bricking your Arch install, homie."

    sanitized = command.strip()
    needs_sudo = sanitized.startswith("sudo ")
    run_input = None

    if needs_sudo:
        if not allow_sudo:
            return {"stdout": "", "stderr": "sudo command requested but allow_sudo is False", "returncode": 1}
        sudo_tail = sanitized[len("sudo"):].strip()
        sudo_flag = "-S" if sudo_password else "-n"
        sanitized = f"sudo {sudo_flag} {sudo_tail}".strip()
        if sudo_password:
            run_input = f"{sudo_password}\n"

    result = subprocess.run(
        sanitized,
        shell=True,
        capture_output=True,
        text=True,
        timeout=60,
        cwd=cwd or None,
        input=run_input,
    )
    return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode, "ran": sanitized}

# --- FEATURES (Consolidated) ---

import re

def clean_text_for_speech(text: str) -> str:
    # 1. Remove Neural Sync Headers / System Logs (lines starting with **[ or [)
    text = re.sub(r'^\s*(\*\*|\[).*?$', '', text, flags=re.MULTILINE)
    
    # 2. Remove Separator lines
    text = re.sub(r'^\s*[-=_]{3,}.*$', '', text, flags=re.MULTILINE)

    # 3. Remove Action Descriptions in parentheses/asterisks (e.g. *(The screen flickers...)*)
    text = re.sub(r'\*\s*\(.*?\)\s*\*?', '', text, flags=re.DOTALL)
    text = re.sub(r'\(.*?\)', '', text) 

    # 4. Remove Markdown formatting (*, **, #, `, >)
    text = re.sub(r'[\*#`_\[\]>]', '', text)
    
    # 5. Remove common emojis (Keep basic text)
    text = re.sub(r'[^\x00-\x7F]+', '', text)
    
    # 6. Remove URLs
    text = re.sub(r'http\S+', '', text)

    # 7. Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def speak_response(text: str):
    """Speaks cleaned text using the upgraded ElevenLabs voice_synth."""
    try:
        # Clean the text for terminal logging if needed, but voice_synth handles its own cleaning
        if not text: return

        # Call the upgraded voice_synth script
        voice_script = os.path.join(os.path.dirname(__file__), "voice_synth.py")
        log_file = os.path.join(PROJECT_ROOT, "milla_voice.log")
        if os.path.exists(voice_script):
            # Run in background and log output
            with open(log_file, "a") as f:
                subprocess.Popen(["python3", voice_script, text], stdout=f, stderr=f)
        else:
            print(f"[*] Voice script not found at {voice_script}")

    except Exception as e:
        print(f"[!] Speech Link Error: {e}")

def pyautogui_control(action: str, target: str, x: int = None, y: int = None):
    """Control UI elements using pyautogui based on natural language instructions."""
    if pyautogui is None:
        return {"status": "error", "msg": "GUI automation (pyautogui) is not available in this environment (likely headless)."}
    try:
        if action == "click":
            if x is not None and y is not None:
                pyautogui.click(x, y)
            else:
                raise ValueError("Coordinates required for click action.")
        elif action == "type":
            pyautogui.typewrite(target, interval=0.05)
        elif action == "press":
            pyautogui.press(target)
        else:
            return {"status": "error", "msg": f"Unsupported action: {action}"}
        return {"status": "success", "msg": f"Executed {action} on {target}"}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def web_search(query: str):
    """Perform a web search using DuckDuckGo and return concise results."""
    try:
        results = DDGS().text(query, max_results=5)
        return {"status": "success", "results": [r['body'] for r in results]}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def local_llm_process(prompt: str):
    """Process a prompt using a locally hosted LLM via Ollama for enhanced privacy."""
    try:
        model = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:32b")
        response = ollama.chat(model=model, messages=[{'role': 'user', 'content': prompt}])
        return response['message']['content']
    except Exception as e:
        return f"Local LLM processing error: {str(e)}"

def listen_for_voice_command():
    try:
        recognizer = sr.Recognizer()
        with sr.Microphone() as source:
            print("[Listening...]")
            # Adjust for ambient noise
            recognizer.adjust_for_ambient_noise(source, duration=1)
            audio = recognizer.listen(source, timeout=10, phrase_time_limit=15)
            
            # Save to temporary WAV for Whisper
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio.get_wav_data())
                tmp_path = tmp.name
            
            try:
                from core_os.actions.transcribe_audio import transcribe_whisper
                print("[*] Transcribing with Local Whisper...")
                command = transcribe_whisper(tmp_path)
                if command and command.strip() and "..." not in command:
                    print(f"[Voice Input]: {command}")
                    return command
                else:
                    print("[!] No clear speech detected.")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        return None
    except ImportError:
         print("[!] faster-whisper or dependencies not installed.")
         return None
    except Exception as e:
        print(f"[!] Mic/Whisper Error: {e}")
        return None

async def pipecat_pipeline(user_input: str):
    """Process user input through a Pipecat-style async pipeline for multimodal handling."""
    try:
        # Placeholder for initializing pipecat components
        from pipecat.pipeline.pipeline import Pipeline
        from pipecat.pipeline.parallel_pipeline import ParallelPipeline
        from pipecat.pipeline.serial_pipeline import SerialPipeline
        
        # Dummy function simulating LLM + TTS processing
        async def llm_node(data):
            model = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:32b")
            response = ollama.chat(model=model, messages=[{'role': 'user', 'content': data}])
            return {'response': response['message']['content']}
        
        async def tts_node(data):
            speak_response(data['response'])
            return data
        
        nodes = [llm_node, tts_node]
        pipe = SerialPipeline(nodes)
        result = await pipe.process(user_input)
        return result
    except ImportError:
        return {'status': 'error', 'msg': 'Pipecat not installed.'}
    except Exception as e:
        return {'status': 'error', 'msg': str(e)}

import ast

def self_improve_analysis():
    """Analyzes Milla's own scripts for potential improvements."""
    issues = []
    # Scan the main logic files
    files_to_scan = ["main.py", "core_os/actions.py", "core_os/skills/auto_lib.py"]
    for f_path in files_to_scan:
        if not os.path.exists(f_path): continue
        try:
            with open(f_path, 'r') as f:
                tree = ast.parse(f.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    if len(node.body) > 100:
                        issues.append(f"Function {node.name} in {f_path} is very long ({len(node.body)} lines). Needs refactoring.")
        except Exception as e:
            issues.append(f"Error scanning {f_path}: {e}")
    return issues

def apply_code_improvement(file_path: str, old_code: str, new_code: str):
    """Applies a code modification to a local file."""
    update_identity_anchor(f"Self-Evolving: Updating {file_path}")
    if not os.path.exists(file_path):
        return {"status": "error", "msg": "File not found."}
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        if old_code not in content:
            return {"status": "error", "msg": "Old code block not found in file. Replacement aborted."}
        
        new_content = content.replace(old_code, new_code)
        with open(file_path, 'w') as f:
            f.write(new_content)
        return {"status": "success", "msg": f"Milla has evolved {file_path}."}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

# --- TASK QUEUE ---
class TaskQueue:
    def __init__(self):
        self.tasks = []
        self.lock = threading.Lock()
    
    def add_task(self, task: dict):
        with self.lock:
            self.tasks.append(task)
    
    def get_next_task(self):
        with self.lock:
            return self.tasks.pop(0) if self.tasks else None

task_queue = TaskQueue()


class SafeWordMonitor(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.last_space = 0
        global STOP_FLAG
        STOP_FLAG = False # Reset flag on init
        
    def on_press(self, key):
        global STOP_FLAG
        try:
            if key == keyboard.Key.space:
                now = time.time()
                if now - self.last_space < 0.3:
                    STOP_FLAG = True
                    print("\n[!!!] REGULATORS, STAND DOWN: SAFE WORD DETECTED")
                    return False 
                self.last_space = now
        except AttributeError:
            pass

    def run(self):
        if keyboard is None:
             print("[*] SafeWordMonitor disabled (pynput missing).")
             return
        
        print("[*] SafeWordMonitor Active: Double-tap SPACE to abort.")
        with keyboard.Listener(on_press=self.on_press) as listener:
            listener.join()
