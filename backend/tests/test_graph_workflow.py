import pytest
from unittest.mock import patch, AsyncMock
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
    
    # We mock primary LLM to fail, and fallback LLM to succeed
    with patch("app.graph.nodes.primary_llm.ainvoke", side_effect=Exception("API Error")), \
         patch("app.graph.nodes.fallback_llm.ainvoke", new_callable=AsyncMock) as mock_fallback:
         
        mock_fallback.return_value = AIMessage(content="Fallback response")
        
        result = await interviewer_node(state)
        
        assert len(result["messages"]) == 1
        assert result["messages"][0].content == "Fallback response"
        assert result["telemetry"]["model_name"] == "mixtral-8x7b-32768 (fallback)"

@pytest.mark.asyncio
async def test_evaluator_node():
    state = {
        "messages": [
            HumanMessage(content="I use React and Node."),
            AIMessage(content="Good.")
        ],
        "job_title": "Software Engineer",
        "question_count": 5,
        "language": "en"
    }
    
    with patch("app.graph.nodes.primary_evaluator_llm.with_structured_output") as mock_struct:
        mock_struct.return_value.ainvoke = AsyncMock(return_value={
            "technical_depth": 80,
            "final_recommendation": "Hire"
        })
        
        result = await evaluator_node(state)
        assert "evaluation_payload" in result
        assert result["evaluation_payload"]["technical_depth"] == 80
