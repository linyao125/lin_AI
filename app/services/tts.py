"""
语音合成服务
- 官方 OpenAI → OpenAI TTS
- 其他（OpenRouter等）→ Fish Audio
"""
from __future__ import annotations
import logging
import httpx

logger = logging.getLogger(__name__)

OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
FISH_AUDIO_URL = "https://api.fish.audio/v1/tts"


def _is_official_openai(api_base: str) -> bool:
    return "api.openai.com" in (api_base or "")


class TTSService:

    def synthesize(
        self,
        text: str,
        api_key: str,
        api_base: str = "",
        voice: str = "",
        tts_api_key: str = "",          # Fish Audio 单独key，留空则复用api_key
        speed: float = 1.0,
    ) -> bytes | None:
        """
        返回 mp3 bytes，失败返回 None
        """
        if not text or not text.strip():
            return None

        try:
            if _is_official_openai(api_base):
                return self._openai_tts(text, api_key, api_base, voice, speed)
            else:
                fish_key = tts_api_key or api_key
                return self._fish_audio_tts(text, fish_key, voice, speed)
        except Exception as e:
            logger.error(f"[tts] 合成失败: {e}")
            return None

    def _openai_tts(
        self,
        text: str,
        api_key: str,
        api_base: str,
        voice: str,
        speed: float,
    ) -> bytes:
        v = voice if voice in OPENAI_VOICES else "nova"
        resp = httpx.post(
            f"{api_base.rstrip('/')}/v1/audio/speech",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "tts-1",
                "input": text,
                "voice": v,
                "speed": max(0.25, min(4.0, speed)),
                "response_format": "mp3",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.content

    def _fish_audio_tts(
        self,
        text: str,
        api_key: str,
        voice: str,
        speed: float,
    ) -> bytes:
        # Fish Audio 默认中文女声 reference_id
        # 用户可在设置里填自己的voice id
        reference_id = voice or "54a5170264694bfc8e9ad98df7bd89c3"  # 默认：温柔中文女声
        resp = httpx.post(
            FISH_AUDIO_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "reference_id": reference_id,
                "format": "mp3",
                "latency": "normal",
                "normalize": True,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.content


tts_service = TTSService()
