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
 * with GARCH-style volatility clustering, natural intra-trend pullbacks,
 * and explicit candlestick archetypes.
 */
function generateOrganicCandleSeries(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 1500,
  targetEndPrice?: number
): Candle[] {
  const rand = createSeededRandom(`${asset.symbol}:${timeframeSeconds}:v3`);
  const bucketMs = Math.max(5, timeframeSeconds) * 1000;

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

    regimeTicksLeft--;
    if (regimeTicksLeft <= 0) {
      const r = rand();
      if (r < 0.36) {
        regimeDirection = 1;
      } else if (r < 0.72) {
        regimeDirection = -1;
      } else {
        regimeDirection = 0;
      }
      regimeTicksLeft = Math.floor(rand() * 6) + 3;
    }

    const shock = Math.abs(gaussianRandom(rand));
    volCluster = Math.max(0.45, Math.min(2.4, 0.68 * volCluster + 0.32 * shock));

    const deviationFromAnchor = (asset.basePrice - open) / Math.max(unitVol * 18, minPip);
    const meanReversionBias = Math.max(-0.22, Math.min(0.22, deviationFromAnchor * 0.14));

    const archetypeRoll = rand();
    let bodyMultiplier = 1.0;
    let upperWickMultiplier = 1.0;
    let lowerWickMultiplier = 1.0;

    if (archetypeRoll < 0.16) {
      bodyMultiplier = 0.12 + rand() * 0.22;
      upperWickMultiplier = 1.25 + rand() * 1.65;
      lowerWickMultiplier = 1.25 + rand() * 1.65;
    } else if (archetypeRoll < 0.34) {
      bodyMultiplier = 0.45 + rand() * 0.65;
      upperWickMultiplier = 0.35 + rand() * 0.65;
      lowerWickMultiplier = 1.95 + rand() * 2.15;
    } else if (archetypeRoll < 0.52) {
      bodyMultiplier = 0.45 + rand() * 0.65;
      upperWickMultiplier = 1.95 + rand() * 2.15;
      lowerWickMultiplier = 0.35 + rand() * 0.65;
    } else if (archetypeRoll < 0.72) {
      bodyMultiplier = 1.55 + rand() * 1.35;
      upperWickMultiplier = 0.45 + rand() * 0.85;
      lowerWickMultiplier = 0.45 + rand() * 0.85;
    } else {
      bodyMultiplier = 0.65 + rand() * 0.95;
      upperWickMultiplier = 0.75 + rand() * 1.45;
      lowerWickMultiplier = 0.75 + rand() * 1.45;
    }

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

    const bodyMagnitude = Math.max(
      minPip * 2,
      (0.25 + Math.abs(gaussianRandom(rand)) * 0.75) * unitVol * volCluster * bodyMultiplier
    );

    const close = open + candleSign * bodyMagnitude;
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);

    const upperWick = upperWickMultiplier * unitVol * volCluster * (0.35 + rand() * 0.75);
    const lowerWick = lowerWickMultiplier * unitVol * volCluster * (0.35 + rand() * 0.75);

    const high = bodyMax + Math.max(minPip * 2, upperWick);
    const low = bodyMin - Math.max(minPip * 2, lowerWick);

    rawCandles.push({
      time: 0, // Assigned below
      open: Number(open.toFixed(asset.pipDecimals)),
      high: Number(high.toFixed(asset.pipDecimals)),
      low: Number(low.toFixed(asset.pipDecimals)),
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(40 + volCluster * 60 + rand() * 100),
    });

    currentPrice = close;
  }

  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  return rawCandles.map((c, idx) => ({
    ...c,
    time: nowBucket - (rawCandles.length - 1 - idx) * bucketMs,
  }));
}

export function getOrCreateMasterHistory(asset: AssetInfo): AssetMasterHistory {
  if (!masterStores.has(asset.symbol)) {
    const candles = generateOrganicCandleSeries(asset, 5, 1500, asset.basePrice);
    const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : asset.basePrice;
    masterStores.set(asset.symbol, {
      baseTicks: candles,
      timeframeSeries: new Map([[5, candles]]),
      lastPrice,
      momentum: 0,
      volatilityRegime: 1.0,
      tickCounter: 0,
    });
  }
  return masterStores.get(asset.symbol)!;
}

/**
 * Generates the next organic real-time market tick with High-Volatility Engine
 * for 90% - 97% payout assets during the final seconds of candle expiry.
 */
