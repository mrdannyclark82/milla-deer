import requests
import time
import json
import threading
import sys
import main

def verify_uplink():
    print("Starting SARIi Uplink Server Verification...")

    # Start the server (if not already running - though in this script we import main so we should start it)
    # Note: In a real manual test, the user might run 'python3 main.py' in one terminal and this script in another.
    # But for this verification script, we'll try to start it if we can, or assume it's running.
    # To be safe and self-contained, let's start it in a thread like main does.
    
    try:
        main.start_uplink_server()
        print("Waiting 3 seconds for server to initialize...")
        time.sleep(3)
    except Exception as e:
        print(f"Warning: Could not start server (might already be running or port busy): {e}")

    # Test /api/status
    print("\n[1] Testing GET /api/status...")
    try:
        response = requests.get("http://127.0.0.1:5000/api/status")
        if response.status_code == 200:
            print("SUCCESS: Received 200 OK")
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        else:
            print(f"FAILURE: Received {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"FAILURE: Connection error: {e}")

    # Test /api/command
    print("\n[2] Testing POST /api/command...")
    try:
        payload = {"command": "hello verification"}
        response = requests.post("http://127.0.0.1:5000/api/command", json=payload)
        if response.status_code == 200:
            print("SUCCESS: Received 200 OK")
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        else:
            print(f"FAILURE: Received {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"FAILURE: Connection error: {e}")

if __name__ == "__main__":
    verify_uplink()
    # Force exit because the server thread is daemon but we want to be sure
    sys.exit(0)
