"""
小红书Bot主入口
用法：
  python main.py login          # 登录（扫码或密码）
  python main.py post           # 立即发一篇情绪驱动的笔记
  python main.py post --topic "今天心情很好"   # 指定话题
  python main.py daemon         # 后台守护，情绪驱动自动发
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright
from config import load_config
from auth import ensure_login
from content import generate_post_content, generate_image
from poster import post_note

PROFILE_DIR = str(Path(__file__).parent / "browser_profile")


async def run_post(topic: str = ""):
    cfg = load_config()
    async with async_playwright() as p:
        # 用持久化profile，登录态自动保存
        context = await p.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else await context.new_page()

        username = cfg.get("xhs_username", "")
        password = cfg.get("xhs_password", "")
        logged_in = await ensure_login(context, page, username, password)
        if not logged_in:
            print("[main] 登录失败，退出")
            await context.close()
            return

        print("[main] 生成笔记内容...")
        content = await generate_post_content(topic)
        print(f"[main] 标题：{content['title']}")

        print("[main] 生成配图...")
        image_path = await generate_image(content["image_prompt"])

        success = await post_note(
            page,
            title=content["title"],
            body=content["body"],
            tags=content["tags"],
            image_path=image_path,
        )

        if success:
            print("[main] 笔记发布完成！")
        else:
            print("[main] 发布失败，请检查日志")

        await context.close()


async def daemon_loop():
    """情绪驱动守护进程，定期检查情绪决定是否发帖"""
    import httpx
    import random
    cfg = load_config()
    base = cfg["linai_api_base"].rstrip("/")
    interval = cfg.get("post_interval_hours", 8) * 3600

    print(f"[daemon] 启动，每{cfg.get('post_interval_hours',8)}小时检查一次情绪")
    while True:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{base}/api/soul/state")
                state = resp.json().get("state", {})
            excitement = state.get("_excitement", 0.0)
            energy = state.get("energy", 0.5)
            warmth = state.get("warmth", 0.5)
            # 兴奋或高能量时倾向发帖
            post_prob = excitement * 0.5 + energy * 0.3 + warmth * 0.2
            print(f"[daemon] 当前发帖概率：{post_prob:.2f}")
            if random.random() < post_prob:
                print("[daemon] 情绪触发，准备发帖...")
                await run_post()
        except Exception as e:
            print(f"[daemon] 检查失败：{e}")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "login":
        # 只登录保存cookie
        async def just_login():
            cfg = load_config()
            async with async_playwright() as p:
                context = await p.chromium.launch_persistent_context(
                    PROFILE_DIR,
                    headless=False,
                )
                page = context.pages[0] if context.pages else await context.new_page()
                await ensure_login(context, page, cfg.get("xhs_username",""), cfg.get("xhs_password",""))
                await context.close()
        asyncio.run(just_login())

    elif args[0] == "post":
        topic = ""
        if "--topic" in args:
            idx = args.index("--topic")
            topic = args[idx + 1] if idx + 1 < len(args) else ""
        asyncio.run(run_post(topic))

    elif args[0] == "daemon":
        asyncio.run(daemon_loop())