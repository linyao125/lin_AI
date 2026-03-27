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
        self.scheduler.start()

    def stop(self) -> None:
        if self.scheduler and self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    def tick(self) -> None:
        runtime = get_runtime()
        toggles = settings_service.get_toggles()
        if not toggles.get("heartbeat_enabled", True):
            return
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
        text = pick_template(runtime.yaml.heartbeat.templates)
        repo.insert_message(cid, "system", text, meta={"heartbeat": True})
        repo.add_heartbeat_log(cid, f"inactive>{runtime.yaml.heartbeat.inactive_minutes}m")


heartbeat_service = HeartbeatService()
