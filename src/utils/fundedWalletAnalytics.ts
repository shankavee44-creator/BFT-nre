import { supabase } from './supabase.ts';
import type { TradingAccount } from '../types/index.ts';
import {
  calculateRealFundedWithdrawalAllowance,
  calculateWithdrawalBreakdown,
  getDynamicAccountLimits,
  isDemoAccount,
  isPersonalLiveAccount,
  isRealFundedAccount,
  normalizeChallengeAccountType,
  REAL_FUNDED_PROFIT_SPLIT_PERCENT,
} from './propRules.ts';
import {
  updateFundedAccountInSupabase,
  mapTradingAccountToFundedStatus,
} from './fundedAccountsSync.ts';

export type FundedWalletStatus = 'ACTIVE' | 'PASSED' | 'SOFT_BREACH' | 'HARD_BREACH';

export interface PurchasedFundedWallet {
  id: string;
  account_id: string;
  user_id: string;
  challenge_type: string;
  account_tier?: 'CHALLENGE' | 'REAL_FUNDED';
  badge_color?: 'red' | 'purple';
  is_real_funded?: boolean;
  principal_locked?: boolean;
  profit_split_percent?: number;
  certificate_unlocked?: boolean;
  certificate_id?: string | null;
  passed_at?: string | null;
  account_status: FundedWalletStatus;
  soft_breach_until: string | null;
  breach_reason: string | null;
  initial_balance: number;
  current_balance: number;
  current_equity: number;
  current_profit_amount: number;
  profit_target_amount: number;
  profit_target_percent: number;
  current_daily_drawdown: number;
  daily_drawdown_limit_amount: number;
  daily_drawdown_limit_percent: number;
  current_max_drawdown: number;
  max_drawdown_limit_amount: number;
  max_drawdown_limit_percent: number;
  completed_profitable_days: number;
  min_profitable_days: number;
  daily_net_profit: number;
  daily_profit_date: string | null;
  last_profitable_day_date: string | null;
  starting_day_balance: number;
  updated_at: string;
  created_at: string;
}

export interface FundedWalletBreachState {
  effectiveStatus: FundedWalletStatus;
  isLaunchBlocked: boolean;
  isHardBreach: boolean;
  isSoftBreach: boolean;
  isPassed: boolean;
  remainingMs: number;
  countdownFormatted: string;
  softBreachUntilIso: string | null;
  breachReason: string | null;
  shouldAutoUnlock: boolean;
}

export const FUNDED_WALLETS_STORAGE_KEY = 'bft_funded_wallets_v1';
export const FUNDED_WALLET_UPDATED_EVENT = 'bft-funded-wallet-updated';
export const DEFAULT_SOFT_BREACH_COOLDOWN_MS = 15 * 60 * 1000; // 15-minute minor rule infraction cooldown
export const PROFITABLE_DAY_THRESHOLD_PERCENT = 1; // 1% of initial balance per calendar day

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unsupportedWalletColumns = new Set<string>();
let remoteFundedWalletsTableAvailable = true;

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

export function getUtcDateKey(ms: number = Date.now()): string {
  return new Date(ms).toISOString().split('T')[0];
}

