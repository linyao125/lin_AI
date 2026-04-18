import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BubbleStylePanel } from "@/components/settings/BubbleStylePanel";

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

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const THEME_PRESETS = [
  { name: "深色", hue: 0, sat: 0, light: 13 },
  { name: "暖灰", hue: 30, sat: 8, light: 15 },
  { name: "深蓝", hue: 220, sat: 30, light: 12 },
  { name: "深紫", hue: 270, sat: 25, light: 14 },
  { name: "深绿", hue: 150, sat: 20, light: 12 },
  { name: "浅色", hue: 0, sat: 0, light: 96 },
  { name: "浅蓝", hue: 210, sat: 40, light: 95 },
  { name: "浅绿", hue: 140, sat: 30, light: 94 },
  { name: "樱花粉", hue: 350, sat: 100, light: 92, hex: "#FFD1DC" },
  { name: "薄荷绿", hue: 134, sat: 78, light: 82, hex: "#B2F2BB" },
  { name: "薰衣草紫", hue: 263, sat: 100, light: 87, hex: "#E5DBFF" },
  { name: "柠檬黄", hue: 46, sat: 100, light: 87, hex: "#FFF3BF" },
  { name: "天蓝色", hue: 208, sat: 100, light: 91, hex: "#D0EBFF" },
];

const GRADIENT_PRESETS = [
  { name: "极光", value: "linear-gradient(135deg, hsl(220 60% 20%), hsl(280 60% 30%), hsl(320 60% 25%))" },
  { name: "晨曦", value: "linear-gradient(135deg, hsl(30 50% 20%), hsl(50 60% 30%), hsl(20 50% 25%))" },
  { name: "海洋", value: "linear-gradient(135deg, hsl(200 60% 15%), hsl(180 50% 25%), hsl(210 60% 20%))" },
  { name: "森林", value: "linear-gradient(135deg, hsl(140 40% 12%), hsl(160 50% 20%), hsl(120 40% 15%))" },
  { name: "薰衣草", value: "linear-gradient(135deg, hsl(260 40% 18%), hsl(280 50% 25%), hsl(240 40% 20%))" },
  { name: "夕阳", value: "linear-gradient(135deg, hsl(10 60% 20%), hsl(30 70% 30%), hsl(350 60% 25%))" },
  { name: "莫兰迪蓝", value: "linear-gradient(135deg, hsl(210 25% 65%), hsl(220 20% 75%), hsl(200 20% 70%))" },
  { name: "莫兰迪绿", value: "linear-gradient(135deg, hsl(150 20% 60%), hsl(160 18% 70%), hsl(140 15% 65%))" },
  { name: "莫兰迪粉", value: "linear-gradient(135deg, hsl(350 25% 70%), hsl(340 20% 78%), hsl(0 20% 72%))" },
  { name: "莫兰迪灰", value: "linear-gradient(135deg, hsl(220 10% 60%), hsl(210 8% 70%), hsl(230 10% 65%))" },
  { name: "马卡龙粉", value: "linear-gradient(135deg, hsl(350 80% 85%), hsl(330 70% 88%), hsl(10 75% 87%))" },
  { name: "马卡龙蓝", value: "linear-gradient(135deg, hsl(200 70% 82%), hsl(210 65% 86%), hsl(190 60% 84%))" },
  { name: "马卡龙绿", value: "linear-gradient(135deg, hsl(140 60% 80%), hsl(150 55% 84%), hsl(130 50% 82%))" },
  { name: "马卡龙紫", value: "linear-gradient(135deg, hsl(270 60% 84%), hsl(280 55% 88%), hsl(260 50% 86%))" },
];

