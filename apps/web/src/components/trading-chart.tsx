"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChartTimeframe, MarketInstrument } from "@veytrix/shared";
import { usePreferences } from "./theme-provider";
import { useMarketFavorites } from "./market-watch";
import { VeytrixLoader } from "./veytrix-loader";

const timeframes: ChartTimeframe[] = [
  "M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1",
];

const tradingViewIntervals: Record<ChartTimeframe, string> = {
  M1: "1", M5: "5", M15: "15", M30: "30", H1: "60", H4: "240", D1: "D", W1: "W",
};

const tradingViewAliases: Record<string, string> = {
  AUS200: "TVC:AU200", BTCUSD: "BINANCE:BTCUSDT", ETHUSD: "BINANCE:ETHUSDT",
  GER40: "FOREXCOM:GER40", HK50: "TVC:HSI", JP225: "FOREXCOM:JPN225",
  UK100: "FOREXCOM:UKXGBP", US100: "FOREXCOM:NSXUSD", US30: "FOREXCOM:DJI",
  US500: "FOREXCOM:SPXUSD", XAGUSD: "OANDA:XAGUSD", XAUUSD: "OANDA:XAUUSD",
  XPDUSD: "OANDA:XPDUSD", XPTUSD: "OANDA:XPTUSD",
};

const PAIR_FLAGS: Record<string, string> = {
  EUR: "🇪🇺", GBP: "🇬🇧", USD: "🇺🇸", JPY: "🇯🇵", AUD: "🇦🇺", CAD: "🇨🇦",
  CHF: "🇨🇭", NZD: "🇳🇿", XAU: "🥇", XAG: "🥈", BTC: "₿", ETH: "Ξ",
};

function pairFlags(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.startsWith("XAU")) return "🥇🇺🇸";
  if (s.startsWith("XAG")) return "🥈🇺🇸";
  if (s.startsWith("BTC")) return "₿";
  if (s.startsWith("ETH")) return "Ξ";
  return `${PAIR_FLAGS[s.slice(0, 3)] ?? ""}${PAIR_FLAGS[s.slice(3, 6)] ?? ""}`;
}

function toTradingViewSymbol(instrument?: MarketInstrument): string {
  if (!instrument) return "";
  const symbol = instrument.symbol.trim().toUpperCase();
  if (symbol.includes(":")) return symbol;
  if (tradingViewAliases[symbol]) return tradingViewAliases[symbol];
  const normalized = symbol.replace(/[\s/]/g, "");
  if (instrument.category === "forex") return `FX:${normalized}`;
  if (instrument.category === "metals") return `OANDA:${normalized}`;
  if (instrument.category === "crypto") {
    return `BINANCE:${normalized.endsWith("USD") ? `${normalized.slice(0, -3)}USDT` : normalized}`;
  }
  if (instrument.category === "indices") return `TVC:${normalized}`;
  return normalized;
}

function subscribeToResolvedTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getResolvedTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerTheme(): "light" | "dark" {
  return "dark";
}

interface WidgetLoadResult {
  key: string;
  error?: string;
}

