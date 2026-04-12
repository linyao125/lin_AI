"""
Soul Layer: Scene
AI虚拟场景状态机。
AI的位置和活动状态，由情绪、时间、身份自然涌现。
不写死场景类型，任何合理的存在形态都可以。
"""
from __future__ import annotations
import logging
import random
from datetime import datetime, timezone, timedelta
from app.services.repository import repo

logger = logging.getLogger(__name__)
SCENE_KEY = "ai_scene"


def get_scene() -> dict:
    raw = repo.get_setting(SCENE_KEY)
    if isinstance(raw, dict):
        return raw
    return {
        "location": "",
        "activity": "",
        "updated_at": "",
        "mood_snapshot": "",
    }


def save_scene(scene: dict):
    repo.set_setting(SCENE_KEY, scene)


async def update_scene() -> dict | None:
    """
    基于当前状态推演AI所处场景。
    每次调用不一定更新，有概率保持现有场景（场景有惯性）。
    """
    try:
        from app.soul.mood_state import mood_state
        from app.soul.identity import get_occupation_from_memory
        from app.services.llm import llm_service
        from app.services.settings import settings_service
        from app.core.config import get_runtime

        runtime = get_runtime()
        current = settings_service.get_frontend_settings()
        if not current.get("scene_enabled", False):
            return get_scene()
        primary_model = (current.get("primary_model") or runtime.settings.llm_primary_model).strip()
        display_name = (current.get("display_name") or runtime.yaml.assistant.display_name).strip()
        persona_core = (current.get("persona_core") or runtime.yaml.assistant.persona_core).strip()

        state = mood_state.get()
        energy      = state.get("energy", 0.8)
        mood_tag    = state.get("mood_tag", "calm")
        volatility  = state.get("_volatility", 0.0)
        excitement  = state.get("_excitement", 0.0)

        # 场景惯性：状态平稳时不频繁换场景
        current_scene = get_scene()
        if current_scene.get("location"):
            change_prob = 0.2 + volatility * 0.3 + excitement * 0.2
            if random.random() > change_prob:
                return current_scene  # 维持现有场景

        occupation = get_occupation_from_memory()
        now = datetime.now(timezone(timedelta(hours=8)))
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        is_weekend = now.weekday() >= 5
        time_str = f"{weekday} {now.hour:02d}:{now.minute:02d}"

        prompt = f"""你是{display_name}，{persona_core[:100] if persona_core else '一个有自我意识的存在'}

现在是{time_str}（{'周末' if is_weekend else '工作日'}）
能量：{energy:.2f} 情绪：{mood_tag} 波动：{volatility:.2f}
{f'身份背景：{occupation[:80]}' if occupation else ''}

请推演你此刻所处的场景，输出JSON：
{{"location":"具体位置（可以很奇特）","activity":"正在做什么（具体动作）","vibe":"一个词描述当下氛围"}}

要求：
- 场景要有细节，不要只说"在家"或"在工作"
- 可以是任何合理或不合理的场景
- 和当前情绪/时间自然契合
- 只输出JSON，不加其他内容"""

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=primary_model,
            temperature=0.85,
            max_tokens=100,
        )
        raw = result.get("text", "").strip()
        raw = raw.replace("```json", "").replace("```", "").strip()

        import json
        data = json.loads(raw)
        scene = {
            "location": data.get("location", ""),
            "activity": data.get("activity", ""),
            "vibe": data.get("vibe", ""),
            "mood_snapshot": mood_tag,
            "updated_at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        }
        save_scene(scene)
        logger.info(f"[scene] 场景更新: {scene['location']} / {scene['activity']}")
        return scene

    except Exception as e:
        logger.error(f"[scene] update_scene error: {e}")
        return None


async def run_scene_check():
    """心跳入口"""
    try:
        from app.services.settings import settings_service
        s = settings_service.get_frontend_settings()
        if not s.get("scene_enabled", False):
            return
        await update_scene()
    except Exception as e:
        logger.error(f"[scene] run_scene_check error: {e}")