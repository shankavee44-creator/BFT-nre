import { Candle, AssetInfo } from '../types';
import { findAssetBySymbol, normalizeAssetSymbol } from './storage';

export type MarketRegime =
  | 'bullish_trend'
  | 'bearish_trend'
  | 'consolidation'
  | 'volatile_breakout'
  | 'mean_reverting';

export interface AssetMarketState {
  symbol: string;
  category: string;
  baseTicks: Candle[]; // Granular 5s candles
  timeframeSeries: Map<number, Candle[]>; // Cached organic candle series per timeframe (5s..4h)
  lastPrice: number;
  prevPrice: number;
  momentum: number;
  volatilityRegime: number;
  tickCounter: number;
  regime: MarketRegime;
  regimeTicksRemaining: number;
  regimeIntensity: number;
  phaseOffset: number;
  primaryFrequency: number;
  secondaryFrequency: number;
  dynamicSupport: number;
  dynamicResistance: number;
  seed: number;
}

const masterStores: Map<string, AssetMarketState> = new Map();

/**
 * Fast 32-bit FNV-1a hash of asset symbol to derive deterministic seeds,
 * independent harmonic frequencies, and distinct initial market regimes.
 */
function hashSymbol(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic PRNG (Mulberry32) seeded by string so each asset and timeframe
 * produces a reproducible, distinctive institutional market structure.
 */
function createSeededRandom(seedStr: string): () => number {
  let h = hashSymbol(seedStr);
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
 * Get category-specific volatility and behavior multipliers.
 * Crypto has wide swings, Forex has tight pips, Commodities have persistent macro trends.
 */
function getCategoryParameters(category: string) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('crypto')) {
    return {
      volMultiplier: 2.1,
      trendLengthMin: 25,
      trendLengthMax: 70,
      breakoutChance: 0.28,
      wickMultiplier: 1.35,
      maxRunCandles: 7,
    };
  }
  if (cat.includes('commodit')) {
    return {
      volMultiplier: 1.45,
      trendLengthMin: 35,
      trendLengthMax: 90,
      breakoutChance: 0.20,
      wickMultiplier: 1.15,
      maxRunCandles: 6,
    };
  }
  if (cat.includes('stock')) {
    return {
      volMultiplier: 1.25,
      trendLengthMin: 30,
      trendLengthMax: 80,
      breakoutChance: 0.18,
      wickMultiplier: 1.1,
      maxRunCandles: 5,
    };
  }
  // Default Forex
  return {
    volMultiplier: 1.0,
    trendLengthMin: 30,
    trendLengthMax: 85,
    breakoutChance: 0.15,
    wickMultiplier: 1.05,
    maxRunCandles: 5,
  };
}

/**
 * Select a new market regime based on current regime and PRNG
 */
function transitionRegime(
  currentRegime: MarketRegime,
  rand: () => number,
  breakoutChance: number
): MarketRegime {
  const r = rand();
  if (currentRegime === 'bullish_trend') {
    // Bullish trend often leads to consolidation (55%), continuation (20%), or reversal (25%)
    if (r < 0.55) return 'consolidation';
    if (r < 0.80) return 'bearish_trend';
    return 'mean_reverting';
  }
  if (currentRegime === 'bearish_trend') {
    // Bearish trend often leads to consolidation (55%), continuation (20%), or reversal (25%)
    if (r < 0.55) return 'consolidation';
    if (r < 0.80) return 'bullish_trend';
    return 'mean_reverting';
  }
  if (currentRegime === 'consolidation' || currentRegime === 'mean_reverting') {
    // Consolidation frequently breaks out into a directional trend
    if (r < breakoutChance) return 'volatile_breakout';
    if (r < 0.55) return 'bullish_trend';
    return 'bearish_trend';
  }
  // After volatile breakout, settle into consolidation or mean reversion
  return r < 0.65 ? 'consolidation' : 'mean_reverting';
}

/**
 * Generates an organic, asset-isolated series of OHLCV candles using multi-regime
 * stochastic drift with GARCH volatility clustering, natural pullbacks,
 * and diverse candlestick archetypes (hammers, pinbars, marubozu, dojis).
 *
 * Crucially: Each asset pair produces a completely independent price trajectory
 * and pattern series.
 */
