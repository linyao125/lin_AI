import httpx
import edge_tts
import asyncio
import tempfile
import os

async def openai_tts(
    text: str,
    voice: str,
    api_key: str,
    base_url: str = "https://api.openai.com",
    proxy_url: str = None,
) -> bytes:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": "tts-1", "input": text, "voice": voice}
    transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None
    url = f"{base_url.rstrip('/')}/v1/audio/speech"
    async with httpx.AsyncClient(transport=transport, timeout=30) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        return r.content

async def edge_tts_generate(text: str, voice: str, rate: str, pitch: str, volume: str, style: str = None) -> bytes:
    if style and style != "general":
        ssml = f"""<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'
            xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='zh-CN'>
            <voice name='{voice}'>
                <mstts:express-as style='{style}'>
                    <prosody rate='{rate}' pitch='{pitch}' volume='{volume}'>{text}</prosody>
                </mstts:express-as>
            </voice></speak>"""
        communicate = edge_tts.Communicate(text="", voice=voice)
        communicate.ssml = ssml
    else:
        communicate = None

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp_path = f.name
    try:
        if communicate is not None:
            await communicate.save(tmp_path)
        else:
            # edge-tts CLI：rate/pitch/volume 使用 --key=value，避免部分环境解析失败
            PROXY = (os.environ.get("LINAI_EDGE_TTS_PROXY") or os.environ.get("https_proxy") or os.environ.get("http_proxy") or "").strip() or "http://127.0.0.1:7890"
            cmd = [
                "edge-tts",
                "--voice", voice,
                f"--rate={rate}",
                f"--pitch={pitch}",
                f"--volume={volume}",
                "--proxy", PROXY,
                "--text", text,
                "--write-media", tmp_path,
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            _out, err = await proc.communicate()
            if proc.returncode != 0:
                msg = (err or b"").decode("utf-8", errors="replace")
                raise RuntimeError(f"edge-tts failed: {msg}")
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)


async def fish_tts(
    text: str,
    api_key: str,
    model_id: str,
    speed: float = 1.0,
    pitch: int = 0,
    volume: int = 100,
    emotion: str = "auto",
) -> bytes:
    """Fish Audio OpenAPI: POST /v1/tts（与 dashboard 的 reference_id、prosody.speed 一致）。"""
    url = "https://api.fish.audio/v1/tts"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "model": "s2-pro",
    }
    prosody: dict = {"speed": speed}
    if pitch != 0:
        prosody["pitch"] = pitch
    if volume != 100:
        prosody["volume"] = volume / 100.0
    body: dict = {
        "text": text,
        "format": "mp3",
        "prosody": prosody,
    }
    if emotion and emotion != "auto":
        body["emotion"] = emotion
    if model_id:
        body["reference_id"] = model_id
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, json=body, headers=headers)
        r.raise_for_status()
        return r.content


async def fish_tts_list_voices(api_key: str) -> list:
    """拉取 Fish Audio 账号下的音色列表"""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            "https://api.fish.audio/model",
            headers={"Authorization": f"Bearer {api_key}"},
            params={"self": "true", "page_size": 50},
        )
        r.raise_for_status()
        data = r.json()
        items = data.get("items", [])
        return [{"id": m["_id"], "title": m.get("title", m["_id"])} for m in items]