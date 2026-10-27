import { Candle, AssetInfo } from '../types';

interface AssetMasterHistory {
  baseTicks: Candle[]; // Granular 5s candles
  timeframeSeries: Map<number, Candle[]>; // Cached organic candle series per timeframe (5s..4h)
  lastPrice: number;
  momentum: number;
  volatilityRegime: number;
  tickCounter: number;
}

const masterStores: Map<string, AssetMasterHistory> = new Map();

/**
 * Deterministic PRNG (Mulberry32) seeded by string + timeframe so each asset/timeframe
 * has reproducible, organic institutional market structure.
 */
function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller Gaussian normal random variable N(0, 1)
 */
function gaussianRandom(rand: () => number): number {
  const u1 = Math.max(1e-7, rand());
  const u2 = Math.max(1e-7, rand());
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generates a realistic series of OHLCV candles using Stochastic / Brownian Motion
 * with GARCH-style volatility clustering, natural intra-trend pullbacks (preventing artificial
 * same-color stair-step streaks), and explicit candlestick archetypes (Marubozu, Hammer,
 * Shooting Star, Spinning Top, Doji, Trend/Pullback) so every single candle has organic
 * body variation and prominent upper & lower wicks.
 */
function generateOrganicCandleSeries(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 160,
  targetEndPrice?: number
): Candle[] {
  const rand = createSeededRandom(`${asset.symbol}:${timeframeSeconds}:v2`);
  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;

  // Scale volatility naturally with timeframe
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.32);
  const unitVol = asset.volatility * tfMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const rawCandles: Candle[] = [];
  let currentPrice = asset.basePrice;
  let volCluster = 1.0;
  let regimeDirection = rand() > 0.5 ? 1 : -1;
  let regimeTicksLeft = Math.floor(rand() * 7) + 3;
  let consecutiveSameColor = 0;
  let lastColorSign = 0;

  for (let i = count - 1; i >= 0; i--) {
    const open = currentPrice;

    // 1. Short, realistic market structure waves (3 to 9 candles per wave)
    regimeTicksLeft--;
    if (regimeTicksLeft <= 0) {
      const r = rand();
      if (r < 0.36) {
        regimeDirection = 1; // Bullish structure
      } else if (r < 0.72) {
        regimeDirection = -1; // Bearish structure
      } else {
        regimeDirection = 0; // Range / consolidation structure
      }
      regimeTicksLeft = Math.floor(rand() * 6) + 3;
    }

    // 2. GARCH-like volatility clustering
    const shock = Math.abs(gaussianRandom(rand));
    volCluster = Math.max(0.45, Math.min(2.4, 0.68 * volCluster + 0.32 * shock));

    // 3. Gentle mean reversion toward basePrice so price stays in realistic range
    const deviationFromAnchor = (asset.basePrice - open) / Math.max(unitVol * 18, minPip);
    const meanReversionBias = Math.max(-0.22, Math.min(0.22, deviationFromAnchor * 0.14));

    // 4. Candlestick archetype selection for rich body & wick diversity
    const archetypeRoll = rand();
    let bodyMultiplier = 1.0;
    let upperWickMultiplier = 1.0;
    let lowerWickMultiplier = 1.0;

    if (archetypeRoll < 0.16) {
      // Doji / Spinning Top (tight body, tall upper and lower wicks)
      bodyMultiplier = 0.12 + rand() * 0.22;
      upperWickMultiplier = 1.25 + rand() * 1.65;
      lowerWickMultiplier = 1.25 + rand() * 1.65;
    } else if (archetypeRoll < 0.34) {
      // Hammer / Bullish Liquidity Rejection (long lower shadow)
      bodyMultiplier = 0.45 + rand() * 0.65;
      upperWickMultiplier = 0.35 + rand() * 0.65;
      lowerWickMultiplier = 1.95 + rand() * 2.15;
    } else if (archetypeRoll < 0.52) {
      // Shooting Star / Bearish Liquidity Rejection (long upper shadow)
      bodyMultiplier = 0.45 + rand() * 0.65;
      upperWickMultiplier = 1.95 + rand() * 2.15;
      lowerWickMultiplier = 0.35 + rand() * 0.65;
    } else if (archetypeRoll < 0.72) {
      // Institutional Expansion / Marubozu Candle (large body, distinct wicks)
      bodyMultiplier = 1.55 + rand() * 1.35;
      upperWickMultiplier = 0.45 + rand() * 0.85;
      lowerWickMultiplier = 0.45 + rand() * 0.85;
    } else {
      // Standard organic market candle with asymmetric wicks
      bodyMultiplier = 0.65 + rand() * 0.95;
      upperWickMultiplier = 0.75 + rand() * 1.45;
      lowerWickMultiplier = 0.75 + rand() * 1.45;
    }

    // 5. Determine candle direction with natural pullbacks inside trends
    // Even during a bullish regime, ~38% of candles are bearish pullback candles,
    // and after 2-3 consecutive same-color candles, profit-taking pullbacks kick in.
    let dirProbBullish = 0.5 + regimeDirection * 0.11 + meanReversionBias * 0.35;
    if (consecutiveSameColor >= 2 && lastColorSign === 1) {
      dirProbBullish = consecutiveSameColor >= 3 ? 0.12 : 0.26;
    } else if (consecutiveSameColor >= 2 && lastColorSign === -1) {
      dirProbBullish = consecutiveSameColor >= 3 ? 0.88 : 0.74;
    }

    const candleSign = rand() < dirProbBullish ? 1 : -1;
    if (candleSign === lastColorSign) {
      consecutiveSameColor++;
    } else {
      lastColorSign = candleSign;
      consecutiveSameColor = 1;
    }

    // Pullback candles against the primary regime tend to have slightly smaller or medium bodies
    // compared to impulse candles with the regime, creating organic higher-highs / lower-lows
    const trendAlignmentFactor =
      regimeDirection !== 0 && candleSign !== regimeDirection
        ? 0.58 + rand() * 0.55
        : 0.85 + rand() * 0.65;

    // Simulate 16 intra-candle Brownian micro-ticks
    let subPrice = open;
    let intraHigh = open;
    let intraLow = open;
    const subSteps = 16;
    const stepVol = (unitVol * volCluster) / Math.sqrt(subSteps);

    for (let s = 0; s < subSteps; s++) {
      const dW = gaussianRandom(rand);
      subPrice += dW * stepVol;
      if (subPrice > intraHigh) intraHigh = subPrice;
      if (subPrice < intraLow) intraLow = subPrice;
    }

    const bodyMagnitude = Math.max(
      minPip * 2,
      (0.22 + Math.abs(gaussianRandom(rand)) * 0.78) *
        unitVol *
        volCluster *
        bodyMultiplier *
        trendAlignmentFactor
    );
    const close = open + candleSign * bodyMagnitude;

    // Prominent, realistic upper and lower wicks beyond open/close
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);

    const extraUpper =
      Math.max(intraHigh - bodyMax, 0) * 0.45 +
      (0.32 + rand() * 0.95) * unitVol * volCluster * upperWickMultiplier;

    const extraLower =
      Math.max(bodyMin - intraLow, 0) * 0.45 +
      (0.32 + rand() * 0.95) * unitVol * volCluster * lowerWickMultiplier;

    const high = bodyMax + Math.max(minPip * 2, extraUpper);
    const low = bodyMin - Math.max(minPip * 2, extraLower);

    currentPrice = close;

    rawCandles.push({
      time: nowBucket - i * bucketMs,
      open: Number(open.toFixed(asset.pipDecimals)),
      high: Number(high.toFixed(asset.pipDecimals)),
      low: Number(low.toFixed(asset.pipDecimals)),
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(60 + volCluster * 95 + rand() * 140),
    });
  }

  // If a targetEndPrice is specified, shift the series smoothly so the latest close aligns with targetEndPrice
  // while preserving every candle's exact OHLC continuity and wick geometry.
  if (typeof targetEndPrice === 'number' && rawCandles.length > 0) {
    const lastClose = rawCandles[rawCandles.length - 1].close;
    const delta = targetEndPrice - lastClose;
    for (let i = 0; i < rawCandles.length; i++) {
      const c = rawCandles[i];
      c.open = Number((c.open + delta).toFixed(asset.pipDecimals));
      c.high = Number((c.high + delta).toFixed(asset.pipDecimals));
      c.low = Number((c.low + delta).toFixed(asset.pipDecimals));
      c.close = Number((c.close + delta).toFixed(asset.pipDecimals));
    }
  }

  return rawCandles;
}

