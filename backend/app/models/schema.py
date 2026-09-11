from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class StartSessionRequest(BaseModel):
    job_title: str = Field(..., min_length=2, max_length=120, description="Target job title")
    persona: Optional[str] = Field("balanced", max_length=30)
    interview_type: Optional[str] = Field("technical", max_length=30)
    language: Optional[str] = Field("en", max_length=20)
    max_questions: Optional[int] = Field(5, ge=1, le=20)
    limit_mode: Optional[str] = Field("questions", max_length=20)
    limit_value: Optional[int] = Field(5, ge=1, le=60)

class RecommendedResource(BaseModel):
    title: str = Field(description="Name of the educational resource or documentation")
    url: str = Field(description="Direct URL to authoritative official documentation or tutorial")
    reason: str = Field(description="Why the candidate should study this resource")

class ScorecardPayload(BaseModel):
    technical_depth: int = Field(ge=0, le=100, description="Score for technical depth 0-100")
    problem_solving: int = Field(ge=0, le=100, description="Score for problem solving 0-100")
    architecture: int = Field(ge=0, le=100, description="Score for system design and architecture 0-100")
    communication: int = Field(default=80, ge=0, le=100, description="Score for clear technical communication 0-100")
    integrity: int = Field(default=100, ge=0, le=100, description="Score for integrity and anti-cheat signals 0-100")
    code_quality: Optional[int] = Field(default=None, ge=0, le=100, description="Score for code quality and clean practices")
    key_strengths: List[str] = Field(default_factory=list, description="List of 2-4 candidate strengths observed")
    key_weaknesses: List[str] = Field(default_factory=list, description="List of 2-4 areas for candidate improvement")
    red_flags: List[str] = Field(default_factory=list, description="List of any red flags detected, or empty list")
    final_recommendation: str = Field(description="'Strong Hire', 'Hire', or 'No Hire'")
    recommended_resources: List[RecommendedResource] = Field(default_factory=list, description="Targeted learning resources")
