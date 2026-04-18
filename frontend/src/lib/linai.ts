const LINAI_BASE = "/api"

export async function* streamChat(content: string, convId: string = "new") {
  const url = `${LINAI_BASE}/conversations/${convId}/messages/stream`
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
    body: JSON.stringify({ content }),
  })
  if (!resp.ok) throw new Error(`请求失败: ${resp.status}`)
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let newConvId = convId

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const data = line.slice(6)
      if (data === "[DONE]") return
      try {
        const evt = JSON.parse(data)
        if (evt.type === "meta") newConvId = evt.conversation_id
        if (evt.type === "text") yield { text: evt.text as string, convId: newConvId }
      } catch {}
    }
  }
}

export async function listConversations() {
  const resp = await fetch(`${LINAI_BASE}/conversations`)
  return resp.json()
}

export async function getMessages(convId: string) {
  const resp = await fetch(`${LINAI_BASE}/conversations/${convId}/messages`)
  return resp.json()
}

export async function getSoulState() {
  const resp = await fetch(`${LINAI_BASE}/soul/state`)
  return resp.json()
}

export async function loadConversations() {
  const r = await fetch(`${LINAI_BASE}/conversations`)
  return r.json()
}

export async function loadMessages(convId: string) {
  const r = await fetch(`${LINAI_BASE}/conversations/${convId}/messages`)
  return r.json()
}

export async function deleteConversation(convId: string) {
  await fetch(`${LINAI_BASE}/conversations/${convId}`, { method: "DELETE" })
}

export async function renameConversation(convId: string, title: string) {
  await fetch(`${LINAI_BASE}/conversations/${convId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
}

// 全局主题保存函数，避免被vite优化
(window as any)._ts = function (hue: number, sat: number, light: number) {
  fetch("/api/settings/form", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme_hue: hue, theme_sat: sat, theme_light: light }),
  })
}