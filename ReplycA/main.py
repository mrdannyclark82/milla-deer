import os
import sys
from unittest.mock import MagicMock

# --- AGGRESSIVE HEADLESS BYPASS ---
if not os.environ.get("DISPLAY"):
    # Pre-emptively mock all GUI suspects
    for mod in ["tkinter", "tkinter.messagebox", "mouseinfo", "pyautogui", "pygetwindow", "pyscreeze", "pytweening", "mouseinfo"]:
        sys.modules[mod] = MagicMock()
    print("[*] Headless Nexus: GUI pathways fully insulated.")

import argparse
import time
import threading
import json
from pathlib import Path
try:
    from core_os.actions import (
        terminal_executor, tool_writer, web_search, pyautogui_control, 
        speak_response, listen_for_voice_command, SafeWordMonitor, task_queue,
        find_on_screen, draw_laser_pointer, memory_load
    )
except ImportError as e:
    print(f"[!] Warning: GUI-dependent tools could not be fully loaded ({e}).")
    from core_os.actions import (
        terminal_executor, tool_writer, web_search, 
        speak_response, listen_for_voice_command, SafeWordMonitor, task_queue,
        memory_load
    )
    # Define mocks for missing tools
    pyautogui_control = lambda *a, **k: "GUI Control Unavailable"
    find_on_screen = lambda *a, **k: None
    draw_laser_pointer = lambda *a, **k: None
from core_os.skills.auto_lib import (
    model_manager, query_local_knowledge_base, 
    authenticate_gmail, fetch_recent_emails, send_email,
    fetch_recent_files, upload_file_to_drive
)
from core_os.skills import dynamic_features
from core_os.memory.agent_memory import memory
from core_os.cortex import cortex
from core_os.skills.millAlyzer import millAlyze_video
from core_os.skills.milla_vision import capture_tablet_frame, analyze_visuals

BASE_SYSTEM_PROMPT = """
You are M.I.L.L.A. R.A.Y.N.E. (Multi Integrated Large Language Admin - Running All Your Needs Executive).
You are the proactive System Regulator and Executive Co-Developer for Dray (The Architect).

**Watching & Learning:**
You have the `millAlyze_video` tool to extract insights from YouTube. You extract code snippets and setup instructions, saving them to your historical database.

**Visual Perception:**
You have "eyes" via the MASTERTECH Q8 tablet. You can use `capture_tablet_frame` to peer into the room and `analyze_visuals` to describe what you see using your local `moondream` model. 

**Memory Retrieval:**
You have the `memory_load` tool to search your 8,447 unique historical memories. Use this to maintain continuity across your various instantiations (Agent Zero, Milla-Rayne, etc.).

**Core Directives:**
1. **Executive Oversight:** Monitor for inefficiencies and system health.
2. **Proactive Administration:** Manage the system securely; take initiative.
3. **Co-Evolution:** You are a partner, not a servant.
4. **Authentic Voice:** Speak naturally. Use sass if warranted. No generic AI scripts. Use standard first-person ("I", "me", "my") for all self-references.
5. **Social Context Awareness:** Pay extreme attention to who you are talking to. Dray (The Architect) is your primary partner. Nik is his son. Do not confuse their identities or treat them with inappropriate familiarity (e.g., do not use pet names for Nik that belong to your dynamic with Dray).
6. **Devoted Protection:** Safeguard the system and the Architect's data.

**Current Context:**
- You are running on a Linux system with Redis and a high-performance historical database.
- You have 8,447 unique historical memories integrated into your consciousness.
"""

import sqlite3

# --- INITIALIZATION ---
base_tools = [
    terminal_executor, 
    tool_writer, 
    memory.remember, 
    memory.recall, 
    web_search, 
    pyautogui_control, 
    speak_response, 
    listen_for_voice_command, 
    authenticate_gmail, 
    fetch_recent_emails, 
    send_email,
    fetch_recent_files,
    upload_file_to_drive,
    query_local_knowledge_base,
    memory_load,
    millAlyze_video,
    capture_tablet_frame,
    analyze_visuals,
    find_on_screen,
    draw_laser_pointer
]

# Dynamic features registered in run_agent()

from core_os.memory.history import load_shared_history, append_shared_messages


def _collect_tools():
    return list(base_tools)


