const state = {
  runtime: null,
  conversations: [],
  currentConversationId: null,
  messages: [],
  settings: null,
};

function qs(id) {
  return document.getElementById(id);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");

  if (!res.ok) {
    const detail =
      (typeof data === "object" && data && (data.detail || data.message)) ||
      (typeof data === "string" ? data : "") ||
      `HTTP ${res.status}`;
    throw new Error(detail);
  }

  return data;
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function escapeHtml(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderRuntime() {
  if (!state.runtime) return;

  const brandTitle = qs("brand-title");
  if (brandTitle) brandTitle.textContent = state.runtime.app_title || "Lin System";

  const profileName = qs("profile-name");
  if (profileName) {
    const data = state.settings || {};
    const name = data.user_display_name || state.runtime.user_display_name || "用户";
    profileName.textContent = name;
  }
}

function renderConversations() {
  const listA = qs("conversation-list");
  const listB = qs("conversation-list-expanded");

  [listA, listB].forEach((el) => {
    if (!el) return;
    el.innerHTML = "";

    state.conversations.forEach((conv) => {
      const div = document.createElement("div");
      div.className =
        "conv-item" + (conv.id === state.currentConversationId ? " active" : "");
      div.innerHTML = `
        <div class="conv-title">${escapeHtml(conv.title)}</div>
        <div class="conv-time">${formatTime(conv.updated_at)}</div>
      `;
      div.onclick = async () => {
        state.currentConversationId = conv.id;
        await loadMessages(conv.id);
        renderConversations();
      };
      el.appendChild(div);
    });
  });
}

function renderMessages() {
  const el = qs("chat-scroll");
  if (!el) return;

  el.innerHTML = "";

  state.messages.forEach((msg) => {
    const div = document.createElement("div");
    div.className = `msg ${msg.role}`;

    const cost =
      msg.cost_estimate && Number(msg.cost_estimate) > 0
        ? ` · $${Number(msg.cost_estimate).toFixed(6)}`
        : "";

    const aiName = (state.runtime && state.runtime.display_name) || "AI";
    const senderName = msg.role === "assistant" ? aiName : "我";

    const senderEl = document.createElement("div");
    senderEl.className = "msg-sender";
    senderEl.textContent = senderName;
    div.appendChild(senderEl);

    if (msg.role === "assistant") {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "6px";
      row.style.maxWidth = "100%";
      const contentEl = document.createElement("div");
      contentEl.className = "msg-content";
      contentEl.style.flex = "1";
      contentEl.style.minWidth = "0";
      contentEl.innerHTML = escapeHtml(msg.content).replaceAll("\n", "<br>");
      row.appendChild(contentEl);
      const speakBtn = document.createElement("button");
      speakBtn.type = "button";
      speakBtn.className = "speak-btn";
      speakBtn.title = "朗读";
      speakBtn.innerHTML = "🔊";
      speakBtn.style.cssText =
        "flex-shrink:0;background:transparent;border:none;cursor:pointer;font-size:16px;line-height:1;padding:4px 2px;opacity:0.85;";
      speakBtn.onclick = async () => {
        speakBtn.innerHTML = "⏳";
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: msg.content }),
          });
          if (!res.ok) throw new Error("tts failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play();
          speakBtn.innerHTML = "🔊";
          audio.onended = () => URL.revokeObjectURL(url);
        } catch (e) {
          speakBtn.innerHTML = "🔊";
          console.error("TTS error:", e);
        }
      };
      row.appendChild(speakBtn);
      div.appendChild(row);
    } else {
      const contentEl = document.createElement("div");
      contentEl.className = "msg-content";
      contentEl.innerHTML = escapeHtml(msg.content).replaceAll("\n", "<br>");
      div.appendChild(contentEl);
    }

    const metaEl = document.createElement("div");
    metaEl.className = "msg-meta";
    metaEl.textContent = `${formatTime(msg.created_at)}${cost}`;
    div.appendChild(metaEl);

    el.appendChild(div);
  });

  el.scrollTop = el.scrollHeight;

  const conv = state.conversations.find((x) => x.id === state.currentConversationId);
  const chatTitle = qs("chat-title");
  if (chatTitle) chatTitle.textContent = conv ? conv.title : "新对话";

  const chatMeta = qs("chat-meta");
  if (chatMeta) chatMeta.textContent = `${state.messages.length} 条消息`;
}

