import { Injectable, Logger } from "@nestjs/common";
import type {
  EconomicEvent,
  FundamentalNewsItem,
  EconomicImpact,
  FundDirection,
  FundamentalsStatus,
} from "@veytrix/shared";
import type { FundamentalsProvider } from "./fundamentals-provider";

/** Major FX pairs per currency for bias expansion */
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

@Injectable()
export class FinnhubFundamentalsProvider implements FundamentalsProvider {
  private readonly logger = new Logger(FinnhubFundamentalsProvider.name);
  private readonly apiKey = process.env.FINNHUB_API_KEY?.trim();
  private readonly baseUrl = "https://finnhub.io/api/v1";
  private cache: { at: number; events: EconomicEvent[] } | null = null;
  private newsCache: { at: number; items: FundamentalNewsItem[] } | null = null;
  private readonly cacheMs = 20 * 60_000;
  private readonly newsCacheMs = 5 * 60_000;

  getStatus(): FundamentalsStatus {
    if (!this.apiKey) {
      return {
        state: "unconfigured",
        provider: null,
        message:
          "FINNHUB_API_KEY is not set. Add it to the API environment to load the economic calendar.",
      };
    }
    return {
      state: "connected",
      provider: "Finnhub Economic Calendar",
      message: "Economic calendar · release analysis · market news",
      updatedAt: new Date().toISOString(),
    };
  }

