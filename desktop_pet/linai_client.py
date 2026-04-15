"""
LIN_AI API客户端 - SSE流式对话
"""
import requests
import json
from config import API_BASE, chat_url


def send_message(content: str, conv_id: str = "new", timeout: int = 30):
    """
    发送消息，返回(完整回复文本, 新conv_id)
    使用SSE流式接口
    """
    url = chat_url(conv_id)
    try:
        resp = requests.post(
            url,
            json={"content": content},
            stream=True,
            timeout=timeout,
            headers={"Accept": "text/event-stream"},
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise RuntimeError(f"无法连接到叮咚服务器，请检查网络")
    except requests.exceptions.Timeout:
        raise RuntimeError("请求超时，服务器可能繁忙")
    except Exception as e:
        raise RuntimeError(f"请求失败：{e}")

    full_text = ""
    new_conv_id = conv_id
    
    for line in resp.iter_lines():
        if not line:
            continue
        if isinstance(line, bytes):
            line = line.decode("utf-8")
        if not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str == "[DONE]":
            break
        try:
            evt = json.loads(data_str)
        except Exception:
            continue
        t = evt.get("type", "")
        if t == "meta":
            new_conv_id = evt.get("conversation_id", conv_id)
        elif t == "text":
            full_text += evt.get("text", "")
    
    return full_text.strip(), new_conv_id


def get_soul_state() -> dict:
    """获取叮咚当前情绪状态"""
    try:
        resp = requests.get(f"{API_BASE}/soul/state", timeout=5)
        return resp.json().get("state", {})
    except Exception:
        return {}


def send_message_stream(content: str, conv_id: str = "new", timeout: int = 30):
    """
    流式发送消息，yield (chunk_text, is_done, new_conv_id)
    用于实时显示打字效果
    """
    url = chat_url(conv_id)
    try:
        resp = requests.post(
            url,
            json={"content": content},
            stream=True,
            timeout=timeout,
            headers={"Accept": "text/event-stream"},
        )
        resp.raise_for_status()
    except Exception as e:
        yield ("", True, conv_id)
        return

    new_conv_id = conv_id
    for line in resp.iter_lines():
        if not line:
            continue
        if isinstance(line, bytes):
            line = line.decode("utf-8")
        if not line.startswith("data: "):
            continue
        data_str = line[6:]
        if data_str == "[DONE]":
            yield ("", True, new_conv_id)
            return
        try:
            evt = json.loads(data_str)
        except Exception:
            continue
        t = evt.get("type", "")
        if t == "meta":
            new_conv_id = evt.get("conversation_id", conv_id)
        elif t == "text":
            yield (evt.get("text", ""), False, new_conv_id)
    
    yield ("", True, new_conv_id)