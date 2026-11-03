import type { Candle, AssetInfo } from '../types/index.ts';
import {
  findAssetBySymbol,
  normalizeAssetSymbol,
  saveAssetHistoryToStorage,
  loadSelectedAssetSymbol,
} from './storage.ts';

// Listener pattern to break circular dependency with supabaseMarketSync
type BroadcastCallback = (payload: { symbol: string; price: number; prevPrice: number; timestamp: number }) => void;
let broadcastListener: BroadcastCallback | null = null;

export function setMarketBroadcastListener(callback: BroadcastCallback) {
  broadcastListener = callback;
}

/**
 * Authoritative Server Clock Offset Synchronization
 * Ensures all connected clients compute ticks and candle buckets against the identical live server UTC clock,
 * even if a user's local device clock is slightly ahead or behind.
 */
let serverTimeOffsetMs = 0;
let lastServerTimeSyncMs = 0;

export function setServerTimeOffset(serverTimestampMs: number, clientReferenceMs: number = Date.now()): void {
  if (typeof serverTimestampMs !== 'number' || !Number.isFinite(serverTimestampMs) || serverTimestampMs <= 0) {
    return;
  }
  const offset = serverTimestampMs - clientReferenceMs;
  // Ignore implausible clock offsets (> 24 hours) caused by malformed payloads
  if (Math.abs(offset) < 86400 * 1000) {
    serverTimeOffsetMs = offset;
    lastServerTimeSyncMs = clientReferenceMs;
  }
}

export function getServerTimeOffsetMs(): number {
  return serverTimeOffsetMs;
}

export function getLastServerTimeSyncMs(): number {
  return lastServerTimeSyncMs;
}

