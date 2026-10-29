import { Candle, AssetInfo } from '../types';
import {
  findAssetBySymbol,
  normalizeAssetSymbol,
  saveAssetHistoryToStorage,
  loadAssetHistoryFromStorage,
} from './storage';
import { supabaseMarketSync } from './supabaseMarketSync';


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

// Global Anchor Epoch: Jan 1, 2024 00:00:00 UTC (1704067200000 ms)
const GLOBAL_EPOCH = 1704067200000;

/**
 * Fast 32-bit FNV-1a hash of asset symbol or string to derive deterministic seeds,
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
 * Get category-specific volatility and behavior multipliers tailored to each asset class.
 */
function getCategoryParameters(category: string, symbol: string = '') {
  const cat = (category || '').toLowerCase();
  const sym = (symbol || '').toLowerCase();

  const isVolatileFx =
    sym.includes('jpy') ||
    sym.includes('gbp') ||
    sym.includes('mxn') ||
    sym.includes('brl') ||
    sym.includes('try') ||
    sym.includes('zar');

  if (cat.includes('crypto')) {
    return {
      volMultiplier: 2.85,
      trendLengthMin: 20,
      trendLengthMax: 65,
      breakoutChance: 0.32,
      jumpChance: 0.08,
      wickMultiplier: 1.45,
      maxRunCandles: 7,
    };
  }
  if (cat.includes('commodit')) {
    return {
      volMultiplier: sym.includes('xau') || sym.includes('wti') || sym.includes('cocoa') ? 2.1 : 1.65,
      trendLengthMin: 30,
      trendLengthMax: 85,
      breakoutChance: 0.24,
      jumpChance: 0.06,
      wickMultiplier: 1.30,
      maxRunCandles: 6,
    };
  }
  if (cat.includes('stock')) {
    return {
      volMultiplier: sym.includes('tsla') || sym.includes('nvda') || sym.includes('mstr') || sym.includes('coin') ? 2.2 : 1.55,
      trendLengthMin: 25,
      trendLengthMax: 75,
      breakoutChance: 0.22,
      jumpChance: 0.05,
      wickMultiplier: 1.25,
      maxRunCandles: 5,
    };
  }
  // Default Forex
  return {
    volMultiplier: isVolatileFx ? 1.35 : 1.0,
    trendLengthMin: 30,
    trendLengthMax: 85,
    breakoutChance: 0.16,
    jumpChance: 0.03,
    wickMultiplier: 1.10,
    maxRunCandles: 5,
  };
}

/**
 * Select a new market regime based on current regime and deterministic PRNG
 */
function transitionRegime(
  currentRegime: MarketRegime,
  rand: () => number,
  breakoutChance: number
): MarketRegime {
  const r = rand();
  if (currentRegime === 'bullish_trend') {
    if (r < 0.55) return 'consolidation';
    if (r < 0.80) return 'bearish_trend';
    return 'mean_reverting';
  }
  if (currentRegime === 'bearish_trend') {
    if (r < 0.55) return 'consolidation';
    if (r < 0.80) return 'bullish_trend';
    return 'mean_reverting';
  }
  if (currentRegime === 'consolidation' || currentRegime === 'mean_reverting') {
    if (r < breakoutChance) return 'volatile_breakout';
    if (r < 0.55) return 'bullish_trend';
    return 'bearish_trend';
  }
  return r < 0.65 ? 'consolidation' : 'mean_reverting';
}

/**
 * Calculates the deterministic base price for macro block M.
 * Ensures long-term stability and smooth harmonic wave continuity across days and weeks.
 */
function getDeterministicBlockBasePrice(asset: AssetInfo, blockIndex: number): number {
  const symbolSeed = hashSymbol(asset.symbol);
  const catParams = getCategoryParameters(asset.category);

  // Asset-unique frequencies and phase angles
  const primaryFreq = 0.0012 + (symbolSeed % 500) * 0.000015;
  const secondaryFreq = 0.0003 + ((symbolSeed >> 4) % 500) * 0.000008;
  const phaseOffset = (((symbolSeed >> 8) % 1000) / 1000) * Math.PI * 2;

  const wave =
    Math.sin(phaseOffset + blockIndex * primaryFreq) * 0.06 +
    Math.cos(blockIndex * secondaryFreq) * 0.03;

  const blockHash = hashSymbol(`${asset.symbol}:blockDrift:${blockIndex}`);
  const rawDrift = ((blockHash % 10000) - 5000) / 5000;
  const maxDrift = asset.basePrice * (catParams.volMultiplier > 1.5 ? 0.08 : 0.03);

  const price = asset.basePrice * (1 + wave) + rawDrift * maxDrift;
  const minPip = Math.pow(10, -asset.pipDecimals);
  return Math.max(minPip * 10, Number(price.toFixed(asset.pipDecimals)));
}

