"""Whisper STT wrapper using faster-whisper.

The model is loaded once at process startup (see app.main lifespan) and
cached on disk by the underlying `huggingface_hub` library. Subsequent
restarts reuse the cache so the multi-hundred-megabyte download only
happens the very first time.
"""
from __future__ import annotations

import asyncio
import io
import logging
import threading

from .config import settings

log = logging.getLogger(__name__)

# Whisper language codes we expose to the frontend dropdown.
SUPPORTED_LANGUAGES = {
    "auto": None,  # let Whisper detect
    "en": "en",
    "hi": "hi",
    "kn": "kn",
}


class _WhisperState:
    """Holds the singleton model and a ready flag the API can probe."""

    def __init__(self) -> None:
        self.model = None
        self.ready = False
        self.loading = False
        self.error: str | None = None
        self._lock = threading.Lock()

    def load(self) -> None:
        with self._lock:
            if self.ready or self.loading:
                return
            self.loading = True
        try:
            from faster_whisper import WhisperModel  # heavy import; lazy

            log.info(
                "loading Whisper model %r (device=%s compute_type=%s) "
                "— first run downloads ~%s",
                settings.whisper_model,
                settings.whisper_device,
                settings.whisper_compute_type,
                _approximate_size(settings.whisper_model),
            )
            self.model = WhisperModel(
                settings.whisper_model,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
            self.ready = True
            log.info("Whisper model ready")
        except Exception as exc:
            log.exception("failed to load Whisper model")
            self.error = str(exc)
        finally:
            self.loading = False


state = _WhisperState()


def _approximate_size(model_name: str) -> str:
    return {
        "tiny": "75 MB",
        "tiny.en": "75 MB",
        "base": "140 MB",
        "base.en": "140 MB",
        "small": "480 MB",
        "small.en": "480 MB",
        "medium": "1.5 GB",
        "medium.en": "1.5 GB",
        "large-v2": "3 GB",
        "large-v3": "3 GB",
    }.get(model_name, "(size depends on model)")


def _transcribe_sync(audio_bytes: bytes, language: str | None) -> tuple[str, str]:
    """Run Whisper inference and return (text, detected_language).

    `vad_filter=True` strips long silences before the segments are decoded,
    which is critical for browser-recorded audio that may contain trailing
    silence captured by the energy-based VAD on the client side.
    """
    if not state.ready or state.model is None:
        raise RuntimeError("Whisper model is not ready yet")

    segments, info = state.model.transcribe(
        io.BytesIO(audio_bytes),
        language=language,                # None => auto-detect
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
        beam_size=1,                       # snappier on CPU; still good for short utterances
        condition_on_previous_text=False,  # avoid prompt-leakage between utterances
    )
    text_parts = [seg.text for seg in segments]
    text = " ".join(p.strip() for p in text_parts if p.strip())
    return text, info.language


async def transcribe(audio_bytes: bytes, language_code: str | None) -> tuple[str, str]:
    """Async wrapper around _transcribe_sync that runs in a worker thread."""
    lang = SUPPORTED_LANGUAGES.get(language_code or "auto", None)
    return await asyncio.to_thread(_transcribe_sync, audio_bytes, lang)
