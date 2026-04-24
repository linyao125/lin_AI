import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { X, ChevronDown, Upload, Mail, MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { synthesizeTTS } from "@/lib/linai";

const API = "/api";

async function loadSettings() {
  const r = await fetch(`${API}/settings/form`);
  const res = await r.json();
  return res.data || res;
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
  { id: "api", label: "生成服务" },
  { id: "voice", label: "语音" },
  { id: "features", label: "功能" },
  { id: "data", label: "数据管理" },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

const IMAGE_TYPES = [
  { value: "realistic", label: "写真" },
  { value: "anime", label: "动漫" },
  { value: "illustration", label: "插画" },
  { value: "3d", label: "3D渲染" },
];

const TTS_VOICES = [
  { value: "alloy", label: "Alloy（中性）" },
  { value: "echo", label: "Echo（男声）" },
  { value: "fable", label: "Fable（英式）" },
  { value: "onyx", label: "Onyx（低沉）" },
  { value: "nova", label: "Nova（女声）" },
  { value: "shimmer", label: "Shimmer（轻柔）" },
];

const APISettings = forwardRef<{ save: () => Promise<void> }>(function APISettings(_, ref) {
  const [genOpen, setGenOpen] = useState(false);
  const [vpnOpen, setVpnOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [vpn, setVpn] = useState("");
  const [imageApi, setImageApi] = useState("");
  const [ttsApi, setTtsApi] = useState("");
  const [imageEnabled, setImageEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [imageType, setImageType] = useState("realistic");
  const [ttsVoice, setTtsVoice] = useState("nova");
  const [nodes, setNodes] = useState<{ name: string; type: string; delay: number }[]>([]);
  const [currentNode, setCurrentNode] = useState("");
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [selectingNode, setSelectingNode] = useState("");

  const fetchNodes = async () => {
    setLoadingNodes(true);
    try {
      const r = await fetch(`${API}/proxy/nodes`);
      const data = await r.json();
      setNodes(data.nodes || []);
      setCurrentNode(data.current || "");
    } catch {
      setNodes([]);
    }
    setLoadingNodes(false);
  };

  useEffect(() => {
    loadSettings().then((s) => {
      setApiKey((s.api_key as string) || "");
      setServerUrl((s.linai_server_url as string) || "");
      setVpn((s.vpn_subscription as string) || "");
      setImageApi((s.image_api_key as string) || "");
      setTtsApi((s.tts_api_key as string) || "");
      setImageEnabled(!!s.image_enabled);
      setTtsEnabled(!!s.tts_enabled);
      setImageType((s.image_type as string) || "realistic");
      setTtsVoice((s.tts_voice as string) || "nova");
      if (s.vpn_subscription) {
        setVpnOpen(true);
        void fetchNodes();
      }
    });
  }, []);

  const selectNode = async (name: string) => {
    setSelectingNode(name);
    try {
      await fetch(`${API}/proxy/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setCurrentNode(name);
    } catch {
      /* ignore */
    }
    setSelectingNode("");
  };

  const handleSave = async () => {
    await saveSettings({
      api_key: apiKey,
      linai_server_url: serverUrl,
      vpn_subscription: vpn,
      image_api_key: imageApi,
      tts_api_key: ttsApi,
      image_enabled: imageEnabled,
      tts_enabled: ttsEnabled,
      image_type: imageType,
      tts_voice: ttsVoice,
    });
    if (vpn) {
      await fetch(`${API}/proxy/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_url: vpn }),
      });
      setVpnOpen(true);
      await fetchNodes();
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave }), [
    apiKey, serverUrl, vpn, imageApi, ttsApi,
    imageEnabled, ttsEnabled, imageType, ttsVoice
  ]);

  const delayColor = (delay: number) => {
    if (delay < 200) return "text-green-500";
    if (delay < 500) return "text-yellow-500";
    return "text-orange-500";
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

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">VPN 订阅</label>
        <input
          value={vpn}
          onChange={(e) => setVpn(e.target.value)}
          placeholder="订阅链接..."
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {vpn && (
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setVpnOpen(!vpnOpen);
                if (!vpnOpen) void fetchNodes();
              }}
              className="flex w-full items-center justify-between p-3 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                节点选择
                {currentNode && (
                  <span className="text-xs text-muted-foreground font-normal truncate max-w-[140px]">
                    · {currentNode}
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={`transition-transform duration-200 shrink-0 ${vpnOpen ? "rotate-180" : ""}`}
              />
            </button>
            {vpnOpen && (
              <div className="border-t border-border/60 p-2 space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                {loadingNodes ? (
                  <p className="text-xs text-muted-foreground text-center py-3">加载节点中...</p>
                ) : nodes.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">暂无可用节点</p>
                ) : (
                  nodes.map((node) => (
                    <button
                      key={node.name}
                      type="button"
                      onClick={() => void selectNode(node.name)}
                      disabled={selectingNode === node.name}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        currentNode === node.name
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <span className="truncate text-left">{node.name}</span>
                      <span className={`text-xs shrink-0 ml-2 ${delayColor(node.delay)}`}>
                        {selectingNode === node.name ? "切换中..." : `${node.delay}ms`}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
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
          <div className="border-t border-border/60 p-3 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">图片生成</span>
                <Switch checked={imageEnabled} onCheckedChange={setImageEnabled} />
              </div>
              {imageEnabled && (
                <div className="space-y-2 pl-1">
                  <input
                    value={imageApi}
                    onChange={(e) => setImageApi(e.target.value)}
                    placeholder="第三方图片 API Key（不填使用官方）"
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  {imageApi && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">图片风格</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {IMAGE_TYPES.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setImageType(t.value)}
                            className={`py-1.5 rounded-lg text-xs transition-colors ${imageType === t.value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 border border-border/40"}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {!imageApi && (
                    <p className="text-xs text-muted-foreground">未填写第三方Key，将使用官方DALL-E</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">语音服务</span>
                <Switch checked={ttsEnabled} onCheckedChange={setTtsEnabled} />
              </div>
              {ttsEnabled && (
                <div className="space-y-2 pl-1">
                  <input
                    value={ttsApi}
                    onChange={(e) => setTtsApi(e.target.value)}
                    placeholder="第三方语音 API Key（不填使用官方）"
                    className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">
                      {ttsApi ? "音色选择（第三方）" : "音色选择（官方OpenAI）"}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {TTS_VOICES.map((v) => (
                        <button
                          key={v.value}
                          type="button"
                          onClick={() => setTtsVoice(v.value)}
                          className={`py-1.5 rounded-lg text-xs transition-colors ${ttsVoice === v.value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 border border-border/40"}`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

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

const FeaturesSettings = forwardRef<{ save: () => Promise<void> }>(function FeaturesSettings(_, ref) {
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [momentsEnabled, setMomentsEnabled] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [city, setCity] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setNewsEnabled(!!s.news_enabled);
      setMcpEnabled(!!s.mcp_enabled);
      setMomentsEnabled(!!s.moments_enabled);
      setScheduleEnabled(!!s.scene_enabled);
      setEmailEnabled(!!s.email_enabled);
      setEmailInput((s.user_email as string) || "");
      setCity((s.user_city as string) || "");
      if (s.custom_logo) setLogoPreview(s.custom_logo as string);
    });
  }, []);

  const saveSingle = async (key: string, value: unknown) => {
    await saveSettings({ [key]: value });
  };

  const handleSave = async () => {
    await saveSettings({
      news_enabled: newsEnabled,
      mcp_enabled: mcpEnabled,
      moments_enabled: momentsEnabled,
      scene_enabled: scheduleEnabled,
      email_enabled: emailEnabled,
      user_email: emailInput,
      user_city: city,
    });
  };

  useImperativeHandle(ref, () => ({ save: handleSave }));

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
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <MapPin size={14} />
            所在城市
          </label>
          <span className="text-xs text-muted-foreground">手动输入城市名即可</span>
        </div>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={() => void saveSingle("user_city", city)}
          placeholder="如：上海市、北京市朝阳区..."
          className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

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

      <FeatureToggle label="MCP 工具" enabled={mcpEnabled} onToggle={(v) => {
        setMcpEnabled(v);
        void saveSingle("mcp_enabled", v);
        if (!v) {
          setEmailEnabled(false);
          setNewsEnabled(false);
          setMomentsEnabled(false);
          setScheduleEnabled(false);
          void saveSettings({
            mcp_enabled: false,
            email_enabled: false,
            news_enabled: false,
            moments_enabled: false,
            scene_enabled: false,
          });
        }
      }} />

      <FeatureToggle label="邮件发送" enabled={emailEnabled} onToggle={(v) => {
        setEmailEnabled(v);
        void saveSingle("email_enabled", v);
        if (v && !mcpEnabled) {
          setMcpEnabled(true);
          void saveSingle("mcp_enabled", true);
        }
      }}>
        <div className="flex items-center gap-2">
          <Mail size={14} className="text-muted-foreground shrink-0" />
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onBlur={() => void saveSingle("user_email", emailInput)}
            placeholder="你的收件邮箱"
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </FeatureToggle>

      <FeatureToggle label="新闻推送" enabled={newsEnabled} onToggle={(v) => {
        setNewsEnabled(v);
        void saveSingle("news_enabled", v);
        if (v && !mcpEnabled) {
          setMcpEnabled(true);
          void saveSingle("mcp_enabled", true);
        }
      }} />
      <FeatureToggle label="小红书使用" enabled={momentsEnabled} onToggle={(v) => {
        setMomentsEnabled(v);
        void saveSingle("moments_enabled", v);
        if (v && !mcpEnabled) {
          setMcpEnabled(true);
          void saveSingle("mcp_enabled", true);
        }
      }} />
      <FeatureToggle label="日程提醒" enabled={scheduleEnabled} onToggle={(v) => {
        setScheduleEnabled(v);
        void saveSingle("scene_enabled", v);
        if (v && !mcpEnabled) {
          setMcpEnabled(true);
          void saveSingle("mcp_enabled", true);
        }
      }} />
    </div>
  );
});

function edgePercentToInt(s: string | undefined): number {
  if (s == null || s === "") return 0;
  const m = String(s).match(/(-?\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function intToEdgePercent(n: number): string {
  return (n >= 0 ? `+${n}` : String(n)) + "%";
}

/** 音调只存 +NHz（0～50），不允许负数。 */
function intToEdgeHz(n: number): string {
  const v = Math.max(0, n);
  return `+${v}Hz`;
}

/** 旧存盘为 % 时迁移为同数值的 Hz；负 Hz 钳到 +0Hz。 */
function normalizeEdgePitchValue(raw: string | undefined): string {
  if (raw == null || raw === "") return "+0Hz";
  const s = String(raw);
  if (s.includes("Hz")) return intToEdgeHz(edgePercentToInt(s));
  if (s.includes("%")) return intToEdgeHz(edgePercentToInt(s));
  return "+0Hz";
}

const edgeVoices: Record<"female" | "male", { value: string; label: string }[]> = {
  female: [
    { value: "zh-CN-XiaoxiaoNeural", label: "晓晓 · 温柔" },
    { value: "zh-CN-XiaoyiNeural", label: "晓伊 · 活泼" },
    { value: "zh-CN-XiaomoNeural", label: "晓墨 · 平静" },
    { value: "zh-CN-XiaoxuanNeural", label: "晓萱 · 理性" },
  ],
  male: [
    { value: "zh-CN-YunxiNeural", label: "云希 · 轻松" },
    { value: "zh-CN-YunjianNeural", label: "云健 · 磁性" },
    { value: "zh-CN-YunxiaNeural", label: "云夏 · 阳光" },
    { value: "zh-CN-YunyangNeural", label: "云扬 · 播音" },
  ],
};

function voiceToEdgeGender(voice: string): "female" | "male" {
  if (edgeVoices.female.some((x) => x.value === voice)) return "female";
  if (edgeVoices.male.some((x) => x.value === voice)) return "male";
  return "female";
}

type VoiceForm = {
  tts_enabled: boolean;
  tts_mode: "official" | "edge";
  tts_voice: string;
  tts_base_url: string;
  edge_voice: string;
  edge_rate: string;
  edge_pitch: string;
  edge_volume: string;
  edge_style: string;
  openai_tts_key?: string;
  fish_tts_key?: string;
  fish_model_id?: string;
  fish_speed?: number;
  primary_model?: string;
};

function VoiceSettings() {
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSettingsPanelRef = useRef<HTMLDivElement | null>(null);
  const [edgeGender, setEdgeGender] = useState<"female" | "male">("female");
  const [form, setForm] = useState<VoiceForm>({
    tts_enabled: false,
    tts_mode: "edge",
    tts_voice: "alloy",
    tts_base_url: "https://api.openai.com",
    edge_voice: "zh-CN-XiaoxiaoNeural",
    edge_rate: "+0%",
    edge_pitch: "+0Hz",
    edge_volume: "+0%",
    edge_style: "general",
    primary_model: "",
    openai_tts_key: "",
    fish_tts_key: "",
    fish_model_id: "",
    fish_speed: 1,
  });

  useEffect(() => {
    void loadSettings().then((s) => {
      const m = (s.tts_mode as string) || "edge";
      const ev = (s.edge_voice as string) || "zh-CN-XiaoxiaoNeural";
      setForm({
        tts_enabled: !!s.tts_enabled,
        tts_mode: m === "official" || m === "edge" ? (m as "official" | "edge") : "edge",
        tts_voice: (s.tts_voice as string) || "alloy",
        tts_base_url: (s.tts_base_url as string) || "https://api.openai.com",
        edge_voice: ev,
        edge_rate: (s.edge_rate as string) || "+0%",
        edge_pitch: normalizeEdgePitchValue(s.edge_pitch as string | undefined),
        edge_volume: (s.edge_volume as string) || "+0%",
        edge_style: (s.edge_style as string) || "general",
        primary_model: (s.primary_model as string) || "",
        openai_tts_key: (s.openai_tts_key as string) || "",
        fish_tts_key: (s.fish_tts_key as string) || "",
        fish_model_id: (s.fish_model_id as string) || "",
        fish_speed: typeof s.fish_speed === "number" ? s.fish_speed : Number(s.fish_speed) || 1,
      });
      setEdgeGender(voiceToEdgeGender(ev));
    });
  }, []);

  useEffect(
    () => () => {
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
    },
    [],
  );

  const saveSingle = async (key: string, value: unknown) => {
    await saveSettings({ [key]: value });
    setForm((prev) => ({ ...prev, [key]: value } as VoiceForm));
  };

  const handlePreview = (text: string) => {
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
    speakTimerRef.current = setTimeout(async () => {
      const url = await synthesizeTTS({
        text,
        mode: "edge",
        voice: form.edge_voice,
        rate: form.edge_rate,
        pitch: form.edge_pitch,
        volume: form.edge_volume,
        style: form.edge_style,
      });
      new Audio(url).play();
    }, 300);
  };

  return (
    <div ref={voiceSettingsPanelRef} className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">语音输出</p>
          <p className="text-xs text-muted-foreground">AI回复后可点击朗读</p>
        </div>
        <Switch
          checked={form.tts_enabled}
          onCheckedChange={(v) => {
            void saveSingle("tts_enabled", v);
          }}
        />
      </div>

      {form.tts_enabled
        ? (() => {
            const pm = form.primary_model || "";
            const autoProvider = pm.startsWith("openai/")
              ? form.openai_tts_key?.trim()
                ? "openai"
                : "edge"
              : pm.startsWith("fish/")
                ? form.fish_tts_key?.trim()
                  ? "fish"
                  : "edge"
                : "edge";
            const providerLabel =
              autoProvider === "openai"
                ? "OpenAI TTS"
                : autoProvider === "fish"
                  ? "Fish Audio"
                  : "Edge TTS（免费）";

            return (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  当前模型 <span className="text-foreground font-medium">{pm}</span>，自动使用{" "}
                  <span className="text-primary font-medium">{providerLabel}</span>
                </p>

                {/* OpenAI TTS — 仅openai/模型时高亮 */}
                <div
                  className={`border rounded-xl p-4 transition-opacity ${
                    pm.startsWith("openai/") ? "border-primary" : "opacity-40"
                  }`}
                >
                  <p className="text-xs font-medium mb-2">OpenAI TTS Key</p>
                  <p className="text-xs text-muted-foreground mb-2">填入后自动启用，不填则回落Edge</p>
                  <input
                    type="password"
                    className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2"
                    placeholder="sk-..."
                    value={form.openai_tts_key || ""}
                    onChange={(e) => void saveSingle("openai_tts_key", e.target.value)}
                  />
                  {pm.startsWith("openai/") && form.openai_tts_key?.trim() && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                            form.tts_voice === v
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border"
                          }`}
                          onClick={() => void saveSingle("tts_voice", v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fish Audio — 仅fish/模型时高亮 */}
                <div
                  className={`border rounded-xl p-4 transition-opacity ${
                    pm.startsWith("fish/") ? "border-primary" : "opacity-40"
                  }`}
                >
                  <p className="text-xs font-medium mb-2">Fish Audio</p>
                  <input
                    type="password"
                    className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2 mb-2"
                    placeholder="Fish Audio API Key"
                    value={form.fish_tts_key || ""}
                    onChange={(e) => void saveSingle("fish_tts_key", e.target.value)}
                  />
                  <input
                    type="text"
                    className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2"
                    placeholder="Model ID（留空用默认）"
                    value={form.fish_model_id || ""}
                    onChange={(e) => void saveSingle("fish_model_id", e.target.value)}
                  />
                </div>

                {/* Edge TTS — 永远显示，是fallback */}
                <div
                  className={`border rounded-xl p-4 transition-opacity ${
                    autoProvider === "edge" ? "border-primary" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium">
                      Edge TTS <span className="text-green-600">免费 · 兜底</span>
                    </p>
                    <button
                      type="button"
                      className="text-xs h-7 px-3 rounded-lg border border-border hover:bg-muted transition-colors"
                      onClick={() => handlePreview("你好，我是叮咚，很高兴认识你。")}
                    >
                      ▷ 试听
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {(["female", "male"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={`flex-1 text-xs py-1 rounded-lg border transition-colors ${
                            edgeGender === g
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                          onClick={() => {
                            if (g === edgeGender) return;
                            setEdgeGender(g);
                            const inGroup = edgeVoices[g].some((v) => v.value === form.edge_voice);
                            if (!inGroup) void saveSingle("edge_voice", edgeVoices[g][0].value);
                          }}
                        >
                          {g === "female" ? "女声" : "男声"}
                        </button>
                      ))}
                    </div>
                    <select
                      className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2"
                      value={form.edge_voice}
                      onChange={(e) => void saveSingle("edge_voice", e.target.value)}
                    >
                      {edgeVoices[edgeGender].map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    {(
                      [
                        { label: "语速", key: "edge_rate" as const, id: "er", unit: "percent" as const },
                        { label: "音调", key: "edge_pitch" as const, id: "ep", unit: "hz" as const },
                        { label: "音量", key: "edge_volume" as const, id: "ev", unit: "percent" as const },
                      ] as const
                    ).map(({ label, key, id, unit }) => (
                      <div key={id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-6">{label}</span>
                        <input
                          type="range"
                          min={unit === "hz" ? 0 : -50}
                          max={50}
                          step={5}
                          value={
                            unit === "hz"
                              ? Math.max(0, edgePercentToInt(form[key]))
                              : edgePercentToInt(form[key])
                          }
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            void saveSingle(key, unit === "hz" ? intToEdgeHz(n) : intToEdgePercent(n));
                          }}
                          className="flex-1 h-1"
                        />
                        <span className="text-xs w-10 shrink-0 text-right tabular-nums">
                          {form[key] || (unit === "hz" ? "+0Hz" : "+0%")}
                        </span>
                      </div>
                    ))}
                    <select
                      className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2"
                      value={form.edge_style}
                      onChange={(e) => void saveSingle("edge_style", e.target.value)}
                    >
                      <option value="general">通用</option>
                      <option value="cheerful">开朗活泼</option>
                      <option value="calm">平静舒缓</option>
                      <option value="newscast">播音腔</option>
                      <option value="affectionate">温柔亲切</option>
                      <option value="lyrical">诗意抒情</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })()
        : null}

      {/* 图片生成区块，结构同语音 */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">图片生成</p>
            <p className="text-xs text-muted-foreground">AI生成图片能力</p>
          </div>
          {/* 开关占位，功能后续接入 */}
          <Switch disabled checked={false} />
        </div>
        <div className="flex gap-3 opacity-40 pointer-events-none">
          <div className="flex-1 border rounded-xl p-4">
            <p className="text-xs font-medium mb-1">官方</p>
            <p className="text-xs text-muted-foreground mb-2">DALL·E 3 / GPT-Image</p>
            <input
              className="w-full text-xs h-8 rounded-lg border border-border bg-background px-2"
              placeholder="中转地址 https://api.openai.com"
            />
          </div>
          <div className="flex-1 border rounded-xl p-4">
            <p className="text-xs font-medium mb-1">
              第三方 <span className="text-green-600 text-xs">即将支持</span>
            </p>
            <p className="text-xs text-muted-foreground">Stable Diffusion / Flux</p>
          </div>
        </div>
      </div>
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
  const apiRef = useRef<{ save: () => Promise<void> }>(null);
  const featuresRef = useRef<{ save: () => Promise<void> }>(null);

  const handleClose = () => {
    onClose(); // 先关闭，后台静默保存
    try {
      void apiRef.current?.save();
      void featuresRef.current?.save();
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => void handleClose()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl h-[80vh] rounded-2xl bg-popover border border-border overflow-hidden flex"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => void handleClose()}
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
          {activeSection === "api" && <APISettings ref={apiRef} />}
          {activeSection === "voice" && <VoiceSettings />}
          {activeSection === "features" && <FeaturesSettings ref={featuresRef} />}
          {activeSection === "data" && <DataSettings />}
        </div>
      </div>
    </div>
  );
}
