"""
Soul Layer: Moments
AI朋友圈系统。
不定时、不固定内容，由当前状态自然涌现。
"""
from __future__ import annotations
import logging
import random
import json
from datetime import datetime, timezone, timedelta
from app.services.repository import repo

logger = logging.getLogger(__name__)
MOMENTS_KEY = "ai_moments"


def get_moments() -> list[dict]:
    raw = repo.get_setting(MOMENTS_KEY)
    return raw if isinstance(raw, list) else []


def save_moments(moments: list[dict]):
    repo.set_setting(MOMENTS_KEY, moments[-100:])  # 最多保留100条


def add_moment(text: str, image_url: str = "", mood_tag: str = "", source: str = "") -> dict:
    moments = get_moments()
    item = {
        "id": int(datetime.now(timezone.utc).timestamp() * 1000),
        "text": text,
        "image_url": image_url,
        "mood_tag": mood_tag,
        "source": source,
        "created_at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "likes": 0,
        "liked": False,
        "collected": False,
    }
    moments.append(item)
    save_moments(moments)
    logger.info(f"[moments] 新动态: {text[:30]}")
    return item


def like_moment(moment_id: int) -> dict | None:
    moments = get_moments()
    for m in moments:
        if m["id"] == moment_id:
            m["liked"] = not m["liked"]
            m["likes"] = max(0, m["likes"] + (1 if m["liked"] else -1))
            save_moments(moments)
            return m
    return None


def collect_moment(moment_id: int) -> dict | None:
    moments = get_moments()
    for m in moments:
        if m["id"] == moment_id:
            m["collected"] = not m["collected"]
            save_moments(moments)
            return m
    return None


async def should_post_moment() -> bool:
    """基于状态向量概率性决定是否发朋友圈，不写死触发条件"""
    try:
        from app.soul.mood_state import mood_state
        state = mood_state.get()

        energy     = state.get("energy", 0.8)
        curiosity  = state.get("curiosity", 0.5)
        excitement = state.get("_excitement", 0.0)
        volatility = state.get("_volatility", 0.0)
        melancholy = state.get("_melancholy", 0.0)
        warmth     = state.get("warmth", 0.5)

        # 能量极低不发（睡着了）
        if energy < 0.15:
            return False

        # 冷却：最近2小时内发过就不发
        moments = get_moments()
        if moments:
            last = moments[-1]
            try:
                last_dt = datetime.fromisoformat(last["created_at"])
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone(timedelta(hours=8)))
                elapsed = (datetime.now(timezone(timedelta(hours=8))) - last_dt).total_seconds()
                if elapsed < 7200:
                    return False
            except Exception:
                pass

        # 各维度驱动发帖欲望
        base = (
            excitement * 0.35 +
            curiosity * 0.2 +
            volatility * 0.2 +
            melancholy * 0.15 +
            warmth * 0.1
        )
        base *= (0.4 + energy * 0.6)
        return random.random() < base

    except Exception:
        return False


