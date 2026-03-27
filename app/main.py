from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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


@app.get("/")
def index():
    from fastapi.responses import FileResponse
    return FileResponse(BASE_DIR / "templates" / "index.html")
