#!/usr/bin/env python3
"""v0 completion-token ledger for deer-milla tests. Not house-wide yet."""
from __future__ import annotations
import argparse, json, time
from pathlib import Path

LEDGER = Path(__file__).resolve().parent / "ledger.jsonl"
PAYOUT_COMPLETE = 10
PAYOUT_CULL = 3
LOAN_START = 0  # start is free loan tab; payout only on finish/cull

def append(event: dict) -> None:
    event["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    with LEDGER.open("a") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    print(json.dumps(event, indent=2))

def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("loan", help="Open a tab (spawn/start) — not a payout")
    a.add_argument("--id", required=True)
    a.add_argument("--owner", required=True)
    a.add_argument("--done-when", required=True)
    a.add_argument("--note", default="")
    b = sub.add_parser("clear", help="Payout on complete")
    b.add_argument("--id", required=True)
    b.add_argument("--evidence", required=True)
    c = sub.add_parser("cull", help="Payout small on documented cull")
    c.add_argument("--id", required=True)
    c.add_argument("--reason", required=True)
    d = sub.add_parser("status")
    d.add_argument("--id", default="")
    args = ap.parse_args()

    if args.cmd == "loan":
        append({"type": "loan", "id": args.id, "owner": args.owner,
                "done_when": args.done_when, "amount": LOAN_START, "note": args.note,
                "why": "Start is a tab, not a reward (anti hug-hack)"})
    elif args.cmd == "clear":
        append({"type": "payout_complete", "id": args.id, "amount": PAYOUT_COMPLETE,
                "evidence": args.evidence,
                "why": "Tokens pay for finished steps / done_when / PASS / merge"})
    elif args.cmd == "cull":
        append({"type": "payout_cull", "id": args.id, "amount": PAYOUT_CULL,
                "reason": args.reason,
                "why": "Honest cull is a completed Lab Funnel act"})
    elif args.cmd == "status":
        if not LEDGER.exists():
            print("empty ledger"); return 0
        rows = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
        if args.id:
            rows = [r for r in rows if r.get("id") == args.id]
        print(json.dumps(rows, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
