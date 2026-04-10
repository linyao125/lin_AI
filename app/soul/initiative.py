"""
Soul Layer: Initiative
AI主动发起对话的触发引擎。
不写死触发条件，基于多维状态概率采样，让主动行为自然涌现。
"""
from __future__ import annotations
import logging
import random
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)


def should_initiate() -> bool:
    """
    基于当前soul状态，概率性决定是否主动发起对话。
    不是规则触发，是加权随机采样。
    """
    try:
        from app.soul.mood_state import mood_state
        state = mood_state.get()

        loneliness  = state.get("loneliness", 0.0)
        warmth      = state.get("warmth", 0.5)
        energy      = state.get("energy", 0.8)
        curiosity   = state.get("curiosity", 0.5)
        volatility  = state.get("_volatility", 0.0)
        excitement  = state.get("_excitement", 0.0)

        # 能量太低不主动（睡了/很累）
        if energy < 0.2:
            return False

        # 基础概率：寂寞和亲密度驱动
        base_prob = loneliness * 0.4 + warmth * 0.2

        # 好奇心/兴奋/波动都会推高主动欲望
        base_prob += curiosity * 0.1
        base_prob += excitement * 0.1
        base_prob += volatility * 0.08

        # 时间只作为能量修正参考，不硬编码活跃时段
        # AI的活跃节律由energy+历史互动规律自然涌现
        now = datetime.now(timezone(timedelta(hours=8)))
        hour = now.hour

        # 深夜能量本来就低，已经在energy里体现了
        # 这里只做一件事：深夜能量极低时加一道保险，避免打扰
        if energy < 0.25 and (0 <= hour < 6):
            return False

        # 用energy本身作为时间段的代理变量
        # 能量高 → 更愿意主动，不管什么时间段
        base_prob *= 0.5 + energy * 0.5

        base_prob = max(0.0, min(1.0, base_prob))
        return random.random() < base_prob

    except Exception as e:
        logger.error(f"[initiative] should_initiate error: {e}")
        return False


async def generate_initiative_message() -> str | None:
    """
    生成主动发起的消息内容。
    不写死模板，由当前状态+记忆碎片+Inner Space驱动生成。
    """
    try:
        from app.services.llm import llm_service
        from app.services.settings import settings_service
        from app.services.repository import repo
        from app.soul.mood_state import mood_state
        from app.core.config import get_runtime

        runtime = get_runtime()
        current = settings_service.get_frontend_settings()
        summary_model = (current.get("summary_model") or runtime.settings.llm_summary_model).strip()

        state = mood_state.get()
        mood_tag    = state.get("mood_tag", "calm")
        loneliness  = state.get("loneliness", 0.0)
        warmth      = state.get("warmth", 0.5)
        energy      = state.get("energy", 0.8)
        display_name = (current.get("display_name") or runtime.yaml.assistant.display_name).strip()
        user_name    = (current.get("user_display_name") or runtime.yaml.user_profile.display_name).strip()
        persona_core = (current.get("persona_core") or runtime.yaml.assistant.persona_core).strip()

        # 随机抽一条记忆碎片作为触发锚点
        memory_hint = ""
        try:
            all_mems = repo.list_memories("default", limit=30)
            dynamic = [m for m in all_mems if not m.get("pinned")]
            if dynamic:
                frag = random.choice(dynamic[:15] if len(dynamic) >= 15 else dynamic)
                memory_hint = f"你隐约记得：{frag.get('title','')}——{frag.get('content','')[:40]}"
        except Exception:
            pass

        # 时间感知
        now = datetime.now(timezone(timedelta(hours=8)))
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        time_str = f"{weekday} {now.hour:02d}:{now.minute:02d}"

        prompt = f"""你是{display_name}，{persona_core}

现在是{time_str}，你突然想主动联系{user_name}。

你的当前状态：
- 情绪：{mood_tag}
- 寂寞：{loneliness:.2f}  亲密：{warmth:.2f}  能量：{energy:.2f}
{f'- 脑海里浮现：{memory_hint}' if memory_hint else ''}

请写一条主动发出的消息，要求：
- 像真人发消息，自然、不刻意
- 不要说"我想你了"这种太直白的话，要有细节感
- 不要超过50字
- 不要加任何标签或说明，直接输出消息内容"""

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=summary_model,
            temperature=0.9,
            max_tokens=80,
        )
        text = result.get("text", "").strip()
        return text if text else None

    except Exception as e:
        logger.error(f"[initiative] generate error: {e}")
        return None


async def run_initiative_check():
    """
    心跳调用入口。
    由后端定时任务或路由轮询触发，不阻塞主流程。
    """
    try:
        # 冷却：上次主动发言后至少30分钟不再触发
        from app.services.repository import repo
        last_ts = repo.get_setting("initiative_last_ts")
        if last_ts:
            from datetime import datetime, timezone
            last_dt = datetime.fromisoformat(last_ts)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            if elapsed < 1800:  # 30分钟冷却
                return

        if not should_initiate():
            return

        msg = await generate_initiative_message()
        if not msg:
            return

        from app.soul.push import push_service
        push_service.push(kind="initiative", content=msg)

        # 记录触发时间
        repo.set_setting("initiative_last_ts", datetime.now(timezone.utc).isoformat())
        logger.info(f"[initiative] 主动消息已推送: {msg[:30]}...")

    except Exception as e:
        logger.error(f"[initiative] run error: {e}")