function applyTheme(hue: number, sat: number, light: number) {
  const root = document.documentElement;
  const isLightTheme = light > 50;
  const darkText = `${hue} 10% 20%`;
  const lightText = `0 0% 95%`;
  const fg = isLightTheme ? darkText : lightText;

  root.style.setProperty("--background", `${hue} ${sat}% ${light}%`);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--card", `${hue} ${sat}% ${Math.max(light - 3, 0)}%`);
  root.style.setProperty("--card-foreground", fg);
  root.style.setProperty("--popover", `${hue} ${sat}% ${Math.max(light - 3, 0)}%`);
  root.style.setProperty("--popover-foreground", fg);
  root.style.setProperty("--primary", isLightTheme ? `${hue} ${Math.min(sat, 40)}% 25%` : `0 0% 100%`);
  root.style.setProperty("--primary-foreground", isLightTheme ? `0 0% 100%` : `0 0% 9%`);
  root.style.setProperty("--secondary", `${hue} ${sat}% ${light + (isLightTheme ? -8 : 5)}%`);
  root.style.setProperty("--secondary-foreground", fg);
  root.style.setProperty("--muted", `${hue} ${sat}% ${light + (isLightTheme ? -8 : 5)}%`);
  root.style.setProperty("--muted-foreground", isLightTheme ? `${hue} 10% 45%` : `0 0% 55%`);
  root.style.setProperty("--accent", `${hue} ${sat}% ${light + (isLightTheme ? -6 : 5.5)}%`);
  root.style.setProperty("--accent-foreground", fg);
  root.style.setProperty("--border", `${hue} ${Math.min(sat, 20)}% ${light + (isLightTheme ? -15 : 9)}%`);
  root.style.setProperty("--input", `${hue} ${Math.min(sat, 20)}% ${light + (isLightTheme ? -15 : 9)}%`);
  root.style.setProperty("--ring", `${hue} ${Math.min(sat, 20)}% ${light + (isLightTheme ? -30 : 27)}%`);
  root.style.setProperty("--sidebar-background", `${hue} ${sat}% ${Math.max(light - 4, 0)}%`);
  root.style.setProperty("--sidebar-foreground", isLightTheme ? `${hue} 10% 25%` : `0 0% 85%`);
  root.style.setProperty("--sidebar-accent", `${hue} ${sat}% ${light + (isLightTheme ? -6 : 5.5)}%`);
  root.style.setProperty("--sidebar-accent-foreground", fg);
  root.style.setProperty("--sidebar-border", `${hue} ${Math.min(sat, 20)}% ${light + (isLightTheme ? -12 : 3)}%`);

  localStorage.setItem("theme-hue", String(hue));
  localStorage.setItem("theme-sat", String(sat));
  localStorage.setItem("theme-light", String(light));
  if ((window as any).__saveTheme) (window as any).__saveTheme(hue, sat, light);
}