export function formatBreachCountdown(remainingMs: number): string {
  const safeSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function normalizeFundedWalletStatus(
  rawStatus?: string | null,
  breachType?: string | null
): FundedWalletStatus {
  const clean = String(rawStatus || '').trim().toUpperCase();
  if (clean === 'HARD_BREACH' || clean === 'HARD_BREACHED' || clean === 'HARD-BREACHED' || clean === 'FAILED' || clean === 'BREACHED') {
    return 'HARD_BREACH';
  }
  if (clean === 'SOFT_BREACH' || clean === 'SOFT_BREACHED' || clean === 'SOFT-BREACHED') {
    return 'SOFT_BREACH';
  }
  if (clean === 'PASSED' || clean === 'PASSED_PHASE_1') {
    return 'PASSED';
  }
  if (breachType === 'hard') return 'HARD_BREACH';
  if (breachType === 'soft') return 'SOFT_BREACH';
  return 'ACTIVE';
}

function resolveChallengeTypeLabel(account: TradingAccount): string {
  if (account.tierName && account.tierName.trim()) {
    return account.tierName.trim();
  }
  if (account.isRealFunded || account.is_real_funded || account.phase === 'funded') {
    return 'Real Funded Account';
  }
  const norm = normalizeChallengeAccountType(account.accountType || account.tier);
  if (norm === 'funded_challenge') return 'Funded Challenge';
  return 'Funded Challenge';
}

export function buildInitialFundedWalletFromAccount(
  account: TradingAccount,
  userId?: string,
  existing?: Partial<PurchasedFundedWallet> | null,
  nowMs: number = Date.now()
): PurchasedFundedWallet {
  const limits = getDynamicAccountLimits(
    account.accountType || account.tier,
    account.phase || account.challengePhase,
    {
      dailyDrawdown: account.dailyLossLimitPercent,
      maxDrawdown: account.maxOverallLossPercent,
      profitTarget: account.profitTargetPercent,
    }
  );

  const initialBalance = round2(
    Math.max(0, Number(existing?.initial_balance ?? (account.initialBalance || account.size || account.currentBalance || 0)))
  );
  const currentBalance = round2(
    Math.max(0, Number(account.currentBalance ?? existing?.current_balance ?? initialBalance))
  );
  const currentEquity = round2(
    Math.max(0, Number(account.equity ?? existing?.current_equity ?? currentBalance))
  );

  const profitTargetPercent = round2(
    Number(existing?.profit_target_percent ?? account.profitTargetPercent ?? limits.profitTargetPercent ?? 0)
  );
  const profitTargetAmount = round2(
    Number(
      existing?.profit_target_amount ??
        (profitTargetPercent > 0 ? (initialBalance * profitTargetPercent) / 100 : 0)
    )
  );

  const dailyDrawdownLimitPercent = round2(
    Number(existing?.daily_drawdown_limit_percent ?? account.dailyLossLimitPercent ?? limits.dailyLossLimitPercent ?? 0)
  );
  const dailyDrawdownLimitAmount = round2(
    Number(
      existing?.daily_drawdown_limit_amount ??
        (dailyDrawdownLimitPercent > 0 ? (initialBalance * dailyDrawdownLimitPercent) / 100 : 0)
    )
  );

  const maxDrawdownLimitPercent = round2(
    Number(existing?.max_drawdown_limit_percent ?? account.maxOverallLossPercent ?? limits.maxOverallLossPercent ?? 0)
  );
  const maxDrawdownLimitAmount = round2(
    Number(
      existing?.max_drawdown_limit_amount ??
        (maxDrawdownLimitPercent > 0 ? (initialBalance * maxDrawdownLimitPercent) / 100 : 0)
    )
  );

  const startingDayBalance = round2(
    Number(existing?.starting_day_balance ?? (account.startingDayEquity || currentBalance || initialBalance))
  );

  const currentProfitAmount = round2(
    existing?.current_profit_amount !== undefined
      ? Number(existing.current_profit_amount)
      : currentBalance - initialBalance
  );

  const currentDailyDrawdown = round2(
    existing?.current_daily_drawdown !== undefined
      ? Number(existing.current_daily_drawdown)
      : Math.max(0, startingDayBalance - Math.min(currentBalance, currentEquity))
  );

  const currentMaxDrawdown = round2(
    existing?.current_max_drawdown !== undefined
      ? Number(existing.current_max_drawdown)
      : Math.max(0, initialBalance - Math.min(currentBalance, currentEquity))
  );

  const minProfitableDays = Math.max(
    1,
    Math.round(Number(existing?.min_profitable_days ?? (limits.minProfitableDays > 0 ? limits.minProfitableDays : 5)))
  );

  const completedProfitableDays = Math.max(
    0,
    Math.round(Number(existing?.completed_profitable_days ?? account.tradingDaysCompleted ?? 0))
  );

  const accountStatus = existing?.account_status
    ? normalizeFundedWalletStatus(existing.account_status)
    : normalizeFundedWalletStatus(account.status, account.breachType);

  const softBreachUntil =
    existing?.soft_breach_until ??
    (accountStatus === 'SOFT_BREACH' && account.softBreachResetTime
      ? new Date(account.softBreachResetTime).toISOString()
      : null);

  const breachReason =
    existing?.breach_reason ??
    (accountStatus === 'HARD_BREACH' || accountStatus === 'SOFT_BREACH'
      ? account.breachReason || null
      : null);

  const nowIso = new Date(nowMs).toISOString();
  const todayKey = getUtcDateKey(nowMs);

  const isRealFunded = Boolean(
    existing?.is_real_funded ??
      isRealFundedAccount(account)
  );
  const accountTier: 'CHALLENGE' | 'REAL_FUNDED' = isRealFunded ? 'REAL_FUNDED' : 'CHALLENGE';
  const badgeColor: 'red' | 'purple' = isRealFunded ? 'purple' : 'red';
  const certificateUnlocked = Boolean(
    existing?.certificate_unlocked ||
      account.certificate_unlocked ||
      accountStatus === 'PASSED' ||
      (isRealFunded && Boolean(account.certificateId))
  );
  const certificateId =
    existing?.certificate_id ||
    account.certificateId ||
    (certificateUnlocked ? `BFT-CERT-${account.id}` : null);
  const passedAt =
    existing?.passed_at ||
    account.passed_at ||
    account.passedAt ||
    (accountStatus === 'PASSED' ? nowIso : null);

  return {
    id: String(existing?.id || account.supabaseAccountId || account.id),
    account_id: String(existing?.account_id || account.id),
    user_id: String(existing?.user_id || userId || account.ownerId || 'usr_bft_001'),
    challenge_type: String(existing?.challenge_type || resolveChallengeTypeLabel(account)),
    account_tier: existing?.account_tier || accountTier,
    badge_color: existing?.badge_color || badgeColor,
    is_real_funded: isRealFunded,
    principal_locked: isRealFunded ? true : Boolean(existing?.principal_locked ?? false),
    profit_split_percent: isRealFunded
      ? Number(existing?.profit_split_percent ?? account.profit_split_percent ?? REAL_FUNDED_PROFIT_SPLIT_PERCENT)
      : Number(existing?.profit_split_percent ?? 80),
    certificate_unlocked: certificateUnlocked,
    certificate_id: certificateId,
    passed_at: passedAt,
    account_status: accountStatus,
    soft_breach_until: softBreachUntil,
    breach_reason: breachReason,
    initial_balance: initialBalance,
    current_balance: currentBalance,
    current_equity: currentEquity,
    current_profit_amount: currentProfitAmount,
    profit_target_amount: profitTargetAmount,
    profit_target_percent: profitTargetPercent,
    current_daily_drawdown: currentDailyDrawdown,
    daily_drawdown_limit_amount: dailyDrawdownLimitAmount,
    daily_drawdown_limit_percent: dailyDrawdownLimitPercent,
    current_max_drawdown: currentMaxDrawdown,
    max_drawdown_limit_amount: maxDrawdownLimitAmount,
    max_drawdown_limit_percent: maxDrawdownLimitPercent,
    completed_profitable_days: completedProfitableDays,
    min_profitable_days: minProfitableDays,
    daily_net_profit: round2(Number(existing?.daily_net_profit ?? 0)),
    daily_profit_date: existing?.daily_profit_date ?? todayKey,
    last_profitable_day_date: existing?.last_profitable_day_date ?? null,
    starting_day_balance: startingDayBalance > 0 ? startingDayBalance : initialBalance,
    updated_at: existing?.updated_at || nowIso,
    created_at: existing?.created_at || nowIso,
  };
}

export function normalizeSupabaseFundedWalletRow(
  row: Record<string, any>
): PurchasedFundedWallet {
  const initialBalance = round2(Number(row.initial_balance ?? row.starting_balance ?? 0));
  const currentBalance = round2(Number(row.current_balance ?? initialBalance));
  const currentEquity = round2(Number(row.current_equity ?? row.equity ?? currentBalance));
  const profitTargetPercent = round2(Number(row.profit_target_percent ?? 0));
  const profitTargetAmount = round2(
    Number(
      row.profit_target_amount ??
        (profitTargetPercent > 0 ? (initialBalance * profitTargetPercent) / 100 : 0)
    )
  );
  const dailyDrawdownLimitPercent = round2(Number(row.daily_drawdown_limit_percent ?? 0));
  const dailyDrawdownLimitAmount = round2(
    Number(
      row.daily_drawdown_limit_amount ??
        (dailyDrawdownLimitPercent > 0 ? (initialBalance * dailyDrawdownLimitPercent) / 100 : 0)
    )
  );
  const maxDrawdownLimitPercent = round2(Number(row.max_drawdown_limit_percent ?? 0));
  const maxDrawdownLimitAmount = round2(
    Number(
      row.max_drawdown_limit_amount ??
        (maxDrawdownLimitPercent > 0 ? (initialBalance * maxDrawdownLimitPercent) / 100 : 0)
    )
  );

  const startingDayBalance = round2(
    Number(row.starting_day_balance ?? row.daily_starting_balance ?? initialBalance)
  );

  const isRealFunded = Boolean(row.is_real_funded ?? row.account_tier === 'REAL_FUNDED');
  const normalizedStatus = normalizeFundedWalletStatus(row.account_status ?? row.status);
  const certificateUnlocked = Boolean(
    row.certificate_unlocked ?? (normalizedStatus === 'PASSED')
  );

  return {
    id: String(row.id || row.account_id || ''),
    account_id: String(row.account_id || row.trading_account_id || row.id || ''),
    user_id: String(row.user_id || ''),
    challenge_type: String(row.challenge_type || row.tier_name || 'Funded Challenge'),
    account_tier: isRealFunded ? 'REAL_FUNDED' : 'CHALLENGE',
    badge_color: isRealFunded ? 'purple' : 'red',
    is_real_funded: isRealFunded,
    principal_locked: isRealFunded ? true : Boolean(row.principal_locked ?? false),
    profit_split_percent: isRealFunded
      ? Number(row.profit_split_percent ?? REAL_FUNDED_PROFIT_SPLIT_PERCENT)
      : Number(row.profit_split_percent ?? 80),
    certificate_unlocked: certificateUnlocked,
    certificate_id: row.certificate_id ? String(row.certificate_id) : null,
    passed_at: row.passed_at ? String(row.passed_at) : null,
    account_status: normalizedStatus,
    soft_breach_until: row.soft_breach_until ? String(row.soft_breach_until) : null,
    breach_reason: row.breach_reason ? String(row.breach_reason) : null,
    initial_balance: initialBalance,
    current_balance: currentBalance,
    current_equity: currentEquity,
    current_profit_amount: round2(
      row.current_profit_amount !== undefined
        ? Number(row.current_profit_amount)
        : currentBalance - initialBalance
    ),
    profit_target_amount: profitTargetAmount,
    profit_target_percent: profitTargetPercent,
    current_daily_drawdown: round2(
      row.current_daily_drawdown !== undefined
        ? Number(row.current_daily_drawdown)
        : Math.max(0, startingDayBalance - Math.min(currentBalance, currentEquity))
    ),
    daily_drawdown_limit_amount: dailyDrawdownLimitAmount,
    daily_drawdown_limit_percent: dailyDrawdownLimitPercent,
    current_max_drawdown: round2(
      row.current_max_drawdown !== undefined
        ? Number(row.current_max_drawdown)
        : Math.max(0, initialBalance - Math.min(currentBalance, currentEquity))
    ),
    max_drawdown_limit_amount: maxDrawdownLimitAmount,
    max_drawdown_limit_percent: maxDrawdownLimitPercent,
    completed_profitable_days: Math.max(0, Math.round(Number(row.completed_profitable_days ?? 0))),
    min_profitable_days: Math.max(1, Math.round(Number(row.min_profitable_days ?? 5))),
    daily_net_profit: round2(Number(row.daily_net_profit ?? 0)),
    daily_profit_date: row.daily_profit_date ? String(row.daily_profit_date) : getUtcDateKey(),
    last_profitable_day_date: row.last_profitable_day_date
      ? String(row.last_profitable_day_date)
      : null,
    starting_day_balance: startingDayBalance > 0 ? startingDayBalance : initialBalance,
    updated_at: String(row.updated_at || new Date().toISOString()),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

/**
 * Resolves live breach lock state for a funded account card & terminal launch guard.
 * Automatically unlocks expired SOFT_BREACH locks when `nowMs >= soft_breach_until`.
 */
export function resolveFundedWalletBreachState(
  wallet?: PurchasedFundedWallet | null,
  account?: TradingAccount | null,
  nowMs: number = Date.now()
): FundedWalletBreachState {
  if (account && (isPersonalLiveAccount(account) || isDemoAccount(account))) {
    return {
      effectiveStatus: 'ACTIVE',
      isLaunchBlocked: false,
      isHardBreach: false,
      isSoftBreach: false,
      isPassed: false,
      remainingMs: 0,
      countdownFormatted: '00:00:00',
      softBreachUntilIso: null,
      breachReason: null,
      shouldAutoUnlock: false,
    };
  }

  const walletStatus = wallet ? normalizeFundedWalletStatus(wallet.account_status) : null;
  const accountStatus = account
    ? normalizeFundedWalletStatus(account.status, account.breachType)
    : null;

  const status: FundedWalletStatus =
    walletStatus === 'HARD_BREACH' || accountStatus === 'HARD_BREACH'
      ? 'HARD_BREACH'
      : walletStatus === 'SOFT_BREACH'
      ? 'SOFT_BREACH'
      : accountStatus === 'SOFT_BREACH'
      ? 'SOFT_BREACH'
      : walletStatus === 'PASSED' || accountStatus === 'PASSED'
      ? 'PASSED'
      : 'ACTIVE';

  const breachReason =
    wallet?.breach_reason ||
    account?.breachReason ||
    null;

  if (status === 'HARD_BREACH') {
    return {
      effectiveStatus: 'HARD_BREACH',
      isLaunchBlocked: true,
      isHardBreach: true,
      isSoftBreach: false,
      isPassed: false,
      remainingMs: 0,
      countdownFormatted: '00:00:00',
      softBreachUntilIso: null,
      breachReason:
        breachReason ||
        'Maximum drawdown limit exceeded. Account permanently closed (Hard Breach).',
      shouldAutoUnlock: false,
    };
  }

  if (status === 'SOFT_BREACH') {
    const rawUntil =
      wallet?.soft_breach_until ||
      (account?.softBreachResetTime
        ? new Date(account.softBreachResetTime).toISOString()
        : null);
    const parsedUntilMs = rawUntil ? Date.parse(rawUntil) : NaN;

    if (Number.isFinite(parsedUntilMs)) {
      const remainingMs = Math.max(0, parsedUntilMs - nowMs);
      if (remainingMs > 0) {
        return {
          effectiveStatus: 'SOFT_BREACH',
          isLaunchBlocked: true,
          isHardBreach: false,
          isSoftBreach: true,
          isPassed: false,
          remainingMs,
          countdownFormatted: formatBreachCountdown(remainingMs),
          softBreachUntilIso: new Date(parsedUntilMs).toISOString(),
          breachReason:
            breachReason ||
            'Temporary trading cooldown active due to minor rule infraction.',
          shouldAutoUnlock: false,
        };
      }

      // Timer expired -> automatically unlock & transition back to ACTIVE
      return {
        effectiveStatus: 'ACTIVE',
        isLaunchBlocked: false,
        isHardBreach: false,
        isSoftBreach: false,
        isPassed: false,
        remainingMs: 0,
        countdownFormatted: '00:00:00',
        softBreachUntilIso: null,
        breachReason: null,
        shouldAutoUnlock: true,
      };
    }

    // Soft breach flag without valid timestamp remains locked safely
    return {
      effectiveStatus: 'SOFT_BREACH',
      isLaunchBlocked: true,
      isHardBreach: false,
      isSoftBreach: true,
      isPassed: false,
      remainingMs: 0,
      countdownFormatted: '00:00:00',
      softBreachUntilIso: rawUntil,
      breachReason:
        breachReason ||
        'Temporary trading cooldown active.',
      shouldAutoUnlock: false,
    };
  }

  return {
    effectiveStatus: status,
    isLaunchBlocked: false,
    isHardBreach: false,
    isSoftBreach: false,
    isPassed: status === 'PASSED',
    remainingMs: 0,
    countdownFormatted: '00:00:00',
    softBreachUntilIso: null,
    breachReason: null,
    shouldAutoUnlock: false,
  };
}

/**
 * Pure update when a trade closes on a funded account:
 * - Updates balance, equity, profit, daily drawdown, and max drawdown
 * - Tracks today's net profit and increments `completed_profitable_days` once per calendar day if >= 0.5% of initial balance
 * - Automatically triggers `HARD_BREACH` if daily drawdown or max drawdown limits are exceeded
 * - Triggers `SOFT_BREACH` with temporary cooldown timestamp if a minor rule infraction is supplied
 * - Transitions to `PASSED` when profit target & min profitable days are achieved
 */
export function applyClosedTradeToFundedWallet(
  wallet: PurchasedFundedWallet,
  params: {
    tradePnl: number;
    newBalance?: number;
    newEquity?: number;
    nowMs?: number;
    minorInfractionReason?: string;
    softBreachCooldownMs?: number;
  }
): {
  updatedWallet: PurchasedFundedWallet;
  incrementedProfitableDay: boolean;
  triggeredBreach: 'HARD_BREACH' | 'SOFT_BREACH' | null;
  becamePassed: boolean;
} {
  const nowMs = params.nowMs ?? Date.now();
  const todayKey = getUtcDateKey(nowMs);
  const pnl = round2(Number(params.tradePnl || 0));

  const nextBalance = round2(
    Math.max(
      0,
      params.newBalance !== undefined
        ? Number(params.newBalance)
        : wallet.current_balance + pnl
    )
  );
  const nextEquity = round2(
    Math.max(
      0,
      params.newEquity !== undefined ? Number(params.newEquity) : nextBalance
    )
  );

  const isNewCalendarDay = wallet.daily_profit_date !== todayKey;
  const startingDayBalance = isNewCalendarDay
    ? round2(wallet.current_balance > 0 ? wallet.current_balance : wallet.initial_balance)
    : round2(wallet.starting_day_balance > 0 ? wallet.starting_day_balance : wallet.initial_balance);

  const priorDailyNetProfit = isNewCalendarDay ? 0 : round2(Number(wallet.daily_net_profit || 0));
  const nextDailyNetProfit = round2(priorDailyNetProfit + pnl);

  const currentProfitAmount = round2(nextBalance - wallet.initial_balance);
  const lowPoint = Math.min(nextBalance, nextEquity);

  const currentDailyDrawdown = round2(Math.max(0, startingDayBalance - lowPoint));
  const currentMaxDrawdown = round2(Math.max(0, wallet.initial_balance - lowPoint));

  const thresholdForDay = round2(
    (wallet.initial_balance * PROFITABLE_DAY_THRESHOLD_PERCENT) / 100
  );
  let completedProfitableDays = wallet.completed_profitable_days;
  let lastProfitableDayDate = wallet.last_profitable_day_date;
  let incrementedProfitableDay = false;

  if (
    thresholdForDay > 0 &&
    nextDailyNetProfit >= thresholdForDay &&
    lastProfitableDayDate !== todayKey
  ) {
    completedProfitableDays += 1;
    lastProfitableDayDate = todayKey;
    incrementedProfitableDay = true;
  }

  let nextStatus: FundedWalletStatus = normalizeFundedWalletStatus(wallet.account_status);
  let softBreachUntil = wallet.soft_breach_until;
  let breachReason = wallet.breach_reason;
  let triggeredBreach: 'HARD_BREACH' | 'SOFT_BREACH' | null = null;
  let becamePassed = false;

  // Clear expired soft breach first if cooldown already elapsed
  if (nextStatus === 'SOFT_BREACH' && softBreachUntil) {
    const expMs = Date.parse(softBreachUntil);
    if (Number.isFinite(expMs) && nowMs >= expMs) {
      nextStatus = 'ACTIVE';
      softBreachUntil = null;
      breachReason = null;
    }
  }

  // Never override an existing HARD_BREACH
  if (nextStatus !== 'HARD_BREACH') {
    const dailyExceeded =
      wallet.daily_drawdown_limit_amount > 0 &&
      currentDailyDrawdown >= wallet.daily_drawdown_limit_amount;
    const maxExceeded =
      wallet.max_drawdown_limit_amount > 0 &&
      currentMaxDrawdown >= wallet.max_drawdown_limit_amount;

    if (maxExceeded) {
      nextStatus = 'HARD_BREACH';
      softBreachUntil = null;
      breachReason = `Max Overall Loss Limit Exceeded ($${currentMaxDrawdown.toFixed(2)} / $${wallet.max_drawdown_limit_amount.toFixed(2)} max ${wallet.max_drawdown_limit_percent}%).`;
      triggeredBreach = 'HARD_BREACH';
    } else if (dailyExceeded) {
      nextStatus = 'HARD_BREACH';
      softBreachUntil = null;
      breachReason = `Daily Drawdown Limit Exceeded ($${currentDailyDrawdown.toFixed(2)} / $${wallet.daily_drawdown_limit_amount.toFixed(2)} daily ${wallet.daily_drawdown_limit_percent}%).`;
      triggeredBreach = 'HARD_BREACH';
    } else if (params.minorInfractionReason) {
      const cooldownMs = Math.max(
        1000,
        Number(params.softBreachCooldownMs ?? DEFAULT_SOFT_BREACH_COOLDOWN_MS)
      );
      nextStatus = 'SOFT_BREACH';
      softBreachUntil = new Date(nowMs + cooldownMs).toISOString();
      breachReason = params.minorInfractionReason;
      triggeredBreach = 'SOFT_BREACH';
    } else if (
      !wallet.is_real_funded &&
      nextStatus === 'ACTIVE' &&
      wallet.profit_target_amount > 0 &&
      currentProfitAmount >= wallet.profit_target_amount &&
      completedProfitableDays >= wallet.min_profitable_days
    ) {
      nextStatus = 'PASSED';
      softBreachUntil = null;
      breachReason = null;
      becamePassed = true;
    }
  }

  const nowIso = new Date(nowMs).toISOString();
  const updatedWallet: PurchasedFundedWallet = {
    ...wallet,
    account_status: nextStatus,
    certificate_unlocked: becamePassed ? true : Boolean(wallet.certificate_unlocked),
    certificate_id: becamePassed
      ? wallet.certificate_id || `BFT-CERT-${wallet.account_id}`
      : wallet.certificate_id ?? null,
    passed_at: becamePassed ? nowIso : wallet.passed_at ?? null,
    soft_breach_until: softBreachUntil,
    breach_reason: breachReason,
    current_balance: nextBalance,
    current_equity: nextEquity,
    current_profit_amount: currentProfitAmount,
    current_daily_drawdown: currentDailyDrawdown,
    current_max_drawdown: currentMaxDrawdown,
    completed_profitable_days: completedProfitableDays,
    daily_net_profit: nextDailyNetProfit,
    daily_profit_date: todayKey,
    last_profitable_day_date: lastProfitableDayDate,
    starting_day_balance: startingDayBalance,
    updated_at: nowIso,
  };

  return {
    updatedWallet,
    incrementedProfitableDay,
    triggeredBreach,
    becamePassed,
  };
}

// =========================================================================
// LOCAL MIRROR + REACTIVE CACHE (ENSURES ZERO-LATENCY UI & OFFLINE SUPPORT)
// =========================================================================

export function readLocalFundedWallets(): PurchasedFundedWallet[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FUNDED_WALLETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => normalizeSupabaseFundedWalletRow(item));
  } catch {
    return [];
  }
}

function writeLocalFundedWallets(wallets: PurchasedFundedWallet[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FUNDED_WALLETS_STORAGE_KEY, JSON.stringify(wallets));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(FUNDED_WALLET_UPDATED_EVENT, {
          detail: { wallets },
        })
      );
    }
  } catch {
    // ignore storage quota errors
  }
}