/**
 * Calculates a deterministic time phase shift for an asset pair in milliseconds.
 * Ensures that candle boundaries for EUR/USD, GBP/USD, Crypto, Stocks, etc.
 * occur at different times on the clock for true asset independence.
 */
export function getAssetTimeOffsetMs(symbol: string, timeframeSeconds: number): number {
  const canonical = normalizeAssetSymbol(symbol);
  const hash = hashSymbol(canonical);
  const tfSeconds = Math.max(5, timeframeSeconds);
  const subSteps = Math.max(1, Math.floor(tfSeconds / 5));
  const stepIndex = (hash >> 3) % subSteps;
  return stepIndex * 5000;
}

/**
 * Deterministically generates a sequence of timeframe candles anchored to real-time UTC timestamps.
 * Guarantees that any device/tab at timestamp T produces identical prices and candles with strict open === prev.close continuity.
 */
function generateDeterministicTimeframeCandles(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 1500
): Candle[] {
  const tf = Math.max(5, timeframeSeconds);
  const tfMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(asset.symbol, tf);
  const nowMs = Date.now();
  const currentBucket = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;
  const startBucket = currentBucket - (count - 1) * tfMs;

  const catParams = getCategoryParameters(asset.category, asset.symbol);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.38);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const ticksPerBlock = Math.max(10, Math.floor(5000000 / tfMs));
  const result: Candle[] = new Array(count);

  let currentBlockIndex = Math.floor(Math.floor((startBucket - GLOBAL_EPOCH) / tfMs) / ticksPerBlock);
  let state = hashSymbol(`${asset.symbol}:${tf}:block:${currentBlockIndex}`) >>> 0;
  let currentPrice = getDeterministicBlockBasePrice(asset, currentBlockIndex);
  let volCluster = 1.0;

  const nextRandom = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const initialRegimes: MarketRegime[] = [
    'bullish_trend',
    'bearish_trend',
    'consolidation',
    'volatile_breakout',
    'mean_reverting',
  ];

  const blockSeed = hashSymbol(`${asset.symbol}:${tf}:regime:${currentBlockIndex}`);
  let currentRegime = initialRegimes[blockSeed % initialRegimes.length];
  let regimeTicksRemaining =
    catParams.trendLengthMin + (blockSeed % (catParams.trendLengthMax - catParams.trendLengthMin));
  let regimeIntensity = 0.65 + (((blockSeed >> 3) % 50) / 50) * 0.7;

  for (let idx = 0; idx < count; idx++) {
    const candleTime = startBucket + idx * tfMs;
    const bucketIdx = Math.floor((candleTime - GLOBAL_EPOCH) / tfMs);
    const blockIndex = Math.floor(bucketIdx / ticksPerBlock);

    if (blockIndex !== currentBlockIndex) {
      currentBlockIndex = blockIndex;
      state = hashSymbol(`${asset.symbol}:${tf}:block:${blockIndex}`) >>> 0;
      volCluster = 1.0;

      const newBlockSeed = hashSymbol(`${asset.symbol}:${tf}:regime:${blockIndex}`);
      currentRegime = initialRegimes[newBlockSeed % initialRegimes.length];
      regimeTicksRemaining =
        catParams.trendLengthMin + (newBlockSeed % (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.65 + (((newBlockSeed >> 3) % 50) / 50) * 0.7;
    }

    const open = currentPrice;
    regimeTicksRemaining--;
    if (regimeTicksRemaining <= 0) {
      currentRegime = transitionRegime(currentRegime, nextRandom, catParams.breakoutChance);
      regimeTicksRemaining =
        catParams.trendLengthMin + Math.floor(nextRandom() * (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.6 + nextRandom() * 0.8;
    }

    const u1 = Math.max(1e-7, nextRandom());
    const u2 = Math.max(1e-7, nextRandom());
    const shock = Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
    volCluster = Math.max(0.45, Math.min(2.8, 0.72 * volCluster + 0.28 * shock));

    let trendDrift = 0;
    if (currentRegime === 'bullish_trend') trendDrift = 0.28 * regimeIntensity;
    else if (currentRegime === 'bearish_trend') trendDrift = -0.28 * regimeIntensity;
    else if (currentRegime === 'volatile_breakout') trendDrift = (nextRandom() < 0.5 ? 1 : -1) * 0.5 * regimeIntensity;

    const dirProb = Math.max(0.1, Math.min(0.9, 0.5 + trendDrift));
    const sign = nextRandom() < dirProb ? 1 : -1;

    const u3 = Math.max(1e-7, nextRandom());
    const u4 = Math.max(1e-7, nextRandom());
    const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));

    // Jump-diffusion shock events for lively impulse candles
    const isJump = nextRandom() < catParams.jumpChance;
    const jumpBoost = isJump ? 1.8 + nextRandom() * 1.4 : 1.0;

    const bodyMag = Math.max(minPip * 3.5, (0.45 + shock2 * 0.85) * unitVol * volCluster * jumpBoost);
    const close = Math.max(minPip * 10, open + sign * bodyMag);

    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = Math.max(minPip * 3.0, catParams.wickMultiplier * unitVol * volCluster * (0.38 + nextRandom() * 0.88));
    const lowerWick = Math.max(minPip * 3.0, catParams.wickMultiplier * unitVol * volCluster * (0.38 + nextRandom() * 0.88));

    const high = Number((bodyMax + upperWick).toFixed(asset.pipDecimals));
    const low = Number((bodyMin - lowerWick).toFixed(asset.pipDecimals));

    result[idx] = {
      time: candleTime,
      open: Number(open.toFixed(asset.pipDecimals)),
      high,
      low,
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(45 + volCluster * 65 + nextRandom() * 110),
    };

    currentPrice = close;
  }

  return result;
}

/**
 * Creates or retrieves the isolated state machine for a specific asset pair.
 * Guarantees every asset pair has its own dedicated frequencies, regimes, and deterministic series.
 */
export function getOrCreateMasterHistory(asset: AssetInfo): AssetMarketState {
  const symbolKey = normalizeAssetSymbol(asset.symbol);

  if (!masterStores.has(symbolKey)) {
    const seed = hashSymbol(symbolKey);
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

    const primaryFrequency = 0.16 + ((seed % 100) / 100) * 0.44;
    const secondaryFrequency = 0.04 + (((seed >> 4) % 100) / 100) * 0.14;
    const phaseOffset = (((seed >> 8) % 1000) / 1000) * Math.PI * 2;

    const baseCandles = generateDeterministicTimeframeCandles(asset, 5, 1500);
    const lastPrice = baseCandles.length > 0 ? baseCandles[baseCandles.length - 1].close : asset.basePrice;

    const timeframeMap = new Map<number, Candle[]>();
    timeframeMap.set(5, baseCandles);

    const newState: AssetMarketState = {
      symbol: symbolKey,
      category: asset.category,
      baseTicks: baseCandles,
      timeframeSeries: timeframeMap,
      lastPrice,
      prevPrice: lastPrice,
      momentum: 0,
      volatilityRegime: 1.0,
      tickCounter: Math.floor((Date.now() - GLOBAL_EPOCH) / 5000),
      regime: initialRegime,
      regimeTicksRemaining: initialTicks,
      regimeIntensity: 0.7 + ((seed % 50) / 50) * 0.8,
      phaseOffset,
      primaryFrequency,
      secondaryFrequency,
      dynamicSupport: lastPrice - asset.volatility * 40,
      dynamicResistance: lastPrice + asset.volatility * 40,
      seed,
    };

    masterStores.set(symbolKey, newState);
    if (asset.symbol !== symbolKey) {
      masterStores.set(asset.symbol, newState);
    }
  }

  return masterStores.get(symbolKey)!;
}

/**
 * Access the existing market state or lazily initialize it using the canonical asset definition.
 */
export function getAssetMarketState(symbol: string): AssetMarketState | undefined {
  if (!symbol) return undefined;

  const exact = masterStores.get(symbol);
  if (exact) return exact;

  const canonical = normalizeAssetSymbol(symbol);
  const normalizedMatch = masterStores.get(canonical);
  if (normalizedMatch) return normalizedMatch;

  const asset = findAssetBySymbol(symbol);
  if (asset) {
    return getOrCreateMasterHistory(asset);
  }

  return undefined;
}

/**
 * Clear internal market stores
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
 * Advances live price deterministically based on real-time timestamp.
 */
export function stepOrganicLiveTick(assetOrSymbol: AssetInfo | string): number {
  const asset = typeof assetOrSymbol === 'string' ? findAssetBySymbol(assetOrSymbol) : assetOrSymbol;
  if (!asset) return 1.085;

  const store = getOrCreateMasterHistory(asset);
  store.tickCounter += 1;

  const nowMs = Date.now();
  const minPip = Math.pow(10, -asset.pipDecimals);
  const catParams = getCategoryParameters(asset.category, asset.symbol);

  // Derive stochastic noise via fast hash PRNG
  const tickHash = hashSymbol(`${asset.symbol}:liveTick:${nowMs}:${store.tickCounter}`);
  const u1 = Math.max(1e-7, (tickHash % 10000) / 10000);
  const u2 = Math.max(1e-7, ((tickHash >> 4) % 10000) / 10000);
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Dynamic regime drift
  let regimeDrift = 0;
  if (store.regime === 'bullish_trend') regimeDrift = 0.22 * store.regimeIntensity;
  else if (store.regime === 'bearish_trend') regimeDrift = -0.22 * store.regimeIntensity;
  else if (store.regime === 'volatile_breakout') regimeDrift = (z > 0 ? 0.38 : -0.38) * store.regimeIntensity;

  // Step momentum micro-walk for organic live price action
  store.momentum = store.momentum * 0.78 + z * asset.volatility * catParams.volMultiplier * 0.12;

  const unitVol = asset.volatility * catParams.volMultiplier * store.volatilityRegime;
  const deltaPrice = (regimeDrift * 0.15 + z * 0.85) * unitVol * 0.35 + store.momentum;

  let livePrice = store.lastPrice + deltaPrice;
  livePrice = Math.max(minPip * 10, Number(livePrice.toFixed(asset.pipDecimals)));

  store.prevPrice = store.lastPrice;
  store.lastPrice = livePrice;

  appendLiveTick(asset, livePrice);
  return livePrice;
}

/**
 * Appends live tick to all active timeframe candle series.
 */
export function appendLiveTick(asset: AssetInfo, newPrice: number): void {
  const store = getOrCreateMasterHistory(asset);
  const prevPrice = store.lastPrice;
  store.lastPrice = newPrice;
  const now = Date.now();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);
    saveAssetHistoryToStorage(asset.symbol, series, tfSeconds);
  });

  // Broadcast tick to Supabase Realtime channel
  supabaseMarketSync.broadcastTick({
    symbol: asset.symbol,
    price: newPrice,
    prevPrice,
    timestamp: now,
  });
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
  const offsetMs = getAssetTimeOffsetMs(asset.symbol, timeframeSeconds);
  const currentBucket = Math.floor((now + offsetMs) / bucketMs) * bucketMs - offsetMs;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const catParams = getCategoryParameters(asset.category, asset.symbol);
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.38);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;

  const lastCandle = candles[candles.length - 1];

  if (lastCandle && lastCandle.time === currentBucket) {
    lastCandle.close = newPrice;
    if (newPrice > lastCandle.high) lastCandle.high = newPrice;
    if (newPrice < lastCandle.low) lastCandle.low = newPrice;
    lastCandle.volume += 1;
  } else if (lastCandle && currentBucket > lastCandle.time) {
    const numBucketsPassed = Math.floor((currentBucket - lastCandle.time) / bucketMs);
    let prevClose = lastCandle.close;

    for (let b = 1; b <= numBucketsPassed; b++) {
      const bTime = lastCandle.time + b * bucketMs;
      const bOpen = prevClose;
      let bClose = b === numBucketsPassed ? newPrice : bOpen;

      if (b < numBucketsPassed) {
        // Organic Brownian step for missed intermediate buckets to prevent flat doji rows
        const hash = hashSymbol(`${asset.symbol}:${timeframeSeconds}:backfill:${bTime}`);
        const u1 = Math.max(1e-7, (hash % 10000) / 10000);
        const u2 = Math.max(1e-7, ((hash >> 5) % 10000) / 10000);
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const sign = (hash % 2 === 0) ? 1 : -1;
        const bodySize = Math.max(minPip * 3.0, Math.abs(z) * unitVol * 0.65);
        bClose = bOpen + sign * bodySize;
      }

      const bodyMax = Math.max(bOpen, bClose);
      const bodyMin = Math.min(bOpen, bClose);

      // Generate realistic upper and lower wicks proportional to volatility
      const wickHash = hashSymbol(`${asset.symbol}:wick:${bTime}`);
      const u3 = Math.max(1e-7, (wickHash % 10000) / 10000);
      const u4 = Math.max(1e-7, ((wickHash >> 3) % 10000) / 10000);
      const zUpper = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
      const zLower = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.sin(2.0 * Math.PI * u4));

      const upperWick = Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * (0.35 + zUpper * 0.55));
      const lowerWick = Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * (0.35 + zLower * 0.55));

      const bHigh = Number((bodyMax + upperWick).toFixed(asset.pipDecimals));
      const bLow = Number((bodyMin - lowerWick).toFixed(asset.pipDecimals));

      candles.push({
        time: bTime,
        open: Number(bOpen.toFixed(asset.pipDecimals)),
        high: Math.max(bHigh, Number(Math.max(bOpen, bClose).toFixed(asset.pipDecimals))),
        low: Math.min(bLow, Number(Math.min(bOpen, bClose).toFixed(asset.pipDecimals))),
        close: Number(bClose.toFixed(asset.pipDecimals)),
        volume: b === numBucketsPassed ? 1 : Math.floor(35 + Math.random() * 60),
      });

      prevClose = bClose;
    }

    if (candles.length > 5000) {
      candles.splice(0, candles.length - 5000);
    }
  }
}

