import { Injectable, Logger } from "@nestjs/common";
import type {
  EconomicEvent,
  EconomicImpact,
  FundDirection,
  FundamentalsStatus,
} from "@veytrix/shared";
import type { FundamentalsProvider } from "./fundamentals-provider";

/**
 * Free economic calendar based on Forex Factory data
 * (faireconomy.media JSON feed — no API key).
 */
const FEEDS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
] as const;

const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: [
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "USDCHF",
    "AUDUSD",
    "USDCAD",
    "NZDUSD",
    "XAUUSD",
  ],
  EUR: ["EURUSD", "EURGBP", "EURJPY", "EURCHF", "EURAUD"],
  GBP: ["GBPUSD", "EURGBP", "GBPJPY", "GBPCHF", "GBPAUD"],
  JPY: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY"],
  AUD: ["AUDUSD", "EURAUD", "GBPAUD", "AUDJPY"],
  CAD: ["USDCAD"],
  CHF: ["USDCHF", "EURCHF", "GBPCHF"],
  NZD: ["NZDUSD"],
  CNY: ["USDCNH"],
};

type FfRow = {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
};

@Injectable()
export class FfCalendarFundamentalsProvider implements FundamentalsProvider {
  private readonly logger = new Logger(FfCalendarFundamentalsProvider.name);
  private cache: { at: number; events: EconomicEvent[] } | null = null;
  private readonly cacheMs = 15 * 60_000;

  getStatus(): FundamentalsStatus {
    return {
      state: "connected",
      provider: "Forex Factory Calendar",
      message: "Live economic calendar · this week + next week",
      updatedAt: new Date().toISOString(),
    };
  }

