"""FastAPI app + WebSocket dispatcher for the Chameleon Stealth Protocol."""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import transcribe
from .config import settings
from .schemas import (
    WSAlertMessage,
    WSErrorMessage,
    WSStateMessage,
    WSSummaryMessage,
    WSTranscriptMessage,
)
from .session import ConversationSession
from .stealth import merge_extracted, resolve_stealth

log = logging.getLogger("chameleon")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Whisper model is heavy: load it on startup so the first transcribe
    # request doesn't time out. Run in a thread so the event loop isn't
    # blocked while the (one-time) model download happens.
    asyncio.create_task(asyncio.to_thread(transcribe.state.load))
    yield


app = FastAPI(title="Chameleon Stealth Protocol", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {
        "ok": True,
        "gemini_configured": bool(settings.gemini_api_key),
        "stt_ready": transcribe.state.ready,
        "stt_loading": transcribe.state.loading,
        "stt_error": transcribe.state.error,
        "stt_model": settings.whisper_model,
    }


@app.post("/api/transcribe")
async def transcribe_endpoint(
    audio: UploadFile = File(...),
    language: str = Form("auto"),
) -> dict[str, str]:
    """Accept a single utterance audio blob, return the recognized text.

    The frontend records a webm/opus blob via MediaRecorder (Safari sends
    mp4/aac). faster-whisper feeds the bytes through PyAV which handles
    both formats transparently.
    """
    if not transcribe.state.ready:
        raise HTTPException(
            status_code=503,
            detail=(
                "STT model is still loading. Try again in a moment."
                if transcribe.state.loading
                else (transcribe.state.error or "STT not initialized")
            ),
        )
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio payload")
    try:
        text, detected = await transcribe.transcribe(audio_bytes, language)
    except Exception as exc:
        log.exception("transcribe failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"text": text, "language": detected}


GREETING = (
    "1092 helpline, dispatcher speaking. What is your emergency, and where are you?"
)


@app.websocket("/ws/dispatch")
async def ws_dispatch(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        session = ConversationSession()
    except RuntimeError as exc:
        await _send(websocket, WSErrorMessage(message=str(exc)))
        await websocket.close()
        return

    log.info("session %s connected", session.session_id)

    # Initial snapshot + assistant greeting
    session.append("assistant", GREETING)
    await _send(websocket, _state_message(session))
    await _send(websocket, WSTranscriptMessage(role="assistant", text=GREETING))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, WSErrorMessage(message="invalid JSON"))
                continue

            mtype = msg.get("type")
            if mtype == "user_message":
                lang = msg.get("language")
                if lang and lang not in {"en", "hi", "kn"}:
                    lang = None
                await _handle_user_message(
                    websocket,
                    session,
                    str(msg.get("text", "")).strip(),
                    lang,
                )
            elif mtype == "request_summary":
                await _handle_summary(websocket, session)
            else:
                await _send(websocket, WSErrorMessage(message=f"unknown type: {mtype!r}"))
    except WebSocketDisconnect:
        log.info("session %s disconnected", session.session_id)


async def _handle_user_message(
    websocket: WebSocket,
    session: ConversationSession,
    text: str,
    language: str | None = None,
) -> None:
    if not text:
        return

    session.append("user", text)
    await _send(websocket, WSTranscriptMessage(role="user", text=text))

    parsed = await session.chat.turn(text, language=language)

    new_stealth = resolve_stealth(parsed, text, session.stealth_mode)
    just_engaged = new_stealth and not session.stealth_mode
    session.stealth_mode = new_stealth
    if new_stealth and parsed.persona and parsed.persona != "dispatcher":
        session.persona = parsed.persona
    elif not new_stealth:
        session.persona = "dispatcher"

    session.extracted = merge_extracted(session.extracted, parsed.extracted_delta)
    session.append("assistant", parsed.reply)

    await _send(websocket, WSTranscriptMessage(role="assistant", text=parsed.reply))
    await _send(websocket, _state_message(session))

    if just_engaged:
        await _send(
            websocket,
            WSAlertMessage(
                message=f"STEALTH PROTOCOL ENGAGED — Cover persona: {session.persona}",
            ),
        )


async def _handle_summary(websocket: WebSocket, session: ConversationSession) -> None:
    summary = await session.chat.summarize()
    await _send(websocket, WSSummaryMessage(text=summary))


def _state_message(session: ConversationSession) -> WSStateMessage:
    return WSStateMessage(
        session_id=session.session_id,
        stealth_mode=session.stealth_mode,
        persona=session.persona,
        extracted=session.extracted,
    )


async def _send(websocket: WebSocket, payload) -> None:
    await websocket.send_text(payload.model_dump_json())
