import { Injectable, Logger } from "@nestjs/common";
import type {
  EconomicEvent,
  EconomicImpact,
  FundDirection,
  FundamentalsStatus,
} from "@veytrix/shared";
import type { FundamentalsProvider } from "./fundamentals-provider";

const BASE_URL = "https://api.fxmacrodata.com/v1";
const PAID_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"] as const;

const CURRENCY_PAIRS: Record<string, string[]> = {
  USD: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD", "XAUUSD", "XAGUSD", "USDCNH"],
  EUR: ["EURUSD", "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD"],
  GBP: ["GBPUSD", "EURGBP", "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD"],
  JPY: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "CADJPY", "CHFJPY"],
  AUD: ["AUDUSD", "EURAUD", "GBPAUD", "AUDJPY", "AUDCAD", "AUDNZD"],
  CAD: ["USDCAD", "EURCAD", "GBPCAD", "CADJPY", "AUDCAD"],
  CHF: ["USDCHF", "EURCHF", "GBPCHF", "CHFJPY"],
  NZD: ["NZDUSD", "EURNZD", "GBPNZD", "AUDNZD", "NZDJPY", "NZDCAD"],
};

type JsonRecord = Record<string, unknown>;
type CachedCalendar = { at: number; events: EconomicEvent[] };

@Injectable()
export class FxMacroDataFundamentalsProvider implements FundamentalsProvider {
  private readonly logger = new Logger(FxMacroDataFundamentalsProvider.name);
  private readonly apiKey = process.env.FXMACRODATA_API_KEY?.trim() || null;
  // The anonymous tier is limited to 100 data requests per day. Cache the two
  // USD endpoints for 30 minutes so normal page refreshes do not burn quota.
  private readonly cacheMs = 45 * 60_000;
  private cache: CachedCalendar | null = null;
  private lastFetchError: string | null = null;
  private lastSuccessfulFetch: string | null = null;