export function getSynchronizedNowMs(): number {
  return Date.now() + serverTimeOffsetMs;
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

// Multi-octave timescales (in seconds) for time-invariant global fractal price trajectory
const GLOBAL_OCTAVE_PERIODS_SEC = [5, 15, 30, 60, 180, 300, 900, 1800, 3600] as const;

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
 * Pure, time-invariant global price evaluation at any UTC timestamp `tMs`.
 *
 * Guarantees that the server and every connected client (whether long-active or newly joined)
 * compute the exact same price at any timestamp `tMs`, with zero historical array shifting,
 * uncorrelated cross-asset returns, and realistic multi-timeframe candle bodies.
 */
export function evalGlobalPriceAtTime(asset: AssetInfo, tMs: number): number {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const catParams = getCategoryParameters(asset.category, canonical);
  const unitVol = asset.volatility * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const symSeed = hashSymbol(canonical);

  const tSec = (tMs - GLOBAL_EPOCH) / 1000;
  let totalOffset = 0;

  for (let k = 0; k < GLOBAL_OCTAVE_PERIODS_SEC.length; k++) {
    const periodSec = GLOBAL_OCTAVE_PERIODS_SEC[k];
    const phaseShiftSec = ((symSeed >>> ((k * 3) % 24)) % periodSec);
    const gridCoord = (tSec + phaseShiftSec) / periodSec;
    const idx0 = Math.floor(gridCoord);
    const frac = gridCoord - idx0;

    const h0 = hashSymbol(`${canonical}:oct:${periodSec}:${idx0}`);
    const h1 = hashSymbol(`${canonical}:oct:${periodSec}:${idx0 + 1}`);

    const v0 = ((h0 % 20001) - 10000) / 10000; // [-1, 1]
    const v1 = ((h1 % 20001) - 10000) / 10000; // [-1, 1]

    const interp = v0 + (v1 - v0) * frac;
    const octaveScale = Math.pow(periodSec / 5, 0.34);
    totalOffset += interp * unitVol * octaveScale * 0.62;
  }

  // Smoothly bound maximum excursion to ±7.5% of asset.basePrice so price never leaves valid scale
  const maxSafeExcursion = Math.max(minPip * 50, asset.basePrice * 0.075);
  const boundedOffset = Math.tanh(totalOffset / maxSafeExcursion) * maxSafeExcursion;

  const rawPrice = asset.basePrice + boundedOffset;
  return Number(Math.max(minPip * 10, rawPrice).toFixed(asset.pipDecimals));
}

/**
 * Deterministically computes the exact synchronized market tick and active 5s candle at timestamp `nowMs`.
 * Locked directly to `evalGlobalPriceAtTime` at 5s bucket boundaries so live ticks and historical candles
 * are 100% consistent across all connected users and server instances.
 */
export function computeSynchronizedTickAtTime(
  asset: AssetInfo,
  nowMs: number = getSynchronizedNowMs()
): { price: number; open: number; high: number; low: number; close: number; bucketTime: number } {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = 5;
  const tfMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(canonical, tf);
  const currentBucketTime = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;

  const catParams = getCategoryParameters(asset.category, canonical);
  const unitVol = asset.volatility * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const open = evalGlobalPriceAtTime(asset, currentBucketTime);
  const targetClose = evalGlobalPriceAtTime(asset, currentBucketTime + tfMs);

  const elapsedMs = ((nowMs + offsetMs) % tfMs + tfMs) % tfMs;
  const progress = Math.max(0, Math.min(1, elapsedMs / tfMs));

  const subStep = Math.floor(nowMs / 250);
  const pulseHash = hashSymbol(`${canonical}:subtick:${subStep}`);
  const pulseNorm = ((pulseHash % 2000) - 1000) / 1000; // [-1, 1]
  const envelope = Math.sin(progress * Math.PI);
  const intraWave = pulseNorm * unitVol * 0.32 * envelope;

  const rawLivePrice = open + (targetClose - open) * progress + intraWave;
  const livePrice = Number(Math.max(minPip * 10, rawLivePrice).toFixed(asset.pipDecimals));

  const wickHash = hashSymbol(`${canonical}:wick:${tf}:${currentBucketTime}`);
  const uUpper = (wickHash % 1000) / 1000;
  const uLower = ((wickHash >>> 10) % 1000) / 1000;
  const wickProgress = Math.max(0.2, progress);
  const upperWick = Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * (0.22 + uUpper * 0.55) * wickProgress);
  const lowerWick = Math.max(minPip * 2.5, catParams.wickMultiplier * unitVol * (0.22 + uLower * 0.55) * wickProgress);

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
 * Computes a single deterministic candlestick for bucket `candleTime`.
 * Used by both initial history generation and incremental live bucket updates so that
 * long-active users and newly-joined users always see the exact same candlestick array.
 */
export function computeDeterministicCandleForBucket(
  asset: AssetInfo,
  timeframeSeconds: number,
  candleTime: number,
  isCurrentActiveBucket: boolean,
  livePrice?: number,
  nowMs: number = getSynchronizedNowMs()
): Candle {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = Math.max(5, timeframeSeconds);
  const tfMs = tf * 1000;
  const catParams = getCategoryParameters(asset.category, canonical);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.34);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const open = evalGlobalPriceAtTime(asset, candleTime);
  const close =
    isCurrentActiveBucket && typeof livePrice === 'number' && livePrice > 0
      ? Number(livePrice.toFixed(asset.pipDecimals))
      : evalGlobalPriceAtTime(asset, candleTime + tfMs);

  const bodyMax = Math.max(open, close);
  const bodyMin = Math.min(open, close);

  const wickHash = hashSymbol(`${canonical}:wick:${tf}:${candleTime}`);
  const uUpper = (wickHash % 1000) / 1000;
  const uLower = ((wickHash >>> 10) % 1000) / 1000;

  const progress = isCurrentActiveBucket
    ? Math.max(0.25, Math.min(1, (nowMs - candleTime) / tfMs))
    : 1.0;

  const upperWick = Math.max(
    minPip * 2.5,
    catParams.wickMultiplier * unitVol * (0.22 + uUpper * 0.55) * progress
  );
  const lowerWick = Math.max(
    minPip * 2.5,
    catParams.wickMultiplier * unitVol * (0.22 + uLower * 0.55) * progress
  );

  return {
    time: candleTime,
    open,
    high: Number((bodyMax + upperWick).toFixed(asset.pipDecimals)),
    low: Number(Math.max(minPip * 5, bodyMin - lowerWick).toFixed(asset.pipDecimals)),
    close,
    volume: isCurrentActiveBucket
      ? Math.max(1, Math.floor((45 + (wickHash % 115)) * progress))
      : Math.floor(45 + (wickHash % 115)),
  };
}

/**
 * Deterministically generates a sequence of timeframe candles anchored to the global UTC timeline.
 * Ensures that any user joining at any time sees the exact same historical and live candles
 * with zero array shifting.
 */
