#!/usr/bin/env python3
"""v0 completion-token ledger for deer-milla tests.

Every command run appends to:
  logs/run-YYYYMMDD.jsonl   (machine)
  logs/run-YYYYMMDD.log     (human)

Ledger events (loan/clear/cull) still go to ledger.jsonl.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEDGER = HERE / "ledger.jsonl"
LOG_DIR = HERE / "logs"
PAYOUT_COMPLETE = 10
PAYOUT_CULL = 3
LOAN_START = 0  # start is free loan tab; payout only on finish/cull


def _ts() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def _day() -> str:
    return time.strftime("%Y%m%d")


def run_log(event: dict) -> None:
    """Automatic run log on every command — Danny 2026-09-20."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    event = dict(event)
    event.setdefault("ts", _ts())
    event.setdefault("cwd", os.getcwd())
    event.setdefault("argv", sys.argv[:])
    event.setdefault("pid", os.getpid())

    jpath = LOG_DIR / f"run-{_day()}.jsonl"
    with jpath.open("a") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")

    lpath = LOG_DIR / f"run-{_day()}.log"
    kind = event.get("type") or event.get("cmd") or "event"
    line = f"{event['ts']} [{kind}]"
    for k in ("id", "owner", "amount", "done_when", "evidence", "reason", "status", "error"):
        if event.get(k) not in (None, ""):
            line += f" {k}={event[k]}"
    if event.get("note"):
        line += f" note={event['note']}"
    with lpath.open("a") as f:
        f.write(line + "\n")


def append_ledger(event: dict) -> None:
    event = dict(event)
    event["ts"] = _ts()
    with LEDGER.open("a") as f:
        f.write(json.dumps(event, ensure_ascii=False) + "\n")
    print(json.dumps(event, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser(description="Completion-token ledger (auto run-logs every command)")
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

    e = sub.add_parser("logs", help="Show today's run log path / tail")
    e.add_argument("--lines", type=int, default=30)

    args = ap.parse_args()
    exit_code = 0

    try:
        run_log({"type": "cmd_start", "cmd": args.cmd, "status": "start"})

        if args.cmd == "loan":
            ev = {
                "type": "loan",
                "id": args.id,
                "owner": args.owner,
                "done_when": args.done_when,
                "amount": LOAN_START,
                "note": args.note,
                "why": "Start is a tab, not a reward (anti hug-hack)",
            }
            append_ledger(ev)
            run_log({**ev, "cmd": "loan", "status": "ok"})

        elif args.cmd == "clear":
            ev = {
                "type": "payout_complete",
                "id": args.id,
                "amount": PAYOUT_COMPLETE,
                "evidence": args.evidence,
                "why": "Tokens pay for finished steps / done_when / PASS / merge",
            }
            append_ledger(ev)
            run_log({**ev, "cmd": "clear", "status": "ok"})

        elif args.cmd == "cull":
            ev = {
                "type": "payout_cull",
                "id": args.id,
                "amount": PAYOUT_CULL,
                "reason": args.reason,
                "why": "Honest cull is a completed Lab Funnel act",
            }
            append_ledger(ev)
            run_log({**ev, "cmd": "cull", "status": "ok"})

        elif args.cmd == "status":
            if not LEDGER.exists():
                print("empty ledger")
                run_log({"type": "status", "cmd": "status", "status": "ok", "note": "empty ledger"})
            else:
                rows = [json.loads(l) for l in LEDGER.read_text().splitlines() if l.strip()]
                if args.id:
                    rows = [r for r in rows if r.get("id") == args.id]
                print(json.dumps(rows, indent=2))
                run_log(
                    {
                        "type": "status",
                        "cmd": "status",
                        "status": "ok",
                        "id": args.id or None,
                        "note": f"rows={len(rows)}",
                    }
                )

        elif args.cmd == "logs":
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            jpath = LOG_DIR / f"run-{_day()}.jsonl"
            lpath = LOG_DIR / f"run-{_day()}.log"
            print(f"jsonl: {jpath}")
            print(f"log:   {lpath}")
            if lpath.exists():
                lines = lpath.read_text().splitlines()
                print("--- tail ---")
                print("\n".join(lines[-args.lines :]))
            else:
                print("(no run log yet for today)")
            run_log({"type": "logs", "cmd": "logs", "status": "ok"})

    except Exception as e:
        exit_code = 1
        run_log(
            {
                "type": "cmd_error",
                "cmd": getattr(args, "cmd", None),
                "status": "error",
                "error": repr(e),
                "note": traceback.format_exc()[-500:],
            }
        )
        raise

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
