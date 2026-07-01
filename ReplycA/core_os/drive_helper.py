import os
import pickle
import sys
from typing import Sequence

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
except Exception as e:
    raise ImportError(f"Drive dependencies missing: {e}")


DRIVE_SCOPES: Sequence[str] = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_PATH = "token_drive.pickle"


def get_drive_service():
    creds = None
    # The file token_drive.pickle stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first time.
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, "rb") as token:
            creds = pickle.load(token)
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Look for credentials.json in the same directory as this script
            script_dir = os.path.dirname(os.path.abspath(__file__))
            creds_path = os.path.join(script_dir, 'credentials.json')
            if not os.path.exists(creds_path):
                print(f"ERROR: 'credentials.json' not found in {script_dir}")
                print("Please download your OAuth 2.0 Client IDs from Google Cloud Console and place it there.")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, DRIVE_SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open(TOKEN_PATH, "wb") as token:
            pickle.dump(creds, token)
    return build("drive", "v3", credentials=creds)

def upload_snapshot(file_path: str):
    """Uploads a file to the root of the user's Google Drive."""
    service = get_drive_service()
    file_metadata = {'name': os.path.basename(file_path)}
    media = MediaFileUpload(file_path, mimetype='application/gzip')
    
    print(f"[*] Uploading {file_metadata['name']} to Google Drive...")
    
    file = service.files().create(body=file_metadata,
                                        media_body=media,
                                        fields='id').execute()
    
    print(f"[*] File ID: {file.get('id')}. Upload complete.")
    return file.get('id')


if __name__ == "__main__":
    # The script expects the file path of the snapshot as the first argument
    if len(sys.argv) < 2:
        print("Usage: python drive_helper.py <path_to_snapshot_file>")
        sys.exit(1)
    
    snapshot_path = sys.argv[1]
    if not os.path.exists(snapshot_path):
        print(f"Error: Snapshot file not found at {snapshot_path}")
        sys.exit(1)
        
    upload_snapshot(snapshot_path)