export function UserProfileModal({ open, onClose }: UserProfileModalProps) {
  const [userName, setUserName] = useState(() => localStorage.getItem("user-name") || "User");
  const [userBirthday, setUserBirthday] = useState(() => localStorage.getItem("user-birthday") || "");
  const [saving, setSaving] = useState(false);
  const [themeHue, setThemeHue] = useState(() => Number(localStorage.getItem("theme-hue") || 0));
  const [themeSat, setThemeSat] = useState(() => Number(localStorage.getItem("theme-sat") || 0));
  const [themeLight, setThemeLight] = useState(() => Number(localStorage.getItem("theme-light") || 13));
  const [chatBg, setChatBg] = useState(() => localStorage.getItem("chat-bg") || "default");
  const [userBubble, setUserBubble] = useState(() => localStorage.getItem("user-bubble") || "bubble");
  const [aiBubble, setAiBubble] = useState(() => localStorage.getItem("ai-bubble") || "flat");

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.user_display_name) setUserName(s.user_display_name as string);
      if (s.user_birthday) setUserBirthday(s.user_birthday as string);
      if (s.theme_hue) setThemeHue(Number(s.theme_hue));
      if (s.theme_sat) setThemeSat(Number(s.theme_sat));
      if (s.theme_light) setThemeLight(Number(s.theme_light));
    });
  }, []);

  const autoSave = useCallback(() => {
    localStorage.setItem("user-name", userName);
    localStorage.setItem("user-birthday", userBirthday);
    localStorage.setItem("chat-bg", chatBg);
    localStorage.setItem("user-bubble", userBubble);
    localStorage.setItem("ai-bubble", aiBubble);
  }, [userName, userBirthday, chatBg, userBubble, aiBubble]);

  const handleClose = async () => {
    autoSave();
    setSaving(true);
    await saveSettings({
      user_display_name: userName,
      user_birthday: userBirthday,
    });
    setSaving(false);
    window.dispatchEvent(
      new CustomEvent("profile-updated", {
        detail: { aiName: localStorage.getItem("ai-name"), userName },
      }),
    );
    onClose();
  };

  const handleBgImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      localStorage.setItem("chat-bg-image", result);
      setChatBg("custom-image");
      localStorage.setItem("chat-bg", "custom-image");
      window.dispatchEvent(new CustomEvent("chat-bg-changed"));
    };
    reader.readAsDataURL(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg h-[80vh] rounded-2xl bg-popover border border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleClose}
          className="absolute top-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          <div className="flex flex-col items-center pt-6 pb-6">
            <button className="group relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-2xl font-bold hover:opacity-80 transition-opacity">
              U
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs text-white">
                更换
              </div>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">用户名称</label>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {saving && <p className="text-xs text-muted-foreground text-center">保存中...</p>}

            <div>
              <label className="text-sm font-medium text-foreground">用户生日</label>
              <input
                type="date"
                value={userBirthday}
                onChange={(e) => setUserBirthday(e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]"
              />
            </div>

            <div className="rounded-xl border border-border/60 p-4 mt-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">外观设置</h3>

              <Accordion type="multiple" className="w-full">
                <AccordionItem value="theme" className="border-border/40">
                  <AccordionTrigger className="text-sm text-muted-foreground hover:text-foreground hover:no-underline py-3">
                    主题设置
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {THEME_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          onClick={() => {
                            applyTheme(preset.hue, preset.sat, preset.light);
                            setThemeHue(preset.hue);
                            setThemeSat(preset.sat);
                            setThemeLight(preset.light);
                          }}
                          className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div
                            className="h-8 w-8 rounded-full border border-border/60"
                            style={{ background: (preset as any).hex || `hsl(${preset.hue} ${preset.sat}% ${preset.light}%)` }}
                          />
                          <span className="text-[10px] text-muted-foreground">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="bubble-style" className="border-border/40">
                  <AccordionTrigger className="text-sm text-muted-foreground hover:text-foreground hover:no-underline py-3">
                    对话框样式
                  </AccordionTrigger>
                  <AccordionContent>
                    <BubbleStylePanel
                      userBubble={userBubble}
                      aiBubble={aiBubble}
                      onUserBubbleChange={(v) => { setUserBubble(v); localStorage.setItem("user-bubble", v); }}
                      onAiBubbleChange={(v) => { setAiBubble(v); localStorage.setItem("ai-bubble", v); }}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="chat-bg" className="border-b-0">
                  <AccordionTrigger className="text-sm text-muted-foreground hover:text-foreground hover:no-underline py-3">
                    聊天背景
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-1">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setChatBg("default");
                            localStorage.setItem("chat-bg", "default");
                            document.documentElement.style.removeProperty("--chat-bg-custom");
                            window.dispatchEvent(new CustomEvent("chat-bg-changed"));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${chatBg === "default" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
                        >
                          默认
                        </button>
                        {GRADIENT_PRESETS.map((g) => (
                          <button
                            key={g.name}
                            onClick={() => {
                              setChatBg(g.value);
                              localStorage.setItem("chat-bg", g.value);
                              document.documentElement.style.setProperty("--chat-bg-custom", g.value);
                              window.dispatchEvent(new CustomEvent("chat-bg-changed"));
                            }}
                            className="flex flex-col items-center gap-1"
                          >
                            <div
                              className={`h-8 w-8 rounded-lg border transition-all ${chatBg === g.value ? "border-foreground scale-110" : "border-border/60"}`}
                              style={{ background: g.value }}
                            />
                            <span className="text-[10px] text-muted-foreground">{g.name}</span>
                          </button>
                        ))}
                      </div>
                      <div>
                        <label className="flex items-center justify-center w-full py-2.5 rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground hover:text-foreground hover:border-border cursor-pointer transition-colors">
                          上传自定义背景图片
                          <input type="file" accept="image/*" className="hidden" onChange={handleBgImage} />
                        </label>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
