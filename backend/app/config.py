from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM provider selection
    llm_provider: Literal["custom", "gemini"] = "custom"

    # Custom HTTP endpoint(s) — comma-separated, tried in order with retries
    custom_llm_endpoints: str = "https://temp.aistoryteller.workers.dev/gpt"
    custom_llm_retries_per_endpoint: int = 2

    # Gemini provider
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # Whisper STT (faster-whisper). The model is downloaded once on first
    # backend start and cached at ~/.cache/huggingface/hub/.
    # Sizes: tiny~75MB, base~140MB, small~480MB, medium~1.5GB, large-v3~3GB.
    whisper_model: str = "small"
    whisper_device: str = "cpu"          # "cpu" | "cuda" | "auto"
    whisper_compute_type: str = "int8"   # "int8" | "int8_float16" | "float16" | "float32"

    # Future STT/TTS keys (unused for now)
    sarvam_api_key: str = ""
    bhashini_user_id: str = ""
    bhashini_api_key: str = ""
    bhashini_pipeline_id: str = ""

    frontend_origin: str = "http://localhost:3000"

    @property
    def custom_llm_endpoint_list(self) -> list[str]:
        return [u.strip() for u in self.custom_llm_endpoints.split(",") if u.strip()]


settings = Settings()
