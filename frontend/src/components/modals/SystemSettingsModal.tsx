import { useState, useEffect } from "react";
import { X, ChevronDown, Upload, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const API = "/api";

async function loadSettings() {
  const r = await fetch(`${API}/settings/form`);
  return r.json();
}

async function saveSettings(data: Record<string, unknown>) {
  await fetch(`${API}/settings/form`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

interface SystemSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  { id: "api", label: "API 设置" },
  { id: "features", label: "功能" },
  { id: "data", label: "数据管理" },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

function APISettings() {
  const [genOpen, setGenOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [vpn, setVpn] = useState("");
  const [domain, setDomain] = useState("");
  const [imageApi, setImageApi] = useState("");
  const [ttsApi, setTtsApi] = useState("");
  const [imageEnabled, setImageEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setApiKey((s.api_key as string) || "");
      setServerUrl((s.linai_server_url as string) || "");
      setVpn((s.vpn_subscription as string) || "");
      setDomain((s.cloudflare_domain as string) || "");
      setImageApi((s.image_api_key as string) || "");
      setTtsApi((s.tts_api_key as string) || "");
      setImageEnabled(!!s.image_enabled);
      setTtsEnabled(!!s.tts_enabled);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      api_key: apiKey,
      linai_server_url: serverUrl,
      vpn_subscription: vpn,
      cloudflare_domain: domain,
      image_api_key: imageApi,
      tts_api_key: ttsApi,
      image_enabled: imageEnabled,
      tts_enabled: ttsEnabled,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div>
        <label className="text-sm font-medium text-foreground">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">云服务器链接</label>
        <input
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://..."
          className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">VPN 订阅</label>
        <input
          value={vpn}
          onChange={(e) => setVpn(e.target.value)}
          placeholder="订阅链接..."
          className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">海外域名</label>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="域名..."
          className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="border border-border/60 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setGenOpen(!genOpen)}
          className="flex w-full items-center justify-between p-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
        >
          生成服务
          <ChevronDown size={16} className={`transition-transform duration-200 ${genOpen ? "rotate-180" : ""}`} />
        </button>
        {genOpen && (
          <div className="border-t border-border/60 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">图片生成</span>
              <Switch checked={imageEnabled} onCheckedChange={setImageEnabled} />
            </div>
            <input
              value={imageApi}
              onChange={(e) => setImageApi(e.target.value)}
              placeholder="图片生成 API..."
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">语音服务</span>
              <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
            </div>
            <input
              value={ttsApi}
              onChange={(e) => setTtsApi(e.target.value)}
              placeholder="语音服务 API..."
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </div>
  );
}

interface FeatureToggleProps {
  label: string;
  children?: React.ReactNode;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
}

function FeatureToggle({ label, children, enabled: externalEnabled, onToggle }: FeatureToggleProps) {
  const [internalEnabled, setInternalEnabled] = useState(false);
  const enabled = externalEnabled !== undefined ? externalEnabled : internalEnabled;
  const setEnabled = onToggle || setInternalEnabled;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <div className="flex items-center justify-between py-2.5 px-1">
        <span className="text-sm text-foreground">{label}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      {enabled && children && (
        <div className="pb-3 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

function FeaturesSettings() {
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [momentsEnabled, setMomentsEnabled] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setNewsEnabled(!!s.news_enabled);
      setMcpEnabled(!!s.mcp_enabled);
      setMomentsEnabled(!!s.moments_enabled);
      setScheduleEnabled(!!s.scene_enabled);
      setEmailInput((s.user_email as string) || "");
      if (s.custom_logo) setLogoPreview(s.custom_logo as string);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await saveSettings({
      news_enabled: newsEnabled,
      mcp_enabled: mcpEnabled,
      moments_enabled: momentsEnabled,
      scene_enabled: scheduleEnabled,
      user_email: emailInput,
    });
    setSaving(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoPreview(result);
      localStorage.setItem("custom-logo", result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="animate-in fade-in duration-200">
      <FeatureToggle label="自定义 Logo">
        <div className="space-y-2">
          {logoPreview && (
            <div className="flex justify-center">
              <img src={logoPreview} alt="Logo" className="h-12 w-12 rounded-lg object-cover border border-border/60" />
            </div>
          )}
          <label className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-border cursor-pointer transition-colors">
            <Upload size={14} />
            上传 Logo
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          </label>
        </div>
      </FeatureToggle>

      <FeatureToggle label="MCP 工具" enabled={mcpEnabled} onToggle={setMcpEnabled} />

      <FeatureToggle label="邮箱发送">
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-muted-foreground shrink-0" />
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="your@email.com"
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </FeatureToggle>

      <FeatureToggle label="新闻推送" enabled={newsEnabled} onToggle={setNewsEnabled} />
      <FeatureToggle label="小红书使用" enabled={momentsEnabled} onToggle={setMomentsEnabled} />
      <FeatureToggle label="日程提醒" enabled={scheduleEnabled} onToggle={setScheduleEnabled} />

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 w-full py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "保存中..." : "保存设置"}
      </button>
    </div>
  );
}

function DataSettings() {
  const handleExport = (fmt: string) => {
    window.location.href = `/api/data/export?fmt=${fmt}`;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const r = await fetch("/api/data/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: text }),
    });
    const res = await r.json();
    alert(res.message || "导入完成");
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-200">
      <button
        type="button"
        onClick={() => handleExport("zip")}
        className="flex w-full items-center justify-center rounded-lg border border-border bg-accent/50 py-3 text-sm text-foreground hover:bg-accent transition-colors"
      >
        导出数据 ZIP
      </button>
      <button
        type="button"
        onClick={() => handleExport("json")}
        className="flex w-full items-center justify-center rounded-lg border border-border bg-accent/50 py-3 text-sm text-foreground hover:bg-accent transition-colors"
      >
        导出数据 JSON
      </button>
      <label className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
        导入数据
        <input type="file" accept=".json" className="hidden" onChange={handleImport} />
      </label>
    </div>
  );
}

export function SystemSettingsModal({ open, onClose }: SystemSettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("api");

  const handleClose = () => {
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl h-[80vh] rounded-2xl bg-popover border border-border overflow-hidden flex"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={18} />
        </button>

        {/* Left panel */}
        <div className="w-[30%] border-r border-border/60 p-4 pt-14 flex flex-col">
          <div className="space-y-1 flex-1">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[70%] p-5 pt-14 overflow-y-auto scrollbar-thin">
          {activeSection === "api" && <APISettings />}
          {activeSection === "features" && <FeaturesSettings />}
          {activeSection === "data" && <DataSettings />}
        </div>
      </div>
    </div>
  );
}
