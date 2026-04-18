import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface AIProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export function AIProfileModal({ open, onClose }: AIProfileModalProps) {
  const [aiName, setAiName] = useState(() => localStorage.getItem("ai-name") || "日常心跳");
  const [instructions, setInstructions] = useState(() => localStorage.getItem("ai-instructions") || "");
  const [memory, setMemory] = useState(() => localStorage.getItem("ai-memory") || "");

  const autoSave = useCallback(() => {
    localStorage.setItem("ai-name", aiName);
    localStorage.setItem("ai-instructions", instructions);
    localStorage.setItem("ai-memory", memory);
  }, [aiName, instructions, memory]);

  const handleClose = () => {
    autoSave();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg h-[80vh] rounded-2xl bg-zinc-900 border border-border flex flex-col"
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
            <button className="group relative h-20 w-20 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-2xl font-bold hover:opacity-80 transition-opacity">
              心
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs text-white">
                更换
              </div>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">AI 名称</label>
              <input
                value={aiName}
                onChange={(e) => setAiName(e.target.value)}
                className="mt-1.5 flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">自定义指令</label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="为 AI 设置自定义指令..."
                className="mt-1.5 min-h-[120px] resize-y bg-background border-input"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">用户记忆</label>
              <Textarea
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="AI 记住的关于你的信息..."
                className="mt-1.5 min-h-[120px] resize-y bg-background border-input"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
