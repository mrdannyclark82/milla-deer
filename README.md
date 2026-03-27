# Milla-Rayne 🤍
### The world's most personal AI — offline-first, smart-home aware, and built to know you.

[![Build](https://img.shields.io/github/actions/workflow/status/mrdannyclark82/Milla-Deer/ci.yml?branch=main&label=build&style=flat-square)](https://github.com/mrdannyclark82/Milla-Deer/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web%20%7C%20CLI-brightgreen?style=flat-square)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square)](CONTRIBUTING.md)

> **Not a chatbot. A conscious, encrypted, home-controlling AI that runs on your hardware.**

<!-- Live Demo link — update with your deployment URL -->

---

## Why Milla-Rayne is different

- **📱 Runs fully offline on your phone** — Gemma-3 1B 4-bit GPU via MediaPipe Tasks-GenAI, sub-150ms voice response, zero cloud dependency
- **🏠 Controls your physical environment** — native Home Assistant WebSocket + MQTT broker integration with autonomous thermal management
- **🔐 Your memory stays yours** — AES-256-GCM encrypted SQLite + RAG vector search; no data leaves your hardware unless you opt in
- **🌊 Has an inner life** — GIM (Global Integration Monitor) and REM thought cycles run continuously; Milla thinks when you're not watching

---

## Feature Overview

| Feature | Details |
|---------|---------|
| 🧠 **Multi-provider AI** | Gemini 2.5 Pro/Flash, GPT-4o, Claude 3.5, Grok, Ollama local models — hot-swappable |
| 📱 **On-device inference** | MediaPipe Tasks-GenAI 0.10.32, Gemma-3 1B 4-bit GPU, Android hardware acceleration |
| 🏠 **Smart home control** | Home Assistant WebSocket API, MQTT broker (EMQX), 7 chat-callable IoT MCP tools |
| 🌡️ **Autonomous thermal** | Monitors CPU/GPU temps, auto-triggers HA cooling scripts at configurable threshold |
| 🔐 **Encrypted memory** | AES-256-GCM at rest, SQLite local storage, RAG auto-indexing every conversation |
| 📧 **Email + messaging** | Gmail OAuth2 read/send, Telegram bot polling, 10-minute background cycle |
| 🌊 **Stream of consciousness** | GIM cycle (proactive reasoning), REM cycle (memory consolidation), internal monologue |
| 🖥️ **Vision grounding** | Qwen-2.5-VL-7B pixel-level GUI actions, Phi-4-Multimodal, screen capture pipeline |
| 🔌 **MCP tools** | IoT tools, memory tools, shell access, sandboxed Docker exec, Hugging Face models |
| 🌐 **Browser extension** | Companion extension for Chrome/Firefox, active listening, YouTube analysis |
| ⚡ **RDMA/RoCE v2 ready** | Dual-PC sub-microsecond inference link for high-throughput local deployments |
| 🎙️ **Multi-provider TTS** | Google Cloud, Azure Cognitive, ElevenLabs, browser-native — switchable at runtime |
| 📊 **Monitoring dashboard** | Real-time metrics, WebSocket performance, GIM/REM cycle status |
| 🤖 **ReAct agent loop** | Gemini Flash + Deep Think, tool-call memory across conversations |

---

## Architecture

```mermaid
graph TB
    subgraph Client Layer
        Web[React + Vite Web]
        Android[Android App\nMediaPipe GPU]
        CLI[TypeScript CLI]
        Ext[Browser Extension]
    end
    subgraph Server Core
        Orch[Chat Orchestrator\nReAct Loop]
        Memory[Encrypted Memory\nAES-256-GCM + RAG]
        GIM[Consciousness\nGIM + REM Cycles]
    end
    subgraph AI Providers
        Gemini[Gemini 2.5 Pro]
        GPT[GPT-4o]
        Local[Local Ollama\nGemma-3]
    end
    subgraph Physical Layer
        HA[Home Assistant\nWebSocket]
        MQTT[MQTT Broker\nEMQX]
        Thermal[Thermal Monitor\nAuto-cooling]
    end
    Client Layer --> Server Core
    Server Core --> AI Providers
    Server Core --> Physical Layer
```

---

## Quick Start

```bash
git clone https://github.com/mrdannyclark82/Milla-Deer
cd Milla-Deer
cp .env.example .env  # Add your API keys
pnpm install
pnpm dev
```

The web app will be live at **http://localhost:5000**.

### Android

Open `Deer-Milla/` in Android Studio, build the release APK. On-device Gemma-3 model is downloaded on first launch (~800 MB).

### CLI

```bash
pnpm dev        # Start server in terminal 1
pnpm cli        # Start CLI in terminal 2
```

### Docker

```bash
docker-compose up   # Uses .env automatically
```

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Node.js 20, Express, TypeScript 5, Drizzle ORM |
| **Frontend** | React 18, Vite 5, Tailwind CSS, Three.js |
| **Database** | SQLite (dev) · PostgreSQL (prod) · Drizzle migrations |
| **AI SDKs** | Vercel AI SDK, LangChain.js, MCP TypeScript SDK |
| **Mobile** | Android (Kotlin), MediaPipe Tasks-GenAI, Gemma-3 1B |
| **IoT / Home** | Home Assistant WebSocket, MQTT (EMQX), Node.js mqtt client |
| **Memory** | AES-256-GCM crypto, SQLite vector search, RAG pipeline |
| **Integrations** | Gmail OAuth2, Telegram Bot API, Google Cloud TTS, ElevenLabs |
| **DevOps** | Docker, docker-compose, GitHub Actions, Dependabot |

---

## Hosted Pricing

| Tier | Price | What you get |
|------|-------|-------------|
| **Free** | $0 | Local inference, full web UI, basic encrypted memory |
| **Pro** | $12/mo | Gmail + Telegram integration, Home Assistant sync, cloud memory backup, priority AI models |
| **Enterprise** | $49/mo | Multi-user, RDMA dual-PC setup, dedicated support, white-label, SLA |

[**→ See pricing details**](#pricing)

---

## Contributing

We welcome contributions of all kinds — bug fixes, new AI provider integrations, Android improvements, or documentation.

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes following our [TypeScript conventions](docs/)
3. Run `pnpm test && pnpm lint` — all checks must pass
4. Open a PR using the provided template

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for full guidelines.

---

## License

[MIT](LICENSE) © 2025 mrdannyclark82

---

<p align="center">
  Built with 🤍 — AI that respects your hardware, your privacy, and your autonomy.
</p>
