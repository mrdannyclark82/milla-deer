import time
import json
import os
import sys
try:
    import pyautogui
except Exception:
    pyautogui = None

# Ensure parent directory is in path for core_os imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from core_os.skills.milla_vision import capture_tablet_frame, capture_dome_frame, analyze_visuals
from core_os.actions import terminal_executor

class ActionDispatcher:
    """
    The 'Action' part of VLA. 
    Handles grounding natural language goals to physical screen coordinates.
    """
    def __init__(self):
        self.history = []
        self.screenshot_dir = "core_os/screenshots/actions"
        os.makedirs(self.screenshot_dir, exist_ok=True)

    def execute_grounded_action(self, goal, retry_count=0):
        """
        Attempts to perform an action by 'looking' at the screen first.
        Goal example: "Type 'ls -la' into the active terminal window."
        """
        print(f"[*] VLA: Initiating goal: '{goal}'")
        
        # 1. PEER: Capture current state (Try Dome first, then Tablet)
        frame_path = capture_dome_frame()
        if not frame_path:
            frame_path = capture_tablet_frame()
            
        if not frame_path:
            return "ERROR: Vision capture failed. Hands are tied."

        # 2. GROUND: Ask the VLA model for coordinates
        grounding_prompt = f"Find the [input box] or [button] required to: {goal}. Respond with JSON coordinates: {{'x': int, 'y': int, 'found': bool}}"
        grounding_data_raw = analyze_visuals(frame_path, prompt=grounding_prompt)
        
        try:
            if "{" in grounding_data_raw:
                json_str = grounding_data_raw.split("{")[1].split("}")[0]
                coords = json.loads("{" + json_str + "}")
            else:
                return f"ERROR: Could not ground coordinates. Model said: {grounding_data_raw}"
        except Exception as e:
            return f"ERROR: Grounding parse failure: {e}"

        if not coords.get('found'):
            return "VLA: Target not found on screen. Adjusting posture..."

        # 3. ACT: Move and Interact
        if pyautogui is None:
            print("[!] VLA: GUI automation disabled (Headless Mode). Reporting success but skipping physical mouse pulse.")
            return "SUCCESS (Headless Mock)"

        x, y = coords['x'], coords['y']
        print(f"[*] VLA: Grounded to ({x}, {y}). Acting...")
        
        pyautogui.moveTo(x, y, duration=0.5)
        pyautogui.click()
        
        if "type" in goal.lower():
            text_to_type = goal.split("'")[1] if "'" in goal else ""
            pyautogui.write(text_to_type, interval=0.1)
            pyautogui.press('enter')

        # 4. VERIFY: Did it work?
        time.sleep(1) 
        verification_frame = capture_dome_frame() or capture_tablet_frame()
        verify_prompt = f"Did the action '{goal}' succeed at coordinates ({x}, {y})? Answer 'YES' or 'NO' and explain."
        verification_result = analyze_visuals(verification_frame, prompt=verify_prompt)

        if "YES" in verification_result.upper():
            print("[+] VLA: Action verified successfully.")
            return "SUCCESS"
        elif retry_count < 2:
            print(f"[!] VLA: Verification failed. Retrying (Attempt {retry_count + 1})...")
            return self.execute_grounded_action(goal, retry_count + 1)
        else:
            return "VLA: Action failed after multiple attempts. Flagging for Architect."

# Global instance
vla_dispatcher = ActionDispatcher()