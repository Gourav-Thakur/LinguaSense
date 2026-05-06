"""Pipecat pipeline scaffold for the audio path.

NOTE: This module is NOT wired into the WebSocket dispatcher. It is here so
that the audio pipeline (STT -> LLM -> TTS) is laid out and ready to swap in
real Sarvam AI / Bhashini services once API keys are available.

The text-only WebSocket path in `app.main` is the working prototype.

To enable audio later:
    1. Replace StubSTTService with a SarvamSTTService (or BhashiniSTTService)
       that pushes pipecat TextFrames as transcripts arrive.
    2. Replace StubTTSService with the equivalent TTS service.
    3. Run this module directly:  python -m app.pipeline
"""
from __future__ import annotations

import asyncio
import logging

from pipecat.frames.frames import EndFrame, Frame, TextFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from .llm import DispatcherChat

log = logging.getLogger(__name__)


class StubSTTService(FrameProcessor):
    """Placeholder STT. TODO: replace with Sarvam AI / Bhashini STT.

    A real implementation should accept InputAudioRawFrame frames and emit
    TextFrame(text=transcript) for each finalized utterance.
    """

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        # Pass-through. A real STT would convert audio -> TextFrame here.
        await self.push_frame(frame, direction)


class StubTTSService(FrameProcessor):
    """Placeholder TTS. TODO: replace with Sarvam AI / Bhashini TTS.

    A real implementation should consume TextFrame and emit audio frames.
    """

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        if isinstance(frame, TextFrame):
            log.info("[TTS stub] would speak: %s", frame.text)
        await self.push_frame(frame, direction)


class GeminiLLMService(FrameProcessor):
    """Bridge that funnels TextFrames into the Chameleon DispatcherChat."""

    def __init__(self) -> None:
        super().__init__()
        self._chat = DispatcherChat()

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        if isinstance(frame, TextFrame) and direction == FrameDirection.DOWNSTREAM:
            parsed = await self._chat.turn(frame.text)
            await self.push_frame(TextFrame(text=parsed.reply), direction)
            return
        await self.push_frame(frame, direction)


def build_pipeline() -> Pipeline:
    """STT -> Gemini -> TTS. Stubs in place; swap them out for real services."""
    return Pipeline([StubSTTService(), GeminiLLMService(), StubTTSService()])


async def _demo() -> None:
    """Runnable smoke test: pipes a single text frame through the pipeline."""
    pipeline = build_pipeline()
    task = PipelineTask(pipeline)
    runner = PipelineRunner()

    async def _drive() -> None:
        await task.queue_frames(
            [
                TextFrame(text="Hi, I'd like to order a large pepperoni pizza."),
                EndFrame(),
            ]
        )

    await asyncio.gather(runner.run(task), _drive())


if __name__ == "__main__":
    asyncio.run(_demo())
