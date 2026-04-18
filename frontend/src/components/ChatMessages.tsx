import { useState, useEffect } from "react";
import { Copy, RotateCcw, Bot, Heart, Pencil } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatMessagesProps {
  messages: Message[];
}

function getBubbleTextColor(cssVar: string): string {
  try {
    const hsl = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (!hsl) return "var(--foreground)";
    const parts = hsl.split(" ");
    const light = parseFloat(parts[2] || "50");
    if (isNaN(light)) return "var(--foreground)";
    return light > 55 ? "#1a1a1a" : "#ffffff";
  } catch {
    return "var(--foreground)";
  }
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bgStyle, setBgStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const updateBg = () => {
      const chatBg = localStorage.getItem("chat-bg") || "default";
      if (chatBg === "default") {
        setBgStyle({});
      } else if (chatBg === "custom-image") {
        const img = localStorage.getItem("chat-bg-image");
        if (img) {
          setBgStyle({ backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" });
        }
      } else if (chatBg.startsWith("linear-gradient")) {
        setBgStyle({ background: chatBg });
      }
    };
    updateBg();
    window.addEventListener("storage", updateBg);
    window.addEventListener("chat-bg-changed", updateBg);
    return () => {
      window.removeEventListener("storage", updateBg);
      window.removeEventListener("chat-bg-changed", updateBg);
    };
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center relative" style={bgStyle}>
        <div className="text-center">
          <div className="mx-auto mb-4">
            <Heart size={48} fill="none" strokeWidth={1} className="text-foreground mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">How can I help you today?</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin relative" style={bgStyle}>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 relative z-[1]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="mb-6"
            onMouseEnter={() => setHoveredId(msg.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {msg.role === "assistant" ? (
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                  <Bot size={14} className="text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: `hsl(var(--chat-ai-bg, var(--muted)))`,
                      color: getBubbleTextColor("--chat-ai-bg"),
                    }}
                  >
                    {msg.content}
                  </div>
                  <div className={`mt-2 flex gap-1 transition-opacity duration-200 ${hoveredId === msg.id ? "opacity-100" : "opacity-0"}`}>
                    <button onClick={() => handleCopy(msg.content)} className="rounded-md p-1.5 hover:bg-accent transition-colors" title="复制">
                      <Copy size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-accent transition-colors" title="重新生成">
                      <RotateCcw size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-accent transition-colors" title="编辑">
                      <Pencil size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <div className="max-w-[85%]">
                  <div
                    className="rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: `hsl(var(--chat-user-bg, var(--secondary)))`,
                      color: getBubbleTextColor("--chat-user-bg"),
                    }}
                  >
                    {msg.content}
                  </div>
                  <div className={`mt-1.5 flex justify-end gap-1 transition-opacity duration-200 ${hoveredId === msg.id ? "opacity-100" : "opacity-0"}`}>
                    <button onClick={() => handleCopy(msg.content)} className="rounded-md p-1.5 hover:bg-accent transition-colors" title="复制">
                      <Copy size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                    <button className="rounded-md p-1.5 hover:bg-accent transition-colors" title="编辑">
                      <Pencil size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