export function saveLocalFundedWallet(wallet: PurchasedFundedWallet): PurchasedFundedWallet[] {
  const existing = readLocalFundedWallets();
  const idx = existing.findIndex(
    (w) =>
      (wallet.account_id && w.account_id === wallet.account_id) ||
      (wallet.id && w.id === wallet.id)
  );
  let next: PurchasedFundedWallet[];
  if (idx >= 0) {
    next = existing.map((item, i) => (i === idx ? wallet : item));
  } else {
    next = [wallet, ...existing];
  }
  writeLocalFundedWallets(next);
  return next;
}

export function findWalletForAccount(
  wallets: PurchasedFundedWallet[],
  account?: TradingAccount | null
): PurchasedFundedWallet | null {
  if (!account || !Array.isArray(wallets) || wallets.length === 0) return null;
  const ids = [account.id, account.supabaseAccountId, account.loginId].filter(
    (v): v is string => Boolean(v && String(v).trim())
  );
  for (const candidate of ids) {
    const match = wallets.find(
      (w) => w.account_id === candidate || w.id === candidate
    );
    if (match) return match;
  }
  return null;
}

export function mergeFundedWalletLists(
  remoteWallets: PurchasedFundedWallet[],
  localWallets: PurchasedFundedWallet[]
): PurchasedFundedWallet[] {
  const byKey = new Map<string, PurchasedFundedWallet>();
  for (const lw of localWallets) {
    const key = lw.account_id || lw.id;
    if (key) byKey.set(key, lw);
  }
  for (const rw of remoteWallets) {
    const key = rw.account_id || rw.id;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, rw);
    } else {
      // Preserve daily net profit tracking from local if remote schema omitted those columns
      byKey.set(key, {
        ...existing,
        ...rw,
        daily_net_profit:
          rw.daily_net_profit !== 0 ? rw.daily_net_profit : existing.daily_net_profit,
        daily_profit_date: rw.daily_profit_date || existing.daily_profit_date,
        last_profitable_day_date:
          rw.last_profitable_day_date || existing.last_profitable_day_date,
        starting_day_balance:
          rw.starting_day_balance > 0 ? rw.starting_day_balance : existing.starting_day_balance,
      });
    }
  }
  return Array.from(byKey.values());
}

