import unittest
import os

class TestPiperAssets(unittest.TestCase):
    def test_piper_binary_exists(self):
        binary_path = os.path.join("piper", "piper", "piper")
        self.assertTrue(os.path.exists(binary_path), f"Piper binary not found at {binary_path}")
        self.assertTrue(os.path.isfile(binary_path), f"Piper binary is not a file at {binary_path}")

    def test_piper_binary_executable(self):
        binary_path = os.path.join("piper", "piper", "piper")
        if os.path.exists(binary_path):
            self.assertTrue(os.access(binary_path, os.X_OK), f"Piper binary at {binary_path} is not executable")

    def test_model_exists(self):
        model_path = os.path.join("piper", "en_US-amy-low.onnx")
        self.assertTrue(os.path.exists(model_path), f"Piper model not found at {model_path}")

    def test_model_config_exists(self):
        config_path = os.path.join("piper", "en_US-amy-low.onnx.json")
        self.assertTrue(os.path.exists(config_path), f"Piper model config not found at {config_path}")

if __name__ == '__main__':
    unittest.main()