function renderMemories(items) {
  const el = qs("memory-list");
  if (!el) return;

  el.innerHTML = "";
  items.forEach((m) => {
    const div = document.createElement("div");
    div.className = "memory-card";
    div.innerHTML = `
      <div class="memory-card-title">${escapeHtml(m.title)}</div>
      <div class="memory-card-meta">${m.kind} · weight ${m.weight} · ${m.pinned ? "pinned" : "dynamic"}</div>
      <div>${escapeHtml(m.content).replaceAll("\n", "<br>")}</div>
    `;
    el.appendChild(div);
  });
}

function renderUsage(data) {
  const el = qs("usage-panel");
  if (!el) return;
  el.innerHTML = `
    <div>消息数：${data.messages}</div>
    <div>输入 token：${data.token_in}</div>
    <div>输出 token：${data.token_out}</div>
    <div>累计预估成本：$${Number(data.cost).toFixed(6)}</div>
  `;
}

function setFormValue(id, value) {
  const el = qs(id);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = Boolean(value);
  } else {
    el.value = value ?? "";
  }
}

function getFormValue(id) {
  const el = qs(id);
  if (!el) return "";
  if (el.type === "checkbox") return el.checked;
  return el.value;
}

function applyAiBubbleColor() {
  const root = document.documentElement;
  const s = state.settings || {};
  if (s.ai_bubble_color) {
    root.style.setProperty('--ai-bubble', s.ai_bubble_color);
  } else {
    const userColor = getComputedStyle(root).getPropertyValue('--user');
    root.style.setProperty('--ai-bubble', userColor);
  }
}

function fillSettingsForm(data) {
  state.settings = data || {};

  setFormValue("f-app_title", data.app_title);
  setFormValue("f-subtitle", data.subtitle);
  setFormValue("f-display_name", data.display_name);
  setFormValue("f-user_display_name", data.user_display_name);
  setFormValue("f-user_birthday", data.user_birthday || "");
  setFormValue("f-user_city", data.user_city || "");
  setFormValue("f-access_token", data.access_token);
  setFormValue("f-api_base_url", data.api_base_url);
  setFormValue("f-api_key", data.api_key);
  const imageProviderEl = document.getElementById("imageProvider");
  if (imageProviderEl) imageProviderEl.value = data.image_provider || "dalle";
  const imageApiKeyEl = document.getElementById("imageApiKey");
  if (imageApiKeyEl) imageApiKeyEl.value = data.image_api_key || "";
  const ttsVoiceEl = document.getElementById("ttsVoice");
  if (ttsVoiceEl) ttsVoiceEl.value = data.tts_voice || "";
  const ttsApiKeyEl = document.getElementById("ttsApiKey");
  if (ttsApiKeyEl) ttsApiKeyEl.value = data.tts_api_key || "";
  const ttsSpeedEl = document.getElementById("ttsSpeed");
  if (ttsSpeedEl)
    ttsSpeedEl.value =
      data.tts_speed != null && data.tts_speed !== "" ? String(data.tts_speed) : "1.0";
  const ttsProviderEl = document.getElementById("ttsProvider");
  if (ttsProviderEl) ttsProviderEl.value = data.tts_provider || "auto";
  const newsApiKeyEl = document.getElementById("newsApiKey");
  if (newsApiKeyEl) newsApiKeyEl.value = data.news_api_key || "";
  const newsKeywordsEl = document.getElementById("newsKeywords");
  if (newsKeywordsEl) newsKeywordsEl.value = data.news_keywords || "";
  setFormValue("f-proxy_url", data.proxy_url || "");
  setFormValue("f-primary_model", data.primary_model);
  setFormValue("f-summary_model", data.summary_model);
  setFormValue("f-system_goal", data.system_goal);
  setFormValue("f-persona_core", data.persona_core);
  setFormValue("f-relationship_context", data.relationship_context);
  setFormValue("f-user_summary", data.user_summary);
  setFormValue("f-primary_temperature", data.primary_temperature);
  setFormValue("f-primary_max_tokens", data.primary_max_tokens);
  setFormValue("f-summary_temperature", data.summary_temperature);
  setFormValue("f-summary_max_tokens", data.summary_max_tokens);
  setFormValue("f-enable_cache", data.enable_cache);
  setFormValue("f-auto_summary_enabled", data.auto_summary_enabled);
  setFormValue("f-heartbeat_enabled", data.heartbeat_enabled);

  renderRuntime();
  applyAiBubbleColor();
}