function generateDeterministicTimeframeCandles(
  asset: AssetInfo,
  timeframeSeconds: number,
  count: number = 1500,
  anchorEndPrice?: number,
  referenceNowMs: number = getSynchronizedNowMs()
): Candle[] {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = Math.max(5, timeframeSeconds);
  const tfMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(canonical, tf);

  const currentBucketTime = Math.floor((referenceNowMs + offsetMs) / tfMs) * tfMs - offsetMs;
  const startBucketTime = currentBucketTime - (count - 1) * tfMs;

  const liveEndPrice =
    typeof anchorEndPrice === 'number' && anchorEndPrice > 0
      ? anchorEndPrice
      : computeSynchronizedTickAtTime(asset, referenceNowMs).price;

  const result: Candle[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const candleTime = startBucketTime + i * tfMs;
    const isLast = i === count - 1;
    result[i] = computeDeterministicCandleForBucket(
      asset,
      tf,
      candleTime,
      isLast,
      isLast ? liveEndPrice : undefined,
      referenceNowMs
    );
  }

  return result;
}

const lastSteppedTimeBySymbol: Map<string, number> = new Map();

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

    const initNow = getSynchronizedNowMs();
    const liveSnap = computeSynchronizedTickAtTime(asset, initNow);
    const baseCandles = generateDeterministicTimeframeCandles(asset, 5, 1500, liveSnap.price, initNow);
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
      prevPrice: liveSnap.open,
      momentum: 0,
      volatilityRegime: 1.0,
      tickCounter: Math.floor((initNow - GLOBAL_EPOCH) / 5000),
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
    const snap = computeSynchronizedTickAtTime(asset, getSynchronizedNowMs());
    existingStore.lastPrice = snap.price;
    existingStore.prevPrice = snap.open;
    existingStore.timeframeSeries.clear();
  }

  return existingStore;
}

/**
 * Forces an immediate state reset and resync for an asset & timeframe against the authoritative server clock.
 * Prevents newly joined or re-navigating users from seeing cached or stale starting states.
 */
