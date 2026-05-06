from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from .llm import DispatcherChat
from .schemas import ExtractedFacts, TranscriptLine


@dataclass
class ConversationSession:
    """Per-WebSocket state. Owns the Gemini chat + the running extraction."""

    session_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    stealth_mode: bool = False
    persona: str = "dispatcher"
    extracted: ExtractedFacts = field(default_factory=ExtractedFacts)
    history: list[TranscriptLine] = field(default_factory=list)
    chat: DispatcherChat = field(default_factory=DispatcherChat)

    def append(self, role: str, text: str) -> None:
        self.history.append(TranscriptLine(role=role, text=text))  # type: ignore[arg-type]
