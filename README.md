# Chameleon Stealth Protocol

Local prototype for a voice-based emergency helpline agent that disguises itself
as a benign service (pizza shop, plumber, taxi, etc.) when the caller uses
coded distress signals. While in cover, the agent asks only binary questions
to silently extract Location, Threat Level, and Weapons Presence — and streams
the live transcript + extracted state to a human-operator dashboard.

## Stack

- **Backend:** FastAPI + WebSocket, dual-provider LLM (custom HTTP endpoints
  with failover, or Gemini), `faster-whisper` for multilingual STT,
  `pipecat-ai` pipeline scaffold for future Sarvam/Bhashini integration.
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS.
  Browser-side audio capture (MediaRecorder + energy VAD) and natural female
  TTS via SpeechSynthesis.

## Voice mode

Caller speech is captured in the browser, segmented by an energy-based VAD,
and POSTed to `/api/transcribe` where Whisper runs locally. The chosen
language ("Auto-detect", English, Hindi, or Kannada) is forwarded to
Whisper. Agent replies are spoken back via the browser's TTS, which auto-
selects the best installed female voice (Ava / Allison / Samantha on
macOS, Aria / Jenny / Zira on Windows).

The Whisper model (default `small`, ~480 MB) is downloaded once on the
first backend start and cached at `~/.cache/huggingface/hub/`. Subsequent
starts reuse the cache. To upgrade for better Kannada accuracy:
```
WHISPER_MODEL=medium  # ~1.5 GB, in backend/.env
```

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

# Whisper STT (downloaded once on first run)
WHISPER_MODEL=small          # tiny | base | small | medium | large-v3
WHISPER_DEVICE=cpu           # cpu | cuda | auto
WHISPER_COMPUTE_TYPE=int8    # int8 | int8_float16 | float16 | float32
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
