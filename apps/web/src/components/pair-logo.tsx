"use client";

const FLAGS: Record<string, string> = {
  EUR: "🇪🇺", USD: "🇺🇸", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", CNY: "🇨🇳", CNH: "🇨🇳",
  HKD: "🇭🇰", SGD: "🇸🇬", SEK: "🇸🇪", NOK: "🇳🇴", ZAR: "🇿🇦",
  MXN: "🇲🇽", TRY: "🇹🇷", INR: "🇮🇳", KRW: "🇰🇷", BRL: "🇧🇷",
  PLN: "🇵🇱", HUF: "🇭🇺", DKK: "🇩🇰", ILS: "🇮🇱", THB: "🇹🇭",
};

type LogoToken = { mark: string; kind: "flag" | "gold" | "silver" | "bitcoin" | "ethereum" | "index" | "asset" };

function tokenLogo(code: string): LogoToken {
  if (FLAGS[code]) return { mark: FLAGS[code], kind: "flag" };
  if (code === "XAU") return { mark: "Au", kind: "gold" };
  if (code === "XAG") return { mark: "Ag", kind: "silver" };
  if (code === "BTC") return { mark: "₿", kind: "bitcoin" };
  if (code === "ETH") return { mark: "Ξ", kind: "ethereum" };
  if (code === "SOL") return { mark: "◎", kind: "asset" };
  return { mark: code.slice(0, 3) || "•", kind: "index" };
}

function resolveTokens(symbol: string): [LogoToken, LogoToken] {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const indexTokens: Record<string, [string, string]> = {
    US30: ["USD", "US30"], NAS100: ["USD", "NAS"], US100: ["USD", "US100"],
    US500: ["USD", "SPX"], GER40: ["EUR", "GER"], UK100: ["GBP", "UK"],
    JP225: ["JPY", "JP"], AUS200: ["AUD", "AUS"], HK50: ["HKD", "HK"],
  };
  if (indexTokens[normalized]) {
    const [base, badge] = indexTokens[normalized];
    return [tokenLogo(base), { mark: badge, kind: "index" }];
  }

  const base = normalized.startsWith("XAU") ? "XAU"
    : normalized.startsWith("XAG") ? "XAG"
    : normalized.startsWith("BTC") ? "BTC"
    : normalized.startsWith("ETH") ? "ETH"
    : normalized.startsWith("SOL") ? "SOL"
    : normalized.slice(0, 3);
  const quote = normalized.endsWith("USDT") ? "USDT"
    : normalized.endsWith("USDC") ? "USDC"
    : normalized.slice(-3);
  return [tokenLogo(base), tokenLogo(quote === "USDT" || quote === "USDC" ? "USD" : quote)];
}

export function PairLogo({
  symbol,
  size = "md",
}: {
  symbol: string;
  size?: "sm" | "md";
}) {
  const [base, quote] = resolveTokens(symbol);
  return (
    <span className={`pair-logo pair-logo--${size}`} role="img" aria-label={`${symbol} market logos`} title={symbol}>
      <span className={`pair-logo__badge pair-logo__base pair-logo__${base.kind}`}>{base.mark}</span>
      <span className={`pair-logo__badge pair-logo__quote pair-logo__${quote.kind}`}>{quote.mark}</span>
    </span>
  );
}
