# Local LLM Inference with Milla-Rayne 

Run AI models locally for complete privacy and offline functionality!

##  Why Use Local LLMs?

- Complete Privacy - Your conversations never leave your computer
- Zero API Costs - No monthly fees or per-token charges
- Works Offline - No internet connection required
- Fast Responses - Low latency, especially with smaller models
- Full Control - Choose and customize your own models

---

##  Quick Setup with Ollama (Recommended)

Ollama is the easiest way to run LLMs locally. It handles everything for you!

### Step 1: Install Ollama

macOS:

 Download and install from:
https://ollama.com/download/Ollama.dmg

Windows:

 Download and install from:
https://ollama.com/download/OllamaSetup.exe

Linux:

curl -fsSL https://ollama.com/install.sh | sh

### Step 2: Download a Model

Choose based on your available RAM. **Gemma 4 is now recommended for best reasoning and agentic performance (May 2026 upgrade).**

**Gemma 4 (Latest - Superior reasoning, multimodal, agentic workflows):**

ollama pull gemma4          # Check Ollama/HuggingFace for exact Gemma 4 tags (e.g. gemma4, gemma4:2b)

**Small (Recommended for 4-8GB RAM):**

ollama pull gemma3:1b    # 815MB, great quality

**Medium (For 8-16GB RAM):**

ollama pull gemma3       # 3.3GB, excellent quality

**Large (For 16+ GB RAM):**

ollama pull gemma3:12b   # 8.1GB, best quality

**Alternatives:**

ollama pull llama3.2:1b  # 1.3GB, Meta's smallest model
ollama pull phi4-mini    # 2.5GB, Microsoft's efficient model
ollama pull mistral      # 4.1GB, popular general-purpose model

### Step 3: Start Ollama

Ollama usually starts automatically after installation. If not:

ollama serve

### Step 4: Enable in Milla-Rayne

Edit your .env file:

ENABLE_LOCAL_MODEL=true
PREFER_LOCAL_MODEL=true

### Step 5: Restart Milla-Rayne

npm run dev

**That's it!**  Your chats now use local inference!

---

##  Model Comparison

| Model       | Size  | RAM Needed | Speed  | Quality    | Best For                          |
|-------------|-------|------------|--------|------------|-----------------------------------|
| gemma4     | ~2-8GB | 8GB+      | Fast   | Excellent (new) | Agentic tasks, reasoning, multimodal |
| gemma3:1b  | 815MB | 4-8GB     | Fast   | Great      | Mobile/edge, quick responses     |
| gemma3     | 3.3GB | 8-16GB    | Good   | Excellent  | Balanced quality & speed         |
| gemma3:12b | 8.1GB | 16GB+     | Slower | Best       | Maximum quality offline          |

**Gemma 4 Upgrade Notes:**
- Major leap in reasoning and context handling from Google DeepMind.
- Better for multi-step agent workflows and multimodal inputs.
- Use with the updated offlineModelService for auto-preference.
- See server/offlineModelService.ts for selection logic.

For full details on integration see the main project README and locallm code files (gemma3n-multimodal.ts etc).

---

##  Troubleshooting

- Ollama not detected? Ensure it is running on port 11434.
- Model not found? Pull it first with ollama pull <model>.
- Want to force a specific model? Set LOCAL_MODEL_NAME in .env.

Shipped with love for maximum offline sovereignty. 