/**
 * Aggregates or generates timeframe candles deterministically for any requested timeframe (5s..4h).
 */
export function aggregateCandlesForTimeframe(
  asset: AssetInfo,
  timeframeSeconds: number
): Candle[] {
  const store = getOrCreateMasterHistory(asset);
  const tf = Math.max(5, timeframeSeconds);
  const minPip = Math.pow(10, -asset.pipDecimals);
  const now = Date.now();

  let series = store.timeframeSeries.get(tf);

  if (!series) {
    const cached = loadAssetHistoryFromStorage(asset.symbol, tf);
    if (cached && cached.length > 0) {
      series = cached;
      store.timeframeSeries.set(tf, series);
    }
  }

  if (!series || series.length === 0) {
    series = generateDeterministicTimeframeCandles(asset, tf, 1500);
    store.timeframeSeries.set(tf, series);
  }

  // Synchronize candle series with current timestamp
  updateCandleArrayWithTick(series, asset, tf, store.lastPrice, now);

  if (series.length > 0) {
    const activeCandle = series[series.length - 1];
    activeCandle.close = store.lastPrice;
    const bodyMax = Math.max(activeCandle.open, activeCandle.close);
    const bodyMin = Math.min(activeCandle.open, activeCandle.close);
    activeCandle.high = Number(Math.max(activeCandle.high, bodyMax + minPip * 2.5).toFixed(asset.pipDecimals));
    activeCandle.low = Number(Math.min(activeCandle.low, bodyMin - minPip * 2.5).toFixed(asset.pipDecimals));
  }

  store.timeframeSeries.set(tf, series);
  saveAssetHistoryToStorage(asset.symbol, series, tf);
  return [...series];
}

