/** Veytrix-owned indicator math — no third-party chart lib */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
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

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  if (closes.length === 0) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const ch = closes[i] - closes[i - 1];
    const gain = ch > 0 ? ch : 0;
    const loss = ch < 0 ? -ch : 0;
    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      out.push(null);
      continue;
    }
    if (i === period) {
      avgGain = (avgGain + gain) / period;
      avgLoss = (avgLoss + loss) / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0) out.push(100);
    else {
      const rs = avgGain / avgLoss;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): {
  line: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    ef[i] != null && es[i] != null
      ? (ef[i] as number) - (es[i] as number)
      : null,
  );
  const rawSignal = ema(
    line.map((v, i) => (v == null ? closes[i] : v)),
    signalPeriod,
  );
  const signal: (number | null)[] = line.map((v, i) =>
    v == null || i < slow + signalPeriod - 2 ? null : rawSignal[i],
  );
  const hist: (number | null)[] = line.map((v, i) =>
    v != null && signal[i] != null ? v - (signal[i] as number) : null,
  );
  return { line, signal, hist };
}

export function bollinger(
  closes: number[],
  period = 20,
  mult = 2,
): {
  mid: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
} {
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - (mid[i] as number);
      sum += d * d;
    }
    const sd = Math.sqrt(sum / period);
    upper.push((mid[i] as number) + mult * sd);
    lower.push((mid[i] as number) - mult * sd);
  }
  return { mid, upper, lower };
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function formatPrice(n: number, precision = 5): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(precision, 5),
    maximumFractionDigits: Math.min(precision, 5),
  });
}