  async getCalendar(
    from?: string,
    to?: string,
  ): Promise<readonly EconomicEvent[]> {
    if (!this.apiKey) return [];

    if (this.cache && Date.now() - this.cache.at < this.cacheMs) {
      return this.cache.events;
    }

    const start =
      from ??
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end =
      to ??
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      const url = `${this.baseUrl}/calendar/economic?from=${start}&to=${end}&token=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Finnhub calendar HTTP ${res.status}`);
        return this.cache?.events ?? [];
      }

      const body = (await res.json()) as {
        economicCalendar?: Array<Record<string, unknown>>;
      };
      const raw = Array.isArray(body.economicCalendar)
        ? body.economicCalendar
        : [];

      const events = raw
        .map((row) => this.mapEvent(row))
        .filter((e): e is EconomicEvent => e !== null)
        .sort(
          (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
        );

      this.cache = { at: Date.now(), events };
      return events;
    } catch (err) {
      this.logger.warn(
        "Finnhub calendar failed",
        err instanceof Error ? err.message : err,
      );
      return this.cache?.events ?? [];
    }
  }

  async getNews(): Promise<readonly FundamentalNewsItem[]> {
    if (!this.apiKey) return [];
    if (this.newsCache && Date.now() - this.newsCache.at < this.newsCacheMs) return this.newsCache.items;
    try {
      const response = await fetch(`${this.baseUrl}/news?category=general&token=${this.apiKey}`);
      if (!response.ok) {
        this.logger.warn(`Finnhub news HTTP ${response.status}`);
        return this.newsCache?.items ?? [];
      }
      const body: unknown = await response.json();
      const rows = Array.isArray(body) ? body as Array<Record<string, unknown>> : [];
      const items = rows.map((row, index): FundamentalNewsItem | null => {
        const headline = typeof row.headline === "string" ? row.headline.trim() : "";
        const url = typeof row.url === "string" ? row.url : "";
        if (!headline || !url) return null;
        const timestamp = typeof row.datetime === "number" ? row.datetime : 0;
        return {
          id: String(row.id ?? `${timestamp}-${index}`),
          headline,
          summary: typeof row.summary === "string" ? row.summary : "",
          source: typeof row.source === "string" ? row.source : "Finnhub",
          url,
          publishedAt: timestamp > 0 ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
          category: typeof row.category === "string" ? row.category : "general",
          related: typeof row.related === "string" ? row.related.split(",").map((item) => item.trim()).filter(Boolean) : [],
        };
      }).filter((item): item is FundamentalNewsItem => item !== null)
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      this.newsCache = { at: Date.now(), items };
      return items;
    } catch (error) {
      this.logger.warn("Finnhub news failed", error instanceof Error ? error.message : error);
      return this.newsCache?.items ?? [];
    }
  }

  private mapEvent(row: Record<string, unknown>): EconomicEvent | null {
    const eventName =
      typeof row.event === "string"
        ? row.event
        : typeof row.eventName === "string"
          ? row.eventName
          : null;
    if (!eventName) return null;

    const country =
      typeof row.country === "string"
        ? row.country
        : typeof row.countryCode === "string"
          ? row.countryCode
          : "";
    const currency = this.currencyFromCountry(country, row);

    const impact = this.mapImpact(row.impact ?? row.importance);
    const actual = this.num(row.actual);
    const estimate = this.num(row.estimate ?? row.forecast);
    const previous = this.num(row.prev ?? row.previous);

    let time: string;
    if (typeof row.time === "string" && row.time.includes("T")) {
      time = new Date(row.time).toISOString();
    } else if (typeof row.time === "string" && typeof row.date === "string") {
      time = new Date(`${row.date}T${row.time}Z`).toISOString();
    } else if (typeof row.date === "string") {
      time = new Date(`${row.date}T12:00:00Z`).toISOString();
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
      id: `${country}-${eventName}-${time}`.replace(/\s+/g, "_").slice(0, 120),
      time,
      country,
      currency,
      event: eventName,
      impact,
      actual,
      estimate,
      previous,
      unit: typeof row.unit === "string" ? row.unit : undefined,
      surprise,
      volatility,
      analysis,
      currencyBias,
      affectedPairs,
    };
  }

  private currencyFromCountry(
    country: string,
    row: Record<string, unknown>,
  ): string {
    if (typeof row.currency === "string" && row.currency.length === 3) {
      return row.currency.toUpperCase();
    }
    const map: Record<string, string> = {
      US: "USD",
      USA: "USD",
      EU: "EUR",
      EMU: "EUR",
      GB: "GBP",
      UK: "GBP",
      JP: "JPY",
      JPN: "JPY",
      AU: "AUD",
      AUS: "AUD",
      CA: "CAD",
      CAN: "CAD",
      CH: "CHF",
      CHE: "CHF",
      NZ: "NZD",
      NZL: "NZD",
      CN: "CNY",
      CHN: "CNY",
    };
    return map[country.toUpperCase()] ?? country.toUpperCase().slice(0, 3);
  }

  private mapImpact(value: unknown): EconomicImpact {
    if (typeof value === "number") {
      if (value >= 3) return "high";
      if (value === 2) return "medium";
      if (value === 1) return "low";
    }
    const s = String(value ?? "").toLowerCase();
    if (s.includes("high") || s === "3") return "high";
    if (s.includes("med") || s === "2") return "medium";
    if (s.includes("low") || s === "1") return "low";
    return "unknown";
  }

  private num(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Positive surprise on growth/inflation/jobs → currency bullish (simplified).
   * Rate decisions: hawkish (higher than expected) → bullish currency.
   */
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
    const isUnemployment = n.includes("unemployment") || n.includes("jobless");
    const isInverse = isUnemployment; // higher unemployment = bearish currency

    let direction: FundDirection;
    if (Math.abs(surprise) < 1e-9) {
      direction = "neutral";
    } else if (isInverse) {
      direction = surprise > 0 ? "bearish" : "bullish";
    } else {
      direction = surprise > 0 ? "bullish" : "bearish";
    }

    // Tiny surprises on low impact → neutral
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
      parts.push(`Surprise ${surprise > 0 ? "+" : ""}${surprise.toFixed(2)}.`);
    }
    if (bias === "pending") {
      parts.push("Figures not released yet — bias pending.");
    } else {
      parts.push(`${currency} bias: ${bias} from this print.`);
    }
    if (impact === "high") {
      parts.push(
        "High-impact release — expect elevated volatility around the print.",
      );
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
        // Strong base → pair bullish
        pairBias = bias;
      } else if (quote === currency) {
        // Strong quote → pair bearish
        pairBias =
          bias === "bullish"
            ? "bearish"
            : bias === "bearish"
              ? "bullish"
              : "neutral";
      }

      // Metals: strong USD often weighs on gold
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
