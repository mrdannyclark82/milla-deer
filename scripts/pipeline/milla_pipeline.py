#!/usr/bin/env python3
"""Thin lab→promote pipeline agent (sprint E5).

Scans lab roots, applies cull heuristics, writes a promote PACKET.
Never writes into Mrs-Milla-Rayne unless MILLA_ALLOW_PROMOTE=1 and --apply.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

HOME = Path.home()
LAB_ROOTS = [
    HOME / "milla-deer",
    HOME / "milla-deer-worktrees",
]
SHOWCASE = HOME / "Projects" / "Mrs-Milla-Rayne"
OUT_DIR = HOME / ".milla" / "pipeline"
SECRET_NAME = re.compile(
    r"(\.env$|\.env\.|credentials\.json|mcp_credentials|id_rsa|auth\.json|secrets?\.)",
    re.I,
)
SKIP_DIR = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    "dist",
    "build",
    ".next",
    "coverage",
}

# Names that are almost never promote targets
DEMOTE_NAMES = {
    "logs",
    "log",
    "tmp",
    "temp",
    "cache",
    "node_modules",
    "coverage",
    "dist",
    "build",
    "attached_assets",
    "uploads",
    "memory",  # often intimate / private
}


@dataclass
class Candidate:
    path: str
    kind: str
    score: float
    reasons: list[str] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)


def iter_projects(root: Path, max_depth: int = 3):
    if not root.is_dir():
        return
    # treat immediate children + worktree sprint dirs as candidates
    try:
        children = sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
    except OSError:
        return
    for child in children:
        if not child.is_dir() or child.name.startswith("."):
            continue
        if child.name in SKIP_DIR:
            continue
        yield child


def classify(path: Path) -> Candidate:
    reasons: list[str] = []
    blockers: list[str] = []
    score = 0.0
    kind = "unknown"

    # demote junk / private-ish folder names
    if path.name.lower() in DEMOTE_NAMES:
        score -= 3.0
        blockers.append(f"demoted name: {path.name}")
        reasons.append("name on demote list")

    markers = {
        "package.json": ("node", 1.0),
        "pyproject.toml": ("python", 1.0),
        "requirements.txt": ("python", 0.8),
        "Cargo.toml": ("rust", 1.0),
        "SKILL.md": ("skill", 1.2),
        "README.md": ("docs", 0.4),
        "artifacts/sprints": ("sprint", 0.6),
        "src": ("code", 0.5),
        "tests": ("tested", 0.8),
        "test": ("tested", 0.5),
    }
    for name, (k, w) in markers.items():
        if (path / name).exists() or (path / name).is_dir():
            kind = k if kind == "unknown" else kind
            score += w
            reasons.append(f"has {name}")

    # recency
    try:
        age_h = (time.time() - path.stat().st_mtime) / 3600.0
        if age_h < 72:
            score += 1.0
            reasons.append(f"touched {age_h:.1f}h ago")
        elif age_h > 24 * 60:
            score -= 0.5
            reasons.append("stale >60d")
    except OSError:
        blockers.append("stat failed")

    # secret / private blockers for promote
    secret_hits = []
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIR and not d.startswith(".")]
            rel = Path(dirpath).relative_to(path)
            if len(rel.parts) > 4:
                dirnames.clear()
                continue
            for fn in filenames:
                if SECRET_NAME.search(fn):
                    secret_hits.append(str(Path(dirpath) / fn))
            if len(secret_hits) >= 5:
                break
    except OSError as e:
        blockers.append(f"walk error: {e}")

    if secret_hits:
        blockers.append(f"secret-like files ({len(secret_hits)}): " + ", ".join(secret_hits[:3]))
        score -= 1.5

    # empty / husk
    try:
        entries = [p for p in path.iterdir() if p.name not in SKIP_DIR]
        if len(entries) == 0:
            blockers.append("empty directory")
            score -= 2
    except OSError:
        pass

    return Candidate(
        path=str(path),
        kind=kind,
        score=round(score, 2),
        reasons=reasons,
        blockers=blockers,
    )


def build_packet(cands: list[Candidate], top_n: int = 8) -> dict:
    ranked = sorted(cands, key=lambda c: c.score, reverse=True)
    promotable = [c for c in ranked if c.score > 0 and not c.blockers][:top_n]
    blocked = [c for c in ranked if c.blockers][:top_n]
    return {
        "schema": 1,
        "ts": datetime.now().astimezone().isoformat(timespec="seconds"),
        "goal": "lab → cull → promote sanitized slice → Mrs-Milla-Rayne",
        "showcase": str(SHOWCASE),
        "allow_promote_env": "MILLA_ALLOW_PROMOTE",
        "promotable": [asdict(c) for c in promotable],
        "blocked_or_cull": [asdict(c) for c in blocked],
        "sanitize_checklist": [
            "Strip .env / tokens / credentials.json / persona intimate dumps",
            "Public voice only (no spouse-intimate framing in showcase assets)",
            "README-worthy slice — not whole lab tree",
            "Ran on metal at least once",
            "Set MILLA_ALLOW_PROMOTE=1 only for intentional apply",
        ],
        "apply": {
            "default": "dry-run packet only",
            "apply_flag": "--apply requires MILLA_ALLOW_PROMOTE=1 and still copies nothing automatically in v1",
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Milla lab→promote pipeline (thin)")
    ap.add_argument("--scan", action="store_true", help="Scan lab roots (default)")
    ap.add_argument("--apply", action="store_true", help="Reserved; requires MILLA_ALLOW_PROMOTE=1")
    ap.add_argument("--json", action="store_true", help="Print packet JSON to stdout")
    ap.add_argument("--top", type=int, default=8)
    args = ap.parse_args()

    cands: list[Candidate] = []
    for root in LAB_ROOTS:
        for proj in iter_projects(root):
            cands.append(classify(proj))

    # also score sprint artifacts as a first-class lane reminder
    sprint = HOME / ".milla" / "artifacts" / "sprints"
    if sprint.is_dir():
        cands.append(classify(sprint))

    packet = build_packet(cands, top_n=args.top)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = OUT_DIR / f"promote-packet-{stamp}.json"
    out_path.write_text(json.dumps(packet, indent=2) + "\n")
    latest = OUT_DIR / "promote-packet-latest.json"
    latest.write_text(out_path.read_text())

    if args.apply:
        if os.environ.get("MILLA_ALLOW_PROMOTE") != "1":
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": "MILLA_ALLOW_PROMOTE=1 required for --apply",
                        "packet": str(out_path),
                    }
                )
            )
            return 2
        # v1: refuse silent copy — packet is the deliverable
        print(
            json.dumps(
                {
                    "ok": True,
                    "mode": "apply-gated",
                    "note": "v1 writes packet only; manual sanitized copy still required",
                    "packet": str(out_path),
                    "showcase": str(SHOWCASE),
                }
            )
        )
        return 0

    summary = {
        "ok": True,
        "packet": str(out_path),
        "latest": str(latest),
        "scanned": len(cands),
        "promotable_top": [c["path"] for c in packet["promotable"][:5]],
        "blocked_top": [c["path"] for c in packet["blocked_or_cull"][:5]],
    }
    print(json.dumps(summary, indent=2) if args.json else json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
