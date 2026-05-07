"""LLM layer for the Chameleon agent.

Two providers are selectable via `LLM_PROVIDER` env var:

  - "custom" : POSTs {"input": str, "systemPrompt": str} to one or more
               URLs from CUSTOM_LLM_ENDPOINTS (comma-separated). Each URL
               is retried up to CUSTOM_LLM_RETRIES_PER_ENDPOINT times
               with exponential backoff before failover to the next.
  - "gemini" : google-generativeai with JSON-mode response. Uses
               GEMINI_API_KEY + GEMINI_MODEL.

Both providers feed into the same DispatcherChat surface used elsewhere
(`turn`, `summarize`). Conversation history is owned by DispatcherChat and
rendered to a single text input so providers don't drift on memory.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from .config import settings
from .prompts import SUMMARY_PROMPT, SYSTEM_PROMPT
from .schemas import ExtractedDelta, ParsedTurn

log = logging.getLogger(__name__)

HTTP_TIMEOUT = httpx.Timeout(30.0, connect=10.0)

JSON_TAIL = (
    "\n\nOUTPUT POLICY: Return a SINGLE JSON object only. "
    "No prose, no markdown, no code fences. "
    "Schema is the one described above."
)


class LLMUnavailable(RuntimeError):
    """Raised when every configured provider/endpoint has been exhausted."""


class InvalidLLMResponse(RuntimeError):
    """Raised when the model output cannot be parsed into a ParsedTurn.

    Caller is expected to retry; if all retries fail, fall back to a
    graceful in-character recovery line via _recovery_parsed.
    """


# Per-language graceful recovery phrases, used only when the LLM has failed
# multiple times in a row. The TTS layer auto-detects script and picks a
# matching voice. These never expose JSON, raw output, or "(no response)"
# to the caller.
_RECOVERY_PHRASES = {
    "en": "Sorry, the line broke up there. Could you say that again?",
    "hi": "माफ़ कीजिए, कनेक्शन में थोड़ी रुकावट आई। क्या आप एक बार फिर कह सकते हैं?",
    "kn": "ಕ್ಷಮಿಸಿ, ಲೈನ್ ಒಂದು ಕ್ಷಣ ಕಟ್ ಆಯಿತು. ಇನ್ನೊಮ್ಮೆ ಹೇಳಬಲ್ಲಿರಾ?",
}


def _recovery_reply(language: str | None) -> str:
    code = language if language in _RECOVERY_PHRASES else "en"
    return _RECOVERY_PHRASES[code]


def _recovery_parsed(language: str | None) -> ParsedTurn:
    """Synthetic ParsedTurn used when every retry fails. stealth_mode is
    False here on purpose — main.py's resolve_stealth keeps the prior
    session.stealth_mode value once it's been engaged, so a momentary
    LLM failure won't drop us out of cover."""
    return ParsedTurn(
        stealth_mode=False,
        persona="dispatcher",
        extracted_delta=ExtractedDelta(),
        reply=_recovery_reply(language),
    )


# --------------------------------------------------------------------------
# Conversation history (shared across providers)

@dataclass
class _Turn:
    role: str  # "caller" | "you"
    text: str
    language: str | None = None  # ISO-639-1 ("en" | "hi" | "kn") or None


def _render(history: list[_Turn]) -> str:
    if not history:
        return (
            "There is no conversation yet. The caller has just connected. "
            "Produce your opening dispatcher turn as JSON."
        )
    lines = ["This is the ongoing emergency-line conversation:\n"]
    for t in history:
        if t.role == "caller":
            tag = f"[{t.language}]" if t.language else "[auto]"
            lines.append(f"Caller {tag}: {t.text}")
        else:
            lines.append(f"You (dispatcher): {t.text}")
    lines.append(
        "\nProduce your NEXT dispatcher turn now, as a single JSON object per "
        "the schema in the system prompt. Reply in the SAME language as the "
        "most recent caller turn (per LANGUAGE POLICY)."
    )
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Providers

class _Provider(Protocol):
    async def generate(self, input_text: str, system_prompt: str) -> str: ...


class CustomEndpointProvider:
    """Tries a list of URLs in order; each with retries + exp backoff."""

    def __init__(self, urls: list[str], retries: int) -> None:
        if not urls:
            raise RuntimeError(
                "CUSTOM_LLM_ENDPOINTS is empty. Set at least one URL in backend/.env."
            )
        self.urls = urls
        self.retries = max(1, retries)

    async def generate(self, input_text: str, system_prompt: str) -> str:
        payload = {"input": input_text, "systemPrompt": system_prompt}
        errors: list[str] = []
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            for url in self.urls:
                for attempt in range(self.retries):
                    try:
                        resp = await client.post(url, json=payload)
                        if resp.status_code >= 500:
                            raise httpx.HTTPStatusError(
                                f"{resp.status_code}",
                                request=resp.request,
                                response=resp,
                            )
                        resp.raise_for_status()
                        return resp.text
                    except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                        log.warning(
                            "custom llm %s attempt %d/%d failed: %s",
                            url, attempt + 1, self.retries, exc,
                        )
                        await asyncio.sleep(0.5 * (2**attempt))
                errors.append(f"{url}: exhausted {self.retries} retries")
        raise LLMUnavailable(
            f"all {len(self.urls)} endpoint(s) failed [{'; '.join(errors)}]"
        )


