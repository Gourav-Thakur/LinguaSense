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


# --------------------------------------------------------------------------
# Conversation history (shared across providers)

@dataclass
class _Turn:
    role: str  # "caller" | "you"
    text: str


def _render(history: list[_Turn]) -> str:
    if not history:
        return (
            "There is no conversation yet. The caller has just connected. "
            "Produce your opening dispatcher turn as JSON."
        )
    lines = ["This is the ongoing emergency-line conversation:\n"]
    for t in history:
        speaker = "Caller" if t.role == "caller" else "You (dispatcher)"
        lines.append(f"{speaker}: {t.text}")
    lines.append(
        "\nProduce your NEXT dispatcher turn now, as a single JSON object per "
        "the schema in the system prompt."
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

    async def turn(self, user_text: str) -> ParsedTurn:
        self.history.append(_Turn(role="caller", text=user_text))
        rendered = _render(self.history)
        try:
            raw = await self.provider.generate(rendered, SYSTEM_PROMPT + JSON_TAIL)
        except LLMUnavailable as exc:
            log.error("LLM unavailable: %s", exc)
            return ParsedTurn(
                stealth_mode=False,
                persona="dispatcher",
                extracted_delta=ExtractedDelta(),
                reply=f"(System error contacting model: {exc})",
            )
        except Exception as exc:
            log.exception("LLM call failed")
            return ParsedTurn(
                stealth_mode=False,
                persona="dispatcher",
                extracted_delta=ExtractedDelta(),
                reply=f"(System error contacting model: {exc})",
            )

        parsed = _safe_parse(raw)
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
    """Tolerate small model deviations: stray code fences, trailing prose."""
    cleaned = (raw or "").strip()

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
    except json.JSONDecodeError:
        log.warning("Non-JSON response from LLM: %r", raw[:200])
        return ParsedTurn(
            stealth_mode=False,
            persona="dispatcher",
            extracted_delta=ExtractedDelta(),
            reply=raw or "(no response)",
        )

    try:
        return ParsedTurn.model_validate(data)
    except Exception:
        log.warning("Malformed ParsedTurn from LLM: %r", data)
        return ParsedTurn(
            stealth_mode=bool(data.get("stealth_mode", False)),
            persona=str(data.get("persona", "dispatcher")),
            extracted_delta=ExtractedDelta(),
            reply=str(data.get("reply", "(malformed model response)")),
        )
