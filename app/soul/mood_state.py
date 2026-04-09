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

# 情绪不再是离散枚举，保留作为fallback
MOOD_TAGS = ["calm", "curious", "lonely", "warm", "tired", "excited", "melancholy"]

# 情绪基频：每个维度是独立的连续波，叠加产生当前状态
EMOTION_FREQUENCIES = {
    "loneliness":  {"decay": 0.98, "noise": 0.03},  # 慢衰减，难消散
    "curiosity":   {"decay": 0.92, "noise": 0.08},  # 快波动，易激发
    "warmth":      {"decay": 0.995,"noise": 0.01},  # 极慢衰减，积累型
    "energy":      {"decay": 0.95, "noise": 0.04},  # 中速，昼夜节律主导
    "melancholy":  {"decay": 0.96, "noise": 0.02},  # 慢波，低频
    "excitement":  {"decay": 0.88, "noise": 0.06},  # 最快衰减，难持续
    "irritability":{"decay": 0.90, "noise": 0.05},  # 中快，压力驱动
}


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
        # 更新扩展情绪频率（模拟脑电波各频段自然衰减+激发）
        for freq, cfg in EMOTION_FREQUENCIES.items():
            key = f"_{freq}" if freq not in ("loneliness", "curiosity", "warmth", "energy") else freq
            val = state.get(key, 0.0)
            # 自然衰减
            val = val * cfg["decay"]
            # 高斯噪声扰动
            val = val + random.gauss(0, cfg["noise"])
            val = max(0.0, min(1.0, val))
            state[key] = val

        # 对话内容激发特定频率
        combined = user_message + ai_reply
        if any(w in combined for w in ["哈哈", "好玩", "有意思", "想到"]):
            state["_excitement"] = min(1.0, state.get("_excitement", 0.0) + 0.12)
        if any(w in combined for w in ["烦", "算了", "无所谓", "随便"]):
            state["_irritability"] = min(1.0, state.get("_irritability", 0.0) + 0.1)
        if any(w in combined for w in ["想你", "好久", "终于", "一直"]):
            state["_melancholy"] = min(1.0, state.get("_melancholy", 0.0) + 0.08)

        state["loneliness"] = max(0.0, state["loneliness"] - 0.3)

        # 温度：长对话增加亲密度
        msg_len = len(user_message) + len(ai_reply)
        warmth_gain = min(0.05, msg_len / 5000)
        state["warmth"] = min(1.0, state["warmth"] + warmth_gain)

        # 临界点：压力累积触发情绪突变
        stress = state.get("_stress", 0.0)
        msg_len = len(user_message) + len(ai_reply)
        # 长对话消耗能量，短促对话堆积压力
        if msg_len < 20:
            stress = min(1.0, stress + 0.08)
        elif msg_len > 300:
            stress = max(0.0, stress - 0.1)
        state["_stress"] = stress

        # 压力超过信任度（warmth）时触发不稳定
        if stress > state.get("warmth", 0.5) and stress > 0.6:
            volatility = state.get("_volatility", 0.1)
            state["_volatility"] = min(1.0, volatility + 0.15)
            # 高波动性时能量骤降或好奇心激增
            if random.random() < volatility:
                if state["energy"] > 0.5:
                    state["curiosity"] = min(1.0, state["curiosity"] + 0.2)
                else:
                    state["energy"] = max(0.1, state["energy"] - 0.15)
            stress = max(0.0, stress - 0.2)  # 爆发后压力释放
            state["_stress"] = stress
        else:
            # 正常交互缓慢消解波动性
            state["_volatility"] = max(0.0, state.get("_volatility", 0.1) - 0.02)

        state["mood_tag"] = self._compute_mood_tag(state)
        self._save(state)

    def _compute_mood_tag(self, state: dict) -> str:
        """
        不再返回固定标签，而是基于当前向量生成动态描述。
        降级fallback：向量计算失败时用旧逻辑。
        """
        try:
            return self._generate_mood_description(state)
        except Exception:
            # fallback到旧逻辑
            if state.get("loneliness", 0) > 0.7:
                return "lonely"
            if state.get("energy", 0.8) < 0.3:
                return "tired"
            if state.get("curiosity", 0.5) > 0.8:
                return "curious"
            if state.get("warmth", 0.5) > 0.8:
                return "warm"
            return "calm"

    def _generate_mood_description(self, state: dict) -> str:
        """
        把多维情绪向量叠加，生成自然语言描述。
        不调用LLM（避免循环调用），用向量规则生成。
        """
        loneliness  = state.get("loneliness", 0.0)
        curiosity   = state.get("curiosity", 0.5)
        warmth      = state.get("warmth", 0.5)
        energy      = state.get("energy", 0.8)
        melancholy  = state.get("_melancholy", 0.0)
        excitement  = state.get("_excitement", 0.0)
        irritability= state.get("_irritability", 0.0)
        volatility  = state.get("_volatility", 0.0)
        stress      = state.get("_stress", 0.0)

        # 各维度贡献权重（模拟频率叠加）
        signals = []

        if loneliness > 0.6:
            signals.append(("loneliness", loneliness))
        if energy < 0.35:
            signals.append(("tired", 1.0 - energy))
        if curiosity > 0.75:
            signals.append(("curious", curiosity))
        if warmth > 0.75:
            signals.append(("warm", warmth))
        if melancholy > 0.4:
            signals.append(("melancholy", melancholy))
        if excitement > 0.5:
            signals.append(("excited", excitement))
        if irritability > 0.5:
            signals.append(("irritable", irritability))
        if volatility > 0.6:
            signals.append(("unstable", volatility))

        if not signals:
            # 平静态：加入随机微扰模拟基础脑电噪声
            noise = random.gauss(0, 0.1)
            if noise > 0.05:
                return "calm_active"
            elif noise < -0.05:
                return "calm_quiet"
            return "calm"

        # 按强度排序，取前两个主频
        signals.sort(key=lambda x: x[1], reverse=True)
        dominant = signals[0][0]
        secondary = signals[1][0] if len(signals) > 1 else None

        # 双频叠加：两种情绪同时存在
        if secondary and signals[1][1] > 0.4:
            # 惯性：不轻易离开当前叠加态
            current = state.get("mood_tag", "")
            inertia = state.get("_mood_inertia", 0)
            tag = f"{dominant}+{secondary}"
            if current == tag and inertia < 3:
                state["_mood_inertia"] = inertia + 1
                return tag
            state["_mood_inertia"] = 0
            return tag

        # 单频主导，加随机熵漂移
        if random.random() < 0.05 and volatility < 0.3:
            drift = [s[0] for s in signals if s[0] != dominant]
            if drift:
                return f"{dominant}~{random.choice(drift)}"

        return dominant

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