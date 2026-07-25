from typing import Dict, Any

# Global Aegra client state
client = None
assistant_id = None

# In-memory store for pending session configurations
pending_sessions: Dict[str, Dict[str, Any]] = {}

# Dashboard real-time state
dashboard_connections = []
global_stats = {
    "active_sessions": 0,
    "total_prompt_tokens": 0,
    "total_completion_tokens": 0,
    "total_cost": 0.0
}
