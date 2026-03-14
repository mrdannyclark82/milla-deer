import os
import datetime
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/calendar']

# Path resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # core_os folder
CREDENTIALS_FILE = os.path.join(BASE_DIR, 'config', 'credentials.json')
TOKEN_FILE = os.path.join(BASE_DIR, 'config', 'calendar_token.json')

def get_calendar_service():
    """Shows basic usage of the Google Calendar API."""
    creds = None
    # The file token.json stores the user's access and refresh tokens
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    
    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                return None # Fail gracefully if no creds
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        # Save the credentials for the next run
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())

    try:
        service = build('calendar', 'v3', credentials=creds)
        return service
    except Exception as e:
        print(f"[Calendar Error]: {e}")
        return None

def list_calendars():
    """Lists all calendars the user has access to."""
    service = get_calendar_service()
    if not service:
        return {"status": "error", "msg": "Calendar service unavailable."}
    try:
        calendar_list = service.calendarList().list().execute()
        calendars = []
        for entry in calendar_list['items']:
            calendars.append({"id": entry['id'], "summary": entry['summary']})
        return {"status": "success", "calendars": calendars}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def fetch_upcoming_events(days=14, calendar_id='primary'):
    """Gets events for the next period to determine availability."""
    service = get_calendar_service()
    if not service:
        return {"status": "error", "msg": "Calendar service unavailable."}

    now = datetime.datetime.utcnow().isoformat() + 'Z'
    end_period = (datetime.datetime.utcnow() + datetime.timedelta(days=days)).isoformat() + 'Z'

    try:
        events_result = service.events().list(calendarId=calendar_id, timeMin=now, timeMax=end_period,
                                              singleEvents=True, orderBy='startTime').execute()
        events = events_result.get('items', [])

        schedule = []
        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            summary = event['summary']
            event_id = event['id']
            schedule.append({"id": event_id, "start": start, "summary": summary})
            
        return {"status": "success", "events": schedule, "calendar": calendar_id}
    
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def delete_calendar_event(calendar_id, event_id):
    """Deletes a specific event from a calendar."""
    service = get_calendar_service()
    if not service:
        return {"status": "error", "msg": "Calendar service unavailable."}
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return {"status": "success", "msg": f"Event {event_id} deleted from {calendar_id}."}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

def create_calendar_event(calendar_id, summary, start_time, end_time, description=""):
    """Creates a new event in the specified calendar."""
    service = get_calendar_service()
    if not service:
        return {"status": "error", "msg": "Calendar service unavailable."}
    
    event = {
        'summary': summary,
        'description': description,
        'start': {
            'dateTime': start_time,
            'timeZone': 'America/Chicago',
        },
        'end': {
            'dateTime': end_time,
            'timeZone': 'America/Chicago',
        },
    }

    try:
        event = service.events().insert(calendarId=calendar_id, body=event).execute()
        return {"status": "success", "event_id": event.get('id'), "msg": "Event created successfully."}
    except Exception as e:
        return {"status": "error", "msg": str(e)}

if __name__ == "__main__":
    # Check all calendars
    cals = list_calendars()
    if cals['status'] == 'success':
        for c in cals['calendars']:
            print(f"--- Calendar: {c['summary']} ({c['id']}) ---")
            print(fetch_upcoming_events(days=14, calendar_id=c['id']))
    else:
        print(cals)
