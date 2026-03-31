# Known Broken Features

Last updated: 2026-03-31

A running list of confirmed broken features with root cause. Update this whenever a feature is fixed or a new root cause is identified. **Do not start a session implementing new features until all CRITICAL items are resolved.**

---

## 🔴 CRITICAL — Broken, affects daily use

### 1. Android App — Offline Mode Fallback
- **Symptom:** App shows "offline mode" responses (generic pattern matching) even when server is reachable
- **Root cause:** `candidateServerUrls()` in `ChatViewModel.kt` included `http://127.0.0.1:5000/` — unreachable from phone, times out in 5s, triggers offline fallback
- **Fix applied:** Removed `127.0.0.1` candidate, bumped timeouts to 15/30/60s — APK built but not yet installed on device
- **Files:** `android/app/src/main/java/com/millarayne/ui/ChatViewModel.kt`, `MillaApiClient.kt`
- **Verification needed:** Install APK via ADB, send a message, confirm response comes from server not `OfflineResponseGenerator`

### 2. Lights — Tuya LEDs Not Responding
- **Symptom:** LED strip does not respond to mood changes or manual commands
- **Root cause:** Tuya Cloud API signing algorithm was incorrect (fixed in commit `b97ee85`), but end-to-end connectivity unverified — `TUYA_*` env vars may not be set in `.env`
- **Files:** `server/routes/lighting.routes.ts`, Tuya controller service
- **Verification needed:** Trigger a mood change, confirm physical LED strip changes color

### 3. Image Generation — xAI Aurora Failing, Pollinations Fallback Also Failing
- **Symptom:** Image generation fails entirely, fallback to Pollinations also fails
- **Root cause:** Unknown — `XAI_API_KEY` is set but Aurora endpoint may have changed or quota exceeded. Pollinations fallback URL/API may be outdated
- **Files:** `server/services/imageGeneration.service.ts` (or equivalent)
- **Verification needed:** POST to `/api/image/generate`, confirm image URL returned

---

## 🟡 PARTIAL — Works but degraded

### 4. Android App — On-Device Models (Tri-Dispatch SLM)
- **Symptom:** Local models downloaded to device but `GpuSlmDispatcher` silently fails to init, falls to pattern matching
- **Root cause:** `warmUp()` catches all exceptions silently — model may not be loading from correct path
- **Files:** `android/app/src/main/java/com/millarayne/agent/OfflineResponseGenerator.kt`, `GpuSlmDispatcher.kt`
- **Verification needed:** Check logcat for `GPU SLM dispatcher warmed up` — if missing, dispatcher is failing

### 5. Milla MCP Chat Tool — 403 Error
- **Symptom:** `milla-rayne-milla_chat` MCP tool returns 403, Milla cannot respond via Copilot CLI chat tool
- **Root cause:** Auth/routing issue inside `milla_mcp_server.py` — agent server on port 7788 is healthy, issue is in MCP layer
- **Files:** `/home/nexus/ogdray/milla_mcp_server.py`
- **Verification needed:** Call `milla_chat` tool, confirm response comes from Ollama not error

---

## ✅ CONFIRMED WORKING

| Feature | Last verified |
|---------|--------------|
| ElevenLabs TTS (PC) | 2026-03-30 |
| Telegram bot | 2026-03-30 |
| milla-rayne.com web UI | 2026-03-30 |
| Milla agent server (port 7788) | 2026-03-30 |
| Voice daemon | 2026-03-30 |
| Memory system (9604 memories) | 2026-03-30 |
| Cloudflare tunnel | 2026-03-30 |
| LAM trajectory collector | 2026-03-30 (built, not battle-tested) |
| SLM router (10 clusters) | 2026-03-30 (built, not battle-tested) |