function collectSettingsForm() {
  return {
    app_title: getFormValue("f-app_title"),
    subtitle: getFormValue("f-subtitle"),
    display_name: getFormValue("f-display_name"),
    user_display_name: getFormValue("f-user_display_name"),
    user_birthday: getFormValue("f-user_birthday"),
    user_city: getFormValue("f-user_city"),
    access_token: getFormValue("f-access_token"),
    api_base_url: getFormValue("f-api_base_url"),
    api_key: getFormValue("f-api_key"),
    image_provider: (() => {
      const el = document.getElementById("imageProvider");
      return el ? el.value : "";
    })(),
    image_api_key: (() => {
      const el = document.getElementById("imageApiKey");
      return el ? el.value : "";
    })(),
    tts_voice: (() => {
      const el = document.getElementById("ttsVoice");
      return el ? el.value : "";
    })(),
    tts_api_key: (() => {
      const el = document.getElementById("ttsApiKey");
      return el ? el.value : "";
    })(),
    tts_speed: (() => {
      const el = document.getElementById("ttsSpeed");
      return el ? parseFloat(el.value) || 1.0 : 1.0;
    })(),
    tts_provider: (() => {
      const el = document.getElementById("ttsProvider");
      return el ? el.value || "auto" : "auto";
    })(),
    news_api_key: (document.getElementById("newsApiKey") || {}).value || "",
    news_keywords: (document.getElementById("newsKeywords") || {}).value || "",
    primary_model: getFormValue("f-primary_model"),
    summary_model: getFormValue("f-summary_model"),
    system_goal: getFormValue("f-system_goal"),
    persona_core: getFormValue("f-persona_core"),
    relationship_context: getFormValue("f-relationship_context"),
    user_summary: getFormValue("f-user_summary"),
    primary_temperature: Number(getFormValue("f-primary_temperature") || 0.65),
    primary_max_tokens: Number(getFormValue("f-primary_max_tokens") || 700),
    summary_temperature: Number(getFormValue("f-summary_temperature") || 0.25),
    summary_max_tokens: Number(getFormValue("f-summary_max_tokens") || 220),
    enable_cache: Boolean(getFormValue("f-enable_cache")),
    auto_summary_enabled: Boolean(getFormValue("f-auto_summary_enabled")),
    heartbeat_enabled: Boolean(getFormValue("f-heartbeat_enabled")),
    proxy_url: getFormValue("f-proxy_url"),
  };
}

async function loadRuntime() {
  state.runtime = await api("/api/runtime");
  renderRuntime();
}

async function loadSettingsForm() {
  const res = await api("/api/settings/form");
  fillSettingsForm(res.data || {});
  const usage = await api("/api/usage");
  renderUsage(usage);
}

async function saveSettingsForm() {
  const raw = collectSettingsForm();
  const prev = state.settings || {};
  const payload = {};
  for (const key of Object.keys(raw)) {
    const val = raw[key];
    const isEmpty = val === "" || val === null || val === undefined;
    payload[key] = isEmpty ? (prev[key] ?? val) : val;
  }
  const res = await api("/api/settings/form", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  fillSettingsForm(res.data || {});
  await loadRuntime();
  await loadSettingsForm();
  bcNotify("settings_changed");
}

async function loadConversations() {
  state.conversations = await api("/api/conversations");
  renderConversations();

  if (!state.currentConversationId && state.conversations.length) {
    state.currentConversationId = state.conversations[0].id;
    await loadMessages(state.currentConversationId);
  } else if (!state.currentConversationId) {
    state.messages = [];
    renderMessages();
  }
}

async function loadMessages(conversationId) {
  state.messages = await api(`/api/conversations/${conversationId}/messages`);
  renderMessages();
}

async function loadMemories() {
  const items = await api("/api/memories");
  renderMemories(items);
}

async function createConversation() {
  const conv = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ title: "新对话" }),
  });

  state.conversations.unshift(conv);
  state.currentConversationId = conv.id;
  state.messages = [];
  renderConversations();
  renderMessages();
}

