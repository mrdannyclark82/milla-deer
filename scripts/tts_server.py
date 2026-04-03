#!/usr/bin/env python3
"""
Lightweight TTS server on port 5002 compatible with Milla-Rayne's coquiService.ts.
Uses espeak-ng or festival as backend until full Coqui TTS models are installed.

POST /api/tts  { text: string, speaker_id?: string }  → WAV audio bytes
GET  /ready                                            → { status: "ok" }
"""

import http.server
import json
import subprocess
import tempfile
import os
import sys
import wave
import struct

PORT = int(os.environ.get("TTS_PORT", 5002))
BACKEND = "espeak"  # or "festival"

def text_to_wav(text: str, speaker_id: str = "female_en") -> bytes:
    """Convert text to WAV using espeak or festival."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        out_path = tf.name

    try:
        if BACKEND == "espeak":
            # espeak: -v en+f3 for a female voice, -s 140 speed, -w output.wav
            voice = "en+f3" if "female" in speaker_id else "en+m3"
            subprocess.run(
                ["espeak", "-v", voice, "-s", "140", "-w", out_path, text],
                capture_output=True, timeout=15, check=True
            )
        else:
            # festival fallback
            proc = subprocess.run(
                ["festival", "--tts"],
                input=text.encode(), capture_output=True, timeout=15
            )
            # festival writes to stdout as raw audio; wrap in WAV
            raw = proc.stdout
            with wave.open(out_path, 'w') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                wf.writeframes(raw)

        with open(out_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


class TTSHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[TTS] {self.address_string()} {format % args}")

    def send_json(self, code: int, obj: dict):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path in ("/ready", "/health"):
            self.send_json(200, {"status": "ok", "backend": BACKEND})
        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/tts":
            self.send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "invalid JSON"})
            return

        text = data.get("text", "").strip()
        if not text:
            self.send_json(400, {"error": "text is required"})
            return

        speaker_id = data.get("speaker_id", "female_en")

        try:
            wav_bytes = text_to_wav(text, speaker_id)
        except subprocess.TimeoutExpired:
            self.send_json(500, {"error": "TTS timeout"})
            return
        except Exception as e:
            self.send_json(500, {"error": str(e)})
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(wav_bytes)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(wav_bytes)


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), TTSHandler)
    print(f"[TTS] Server running on port {PORT} (backend: {BACKEND})")
    print(f"[TTS] POST /api/tts  {{text, speaker_id}} → WAV")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[TTS] Shutting down")
        server.shutdown()
