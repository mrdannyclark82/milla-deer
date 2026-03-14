import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Scopes for YouTube Read-Only Access
SCOPES = ['https://www.googleapis.com/auth/youtube.readonly']

# Path resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREDENTIALS_FILE = os.path.join(BASE_DIR, 'config', 'credentials.json')
TOKEN_FILE = os.path.join(BASE_DIR, 'config', 'youtube_token.json')

def get_youtube_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                return None 
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())

    return build('youtube', 'v3', credentials=creds)

def get_recent_activity():
    youtube = get_youtube_service()
    if not youtube:
        return "YouTube service unavailable."
    
    # Get 'Liked' videos (closest proxy to history available via API for free)
    try:
        request = youtube.videos().list(
            part="snippet,contentDetails",
            myRating="like",
            maxResults=10
        )
        response = request.execute()
        
        videos = []
        for item in response['items']:
            title = item['snippet']['title']
            channel = item['snippet']['channelTitle']
            videos.append(f"Liked: {title} ({channel})")
            
        return videos
    except Exception as e:
        return f"Error fetching activity: {e}"

if __name__ == "__main__":
    print("--- Authenticating YouTube ---")
    activity = get_recent_activity()
    print("\nRecent Activity Found:")
    for v in activity:
        print(v)