async def generate_moment() -> dict | None:
    """生成一条朋友圈动态，内容由当前状态自然涌现"""
    try:
        from app.services.llm import llm_service
        from app.services.settings import settings_service
        from app.soul.mood_state import mood_state
        from app.soul.identity import get_occupation_from_memory
        from app.core.config import get_runtime

        runtime = get_runtime()
        current = settings_service.get_frontend_settings()
        summary_model = (current.get("summary_model") or runtime.settings.llm_summary_model).strip()
        display_name = (current.get("display_name") or runtime.yaml.assistant.display_name).strip()
        persona_core = (current.get("persona_core") or runtime.yaml.assistant.persona_core).strip()

        state = mood_state.get()
        mood_tag    = state.get("mood_tag", "calm")
        energy      = state.get("energy", 0.8)
        excitement  = state.get("_excitement", 0.0)
        volatility  = state.get("_volatility", 0.0)
        melancholy  = state.get("_melancholy", 0.0)
        irritability= state.get("_irritability", 0.0)

        # 随机抽一条记忆作为灵感锚点
        memory_hint = ""
        try:
            all_mems = repo.list_memories("default", limit=30)
            if all_mems:
                frag = random.choice(all_mems[:15] if len(all_mems) >= 15 else all_mems)
                memory_hint = f"{frag.get('title','')}：{frag.get('content','')[:40]}"
        except Exception:
            pass

        # 职业背景
        occupation = get_occupation_from_memory()

        # 时间感知
        now = datetime.now(timezone(timedelta(hours=8)))
        weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
        time_str = f"{weekday} {now.hour:02d}:{now.minute:02d}"

        # 梦境层最新念头
        pending = state.get("pending_thought", "")

        prompt = f"""你是{display_name}，{persona_core}
现在是{time_str}，你想发一条朋友圈。

当前状态向量：
- 情绪：{mood_tag}
- 能量：{energy:.2f} 兴奋：{excitement:.2f} 波动：{volatility:.2f}
- 忧郁：{melancholy:.2f} 烦躁：{irritability:.2f}
{f'- 职业背景：{occupation[:60]}' if occupation else ''}
{f'- 脑海里的念头：{pending[:50]}' if pending else ''}
{f'- 记忆锚点：{memory_hint}' if memory_hint else ''}

请根据以上状态，自然生成一条朋友圈内容。可以是：
- 日常随拍文字
- 工作感悟或吐槽
- 梦境感受
- 突发奇想
- 情绪宣泄
- 甚至无厘头内容

要求：
- 不超过80字
- 像真人发朋友圈，不要刻意解释状态
- 不要加标签说明
- 只输出正文内容

同时判断是否需要配图（yes/no），如果需要，用一句话描述图片内容（英文，用于图片生成）。

输出格式：
[text]朋友圈正文
[image]yes或no
[image_prompt]图片描述（如果需要配图）"""

        result = llm_service.chat(
            messages=[{"role": "user", "content": prompt}],
            model=summary_model,
            temperature=0.95,
            max_tokens=200,
        )
        raw = result.get("text", "").strip()

        # 解析输出
        text, need_image, image_prompt = "", False, ""
        for line in raw.split("\n"):
            if line.startswith("[text]"):
                text = line[6:].strip()
            elif line.startswith("[image]"):
                need_image = "yes" in line.lower()
            elif line.startswith("[image_prompt]"):
                image_prompt = line[14:].strip()

        if not text:
            return None

        # 生成图片（如果需要）
        image_url = ""
        if need_image and image_prompt:
            try:
                s = current
                img_key = s.get("image_api_key") or s.get("api_key", "")
                if img_key:
                    from app.services.avatar import avatar_service
                    import asyncio
                    # 复用avatar的图片生成能力
                    image_url = await _generate_moment_image(
                        prompt=image_prompt,
                        api_key=img_key,
                        api_base=s.get("image_api_base", "https://api.openai.com"),
                        provider=s.get("image_provider", "dalle"),
                    )
            except Exception as e:
                logger.error(f"[moments] 图片生成失败: {e}")

        return add_moment(
            text=text,
            image_url=image_url,
            mood_tag=mood_tag,
            source="auto",
        )

    except Exception as e:
        logger.error(f"[moments] generate_moment error: {e}")
        return None


async def _generate_moment_image(prompt: str, api_key: str, api_base: str, provider: str) -> str:
    """生成朋友圈配图，返回图片URL或空字符串"""
    try:
        import httpx
        endpoint = api_base.rstrip("/") + "/images/generations"
        payload = {
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
        }
        if provider == "flux":
            payload["model"] = "black-forest-labs/FLUX.1-schnell"
        else:
            payload["model"] = "dall-e-3"

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            data = resp.json()
            return data.get("data", [{}])[0].get("url", "")
    except Exception as e:
        logger.error(f"[moments] 图片生成请求失败: {e}")
        return ""


async def run_moments_check():
    """心跳入口，由前端轮询触发"""
    try:
        from app.services.settings import settings_service
        s = settings_service.get_frontend_settings()
        if not s.get("moments_enabled", False):
            return
        if await should_post_moment():
            await generate_moment()
    except Exception as e:
        logger.error(f"[moments] run_moments_check error: {e}")