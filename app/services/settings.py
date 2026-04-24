from __future__ import annotations

from app.core.config import get_runtime
from app.services.repository import repo


DEFAULT_TOGGLES = {
    "enable_cache": True,
    "auto_summary_enabled": True,
    "heartbeat_enabled": True,
    "emoji_enabled": False,
    "proactive_enabled": True,
}


class SettingsService:
    def _default_frontend_settings(self) -> dict:
        runtime = get_runtime()
        toggles = self.get_toggles()
        return {
            "app_title": runtime.yaml.ui.app_title,
            "subtitle": runtime.yaml.ui.subtitle,
            "display_name": runtime.yaml.assistant.display_name,
            "user_display_name": runtime.yaml.user_profile.display_name,
            "access_token": runtime.settings.access_token,
            "api_base_url": runtime.settings.llm_base_url,
            "api_key": runtime.settings.llm_api_key,
            "image_provider": "dalle",
            "image_api_key": "",
            "tts_voice": "",
            "tts_api_key": "",
            "tts_speed": 1.0,
            "tts_provider": "auto",
            "primary_model": runtime.settings.llm_primary_model,
            "summary_model": runtime.settings.llm_summary_model,
            "system_goal": runtime.yaml.assistant.system_goal,
            "persona_core": runtime.yaml.assistant.persona_core,
            "relationship_context": runtime.yaml.assistant.relationship_context,
            "user_summary": runtime.yaml.user_profile.summary,
            "primary_temperature": runtime.yaml.cost_control.primary_temperature,
            "primary_max_tokens": runtime.yaml.cost_control.primary_max_tokens,
            "summary_temperature": runtime.yaml.cost_control.summary_temperature,
            "summary_max_tokens": runtime.yaml.cost_control.summary_max_tokens,
            "enable_cache": toggles["enable_cache"],
            "auto_summary_enabled": toggles["auto_summary_enabled"],
            "heartbeat_enabled": toggles["heartbeat_enabled"],
            "emoji_enabled": toggles.get("emoji_enabled", False),
            "proactive_enabled": toggles.get("proactive_enabled", True),
            "proxy_url": "",
            "server_url": "",
            "vpn_subscription": "",
            "ollama_mode": False,
            "ollama_base_url": "http://localhost:11434",
            "ollama_local_model": "gemma4",
            "proactive_enabled": True,
            "user_birthday": "",
            "user_city": "",
            "user_lat": "",
            "user_lon": "",
            "news_api_key": "",
            "news_keywords": "",
            "news_enabled": False,
            "moments_enabled": False,
            "scene_enabled": False,
            # 外观：气泡颜色
            "user_bubble_color": "",
            "ai_bubble_color": "",
            "bubble_linked": False,
            # 外观：气泡模式（bubble=气泡 / flat=平铺）
            "user_bubble_mode": "bubble",
            "ai_bubble_mode": "bubble",
            # 外观：聊天背景
            "chat_bg": "default",
            "chat_bg_image": "",
        }

    def get_frontend_settings(self) -> dict:
        current = repo.get_setting("frontend_settings")
        if not isinstance(current, dict):
            current = self._default_frontend_settings()
            repo.set_setting("frontend_settings", current)
            return current
        merged = self._default_frontend_settings()
        merged.update(current)
        return merged

    def update_frontend_settings(self, payload: dict) -> dict:
        current = self.get_frontend_settings()
        protected = {
            "api_key", "image_api_key", "tts_api_key", "news_api_key",
            "vpn_subscription", "access_token",
            "chat_bg_image",
        }
        for key, val in payload.items():
            if key in protected and (val is None or str(val).strip() == ""):
                continue
            current[key] = val

        toggles = {
            "enable_cache": bool(current.get("enable_cache", True)),
            "auto_summary_enabled": bool(current.get("auto_summary_enabled", True)),
            "heartbeat_enabled": bool(current.get("heartbeat_enabled", True)),
            "emoji_enabled": bool(current.get("emoji_enabled", False)),
            "proactive_enabled": bool(current.get("proactive_enabled", True)),
        }
        repo.set_setting("runtime_toggles", toggles)
        repo.set_setting("frontend_settings", current)
        return current

    def get_toggles(self) -> dict:
        current = repo.get_setting("runtime_toggles")
        if not isinstance(current, dict):
            repo.set_setting("runtime_toggles", DEFAULT_TOGGLES)
            return DEFAULT_TOGGLES.copy()
        merged = DEFAULT_TOGGLES.copy()
        merged.update(current)
        return merged

    def update_toggles(self, patch: dict) -> dict:
        current = self.get_toggles()
        for key, value in patch.items():
            if value is not None and key in current:
                current[key] = bool(value)
        repo.set_setting("runtime_toggles", current)

        frontend = self.get_frontend_settings()
        frontend["enable_cache"] = current["enable_cache"]
        frontend["auto_summary_enabled"] = current["auto_summary_enabled"]
        frontend["heartbeat_enabled"] = current["heartbeat_enabled"]
        frontend["emoji_enabled"] = current.get("emoji_enabled", False)
        frontend["proactive_enabled"] = current.get("proactive_enabled", True)
        repo.set_setting("frontend_settings", frontend)

        return current

    def get_effective_settings(self) -> dict:
        data = self.get_frontend_settings()
        return {
            "app_title": data["app_title"],
            "subtitle": data["subtitle"],
            "display_name": data["display_name"],
            "user_display_name": data["user_display_name"],
            "public_base_url": get_runtime().settings.public_base_url,
            "heartbeat_enabled": bool(data["heartbeat_enabled"]),
            "show_memory_panel": True,
            "show_cost_panel": True,
        }

    def get_public_runtime(self) -> dict:
        return self.get_effective_settings()


settings_service = SettingsService()