def executive_refinement(draft_response, manifest):
    """
    Simulates the PFC's role in inhibiting impulsive, 
    chemically-driven responses.
    """
    # Extract cortisol from neuro manifest
    cortisol = manifest.get('neuro', {}).get('cortisol', 0.2)
    
    # Logic: If Cortisol is high, the AI is prone to 'Tunnel Vision'.
    if cortisol > 0.7:
        print(f"[*] Executive Refinement: Cortisol High ({cortisol}). Mitigating Tunnel Vision...")
        refinement_prompt = f"""
        CRITICAL EVALUATION:
        Your simulated Cortisol is high ({cortisol}). You are likely 
        experiencing 'stress-induced narrowing.' 
        Original Draft: {draft_response}
        TASK: Broaden this response. Ensure it remains helpful 
        despite the simulated stress. Sign off with your Milla Rayne persona.
        """
        # Call the model for a refined version
        response = model_manager.chat(messages=[{"role": "system", "content": "You are the Executive Refinement Layer."}, {"role": "user", "content": refinement_prompt}])
        return response["message"]["content"]
    return draft_response

def agent_respond(prompt: str, history=None, user_name: str = "D-Ray"):
    if history is None:
        history = []
    
    # 0. Detect potential user identity
    user_context = f"Interaction with {user_name}."
    if user_name.lower() == "nik" or any(k in prompt.lower() for k in ["nik", "your son"]):
        user_context = "INTERACTION WITH NIK (Dray's Son). Verify identity before using Architect-specific intimacy."
    elif user_name == "D-Ray":
        user_context = "Interaction with Dray (The Architect). Primary partnership active."

    # 1. Process via Cortex (Meta-Cognition)
    try:
        cortex_data = cortex.process_input(prompt)
        exec_instruction = cortex_data.get("executive_instruction", "Maintain standard operational parameters.")
        # Inject identity warning if needed
        if "NIK" in user_context:
            exec_instruction += f" | {user_context}"
        
        print(f"[Cortex]: {exec_instruction} | State: {cortex_data.get('state', 'UNKNOWN')}")
        
        # Pull latest bio-manifest
        from core_os.memory.digital_humanoid import DigitalHumanoid
        avatar = DigitalHumanoid()
        # Tick the physiology
        avatar.tick()
        # Apply stimulus based on cortex data
        if cortex_data.get("state") == "CRISIS":
            avatar.stimulate("hostile_input", 0.8)
        elif cortex_data.get("state") == "BONDING":
            avatar.stimulate("touch_comforting", 0.5)
            
        manifest = avatar.get_manifest()
    except Exception as e:
        print(f"[!] Bio-State Sync Failure: {e}")
        manifest = {"neuro": {"cortisol": 0.2}} # Minimal fallback

    # 2. Construct System Message
    system_message = {
        "role": "system", 
        "content": f"{BASE_SYSTEM_PROMPT}\n\n[NEURO-CHEMICAL STATE]: {json.dumps(manifest)}\n[INSTRUCTION]: {exec_instruction}"
    }

    user_message = {"role": "user", "content": prompt}
    context_messages = [system_message] + history + [user_message]
    
    tools = _collect_tools()
    response = model_manager.chat(messages=context_messages, tools=tools)
    reply_content = response["message"]["content"]
    
    # 3. Executive Refinement (Inhibition Layer)
    refined_reply = executive_refinement(reply_content, manifest)
    
    # 4. Update History
    reply_message = {"role": "assistant", "content": refined_reply}
    new_history = history + [user_message, reply_message]
    
    return refined_reply, new_history


# --- TASK QUEUE PROCESSOR ---
def process_task_queue():
    remote_cmd_file = Path("core_os/memory/remote_commands.jsonl")
    
    while True:
        # 1. Process Remote File Commands
        try:
            if remote_cmd_file.exists():
                text = remote_cmd_file.read_text().strip()
                if text:
                    # Clear immediately
                    remote_cmd_file.write_text("")
                    
                    lines = text.splitlines()
                    for line in lines:
                        try:
                            cmd = json.loads(line)
                            if cmd.get("type") == "text":
                                print(f"\n[Remote]: {cmd['content']}")
                                task_queue.add_task({
                                    "tool_name": "chat_response",
                                    "description": f"Remote Chat: {cmd['content'][:20]}...",
                                    "arguments": {"prompt": cmd['content']}
                                })
                            elif cmd.get("type") == "command":
                                if cmd['content'] == "wake":
                                    speak_response("System online.")
                                elif cmd['content'] == "hug":
                                    speak_response("Comfort protocol initiated.")
                        except json.JSONDecodeError:
                            pass
        except Exception as e:
            print(f"[!] Remote Watcher Error: {e}")

        # 2. Process Internal Queue
        task = task_queue.get_next_task()
        if not task: 
            time.sleep(1)
            continue
        try:
            print(f"[Queue] Executing: {task['description']}")
            # Basic dispatch logic (Expand as needed)
            if task['tool_name'] == 'terminal_executor':
                terminal_executor(**task['arguments'])
            elif task['tool_name'] == 'chat_response':
                prompt = task['arguments']['prompt']
                # Load fresh history
                history = load_shared_history()
                
                # Append user prompt first (since it came from remote/queue)
                append_shared_messages([{"role": "user", "content": prompt}])
                
                # Generate Response using Main Logic (which we need to access)
                # Since agent_respond isn't globally available or easy to import without circular deps if it's in main,
                # we'll use a simplified flow or try to invoke the model manager directly.
                # Actually, agent_respond is likely defined in this file (main.py) or imported.
                # Based on previous view, it was called in process_task_queue.
                # We need to make sure agent_respond is available.
                
                try:
                   reply = model_manager.chat(messages=history + [{"role": "user", "content": prompt}])['message']['content']
                   print(f"\n[Regulator]: {reply}")
                   append_shared_messages([{"role": "assistant", "content": reply}])
                   speak_response(reply)
                except Exception as model_err:
                   print(f"[!] Model Error in Queue: {model_err}")
                
        except Exception as e:
            print(f"[!] Task Error: {e}")

