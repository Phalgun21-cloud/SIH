"""
FSOC Coarse PAT Simulator - Web Dashboard Launcher
Smart India Hackathon 2024 | Problem Statement 26169 (ISRO / Department of Space)

One-command launcher for the FastAPI backend telemetry server and modern
aerospace flight control HUD web application.
"""

import os
import sys
import webbrowser
import threading
import time
from pathlib import Path
import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def open_browser(url: str, delay_sec: float = 1.2):
    time.sleep(delay_sec)
    print(f"Opening mission control dashboard in browser: {url}")
    webbrowser.open(url)


def main():
    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}/"

    print("=" * 80)
    print("  DRISHTI-PAT MK-IV FLIGHT TELEMETRY MISSION CONTROL STATION")
    print("  Smart India Hackathon 2024 | ISRO / DOS Problem Statement 26169")
    print("=" * 80)
    print(f"Starting FastAPI & WebSocket backend on: http://{host}:{port}")
    print(f"Static Mission Control UI mounted at  : {url}")
    print("Press Ctrl+C to terminate the mission control station.")
    print("=" * 80)

    # Launch browser automatically in a background thread
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    uvicorn.run("web.server:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
