import { useRef, useEffect, useState } from "react";
import type { WeatherConfig } from "../../WeatherCanvas";

// ── SVG Willow Branches with sin-wave sway ──
// Pure CSS/SVG scene — no WebGL

interface Branch {
  id: number;
  x: number;       // % from left
  length: number;   // px
  delay: number;    // animation phase offset
  thickness: number;
}

const BRANCHES: Branch[] = [
  { id: 0, x: 15, length: 320, delay: 0, thickness: 2 },
  { id: 1, x: 30, length: 280, delay: 0.8, thickness: 1.5 },
  { id: 2, x: 50, length: 350, delay: 1.6, thickness: 2.2 },
  { id: 3, x: 68, length: 300, delay: 2.4, thickness: 1.8 },
  { id: 4, x: 82, length: 260, delay: 3.2, thickness: 1.6 },
  { id: 5, x: 40, length: 200, delay: 0.5, thickness: 1.2 },
  { id: 6, x: 75, length: 310, delay: 1.2, thickness: 1.9 },
];

function WillowBranch({ branch, config, hoverBranch }: {
  branch: Branch;
  config: WeatherConfig;
  hoverBranch: number | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(branch.delay);
  const [pathD, setPathD] = useState("");

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      phaseRef.current += 0.016;
      const t = phaseRef.current;
      const windBase = 0.3 + config.speed * 0.5;
      const windDir = config.wind;

      const isHovered = hoverBranch === branch.id;
      const hoverAmp = isHovered ? 2.5 : 1.0;

      // Build bezier path with sin-wave displacement
      const segments = 12;
      const segLen = branch.length / segments;
      let d = `M ${0} ${0}`;

      for (let i = 1; i <= segments; i++) {
        const frac = i / segments;
        const sway = Math.sin(t * windBase + branch.delay + frac * 3.0) * (8 + frac * 15) * hoverAmp;
        const drift = windDir * frac * 20;
        const x = sway + drift;
        const y = i * segLen;
        d += ` L ${x} ${y}`;
      }

      setPathD(d);
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [branch, config.speed, config.wind, hoverBranch]);

  const h = config.hue;
  const color = `hsl(${h}, 40%, 45%)`;

  return (
    <svg
      ref={svgRef}
      className="absolute top-0 pointer-events-auto"
      style={{ left: `${branch.x}%`, width: 80, height: branch.length + 20 }}
      viewBox={`-40 -5 80 ${branch.length + 10}`}
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={branch.thickness}
        strokeLinecap="round"
        opacity={0.7}
      />
    </svg>
  );
}

export function BreezeScene({ config }: { config: WeatherConfig }) {
  const h = config.hue;
  const bg = `linear-gradient(180deg, hsl(${(h + 100) % 360}, 45%, 85%) 0%, hsl(${(h + 120) % 360}, 50%, 90%) 100%)`;
  const [hoverBranch, setHoverBranch] = useState<number | null>(null);

  return (
    <div className="absolute inset-0" style={{ background: bg, pointerEvents: "auto" }}>
      {BRANCHES.map((b) => (
        <div
          key={b.id}
          onMouseEnter={() => setHoverBranch(b.id)}
          onMouseLeave={() => setHoverBranch(null)}
          className="absolute top-0 h-full"
          style={{ left: `${b.x}%`, width: 80, transform: "translateX(-50%)" }}
        >
          <WillowBranch branch={b} config={config} hoverBranch={hoverBranch} />
        </div>
      ))}
    </div>
  );
}
