export type WeatherScene = "none" | "nebula" | "rain" | "ripple" | "blossom" | "sunshine" | "breeze";

export interface WeatherConfig {
  scene: WeatherScene;
  hue: number;
  density: number;
  speed: number;
  size: number;
  wind: number;
}
