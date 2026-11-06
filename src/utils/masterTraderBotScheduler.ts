/**
 * Human-Like Master Trader / Bot Execution Scheduler & Risk-Managed Batch Engine
 *
 * Enforces:
 * 1. Dynamic Cooldown Delay: Random 30s - 180s (30,000ms - 180,000ms) interval after every executed master trade.
 * 2. Max Trades per Hour / Session Limit: Capped at 3 - 5 master trades per hour; pauses for the remainder of the hour once reached.
 * 3. Consecutive Win / Loss Cool-Off Rules:
 *    - 2 consecutive losses -> automatically pause trading for 1 to 2 hours (60m - 120m).
 *    - 3 consecutive wins -> close current trading session and pause for 2 to 3 hours (120m - 180m).
 * 4. Volume-Based Batch Execution (Copier Scalability):
 *    - Signal generation and rate limits are tracked strictly per Master Trader (`provider_id`), never per copier.
 *    - When a master signal triggers, it executes across all active copiers of that master trader in a single batch.
 * 5. Active Trading Windows / Schedule:
 *    - Restricts execution to high-liquidity sessions (06:00 AM - 11:59 PM local time).
 *    - Disables trade execution completely during overnight hours (12:00 AM - 06:00 AM local time).
 */

export const BOT_MIN_COOLDOWN_SECONDS = 30;
export const BOT_MAX_COOLDOWN_SECONDS = 180;
export const BOT_MIN_COOLDOWN_MS = BOT_MIN_COOLDOWN_SECONDS * 1000; // 30,000 ms
export const BOT_MAX_COOLDOWN_MS = BOT_MAX_COOLDOWN_SECONDS * 1000; // 180,000 ms

export const BOT_MIN_TRADES_PER_HOUR = 3;
export const BOT_MAX_TRADES_PER_HOUR = 5;

export const BOT_CONSECUTIVE_LOSS_LIMIT = 2;
export const BOT_LOSS_COOLOFF_MIN_MS = 1 * 60 * 60 * 1000; // 1 hour
export const BOT_LOSS_COOLOFF_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

export const BOT_CONSECUTIVE_WIN_LIMIT = 3;
export const BOT_WIN_TAKE_PROFIT_MIN_MS = 2 * 60 * 60 * 1000; // 2 hours
export const BOT_WIN_TAKE_PROFIT_MAX_MS = 3 * 60 * 60 * 1000; // 3 hours

export const BOT_OVERNIGHT_START_HOUR = 0; // 12:00 AM local time
export const BOT_OVERNIGHT_END_HOUR = 6; // 06:00 AM local time

export type MasterBotPauseReason =
  | 'NONE'
  | 'COOLDOWN_DELAY'
  | 'HOURLY_TRADE_LIMIT'
  | 'CONSECUTIVE_LOSS_COOL_OFF'
  | 'CONSECUTIVE_WIN_TAKE_PROFIT'
  | 'OVERNIGHT_OFF_HOURS'
  | 'OPEN_BATCH_IN_PROGRESS';

export type MasterBotStatus =
  | 'active'
  | 'cooldown'
  | 'paused_hourly_limit'
  | 'paused_consecutive_losses'
  | 'paused_session_take_profit'
  | 'paused_overnight';

export interface MasterTraderBotState {
  providerId: string;
  status: MasterBotStatus;
  pauseReason: MasterBotPauseReason;
  lastTradeExecutedAt: number;
  lastCooldownDurationMs: number;
  nextEligibleTradeAt: number;
  pausedUntilMs: number;
  hourWindowStartMs: number;
  maxTradesThisHour: number;
  tradesExecutedThisHour: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalSignalsGenerated: number;
  lastSignalId?: string;
  updatedAt: number;
}

export interface ActiveTradingWindowCheck {
  allowed: boolean;
  localHour: number;
  sessionName: string;
  nextSessionOpensAtMs: number;
  reason?: MasterBotPauseReason;
}