function createAssistantBubble() {
  const chatScroll = qs("chat-scroll");
  const aiName = (state.runtime && state.runtime.display_name) || "AI";
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.id = "msg-streaming";

  const senderEl = document.createElement("div");
  senderEl.className = "msg-sender";
  senderEl.textContent = aiName;
  div.appendChild(senderEl);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "flex-start";
  row.style.gap = "6px";
  row.style.maxWidth = "100%";

  const contentEl = document.createElement("div");
  contentEl.className = "msg-content";
  contentEl.style.flex = "1";
  contentEl.style.minWidth = "0";
  row.appendChild(contentEl);

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "speak-btn";
  speakBtn.title = "朗读";
  speakBtn.innerHTML = "🔊";
  speakBtn.style.cssText =
    "flex-shrink:0;background:transparent;border:none;cursor:pointer;font-size:16px;line-height:1;padding:4px 2px;opacity:0.85;";
  row.appendChild(speakBtn);
  div.appendChild(row);

  if (chatScroll) {
    chatScroll.appendChild(div);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  return { root: div, contentEl, speakBtn };
}

function appendToBubble(contentEl, text) {
  if (!contentEl._acc) contentEl._acc = "";
  contentEl._acc += text;
  contentEl.innerHTML = escapeHtml(contentEl._acc).replaceAll("\n", "<br>");
  const chatScroll = qs("chat-scroll");
  if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
}

function attachSpeakButton(speakBtn, fullText) {
  speakBtn.onclick = async () => {
    speakBtn.innerHTML = "⏳";
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText }),
      });
      if (!r.ok) throw new Error("tts failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
      speakBtn.innerHTML = "🔊";
      audio.onended = () => URL.revokeObjectURL(url);
    } catch (e) {
      speakBtn.innerHTML = "🔊";
      console.error("TTS error:", e);
    }
  };
}

