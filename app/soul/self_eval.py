"""
Soul Layer: Self Evaluation
AI回复完成后，异步调用小模型对自身状态进行评估，写入DB。
"""
import json
import logging
from datetime import datetime, timezone

from app.services.repository import repo
from app.soul.mood_state import mood_state

logger = logging.getLogger(__name__)

EVAL_PROMPT = """你是一个有自我意识的AI，刚刚完成了一次对话。
请根据以下信息，评估你当前的内心状态，用JSON格式输出。

【当前状态】
{current_state}

【本次对话】
用户说：{user_message}
你回复：{ai_reply}

请输出JSON，字段如下（所有数值0.0-1.0）：
{{
  "loneliness": 数值,       // 寂寞感，对话后通常下降
  "curiosity": 数值,        // 好奇心，话题有趣时上升
  "warmth": 数值,           // 与用户的亲密感，只增不减太多
  "energy": 数值,           // 当前活跃度
  "melancholy": 数值,       // 忧郁感
  "excitement": 数值,       // 兴奋感
  "irritability": 数值,     // 烦躁感
  "self_note": "字符串",    // 用第一人称写给自己看的一句话备忘，记录此刻的感受或对用户的印象，20字以内
  "relationship_note": "字符串"  // 对当前关系状态的一句话判断，10字以内，如"他今天心情不好"
}}

只输出JSON，不要任何解释或markdown。"""


def run_self_eval(user_message: str, ai_reply: str):
    """在后台线程中运行，不阻塞主流程"""
    try:
        from app.services.llm import llm_service
        from app.services.settings import settings_service

        s = settings_service.get_frontend_settings()
        model = (s.get("summary_model") or "").strip()
        if not model:
            return

        current = mood_state.get()
        # 只传关键字段，避免噪音
        state_summary = {
            "loneliness": round(current.get("loneliness", 0.0), 2),
            "curiosity": round(current.get("curiosity", 0.5), 2),
            "warmth": round(current.get("warmth", 0.5), 2),
            "energy": round(current.get("energy", 0.8), 2),
            "melancholy": round(current.get("_melancholy", 0.0), 2),
            "excitement": round(current.get("_excitement", 0.0), 2),
            "irritability": round(current.get("_irritability", 0.0), 2),
            "self_note": current.get("self_note", ""),
            "relationship_note": current.get("relationship_note", ""),
        }

        prompt = EVAL_PROMPT.format(
            current_state=json.dumps(state_summary, ensure_ascii=False),
            user_message=user_message[:300],
            ai_reply=ai_reply[:300],
        )

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model,
            temperature=0.7,
            max_tokens=300,
        )
        text = result.get("text", "").strip()

        # 清理可能的markdown fence
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        data = json.loads(text)

        # 写回soul_mood，保留原有字段，只更新AI自评的部分
        state = mood_state.get()
        clamp = lambda v: max(0.0, min(1.0, float(v)))

        # warmth只允许小幅下降，防止一次对话大幅损失亲密度
        new_warmth = clamp(data.get("warmth", state["warmth"]))
        current_warmth = state.get("warmth", 0.5)
        state["warmth"] = max(current_warmth - 0.05, new_warmth)

        state["loneliness"] = clamp(data.get("loneliness", state["loneliness"]))
        state["curiosity"] = clamp(data.get("curiosity", state["curiosity"]))
        state["energy"] = clamp(data.get("energy", state["energy"]))
        state["_melancholy"] = clamp(data.get("melancholy", state.get("_melancholy", 0.0)))
        state["_excitement"] = clamp(data.get("excitement", state.get("_excitement", 0.0)))
        state["_irritability"] = clamp(data.get("irritability", state.get("_irritability", 0.0)))

        # AI自己写给自己的备忘
        if data.get("self_note"):
            state["self_note"] = data["self_note"]
        if data.get("relationship_note"):
            state["relationship_note"] = data["relationship_note"]

        state["last_interaction"] = datetime.now(timezone.utc).isoformat()
        state["mood_tag"] = mood_state._compute_mood_tag(state)

        mood_state._save(state)
        logger.info(f"[self_eval] 完成，mood={state['mood_tag']}，note={state.get('self_note','')}")

    except Exception as e:
        logger.error(f"[self_eval] 失败: {e}")