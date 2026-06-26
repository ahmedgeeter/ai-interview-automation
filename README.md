<div align="center">
  <img src="./frontend/app/icon.png" alt="Logo" width="100" height="100">
  
  # 🤖 AutoHire: The Autonomous AI Engineering Interviewer
  
  **An elite, fully-autonomous AI interviewing platform designed to simulate real-world technical interviews with zero human intervention. Assess candidates dynamically with real-time feedback, deep technical probing, and strict competency mapping.**

  [![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![LangGraph](https://img.shields.io/badge/LangGraph-AI_Agents-FF9900?style=for-the-badge)](https://langchain.com/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
</div>

---

## 🌟 Vision
Traditional technical interviews are time-consuming, expensive, and subject to human bias. **AutoHire** solves this by deploying a voice-capable, adaptive AI agent (powered by LLMs like Groq/LLaMA-3 and Gemini) that interacts with candidates precisely like an elite Engineering Manager.

The system evaluates **Technical Depth, Architecture, Problem Solving, and Communication** strictly and provides an unbiased Hire/No-Hire recommendation at the end of the session.

---

## 🚀 Key Features

- 🎙️ **Voice & Text Modalities**: Candidates can speak directly to the AI (Speech-to-Text) and the AI responds via hyper-realistic Text-to-Speech (Edge TTS).
- ⚡ **Zero-Latency Booting**: While the candidate sets up, background subagents scrape the web to fetch role-specific constraints and context to ensure the interview starts instantly.
- 📊 **Real-Time Competency Tracking (WebSockets)**: As the candidate speaks, the AI evaluates the response in milliseconds and updates live progress bars for specific skills.
- ⏱️ **Dynamic Constraints**: Flexible setups allowing limits by strict Question Counts (e.g., 5 questions) or Time Limits (e.g., 30 minutes).
- 🌐 **Fully Bilingual (i18n)**: Seamless switching between **English (LTR)** and **Arabic (RTL)** across the entire UI and AI Voice Persona.
- 🛡️ **Anti-Cheat Mechanics**: Detects tab-switching and flags the final scorecard if the candidate loses focus.
- 🏆 **Final Scorecard & Competency Radar**: Generates a visually stunning, downloadable PDF scorecard containing strengths, weaknesses, and a strict final recommendation.

---

## 🏗️ Architecture

The platform is split into a modern decoupled architecture:

1. **Frontend (Next.js 15, React 19, Tailwind CSS V4):** 
   - Beautiful, noise-textured dark/light UI.
   - Recharts for Radar data visualization.
   - Custom React Hooks for audio streaming and recording.
2. **Backend (FastAPI, Python, LangChain, LangGraph):**
   - Stateful WebSocket connections managing the interview workflow.
   - Multi-agent workflow:
     - **Interviewer Agent**: Asks adaptive questions and probes deeply.
     - **Live Evaluator Agent**: Scores each answer in real-time.
     - **Final Assessor Agent**: Strictly grades the entire transcript.

---

## 💻 Local Setup & Installation

### Prerequisites
- Node.js 18+
- Python 3.11+
- API Keys for `Groq` and `Gemini` (Google Generative AI).

### 1. Clone the repository
```bash
git clone https://github.com/your-username/ai-automation-interview.git
cd ai-automation-interview
```

### 2. Backend Setup (FastAPI)
```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

pip install -r requirements.txt

# Create your .env file
echo "GROQ_API_KEY=your_groq_key" > .env
echo "GEMINI_API_KEY=your_gemini_key" >> .env

# Run the server
uvicorn app.main:app --port 8000 --reload
```

### 3. Frontend Setup (Next.js)
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Visit `http://localhost:3000` to start your first interview!

---

## 🌍 Cloud Deployment

- **Frontend (Vercel):** The frontend is highly optimized for Edge deployment. Just run `npx vercel` inside the `frontend` folder.
- **Backend (Render):** A `render.yaml` and `Dockerfile` are included for 1-click deployment on Render.com. Just connect your GitHub repo!

---

## 🛡️ Privacy & Security
- **No data retention**: Interview transcripts exist only in memory during the session.
- **Strict Evaluator Prompting**: The AI is strictly instructed to assign zero scores if a user skips questions or provides blank audio, ensuring high evaluation integrity.

---

<div align="center">
  <i>Built with ❤️ to revolutionize technical hiring.</i>
</div>
