# Completion Token — deer lab

**Law:** `COMPLETION-TOKEN-LAW.md` (also partnership `COMPLETION-TOKEN-LAW-2026-09-18.md`)

## Run logs (automatic)
Every `ledger_proto.py` command appends to:

```
lab/completion-token/logs/run-YYYYMMDD.jsonl   # machine
lab/completion-token/logs/run-YYYYMMDD.log     # human
```

```bash
python3 lab/completion-token/ledger_proto.py logs          # today's paths + tail
python3 lab/completion-token/ledger_proto.py logs --lines 50
```

`*.log` is gitignored; `logs/*.jsonl` can be committed for audit if desired.

## Commands
```bash
python3 lab/completion-token/ledger_proto.py loan  --id ID --owner WHO --done-when "..."
python3 lab/completion-token/ledger_proto.py clear --id ID --evidence "..."
python3 lab/completion-token/ledger_proto.py cull  --id ID --reason "..."
python3 lab/completion-token/ledger_proto.py status [--id ID]
```

## Rules
- Start = **loan** (amount 0) — not a reward
- Finish = **clear** payout
- Honest kill = **cull** small payout
- Must not break the project
