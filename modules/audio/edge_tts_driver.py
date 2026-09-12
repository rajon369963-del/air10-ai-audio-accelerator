"""
AIR10 Neural Audio Driver.
Wraps edge-tts with 2.0x/3.0x hardware-accelerated playback and MadhurNeural voice.
"""
import asyncio
import subprocess
from pathlib import Path

class EdgeTTSDriver:
    def __init__(self, voice: str = "hi-IN-MadhurNeural", rate: str = "+100%"):
        self.voice = voice
        self.rate = rate

    def synthesize_to_file(self, text: str, output_path: str) -> bool:
        cmd = [
            "edge-tts",
            "--voice", self.voice,
            "--rate", self.rate,
            "--text", text,
            "--write-media", output_path
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        return res.returncode == 0
