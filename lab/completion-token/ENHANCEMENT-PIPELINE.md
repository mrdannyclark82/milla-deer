# Enhancement → notify pipeline (Danny 2026-09-20)

**Problem:** Proactive cycle awarded tokens for recycled sandbox "test passed" suggestions (security scanning × N). Hug-hack.

## Required flow
1. **Enhancement agent** — finds enhancements / recommendations  
2. **Supervisor / Milla agent** — analyzes: is this a **new** idea? (dedupe against history / sandboxes / prior awards)  
3. If new → **open sandbox** and hand to **coding agent**  
4. Coding agent updates code → notifies Milla agent  
5. **Milla agent composes email to Danny** (user notify)

## Token rules (Completion Token Law)
- **No payout** at enhancement-found or sandbox-test-pass  
- **Loan (0)** when sandbox opens with owner + done_when  
- **Clear payout** when coding agent finishes + Milla notifies user with evidence  
- **Cull payout** if supervisor rejects as duplicate / not new  

## Must not break the project
Gate yields for emergencies; no writing into `node_modules`; no stack-trace paths as files.
