import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  NewsArticleAnalysis,
  NewsCurrencyImpact,
  NewsDirection,
  NewsImpact,
  NewsIntelligence,
  NewsPairBias,
} from "@veytrix/shared";

type GdeltArticle = {
  url?: unknown;
  title?: unknown;
  seendate?: unknown;
  domain?: unknown;
  language?: unknown;
  sourcecountry?: unknown;
};

type CurrencyAccumulator = { total: number; weight: number; articleIds: Set<string> };

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const NEWS_QUERY =
  '("Federal Reserve" OR "European Central Bank" OR "Bank of England" OR "Bank of Japan" OR "Reserve Bank of Australia" OR "Bank of Canada" OR "Swiss National Bank" OR "Reserve Bank of New Zealand" OR inflation OR "interest rates" OR unemployment OR "jobs report" OR recession OR GDP OR tariffs OR sanctions)';

const CURRENCY_PATTERNS: Array<[string, RegExp]> = [
  ["USD", /(?:\bUS\b|U\.S\.|\bUnited States\b|\bUS dollar\b|\bdollar\b|\bFederal Reserve\b|\bFOMC\b|\bFed\b)/i],
  ["EUR", /\b(?:eurozone|euro area|euro|European Central Bank|ECB)\b/i],
  ["GBP", /\b(?:United Kingdom|Britain|British|sterling|pound|Bank of England|BoE)\b/i],
  ["JPY", /\b(?:Japan|Japanese|yen|Bank of Japan|BoJ)\b/i],
  ["AUD", /\b(?:Australia|Australian|Aussie|Reserve Bank of Australia|RBA)\b/i],
  ["CAD", /\b(?:Canada|Canadian|loonie|Bank of Canada|BoC)\b/i],
  ["CHF", /\b(?:Switzerland|Swiss|franc|Swiss National Bank|SNB)\b/i],
  ["NZD", /\b(?:New Zealand|kiwi|Reserve Bank of New Zealand|RBNZ)\b/i],
];

const POSITIVE_CURRENCY_CUES = [
  "hawkish", "hawkish tilt", "rate hike", "raises rates", "raised rates",
  "higher for longer", "stronger than expected", "beats forecast",
  "beats expectations", "growth accelerates", "unemployment falls",
  "job growth", "wage growth accelerates", "tightening", "upgrades outlook",
  "capital inflows",
];
const NEGATIVE_CURRENCY_CUES = [
  "dovish", "rate cut", "cuts rates", "cut rates", "lower rates",
  "weaker than expected", "misses forecast", "misses expectations",
  "recession", "economic contraction", "growth slows", "unemployment rises",
  "job losses", "layoffs", "wage growth slows", "easing", "downgrades outlook",
  "capital outflows", "inflation cools", "inflation slows",
];

const FX_PAIRS = [
  "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCHF", "USDCAD",
  "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPAUD", "GBPCAD", "GBPNZD",
  "AUDJPY", "AUDCAD", "AUDNZD", "CADJPY", "CHFJPY", "NZDJPY", "NZDCAD",
];

@Injectable()
export class NewsIntelligenceService {
  private readonly logger = new Logger(NewsIntelligenceService.name);
  private readonly cache = new Map<string, { at: number; value: NewsIntelligence }>();
  private readonly cacheMs = 5 * 60_000;

  async getIntelligence(from?: string, to?: string): Promise<NewsIntelligence> {
    const now = Date.now();
    const startMs = from ? Date.parse(from) : now - 24 * 60 * 60_000;
    const endMs = to ? Date.parse(to) : now;

    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs ||
      endMs - startMs > 26 * 60 * 60_000
    ) {
      throw new BadRequestException("News date range must be a valid single local day.");
    }

