import os
import json
import subprocess
import argparse
import sys
from datetime import datetime
from pydantic import BaseModel, Field

try:
    import google.generativeai as genai
except ImportError:
    genai = None

# --- CONFIGURATION ---
# Export this in your shell: export GOOGLE_API_KEY="AIzaSy..."
GOOGLE_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_KEY:
    print(
        "WARNING: GOOGLE_API_KEY not found in environment. Falling back to heuristic planning.",
        file=sys.stderr,
    )

# Load User Config
try:
    with open("milla_config.json", "r") as f:
        config = json.load(f)
except:
    config = {}

REPO_PATH = config.get("repo_path", ".")
SEARCH_QUERY = config.get("scan_query", "python AI assistant trends 2026")

# Setup Gemini with Pydantic Structure
if genai and GOOGLE_KEY:
    genai.configure(api_key=GOOGLE_KEY)

class FeatureUpdate(BaseModel):
    feature_name: str = Field(description="Short, descriptive name of the feature")
    reasoning: str = Field(description="Why this feature is valuable for the project")
    code_snippet: str = Field(description="Executable Python code to append to main.py")
    pr_title: str = Field(description="Conventional Commit title (e.g., feat: add X)")

model = (
    genai.GenerativeModel(
        'gemini-2.0-flash',
        generation_config={"response_mime_type": "application/json"},
    )
    if genai and GOOGLE_KEY
    else None
)

def log(text):
    print(f"[Milla-Gemini]: {text}", file=sys.stderr)

def load_repo_context(repo_path):
    context_parts = []
    candidates = [
        ("README.md", 8000),
        ("package.json", 6000),
        ("main.py", 12000),
        ("server/index.ts", 12000),
        ("client/src/App.tsx", 8000),
    ]

    for relative_path, limit in candidates:
        target_path = os.path.join(repo_path, relative_path)
        if os.path.exists(target_path):
            try:
                with open(target_path, "r") as f:
                    context_parts.append(f"FILE: {relative_path}\n{f.read()[:limit]}")
            except Exception as exc:
                context_parts.append(f"FILE: {relative_path}\nERROR: {exc}")

        if len("\n\n---\n\n".join(context_parts)) > 18000:
            break

    return "\n\n---\n\n".join(context_parts)

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
def analyze_and_plan(web_results, project_label="SARIi"):
    log("Reading current source code...")
    code_context = load_repo_context(REPO_PATH)
             
    log("Consulting Gemini 2.0 Flash (Structured)...")

    if not model:
        return {
            "feature_name": "Daily collaboration report",
            "reasoning": f"Gemini is unavailable in this environment, so {project_label} should continue with a safe fallback recommendation: keep proactive discovery running daily and review the top recommended feature for sandbox implementation.",
            "code_snippet": "# Fallback planner output only. No code generated without Gemini.",
            "pr_title": "chore: review daily collaboration report",
        }
    
    prompt = f"""
    ROLE: Senior Software Engineer reviewing a live repository.
    
    CONTEXT:
    I am maintaining the repository "{project_label}". Here is the current repository context:
    ```
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

def parse_args():
    parser = argparse.ArgumentParser(description="SARIi/Milla auto planner")
    parser.add_argument("--json", action="store_true", help="Output JSON only")
    parser.add_argument("--no-execute", action="store_true", help="Skip execution")
    parser.add_argument("--repo-path", help="Override repository path")
    parser.add_argument("--scan-query", help="Override scan query")
    parser.add_argument("--project-label", default="SARIi", help="Project label")
    return parser.parse_args()

def main():
    args = parse_args()
    global REPO_PATH, SEARCH_QUERY
    if args.repo_path:
        REPO_PATH = args.repo_path
    if args.scan_query:
        SEARCH_QUERY = args.scan_query

    # Phase 1: Search
    trends = scan_web()
    if not trends:
        log("No trends found.")
        return

    # Phase 2: Plan
    try:
        plan = analyze_and_plan(trends, args.project_label)
        if args.json:
            print(json.dumps(plan))
            return

        print("\n--- PROPOSED UPDATE ---")
        print(f"Feature: {plan['feature_name']}")
        print(f"Why: {plan['reasoning']}")
        print("-----------------------")
        
        # Phase 3: Execute
        if args.no_execute:
            log("Execution skipped by flag.")
            return

        if input("Proceed with implementation? (y/n): ").lower() == 'y':
            execute_update(plan)
        else:
            log("Cancelled.")
            
    except Exception as e:
        log(f"Planning Error: {e}")

if __name__ == "__main__":
    main()
