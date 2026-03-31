# Feature Status

Last updated: 2026-03-31

Quick reference for the state of every major feature. Update the status and "Last verified" date whenever you test something.

**Statuses:** ✅ Working · ⚠️ Partial · ❌ Broken · 🔨 Built/Untested · ❓ Unknown

---

## Core Platform

| Feature | Status | Last verified | Notes |
|---------|--------|--------------|-------|
| Web UI (`milla-rayne.com`) | ✅ | 2026-03-30 | Full UI, Connected, Live |
| Cloudflare tunnel | ✅ | 2026-03-30 | 200ms response |
| Main server (port 5000) | ✅ | 2026-03-30 | systemd auto-restart |
| Proactive server (port 5001) | ❓ | never | Built, not verified |
| Memory system | ✅ | 2026-03-30 | 9604 memories, SQLite |
| Milla agent server (port 7788) | ✅ | 2026-03-30 | Auto-starts on reboot |

## Communication

| Feature | Status | Last verified | Notes |
|---------|--------|--------------|-------|
| Telegram bot | ✅ | 2026-03-30 | Remote CLI + shell |
| Copilot CLI (this session) | ✅ | 2026-03-30 | MCP connected |
| Milla MCP chat tool | ❌ | 2026-03-30 | 403 error |
| Android app (loading) | ⚠️ | 2026-03-30 | Loads but hits offline fallback |
| Android app (chat) | ❌ | 2026-03-30 | Falls to pattern matching |
| ElevenLabs TTS (PC) | ✅ | 2026-03-30 | |
| ElevenLabs TTS (Android) | ❓ | never | Wired in code, unverified |

## AI & Models

| Feature | Status | Last verified | Notes |
|---------|--------|--------------|-------|
| Gemini (primary) | ✅ | 2026-03-30 | |
| OpenRouter | ✅ | 2026-03-30 | |
| xAI / Grok | ⚠️ | 2026-03-30 | 400 errors in GIM |
| Local Ollama (milla-rayne) | ✅ | 2026-03-30 | Live at ollama.com/mrdannyclark82/milla-rayne |
| Image gen (xAI Aurora) | ❌ | never confirmed | Failing, reason unknown |
| Image gen (Pollinations fallback) | ❌ | never confirmed | Fallback also failing |
| Android tri-dispatch SLM | ❌ | 2026-03-30 | GpuSlmDispatcher fails silently |
| SLM router (10 clusters) | 🔨 | 2026-03-30 | Built, not battle-tested |
| LAM execution engine | 🔨 | 2026-03-30 | Built, not battle-tested |

## Smart Home & Hardware

| Feature | Status | Last verified | Notes |
|---------|--------|--------------|-------|
| Tuya LEDs | ❌ | never confirmed | API signing fixed in code, env vars unverified |
| RAM RGB strip | ❓ | never | Code written, physical unverified |
| Milla mood → lights | ❓ | never | Depends on lights working |
| Voice daemon (always-on) | ✅ | 2026-03-30 | Running ×2 PIDs |

## Integrations

| Feature | Status | Last verified | Notes |
|---------|--------|--------------|-------|
| Gmail | ✅ | 2026-03-30 | Connected in web UI |
| Google Calendar | ⚠️ | 2026-03-30 | Shows disabled in some views |
| YouTube analysis | ❓ | never | Built, unverified |
| Open Responses (port 8080) | ❌ | never | Docker not started |
| Web search | ❓ | never | Feature flagged |

---

## Priority Fix Order

1. **Android app chat** — install fixed APK (USB required)
2. **Image generation** — debug Aurora endpoint, fix fallback
3. **Tuya LEDs** — verify env vars, test end-to-end
4. **Milla MCP chat** — fix 403 in `milla_mcp_server.py`
5. **Android on-device SLM** — fix `GpuSlmDispatcher` silent failure