export function syncAssetStoreWithServerTime(
  asset: AssetInfo,
  timeframeSeconds: number,
  serverTimestampMs?: number,
  authoritativePrice?: number
): Candle[] {
  if (typeof serverTimestampMs === 'number' && serverTimestampMs > 0) {
    setServerTimeOffset(serverTimestampMs);
  }
  const nowMs = getSynchronizedNowMs();
  const symbolKey = normalizeAssetSymbol(asset.symbol);
  const store = getOrCreateMasterHistory(asset);

  const liveSnap = computeSynchronizedTickAtTime(asset, nowMs);
  const resolvedPrice =
    typeof authoritativePrice === 'number' && isValidPriceForAsset(asset, authoritativePrice)
      ? authoritativePrice
      : liveSnap.price;

  store.prevPrice = liveSnap.open;
  store.lastPrice = resolvedPrice;
  lastSteppedTimeBySymbol.set(symbolKey, nowMs);

  const tf = Math.max(5, timeframeSeconds);
  const freshSeries = generateDeterministicTimeframeCandles(asset, tf, 1500, resolvedPrice, nowMs);
  store.timeframeSeries.set(tf, freshSeries);

  return [...freshSeries];
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
  nowMs: number = getSynchronizedNowMs()
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
    const burstSign = burstHash % 3 === 0 ? 0 : burstHash % 2 === 0 ? 1 : -1;
    const burstStrength = ((burstHash >>> 4) % 1000) / 1000;
    microBurstImpulse =
      burstSign * (0.25 + burstStrength * 0.95) * (spikeProgress + (isChaosPhase ? 0.5 : 0));
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
  const {
    asset,
    currentPrice,
    unitVol,
    activeTrades,
    nowMs = getSynchronizedNowMs(),
    tickCounter = 0,
  } = params;
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
    const urgency =
      elapsedRatio < 0.4 ? 0.25 : 0.25 + Math.pow((elapsedRatio - 0.4) / 0.6, 1.35) * 0.75;
    if (urgency > maxUrgency) maxUrgency = urgency;

    const stakeWeight = Math.log10(Math.max(10, trade.investment || 10));
    const dirSign = trade.direction === 'CALL' ? 1 : -1;
    const priceDiff = currentPrice - trade.strikePrice;
    const isCurrentlyWinning =
      (dirSign === 1 && priceDiff > 0) || (dirSign === -1 && priceDiff < 0);
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
  const strikeTightening =
    nearestStrikeDistanceVol < 2.2 ? 0.82 + (nearestStrikeDistanceVol / 2.2) * 0.14 : 1.0;
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

/**
 * Advances live price deterministically based on absolute synchronized UTC time across all 268+ assets.
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
    lastSteppedTimeBySymbol.set(store.symbol, nowMs);
  } else {
    const rawNow = getSynchronizedNowMs();
    const prevNow = lastSteppedTimeBySymbol.get(store.symbol) || 0;
    nowMs = rawNow < prevNow + 250 ? prevNow + 250 : rawNow;
    lastSteppedTimeBySymbol.set(store.symbol, nowMs);
  }

  const snap = computeSynchronizedTickAtTime(asset, nowMs);
  appendLiveTick(asset, snap.price, true, nowMs);
  return snap.price;
}

const lastStorageSaveBySymbolTf: Map<string, number> = new Map();
const STORAGE_SAVE_THROTTLE_MS = 10000;

/**
 * Appends live tick to all active timeframe candle series using the unified deterministic bucket engine.
 */
export function appendLiveTick(
  asset: AssetInfo,
  newPrice: number,
  skipBroadcast = false,
  explicitNowMs?: number
): void {
  if (!isValidPriceForAsset(asset, newPrice)) {
    return;
  }
  const store = getOrCreateMasterHistory(asset);
  const prevPrice = store.lastPrice;
  store.prevPrice = prevPrice;
  store.lastPrice = newPrice;
  const now =
    typeof explicitNowMs === 'number'
      ? explicitNowMs
      : Math.max(getSynchronizedNowMs(), lastSteppedTimeBySymbol.get(store.symbol) || 0);
  const activeSym = loadSelectedAssetSymbol();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);

    // Throttle localStorage JSON serialization to once every 10s for the active asset
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

  const tf = Math.max(5, timeframeSeconds);
  const bucketMs = tf * 1000;
  const offsetMs = getAssetTimeOffsetMs(asset.symbol, tf);
  const currentBucket = Math.floor((now + offsetMs) / bucketMs) * bucketMs - offsetMs;

  if (candles.length === 0) {
    candles.push(computeDeterministicCandleForBucket(asset, tf, currentBucket, true, newPrice, now));
    return;
  }

  const lastCandle = candles[candles.length - 1];

  if (lastCandle && lastCandle.time === currentBucket) {
    const updatedActive = computeDeterministicCandleForBucket(
      asset,
      tf,
      currentBucket,
      true,
      newPrice,
      now
    );
    lastCandle.open = updatedActive.open;
    lastCandle.close = updatedActive.close;
    lastCandle.high = updatedActive.high;
    lastCandle.low = updatedActive.low;
    lastCandle.volume = updatedActive.volume;
  } else if (lastCandle && currentBucket > lastCandle.time) {
    const numBucketsPassed = Math.floor((currentBucket - lastCandle.time) / bucketMs);

    // If a large time gap occurred (e.g. tab sleep > 200 buckets), regenerate full deterministic series cleanly
    if (numBucketsPassed > 200) {
      const fresh = generateDeterministicTimeframeCandles(asset, tf, candles.length || 1500, newPrice, now);
      candles.splice(0, candles.length, ...fresh);
      return;
    }

    // Lock the previously active candle to its exact deterministic completed state
    candles[candles.length - 1] = computeDeterministicCandleForBucket(
      asset,
      tf,
      lastCandle.time,
      false,
      undefined,
      now
    );

    // Fill any intermediate buckets and the new active bucket using the exact same deterministic function
    for (let b = 1; b <= numBucketsPassed; b++) {
      const bTime = lastCandle.time + b * bucketMs;
      const isCurrent = b === numBucketsPassed;
      candles.push(
        computeDeterministicCandleForBucket(
          asset,
          tf,
          bTime,
          isCurrent,
          isCurrent ? newPrice : undefined,
          now
        )
      );
    }

    if (candles.length > 1500) {
      candles.splice(0, candles.length - 1500);
    }
  } else if (lastCandle && currentBucket < lastCandle.time) {
    // Clock offset resynced backward: rebuild cleanly
    const fresh = generateDeterministicTimeframeCandles(asset, tf, candles.length || 1500, newPrice, now);
    candles.splice(0, candles.length, ...fresh);
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
  const now = Math.max(getSynchronizedNowMs(), lastSteppedTimeBySymbol.get(store.symbol) || 0);

  let series = store.timeframeSeries.get(tf);

  if (!series || series.length === 0 || !validateCandlesForAsset(asset, series)) {
    series = generateDeterministicTimeframeCandles(asset, tf, 1500, store.lastPrice, now);
    store.timeframeSeries.set(tf, series);
  } else {
    updateCandleArrayWithTick(series, asset, tf, store.lastPrice, now);
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
  const now = getSynchronizedNowMs();

  const olderCandles: Candle[] = new Array(chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    const candleTime = earliest.time - (chunkCount - i) * bucketMs;
    olderCandles[i] = computeDeterministicCandleForBucket(asset, tf, candleTime, false, undefined, now);
  }

  const combined = [...olderCandles, ...existing];
  store.timeframeSeries.set(tf, combined);
  return combined;
}