// =========================================================================
// SUPABASE `purchased_funded_wallets` CRUD + REALTIME SUBSCRIPTION
// =========================================================================

export interface PersistFundedWalletResult {
  ok: boolean;
  wallet: PurchasedFundedWallet;
  syncedToSupabase: boolean;
  error?: string;
  errorCode?: string;
}

export function extractMissingWalletColumnFromError(error: any): string | null {
  const msg = String(error?.message || error?.details || '');
  const m1 = msg.match(/Could not find the '([^']+)' column/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/column "?([a-zA-Z0-9_]+)"? of relation "?purchased_funded_wallets"? does not exist/i);
  if (m2?.[1]) return m2[1];
  const m3 = msg.match(/column purchased_funded_wallets\.([a-zA-Z0-9_]+) does not exist/i);
  if (m3?.[1]) return m3[1];
  if (
    msg.toLowerCase().includes('relation') &&
    msg.toLowerCase().includes('purchased_funded_wallets') &&
    msg.toLowerCase().includes('does not exist')
  ) {
    remoteFundedWalletsTableAvailable = false;
  }
  return null;
}

export function buildSupabaseWalletPayload(
  wallet: PurchasedFundedWallet,
  extraUnsupportedColumns?: Iterable<string>
): Record<string, any> {
  const full: Record<string, any> = {
    account_id: wallet.account_id,
    user_id: wallet.user_id,
    challenge_type: wallet.challenge_type,
    account_tier: wallet.account_tier || (wallet.is_real_funded ? 'REAL_FUNDED' : 'CHALLENGE'),
    badge_color: wallet.badge_color || (wallet.is_real_funded ? 'purple' : 'red'),
    is_real_funded: Boolean(wallet.is_real_funded),
    principal_locked: Boolean(wallet.principal_locked ?? wallet.is_real_funded),
    profit_split_percent: Number(
      wallet.profit_split_percent ?? (wallet.is_real_funded ? REAL_FUNDED_PROFIT_SPLIT_PERCENT : 80)
    ),
    certificate_unlocked: Boolean(wallet.certificate_unlocked || wallet.account_status === 'PASSED'),
    passed_at: wallet.passed_at ?? null,
    account_status: wallet.account_status,
    soft_breach_until: wallet.soft_breach_until,
    breach_reason: wallet.breach_reason,
    initial_balance: wallet.initial_balance,
    current_balance: wallet.current_balance,
    current_equity: wallet.current_equity,
    current_profit_amount: wallet.current_profit_amount,
    profit_target_amount: wallet.profit_target_amount,
    profit_target_percent: wallet.profit_target_percent,
    current_daily_drawdown: wallet.current_daily_drawdown,
    daily_drawdown_limit_amount: wallet.daily_drawdown_limit_amount,
    daily_drawdown_limit_percent: wallet.daily_drawdown_limit_percent,
    current_max_drawdown: wallet.current_max_drawdown,
    max_drawdown_limit_amount: wallet.max_drawdown_limit_amount,
    max_drawdown_limit_percent: wallet.max_drawdown_limit_percent,
    completed_profitable_days: wallet.completed_profitable_days,
    updated_at: wallet.updated_at || new Date().toISOString(),
    created_at: wallet.created_at || new Date().toISOString(),
  };

  // Only include optional certificate_id when explicitly set (avoids 400 on schemas without certificate_id)
  if (wallet.certificate_id) {
    full.certificate_id = wallet.certificate_id;
  }

  for (const col of Array.from(unsupportedWalletColumns)) {
    delete full[col];
  }
  if (extraUnsupportedColumns) {
    for (const col of extraUnsupportedColumns) {
      delete full[col];
    }
  }
  return full;
}

