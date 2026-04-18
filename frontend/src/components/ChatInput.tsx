import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Paperclip, ArrowUp } from "lucide-react";
import { WeatherControlPanel } from "./WeatherControlPanel";
import type { WeatherConfig } from "./WeatherCanvas";

interface ChatInputProps {
  onSend: (message: string) => void;
  weatherConfig: WeatherConfig;
  onWeatherChange: (config: WeatherConfig) => void;
  isLightScene?: boolean;
}

export function ChatInput({ onSend, weatherConfig, onWeatherChange, isLightScene }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 208) + "px";
    }
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = value.trim().length > 0;

  return (
    <div className="relative bg-gradient-to-t from-background via-background to-transparent pt-6">
      <div className="mx-auto max-w-3xl px-4 pb-3 md:px-6">
        <div className="flex items-end gap-2 rounded-2xl bg-secondary px-3 py-2 shadow-sm transition-all focus-within:ring-1 focus-within:ring-ring/30 focus-within:shadow-md">
          <button className="mb-1 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="max-h-52 flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />

          <WeatherControlPanel config={weatherConfig} onChange={onWeatherChange} />

          <button
            onClick={handleSend}
            disabled={!hasContent}
            className={`mb-1 flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              hasContent
                ? "bg-foreground text-background hover:opacity-80"
                : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed"
            }`}
          >
            <ArrowUp size={16} />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Enter 发送，Shift + Enter 换行
        </p>
      </div>
    </div>
  );
}
