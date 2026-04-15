import asyncio
from playwright.async_api import async_playwright
from pathlib import Path

PROFILE_DIR = str(Path(__file__).parent / "browser_profile")

async def inspect():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(PROFILE_DIR, headless=False)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        await page.evaluate("() => { const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent.trim() === '写长文'); if(el) el.click(); }")
        await page.wait_for_timeout(3000)
        await page.evaluate("() => { const el = Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === '新的创作'); if(el) el.click(); }")
        await page.wait_for_timeout(4000)

        # 填标题
        title_input = await page.query_selector('[placeholder*="标题"]')
        if title_input:
            await title_input.click()
            await title_input.fill("测试标题")
            print("标题填写成功")

        # 填正文
        editor = await page.query_selector('[contenteditable="true"]')
        if editor:
            await editor.click()
            await editor.fill("这是测试正文内容，看看填完有没有发布按钮出现。")
            print("正文填写成功")

        await page.wait_for_timeout(2000)
        btns = await page.evaluate("() => Array.from(document.querySelectorAll('button')).map(e => e.textContent.trim())")
        print(f"所有按钮: {btns}")
        await page.screenshot(path="debug_filled.png")
        await ctx.close()

asyncio.run(inspect())
