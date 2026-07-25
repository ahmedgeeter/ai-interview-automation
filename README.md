# AI Interview Automation

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-MVC-emerald.svg)
![Status](https://img.shields.io/badge/status-Production_Ready-success.svg)

An enterprise-grade, fully autonomous AI interviewer. Built with a pristine Model-View-Controller (MVC) backend architecture and a modular Component-Driven frontend.

This platform conducts deep technical interviews in real-time using LangGraph for agent orchestration, Groq (Llama-3.3-70b) for sub-second intelligence, and robust WebSockets for continuous bi-directional communication.

## Architecture

The codebase strictly adheres to the KISS (Keep It Simple, Stupid) principle, ensuring readability, maintainability, and effortless scalability. 

### Backend (FastAPI)
The backend is structured into a clean MVC pattern with minimal routing overhead:
- `app/controllers/`: Contains Route handlers and WebSocket endpoints.
- `app/models/`: Contains SQLAlchemy database models, state management, and Pydantic validation schemas.
- `app/services/`: Contains the core business logic including LangGraph orchestration, Celery background evaluation, and Text-To-Speech (TTS) generation.
- `app/main.py`: A lightweight, declarative entry point that wires the application together.

### Frontend (Next.js & React)
The frontend is decoupled into reusable, single-responsibility components and custom hooks:
- `app/interview/[sessionId]/page.tsx`: Pure declarative layout combining components.
- `hooks/useInterview.ts`: A unified, powerful custom hook handling all WebSocket lifecycle events, state management, and Web Speech API interactions.
- `components/interview/`: Isolated UI components (JellyButton, InspectorPanel, InterviewLayout).

## Features

- **Real-Time Streaming**: Asynchronous token generation and audio synthesis for zero-lag conversations.
- **Autonomous Proctoring**: Actively detects tab-switching and issues dynamic audio warnings to maintain interview integrity.
- **Live Telemetry & Scoring**: Sub-second latency tracking, token usage monitoring, and real-time candidate evaluation across Technical Depth, Problem Solving, and Communication.
- **Bilingual Support**: Seamless switching between English and Arabic (ar-EG).

## Quick Start

### 1. Prerequisites
- Docker and Docker Compose
- Node.js (v18 or higher)

### 2. Environment Setup
Rename `.env.example` to `.env` and configure your API keys for Groq, ElevenLabs, Google GenAI, and Postgres credentials.

### 3. Launch Services
Run the following commands to initialize the infrastructure and the backend:

```bash
# Start Postgres, Redis, Celery, and the FastAPI Backend
docker-compose up -d --build
```

Start the Next.js Frontend (in a new terminal):
```bash
cd frontend
npm install
npm run dev
```

## System Health and Verification
The application utilizes a lifespan event to run automated database schema generation upon startup. You can verify system health by ensuring the WebSocket connects instantly upon loading an interview session in the frontend interface.

---
Maintained by the Core AI Engineering Team.
