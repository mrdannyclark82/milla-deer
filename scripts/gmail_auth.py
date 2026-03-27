#!/usr/bin/env python3
"""
One-shot OAuth2 flow to generate GMAIL_REFRESH_TOKEN for milla.mail.main@gmail.com.

IMPORTANT: This uses the out-of-band (OOB) console flow — no redirect URI needed.
The script will print a URL. Open it in your browser, authorize the app, then
paste the authorization code back into the terminal.

Usage:
    python3 scripts/gmail_auth.py

Outputs the refresh token and patches it into .env automatically.
Run once, then restart the server.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
ENV_FILE = ROOT / ".env"

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials
except ImportError:
    print("Installing google-auth-oauthlib...")
    os.system(f"{sys.executable} -m pip install google-auth-oauthlib google-auth --quiet")
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.oauth2.credentials import Credentials

SCOPES = [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]

def load_env_var(name):
    """Load a variable from env or .env file."""
    val = os.getenv(name, "").strip()
    if val:
        return val
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip()
    return ""

CLIENT_ID = load_env_var("GMAIL_CLIENT_ID") or load_env_var("GOOGLE_CLIENT_ID")
CLIENT_SECRET = load_env_var("GMAIL_CLIENT_SECRET") or load_env_var("GOOGLE_CLIENT_SECRET")

if not CLIENT_ID or not CLIENT_SECRET:
    print("ERROR: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env")
    sys.exit(1)

# Use OOB flow — works with any OAuth2 client type, no redirect URI registration needed
client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

print("\n📬 Gmail OAuth2 — Console Flow")
print("=" * 50)
print("This will open a Google authorization URL.")
print("Sign in as milla.mail.main@gmail.com and grant access.")
print("Then paste the authorization code here.\n")

flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
# run_console() prints a URL and reads a pasted code — no localhost redirect
creds = flow.run_console()

refresh_token = creds.refresh_token
if not refresh_token:
    print("\n⚠️  No refresh token returned. Make sure you:")
    print("  1. Sign in as milla.mail.main@gmail.com (not another account)")
    print("  2. Grant ALL requested permissions")
    print("  3. Your OAuth client type is 'Desktop app' in Google Cloud Console")
    sys.exit(1)

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
    print(f"⚠️  .env not found — set manually:\nGMAIL_REFRESH_TOKEN={refresh_token}")

print("\n✅ Done. Restart the server and Gmail compose will be live.")