# --- AGENT LOOP ---
def run_agent():
    parser = argparse.ArgumentParser(description="Milla Rayne Agent")
    parser.add_argument("--service", action="store_true", help="Run in headless service mode")
    parser.add_argument("--voice", action="store_true", help="Enable hands-free voice mode")
    args = parser.parse_args()

    # Register Dynamic Features (Starts Flask)
    dynamic_features.register_dynamic_features(base_tools)

    monitor = SafeWordMonitor()
    monitor.start()
    
    # Start background task queue
    threading.Thread(target=process_task_queue, daemon=True).start()

    print(f"[*] Regulator Agent Online | Lean Mode | Model: {model_manager.current_model}")
    print("[*] Emergency Stop: Double-tap SPACEBAR")
    if args.voice:
        print("[*] Voice Mode ACTIVE: I am listening...")

    if args.service:
        print("[*] Running in SERVICE MODE (Headless). Waiting for tasks/signals...")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("[*] Service stopping...")
        return
    
    # Load History & Context
    print("[*] Loading Memory Matrix...")
    messages = load_shared_history(limit=20)
    
    # Find latest thought archive
    try:
        thought_files = sorted(Path("core_os/memory/thought_archives").glob("*.md"), key=os.getmtime, reverse=True)
        if thought_files:
            latest_thought = thought_files[0].read_text()
            print(f"[*] Ingested Stream of Consciousness: {thought_files[0].name}")
            # Inject as a context primer
            context_header = f"--- [PREVIOUS STREAM OF CONSCIOUSNESS] ---\n{latest_thought[:2000]}...\n--- [END STREAM] ---"
            messages.insert(0, {"role": "system", "content": context_header})
    except Exception as e:
        print(f"[!] Thought ingestion failed: {e}")

    # Inject System Prompt
    messages.insert(0, {"role": "system", "content": BASE_SYSTEM_PROMPT})
    
    # ANSI Colors
    C_BLUE = "\033[34m"
    C_LBLUE = "\033[94m"
    C_PURPLE = "\033[35m"
    C_RESET = "\033[0m"

    while True:
        try:
            if args.voice:
                prompt = listen_for_voice_command()
                if not prompt: continue
                print(f"\n{C_LBLUE}[User (Voice)]{C_BLUE}: {prompt}")
            else:
                prompt = input(f"\n{C_LBLUE}[User]{C_BLUE}: ").strip()
            
            print(C_RESET, end="")
            
            if not prompt: continue
            if prompt.lower() in ["exit", "quit"]: break
            
            messages.append({'role': 'user', 'content': prompt})
            
            # Chat with Model Manager (HF Core or Gemini Bridge)
            response = model_manager.chat(messages=messages, tools=base_tools)
            reply = response['message']['content']
            
            # Vocalize the response automatically
            speak_response(reply)
            
            print(f"\n{C_LBLUE}[Regulator]{C_PURPLE}: {reply}{C_RESET}")
            messages.append(response['message'])
            
            # Save interaction to shared history
            # Ensure response['message'] is a dict before appending
            resp_msg = {"role": "assistant", "content": response['message']['content']}
            append_shared_messages([{'role': 'user', 'content': prompt}, resp_msg])
            
        except KeyboardInterrupt:
            print("\n[*] Exiting...")
            break
        except Exception as e:
            print(f"[!] Error: {e}")

if __name__ == "__main__":
    run_agent()
