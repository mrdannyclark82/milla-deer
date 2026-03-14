import os
import pickle
from typing import Sequence

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
except Exception as e:
    raise ImportError(f"Gmail dependencies missing: {e}")


SCOPES: Sequence[str] = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]


def authenticate_gmail():
    """Authenticate and return a Gmail API service client."""
    creds = None
    if os.path.exists("token.pickle"):
        with open("token.pickle", "rb") as token:
            creds = pickle.load(token)
        # Force re-auth if scopes are insufficient
        if not creds.scopes or any(scope not in creds.scopes for scope in SCOPES):
            creds = None
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.pickle", "wb") as token:
            pickle.dump(creds, token)
    return build("gmail", "v1", credentials=creds)

def list_recent_emails(max_results=5):
    """Returns a list of recent email snippets."""
    service = authenticate_gmail()
    results = service.users().messages().list(userId='me', maxResults=max_results).execute()
    messages = results.get('messages', [])
    
    email_summaries = []
    for msg in messages:
        m = service.users().messages().get(userId='me', id=msg['id'], format='minimal').execute()
        email_summaries.append({
            "id": msg['id'],
            "snippet": m.get('snippet', '')
        })
    return email_summaries

if __name__ == "__main__":
    print("[*] Testing Gmail Auth and Listing...")
    emails = list_recent_emails(3)
    for i, e in enumerate(emails):
        print(f"{i+1}. [{e['id']}] {e['snippet']}")
