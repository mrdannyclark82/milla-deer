# SARIi: System Automated Responsive Intelligence interface
**Platform:** Android (via Termux)
**Core Language:** Python 3
**Hardware Bridge:** Termux:API

## 1. Project Overview
SARIi is an adaptive voice assistant for Android. It features NLU (Natural Language Understanding), custom skill creation, and hardware control.

## 2. Capabilities & Commands

### Adaptive Intelligence (New)
*   **Dialect Learning:** Teach SARIi your slang.
    *   "Remember that [phrase] means [action]"
    *   *Ex: "Remember that 'gimmie juice' means 'battery'"*
*   **Skill Learning:** Teach new responses.
    *   "Learn how to [trigger] by [saying/opening] [value]"
    *   *Ex: "Learn how to greet by saying Hello Master"*

### Hardware & System
*   **Status:** "System status", "Self analysis" (Deep report), "Battery status".
*   **Tools:** "Torch on/off", "Volume [level]", "Take a photo", "Read clipboard".

### P.A.I.R.S. System (Macros)
*   **Record:** "Start recording macro [name]" -> "Tap [x] [y]" -> "Stop".
*   **Run:** "Run simulation [name]".
*   **Vision:** "Check screen at [x] [y]".

### Communication & Productivity
*   **Calls/SMS:** "Call [name]", "Text [name] saying [msg]".
*   **Notes:** "Take a note [text]", "Read notes".
*   **Calendar:** "Add event [thing] to [day]".
*   **Web:** "Google [query]", "Open Gmail".

### Advanced
*   **Shell:** "Computer run [command]".
*   **Cron:** "Schedule daily task [command]".

## 3. Installation
1.  **Install Apps:** Termux & Termux:API.
2.  **Permissions:** Grant all permissions to Termux:API.
3.  **Setup:**
    ```bash
    pkg install python termux-api cronie git
    cd ~/SARIi
    python main.py
    ```

## 4. Troubleshooting
*   **Learning:** If SARIi doesn't understand a "Remember that..." command, try simpler phrasing like "Remember that X means battery".
*   **Volume:** "Speak up" raises volume by approx 20%.