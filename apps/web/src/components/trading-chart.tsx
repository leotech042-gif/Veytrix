"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChartTimeframe, MarketInstrument } from "@veytrix/shared";
import { useHydrated, usePreferences } from "./theme-provider";
import { useMarketFavorites } from "./market-watch";

const timeframes: ChartTimeframe[] = [
  "M1",
  "M5",
  "M15",
  "M30",
  "H1",
  "H4",
  "D1",
  "W1",
];

const tradingViewIntervals: Record<ChartTimeframe, string> = {
  M1: "1",
  M5: "5",
  M15: "15",
  M30: "30",
  H1: "60",
  H4: "240",
  D1: "D",
  W1: "W",
};

const tradingViewAliases: Record<string, string> = {
  AUS200: "TVC:AU200",
  BTCUSD: "BINANCE:BTCUSDT",
  ETHUSD: "BINANCE:ETHUSDT",
  GER40: "FOREXCOM:GER40",
  HK50: "TVC:HSI",
  JP225: "FOREXCOM:JPN225",
  UK100: "FOREXCOM:UKXGBP",
  US100: "FOREXCOM:NSXUSD",
  US30: "FOREXCOM:DJI",
  US500: "FOREXCOM:SPXUSD",
  XAGUSD: "OANDA:XAGUSD",
  XAUUSD: "OANDA:XAUUSD",
  XPDUSD: "OANDA:XPDUSD",
  XPTUSD: "OANDA:XPTUSD",
};

const PAIR_FLAGS: Record<string, string> = {
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  USD: "🇺🇸",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
  XAU: "🥇",
  XAG: "🥈",
  BTC: "₿",
  ETH: "Ξ",
};

function pairFlags(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.startsWith("XAU")) return "🥇🇺🇸";
  if (s.startsWith("XAG")) return "🥈🇺🇸";
  if (s.startsWith("BTC")) return "₿";
  if (s.startsWith("ETH")) return "Ξ";
  const a = s.slice(0, 3);
  const b = s.slice(3, 6);
  return `${PAIR_FLAGS[a] ?? ""}${PAIR_FLAGS[b] ?? ""}`;
}

