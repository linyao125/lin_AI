"""
小红书登录模块，支持扫码和账号密码两种方式，cookie持久化。
"""
import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
from config import COOKIES_FILE


XHS_URL = "https://www.xiaohongshu.com"


async def load_cookies(context) -> bool:
    """加载已保存的cookie，返回是否成功"""
    if not COOKIES_FILE.exists():
        return False
    with open(COOKIES_FILE, encoding="utf-8") as f:
        cookies = json.load(f)
    await context.add_cookies(cookies)
    return True


async def save_cookies(context):
    cookies = await context.cookies()
    with open(COOKIES_FILE, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    print("[auth] Cookie已保存")


async def is_logged_in(page) -> bool:
    """检查是否已登录"""
    try:
        await page.goto(XHS_URL, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        # 检查URL和页面特征
        url = page.url
        if "login" in url:
            return False
        # 检查是否有用户头像或我的入口
        me = await page.query_selector("text=我")
        return me is not None
    except Exception:
        return False


async def login_qrcode(page):
    """扫码登录"""
    print("[auth] 打开小红书登录页，请扫码...")
    await page.goto("https://www.xiaohongshu.com/login", wait_until="domcontentloaded", timeout=15000)
    await page.wait_for_timeout(2000)
    # 等待用户扫码，最多等120秒
    print("[auth] 等待扫码登录（最多120秒）...")
    for _ in range(60):
        await page.wait_for_timeout(2000)
        url = page.url
        if "xiaohongshu.com" in url and "login" not in url:
            print("[auth] 扫码登录成功！")
            return True
        # 检查是否已跳转到主页
        try:
            avatar = await page.query_selector(".user-avatar, .avatar")
            if avatar:
                print("[auth] 扫码登录成功！")
                return True
        except Exception:
            pass
    print("[auth] 扫码超时，请重试")
    return False


async def login_password(page, username: str, password: str):
    """账号密码登录"""
    print("[auth] 尝试账号密码登录...")
    await page.goto("https://www.xiaohongshu.com/login", wait_until="domcontentloaded", timeout=15000)
    await page.wait_for_timeout(2000)
    try:
        # 切换到密码登录tab
        pwd_tab = await page.query_selector('text=密码登录')
        if pwd_tab:
            await pwd_tab.click()
            await page.wait_for_timeout(1000)
        await page.fill('input[placeholder*="手机号"], input[name="phone"]', username)
        await page.fill('input[placeholder*="密码"], input[type="password"]', password)
        await page.click('button[type="submit"], .submit-btn, text=登录')
        await page.wait_for_timeout(3000)
        if "login" not in page.url:
            print("[auth] 密码登录成功！")
            return True
    except Exception as e:
        print(f"[auth] 密码登录失败：{e}")
    return False


async def ensure_login(context, page, username: str = "", password: str = "") -> bool:
    """确保已登录，优先用cookie，失败则走登录流程"""
    await load_cookies(context)
    if await is_logged_in(page):
        print("[auth] Cookie有效，已登录")
        return True

    print("[auth] Cookie无效或不存在，开始登录...")
    # 优先尝试密码登录
    if username and password:
        success = await login_password(page, username, password)
        if success:
            await save_cookies(context)
            return True

    # 降级到扫码
    success = await login_qrcode(page)
    if success:
        await save_cookies(context)
        return True

    return False