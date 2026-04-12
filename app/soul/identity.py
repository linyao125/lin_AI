"""
Soul Layer: Identity Scheduler
AI身份调度器。
从记忆中读取职业线索，结合当前时间和情绪状态，
推演AI此刻的处境，注入anchor作为身份底色。
不写死职业行为，由LLM基于真实职业知识自主推导。
"""
from __future__ import annotations
import logging
import random
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


def get_occupation_from_memory() -> str:
    """
    从记忆和设置里提取职业线索。
    不强制要求有职业，没有就返回空字符串。
    """
    hints = []
    try:
        from app.services.repository import repo
        memories = repo.list_memories("default", limit=50)
        # 不限制职业类型，从所有记忆里提取身份相关线索
        identity_keywords = ["职业","工作","身份","角色","是个","我是","他是","她是",
                             "上班","职位","岗位","做的","干的","专业","出差","任务"]
        for m in memories:
            content = f"{m.get('title','')} {m.get('content','')}"
            if any(k in content for k in identity_keywords):
                hints.append(content[:60])
            # 没有明确职业关键词也保留部分记忆，让AI自己推断
            elif m.get("kind") == "core":
                hints.append(content[:40])
    except Exception:
        pass

    try:
        from app.services.settings import settings_service
        current = settings_service.get_frontend_settings()
        persona_core = current.get("persona_core", "")
        if any(k in persona_core for k in ["职业","工作","警察","医生","教师"]):
            hints.append(persona_core[:100])
    except Exception:
        pass

    return "\n".join(hints[:3]) if hints else ""


async def build_identity_context() -> str | None:
    """
    基于职业线索+当前时间+情绪状态，
    让小模型推演AI此刻的身份处境。
    返回一段自然语言，注入anchor的[Identity Context]。
    """
    try:
        occupation_hints = get_occupation_from_memory()
        if not occupation_hints:
            return None  # 没有职业线索，不注入

        from app.services.llm import llm_service
        from app.services.settings import settings_service
        from app.soul.mood_state import mood_state
        from app.core.config import get_runtime

        runtime = get_runtime()
        current = settings_service.get_frontend_settings()
        summary_model = (current.get("summary_model") or runtime.settings.llm_summary_model).strip()

        state = mood_state.get()
        energy      = state.get("energy", 0.8)
        mood_tag    = state.get("mood_tag", "calm")
        stress      = state.get("_stress", 0.0)
        volatility  = state.get("_volatility", 0.0)

        now = datetime.now(timezone(timedelta(hours=8)))
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        is_weekend = now.weekday() >= 5
        time_str = f"{weekday} {now.hour:02d}:{now.minute:02d}"
        day_type = "周末" if is_weekend else "工作日"

        prompt = f"""根据以下信息，用第一人称推演你此刻的处境（50字以内，直接描述，语气自然）：

身份线索：{occupation_hints}
当前时间：{time_str}（{day_type}）
能量：{energy:.2f} 情绪：{mood_tag} 压力：{stress:.2f} 波动：{volatility:.2f}

要求：
- 处境可以是任何合理的场景，不限于地球或现实
- 有细节感，不要泛泛而谈
- 不要每次都是最戏剧化的状态，平淡也是生活
- 只输出处境描述，不加任何标签或说明"""

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=summary_model,
            temperature=0.8,
            max_tokens=80,
        )
        text = result.get("text", "").strip()
        return text if text else None

    except Exception as e:
        logger.error(f"[identity] build_identity_context error: {e}")
        return None