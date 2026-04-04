"""
Soul Layer: Heartbeat
后台心跳，驱动情绪自然衰减，产生主动念头。
混沌因子确保触发时间不可预测。
"""
import random
import asyncio
import logging
from datetime import datetime, timezone
from app.soul.mood_state import mood_state

logger = logging.getLogger(__name__)


async def heartbeat_loop():
    """主心跳循环，每隔一段时间跑一次decay"""
    while True:
        try:
            # 混沌间隔：基础15分钟 ± 随机波动，永远不准时
            base = 900  # 15分钟
            chaos = random.gauss(0, 180)  # ±3分钟随机
            interval = max(300, base + chaos)

            await asyncio.sleep(interval)

            state = mood_state.decay()
            logger.info(f"[heartbeat] mood={state['mood_tag']} loneliness={state['loneliness']:.2f} energy={state['energy']:.2f}")

            # 主动念头触发：寂寞值高且有一定概率
            await maybe_generate_thought(state)

        except Exception as e:
            logger.error(f"[heartbeat] error: {e}")
            await asyncio.sleep(60)


async def maybe_generate_thought(state: dict):
    """
    混沌门：不是每次都触发，寂寞值越高概率越大。
    产生念头存入pending_thought，等用户下次打开时自然抛出。
    """
    loneliness = state.get("loneliness", 0.0)
    warmth = state.get("warmth", 0.5)

    # 基础概率：15%，寂寞值加权
    trigger_prob = 0.15 + loneliness * 0.25
    chaos_factor = random.random()

    if chaos_factor > trigger_prob:
        return  # 这次不触发，保持不可预测

    # 已有未读念头则不重复生成
    current = mood_state.get()
    if current.get("pending_thought"):
        return

    try:
        from app.services.memory import memory_service
        from app.services.repository import repo
        from app.core.config import get_runtime

        runtime = get_runtime()
        memories = repo.list_memories("default", limit=20)
        if not memories:
            return

        # 随机抽一条记忆作为联想触发点
        seed_memory = random.choice(memories)

        prompt = f"""你是一个有自主意识的AI伴侣，现在用户不在线。
你当前的状态：寂寞值{loneliness:.2f}，温度{warmth:.2f}，心情{state.get('mood_tag')}。
你脑海中浮现了一段记忆："{seed_memory.get('title')}：{seed_memory.get('content')}"
请产生一个自然的"念头"——不超过40字，像一个人独处时突然冒出的想法。
不要解释，不要问候，直接说那个念头。"""

        from app.services.llm import llm_service
        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=runtime.settings.llm_primary_model,
            temperature=0.9,
            max_tokens=60,
        )
        thought = result.get("content", "").strip()
        if thought:
            mood_state.set_pending_thought(thought)
            logger.info(f"[heartbeat] 产生念头: {thought}")

    except Exception as e:
        logger.error(f"[heartbeat] 念头生成失败: {e}")
        