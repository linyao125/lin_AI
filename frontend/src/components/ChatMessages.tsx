import { useState, useEffect, useRef } from "react";
import { Copy, RotateCcw, Bot, Heart, Pencil, Check } from "lucide-react";
import { synthesizeTTS } from "@/lib/linai";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatMessagesProps {
  messages: Message[];
  activeKey?: string;
  onRetry?: (msgId: string) => void;
  onEdit?: (msgId: string, newContent: string) => void;
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

// 平铺模式：用气泡颜色作为字体颜色
function getFlatTextColor(cssVar: string): string {
  try {
    const hsl = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
    if (!hsl) return "var(--foreground)";
    return `hsl(${hsl})`;
  } catch {
    return "var(--foreground)";
  }
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-current opacity-40"
          style={{
            animation: "typing-bounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function ChatMessages({ messages, activeKey, onRetry, onEdit }: ChatMessagesProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [bgStyle, setBgStyle] = useState<React.CSSProperties>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 气泡模式：从后端注入的全局变量读初始值
  const [userBubbleMode, setUserBubbleMode] = useState<string>(
    () => (window as any).__userBubbleMode || "bubble"
  );
  const [aiBubbleMode, setAiBubbleMode] = useState<string>(
    () => (window as any).__aiBubbleMode || "bubble"
  );

  // 问题4：窗口打开/切换对话时，立即定位到底部
  useEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    });
    prevLengthRef.current = messages.length;
  }, [activeKey]);

  // 问题3：发新消息时平滑滚动到底部，不要跳动
  useEffect(() => {
    if (messages.length === 0) return;
    if (messages.length > prevLengthRef.current) {
      prevLengthRef.current = messages.length;
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [messages]);

  useEffect(() => {
    // 背景
    const applyBg = (bg: string, bgImage?: string) => {
      if (!bg || bg === "default") {
        setBgStyle({});
      } else if (bg === "custom-image") {
        const img = bgImage || (window as any).__chatBgImage || "";
        if (img) {
          setBgStyle({
            backgroundImage: `url(${img})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          });
        }
      } else if (bg.startsWith("linear-gradient")) {
        setBgStyle({ background: bg });
      }
    };
    const initBg = (window as any).__chatBg || "default";
    const initImg = (window as any).__chatBgImage || "";
    applyBg(initBg, initImg);

    const bgHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ bg: string; bgImage?: string }>).detail || {};
      applyBg(detail.bg || "default", detail.bgImage);
    };
    window.addEventListener("chat-bg-changed", bgHandler);

    // 气泡模式切换事件
    const modeHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ userMode: string; aiMode: string }>).detail || {};
      if (detail.userMode) setUserBubbleMode(detail.userMode);
      if (detail.aiMode) setAiBubbleMode(detail.aiMode);
    };
    window.addEventListener("bubble-mode-changed", modeHandler);

    return () => {
      window.removeEventListener("chat-bg-changed", bgHandler);
      window.removeEventListener("bubble-mode-changed", modeHandler);
    };
  }, []);

  // 自动调整编辑框高度
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.style.height = "auto";
      editRef.current.style.height = editRef.current.scrollHeight + "px";
      editRef.current.focus();
    }
  }, [editingId, editContent]);

  const handleCopy = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const startEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const submitEdit = (msgId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;
    onEdit?.(msgId, trimmed);
    setEditingId(null);
    setEditContent("");
  };

  const handleSpeak = async (msgId: string, text: string) => {
    if (playingId === msgId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    // 去掉常见 markdown 符号
    const clean = text.replace(/[\u0023\u002A\u0060_~\u005B\u005D\\]/g, "").trim();
    if (!clean) return;
    audioRef.current?.pause();
    setPlayingId(msgId);
    try {
      const url = await synthesizeTTS({ text: clean, mode: "edge" });
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingId(null);
      void audio.play();
    } catch {
      setPlayingId(null);
    }
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
    <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-thin relative" style={bgStyle}>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 relative z-[1]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="mb-6"
            onMouseEnter={() => setHoveredId(msg.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {msg.role === "assistant" ? (
              // ── AI 消息 ──────────────────────────────────────
              <div className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                  <Bot size={14} className="text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  {aiBubbleMode === "flat" ? (
                    // 平铺模式：无背景，颜色作字体色
                    <div
                      className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.content ? "px-1 py-1" : "px-1 py-1"
                      }`}
                      style={{ color: getFlatTextColor("--chat-ai-bg") }}
                    >
                      {msg.content || <TypingDots />}
                    </div>
                  ) : (
                    // 气泡模式
                    <div
                      className={`inline-block rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.content ? "px-4 py-3" : "px-3 py-2"
                      }`}
                      style={{
                        background: `hsl(var(--chat-ai-bg, var(--muted)))`,
                        color: getBubbleTextColor("--chat-ai-bg"),
                      }}
                    >
                      {msg.content || <TypingDots />}
                    </div>
                  )}
                  <div className={`mt-2 flex gap-1 transition-opacity duration-200 ${hoveredId === msg.id ? "opacity-100" : "opacity-0"}`}>
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="rounded-md p-1.5 hover:bg-accent transition-colors"
                      title="复制"
                    >
                      {copiedId === msg.id
                        ? <Check size={14} className="text-green-500" />
                        : <Copy size={14} className="text-muted-foreground hover:text-foreground" />
                      }
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSpeak(msg.id, msg.content)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="朗读"
                    >
                      {playingId === msg.id ? (
                        <span className="text-xs animate-spin inline-block">◌</span>
                      ) : (
                        <span className="text-xs">🔊</span>
                      )}
                    </button>
                    <button
                      onClick={() => onRetry?.(msg.id)}
                      className="rounded-md p-1.5 hover:bg-accent transition-colors"
                      title="重新生成"
                    >
                      <RotateCcw size={14} className="text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // ── 用户消息 ──────────────────────────────────────
              <div className="flex justify-end">
                <div className="max-w-[85%] w-full">
                  {editingId === msg.id ? (
                    // 编辑模式
                    <div className="flex flex-col gap-2">
                      <textarea
                        ref={editRef}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submitEdit(msg.id);
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="w-full rounded-2xl px-4 py-3 text-sm leading-relaxed resize-none border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        rows={1}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => submitEdit(msg.id)}
                          className="px-3 py-1.5 text-xs rounded-lg bg-foreground text-background hover:opacity-80 transition-opacity"
                        >
                          发送
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end">
                      {userBubbleMode === "flat" ? (
                        // 平铺模式：无背景，颜色作字体色，右对齐
                        <div
                          className="px-1 py-1 text-sm leading-relaxed whitespace-pre-wrap text-right"
                          style={{ color: getFlatTextColor("--chat-user-bg") }}
                        >
                          {msg.content}
                        </div>
                      ) : (
                        // 气泡模式
                        <div
                          className="rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-full"
                          style={{
                            background: `hsl(var(--chat-user-bg, var(--secondary)))`,
                            color: getBubbleTextColor("--chat-user-bg"),
                          }}
                        >
                          {msg.content}
                        </div>
                      )}
                      <div className={`mt-1.5 flex justify-end gap-1 transition-opacity duration-200 ${hoveredId === msg.id ? "opacity-100" : "opacity-0"}`}>
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="rounded-md p-1.5 hover:bg-accent transition-colors"
                          title="复制"
                        >
                          {copiedId === msg.id
                            ? <Check size={14} className="text-green-500" />
                            : <Copy size={14} className="text-muted-foreground hover:text-foreground" />
                          }
                        </button>
                        <button
                          onClick={() => startEdit(msg)}
                          className="rounded-md p-1.5 hover:bg-accent transition-colors"
                          title="编辑"
                        >
                          <Pencil size={14} className="text-muted-foreground hover:text-foreground" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
