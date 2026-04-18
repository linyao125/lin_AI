import { useState, useRef, useEffect } from "react";
import { Cloud, CloudRain, Sun, Flower2, X, Sparkles, Droplets, TreePine } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { WeatherConfig, WeatherScene } from "./WeatherCanvas";

interface WeatherControlPanelProps {
  config: WeatherConfig;
  onChange: (config: WeatherConfig) => void;
  isLightScene?: boolean;
}

const SCENES: { scene: WeatherScene; icon: typeof CloudRain; label: string }[] = [
  { scene: "none", icon: X, label: "关闭" },
  { scene: "nebula", icon: Sparkles, label: "星云" },
  { scene: "rain", icon: CloudRain, label: "雨天" },
  { scene: "ripple", icon: Droplets, label: "涟漪" },
  { scene: "blossom", icon: Flower2, label: "落花" },
  { scene: "sunshine", icon: Sun, label: "晴天" },
  { scene: "breeze", icon: TreePine, label: "春风" },
];

export function WeatherControlPanel({ config, onChange }: WeatherControlPanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const update = (partial: Partial<WeatherConfig>) => {
    const next = { ...config, ...partial };
    onChange(next);
    localStorage.setItem("weather-config", JSON.stringify(next));
  };

  const isActive = config.scene !== "none";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`mb-1 rounded-lg p-1.5 transition-colors ${
          isActive
            ? "text-foreground bg-accent"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
        title="天气效果"
      >
        <Cloud size={18} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-72 rounded-xl border border-border bg-popover/80 backdrop-blur-xl p-3 shadow-lg animate-scale-in z-50">
          <p className="text-xs font-medium text-foreground mb-2">全景天气</p>

          <div className="grid grid-cols-4 gap-1 mb-3">
            {SCENES.map(({ scene, icon: Icon, label }) => (
              <button
                key={scene}
                onClick={() => update({ scene })}
                className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[10px] transition-all ${
                  config.scene === scene
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {config.scene !== "none" && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>色谱</span>
                  <span>{config.hue}°</span>
                </div>
                <div
                  className="h-2 rounded-full mb-1"
                  style={{
                    background: "linear-gradient(to right, hsl(0,70%,65%), hsl(60,70%,65%), hsl(120,70%,65%), hsl(180,70%,65%), hsl(240,70%,65%), hsl(300,70%,65%), hsl(360,70%,65%))",
                  }}
                />
                <Slider min={0} max={360} step={1} value={[config.hue]} onValueChange={([v]) => update({ hue: v })} className="mt-1" />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>粒子密度</span>
                  <span>{Math.round(config.density * 100)}%</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[config.density]} onValueChange={([v]) => update({ density: v })} />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>体积/模糊度</span>
                  <span>{Math.round(config.size * 100)}%</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[config.size]} onValueChange={([v]) => update({ size: v })} />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>速度</span>
                  <span>{Math.round(config.speed * 100)}%</span>
                </div>
                <Slider min={0} max={1} step={0.01} value={[config.speed]} onValueChange={([v]) => update({ speed: v })} />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>风向</span>
                  <span>{config.wind > 0 ? `→ ${Math.round(config.wind * 100)}%` : config.wind < 0 ? `← ${Math.round(-config.wind * 100)}%` : "无风"}</span>
                </div>
                <Slider min={-1} max={1} step={0.01} value={[config.wind]} onValueChange={([v]) => update({ wind: v })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