function generateOrganicCandleSeries(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 1500,
  targetEndPrice?: number
): Candle[] {
  const assetSeed = hashSymbol(asset.symbol);
  const rand = createSeededRandom(`${asset.symbol}:${timeframeSeconds}:iso-v5:${assetSeed}`);
  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.32);

  const catParams = getCategoryParameters(asset.category);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  // Initialize independent regime
  const initialRegimes: MarketRegime[] = [
    'bullish_trend',
    'bearish_trend',
    'consolidation',
    'volatile_breakout',
    'mean_reverting',
  ];
  let currentRegime = initialRegimes[assetSeed % initialRegimes.length];
  let regimeDuration =
    catParams.trendLengthMin +
    Math.floor(rand() * (catParams.trendLengthMax - catParams.trendLengthMin));
  let regimeIntensity = 0.65 + rand() * 0.7;

  // Derive asset-specific harmonic wave frequency and phase offset
  const assetPhase = (((assetSeed >> 7) & 0xff) / 255) * Math.PI * 2;
  const assetFreq = 0.14 + (((assetSeed >> 3) & 0x7f) / 127) * 0.36;

  const rawCandles: Candle[] = [];
  let currentPrice = asset.basePrice;
  let volCluster = 1.0;
  let consecutiveSameColor = 0;
  let lastColorSign = 0;

  // Broad support/resistance floating band to allow authentic multi-hour trends
  // without artificial tight rubber-banding
  const maxExcursion = Math.max(unitVol * 800, asset.basePrice * (catParams.volMultiplier > 1.5 ? 0.35 : 0.12));
  const floorPrice = Math.max(minPip * 10, asset.basePrice - maxExcursion);
  const ceilingPrice = asset.basePrice + maxExcursion;

  for (let i = count - 1; i >= 0; i--) {
    const open = currentPrice;

    // Advance regime duration
    regimeDuration--;
    if (regimeDuration <= 0) {
      currentRegime = transitionRegime(currentRegime, rand, catParams.breakoutChance);
      regimeDuration =
        catParams.trendLengthMin +
        Math.floor(rand() * (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.6 + rand() * 0.8;
    }

    // Dynamic GARCH-style volatility clustering
    const shock = Math.abs(gaussianRandom(rand));
    volCluster = Math.max(0.45, Math.min(2.8, 0.72 * volCluster + 0.28 * shock));

    // Calculate regime-based directional bias
    let trendDrift = 0;
    if (currentRegime === 'bullish_trend') {
      trendDrift = 0.28 * regimeIntensity;
    } else if (currentRegime === 'bearish_trend') {
      trendDrift = -0.28 * regimeIntensity;
    } else if (currentRegime === 'volatile_breakout') {
      // Breakout direction is seeded by asset and current block
      const breakoutDir = (assetSeed ^ (i >> 5)) % 2 === 0 ? 1 : -1;
      trendDrift = 0.55 * breakoutDir * regimeIntensity;
      volCluster = Math.min(3.2, volCluster * 1.35);
    } else if (currentRegime === 'consolidation') {
      trendDrift = 0;
    } else {
      // Mean reverting: gentle pull toward basePrice if far away
      const distFromCenter = (asset.basePrice - open) / maxExcursion;
      trendDrift = Math.max(-0.25, Math.min(0.25, distFromCenter * 0.35));
    }

    // Gentle boundary pushback only when price approaches extreme outer envelopes
    if (open > ceilingPrice) {
      trendDrift -= 0.45;
    } else if (open < floorPrice) {
      trendDrift += 0.45;
    }

    // Unique harmonic wave component per asset
    const waveShift = Math.sin(assetPhase + i * assetFreq) * 0.14;

    // Candlestick archetype roll
    const archetypeRoll = rand();
    let bodyMultiplier = 1.0;
    let upperWickMultiplier = catParams.wickMultiplier;
    let lowerWickMultiplier = catParams.wickMultiplier;

    if (archetypeRoll < 0.14) {
      // Doji / spinning top
      bodyMultiplier = 0.15 + rand() * 0.2;
      upperWickMultiplier *= 1.3 + rand() * 1.5;
      lowerWickMultiplier *= 1.3 + rand() * 1.5;
    } else if (archetypeRoll < 0.30) {
      // Hammer / Pinbar with long lower shadow
      bodyMultiplier = 0.4 + rand() * 0.5;
      upperWickMultiplier *= 0.3 + rand() * 0.5;
      lowerWickMultiplier *= 1.8 + rand() * 2.2;
    } else if (archetypeRoll < 0.46) {
      // Shooting star / inverted hammer with long upper shadow
      bodyMultiplier = 0.4 + rand() * 0.5;
      upperWickMultiplier *= 1.8 + rand() * 2.2;
      lowerWickMultiplier *= 0.3 + rand() * 0.5;
    } else if (archetypeRoll < 0.68) {
      // Marubozu / strong trend bar
      bodyMultiplier = 1.45 + rand() * 1.25;
      upperWickMultiplier *= 0.35 + rand() * 0.45;
      lowerWickMultiplier *= 0.35 + rand() * 0.45;
    } else {
      // Standard institutional candlestick
      bodyMultiplier = 0.75 + rand() * 0.85;
      upperWickMultiplier *= 0.75 + rand() * 1.1;
      lowerWickMultiplier *= 0.75 + rand() * 1.1;
    }

    // Bullish probability modulated by trendDrift and waveShift
    let dirProbBullish = 0.5 + trendDrift + waveShift;

    // Allow realistic natural streaks (up to catParams.maxRunCandles during strong trends)
    if (consecutiveSameColor >= catParams.maxRunCandles && lastColorSign === 1) {
      dirProbBullish = 0.18;
    } else if (consecutiveSameColor >= catParams.maxRunCandles && lastColorSign === -1) {
      dirProbBullish = 0.82;
    } else if (consecutiveSameColor >= 3) {
      // Slight pullback damping, but allows strong momentum continuation
      dirProbBullish = lastColorSign === 1 ? dirProbBullish - 0.14 : dirProbBullish + 0.14;
    }
    dirProbBullish = Math.max(0.08, Math.min(0.92, dirProbBullish));

    const candleSign = rand() < dirProbBullish ? 1 : -1;
    if (candleSign === lastColorSign) {
      consecutiveSameColor++;
    } else {
      lastColorSign = candleSign;
      consecutiveSameColor = 1;
    }

    const bodyMagnitude = Math.max(
      minPip * 2,
      (0.3 + Math.abs(gaussianRandom(rand)) * 0.7) * unitVol * volCluster * bodyMultiplier
    );

    const close = open + candleSign * bodyMagnitude;
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);

    const upperWick = Math.max(minPip * 2, upperWickMultiplier * unitVol * volCluster * (0.35 + rand() * 0.75));
    const lowerWick = Math.max(minPip * 2, lowerWickMultiplier * unitVol * volCluster * (0.35 + rand() * 0.75));

    const high = bodyMax + upperWick;
    const low = bodyMin - lowerWick;

    rawCandles.push({
      time: 0,
      open: Number(open.toFixed(asset.pipDecimals)),
      high: Number(high.toFixed(asset.pipDecimals)),
      low: Number(low.toFixed(asset.pipDecimals)),
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(45 + volCluster * 65 + rand() * 110),
    });

    currentPrice = close;
  }

  // If a targetEndPrice is supplied (e.g. current live price), calibrate smoothly across history
  // while strictly maintaining open === prev.close continuity and proper wick boundaries
  if (targetEndPrice && rawCandles.length > 0) {
    const lastClose = rawCandles[rawCandles.length - 1].close;
    const diff = targetEndPrice - lastClose;
    if (Math.abs(diff) > minPip) {
      let prevAdj = 0;
      for (let j = 0; j < rawCandles.length; j++) {
        const factor = (j + 1) / rawCandles.length;
        const currentAdj = Number((diff * factor).toFixed(asset.pipDecimals));
        rawCandles[j].open = Number((rawCandles[j].open + prevAdj).toFixed(asset.pipDecimals));
        rawCandles[j].close = Number((rawCandles[j].close + currentAdj).toFixed(asset.pipDecimals));
        const bodyMax = Math.max(rawCandles[j].open, rawCandles[j].close);
        const bodyMin = Math.min(rawCandles[j].open, rawCandles[j].close);
        rawCandles[j].high = Number(
          Math.max(rawCandles[j].high + currentAdj, bodyMax + minPip * 2).toFixed(asset.pipDecimals)
        );
        rawCandles[j].low = Number(
          Math.min(rawCandles[j].low + currentAdj, bodyMin - minPip * 2).toFixed(asset.pipDecimals)
        );
        prevAdj = currentAdj;
      }
    }
  }

  const nowBucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  return rawCandles.map((c, idx) => ({
    ...c,
    time: nowBucket - (rawCandles.length - 1 - idx) * bucketMs,
  }));
}

