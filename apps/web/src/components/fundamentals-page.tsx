"use client";

import { useEffect, useMemo, useState } from "react";
import type { EconomicEvent, FundamentalsStatus, MarketNewsArticle } from "@veytrix/shared";
import { getEconomicCalendar, getFinancialNews, getFundamentalsStatus } from "@/lib/fundamentals-api";

const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", CNY: "🇨🇳", SGD: "🇸🇬",
};

function flagFor(currency: string) {
  return CURRENCY_FLAG[currency.toUpperCase()] ?? "🌐";
}

function countdownLabel(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = t - now;
  if (diff < -30 * 60_000) return "Done";
  if (diff < 0) return "Live";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

function shortAnalysis(ev: EconomicEvent): string {
  const bias = ev.currencyBias ?? "pending";
  const impact = ev.impact ?? "medium";
  if (ev.actual != null && ev.estimate != null) {
    const surprise = Number(ev.actual) - Number(ev.estimate);
    const word =
      surprise > 0 ? "above forecast" : surprise < 0 ? "below forecast" : "in line";
    const lean =
      bias === "bullish"
        ? `Stronger ${ev.currency} print supports ${ev.currency}-long / cross short on the quote currency.`
        : bias === "bearish"
          ? `Weaker ${ev.currency} print weighs on ${ev.currency}; prefer fades into strength until structure agrees.`
          : `Bias still mixed — wait for price to confirm.`;
    return `${ev.event}: actual ${word} (actual ${ev.actual}, forecast ${ev.estimate}). ${lean}`;
  }
  if (bias === "pending") {
    return `${ev.event} is ${impact}-impact for ${ev.currency}. Until the print, treat the window as high noise — size down and avoid fresh entries 15–30m either side.`;
  }
  return `${ev.currency} directional lean is ${bias} from available figures on ${ev.event}. Use this with technical structure, not alone.`;
}

export function FundamentalsPage() {
  const [status, setStatus] = useState<FundamentalsStatus | null>(null);
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [news, setNews] = useState<MarketNewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [view, setView] = useState<"calendar" | "news">("calendar");
  const [loading, setLoading] = useState(true);
  const [impact, setImpact] = useState<"all" | "high" | "medium" | "low">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const st = await getFundamentalsStatus();
        if (cancelled) return;
        setStatus(st);
        if (st.state !== "connected") {
          setLoading(false);
          return;
        }
        const cal = await getEconomicCalendar();
        if (cancelled) return;
        setEvents(Array.isArray(cal) ? cal : []);
      } catch {
        /* empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getFinancialNews("forex")
      .then((articles) => {
        if (!cancelled) {
          setNews(Array.isArray(articles) ? articles : []);
          setNewsError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setNews([]);
          setNewsError(
            error instanceof Error ? error.message : "Forex news is unavailable.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dayLabel = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    if (dayOffset === 0) return "Today · " + d.toDateString();
    if (dayOffset === -1) return "Yesterday · " + d.toDateString();
    if (dayOffset === 1) return "Tomorrow · " + d.toDateString();
    return d.toDateString();
  }, [dayOffset]);

  const dayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d.getTime();
  }, [dayOffset]);
  const dayEnd = dayStart + 24 * 60 * 60_000;

  const filtered = useMemo(() => {
    let list = events.filter((e) => {
      const t = new Date(e.time).getTime();
      return t >= dayStart && t < dayEnd;
    });
    if (impact !== "all") list = list.filter((e) => e.impact === impact);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.event.toLowerCase().includes(q) ||
          e.currency.toLowerCase().includes(q) ||
          e.country.toLowerCase().includes(q),
      );
    }
    return list.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [events, impact, query, dayStart, dayEnd]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId],
  );

  const viewTabs = (
    <div className="sig-filters" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={view === "calendar"}
        className={`sig-filter${view === "calendar" ? " on" : ""}`}
        onClick={() => {
          setView("calendar");
          setSelectedId(null);
        }}
      >
        Calendar
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "news"}
        className={`sig-filter${view === "news" ? " on" : ""}`}
        onClick={() => {
          setView("news");
          setSelectedId(null);
        }}
      >
        Headlines
      </button>
    </div>
  );

  if (view === "news") {
    return (
      <div className="news-screen">
        {viewTabs}
        <div className="news-toolbar">
          <span className="news-count">{news.length} headlines (in-app)</span>
        </div>
        {newsLoading ? <div className="home-empty">Loading headlines…</div> : null}
        {newsError ? <div className="home-empty">{newsError}</div> : null}
        {!newsLoading && !newsError && news.length === 0 ? (
          <div className="home-empty">No headlines right now</div>
        ) : null}
        {news.map((article) => {
          const published = new Date(article.publishedAt);
          return (
            <article key={article.id} className="news-row news-row-internal">
              <span className="news-row-time">
                {published.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="news-row-main">
                <span className="news-row-top">
                  <span className="news-ccy sm">{article.source}</span>
                  <span className="news-countdown">
                    {published.toLocaleDateString([], { day: "numeric", month: "short" })}
                  </span>
                </span>
                <strong>{article.headline}</strong>
                {article.summary ? (
                  <span className="news-article-summary">{article.summary}</span>
                ) : (
                  <span className="news-article-summary">
                    Shown in-app only. Use Calendar for event bias and affected pairs.
                  </span>
                )}
                {article.related ? (
                  <span className="news-article-related">Pairs: {article.related}</span>
                ) : null}
              </span>
            </article>
          );
        })}
      </div>
    );
  }

  if (selected) {
    const when = new Date(selected.time);
    const cd = countdownLabel(selected.time, now);
    const pairs = (selected.affectedPairs ?? []).filter(
      (p) => p.bias === "bullish" || p.bias === "bearish",
    );
    return (
      <div className="news-screen">
        {viewTabs}
        <button type="button" className="news-back" onClick={() => setSelectedId(null)}>
          ← Back
        </button>
        <article className="news-detail-card">
          <div className="news-detail-chips">
            <span className="news-ccy">
              {flagFor(selected.currency)} {selected.currency}
            </span>
            <span className={`news-impact ${selected.impact}`}>{selected.impact}</span>
            {cd ? <span className="news-countdown">{cd}</span> : null}
          </div>
          <h2 className="news-detail-title">{selected.event}</h2>
          <p className="news-detail-meta">
            {when.toLocaleString(undefined, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <div className="news-metrics">
            <div>
              <span>Forecast</span>
              <strong>{selected.estimate != null ? selected.estimate : "—"}</strong>
            </div>
            <div>
              <span>Previous</span>
              <strong>{selected.previous != null ? selected.previous : "—"}</strong>
            </div>
            <div>
              <span>Actual</span>
              <strong>{selected.actual != null ? selected.actual : "—"}</strong>
            </div>
          </div>
        </article>
        <section className="news-block">
          <h3>What it means</h3>
          <p className="news-means">{shortAnalysis(selected)}</p>
          <div className="news-bias-pill">
            {selected.currency} ·{" "}
            <strong>
              {(selected.currencyBias ?? "pending").charAt(0).toUpperCase() +
                (selected.currencyBias ?? "pending").slice(1)}
            </strong>
          </div>
        </section>
        {pairs.length > 0 ? (
          <section className="news-block">
            <h3>Affected pairs</h3>
            <div className="news-pair-list">
              {pairs.slice(0, 8).map((p) => (
                <div key={p.symbol} className="news-pair-row">
                  <strong>{p.symbol}</strong>
                  <span className={`news-pair-bias ${p.bias}`}>{p.bias}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="news-screen">
      {viewTabs}
      <div className="news-day-nav">
        <button
          type="button"
          className="news-back"
          onClick={() => {
            setDayOffset((v) => v - 1);
            setSelectedId(null);
          }}
        >
          ← Prev
        </button>
        <strong className="news-day-title">{dayLabel}</strong>
        <button
          type="button"
          className="news-back"
          onClick={() => {
            setDayOffset((v) => v + 1);
            setSelectedId(null);
          }}
        >
          Next →
        </button>
      </div>
      <div className="news-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search events"
        />
        <span className="news-count">{filtered.length} events</span>
      </div>
      <div className="sig-filters">
        {(["all", "high", "medium", "low"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`sig-filter${impact === v ? " on" : ""}`}
            onClick={() => setImpact(v)}
          >
            {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        {dayOffset !== 0 ? (
          <button type="button" className="sig-filter" onClick={() => setDayOffset(0)}>
            Today
          </button>
        ) : null}
      </div>
      {loading ? <div className="home-empty">Loading calendar…</div> : null}
      {!loading && status?.state !== "connected" ? (
        <div className="home-empty">{status?.message ?? "Calendar offline"}</div>
      ) : null}
      {!loading && status?.state === "connected" && filtered.length === 0 ? (
        <div className="home-empty">No events this day</div>
      ) : null}
      {!loading
        ? filtered.map((ev) => {
            const time = new Date(ev.time).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const cd = countdownLabel(ev.time, now);
            return (
              <button
                key={ev.id}
                type="button"
                className="news-row"
                onClick={() => setSelectedId(ev.id)}
              >
                <span className="news-row-time">{time}</span>
                <span className="news-row-main">
                  <span className="news-row-top">
                    <span className="news-ccy sm">
                      {flagFor(ev.currency)} {ev.currency}
                    </span>
                    <span className={`news-impact ${ev.impact}`}>{ev.impact}</span>
                    {cd ? <span className="news-countdown">{cd}</span> : null}
                  </span>
                  <strong>{ev.event}</strong>
                </span>
                <span className="chevron">›</span>
              </button>
            );
          })
        : null}
    </div>
  );
}