export function prependHistoricalCandles(
  asset: AssetInfo,
  timeframeSeconds: number,
  chunkCount: number = 500
): Candle[] {
  const store = getOrCreateMasterHistory(asset);
  const tf = Math.max(5, timeframeSeconds);

  const existing = store.timeframeSeries.get(tf) || aggregateCandlesForTimeframe(asset, tf);
  if (existing.length >= 5000 || existing.length === 0) {
    return existing;
  }

  const earliest = existing[0];
  const bucketMs = tf * 1000;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const catParams = getCategoryParameters(asset.category);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.32);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;

  const olderCandles: Candle[] = new Array(chunkCount);
  let currentTargetClose = earliest.open;

  const seed = hashSymbol(`${asset.symbol}:${tf}:prepend:${earliest.time}:${store.seed}`);
  let state = seed >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let volCluster = 1.0;

  for (let i = chunkCount - 1; i >= 0; i--) {
    const candleTime = earliest.time - (chunkCount - i) * bucketMs;
    const u1 = Math.max(1e-7, rand());
    const u2 = Math.max(1e-7, rand());
    const shock = Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
    volCluster = Math.max(0.45, Math.min(2.5, 0.7 * volCluster + 0.3 * shock));

    const close = currentTargetClose;
    const candleSign = rand() > 0.49 ? 1 : -1;

    const u3 = Math.max(1e-7, rand());
    const u4 = Math.max(1e-7, rand());
    const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
    const bodyMagnitude = Math.max(minPip * 2, (0.25 + shock2 * 0.75) * unitVol * volCluster);
    const open = Math.max(minPip * 10, close - candleSign * bodyMagnitude);

    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = Math.max(minPip * 2.5, (0.35 + rand() * 0.95) * unitVol * volCluster);
    const lowerWick = Math.max(minPip * 2.5, (0.35 + rand() * 0.95) * unitVol * volCluster);

    const high = Number((bodyMax + upperWick).toFixed(asset.pipDecimals));
    const low = Number((bodyMin - lowerWick).toFixed(asset.pipDecimals));

    olderCandles[i] = {
      time: candleTime,
      open: Number(open.toFixed(asset.pipDecimals)),
      high,
      low,
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(50 + volCluster * 80 + rand() * 120),
    };

    currentTargetClose = open;
  }

  const combined = [...olderCandles, ...existing];
  store.timeframeSeries.set(tf, combined);
  return combined;
}
