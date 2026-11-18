"use client";

import { useEffect, useState } from "react";

type OrbVariant = "idle" | "loading" | "scanning" | "analyzing" | "hero";

interface AiOrbProps {
  variant?: OrbVariant;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: 48,
  md: 72,
  lg: 120,
  xl: 180,
};

export function AiOrb({
  variant = "idle",
  size = "md",
  className = "",
  label,
}: AiOrbProps) {
  const px = sizeMap[size];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (variant === "idle" || variant === "hero") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 80);
    return () => window.clearInterval(id);
  }, [variant]);

  const isActive = variant === "loading" || variant === "scanning" || variant === "analyzing";

  return (
    <div
      className={`ai-orb ai-orb--${variant} ai-orb--${size} ${className}`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={label ?? "Veytrix intelligence core"}
    >
      <div className="ai-orb__glow" />
      <div className="ai-orb__ring ai-orb__ring--outer" />
      <div className="ai-orb__ring ai-orb__ring--mid" />
      <div className="ai-orb__ring ai-orb__ring--inner" />
      <div className="ai-orb__core">
        <div className="ai-orb__pupil" />
        {isActive && (
          <div className="ai-orb__scan" style={{ transform: `rotate(${tick * 8}deg)` }} />
        )}
      </div>
      {variant === "analyzing" && (
        <div className="ai-orb__particles" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      )}
    </div>
  );
}
