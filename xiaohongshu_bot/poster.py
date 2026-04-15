"""
小红书发帖模块
"""
from playwright.async_api import Page


async def post_note(page: Page, title: str, body: str, tags: list[str], image_path: str | None = None) -> bool:
    try:
        print("[poster] 前往发布页...")
        await page.goto("https://creator.xiaohongshu.com/publish/publish?source=official", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)

        # 切换到写长文
        print("[poster] 切换到写长文...")
        await page.evaluate("() => { const el = Array.from(document.querySelectorAll('*')).find(e => e.textContent.trim() === '写长文'); if(el) el.click(); }")
        await page.wait_for_timeout(3000)

        # 点击新的创作
        print("[poster] 点击新的创作...")
        await page.evaluate("() => { const el = Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === '新的创作'); if(el) el.click(); }")
        await page.wait_for_timeout(4000)

        # 填标题
        print("[poster] 填写标题...")
        title_input = await page.query_selector('[placeholder*="标题"]')
        if title_input:
            await title_input.click()
            await title_input.fill(title)
            await page.wait_for_timeout(500)

        # 填正文
        print("[poster] 填写正文...")
        body_with_tags = body + "\n\n" + " ".join(f"#{t}" for t in tags[:5])
        editor = await page.query_selector('[contenteditable="true"]')
        if editor:
            await editor.click()
            await editor.fill(body_with_tags)
            await page.wait_for_timeout(1000)

        # 点一键排版
        print("[poster] 点击一键排版...")
        await page.evaluate("() => { const btn = Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === '一键排版'); if(btn) btn.click(); }")
        await page.wait_for_timeout(5000)

        # 打印所有按钮
        btns = await page.evaluate("() => Array.from(document.querySelectorAll('button')).map(e => e.textContent.trim())")
        print(f"[poster] 排版后所有按钮: {btns}")
        await page.screenshot(path="debug_after_paiban.png")

        # 点下一步
        print("[poster] 点击下一步...")
        await page.evaluate("() => { const btn = Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === '下一步'); if(btn) btn.click(); }")
        await page.wait_for_timeout(4000)
        await page.screenshot(path="debug_next.png")

        # 点发布
        print("[poster] 点击发布...")
        published = await page.evaluate("""() => {
            const btn = Array.from(document.querySelectorAll('button')).find(e => e.textContent.trim() === '发布');
            if(btn) { btn.click(); return true; }
            return false;
        }""")
        if published:
            await page.wait_for_timeout(3000)
            print("[poster] 发布成功！")
            return True

        print(f"[poster] 未找到发布按钮，当前URL: {page.url}")
        return False

    except Exception as e:
        import traceback
        print(f"[poster] 发布失败：{e}")
        traceback.print_exc()
        return False