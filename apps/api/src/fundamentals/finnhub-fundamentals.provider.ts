import { Injectable, Logger } from "@nestjs/common";
import type {
  EconomicEvent,
  EconomicImpact,
  FundDirection,
  FundamentalsStatus,
  MarketNewsArticle,
  MarketNewsCategory,
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
  private readonly calendarCache = new Map<string, { at: number; events: EconomicEvent[] }>();
  private readonly newsCache = new Map<MarketNewsCategory, { at: number; articles: MarketNewsArticle[] }>();
  private readonly calendarCacheMs = 20 * 60_000;
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
      message: "Finnhub · economic calendar, releases and Forex news",
      updatedAt: new Date().toISOString(),
    };
  }

  async getCalendar(
    from?: string,
    to?: string,
  ): Promise<readonly EconomicEvent[]> {
    if (!this.apiKey) return [];

    const now = Date.now();
    const start = this.dateOnly(from, now - 2 * 24 * 60 * 60_000);
    const end = this.dateOnly(to, now + 7 * 24 * 60 * 60_000);
    const cacheKey = `${start}:${end}`;
    const cached = this.calendarCache.get(cacheKey);
    if (cached && now - cached.at < this.calendarCacheMs) return cached.events;

    try {
      const url = new URL(`${this.baseUrl}/calendar/economic`);
      url.searchParams.set("from", start);
      url.searchParams.set("to", end);
      url.searchParams.set("token", this.apiKey);
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Finnhub calendar HTTP ${res.status}`);
        return cached?.events ?? [];
      }

      const body = (await res.json()) as {
        economicCalendar?: Array<Record<string, unknown>>;
      };
      const raw = Array.isArray(body.economicCalendar) ? body.economicCalendar : [];
      const startMs = Date.parse(`${start}T00:00:00.000Z`);
      const endMs = Date.parse(`${end}T23:59:59.999Z`);
      const events = raw
        .map((row) => this.mapEvent(row))
        .filter((event): event is EconomicEvent => {
          if (!event) return false;
          const time = Date.parse(event.time);
          return Number.isFinite(time) && time >= startMs && time <= endMs;
        })
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

      this.calendarCache.set(cacheKey, { at: now, events });
      if (this.calendarCache.size > 8) {
        const oldest = this.calendarCache.keys().next().value;
        if (oldest) this.calendarCache.delete(oldest);
      }
      return events;
    } catch (err) {
      this.logger.warn(
        "Finnhub calendar failed",
        err instanceof Error ? err.message : err,
      );
      return cached?.events ?? [];
    }
  }

  async getNews(category: MarketNewsCategory): Promise<readonly MarketNewsArticle[]> {
    if (!this.apiKey) return [];
    const now = Date.now();
    const cached = this.newsCache.get(category);
    if (cached && now - cached.at < this.newsCacheMs) return cached.articles;

    try {
      const url = new URL(`${this.baseUrl}/news`);
      url.searchParams.set("category", category);
      url.searchParams.set("token", this.apiKey);
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Finnhub ${category} news HTTP ${res.status}`);
        return cached?.articles ?? [];
      }

      const body: unknown = await res.json();
      if (!Array.isArray(body)) return cached?.articles ?? [];
      const articles = body.flatMap((item): MarketNewsArticle[] => {
        if (typeof item !== "object" || item === null) return [];
        const row = item as Record<string, unknown>;
        const headline = typeof row.headline === "string" ? row.headline.trim() : "";
        const articleUrl = typeof row.url === "string" ? row.url.trim() : "";
        const published = Number(row.datetime);
        if (
          !headline ||
          !articleUrl ||
          !/^https?:\/\//i.test(articleUrl) ||
          !Number.isFinite(published) ||
          published <= 0
        ) return [];

        return [{
          id: String(row.id ?? `${published}-${headline}`),
          category,
          publishedAt: new Date(published * 1000).toISOString(),
          headline,
          summary: typeof row.summary === "string" ? row.summary.trim() : "",
          source: typeof row.source === "string" ? row.source.trim() : "Finnhub",
          url: articleUrl,
          ...(typeof row.image === "string" && /^https?:\/\//i.test(row.image)
            ? { image: row.image }
            : {}),
          ...(typeof row.related === "string" && row.related.trim()
            ? { related: row.related.trim() }
            : {}),
        }];
      }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

      this.newsCache.set(category, { at: now, articles });
      return articles;
    } catch (err) {
      this.logger.warn(
        `Finnhub ${category} news request failed`,
        err instanceof Error ? err.message : err,
      );
      return cached?.articles ?? [];
    }
  }

  private dateOnly(value: string | undefined, fallbackMs: number): string {
    const parsed = value ? new Date(value) : new Date(fallbackMs);
    return Number.isFinite(parsed.getTime())
      ? parsed.toISOString().slice(0, 10)
      : new Date(fallbackMs).toISOString().slice(0, 10);
  }

  private parseReleaseTime(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const raw = value.trim();
    if (!raw) return null;

    // Finnhub calendar events commonly use "YYYY-MM-DD HH:mm:ss".
    // Normalize timezone-less timestamps as UTC so the browser and API server
    // agree on the release instant.
    const withIsoSeparator = raw.replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/,
      "$1T$2Z",
    );

    // ISO timestamps without an explicit offset are also interpreted as UTC.
    const normalized =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(
        withIsoSeparator,
      )
        ? `${withIsoSeparator}Z`
        : withIsoSeparator;

    const parsed = new Date(normalized);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
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

    const time = this.parseReleaseTime(row.time);
    if (!time) {
      // Never assign Date.now() to a release with a missing/unparseable
      // provider timestamp: that silently moves historical releases to today.
      this.logger.warn(
        `Skipping Finnhub calendar event without a valid release timestamp: ${eventName}`,
      );
      return null;
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
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(/,/g, "");
    if (!raw || /^(?:n\/a|na|-)$/i.test(raw)) return null;
    const match = raw.match(/^([-+]?(?:\d+\.?\d*|\.\d+))\s*([KMB])?%?$/i);
    if (!match) return null;
    const base = Number(match[1]);
    const suffix = match[2]?.toUpperCase();
    const multiplier = suffix === "K" ? 1e3 : suffix === "M" ? 1e6 : suffix === "B" ? 1e9 : 1;
    const result = base * multiplier;
    return Number.isFinite(result) ? result : null;
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
