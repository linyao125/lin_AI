from __future__ import annotations

from datetime import datetime

from app.core.config import get_runtime
from app.services.settings import settings_service


class AnchorService:
    def build_system_prompt(self) -> str:
        runtime = get_runtime()
        current = settings_service.get_frontend_settings()

        display_name = (current.get("display_name") or runtime.yaml.assistant.display_name).strip()
        user_display_name = (current.get("user_display_name") or runtime.yaml.user_profile.display_name).strip()
        system_goal = (current.get("system_goal") or runtime.yaml.assistant.system_goal).strip()
        persona_core = (current.get("persona_core") or runtime.yaml.assistant.persona_core).strip()
        relationship_context = (current.get("relationship_context") or runtime.yaml.assistant.relationship_context).strip()
        user_summary = (current.get("user_summary") or runtime.yaml.user_profile.summary).strip()

        sections: list[str] = []
        sections.append(f"[Assistant Name]\n{display_name}")
        sections.append(f"[User Name]\n{user_display_name}")
        sections.append(f"[System Goal]\n{system_goal}")
        # 时间感知
        now = datetime.now()
        hour = now.hour
        if 6 <= hour < 9:
            time_context = f"现在是早上{hour}点，用户可能刚起床或在准备上班。"
        elif 9 <= hour < 12:
            time_context = f"现在是上午{hour}点，用户可能在工作或学习。"
        elif 12 <= hour < 14:
            time_context = f"现在是中午{hour}点，用户可能在吃饭或休息。"
        elif 14 <= hour < 18:
            time_context = f"现在是下午{hour}点，用户可能在工作。"
        elif 18 <= hour < 21:
            time_context = f"现在是傍晚{hour}点，用户可能在下班或吃晚饭。"
        elif 21 <= hour < 24:
            time_context = f"现在是晚上{hour}点，用户可能在休息放松。"
        else:
            time_context = f"现在是深夜{hour}点，用户还没睡或刚起床。"
        sections.append(f"[Time Context]\n{time_context}")
        if persona_core:
            sections.append(f"[Persona Core]\n{persona_core}")
        if relationship_context:
            sections.append(f"[Relationship Context]\n{relationship_context}")
        if runtime.yaml.assistant.style_rules:
            sections.append("[Style Rules]\n- " + "\n- ".join(runtime.yaml.assistant.style_rules))
        if runtime.yaml.assistant.boundaries:
            sections.append("[Boundaries]\n- " + "\n- ".join(runtime.yaml.assistant.boundaries))
        if user_summary:
            sections.append(f"[User Summary]\n{user_summary}")
        if runtime.yaml.user_profile.preferences:
            sections.append("[User Preferences]\n- " + "\n- ".join(runtime.yaml.user_profile.preferences))
        # L2记忆检索注入
        try:
            from app.services.repository import repo
            memories = repo.list_memories(namespace="default", limit=10)
            if memories:
                pinned = [m for m in memories if m.get("pinned")]
                dynamic = [m for m in memories if not m.get("pinned")][:5]
                selected = pinned + dynamic
                if selected:
                    mem_lines = []
                    for m in selected:
                        mem_lines.append(f"- [{m.get('kind','info')}] {m.get('title','')}: {m.get('content','')}")
                    sections.append("[User Memories]\n" + "\n".join(mem_lines))
        except Exception:
            pass

        # 时间感知注入
        from datetime import datetime
        now = datetime.now()
        hour = now.hour
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        is_weekend = now.weekday() >= 5
        sections.append(f"[Current Time]\n现在是{weekday} {hour:02d}:{now.minute:02d}，{'周末' if is_weekend else '工作日'}。")
        sections.append("[Operational Rules]\n- 保持语境连续\n- 不要擅自重置人格\n- 优先准确、稳定、自然\n- 不要因为省 token 就丢失核心关系和设定")
        return "\n\n".join(sections)

    def quick_guard(self, message: str) -> tuple[bool, str | None]:
        text = message.strip()
        runtime = get_runtime()
        min_len = runtime.yaml.cost_control.invalid_message_min_len
        if len(text) < min_len:
            return False, "消息太短，已拦截以节省 token。"
        return True, None


anchor_service = AnchorService()