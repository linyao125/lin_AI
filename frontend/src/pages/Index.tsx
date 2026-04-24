function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

import { useState, useCallback, useEffect } from "react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ChatHeader } from "@/components/ChatHeader";
import { ChatMessages, Message } from "@/components/ChatMessages";
import { ChatInput } from "@/components/ChatInput";
import { AIProfileModal } from "@/components/modals/AIProfileModal";
import { UserProfileModal } from "@/components/modals/UserProfileModal";
import { SystemSettingsModal } from "@/components/modals/SystemSettingsModal";
import { ScheduleModal } from "@/components/modals/ScheduleModal";
import { ScheduleNotification } from "@/components/ScheduleNotification";
import { SceneManager } from "@/components/weather/SceneManager";
import type { WeatherConfig } from "@/components/WeatherCanvas";

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

const VALID_SCENES = new Set(["none", "nebula", "rain", "ripple", "blossom", "sunshine", "breeze"]);

const defaultWeather: WeatherConfig = (() => {
  try {
    const saved = localStorage.getItem("weather-config");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!VALID_SCENES.has(parsed.scene)) parsed.scene = "none";
      return parsed;
    }
  } catch {}
  return { scene: "none", hue: 200, density: 0.4, speed: 0.5, size: 0.5, wind: 0 };
})();

