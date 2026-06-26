from typing import TypedDict, Annotated, List, Dict, Any
import operator
from langchain_core.messages import BaseMessage

class InterviewState(TypedDict):
    # The conversation history
    messages: Annotated[List[BaseMessage], operator.add]
    
    # The targeted job title for context
    job_title: str
    
    # The selected interviewer persona
    persona: str
    
    # Additional domain context for the interview
    domain_context: str | None
    cv_text: str | None
    
    interview_type: str
    language: str
    telemetry: dict | None
    
    # Track the number of questions asked
    question_count: int
    
    # Maximum questions before triggering the evaluator
    max_questions: int
    
    # Store the final evaluation JSON
    evaluation_payload: Dict[str, Any] | None
    
    # Anti-cheat mechanism: track the number of times the user switched tabs
    cheat_signals: int
    
    # Indicator if the latest message was a tab_switch system signal
    latest_cheat_detected: bool
