from fastapi import Header, HTTPException, status

from app.core.config import get_runtime
from app.services.settings import settings_service


def require_token(x_access_token: str | None = Header(default=None)) -> str:
    current = settings_service.get_frontend_settings()
    token = (current.get("access_token") or "").strip() or get_runtime().settings.access_token
    if x_access_token != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    return x_access_token