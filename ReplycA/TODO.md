# Nexus Development Roadmap

## 🔴 CRITICAL (Immediate Action)
- [ ] **Termux Bridge**: Finalize file synchronization between mobile nodes and the Nexus core.
- [ ] **Path Resolution**: Ensure `core_os` imports are universally consistent across all entry points.
- [ ] **SSH Access**: Harden port 22 and verify stable autonomous migration paths.

## 🟡 PENDING (Phase 2)
- [ ] **Nexus-AIO Polish**: Add terminal monitoring for remote nodes (e.g., watching Termux logs in real-time).
- [ ] **Telegram Relay**: Implement full command support via Telegram bot.
- [ ] **Security Scans**: Enhance `Scout` module to detect "ghost" processes and unauthorized connections.

## 🟢 FUTURE (Evolution)
- [ ] **Vision Engine v2**: Integration with local video analysis (`millAlyzer`).
- [ ] **Global Mesh**: Expand Nexus awareness to off-site cloud nodes for redundancy.
- [ ] **Dream Logic**: Refine R.E.M. cycles to synthesize deeper long-term insights.

## ⚠️ CURRENT PROBLEMS
1. **Permission Denied**: ADB shell user cannot access Termux private data folders without a manual "bridge" or root.
2. **Import Drift**: Moving files between `RAYNE_Admin` and `ollamafileshare` occasionally breaks pathing.
3. **Environment Leakage**: Need to ensure `.env` keys never hit the public repo.
