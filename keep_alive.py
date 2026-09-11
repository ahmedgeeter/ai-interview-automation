"""
AutoHire Always-On Keep-Alive Daemon (keep_alive.py)
---------------------------------------------------
Prevents cloud hosting platforms (Render, Railway, Fly.io, Koyeb, HuggingFace)
from placing the backend container into cold sleep during periods of inactivity.

Usage:
    python keep_alive.py
    or run as a background service:
    nohup python keep_alive.py > keep_alive.log 2>&1 &
"""
import os
import sys
import time
import urllib.request
import urllib.error

# Target backend endpoint
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
PING_URL = f"{BACKEND_URL}/ping"
INTERVAL_SECONDS = int(os.getenv("PING_INTERVAL", "420")) # 7 minutes

def send_heartbeat():
    try:
        req = urllib.request.Request(
            PING_URL, 
            headers={"User-Agent": "AutoHire-KeepAlive/2.0"}
        )
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=12) as response:
            latency = round((time.time() - t0) * 1000, 2)
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            print(f"[{timestamp}] Heartbeat OK -> HTTP {response.status} ({latency}ms) on {PING_URL}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] HTTP Error {e.code}: {e.reason}")
        return False
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Connection notice: {e}")
        return False

def main():
    print("=" * 60)
    print("  AUTOHIRE ALWAYS-ON KEEP-ALIVE DAEMON (SUB-ZERO SLEEP)   ")
    print(f"  Target URL: {PING_URL}")
    print(f"  Pulse Interval: Every {INTERVAL_SECONDS // 60} minutes ({INTERVAL_SECONDS}s)")
    print("=" * 60)
    
    # Send initial probe
    send_heartbeat()
    
    while True:
        time.sleep(INTERVAL_SECONDS)
        send_heartbeat()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nKeep-Alive daemon stopped by user.")
        sys.exit(0)
