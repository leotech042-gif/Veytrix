"use client";

const BADGE: Record<string, { label: string; tone: string }> = {
  EUR: { label: "€", tone: "tone-eur" },
  GBP: { label: "£", tone: "tone-gbp" },
  USD: { label: "$", tone: "tone-usd" },
  JPY: { label: "¥", tone: "tone-jpy" },
  AUD: { label: "A$", tone: "tone-aud" },
  CAD: { label: "C$", tone: "tone-cad" },
  CHF: { label: "Fr", tone: "tone-chf" },
  NZD: { label: "N$", tone: "tone-nzd" },
  XAU: { label: "Au", tone: "tone-metal" },
  XAG: { label: "Ag", tone: "tone-metal" },
};

export function PairLogo({
  symbol,
  size = "md",
}: {
  symbol: string;
  size?: "sm" | "md";
}) {
  const base = symbol.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
  const badge = BADGE[base] ?? { label: base.slice(0, 2), tone: "tone-default" };
  return (
    <span
      className={`pair-logo pair-logo--${size} ${badge.tone}`}
      aria-hidden="true"
      title={symbol}
    >
      {badge.label}
    </span>
  );
}
