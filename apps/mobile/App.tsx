import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000/api";
const LIME = "#B5FF55";
const MUTED = "#849087";
const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"] as const;
const SYMBOLS = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "XAGUSD"] as const;

type Timeframe = (typeof TIMEFRAMES)[number];
type Candle = { time: string; open: number; high: number; low: number; close: number };
type Quote = { instrument: string; last?: number; bid?: number; ask?: number; asOf: string; delayed?: boolean };
type Tab = "Terminal" | "Markets" | "AI Lab" | "Signals" | "Portfolio";

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(value > 100 ? 2 : 5);
}

function CandleStick({ candle, min, max }: { candle: Candle; min: number; max: number }) {
  const range = Math.max(max - min, 0.00001);
  const top = ((max - candle.high) / range) * 100;
  const bottom = ((max - candle.low) / range) * 100;
  const bodyTop = ((max - Math.max(candle.open, candle.close)) / range) * 100;
  const bodyBottom = ((max - Math.min(candle.open, candle.close)) / range) * 100;
  const bullish = candle.close >= candle.open;
  const color = bullish ? LIME : "#F06F78";
  return (
    <View style={styles.candleSlot}>
      <View style={[styles.wick, { top: `${top}%`, height: `${Math.max(bottom - top, 1)}%`, backgroundColor: color }]} />
      <View style={[styles.candleBody, { top: `${bodyTop}%`, height: `${Math.max(bodyBottom - bodyTop, 1.2)}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Terminal");
  const [symbol, setSymbol] = useState<string>("XAUUSD");
  const [timeframe, setTimeframe] = useState<Timeframe>("H1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [loadingChart, setLoadingChart] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const loadMarket = useCallback(async () => {
    try {
      const [statusResponse, quotesResponse] = await Promise.all([
        fetch(`${API_URL}/market-data/status`),
        fetch(`${API_URL}/market-data/quotes`),
      ]);
      if (!statusResponse.ok) throw new Error("Market service unavailable");
      const status = await statusResponse.json();
      if (status.state !== "connected") {
        setConnection("offline");
        setQuote(null);
        return;
      }
      setConnection("connected");
      if (quotesResponse.ok) {
        const quotes: Quote[] = await quotesResponse.json();
        setQuote(quotes.find((item) => item.instrument === symbol) ?? null);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      }
    } catch {
      setConnection("offline");
      setQuote(null);
    }
  }, [symbol]);

  const loadHistory = useCallback(async () => {
    setLoadingChart(true);
    try {
      const response = await fetch(
        `${API_URL}/market-data/history?instrument=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
      );
      if (!response.ok) throw new Error("History unavailable");
      const data: Candle[] = await response.json();
      setCandles(data);
    } catch {
      setCandles([]);
    } finally {
      setLoadingChart(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void loadMarket();
    void loadHistory();
  }, [loadMarket, loadHistory]);

  const chartCandles = useMemo(() => candles.slice(-36), [candles]);
  const chartRange = useMemo(() => {
    if (!chartCandles.length) return { min: 0, max: 1 };
    return {
      min: Math.min(...chartCandles.map((item) => item.low)),
      max: Math.max(...chartCandles.map((item) => item.high)),
    };
  }, [chartCandles]);

  const renderTerminal = () => (
    <>
      <View style={styles.instrumentHeader}>
        <View>
          <Text style={styles.eyebrow}>MARKET / SPOT</Text>
          <View style={styles.instrumentNameRow}>
            <Text style={styles.instrumentName}>{symbol}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </View>
          <Text style={styles.instrumentSub}>{symbol === "XAUUSD" ? "Gold / US Dollar" : "Market instrument"}</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.lastPrice}>{formatPrice(quote?.last)}</Text>
          <Text style={styles.priceCaption}>{quote?.delayed ? "DELAYED DATA" : quote ? "LATEST QUOTE" : "WAITING FOR FEED"}</Text>
        </View>
      </View>

      <View style={styles.symbolPicker}>
        {SYMBOLS.map((item) => (
          <Pressable key={item} onPress={() => setSymbol(item)} style={[styles.symbolChip, symbol === item && styles.symbolChipActive]}>
            <Text style={[styles.symbolChipText, symbol === item && styles.symbolChipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartTopRow}>
          <View style={styles.chartTitleGroup}>
            <Text style={styles.chartTitle}>PRICE ACTION</Text>
            <View style={styles.liveDot} />
            <Text style={styles.chartLiveText}>{connection === "connected" ? "FEED CONNECTED" : "FEED OFFLINE"}</Text>
          </View>
          <Text style={styles.chartMenu}>•••</Text>
        </View>
        <View style={styles.timeframeRow}>
          {TIMEFRAMES.map((item) => (
            <Pressable key={item} onPress={() => setTimeframe(item)} style={[styles.timeframe, timeframe === item && styles.timeframeActive]}>
              <Text style={[styles.timeframeText, timeframe === item && styles.timeframeTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chartArea}>
          <View style={styles.gridLineOne} />
          <View style={styles.gridLineTwo} />
          <View style={styles.gridLineThree} />
          {loadingChart ? (
            <View style={styles.chartMessage}>
              <ActivityIndicator color={LIME} />
              <Text style={styles.chartMessageText}>Loading market history…</Text>
            </View>
          ) : chartCandles.length ? (
            <View style={styles.candlesRow}>
              {chartCandles.map((candle, index) => (
                <CandleStick key={`${candle.time}-${index}`} candle={candle} min={chartRange.min} max={chartRange.max} />
              ))}
            </View>
          ) : (
            <View style={styles.chartMessage}>
              <View style={styles.chartIcon}><Text style={styles.chartIconText}>⌁</Text></View>
              <Text style={styles.chartMessageTitle}>Chart data unavailable</Text>
              <Text style={styles.chartMessageText}>Connect a configured market-data provider to load real candles.</Text>
              <Pressable onPress={() => { void loadHistory(); void loadMarket(); }} style={styles.retryButton}>
                <Text style={styles.retryText}>RETRY CONNECTION</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.axisLabels}>
            <Text style={styles.axisText}>HIGH</Text>
            <Text style={styles.axisText}>MID</Text>
            <Text style={styles.axisText}>LOW</Text>
          </View>
        </View>
        <View style={styles.chartFooter}>
          <Text style={styles.chartFooterText}>{chartCandles.length ? `${chartCandles.length} candles loaded` : "No historical candles"}</Text>
          <Text style={styles.chartFooterText}>{lastUpdated ? `Updated ${lastUpdated}` : "Awaiting provider"}</Text>
        </View>
      </View>

      <View style={styles.quoteStrip}>
        <View style={styles.quoteCell}>
          <Text style={styles.quoteLabel}>BID PRICE</Text>
          <Text style={styles.bidValue}>{formatPrice(quote?.bid)}</Text>
        </View>
        <View style={styles.quoteDivider} />
        <View style={styles.quoteCell}>
          <Text style={styles.quoteLabel}>ASK PRICE</Text>
          <Text style={styles.askValue}>{formatPrice(quote?.ask)}</Text>
        </View>
        <View style={styles.quoteDivider} />
        <View style={styles.quoteCell}>
          <Text style={styles.quoteLabel}>SPREAD</Text>
          <Text style={styles.quoteValue}>{quote?.bid !== undefined && quote?.ask !== undefined ? formatPrice(quote.ask - quote.bid) : "—"}</Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>EXECUTION PANEL</Text>
        <Text style={styles.sectionHint}>BROKER NOT CONNECTED</Text>
      </View>
      <View style={styles.executionCard}>
        <View style={styles.executionInfo}>
          <Text style={styles.executionLabel}>ORDER SIZE</Text>
          <Text style={styles.executionValue}>— lots</Text>
        </View>
        <View style={styles.executionInfo}>
          <Text style={styles.executionLabel}>RISK CONTROL</Text>
          <Text style={styles.executionValue}>Not configured</Text>
        </View>
        <View style={styles.executionButtons}>
          <View style={[styles.tradeButton, styles.tradeButtonDisabled]}>
            <Text style={styles.tradeButtonText}>SELL</Text>
          </View>
          <View style={[styles.tradeButton, styles.tradeButtonDisabled]}>
            <Text style={styles.tradeButtonText}>BUY</Text>
          </View>
        </View>
        <Text style={styles.executionNotice}>Order placement will be enabled after secure broker integration.</Text>
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#080B09" />
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>V</Text></View>
          <View>
            <Text style={styles.brandName}>VEYTRIX</Text>
            <Text style={styles.brandTagline}>INTELLIGENCE TERMINAL</Text>
          </View>
        </View>
        <View style={styles.topActions}>
          <View style={styles.connectionPill}>
            <View style={[styles.connectionDot, connection === "connected" && styles.connectionDotOn]} />
            <Text style={styles.connectionText}>{connection === "connected" ? "ONLINE" : connection === "checking" ? "CHECKING" : "OFFLINE"}</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>LT</Text></View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === "Terminal" ? renderTerminal() : (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonEyebrow}>VEYTRIX WORKSPACE</Text>
            <Text style={styles.comingSoonTitle}>{activeTab}</Text>
            <Text style={styles.comingSoonBody}>This workspace is part of the mobile build roadmap. The trading terminal is the first screen being brought online.</Text>
            <Pressable onPress={() => setActiveTab("Terminal")} style={styles.returnButton}>
              <Text style={styles.returnButtonText}>RETURN TO TERMINAL</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.disclaimer}>Market data availability depends on your configured provider. Nothing here places a live trade.</Text>
      </ScrollView>

      <View style={styles.bottomNav}>
        {([
          ["Terminal", "⌁"],
          ["Markets", "◫"],
          ["AI Lab", "✳"],
          ["Signals", "⌁"],
          ["Portfolio", "▤"],
        ] as [Tab, string][]).map(([tab, glyph]) => (
          <Pressable key={tab} onPress={() => setActiveTab(tab)} style={styles.navItem}>
            <Text style={[styles.navGlyph, activeTab === tab && styles.navGlyphActive]}>{glyph}</Text>
            <Text style={[styles.navLabel, activeTab === tab && styles.navLabelActive]}>{tab}</Text>
            {activeTab === tab && <View style={styles.navIndicator} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080B09" },
  topBar: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 17, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1B241E" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, backgroundColor: LIME, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#10160E", fontSize: 21, fontWeight: "900" },
  brandName: { color: "#F4F7F3", fontSize: 15, fontWeight: "900", letterSpacing: 2.2 },
  brandTagline: { color: "#77847A", fontSize: 8, letterSpacing: 1.25, marginTop: 2 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectionPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#26342A", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  connectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E3A64C" },
  connectionDotOn: { backgroundColor: LIME },
  connectionText: { color: "#AAB5AC", fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  avatar: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, borderColor: "#354238", alignItems: "center", justifyContent: "center" },
  avatarText: { color: LIME, fontSize: 10, fontWeight: "800" },
  scrollContent: { paddingHorizontal: 17, paddingTop: 20, paddingBottom: 25 },
  instrumentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  eyebrow: { color: MUTED, fontSize: 9, fontWeight: "700", letterSpacing: 1.4, marginBottom: 5 },
  instrumentNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  instrumentName: { color: "#F2F5F1", fontSize: 25, fontWeight: "800", letterSpacing: 0.5 },
  chevron: { color: LIME, fontSize: 20, marginTop: -5 },
  instrumentSub: { color: "#829087", fontSize: 10, marginTop: 3 },
  priceBlock: { alignItems: "flex-end" },
  lastPrice: { color: "#F3F6F2", fontSize: 22, fontWeight: "700", fontVariant: ["tabular-nums"] },
  priceCaption: { color: MUTED, fontSize: 8, letterSpacing: 1, marginTop: 4 },
  symbolPicker: { flexDirection: "row", gap: 7, marginBottom: 16 },
  symbolChip: { borderRadius: 7, borderWidth: 1, borderColor: "#202A23", paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#0D120F" },
  symbolChipActive: { borderColor: "#789C4C", backgroundColor: "#172316" },
  symbolChipText: { color: "#87938A", fontSize: 9, fontWeight: "700" },
  symbolChipTextActive: { color: LIME },
  chartCard: { borderWidth: 1, borderColor: "#202A23", borderRadius: 14, backgroundColor: "#0D120F", padding: 13 },
  chartTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chartTitleGroup: { flexDirection: "row", alignItems: "center", gap: 7 },
  chartTitle: { color: "#DCE3DC", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: LIME },
  chartLiveText: { color: MUTED, fontSize: 7, letterSpacing: 0.8 },
  chartMenu: { color: "#849087", fontSize: 16, letterSpacing: 2 },
  timeframeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, marginBottom: 10 },
  timeframe: { paddingVertical: 6, paddingHorizontal: 7, borderRadius: 5 },
  timeframeActive: { backgroundColor: "#24351D" },
  timeframeText: { color: "#77847A", fontSize: 9, fontWeight: "700" },
  timeframeTextActive: { color: LIME },
  chartArea: { height: 220, overflow: "hidden", backgroundColor: "#0A0F0C", borderRadius: 7, position: "relative" },
  gridLineOne: { position: "absolute", left: 0, right: 0, top: "25%", height: 1, backgroundColor: "#1C2820" },
  gridLineTwo: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: "#1C2820" },
  gridLineThree: { position: "absolute", left: 0, right: 0, top: "75%", height: 1, backgroundColor: "#1C2820" },
  candlesRow: { position: "absolute", left: 5, right: 32, top: 8, bottom: 8, flexDirection: "row", alignItems: "stretch", justifyContent: "space-around" },
  candleSlot: { flex: 1, maxWidth: 9, position: "relative", height: "100%" },
  wick: { position: "absolute", width: 1, left: "50%" },
  candleBody: { position: "absolute", width: 5, left: "50%", marginLeft: -2 },
  chartMessage: { position: "absolute", left: 30, right: 48, top: 35, bottom: 25, alignItems: "center", justifyContent: "center" },
  chartIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#17231A", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  chartIconText: { color: LIME, fontSize: 24 },
  chartMessageTitle: { color: "#E1E8E1", fontSize: 12, fontWeight: "700", marginBottom: 5 },
  chartMessageText: { color: "#839087", fontSize: 9, textAlign: "center", lineHeight: 15 },
  retryButton: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#526E3C", borderRadius: 6 },
  retryText: { color: LIME, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  axisLabels: { position: "absolute", right: 5, top: 9, bottom: 9, justifyContent: "space-between" },
  axisText: { color: "#66736A", fontSize: 7 },
  chartFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  chartFooterText: { color: "#758178", fontSize: 8 },
  quoteStrip: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#202A23", borderRadius: 11, backgroundColor: "#0D120F", marginTop: 13, paddingVertical: 13 },
  quoteCell: { flex: 1, alignItems: "center" },
  quoteDivider: { width: 1, height: 27, backgroundColor: "#273129" },
  quoteLabel: { color: "#79867D", fontSize: 8, letterSpacing: 0.8, marginBottom: 6 },
  bidValue: { color: "#F07880", fontSize: 12, fontWeight: "700" },
  askValue: { color: LIME, fontSize: 12, fontWeight: "700" },
  quoteValue: { color: "#DDE4DD", fontSize: 12, fontWeight: "700" },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 21, marginBottom: 10 },
  sectionTitle: { color: "#E3E9E3", fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  sectionHint: { color: "#B58B4E", fontSize: 7, fontWeight: "800", letterSpacing: 0.8 },
  executionCard: { borderWidth: 1, borderColor: "#202A23", borderRadius: 12, backgroundColor: "#0D120F", padding: 13 },
  executionInfo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  executionLabel: { color: "#829087", fontSize: 9 },
  executionValue: { color: "#C7D0C8", fontSize: 9, fontWeight: "700" },
  executionButtons: { flexDirection: "row", gap: 9, marginTop: 3 },
  tradeButton: { flex: 1, borderRadius: 7, alignItems: "center", paddingVertical: 12 },
  tradeButtonDisabled: { backgroundColor: "#202820", borderWidth: 1, borderColor: "#303B32" },
  tradeButtonText: { color: "#7D897F", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  executionNotice: { color: "#78847B", fontSize: 8, textAlign: "center", marginTop: 10 },
  bottomNav: { height: 67, borderTopWidth: 1, borderTopColor: "#202A23", backgroundColor: "#0A0F0C", flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingBottom: 5 },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", height: 58, gap: 3 },
  navGlyph: { color: "#6F7B72", fontSize: 17 },
  navGlyphActive: { color: LIME },
  navLabel: { color: "#77847A", fontSize: 8, fontWeight: "600" },
  navLabelActive: { color: LIME, fontWeight: "800" },
  navIndicator: { width: 13, height: 2, borderRadius: 2, backgroundColor: LIME, marginTop: 1 },
  comingSoon: { minHeight: 390, justifyContent: "center", alignItems: "center", paddingHorizontal: 22 },
  comingSoonEyebrow: { color: LIME, fontSize: 9, letterSpacing: 1.5, fontWeight: "800" },
  comingSoonTitle: { color: "#F1F5F1", fontSize: 28, fontWeight: "800", marginTop: 10 },
  comingSoonBody: { color: "#8A968D", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 10 },
  returnButton: { backgroundColor: LIME, borderRadius: 7, paddingHorizontal: 16, paddingVertical: 11, marginTop: 22 },
  returnButtonText: { color: "#11170F", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  disclaimer: { color: "#59655D", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 17, marginBottom: 3 },
});