  async getCalendar(
    from?: string,
    to?: string,
  ): Promise<readonly EconomicEvent[]> {
    if (this.cache && Date.now() - this.cache.at < this.cacheMs) {
      return this.filterRange(this.cache.events, from, to);
    }

    try {
      const batches = await Promise.all(
        FEEDS.map(async (url) => {
          const res = await fetch(url, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) {
            this.logger.warn(`FF calendar HTTP ${res.status} · ${url}`);
            return [] as FfRow[];
          }
          const body = (await res.json()) as unknown;
          return Array.isArray(body) ? (body as FfRow[]) : [];
        }),
      );

      const seen = new Set<string>();
      const events: EconomicEvent[] = [];

      for (const row of batches.flat()) {
        const mapped = this.mapEvent(row);
        if (!mapped) continue;
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        events.push(mapped);
      }

      events.sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
      );

      this.cache = { at: Date.now(), events };
      return this.filterRange(events, from, to);
    } catch (err) {
      this.logger.warn(
        "FF calendar failed",
        err instanceof Error ? err.message : err,
      );
      return this.filterRange(this.cache?.events ?? [], from, to);
    }
  }

  private filterRange(
    events: readonly EconomicEvent[],
    from?: string,
    to?: string,
  ): EconomicEvent[] {
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() : null;
    return events.filter((e) => {
      const t = new Date(e.time).getTime();
      if (Number.isNaN(t)) return false;
      if (fromMs != null && !Number.isNaN(fromMs) && t < fromMs) return false;
      if (toMs != null && !Number.isNaN(toMs) && t > toMs + 24 * 60 * 60_000)
        return false;
      return true;
    });
  }

  private mapEvent(row: FfRow): EconomicEvent | null {
    const eventName = typeof row.title === "string" ? row.title.trim() : "";
    if (!eventName) return null;

    const currencyRaw =
      typeof row.country === "string" ? row.country.trim().toUpperCase() : "";
    const currency = this.normalizeCurrency(currencyRaw);
    const country = currencyRaw || currency;

    const impact = this.mapImpact(row.impact);
    const actual = this.parseNum(row.actual);
    const estimate = this.parseNum(row.forecast);
    const previous = this.parseNum(row.previous);

    let time: string;
    if (typeof row.date === "string" && row.date) {
      const d = new Date(row.date);
      time = Number.isNaN(d.getTime())
        ? new Date().toISOString()
        : d.toISOString();
    } else {
      time = new Date().toISOString();
    }

    const surprise =
      actual !== null && estimate !== null ? actual - estimate : null;

    const currencyBias = this.biasFromRelease(
      eventName,
      surprise,
      actual,
      estimate,
      impact,
    );

    const volatility =
      impact === "high"
        ? "highly_volatile"
        : impact === "medium"
          ? "normal"
          : "low";

    const analysis = this.buildAnalysis(
      eventName,
      currency,
      impact,
      actual,
      estimate,
      previous,
      surprise,
      currencyBias,
    );

    const affectedPairs = this.expandPairs(currency, currencyBias, eventName);

    return {
      id: `${currency}-${eventName}-${time}`
        .replace(/\s+/g, "_")
        .slice(0, 120),
      time,
      country,
      currency,
      event: eventName,
      impact,
      actual,
      estimate,
      previous,
      surprise,
      volatility,
      analysis,
      currencyBias,
      affectedPairs,
    };
  }

  private normalizeCurrency(code: string): string {
    const map: Record<string, string> = {
      US: "USD",
      USA: "USD",
      USD: "USD",
      EU: "EUR",
      EMU: "EUR",
      EUR: "EUR",
      GB: "GBP",
      UK: "GBP",
      GBP: "GBP",
      JP: "JPY",
      JPN: "JPY",
      JPY: "JPY",
      AU: "AUD",
      AUS: "AUD",
      AUD: "AUD",
      CA: "CAD",
      CAN: "CAD",
      CAD: "CAD",
      CH: "CHF",
      CHE: "CHF",
      CHF: "CHF",
      NZ: "NZD",
      NZL: "NZD",
      NZD: "NZD",
      CN: "CNY",
      CHN: "CNY",
      CNY: "CNY",
    };
    return map[code] ?? code.slice(0, 3);
  }

  private mapImpact(value: unknown): EconomicImpact {
    const s = String(value ?? "").toLowerCase();
    if (s.includes("high") || s === "3" || s === "red") return "high";
    if (s.includes("med") || s === "2" || s === "orange") return "medium";
    if (s.includes("low") || s === "1" || s === "yellow") return "low";
    if (s.includes("holiday") || s.includes("none")) return "low";
    return "unknown";
  }

  /** Parse "170K", "3.2%", "-0.1" etc. into a number where possible. */
  private parseNum(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const s = String(value).trim();
    if (!s || s === "-" || s.toLowerCase() === "n/a") return null;

    const cleaned = s.replace(/,/g, "").replace(/%/g, "").trim();
    const mult =
      /b$/i.test(cleaned) ? 1e9 : /m$/i.test(cleaned) ? 1e6 : /k$/i.test(cleaned) ? 1e3 : 1;
    const core = cleaned.replace(/[bmk]$/i, "");
    const n = Number(core);
    return Number.isFinite(n) ? n * mult : null;
  }

  private biasFromRelease(
    name: string,
    surprise: number | null,
    actual: number | null,
    estimate: number | null,
    impact: EconomicImpact,
  ): FundDirection {
    if (actual === null && estimate === null) return "pending";
    if (surprise === null) return "pending";

    const n = name.toLowerCase();
    const isUnemployment =
      n.includes("unemployment") ||
      n.includes("jobless") ||
      n.includes("claims");

    let direction: FundDirection;
    if (Math.abs(surprise) < 1e-12) {
      direction = "neutral";
    } else if (isUnemployment) {
      direction = surprise > 0 ? "bearish" : "bullish";
    } else {
      direction = surprise > 0 ? "bullish" : "bearish";
    }

    if (impact === "low" && Math.abs(surprise) < 0.05) return "neutral";
    return direction;
  }

  private buildAnalysis(
    name: string,
    currency: string,
    impact: EconomicImpact,
    actual: number | null,
    estimate: number | null,
    previous: number | null,
    surprise: number | null,
    bias: FundDirection,
  ): string {
    const parts: string[] = [];
    parts.push(`${name} (${currency}) · impact ${impact}.`);
    if (actual !== null) parts.push(`Actual ${actual}.`);
    if (estimate !== null) parts.push(`Forecast ${estimate}.`);
    if (previous !== null) parts.push(`Previous ${previous}.`);
    if (surprise !== null) {
      parts.push(`Surprise ${surprise > 0 ? "+" : ""}${surprise}.`);
    }
    if (bias === "pending") {
      parts.push("Figures not released yet — bias pending.");
    } else {
      parts.push(`${currency} bias: ${bias} from this print.`);
    }
    if (impact === "high") {
      parts.push("High-impact release — expect elevated volatility.");
    }
    return parts.join(" ");
  }

  private expandPairs(
    currency: string,
    bias: FundDirection,
    eventName: string,
  ): EconomicEvent["affectedPairs"] {
    const pairs = CURRENCY_PAIRS[currency] ?? [];
    return pairs.map((symbol) => {
      const base = symbol.slice(0, 3);
      const quote = symbol.slice(3, 6);
      let pairBias: FundDirection = "neutral";

      if (bias === "pending") {
        pairBias = "pending";
      } else if (bias === "neutral") {
        pairBias = "neutral";
      } else if (base === currency) {
        pairBias = bias;
      } else if (quote === currency) {
        pairBias =
          bias === "bullish"
            ? "bearish"
            : bias === "bearish"
              ? "bullish"
              : "neutral";
      }

      if (symbol === "XAUUSD" && currency === "USD") {
        pairBias =
          bias === "bullish"
            ? "bearish"
            : bias === "bearish"
              ? "bullish"
              : "neutral";
      }

      return {
        symbol,
        bias: pairBias,
        note: `${eventName} → ${currency} ${bias}`,
      };
    });
  }
}
