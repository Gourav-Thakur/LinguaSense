"""FastAPI app + WebSocket dispatcher for the Chameleon Stealth Protocol."""
from __future__ import annotations

import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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

app = FastAPI(title="Chameleon Stealth Protocol")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True, "gemini_configured": bool(settings.gemini_api_key)}


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
                await _handle_user_message(websocket, session, str(msg.get("text", "")).strip())
            elif mtype == "request_summary":
                await _handle_summary(websocket, session)
            else:
                await _send(websocket, WSErrorMessage(message=f"unknown type: {mtype!r}"))
    except WebSocketDisconnect:
        log.info("session %s disconnected", session.session_id)


async def _handle_user_message(
    websocket: WebSocket, session: ConversationSession, text: str
) -> None:
    if not text:
        return

    session.append("user", text)
    await _send(websocket, WSTranscriptMessage(role="user", text=text))

    parsed = await session.chat.turn(text)

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
