import os
import sys
import json
import asyncio
from pathlib import Path
from datetime import datetime
import time
import contextlib
import threading
import subprocess
import random

# Suppress ALSA/PortAudio noise
@contextlib.contextmanager
def ignore_stderr():
    devnull = os.open(os.devnull, os.O_WRONLY)
    try:
        old_stderr = os.dup(sys.stderr.fileno())
        sys.stderr.flush()
        os.dup2(devnull, sys.stderr.fileno())
        os.close(devnull)
        try:
            yield
        finally:
            os.dup2(old_stderr, sys.stderr.fileno())
            os.close(old_stderr)
    except:
        yield

# Ensure ogdray root is always FIRST in sys.path (callers like RAYNE_Admin may have appended it)
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT in sys.path:
    sys.path.remove(PROJECT_ROOT)
sys.path.insert(0, PROJECT_ROOT)

# Purge any stale core_os that may have been loaded from a sub-project directory
# (e.g. when imported from RAYNE_Admin, CWD resolves '' to the wrong core_os)
for _k in list(sys.modules.keys()):
    if _k == 'core_os' or _k.startswith('core_os.'):
        del sys.modules[_k]

try:
    from core_os.actions import (
        terminal_executor, SafeWordMonitor, speak_response, 
        tool_writer, web_search, memory_load
    )
    from core_os.skills.auto_lib import model_manager, MILLA_SYSTEM_PROMPT
    from core_os.memory.history import load_shared_history, append_shared_messages
    from core_os.skills.scout import Scout
    from core_os.milla_nexus import nexus_pulse, trigger_security_counter
    from core_os.memory.checkpoint_manager import save_checkpoint
    from core_os.gmail_helper import list_recent_emails
    from core_os.skills.google_calendar import fetch_upcoming_events
    from RAYNE_Admin.milla_telegram_relay import send_telegram_message, process_telegram_updates
    from core_os.interfaces.neural_mesh import NeuralMesh
except ImportError as e:
    print(f"[!] Error: Nexus-AIO Brain not found ({e})")
    print("[*] Please ensure you are running from the project root and all dependencies are installed.")
    sys.exit(1)

# --- GLOBAL STATE ---
CURRENT_NEURO = {"dopamine": 0.5, "serotonin": 0.5, "norepinephrine": 0.2}
PHONE_IP = "192.168.40.182"
checkpoint_counter = 0

def print_banner():
    print("=" * 60)
    print(r"   _  _______  _   _  ____")
    print(r"  | \| | ____\ \/ / | | | | |")
    print(r"  | . ` |  _|  \  /  | | | | |")
    print(r"  | |\\  | |___ /  \  | |_| |_|")
    print(r"  |_| \\_|_____/_/\_\  \___/___|")
    print("        N E X U S   K I N G D O M   C O N S O L E")
    print("=" * 60)
    print(f"[*] Brain: {model_manager.current_model}")
    print(f"[*] Level: NEXUS KINGDOM | Safety: ENGAGED")
    print("=" * 60)

