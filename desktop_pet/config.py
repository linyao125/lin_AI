"""
叮咚桌面宠物配置 - 对接LIN_AI后端
"""
import os
import json

# LIN_AI服务器地址（本地开发改成localhost）
LINAI_BASE = os.environ.get("LINAI_BASE", "http://101.43.56.65")
API_BASE = f"{LINAI_BASE}/api"

# 对话接口
def chat_url(conv_id: str = "new") -> str:
    return f"{API_BASE}/conversations/{conv_id}/messages/stream"

# 情绪状态接口
SOUL_STATE_URL = f"{API_BASE}/soul/state"

# 配置文件目录
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".dingdong_pet")
os.makedirs(CONFIG_DIR, exist_ok=True)

SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")


def load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "conv_id": "new",
        "pet_size": 150,
        "quiet_mode": False,
    }


def save_settings(data: dict):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass