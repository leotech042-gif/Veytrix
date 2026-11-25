import type { EconomicEvent, FundamentalsStatus, MarketNewsArticle, MarketNewsCategory } from "@veytrix/shared";

export class FundamentalsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FundamentalsApiError";
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new FundamentalsApiError(
      `Fundamentals request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export function getFundamentalsStatus(): Promise<FundamentalsStatus> {
  return getJson<FundamentalsStatus>("/fundamentals/status");
}

export function getEconomicCalendar(
  from?: string,
  to?: string,
): Promise<EconomicEvent[]> {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return getJson<EconomicEvent[]>(
    `/fundamentals/calendar${qs ? `?${qs}` : ""}`,
  );
}

export function getFinancialNews(
  category: MarketNewsCategory = "forex",
): Promise<MarketNewsArticle[]> {
  const q = new URLSearchParams({ category });
  return getJson<MarketNewsArticle[]>(`/fundamentals/news?${q.toString()}`);
}
