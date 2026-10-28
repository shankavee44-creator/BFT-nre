import { Candle } from '../types';

export interface IndicatorSettings {
  showSma: boolean;
  smaPeriod: number;
  smaColor: string;
  smaWidth: number;

  showEma: boolean;
  emaPeriod: number;
  emaColor: string;
  emaWidth: number;

  showBollinger: boolean;
  bollingerPeriod: number;
  bollingerStd: number;
  bollingerColor: string;

  showRsi: boolean;
  rsiPeriod: number;
  rsiColor: string;

  showMacd: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  macdColor: string;
  macdSignalColor: string;

  showVolume: boolean;
  showFib?: boolean;
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  showSma: true,
  smaPeriod: 14,
  smaColor: '#2962ff',
  smaWidth: 2,

  showEma: true,
  emaPeriod: 9,
  emaColor: '#ff9800',
  emaWidth: 2,

  showBollinger: false,
  bollingerPeriod: 20,
  bollingerStd: 2,
  bollingerColor: 'rgba(0, 229, 255, 0.5)',

  showRsi: true,
  rsiPeriod: 14,
  rsiColor: '#00e5ff',

  showMacd: false,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  macdColor: '#2962ff',
  macdSignalColor: '#ff334b',

  showVolume: true,
  showFib: false,
};

/**
 * Calculates Heikin-Ashi candlestick values from standard OHLC candles
 */
export function calculateHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const haCandles: Candle[] = [];

  for (let i = 0; i < candles.length; i++) {
    const current = candles[i];
    const haClose = (current.open + current.high + current.low + current.close) / 4;
    let haOpen = current.open;

    if (i > 0) {
      haOpen = (haCandles[i - 1].open + haCandles[i - 1].close) / 2;
    }

    const haHigh = Math.max(current.high, haOpen, haClose);
    const haLow = Math.min(current.low, haOpen, haClose);

    haCandles.push({
      time: current.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: current.volume,
    });
  }

  return haCandles;
}

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      result.push(Number((sum / period).toFixed(5)));
    }
  }
  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number = 9): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prevEma: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      prevEma = sum / period;
      result.push(Number(prevEma.toFixed(5)));
    } else {
      const currentClose: number = candles[i].close;
      const priorEma: number = prevEma !== null ? prevEma : currentClose;
      const calculatedEma: number = currentClose * k + priorEma * (1 - k);
      prevEma = calculatedEma;
      result.push(Number(calculatedEma.toFixed(5)));
    }
  }
  return result;
}

/**
 * Bollinger Bands (Upper, Middle, Lower)
 */
export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const sma = calculateSMA(candles, period);
  const upper: (number | null)[] = [];
  const middle = sma;
  const lower: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const mid = sma[i];
    if (mid === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        varianceSum += Math.pow(candles[i - j].close - mid, 2);
      }
      const stdDev = Math.sqrt(varianceSum / period);
      upper.push(Number((mid + stdDevMultiplier * stdDev).toFixed(5)));
      lower.push(Number((mid - stdDevMultiplier * stdDev).toFixed(5)));
    }
  }

  return { upper, middle, lower };
}

/**
 * Relative Strength Index (RSI)
 */
export function calculateRSI(candles: Candle[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  if (candles.length <= period) {
    return candles.map(() => null);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i++) {
    rsi.push(null);
  }

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let currentRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
  rsi.push(Number(currentRsi.toFixed(2)));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    currentRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    rsi.push(Number(currentRsi.toFixed(2)));
  }

  return rsi;
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export interface MACDResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEma = calculateEMA(candles, fastPeriod);
  const slowEma = calculateEMA(candles, slowPeriod);
  const macd: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (fastEma[i] === null || slowEma[i] === null) {
      macd.push(null);
    } else {
      macd.push(Number((fastEma[i]! - slowEma[i]!).toFixed(5)));
    }
  }

  const validStart = macd.findIndex((v) => v !== null);
  const signal: (number | null)[] = new Array(candles.length).fill(null);
  const histogram: (number | null)[] = new Array(candles.length).fill(null);

  if (validStart !== -1 && candles.length - validStart >= signalPeriod) {
    const validValues = macd.slice(validStart) as number[];
    const k = 2 / (signalPeriod + 1);
    let prevSig: number | null = null;

    for (let j = 0; j < validValues.length; j++) {
      const idx = validStart + j;
      if (j < signalPeriod - 1) {
        signal[idx] = null;
      } else if (j === signalPeriod - 1) {
        let sum = 0;
        for (let m = 0; m < signalPeriod; m++) {
          sum += validValues[j - m];
        }
        prevSig = sum / signalPeriod;
        signal[idx] = Number(prevSig.toFixed(5));
      } else {
        const curVal = validValues[j];
        const nextSig: number = curVal * k + (prevSig ?? 0) * (1 - k);
        prevSig = nextSig;
        signal[idx] = Number(nextSig.toFixed(5));
      }

      if (signal[idx] !== null && macd[idx] !== null) {
        histogram[idx] = Number((macd[idx]! - signal[idx]!).toFixed(5));
      }
    }
  }

  return { macd, signal, histogram };
}

/**
 * Standard Fibonacci Retracement Levels
 */
export function calculateFibonacciLevels(
  high: number,
  low: number
): { ratio: number; price: number; label: string }[] {
  const diff = high - low;
  const ratios = [
    { ratio: 0, label: '0.0% (Low)' },
    { ratio: 0.236, label: '23.6%' },
    { ratio: 0.382, label: '38.2%' },
    { ratio: 0.5, label: '50.0%' },
    { ratio: 0.618, label: '61.8% (Golden)' },
    { ratio: 0.786, label: '78.6%' },
    { ratio: 1.0, label: '100.0% (High)' },
  ];

  return ratios.map((item) => ({
    ratio: item.ratio,
    label: item.label,
    price: Number((low + diff * item.ratio).toFixed(5)),
  }));
}