export interface MasterSignalEligibilityResult {
  canExecute: boolean;
  status: MasterBotStatus;
  reason: MasterBotPauseReason;
  remainingWaitMs: number;
  state: MasterTraderBotState;
  windowCheck: ActiveTradingWindowCheck;
}

export interface MasterTradeSignal {
  signalId: string;
  providerId: string;
  assetSymbol: string;
  tradeType: 'CALL' | 'PUT';
  entryPrice: number;
  generatedAt: number;
  cooldownAppliedMs: number;
  hourlyTradeIndex: number;
  maxTradesThisHour: number;
}

const BOT_STATE_STORAGE_KEY = 'bft_master_trader_bot_states_v1';
const inMemoryBotStates = new Map<string, MasterTraderBotState>();

/**
 * Generates a random integer in `[min, max]` inclusive.
 */
export function randomIntInclusive(
  min: number,
  max: number,
  rng: () => number = Math.random
): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  const r = Math.max(0, Math.min(0.999999999, rng()));
  return Math.floor(r * (hi - lo + 1)) + lo;
}

/**
 * Rule 1: Generates a random cooldown delay between 30 seconds and 180 seconds (30,000ms - 180,000ms).
 */
export function generateDynamicTradeCooldownMs(rng: () => number = Math.random): number {
  return randomIntInclusive(BOT_MIN_COOLDOWN_MS, BOT_MAX_COOLDOWN_MS, rng);
}

/**
 * Rule 2: Generates an hourly trade cap between 3 and 5 trades per hour.
 */
