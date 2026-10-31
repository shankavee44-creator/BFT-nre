import type { Candle, AssetInfo } from '../types/index.ts';
import {
  findAssetBySymbol,
  normalizeAssetSymbol,
  saveAssetHistoryToStorage,
  loadAssetHistoryFromStorage,
  loadSelectedAssetSymbol,
} from './storage.ts';

// Listener pattern to break circular dependency with supabaseMarketSync
type BroadcastCallback = (payload: { symbol: string; price: number; prevPrice: number; timestamp: number }) => void;
let broadcastListener: BroadcastCallback | null = null;

export function setMarketBroadcastListener(callback: BroadcastCallback) {
  broadcastListener = callback;
}


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
 * Fast 32-bit FNV-1a hash of asset symbol or string to derive deterministic seeds.
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
 */
function getDeterministicBlockBasePrice(asset: AssetInfo, blockIndex: number): number {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const symbolSeed = hashSymbol(canonical);
  const catParams = getCategoryParameters(asset.category, canonical);

  const primaryFreq = 0.0012 + (symbolSeed % 500) * 0.000015;
  const secondaryFreq = 0.0003 + ((symbolSeed >>> 4) % 500) * 0.000008;
  const phaseOffset = (((symbolSeed >>> 8) % 1000) / 1000) * Math.PI * 2;

  const wave =
    Math.sin(phaseOffset + blockIndex * primaryFreq) * 0.0025 +
    Math.cos(blockIndex * secondaryFreq) * 0.0012;

  const blockHash = hashSymbol(`${canonical}:blockDrift:${blockIndex}`);
  const rawDrift = ((blockHash % 10000) - 5000) / 5000;
  const maxDrift = asset.basePrice * (catParams.volMultiplier > 1.5 ? 0.003 : 0.0015);

  const price = asset.basePrice * (1 + wave) + rawDrift * maxDrift;
  const minPip = Math.pow(10, -asset.pipDecimals);
  return Math.max(minPip * 10, Number(price.toFixed(asset.pipDecimals)));
}

/**
 * Calculates a deterministic time phase shift for an asset pair in milliseconds.
 */
export function getAssetTimeOffsetMs(symbol: string, timeframeSeconds: number): number {
  const canonical = normalizeAssetSymbol(symbol);
  const hash = hashSymbol(canonical);
  const tfSeconds = Math.max(5, timeframeSeconds);
  const subSteps = Math.max(1, Math.floor(tfSeconds / 5));
  const stepIndex = (hash >>> 3) % subSteps;
  return stepIndex * 5000;
}

/**
 * Internal state for the deterministic PRNG to avoid constant re-hashing
 */
interface PRNGState {
  state: number;
}

function createPRNG(seed: number): PRNGState {
  return { state: seed >>> 0 };
}

