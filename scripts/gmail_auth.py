#!/usr/bin/env python3
"""
One-shot OAuth2 flow to generate GMAIL_REFRESH_TOKEN for milla.mail.main@gmail.com.

Usage:
    python3 scripts/gmail_auth.py

Outputs the refresh token to stdout and appends it to .env automatically.
Run once, then restart the server.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
ENV_FILE = ROOT / ".env"

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Installing google-auth-oauthlib...")
    os.system(f"{sys.executable} -m pip install google-auth-oauthlib --quiet")
    from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]

CLIENT_ID = os.getenv("GMAIL_CLIENT_ID") or os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET") or os.getenv("GOOGLE_CLIENT_SECRET")

if not CLIENT_ID or not CLIENT_SECRET:
    # Try to load from .env
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("GMAIL_CLIENT_ID=") or line.startswith("GOOGLE_CLIENT_ID="):
                CLIENT_ID = line.split("=", 1)[1].strip()
            if line.startswith("GMAIL_CLIENT_SECRET=") or line.startswith("GOOGLE_CLIENT_SECRET="):
                CLIENT_SECRET = line.split("=", 1)[1].strip()

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env")
    sys.exit(1)

client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
creds = flow.run_local_server(port=0)

refresh_token = creds.refresh_token
print(f"\n✅ GMAIL_REFRESH_TOKEN={refresh_token}\n")

# Patch .env
if ENV_FILE.exists():
    content = ENV_FILE.read_text()
    if "GMAIL_REFRESH_TOKEN=" in content:
        lines = content.splitlines()
        patched = []
        for line in lines:
            if line.startswith("GMAIL_REFRESH_TOKEN="):
                patched.append(f"GMAIL_REFRESH_TOKEN={refresh_token}")
            else:
                patched.append(line)
        ENV_FILE.write_text("\n".join(patched) + "\n")
        print(f"✅ Updated GMAIL_REFRESH_TOKEN in {ENV_FILE}")
    else:
        with open(ENV_FILE, "a") as f:
            f.write(f"\nGMAIL_REFRESH_TOKEN={refresh_token}\n")
        print(f"✅ Appended GMAIL_REFRESH_TOKEN to {ENV_FILE}")
else:
    print(f"⚠️  .env not found — set GMAIL_REFRESH_TOKEN={refresh_token} manually")
