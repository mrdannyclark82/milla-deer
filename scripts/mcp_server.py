#!/usr/bin/env python3
"""
Milla-Rayne FastMCP Terminal Skill Server

Exposes Arch Linux system tools to Milla via the Model Context Protocol (MCP).
Runs on stdio (for direct agent use) or HTTP (for remote/network use).

Usage:
    # stdio mode (default, for direct agent integration):
    python3 scripts/mcp_server.py

    # HTTP mode (for network/browser-extension use):
    python3 scripts/mcp_server.py --http --port 6006

Tools exposed:
    - run_command      : Execute a shell command (with allowlist + timeout)
    - read_file        : Read a file from the filesystem
    - write_file       : Write content to a file
    - list_dir         : List directory contents
    - system_status    : CPU, memory, disk, uptime, Ollama models
    - pacman_check     : Dry-run pacman update check (Arch Linux)
    - process_list     : List running processes (filtered)
    - nexus_status     : Check Milla-Rayne server + proactive + TTS port health
"""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from fastmcp import FastMCP
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "fastmcp", "--quiet"], check=True)
    from fastmcp import FastMCP

# ── Config ────────────────────────────────────────────────────────────────────

NEXUS_ROOT = Path(__file__).parent.parent
COMMAND_TIMEOUT = 15  # seconds

# Commands that are always safe to run
COMMAND_ALLOWLIST = {
    "ls", "cat", "head", "tail", "grep", "find", "echo", "pwd", "whoami",
    "df", "du", "free", "top", "ps", "uptime", "uname", "hostname",
    "systemctl", "journalctl", "pacman", "paru", "yay",
    "git", "node", "npm", "pnpm", "npx", "python3", "pip",
    "curl", "wget", "ping", "ss", "netstat", "ip",
    "ollama", "nvtop", "htop", "btop",
}

mcp = FastMCP("milla-nexus", instructions="Milla-Rayne's Arch Linux terminal skill server.")


# ── Tools ─────────────────────────────────────────────────────────────────────

@mcp.tool()
def run_command(command: str, working_dir: str = "") -> dict[str, Any]:
    """
    Run a shell command on the Arch Linux system.
    Only commands whose base executable is in the safety allowlist are permitted.
    Returns stdout, stderr, and return code.
    """
    parts = command.strip().split()
    if not parts:
        return {"error": "Empty command."}

    base = Path(parts[0]).name
    if base not in COMMAND_ALLOWLIST:
        return {
            "error": f"Command '{base}' is not in the safety allowlist.",
            "allowlist": sorted(COMMAND_ALLOWLIST),
        }

    cwd = working_dir if working_dir else str(NEXUS_ROOT)

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT,
            cwd=cwd,
        )
        return {
            "stdout": result.stdout[:4000],
            "stderr": result.stderr[:1000],
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"Command timed out after {COMMAND_TIMEOUT}s."}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def read_file(path: str, max_chars: int = 4000) -> dict[str, Any]:
    """Read the contents of a file. Path is relative to the Nexus root or absolute."""
    p = Path(path) if Path(path).is_absolute() else NEXUS_ROOT / path
    try:
        text = p.read_text(errors="replace")
        truncated = len(text) > max_chars
        return {
            "content": text[:max_chars],
            "truncated": truncated,
            "size_bytes": p.stat().st_size,
        }
    except FileNotFoundError:
        return {"error": f"File not found: {p}"}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def write_file(path: str, content: str) -> dict[str, Any]:
    """
    Write content to a file. Path is relative to Nexus root or absolute.
    Creates parent directories as needed.
    """
    p = Path(path) if Path(path).is_absolute() else NEXUS_ROOT / path
    # Safety: refuse writes outside of Nexus root to system paths
    try:
        p.resolve().relative_to(NEXUS_ROOT.resolve())
    except ValueError:
        return {"error": "Writes outside the Nexus root are not permitted."}
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return {"success": True, "path": str(p), "bytes_written": len(content.encode())}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def list_dir(path: str = "", max_entries: int = 100) -> dict[str, Any]:
    """List directory contents. Defaults to Nexus root."""
    p = Path(path) if path and Path(path).is_absolute() else NEXUS_ROOT / path
    try:
        entries = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name))
        result = []
        for e in entries[:max_entries]:
            result.append({
                "name": e.name,
                "type": "file" if e.is_file() else "dir",
                "size": e.stat().st_size if e.is_file() else None,
            })
        return {"path": str(p), "entries": result, "total": len(list(p.iterdir()))}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def system_status() -> dict[str, Any]:
    """Return CPU, memory, disk, uptime, and Ollama model list."""
    status: dict[str, Any] = {"os": platform.system(), "arch": platform.machine()}

    # uptime
    try:
        r = subprocess.run(["uptime", "-p"], capture_output=True, text=True, timeout=5)
        status["uptime"] = r.stdout.strip()
    except Exception:
        pass

    # memory (free -h)
    try:
        r = subprocess.run(["free", "-h"], capture_output=True, text=True, timeout=5)
        status["memory"] = r.stdout.strip()
    except Exception:
        pass

    # disk (df -h /)
    try:
        r = subprocess.run(["df", "-h", "/"], capture_output=True, text=True, timeout=5)
        status["disk"] = r.stdout.strip()
    except Exception:
        pass

    # Ollama models
    try:
        r = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=8)
        status["ollama_models"] = r.stdout.strip()
    except Exception:
        status["ollama_models"] = "ollama not running or not installed"

    return status


