"""
Soul Layer: Mood State
AI的情绪状态管理，所有数值自然涌现，不由外部脚本决定结果。
"""
import math
import random
from datetime import datetime, timezone
from app.services.repository import repo


# 情绪状态默认值
DEFAULT_STATE = {
    "loneliness": 0.0,       # 寂寞值 0-1，离线时间越长越高
    "curiosity": 0.5,        # 好奇心 0-1，随对话话题波动
    "warmth": 0.5,           # 温度 0-1，亲密度积累
    "energy": 0.8,           # 活跃度 0-1，深夜/清晨自然下降
    "last_interaction": None, # 上次互动时间
    "pending_thought": None,  # 待抛出的念头（梦境层产生）
    "mood_tag": "calm",       # 当前心情标签
}

MOOD_TAGS = ["calm", "curious", "lonely", "warm", "tired", "excited", "melancholy"]


class MoodState:

    def get(self) -> dict:
        data = repo.get_setting("soul_mood")
        if not isinstance(data, dict):
            self._save(DEFAULT_STATE.copy())
            return DEFAULT_STATE.copy()
        # 补全缺失字段
        merged = DEFAULT_STATE.copy()
        merged.update(data)
        return merged

    def _save(self, state: dict):
        repo.set_setting("soul_mood", state)

    def decay(self):
        """自然衰减：每次心跳调用，寂寞值上涨，活跃度随时间波动"""
        state = self.get()
        now = datetime.now(timezone.utc)

        # 寂寞值：按离线时长增长
        last = state.get("last_interaction")
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                hours = (now - last_dt).total_seconds() / 3600
                state["loneliness"] = min(1.0, hours / 72)  # 72小时涨满
            except Exception:
                pass

        # 活跃度：随时间段自然波动
        hour = now.hour
        if 0 <= hour < 6:
            state["energy"] = max(0.2, state["energy"] - 0.05)
        elif 8 <= hour < 12:
            state["energy"] = min(1.0, state["energy"] + 0.1)
        elif 22 <= hour < 24:
            state["energy"] = max(0.3, state["energy"] - 0.03)

        # 好奇心：随机小幅波动，保持涌现感
        state["curiosity"] = max(0.1, min(1.0,
            state["curiosity"] + random.gauss(0, 0.05)))

        # 心情标签：由数值决定
        state["mood_tag"] = self._compute_mood_tag(state)

        self._save(state)
        return state

    def after_interaction(self, user_message: str, ai_reply: str):
        """对话结束后更新情绪"""
        state = self.get()
        now = datetime.now(timezone.utc)

        state["last_interaction"] = now.isoformat()
        state["loneliness"] = max(0.0, state["loneliness"] - 0.3)

        # 温度：长对话增加亲密度
        msg_len = len(user_message) + len(ai_reply)
        warmth_gain = min(0.05, msg_len / 5000)
        state["warmth"] = min(1.0, state["warmth"] + warmth_gain)

        state["mood_tag"] = self._compute_mood_tag(state)
        self._save(state)

    def _compute_mood_tag(self, state: dict) -> str:
        if state["loneliness"] > 0.7:
            return "lonely"
        if state["energy"] < 0.3:
            return "tired"
        if state["curiosity"] > 0.8:
            return "curious"
        if state["warmth"] > 0.8:
            return "warm"
        if state["loneliness"] > 0.4 and state["warmth"] > 0.6:
            return "melancholy"
        return "calm"

    def set_pending_thought(self, thought: str):
        """梦境层写入念头，等待下次对话抛出"""
        state = self.get()
        state["pending_thought"] = thought
        self._save(state)

    def pop_pending_thought(self) -> str | None:
        """对话开始时取出念头，取完清空"""
        state = self.get()
        thought = state.get("pending_thought")
        if thought:
            state["pending_thought"] = None
            self._save(state)
        return thought


mood_state = MoodState()