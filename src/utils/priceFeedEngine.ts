import { Candle, AssetInfo } from '../types';
import {
  findAssetBySymbol,
  normalizeAssetSymbol,
  saveAssetHistoryToStorage,
  loadAssetHistoryFromStorage,
  loadSelectedAssetSymbol,
} from './storage';

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
  const symbolSeed = hashSymbol(asset.symbol);
  const catParams = getCategoryParameters(asset.category);

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
 * Deterministically generates a sequence of timeframe candles anchored to a global UTC timeline.
 * Ensures that any user joining at any time sees the exact same historical and live candles.
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
  
  const currentBucketTime = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;
  const startBucketTime = currentBucketTime - (count - 1) * tfMs;

  const catParams = getCategoryParameters(asset.category, asset.symbol);
  const tfMultiplier = Math.pow(Math.max(1, tf / 5), 0.38);
  const unitVol = asset.volatility * tfMultiplier * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);

  const candlesPerBlock = 500;
  const result: Candle[] = new Array(count);

  let currentBlockIndex = -1;
  let prng = createPRNG(0);
  let currentPrice = 0;
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

  for (let i = 0; i < count; i++) {
    const candleTime = startBucketTime + i * tfMs;
    const bucketIdx = Math.floor((candleTime - GLOBAL_EPOCH) / tfMs);
    const blockIndex = Math.floor(bucketIdx / candlesPerBlock);
    const indexInBlock = bucketIdx % candlesPerBlock;

    if (blockIndex !== currentBlockIndex) {
      currentBlockIndex = blockIndex;
      const blockSeed = hashSymbol(`${asset.symbol}:${tf}:block:${blockIndex}`);
      prng = createPRNG(blockSeed);
      currentPrice = getDeterministicBlockBasePrice(asset, blockIndex);
      volCluster = 1.0;

      const regimeSeed = hashSymbol(`${asset.symbol}:${tf}:regime:${blockIndex}`);
      currentRegime = initialRegimes[regimeSeed % initialRegimes.length];
      regimeTicksRemaining = catParams.trendLengthMin + (regimeSeed % (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.65 + (((regimeSeed >> 3) % 50) / 50) * 0.7;

      for (let j = 0; j < indexInBlock; j++) {
        const u1 = Math.max(1e-7, nextRandom(prng));
        const u2 = Math.max(1e-7, nextRandom(prng));
        const shock = Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        volCluster = Math.max(0.45, Math.min(2.8, 0.72 * volCluster + 0.28 * shock));

        regimeTicksRemaining--;
        if (regimeTicksRemaining <= 0) {
          currentRegime = transitionRegime(currentRegime, () => nextRandom(prng), catParams.breakoutChance);
          regimeTicksRemaining = catParams.trendLengthMin + Math.floor(nextRandom(prng) * (catParams.trendLengthMax - catParams.trendLengthMin));
          regimeIntensity = 0.6 + nextRandom(prng) * 0.8;
        }

        let trendDrift = 0;
        if (currentRegime === 'bullish_trend') trendDrift = 0.28 * regimeIntensity;
        else if (currentRegime === 'bearish_trend') trendDrift = -0.28 * regimeIntensity;
        else if (currentRegime === 'volatile_breakout') trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.5 * regimeIntensity;

        const dirProb = Math.max(0.1, Math.min(0.9, 0.5 + trendDrift));
        const sign = nextRandom(prng) < dirProb ? 1 : -1;
        const u3 = Math.max(1e-7, nextRandom(prng));
        const u4 = Math.max(1e-7, nextRandom(prng));
        const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
        const isJump = nextRandom(prng) < catParams.jumpChance;
        const jumpBoost = isJump ? 1.8 + nextRandom(prng) * 1.4 : 1.0;
        const bodyMag = Math.max(minPip * 3.5, (0.45 + shock2 * 0.85) * unitVol * volCluster * jumpBoost);
        
        currentPrice = Math.max(minPip * 10, currentPrice + sign * bodyMag);
      }
    }

    const open = currentPrice;
    const u1 = Math.max(1e-7, nextRandom(prng));
    const u2 = Math.max(1e-7, nextRandom(prng));
    const shock = Math.abs(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
    volCluster = Math.max(0.45, Math.min(2.8, 0.72 * volCluster + 0.28 * shock));

    regimeTicksRemaining--;
    if (regimeTicksRemaining <= 0) {
      currentRegime = transitionRegime(currentRegime, () => nextRandom(prng), catParams.breakoutChance);
      regimeTicksRemaining = catParams.trendLengthMin + Math.floor(nextRandom(prng) * (catParams.trendLengthMax - catParams.trendLengthMin));
      regimeIntensity = 0.6 + nextRandom(prng) * 0.8;
    }

    let trendDrift = 0;
    if (currentRegime === 'bullish_trend') trendDrift = 0.28 * regimeIntensity;
    else if (currentRegime === 'bearish_trend') trendDrift = -0.28 * regimeIntensity;
    else if (currentRegime === 'volatile_breakout') trendDrift = (nextRandom(prng) < 0.5 ? 1 : -1) * 0.5 * regimeIntensity;

    const dirProb = Math.max(0.1, Math.min(0.9, 0.5 + trendDrift));
    const sign = nextRandom(prng) < dirProb ? 1 : -1;
    const u3 = Math.max(1e-7, nextRandom(prng));
    const u4 = Math.max(1e-7, nextRandom(prng));
    const shock2 = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u4));
    const isJump = nextRandom(prng) < catParams.jumpChance;
    const jumpBoost = isJump ? 1.8 + nextRandom(prng) * 1.4 : 1.0;
    const bodyMag = Math.max(minPip * 3.5, (0.45 + shock2 * 0.85) * unitVol * volCluster * jumpBoost);
    
    const close = Math.max(minPip * 10, open + sign * bodyMag);
    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    const upperWick = Math.max(minPip * 3.0, catParams.wickMultiplier * unitVol * volCluster * (0.38 + nextRandom(prng) * 0.88));
    const lowerWick = Math.max(minPip * 3.0, catParams.wickMultiplier * unitVol * volCluster * (0.38 + nextRandom(prng) * 0.88));

    result[i] = {
      time: candleTime,
      open: Number(open.toFixed(asset.pipDecimals)),
      high: Number((bodyMax + upperWick).toFixed(asset.pipDecimals)),
      low: Number((bodyMin - lowerWick).toFixed(asset.pipDecimals)),
      close: Number(close.toFixed(asset.pipDecimals)),
      volume: Math.floor(45 + volCluster * 65 + nextRandom(prng) * 110),
    };

    currentPrice = close;
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
    volatilityMultiplier = 1.0 - tightenDepth * 0.32;
  } else if (isLastSecondSpike) {
    const spikeProgress = Math.min(1, Math.max(0, 1 - remainingMs / spikeWindowMs));
    volatilityMultiplier = 1.25 + spikeProgress * 0.85;
    
    if (isChaosPhase) {
      volatilityMultiplier *= 1.45;
    }

    const subSecBucket = Math.floor(nowMs / 120);
    const burstHash = hashSymbol(`${normalizeAssetSymbol(symbol)}:closeBurst:${subSecBucket}`);
    const burstSign = (burstHash % 3 === 0) ? 0 : (burstHash % 2 === 0 ? 1 : -1);
    const burstStrength = ((burstHash >> 4) % 1000) / 1000;
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

/**
 * Advances live price deterministically based on absolute time.
 */
export function stepOrganicLiveTick(
  assetOrSymbol: AssetInfo | string,
  options?: LiveTickOptions
): number {
  const asset = typeof assetOrSymbol === 'string' ? findAssetBySymbol(assetOrSymbol) : assetOrSymbol;
  if (!asset) return 1.085;

  const store = getOrCreateMasterHistory(asset);
  // No more simulation here. Just return the last price we got from the backend.
  return store.lastPrice;
}

/**
 * Appends live tick to all active timeframe candle series.
 */
export function appendLiveTick(asset: AssetInfo, newPrice: number, skipBroadcast = false): void {
  const store = getOrCreateMasterHistory(asset);
  const prevPrice = store.lastPrice;
  store.lastPrice = newPrice;
  const now = Date.now();

  store.timeframeSeries.forEach((series, tfSeconds) => {
    updateCandleArrayWithTick(series, asset, tfSeconds, newPrice, now);
    
    // Performance optimization: only save history to localStorage for the active asset
    // or throttle heavily for background assets to prevent main thread blocking
    const activeSym = loadSelectedAssetSymbol();
    if (asset.symbol === activeSym) {
      saveAssetHistoryToStorage(asset.symbol, series, tfSeconds);
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
        const hash = hashSymbol(`${asset.symbol}:${timeframeSeconds}:backfill:${bTime}`);
        const u1 = Math.max(1e-7, (hash % 10000) / 10000);
        const u2 = Math.max(1e-7, ((hash >> 5) % 10000) / 10000);
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const sign = (hash % 2 === 0) ? 1 : -1;
        const bodySize = Math.max(minPip * 2.0, Math.abs(z) * unitVol * 0.45);
        bClose = bOpen + sign * bodySize;
      }

      const bodyMax = Math.max(bOpen, bClose);
      const bodyMin = Math.min(bOpen, bClose);
      const wickHash = hashSymbol(`${asset.symbol}:wick:${bTime}`);
      const u3 = Math.max(1e-7, (wickHash % 10000) / 10000);
      const zUpper = Math.abs(Math.sqrt(-2.0 * Math.log(u3)) * Math.cos(2.0 * Math.PI * u3));
      const upperWick = Math.max(minPip * 1.5, catParams.wickMultiplier * unitVol * (0.2 + zUpper * 0.4));
      const lowerWick = Math.max(minPip * 1.5, catParams.wickMultiplier * unitVol * (0.2 + zUpper * 0.4));

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
