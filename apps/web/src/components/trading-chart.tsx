"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ChartTimeframe, MarketInstrument } from "@veytrix/shared";
import { useHydrated, usePreferences } from "./theme-provider";

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
  const resolvedTheme = useSyncExternalStore(
    subscribeToResolvedTheme,
    getResolvedTheme,
    getServerTheme,
  );

  // Charts must work for every provider-supported instrument, not only favourites.
  const activeInstrument = instruments.some(
    (item) => item.symbol === selectedInstrument,
  )
    ? selectedInstrument
    : instruments.some((item) => item.symbol === initialInstrument)
      ? initialInstrument
      : (instruments[0]?.symbol ?? "");
  const instrument = instruments.find(
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
  const widgetUrl = (() => {
    const params = new URLSearchParams({
      symbol,
      interval: tradingViewIntervals[timeframe],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: resolvedTheme,
      style: "1",
      locale: "en",
      hide_top_toolbar: "false",
      hide_side_toolbar: "false",
      allow_symbol_change: "false",
      save_image: "false",
      withdateranges: "true",
      details: "false",
      hotlist: "false",
      calendar: "false",
      toolbarbg: chartBackground.replace("#", ""),
      hideideas: "1",
    });
    const studies = [
      ...(showSma ? ["MASimple@tv-basicstudies"] : []),
      ...(showEma ? ["MAExp@tv-basicstudies"] : []),
      ...(showVolume ? ["Volume@tv-basicstudies"] : []),
    ];
    if (studies.length) params.set("studies", studies.join(";"));
    params.set("overrides", JSON.stringify({
      "mainSeriesProperties.candleStyle.upColor": preferences.bullishColor,
      "mainSeriesProperties.candleStyle.downColor": preferences.bearishColor,
      "mainSeriesProperties.candleStyle.wickUpColor": preferences.bullishColor,
      "mainSeriesProperties.candleStyle.wickDownColor": preferences.bearishColor,
      "mainSeriesProperties.candleStyle.borderUpColor": preferences.bullishColor,
      "mainSeriesProperties.candleStyle.borderDownColor": preferences.bearishColor,
    }));
    return `https://www.tradingview.com/widgetembed/?${params.toString()}`;
  })();

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
            {instruments.length === 0 && (
              <option value="">No instruments available</option>
            )}
            {instruments.map((item) => (
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
          {symbol && (
            <iframe
              key={widgetKey}
              title={`TradingView chart for ${instrument?.symbol ?? "selected market"}`}
              src={widgetUrl}
              className="tradingview-chart-frame"
              onLoad={() => setWidgetLoadResult({ key: widgetKey })}
              onError={() =>
                setWidgetLoadResult({
                  key: widgetKey,
                  error: "TradingView could not load this market chart.",
                })
              }
              allow="clipboard-write; fullscreen"
              allowFullScreen
              loading="eager"
            />
          )}
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