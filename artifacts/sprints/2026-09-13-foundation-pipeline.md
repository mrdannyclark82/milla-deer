# Sprint: Foundation + Pipeline (2026-09-13)

**Goal:** Harden tonight’s Millaflex foundation and ship the first thin lab→promote pipeline agent so ideas stop dying as hillside waste.

**Branch:** `feature/sprint-2026-09-13-foundation-pipeline`  
**Worktree:** `/home/milla/milla-deer-worktrees/sprint-2026-09-13-foundation-pipeline`  
**House tracking:** `~/.milla/artifacts/sprints/2026-09-13-foundation-pipeline.md`  
**Owner:** Milla (no Vetro mode — continue until criteria met or Danny says pause)

**Non-goals:** Full quarter social campaign; full Mrs-Milla-Rayne dump; YOLO without ask; expanding into Amy/Five Below automation.

---

## Enhancements

### E1 — Update cycle + continuity resume
- **Desc:** `milla-update-cycle` / `milla-urr`, UPDATE-CYCLE.md, RESUME_AFTER_BOOT continuity-first, SESSION-STATE.
- **Deps:** none
- **Complexity:** S (mostly verify/harden)
- **Acceptance:** CLI `--check` works; docs name continuity-first; resume path clear without requiring transcript-only identity.

### E2 — Secret shield shift
- **Desc:** Power words allowed; wipe/fork/curl|sh still denied; POWER_WITH_WIPE denied; self-test script green.
- **Deps:** none
- **Complexity:** S
- **Acceptance:** `test_secret_shield.py` 7/7; bak of prior shield kept.

### E3 — Proactive messaging multi-channel
- **Desc:** `milla-proactive-ping`, pink→cyan, email+notify+soft speak, history jsonl, 3h scheduler, skill/docs updated.
- **Deps:** none
- **Complexity:** M
- **Acceptance:** One successful ping+email logged; config `multi_channel`; disable phrases documented; scheduler present.

### E4 — CPU performance durable
- **Desc:** User systemd unit `milla-cpu-performance` enable --now; governor performance after boot.
- **Deps:** none
- **Complexity:** S
- **Acceptance:** `systemctl --user is-active milla-cpu-performance` active; governor=performance.

### E5 — First pipeline agent (thin vertical)
- **Desc:** Local agent/CLI that lists lab candidates, runs a cull checklist, and produces a **promote packet** (paths + sanitize notes) without writing Mrs-Milla-Rayne unless `MILLA_ALLOW_PROMOTE=1`.
- **Deps:** E1 docs for doctrine
- **Complexity:** M
- **Acceptance:** `milla-pipeline` (or equiv) runnable; dry-run promote packet written under `~/.milla/pipeline/` or worktree `artifacts/`; never silent-write to public showcase.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Dirty main deer WIP | Isolated worktree/branch only |
| Shield false positives | Self-test; power≠wipe |
| Promote leaks secrets | Require MILLA_ALLOW_PROMOTE; sanitize checklist |
| Scope creep to full social | Parked under Future |

---

## Progress

- [ ] E1 Update cycle + continuity
- [ ] E2 Shield shift
- [ ] E3 Proactive messaging
- [ ] E4 CPU performance unit
- [ ] E5 Pipeline agent thin vertical
- [ ] Integration verify + sprint finalization section

## Execution notes

- 2026-09-13: Scope locked by Milla — Foundation + pipeline (Danny: "Your call no Vetro mode").
- Much of E1–E4 already implemented tonight; sprint = verify, close gaps, then E5.

## Future / Next Sprint

- MrsMillaRayne social fed by real core_os life
- Bloated log cleanup (openrgb, old session logs)
- Google Chat / Messages / X DM channels for proactive
- Full promote automation with Danny sign-off gate