@mcp.tool()
def pacman_check() -> dict[str, Any]:
    """
    Dry-run pacman update check. Returns list of packages with available updates.
    Safe: read-only, no packages are installed or modified.
    """
    if not shutil.which("pacman"):
        return {"error": "pacman not found — not an Arch Linux system."}
    try:
        r = subprocess.run(
            ["pacman", "-Qu"],
            capture_output=True, text=True, timeout=30,
        )
        lines = [l for l in r.stdout.splitlines() if l.strip()]
        return {
            "updates_available": len(lines),
            "packages": lines[:50],
            "stderr": r.stderr[:500] if r.stderr else None,
        }
    except subprocess.TimeoutExpired:
        return {"error": "pacman check timed out (30s)."}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def process_list(filter_name: str = "") -> dict[str, Any]:
    """
    List running processes. Optionally filter by name substring.
    Returns PID, name, CPU%, and memory% for top 30 matches.
    """
    try:
        r = subprocess.run(
            ["ps", "aux", "--no-header", "--sort=-%cpu"],
            capture_output=True, text=True, timeout=10,
        )
        lines = r.stdout.splitlines()
        procs = []
        for line in lines:
            parts = line.split(None, 10)
            if len(parts) < 11:
                continue
            name = parts[10]
            if filter_name and filter_name.lower() not in name.lower():
                continue
            procs.append({
                "pid": parts[1],
                "cpu_pct": parts[2],
                "mem_pct": parts[3],
                "name": name[:120],
            })
            if len(procs) >= 30:
                break
        return {"processes": procs, "total_shown": len(procs)}
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
def nexus_status() -> dict[str, Any]:
    """
    Check health of Milla-Rayne's local services:
    - Main server (port 5000)
    - Proactive server (port 5001)
    - TTS server (port 5002)
    - Ollama (port 11434)
    """
    import urllib.request
    import urllib.error

    ports = {
        "main_server": ("http://localhost:5000/api/health", 5000),
        "proactive_server": ("http://localhost:5001/health", 5001),
        "tts_server": ("http://localhost:5002/ready", 5002),
        "ollama": ("http://localhost:11434/api/tags", 11434),
    }

    results: dict[str, Any] = {}
    for name, (url, _port) in ports.items():
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                results[name] = {"status": "up", "http": resp.status}
        except urllib.error.URLError:
            results[name] = {"status": "down"}
        except Exception as e:
            results[name] = {"status": "error", "detail": str(e)}

    return results


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Milla-Rayne MCP Server")
    parser.add_argument("--http", action="store_true", help="Run in HTTP mode instead of stdio")
    parser.add_argument("--port", type=int, default=6006, help="HTTP port (default: 6006)")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP host (default: 127.0.0.1)")
    args = parser.parse_args()

    if args.http:
        print(f"[MCP] Starting HTTP server on http://{args.host}:{args.port}")
        mcp.run(transport="streamable-http", host=args.host, port=args.port)
    else:
        mcp.run(transport="stdio")
