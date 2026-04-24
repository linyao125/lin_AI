import { useState, useRef, useEffect } from "react";
import { Plus, MessageSquare, Trash2, Heart, ChevronLeft, SquarePen, Search, Image, Brain, Pencil, Aperture, Bookmark, Bell, Settings2 } from "lucide-react";

function useProfileNames() {
  const [aiName, setAiName] = useState(() => localStorage.getItem("ai-name") || "日常心跳");
  const [userName, setUserName] = useState(() => localStorage.getItem("user-name") || "User");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.aiName) setAiName(detail.aiName);
      if (detail.userName) setUserName(detail.userName);
    };
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
  }, []);

  return { aiName, userName };
}

interface Conversation {
  id: string;
  title: string;
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenAIProfile: () => void;
  onOpenUserProfile: () => void;
  onOpenSettings: () => void;
  onOpenSchedule: () => void;
}

const FEATURE_ICONS_ROW1 = [
  { icon: SquarePen, label: "Edit" },
  { icon: Search, label: "Search" },
  { icon: Image, label: "Image" },
  { icon: Brain, label: "Memory" },
];

const FEATURE_ICONS_ROW2 = [
  { icon: Aperture, label: "朋友圈" },
  { icon: Bookmark, label: "收藏" },
  { icon: Bell, label: "通知" },
  { icon: Settings2, label: "工具" },
];

export function ChatSidebar({ conversations, activeId, onSelect, onNew, onDelete, onRename, isOpen, onClose, collapsed, onToggleCollapse, onOpenAIProfile, onOpenUserProfile, onOpenSettings, onOpenSchedule }: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const sidebarWidth = collapsed ? "w-16" : "w-[260px]";

  const handleStartRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const handleFinishRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== conversations.find(c => c.id === id)?.title) {
      onRename(id, trimmed);
    }
    setRenamingId(null);
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-[260px] bg-sidebar flex flex-col
          transition-transform duration-300 ease-in-out
          md:hidden
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <SidebarContent
          collapsed={false}
          conversations={conversations}
          activeId={activeId}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onStartRename={handleStartRename}
          onFinishRename={handleFinishRename}
          onNew={() => { onNew(); onClose(); }}
          onSelect={(id) => { onSelect(id); onClose(); }}
          onDelete={onDelete}
          onToggleCollapse={onClose}
          onOpenAIProfile={onOpenAIProfile}
          onOpenUserProfile={onOpenUserProfile}
          onOpenSettings={onOpenSettings}
          onOpenSchedule={onOpenSchedule}
          onExpandSidebar={() => {}}
        />
      </aside>

      <aside
        className={`
          hidden md:flex flex-col h-full bg-sidebar
          transition-all duration-300 ease-in-out
          ${sidebarWidth}
        `}
      >
        <SidebarContent
          collapsed={collapsed}
          conversations={conversations}
          activeId={activeId}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onStartRename={handleStartRename}
          onFinishRename={handleFinishRename}
          onNew={onNew}
          onSelect={onSelect}
          onDelete={onDelete}
          onToggleCollapse={onToggleCollapse}
          onOpenAIProfile={onOpenAIProfile}
          onOpenUserProfile={onOpenUserProfile}
          onOpenSettings={onOpenSettings}
          onOpenSchedule={onOpenSchedule}
          onExpandSidebar={() => { if (collapsed) onToggleCollapse(); }}
        />
      </aside>
    </>
  );
}

function RenameInput({ value, onChange, onFinish, convId }: { value: string; onChange: (v: string) => void; onFinish: (id: string) => void; convId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onFinish(convId)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onFinish(convId);
        if (e.key === "Escape") onFinish(convId);
      }}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 bg-transparent text-sm text-sidebar-foreground outline-none border-b border-sidebar-foreground/30 py-0"
    />
  );
}

