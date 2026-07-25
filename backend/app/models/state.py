from typing import Dict, Any

# Global Aegra client state
client = None
assistant_id = None

# In-memory store for pending session configurations
pending_sessions: Dict[str, Dict[str, Any]] = {}
