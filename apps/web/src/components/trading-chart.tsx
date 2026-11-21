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
import {
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  FIB_LEVELS,
  formatPrice,
} from "./chart/indicators";

const timeframes: ChartTimeframe[] = [
  "M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1",
];

type DrawTool = "none" | "crosshair" | "hline" | "trend" | "fib" | "pan";
type DrawnItem =
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "trend"; i1: number; p1: number; i2: number; p2: number }
  | { id: string; kind: "fib"; i1: number; p1: number; i2: number; p2: number };

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
    return fromFav.length > 0 ? fromFav : instruments.slice(0, 12);
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
  const [drawings, setDrawings] = useState<DrawnItem[]>([]);
  const [hover, setHover] = useState<{ index: number; price: number; x: number; y: number } | null>(null);
  const draftRef = useRef<{ i: number; p: number } | null>(null);
  const panRef = useRef<{ x: number; start: number } | null>(null);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showBb, setShowBb] = useState(false);
  const [viewStart, setViewStart] = useState(0);
  const [viewCount, setViewCount] = useState(120);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const [logoReady, setLogoReady] = useState(false);

  const showSma = preferences.showSma;
  const showEma = preferences.showEma;
  const showVolume = preferences.showVolume;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      logoImgRef.current = img;
      setLogoReady(true);
    };
    img.src = "/logo.svg";
  }, []);

  const activeInstrument =
    selectedInstrument || favoriteInstruments[0]?.symbol || instruments[0]?.symbol || "";
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
          const n = data.length;
          const count = Math.min(120, n);
          setViewCount(count);
          setViewStart(Math.max(0, n - count));
        }
      } catch (e) {
        if (cancelled) return;
        setCandles([]);
        setError(e instanceof Error ? e.message : "Could not load live candles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeInstrument, timeframe, reloadToken]);

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
    if (typeof panel.requestFullscreen === "function") {
      void panel.requestFullscreen().catch(() => setFullScreen((v) => !v));
    } else setFullScreen((v) => !v);
  };

  const viewCandles = useMemo(() => {
    if (candles.length === 0) return [];
    const start = Math.max(0, Math.min(viewStart, candles.length - 1));
    return candles.slice(start, Math.min(candles.length, start + viewCount));
  }, [candles, viewStart, viewCount]);

  const viewOffset = Math.max(0, Math.min(viewStart, Math.max(0, candles.length - 1)));

  const layout = useMemo(() => {
    const closes = viewCandles.map((c) => c.close);
    return {
      sma20: showSma ? sma(closes, 20) : [],
      ema20: showEma ? ema(closes, 20) : [],
      rsi14: showRsi ? rsi(closes, 14) : [],
      macd: showMacd ? macd(closes) : null,
      bb: showBb ? bollinger(closes, 20, 2) : null,
    };
  }, [viewCandles, showSma, showEma, showRsi, showMacd, showBb]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = Math.max(compact ? 280 : 460, wrap.clientHeight || 0);
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
    if (viewCandles.length === 0) return;
    const padL = 8;
    const padR = 64;
    const padT = 12;
    const subPanels = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
    const subH = subPanels > 0 ? Math.min(72, h * 0.14) : 0;
    const volH = showVolume ? Math.min(52, h * 0.12) : 0;
    const padB = 26 + volH + subPanels * (subH + 6);
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;
    if (chartW < 40 || chartH < 40) return;
    let min = Infinity;
    let max = -Infinity;
    for (const c of viewCandles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    }
    for (const v of layout.sma20) if (v != null) { min = Math.min(min, v); max = Math.max(max, v); }
    for (const v of layout.ema20) if (v != null) { min = Math.min(min, v); max = Math.max(max, v); }
    if (layout.bb) {
      for (const v of layout.bb.upper) if (v != null) max = Math.max(max, v);
      for (const v of layout.bb.lower) if (v != null) min = Math.min(min, v);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) { min -= 1; max += 1; }
    const rangePad = (max - min) * 0.05;
    min -= rangePad;
    max += rangePad;
    const n = viewCandles.length;
    const slot = chartW / Math.max(n, 1);
    const bodyW = Math.max(1, Math.min(10, slot * 0.62));
    const yOf = (price: number) => padT + ((max - price) / (max - min)) * chartH;
    const xOf = (i: number) => padL + slot * i + slot / 2;
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let t = 0; t <= 5; t++) {
      const price = max - ((max - min) * t) / 5;
      ctx.fillText(formatPrice(price, precision), w - padR + 8, yOf(price) + 4);
    }
    if (layout.bb) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const u = layout.bb.upper[i];
        if (u == null) continue;
        if (!started) { ctx.moveTo(xOf(i), yOf(u)); started = true; } else ctx.lineTo(xOf(i), yOf(u));
      }
      for (let i = n - 1; i >= 0; i--) {
        const l = layout.bb.lower[i];
        if (l == null) continue;
        ctx.lineTo(xOf(i), yOf(l));
      }
      ctx.closePath();
      ctx.fillStyle = isLight ? "rgba(196,165,116,0.08)" : "rgba(196,165,116,0.1)";
      ctx.fill();
    }
    if (showVolume && volH > 0) {
      let vmax = 1;
      for (const c of viewCandles) {
        const vol = c.volume != null && c.volume > 0 ? c.volume : Math.abs(c.high - c.low);
        vmax = Math.max(vmax, vol);
      }
      const volBase = h - 22 - subPanels * (subH + 6);
      for (let i = 0; i < n; i++) {
        const c = viewCandles[i];
        const vol = c.volume != null && c.volume > 0 ? c.volume : Math.abs(c.high - c.low);
        const vh = (vol / vmax) * (volH - 4);
        ctx.fillStyle = c.close >= c.open ? volUp : volDown;
        ctx.fillRect(xOf(i) - bodyW / 2, volBase - vh, bodyW, vh);
      }
    }
    for (let i = 0; i < n; i++) {
      const c = viewCandles[i];
      const x = xOf(i);
      const bull = c.close >= c.open;
      ctx.strokeStyle = bull ? up : down;
      ctx.fillStyle = bull ? up : down;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.high));
      ctx.lineTo(x, yOf(c.low));
      ctx.stroke();
      const top = Math.min(yOf(c.open), yOf(c.close));
      ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, Math.abs(yOf(c.close) - yOf(c.open))));
    }
    const strokeSeries = (series: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = series[i];
        if (v == null) continue;
        if (!started) { ctx.moveTo(xOf(i), yOf(v)); started = true; } else ctx.lineTo(xOf(i), yOf(v));
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    };
    if (showSma) strokeSeries(layout.sma20, accent);
    if (showEma) strokeSeries(layout.ema20, isLight ? "#6b5b8a" : "#a090c0");
    ctx.strokeStyle = accent;
    for (const d of drawings) {
      if (d.kind === "hline") {
        const y = yOf(d.price);
        if (y < padT || y > padT + chartH) continue;
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = muted;
        ctx.fillText(formatPrice(d.price, precision), w - padR + 8, y - 4);
      } else if (d.kind === "trend") {
        const a = d.i1 - viewOffset;
        const b = d.i2 - viewOffset;
        ctx.beginPath();
        ctx.moveTo(xOf(Math.max(0, Math.min(n - 1, a))), yOf(d.p1));
        ctx.lineTo(xOf(Math.max(0, Math.min(n - 1, b))), yOf(d.p2));
        ctx.stroke();
      } else if (d.kind === "fib") {
        const hi = Math.max(d.p1, d.p2);
        const lo = Math.min(d.p1, d.p2);
        const range = hi - lo || 1;
        for (const lv of FIB_LEVELS) {
          const price = hi - range * lv;
          const y = yOf(price);
          if (y < padT - 4 || y > padT + chartH + 4) continue;
          ctx.beginPath();
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = lv === 0.5 || lv === 0.618 ? accent : muted;
          ctx.moveTo(padL, y);
          ctx.lineTo(w - padR, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = muted;
          ctx.fillText(`${(lv * 100).toFixed(1)}%  ${formatPrice(price, precision)}`, w - padR + 6, y - 3);
        }
        ctx.strokeStyle = accent;
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
    let subTop = h - 18 - subPanels * (subH + 6);
    if (showRsi && layout.rsi14.length) {
      const y0 = subTop;
      ctx.fillStyle = muted;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("RSI 14", padL + 2, y0 + 10);
      const yRsi = (v: number) => y0 + 14 + ((100 - v) / 100) * (subH - 18);
      ctx.strokeStyle = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(padL, yRsi(70));
      ctx.lineTo(w - padR, yRsi(70));
      ctx.moveTo(padL, yRsi(30));
      ctx.lineTo(w - padR, yRsi(30));
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = layout.rsi14[i];
        if (v == null) continue;
        if (!started) { ctx.moveTo(xOf(i), yRsi(v)); started = true; } else ctx.lineTo(xOf(i), yRsi(v));
      }
      ctx.stroke();
      subTop += subH + 6;
    }
    if (showMacd && layout.macd) {
      const y0 = subTop;
      ctx.fillStyle = muted;
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillText("MACD", padL + 2, y0 + 10);
      let mmin = 0;
      let mmax = 0;
      for (const v of layout.macd.hist) if (v != null) { mmin = Math.min(mmin, v); mmax = Math.max(mmax, v); }
      for (const v of layout.macd.line) if (v != null) { mmin = Math.min(mmin, v); mmax = Math.max(mmax, v); }
      if (mmin === mmax) { mmin -= 1; mmax += 1; }
      const yMacd = (v: number) => y0 + 14 + ((mmax - v) / (mmax - mmin)) * (subH - 18);
      for (let i = 0; i < n; i++) {
        const v = layout.macd.hist[i];
        if (v == null) continue;
        const yz = yMacd(0);
        const yv = yMacd(v);
        ctx.fillStyle = v >= 0 ? volUp : volDown;
        ctx.fillRect(xOf(i) - bodyW / 2, Math.min(yz, yv), bodyW, Math.max(1, Math.abs(yv - yz)));
      }
      const strokeM = (series: (number | null)[], color: string) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const v = series[i];
          if (v == null) continue;
          if (!started) { ctx.moveTo(xOf(i), yMacd(v)); started = true; } else ctx.lineTo(xOf(i), yMacd(v));
        }
        ctx.stroke();
      };
      strokeM(layout.macd.line, accent);
      strokeM(layout.macd.signal, isLight ? "#6b5b8a" : "#a090c0");
    }
    {
      const markY = h - 10;
      const img = logoImgRef.current;
      if (img && logoReady) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, padL + 2, markY - 12, 14, 14);
        ctx.globalAlpha = 1;
        ctx.fillStyle = muted;
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Veytrix", padL + 20, markY);
      } else {
        ctx.fillStyle = muted;
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("Veytrix", padL + 4, markY);
      }
    }
    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    ctx.font = "11px system-ui, sans-serif";
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const t = new Date(viewCandles[i].time);
      const label =
        timeframe === "D1" || timeframe === "W1"
          ? t.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      ctx.fillText(label, xOf(i), h - 4);
    }
  }, [viewCandles, layout, showSma, showEma, showVolume, showRsi, showMacd, drawings, hover, tool, precision, timeframe, compact, logoReady, viewOffset]);

  useEffect(() => {
    draw();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const geometry = () => {
    const wrap = wrapRef.current;
    if (!wrap || viewCandles.length === 0) return null;
    const h = Math.max(compact ? 280 : 460, wrap.clientHeight || 0);
    const w = wrap.clientWidth;
    const subPanels = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
    const subH = subPanels > 0 ? Math.min(72, h * 0.14) : 0;
    const volH = showVolume ? Math.min(52, h * 0.12) : 0;
    const padL = 8;
    const padT = 12;
    const chartW = w - padL - 64;
    const chartH = h - padT - (26 + volH + subPanels * (subH + 6));
    let min = Infinity;
    let max = -Infinity;
    for (const c of viewCandles) {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    }
    const rangePad = (max - min) * 0.05 || 1;
    min -= rangePad;
    max += rangePad;
    return { padL, padT, chartW, chartH, min, max, slot: chartW / Math.max(viewCandles.length, 1) };
  };

  const priceAtY = (y: number) => {
    const g = geometry();
    if (!g) return 0;
    return g.max - ((y - g.padT) / g.chartH) * (g.max - g.min);
  };

  const indexAtX = (x: number) => {
    const g = geometry();
    if (!g) return 0;
    return Math.max(0, Math.min(viewCandles.length - 1, Math.floor((x - g.padL) / g.slot)));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (candles.length === 0) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    setViewCount((c) => {
      const next = Math.max(20, Math.min(candles.length, c + dir * 8));
      setViewStart((s) => Math.max(0, Math.min(candles.length - next, s)));
      return next;
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || viewCandles.length === 0) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setHover({ index: indexAtX(x), price: priceAtY(y), x, y });
    if (panRef.current && (tool === "pan" || tool === "none")) {
      const g = geometry();
      if (!g) return;
      const bars = Math.round(-(x - panRef.current.x) / g.slot);
      if (bars !== 0) {
        setViewStart(() =>
          Math.max(0, Math.min(candles.length - viewCount, panRef.current!.start + bars)),
        );
        panRef.current = { x, start: panRef.current.start };
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || viewCandles.length === 0) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const globalI = viewOffset + indexAtX(x);
    const price = priceAtY(y);
    if (tool === "pan" || tool === "none") {
      panRef.current = { x, start: viewStart };
      return;
    }
    if (tool === "hline") {
      setDrawings((d) => [...d, { id: `${Date.now()}`, kind: "hline", price }]);
      return;
    }
    if (tool === "trend" || tool === "fib") {
      if (!draftRef.current) draftRef.current = { i: globalI, p: price };
      else {
        const s = draftRef.current;
        setDrawings((d) => [
          ...d,
          { id: `${Date.now()}`, kind: tool, i1: s.i, p1: s.p, i2: globalI, p2: price },
        ]);
        draftRef.current = null;
      }
    }
  };

  const last = viewCandles[viewCandles.length - 1];
  const ohlc = hover && viewCandles[hover.index] ? viewCandles[hover.index] : last;

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
          <select value={activeInstrument} onChange={(e) => setSelectedInstrument(e.target.value)}>
            {favoriteInstruments.length === 0 && <option value="">No pairs</option>}
            {favoriteInstruments.map((item) => (
              <option key={item.symbol} value={item.symbol}>{item.symbol}</option>
            ))}
          </select>
        </label>
        <div className="terminal-periods" role="group" aria-label="Timeframe">
          {timeframes.map((item) => (
            <button key={item} type="button" className={`timeframe-button${timeframe === item ? " active" : ""}`} onClick={() => setTimeframe(item)}>{item}</button>
          ))}
        </div>
        <div className="chart-tools" role="group" aria-label="Tools">
          {([["crosshair", "＋"], ["pan", "✋"], ["hline", "―"], ["trend", "／"], ["fib", "ƒ"], ["none", "○"]] as const).map(([id, label]) => (
            <button key={id} type="button" className={`timeframe-button${tool === id ? " active" : ""}`} onClick={() => { setTool(id); draftRef.current = null; }} title={id}>{label}</button>
          ))}
          <button type="button" className="timeframe-button" onClick={() => { setDrawings([]); draftRef.current = null; }} title="Clear drawings">⌫</button>
        </div>
        <div className="chart-indicator-toggles">
          <label><input type="checkbox" checked={showSma} onChange={(e) => updatePreferences({ showSma: e.target.checked })} /> MA</label>
          <label><input type="checkbox" checked={showEma} onChange={(e) => updatePreferences({ showEma: e.target.checked })} /> EMA</label>
          <label><input type="checkbox" checked={showBb} onChange={(e) => setShowBb(e.target.checked)} /> BB</label>
          <label><input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} /> RSI</label>
          <label><input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} /> MACD</label>
          <label><input type="checkbox" checked={showVolume} onChange={(e) => updatePreferences({ showVolume: e.target.checked })} /> Vol</label>
        </div>
        <div className="chart-toolbar-actions">
          <button type="button" className="secondary-button" onClick={() => setReloadToken((t) => t + 1)}>Reload</button>
          <button type="button" className="secondary-button" onClick={toggleFullScreen} aria-pressed={fullScreen}>{fullScreen ? "Exit" : "Full"}</button>
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
          onPointerLeave={() => { setHover(null); panRef.current = null; }}
          onPointerDown={onPointerDown}
          onPointerUp={() => { panRef.current = null; }}
          onWheel={onWheel}
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
