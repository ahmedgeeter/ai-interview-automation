from langgraph.graph import StateGraph, END, START
from app.graph.state import InterviewState
from app.graph.nodes import interviewer_node, guardrail_node, evaluator_node

def route_next_step(state: InterviewState):
    """
    Determine if we should continue interviewing or evaluate.
    """
    question_count = state.get("question_count", 0)
    max_questions = state.get("max_questions", 5)
    
    if question_count >= max_questions:
        return "evaluator_node"
    return "interviewer_node"

def build_graph():
    # 1. Initialize StateGraph
    workflow = StateGraph(InterviewState)
    
    # 2. Add Nodes
    workflow.add_node("guardrail_node", guardrail_node)
    workflow.add_node("interviewer_node", interviewer_node)
    workflow.add_node("evaluator_node", evaluator_node)
    
    # 3. Define Edges
    # The entry point is the guardrail node to intercept any inputs
    workflow.add_edge(START, "guardrail_node")
    
    # From guardrail, we route based on whether we hit the question limit
    workflow.add_conditional_edges(
        "guardrail_node",
        route_next_step,
        {
            "interviewer_node": "interviewer_node",
            "evaluator_node": "evaluator_node"
        }
    )
    
    # Interviewer node loops back to end the current execution step, waiting for user input
    workflow.add_edge("interviewer_node", END)
    
    # Evaluator node finishes the process entirely
    workflow.add_edge("evaluator_node", END)
    
    # 4. Compile Graph
    # We use memory or checkpointer if we want to persist state, but for WebSockets we can pass state directly
    app = workflow.compile()
    
    return app

# Expose the compiled graph
graph_app = build_graph()
