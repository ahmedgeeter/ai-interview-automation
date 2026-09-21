import pytest
import json
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, AsyncMock
from app.main import app
from app.services.tts_service import apply_phonetic_middleware
from app.workers.assessor import _generate_scorecard_sync

client = TestClient(app)

def test_root_health():
    """Verify root health check endpoint returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_api_health():
    """Verify /api/health check endpoint returns 200 OK."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_root_info():
    """Verify root information endpoint returns service metadata."""
    response = client.get("/")
    assert response.status_code == 200
    assert "service" in response.json()
    assert response.json()["service"] == "AutoHire AI Interview Engine"

def test_start_session():
    """Verify session creation endpoint returns a valid UUID."""
    payload = {
        "job_title": "Senior AI Engineer",
        "persona": "balanced",
        "interview_type": "technical",
        "language": "en",
        "limit_mode": "questions",
        "limit_value": 5
    }
    with patch("app.controllers.session_ctrl.fetch_domain_context", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = "Mocked domain context"
        response = client.post("/api/start-session", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert len(data["session_id"]) > 10

def test_get_session_config():
    """Verify session config retrieval returns configured parameters."""
    payload = {
        "job_title": "MLOps Engineer",
        "persona": "strict",
        "interview_type": "technical",
        "language": "en",
        "limit_mode": "questions",
        "limit_value": 3
    }
    with patch("app.controllers.session_ctrl.fetch_domain_context", new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = "Mocked domain context"
        create_res = client.post("/api/start-session", json=payload)
        session_id = create_res.json()["session_id"]

        config_res = client.get(f"/api/session/{session_id}/config")
        assert config_res.status_code == 200
        config_data = config_res.json()
        assert config_data["job_title"] == "MLOps Engineer"
        assert config_data["persona"] == "strict"
        assert config_data["limit_value"] == 3

def test_egyptian_phonetic_middleware():
    """Verify Egyptian dialect text receives phonetic enhancements for speech synthesis."""
    raw_ar_text = "بص تمام كده كويس شغال"
    processed = apply_phonetic_middleware(raw_ar_text, "ar-eg")
    
    # Should replace Egyptian particles with vocalized equivalents
    assert "تَمَامْ" in processed
    assert "بُصّ" in processed
    assert "شَغَّالْ" in processed

    # For English, text should remain unchanged
    en_input = "Hello, how are you today?"
    assert apply_phonetic_middleware(en_input, "en") == en_input

def test_assessor_scorecard_generation():
    """Verify assessor evaluates transcript and produces structured JSON scorecard."""
    transcript = "human: I use PyTorch and LangGraph.\nai: Can you explain state graphs in LangGraph?"
    mock_scorecard = {
        "technical_depth": 85,
        "communication": 90,
        "problem_solving": 80,
        "architecture": 85,
        "integrity": 100,
        "key_strengths": ["Clear understanding of LangGraph state machine"],
        "key_weaknesses": [],
        "red_flags": [],
        "final_recommendation": "Hire",
        "recommended_resources": []
    }
    with patch("app.workers.assessor.ChatGroq") as mock_groq, \
         patch("app.workers.assessor.ChatGoogleGenerativeAI") as mock_gemini:
        mock_instance = MagicMock()
        mock_instance.invoke.return_value = MagicMock(content=json.dumps(mock_scorecard))
        mock_groq.return_value = mock_instance
        mock_gemini.return_value = mock_instance

        scorecard = _generate_scorecard_sync("Senior AI Engineer", transcript)
        assert scorecard["technical_depth"] == 85
        assert scorecard["final_recommendation"] == "Hire"

def test_file_signature_validation():
    """Verify magic bytes validation correctly distinguishes valid documents from spoofed files."""
    from app.controllers.session_ctrl import validate_file_signature
    
    # Valid PDF magic bytes
    valid_pdf = b"%PDF-1.4\n%...\n"
    assert validate_file_signature("resume.pdf", valid_pdf) is True
    
    # Spoofed PDF (executable disguised as PDF)
    fake_pdf = b"MZ\x90\x00\x03\x00\x00\x00"
    assert validate_file_signature("resume.pdf", fake_pdf) is False

    # Valid DOCX zip signature
    valid_docx = b"PK\x03\x04\x14\x00\x06\x00"
    assert validate_file_signature("cv.docx", valid_docx) is True

    # Valid TXT
    valid_txt = "Senior AI Engineer with 5 years experience.".encode("utf-8")
    assert validate_file_signature("cv.txt", valid_txt) is True

def test_start_session_cv_spoofing_rejected():
    """Verify that uploading a file with invalid magic bytes returns 400 Bad Request."""
    fake_pdf_content = b"MALICIOUS_EXECUTABLE_CONTENT_NOT_A_REAL_PDF"
    files = {
        "cv_file": ("exploit.pdf", fake_pdf_content, "application/pdf")
    }
    data = {
        "job_title": "Senior AI Engineer",
        "persona": "balanced",
        "interview_type": "technical",
        "language": "en",
        "max_questions": "5",
        "limit_mode": "questions",
        "limit_value": "5"
    }
    response = client.post("/api/start-session-cv", data=data, files=files)
    assert response.status_code == 400
    assert "Invalid file signature" in response.json()["detail"]

