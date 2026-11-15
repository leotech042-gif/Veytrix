import type {
  ChartTimeframe,
  MarketCandle,
  MarketDataStatus,
  MarketInstrument,
  MarketQuote,
  SignalProviderStatus,
  TradingSignal,
} from "@veytrix/shared";

export class MarketDataApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "MarketDataApiError";
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const categories = new Set([
  "forex",
  "metals",
  "crypto",
  "indices",
  "energy",
  "synthetic",
  "other",
]);

const timeframes = new Set(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"]);

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body =
      typeof payload === "object" && payload !== null
        ? (payload as { message?: unknown; code?: unknown })
        : undefined;
    throw new MarketDataApiError(
      typeof body?.message === "string"
        ? body.message
        : `Market data request failed (${response.status}).`,
      response.status,
      typeof body?.code === "string" ? body.code : undefined,
    );
  }

  return payload as T;
}

export function getMarketStatus(): Promise<MarketDataStatus> {
  return getJson<unknown>("/market-data/status").then((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("The market-data API returned an invalid status.");
    }

    const status = value as Record<string, unknown>;
    const valid =
      typeof status.message === "string" &&
      ((status.state === "unconfigured" && status.provider === null) ||
        (status.state === "connected" &&
          typeof status.provider === "string" &&
          typeof status.updatedAt === "string") ||
        (status.state === "disconnected" &&
          typeof status.provider === "string"));

    if (!valid)
      throw new Error("The market-data API returned an invalid status.");
    return value as MarketDataStatus;
  });
}

export async function getMarketInstruments(): Promise<MarketInstrument[]> {
  const value = await getJson<unknown>("/market-data/instruments");
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.symbol === "string" &&
        typeof item.displayName === "string" &&
        typeof item.category === "string" &&
        categories.has(item.category) &&
        (item.pricePrecision === undefined ||
          (typeof item.pricePrecision === "number" &&
            Number.isInteger(item.pricePrecision) &&
            item.pricePrecision >= 0 &&
            item.pricePrecision <= 12)),
    )
  ) {
    throw new Error("The market-data API returned an invalid instrument list.");
  }
  return value as MarketInstrument[];
}

export async function getMarketQuotes(): Promise<MarketQuote[]> {
  const value = await getJson<unknown>("/market-data/quotes");
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.instrument === "string" &&
        (item.bid === undefined ||
          (typeof item.bid === "number" && Number.isFinite(item.bid))) &&
        (item.ask === undefined ||
          (typeof item.ask === "number" && Number.isFinite(item.ask))) &&
        (item.last === undefined ||
          (typeof item.last === "number" && Number.isFinite(item.last))) &&
        (item.bid !== undefined ||
          item.ask !== undefined ||
          item.last !== undefined) &&
        (item.bid === undefined ||
          item.ask === undefined ||
          item.ask >= item.bid) &&
        typeof item.asOf === "string" &&
        Number.isFinite(Date.parse(item.asOf)) &&
        ["spread", "change", "changePercent"].every(
          (field) =>
            item[field] === undefined ||
            (typeof item[field] === "number" && Number.isFinite(item[field])),
        ) &&
        (item.delayed === undefined || typeof item.delayed === "boolean"),
    )
  ) {
    throw new Error("The market-data API returned invalid quote data.");
  }
  return value as MarketQuote[];
}

export function getMarketHistory(
  instrument: string,
  timeframe: ChartTimeframe,
): Promise<MarketCandle[]> {
  if (!timeframes.has(timeframe)) {
    throw new Error(`Unsupported chart timeframe: ${timeframe}`);
  }
  const query = new URLSearchParams({ instrument, timeframe });
  return getJson<unknown>(`/market-data/history?${query.toString()}`).then(
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error("The market-data API returned invalid candle data.");
      }
      return value as MarketCandle[];
    },
  );
}

// ==================== SIGNALS ====================

export class SignalsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalsApiError";
  }
}

export function getSignalStatus(): Promise<SignalProviderStatus> {
  return getJson<unknown>("/signals/status").then((value) => {
    if (typeof value !== "object" || value === null) {
      throw new SignalsApiError("Invalid signal status response.");
    }
    return value as SignalProviderStatus;
  });
}

export type GetSignalsOptions = {
  instrument?: string;
  favorites?: string[];
};

export function getSignals(options?: {
  instrument?: string;
  favorites?: string[];
}): Promise<TradingSignal[]> {
  const params = new URLSearchParams();
  if (options?.instrument?.trim()) {
    params.set("instrument", options.instrument.trim().toUpperCase());
  }
  if (options?.favorites?.length) {
    params.set(
      "favorites",
      options.favorites
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .join(","),
    );
  }
  const qs = params.toString();
  const path = qs ? `/signals?${qs}` : "/signals";

  return getJson<unknown>(path).then((value) => {
    if (!Array.isArray(value)) {
      throw new SignalsApiError("Invalid signals response.");
    }
    return value as TradingSignal[];
  });
}