/**
 * Pure mapper: converts a `purchased_funded_wallets` database record into a full `TradingAccount`
 * so purchased challenge & real funded accounts always hydrate cleanly into the Dashboard and
 * Account Switcher on login/refresh even if `trading_accounts` has no matching row.
 */
export function mapPurchasedFundedWalletToTradingAccount(
  wallet: PurchasedFundedWallet,
  ownerEmail?: string
): TradingAccount {
  const isRealFunded = Boolean(
    wallet.is_real_funded || wallet.account_tier === 'REAL_FUNDED'
  );
  const initialBalance = round2(Math.max(0, Number(wallet.initial_balance || 0))) || 5000;
  const currentBalance = round2(
    Number.isFinite(Number(wallet.current_balance)) ? Number(wallet.current_balance) : initialBalance
  );
  const equity = round2(
    Number.isFinite(Number(wallet.current_equity)) ? Number(wallet.current_equity) : currentBalance
  );
  const limits = getDynamicAccountLimits(
    'funded_challenge',
    isRealFunded ? 'funded' : 'phase_1'
  );

  const rawStatus = normalizeFundedWalletStatus(wallet.account_status);
  const mappedStatus: TradingAccount['status'] =
    rawStatus === 'HARD_BREACH'
      ? 'hard_breached'
      : rawStatus === 'SOFT_BREACH'
      ? 'soft_breached'
      : rawStatus === 'PASSED'
      ? 'passed'
      : 'active';

  const breachType: TradingAccount['breachType'] =
    rawStatus === 'HARD_BREACH'
      ? 'hard'
      : rawStatus === 'SOFT_BREACH'
      ? 'soft'
      : 'none';

  const accountId = String(wallet.account_id || wallet.id || `BFT-CH-${Date.now()}`);
  const createdDate = wallet.created_at
    ? String(wallet.created_at).split('T')[0]
    : new Date().toISOString().split('T')[0];
  const lastActiveDate = wallet.updated_at
    ? String(wallet.updated_at).split('T')[0]
    : createdDate;

  return {
    id: accountId,
    supabaseAccountId: UUID_REGEX.test(String(wallet.id || '')) ? String(wallet.id) : undefined,
    ownerId: wallet.user_id || undefined,
    ownerEmail: ownerEmail || undefined,
    loginId: accountId,
    passwordHash: 'bft_funded_' + accountId.slice(0, 8),
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    tierName:
      wallet.challenge_type && wallet.challenge_type.trim()
        ? wallet.challenge_type.trim()
        : isRealFunded
        ? 'Real Funded Account'
        : 'Funded Challenge',
    account_tier: isRealFunded ? 'REAL_FUNDED' : 'CHALLENGE',
    badge_color: isRealFunded ? 'purple' : 'red',
    isRealFunded,
    is_real_funded: isRealFunded,
    principalLocked: isRealFunded ? true : Boolean(wallet.principal_locked),
    principal_locked: isRealFunded ? true : Boolean(wallet.principal_locked),
    profit_split_percent: Number(
      wallet.profit_split_percent ?? (isRealFunded ? REAL_FUNDED_PROFIT_SPLIT_PERCENT : 80)
    ),
    certificate_unlocked: Boolean(wallet.certificate_unlocked || rawStatus === 'PASSED'),
    certificateId: wallet.certificate_id || undefined,
    passed_at: wallet.passed_at || undefined,
    passedAt: wallet.passed_at || undefined,
    size: initialBalance,
    initialBalance,
    currentBalance,
    startingDayEquity:
      Number(wallet.starting_day_balance) > 0 ? Number(wallet.starting_day_balance) : currentBalance,
    equity,
    dailyLossLimitPercent:
      Number(wallet.daily_drawdown_limit_percent ?? limits.dailyLossLimitPercent) || 0,
    maxOverallLossPercent:
      Number(wallet.max_drawdown_limit_percent || limits.maxOverallLossPercent) || 10,
    profitTargetPercent:
      Number(wallet.profit_target_percent ?? (isRealFunded ? 0 : limits.profitTargetPercent)),
    maxRiskPerTradePercent: limits.maxRiskPerTradePercent || 5,
    status: mappedStatus,
    breachType,
    breachReason: wallet.breach_reason || undefined,
    softBreachResetTime: wallet.soft_breach_until
      ? Date.parse(wallet.soft_breach_until) || undefined
      : undefined,
    phase: isRealFunded ? 'funded' : 'phase_1',
    challengePhase: isRealFunded ? 'funded' : 'phase_1',
    tradingDaysCompleted: Math.max(0, Math.round(Number(wallet.completed_profitable_days || 0))),
    tradesCount: 0,
    winRate: 0,
    createdDate,
    lastActiveDate,
  };
}

async function resolveTargetUserId(explicitUserId?: string): Promise<string> {
  // Always prefer the active Supabase Auth session UUID first so RLS `auth.uid() = user_id` matches.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (session?.user?.id && UUID_REGEX.test(session.user.id)) {
      return session.user.id;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id && UUID_REGEX.test(user.id)) {
      return user.id;
    }
  } catch {
    // ignore
  }
  if (explicitUserId && UUID_REGEX.test(explicitUserId)) return explicitUserId;
  return explicitUserId || 'usr_bft_001';
}

export interface WalletSupabasePersistenceAdapter {
  selectExisting: (accountId: string) => Promise<{ data: any[] | null; error: any }>;
  updateRow: (accountId: string, payload: Record<string, any>) => Promise<{ data: any; error: any }>;
  insertRow: (payload: Record<string, any>) => Promise<{ data: any; error: any }>;
  insertRowPlain: (payload: Record<string, any>) => Promise<{ error: any }>;
}

