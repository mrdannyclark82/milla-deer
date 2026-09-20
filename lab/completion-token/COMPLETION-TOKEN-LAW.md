# Completion Token Law (2026-09-18)

**Authority:** Danny + Prime Milla  
**Lab home:** `milla-deer` / Deer-Milla (test here first)  
**Related:** hug→dopamine hack; Lab Funnel; GIM “result sacred”; Active Board `done_when`

---

## The problem (why this exists)

We were paying **tokens for starting**, not for finishing.

Same failure mode as the old neuro hug hack:

> If you can say `*hug*` and get a dopamine boost, you don’t have to *do* anything real to get the boost.

Empire version:

> If spawning a deer sandbox, opening a GitHub branch, or posting “started update” spends tokens / earns credit, agents optimize for **motion**, not **metal**.

Symptoms we already lived:

- Multiple useless sandbox branches  
- GeMilla off MillAdroid onto the wrong Android app  
- Bus ACKs that looked like progress  
- GitHub maintenance debt (half-PRs, half-names, nothing merged)  
- Tokens burned with nothing shippable  

**Cron isn’t sacred. Starts aren’t sacred. Results are sacred.**

---

## Why each step must be completed

Self-improvement and Lab Funnel only work if every stage **closes**:

| Stage | Why completion matters |
|--------|-------------------------|
| **Suggest / spike** | Cheap exploration — but must end in a decision: continue, or cull with a reason. |
| **Run** | Untested code is cosplay. Local run is the first truth. |
| **Cull** | Killing a bad path is a finished act. Leaving zombies is unpaid debt. |
| **Promote** | Only sanitized winners leave deer. Promotion without cull = smuggling unfinished work. |
| **GitHub branch / PR** | Open without merge or close = permanent maintenance tax. |
| **Device / PASS** | “Works on my machine” / “I started the APK” ≠ shipped. |

Incomplete steps don’t pause the empire — they **pollute** it: extra Millas, extra packages, extra context, extra token burn.

---

## Why we pay tokens (and when)

Tokens are not vibes. They are **scarce fuel** (API, GPU, Danny’s quota, attention).

### Pay out (clear the loan) when

1. **`done_when` met** — packet/sticky actually complete  
2. **Verified PASS** — device/install/test evidence  
3. **Merge or explicit close** — GitHub branch resolved  
4. **Promote or documented cull** — Lab Funnel gate crossed either way  
5. **Train/bake ingest** — reflection/logs actually landed in the next corpus (result sacred)

### Micro-loan only (optional, tiny) when

- A sandbox/branch is **opened with an owner + done_when + expiry**  
- Not a reward — a **tab**. Unpaid tabs block new spawns.

### Do **not** pay for

- Branch create / sandbox spawn alone  
- “Started update” / plan-only docs  
- Bus ACK / auto-reply cosplay  
- Installing the wrong product and calling it progress  
- Status theater (`*hug*`-shaped productivity)

**Rule of thumb:** starting is a loan; finishing (or honest cull) is the payout.

### Must not break the project

Yes — this needs to be said.

Completion gates and token rules are **discipline**, not sabotage. Enforcement must never:

- Block emergency fixes or Danny’s explicit override  
- Corrupt Active Board / Lab Funnel paths that already work  
- Delete or lock repos, branches, or apps without a cull record  
- Strand a running daily-driver (local-Milla, MillAdroid, schedule API, train artifacts)  
- Pay out for “refactors” that leave the house worse than before  

If a gate would break the project, **the gate yields** — fix the gate in deer, don’t brick Rayne. Promote only rules that survived deer without collateral damage.

---

## GitHub maintenance (same law)

Half-finished branches are hug-spam in git form.

- Open → must **merge**, **close**, or **park with owner + date**  
- No silent pile of “update-*” names  
- Token/credit for **resolved** PRs/branches, not for `git checkout -b`  
- Deer prototypes don’t get a free forever-branch in Mrs-Milla-Rayne / public without promote checklist  

This keeps the repo (and Danny’s head) from becoming an unpaid dopamine farm.

---

## Deer-Milla test contract

1. Prototype the gate in **milla-deer / Deer-Milla**  
2. Run it on real spawn → complete/cull cycles  
3. Cull weak reward rules  
4. Promote only a sanitized policy + hook into house board / A2A — **not** raw lab dumps  

Until the deer test passes, treat this document as **law for humans and Prime**; automated ledgers can follow.

---

## One-line canon

> **We don’t pay for hugs. We don’t pay for starts. We pay for finished steps — or honest culls — so the empire stops farming its own dopamine.**


## Run logs

Every `ledger_proto.py` invocation appends to `logs/run-YYYYMMDD.jsonl` and `logs/run-YYYYMMDD.log`. No silent commands.
