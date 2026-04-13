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
  const el = qs("conversation-list");
  if (!el) return;
  el.innerHTML = "";
  state.conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = `conv-item${conv.id === state.currentConversationId ? " active" : ""}`;
    item.style.position = "relative";

    const titleEl = document.createElement("div");
    titleEl.className = "conv-title";
    titleEl.textContent = conv.title || "新对话";
    titleEl.style.cursor = "pointer";
    titleEl.onclick = async () => {
      state.currentConversationId = conv.id;
      localStorage.setItem("last_conversation_id", conv.id);
      await loadMessages(conv.id);
      renderConversations();
    };

    const timeEl = document.createElement("div");
    timeEl.className = "conv-time";
    timeEl.textContent = formatTime(conv.created_at);

    // 操作按钮（悬停显示）
    const actions = document.createElement("div");
    actions.style.cssText = "position:absolute;top:8px;right:8px;display:none;gap:4px;";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✏️";
    renameBtn.title = "重命名";
    renameBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:13px;padding:2px;";
    renameBtn.onclick = async (e) => {
      e.stopPropagation();
      const newTitle = prompt("重命名对话：", conv.title || "新对话");
      if (!newTitle || !newTitle.trim()) return;
      await api(`/api/conversations/${conv.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      await loadConversations();
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑️";
    deleteBtn.title = "删除";
    deleteBtn.style.cssText = "background:none;border:none;cursor:pointer;font-size:13px;padding:2px;";
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("删除这条对话？")) return;
      await api(`/api/conversations/${conv.id}`, { method: "DELETE" });
      if (state.currentConversationId === conv.id) {
        state.currentConversationId = null;
        localStorage.removeItem("last_conversation_id");
        state.messages = [];
        renderMessages();
      }
      await loadConversations();
    };

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    item.onmouseenter = () => (actions.style.display = "flex");
    item.onmouseleave = () => (actions.style.display = "none");

    item.appendChild(titleEl);
    item.appendChild(timeEl);
    item.appendChild(actions);
    el.appendChild(item);
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

      // 操作按钮组
      const actionsDiv = document.createElement("div");
      actionsDiv.style.cssText = "display:none;gap:4px;margin-top:6px;";
      div.onmouseenter = () => (actionsDiv.style.display = "flex");
      div.onmouseleave = () => (actionsDiv.style.display = "none");

      // 复制按钮
      const copyBtn = document.createElement("button");
      copyBtn.style.cssText =
        "background:transparent;border:none;cursor:pointer;font-size:12px;color:#9aa4b2;padding:2px 6px;border-radius:4px;";
      copyBtn.textContent = "复制";
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content).then(() => {
          copyBtn.textContent = "已复制";
          setTimeout(() => (copyBtn.textContent = "复制"), 1500);
        });
      };

      // 重试按钮（仅AI消息）
      const retryBtn = document.createElement("button");
      retryBtn.style.cssText =
        "background:transparent;border:none;cursor:pointer;font-size:12px;color:#9aa4b2;padding:2px 6px;border-radius:4px;";
      retryBtn.textContent = "重试";
      retryBtn.onclick = async () => {
        // 找到这条AI消息前面的用户消息
        const idx = state.messages.indexOf(msg);
        const prevUser = state.messages
          .slice(0, idx)
          .reverse()
          .find((m) => m.role === "user");
        if (!prevUser) return;
        const input = qs("composer-input");
        if (input) {
          input.value = prevUser.content;
          sendMessage();
        }
      };

      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(retryBtn);
      div.appendChild(actionsDiv);
    } else {
      const contentEl = document.createElement("div");
      contentEl.className = "msg-content";
      contentEl.innerHTML = escapeHtml(msg.content).replaceAll("\n", "<br>");
      div.appendChild(contentEl);

      // 用户消息操作按钮
      const userActionsDiv = document.createElement("div");
      userActionsDiv.style.cssText = "display:none;gap:4px;margin-top:6px;";
      div.onmouseenter = () => (userActionsDiv.style.display = "flex");
      div.onmouseleave = () => (userActionsDiv.style.display = "none");

      // 复制按钮
      const userCopyBtn = document.createElement("button");
      userCopyBtn.style.cssText =
        "background:transparent;border:none;cursor:pointer;font-size:12px;color:#9aa4b2;padding:2px 6px;border-radius:4px;";
      userCopyBtn.textContent = "复制";
      userCopyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content).then(() => {
          userCopyBtn.textContent = "已复制";
          setTimeout(() => (userCopyBtn.textContent = "复制"), 1500);
        });
      };

      // 修改按钮（把内容填回输入框）
      const editBtn = document.createElement("button");
      editBtn.style.cssText =
        "background:transparent;border:none;cursor:pointer;font-size:12px;color:#9aa4b2;padding:2px 6px;border-radius:4px;";
      editBtn.textContent = "修改";
      editBtn.onclick = () => {
        const input = qs("composer-input");
        if (input) {
          input.value = msg.content;
          input.focus();
        }
      };

      userActionsDiv.appendChild(userCopyBtn);
      userActionsDiv.appendChild(editBtn);
      div.appendChild(userActionsDiv);
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

  // 恢复上次对话
  const savedId = localStorage.getItem("last_conversation_id");
  const exists = savedId && state.conversations.find((c) => c.id === savedId);

  if (exists) {
    state.currentConversationId = savedId;
    await loadMessages(savedId);
  } else if (!state.currentConversationId && state.conversations.length) {
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

  try {
    const convId = state.currentConversationId || "new";
    const settings = state.settings || {};
    const ollamaMode = settings.ollama_mode;
    const ollamaBase = settings.ollama_base_url || "http://localhost:11434";
    const ollamaModel =
      settings.ollama_local_model || settings.primary_model || "gemma4";

    let res;
    if (ollamaMode) {
      // 浏览器直连本地Ollama
      res = await sendMessageOllama(convId, content, ollamaBase, ollamaModel);
    } else {
      res = await api(`/api/conversations/${convId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    }
    state.currentConversationId = res.conversation_id;
    localStorage.setItem("last_conversation_id", res.conversation_id);
    await loadConversations();
    await loadMessages(state.currentConversationId);
    await loadMemories();
    bcNotify("memory_changed");
    // 上下文余量提示
    const meta = res.context_meta || {};
    if (meta.token_pct >= 90) {
      showContextWarning(meta.token_pct, meta.token_used, meta.token_budget);
    } else {
      hideContextWarning();
    }
  } catch (err) {
    input.value = content;
    const loading = qs("msg-loading");
    if (loading) loading.remove();
    userDiv.remove();
    alert(`发送失败：${err.message || err}`);
    console.error("sendMessage failed:", err);
  } finally {
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
  startInitiativeHeartbeat();
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

function startInitiativeHeartbeat() {
  // 每5分钟触发一次主动发言检测，同时捞pending push
  const heartbeat = async () => {
    try {
      await api("/api/initiative/check");
      await api("/api/moments/check");
      await api("/api/scene/update");
      await checkPendingPush();
    } catch (e) {
      console.error("initiative heartbeat failed:", e);
    }
  };
  // 启动后2分钟首次触发，之后每5分钟一次
  setTimeout(() => {
    heartbeat();
    setInterval(heartbeat, 5 * 60 * 1000);
  }, 2 * 60 * 1000);
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

async function sendMessageOllama(convId, content, ollamaBase, model) {
  // 检测Ollama是否在线
  try {
    await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(3000) });
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
      stream: false,
    }),
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

async function saveAiSettings() {
  const apiKey = document.getElementById("api-url")?.value.trim() ?? "";
  const aiName = document.getElementById("ai-name-input")?.value.trim() ?? "";
  const payload = {};
  if (apiKey) payload.api_key = apiKey;
  if (aiName) payload.display_name = aiName;
  const imageProviderEl = document.getElementById("imageProvider");
  const imageApiKeyEl = document.getElementById("imageApiKey");
  if (imageProviderEl) payload.image_provider = imageProviderEl.value;
  if (imageApiKeyEl) payload.image_api_key = imageApiKeyEl.value.trim();
  const ttsVoiceEl = document.getElementById("ttsVoice");
  const ttsApiKeyEl = document.getElementById("ttsApiKey");
  const ttsSpeedEl = document.getElementById("ttsSpeed");
  if (ttsVoiceEl) payload.tts_voice = ttsVoiceEl.value.trim();
  if (ttsApiKeyEl) payload.tts_api_key = ttsApiKeyEl.value.trim();
  if (ttsSpeedEl) payload.tts_speed = parseFloat(ttsSpeedEl.value) || 1.0;
  payload.tts_provider = (document.getElementById("ttsProvider") || {}).value || "auto";
  const newsApiKeyEl = document.getElementById("newsApiKey");
  const newsKeywordsEl = document.getElementById("newsKeywords");
  if (newsKeywordsEl) payload.news_keywords = newsKeywordsEl.value.trim();
  if (newsApiKeyEl && newsApiKeyEl.value.trim()) payload.news_api_key = newsApiKeyEl.value.trim();
  payload.primary_model =
    typeof getSelectedModel === "function" ? getSelectedModel() : "";
  const serverUrlInput = document.getElementById("server-url-input");
  if (serverUrlInput && serverUrlInput.value.trim()) payload.server_url = serverUrlInput.value.trim();
  const vpnInput = document.getElementById("f-vpn_subscription");
  if (vpnInput && vpnInput.value.trim()) payload.vpn_subscription = vpnInput.value.trim();
  if (Object.keys(payload).length > 0) {
    try {
      await fetch("/api/settings/form", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("保存AI设置失败", e);
    }
  }
  const modal = document.getElementById("modal-ai-settings");
  if (modal) modal.style.display = "none";
  showSaveToast("AI设置已保存");
}

// ── Debug面板 ────────────────────────────────────────────
async function showDebugPanel() {
  if (window._debugPanelOpening) return;
  window._debugPanelOpening = true;
  setTimeout(() => { window._debugPanelOpening = false; }, 2000);
  let soulState = {}, settings = {}, usage = {};
  try { soulState = (await api("/api/soul/state")).state || {}; } catch(e) {}
  try { settings = (await api("/api/settings/form")).data || {}; } catch(e) {}
  try { usage = await api("/api/usage"); } catch(e) {}

  const sensitive = ["api_key","tts_api_key","image_api_key","smtp_pass","newsapi_key","vpn_subscription"];
  const safeSettings = Object.fromEntries(
    Object.entries(settings).map(([k,v]) => [k, sensitive.includes(k) ? "***" : v])
  );

  const existing = document.getElementById("debug-panel");
  if (existing) { existing.remove(); return; }

  const panel = document.createElement("div");
  panel.id = "debug-panel";
  panel.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;padding:24px;font-family:monospace;font-size:12px;color:#00ff88;overflow:auto;display:flex;flex-direction:column;gap:16px;";

  const sections = [
    { title: "🧠 Soul State", data: soulState },
    { title: "⚙️ Settings", data: safeSettings },
    { title: "📊 Usage", data: usage },
    { title: "🖥️ Frontend State", data: { currentConversationId: state.currentConversationId, messageCount: state.messages?.length || 0, runtime: state.runtime }},
  ];

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:16px;font-weight:bold;">🔍 SoulEngine Debug Console</span><button onclick="document.getElementById('debug-panel').remove()" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;">关闭</button></div>`;

  for (const s of sections) {
    html += `<div><div style="color:#7c9cff;font-weight:bold;margin-bottom:6px;">${s.title}</div><pre style="background:#0d1320;padding:12px;border-radius:8px;overflow:auto;margin:0;color:#00ff88;border:1px solid #1a2a4a;">${JSON.stringify(s.data, null, 2)}</pre></div>`;
  }

  panel.innerHTML = html;
  document.body.appendChild(panel);
}
// ── Debug面板结束 ─────────────────────────────────────────

// ── 朋友圈 ────────────────────────────────────────────────
async function openMoments() {
  document.getElementById("modal-moments").style.display = "flex";
  await loadMoments();
  // 触发检测是否该发新动态
  api("/api/moments/check").catch(() => {});
}

async function loadMoments() {
  const list = document.getElementById("moments-list");
  try {
    const res = await api("/api/moments");
    const moments = res.data || [];
    if (!moments.length) {
      list.innerHTML = '<div style="text-align:center;color:#9aa4b2;font-size:13px;padding:30px;">还没有动态</div>';
      return;
    }
    const aiName = (state.runtime && state.runtime.display_name) || "AI";
    list.innerHTML = moments.map(m => `
      <div style="background:#1b2130;border-radius:12px;padding:14px;border:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <img src="/static/ai-avatar.png" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#eef2ff;">${aiName}</div>
            <div style="font-size:11px;color:#9aa4b2;">${formatMomentTime(m.created_at)}</div>
          </div>
        </div>
        <div style="font-size:14px;color:#eef2ff;line-height:1.7;margin-bottom:10px;">${escapeHtml(m.text)}</div>
        ${m.image_url ? `<img src="${m.image_url}" style="width:100%;border-radius:8px;margin-bottom:10px;object-fit:cover;max-height:300px;">` : ''}
        <div style="display:flex;gap:16px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
          <button onclick="momentLike(${m.id}, this)" style="background:none;border:none;color:${m.liked ? '#7c9cff' : '#9aa4b2'};font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
            ♥ <span>${m.likes || 0}</span>
          </button>
          <button onclick="momentCollect(${m.id}, this)" style="background:none;border:none;color:${m.collected ? '#f59e0b' : '#9aa4b2'};font-size:12px;cursor:pointer;">
            ${m.collected ? '★ 已收藏' : '☆ 收藏'}
          </button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = '<div style="text-align:center;color:#9aa4b2;font-size:13px;padding:20px;">加载失败</div>';
  }
}

async function momentLike(id, btn) {
  try {
    const res = await api(`/api/moments/like/${id}`, { method: "POST" });
    if (res.ok) {
      const m = res.data;
      btn.style.color = m.liked ? "#7c9cff" : "#9aa4b2";
      btn.querySelector("span").textContent = m.likes || 0;
      // 点赞反馈给情绪系统
      if (m.liked) {
        api("/api/soul/state").then(r => {
          // 用户点赞说明喜欢这条内容，触发warmth上涨
          fetch("/api/moments/like_feedback", { method: "POST" }).catch(() => {});
        });
      }
    }
  } catch (e) {}
}

async function momentCollect(id, btn) {
  try {
    const res = await api(`/api/moments/collect/${id}`, { method: "POST" });
    if (res.ok) {
      btn.style.color = res.data.collected ? "#f59e0b" : "#9aa4b2";
      btn.textContent = res.data.collected ? "★ 已收藏" : "☆ 收藏";
    }
  } catch (e) {}
}

function formatMomentTime(isoStr) {
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff/60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff/3600)}小时前`;
    return `${Math.floor(diff/86400)}天前`;
  } catch(e) { return ""; }
}
// ── 朋友圈结束 ────────────────────────────────────────────
