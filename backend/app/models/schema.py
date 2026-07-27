from pydantic import BaseModel
from typing import Optional

class StartSessionRequest(BaseModel):
    job_title: str
    persona: Optional[str] = "balanced"
    interview_type: Optional[str] = "technical"
    language: Optional[str] = "en"
    max_questions: Optional[int] = 5
    limit_mode: Optional[str] = "questions"  # "questions" | "time"
    limit_value: Optional[int] = 5            # questions count OR minutes
