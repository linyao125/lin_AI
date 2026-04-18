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
        // 只加载对话列表，不加载消息（加快启动速度）
        const result: Conversation[] = convs.slice(0, 20).map((c: any) => ({
          id: c.id,
          title: c.title || "对话",
          messages: [],
        }));
        setConversations(result);
        setLoadingHistory(false);
        // 只选中第一个对话，不自动加载消息（点击时再加载）
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
  const [weatherConfig, setWeatherConfig] = useState<WeatherConfig>(defaultWeather);
  const [isLightScene, setIsLightScene] = useState(false);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const createNew = useCallback(() => {
    const id = uuid();
    setConversations((prev) => [{ id, title: "New Chat", messages: [] }, ...prev]);
    setActiveId(id);
  }, []);

  const [convId, setConvId] = useState<string>("new");

  useEffect(() => {
    if (activeId) {
      setConvId(activeId);
    } else {
      setConvId("new");
    }
  }, [activeId]);

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
      setConvId(serverConvId);
      // 如果是新对话，用服务器返回的ID替换本地临时ID
      if (currentId !== serverConvId) {
        setConversations((prev) =>
          prev.map((c) => (c.id === currentId ? { ...c, id: serverConvId } : c))
        );
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
      />

      <div className={`flex flex-1 flex-col min-w-0 relative z-[1] transition-colors duration-500 ${isLightScene ? "text-[#1A1A1A]" : ""}`}>
        <ChatHeader onMenuClick={() => setSidebarOpen(true)} />
        <ChatMessages messages={activeConversation?.messages ?? []} />
        <ChatInput onSend={handleSend} weatherConfig={weatherConfig} onWeatherChange={setWeatherConfig} isLightScene={isLightScene} />
      </div>

      <AIProfileModal open={aiProfileOpen} onClose={() => setAiProfileOpen(false)} />
      <UserProfileModal open={userProfileOpen} onClose={() => setUserProfileOpen(false)} />
      <SystemSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default Index;