function nextRandom(prng: PRNGState): number {
  prng.state = (prng.state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(prng.state ^ (prng.state >>> 15), 1 | prng.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Deterministically computes the exact synchronized market tick and active 5s candle at timestamp `nowMs`.
 * Uses a continuous multi-harmonic trajectory anchored to `asset.basePrice` so there are zero
 * block-boundary price jumps at any point in time across server and client tabs.
 */
export function computeSynchronizedTickAtTime(
  asset: AssetInfo,
  nowMs: number = Date.now()
): { price: number; open: number; high: number; low: number; close: number; bucketTime: number } {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = 5;
  const tfMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(canonical, tf);
  const currentBucketTime = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;

  const catParams = getCategoryParameters(asset.category, canonical);
  const unitVol = asset.volatility * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const symSeed = hashSymbol(canonical);

  // Continuous, smooth multi-harmonic price function evaluated at any timestamp tMs
  const evalContinuousPriceAt = (tMs: number): number => {
    const tSec = (tMs - GLOBAL_EPOCH) / 1000;
    const p1 = ((symSeed & 0xff) / 255) * Math.PI * 2;
    const p2 = (((symSeed >>> 8) & 0xff) / 255) * Math.PI * 2;
    const p3 = (((symSeed >>> 16) & 0xff) / 255) * Math.PI * 2;
    const p4 = (((symSeed >>> 24) & 0xff) / 255) * Math.PI * 2;

    const f1 = 0.00045 + (symSeed % 17) * 0.00002;
    const f2 = 0.00165 + ((symSeed >>> 4) % 19) * 0.00005;
    const f3 = 0.0058 + ((symSeed >>> 9) % 23) * 0.00015;
    const f4 = 0.019 + ((symSeed >>> 14) % 29) * 0.0004;
    const f5 = 0.067 + ((symSeed >>> 19) % 31) * 0.0012;

    const waveUnits =
      Math.sin(tSec * f1 + p1) * 7.5 +
      Math.cos(tSec * f2 + p2) * 4.2 +
      Math.sin(tSec * f3 + p3) * 2.4 +
      Math.cos(tSec * f4 + p4) * 1.25 +
      Math.sin(tSec * f5 + p1 + p3) * 0.65;

    const rawPrice = asset.basePrice + waveUnits * unitVol;
    return Number(Math.max(minPip * 10, rawPrice).toFixed(asset.pipDecimals));
  };

  const open = evalContinuousPriceAt(currentBucketTime);
  const targetClose = evalContinuousPriceAt(currentBucketTime + tfMs);

  const elapsedMs = ((nowMs + offsetMs) % tfMs + tfMs) % tfMs;
  const progress = Math.max(0, Math.min(1, elapsedMs / tfMs));

  const subStep = Math.floor(nowMs / 250);
  const pulseHash = hashSymbol(`${canonical}:subtick:${subStep}`);
  const pulseNorm = ((pulseHash % 2000) - 1000) / 1000; // [-1, 1]
  const envelope = Math.sin(progress * Math.PI);
  const intraWave = pulseNorm * unitVol * 0.35 * envelope;

  const rawLivePrice = open + (targetClose - open) * progress + intraWave;
  const livePrice = Number(Math.max(minPip * 10, rawLivePrice).toFixed(asset.pipDecimals));

  const wickHash = hashSymbol(`${canonical}:wick5s:${currentBucketTime}`);
  const upperWick = Math.max(minPip * 2, ((wickHash % 100) / 100) * unitVol * 0.65 * progress);
  const lowerWick = Math.max(minPip * 2, (((wickHash >>> 8) % 100) / 100) * unitVol * 0.65 * progress);

  const bodyMax = Math.max(open, livePrice);
  const bodyMin = Math.min(open, livePrice);

  return {
    price: livePrice,
    open,
    high: Number((bodyMax + upperWick).toFixed(asset.pipDecimals)),
    low: Number(Math.max(minPip * 5, bodyMin - lowerWick).toFixed(asset.pipDecimals)),
    close: livePrice,
    bucketTime: currentBucketTime,
  };
}

/**
 * Deterministically generates a sequence of timeframe candles anchored to a global UTC timeline.
 * Ensures that any user joining at any time sees the exact same historical and live candles,
 * with bounded candle bodies/wicks and smooth alignment to `anchorEndPrice`.
 */
function generateDeterministicTimeframeCandles(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 1500,
  anchorEndPrice?: number
): Candle[] {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = Math.max(5, timeframeSeconds);
  const tfMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(canonical, tf);
  const nowMs = Date.now();

  const currentBucketTime = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;
  const startBucketTime = currentBucketTime - (count - 1) * tfMs;

  const catParams = getCategoryParameters(asset.category, canonical);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.38);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const candlesPerBlock = 500;
  const result: Candle[] = new Array(count);

  let currentBlockIndex = -1;
  let prng = createPRNG(0);
  let currentPrice = asset.basePrice;
  let volCluster = 1.0;
  let currentRegime: MarketRegime = 'consolidation';
  let regimeTicksRemaining = 0;
  let regimeIntensity = 1.0;

  const initialRegimes: MarketRegime[] = [
    'bullish_trend',
    'bearish_trend',
    'consolidation',
    'volatile_breakout',
    'mean_reverting',
  ];

  // Bound maximum deviation from basePrice to ±22 * unitVol so 120-candle window is always well-scaled
  const maxAllowedDev = Math.max(minPip * 60, unitVol * 22);

  for (let i = 0; i < count; i++) {
    const candleTime = startBucketTime + i * tfMs;
    const bucketIdx = Math.floor((candleTime - GLOBAL_EPOCH) / tfMs);
    const blockIndex = Math.floor(bucketIdx / candlesPerBlock);
    const indexInBlock = ((bucketIdx % candlesPerBlock) + candlesPerBlock) % candlesPerBlock;

    if (blockIndex !== currentBlockIndex) {
      currentBlockIndex = blockIndex;
      const blockSeed = hashSymbol(`${canonical}:${tf}:block:${blockIndex}`);
      prng = createPRNG(blockSeed);
      volCluster = 1.0;

      const regimeSeed = hashSymbol(`${canonical}:${tf}:regime:${blockIndex}`);
      currentRegime = initialRegimes[regimeSeed % initialRegimes.length];
      regimeTicksRemaining =
        catParams.trendLengthMin + (regimeSeed % (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.65 + (((regimeSeed >> 3) % 50) / 50) * 0.7;

      if (i === 0) {
        currentPrice = asset.basePrice;
        for (let j = 0; j < indexInBlock; j++) {
          const u1 = Math.max(1e-7, nextRandom(prng));
          const u2 = Math.max(1e-7, nextRandom(prng));
          const shock = Math.min(2.2, Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)));
          volCluster = Math.max(0.55, Math.min(1.85, 0.75 * volCluster + 0.25 * shock));

          regimeTicksRemaining--;
          if (regimeTicksRemaining <= 0) {
            currentRegime = transitionRegime(currentRegime, () => nextRandom(prng), catParams.breakoutChance);
            regimeTicksRemaining =
              catParams.trendLengthMin +
              Math.floor(nextRandom(prng) * (catParams.trendLengthMax - catParams.trendLengthMin));
            regimeIntensity = 0.6 + nextRandom(prng) * 0.65;
          }

          let trendDrift = 0;
          if (currentRegime === 'bullish_trend') trendDrift = 0.22 * regimeIntensity;
          else if (currentRegime === 'bearish_trend') trendDrift = -0.22 * regimeIntensity;
          else if (currentRegime === 'volatile_breakout')
            trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.35 * regimeIntensity;

          const devRatio = (currentPrice - asset.basePrice) / maxAllowedDev;
          const meanRevertPull = Math.max(-0.45, Math.min(0.45, -devRatio * 0.55));
          const dirProb = Math.max(0.12, Math.min(0.88, 0.5 + trendDrift + meanRevertPull));
          const sign = nextRandom(prng) < dirProb ? 1 : -1;
          const u3 = Math.max(1e-7, nextRandom(prng));
          const u4 = Math.max(1e-7, nextRandom(prng));
          const shock2 = Math.min(2.0, Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4)));
          const bodyMag = Math.min(
            unitVol * 2.4,
            Math.max(minPip * 3.0, (0.45 + shock2 * 0.65) * unitVol * volCluster)
          );

          currentPrice = Number(Math.max(minPip * 10, currentPrice + sign * bodyMag).toFixed(asset.pipDecimals));
        }
      }
    }

    const open = Number(currentPrice.toFixed(asset.pipDecimals));
    const u1 = Math.max(1e-7, nextRandom(prng));
    const u2 = Math.max(1e-7, nextRandom(prng));
    const shock = Math.min(2.2, Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)));
    volCluster = Math.max(0.55, Math.min(1.85, 0.75 * volCluster + 0.25 * shock));

    regimeTicksRemaining--;
    if (regimeTicksRemaining <= 0) {
      currentRegime = transitionRegime(currentRegime, () => nextRandom(prng), catParams.breakoutChance);
      regimeTicksRemaining =
        catParams.trendLengthMin +
        Math.floor(nextRandom(prng) * (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.6 + nextRandom(prng) * 0.65;
    }

    let trendDrift = 0;
    if (currentRegime === 'bullish_trend') trendDrift = 0.22 * regimeIntensity;
    else if (currentRegime === 'bearish_trend') trendDrift = -0.22 * regimeIntensity;
    else if (currentRegime === 'volatile_breakout')
      trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.35 * regimeIntensity;

    const devRatio = (open - asset.basePrice) / maxAllowedDev;
    const meanRevertPull = Math.max(-0.45, Math.min(0.45, -devRatio * 0.55));
    const dirProb = Math.max(0.12, Math.min(0.88, 0.5 + trendDrift + meanRevertPull));
    const sign = nextRandom(prng) < dirProb ? 1 : -1;
    const u3 = Math.max(1e-7, nextRandom(prng));
    const u4 = Math.max(1e-7, nextRandom(prng));
    const shock2 = Math.min(2.0, Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4)));
    const bodyMag = Math.min(
      unitVol * 2.4,
      Math.max(minPip * 3.0, (0.45 + shock2 * 0.65) * unitVol * volCluster)
    );

    const close = Number(Math.max(minPip * 10, open + sign * bodyMag).toFixed(asset.pipDecimals));
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = Math.min(
      unitVol * 1.6,
      Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * volCluster * (0.3 + nextRandom(prng) * 0.65))
    );
    const lowerWick = Math.min(
      unitVol * 1.6,
      Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * volCluster * (0.3 + nextRandom(prng) * 0.65))
    );

    result[i] = {
      time: candleTime,
      open,
      high: Number((bodyMax + upperWick).toFixed(asset.pipDecimals)),
      low: Number(Math.max(minPip * 5, bodyMin - lowerWick).toFixed(asset.pipDecimals)),
      close,
      volume: Math.floor(45 + volCluster * 65 + nextRandom(prng) * 110),
    };

    currentPrice = close;
  }

  // Align the entire series smoothly for ALL timeframes (including 5s) so the last candle's close matches anchorEndPrice
  const targetEndPrice =
    typeof anchorEndPrice === 'number' && anchorEndPrice > 0
      ? anchorEndPrice
      : computeSynchronizedTickAtTime(asset, nowMs).price;

  if (result.length > 0 && targetEndPrice > 0) {
    const lastCandle = result[result.length - 1];
    const diff = Number((targetEndPrice - lastCandle.close).toFixed(asset.pipDecimals));
    if (Math.abs(diff) > 0) {
      for (let i = 0; i < result.length; i++) {
        const c = result[i];
        c.open = Number(Math.max(minPip * 5, c.open + diff).toFixed(asset.pipDecimals));
        c.high = Number(Math.max(minPip * 5, c.high + diff).toFixed(asset.pipDecimals));
        c.low = Number(Math.max(minPip * 5, c.low + diff).toFixed(asset.pipDecimals));
        c.close = Number(Math.max(minPip * 5, c.close + diff).toFixed(asset.pipDecimals));
      }
    }
  }

  return result;
}

