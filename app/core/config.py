from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT_DIR / "config" / "config.yaml"


class EnvSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    access_token: str = Field(default="change_me", alias="ACCESS_TOKEN")
    llm_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="LLM_BASE_URL")
    llm_api_key: str = Field(default="", alias="LLM_API_KEY")
    llm_primary_model: str = Field(default="openai/gpt-4o", alias="LLM_PRIMARY_MODEL")
    llm_summary_model: str = Field(default="openai/gpt-4o-mini", alias="LLM_SUMMARY_MODEL")
    or_site_url: str = Field(default="http://localhost:8000", alias="OR_SITE_URL")
    or_app_name: str = Field(default="Lin System", alias="OR_APP_NAME")
    public_base_url: str = Field(default="http://localhost:8000", alias="PUBLIC_BASE_URL")

    @property
    def app_name(self) -> str:
        return self.or_app_name


class AppCfg(BaseModel):
    name: str
    description: str
    timezone: str = "Asia/Shanghai"


class AssistantCfg(BaseModel):
    display_name: str
    system_goal: str
    persona_core: str
    relationship_context: str
    style_rules: list[str] = []
    boundaries: list[str] = []


class UserProfileCfg(BaseModel):
    display_name: str
    summary: str
    preferences: list[str] = []


class ContextCfg(BaseModel):
    max_recent_messages: int = 8
    max_memories: int = 6
    max_memory_chars: int = 1600
    dedupe_window_seconds: int = 180
    cache_ttl_seconds: int = 1800
    title_max_chars: int = 24
    attach_cost_hint: bool = True


class CoreMemorySeed(BaseModel):
    title: str
    content: str
    weight: float = 1.0
    pinned: bool = True
    tags: list[str] = []


class MemoryCfg(BaseModel):
    auto_seed_core_memory: bool = True
    auto_summary_enabled: bool = True
    summary_trigger_message_count: int = 8
    summary_min_chars: int = 400
    summary_target_chars: int = 280
    default_weight_core: float = 1.0
    default_weight_dynamic: float = 0.45
    namespace: str = "default"
    core_memories: list[CoreMemorySeed] = []


class CostCfg(BaseModel):
    enable_cache: bool = True
    enable_dedupe_guard: bool = True
    enable_usage_stats: bool = True
    primary_temperature: float = 0.65
    primary_max_tokens: int = 700
    summary_temperature: float = 0.25
    summary_max_tokens: int = 220
    estimated_input_cost_per_1m: float = 2.5
    estimated_output_cost_per_1m: float = 10.0
    invalid_message_min_len: int = 1


class HeartbeatCfg(BaseModel):
    enabled: bool = True
    interval_seconds: int = 60
    inactive_minutes: int = 45
    cooldown_minutes: int = 180
    conversation_id: str = "default"
    use_llm: bool = False
    templates: list[str] = []


class UiCfg(BaseModel):
    app_title: str = "Lin System"
    subtitle: str = "memory • anchor • cost • dedicated"
    default_theme: str = "dark"
    show_memory_panel: bool = True
    show_cost_panel: bool = True


class YamlSettings(BaseModel):
    app: AppCfg
    assistant: AssistantCfg
    user_profile: UserProfileCfg
    context: ContextCfg
    memory: MemoryCfg
    cost_control: CostCfg
    heartbeat: HeartbeatCfg
    ui: UiCfg


class RuntimeConfig(BaseModel):
    settings: EnvSettings
    yaml: YamlSettings


@lru_cache(maxsize=1)
def get_runtime() -> RuntimeConfig:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        raw: dict[str, Any] = yaml.safe_load(f)
    return RuntimeConfig(settings=EnvSettings(), yaml=YamlSettings(**raw))