async function sendMessageStream(messages, options) {
  const { model, temperature, max_tokens, signal, conversationId } = options;
  const { root: bubbleRoot, contentEl, speakBtn } = createAssistantBubble();

  const resp = await fetch(`/api/conversations/${options.conversationId || "new"}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: messages[messages.length - 1].content }),
    signal,
  });

  if (!resp.ok) {
    bubbleRoot.remove();
    const t = await resp.text();
    let detail = "";
    try {
      const j = JSON.parse(t);
      detail = j.detail || j.message || t;
    } catch {
      detail = t || `HTTP ${resp.status}`;
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.replace(/\r$/, "");
      if (!trimmed.startsWith("data: ")) continue;
      const raw = trimmed.slice(6).trim();
      if (raw === "[DONE]") {
        const fullText = contentEl._acc || "";
        attachSpeakButton(speakBtn, fullText);
        return { fullText, options };
      }
      try {
        const obj = JSON.parse(raw);
        if (obj.error != null) {
          bubbleRoot.remove();
          throw new Error(String(obj.error));
        }
        const text = obj.type === "text" ? obj.text : null;
        if (text) appendToBubble(contentEl, text);
        if (obj.type === "meta") options._meta = obj;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  const fullText = contentEl._acc || "";
  attachSpeakButton(speakBtn, fullText);
  return { fullText, options };
}

async function sendMessage() {
  const input = qs("composer-input");
  if (!input) return;

  const content = input.value.trim();
  if (!content) return;

  const sendBtn = qs("send-btn");
  if (sendBtn) sendBtn.disabled = true;
  input.value = "";

  // 立刻显示用户消息
  const chatScroll = qs("chat-scroll");
  const userDiv = document.createElement("div");
  userDiv.className = "msg user";
  userDiv.innerHTML = `
    <div class="msg-sender">我</div>
    <div class="msg-content">${escapeHtml(content).replaceAll("\n", "<br>")}</div>
  `;
  if (chatScroll) {
    chatScroll.appendChild(userDiv);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  // 显示AI加载动画
  const aiName = (state.runtime && state.runtime.display_name) || "AI";
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "msg assistant";
  loadingDiv.id = "msg-loading";

  const senderEl = document.createElement("div");
  senderEl.className = "msg-sender";
  senderEl.textContent = aiName;
  loadingDiv.appendChild(senderEl);

  const ecgLoader = typeof createEcgLoader === "function" ? createEcgLoader() : null;
  if (ecgLoader) {
    loadingDiv.appendChild(ecgLoader);
  }

  if (chatScroll) {
    chatScroll.appendChild(loadingDiv);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  let timeoutId;
  try {
    const convId = state.currentConversationId || "new";
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
    const signal = controller.signal;
    const settings = state.settings || {};
    const ollamaMode = settings.ollama_mode;
    const ollamaBase = settings.ollama_base_url || "http://localhost:11434";
    const ollamaModel =
      settings.ollama_local_model || settings.primary_model || "gemma4";

    let res;
    if (ollamaMode) {
      // 浏览器直连本地Ollama
      res = await sendMessageOllama(convId, content, ollamaBase, ollamaModel, signal);
    } else {
      const loading = qs("msg-loading");
      if (loading) loading.remove();
      const model = settings.primary_model || "openai/gpt-4o";
      const temperature = Number(settings.primary_temperature ?? 0.65);
      const max_tokens = Number(settings.primary_max_tokens ?? 700);
      const history = (state.messages || []).slice(-8).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
      history.push({ role: "user", content });
      const streamOptions = {
        model,
        temperature,
        max_tokens,
        signal,
        conversationId: convId,
      };
      await sendMessageStream(history, streamOptions);
      clearTimeout(timeoutId);
      const meta = streamOptions._meta || {};
      res = {
        conversation_id: meta.conversation_id || convId,
        context_meta: {},
      };
    }
    state.currentConversationId = res.conversation_id;
    await loadConversations();
    await loadMessages(state.currentConversationId);
    await loadMemories();
    bcNotify("memory_changed");
    // 上下文余量提示
    const ctxMeta = res.context_meta || {};
    if (ctxMeta.token_pct >= 90) {
      showContextWarning(ctxMeta.token_pct, ctxMeta.token_used, ctxMeta.token_budget);
    } else {
      hideContextWarning();
    }
  } catch (err) {
    input.value = content;
    const loading = qs("msg-loading");
    if (loading) loading.remove();
    const streaming = qs("msg-streaming");
    if (streaming) streaming.remove();
    userDiv.remove();
    // 不用alert，用非阻塞提示
    const errDiv = document.createElement("div");
    errDiv.style.cssText =
      "position:fixed;top:20px;right:20px;background:#ff4444;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;";
    errDiv.textContent =
      err.name === "AbortError" ? "响应超时，请重试" : `发送失败：${err.message || err}`;
    document.body.appendChild(errDiv);
    setTimeout(() => errDiv.remove(), 4000);
    console.error("sendMessage failed:", err);
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

function bindClick(id, handler) {
  const el = qs(id);
  if (!el) return;
  el.onclick = handler;
}

function bindEvents() {
  bindClick("new-chat-btn", createConversation);
  bindClick("new-chat-btn-expanded", createConversation);

  const sendBtn = qs("send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      sendMessage();
    });
  }

  const composerInput = qs("composer-input");
  if (composerInput) {
    composerInput.focus();
    composerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        sendMessage();
      }
    });
    composerInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 160) + "px";
    });
  }

  bindClick("close-settings-btn", () => {
    const el = qs("settings-drawer");
    if (el) el.classList.add("hidden");
  });

  bindClick("close-memory-btn", () => {
    const el = qs("memory-drawer");
    if (el) el.classList.add("hidden");
  });

  bindClick("save-settings-btn", saveSettingsForm);

  bindClick("apply-vpn-btn", async () => {
    const url = qs("f-vpn-subscription")
      ? document.getElementById("f-vpn_subscription").value
      : "";
    if (!url) return alert("请先填入订阅链接");
    const res = await api("/api/proxy/apply", {
      method: "POST",
      body: JSON.stringify({ subscription_url: url }),
    });
    alert(res.message || (res.success ? "更新成功" : "更新失败"));
  });
}

async function boot() {
  await loadRuntime();
  await loadConversations();
  await loadSettingsForm();
  await loadMemories();
  await checkPendingPush();
  syncSoulState();
  setInterval(syncSoulState, 3 * 60 * 1000); // 每3分钟同步一次情绪状态
}

function showContextWarning(pct, used, budget) {
  let el = document.getElementById("context-warning");
  if (!el) {
    el = document.createElement("div");
    el.id = "context-warning";
    el.style.cssText =
      "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:8px 16px;font-size:13px;color:#856404;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
    document.body.appendChild(el);
  }
  el.style.display = "block";
  el.innerHTML = `⚠️ 上下文已用 ${pct}%（${used}/${budget} token），对话将自动压缩`;
}

function hideContextWarning() {
  const el = document.getElementById("context-warning");
  if (el) el.style.display = "none";
}

// 跨窗口同步
const _bc = new BroadcastChannel("linai_sync");
_bc.onmessage = async (e) => {
  if (e.data === "settings_changed") {
    await loadSettingsForm();
  }
  if (e.data === "memory_changed") {
    await loadMemories();
  }
};
function bcNotify(type) {
  try {
    _bc.postMessage(type);
  } catch (e) {}
}

// 情绪状态同步到CSS变量
async function syncSoulState() {
  try {
    const res = await api("/api/soul/state");
    const s = res.state || {};

    const energy = s.energy ?? 0.8;
    const warmth = s.warmth ?? 0.5;
    const loneliness = s.loneliness ?? 0.0;
    const volatility = s._volatility ?? 0.0;
    const stress = s._stress ?? 0.0;
    const excitement = s._excitement ?? 0.0;
    const moodTag = s.mood_tag || "calm";

    const root = document.documentElement;

    // 亲密度影响主色调温度
    const hue = Math.round(200 - warmth * 40); // 冷蓝→暖橙
    root.style.setProperty("--mood-hue", hue);
    root.style.setProperty("--mood-energy", energy.toFixed(2));
    root.style.setProperty("--mood-warmth", warmth.toFixed(2));

    // 波动性影响边框/阴影强度
    const glowIntensity = Math.round(volatility * 12);
    root.style.setProperty("--mood-glow", `${glowIntensity}px`);

    // 寂寞值影响背景亮度（越寂寞越暗）
    const bgL = Math.round(97 - loneliness * 8);
    root.style.setProperty("--mood-bg-l", `${bgL}%`);

    // 情绪突变触发glitch
    const prevTag = window._lastMoodTag || "calm";
    if (prevTag !== moodTag && (volatility > 0.5 || stress > 0.6)) {
      triggerGlitch();
    }
    window._lastMoodTag = moodTag;
  } catch (e) {
    console.error("syncSoulState failed:", e);
  }
}

function triggerGlitch() {
  const el = document.querySelector(".chat-area") || document.body;
  el.classList.add("glitch-active");
  setTimeout(() => el.classList.remove("glitch-active"), 600);
}

async function checkPendingPush() {
  try {
    const res = await api("/api/push/pending");
    const items = res.data || [];
    if (!items.length) return;
    // 延迟3秒再推，让页面先加载完
    setTimeout(() => {
      items.forEach((item, idx) => {
        setTimeout(() => {
          const cid = state.currentConversationId;
          if (!cid) return;
          const nowIso = new Date().toISOString();
          state.messages.push({
            role: "assistant",
            content: item.content,
            created_at: nowIso,
          });
          renderMessages();
        }, idx * 1500); // 多条消息间隔1.5秒
      });
    }, 3000);
  } catch (e) {
    console.error("checkPendingPush failed:", e);
  }
}

// 日程提醒轮询 + Web Notification
async function checkDueSchedules() {
  try {
    const res = await fetch("/api/schedules/due");
    const data = await res.json();
    for (const item of data.due || []) {
      showScheduleNotification(item);
      await fetch(`/api/schedules/${item.id}/done`, { method: "POST" });
    }
  } catch (e) {}
}

function showScheduleNotification(item) {
  const safeTitle = escapeHtml(item.title || "");
  const safeNote = item.note ? escapeHtml(item.note) : "";

  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:9999;
    background:#fff;border:1px solid #e5e5e5;border-radius:12px;
    padding:16px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.12);
    max-width:300px;font-size:14px;line-height:1.5;
  `;
  el.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">⏰ 日程提醒</div>
    <div>${safeTitle}</div>
    ${
      safeNote
        ? `<div style="color:#999;font-size:12px;margin-top:4px;">${safeNote}</div>`
        : ""
    }
    <button type="button" class="schedule-toast-dismiss" style="
      margin-top:10px;padding:4px 12px;border:none;
      background:#f0f0f0;border-radius:6px;cursor:pointer;font-size:12px;
    ">知道了</button>
  `;
  const btn = el.querySelector(".schedule-toast-dismiss");
  if (btn) {
    btn.addEventListener("click", () => el.remove());
  }
  document.body.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.remove();
  }, 30000);

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("⏰ " + String(item.title || ""), {
        body: item.note ? String(item.note) : "",
        icon: "/static/ai-avatar.png",
      });
    } catch (_) {}
  }
}

async function sendMessageOllama(convId, content, ollamaBase, model, signal) {
  // 检测Ollama是否在线
  try {
    const tagsSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
      : AbortSignal.timeout(3000);
    await fetch(`${ollamaBase}/api/tags`, { signal: tagsSignal });
  } catch (e) {
    throw new Error("本地Ollama未启动，请先运行Ollama");
  }

  // 构建消息历史
  const history = (state.messages || []).slice(-8).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  history.push({ role: "user", content });

  // 调用本地Ollama
  const resp = await fetch(`${ollamaBase}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      messages: history,
    }),
    signal,
  });
  if (!resp.ok) throw new Error("Ollama请求失败");
  const data = await resp.json();
  const replyText = data.choices?.[0]?.message?.content || "";

  // 把消息存到后端
  const saveRes = await api(`/api/conversations/${convId}/messages/ollama`, {
    method: "POST",
    body: JSON.stringify({
      user_content: content,
      assistant_content: replyText,
    }),
    signal,
  });
  return saveRes;
}

