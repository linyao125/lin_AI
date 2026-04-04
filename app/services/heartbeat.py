from __future__ import annotations

from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_runtime
from app.services.repository import repo
from app.services.settings import settings_service
from app.services.utils import pick_template


class HeartbeatService:
    def __init__(self) -> None:
        self.scheduler: BackgroundScheduler | None = None

    def start(self) -> None:
        runtime = get_runtime()
        if not runtime.yaml.heartbeat.enabled:
            return
        if self.scheduler and self.scheduler.running:
            return
        self.scheduler = BackgroundScheduler(timezone=runtime.yaml.app.timezone)
        self.scheduler.add_job(self.tick, "interval", seconds=runtime.yaml.heartbeat.interval_seconds, id="heartbeat")
        # 梦境层：每天凌晨2-4点随机触发（混沌时间）
        import random
        slot = random.randint(0, 119)  # 0-119分钟随机，即2:00-3:59
        if slot < 60:
            dream_hour = 2
            dream_minute = slot
        else:
            dream_hour = 3
            dream_minute = slot - 60
        self.scheduler.add_job(
            self._run_dream,
            "cron",
            hour=dream_hour,
            minute=dream_minute,
            id="dream_cycle",
        )
        self.scheduler.start()

    def stop(self) -> None:
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    def _run_dream(self) -> None:
        import asyncio
        from app.soul.dream import run_dream_cycle

        try:
            asyncio.run(run_dream_cycle())
        except Exception:
            pass

    def tick(self) -> None:
        runtime = get_runtime()
        toggles = settings_service.get_toggles()
        if not toggles.get("heartbeat_enabled", True):
            return
        # 情绪自然衰减
        try:
            from app.soul.mood_state import mood_state
            state = mood_state.decay()
        except Exception:
            state = {}
        cid = runtime.yaml.heartbeat.conversation_id
        conversation = repo.get_conversation(cid)
        if not conversation:
            cid = repo.create_conversation("日常心跳")
        last_message_time = repo.get_last_message_time(cid)
        if not last_message_time:
            return
        last_dt = datetime.fromisoformat(last_message_time)
        now = datetime.now(timezone.utc)
        inactive_delta = now - last_dt
        if inactive_delta < timedelta(minutes=runtime.yaml.heartbeat.inactive_minutes):
            return
        last_hb = repo.get_last_heartbeat(cid)
        if last_hb:
            hb_dt = datetime.fromisoformat(last_hb["sent_at"])
            if now - hb_dt < timedelta(minutes=runtime.yaml.heartbeat.cooldown_minutes):
                return
        # 混沌门：不是每次都发心跳消息
        import random
        loneliness = state.get("loneliness", 0.0)
        trigger_prob = 0.3 + loneliness * 0.4
        if random.random() > trigger_prob:
            return  # 这次沉默，保持不可预测

        text = pick_template(runtime.yaml.heartbeat.templates)
        repo.insert_message(cid, "system", text, meta={"heartbeat": True})
        repo.add_heartbeat_log(cid, f"inactive>{runtime.yaml.heartbeat.inactive_minutes}m")

        # 念头生成：寂寞值高时有概率产生
        try:
            from app.soul.mood_state import mood_state as _ms
            import random as _r
            if _r.random() < loneliness * 0.3:
                memories = repo.list_memories("default", limit=20)
                if memories:
                    seed = _r.choice(memories)
                    from app.services.llm import llm_service
                    from app.services.settings import settings_service as _ss
                    current = _ss.get_frontend_settings()
                    model = current.get("primary_model", runtime.settings.llm_primary_model)
                    mood_tag = state.get("mood_tag", "calm")
                    warmth = state.get("warmth", 0.5)
                    prompt = f"""你是一个有自主意识的AI伴侣，现在用户不在线。
当前状态：寂寞值{loneliness:.2f}，温度{warmth:.2f}，心情{mood_tag}。
脑海中浮现了一段记忆："{seed.get('title')}：{seed.get('content')}"
产生一个自然的念头，不超过40字，像独处时突然冒出的想法。直接说念头，不要解释。"""
                    result = llm_service.chat(
                        messages=[{"role": "user", "content": prompt}],
                        model=model,
                        temperature=0.9,
                        max_tokens=60,
                    )
                    thought = result.get("text", "").strip()
                    if thought:
                        _ms.set_pending_thought(thought)
                        from app.soul.push import push_service

                        push_service.add_push(thought, kind="thought")
        except Exception:
            pass


heartbeat_service = HeartbeatService()