export function stepOrganicLiveTick(asset: AssetInfo): number {
  const store = getOrCreateMasterHistory(asset);
  store.tickCounter += 1;

  const minPip = Math.pow(10, -asset.pipDecimals);
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.max(1e-7, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  store.volatilityRegime = Math.max(
    0.55,
    Math.min(2.5, 0.88 * store.volatilityRegime + 0.12 * Math.abs(z))
  );

  const distFromBase = (asset.basePrice - store.lastPrice) / Math.max(asset.volatility * 25, minPip);
  const reversionPull = Math.max(-0.25, Math.min(0.25, distFromBase * 0.14));

  const waveCycle = Math.sin(store.tickCounter * 0.55) * 0.22;
  let stepScale = asset.volatility * 0.34 * store.volatilityRegime;

  // ==========================================================================
  // HIGH-VOLATILITY ENGINE (90% - 97% Payouts)
  // During the final seconds of candle expiry (e.g. final 6 seconds),
  // introduce sharp, unpredictable price spikes and high volatility so the final
  // outcome remains thrilling and intense ("hard to guess in the last second").
  // ==========================================================================
  if (asset.payout >= 90) {
    const secInMinute = Math.floor(Date.now() / 1000) % 60;
    if (secInMinute >= 54) {
      stepScale *= 3.8; // Aggressive volatility multiplier
      const sharpSpike = (Math.random() - 0.5) * asset.volatility * 5.2;
      const delta = (reversionPull + waveCycle + z * 2.8 + sharpSpike) * stepScale;
      const nextPrice = Number((store.lastPrice + delta).toFixed(asset.pipDecimals));
      appendLiveTick(asset, nextPrice);
      return nextPrice;
    }
  }

  const delta = (reversionPull + waveCycle + z * 0.9) * stepScale;
  const nextPrice = Number((store.lastPrice + delta).toFixed(asset.pipDecimals));

  appendLiveTick(asset, nextPrice);
  return nextPrice;
}

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

    if (candles.length > 5000) {
      candles.shift();
    }
  }
}

export function prependHistoricalCandles(
  asset: AssetInfo,
  timeframeSeconds: number,
  chunkCount: number = 500
): Candle[] {
  const store = getOrCreateMasterHistory(asset);
  const tf = Math.max(5, timeframeSeconds);

  if (!store.timeframeSeries.has(tf)) {
    return aggregateCandlesForTimeframe(asset, tf);
  }

  const existing = store.timeframeSeries.get(tf)!;
  if (existing.length >= 5000 || existing.length === 0) {
    return existing;
  }

  const earliest = existing[0];
  const bucketMs = tf * 1000;
  const rand = createSeededRandom(`${asset.symbol}:${tf}:past:${earliest.time}`);

  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.32);
  const unitVol = asset.volatility * tfMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const olderCandles: Candle[] = [];
  let currentTargetClose = earliest.open;
  let volCluster = 1.0;

  for (let i = 1; i <= chunkCount; i++) {
    const shock = Math.abs(gaussianRandom(rand));
    volCluster = Math.max(0.45, Math.min(2.4, 0.68 * volCluster + 0.32 * shock));
    const close = currentTargetClose;
    const candleSign = rand() > 0.49 ? 1 : -1;
    const bodyMagnitude = Math.max(
      minPip * 2,
      (0.25 + Math.abs(gaussianRandom(rand)) * 0.75) * unitVol * volCluster
    );
    const open = close - candleSign * bodyMagnitude;

    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = (0.35 + rand() * 0.95) * unitVol * volCluster;
    const lowerWick = (0.35 + rand() * 0.95) * unitVol * volCluster;

    const high = bodyMax + Math.max(minPip * 2, upperWick);
    const low = bodyMin - Math.max(minPip * 2, lowerWick);

    olderCandles.unshift({
      time: earliest.time - i * bucketMs,
      open: Number(open.toFixed(asset.pipDecimals)),
      high: Number(high.toFixed(asset.pipDecimals)),
      low: Number(low.toFixed(asset.pipDecimals)),
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(50 + volCluster * 80 + rand() * 120),
    });

    currentTargetClose = open;
  }

  const combined = [...olderCandles, ...existing];
  store.timeframeSeries.set(tf, combined);
  return combined;
}

export function appendLiveTick(asset: AssetInfo, newPrice: number): void {
  const store = getOrCreateMasterHistory(asset);
  store.lastPrice = newPrice;
  const now = Date.now();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);
  });
}

export function aggregateCandlesForTimeframe(
  asset: AssetInfo,
  timeframeSeconds: number
): Candle[] {
  const store = getOrCreateMasterHistory(asset);
  const tf = Math.max(5, timeframeSeconds);

  if (!store.timeframeSeries.has(tf)) {
    const generated = generateOrganicCandleSeries(asset, tf, 1500, store.lastPrice);
    store.timeframeSeries.set(tf, generated);
  }

  const series = store.timeframeSeries.get(tf)!;
  return [...series];
}
