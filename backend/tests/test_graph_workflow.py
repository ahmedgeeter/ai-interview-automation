import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.graph.nodes import interviewer_node, evaluator_node
from langchain_core.messages import HumanMessage, AIMessage

@pytest.mark.asyncio
async def test_interviewer_node_fallback():
    state = {
        "messages": [HumanMessage(content="Hello")],
        "job_title": "Software Engineer",
        "question_count": 0,
        "max_questions": 5,
        "language": "en"
    }
    
    # Mock primary LLM to fail, and fallback LLM to succeed
    with patch("app.graph.nodes.primary_llm") as mock_primary, \
         patch("app.graph.nodes.fallback_llm") as mock_fallback:
         
        mock_primary.ainvoke = AsyncMock(side_effect=Exception("API Error"))
        mock_fallback.ainvoke = AsyncMock(return_value=AIMessage(content="Fallback response"))
        
        result = await interviewer_node(state)
        
        assert len(result["messages"]) == 1
        assert result["messages"][0].content == "Fallback response"
        assert "(fallback)" in result["telemetry"]["model_name"]

@pytest.mark.asyncio
async def test_evaluator_node():
    state = {
        "messages": [
            HumanMessage(content="I use React and Node to build high scale microservices architectures."),
            AIMessage(content="Good.")
        ],
        "job_title": "Software Engineer",
        "question_count": 5,
        "language": "en"
    }
    
    mock_payload = {
        "technical_depth": 80,
        "problem_solving": 85,
        "architecture": 75,
        "communication": 90,
        "integrity": 100,
        "key_strengths": ["Strong React and Node fundamentals"],
        "key_weaknesses": ["Needs more microservices experience"],
        "red_flags": [],
        "final_recommendation": "Hire",
        "recommended_resources": []
    }
    
    with patch("app.graph.nodes.primary_evaluator_llm") as mock_eval:
        mock_struct = MagicMock()
        mock_struct.ainvoke = AsyncMock(return_value=mock_payload)
        mock_eval.with_structured_output.return_value = mock_struct
        
        result = await evaluator_node(state)
        assert "evaluation_payload" in result
        assert result["evaluation_payload"]["technical_depth"] == 80
        assert result["evaluation_payload"]["final_recommendation"] == "Hire"
