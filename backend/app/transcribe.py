"""Sarvam Saarika STT wrapper.

The /api/transcribe endpoint forwards each utterance blob captured in the
browser to Sarvam's hosted ASR. Sarvam's Indian-language models (Saarika
v2 / v2.5) handle Hindi and Kannada natively and return BCP-47 language
codes which we constrain to en-IN / hi-IN / kn-IN — anything outside that
set is normalized to English so the rest of the pipeline stays in scope.
"""
from __future__ import annotations

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)

SARVAM_URL = "https://api.sarvam.ai/speech-to-text"
HTTP_TIMEOUT = httpx.Timeout(30.0, connect=10.0)

# The dispatcher only handles these three languages end-to-end (the LLM
# replies in them, the TTS layer has voices for them). Sarvam supports
# more, but we normalize everything else away.
ALLOWED_LANGUAGES = ("en", "hi", "kn")
DEFAULT_LANGUAGE = "en"

# Map our short codes to Sarvam's BCP-47 codes (and back).
_TO_SARVAM = {
    "auto": "unknown",
    "en": "en-IN",
    "hi": "hi-IN",
    "kn": "kn-IN",
}


def _from_sarvam(code: str | None) -> str:
    """Sarvam returns 'en-IN' style codes; normalize to bare ISO-639-1."""
    if not code:
        return DEFAULT_LANGUAGE
    short = code.split("-", 1)[0].lower()
    return short if short in ALLOWED_LANGUAGES else DEFAULT_LANGUAGE


class _SarvamState:
    """Tiny health surface so the frontend can disable the mic until ready.

    Sarvam is API-based so 'ready' just means we have a key. There's no
    model to download.
    """

    def __init__(self) -> None:
        self.ready = bool(settings.sarvam_api_key)
        self.loading = False
        self.error: str | None = None if self.ready else "SARVAM_API_KEY not set"


state = _SarvamState()


async def transcribe(audio_bytes: bytes, language_code: str | None) -> tuple[str, str]:
    """POST audio to Sarvam Saarika and return (text, detected_language)."""
    if not state.ready:
        raise RuntimeError(
            state.error or "Sarvam not configured (set SARVAM_API_KEY in backend/.env)"
        )

    sarvam_lang = _TO_SARVAM.get(language_code or "auto", "unknown")

    files = {"file": ("utterance.webm", audio_bytes, "audio/webm")}
    data = {
        "model": settings.sarvam_stt_model,
        "language_code": sarvam_lang,
    }
    headers = {"api-subscription-key": settings.sarvam_api_key}

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.post(SARVAM_URL, files=files, data=data, headers=headers)

    if resp.status_code >= 400:
        # Surface Sarvam's body verbatim so we can debug API contract drift.
        detail = resp.text[:300]
        log.warning("Sarvam STT %s: %s", resp.status_code, detail)
        raise RuntimeError(f"Sarvam STT {resp.status_code}: {detail}")

    payload = resp.json()
    # Saarika v2 returns: {"transcript": "...", "language_code": "hi-IN", ...}
    # Older variants used "text" — accept both for safety.
    text = (payload.get("transcript") or payload.get("text") or "").strip()
    detected = _from_sarvam(payload.get("language_code"))
    log.info("Sarvam STT -> lang=%s, len=%d", detected, len(text))
    return text, detected
