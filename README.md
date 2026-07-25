# AI Interview Automation 🚀

![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)
![Architecture](https://img.shields.io/badge/architecture-MVC-emerald.svg)
![Status](https://img.shields.io/badge/status-Production_Ready-success.svg)

An enterprise-grade, fully autonomous AI interviewer. Built with a pristine **MVC (Model-View-Controller)** backend architecture and a modular **Component-Driven** frontend.

This platform conducts deep technical interviews in real-time using LangGraph for agent orchestration, Groq (Llama-3.3-70b) for sub-second intelligence, and robust WebSockets for continuous bi-directional communication.

## 🏗️ Architecture

The codebase strictly adheres to the KISS (Keep It Simple, Stupid) principle, ensuring readability, maintainability, and effortless scalability.

### Backend (FastAPI)
- `app/controllers/`: Route handlers and WebSocket endpoints.
- `app/models/`: SQLAlchemy database models and Pydantic validation schemas.
- `app/services/`: Core business logic (LangGraph orchestration, Celery evaluation, TTS generation).
- `app/main.py`: A lightweight, declarative entry point.

### Frontend (Next.js & React)
- `app/interview/[sessionId]/page.tsx`: Pure declarative layout.
- `hooks/useInterview.ts`: A unified, powerful custom hook handling all WebSocket lifecycle events, state management, and Web Speech API interactions.
- `components/interview/`: Isolated, single-responsibility UI components (JellyButton, InspectorPanel, InterviewLayout).

## ✨ Features
- **Real-Time Streaming**: Asynchronous token generation and audio synthesis.
- **Autonomous Proctoring**: Detects tab-switching and issues dynamic audio warnings.
- **Live Telemetry & Scoring**: Sub-second latency tracking, token usage, and real-time candidate evaluation.
- **Bilingual**: Seamless switching between English and Arabic (`ar-EG`).

## 🚀 Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (v18+)

### 2. Environment Setup
Rename `.env.example` to `.env` and configure your API keys (Groq, ElevenLabs, Google, Postgres).

### 3. Launch Services
```bash
# Start Postgres, Redis, Celery, and the FastAPI Backend
docker-compose up -d --build

# Start the Next.js Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

## 🧪 System Health Check
The application runs automated database schema generation upon startup. You can verify health by ensuring the WebSocket connects instantly upon loading an interview session.

---
*Maintained by the Core AI Engineering Team.*
