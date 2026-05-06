from typing import Literal

from pydantic import BaseModel, Field

ThreatLevel = Literal["low", "medium", "high", "unknown"]
TriState = Literal["yes", "no", "unknown"]


class ExtractedFacts(BaseModel):
    location: str | None = None
    threat_level: ThreatLevel = "unknown"
    weapons_present: TriState = "unknown"
    persons_present: str | None = None
    notes: list[str] = Field(default_factory=list)


class ExtractedDelta(BaseModel):
    """Partial update produced by the LLM each turn. Any None / 'unknown' value
    is treated as 'no new info' and ignored by the merger."""

    location: str | None = None
    threat_level: ThreatLevel | None = None
    weapons_present: TriState | None = None
    persons_present: str | None = None
    note: str | None = None


class ParsedTurn(BaseModel):
    """Structured output the LLM is required to return each turn."""

    stealth_mode: bool = False
    persona: str = "dispatcher"
    extracted_delta: ExtractedDelta = Field(default_factory=ExtractedDelta)
    reply: str


class TranscriptLine(BaseModel):
    role: Literal["user", "assistant", "system"]
    text: str


# ---- WebSocket message envelopes ----------------------------------------

class WSStateMessage(BaseModel):
    type: Literal["state"] = "state"
    session_id: str
    stealth_mode: bool
    persona: str
    extracted: ExtractedFacts


class WSTranscriptMessage(BaseModel):
    type: Literal["transcript"] = "transcript"
    role: Literal["user", "assistant", "system"]
    text: str


class WSAlertMessage(BaseModel):
    type: Literal["alert"] = "alert"
    message: str


class WSSummaryMessage(BaseModel):
    type: Literal["summary"] = "summary"
    text: str


class WSErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    message: str


# ---- Inbound (client -> server) -----------------------------------------

class WSUserMessageIn(BaseModel):
    type: Literal["user_message"]
    text: str


class WSRequestSummaryIn(BaseModel):
    type: Literal["request_summary"]
