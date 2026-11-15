import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API = (process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000/api").replace(/\/$/, "");
const DARK_C = {
  bg: "#080B09", panel: "#101612", panel2: "#0C110E", line: "#202B23",
  lime: "#B5FF55", text: "#F2F5F1", muted: "#829087", faint: "#59665D",
  red: "#F07880", amber: "#E5B15D", blue: "#82B9E8",
};
const LIGHT_C = { bg: "#F4F7F3", panel: "#FFFFFF", panel2: "#EDF2EC", line: "#DCE5DC", lime: "#4E861C", text: "#172018", muted: "#667366", faint: "#8A968A", red: "#C84952", amber: "#A66B16", blue: "#3B75A5" };
let C = DARK_C;
const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];
type Tab = "Terminal" | "Markets" | "Analysis" | "Fundamentals" | "Signals" | "Settings";
type Quote = { instrument: string; asOf: string; bid?: number; ask?: number; last?: number; change?: number; changePercent?: number; delayed?: boolean };
type Candle = { time: string; open: number; high: number; low: number; close: number; volume?: number };
type Instrument = { symbol: string; displayName: string; category: string; pricePrecision?: number };
type Event = { id: string; time: string; country: string; currency: string; event: string; impact: "high" | "medium" | "low" | "unknown"; actual: number | null; estimate: number | null; previous: number | null; unit?: string; currencyBias: string; affectedPairs: { symbol: string; bias: string }[] };
type Signal = { id: string; instrument: string; type: "setup" | "bias"; direction: string; confidence: number; timeframe: string; title: string; summary: string; createdAt: string; entry?: number; stopLoss?: number; takeProfit?: number; riskReward?: number; tags?: string[] };
type ProviderStatus = { state: "connected" | "unconfigured" | "disconnected"; provider: string | null; message: string; updatedAt?: string; delayed?: boolean };

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}
function price(value?: number, precision?: number) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: precision ?? (value > 100 ? 2 : 5), maximumFractionDigits: precision ?? (value > 100 ? 2 : 5) });
}
function clock(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function dateLabel(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}
function directionColor(value?: string) {
  const v = (value ?? "").toLowerCase();
  return v === "bullish" ? C.lime : v === "bearish" ? C.red : v === "pending" ? C.amber : C.muted;
}
function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[s.panel, { backgroundColor: C.panel, borderColor: C.line }, style]}>{children}</View>;
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={s.eyebrow}>{children}</Text>;
}
function SectionTitle({ title, right }: { title: string; right?: string }) {
  return <View style={s.sectionHead}><Text style={s.sectionTitle}>{title}</Text>{right ? <Text style={s.sectionRight}>{right}</Text> : null}</View>;
}
function StatusPill({ status, label }: { status: string; label?: string }) {
  const good = status === "connected";
  return <View style={s.statusPill}><View style={[s.dot, { backgroundColor: good ? C.lime : status === "checking" ? C.amber : C.red }]} /><Text style={s.statusText}>{label ?? (good ? "LIVE" : status === "checking" ? "CONNECTING" : "OFFLINE")}</Text></View>;
}
function Empty({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <View style={s.empty}><View style={s.emptyMark}><Text style={s.emptyMarkText}>—</Text></View><Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyDetail}>{detail}</Text>{action && onAction ? <Pressable onPress={onAction} style={s.outlineButton}><Text style={s.outlineText}>{action}</Text></Pressable> : null}</View>;
}
function CandleStick({ candle, min, max }: { candle: Candle; min: number; max: number }) {
  const range = Math.max(max - min, 0.000001);
  const top = ((max - candle.high) / range) * 100;
  const bottom = ((max - candle.low) / range) * 100;
  const bodyTop = ((max - Math.max(candle.open, candle.close)) / range) * 100;
  const bodyBottom = ((max - Math.min(candle.open, candle.close)) / range) * 100;
  const color = candle.close >= candle.open ? C.lime : C.red;
  return <View style={s.candleSlot}><View style={[s.wick, { top: `${top}%`, height: `${Math.max(bottom - top, 1)}%`, backgroundColor: color }]} /><View style={[s.candleBody, { top: `${bodyTop}%`, height: `${Math.max(bodyBottom - bodyTop, 1.2)}%`, backgroundColor: color }]} /></View>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("Terminal");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const changeTheme = (value: "dark" | "light") => { C = value === "dark" ? DARK_C : LIGHT_C; s = createStyles(); setTheme(value); };
  const [symbol, setSymbol] = useState("XAUUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [marketStatus, setMarketStatus] = useState<ProviderStatus | null>(null);
  const [fundStatus, setFundStatus] = useState<ProviderStatus | null>(null);
  const [signalStatus, setSignalStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const quote = quotes.find((item) => item.instrument === symbol) ?? null;
  const instrument = instruments.find((item) => item.symbol === symbol);
  const chart = useMemo(() => candles.slice(-48), [candles]);
  const bounds = useMemo(() => chart.length ? {
    min: Math.min(...chart.map((item) => item.low)),
    max: Math.max(...chart.map((item) => item.high)),
  } : { min: 0, max: 1 }, [chart]);
  const selectedSignals = signals.filter((item) => item.instrument === symbol);

  const loadBase = useCallback(async () => {
    const results = await Promise.allSettled([
      request<ProviderStatus>("/market-data/status"),
      request<Quote[]>("/market-data/quotes"),
      request<Instrument[]>("/market-data/instruments"),
      request<ProviderStatus>("/fundamentals/status"),
      request<Event[]>("/fundamentals/calendar"),
      request<ProviderStatus>("/signals/status"),
      request<Signal[]>("/signals"),
    ]);
    const nextErrors: Record<string, string> = {};
    const [ms, qs, ins, fs, es, ss, sigs] = results;
    if (ms.status === "fulfilled") setMarketStatus(ms.value); else nextErrors.market = "Market data service unavailable";
    if (qs.status === "fulfilled") setQuotes(qs.value); else { setQuotes([]); nextErrors.quotes = "Quotes unavailable"; }
    if (ins.status === "fulfilled") setInstruments(ins.value); else setInstruments([]);
    if (fs.status === "fulfilled") setFundStatus(fs.value); else nextErrors.fundamentals = "Economic calendar unavailable";
    if (es.status === "fulfilled") setEvents(es.value); else setEvents([]);
    if (ss.status === "fulfilled") setSignalStatus(ss.value); else nextErrors.signals = "Signal service unavailable";
    if (sigs.status === "fulfilled") setSignals(sigs.value); else setSignals([]);
    setErrors(nextErrors);
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await request<Candle[]>(`/market-data/history?instrument=${encodeURIComponent(symbol)}&timeframe=${timeframe}`);
      setCandles(data);
    } catch {
      setCandles([]);
    }
  }, [symbol, timeframe]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadBase(), loadHistory()]);
    setLoading(false);
  }, [loadBase, loadHistory]);

  useEffect(() => { void refresh(); }, [refresh]);

  const renderTerminal = () => (
    <>
      <View style={s.instrumentHeader}>
        <View style={{ flex: 1 }}>
          <Eyebrow>SPOT MARKET</Eyebrow>
          <Text style={s.instrumentName}>{symbol}</Text>
          <Text style={s.instrumentSub}>{instrument?.displayName ?? (symbol === "XAUUSD" ? "Gold / US Dollar" : "Selected instrument")}</Text>
        </View>
        <View style={s.priceBlock}>
          <Text style={s.lastPrice}>{price(quote?.last, instrument?.pricePrecision)}</Text>
          <Text style={[s.changeText, { color: (quote?.change ?? 0) >= 0 ? C.lime : C.red }]}>{quote?.changePercent === undefined ? "—" : `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`}</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.symbolRail} contentContainerStyle={s.symbolRailContent}>
        {(instruments.length ? instruments : [{ symbol: "XAUUSD", displayName: "Gold / US Dollar", category: "metals" }]).map((item) =>
          <Pressable key={item.symbol} onPress={() => setSymbol(item.symbol)} style={[s.symbolChip, symbol === item.symbol && s.symbolChipActive]}><Text style={[s.symbolChipText, symbol === item.symbol && s.symbolChipTextActive]}>{item.symbol}</Text></Pressable>
        )}
      </ScrollView>
      <Panel style={{ padding: 12 }}>
        <View style={s.chartHeader}><View style={s.rowCenter}><Text style={s.chartTitle}>CHART</Text><StatusPill status={marketStatus?.state ?? "checking"} label={quote?.delayed ? "DELAYED" : marketStatus?.state === "connected" ? "LIVE FEED" : undefined} /></View><Text style={s.chartMeta}>{chart.length ? `${chart.length} bars` : "—"}</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.timeframeRail}>
          {TIMEFRAMES.map((item) => <Pressable key={item} onPress={() => setTimeframe(item)} style={[s.timeframe, timeframe === item && s.timeframeActive]}><Text style={[s.timeframeText, timeframe === item && s.timeframeTextActive]}>{item}</Text></Pressable>)}
        </ScrollView>
        <View style={s.chartArea}>
          <View style={[s.gridLine, { top: "25%" }]} /><View style={[s.gridLine, { top: "50%" }]} /><View style={[s.gridLine, { top: "75%" }]} />
          {chart.length ? <View style={s.candlesRow}>{chart.map((c, i) => <CandleStick key={`${c.time}-${i}`} candle={c} min={bounds.min} max={bounds.max} />)}</View> :
            <View style={s.chartEmpty}><Text style={s.chartEmptyTitle}>No chart data</Text><Text style={s.chartEmptyText}>Historical prices will appear when the market feed is available.</Text></View>}
        </View>
        <View style={s.chartFooter}><Text style={s.chartMeta}>{chart[0] ? dateLabel(chart[0].time) : "—"}</Text><Text style={s.chartMeta}>{chart[chart.length - 1] ? clock(chart[chart.length - 1].time) : "—"}</Text></View>
      </Panel>
      <View style={s.quoteGrid}>
        <Panel style={s.quoteCard}><Eyebrow>BID</Eyebrow><Text style={[s.quoteValue, { color: C.red }]}>{price(quote?.bid, instrument?.pricePrecision)}</Text></Panel>
        <Panel style={s.quoteCard}><Eyebrow>ASK</Eyebrow><Text style={[s.quoteValue, { color: C.lime }]}>{price(quote?.ask, instrument?.pricePrecision)}</Text></Panel>
        <Panel style={s.quoteCard}><Eyebrow>SPREAD</Eyebrow><Text style={s.quoteValue}>{quote?.spread === undefined && (quote?.ask === undefined || quote?.bid === undefined) ? "—" : price(quote?.spread ?? (quote!.ask! - quote!.bid!), instrument?.pricePrecision)}</Text></Panel>
      </View>
      <SectionTitle title="LATEST SIGNALS" right={selectedSignals.length ? `${selectedSignals.length} results` : "—"} />
      {selectedSignals.length ? selectedSignals.slice(0, 2).map((item) => <SignalRow key={item.id} item={item} />) : <Panel><Text style={s.smallMuted}>No signal available for {symbol}.</Text></Panel>}
      <SectionTitle title="NEXT ECONOMIC EVENTS" right="CALENDAR" />
      {events.slice(0, 2).map((event) => <EventRow key={event.id} event={event} />)}
      {!events.length ? <Panel><Text style={s.smallMuted}>No calendar events returned.</Text></Panel> : null}
    </>
  );

  const renderMarkets = () => (
    <>
      <PageHeading title="Markets" subtitle="Live instruments" status={marketStatus} />
      {instruments.length ? instruments.map((item) => {
        const q = quotes.find((entry) => entry.instrument === item.symbol);
        return <Pressable key={item.symbol} onPress={() => { setSymbol(item.symbol); setTab("Terminal"); }}><Panel style={s.marketRow}><View style={{ flex: 1 }}><Text style={s.marketSymbol}>{item.symbol}</Text><Text style={s.marketName}>{item.displayName}</Text></View><View style={{ alignItems: "flex-end" }}><Text style={s.marketPrice}>{price(q?.last, item.pricePrecision)}</Text><Text style={[s.marketChange, { color: (q?.change ?? 0) >= 0 ? C.lime : C.red }]}>{q?.changePercent === undefined ? "—" : `${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}%`}</Text></View></Panel></Pressable>;
      }) : <Empty title="No instruments" detail={errors.market ?? "Connect a supported market-data provider to see available symbols."} action="REFRESH" onAction={() => void refresh()} />}
    </>
  );

  const renderAnalysis = () => (
    <>
      <PageHeading title="Analysis" subtitle={`Technical signals · ${symbol}`} status={signalStatus} />
      <View style={s.selectorRail}>{instruments.slice(0, 6).map((item) => <Pressable key={item.symbol} onPress={() => setSymbol(item.symbol)} style={[s.symbolChip, symbol === item.symbol && s.symbolChipActive]}><Text style={[s.symbolChipText, symbol === item.symbol && s.symbolChipTextActive]}>{item.symbol}</Text></Pressable>)}</View>
      {selectedSignals.length ? selectedSignals.map((item) => <SignalRow key={item.id} item={item} expanded />) : <Empty title="No analysis available" detail={errors.signals ?? "The signal engine has not returned a setup for this instrument."} action="REFRESH" onAction={() => void refresh()} />}
    </>
  );

  const renderFundamentals = () => {
    const sorted = [...events].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return <>
      <PageHeading title="Fundamentals" subtitle="Economic calendar" status={fundStatus} />
      <View style={s.fundSummary}>
        <Panel style={s.fundStat}><Text style={s.fundNumber}>{events.filter((e) => e.impact === "high").length}</Text><Eyebrow>HIGH IMPACT</Eyebrow></Panel>
        <Panel style={s.fundStat}><Text style={s.fundNumber}>{events.filter((e) => e.currency === "USD").length}</Text><Eyebrow>USD EVENTS</Eyebrow></Panel>
        <Panel style={s.fundStat}><Text style={s.fundNumber}>{events.length}</Text><Eyebrow>ALL EVENTS</Eyebrow></Panel>
      </View>
      {sorted.length ? sorted.map((event) => <EventRow key={event.id} event={event} expanded />) : <Empty title="Calendar unavailable" detail={errors.fundamentals ?? fundStatus?.message ?? "Economic events will appear when the calendar provider is connected."} action="REFRESH" onAction={() => void refresh()} />}
      <SectionTitle title="CURRENCY BIAS" />
      {sorted.filter((event) => event.currencyBias && event.currencyBias !== "pending").slice(0, 6).map((event) => <Panel key={`bias-${event.id}`} style={s.biasRow}><View style={{ flex: 1 }}><Text style={s.marketSymbol}>{event.currency}</Text><Text style={s.marketName} numberOfLines={1}>{event.event}</Text></View><Text style={[s.biasText, { color: directionColor(event.currencyBias) }]}>{event.currencyBias.toUpperCase()}</Text></Panel>)}
    </>;
  };

  const renderSettings = () => (
    <>
      <PageHeading title="Settings" subtitle="Personalise your Veytrix workspace" status={marketStatus} />
      <SectionTitle title="APPEARANCE" right="WORKSPACE" />
      <Panel>
        <Text style={s.marketSymbol}>Theme</Text>
        <Text style={s.marketName}>Choose how Veytrix looks on this device.</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          {(["dark", "light"] as const).map((value) => (
            <Pressable key={value} onPress={() => changeTheme(value)} style={{ flex: 1, padding: 13, borderRadius: 9, borderWidth: 1, borderColor: theme === value ? C.lime : C.line, backgroundColor: theme === value ? (theme === "dark" ? "#1A2918" : "#EDF6E5") : C.panel2 }}>
              <Text style={{ color: theme === value ? C.lime : C.text, fontWeight: "800", textTransform: "capitalize" }}>{value} mode</Text>
              <Text style={{ color: C.muted, fontSize: 9, marginTop: 4 }}>{value === "dark" ? "Low-light terminal" : "Bright workspace"}</Text>
            </Pressable>
          ))}
        </View>
      </Panel>
      <SectionTitle title="MARKET DATA" />
      <Panel>
        <View style={s.marketRow}><View style={{ flex: 1 }}><Text style={s.marketSymbol}>Market provider</Text><Text style={s.marketName}>{marketStatus?.provider ?? "Not connected"}</Text></View><StatusPill status={marketStatus?.state ?? "disconnected"} /></View>
        <Text style={s.smallMuted}>{marketStatus?.message ?? errors.market ?? "The app checks your Veytrix API for market data."}</Text>
        <Pressable onPress={() => void refresh()} style={[s.outlineButton, { alignSelf: "flex-start" }]}><Text style={s.outlineText}>REFRESH CONNECTION</Text></Pressable>
      </Panel>
      <SectionTitle title="WORKSPACE" />
      <Panel>
        <View style={s.marketRow}><View style={{ flex: 1 }}><Text style={s.marketSymbol}>Default instrument</Text><Text style={s.marketName}>The terminal opens with this selected market.</Text></View><Text style={{ color: C.lime, fontWeight: "900" }}>XAUUSD</Text></View>
        <View style={s.marketRow}><View style={{ flex: 1 }}><Text style={s.marketSymbol}>Default timeframe</Text><Text style={s.marketName}>Current chart interval</Text></View><Text style={{ color: C.lime, fontWeight: "900" }}>{timeframe}</Text></View>
      </Panel>
      <SectionTitle title="ABOUT VEYTRIX" />
      <Panel><Text style={s.marketSymbol}>VEYTRIX MARKET TERMINAL</Text><Text style={s.marketName}>Market analysis, technical tools and fundamental research in one workspace.</Text><Text style={[s.smallMuted, { marginTop: 10 }]}>Version 0.1.0 · Mobile workspace</Text></Panel>
    </>
  );

  const renderSignals = () => <>
    <PageHeading title="Signal Room" subtitle="Setups and directional bias" status={signalStatus} />
    {signals.length ? signals.map((item) => <SignalRow key={item.id} item={item} expanded />) : <Empty title="No active signals" detail={errors.signals ?? signalStatus?.message ?? "Signals will appear when the analysis engine returns results."} action="REFRESH" onAction={() => void refresh()} />}
  </>;

  return (
    <View style={[s.screen, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      <View style={[s.topBar, { backgroundColor: C.bg, borderBottomColor: C.line }]}>
        <View style={s.brandRow}><View style={s.brandMark}><Text style={s.brandMarkText}>V</Text></View><View><Text style={s.brandName}>VEYTRIX</Text><Text style={s.brandSub}>MARKET TERMINAL</Text></View></View>
        <View style={s.topRight}><StatusPill status={marketStatus?.state ?? "disconnected"} /><Pressable accessibilityRole="button" accessibilityLabel="Toggle theme" onPress={() => changeTheme(theme === "dark" ? "light" : "dark")} style={s.refreshButton}><Text style={s.refreshText}>◐</Text></Pressable><Pressable onPress={() => void refresh()} style={s.refreshButton}><Text style={s.refreshText}>↻</Text></Pressable></View>
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={C.lime} />}>
        {tab === "Terminal" ? renderTerminal() : tab === "Markets" ? renderMarkets() : tab === "Analysis" ? renderAnalysis() : tab === "Fundamentals" ? renderFundamentals() : tab === "Signals" ? renderSignals() : renderSettings()}
        <Text style={s.footer}>Prices and events are supplied by connected providers.</Text>
      </ScrollView>
      <View style={[s.bottomNav, { backgroundColor: C.bg, borderTopColor: C.line }]}>
        {(["Terminal", "Markets", "Analysis", "Fundamentals", "Signals", "Settings"] as Tab[]).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={s.navItem}><Text style={[s.navLabel, tab === item && s.navLabelActive]}>{item}</Text>{tab === item ? <View style={s.navIndicator} /> : null}</Pressable>)}
      </View>
    </View>
  );
}

