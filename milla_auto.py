import os
import json
import subprocess
import requests
from datetime import datetime
from googlesearch import search

# --- CONFIGURATION ---
# Export this in your shell: export GOOGLE_API_KEY="AIzaSy..."
GOOGLE_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_KEY:
    print("CRITICAL: GOOGLE_API_KEY not found in environment.")
    print("Please run: export GOOGLE_API_KEY='your_key'")
    exit()

# Load User Config
try:
    with open("milla_config.json", "r") as f:
        config = json.load(f)
except:
    config = {}

REPO_PATH = config.get("repo_path", ".")
SEARCH_QUERY = config.get("scan_query", "python AI assistant trends 2026")

def log(text):
    print(f"[Milla-Gemini]: {text}")

# 1. SCOUT (Updated with Manual Intelligence)
def scan_web():
    log("Using cached intelligence for 2026 trends...")
    results = [
        "Agentic AI Assistants: Trend towards autonomous multi-step task execution.",
        "Edge AI & Local LLMs: Privacy-focused local processing of natural language.",
        "Expressive TTS: Human-like prosody in voice responses.",
        "Multimodal Control: AI agents managing mobile UI and hardware via natural language.",
        "Pipecat-AI: Framework for multimodal conversational AI."
    ]
    return "\n".join(results)

# 2. ARCHITECT (The Gemini Brain via Raw HTTP)
def analyze_and_plan(web_results):
    log("Reading current source code...")
    
    # Read main.py to give Gemini context
    code_context = ""
    target_file = os.path.join(REPO_PATH, "main.py")
    if os.path.exists(target_file):
        with open(target_file, "r") as f:
            code_context = f.read()[:20000] 
            
    log("Consulting Gemini 1.5 Flash (via REST)...")
    
    prompt_text = f"""
    ROLE: Senior Python DevOps Engineer.
    
    CONTEXT:
    I am maintaining a Python Voice Assistant (SARIi). Here is the current source code:
    ```python
    {code_context}
    ```
    
    NEW INTELLIGENCE:
    I found these trending topics/repos online:
    {web_results}
    
    TASK:
    1. Identify ONE feasible feature or improvement from the trends that fits this codebase.
    2. Output a JSON object with the following structure (do not output markdown):
    {{
       "feature_name": "Short Name",
       "reasoning": "Why we need this",
       "code_snippet": "The actual python code to implement it",
       "pr_title": "Conventional Commit Title"
    }}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_KEY}"
    
    headers = {'Content-Type': 'application/json'}
    data = {
        "contents": [{
            "parts": [{'text': prompt_text}]
        }]
    }

    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status() # Check for HTTP errors
        
        result_json = response.json()
        
        # Extract text from the deeply nested response
        try:
            generated_text = result_json['candidates'][0]['content']['parts'][0]['text']
        except (KeyError, IndexError) as e:
            log(f"Error parsing API response structure: {e}")
            log(f"Full Response: {result_json}")
            raise

        clean_text = generated_text.replace("```json", "").replace("```", "").strip()
        return json.loads(clean_text)
        
    except requests.exceptions.RequestException as e:
        log(f"API Request Failed: {e}")
        if response is not None:
             log(f"Response content: {response.text}")
        raise

# 3. ENGINEER (Git)
def execute_update(plan):
    log(f"Implementing: {plan['feature_name']}")
    
    branch = f"feat/auto-{datetime.now().strftime('%m%d-%H%M')}"
    
    # Git Commands
    try:
        os.chdir(REPO_PATH)
        # Check if git is initialized
        if not os.path.exists(".git"):
            log("Git not initialized. Initializing...")
            subprocess.run(['git', 'init'], check=True)
            subprocess.run(['git', 'add', '.'], check=True)
            subprocess.run(['git', 'commit', '-m', "Initial commit by SARIi"], check=True)

        subprocess.run(['git', 'checkout', '-b', branch], check=True)
        
        # Append Code
        with open("main.py", "a") as f:
            f.write(f"\n\n# --- AUTO-GENERATED FEATURE: {plan['feature_name']} ---")
            f.write(f"# Reasoning: {plan['reasoning']}\n")
            f.write(plan['code_snippet'])
            f.write(f"\n# -----------------------------------------------------")
            
        # Commit
        subprocess.run(['git', 'add', '.'])
        subprocess.run(['git', 'commit', '-m', plan['pr_title']])
        
        log(f"Success! Feature committed to branch: {branch}")
        log("Review the changes in main.py before merging.")
        
    except Exception as e:
        log(f"Git Operation Failed: {e}")
        log("Changes were NOT applied cleanly.")

def main():
    # Phase 1: Search
    trends = scan_web()
    if not trends:
        log("No trends found.")
        return

    # Phase 2: Plan
    try:
        plan = analyze_and_plan(trends)
        print("\n--- PROPOSED UPDATE ---")
        print(f"Feature: {plan['feature_name']}")
        print(f"Why: {plan['reasoning']}")
        print("-----------------------")
        
        # Phase 3: Execute
        if input("Proceed with implementation? (y/n): ").lower() == 'y':
            execute_update(plan)
        else:
            log("Cancelled.")
            
    except Exception as e:
        log(f"Planning Error: {e}")

if __name__ == "__main__":
    main()