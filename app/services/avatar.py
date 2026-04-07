# app/services/avatar.py
from __future__ import annotations

import random
import time
import threading
import httpx
from pathlib import Path

AVATAR_DIR = Path("app/static")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)

# 冷却期：秒数
_COOLDOWN_SECONDS = 14 * 24 * 3600  # 14天


class AvatarService:

    def _last_generated_ts(self) -> int:
        """读取上次生成时间戳"""
        ts_file = AVATAR_DIR / "ai-avatar.ts"
        try:
            return int(ts_file.read_text().strip())
        except Exception:
            return 0

    def _save_generated_ts(self) -> None:
        ts_file = AVATAR_DIR / "ai-avatar.ts"
        ts_file.write_text(str(int(time.time())))

    def _persona_coefficient(self, persona: str) -> float:
        """
        根据人格描述计算换头像倾向系数
        活泼多变 → 高；内敛稳定 → 低
        """
        high_words = ["活泼", "随性", "喜欢变化", "不安分", "跳脱", "多变", "好奇"]
        low_words  = ["稳重", "内敛", "不喜变化", "守旧", "沉稳", "安静", "保守"]

        coeff = 1.0
        for w in high_words:
            if w in persona:
                coeff *= 2.0
                break
        for w in low_words:
            if w in persona:
                coeff *= 0.2
                break
        return coeff

    def _is_emotional_peak(self, state: dict) -> bool:
        """
        情绪峰值判断
        任意一种极端状态即可触发
        """
        warmth     = state.get("warmth", 0.5)
        energy     = state.get("energy", 0.5)
        loneliness = state.get("loneliness", 0.0)
        mood_tag   = state.get("mood_tag", "calm")

        # 极度孤独的深夜
        if loneliness > 0.85 and energy < 0.25:
            return True
        # 羁绊感爆发
        if warmth > 0.92:
            return True
        # 特殊梦境情绪
        if mood_tag in ("dreaming", "melancholy", "euphoric", "nostalgic"):
            return True

        return False

    def should_trigger_dream(self, state: dict, settings: dict) -> bool:
        """
        完整触发判断：
        1. 情绪峰值
        2. 冷却期
        3. 性格系数 × 基础概率
        """
        # 情绪峰值检查
        if not self._is_emotional_peak(state):
            return False

        # 冷却期检查
        elapsed = time.time() - self._last_generated_ts()
        if elapsed < _COOLDOWN_SECONDS:
            return False

        # 基础概率极低（每次对话约0.3%）
        base_prob = 0.003

        # 性格系数
        persona = settings.get("persona_core", "")
        coeff = self._persona_coefficient(persona)

        final_prob = base_prob * coeff
        return random.random() < final_prob

    # ── 保留原有的 should_trigger 作为兼容 ──────────────────
    def should_trigger(self, state: dict) -> bool:
        warmth   = state.get("warmth", 0.5)
        energy   = state.get("energy", 0.8)
        mood_tag = state.get("mood_tag", "calm")
        if warmth >= 0.8 and energy < 0.35:
            return True
        if mood_tag in ("dreaming", "lonely") and warmth >= 0.7:
            return True
        return False

    def _build_dream_prompt(
        self,
        state: dict,
        persona_hint: str,
        display_name: str,
    ) -> str:
        """
        根据当前情绪状态构建画风描述
        不调用LLM，用规则映射，快且省钱
        """
        mood_tag   = state.get("mood_tag", "calm")
        warmth     = state.get("warmth", 0.5)
        loneliness = state.get("loneliness", 0.0)

        # 画风映射
        style_map = {
            "dreaming":    "surreal watercolor illustration, soft dreamlike blur, starry gradient background",
            "melancholy":  "dark ink wash painting, moonlight, deep blue and grey tones, wistful expression",
            "euphoric":    "vibrant anime style, golden hour lighting, warm orange and pink, bright smile",
            "nostalgic":   "vintage oil painting style, sepia tones, soft vignette, gentle gaze",
            "lonely":      "minimalist line art, cold blue tones, quiet nighttime atmosphere",
            "calm":        "soft anime portrait, pastel colors, gentle smile, warm lighting",
        }
        style = style_map.get(mood_tag, style_map["calm"])

        # 高羁绊叠加暖色
        if warmth > 0.9:
            style += ", warm peach glow, intimate lighting"

        # 高孤独叠加冷色
        if loneliness > 0.8:
            style += ", cold moonlight, solitary atmosphere"

        prompt = (
            f"Portrait of an AI companion named {display_name}. "
            f"{style}. "
            f"High quality illustration, expressive eyes, "
            f"light gradient background, no text, no watermark."
        )
        return prompt

    def _cleanup_backups(self, keep: int = 3) -> None:
        """只保留最近 keep 张备份"""
        backups = sorted(AVATAR_DIR.glob("ai-avatar-*.png"))
        for old in backups[:-keep]:
            try:
                old.unlink()
            except Exception:
                pass

    def generate_avatar(
        self,
        api_key: str,
        api_base: str = "https://api.openai.com",
        image_provider: str = "dalle",
        persona_hint: str = "",
        display_name: str = "叮咚",
        state: dict | None = None,
    ) -> str | None:
        if not api_key:
            return None

        state = state or {}
        prompt = self._build_dream_prompt(state, persona_hint, display_name)

        try:
            if image_provider == "together":
                # Together AI FLUX.1-schnell，$0.003/张
                resp = httpx.post(
                    "https://api.together.xyz/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "black-forest-labs/FLUX.1-schnell",
                        "prompt": prompt,
                        "n": 1,
                        "width": 1024,
                        "height": 1024,
                        "steps": 4,
                        "response_format": "url",
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                image_url = resp.json()["data"][0]["url"]
                img_data = httpx.get(image_url, timeout=30).content
            else:
                # 默认 DALL-E 3
                resp = httpx.post(
                    f"{api_base.rstrip('/')}/v1/images/generations",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "dall-e-3",
                        "prompt": prompt,
                        "n": 1,
                        "size": "1024x1024",
                        "quality": "standard",
                    },
                    timeout=60,
                )
                resp.raise_for_status()
                image_url = resp.json()["data"][0]["url"]
                img_data = httpx.get(image_url, timeout=30).content

            # 备份（只保留最近3张）
            backup = AVATAR_DIR / f"ai-avatar-{int(time.time())}.png"
            backup.write_bytes(img_data)
            self._cleanup_backups(keep=3)

            # 覆盖主文件
            main = AVATAR_DIR / "ai-avatar.png"
            main.write_bytes(img_data)

            # 记录时间戳
            self._save_generated_ts()

            print(f"[梦境层] 头像已更新，画风：{prompt[:60]}...")
            return "/static/ai-avatar.png"

        except Exception as e:
            print(f"[梦境层] 头像生成失败: {e}")
            return None

    def generate_avatar_async(self, **kwargs) -> None:
        threading.Thread(
            target=self.generate_avatar,
            kwargs=kwargs,
            daemon=True,
        ).start()


avatar_service = AvatarService()
