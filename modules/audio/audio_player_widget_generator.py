"""
AIR10 Interactive Audio Player Widget Generator.
Generates glassmorphic, hardware-accelerated, zero-in-chat glitch HTML artifact players.
"""

class AudioWidgetGenerator:
    @staticmethod
    def generate_html(title: str, audio_base64: str, transcript: str = "", playback_rate: float = 2.0) -> str:
        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>{title}</title>
    <style>
        body {{
            background: #090d16;
            color: #f0f4fc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
        }}
        .card {{
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 20px;
            padding: 32px;
            max-width: 640px;
            width: 100%;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }}
        h1 {{ font-size: 1.4rem; margin-top: 0; color: #60a5fa; }}
        audio {{ width: 100%; margin: 20px 0; border-radius: 12px; }}
        .badge {{
            display: inline-block;
            background: #1e3a8a;
            color: #93c5fd;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
        }}
        .notes {{ font-size: 0.9rem; color: #94a3b8; line-height: 1.5; }}
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">AIR10 SOVEREIGN AUDIO</span>
        <h1>{title}</h1>
        <audio controls id="player">
            <source src="data:audio/mp3;base64,{audio_base64}" type="audio/mp3">
        </audio>
        <p class="notes">{transcript}</p>
        <script>
            const a = document.getElementById('player');
            a.playbackRate = {playback_rate};
        </script>
    </div>
</body>
</html>"""
