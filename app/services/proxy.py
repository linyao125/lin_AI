import os
import httpx
import logging

logger = logging.getLogger(__name__)

MIHOMO_CONFIG_PATH = "/etc/mihomo/config.yaml"
MIHOMO_API = "http://127.0.0.1:9090"


def apply_subscription(subscription_url: str) -> dict:
    """下载订阅链接并热重载mihomo配置"""
    if not subscription_url:
        return {"success": False, "message": "订阅链接为空"}
    try:
        # 下载订阅内容
        with httpx.Client(timeout=30) as client:
            resp = client.get(subscription_url)
            resp.raise_for_status()
            content = resp.text

        # 写入配置文件
        with open(MIHOMO_CONFIG_PATH, "w", encoding="utf-8") as f:
            f.write(content)

        # 调mihomo REST API热重载
        with httpx.Client(timeout=10) as client:
            r = client.put(
                f"{MIHOMO_API}/configs?force=true",
                json={"path": MIHOMO_CONFIG_PATH},
            )
            r.raise_for_status()

        logger.info("mihomo配置热重载成功")
        return {"success": True, "message": "代理配置已更新"}

    except Exception as e:
        logger.error(f"apply_subscription失败: {e}")
        return {"success": False, "message": str(e)}