export function TradingChart({
  instruments,
  initialInstrument = "",
  compact = false,
}: {
  instruments: MarketInstrument[];
  initialInstrument?: string;
  compact?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const { favorites } = useMarketFavorites();
  const { preferences, updatePreferences } = usePreferences();
  const resolvedTheme = useSyncExternalStore(
    subscribeToResolvedTheme,
    getResolvedTheme,
    getServerTheme,
  );

  const list = useMemo(() => {
    const favSet = new Set(favorites.map((s) => s.toUpperCase()));
    const fromFeed = instruments.filter((i) => favSet.has(i.symbol.toUpperCase()));
    if (fromFeed.length > 0) return fromFeed;
    const defaults = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD", "XAGUSD"];
    return defaults.map(
      (symbol) =>
        instruments.find((i) => i.symbol.toUpperCase() === symbol) ??
        ({ symbol, displayName: symbol, category: "forex" as const } satisfies MarketInstrument),
    );
  }, [instruments, favorites]);

  const [selectedInstrument, setSelectedInstrument] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] = useState<ChartTimeframe>("M30");
  const [fullScreen, setFullScreen] = useState(false);
  const [showFx, setShowFx] = useState(false);
  const [widgetLoadResult, setWidgetLoadResult] = useState<WidgetLoadResult | null>(null);

  const showSma = preferences.showSma ?? false;
  const showEma = preferences.showEma ?? false;
  const showVolume = preferences.showVolume ?? true;

  const activeInstrument =
    selectedInstrument || initialInstrument || list[0]?.symbol || "";

  const instrument =
    list.find((i) => i.symbol.toUpperCase() === activeInstrument.toUpperCase()) ?? list[0];

  const symbol = toTradingViewSymbol(instrument);
  const timeframe = selectedTimeframe;

  const chartBackground = resolvedTheme === "light" ? "#ffffff" : "#0b0d10";
  const gridColor =
    resolvedTheme === "light" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";

  // Only remount when symbol / TF / theme change — not on indicator toggles or reload.
  // Remounting wipes drawings; free TV embed cannot persist them across remounts.
  const widgetKey = JSON.stringify([symbol, timeframe, resolvedTheme]);

  const loading = Boolean(symbol) && widgetLoadResult?.key !== widgetKey;
  const error =
    widgetLoadResult?.key === widgetKey ? (widgetLoadResult.error ?? null) : null;

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || !symbol) return;

    let active = true;
    const embedContainer = document.createElement("div");
    embedContainer.className = "tradingview-widget-container";
    embedContainer.style.width = "100%";
    embedContainer.style.height = "100%";
    widget.replaceChildren(embedContainer);

    const studies = [
      ...(showSma ? ["MASimple@tv-basicstudies"] : []),
      ...(showEma ? ["MAExp@tv-basicstudies"] : []),
      ...(showVolume ? ["Volume@tv-basicstudies"] : []),
    ];

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval: tradingViewIntervals[timeframe],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: resolvedTheme === "light" ? "light" : "dark",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      save_image: true,
      backgroundColor: chartBackground,
      gridColor,
      studies,
      toolbar_bg: resolvedTheme === "light" ? "#ffffff" : "#131722",
      overrides: {
        "paneProperties.background": chartBackground,
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": gridColor,
        "paneProperties.horzGridProperties.color": gridColor,
        "mainSeriesProperties.candleStyle.upColor": preferences.bullishColor,
        "mainSeriesProperties.candleStyle.downColor": preferences.bearishColor,
        "mainSeriesProperties.candleStyle.wickUpColor": preferences.bullishColor,
        "mainSeriesProperties.candleStyle.wickDownColor": preferences.bearishColor,
        "mainSeriesProperties.candleStyle.borderUpColor": preferences.bullishColor,
        "mainSeriesProperties.candleStyle.borderDownColor": preferences.bearishColor,
      },
      support_host: "https://www.tradingview.com",
    });
    script.onload = () => {
      if (active) setWidgetLoadResult({ key: widgetKey });
    };
    script.onerror = () => {
      if (active) {
        setWidgetLoadResult({
          key: widgetKey,
          error: "Chart could not load. Check network.",
        });
      }
    };
    embedContainer.appendChild(script);

    return () => {
      active = false;
      embedContainer.remove();
    };
    // studies / colors read on mount only — changing ƒx does not remount (keeps drawings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, resolvedTheme, widgetKey]);

  useEffect(() => {
    const sync = () => setFullScreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullScreen = () => {
    const panel = panelRef.current;
    if (!panel) return;
    if (document.fullscreenElement === panel) {
      void document.exitFullscreen();
      return;
    }
    if (fullScreen || typeof panel.requestFullscreen !== "function") {
      setFullScreen((c) => !c);
      return;
    }
    void panel.requestFullscreen().catch(() => setFullScreen(true));
  };

  const title =
    instrument?.displayName?.replace(/\s*\/.*/, "") ||
    instrument?.symbol ||
    activeInstrument;

  return (
    <section
      ref={panelRef}
      className={`panel trading-chart-panel chart-alien${compact ? " compact" : ""}${
        fullScreen ? " chart-fullscreen" : ""
      }`}
    >
      <div className="chart-alien-head">
        <div className="chart-alien-pair">
          <span className="chart-pair-flags">{pairFlags(activeInstrument)}</span>
          <div className="chart-alien-pair-text">
            <strong>{title}</strong>
            <span>{activeInstrument}</span>
          </div>
        </div>
      </div>

      <div className="chart-canvas-wrap chart-alien-canvas">
        <div className="chart-canvas" aria-label="Veytrix chart">
          <div
            className="tradingview-widget-container__widget"
            ref={widgetRef}
            style={{ width: "100%", height: "100%", minHeight: 420 }}
          />
        </div>
        {loading && !error ? (
          <VeytrixLoader variant="inline" label="Loading chart…" />
        ) : null}
        {error ? (
          <div className="chart-overlay" role="alert">
            <strong>{error}</strong>
          </div>
        ) : null}
      </div>

      <div className="chart-bottom-bar chart-bottom-bar-compact">
        <select
          className="chart-pair-select"
          value={activeInstrument}
          onChange={(e) => setSelectedInstrument(e.target.value)}
          aria-label="Pair"
        >
          {list.map((item) => (
            <option key={item.symbol} value={item.symbol}>
              {pairFlags(item.symbol)} {item.symbol}
            </option>
          ))}
        </select>

        <select
          className="chart-tf-pill"
          value={timeframe}
          onChange={(e) => setSelectedTimeframe(e.target.value as ChartTimeframe)}
          aria-label="Timeframe"
        >
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>
              {tf === "M15" ? "15m" : tf === "M30" ? "30m" : tf === "H1" ? "1H" : tf}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`chart-icon-btn${showFx ? " on" : ""}`}
          aria-label="Indicators"
          onClick={() => setShowFx((v) => !v)}
        >
          ƒx
        </button>

        <button
          type="button"
          className="chart-icon-btn"
          aria-label={fullScreen ? "Exit full screen" : "Full screen"}
          aria-pressed={fullScreen}
          onClick={toggleFullScreen}
        >
          {fullScreen ? "✕" : "⛶"}
        </button>
      </div>

      {showFx && (
        <div className="chart-fx-sheet">
          <p className="chart-tools-hint">
            Prefer the chart’s own Indicators (ƒ) menu — that keeps drawings.
            Toggles below apply on the next pair/timeframe change only.
          </p>
          <label>
            <input
              type="checkbox"
              checked={showSma}
              onChange={(e) => updatePreferences({ showSma: e.target.checked })}
            />
            SMA (next chart load)
          </label>
          <label>
            <input
              type="checkbox"
              checked={showEma}
              onChange={(e) => updatePreferences({ showEma: e.target.checked })}
            />
            EMA (next chart load)
          </label>
          <label>
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) => updatePreferences({ showVolume: e.target.checked })}
            />
            Volume (next chart load)
          </label>
        </div>
      )}
    </section>
  );
}
