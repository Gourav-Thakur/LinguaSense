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

    # Sarvam STT (Saarika). Cloud API — set SARVAM_API_KEY in backend/.env.
    # Models: "saarika:v1" (legacy), "saarika:v2" (stable), "saarika:v2.5"
    # (newest; stronger on code-mixed Indian languages), "saarika:flash"
    # (fastest; lower accuracy).
    sarvam_stt_model: str = "saarika:v2.5"

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
