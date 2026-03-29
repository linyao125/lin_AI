import httpx
from app.services.llm import llm_service
key = llm_service._api_key()
print("key len:", len(key))
resp = httpx.post(
    "https://openrouter.ai/api/v1/chat/completions",
    headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    json={"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 10}
)
print(resp.status_code, resp.text[:200])
