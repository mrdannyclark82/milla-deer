import os
import pickle
from typing import Sequence

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
except Exception as e:
    raise ImportError(f"Drive dependencies missing: {e}")


DRIVE_SCOPES: Sequence[str] = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_PATH = "token_drive.pickle"


def get_drive_service():
    creds = None
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "rb") as token:
            creds = pickle.load(token)
        if not creds.scopes or any(scope not in creds.scopes for scope in DRIVE_SCOPES):
            creds = None
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", DRIVE_SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, "wb") as token:
            pickle.dump(creds, token)
    return build("drive", "v3", credentials=creds)

def list_files(max_results=10):
    """Lists files in the user's Drive."""
    service = get_drive_service()
    results = service.files().list(
        pageSize=max_results, fields="nextPageToken, files(id, name, mimeType)"
    ).execute()
    return results.get('files', [])

if __name__ == "__main__":
    print("[*] Testing Drive Auth and Listing...")
    files = list_files(5)
    for f in files:
        print(f"- {f['name']} ({f['id']})")