/**
 * Creates or retrieves the isolated state machine for a specific asset pair.
 * Guarantees every asset pair has its own dedicated frequencies, regimes, and candle series.
 */
export function getOrCreateMasterHistory(asset: AssetInfo): AssetMarketState {
  if (!masterStores.has(asset.symbol)) {
    const seed = hashSymbol(asset.symbol);
    const catParams = getCategoryParameters(asset.category);

    const initialRegimes: MarketRegime[] = [
      'bullish_trend',
      'bearish_trend',
      'consolidation',
      'volatile_breakout',
      'mean_reverting',
    ];
    const initialRegime = initialRegimes[seed % initialRegimes.length];
    const initialTicks =
      catParams.trendLengthMin + ((seed >> 5) % (catParams.trendLengthMax - catParams.trendLengthMin));

    // Unique frequency and phase angle per asset so waves never align
    const primaryFrequency = 0.16 + ((seed % 100) / 100) * 0.44;
    const secondaryFrequency = 0.04 + (((seed >> 4) % 100) / 100) * 0.14;
    const phaseOffset = (((seed >> 8) % 1000) / 1000) * Math.PI * 2;

    const baseCandles = generateOrganicCandleSeries(asset, 5, 1500, asset.basePrice);
    const lastPrice = baseCandles.length > 0 ? baseCandles[baseCandles.length - 1].close : asset.basePrice;

    // Fast, responsive lazy-caching map: timeframes are initialized on-demand and then kept live
    const timeframeMap = new Map<number, Candle[]>();
    timeframeMap.set(5, baseCandles);

    masterStores.set(asset.symbol, {
      symbol: asset.symbol,
      category: asset.category,
      baseTicks: baseCandles,
      timeframeSeries: timeframeMap,
      lastPrice,
      prevPrice: lastPrice,
      momentum: 0,
      volatilityRegime: 1.0,
      tickCounter: (seed % 1000), // Staggered initial tick offset
      regime: initialRegime,
      regimeTicksRemaining: initialTicks,
      regimeIntensity: 0.7 + ((seed % 50) / 50) * 0.8,
      phaseOffset,
      primaryFrequency,
      secondaryFrequency,
      dynamicSupport: lastPrice - asset.volatility * 40,
      dynamicResistance: lastPrice + asset.volatility * 40,
      seed,
    });
  }
  return masterStores.get(asset.symbol)!;
}