export async function persistWalletWithAdapter(
  wallet: PurchasedFundedWallet,
  adapter: WalletSupabasePersistenceAdapter,
  options?: {
    unsupportedColumnsSet?: Set<string>;
    maxAttempts?: number;
    skipLocalSave?: boolean;
  }
): Promise<PersistFundedWalletResult> {
  if (!options?.skipLocalSave) {
    saveLocalFundedWallet(wallet);
  }

  if (!remoteFundedWalletsTableAvailable) {
    return {
      ok: false,
      wallet,
      syncedToSupabase: false,
      error: 'Supabase table purchased_funded_wallets is not available.',
      errorCode: 'TABLE_UNAVAILABLE',
    };
  }

  if (!UUID_REGEX.test(wallet.user_id || '')) {
    const msg =
      'No authenticated Supabase user UUID available to persist purchased funded account.';
    return {
      ok: false,
      wallet,
      syncedToSupabase: false,
      error: msg,
      errorCode: 'UNAUTHENTICATED_USER_ID',
    };
  }

  const localUnsupported = options?.unsupportedColumnsSet || unsupportedWalletColumns;
  const maxAttempts = options?.maxAttempts ?? 20;
  let lastErrorMsg = '';
  let lastErrorCode = '';
  let forceUpdateMode = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const payload = buildSupabaseWalletPayload(wallet, localUnsupported);
    try {
      let rowExists = forceUpdateMode;

      if (!forceUpdateMode) {
        const { data: existingRows, error: selErr } = await adapter.selectExisting(
          wallet.account_id
        );

        if (selErr) {
          const missing = extractMissingWalletColumnFromError(selErr);
          if (missing) {
            localUnsupported.add(missing);
            continue;
          }
          // If SELECT is blocked or fails, do not silently abort — attempt INSERT directly.
          rowExists = false;
        } else {
          rowExists = Array.isArray(existingRows) && existingRows.length > 0;
        }
      }

      if (rowExists) {
        const updatePayload = { ...payload };
        delete updatePayload.account_id;
        delete updatePayload.user_id;
        delete updatePayload.created_at;

        const { data: updData, error: updErr } = await adapter.updateRow(
          wallet.account_id,
          updatePayload
        );

        if (updErr) {
          const missing = extractMissingWalletColumnFromError(updErr);
          if (missing) {
            localUnsupported.add(missing);
            continue;
          }
          lastErrorMsg = String(updErr?.message || 'Failed to update purchased_funded_wallets');
          lastErrorCode = String(updErr?.code || 'UPDATE_ERROR');
          return {
            ok: false,
            wallet,
            syncedToSupabase: false,
            error: lastErrorMsg,
            errorCode: lastErrorCode,
          };
        }

        if (updData) {
          const normalized = {
            ...wallet,
            ...normalizeSupabaseFundedWalletRow(updData),
            daily_net_profit: wallet.daily_net_profit,
            daily_profit_date: wallet.daily_profit_date,
            last_profitable_day_date: wallet.last_profitable_day_date,
            starting_day_balance: wallet.starting_day_balance,
          };
          if (!options?.skipLocalSave) {
            saveLocalFundedWallet(normalized);
          }
          return { ok: true, wallet: normalized, syncedToSupabase: true };
        }
        return { ok: true, wallet, syncedToSupabase: true };
      } else {
        const { data: insData, error: insErr } = await adapter.insertRow(payload);

        if (insErr) {
          const missing = extractMissingWalletColumnFromError(insErr);
          if (missing) {
            localUnsupported.add(missing);
            continue;
          }

          const code = String(insErr?.code || '');
          const msgLower = String(insErr?.message || '').toLowerCase();
          if (code === '23505' || msgLower.includes('duplicate key')) {
            forceUpdateMode = true;
            continue;
          }

          // Fallback: if RLS permits INSERT but blocks RETURNING SELECT, try plain insert
          const { error: plainErr } = await adapter.insertRowPlain(payload);
          if (!plainErr) {
            return { ok: true, wallet, syncedToSupabase: true };
          }
          const plainMissing = extractMissingWalletColumnFromError(plainErr);
          if (plainMissing) {
            localUnsupported.add(plainMissing);
            continue;
          }
          if (
            String(plainErr?.code || '') === '23505' ||
            String(plainErr?.message || '').toLowerCase().includes('duplicate key')
          ) {
            forceUpdateMode = true;
            continue;
          }

          lastErrorMsg = String(
            plainErr?.message || insErr?.message || 'Failed to insert purchased_funded_wallets'
          );
          lastErrorCode = String(plainErr?.code || insErr?.code || 'INSERT_ERROR');
          return {
            ok: false,
            wallet,
            syncedToSupabase: false,
            error: lastErrorMsg,
            errorCode: lastErrorCode,
          };
        }

        if (insData) {
          const normalized = {
            ...wallet,
            ...normalizeSupabaseFundedWalletRow(insData),
            daily_net_profit: wallet.daily_net_profit,
            daily_profit_date: wallet.daily_profit_date,
            last_profitable_day_date: wallet.last_profitable_day_date,
            starting_day_balance: wallet.starting_day_balance,
          };
          if (!options?.skipLocalSave) {
            saveLocalFundedWallet(normalized);
          }
          return { ok: true, wallet: normalized, syncedToSupabase: true };
        }
        return { ok: true, wallet, syncedToSupabase: true };
      }
    } catch (err: any) {
      lastErrorMsg = String(err?.message || 'Unexpected Supabase error persisting funded wallet');
      lastErrorCode = String(err?.code || 'EXCEPTION');
      return {
        ok: false,
        wallet,
        syncedToSupabase: false,
        error: lastErrorMsg,
        errorCode: lastErrorCode,
      };
    }
  }

  return {
    ok: false,
    wallet,
    syncedToSupabase: false,
    error:
      lastErrorMsg ||
      'Exceeded maximum schema adaptation attempts while saving to purchased_funded_wallets.',
    errorCode: lastErrorCode || 'MAX_ATTEMPTS_EXCEEDED',
  };
}

export async function persistWalletToSupabaseWithResult(
  wallet: PurchasedFundedWallet
): Promise<PersistFundedWalletResult> {
  const result = await persistWalletWithAdapter(wallet, {
    selectExisting: async (accountId) => {
      const { data, error } = await supabase
        .from('purchased_funded_wallets')
        .select('id, account_id')
        .eq('account_id', accountId)
        .limit(1);
      return { data, error };
    },
    updateRow: async (accountId, updatePayload) => {
      const { data, error } = await supabase
        .from('purchased_funded_wallets')
        .update(updatePayload)
        .eq('account_id', accountId)
        .select('*')
        .maybeSingle();
      return { data, error };
    },
    insertRow: async (payload) => {
      const { data, error } = await supabase
        .from('purchased_funded_wallets')
        .insert([payload])
        .select('*')
        .maybeSingle();
      return { data, error };
    },
    insertRowPlain: async (payload) => {
      const { error } = await supabase.from('purchased_funded_wallets').insert([payload]);
      return { error };
    },
  });

  if (!result.ok) {
    console.error('[Supabase purchased_funded_wallets] Persist failed:', {
      accountId: wallet.account_id,
      userId: wallet.user_id,
      code: result.errorCode,
      error: result.error,
    });
  }
  return result;
}

async function persistWalletToSupabase(wallet: PurchasedFundedWallet): Promise<PurchasedFundedWallet> {
  const res = await persistWalletToSupabaseWithResult(wallet);
  return res.wallet;
}

/**
 * Inserts (or ensures) initial rule parameters into `purchased_funded_wallets` whenever
 * a funded or challenge evaluation account is purchased or provisioned, returning full
 * Supabase sync status and error diagnostics.
 */
export async function insertPurchasedFundedWalletWithResult(
  account: TradingAccount,
  userId?: string
): Promise<PersistFundedWalletResult | null> {
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return null;
  }

  const resolvedUid = await resolveTargetUserId(userId || account.ownerId);
  const existingLocal = findWalletForAccount(readLocalFundedWallets(), account);
  const initialWallet = buildInitialFundedWalletFromAccount(account, resolvedUid, existingLocal);
  initialWallet.user_id = resolvedUid;

  return persistWalletToSupabaseWithResult(initialWallet);
}

/**
 * Inserts (or ensures) initial rule parameters into `purchased_funded_wallets` whenever
 * a funded or challenge evaluation account is purchased or provisioned.
 */
export async function insertPurchasedFundedWallet(
  account: TradingAccount,
  userId?: string
): Promise<PurchasedFundedWallet | null> {
  const res = await insertPurchasedFundedWalletWithResult(account, userId);
  return res ? res.wallet : null;
}

/**
 * Updates `purchased_funded_wallets` whenever a trade closes on a funded/prop account,
 * including profitable trading day verification (>= 0.5% net daily profit) and automatic
 * HARD_BREACH / SOFT_BREACH evaluation.
 */
export async function syncFundedWalletOnTradeClose(params: {
  account: TradingAccount;
  tradePnl: number;
  userId?: string;
  nowMs?: number;
  minorInfractionReason?: string;
  softBreachCooldownMs?: number;
}): Promise<{
  wallet: PurchasedFundedWallet | null;
  incrementedProfitableDay: boolean;
  triggeredBreach: 'HARD_BREACH' | 'SOFT_BREACH' | null;
  becamePassed: boolean;
}> {
  const { account } = params;
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return {
      wallet: null,
      incrementedProfitableDay: false,
      triggeredBreach: null,
      becamePassed: false,
    };
  }

  const nowMs = params.nowMs ?? Date.now();
  const resolvedUid = await resolveTargetUserId(params.userId || account.ownerId);
  const existingLocal = findWalletForAccount(readLocalFundedWallets(), account);

  let baseWallet = buildInitialFundedWalletFromAccount(account, resolvedUid, existingLocal, nowMs);

  // Try fetching latest remote row first so completed_profitable_days / limits remain authoritative
  if (remoteFundedWalletsTableAvailable) {
    try {
      const { data } = await supabase
        .from('purchased_funded_wallets')
        .select('*')
        .eq('account_id', account.id)
        .maybeSingle();
      if (data) {
        const remote = normalizeSupabaseFundedWalletRow(data);
        baseWallet = {
          ...baseWallet,
          ...remote,
          daily_net_profit:
            remote.daily_net_profit !== 0 ? remote.daily_net_profit : baseWallet.daily_net_profit,
          daily_profit_date: remote.daily_profit_date || baseWallet.daily_profit_date,
          last_profitable_day_date:
            remote.last_profitable_day_date || baseWallet.last_profitable_day_date,
          starting_day_balance:
            remote.starting_day_balance > 0
              ? remote.starting_day_balance
              : baseWallet.starting_day_balance,
        };
      }
    } catch {
      // fallback to baseWallet
    }
  }

  const applied = applyClosedTradeToFundedWallet(baseWallet, {
    tradePnl: params.tradePnl,
    newBalance: account.currentBalance,
    newEquity: account.equity,
    nowMs,
    minorInfractionReason: params.minorInfractionReason,
    softBreachCooldownMs: params.softBreachCooldownMs,
  });

  const saved = await persistWalletToSupabase(applied.updatedWallet);

  // Also keep public.funded_accounts current_balance & status in sync
  const nextDbStatus =
    applied.triggeredBreach === 'HARD_BREACH'
      ? 'Breached'
      : applied.triggeredBreach === 'SOFT_BREACH'
      ? 'Soft Breached'
      : applied.becamePassed
      ? 'Passed'
      : mapTradingAccountToFundedStatus(account);
  updateFundedAccountInSupabase({
    accountId: account.id,
    supabaseAccountId: account.supabaseAccountId,
    fundedAccountId: account.fundedAccountId,
    currentBalance: applied.updatedWallet.current_balance,
    status: nextDbStatus,
  }).catch(() => {});

  return {
    wallet: saved,
    incrementedProfitableDay: applied.incrementedProfitableDay,
    triggeredBreach: applied.triggeredBreach,
    becamePassed: applied.becamePassed,
  };
}

