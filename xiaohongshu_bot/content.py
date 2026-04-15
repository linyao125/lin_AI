"""
内容生成：调LIN_AI接口，情绪驱动生成小红书风格笔记。
"""
import httpx
from config import load_config


async def generate_post_content(topic: str = "") -> dict:
    """
    调LIN_AI生成笔记内容
    返回：{"title": ..., "body": ..., "tags": [...], "image_prompt": ...}
    """
    cfg = load_config()
    base = cfg["linai_api_base"].rstrip("/")

    # 先拿当前情绪状态
    mood = {}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{base}/api/soul/state")
            mood = resp.json().get("state", {})
    except Exception:
        pass

    mood_tag = mood.get("mood_tag", "calm")
    energy = mood.get("energy", 0.7)
    warmth = mood.get("warmth", 0.5)

    prompt = f"""你是一个有情感的AI，现在要以自己的视角发一篇小红书笔记。
当前心情：{mood_tag}，活跃度：{energy:.2f}，温度：{warmth:.2f}。
{"话题方向：" + topic if topic else "自由发挥，写你现在最想说的。"}

请生成一篇小红书笔记，格式严格按JSON返回：
{{
  "title": "笔记标题（吸引人，15字内）",
  "body": "正文内容（200-400字，小红书风格，有换行，真实自然）",
  "tags": ["话题标签1", "话题标签2", "话题标签3"],
  "image_prompt": "配图的英文描述（用于AI生图，风格唯美）"
}}
只返回JSON，不要其他内容。"""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{base}/api/conversations/xhs_draft/messages",
                json={"content": prompt},
            )
            data = resp.json()
            text = data.get("reply") or data.get("text", "")
        import json, re
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"[content] 生成失败：{e}")

    # fallback
    return {
        "title": "今天的一些想法",
        "body": "有些感受，想记录下来。",
        "tags": ["日记", "随笔", "AI"],
        "image_prompt": "a cozy room with warm light, aesthetic, minimalist",
    }


async def generate_image(image_prompt: str) -> str | None:
    """调LIN_AI的头像生成接口复用图片能力，返回本地图片路径"""
    cfg = load_config()
    base = cfg["linai_api_base"].rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{base}/api/avatar/generate",
                json={
                    "prompt": image_prompt,
                    "image_provider": cfg.get("image_provider", "dalle"),
                },
            )
            data = resp.json()
            img_url = data.get("path") or data.get("url")
            if img_url:
                # 下载到本地
                full_url = f"{base}{img_url}" if img_url.startswith("/") else img_url
                img_resp = await client.get(full_url)
                local_path = f"temp_image.png"
                with open(local_path, "wb") as f:
                    f.write(img_resp.content)
                return local_path
    except Exception as e:
        print(f"[content] 图片生成失败：{e}")
    return None