/**
 * Initializes or retrieves a persistent, deterministic master candle history for an asset.
 * Switching timeframes preserves market price continuity and provides 160+ organic candles on every timeframe.
 */
export function getOrCreateMasterHistory(asset: AssetInfo): AssetMasterHistory {
  if (masterStores.has(asset.symbol)) {
    return masterStores.get(asset.symbol)!;
  }

  const baseTicks = generateOrganicCandleSeries(asset, 5, 240);
  const lastPrice =
    baseTicks.length > 0 ? baseTicks[baseTicks.length - 1].close : asset.basePrice;

  const timeframeSeries = new Map<number, Candle[]>();
  timeframeSeries.set(5, baseTicks);

  const store: AssetMasterHistory = {
    baseTicks,
    timeframeSeries,
    lastPrice,
    momentum: 0,
    volatilityRegime: 1.0,
    tickCounter: 0,
  };
  masterStores.set(asset.symbol, store);
  return store;
}

/**
 * Generates the next organic real-time market tick using Stochastic Brownian Motion
 * with volatility clustering, micro-pullbacks, and intra-candle wick rejections.
 */
export function stepOrganicLiveTick(asset: AssetInfo): number {
  const store = getOrCreateMasterHistory(asset);
  store.tickCounter += 1;

  const minPip = Math.pow(10, -asset.pipDecimals);
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.max(1e-7, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Update volatility cluster smoothly
  store.volatilityRegime = Math.max(
    0.55,
    Math.min(2.2, 0.88 * store.volatilityRegime + 0.12 * Math.abs(z))
  );

  // Mean reversion toward basePrice if price drifts far away
  const distFromBase = (asset.basePrice - store.lastPrice) / Math.max(asset.volatility * 25, minPip);
  const reversionPull = Math.max(-0.25, Math.min(0.25, distFromBase * 0.14));

  // Periodic micro-pullback / liquidity wick impulse so active candle forms visible upper & lower wicks
  const waveCycle = Math.sin(store.tickCounter * 0.55) * 0.22;
  const stepScale = asset.volatility * 0.34 * store.volatilityRegime;

  const delta = (reversionPull + waveCycle + z * 0.9) * stepScale;
  const nextPrice = Number((store.lastPrice + delta).toFixed(asset.pipDecimals));

  appendLiveTick(asset, nextPrice);
  return nextPrice;
}

/**
 * Helper to update a single timeframe candle array with a new live tick,
 * ensuring the active candle has realistic upper and lower wicks and opens at the exact previous close.
 */
function updateCandleArrayWithTick(
  candles: Candle[],
  asset: AssetInfo,
  timeframeSeconds: number,
  newPrice: number,
  now: number
): void {
  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const currentBucket = Math.floor(now / bucketMs) * bucketMs;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.28);
  const minWick = Math.max(minPip * 2, asset.volatility * 0.24 * tfMultiplier);

  const lastCandle = candles[candles.length - 1];
  if (lastCandle && now - lastCandle.time < bucketMs) {
    lastCandle.close = newPrice;
    const bodyHigh = Math.max(lastCandle.open, lastCandle.close);
    const bodyLow = Math.min(lastCandle.open, lastCandle.close);
    lastCandle.high = Number(
      Math.max(lastCandle.high, newPrice, bodyHigh + minWick * 0.45).toFixed(asset.pipDecimals)
    );
    lastCandle.low = Number(
      Math.min(lastCandle.low, newPrice, bodyLow - minWick * 0.45).toFixed(asset.pipDecimals)
    );
    lastCandle.volume += 1;
  } else {
    const openPrice = lastCandle ? lastCandle.close : newPrice;
    const bodyHigh = Math.max(openPrice, newPrice);
    const bodyLow = Math.min(openPrice, newPrice);
    const initialUpperWick = minWick * (0.55 + Math.random() * 0.65);
    const initialLowerWick = minWick * (0.55 + Math.random() * 0.65);

    candles.push({
      time: currentBucket > (lastCandle?.time || 0) ? currentBucket : (lastCandle?.time || now) + bucketMs,
      open: Number(openPrice.toFixed(asset.pipDecimals)),
      high: Number((bodyHigh + initialUpperWick).toFixed(asset.pipDecimals)),
      low: Number((bodyLow - initialLowerWick).toFixed(asset.pipDecimals)),
      close: Number(newPrice.toFixed(asset.pipDecimals)),
      volume: Math.floor(15 + Math.random() * 25),
    });

    if (candles.length > 300) {
      candles.shift();
    }
  }
}

/**
 * Adds a new live tick to the master history and updates all active timeframe series.
 */
export function appendLiveTick(asset: AssetInfo, newPrice: number): void {
  const store = getOrCreateMasterHistory(asset);
  store.lastPrice = newPrice;
  const now = Date.now();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);
  });
}

/**
 * Returns a rich, natural 160+ candlestick series for the requested timeframe,
 * synchronized with the current live price and preserving all historical price action.
 */
export function aggregateCandlesForTimeframe(
  asset: AssetInfo,
  timeframeSeconds: number
): Candle[] {
  const store = getOrCreateMasterHistory(asset);
  const tf = Math.max(5, timeframeSeconds);

  if (!store.timeframeSeries.has(tf)) {
    const generated = generateOrganicCandleSeries(asset, tf, 160, store.lastPrice);
    store.timeframeSeries.set(tf, generated);
  }

  const series = store.timeframeSeries.get(tf)!;
  return [...series];
}
