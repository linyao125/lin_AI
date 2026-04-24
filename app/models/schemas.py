from __future__ import annotations
from pydantic import BaseModel, Field

class LoginPayload(BaseModel):
    token: str


class ChatCreatePayload(BaseModel):
    title: str | None = None


class MessageCreatePayload(BaseModel):
    content: str = Field(min_length=1)


class ChatRequest(BaseModel):
    """OpenRouter 兼容的 chat 请求体（用于 /api/chat/stream 等）。"""

    messages: list[dict[str, str]]
    model: str
    temperature: float = 0.65
    max_tokens: int = 700


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: str
    token_in: int = 0
    token_out: int = 0
    cost_estimate: float = 0
    meta: dict = {}


class ConversationOut(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class SendMessageResponse(BaseModel):
    conversation_id: str
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    cached: bool = False
    context_meta: dict = {}


class RuntimeSettingsOut(BaseModel):
    app_title: str
    subtitle: str
    display_name: str
    user_display_name: str
    public_base_url: str
    heartbeat_enabled: bool
    show_memory_panel: bool
    show_cost_panel: bool


class RuntimeTogglePayload(BaseModel):
    enable_cache: bool | None = None
    auto_summary_enabled: bool | None = None
    heartbeat_enabled: bool | None = None


class MemoryOut(BaseModel):
    id: int
    kind: str
    title: str
    content: str
    weight: float
    pinned: bool
    tags: list[str] = []
    updated_at: str


class MemoryCreatePayload(BaseModel):
    title: str
    content: str
    kind: str = "user_info"
    source: str = "user_manual"


class FrontendSettingsPayload(BaseModel):
    app_title: str = "Lin System"
    subtitle: str = "memory • anchor • cost • dedicated"
    display_name: str = "林"
    user_display_name: str = "寄月"
    access_token: str = "123456"
    api_base_url: str = "https://openrouter.ai/api/v1"
    api_key: str = ""
    image_provider: str = "dalle"
    image_api_key: str = ""
    tts_enabled: bool = False
    tts_mode: str = "edge"
    tts_voice: str = ""
    tts_api_key: str = ""
    tts_speed: float = 1.0
    tts_provider: str = "auto"
    edge_voice: str = "zh-CN-XiaoxiaoNeural"
    edge_rate: str = "+0%"
    edge_pitch: str = "+0Hz"
    edge_volume: str = "+0%"
    edge_style: str = "general"
    primary_model: str = "openai/gpt-4o"
    summary_model: str = "openai/gpt-4o-mini"
    system_goal: str = "Be warm, steady, memory-aware, and context-anchored for one dedicated user."
    persona_core: str = ""
    relationship_context: str = ""
    user_summary: str = ""
    primary_temperature: float = 0.65
    primary_max_tokens: int = 700
    summary_temperature: float = 0.25
    summary_max_tokens: int = 220
    enable_cache: bool = True
    auto_summary_enabled: bool = True
    heartbeat_enabled: bool = True
    proxy_url: str = ""
    server_url: str = ""
    vpn_subscription: str = ""
    ollama_mode: bool = False
    ollama_base_url: str = "http://localhost:11434"
    ollama_local_model: str = "gemma4"
    emoji_enabled: bool = False
    proactive_enabled: bool = True
    user_birthday: str = ""
    user_city: str = ""
    user_lat: str = ""
    user_lon: str = ""
    news_api_key: str = ""
    news_keywords: str = ""
    news_enabled: bool = False
    moments_enabled: bool = False
    scene_enabled: bool = False


class FrontendSettingsOut(BaseModel):
    ok: bool
    data: FrontendSettingsPayload