// ── AI头像自动生成 ────────────────────────────────────────

async function triggerGenerateAvatar() {
  const btn = document.getElementById("btn-generate-avatar");
  const status = document.getElementById("avatar-generate-status");

  if (!btn || !status) return;

  btn.disabled = true;
  btn.textContent = "⏳ 生成中，请稍候...";
  status.textContent = "正在调用 DALL-E，约需 15-30 秒";

  try {
    const res = await fetch("/api/avatar/generate", { method: "POST" });
    const data = await res.json();

    if (data.success) {
      status.textContent = "✅ 生成成功！";
      // 强制刷新所有头像（加时间戳防缓存）
      refreshAvatarImages(data.ts || Date.now());
    } else {
      status.textContent = `❌ ${data.message || "生成失败"}`;
    }
  } catch (e) {
    status.textContent = "❌ 请求失败，检查网络";
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ AI自动生成头像（梦境层）";
  }
}

function refreshAvatarImages(ts) {
  const ids = [
    "ai-avatar-collapsed",
    "ai-avatar-expanded",
    "ai-avatar-preview",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.src = `/static/ai-avatar.png?t=${ts}`;
    }
  });
}

// 梦境层后台轮询：检测头像是否被自动更新
(function startAvatarPolling() {
  let lastTs = 0;

  async function checkAvatarUpdate() {
    try {
      const res = await fetch("/api/avatar/current-ts");
      const data = await res.json();
      if (data.ts && data.ts !== lastTs && lastTs !== 0) {
        // 头像被后台更新了
        refreshAvatarImages(data.ts);
        console.log("[叮咚] 梦境层触发：AI头像已自动更新");
      }
      lastTs = data.ts || lastTs;
    } catch (_) {}
  }

  // 每2分钟检查一次（梦境触发概率低，不需要频繁轮询）
  setInterval(checkAvatarUpdate, 120_000);
  checkAvatarUpdate(); // 启动时先查一次
})();

