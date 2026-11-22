"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  const [selectedInstrument, setSelectedInstrument] =
    useState(initialInstrument);
  const [selectedTimeframe, setSelectedTimeframe] =
    useState<ChartTimeframe | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [widgetLoadResult, setWidgetLoadResult] =
    useState<WidgetLoadResult | null>(null);

  const hydrated = useHydrated();
  const { preferences, updatePreferences } = usePreferences();
  const { favorites } = useMarketFavorites();
  const resolvedTheme = useSyncExternalStore(
    subscribeToResolvedTheme,
    getResolvedTheme,
    getServerTheme,
  );

  const favoriteInstruments = instruments.filter((instrument) =>
    favorites.includes(instrument.symbol),
  );
  const activeInstrument = favoriteInstruments.some(
    (instrument) => instrument.symbol === selectedInstrument,
  )
    ? selectedInstrument
    : favoriteInstruments.some(
          (instrument) => instrument.symbol === initialInstrument,
        )
      ? initialInstrument
      : (favoriteInstruments[0]?.symbol ?? "");
  const instrument = favoriteInstruments.find(
    (item) => item.symbol === activeInstrument,
  );
  const symbol = toTradingViewSymbol(instrument);
  const timeframe =
    selectedTimeframe ??
    (hydrated ? preferences.defaultTimeframe : "H1");
  const showVolume = hydrated ? preferences.showVolume : false;
  const showSma = hydrated ? preferences.showSma : false;
  const showEma = hydrated ? preferences.showEma : false;
  const chartBackground =
    resolvedTheme === "light" ? "#ffffff" : preferences.chartBackground;
  const gridColor = resolvedTheme === "light" ? "#dce2e9" : "#202a37";
  const widgetKey = JSON.stringify([
    symbol,
    timeframe,
    resolvedTheme,
    chartBackground,
    preferences.bullishColor,
    preferences.bearishColor,
    showVolume,
    showSma,
    showEma,
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
    embedContainer.className = "tradingview-widget-generation";
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
      theme: resolvedTheme,
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      withdateranges: true,
      details: false,
      hotlist: false,
      calendar: false,
      save_image: false,
      backgroundColor: chartBackground,
      gridColor,
      studies,
      overrides: {
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
          error: "The Veytrix chart could not be loaded.",
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
      <div className="chart-toolbar">
        <label className="select-field">
          <span>Instrument</span>
          <select
            value={activeInstrument}
            onChange={(event) => setSelectedInstrument(event.target.value)}
          >
            {favoriteInstruments.length === 0 && (
              <option value="">No favourite instruments</option>
            )}
            {favoriteInstruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.symbol}
              </option>
            ))}
          </select>
        </label>

        <div className="terminal-periods" role="group" aria-label="Timeframe">
          {timeframes.map((item) => (
            <button
              key={item}
              type="button"
              className={`timeframe-button${
                timeframe === item ? " active" : ""
              }`}
              onClick={() => setSelectedTimeframe(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="chart-indicator-toggles">
          <label>
            <input
              type="checkbox"
              checked={showSma}
              onChange={(event) =>
                updatePreferences({ showSma: event.target.checked })
              }
            />
            MA
          </label>
          <label>
            <input
              type="checkbox"
              checked={showEma}
              onChange={(event) =>
                updatePreferences({ showEma: event.target.checked })
              }
            />
            EMA
          </label>
          <label>
            <input
              type="checkbox"
              checked={showVolume}
              onChange={(event) =>
                updatePreferences({ showVolume: event.target.checked })
              }
            />
            Volume
          </label>
        </div>

        <div className="chart-toolbar-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Reload
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={toggleFullScreen}
            aria-pressed={fullScreen}
            aria-label={fullScreen ? "Exit full screen" : "View full screen"}
          >
            {fullScreen ? "Exit" : "Full"}
          </button>
        </div>
      </div>

      <div className="chart-canvas-wrap">
        <div
          className="chart-canvas"
          aria-label="Veytrix interactive chart"
        >
          <div
            className="tradingview-widget-container__widget"
            ref={widgetRef}
          />
        </div>
        {(loading || error || !symbol) && (
          <div className="chart-overlay" role={error ? "alert" : "status"}>
            <span className="chart-placeholder-icon" aria-hidden="true">
              {error ? "⌁" : "…"}
            </span>
            <strong>
              {!symbol
                ? "Star an instrument in Markets to see its chart here."
                : loading
                  ? "Loading Veytrix chart…"
                  : "Veytrix chart unavailable"}
            </strong>
            {error && <span>{error}</span>}
          </div>
        )}
      </div>

      <div className="chart-data-footer">
        <span>
          {instrument
            ? `Veytrix · ${instrument.symbol} · ${instrument.displayName}`
            : "Veytrix chart"}
        </span>
      </div>
    </section>
  );
}
