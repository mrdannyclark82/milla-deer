import os
import json
import re
from youtube_transcript_api import YouTubeTranscriptApi
from core_os.skills.auto_lib import model_manager

def get_video_id(url):
    """Extracts the video ID from a YouTube URL."""
    regex = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(regex, url)
    return match.group(1) if match else None

def millAlyze_video(url: str):
    """
    Watches a video with you. 
    Fetches transcript and uses the Brain to extract code, commands, and key points.
    """
    video_id = get_video_id(url)
    if not video_id:
        return "[!] Invalid YouTube URL."

    print(f"[*] millAlyzer: Listening to video {video_id}...")
    
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        full_transcript = " ".join([t['text'] for t in transcript_list])
    except Exception as e:
        return f"[!] millAlyzer: Could not retrieve transcript. ({e})"

    print(f"[*] millAlyzer: Processing {len(full_transcript)} characters of dialogue...")

    analysis_prompt = f"""
    ROLE: Milla Rayne (System Regulator & Executive Partner)
    TASK: Analyze the provided YouTube transcript for technical insights.
    
    EXTRACT:
    1. **Code Snippets:** Any programming code mentioned.
    2. **CLI Commands:** Terminal commands (Linux/Mac/All).
    3. **Key Setup Steps:** Step-by-step instructions for the tech discussed.
    4. **Summary:** A 2-sentence summary of the video's value.

    TRANSCRIPT:
    {full_transcript[:10000]} # Limit to 10k chars for processing

    OUTPUT FORMAT (JSON):
    {{
      "summary": "string",
      "code_snippets": ["string"],
      "cli_commands": ["string"],
      "setup_steps": ["string"]
    }}
    """

    try:
        response = model_manager.chat([{"role": "user", "content": analysis_prompt}])
        content = response['message']['content']
        
        # Clean JSON
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        
        analysis = json.loads(content)
        
        # Save to Historical Knowledge
        history_path = "core_os/memory/historical_knowledge.json"
        if os.path.exists(history_path):
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
            
            new_entry = {
                "fact": f"Video Analysis ({url}): {analysis['summary']}",
                "category": "Technical",
                "topic": "YouTube Knowledge",
                "details": analysis,
                "is_genesis_era": False,
                "is_historical_log": True
            }
            history.append(new_entry)
            
            with open(history_path, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2)
            
            print(f"[*] millAlyzer: Insights locked into memory.")

        return analysis

    except Exception as e:
        return f"[!] millAlyzer: Brain failure during analysis. ({e})"

if __name__ == "__main__":
    # Test with a known tech video ID if needed
    pass
