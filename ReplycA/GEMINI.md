# GEMINI.md - Workspace Context

## Project Overview

This directory (`ogdray`) is a development workspace containing a collection of AI-driven tools, agents, and applications. The projects focus on autonomous system regulation, local AI integration (via Ollama), code generation, and experimental interfaces. The workspace is designed for a "co-evolution" workflow between the developer (Dray) and the AI agents (Milla, Elara, etc.).

## Key Components

### 1. ollamafileshare
The primary repository for the "Milla" and "Elara" ecosystem. It contains multiple sub-projects:
*   **Core OS:** Underlying system logic for agents (`core_os/`).
*   **Elara 2.0:** A modern web-based AI assistant built with React, TypeScript, and Vite (`ollamafileshare/Elara2.0`).
*   **Milla-Rayne / Millai-Studio:** Advanced AI companion platforms (`ollamafileshare/Milla-Rayne`, `ollamafileshare/Millai-Studio`).
*   **Arch Regulator Agent:** A self-regulating agent for Arch Linux (`ollamafileshare/GEMINI.md`).
*   **Mayhem OS:** Experimental, chaos-driven AI interaction scripts (`ollamafileshare/mayhem_os`).

### 2. SaccPhras (SaCc PHFRAS)
**Systems Admin Co-Creating Projects & Home-Folders Remote Access Supervisor.**
A proactive system management suite designed to transition from reactive chat to active system regulation.
*   **Manifesto:** `SaccPhras/MANIFESTO.md`
*   **Core UI:** `SaccPhras/ui/hawk_tui.py` (Cyberpunk "Predator Console").
*   **Tools:** `SaccPhras/tools/scout.py` (Hunting engine).

### 3. lazy
A lightweight, one-shot AI code generation tool.
*   **Core Script:** `lazy/lazy/lazy.py` - Queries Ollama to generate code blocks (HTML, CSS, JS, Python) and saves them to `output/`.
*   **Setup:** `lazy/setup.sh` - Installs requirements and creates the launcher.
*   **Usage:** Run the `./lazy/lazy/lazy` executable wrapper.

### 4. ninja
A privacy-focused web browser application.
*   **Tech Stack:** Electron.
*   **Commands:**
    *   `npm start`: Runs `electron .`
    *   `npm run dev`: Runs `electron . --dev`

### 5. iwantmy.py
A standalone "SelfHealingAgent" script.
*   **Function:** Uses `easyocr` (Vision), `ollama` (Reasoning), and `subprocess` (Action) to execute terminal tasks and autonomously fix errors by reading the screen.
*   **Dependencies:** `easyocr`, `ollama`, `pyautogui`, `duckduckgo_search`.

## Development Conventions

*   **AI Backend:** The workspace heavily relies on a local **Ollama** instance. Ensure it is running and models (e.g., `qwen3-coder:480b-cloud`, `llama2`) are pulled.
*   **Python:** A virtual environment (`venv/`) is present in the root. Activate it before running Python scripts (`source venv/bin/activate`).
*   **Node.js:** Web projects (`ninja`, `Elara2.0`) use `npm` for dependency management and scripts.
*   **Context Files:** Sub-projects often contain their own `GEMINI.md` files (e.g., `ollamafileshare/GEMINI.md`) which provide specific instructions and context for those areas.

## Directory Map

```text
/home/dray/ogdray/
├── iwantmy.py          # Self-healing AI agent script
├── lazy/               # AI code generator
├── ninja/              # Electron-based browser
├── ollamafileshare/    # Main AI agent repository (Milla, Elara)
├── SaccPhras/          # System supervisor (Hawk TUI)
└── venv/               # Python virtual environment
```