function SidebarContent({
  collapsed,
  conversations,
  activeId,
  hoveredId,
  setHoveredId,
  renamingId,
  renameValue,
  setRenameValue,
  onStartRename,
  onFinishRename,
  onNew,
  onSelect,
  onDelete,
  onToggleCollapse,
  onOpenAIProfile,
  onOpenUserProfile,
  onOpenSettings,
  onOpenSchedule,
  onExpandSidebar,
}: {
  collapsed: boolean;
  conversations: { id: string; title: string }[];
  activeId: string | null;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: (id: string, title: string) => void;
  onFinishRename: (id: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleCollapse: () => void;
  onOpenAIProfile: () => void;
  onOpenUserProfile: () => void;
  onOpenSettings: () => void;
  onOpenSchedule: () => void;
  onExpandSidebar: () => void;
}) {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const { aiName, userName } = useProfileNames();

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/schedules");
        const d = await r.json();
        const pending = (d.schedules || []).filter((s: any) => !s.done);
        setHasPending(pending.length > 0);
      } catch {}
    };
    check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* Header */}
      <div className="h-11 shrink-0 border-b border-sidebar-border flex items-center px-3">
        <div className={`flex items-center w-full transition-all duration-300 ease-in-out ${collapsed ? "justify-center" : ""}`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (collapsed) onExpandSidebar();
            }}
            className="h-7 w-7 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-[10px] font-semibold shrink-0 hover:opacity-80 transition-opacity"
          >
            心
          </button>
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (!collapsed) onOpenAIProfile();
            }}
            className="text-sm font-bold text-sidebar-foreground whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out cursor-pointer hover:text-foreground"
            style={{ width: collapsed ? 0 : '100px', opacity: collapsed ? 0 : 1, marginLeft: collapsed ? 0 : 10 }}
          >
            {aiName}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            className="shrink-0 flex items-center justify-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent transition-colors overflow-hidden"
            style={{ width: collapsed ? 0 : 24, height: 24, opacity: collapsed ? 0 : 1, marginLeft: collapsed ? 0 : 'auto' }}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* "常规功能" section */}
      {collapsed ? (
        <div className="flex items-center justify-center py-3">
          <div className="flex flex-col items-center gap-1">
            {[...FEATURE_ICONS_ROW1, ...FEATURE_ICONS_ROW2].map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={(e) => {
                  e.stopPropagation();
                  if (label === "通知") onOpenSchedule();
                  else console.log(`${label} clicked`);
                }}
                title={label}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors active:scale-90 ${
                  label === "通知" && hasPending
                    ? "text-primary"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon size={20} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-3 pt-2.5 pb-1">
          <div className="rounded-xl border border-sidebar-border/60 overflow-hidden">
            <button
              onClick={() => setFeaturesOpen(!featuresOpen)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer"
            >
              <Settings2 size={15} className="text-muted-foreground" />
              常规功能
            </button>
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{ maxHeight: featuresOpen ? '120px' : '0px', opacity: featuresOpen ? 1 : 0 }}
            >
              <div className="grid grid-cols-4 gap-1 px-3 pb-2">
                {FEATURE_ICONS_ROW1.map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    onClick={() => console.log(`${label} clicked`)}
                    title={label}
                    className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all active:scale-90"
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1 px-3 pb-2.5">
                {FEATURE_ICONS_ROW2.map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (label === "通知") onOpenSchedule();
                      else console.log(`${label} clicked`);
                    }}
                    title={label}
                    className={`flex h-8 w-8 mx-auto items-center justify-center rounded-lg transition-all active:scale-90 ${
                      label === "通知" && hasPending
                        ? "text-primary hover:bg-sidebar-accent/50"
                        : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }`}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Chat button (expanded only) */}
      {!collapsed && (
        <div className="px-3 pt-1 pb-1">
          <button
            onClick={onNew}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground border border-sidebar-border/60 hover:bg-sidebar-accent hover:border-sidebar-border transition-all active:scale-[0.97] active:bg-sidebar-accent"
          >
            <Plus size={16} className="text-primary" />
            New Chat
          </button>
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2">
        {!collapsed && (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={(e) => { e.stopPropagation(); onSelect(conv.id); }}
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`
                  group relative flex items-center rounded-lg transition-colors cursor-pointer
                  w-full gap-2 px-3 py-2 text-sm
                  ${activeId === conv.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}
                `}
              >
                <MessageSquare size={14} className="shrink-0" />
                {renamingId === conv.id ? (
                  <RenameInput
                    value={renameValue}
                    onChange={setRenameValue}
                    onFinish={onFinishRename}
                    convId={conv.id}
                  />
                ) : (
                  <span className="flex-1 truncate text-left">{conv.title}</span>
                )}
                {activeId === conv.id && renamingId !== conv.id && (
                  <div className="absolute right-14 top-0 h-full w-6 bg-gradient-to-l from-sidebar-accent to-transparent pointer-events-none" />
                )}
                {(hoveredId === conv.id || activeId === conv.id) && renamingId !== conv.id && (
                  <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                    <Pencil
                      size={13}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onStartRename(conv.id, conv.title); }}
                    />
                    <Trash2
                      size={13}
                      className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-11 shrink-0 border-t border-sidebar-border flex items-center px-3">
        <div className={`flex items-center w-full ${collapsed ? "justify-center" : "gap-3"}`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (collapsed) onExpandSidebar();
            }}
            className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-semibold shrink-0 hover:opacity-80 transition-opacity"
          >
            U
          </button>
          {!collapsed && (
            <>
              <span
                onClick={(e) => { e.stopPropagation(); onOpenUserProfile(); }}
                className="flex-1 text-sm font-medium text-sidebar-foreground truncate cursor-pointer hover:text-foreground transition-colors"
              >
                {userName}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Heart size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
