import json
from pathlib import Path

CONFIG_FILE = Path(__file__).parent / "config.json"
COOKIES_FILE = Path(__file__).parent / "cookies" / "xhs_cookies.json"
COOKIES_FILE.parent.mkdir(exist_ok=True)

DEFAULT_CONFIG = {
    "linai_api_base": "http://101.43.56.65:8000",
    "linai_api_key": "",
    "image_api_base": "https://api.openai.com",
    "image_api_key": "",
    "image_provider": "dalle",
    "post_interval_hours": 8,
}

def load_config() -> dict:
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg = json.load(f)
        merged = DEFAULT_CONFIG.copy()
        merged.update(cfg)
        return merged
    save_config(DEFAULT_CONFIG)
    return DEFAULT_CONFIG.copy()

def save_config(cfg: dict):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)