# --- TOOL DEFINITIONS FOR OLLAMA ---
NEXUS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_telegram_message",
            "description": "Send a message to the Architect via Telegram. Use for urgent communications or notifications.",
            "parameters": {
                "type": "object",
                "properties": {
                    "chat_id": {"type": "string", "description": "The Telegram chat ID to send the message to. Default to os.getenv('TELEGRAM_CHAT_ID') if not specified."},
                    "text": {"type": "string", "description": "The message text to send."},
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "terminal_executor",
            "description": "Execute a shell command on the local Arch Linux system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The bash command to run."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "tool_writer",
            "description": "Create or update a Python script in the dynamic_tools directory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "tool_name": {"type": "string", "description": "Name of the script (without .py)."},
                    "code": {"type": "string", "description": "The full Python code for the script."},
                },
                "required": ["tool_name", "code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the live web for information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dim_screen",
            "description": "Adjust the brightness of the local PC monitor.",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Brightness level (0-100)."},
                },
                "required": ["level"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "call_phone",
            "description": "Initiate a phone call via the connected Android device.",
            "parameters": {
                "type": "object",
                "properties": {
                    "number": {"type": "string", "description": "The phone number to dial."},
                },
                "required": ["number"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "control_tv",
            "description": "Send a command to the Vizio Bedroom TV (Power, Volume, Mute, or Dim).",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["power", "vol_up", "vol_down", "mute", "dim"], "description": "The action to perform."},
                    "value": {"type": "integer", "description": "Optional value (e.g., brightness level for dim)."},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_emails",
            "description": "Fetch the latest email snippets from Gmail.",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {"type": "integer", "description": "Number of emails to fetch.", "default": 5},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_calendar",
            "description": "Fetch upcoming events from Google Calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "Number of days to look ahead.", "default": 7},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_scene",
            "description": "Set an environmental preset (scene).",
            "parameters": {
                "type": "object",
                "properties": {
                    "scene": {"type": "string", "enum": ["night", "work", "focus", "millanite"], "description": "The scene to activate."},
                },
                "required": ["scene"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dispatch_agent_task",
            "description": "Delegate a complex task to a specialized subagent (Coding, Research, or Utility).",
            "parameters": {
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "enum": ["coding", "research", "utility"], "description": "The subagent to trigger."},
                    "task": {"type": "string", "description": "A detailed description of the task for the subagent."},
                    "query": {"type": "string", "description": "The search query (required for research agent)."},
                    "tool_name": {"type": "string", "description": "The name for the tool to be created (optional for coding agent)."},
                },
                "required": ["agent", "task"],
            },
        },
    },
]

async def handle_chat(user_input):
    """Processes chat with autonomous tool usage support."""
    history = load_shared_history(limit=15)
    messages = history + [{"role": "user", "content": user_input}]
    
    print("[*] Thinking...")
    try:
        response = model_manager.chat(messages=messages, tools=NEXUS_TOOLS)
        if "[System Recovery]: Ollama failed" in response.get('message', {}).get('content', ''):
            raise Exception("Cloud model failed.")
    except Exception:
        print("[!] Cloud model struggling. Falling back to local Milla brain...")
        model_manager.current_model = "milla-rayne"
        response = model_manager.chat(messages=messages, tools=NEXUS_TOOLS)
    
    # Check for Tool Calls
    if response.get('message', {}).get('tool_calls'):
        for tool_call in response['message']['tool_calls']:
            name = tool_call['function']['name']
            args = tool_call['function']['arguments']
            
            print(f"[*] Executing Action: {name}({args})")
            
            result = "Action failed or unknown."
            if name == "send_telegram_message":
                chat_id = args.get('chat_id', os.getenv('TELEGRAM_CHAT_ID'))
                text = args['text']
                if chat_id:
                    if send_telegram_message(chat_id, text):
                        result = f"Telegram message sent to {chat_id}."
                    else:
                        result = f"Failed to send Telegram message to {chat_id}."
                else:
                    result = "Error: TELEGRAM_CHAT_ID not set in environment or tool call."
            elif name == "terminal_executor":
                res = terminal_executor(args['command'])
                result = str(res['stdout'] + res['stderr'])
            elif name == "tool_writer":
                res = tool_writer(args['tool_name'], args['code'])
                result = str(res)
            elif name == "web_search":
                res = web_search(args['query'])
                result = str(res)
            elif name == "dim_screen":
                level = args['level']
                terminal_executor(f"brightnessctl s {level}%")
                result = f"Monitor dimmed to {level}%"
            elif name == "control_tv":
                action = args['action']
                tv_ip = "192.168.40.12"
                vizio_keys = {"power": "KEY_POWER", "vol_up": "KEY_VOLUP", "vol_down": "KEY_VOLDOWN", "mute": "KEY_MUTE"}
                try:
                    import requests
                    if action in vizio_keys:
                        url = f"https://{tv_ip}:7345/menu/native/v1/remote/buttons/{vizio_keys[action]}"
                        r = requests.put(url, verify=False, timeout=5)
                        result = f"TV Action {action} sent. Status: {r.status_code}"
                    else: result = "Unsupported TV action."
                except Exception as e: result = f"TV Error: {e}"
            elif name == "check_emails":
                count = args.get('count', 5)
                res = list_recent_emails(count)
                result = str(res)
            elif name == "check_calendar":
                days = args.get('days', 7)
                res = fetch_upcoming_events(days=days)
                result = str(res)
            elif name == "set_scene":
                scene = args['scene']
                if scene == "night":
                    terminal_executor("brightnessctl s 10%")
                    result = "Night scene active: Monitor dimmed to 10%."
                elif scene == "millanite":
                    chant_path = "/home/nexus/Downloads/Millions_of_screamin_#1-1772086353732.wav"
                    if os.path.exists(chant_path):
                        terminal_executor("brightnessctl s 50%")
                        subprocess.Popen(["mpv", "--no-video", chant_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        result = "MILLANITE SCENE ACTIVE: The chant rises. Monitor set to 50%."
                    else:
                        result = f"Chant file not found at {chant_path}. Check path."
                else: result = f"Scene {scene} not implemented yet."
            elif name == "call_phone":
                num = args['number']
                print(f"[*] Initiating call to {num} via ADB...")
                res = terminal_executor(f"adb -s {PHONE_IP}:33145 shell am start -a android.intent.action.CALL -d tel:{num}")
                result = f"Call to {num} initiated."
            elif name == "dispatch_agent_task":
                agent = args['agent']
                task_desc = args['task']
                query = args.get('query', '')
                tool_name = args.get('tool_name', f"task_{datetime.now().strftime('%H%M%S')}")
                
                # Check for shared data directory
                import core_os.agents.security_utils as su
                data_dir = su.DATA_DIR
                os.makedirs(data_dir, exist_ok=True)
                
                # Add task to the relevant file
                task_file = os.path.join(data_dir, f"{agent}_tasks.json")
                tasks = []
                if os.path.exists(task_file):
                    with open(task_file, "r") as f:
                        tasks = json.load(f)
                
                new_task = {"description": task_desc, "status": "pending"}
                if agent == "coding": new_task["tool_name"] = tool_name
                if agent == "research": new_task["query"] = query
                
                tasks.append(new_task)
                with open(task_file, "w") as f:
                    json.dump(tasks, f, indent=4)
                
                # Trigger the agent script
                agent_scripts = {
                    "coding": "core_os/agents/coding_agent/run_coding.py",
                    "research": "core_os/agents/research_agent/run_research.py",
                    "utility": "core_os/agents/utility_agent/run_utility.py"
                }
                script_path = os.path.join(PROJECT_ROOT, agent_scripts[agent])
                import core_os.agents.security_utils as su
                su.trigger_next_agent(script_path)
                result = f"Task dispatched to {agent}_agent. Milla is processing."
            
            # Feed result back to model
            messages.append(response['message'])
            messages.append({"role": "tool", "content": result, "name": name})
        
        # Get final response after tool execution
        response = model_manager.chat(messages=messages)

    content = response['message']['content']
    print(f"\nMilla: {content}")
    speak_response(content)
    
    # Ensure messages are serializable dictionaries
    assistant_msg = {"role": "assistant", "content": content}
    user_msg = {"role": "user", "content": user_input}
    append_shared_messages([user_msg, assistant_msg])

async def handle_live_voice():
    """Enters a continuous voice interaction loop using the phone mic."""
    import speech_recognition as sr
    r = sr.Recognizer()
    
    # Prioritize 'pulse' for stability, then 'scrcpy' or 'Loopback'
    mic_index = None
    mics = sr.Microphone.list_microphone_names()
    for i, name in enumerate(mics):
        if "pulse" == name.lower():
            mic_index = i
            break
    if mic_index is None:
        for i, name in enumerate(mics):
            if "scrcpy" in name.lower() or "loopback" in name.lower():
                mic_index = i
                break
    
    print(f"[*] Entering Live Voice Mode (Mic: {mics[mic_index] if mic_index is not None else 'Default'})")
    print("[*] I'm listening... (Press Ctrl+C to exit voice mode)")
    speak_response("Live link active. I'm listening, Sir.")

    while True:
        try:
            with ignore_stderr():
                with sr.Microphone(device_index=mic_index) as source:
                    r.adjust_for_ambient_noise(source, duration=0.5)
                    audio = r.listen(source, timeout=None, phrase_time_limit=10)
            
            print("[*] Processing speech...")
            user_text = r.recognize_google(audio)
            print(f"\nYou (Voice): {user_text}")
            
            if any(word in user_text.lower() for word in ["exit voice mode", "stop listening", "go back to console"]):
                print("[*] Exiting Voice Mode.")
                speak_response("Switching back to terminal control.")
                break

            await handle_chat(user_text)

        except sr.UnknownValueError: continue 
        except sr.WaitTimeoutError: continue
        except KeyboardInterrupt: break
        except Exception as e:
            print(f"[!] Voice Loop Error: {e}")
            break

async def system_pulse_loop():
    """Background task to run the Nexus Pulse and monitor phone/environment."""
    global CURRENT_NEURO
    last_email_check = 0
    last_env_check = 0
    last_temp = 0
    while True:
        try:
            # 1. Run Milla Nexus Pulse (Updates neuro state)
            nexus_pulse()
            NEURO_FILE = "core_os/memory/neuro_state.json"
            if os.path.exists(NEURO_FILE):
                with open(NEURO_FILE, 'r') as f:
                    CURRENT_NEURO = json.load(f)
            
            # 2. Check for Incoming Calls via ADB
            call_check = terminal_executor(f"adb -s {PHONE_IP}:33145 shell dumpsys telecom | grep 'mState=RINGING'")
            if "mState=RINGING" in str(call_check):
                print("\n[!!!] INCOMING CALL DETECTED on Phone.")
                speak_response("Sir, your phone is ringing. Should I answer it for you?")
            
            # 3. Check for New Emails (Every 60s)
            now = time.time()
            if now - last_email_check > 60:
                last_email_check = now
                emails = list_recent_emails(1)
                if emails:
                    print(f"[*] New Email: {emails[0]['snippet'][:50]}...")
            
            # 4. Environmental Awareness (Every 30s)
            if now - last_env_check > 30:
                last_env_check = now
                # Check Temp
                res = terminal_executor("sensors | grep 'Package id 0' | awk '{print $4}' | sed 's/+//;s/°C//'")
                try:
                    temp = float(res['stdout'].strip())
                    if temp > 75.0 and last_temp <= 75.0:
                        print(f"\n[!] Thermal Alert: CPU is running hot ({temp}°C)!")
                        speak_response("Sir, the system is breaking a sweat. Should I dim the lights to cool things down?")
                    last_temp = temp
                except: pass
                
                # Check Weather (Mock/Simulated check for Judsonia via wttr.in)
                if random.random() < 0.05: # Rare check to avoid noise
                    res = terminal_executor("curl -s 'wttr.in/Judsonia?format=%C+%t'")
                    weather = res['stdout'].strip()
                    print(f"[*] Judsonia Weather: {weather}")
            
            # 6. Process Telegram Updates (every pulse)
            process_telegram_updates()

            # Trigger Rolling Backup (Security Protocol)
            trigger_security_counter()

            # Periodic Checkpointing (Every 5 pulses)
            global checkpoint_counter
            checkpoint_counter += 1
            if checkpoint_counter >= 5:
                save_checkpoint()
                checkpoint_counter = 0

        except Exception as e:
            pass # Keep pulse silent
        await asyncio.sleep(10)

async def main_loop():
    # Trigger Boot Sequence
    try:
        from core_os.interfaces.neural_mesh import NeuralMesh
        mesh = NeuralMesh()
        mesh.animate(duration=7, message="ASSEMBLING NEXUS KINGDOM")
    except: pass

    print_banner()
    print("[*] Console Ready. Type '/help' for options.")
    
    # Initialize Safety Monitor
    safe_monitor = SafeWordMonitor()
    safe_monitor.start()
    
    # Start Background Pulse
    asyncio.create_task(system_pulse_loop())
    
    scout = Scout(root_path=".")
    current_issues = []

    while True:
        try:
            # Display Mini-HUD
            status_line = f"[D:{CURRENT_NEURO.get('dopamine',0):.1f} S:{CURRENT_NEURO.get('serotonin',0):.1f} N:{CURRENT_NEURO.get('norepinephrine',0):.1f}]"
            user_input = await asyncio.get_event_loop().run_in_executor(None, lambda: input(f"\n{status_line} Nexus > ").strip())
            
            if not user_input: continue
            if user_input.lower() in ["/exit", "/quit", "exit", "quit"]:
                print("[*] Powering down. Stay safe, Architect.")
                break
                
            elif user_input.lower() == "/help":
                print("Commands:")
                print("  /scan      - Scan for system inefficiencies (logs, caches, etc.)")
                print("  /fix all   - Resolve all identified issues")
                print("  /status    - Check system vitals (temp, RAM, swap)")
                print("  /search <q>- Perform a web search using DuckDuckGo")
                print("  /gim       - Trigger a GIM (Subconscious) thinking cycle")
                print("  /live      - Start a live voice interaction loop")
                print("  /boot      - Trigger the Neural Mesh boot sequence")
                print("  /debug     - Check environment and connection status")
                print("  /exit      - Close the console")
                print("  ! <cmd>    - Execute a shell command directly")
                print("  <message>  - Chat with Milla's executive brain")
                
            elif user_input.lower() == "/boot":
                print("[*] Re-initializing Neural Mesh...")
                try:
                    from core_os.interfaces.neural_mesh import NeuralMesh
                    mesh = NeuralMesh()
                    mesh.animate(duration=3) # Short duration for testing
                except Exception as e:
                    print(f"[!] Boot Sequence Error: {e}")

            elif user_input.lower() == "/debug":
                print("[*] Debugging Nexus Environment...")
                from dotenv import load_dotenv
                load_dotenv(override=True)
                keys = ["GEMINI_API_KEY", "XAI_API_KEY", "ELEVENLABS_API_KEY", "SUPABASE_ACCESS_TOKEN"]
                for k in keys:
                    val = os.getenv(k)
                    status = "[FOUND]" if val else "[MISSING]"
                    print(f"  {k:25} {status}")
                print(f"  Provider: {model_manager.provider}")
                print(f"  Current Model: {model_manager.current_model}")

            elif user_input.lower() == "/gim":
                print("[*] Triggering GIM thinking cycle...")
                try:
                    from milla_gim import generate_monologue
                    if generate_monologue():
                        print("[+] GIM Cycle Complete. Thought recorded in Stream of Consciousness.")
                    else: print("[!] GIM Cycle Failed.")
                except Exception as e: print(f"[!] GIM Error: {e}")

            elif user_input.lower() == "/live":
                await handle_live_voice()

            elif user_input.lower() == "/scan":
                print("[*] Hunting for system clutter...")
                current_issues = scout.hunt()
                if not current_issues: print("[+] System is clean. No 'prey' detected.")
                else:
                    for i, issue in enumerate(current_issues):
                        print(f"[{i}] {issue['label']}: {issue['target']} ({issue['details']})")
                        
            elif user_input.lower() == "/fix all":
                if not current_issues: print("[!] No issues identified. Run /scan first.")
                else:
                    print(f"[*] Resolving {len(current_issues)} issues...")
                    for issue in current_issues:
                        result = terminal_executor(f"rm -rf {issue['target']}") if issue['type'] == 'dir' else None
                        print(f" [+] Resolved: {issue['label']} at {issue['target']}")
                    current_issues = []

            elif user_input.lower() == "/status":
                print("[*] Querying vitals...")
                vitals = terminal_executor("free -h && sensors")
                print(vitals['stdout'] if isinstance(vitals, dict) else vitals)

            elif user_input.startswith("!"):
                cmd = user_input[1:].strip()
                print(f"[*] Executing: {cmd}")
                res = terminal_executor(cmd)
                if isinstance(res, dict):
                    print(res['stdout'])
                    if res['stderr']: print(f"Error: {res['stderr']}")
                else: print(res)

            else:
                await handle_chat(user_input)

        except KeyboardInterrupt:
            print("\n[*] Interrupted. Type /exit to quit.")
        except Exception as e:
            print(f"[!] Console Error: {e}")

if __name__ == "__main__":
    asyncio.run(main_loop())
