import os
import json
import subprocess
import google.generativeai as genai
from datetime import datetime
from googlesearch import search
from pydantic import BaseModel, Field

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

# Setup Gemini with Pydantic Structure
genai.configure(api_key=GOOGLE_KEY)

class FeatureUpdate(BaseModel):
    feature_name: str = Field(description="Short, descriptive name of the feature")
    reasoning: str = Field(description="Why this feature is valuable for the project")
    code_snippet: str = Field(description="Executable Python code to append to main.py")
    pr_title: str = Field(description="Conventional Commit title (e.g., feat: add X)")

model = genai.GenerativeModel('gemini-2.0-flash', 
                              generation_config={"response_mime_type": "application/json"})

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

# 2. ARCHITECT (The Gemini Brain via Pydantic)
def analyze_and_plan(web_results):
    log("Reading current source code...")
    
    # Read main.py to give Gemini context
    code_context = ""
    target_file = os.path.join(REPO_PATH, "main.py")
    if os.path.exists(target_file):
        with open(target_file, "r") as f:
            code_context = f.read()[:20000] 
            
    log("Consulting Gemini 2.0 Flash (Structured)...")
    
    prompt = f"""
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
    2. Respond with EXACTLY ONE JSON object (NOT A LIST) strictly adhering to this schema:
    
    {{
       "feature_name": "Short Name",
       "reasoning": "Why we need this",
       "code_snippet": "The actual python code (or TSX if frontend) to implement it",
       "pr_title": "Conventional Commit Title"
    }}
    
    Do not include any other text or formatting. Just the raw JSON object.
    """
    
    try:
        response = model.generate_content(prompt)
        # Parse directly into Pydantic model for validation
        plan = FeatureUpdate.model_validate_json(response.text)
        return plan.model_dump() # Return as dict for compatibility
        
    except Exception as e:
        log(f"Gemini Planning Failed: {e}")
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