import { useState, useEffect } from "react";
import { Link2, Link2Off } from "lucide-react";

const BUBBLE_COLORS = [
  { name: "默认", hsl: "0 0% 18%" },
  { name: "深蓝", hsl: "210 60% 25%" },
  { name: "深绿", hsl: "150 50% 22%" },
  { name: "深紫", hsl: "270 50% 25%" },
  { name: "深粉", hsl: "340 60% 30%" },
  { name: "深橙", hsl: "25 70% 28%" },
  { name: "深青", hsl: "185 55% 22%" },
  { name: "深红", hsl: "0 55% 28%" },
  { name: "浅灰", hsl: "0 0% 88%" },
  { name: "浅蓝", hsl: "210 60% 88%" },
  { name: "浅绿", hsl: "150 50% 86%" },
  { name: "浅紫", hsl: "270 50% 88%" },
  { name: "浅粉", hsl: "340 60% 90%" },
  { name: "浅橙", hsl: "25 70% 88%" },
  { name: "浅青", hsl: "185 55% 86%" },
  { name: "浅红", hsl: "0 55% 88%" },
];

interface BubbleStylePanelProps {
  userBubble: string;
  aiBubble: string;
  onUserBubbleChange: (v: string) => void;
  onAiBubbleChange: (v: string) => void;
}

export function BubbleStylePanel({
  userBubble,
  aiBubble,
  onUserBubbleChange,
  onAiBubbleChange,
}: BubbleStylePanelProps) {
  const [linked, setLinked] = useState(() => localStorage.getItem("bubble-linked") === "true");
  const [userColor, setUserColor] = useState(() => localStorage.getItem("user-bubble-color") || "0 0% 18%");
  const [aiColor, setAiColor] = useState(() => localStorage.getItem("ai-bubble-color") || "0 0% 18%");
  const [rippleKey, setRippleKey] = useState(0);

  useEffect(() => {
    localStorage.setItem("bubble-linked", String(linked));
  }, [linked]);

  const applyColor = (side: "user" | "ai", hsl: string) => {
    if (side === "user") {
      setUserColor(hsl);
      localStorage.setItem("user-bubble-color", hsl);
      document.documentElement.style.setProperty("--chat-user-bg", hsl);
      if ((window as any)._bc) (window as any)._bc(hsl, localStorage.getItem("ai-bubble-color") || "");
      if (linked) {
        setAiColor(hsl);
        localStorage.setItem("ai-bubble-color", hsl);
        document.documentElement.style.setProperty("--chat-ai-bg", hsl);
        if ((window as any)._bc) (window as any)._bc(hsl, hsl);
        setRippleKey((k) => k + 1);
      }
    } else {
      setAiColor(hsl);
      localStorage.setItem("ai-bubble-color", hsl);
      document.documentElement.style.setProperty("--chat-ai-bg", hsl);
      if ((window as any)._bc) (window as any)._bc(localStorage.getItem("user-bubble-color") || "", hsl);
      if (linked) {
        setUserColor(hsl);
        localStorage.setItem("user-bubble-color", hsl);
        document.documentElement.style.setProperty("--chat-user-bg", hsl);
        if ((window as any)._bc) (window as any)._bc(hsl, hsl);
        setRippleKey((k) => k + 1);
      }
    }
  };

  const handleModeChange = (side: "user" | "ai", mode: string) => {
    if (side === "user") {
      onUserBubbleChange(mode);
      if (linked) onAiBubbleChange(mode);
    } else {
      onAiBubbleChange(mode);
      if (linked) onUserBubbleChange(mode);
    }
  };

  const toggleLink = () => {
    const next = !linked;
    setLinked(next);
    if (next) {
      setAiColor(userColor);
      localStorage.setItem("ai-bubble-color", userColor);
      document.documentElement.style.setProperty("--chat-ai-bg", userColor);
      if ((window as any)._bc) (window as any)._bc(userColor, userColor);
      onAiBubbleChange(userBubble);
    }
  };

  return (
    <div className="pt-1">
      <div className="flex items-start gap-0">
        {/* User side */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground mb-2 text-center">用户样式</p>
          <div className="flex rounded-lg border border-border/40 overflow-hidden mb-3">
            {[{ v: "bubble", l: "气泡" }, { v: "flat", l: "平铺" }].map(({ v, l }) => (
              <button key={v} onClick={() => handleModeChange("user", v)}
                className={`flex-1 py-1.5 text-xs transition-colors ${userBubble === v ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BUBBLE_COLORS.map((c) => (
              <button key={c.name} onClick={() => applyColor("user", c.hsl)}
                className="flex flex-col items-center gap-1 p-1 rounded-md hover:bg-accent/30 transition-colors">
                <div className={`h-6 w-6 rounded-full border transition-all ${userColor === c.hsl ? "border-foreground scale-110" : "border-border/60"}`}
                  style={{ background: `hsl(${c.hsl})` }} />
                <span className="text-[9px] text-muted-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Link toggle */}
        <div className="flex flex-col items-center justify-center pt-8 px-2">
          <button onClick={toggleLink}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${linked ? "border-foreground/40 bg-accent text-foreground" : "border-border/40 bg-background text-muted-foreground"} hover:scale-110 active:scale-95`}>
            {linked ? <Link2 size={14} /> : <Link2Off size={14} />}
          </button>
        </div>

        {/* AI side */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground mb-2 text-center">AI 样式</p>
          <div className="flex rounded-lg border border-border/40 overflow-hidden mb-3">
            {[{ v: "bubble", l: "气泡" }, { v: "flat", l: "平铺" }].map(({ v, l }) => (
              <button key={v} onClick={() => handleModeChange("ai", v)}
                className={`flex-1 py-1.5 text-xs transition-colors ${aiBubble === v ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {BUBBLE_COLORS.map((c) => {
              const isActive = aiColor === c.hsl;
              return (
                <button key={c.name} onClick={() => applyColor("ai", c.hsl)}
                  className="flex flex-col items-center gap-1 p-1 rounded-md hover:bg-accent/30 transition-colors">
                  <div className={`relative h-6 w-6 rounded-full border transition-all ${isActive ? "border-foreground scale-110" : "border-border/60"}`}
                    style={{ background: `hsl(${c.hsl})` }}>
                    {linked && rippleKey > 0 && isActive && (
                      <div key={rippleKey} className="absolute inset-0 rounded-full animate-ping"
                        style={{ background: `hsl(${c.hsl})`, animationIterationCount: 1, animationDuration: "0.6s" }} />
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