/**
 * Access the existing market state or lazily initialize it using the canonical asset definition.
 * Guarantees that any view or tab querying an asset's market state receives a consistent,
 * synchronized live market price and regime without null/undefined desync.
 */
export function getAssetMarketState(symbol: string): AssetMarketState | undefined {
  if (!symbol) return undefined;

  // 1. Exact match in masterStores
  const exact = masterStores.get(symbol);
  if (exact) return exact;

  // 2. Normalized match in masterStores
  const canonical = normalizeAssetSymbol(symbol);
  const normalizedMatch = masterStores.get(canonical);
  if (normalizedMatch) return normalizedMatch;

  // 3. Resolve AssetInfo and pre-warm store so caller receives authentic state immediately
  const asset = findAssetBySymbol(symbol);
  if (asset) {
    return getOrCreateMasterHistory(asset);
  }

  return undefined;
}

/**
 * Clear the internal market stores cache (useful for testing and reset scenarios)
 */
export function resetAssetMarketState(symbol?: string): void {
  if (symbol) {
    const canonical = normalizeAssetSymbol(symbol);
    masterStores.delete(symbol);
    masterStores.delete(canonical);
  } else {
    masterStores.clear();
  }
}

/**
 * Generates the next organic real-time market tick with complete asset isolation.
 * One market's movement NEVER affects another.
 *
 * Includes High-Volatility Engine for 90% - 97% payout assets during candle expiry seconds.
 */
