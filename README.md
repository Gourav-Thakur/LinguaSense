# Chameleon Stealth Protocol

Local prototype for a voice-based emergency helpline agent that disguises itself
as a benign service (pizza shop, plumber, taxi, etc.) when the caller uses
coded distress signals. While in cover, the agent asks only binary questions
to silently extract Location, Threat Level, and Weapons Presence — and streams
the live transcript + extracted state to a human-operator dashboard.

## Stack

- **Backend:** FastAPI + WebSocket, `google-generativeai` (Gemini 1.5 Flash),
  `pipecat-ai` pipeline scaffold for future audio (Sarvam AI / Bhashini).
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS.

## Setup

Create `backend/.env` with the following variables:

```
# LLM provider: "custom" (HTTP endpoints, no auth) or "gemini"
LLM_PROVIDER=custom

# Custom LLM endpoint(s). Comma-separated; tried in order with retries.
# Each endpoint must accept POST {"input": str, "systemPrompt": str}
# and return the model reply as plain text.
CUSTOM_LLM_ENDPOINTS=https://your-endpoint/gpt
# Failover example:
# CUSTOM_LLM_ENDPOINTS=https://a/gpt,https://b/gpt,https://c/gpt
CUSTOM_LLM_RETRIES_PER_ENDPOINT=2

# Required only if LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# CORS origin for the dashboard
FRONTEND_ORIGIN=http://localhost:3000
```

Copy `frontend/.env.local.example` to `frontend/.env.local` (defaults work).

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Run

In two separate terminals:

```bash
# terminal 1 — API + WebSocket on :8000
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
# terminal 2 — dashboard on :3000
cd frontend
npm run dev
```

Open http://localhost:3000.

## Demo

1. Banner is neutral; transcript shows the dispatcher greeting.
2. In the **DEV: simulate caller speech** box at the bottom, send:
   `"Hi, I'd like to order a large pepperoni pizza for delivery."`
3. The banner flips bright red and flashes
   *"STEALTH PROTOCOL ENGAGED — CODED LANGUAGE DETECTED"*. The agent
   replies in pizza-shop tone with a yes/no question.
4. Answer the binary questions; the **Extraction** card on the right
   populates Location / Threat Level / Weapons.
5. Click **Approve & Take Over** to generate a final situation summary.

Control test: send `"I'm reporting a fire at 12 MG Road"` first instead — the
banner stays neutral and the agent acts as a normal 1092 dispatcher.

## What's stubbed

- **STT/TTS** — `backend/app/pipeline.py` defines `StubSTTService` and
  `StubTTSService` so the Pipecat pipeline is wired but not capturing audio.
  Drop in Sarvam AI or Bhashini in those classes when keys are ready.
- **Caller audio** — the dashboard's text "Caller Simulator" stands in for
  microphone capture during local development.
