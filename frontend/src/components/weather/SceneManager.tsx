import { useState, useEffect, useRef } from "react";
import type { WeatherConfig, WeatherScene } from "../WeatherCanvas";
import { NebulaScene } from "./scenes/NebulaScene";
import { RainScene } from "./scenes/RainScene";
import { RippleScene } from "./scenes/RippleScene";
import { BlossomScene } from "./scenes/BlossomScene";
import { SunshineScene } from "./scenes/SunshineScene";
import { BreezeScene } from "./scenes/BreezeScene";

interface SceneManagerProps {
  config: WeatherConfig;
  onBrightnessChange?: (isLight: boolean) => void;
}

const SHADER_SCENES = new Set<WeatherScene>(["nebula", "rain", "ripple", "blossom", "sunshine"]);

// Scenes with light backgrounds (L > 0.6) → dark text
const LIGHT_SCENES = new Set<WeatherScene>(["blossom", "sunshine", "breeze"]);

export function SceneManager({ config, onBrightnessChange }: SceneManagerProps) {
  const [activeScene, setActiveScene] = useState<WeatherScene>("none");
  const [transitioning, setTransitioning] = useState(false);
  const prevScene = useRef<WeatherScene>("none");

  // Brightness detection
  useEffect(() => {
    onBrightnessChange?.(LIGHT_SCENES.has(config.scene));
  }, [config.scene, onBrightnessChange]);

  useEffect(() => {
    if (config.scene === prevScene.current) return;

    setTransitioning(true);

    const timer = setTimeout(() => {
      prevScene.current = config.scene;
      setActiveScene(config.scene);
      setTimeout(() => setTransitioning(false), 50);
    }, 300);

    return () => clearTimeout(timer);
  }, [config.scene]);

  if (activeScene === "none" && !transitioning) return null;

  const isShader = SHADER_SCENES.has(activeScene);
  const isLight = LIGHT_SCENES.has(activeScene);

  return (
    <div className="fixed inset-0 z-0" style={{ pointerEvents: isShader || activeScene === "breeze" ? "auto" : "none" }}>
      {/* Transition mask */}
      <div
        className="absolute inset-0 z-50 pointer-events-none"
        style={{
          background: isLight ? "white" : "black",
          opacity: transitioning ? 1 : 0,
          transition: "opacity 0.5s ease-in-out",
        }}
      />

      {activeScene === "nebula" && <NebulaScene config={config} />}
      {activeScene === "rain" && <RainScene config={config} />}
      {activeScene === "ripple" && <RippleScene config={config} />}
      {activeScene === "blossom" && <BlossomScene config={config} />}
      {activeScene === "sunshine" && <SunshineScene config={config} />}
      {activeScene === "breeze" && <BreezeScene config={config} />}
    </div>
  );
}