function pairTitle(instrument?: MarketInstrument): string {
  if (!instrument) return "—";
  return instrument.displayName || instrument.symbol;
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

type ToolsTab = "drawings" | "indicators" | null;

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
  const hydrated = useHydrated();
  const resolvedTheme = useSyncExternalStore(
    subscribeToResolvedTheme,
    getResolvedTheme,
    getServerTheme,
  );

  const list = useMemo(() => {
    const favSet = new Set(favorites.map((s) => s.toUpperCase()));
    const fromFeed = instruments.filter((i) =>
      favSet.has(i.symbol.toUpperCase()),
    );
    if (fromFeed.length > 0) return fromFeed;
    const defaults = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "AUDUSD"];
    return defaults.map(
      (symbol) =>
        instruments.find((i) => i.symbol.toUpperCase() === symbol) ??
        ({
          symbol,
          displayName: symbol,
          category: "forex" as const,
        } satisfies MarketInstrument),
    );
  }, [instruments, favorites]);

  const [selectedInstrument, setSelectedInstrument] = useState("");
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<ChartTimeframe>("H1");
  const [fullScreen, setFullScreen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [toolsTab, setToolsTab] = useState<ToolsTab>(null);
  const [widgetLoadResult, setWidgetLoadResult] =
    useState<WidgetLoadResult | null>(null);

  const showSma = preferences.showSma ?? false;
  const showEma = preferences.showEma ?? false;
  const showVolume = preferences.showVolume ?? true;

  const activeInstrument =
    selectedInstrument ||
    initialInstrument ||
    list[0]?.symbol ||
    "";

  const instrument =
    list.find((i) => i.symbol.toUpperCase() === activeInstrument.toUpperCase()) ??
    list[0];

  const symbol = toTradingViewSymbol(instrument);
  const timeframe = selectedTimeframe;

  const chartBackground =
    resolvedTheme === "light" ? "#f7f7f8" : "#0b0d10";
  const gridColor =
    resolvedTheme === "light"
      ? "rgba(0,0,0,0.06)"
      : "rgba(255,255,255,0.04)";

  const widgetKey = JSON.stringify([
    symbol,
    timeframe,
    showSma,
    showEma,
    showVolume,
    resolvedTheme,
    preferences.bullishColor,
    preferences.bearishColor,
    reloadToken,
  ]);

  const loading = Boolean(symbol) && widgetLoadResult?.key !== widgetKey;
  const error =
    widgetLoadResult?.key === widgetKey
      ? (widgetLoadResult.error ?? null)
      : null;

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
      // Left drawing toolbar (trend, fib, shapes, measure, etc.)
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      save_image: true,
      show_popup_button: false,
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
  }, [
    chartBackground,
    gridColor,
    preferences.bearishColor,
    preferences.bullishColor,
    showEma,
    showSma,
    showVolume,
    symbol,
    timeframe,
    resolvedTheme,
    widgetKey,
  ]);

  useEffect(() => {
    const syncFullScreen = () => {
      setFullScreen(document.fullscreenElement === panelRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullScreen);
    return () => document.removeEventListener("fullscreenchange", syncFullScreen);
  }, []);

  const toggleFullScreen = () => {
    const panel = panelRef.current;
    if (!panel) return;
    if (document.fullscreenElement === panel) {
      void document.exitFullscreen();
      return;
    }
    if (fullScreen || typeof panel.requestFullscreen !== "function") {
      setFullScreen((current) => !current);
      return;
    }
    void panel.requestFullscreen().catch(() => setFullScreen(true));
  };

  return (
    <section
      ref={panelRef}
      className={`panel trading-chart-panel${compact ? " compact" : ""}${
        fullScreen ? " chart-fullscreen" : ""
      }`}
    >
      <div className="chart-pair-head">
        <div className="chart-pair-left">
          <span className="chart-pair-flags" aria-hidden>
            {pairFlags(instrument?.symbol ?? activeInstrument)}
          </span>
          <div>
            <strong className="chart-pair-name">
              {pairTitle(instrument)}
            </strong>
            <span className="chart-pair-symbol">{activeInstrument}</span>
          </div>
        </div>
        <div className="chart-pair-actions">
          <button
            type="button"
            className="secondary-button chart-tool-btn"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Reload
          </button>
          <button
            type="button"
            className="secondary-button chart-tool-btn"
            onClick={toggleFullScreen}
            aria-pressed={fullScreen}
          >
            {fullScreen ? "Exit" : "Full"}
          </button>
        </div>
      </div>

      <div className="chart-toolbar chart-toolbar-compact">
        <select
          className="chart-select"
          value={activeInstrument}
          onChange={(e) => setSelectedInstrument(e.target.value)}
          aria-label="Instrument"
        >
          {list.map((item) => (
            <option key={item.symbol} value={item.symbol}>
              {item.symbol}
            </option>
          ))}
        </select>

        <select
          className="chart-select"
          value={timeframe}
          onChange={(e) =>
            setSelectedTimeframe(e.target.value as ChartTimeframe)
          }
          aria-label="Timeframe"
        >
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>

        <div className="chart-indicator-toggles">
          <label>
            <input
              type="checkbox"
              checked={showSma}
              onChange={(e) => updatePreferences({ showSma: e.target.checked })}
            />
            MA
          </label>
          <label>
            <input
              type="checkbox"
              checked={showEma}
              onChange={(e) => updatePreferences({ showEma: e.target.checked })}
            />
            EMA
          </label>
          <label>
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(e) =>
                updatePreferences({ showVolume: e.target.checked })
              }
            />
            Vol
          </label>
        </div>
      </div>

      <div className="chart-canvas-wrap">
        <div className="chart-canvas" aria-label="Veytrix chart">
          <div
            className="tradingview-widget-container__widget"
            ref={widgetRef}
            style={{ width: "100%", height: "100%", minHeight: 480 }}
          />
        </div>
        {(loading || error) && (
          <div className="chart-overlay" role={error ? "alert" : "status"}>
            <strong>{error ? error : "Loading chart…"}</strong>
          </div>
        )}
      </div>

      <div className="chart-tools-dock">
        <button
          type="button"
          className={`chart-dock-btn${toolsTab === "drawings" ? " on" : ""}`}
          onClick={() =>
            setToolsTab((t) => (t === "drawings" ? null : "drawings"))
          }
        >
          <span aria-hidden>✎</span> Drawings
        </button>
        <button
          type="button"
          className={`chart-dock-btn${toolsTab === "indicators" ? " on" : ""}`}
          onClick={() =>
            setToolsTab((t) => (t === "indicators" ? null : "indicators"))
          }
        >
          <span aria-hidden>ƒx</span> Indicators
        </button>
        <button
          type="button"
          className="chart-dock-btn"
          onClick={toggleFullScreen}
        >
          <span aria-hidden>⛶</span> {fullScreen ? "Exit" : "Full"}
        </button>
      </div>

      {toolsTab === "drawings" && (
        <div className="chart-tools-sheet" role="dialog" aria-label="Drawings">
          <div className="chart-tools-sheet-head">
            <strong>Drawings</strong>
            <button type="button" className="text-button" onClick={() => setToolsTab(null)}>
              Close
            </button>
          </div>
          <p className="chart-tools-hint">
            Use the <strong>left toolbar</strong> on the chart for live tools:
            trend line, ray, horizontal, fib, rectangle, brush, measure, long/short
            position, and more. Object tree is on TradingView’s side panel.
          </p>
          <div className="chart-tools-grid">
            {[
              "Horizontal line",
              "Trend line",
              "Ray",
              "Fib retracement",
              "Rectangle",
              "Long / short position",
              "Arrow",
              "Measure",
            ].map((label) => (
              <div key={label} className="chart-tool-chip">
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {toolsTab === "indicators" && (
        <div className="chart-tools-sheet" role="dialog" aria-label="Indicators">
          <div className="chart-tools-sheet-head">
            <strong>Indicators</strong>
            <button type="button" className="text-button" onClick={() => setToolsTab(null)}>
              Close
            </button>
          </div>
          <p className="chart-tools-hint">
            Quick toggles below, or open the full library from the chart’s
            Indicators button (top bar).
          </p>
          <div className="chart-indicator-toggles chart-indicator-sheet">
            <label>
              <input
                type="checkbox"
                checked={showSma}
                onChange={(e) =>
                  updatePreferences({ showSma: e.target.checked })
                }
              />
              Moving average (SMA)
            </label>
            <label>
              <input
                type="checkbox"
                checked={showEma}
                onChange={(e) =>
                  updatePreferences({ showEma: e.target.checked })
                }
              />
              EMA
            </label>
            <label>
              <input
                type="checkbox"
                checked={showVolume}
                onChange={(e) =>
                  updatePreferences({ showVolume: e.target.checked })
                }
              />
              Volume
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
