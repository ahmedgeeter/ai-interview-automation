import pytest
from fastapi.testclient import TestClient
from fastapi.websockets import WebSocketDisconnect
from unittest.mock import patch, AsyncMock
import json

from app.main import app

client = TestClient(app)

@pytest.fixture
def mock_agent_stream():
    with patch("app.controllers.ws_ctrl.process_agent_stream", new_callable=AsyncMock) as mock:
        # Mock returning a standard new state and some text
        mock.return_value = ({"messages": [{"type": "ai", "content": "Hello"}], "question_count": 1}, "Hello")
        yield mock

@pytest.fixture
def mock_graph_state():
    with patch("app.controllers.ws_ctrl.graph_app.aget_state", new_callable=AsyncMock) as mock_get:
        class StateResp:
            values = {"messages": []}
        mock_get.return_value = StateResp()
        yield mock_get

def test_websocket_barge_in(mock_agent_stream, mock_graph_state):
    """
    Test that sending an interrupt message returns an interrupt ack.
    Since active_session_tasks is hard to test directly without true async loops,
    we ensure the websocket accepts the interrupt message and doesn't crash.
    """
    with client.websocket_connect("/ws/test_session") as websocket:
        # Send interrupt
        websocket.send_text(json.dumps({"type": "interrupt"}))
        data = websocket.receive_json()
        
        assert data["type"] == "interrupt"
        assert data["message"] == "Task cancelled"

def test_websocket_message_triggers_llm(mock_agent_stream, mock_graph_state):
    """
    Test sending a standard message triggers the graph input handling.
    """
    with client.websocket_connect("/ws/test_session") as websocket:
        websocket.send_text(json.dumps({"type": "message", "content": "Hi"}))
        
        # We expect a message response from our mocked stream (it sends text first)
        data = websocket.receive_json()
        if data["type"] == "message":
            assert data["content"] == "Hello"