/**
 * Creates or retrieves the isolated state machine for a specific asset pair.
 */
export function getOrCreateMasterHistory(asset: AssetInfo): AssetMarketState {
  const symbolKey = normalizeAssetSymbol(asset.symbol);

  if (!masterStores.has(symbolKey)) {
    const seed = hashSymbol(symbolKey);
    const catParams = getCategoryParameters(asset.category, symbolKey);

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

    const initNow = Date.now();
    const liveSnap = computeSynchronizedTickAtTime(asset, initNow);
    const baseCandles = generateDeterministicTimeframeCandles(asset, 5, 1500, liveSnap.price);
    lastSteppedTimeBySymbol.set(symbolKey, initNow);
    const lastPrice = liveSnap.price;

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

  const existingStore = masterStores.get(symbolKey)!;
  if (!isValidPriceForAsset(asset, existingStore.lastPrice)) {
    const snap = computeSynchronizedTickAtTime(asset, Date.now());
    existingStore.lastPrice = snap.price;
    existingStore.prevPrice = snap.price;
    existingStore.timeframeSeries.clear();
  }

  return existingStore;
}

/**
 * Validates that a price belongs strictly to the expected price scale of the given asset
 * (prevents cross-asset tick contamination between pairs like EUR/USD 1.08, GBP/USD 1.29, GBP/JPY 199.32, or 3.03).
 */
export function isValidPriceForAsset(asset: AssetInfo, price: number): boolean {
  if (!asset || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return false;
  const base = Number(asset.basePrice) || 0;
  if (base <= 0) return price > 0;
  return price >= base * 0.88 && price <= base * 1.12;
}

/**
 * Validates that a candle series matches the expected price scale of the active asset and contains no flat/corrupted scale jumps.
 */
export function validateCandlesForAsset(asset: AssetInfo, candles: Candle[]): boolean {
  if (!candles || candles.length === 0) return false;
  const first = candles[0];
  const mid = candles[Math.floor(candles.length / 2)];
  const last = candles[candles.length - 1];
  if (
    !isValidPriceForAsset(asset, first.close) ||
    !isValidPriceForAsset(asset, mid.close) ||
    !isValidPriceForAsset(asset, last.close) ||
    !isValidPriceForAsset(asset, last.open)
  ) {
    return false;
  }

  // Also check recent window to ensure no mixed-asset outlier bars or single-candle scale spikes exist
  const checkStart = Math.max(0, candles.length - 120);
  const windowCount = candles.length - checkStart;
  let minLow = Infinity;
  let maxHigh = -Infinity;
  let sumBarRange = 0;
  let maxBarRange = 0;

  for (let i = checkStart; i < candles.length; i++) {
    const c = candles[i];
    if (!c || !isValidPriceForAsset(asset, c.close)) return false;
    if (c.low < minLow) minLow = c.low;
    if (c.high > maxHigh) maxHigh = c.high;
    const barRange = Math.max(0, c.high - c.low);
    sumBarRange += barRange;
    if (barRange > maxBarRange) maxBarRange = barRange;
  }
  if (minLow <= 0 || maxHigh / minLow > 1.15) {
    return false;
  }
  const avgBarRange = windowCount > 0 ? sumBarRange / windowCount : 0;
  if (windowCount >= 10 && avgBarRange > 0 && maxBarRange > avgBarRange * 8.5) {
    return false;
  }
  return true;
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
    lastSteppedTimeBySymbol.delete(symbol);
    lastSteppedTimeBySymbol.delete(canonical);
  } else {
    masterStores.clear();
    lastSteppedTimeBySymbol.clear();
  }
}

export interface ActiveTradeExposure {
  id?: string;
  direction: 'CALL' | 'PUT';
  strikePrice: number;
  startTime: number;
  endTime: number;
  investment?: number;
}

export interface LiveTickOptions {
  timeframeSeconds?: number;
  activeTrades?: ActiveTradeExposure[];
  nowMs?: number;
}

export interface CandleCloseDynamics {
  progress: number;
  remainingMs: number;
  isTighteningPhase: boolean;
  isLastSecondSpike: boolean;
  volatilityMultiplier: number;
  microBurstImpulse: number;
}

export interface RiskManagementAdjustment {
  priceOffset: number;
  probabilityBias: number;
  strikeTightening: number;
}

/**
 * Computes realistic candle-expiration dynamics.
 */
export function calculateCandleCloseDynamics(
  symbol: string,
  timeframeSeconds: number = 5,
  nowMs: number = Date.now()
): CandleCloseDynamics {
  const tf = Math.max(5, timeframeSeconds);
  const bucketMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(symbol, tf);
  const elapsedInBucketMs = ((nowMs + offsetMs) % bucketMs + bucketMs) % bucketMs;
  const remainingMs = bucketMs - elapsedInBucketMs;
  const progress = elapsedInBucketMs / bucketMs;

  const isTighteningPhase = progress >= 0.65 && progress < 0.82;
  const spikeWindowMs = Math.min(4000, Math.max(1200, bucketMs * 0.18));
  const isLastSecondSpike = remainingMs <= spikeWindowMs;
  const isChaosPhase = remainingMs <= 800;

  let volatilityMultiplier = 1.0;
  let microBurstImpulse = 0;

  if (isTighteningPhase) {
    const tightenDepth = Math.sin(((progress - 0.65) / 0.17) * Math.PI);
    volatilityMultiplier = 1.0 - tightenDepth * 0.22;
  } else if (isLastSecondSpike) {
    const spikeProgress = Math.min(1, Math.max(0, 1 - remainingMs / spikeWindowMs));
    volatilityMultiplier = 1.25 + spikeProgress * 0.85;
    
    if (isChaosPhase) {
      volatilityMultiplier *= 1.45;
    }

    const subSecBucket = Math.floor(nowMs / 120);
    const burstHash = hashSymbol(`${normalizeAssetSymbol(symbol)}:closeBurst:${subSecBucket}`);
    const burstSign = (burstHash % 3 === 0) ? 0 : (burstHash % 2 === 0 ? 1 : -1);
    const burstStrength = ((burstHash >>> 4) % 1000) / 1000;
    microBurstImpulse = burstSign * (0.25 + burstStrength * 0.95) * (spikeProgress + (isChaosPhase ? 0.5 : 0));
  }

  return {
    progress,
    remainingMs,
    isTighteningPhase,
    isLastSecondSpike,
    volatilityMultiplier,
    microBurstImpulse,
  };
}

/**
 * Computes a subtle risk-management adjustment.
 */
export function calculateRiskManagementOffset(params: {
  asset: AssetInfo;
  currentPrice: number;
  unitVol: number;
  activeTrades?: ActiveTradeExposure[];
  nowMs?: number;
  tickCounter?: number;
}): RiskManagementAdjustment {
  const { asset, currentPrice, unitVol, activeTrades, nowMs = Date.now(), tickCounter = 0 } = params;
  if (!activeTrades || activeTrades.length === 0 || unitVol <= 0) {
    return { priceOffset: 0, probabilityBias: 0, strikeTightening: 1.0 };
  }

  const openTrades = activeTrades.filter((t) => t.endTime > nowMs);
  if (openTrades.length === 0) {
    return { priceOffset: 0, probabilityBias: 0, strikeTightening: 1.0 };
  }

  const minPip = Math.pow(10, -asset.pipDecimals);
  let netWeightedExposure = 0; 
  let totalWeight = 0;
  let nearestStrikeDistanceVol = Infinity;
  let nearestStrikePrice = currentPrice;
  let maxUrgency = 0;

  for (const trade of openTrades) {
    const durationMs = Math.max(3000, trade.endTime - trade.startTime);
    const remainingMs = Math.max(0, trade.endTime - nowMs);
    const elapsedRatio = Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
    const urgency = elapsedRatio < 0.4 ? 0.25 : 0.25 + Math.pow((elapsedRatio - 0.4) / 0.6, 1.35) * 0.75;
    if (urgency > maxUrgency) maxUrgency = urgency;

    const stakeWeight = Math.log10(Math.max(10, trade.investment || 10));
    const dirSign = trade.direction === 'CALL' ? 1 : -1;
    const priceDiff = currentPrice - trade.strikePrice;
    const isCurrentlyWinning = (dirSign === 1 && priceDiff > 0) || (dirSign === -1 && priceDiff < 0);
    const distVol = Math.abs(priceDiff) / Math.max(minPip, unitVol);

    if (distVol < nearestStrikeDistanceVol) {
      nearestStrikeDistanceVol = distVol;
      nearestStrikePrice = trade.strikePrice;
    }

    const contestFactor = distVol < 3.5 ? 1.25 : isCurrentlyWinning ? 1.0 : 0.45;
    const weight = stakeWeight * urgency * contestFactor;
    netWeightedExposure += dirSign * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return { priceOffset: 0, probabilityBias: 0, strikeTightening: 1.0 };
  }

  const normalizedImbalance = Math.max(-1, Math.min(1, netWeightedExposure / totalWeight));
  const strikeTightening = nearestStrikeDistanceVol < 2.2 ? 0.82 + (nearestStrikeDistanceVol / 2.2) * 0.14 : 1.0;
  const gateHash = hashSymbol(`${asset.symbol}:riskGate:${Math.floor(nowMs / 1000)}:${tickCounter}`);
  const gateRoll = (gateHash % 1000) / 1000;
  const activeGate = gateRoll < 0.62 ? 1.0 : -0.18;
  const probabilityBias = -normalizedImbalance * maxUrgency * 0.18 * activeGate;

  let strikePull = 0;
  if (nearestStrikeDistanceVol > 0.05 && nearestStrikeDistanceVol < 2.8 && maxUrgency > 0.5) {
    const pullSign = nearestStrikePrice > currentPrice ? 1 : -1;
    strikePull = pullSign * unitVol * 0.055 * maxUrgency;
  }

  const rawOffset = probabilityBias * unitVol + strikePull;
  const maxAllowedOffset = unitVol * 0.22;
  const priceOffset = Math.max(-maxAllowedOffset, Math.min(maxAllowedOffset, rawOffset));

  return { priceOffset, probabilityBias, strikeTightening };
}

const lastSteppedTimeBySymbol: Map<string, number> = new Map();

/**
 * Advances live price deterministically based on absolute UTC time across all 268+ synchronized assets.
 */
export function stepOrganicLiveTick(
  assetOrSymbol: AssetInfo | string,
  options?: LiveTickOptions
): number {
  const asset = typeof assetOrSymbol === 'string' ? findAssetBySymbol(assetOrSymbol) : assetOrSymbol;
  if (!asset) return 1.085;

  const store = getOrCreateMasterHistory(asset);
  store.tickCounter += 1;

  let nowMs: number;
  if (typeof options?.nowMs === 'number') {
    nowMs = options.nowMs;
  } else {
    const rawNow = Date.now();
    const prevNow = lastSteppedTimeBySymbol.get(store.symbol) || 0;
    nowMs = rawNow < prevNow + 250 ? prevNow + 250 : rawNow;
    lastSteppedTimeBySymbol.set(store.symbol, nowMs);
  }

  const snap = computeSynchronizedTickAtTime(asset, nowMs);
  appendLiveTick(asset, snap.price, true);
  return snap.price;
}

const lastStorageSaveBySymbolTf: Map<string, number> = new Map();
const STORAGE_SAVE_THROTTLE_MS = 10000;

/**
 * Appends live tick to all active timeframe candle series.
 */
export function appendLiveTick(asset: AssetInfo, newPrice: number, skipBroadcast = false): void {
  if (!isValidPriceForAsset(asset, newPrice)) {
    return;
  }
  const store = getOrCreateMasterHistory(asset);
  const prevPrice = store.lastPrice;
  store.prevPrice = prevPrice;
  store.lastPrice = newPrice;
  const now = Date.now();
  const activeSym = loadSelectedAssetSymbol();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);

    // Throttle expensive localStorage JSON serialization to once every 10s for the active asset
    if (asset.symbol === activeSym) {
      const storageKey = `${asset.symbol}:${tfSeconds}`;
      const lastSaved = lastStorageSaveBySymbolTf.get(storageKey) || 0;
      if (now - lastSaved >= STORAGE_SAVE_THROTTLE_MS) {
        lastStorageSaveBySymbolTf.set(storageKey, now);
        saveAssetHistoryToStorage(asset.symbol, series, tfSeconds);
      }
    }
  });

  if (!skipBroadcast && broadcastListener) {
    broadcastListener({
      symbol: asset.symbol,
      price: newPrice,
      prevPrice,
      timestamp: now,
    });
  }
}

