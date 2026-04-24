import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import api_router
from app.core.config import get_runtime
from app.db.database import database
from app.services.heartbeat import heartbeat_service
from app.services.memory import memory_service

BASE_DIR = Path(__file__).resolve().parent
runtime = get_runtime()


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init()
    memory_service.seed_core_memories_if_needed()
    heartbeat_service.start()
    yield
    heartbeat_service.stop()


app = FastAPI(title=runtime.settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.include_router(api_router, prefix="/api")


def _build_css_vars(s: dict) -> dict:
    h = int(s.get("theme_hue") or 0)
    a = int(s.get("theme_sat") or 0)
    l = int(s.get("theme_light") or 13)
    uc = s.get("user_bubble_color") or ""
    ac = s.get("ai_bubble_color") or ""
    has_theme = h or a or l != 13
    has_bubble = bool(uc or ac)
    if not has_theme and not has_bubble:
        return {}
    i = l > 50
    fg = f"{h} 10% 20%" if i else "0 0% 95%"
    mf = f"{h} 10% 45%" if i else "0 0% 55%"
    vars = {}
    if has_theme:
        vars.update({
            "--background": f"{h} {a}% {l}%",
            "--foreground": fg,
            "--card": f"{h} {a}% {max(l-3,0)}%",
            "--card-foreground": fg,
            "--popover": f"{h} {a}% {max(l-3,0)}%",
            "--popover-foreground": fg,
            "--primary": f"{h} {min(a,40)}% 25%" if i else "0 0% 100%",
            "--primary-foreground": "0 0% 100%" if i else "0 0% 9%",
            "--secondary": f"{h} {a}% {l+(-8 if i else 5)}%",
            "--secondary-foreground": fg,
            "--muted": f"{h} {a}% {l+(-8 if i else 5)}%",
            "--muted-foreground": mf,
            "--accent": f"{h} {a}% {l+(-6 if i else 5)}%",
            "--accent-foreground": fg,
            "--border": f"{h} {min(a,20)}% {l+(-15 if i else 9)}%",
            "--input": f"{h} {min(a,20)}% {l+(-15 if i else 9)}%",
            "--ring": f"{h} {min(a,20)}% {l+(-30 if i else 27)}%",
            "--sidebar-background": f"{h} {a}% {max(l-4,0)}%",
            "--sidebar-foreground": f"{h} 10% 25%" if i else "0 0% 85%",
            "--sidebar-accent": f"{h} {a}% {l+(-6 if i else 5)}%",
            "--sidebar-accent-foreground": fg,
            "--sidebar-border": f"{h} {min(a,20)}% {l+(-12 if i else 3)}%",
        })
    if uc:
        vars["--chat-user-bg"] = uc
    if ac:
        vars["--chat-ai-bg"] = ac
    return vars


def _get_index_html() -> str:
    html_path = BASE_DIR / "static" / "dist" / "index.html"
    with open(html_path, "r") as f:
        content = f.read()

    ts_script = """<script>
window._ts=function(h,s,l){fetch('/api/settings/form',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme_hue:h,theme_sat:s,theme_light:l})});};
window._bc=function(uc,ac){fetch('/api/settings/form',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_bubble_color:uc,ai_bubble_color:ac})});};
window._bg=function(bg,img){var body={chat_bg:bg};if(img!==undefined)body.chat_bg_image=img;fetch('/api/settings/form',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});};
window._bm=function(um,am){fetch('/api/settings/form',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_bubble_mode:um,ai_bubble_mode:am})});};
</script>"""
    content = content.replace("</head>", ts_script + "</head>")

    try:
        from app.services.settings import settings_service
        s = settings_service.get_frontend_settings()

        # ── 1. CSS 变量注入 ──────────────────────────────────
        css_vars = _build_css_vars(s)
        css_js_lines = []
        if css_vars:
            for k, v in css_vars.items():
                css_js_lines.append(f'r.setProperty("{k}","{v}")')

        # ── 2. 聊天背景注入 ──────────────────────────────────
        chat_bg = s.get("chat_bg", "default")
        chat_bg_image = s.get("chat_bg_image", "")
        bg_js = f'window.__chatBg={json.dumps(chat_bg)};'
        if chat_bg == "custom-image" and chat_bg_image:
            bg_js += f'window.__chatBgImage={json.dumps(chat_bg_image)};'

        # ── 3. 气泡联动 + 颜色 + 模式 注入 ──────────────────
        bubble_js = (
            f'window.__bubbleLinked={json.dumps(bool(s.get("bubble_linked", False)))};'
            f'window.__userBubbleColor={json.dumps(s.get("user_bubble_color",""))};'
            f'window.__aiBubbleColor={json.dumps(s.get("ai_bubble_color",""))};'
            f'window.__userBubbleMode={json.dumps(s.get("user_bubble_mode","bubble"))};'
            f'window.__aiBubbleMode={json.dumps(s.get("ai_bubble_mode","bubble"))};'
        )

        early_js = bg_js + bubble_js
        dom_js = ""
        if css_js_lines:
            dom_js = "var r=document.documentElement.style;" + ";".join(css_js_lines)

        inject = (
            f'<script>{early_js}</script>'
            + (f'<script>document.addEventListener("DOMContentLoaded",function(){{{dom_js}}});</script>' if dom_js else "")
        )
        content = content.replace("</head>", inject + "</head>")

    except Exception:
        pass

    return content


@app.get("/")
def index():
    return HTMLResponse(_get_index_html())


@app.get("/{full_path:path}")
def spa_fallback(full_path: str, request: Request):
    if full_path.startswith("api/") or full_path.startswith("static/"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    file_path = BASE_DIR / "static" / "dist" / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    return HTMLResponse(_get_index_html())