    const cacheKey = startMs + ":" + endMs;
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.at < this.cacheMs) {
      return cached.value;
    }

    try {
      const url = new URL(GDELT_URL);
      url.search = new URLSearchParams({
        query: NEWS_QUERY,
        mode: "ArtList",
        format: "json",
        startdatetime: this.toGdeltDate(startMs - 1_000),
        enddatetime: this.toGdeltDate(endMs),
        maxrecords: "250",
        sort: "DateDesc",
      }).toString();

      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Veytrix-News-Intelligence/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        throw new Error("GDELT news request failed (HTTP " + response.status + ").");
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new Error("GDELT returned a non-JSON response; the feed may be rate-limited.");
      }

      const payload = (await response.json()) as { articles?: unknown };
      const rows = Array.isArray(payload.articles) ? (payload.articles as GdeltArticle[]) : [];
      const articles = this.analyseArticles(rows, startMs, endMs);
      const pairBiases = this.buildPairBiases(articles);
      const value: NewsIntelligence = {
        provider: "GDELT global news",
        state: "connected",
        updatedAt: new Date().toISOString(),
        articles,
        pairBiases,
        note: "Analysis is restricted to headlines published during the selected date. Scores describe that day's headline evidence; they are not probabilities or guaranteed forecasts.",
      };
      this.cache.set(cacheKey, { at: now, value });
      if (this.cache.size > 20) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : "News feed unavailable.";
      this.logger.warn("News intelligence refresh failed: " + message);
      const sameDayCache = this.cache.get(cacheKey);
      if (sameDayCache) {
        return {
          ...sameDayCache.value,
          state: "degraded",
          note: "Showing cached headlines for this selected date because the live feed is temporarily unavailable. " + sameDayCache.value.note,
        };
      }
      return {
        provider: "GDELT global news",
        state: "degraded",
        updatedAt: new Date().toISOString(),
        articles: [],
        pairBiases: [],
        note: message + " No directional bias is available for this date until the feed responds.",
      };
    }
  }

  private toGdeltDate(timestamp: number): string {
    return new Date(timestamp).toISOString().replace(/\D/g, "").slice(0, 14);
  }

  private analyseArticles(rows: GdeltArticle[], startTimeMs: number, endTimeMs: number): NewsArticleAnalysis[] {
    const seen = new Set<string>();
    const analysed: NewsArticleAnalysis[] = [];
    for (const row of rows) {
      const title = typeof row.title === "string" ? row.title.trim() : "";
      const rawUrl = typeof row.url === "string" ? row.url.trim() : "";
      if (!title || !/^https?:\/\//i.test(rawUrl)) continue;
      const id = rawUrl.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);

      const publishedAt = this.parseDate(row.seendate);
      if (!publishedAt) continue;
      const publishedMs = Date.parse(publishedAt);
      if (publishedMs < startTimeMs || publishedMs >= endTimeMs) continue;
      const currencies = CURRENCY_PATTERNS
        .filter(([, pattern]) => pattern.test(title))
        .map(([currency]) => currency);
      if (currencies.length === 0) continue;

      const source = typeof row.domain === "string" && row.domain
        ? row.domain
        : this.domainFromUrl(rawUrl);
      const cue = this.scoreHeadline(title);
      const ageHours = Math.max(0, (endTimeMs - publishedMs) / 3_600_000);
      const freshness = Math.exp((-Math.LN2 * ageHours) / 24);
      const impactWeight = this.impactWeight(title);
      const score = cue.direction * cue.strength * impactWeight * freshness;

      let currencyImpacts: NewsCurrencyImpact[];
      let summary: string;
      if (currencies.length > 1) {
        currencyImpacts = currencies.map((currency) => ({
          currency,
          bias: "neutral",
          score: 0,
          reason: "The headline names multiple currency regions; Veytrix withholds a one-sided conclusion without article context.",
        }));
        summary = "Multiple currency regions are mentioned. Directional impact is withheld rather than assigning the same sentiment to every currency.";
      } else if (cue.direction === 0) {
        currencyImpacts = [{
          currency: currencies[0],
          bias: "neutral",
          score: 0,
          reason: "No clear directional monetary-policy or macroeconomic cue was detected in the headline.",
        }];
        summary = "Relevant macro headline detected, but its title does not provide enough directional evidence.";
      } else {
        const bias: NewsDirection = cue.direction > 0 ? "bullish" : "bearish";
        currencyImpacts = [{
          currency: currencies[0],
          bias,
          score: Number((score * 100).toFixed(1)),
          reason: cue.reason,
        }];
        summary = cue.reason + " This is a headline-level inference and should be checked against the full report and market reaction.";
      }

      const impact: NewsImpact = impactWeight >= 0.9 ? "high" : impactWeight >= 0.65 ? "medium" : "low";
      analysed.push({
        id,
        title,
        url: rawUrl,
        source,
        publishedAt,
        impact,
        currencies,
        currencyImpacts,
        summary,
      });
    }
    return analysed.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 60);
  }

  private buildPairBiases(articles: NewsArticleAnalysis[]): NewsPairBias[] {
    const currencyScores = new Map<string, CurrencyAccumulator>();
    for (const article of articles) {
      for (const item of article.currencyImpacts) {
        if (item.score === 0) continue;
        const current = currencyScores.get(item.currency) ?? {
          total: 0,
          weight: 0,
          articleIds: new Set<string>(),
        };
        current.total += item.score;
        current.weight += 100;
        current.articleIds.add(article.id);
        currencyScores.set(item.currency, current);
      }
    }

    return FX_PAIRS.map((symbol) => {
      const base = symbol.slice(0, 3);
      const quote = symbol.slice(3, 6);
      const baseData = currencyScores.get(base);
      const quoteData = currencyScores.get(quote);
      const baseStrength = baseData && baseData.weight > 0 ? baseData.total / baseData.weight : 0;
      const quoteStrength = quoteData && quoteData.weight > 0 ? quoteData.total / quoteData.weight : 0;
      const score = Math.max(-100, Math.min(100, (baseStrength - quoteStrength) * 50));
      const articleCount = new Set([
        ...(baseData ? [...baseData.articleIds] : []),
        ...(quoteData ? [...quoteData.articleIds] : []),
      ]).size;
      const bias: NewsDirection = articleCount === 0 || Math.abs(score) < 12
        ? "neutral"
        : score > 0 ? "bullish" : "bearish";
      const bothCurrenciesHaveEvidence = Boolean(
        baseData?.articleIds.size && quoteData?.articleIds.size,
      );
      const confidence = bothCurrenciesHaveEvidence && articleCount >= 8 && Math.abs(score) >= 30
        ? "high"
        : bothCurrenciesHaveEvidence && articleCount >= 3 ? "moderate" : "low";
      const summary = articleCount === 0
        ? "Insufficient directional headline evidence for either currency."
        : base + " evidence: " + (baseData?.articleIds.size ?? 0) +
          " headline(s); " + quote + " evidence: " + (quoteData?.articleIds.size ?? 0) +
          " headline(s). Pair score is the relative headline-strength spread.";
      return {
        symbol,
        bias,
        score: Number(score.toFixed(1)),
        confidence,
        articleCount,
        summary,
      };
    }).filter((item) => item.articleCount > 0);
  }

  private scoreHeadline(title: string): { direction: -1 | 0 | 1; strength: number; reason: string } {
    const normalized = title.toLowerCase();
    const positive = POSITIVE_CURRENCY_CUES.filter((cue) => normalized.includes(cue));
    const negative = NEGATIVE_CURRENCY_CUES.filter((cue) => normalized.includes(cue));
    if (positive.length === negative.length) {
      return { direction: 0, strength: 0, reason: "Conflicting or absent directional cues." };
    }
    const direction = positive.length > negative.length ? 1 : -1;
    const matches = direction > 0 ? positive : negative;
    const strength = Math.min(1, 0.55 + matches.length * 0.15);
    return {
      direction,
      strength,
      reason: (direction > 0 ? "Hawkish or stronger macro language" : "Dovish or weaker macro language") +
        " was detected (" + matches.slice(0, 3).join(", ") + ").",
    };
  }

  private impactWeight(title: string): number {
    const text = title.toLowerCase();
    if (/central bank|federal reserve|interest rate|policy rate|rate hike|rate cut|inflation|cpi|pce|employment|payroll|unemployment/.test(text)) return 1;
    if (/gdp|recession|growth|trade balance|retail sales|wages/.test(text)) return 0.75;
    if (/tariff|sanction|geopolit|oil|energy|war|conflict/.test(text)) return 0.55;
    return 0.4;
  }

  private parseDate(value: unknown): string | null {
    if (typeof value !== "string" || !value) return null;
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
    if (!match) {
      const parsed = new Date(value);
      return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
    const iso = match[1] + "-" + match[2] + "-" + match[3] + "T" +
      match[4] + ":" + match[5] + ":" + match[6] + "Z";
    const parsed = new Date(iso);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  private domainFromUrl(value: string): string {
    try { return new URL(value).hostname.replace(/^www\./, ""); }
    catch { return "Unknown source"; }
  }
}