function updateCandleArrayWithTick(
  candles: Candle[],
  asset: AssetInfo,
  timeframeSeconds: number,
  newPrice: number,
  now: number
): void {
  if (!candles) return;
  if (Number.isNaN(newPrice)) return;

  const bucketMs = Math.max(5, timeframeSeconds) * 1000;
  const offsetMs = getAssetTimeOffsetMs(asset.symbol, timeframeSeconds);
  const currentBucket = Math.floor((now + offsetMs) / bucketMs) * bucketMs - offsetMs;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const catParams = getCategoryParameters(asset.category, asset.symbol);
  const tfMultiplier = Math.pow(Math.max(1, timeframeSeconds / 5), 0.38);
  const unitVol = Math.max(minPip * 2, asset.volatility * tfMultiplier * catParams.volMultiplier);

  if (candles.length === 0) {
    candles.push({
      time: currentBucket,
      open: newPrice,
      high: newPrice,
      low: newPrice,
      close: newPrice,
      volume: 1,
    });
    return;
  }

  const lastCandle = candles[candles.length - 1];

  // If newPrice diverged from lastCandle.close (e.g. after background tab pause or external snapshot),
  // shift the series smoothly so the active candle never stretches into an outlier spike
  if (lastCandle && Math.abs(newPrice - lastCandle.close) > unitVol * 3.0) {
    const shift = Number((newPrice - lastCandle.close).toFixed(asset.pipDecimals));
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      c.open = Number(Math.max(minPip * 5, c.open + shift).toFixed(asset.pipDecimals));
      c.high = Number(Math.max(minPip * 5, c.high + shift).toFixed(asset.pipDecimals));
      c.low = Number(Math.max(minPip * 5, c.low + shift).toFixed(asset.pipDecimals));
      c.close = Number(Math.max(minPip * 5, c.close + shift).toFixed(asset.pipDecimals));
    }
  }

  if (lastCandle && lastCandle.time === currentBucket) {
    lastCandle.close = newPrice;
    if (newPrice > lastCandle.high) lastCandle.high = newPrice;
    if (newPrice < lastCandle.low) lastCandle.low = newPrice;
    lastCandle.volume += 1;
  } else if (lastCandle && currentBucket > lastCandle.time) {
    const numBucketsPassed = Math.min(200, Math.floor((currentBucket - lastCandle.time) / bucketMs));
    let prevClose = lastCandle.close;

    for (let b = 1; b <= numBucketsPassed; b++) {
      const bTime = lastCandle.time + b * bucketMs;
      const bOpen = prevClose;
      let bClose = b === numBucketsPassed ? newPrice : bOpen;

      if (b < numBucketsPassed) {
        const hash = hashSymbol(`${asset.symbol}:${timeframeSeconds}:backfill:${bTime}`);
        const u1 = Math.max(1e-7, (hash % 10000) / 10000);
        const u2 = Math.max(1e-7, ((hash >> 5) % 10000) / 10000);
        const z = Math.min(1.8, Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)));
        const sign = hash % 2 === 0 ? 1 : -1;
        const bodySize = Math.max(minPip * 2.0, z * unitVol * 0.45);
        bClose = bOpen + sign * bodySize;
      }

      const bodyMax = Math.max(bOpen, bClose);
      const bodyMin = Math.min(bOpen, bClose);
      const wickHash = hashSymbol(`${asset.symbol}:wick:${bTime}`);
      const u3 = Math.max(1e-7, (wickHash % 10000) / 10000);
      const zUpper = Math.min(1.6, Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u3)));
      const upperWick = Math.max(minPip * 1.5, catParams.wickMultiplier * unitVol * (0.2 + zUpper * 0.35));
      const lowerWick = Math.max(minPip * 1.5, catParams.wickMultiplier * unitVol * (0.2 + zUpper * 0.35));

      candles.push({
        time: bTime,
        open: Number(bOpen.toFixed(asset.pipDecimals)),
        high: Number(Math.max(bodyMax + upperWick, bodyMax).toFixed(asset.pipDecimals)),
        low: Number(Math.min(bodyMin - lowerWick, bodyMin).toFixed(asset.pipDecimals)),
        close: Number(bClose.toFixed(asset.pipDecimals)),
        volume: b === numBucketsPassed ? 1 : Math.floor(20 + (wickHash % 40)),
      });

      prevClose = bClose;
    }

    if (candles.length > 5000) {
      candles.splice(0, candles.length - 5000);
    }
  }
}

/**
 * Aggregates or generates timeframe candles deterministically.
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

  if (!series || series.length === 0 || !validateCandlesForAsset(asset, series)) {
    series = generateDeterministicTimeframeCandles(asset, tf, 1500, store.lastPrice);
    store.timeframeSeries.set(tf, series);
  }

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