export function generateHourlyTradeLimit(
  providerId?: string,
  hourWindowStartMs?: number,
  rng?: () => number
): number {
  if (rng) {
    return randomIntInclusive(BOT_MIN_TRADES_PER_HOUR, BOT_MAX_TRADES_PER_HOUR, rng);
  }
  if (providerId && typeof hourWindowStartMs === 'number') {
    const seed = `${providerId}:${Math.floor(hourWindowStartMs / 3600000)}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return BOT_MIN_TRADES_PER_HOUR + (Math.abs(hash) % (BOT_MAX_TRADES_PER_HOUR - BOT_MIN_TRADES_PER_HOUR + 1));
  }
  return randomIntInclusive(BOT_MIN_TRADES_PER_HOUR, BOT_MAX_TRADES_PER_HOUR);
}

/**
 * Rule 3a: Generates a random cool-off duration between 1 and 2 hours after 2 consecutive losses.
 */
export function generateConsecutiveLossCoolOffMs(rng: () => number = Math.random): number {
  return randomIntInclusive(BOT_LOSS_COOLOFF_MIN_MS, BOT_LOSS_COOLOFF_MAX_MS, rng);
}

/**
 * Rule 3b: Generates a random session pause duration between 2 and 3 hours after 3 consecutive wins.
 */
export function generateConsecutiveWinTakeProfitPauseMs(rng: () => number = Math.random): number {
  return randomIntInclusive(BOT_WIN_TAKE_PROFIT_MIN_MS, BOT_WIN_TAKE_PROFIT_MAX_MS, rng);
}

/**
 * Computes the start timestamp (ms) of the current 1-hour window.
 */
export function getHourWindowStartMs(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 3600000) * 3600000;
}

/**
 * Computes the end timestamp (ms) of the current 1-hour window (start of next hour).
 */
export function getNextHourStartMs(nowMs: number = Date.now()): number {
  return (Math.floor(nowMs / 3600000) + 1) * 3600000;
}

/**
 * Rule 5: Checks whether the current local time falls within active high-liquidity trading windows.
 * Overnight hours (12:00 AM - 06:00 AM local time, i.e. 0 <= hour < 6) are strictly disabled.
 */
export function evaluateActiveTradingWindow(
  nowMs: number = Date.now(),
  localHourOverride?: number
): ActiveTradingWindowCheck {
  const date = new Date(nowMs);
  const localHour =
    typeof localHourOverride === 'number' && Number.isFinite(localHourOverride)
      ? ((Math.floor(localHourOverride) % 24) + 24) % 24
      : date.getHours();

  if (localHour >= BOT_OVERNIGHT_START_HOUR && localHour < BOT_OVERNIGHT_END_HOUR) {
    const nextOpenDate = new Date(nowMs);
    nextOpenDate.setHours(BOT_OVERNIGHT_END_HOUR, 0, 0, 0);
    if (nextOpenDate.getTime() <= nowMs) {
      nextOpenDate.setTime(nowMs + (BOT_OVERNIGHT_END_HOUR - localHour) * 3600000);
    }
    return {
      allowed: false,
      localHour,
      sessionName: 'Overnight Off-Hours (12:00 AM - 06:00 AM)',
      nextSessionOpensAtMs: nextOpenDate.getTime(),
      reason: 'OVERNIGHT_OFF_HOURS',
    };
  }

  let sessionName = 'High-Liquidity Active Session';
  if (localHour >= 6 && localHour < 8) {
    sessionName = 'Tokyo / London Pre-Market Session';
  } else if (localHour >= 8 && localHour < 13) {
    sessionName = 'London High-Liquidity Session';
  } else if (localHour >= 13 && localHour < 17) {
    sessionName = 'London / New York Overlap Session';
  } else if (localHour >= 17 && localHour < 21) {
    sessionName = 'New York Session';
  } else {
    sessionName = 'Late US / Sydney-Tokyo Session';
  }

  return {
    allowed: true,
    localHour,
    sessionName,
    nextSessionOpensAtMs: nowMs,
  };
}

/**
 * Creates a fresh default `MasterTraderBotState` for a given `providerId`.
 */
export function createInitialMasterBotState(
  providerId: string,
  nowMs: number = Date.now(),
  rng?: () => number
): MasterTraderBotState {
  const hourStart = getHourWindowStartMs(nowMs);
  return {
    providerId,
    status: 'active',
    pauseReason: 'NONE',
    lastTradeExecutedAt: 0,
    lastCooldownDurationMs: 0,
    nextEligibleTradeAt: 0,
    pausedUntilMs: 0,
    hourWindowStartMs: hourStart,
    maxTradesThisHour: generateHourlyTradeLimit(providerId, hourStart, rng),
    tradesExecutedThisHour: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    totalSignalsGenerated: 0,
    updatedAt: nowMs,
  };
}

function loadPersistedBotStates(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(BOT_STATE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          inMemoryBotStates.set(k, v as MasterTraderBotState);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

function persistBotStates(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const serialized: Record<string, MasterTraderBotState> = {};
    for (const [k, v] of inMemoryBotStates.entries()) {
      serialized[k] = v;
    }
    localStorage.setItem(BOT_STATE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // ignore storage errors
  }
}

export function getMasterTraderBotState(
  providerId: string,
  nowMs: number = Date.now()
): MasterTraderBotState {
  if (inMemoryBotStates.size === 0) {
    loadPersistedBotStates();
  }
  const existing = inMemoryBotStates.get(providerId);
  if (existing) {
    return syncMasterBotHourWindow(existing, nowMs);
  }
  const initial = createInitialMasterBotState(providerId, nowMs);
  inMemoryBotStates.set(providerId, initial);
  persistBotStates();
  return initial;
}

export function saveMasterTraderBotState(state: MasterTraderBotState): void {
  inMemoryBotStates.set(state.providerId, { ...state });
  persistBotStates();
}

export function resetAllMasterTraderBotStatesForTests(): void {
  inMemoryBotStates.clear();
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(BOT_STATE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Rolls over the 1-hour trade counter and clears expired hourly/cool-off pauses when a new hour or timestamp is reached.
 */
export function syncMasterBotHourWindow(
  state: MasterTraderBotState,
  nowMs: number = Date.now(),
  rng?: () => number
): MasterTraderBotState {
  const currentHourStart = getHourWindowStartMs(nowMs);
  let updated: MasterTraderBotState = { ...state };

  if (updated.hourWindowStartMs !== currentHourStart) {
    updated.hourWindowStartMs = currentHourStart;
    updated.tradesExecutedThisHour = 0;
    updated.maxTradesThisHour = generateHourlyTradeLimit(updated.providerId, currentHourStart, rng);
    if (updated.status === 'paused_hourly_limit' && nowMs >= updated.pausedUntilMs) {
      updated.status = 'active';
      updated.pauseReason = 'NONE';
      updated.pausedUntilMs = 0;
    }
  }

  // Clear expired cool-off or session take-profit pauses once `nowMs >= pausedUntilMs`
  if (updated.pausedUntilMs > 0 && nowMs >= updated.pausedUntilMs) {
    updated.pausedUntilMs = 0;
    updated.status = 'active';
    updated.pauseReason = 'NONE';
  }

  // Clear expired cooldown status once `nowMs >= nextEligibleTradeAt`
  if (
    updated.status === 'cooldown' &&
    updated.nextEligibleTradeAt > 0 &&
    nowMs >= updated.nextEligibleTradeAt
  ) {
    updated.status = 'active';
    updated.pauseReason = 'NONE';
  }

  return updated;
}

/**
 * Evaluates whether a Master Trader (`providerId`) is currently allowed to generate a new trade signal
 * under all 5 risk and human-like scheduling rules.
 */
export function evaluateMasterSignalEligibility(params: {
  state: MasterTraderBotState;
  nowMs?: number;
  hasOpenBatchTrade?: boolean;
  localHourOverride?: number;
  bypassOvernightCheck?: boolean;
  rng?: () => number;
}): MasterSignalEligibilityResult {
  const nowMs = params.nowMs ?? Date.now();
  const syncedState = syncMasterBotHourWindow(params.state, nowMs, params.rng);

  // Rule 5: Active Trading Windows / Schedule (disable 12:00 AM - 06:00 AM local time)
  const windowCheck = evaluateActiveTradingWindow(nowMs, params.localHourOverride);
  if (!params.bypassOvernightCheck && !windowCheck.allowed) {
    const overnightState: MasterTraderBotState = {
      ...syncedState,
      status: 'paused_overnight',
      pauseReason: 'OVERNIGHT_OFF_HOURS',
      updatedAt: nowMs,
    };
    return {
      canExecute: false,
      status: 'paused_overnight',
      reason: 'OVERNIGHT_OFF_HOURS',
      remainingWaitMs: Math.max(0, windowCheck.nextSessionOpensAtMs - nowMs),
      state: overnightState,
      windowCheck,
    };
  }

  // Rule 3: Consecutive Win / Loss Cool-Off Pause check
  if (syncedState.pausedUntilMs > nowMs) {
    const isLossPause = syncedState.status === 'paused_consecutive_losses';
    const isWinPause = syncedState.status === 'paused_session_take_profit';
    const isHourlyPause = syncedState.status === 'paused_hourly_limit';

    const status: MasterBotStatus = isLossPause
      ? 'paused_consecutive_losses'
      : isWinPause
      ? 'paused_session_take_profit'
      : isHourlyPause
      ? 'paused_hourly_limit'
      : 'paused_hourly_limit';

    const reason: MasterBotPauseReason = isLossPause
      ? 'CONSECUTIVE_LOSS_COOL_OFF'
      : isWinPause
      ? 'CONSECUTIVE_WIN_TAKE_PROFIT'
      : 'HOURLY_TRADE_LIMIT';

    return {
      canExecute: false,
      status,
      reason,
      remainingWaitMs: syncedState.pausedUntilMs - nowMs,
      state: syncedState,
      windowCheck,
    };
  }

  // Rule 2: Max Trades per Hour / Session Limit (3 - 5 trades per hour)
  if (syncedState.tradesExecutedThisHour >= syncedState.maxTradesThisHour) {
    const nextHourMs = getNextHourStartMs(nowMs);
    const pausedHourlyState: MasterTraderBotState = {
      ...syncedState,
      status: 'paused_hourly_limit',
      pauseReason: 'HOURLY_TRADE_LIMIT',
      pausedUntilMs: nextHourMs,
      updatedAt: nowMs,
    };
    return {
      canExecute: false,
      status: 'paused_hourly_limit',
      reason: 'HOURLY_TRADE_LIMIT',
      remainingWaitMs: Math.max(0, nextHourMs - nowMs),
      state: pausedHourlyState,
      windowCheck,
    };
  }

  // Prevent overlapping concurrent batch trades for the same Master Trader
  if (params.hasOpenBatchTrade) {
    return {
      canExecute: false,
      status: syncedState.status,
      reason: 'OPEN_BATCH_IN_PROGRESS',
      remainingWaitMs: 15000,
      state: syncedState,
      windowCheck,
    };
  }

  // Rule 1: Dynamic Cooldown Delay (30s - 180s interval after every executed trade)
  if (syncedState.nextEligibleTradeAt > nowMs) {
    const cooldownState: MasterTraderBotState = {
      ...syncedState,
      status: 'cooldown',
      pauseReason: 'COOLDOWN_DELAY',
      updatedAt: nowMs,
    };
    return {
      canExecute: false,
      status: 'cooldown',
      reason: 'COOLDOWN_DELAY',
      remainingWaitMs: syncedState.nextEligibleTradeAt - nowMs,
      state: cooldownState,
      windowCheck,
    };
  }

  const readyState: MasterTraderBotState = {
    ...syncedState,
    status: 'active',
    pauseReason: 'NONE',
    updatedAt: nowMs,
  };

  return {
    canExecute: true,
    status: 'active',
    reason: 'NONE',
    remainingWaitMs: 0,
    state: readyState,
    windowCheck,
  };
}

/**
 * Records that a Master Trader just executed a signal batch:
 * - Increments `tradesExecutedThisHour` by 1 (once per master signal, regardless of copier count).
 * - Assigns a random 30s - 180s dynamic cooldown delay (`nextEligibleTradeAt`).
 * - If `tradesExecutedThisHour` reaches `maxTradesThisHour` (3-5), pauses the bot for the rest of the hour.
 */
export function recordMasterSignalExecution(params: {
  state: MasterTraderBotState;
  signalId?: string;
  nowMs?: number;
  cooldownOverrideMs?: number;
  rng?: () => number;
}): MasterTraderBotState {
  const nowMs = params.nowMs ?? Date.now();
  const synced = syncMasterBotHourWindow(params.state, nowMs, params.rng);

  const cooldownMs =
    typeof params.cooldownOverrideMs === 'number' && params.cooldownOverrideMs >= BOT_MIN_COOLDOWN_MS
      ? Math.min(BOT_MAX_COOLDOWN_MS, Math.max(BOT_MIN_COOLDOWN_MS, params.cooldownOverrideMs))
      : generateDynamicTradeCooldownMs(params.rng);

  const nextTradesThisHour = synced.tradesExecutedThisHour + 1;
  const reachedHourlyCap = nextTradesThisHour >= synced.maxTradesThisHour;
  const nextHourMs = getNextHourStartMs(nowMs);

  const updated: MasterTraderBotState = {
    ...synced,
    lastTradeExecutedAt: nowMs,
    lastCooldownDurationMs: cooldownMs,
    nextEligibleTradeAt: nowMs + cooldownMs,
    tradesExecutedThisHour: nextTradesThisHour,
    totalSignalsGenerated: synced.totalSignalsGenerated + 1,
    lastSignalId: params.signalId || `sig-${synced.providerId}-${nowMs}`,
    status: reachedHourlyCap ? 'paused_hourly_limit' : 'cooldown',
    pauseReason: reachedHourlyCap ? 'HOURLY_TRADE_LIMIT' : 'COOLDOWN_DELAY',
    pausedUntilMs: reachedHourlyCap ? Math.max(synced.pausedUntilMs, nextHourMs) : synced.pausedUntilMs,
    updatedAt: nowMs,
  };

  saveMasterTraderBotState(updated);
  return updated;
}

/**
 * Rule 3: Updates consecutive win/loss streaks when a Master Trader's signal batch settles,
 * and triggers automatic cool-off / session take-profit pauses:
 * - 2 consecutive losses -> pause for 1 to 2 hours (`paused_consecutive_losses`).
 * - 3 consecutive wins -> close session and pause for 2 to 3 hours (`paused_session_take_profit`).
 */
export function recordMasterSignalOutcome(params: {
  state: MasterTraderBotState;
  outcome: 'WIN' | 'LOSS' | 'TIE';
  nowMs?: number;
  rng?: () => number;
}): {
  updatedState: MasterTraderBotState;
  triggeredPause: boolean;
  pauseReason: MasterBotPauseReason;
  pauseDurationMs: number;
} {
  const nowMs = params.nowMs ?? Date.now();
  const synced = syncMasterBotHourWindow(params.state, nowMs, params.rng);

  if (params.outcome === 'TIE') {
    saveMasterTraderBotState(synced);
    return {
      updatedState: synced,
      triggeredPause: false,
      pauseReason: synced.pauseReason,
      pauseDurationMs: 0,
    };
  }

  let consecutiveWins = params.outcome === 'WIN' ? synced.consecutiveWins + 1 : 0;
  let consecutiveLosses = params.outcome === 'LOSS' ? synced.consecutiveLosses + 1 : 0;
  let status: MasterBotStatus = synced.status;
  let pauseReason: MasterBotPauseReason = synced.pauseReason;
  let pausedUntilMs = synced.pausedUntilMs;
  let triggeredPause = false;
  let pauseDurationMs = 0;

  if (consecutiveLosses >= BOT_CONSECUTIVE_LOSS_LIMIT) {
    pauseDurationMs = generateConsecutiveLossCoolOffMs(params.rng);
    pausedUntilMs = nowMs + pauseDurationMs;
    status = 'paused_consecutive_losses';
    pauseReason = 'CONSECUTIVE_LOSS_COOL_OFF';
    consecutiveLosses = 0;
    consecutiveWins = 0;
    triggeredPause = true;
  } else if (consecutiveWins >= BOT_CONSECUTIVE_WIN_LIMIT) {
    pauseDurationMs = generateConsecutiveWinTakeProfitPauseMs(params.rng);
    pausedUntilMs = nowMs + pauseDurationMs;
    status = 'paused_session_take_profit';
    pauseReason = 'CONSECUTIVE_WIN_TAKE_PROFIT';
    consecutiveWins = 0;
    consecutiveLosses = 0;
    triggeredPause = true;
  }

  const updatedState: MasterTraderBotState = {
    ...synced,
    consecutiveWins,
    consecutiveLosses,
    status,
    pauseReason,
    pausedUntilMs,
    updatedAt: nowMs,
  };

  saveMasterTraderBotState(updatedState);
  return {
    updatedState,
    triggeredPause,
    pauseReason,
    pauseDurationMs,
  };
}

/**
 * Rule 4: Groups active copy trading subscriptions by Master Trader (`provider_id`) so that
 * trade frequency is driven strictly by Master Trader signal generation, never by the number of copiers.
 */
export function groupActiveSubscriptionsByProvider<
  T extends { id?: string; provider_id: string; status?: string }
>(subscriptions: T[]): Map<string, T[]> {
  const byProvider = new Map<string, T[]>();
  for (const sub of subscriptions) {
    if (!sub || !sub.provider_id) continue;
    if (sub.status && sub.status !== 'active') continue;
    const providerKey = String(sub.provider_id).trim();
    const list = byProvider.get(providerKey) || [];
    list.push(sub);
    byProvider.set(providerKey, list);
  }
  return byProvider;
}