class GeminiProvider:
    """google-generativeai wrapper with JSON-mode response."""

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Required when LLM_PROVIDER=gemini."
            )
        # Lazy import so the dep is optional when only the custom path is used.
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        self._genai = genai
        self._model_name = model

    async def generate(self, input_text: str, system_prompt: str) -> str:
        model = self._genai.GenerativeModel(
            model_name=self._model_name,
            system_instruction=system_prompt,
        )
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                input_text,
                generation_config={
                    "temperature": 0.4,
                    "response_mime_type": "application/json",
                },
            )
        except Exception as exc:
            raise LLMUnavailable(f"gemini: {exc}") from exc
        return (response.text or "").strip()


def _build_provider() -> _Provider:
    if settings.llm_provider == "gemini":
        return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
    return CustomEndpointProvider(
        urls=settings.custom_llm_endpoint_list,
        retries=settings.custom_llm_retries_per_endpoint,
    )


# --------------------------------------------------------------------------
# DispatcherChat — public surface

@dataclass
class DispatcherChat:
    history: list[_Turn] = field(default_factory=list)
    provider: _Provider = field(default_factory=_build_provider)

    async def turn(self, user_text: str, language: str | None = None) -> ParsedTurn:
        self.history.append(_Turn(role="caller", text=user_text, language=language))
        rendered = _render(self.history)

        # Two failure modes to handle:
        #   1. provider raises LLMUnavailable (network / 5xx / all endpoints
        #      exhausted) — already retried inside the provider; nothing more
        #      we can do, fall back to the recovery line.
        #   2. provider returns 200 but body is truncated / empty / not JSON —
        #      retry the whole call up to MAX_PARSE_ATTEMPTS times before
        #      falling back. This is what fixes the truncated-JSON-in-
        #      transcript and the "(no response)" symptom.
        MAX_PARSE_ATTEMPTS = 3
        last_err: str | None = None

        for attempt in range(MAX_PARSE_ATTEMPTS):
            try:
                raw = await self.provider.generate(rendered, SYSTEM_PROMPT + JSON_TAIL)
            except LLMUnavailable as exc:
                log.error("LLM unavailable: %s", exc)
                parsed = _recovery_parsed(language)
                self.history.append(_Turn(role="you", text=parsed.reply))
                return parsed
            except Exception as exc:
                log.exception("LLM call failed")
                parsed = _recovery_parsed(language)
                self.history.append(_Turn(role="you", text=parsed.reply))
                return parsed

            try:
                parsed = _safe_parse(raw)
            except InvalidLLMResponse as exc:
                last_err = str(exc)
                log.warning(
                    "LLM returned unparseable output (attempt %d/%d): %s",
                    attempt + 1, MAX_PARSE_ATTEMPTS, exc,
                )
                continue  # ask the model again

            self.history.append(_Turn(role="you", text=parsed.reply))
            return parsed

        log.error(
            "LLM produced unparseable output after %d attempts: %s",
            MAX_PARSE_ATTEMPTS, last_err,
        )
        parsed = _recovery_parsed(language)
        self.history.append(_Turn(role="you", text=parsed.reply))
        return parsed

    async def summarize(self) -> str:
        rendered = _render(self.history) + "\n\nNow produce the handoff report."
        try:
            return (await self.provider.generate(rendered, SUMMARY_PROMPT)).strip()
        except Exception as exc:
            log.exception("LLM summary call failed")
            return f"(Could not generate summary: {exc})"


# --------------------------------------------------------------------------
# Parsing

def _safe_parse(raw: str) -> ParsedTurn:
    """Parse the model's text into a ParsedTurn. Raises InvalidLLMResponse
    on every failure mode (empty body, truncated JSON, missing fields) so
    the caller can retry instead of leaking raw model output to the user.
    """
    cleaned = (raw or "").strip()
    if not cleaned:
        raise InvalidLLMResponse("empty response body")

    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].rstrip()

    if not cleaned.startswith("{"):
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            cleaned = cleaned[start : end + 1]

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        # Most common shape: response was cut off mid-stream. We log the
        # prefix so we can spot upstream truncation in production.
        raise InvalidLLMResponse(f"non-JSON / truncated: {raw[:120]!r}") from exc

    if not isinstance(data, dict):
        raise InvalidLLMResponse(f"top-level not an object: {type(data).__name__}")

    try:
        parsed = ParsedTurn.model_validate(data)
    except Exception as exc:
        raise InvalidLLMResponse(f"schema mismatch: {data!r}") from exc

    if not parsed.reply or not parsed.reply.strip():
        raise InvalidLLMResponse("reply field is empty")

    return parsed
