import unittest
from unittest.mock import patch, ANY
import main
import os

class TestPiperIntegration(unittest.TestCase):
    @patch('subprocess.run')
    @patch('os.remove')
    @patch('os.path.exists')
    def test_speak_piper_calls_subprocess(self, mock_exists, mock_remove, mock_run):
        # Setup mocks
        mock_exists.return_value = True 
        
        # Test function existence
        self.assertTrue(hasattr(main, 'speak_piper'), "speak_piper function not found in main")
        
        # Call the function
        text = "Hello testing"
        main.speak_piper(text)
        
        # Verify subprocess calls
        # We expect at least one call to generate audio and one to play it
        # The exact command depends on implementation, but likely involves 'piper' and 'play'
        
        # Check if any call args contained 'piper'
        piper_called = False
        for call in mock_run.call_args_list:
            args = call[0][0] # The command list
            if any('piper' in str(arg) for arg in args):
                piper_called = True
                break
        
        self.assertTrue(piper_called, "Piper binary was not called via subprocess")
        
        # Check if 'play' or 'aplay' or 'sox' was called
        play_called = False
        for call in mock_run.call_args_list:
            args = call[0][0]
            if args[0] in ['play', 'aplay', 'sox']:
                play_called = True
                break
        
        self.assertTrue(play_called, "Audio player was not called")

if __name__ == '__main__':
    unittest.main()