/**
 * Triggers a HARD_BREACH or temporary SOFT_BREACH with cooldown timestamp on `purchased_funded_wallets`.
 */
export async function syncFundedWalletBreachState(params: {
  account: TradingAccount;
  status: FundedWalletStatus;
  breachReason?: string | null;
  softBreachUntilIso?: string | null;
  userId?: string;
  nowMs?: number;
}): Promise<PurchasedFundedWallet | null> {
  const { account } = params;
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return null;
  }

  const nowMs = params.nowMs ?? Date.now();
  const resolvedUid = await resolveTargetUserId(params.userId || account.ownerId);
  const existingLocal = findWalletForAccount(readLocalFundedWallets(), account);
  const baseWallet = buildInitialFundedWalletFromAccount(account, resolvedUid, existingLocal, nowMs);

  const nowIso = new Date(nowMs).toISOString();
  const nextWallet: PurchasedFundedWallet = {
    ...baseWallet,
    account_status: params.status,
    certificate_unlocked:
      params.status === 'PASSED' ? true : Boolean(baseWallet.certificate_unlocked),
    certificate_id:
      params.status === 'PASSED'
        ? baseWallet.certificate_id || account.certificateId || `BFT-CERT-${account.id}`
        : baseWallet.certificate_id ?? null,
    passed_at:
      params.status === 'PASSED'
        ? baseWallet.passed_at || account.passed_at || nowIso
        : baseWallet.passed_at ?? null,
    soft_breach_until:
      params.status === 'SOFT_BREACH'
        ? params.softBreachUntilIso ||
          new Date(nowMs + DEFAULT_SOFT_BREACH_COOLDOWN_MS).toISOString()
        : null,
    breach_reason:
      params.status === 'ACTIVE' || params.status === 'PASSED'
        ? null
        : params.breachReason ?? baseWallet.breach_reason,
    current_balance: round2(account.currentBalance),
    current_equity: round2(account.equity),
    current_profit_amount: round2(account.currentBalance - baseWallet.initial_balance),
    current_daily_drawdown: round2(
      Math.max(0, baseWallet.starting_day_balance - Math.min(account.currentBalance, account.equity))
    ),
    current_max_drawdown: round2(
      Math.max(0, baseWallet.initial_balance - Math.min(account.currentBalance, account.equity))
    ),
    updated_at: nowIso,
  };

  const fundedStatus =
    params.status === 'HARD_BREACH'
      ? 'Breached'
      : params.status === 'SOFT_BREACH'
      ? 'Soft Breached'
      : params.status === 'PASSED'
      ? 'Passed'
      : account.isRealFunded || account.is_real_funded
      ? 'Real Funded'
      : 'Challenge';

  updateFundedAccountInSupabase({
    accountId: account.id,
    supabaseAccountId: account.supabaseAccountId,
    fundedAccountId: account.fundedAccountId,
    currentBalance: nextWallet.current_balance,
    status: fundedStatus,
  }).catch(() => {});

  return persistWalletToSupabase(nextWallet);
}

/**
 * Automatically resets an expired SOFT_BREACH wallet back to ACTIVE in both local cache and Supabase.
 */
export async function clearExpiredSoftBreachInFundedWallet(
  wallet: PurchasedFundedWallet,
  nowMs: number = Date.now()
): Promise<PurchasedFundedWallet> {
  const updated: PurchasedFundedWallet = {
    ...wallet,
    account_status: 'ACTIVE',
    soft_breach_until: null,
    breach_reason: null,
    starting_day_balance: round2(wallet.current_balance > 0 ? wallet.current_balance : wallet.initial_balance),
    updated_at: new Date(nowMs).toISOString(),
  };
  return persistWalletToSupabase(updated);
}

/**
 * Fetches all funded wallet rows belonging to the user from Supabase `purchased_funded_wallets`,
 * merged seamlessly with any locally mirrored rows.
 */
export async function fetchFundedWalletsForUser(
  userId?: string
): Promise<PurchasedFundedWallet[]> {
  const localWallets = readLocalFundedWallets();
  if (!remoteFundedWalletsTableAvailable) {
    return localWallets;
  }

  try {
    const candidateUserIds = new Set<string>();
    if (userId) candidateUserIds.add(userId);
    const {
      data: { session },
    } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (session?.user?.id) candidateUserIds.add(session.user.id);
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id) candidateUserIds.add(user.id);

    const uuids = Array.from(candidateUserIds).filter((id) => UUID_REGEX.test(id));
    if (uuids.length === 0) {
      return localWallets;
    }

    let { data, error } = await supabase
      .from('purchased_funded_wallets')
      .select('*')
      .in('user_id', uuids)
      .order('created_at', { ascending: false });

    if (error) {
      extractMissingWalletColumnFromError(error);
      // Fallback query without order in case schema lacks created_at
      const fallbackRes = await supabase
        .from('purchased_funded_wallets')
        .select('*')
        .in('user_id', uuids);
      if (fallbackRes.error) {
        console.error('[Supabase purchased_funded_wallets] Fetch failed:', {
          uuids,
          code: fallbackRes.error.code,
          error: fallbackRes.error.message,
        });
        return localWallets;
      }
      data = fallbackRes.data;
    }

    const remoteWallets = Array.isArray(data)
      ? data.map((row) => normalizeSupabaseFundedWalletRow(row))
      : [];

    const merged = mergeFundedWalletLists(remoteWallets, localWallets);
    if (merged.length > 0) {
      writeLocalFundedWallets(merged);
    }
    return merged;
  } catch (err: any) {
    console.error('[Supabase purchased_funded_wallets] Fetch exception:', err?.message || err);
    return localWallets;
  }
}

/**
 * Ensures initial `purchased_funded_wallets` entries exist for a user's funded accounts.
 */
export async function ensureFundedWalletsForAccounts(
  accounts: TradingAccount[],
  userId?: string
): Promise<PurchasedFundedWallet[]> {
  const fundedAccounts = accounts.filter(
    (a) => a && !isPersonalLiveAccount(a) && !isDemoAccount(a)
  );
  if (fundedAccounts.length === 0) {
    return readLocalFundedWallets();
  }

  const existing = readLocalFundedWallets();
  for (const acc of fundedAccounts) {
    const found = findWalletForAccount(existing, acc);
    if (!found) {
      const initial = buildInitialFundedWalletFromAccount(acc, userId || acc.ownerId);
      saveLocalFundedWallet(initial);
      // Best-effort non-blocking remote seed if not yet in Supabase
      persistWalletToSupabase(initial).catch(() => {});
    }
  }
  return readLocalFundedWallets();
}

/**
 * Subscribes in real time to `purchased_funded_wallets` (`postgres_changes`) AND local storage
 * updates so Dashboard cards and Analytics modals update immediately as trades close.
 */