const Index = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    import("@/lib/linai").then(({ loadConversations }) => {
      loadConversations().then((convs: any[]) => {
        if (!Array.isArray(convs)) {
          setLoadingHistory(false);
          return;
        }
        const result: Conversation[] = convs.slice(0, 20).map((c: any) => ({
          id: c.id,
          title: c.title || "对话",
          messages: [],
        }));
        setConversations(result);
        setLoadingHistory(false);
        if (result.length > 0) {
          setActiveId(result[0].id);
        }
      });
    });
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [aiProfileOpen, setAiProfileOpen] = useState(false);
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>(defaultWeather);
  const [isLightScene, setIsLightScene] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const [convId, setConvId] = useState<string>("new");

  useEffect(() => {
    if (activeId) {
      setConvId(activeId);
    } else {
      setConvId("new");
    }
  }, [activeId]);

  const createNew = useCallback(() => {
    setActiveId(null);
    setConvId("new");
  }, []);

  const [isLoading, setIsLoading] = useState(false);

  const handleSend = useCallback(async (content: string) => {
    if (isLoading) return;
    let currentId = activeId;
    if (!currentId) {
      const id = uuid();
      currentId = id;
      setConversations((prev) => [{ id, title: content.slice(0, 30), messages: [] }, ...prev]);
      setActiveId(id);
    }
    const userMsg: Message = { id: uuid(), role: "user", content };
    const aiMsgId = uuid();
    const aiMsg: Message = { id: aiMsgId, role: "assistant", content: "" };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== currentId) return c;
        const title = c.messages.length === 0 ? content.slice(0, 30) : c.title;
        return { ...c, title, messages: [...c.messages, userMsg, aiMsg] };
      })
    );
    setIsLoading(true);

    try {
      const { streamChat } = await import("@/lib/linai");
      let fullText = "";
      let serverConvId = convId;
      for await (const chunk of streamChat(content, convId)) {
        fullText += chunk.text;
        serverConvId = chunk.convId;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === aiMsgId ? { ...m, content: fullText } : m
              ),
            };
          })
        );
      }
      // 把当前对话提到列表最前面
      setConversations((prev) => {
        const target = prev.find((c) => c.id === serverConvId || c.id === currentId);
        if (!target) return prev;
        return [target, ...prev.filter((c) => c.id !== serverConvId && c.id !== currentId)];
      });
      setConvId(serverConvId);
      if (currentId !== serverConvId) {
        setConversations((prev) => {
          // 防止重复：如果serverConvId已存在就删掉临时的，否则替换id
          const exists = prev.some((c) => c.id === serverConvId);
          if (exists) {
            return prev.filter((c) => c.id !== currentId);
          }
          return prev.map((c) => (c.id === currentId ? { ...c, id: serverConvId } : c));
        });
        setActiveId(serverConvId);
      }
    } catch (e) {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== currentId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === aiMsgId ? { ...m, content: "连接失败，请检查服务器" } : m
            ),
          };
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeId, convId, isLoading]);

  const handleRetry = useCallback(async (aiMsgId: string) => {
    if (isLoading) return;
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv) return;
    const idx = conv.messages.findIndex((m) => m.id === aiMsgId);
    if (idx <= 0) return;

    // 找该AI消息之前的最后一条用户消息内容
    let userContent = "";
    for (let i = idx - 1; i >= 0; i--) {
      if (conv.messages[i].role === "user") {
        userContent = conv.messages[i].content;
        break;
      }
    }
    if (!userContent) return;

    // 只替换这条AI消息内容为空（重新生成），不动用户消息
    const newAiMsgId = aiMsgId; // 复用同一个id
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, messages: c.messages.map((m) => (m.id === aiMsgId ? { ...m, content: "" } : m)) }
          : c
      )
    );
    setIsLoading(true);

    try {
      const { streamChat } = await import("@/lib/linai");
      let fullText = "";
      let serverConvId = convId;
      for await (const chunk of streamChat(userContent, convId)) {
        fullText += chunk.text;
        serverConvId = chunk.convId;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeId) return c;
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.id === newAiMsgId ? { ...m, content: fullText } : m
              ),
            };
          })
        );
      }
      setConvId(serverConvId);
    } catch {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          return {
            ...c,
            messages: c.messages.map((m) =>
              m.id === newAiMsgId ? { ...m, content: "连接失败，请检查服务器" } : m
            ),
          };
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [conversations, activeId, convId, isLoading]);

  // 编辑：删除该用户消息之后的所有消息，用新内容重新发送
  const handleEdit = useCallback((userMsgId: string, newContent: string) => {
    const conv = conversations.find((c) => c.id === activeId);
    if (!conv) return;
    const idx = conv.messages.findIndex((m) => m.id === userMsgId);
    if (idx < 0) return;
    // 保留该消息之前的历史，删掉该消息及之后所有消息
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, messages: c.messages.slice(0, idx) }
          : c
      )
    );
    handleSend(newContent);
  }, [conversations, activeId, handleSend]);

  const handleDelete = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
    import("@/lib/linai").then(({ deleteConversation }) => deleteConversation(id));
  }, [activeId]);

  const handleRename = useCallback((id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
    import("@/lib/linai").then(({ renameConversation }) => renameConversation(id, newTitle));
  }, []);

  if (loadingHistory) return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <span className="text-muted-foreground text-sm">加载中...</span>
    </div>
  );

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-500 ${isLightScene ? "bg-white" : "bg-background"}`}>
      <SceneManager config={weatherConfig} onBrightnessChange={setIsLightScene} />

      <ChatSidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={async (id) => {
          setActiveId(id);
          const conv = conversations.find((c) => c.id === id);
          if (conv && conv.messages.length === 0) {
            const { loadMessages } = await import("@/lib/linai");
            const msgs = await loadMessages(id);
            if (Array.isArray(msgs)) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === id
                    ? {
                        ...c,
                        messages: msgs.map((m: any) => ({
                          id: m.id ? String(m.id) : uuid(),
                          role: m.role,
                          content: m.content,
                        })),
                      }
                    : c
                )
              );
            }
          }
        }}
        onNew={createNew}
        onDelete={handleDelete}
        onRename={handleRename}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        onOpenAIProfile={() => setAiProfileOpen(true)}
        onOpenUserProfile={() => setUserProfileOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSchedule={() => setScheduleOpen(true)}
      />

      <div className={`flex flex-1 flex-col min-w-0 relative z-[1] transition-colors duration-500 ${isLightScene ? "text-[#1A1A1A]" : ""}`}>
        <ChatHeader onMenuClick={() => setSidebarOpen(true)} />
        <ChatMessages
          messages={activeConversation?.messages ?? []}
          activeKey={activeId ?? "none"}
          onRetry={handleRetry}
          onEdit={handleEdit}
        />
        <ChatInput onSend={handleSend} weatherConfig={weatherConfig} onWeatherChange={setWeatherConfig} isLightScene={isLightScene} />
      </div>

      <AIProfileModal open={aiProfileOpen} onClose={() => setAiProfileOpen(false)} />
      <UserProfileModal open={userProfileOpen} onClose={() => setUserProfileOpen(false)} />
      <SystemSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <ScheduleNotification />
    </div>
  );
};

export default Index;
