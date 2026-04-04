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
    div.innerHTML = `
      <div class="msg-sender">${escapeHtml(senderName)}</div>
      <div class="msg-content">${escapeHtml(msg.content).replaceAll("\n", "<br>")}</div>
      <div class="msg-meta">${formatTime(msg.created_at)}${cost}</div>
    `;
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
  setFormValue("f-access_token", data.access_token);
  setFormValue("f-api_base_url", data.api_base_url);
  setFormValue("f-api_key", data.api_key);
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
    access_token: getFormValue("f-access_token"),
    api_base_url: getFormValue("f-api_base_url"),
    api_key: getFormValue("f-api_key"),
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
    const res = await api(`/api/conversations/${convId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    state.currentConversationId = res.conversation_id;
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

document.addEventListener("DOMContentLoaded", () => {
  const loginOverlay = qs("login-overlay");
  if (loginOverlay) loginOverlay.remove();

  bindEvents();

  boot().catch((err) => {
    console.error("boot failed:", err);
    alert(`页面初始化失败：${err.message || err}`);
  });
});