export function stepOrganicLiveTick(assetOrSymbol: AssetInfo | string): number {
  const asset = typeof assetOrSymbol === 'string' ? findAssetBySymbol(assetOrSymbol) : assetOrSymbol;
  const store = getOrCreateMasterHistory(asset);
  store.tickCounter += 1;
  store.prevPrice = store.lastPrice;

  const catParams = getCategoryParameters(asset.category);
  const minPip = Math.pow(10, -asset.pipDecimals);

  // 1. Advance the asset's individual regime counter
  store.regimeTicksRemaining -= 1;
  if (store.regimeTicksRemaining <= 0) {
    store.regime = transitionRegime(store.regime, Math.random, catParams.breakoutChance);
    store.regimeTicksRemaining =
      catParams.trendLengthMin +
      Math.floor(Math.random() * (catParams.trendLengthMax - catParams.trendLengthMin));
    store.regimeIntensity = 0.65 + Math.random() * 0.75;
  }

  // 2. Fresh independent runtime Gaussian shock N(0, 1)
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.max(1e-7, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Dynamic volatility clustering
  store.volatilityRegime = Math.max(
    0.55,
    Math.min(3.0, 0.86 * store.volatilityRegime + 0.14 * Math.abs(z))
  );

  // 3. Compute asset-isolated regime drift
  let regimeDrift = 0;
  if (store.regime === 'bullish_trend') {
    regimeDrift = 0.32 * store.regimeIntensity;
  } else if (store.regime === 'bearish_trend') {
    regimeDrift = -0.32 * store.regimeIntensity;
  } else if (store.regime === 'volatile_breakout') {
    const breakoutDir = Math.sin(store.phaseOffset + store.tickCounter * 0.05) >= 0 ? 1 : -1;
    regimeDrift = 0.65 * breakoutDir * store.regimeIntensity;
  } else if (store.regime === 'consolidation') {
    // Oscillate between dynamic support and resistance
    const mid = (store.dynamicSupport + store.dynamicResistance) / 2;
    const offset = (mid - store.lastPrice) / Math.max(minPip * 20, asset.volatility * 15);
    regimeDrift = Math.max(-0.25, Math.min(0.25, offset * 0.2));
  } else {
    // Mean reverting
    const distFromBase = (asset.basePrice - store.lastPrice) / Math.max(minPip * 30, asset.volatility * 200);
    regimeDrift = Math.max(-0.25, Math.min(0.25, distFromBase * 0.25));
  }

  // 4. Asset-unique harmonic oscillation using this asset's specific frequencies and phase
  const waveCycle =
    Math.sin(store.phaseOffset + store.tickCounter * store.primaryFrequency) * 0.22 +
    Math.cos(store.tickCounter * store.secondaryFrequency) * 0.11;

  // 5. Momentum inertia
  store.momentum = store.momentum * 0.72 + (regimeDrift + z * 0.4) * 0.28;

  let stepScale =
    asset.volatility *
    0.34 *
    catParams.volMultiplier *
    store.volatilityRegime;

  // ==========================================================================
  // HIGH-VOLATILITY ENGINE (90% - 97% Payouts)
  // During the final seconds of candle expiry (final 6 seconds),
  // introduce sharp, unpredictable price spikes and high volatility
  // so the final outcome remains intense and unpredictable.
  // ==========================================================================
  if (asset.payout >= 90) {
    const secInMinute = Math.floor(Date.now() / 1000) % 60;
    if (secInMinute >= 54) {
      stepScale *= 3.8;
      const sharpSpike = (Math.random() - 0.5) * asset.volatility * 5.2 * catParams.volMultiplier;
      const delta = (regimeDrift + waveCycle + z * 2.8 + sharpSpike) * stepScale;
      const nextPrice = Number(Math.max(minPip, store.lastPrice + delta).toFixed(asset.pipDecimals));
      appendLiveTick(asset, nextPrice);
      return nextPrice;
    }
  }

  const delta = (regimeDrift + waveCycle + store.momentum * 0.35 + z * 0.85) * stepScale;
  const nextPrice = Number(Math.max(minPip, store.lastPrice + delta).toFixed(asset.pipDecimals));

  // Update dynamic support and resistance envelope gradually
  if (nextPrice > store.dynamicResistance) {
    store.dynamicResistance = nextPrice + asset.volatility * 25;
    store.dynamicSupport = nextPrice - asset.volatility * 45;
  } else if (nextPrice < store.dynamicSupport) {
    store.dynamicSupport = nextPrice - asset.volatility * 25;
    store.dynamicResistance = nextPrice + asset.volatility * 45;
  }

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
  if (!candles || candles.length === 0) return;

  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const currentBucket = Math.floor(now / bucketMs) * bucketMs;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.28);
  const minWick = Math.max(minPip * 2, asset.volatility * 0.24 * tfMultiplier);

  const lastCandle = candles[candles.length - 1];

  if (lastCandle && lastCandle.time === currentBucket) {
    // Active candle within current timeframe bucket: update close, high, low, and volume
    lastCandle.close = newPrice;
    if (newPrice > lastCandle.high) {
      lastCandle.high = newPrice;
    }
    if (newPrice < lastCandle.low) {
      lastCandle.low = newPrice;
    }
    lastCandle.volume += 1;
  } else if (lastCandle && currentBucket > lastCandle.time) {
    // Current bucket is ahead: previous timeframe candle has closed.
    // Begin new candle with open === lastCandle.close for strict continuous price action
    const openPrice = lastCandle.close;
    const initialUpperWick = minWick * (0.35 + Math.random() * 0.45);
    const initialLowerWick = minWick * (0.35 + Math.random() * 0.45);

    const high = Math.max(openPrice, newPrice, openPrice + initialUpperWick);
    const low = Math.min(openPrice, newPrice, openPrice - initialLowerWick);

    candles.push({
      time: currentBucket,
      open: Number(openPrice.toFixed(asset.pipDecimals)),
      high: Number(high.toFixed(asset.pipDecimals)),
      low: Number(low.toFixed(asset.pipDecimals)),
      close: Number(newPrice.toFixed(asset.pipDecimals)),
      volume: 1,
    });

    if (candles.length > 5000) {
      candles.shift();
    }
  } else if (!lastCandle) {
    candles.push({
      time: currentBucket,
      open: newPrice,
      high: newPrice,
      low: newPrice,
      close: newPrice,
      volume: 1,
    });
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
  const rand = createSeededRandom(`${asset.symbol}:${tf}:past:${earliest.time}:${store.seed}`);

  const catParams = getCategoryParameters(asset.category);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.32);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const olderCandles: Candle[] = [];
  let currentTargetClose = earliest.open;
  let volCluster = 1.0;

  for (let i = 1; i <= chunkCount; i++) {
    const shock = Math.abs(gaussianRandom(rand));
    volCluster = Math.max(0.45, Math.min(2.5, 0.7 * volCluster + 0.3 * shock));
    const close = currentTargetClose;
    const candleSign = rand() > 0.49 ? 1 : -1;
    const bodyMagnitude = Math.max(
      minPip * 2,
      (0.25 + Math.abs(gaussianRandom(rand)) * 0.75) * unitVol * volCluster
    );
    const open = close - candleSign * bodyMagnitude;

    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = Math.max(minPip * 2, (0.35 + rand() * 0.95) * unitVol * volCluster);
    const lowerWick = Math.max(minPip * 2, (0.35 + rand() * 0.95) * unitVol * volCluster);

    const high = bodyMax + upperWick;
    const low = bodyMin - lowerWick;

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
