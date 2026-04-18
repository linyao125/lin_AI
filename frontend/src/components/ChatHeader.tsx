import { Menu, Share } from "lucide-react";

interface ChatHeaderProps {
  onMenuClick: () => void;
}

export function ChatHeader({ onMenuClick }: ChatHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between px-3 bg-background/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-1">
        <button onClick={onMenuClick} className="rounded-lg p-1.5 text-foreground hover:bg-accent md:hidden transition-colors">
          <Menu size={20} />
        </button>
        <span className="ml-2 text-base font-bold text-foreground">日常心跳</span>
      </div>

      <div className="flex items-center gap-1">
        <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <Share size={14} />
          <span className="hidden md:inline">Share</span>
        </button>
      </div>
    </header>
  );
}