function PageHeading({ title, subtitle, status }: { title: string; subtitle: string; status: ProviderStatus | null }) {
  return <View style={s.pageHeading}><View style={{ flex: 1 }}><Text style={s.pageTitle}>{title}</Text><Text style={s.pageSubtitle}>{subtitle}</Text></View>{status ? <StatusPill status={status.state} /> : null}</View>;
}
function SignalRow({ item, expanded }: { item: Signal; expanded?: boolean }) {
  const color = directionColor(item.direction);
  return <Panel style={s.signalCard}><View style={s.signalTop}><View style={{ flex: 1 }}><Text style={s.signalSymbol}>{item.instrument} <Text style={s.signalTimeframe}>{item.timeframe}</Text></Text><Text style={s.signalTitle}>{item.title}</Text></View><View style={[s.directionPill, { borderColor: color + "66" }]}><Text style={[s.directionText, { color }]}>{item.direction.toUpperCase()}</Text></View></View><View style={s.signalMeta}><Text style={s.signalMetaText}>{item.type.toUpperCase()}</Text><Text style={s.signalMetaText}>{Math.round(item.confidence)}% confidence</Text><Text style={s.signalMetaText}>{clock(item.createdAt)}</Text></View>{expanded ? <><Text style={s.signalSummary}>{item.summary}</Text>{item.entry !== undefined || item.stopLoss !== undefined || item.takeProfit !== undefined ? <View style={s.levels}><Level label="ENTRY" value={item.entry} /><Level label="STOP" value={item.stopLoss} /><Level label="TARGET" value={item.takeProfit} /></View> : null}</> : null}</Panel>;
}
function Level({ label, value }: { label: string; value?: number }) {
  return <View style={s.level}><Eyebrow>{label}</Eyebrow><Text style={s.levelValue}>{price(value)}</Text></View>;
}
function EventRow({ event, expanded }: { event: Event; expanded?: boolean }) {
  const impactColor = event.impact === "high" ? C.red : event.impact === "medium" ? C.amber : C.muted;
  return <Panel style={s.eventCard}><View style={s.eventTop}><View style={{ flex: 1 }}><View style={s.eventMeta}><Text style={s.eventCurrency}>{event.currency}</Text><Text style={[s.impact, { color: impactColor }]}>{event.impact.toUpperCase()}</Text><Text style={s.eventTime}>{dateLabel(event.time)} · {clock(event.time)}</Text></View><Text style={s.eventName}>{event.event}</Text></View><Text style={[s.eventBias, { color: directionColor(event.currencyBias) }]}>{event.currencyBias === "pending" ? "—" : event.currencyBias.toUpperCase()}</Text></View><View style={s.eventNumbers}><EventNumber label="ACTUAL" value={event.actual} unit={event.unit} /><EventNumber label="FORECAST" value={event.estimate} unit={event.unit} /><EventNumber label="PREVIOUS" value={event.previous} unit={event.unit} /></View>{expanded && event.affectedPairs?.length ? <Text style={s.affectedPairs}>AFFECTED  {event.affectedPairs.slice(0, 5).map((pair) => `${pair.symbol} ${pair.bias}`).join("   ·   ")}</Text> : null}</Panel>;
}
function EventNumber({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return <View style={s.eventNumber}><Eyebrow>{label}</Eyebrow><Text style={s.eventNumberValue}>{value === null ? "—" : `${value}${unit ? ` ${unit}` : ""}`}</Text></View>;
}

const createStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  topBar: { paddingTop: 48, paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.line },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#10160E", fontSize: 22, fontWeight: "900" },
  brandName: { color: C.text, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  brandSub: { color: C.muted, fontSize: 8, letterSpacing: 1.4, marginTop: 2 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 9 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: "#B7C1B9", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  refreshButton: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
  refreshText: { color: C.lime, fontSize: 21 },
  content: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 26 },
  panel: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 13, padding: 13, marginBottom: 10 },
  eyebrow: { color: C.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1, marginBottom: 5 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, marginBottom: 9 },
  sectionTitle: { color: C.text, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  sectionRight: { color: C.muted, fontSize: 8, letterSpacing: 0.7 },
  instrumentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  instrumentName: { color: C.text, fontSize: 27, fontWeight: "800", letterSpacing: 0.3 },
  instrumentSub: { color: C.muted, fontSize: 10, marginTop: 3 },
  priceBlock: { alignItems: "flex-end" },
  lastPrice: { color: C.text, fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  changeText: { fontSize: 10, fontWeight: "800", marginTop: 4 },
  symbolRail: { marginBottom: 12, flexGrow: 0 },
  symbolRailContent: { gap: 7, paddingRight: 6 },
  selectorRail: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  symbolChip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 7, paddingHorizontal: 11, paddingVertical: 8 },
  symbolChipActive: { borderColor: "#719A49", backgroundColor: "#1A2918" },
  symbolChipText: { color: C.muted, fontSize: 9, fontWeight: "800" },
  symbolChipTextActive: { color: C.lime },
  chartHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 9 },
  chartTitle: { color: C.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  chartMeta: { color: C.muted, fontSize: 8 },
  timeframeRail: { flexDirection: "row", justifyContent: "space-between", gap: 7, paddingVertical: 13 },
  timeframe: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 5 },
  timeframeActive: { backgroundColor: "#24351D" },
  timeframeText: { color: C.muted, fontSize: 9, fontWeight: "800" },
  timeframeTextActive: { color: C.lime },
  chartArea: { height: 218, backgroundColor: C.panel2, borderRadius: 8, overflow: "hidden", position: "relative" },
  gridLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#1B2720" },
  candlesRow: { position: "absolute", left: 5, right: 5, top: 8, bottom: 8, flexDirection: "row", alignItems: "stretch", justifyContent: "space-around" },
  candleSlot: { flex: 1, maxWidth: 8, position: "relative", height: "100%" },
  wick: { position: "absolute", width: 1, left: "50%" },
  candleBody: { position: "absolute", width: 5, left: "50%", marginLeft: -2 },
  chartEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  chartEmptyTitle: { color: C.text, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  chartEmptyText: { color: C.muted, fontSize: 9, textAlign: "center", lineHeight: 15 },
  chartFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 9 },
  quoteGrid: { flexDirection: "row", gap: 8, marginTop: 10 },
  quoteCard: { flex: 1, padding: 10, marginBottom: 0 },
  quoteValue: { color: C.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  smallMuted: { color: C.muted, fontSize: 10 },
  pageHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { color: C.text, fontSize: 25, fontWeight: "800" },
  pageSubtitle: { color: C.muted, fontSize: 10, marginTop: 4 },
  marketRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  marketSymbol: { color: C.text, fontSize: 13, fontWeight: "800" },
  marketName: { color: C.muted, fontSize: 9, marginTop: 3 },
  marketPrice: { color: C.text, fontSize: 12, fontWeight: "700" },
  marketChange: { fontSize: 9, fontWeight: "800", marginTop: 3 },
  signalCard: { padding: 13 },
  signalTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  signalSymbol: { color: C.text, fontSize: 13, fontWeight: "900" },
  signalTimeframe: { color: C.muted, fontSize: 9, fontWeight: "600" },
  signalTitle: { color: "#D5DED6", fontSize: 10, marginTop: 5 },
  directionPill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  directionText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  signalMeta: { flexDirection: "row", gap: 12, marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.line },
  signalMetaText: { color: C.muted, fontSize: 8 },
  signalSummary: { color: "#AEB9B0", fontSize: 10, lineHeight: 15, marginTop: 10 },
  levels: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  level: { flex: 1 },
  levelValue: { color: C.text, fontSize: 10, fontWeight: "700" },
  fundSummary: { flexDirection: "row", gap: 8, marginBottom: 8 },
  fundStat: { flex: 1, alignItems: "center", paddingVertical: 12, marginBottom: 0 },
  fundNumber: { color: C.lime, fontSize: 20, fontWeight: "800", marginBottom: 4 },
  eventCard: { padding: 12 },
  eventTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 },
  eventCurrency: { color: C.lime, fontSize: 9, fontWeight: "900" },
  impact: { fontSize: 8, fontWeight: "900" },
  eventTime: { color: C.muted, fontSize: 8 },
  eventName: { color: C.text, fontSize: 11, fontWeight: "700" },
  eventBias: { fontSize: 8, fontWeight: "900" },
  eventNumbers: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  eventNumber: { flex: 1 },
  eventNumberValue: { color: "#DCE4DC", fontSize: 10, fontWeight: "700" },
  affectedPairs: { color: C.muted, fontSize: 8, marginTop: 10, lineHeight: 14 },
  biasRow: { flexDirection: "row", alignItems: "center" },
  biasText: { fontSize: 9, fontWeight: "900" },
  empty: { minHeight: 235, alignItems: "center", justifyContent: "center", paddingHorizontal: 25, backgroundColor: C.panel, borderRadius: 13, borderWidth: 1, borderColor: C.line },
  emptyMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1B2918", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  emptyMarkText: { color: C.lime, fontSize: 20, fontWeight: "700" },
  emptyTitle: { color: C.text, fontSize: 12, fontWeight: "800" },
  emptyDetail: { color: C.muted, fontSize: 9, lineHeight: 15, textAlign: "center", marginTop: 6 },
  outlineButton: { borderWidth: 1, borderColor: "#526E3C", borderRadius: 6, paddingHorizontal: 13, paddingVertical: 8, marginTop: 13 },
  outlineText: { color: C.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  footer: { color: C.faint, fontSize: 8, textAlign: "center", marginTop: 14, marginBottom: 3 },
  bottomNav: { height: 65, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: "#0A0F0C", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 4 },
  navItem: { flex: 1, height: 54, alignItems: "center", justifyContent: "center", gap: 6 },
  navLabel: { color: "#77847A", fontSize: 8, fontWeight: "700" },
  navLabelActive: { color: C.lime, fontWeight: "900" },
  navIndicator: { width: 15, height: 2, borderRadius: 2, backgroundColor: C.lime },
});

let s = createStyles();
