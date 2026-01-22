import unittest
import threading
import time
import requests
import main
from server import app

class TestThreadingIntegration(unittest.TestCase):
    def test_server_starts_in_thread(self):
        # We need to simulate the main startup sequence without actually running the infinite loop
        # We will check if the thread is created and if the server responds
        
        # Check if start_server function exists in main (we will create it)
        if not hasattr(main, 'start_uplink_server'):
            self.fail("start_uplink_server function not found in main.py")
            
        # Start the server in a thread
        main.start_uplink_server()
        
        # Give it a second to bind
        time.sleep(2)
        
        # Check if port 5000 is open by making a request
        try:
            response = requests.get('http://127.0.0.1:5000/api/status')
            self.assertEqual(response.status_code, 200)
            print("Server responded successfully!")
        except requests.exceptions.ConnectionError:
            self.fail("Could not connect to Flask server on port 5000. Is it running?")

if __name__ == '__main__':
    unittest.main()