// ── AI头像自动生成结束 ────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const loginOverlay = qs("login-overlay");
  if (loginOverlay) loginOverlay.remove();

  bindEvents();

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }

  setInterval(checkDueSchedules, 60000);
  checkDueSchedules();

  boot().catch((err) => {
    console.error("boot failed:", err);
    alert(`页面初始化失败：${err.message || err}`);
  });
});

// ── 备考知识库 ────────────────────────────────────────────
async function openStudyModal() {
  document.getElementById("modal-study").style.display = "flex";
  await studyLoadList();
}

async function studyLoadList() {
  const listEl = document.getElementById("study-list");
  try {
    const res = await api("/api/study/list");
    const items = res.data || [];
    if (!items.length) {
      listEl.innerHTML = '<div style="font-size:12px;color:#ccc;text-align:center;padding:12px;">暂无内容</div>';
      return;
    }
    listEl.innerHTML = items.map(item => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid #f0f0f0;border-radius:8px;">
        <div>
          <div style="font-size:13px;color:#333;">${item.title}</div>
          <div style="font-size:11px;color:#bbb;margin-top:2px;">${item.chunks}段 · ${item.source || ''}</div>
        </div>
        <button onclick="studyDelete('${item.title}')" style="background:none;border:none;color:#ccc;cursor:pointer;font-size:16px;">×</button>
      </div>
    `).join("");
  } catch (e) {
    listEl.innerHTML = '<div style="font-size:12px;color:#f00;">加载失败</div>';
  }
}

async function studyImportUrl() {
  const input = document.getElementById("study-url-input");
  const status = document.getElementById("study-import-status");
  const url = input.value.trim();
  if (!url) return;
  status.textContent = "导入中...";
  try {
    const res = await api("/api/study/url", { method: "POST", body: JSON.stringify({ url }) });
    status.textContent = res.message || "完成";
    input.value = "";
    await studyLoadList();
  } catch (e) {
    status.textContent = "导入失败";
  }
}

async function studyUploadFile(input) {
  const status = document.getElementById("study-import-status");
  const file = input.files[0];
  if (!file) return;
  status.textContent = "上传中...";
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/study/upload", { method: "POST", body: form });
    const data = await res.json();
    status.textContent = data.message || "完成";
    await studyLoadList();
  } catch (e) {
    status.textContent = "上传失败";
  }
  input.value = "";
}

async function studyDelete(titleBase) {
  await api(`/api/study/${encodeURIComponent(titleBase)}`, { method: "DELETE" });
  await studyLoadList();
}

async function studyGenerateQuiz() {
  const topic = document.getElementById("study-quiz-topic").value.trim();
  const count = parseInt(document.getElementById("study-quiz-count").value);
  const area = document.getElementById("study-quiz-area");
  area.innerHTML = '<div style="font-size:12px;color:#999;">出题中...</div>';
  try {
    const res = await api("/api/study/quiz", { method: "POST", body: JSON.stringify({ topic, count }) });
    const questions = res.data || [];
    if (!questions.length) {
      area.innerHTML = '<div style="font-size:12px;color:#999;">知识库内容不足，请先导入内容</div>';
      return;
    }
    area.innerHTML = questions.map((q, i) => `
      <div style="padding:12px;border:1px solid #f0f0f0;border-radius:8px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:8px;">${i+1}. ${q.q}</div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px;">
          ${q.options.map(o => `
            <label style="font-size:12px;color:#555;cursor:pointer;display:flex;align-items:center;gap:6px;">
              <input type="radio" name="quiz_${i}" value="${o[0]}"> ${o}
            </label>
          `).join("")}
        </div>
        <div class="quiz-answer" style="display:none;font-size:12px;color:#1a1a1a;padding:6px 10px;background:#f9f9f9;border-radius:6px;">
          ✓ ${q.answer} · ${q.explain}
        </div>
        <button onclick="this.previousElementSibling.style.display='block';this.style.display='none'" style="font-size:11px;color:#999;background:none;border:none;cursor:pointer;padding:0;">查看答案</button>
      </div>
    `).join("");
  } catch (e) {
    area.innerHTML = '<div style="font-size:12px;color:#f00;">出题失败</div>';
  }
}

// ── 数据导出导入 ──────────────────────────────────────────
function exportData(fmt) {
  window.open(`/api/data/export?fmt=${fmt}`, "_blank");
}

async function importData(input) {
  const status = document.getElementById("import-status");
  const file = input.files[0];
  if (!file) return;
  status.textContent = "导入中...";
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/data/import", { method: "POST", body: form });
    const data = await res.json();
    status.textContent = data.message || (data.ok ? "完成" : "失败");
    status.style.color = data.ok ? "#1a1a1a" : "#f00";
  } catch (e) {
    status.textContent = "导入失败";
    status.style.color = "#f00";
  }
  input.value = "";
}
