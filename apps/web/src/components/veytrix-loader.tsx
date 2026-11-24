"use client";

/** Futuristic faded loader — page transitions, offline, chart load */
export function VeytrixLoader({
  label = "Loading…",
  variant = "overlay",
}: {
  label?: string;
  /** overlay = full panel fade; inline = chart-sized */
  variant?: "overlay" | "inline" | "fullscreen";
}) {
  return (
    <div
      className={`vx-loader vx-loader-${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="vx-loader-scene" aria-hidden>
        <div className="vx-loader-grid" />
        <div className="vx-loader-candles">
          <span style={{ height: "42%" }} />
          <span style={{ height: "68%" }} />
          <span style={{ height: "55%" }} />
          <span style={{ height: "78%" }} />
          <span style={{ height: "48%" }} />
          <span style={{ height: "62%" }} />
          <span style={{ height: "36%" }} />
        </div>
        <div className="vx-loader-line" />
        <div className="vx-loader-orb">
          <div className="vx-loader-orb-core" />
          <div className="vx-loader-orb-ring" />
          <div className="vx-loader-orb-glow" />
          <div className="vx-loader-eyes">
            <i />
            <i />
          </div>
        </div>
        <div className="vx-loader-nodes">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <p className="vx-loader-label">{label}</p>
    </div>
  );
}
