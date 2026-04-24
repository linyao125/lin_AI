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
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch, volume=volume)
    
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        tmp_path = f.name
    try:
        await communicate.save(tmp_path)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)