  async getStatus(): Promise<FundamentalsStatus> {
    try {
      const response = await fetch(`${BASE_URL}/ping`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return {
          state: "disconnected",
          provider: "FXMacroData",
          message: `FXMacroData health check failed (HTTP ${response.status}).`,
        };
      }
      await this.getCalendar();
      if (this.lastFetchError) {
        return {
          state: "disconnected",
          provider: "FXMacroData",
          message: this.lastFetchError,
        };
      }
      return {
        state: "connected",
        provider: this.apiKey ? "FXMacroData" : "FXMacroData · Free USD tier",
        message: this.apiKey
          ? "Authenticated macro data · currency coverage depends on the active plan"
          : "USD announcements · 15-minute delay · up to 100 data requests/day · other currencies require a key",
        updatedAt: this.lastSuccessfulFetch ?? new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network request failed";
      return {
        state: "disconnected",
        provider: "FXMacroData",
        message: `FXMacroData is unreachable: ${message}`,
      };
    }
  }

  async getCalendar(from?: string, to?: string): Promise<readonly EconomicEvent[]> {
    if (this.cache && Date.now() - this.cache.at < this.cacheMs) {
      return this.filterRange(this.cache.events, from, to);
    }

    const now = new Date();
    const startDate = from ?? new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
    const endDate = to ?? new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    const currencies: readonly string[] = this.apiKey ? PAID_CURRENCIES : ["USD"];
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers["X-API-Key"] = this.apiKey;

    const urls = [
      `${BASE_URL}/announcements/changes?${new URLSearchParams({
        currencies: currencies.join(","),
        payload: "full",
        limit: "100",
      })}`,
      ...currencies.map((currency) => {
        const query = new URLSearchParams({ start_date: startDate, end_date: endDate });
        return `${BASE_URL}/calendar/${currency.toLowerCase()}?${query.toString()}`;
      }),
    ];

    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`FXMacroData HTTP ${response.status} at ${new URL(url).pathname}`);
        }
        return (await response.json()) as unknown;
      }),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled",
    );
    if (fulfilled.length === 0) {
      const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      this.lastFetchError = failed?.reason instanceof Error
        ? failed.reason.message
        : "FXMacroData returned no usable data.";
      this.logger.error(this.lastFetchError);
      throw new Error(this.lastFetchError);
    }

    const events: EconomicEvent[] = [];
    if (results[0].status === "fulfilled") {
      events.push(...this.mapAnnouncementChanges(results[0].value));
    } else {
      this.logger.warn("FXMacroData announcement changes unavailable", results[0].reason);
    }

    for (let index = 1; index < results.length; index += 1) {
      const result = results[index];
      if (result.status !== "fulfilled") {
        this.logger.warn("FXMacroData currency calendar unavailable", result.reason);
        continue;
      }
      events.push(...this.mapScheduledEvents(result.value));
    }

    const deduplicated = new Map<string, EconomicEvent>();
    for (const event of events) {
      const existing = deduplicated.get(event.id);
      if (!existing || (existing.actual === null && event.actual !== null)) {
        deduplicated.set(event.id, event);
      }
    }

    const sorted = [...deduplicated.values()].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time),
    );
    this.cache = { at: Date.now(), events: sorted };
    this.lastFetchError = null;
    this.lastSuccessfulFetch = new Date().toISOString();
    return this.filterRange(sorted, from, to);
  }

  private filterRange(events: EconomicEvent[], from?: string, to?: string): EconomicEvent[] {
    const lower = from ? Date.parse(`${from}T00:00:00Z`) : Date.now() - 7 * 86_400_000;
    const upper = to ? Date.parse(`${to}T23:59:59Z`) : Date.now() + 14 * 86_400_000;
    return events.filter((event) => {
      const time = Date.parse(event.time);
      return Number.isFinite(time) && time >= lower && time <= upper;
    });
  }

  private mapAnnouncementChanges(payload: unknown): EconomicEvent[] {
    if (!this.isRecord(payload) || !Array.isArray(payload.data)) return [];
    const output: EconomicEvent[] = [];

    for (const item of payload.data) {
      if (!this.isRecord(item)) continue;
      const currency = typeof item.currency === "string" ? item.currency.toUpperCase() : "";
      const indicator = typeof item.indicator === "string" ? item.indicator.toLowerCase() : "";
      if (!currency || !indicator) continue;

      const latest = this.isRecord(item.latest_announcement) ? item.latest_announcement : {};
      const actual = this.num(latest.val ?? item.val);
      const previous = this.num(latest.previous_value ?? item.previous_value);
      const timestamp = this.timestamp(
        latest.announcement_datetime ?? item.timestamp ?? latest.official_actual_release_datetime,
      );
      const dateValue = typeof latest.date === "string" ? latest.date : new Date().toISOString().slice(0, 10);
      const time = timestamp ?? new Date(`${dateValue}T12:00:00Z`).toISOString();
      const impact = this.mapImpact(
        latest.event_importance ?? item.event_importance ?? latest.market_tier ?? item.market_tier,
        indicator,
      );
      const bias = this.biasFromPrevious(indicator, actual, previous);
      const label = this.indicatorLabel(indicator);
      const change = actual !== null && previous !== null ? actual - previous : null;
      const id = typeof item.event_id === "string"
        ? item.event_id
        : `${currency}-${indicator}-${dateValue}`;

      output.push({
        id,
        time,
        country: this.countryForCurrency(currency),
        currency,
        event: label,
        impact,
        actual,
        estimate: null,
        previous,
        unit: typeof latest.original_unit === "string" ? latest.original_unit : undefined,
        surprise: null,
        volatility: impact === "high" ? "highly_volatile" : impact === "medium" ? "normal" : "low",
        currencyBias: bias,
        affectedPairs: this.expandPairs(currency, bias),
        analysis: this.buildAnalysis(label, currency, indicator, actual, previous, change, bias),
      });
    }
    return output;
  }

  private mapScheduledEvents(payload: unknown): EconomicEvent[] {
    if (!this.isRecord(payload) || !Array.isArray(payload.data)) return [];
    const output: EconomicEvent[] = [];
    const now = Date.now();

    for (const item of payload.data) {
      if (!this.isRecord(item)) continue;
      const currency = typeof payload.currency === "string"
        ? payload.currency.toUpperCase()
        : "USD";
      const indicator = typeof item.release === "string" ? item.release.toLowerCase() : "";
      if (!indicator) continue;

      const timestamp = this.timestamp(item.announcement_datetime);
      if (!timestamp) continue;
      const epoch = Date.parse(timestamp);
      if (!Number.isFinite(epoch) || epoch < now) continue;

      const label = this.indicatorLabel(indicator);
      const impact = this.mapImpact(
        item.event_importance ?? item.impact ?? item.importance ?? item.market_tier ?? item.top_tier_for_currency,
        indicator,
      );
      const bias: FundDirection = "pending";

      output.push({
        id: `${currency}-${indicator}-${timestamp}`,
        time: timestamp,
        country: currency,
        currency,
        event: label,
        impact,
        actual: null,
        estimate: null,
        previous: null,
        surprise: null,
        volatility: impact === "high" ? "highly_volatile" : impact === "medium" ? "normal" : "low",
        currencyBias: bias,
        affectedPairs: this.expandPairs(currency, bias),
        analysis: "Scheduled economic release. Directional bias remains pending until the published figure is available.",
      });
    }
    return output;
  }

  private buildAnalysis(
    name: string,
    currency: string,
    indicator: string,
    actual: number | null,
    previous: number | null,
    change: number | null,
    bias: FundDirection,
  ): string {
    const parts: string[] = [];
    parts.push(`${name} for ${currency}.`);
    if (actual !== null) parts.push(`Latest value: ${actual}.`);
    else parts.push("The latest value was not supplied.");
    if (previous !== null) parts.push(`Previous value: ${previous}.`);
    if (change !== null) parts.push(`Change versus previous: ${change > 0 ? "+" : ""}${change}.`);
    if (bias === "pending") {
      parts.push("No directional read was assigned because the previous value is missing or this indicator needs more context.");
    } else {
      parts.push(`${currency} directional read: ${bias}, based on the change from the previous release.`);
    }
    parts.push("The free feed does not provide consensus forecasts; this is not an actual-versus-forecast surprise.");
    if (indicator.includes("inflation") || indicator.includes("pce") || indicator === "ppi") {
      parts.push("Inflation direction is interpreted as a short-term rate-expectations tilt, not a guaranteed currency move.");
    }
    return parts.join(" ");
  }

  private biasFromPrevious(
    indicator: string,
    actual: number | null,
    previous: number | null,
  ): FundDirection {
    if (actual === null || previous === null) return "pending";
    const difference = actual - previous;
    if (Math.abs(difference) < 1e-10) return "neutral";

    const lowerIsBetter = new Set([
      "unemployment",
      "initial_jobless_claims",
      "jobless_claims",
    ]);
    const higherIsBetter = new Set([
      "policy_rate",
      "policy_rate_midpoint",
      "policy_rate_target_lower",
      "inflation",
      "inflation_mom",
      "core_inflation",
      "core_inflation_mom",
      "core_pce",
      "core_pce_mom",
      "ppi",
      "ppi_mom",
      "average_hourly_earnings",
      "average_hourly_earnings_mom",
      "wages",
      "wage_price_index",
      "non_farm_payrolls",
      "employment",
      "full_time_employment",
      "gdp",
      "gdp_growth_q4_yoy",
      "gdp_growth_qoq_saar",
      "retail_sales",
      "retail_sales_control_group",
      "retail_sales_ex_autos",
      "consumer_confidence",
      "business_confidence",
      "trade_balance",
      "current_account_balance",
    ]);

    if (lowerIsBetter.has(indicator)) return difference < 0 ? "bullish" : "bearish";
    if (higherIsBetter.has(indicator)) return difference > 0 ? "bullish" : "bearish";
    return "pending";
  }

  private expandPairs(currency: string, bias: FundDirection): EconomicEvent["affectedPairs"] {
    const pairs = CURRENCY_PAIRS[currency] ?? [];
    return pairs.map((symbol) => {
      const base = symbol.slice(0, 3);
      const quote = symbol.slice(3, 6);
      let pairBias: FundDirection = "pending";
      if (bias === "neutral") pairBias = "neutral";
      else if (bias === "bullish" || bias === "bearish") {
        if (base === currency) pairBias = bias;
        else if (quote === currency || (currency === "CNY" && quote === "CNH")) {
          pairBias = bias === "bullish" ? "bearish" : "bullish";
        }
      }
      return { symbol, bias: pairBias };
    });
  }

  private mapImpact(value: unknown, indicator: string): EconomicImpact {
    const raw = String(value ?? "").toLowerCase();
    if (raw.includes("high") || raw.includes("top") || raw === "3" || value === true) return "high";
    if (raw.includes("med") || raw === "2") return "medium";
    if (raw.includes("low") || raw === "1") return "low";

    const high = new Set([
      "policy_rate", "inflation", "core_inflation", "core_pce", "non_farm_payrolls",
      "unemployment", "gdp", "employment", "initial_jobless_claims",
    ]);
    const medium = new Set([
      "ppi", "retail_sales", "wages", "average_hourly_earnings", "consumer_confidence",
      "business_confidence", "trade_balance", "durable_goods_orders", "job_openings",
    ]);
    if (high.has(indicator)) return "high";
    if (medium.has(indicator)) return "medium";
    return "unknown";
  }

  private countryForCurrency(currency: string): string {
    const countries: Record<string, string> = {
      USD: "United States",
      EUR: "Euro Area",
      GBP: "United Kingdom",
      JPY: "Japan",
      AUD: "Australia",
      CAD: "Canada",
      CHF: "Switzerland",
      NZD: "New Zealand",
      CNY: "China",
      CNH: "China (offshore)",
    };
    return countries[currency] ?? currency;
  }

  private indicatorLabel(indicator: string): string {
    const labels: Record<string, string> = {
      non_farm_payrolls: "Non-Farm Payrolls",
      initial_jobless_claims: "Initial Jobless Claims",
      core_inflation: "Core Inflation",
      core_pce: "Core PCE",
      policy_rate: "Policy Rate",
      retail_sales: "Retail Sales",
      trade_balance: "Trade Balance",
      consumer_confidence: "Consumer Confidence",
      business_confidence: "Business Confidence",
      average_hourly_earnings: "Average Hourly Earnings",
      job_openings: "Job Openings",
      gdp_growth_q4_yoy: "GDP Growth",
      gdp_growth_qoq_saar: "GDP Growth",
    };
    return labels[indicator] ?? indicator
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private timestamp(value: unknown): string | null {
    const numeric = this.num(value);
    if (numeric !== null && numeric > 0) {
      const milliseconds = numeric > 1e12 ? numeric : numeric * 1000;
      const date = new Date(milliseconds);
      return Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    if (typeof value === "string") {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date.toISOString();
    }
    return null;
  }

  private num(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, "").replace(/%$/, ""));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