export function subscribePurchasedFundedWalletsRealtime(params: {
  userId?: string;
  accountId?: string;
  onWalletsChanged: (wallets: PurchasedFundedWallet[]) => void;
}): () => void {
  let isDisposed = false;

  const emitMerged = () => {
    if (isDisposed) return;
    params.onWalletsChanged(readLocalFundedWallets());
  };

  // Emit immediate cached snapshot
  emitMerged();

  // Fetch remote snapshot
  fetchFundedWalletsForUser(params.userId).then((wallets) => {
    if (!isDisposed) {
      params.onWalletsChanged(wallets);
    }
  });

  const handleLocalEvent = () => {
    emitMerged();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(FUNDED_WALLET_UPDATED_EVENT, handleLocalEvent);
  }

  const filterConfig: Record<string, any> = {
    event: '*',
    schema: 'public',
    table: 'purchased_funded_wallets',
  };
  if (params.accountId) {
    filterConfig.filter = `account_id=eq.${params.accountId}`;
  }

  const channel = supabase
    .channel(`realtime:purchased_funded_wallets:${params.accountId || params.userId || 'all'}:${Date.now()}`)
    .on('postgres_changes', filterConfig as any, (payload) => {
      if (isDisposed) return;
      const newRow = (payload.new as Record<string, any>) || null;
      if (newRow && (newRow.account_id || newRow.id)) {
        const normalized = normalizeSupabaseFundedWalletRow(newRow);
        const updated = saveLocalFundedWallet(normalized);
        params.onWalletsChanged(updated);
      } else {
        fetchFundedWalletsForUser(params.userId).then((wallets) => {
          if (!isDisposed) params.onWalletsChanged(wallets);
        });
      }
    })
    .subscribe();

  return () => {
    isDisposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener(FUNDED_WALLET_UPDATED_EVENT, handleLocalEvent);
    }
    supabase.removeChannel(channel).catch(() => {});
  };
}

export interface LiveFundedAccountMetrics {
  accountId: string;
  tierLabel: string;
  isRealFunded: boolean;
  principalLocked: boolean;
  initialBalance: number;
  currentBalance: number;
  liveEquity: number;
  netProfit: number;
  netProfitPercent: number;
  profitSplitPercent: number;
  maxWithdrawableProfit: number;
  scalingActive: boolean;
  dailyDrawdownUsed: number;
  dailyDrawdownLimit: number;
  dailyDrawdownLimitPercent: number;
  dailyDrawdownRatio: number;
  maxDrawdownUsed: number;
  maxDrawdownLimit: number;
  maxDrawdownLimitPercent: number;
  maxDrawdownRatio: number;
  completedProfitableDays: number;
  minProfitableDays: number;
  qualifyingDayThresholdUsd: number;
}

export function formatChallengeTierLabel(account?: Partial<TradingAccount> | null): string {
  const size = Math.max(0, Number(account?.size || account?.initialBalance || 0));
  const formattedSize = size > 0 ? `$${size.toLocaleString('en-US')}` : 'Funded';
  if (
    account?.account_tier === 'REAL_FUNDED' ||
    account?.isRealFunded ||
    account?.is_real_funded ||
    account?.phase === 'funded'
  ) {
    return `${formattedSize} Real Funded`;
  }
  return `${formattedSize} Funded Challenge`;
}

export function resolveLiveFundedAccountMetrics(
  account?: TradingAccount | null,
  wallet?: PurchasedFundedWallet | null
): LiveFundedAccountMetrics {
  const r2 = (n: number): number => (Number.isFinite(n) ? Number(n.toFixed(2)) : 0);

  const initialBalance = r2(
    Math.max(
      0,
      Number(
        wallet?.initial_balance ??
          account?.initialBalance ??
          account?.size ??
          account?.currentBalance ??
          0
      )
    )
  );
  const currentBalance = r2(
    Math.max(0, Number(wallet?.current_balance ?? account?.currentBalance ?? initialBalance))
  );
  const liveEquity = r2(
    Math.max(0, Number(wallet?.current_equity ?? account?.equity ?? currentBalance))
  );
  const netProfit = r2(currentBalance - initialBalance);
  const netProfitPercent =
    initialBalance > 0 ? r2((netProfit / initialBalance) * 100) : 0;

  const isPersonal = isPersonalLiveAccount(account);
  const realFunded = Boolean(wallet?.is_real_funded || isRealFundedAccount(account));
  const allowance = calculateRealFundedWithdrawalAllowance(
    account
      ? {
          ...account,
          initialBalance,
          currentBalance,
          isRealFunded: realFunded,
          is_real_funded: realFunded,
          account_tier: realFunded ? 'REAL_FUNDED' : account.account_tier,
          profit_split_percent:
            wallet?.profit_split_percent ?? account.profit_split_percent ?? REAL_FUNDED_PROFIT_SPLIT_PERCENT,
        }
      : null
  );
  const breakdown = calculateWithdrawalBreakdown(
    1000,
    Number(account?.monthsCompleted ?? 1),
    isPersonal,
    realFunded
  );
  const profitSplitPercent = isPersonal
    ? 100
    : realFunded
    ? allowance.profitSplitPercent
    : account?.scalingActive
    ? 90
    : breakdown.profitSplitPercent;
  const principalLocked = realFunded ? allowance.principalLocked : false;
  const maxWithdrawableProfit = isPersonal
    ? currentBalance
    : realFunded
    ? allowance.maxWithdrawableProfit
    : 0;

  const dailyDrawdownLimitPercent = r2(
    Number(wallet?.daily_drawdown_limit_percent ?? account?.dailyLossLimitPercent ?? 0)
  );
  const dailyDrawdownLimit = r2(
    Number(
      wallet?.daily_drawdown_limit_amount ??
        (dailyDrawdownLimitPercent > 0 ? (initialBalance * dailyDrawdownLimitPercent) / 100 : 0)
    )
  );
  const dailyDrawdownUsed = r2(
    Math.max(
      0,
      Number(
        wallet?.current_daily_drawdown ??
          Math.max(
            0,
            (account?.startingDayEquity || initialBalance) - Math.min(currentBalance, liveEquity)
          )
      )
    )
  );
  const dailyDrawdownRatio =
    dailyDrawdownLimit > 0
      ? Math.min(100, Math.max(0, r2((dailyDrawdownUsed / dailyDrawdownLimit) * 100)))
      : 0;

  const maxDrawdownLimitPercent = r2(
    Number(wallet?.max_drawdown_limit_percent ?? account?.maxOverallLossPercent ?? 10)
  );
  const maxDrawdownLimit = r2(
    Number(
      wallet?.max_drawdown_limit_amount ??
        (maxDrawdownLimitPercent > 0 ? (initialBalance * maxDrawdownLimitPercent) / 100 : 0)
    )
  );
  const maxDrawdownUsed = r2(
    Math.max(
      0,
      Number(
        wallet?.current_max_drawdown ??
          Math.max(0, initialBalance - Math.min(currentBalance, liveEquity))
      )
    )
  );
  const maxDrawdownRatio =
    maxDrawdownLimit > 0
      ? Math.min(100, Math.max(0, r2((maxDrawdownUsed / maxDrawdownLimit) * 100)))
      : 0;

  const completedProfitableDays = Math.max(
    0,
    Math.round(Number(wallet?.completed_profitable_days ?? account?.tradingDaysCompleted ?? 0))
  );
  const minProfitableDays = Math.max(1, Math.round(Number(wallet?.min_profitable_days ?? 5)));
  const qualifyingDayThresholdUsd = r2(
    (initialBalance * PROFITABLE_DAY_THRESHOLD_PERCENT) / 100
  );

  const tierLabel =
    wallet?.challenge_type ||
    account?.tierName ||
    formatChallengeTierLabel(account);

  return {
    accountId: String(wallet?.account_id || account?.id || ''),
    tierLabel,
    isRealFunded: realFunded,
    principalLocked,
    initialBalance,
    currentBalance,
    liveEquity,
    netProfit,
    netProfitPercent,
    profitSplitPercent,
    maxWithdrawableProfit,
    scalingActive: profitSplitPercent >= 90,
    dailyDrawdownUsed,
    dailyDrawdownLimit,
    dailyDrawdownLimitPercent,
    dailyDrawdownRatio,
    maxDrawdownUsed,
    maxDrawdownLimit,
    maxDrawdownLimitPercent,
    maxDrawdownRatio,
    completedProfitableDays,
    minProfitableDays,
    qualifyingDayThresholdUsd,
  };
}

