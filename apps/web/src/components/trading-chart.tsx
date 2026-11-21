"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChartTimeframe,
  MarketCandle,
  MarketInstrument,
} from "@veytrix/shared";
import { getMarketHistory } from "@/lib/market-data-api";
import { usePreferences } from "./theme-provider";
import { useMarketFavorites } from "./market-watch";
import { PairLogo } from "./pair-logo";

const timeframes: ChartTimeframe[] = [
  "M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1",
];

type DrawTool = "none" | "crosshair" | "hline" | "trend";

type DrawnLine =
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "trend"; x1: number; y1: number; x2: number; y2: number };

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

function formatPrice(n: number, precision = 5): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(precision, 5),
    maximumFractionDigits: Math.min(precision, 5),
  });
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { favorites } = useMarketFavorites();
  const { preferences, updatePreferences } = usePreferences();

  const favoriteInstruments = useMemo(() => {
    const set = new Set(favorites.map((s) => s.toUpperCase()));
    const fromFav = instruments.filter((i) => set.has(i.symbol.toUpperCase()));
    if (fromFav.length > 0) return fromFav;
    return instruments.slice(0, 12);
  }, [favorites, instruments]);

  const [selectedInstrument, setSelectedInstrument] = useState(
    initialInstrument || favoriteInstruments[0]?.symbol || "",
  );
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("H1");
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [tool, setTool] = useState<DrawTool>("crosshair");
  const [drawings, setDrawings] = useState<DrawnLine[]>([]);
  const [hover, setHover] = useState<{
    index: number;
    price: number;
    x: number;
    y: number;
  } | null>(null);
  const trendStart = useRef<{ x: number; y: number } | null>(null);

  const showSma = preferences.showSma;
  const showEma = preferences.showEma;
  const showVolume = preferences.showVolume;

  const activeInstrument =
    selectedInstrument ||
    favoriteInstruments[0]?.symbol ||
    instruments[0]?.symbol ||
    "";

  const instrument =
    instruments.find((i) => i.symbol === activeInstrument) ||
    favoriteInstruments.find((i) => i.symbol === activeInstrument);

  const precision = instrument?.pricePrecision ?? 5;

  useEffect(() => {
    if (!activeInstrument) {
      setCandles([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await getMarketHistory(activeInstrument, timeframe);
        if (cancelled) return;
        if (!Array.isArray(data) || data.length === 0) {
          setCandles([]);
          setError("No candles for this pair / timeframe.");
        } else {
          setCandles(data);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setCandles([]);
        setError(
          e instanceof Error ? e.message : "Could not load live candles.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeInstrument, timeframe, reloadToken]);

  useEffect(() => {
    const sync = () =>
      setFullScreen(document.fullscreenElement === panelRef.current);
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
    if (typeof panel.requestFullscreen === "function") {
      void panel.requestFullscreen().catch(() => setFullScreen((v) => !v));
    } else {
      setFullScreen((v) => !v);
    }
  };

  const layout = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const sma20 = showSma ? sma(closes, 20) : [];
    const ema20 = showEma ? ema(closes, 20) : [];
    return { closes, sma20, ema20 };
  }, [candles, showSma, showEma]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = Math.max(compact ? 280 : 420, wrap.clientHeight || 0);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isLight = document.documentElement.dataset.theme === "light";
    const bg = isLight ? "#f7f6f3" : "#0c0e12";
    const up = isLight ? "#2f6b4f" : "#6b9b7a";
    const down = isLight ? "#9b4a4a" : "#b07070";
    const muted = isLight ? "#8a857c" : "#6a6560";
    const accent = "#c4a574";
    const text = isLight ? "#2a2620" : "#e8e4dc";
    const volUp = isLight ? "rgba(47,107,79,0.35)" : "rgba(107,155,122,0.35)";
    const volDown = isLight ? "rgba(155,74,74,0.35)" : "rgba(176,112,112,0.35)";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (candles.length === 0) return;

    const padL = 8;
    const padR = 64;
    const padT = 16;
    const volH = showVolume ? Math.min(64, h * 0.16) : 0;
    const padB = 28 + volH;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    if (chartW < 40 || chartH < 40) return;

    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    }
    for (const v of layout.sma20) if (v != null) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    for (const v of layout.ema20) if (v != null) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min -= 1;
      max += 1;
    }
    const rangePad = (max - min) * 0.06;
    min -= rangePad;
    max += rangePad;

    const n = candles.length;
    const slot = chartW / Math.max(n, 1);
    const bodyW = Math.max(1, Math.min(10, slot * 0.62));
    const yOf = (price: number) =>
      padT + ((max - price) / (max - min)) * chartH;
    const xOf = (i: number) => padL + slot * i + slot / 2;

    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let t = 0; t <= 5; t++) {
      const price = max - ((max - min) * t) / 5;
      const y = yOf(price);
      ctx.fillText(formatPrice(price, precision), w - padR + 8, y + 4);
    }

    if (showVolume && volH > 0) {
      let vmax = 1;
      for (const c of candles) {
        const vol =
          c.volume != null && c.volume > 0
            ? c.volume
            : Math.abs(c.high - c.low);
        vmax = Math.max(vmax, vol);
      }
      for (let i = 0; i < n; i++) {
        const c = candles[i];
        const vol =
          c.volume != null && c.volume > 0
            ? c.volume
            : Math.abs(c.high - c.low);
        const vh = (vol / vmax) * (volH - 4);
        const x = xOf(i);
        ctx.fillStyle = c.close >= c.open ? volUp : volDown;
        ctx.fillRect(x - bodyW / 2, h - 24 - vh, bodyW, vh);
      }
    }

    for (let i = 0; i < n; i++) {
      const c = candles[i];
      const x = xOf(i);
      const yO = yOf(c.open);
      const yC = yOf(c.close);
      const yH = yOf(c.high);
      const yL = yOf(c.low);
      const bull = c.close >= c.open;
      ctx.strokeStyle = bull ? up : down;
      ctx.fillStyle = bull ? up : down;
      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.stroke();
      const top = Math.min(yO, yC);
      const bh = Math.max(1, Math.abs(yC - yO));
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
    }

    if (showSma) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = layout.sma20[i];
        if (v == null) continue;
        const x = xOf(i);
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    if (showEma) {
      ctx.strokeStyle = isLight ? "#6b5b8a" : "#a090c0";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = layout.ema20[i];
        if (v == null) continue;
        const x = xOf(i);
        const y = yOf(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    ctx.strokeStyle = accent;
    for (const d of drawings) {
      if (d.kind === "hline") {
        const y = yOf(d.price);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = muted;
        ctx.fillText(formatPrice(d.price, precision), w - padR + 8, y - 4);
      } else {
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1);
        ctx.lineTo(d.x2, d.y2);
        ctx.stroke();
      }
    }

    if (hover && tool === "crosshair") {
      ctx.strokeStyle = muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padT);
      ctx.lineTo(hover.x, padT + chartH);
      ctx.moveTo(padL, hover.y);
      ctx.lineTo(w - padR, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = text;
      ctx.fillRect(w - padR + 4, hover.y - 10, 56, 16);
      ctx.fillStyle = bg;
      ctx.fillText(formatPrice(hover.price, precision), w - padR + 8, hover.y + 2);
    }

    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const t = new Date(candles[i].time);
      const label =
        timeframe === "D1" || timeframe === "W1"
          ? t.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : t.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            });
      ctx.fillText(label, xOf(i), h - 8);
    }
  }, [
    candles, layout, showSma, showEma, showVolume, drawings, hover, tool,
    precision, timeframe, compact,
  ]);

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const priceAtY = (y: number) => {
    const wrap = wrapRef.current;
    if (!wrap || candles.length === 0) return 0;
    const h = Math.max(compact ? 280 : 420, wrap.clientHeight || 0);
    const volH = showVolume ? Math.min(64, h * 0.16) : 0;
    const padT = 16;
    const padB = 28 + volH;
    const chartH = h - padT - padB;
    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    }
    const rangePad = (max - min) * 0.06 || 1;
    min -= rangePad;
    max += rangePad;
    const ratio = (y - padT) / chartH;
    return max - ratio * (max - min);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || candles.length === 0) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const padL = 8;
    const padR = 64;
    const chartW = rect.width - padL - padR;
    const slot = chartW / Math.max(candles.length, 1);
    const index = Math.max(
      0,
      Math.min(candles.length - 1, Math.floor((x - padL) / slot)),
    );
    setHover({ index, price: priceAtY(y), x, y });
  };

  const onPointerLeave = () => setHover(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tool === "hline") {
      setDrawings((d) => [
        ...d,
        { id: `${Date.now()}`, kind: "hline", price: priceAtY(y) },
      ]);
    } else if (tool === "trend") {
      if (!trendStart.current) {
        trendStart.current = { x, y };
      } else {
        const s = trendStart.current;
        setDrawings((d) => [
          ...d,
          { id: `${Date.now()}`, kind: "trend", x1: s.x, y1: s.y, x2: x, y2: y },
        ]);
        trendStart.current = null;
      }
    }
  };

  const last = candles[candles.length - 1];
  const ohlc = hover && candles[hover.index] ? candles[hover.index] : last;

  return (
    <section
      ref={panelRef}
      className={`panel trading-chart-panel${compact ? " compact" : ""}${
        fullScreen ? " chart-fullscreen" : ""
      }`}
    >
      <div className="chart-toolbar">
        <label className="select-field">
          <span>Pair</span>
          <select
            value={activeInstrument}
            onChange={(e) => setSelectedInstrument(e.target.value)}
          >
            {favoriteInstruments.length === 0 && (
              <option value="">No pairs</option>
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
              className={`timeframe-button${timeframe === item ? " active" : ""}`}
              onClick={() => setTimeframe(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="chart-tools" role="group" aria-label="Tools">
          {(
            [
              ["crosshair", "＋"],
              ["hline", "―"],
              ["trend", "／"],
              ["none", "○"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`timeframe-button${tool === id ? " active" : ""}`}
              onClick={() => {
                setTool(id);
                trendStart.current = null;
              }}
              title={id}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="timeframe-button"
            onClick={() => {
              setDrawings([]);
              trendStart.current = null;
            }}
            title="Clear drawings"
          >
            ⌫
          </button>
        </div>

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

        <div className="chart-toolbar-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setReloadToken((t) => t + 1)}
          >
            Reload
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={toggleFullScreen}
            aria-pressed={fullScreen}
          >
            {fullScreen ? "Exit" : "Full"}
          </button>
        </div>
      </div>

      {ohlc && (
        <div className="chart-ohlc">
          {instrument && <PairLogo symbol={instrument.symbol} size="sm" />}
          <strong>{activeInstrument}</strong>
          <span>O {formatPrice(ohlc.open, precision)}</span>
          <span>H {formatPrice(ohlc.high, precision)}</span>
          <span>L {formatPrice(ohlc.low, precision)}</span>
          <span>C {formatPrice(ohlc.close, precision)}</span>
          <span className="chart-tf">{timeframe}</span>
        </div>
      )}

      <div className="chart-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="veytrix-chart-canvas"
          aria-label="Veytrix chart"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
        />
        {loading && (
          <div className="chart-overlay chart-loading" role="status">
            <div className="chart-loader" aria-hidden="true" />
            <span>Loading candles…</span>
          </div>
        )}
        {!loading && error && (
          <div className="chart-overlay" role="alert">
            <strong>Chart unavailable</strong>
            <span>{error}</span>
          </div>
        )}
        {!loading && !error && !activeInstrument && (
          <div className="chart-overlay" role="status">
            <strong>Pick a pair</strong>
            <span>Star instruments in Markets to chart them here.</span>
          </div>
        )}
      </div>
    </section>
  );
}
