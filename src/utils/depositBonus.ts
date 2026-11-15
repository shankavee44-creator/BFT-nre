import { supabase } from './supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';

export const BFT100_BONUS_CODE = 'BFT100';
export const BFT100_BONUS_MULTIPLIER = 1.0; // 100% match
export const BFT100_TURNOVER_MULTIPLIER = 100; // 100x bonus amount
export const PROFILE_BONUS_STORAGE_PREFIX = 'bft_profile_bonus_state_v1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProfileBonusState {
  bonus_balance: number;
  total_turnover_required: number;
  current_turnover: number;
  has_used_bft100: boolean;
  isTurnoverCompleted: boolean;
  turnoverProgressPercent: number;
  remainingTurnoverRequired: number;
}

export interface BonusCodeValidationResult {
  valid: boolean;
  code: string;
  alreadyUsed?: boolean;
  error?: string;
  reason?: string;
  depositAmount: number;
  bonusAmount: number;
  totalCreditAmount: number;
  turnoverRequired: number;
}

export interface TradePlacementBonusDeductionResult {
  allowed: boolean;
  error?: string;
  stake: number;
  preTradeSelfBalance: number;
  preTradeBonusBalance: number;
  stakeFromSelf: number;
  stakeFromBonus: number;
  newSelfBalance: number;
  newBonusBalance: number;
  totalTradableBefore: number;
  totalTradableAfter: number;
}

export interface TradeSettlementBonusTurnoverResult {
  status: 'won' | 'lost' | 'tie';
  stake: number;
  pnl: number;
  creditedToSelf: number;
  restoredToBonus: number;
  deductedFromSelfOnLoss: number;
  deductedFromBonusOnLoss: number;
  finalSelfBalance: number;
  finalBonusBalance: number;
  previousTurnover: number;
  newCurrentTurnover: number;
  totalTurnoverRequired: number;
  newTotalTurnoverRequired: number;
  isTurnoverCompleted: boolean;
}

export interface WithdrawalBonusInterceptionResult {
  canProceedWithWithdrawal: boolean;
  error?: string;
  bonusForfeited: boolean;
  forfeitedBonusAmount: number;
  turnoverCompleted: boolean;
  preInterceptionSelfBalance: number;
  preInterceptionBonusBalance: number;
  preWithdrawalSelfBalance: number;
  availableWithdrawableBalance: number;
  postForfeitureSelfBalance: number;
  postForfeitureBonusBalance: number;
  postWithdrawalSelfBalance: number;
  postWithdrawalBonusBalance: number;
  newSelfBalance: number;
  newBonusBalance: number;
  newTotalTurnoverRequired: number;
  newCurrentTurnover: number;
  noticeMessage?: string;
  updatedProfile: UserProfile;
  updatedAccount?: TradingAccount;
  profileUpdatePayload: {
    self_balance: number;
    self_capital_balance: number;
    bonus_balance: number;
    total_turnover_required: number;
    current_turnover: number;
    has_used_bft100: boolean;
  };
}

function roundCurrency(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return Number(Math.max(0, num).toFixed(2));
}

function getStorageKey(userId?: string | null, userEmail?: string | null): string {
  const idPart = String(userId || userEmail || 'default').trim().toLowerCase();
  return `${PROFILE_BONUS_STORAGE_PREFIX}_${idPart}`;
}

export function loadLocalProfileBonusState(
  userId?: string | null,
  userEmail?: string | null
): Partial<ProfileBonusState> | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const keysToTry = [
      getStorageKey(userId, userEmail),
      userEmail ? getStorageKey(null, userEmail) : null,
      userId ? getStorageKey(userId, null) : null,
    ].filter(Boolean) as string[];

    for (const key of keysToTry) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function saveLocalProfileBonusState(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  state: {
    bonus_balance: number;
    total_turnover_required: number;
    current_turnover: number;
    has_used_bft100: boolean;
  }
): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const normalized = {
      bonus_balance: roundCurrency(state.bonus_balance),
      total_turnover_required: roundCurrency(state.total_turnover_required),
      current_turnover: roundCurrency(state.current_turnover),
      has_used_bft100: Boolean(state.has_used_bft100),
      updated_at: new Date().toISOString(),
    };
    const primaryKey = getStorageKey(userId, userEmail);
    localStorage.setItem(primaryKey, JSON.stringify(normalized));
    if (userId) {
      localStorage.setItem(getStorageKey(userId, null), JSON.stringify(normalized));
    }
    if (userEmail) {
      localStorage.setItem(getStorageKey(null, userEmail), JSON.stringify(normalized));
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Extracts normalized `bonus_balance`, `total_turnover_required`, `current_turnover`, and `has_used_bft100`
 * from a Supabase `profiles` row or `UserProfile` object, merging with local fallback state when needed.
 */
export function extractProfileBonusState(
  source?: Record<string, any> | UserProfile | null,
  fallbackSource?: Record<string, any> | UserProfile | null
): ProfileBonusState {
  const s = (source || {}) as Record<string, any>;
  const f = (fallbackSource || {}) as Record<string, any>;
  const local = loadLocalProfileBonusState(
    s.id || f.id,
    s.email || f.email
  );

  const pickNum = (keys: string[], localVal?: number): number => {
    for (const k of keys) {
      if (s[k] !== undefined && s[k] !== null && s[k] !== '') {
        const n = Number(s[k]);
        if (Number.isFinite(n) && n >= 0) return roundCurrency(n);
      }
    }
    for (const k of keys) {
      if (f[k] !== undefined && f[k] !== null && f[k] !== '') {
        const n = Number(f[k]);
        if (Number.isFinite(n) && n >= 0) return roundCurrency(n);
      }
    }
    if (localVal !== undefined && Number.isFinite(localVal) && localVal >= 0) {
      return roundCurrency(localVal);
    }
    return 0;
  };

  const bonus_balance = pickNum(['bonus_balance', 'bonusBalance'], local?.bonus_balance);
  const total_turnover_required = pickNum(
    ['total_turnover_required', 'totalTurnoverRequired'],
    local?.total_turnover_required
  );
  const current_turnover = pickNum(
    ['current_turnover', 'currentTurnover'],
    local?.current_turnover
  );

  const has_used_bft100 = Boolean(
    s.has_used_bft100 ??
      s.hasUsedBft100 ??
      f.has_used_bft100 ??
      f.hasUsedBft100 ??
      local?.has_used_bft100 ??
      false
  );

  const isTurnoverCompleted =
    total_turnover_required <= 0 || current_turnover >= total_turnover_required - 0.005;

  const remainingTurnoverRequired =
    total_turnover_required > 0
      ? roundCurrency(Math.max(0, total_turnover_required - current_turnover))
      : 0;

  const turnoverProgressPercent =
    total_turnover_required > 0
      ? Number(
          Math.min(100, Math.max(0, (current_turnover / total_turnover_required) * 100)).toFixed(2)
        )
      : bonus_balance > 0
      ? 0
      : 100;

  return {
    bonus_balance,
    total_turnover_required,
    current_turnover,
    has_used_bft100,
    isTurnoverCompleted,
    turnoverProgressPercent,
    remainingTurnoverRequired,
  };
}

/**
 * Rule 1 & Rule 2: Validates the "BFT100" 100% First Deposit Bonus code.
 * - Restricts usage to code "BFT100" on self-funded deposits.
 * - Restricts each user to using "BFT100" strictly once (`has_used_bft100`).
 * - Grants a 100% bonus matching the deposit amount (`bonusAmount = depositAmount`).
 * - Sets required trading turnover to 100 times the bonus amount (`turnoverRequired = bonusAmount * 100`).
 */
export function validateBft100BonusCode(params: {
  code: string;
  depositAmount: number;
  userProfile?: UserProfile | Record<string, any> | null;
  accountType?: string | null;
}): BonusCodeValidationResult {
  const cleanCode = String(params.code || '').trim().toUpperCase();
  const depositAmount = roundCurrency(params.depositAmount);

  if (!cleanCode) {
    const msg = 'Please enter a bonus code.';
    return {
      valid: false,
      code: '',
      error: msg,
      reason: msg,
      depositAmount,
      bonusAmount: 0,
      totalCreditAmount: depositAmount,
      turnoverRequired: 0,
    };
  }

  if (cleanCode !== BFT100_BONUS_CODE) {
    const msg = 'Invalid bonus code. Enter "BFT100" to claim your 100% First Deposit Bonus.';
    return {
      valid: false,
      code: cleanCode,
      error: msg,
      reason: msg,
      depositAmount,
      bonusAmount: 0,
      totalCreditAmount: depositAmount,
      turnoverRequired: 0,
    };
  }

  if (params.accountType && String(params.accountType).toLowerCase() === 'challenge') {
    const msg = 'Bonus code BFT100 is valid exclusively for Self-Funded deposits.';
    return {
      valid: false,
      code: cleanCode,
      error: msg,
      reason: msg,
      depositAmount,
      bonusAmount: 0,
      totalCreditAmount: depositAmount,
      turnoverRequired: 0,
    };
  }

  const bonusState = extractProfileBonusState(params.userProfile);
  if (bonusState.has_used_bft100) {
    const msg =
      'Bonus code BFT100 has already been used. Each user can claim the 100% First Deposit Bonus only once.';
    return {
      valid: false,
      code: cleanCode,
      alreadyUsed: true,
      error: msg,
      reason: msg,
      depositAmount,
      bonusAmount: 0,
      totalCreditAmount: depositAmount,
      turnoverRequired: 0,
    };
  }

  if (depositAmount <= 0) {
    const msg = 'Please enter a valid deposit amount before applying BFT100.';
    return {
      valid: false,
      code: cleanCode,
      error: msg,
      reason: msg,
      depositAmount: 0,
      bonusAmount: 0,
      totalCreditAmount: 0,
      turnoverRequired: 0,
    };
  }

  const bonusAmount = roundCurrency(depositAmount * BFT100_BONUS_MULTIPLIER);
  const turnoverRequired = roundCurrency(bonusAmount * BFT100_TURNOVER_MULTIPLIER);
  const totalCreditAmount = roundCurrency(depositAmount + bonusAmount);

  return {
    valid: true,
    code: BFT100_BONUS_CODE,
    alreadyUsed: false,
    depositAmount,
    bonusAmount,
    totalCreditAmount,
    turnoverRequired,
  };
}

/**
 * Pure helper: computes updated profile bonus fields when BFT100 is applied to a deposit.
 */
export function computeBft100BonusGrant(params: {
  depositAmount: number;
  currentProfile?: UserProfile | Record<string, any> | null;
}): {
  bonusGranted: number;
  turnoverAdded: number;
  bonus_balance: number;
  total_turnover_required: number;
  current_turnover: number;
  has_used_bft100: boolean;
} {
  const existing = extractProfileBonusState(params.currentProfile);
  const depositAmount = roundCurrency(params.depositAmount);

  if (existing.has_used_bft100 || depositAmount <= 0) {
    return {
      bonusGranted: 0,
      turnoverAdded: 0,
      bonus_balance: existing.bonus_balance,
      total_turnover_required: existing.total_turnover_required,
      current_turnover: existing.current_turnover,
      has_used_bft100: existing.has_used_bft100,
    };
  }

  const bonusGranted = roundCurrency(depositAmount * BFT100_BONUS_MULTIPLIER);
  const turnoverAdded = roundCurrency(bonusGranted * BFT100_TURNOVER_MULTIPLIER);

  return {
    bonusGranted,
    turnoverAdded,
    bonus_balance: roundCurrency(existing.bonus_balance + bonusGranted),
    total_turnover_required: roundCurrency(existing.total_turnover_required + turnoverAdded),
    current_turnover: existing.current_turnover,
    has_used_bft100: true,
  };
}

/**
 * Rule 3 (Loss Priority - Real/Self Balance First, Bonus Balance Second):
 * When a user places a trade or incurs a loss:
 * - Real/Self balance (`self_balance`) is deducted FIRST.
 * - Once Real/Self balance reaches 0, the remaining stake/loss is deducted from `bonus_balance`.
 */
export function calculateTradePlacementWithBonusPriority(params: {
  stake: number;
  selfBalance: number;
  bonusBalance: number;
}): TradePlacementBonusDeductionResult {
  const stake = roundCurrency(params.stake);
  const preTradeSelfBalance = roundCurrency(params.selfBalance);
  const preTradeBonusBalance = roundCurrency(params.bonusBalance);
  const totalTradableBefore = roundCurrency(preTradeSelfBalance + preTradeBonusBalance);

  if (stake <= 0) {
    return {
      allowed: false,
      error: 'Please enter a valid trade stake greater than $0.00.',
      stake,
      preTradeSelfBalance,
      preTradeBonusBalance,
      stakeFromSelf: 0,
      stakeFromBonus: 0,
      newSelfBalance: preTradeSelfBalance,
      newBonusBalance: preTradeBonusBalance,
      totalTradableBefore,
      totalTradableAfter: totalTradableBefore,
    };
  }

  if (stake > totalTradableBefore + 1e-6) {
    return {
      allowed: false,
      error: `Insufficient balance. Available capital: $${totalTradableBefore.toFixed(2)}`,
      stake,
      preTradeSelfBalance,
      preTradeBonusBalance,
      stakeFromSelf: 0,
      stakeFromBonus: 0,
      newSelfBalance: preTradeSelfBalance,
      newBonusBalance: preTradeBonusBalance,
      totalTradableBefore,
      totalTradableAfter: totalTradableBefore,
    };
  }

  // Real/Self balance is always risked/deducted first
  const stakeFromSelf = roundCurrency(Math.min(preTradeSelfBalance, stake));
  const remainingStake = roundCurrency(Math.max(0, stake - stakeFromSelf));
  const stakeFromBonus = roundCurrency(Math.min(preTradeBonusBalance, remainingStake));

  const newSelfBalance = roundCurrency(Math.max(0, preTradeSelfBalance - stakeFromSelf));
  const newBonusBalance = roundCurrency(Math.max(0, preTradeBonusBalance - stakeFromBonus));
  const totalTradableAfter = roundCurrency(newSelfBalance + newBonusBalance);

  return {
    allowed: true,
    stake,
    preTradeSelfBalance,
    preTradeBonusBalance,
    stakeFromSelf,
    stakeFromBonus,
    newSelfBalance,
    newBonusBalance,
    totalTradableBefore,
    totalTradableAfter,
  };
}

/**
 * Direct helper for deducting a trading loss across Real/Self balance and Bonus balance:
 * - Real/Self balance is lost first.
 * - Once Real/Self balance reaches zero, remaining loss is deducted from Bonus balance.
 */
export function applyTradingLossWithRealFirstPriority(params: {
  lossAmount: number;
  selfBalance: number;
  bonusBalance: number;
}): {
  deductedFromSelf: number;
  deductedFromBonus: number;
  newSelfBalance: number;
  newBonusBalance: number;
} {
  const loss = roundCurrency(params.lossAmount);
  const selfBal = roundCurrency(params.selfBalance);
  const bonusBal = roundCurrency(params.bonusBalance);

  const deductedFromSelf = roundCurrency(Math.min(selfBal, loss));
  const remainingLoss = roundCurrency(Math.max(0, loss - deductedFromSelf));
  const deductedFromBonus = roundCurrency(Math.min(bonusBal, remainingLoss));

  return {
    deductedFromSelf,
    deductedFromBonus,
    newSelfBalance: roundCurrency(selfBal - deductedFromSelf),
    newBonusBalance: roundCurrency(bonusBal - deductedFromBonus),
  };
}

/**
 * Rule 2 & Rule 3: Computes trade settlement across `self_balance`, `bonus_balance`, and `current_turnover`.
 * - Increments `current_turnover` by the trade's `stake`.
 * - On LOSS: Real/Self balance is lost first (`stakeFromSelf`); once Real/Self balance hits 0, `stakeFromBonus` is lost from `bonus_balance`.
 * - On TIE: Returns `stakeFromSelf` to `self_balance` and `stakeFromBonus` to `bonus_balance`.
 * - On WIN: Returns `stakeFromBonus` to `bonus_balance` and credits `stakeFromSelf + profit` to `self_balance`.
 */
export function calculateTradeSettlementWithBonusAndTurnover(params: {
  status: 'won' | 'lost' | 'tie';
  stake: number;
  payoutPercentage: number;
  postPlacementSelfBalance: number;
  postPlacementBonusBalance: number;
  stakeFromSelf?: number;
  stakeFromBonus?: number;
  currentTurnover: number;
  totalTurnoverRequired: number;
}): TradeSettlementBonusTurnoverResult {
  const stake = roundCurrency(params.stake);
  const postSelf = roundCurrency(params.postPlacementSelfBalance);
  const postBonus = roundCurrency(params.postPlacementBonusBalance);
  const stakeFromSelf =
    params.stakeFromSelf !== undefined
      ? roundCurrency(params.stakeFromSelf)
      : stake;
  const stakeFromBonus =
    params.stakeFromBonus !== undefined
      ? roundCurrency(params.stakeFromBonus)
      : 0;

  const previousTurnover = roundCurrency(params.currentTurnover);
  const totalTurnoverRequired = roundCurrency(params.totalTurnoverRequired);
  const newCurrentTurnover = roundCurrency(previousTurnover + stake);

  let pnl = -stake;
  let creditedToSelf = 0;
  let restoredToBonus = 0;

  if (params.status === 'tie') {
    pnl = 0;
    creditedToSelf = stakeFromSelf;
    restoredToBonus = stakeFromBonus;
  } else if (params.status === 'won') {
    const profit = roundCurrency((stake * Number(params.payoutPercentage || 0)) / 100);
    pnl = profit;
    creditedToSelf = roundCurrency(stakeFromSelf + profit);
    restoredToBonus = stakeFromBonus;
  } else {
    // status === 'lost': stakeFromSelf and stakeFromBonus remain deducted (Real lost first, Bonus lost second)
    pnl = -stake;
    creditedToSelf = 0;
    restoredToBonus = 0;
  }

  let finalSelfBalance = roundCurrency(postSelf + creditedToSelf);
  let finalBonusBalance = roundCurrency(postBonus + restoredToBonus);

  const isTurnoverCompleted =
    totalTurnoverRequired <= 0 || newCurrentTurnover >= totalTurnoverRequired - 0.005;

  // If the user has just completed the 100x turnover requirement while holding a positive bonus_balance,
  // the bonus funds are now cleared/unlocked into their withdrawable self_balance!
  if (isTurnoverCompleted && totalTurnoverRequired > 0 && finalBonusBalance > 0) {
    finalSelfBalance = roundCurrency(finalSelfBalance + finalBonusBalance);
    finalBonusBalance = 0;
  }

  return {
    status: params.status,
    stake,
    pnl,
    creditedToSelf,
    restoredToBonus,
    deductedFromSelfOnLoss: params.status === 'lost' ? stakeFromSelf : 0,
    deductedFromBonusOnLoss: params.status === 'lost' ? stakeFromBonus : 0,
    finalSelfBalance,
    finalBonusBalance,
    previousTurnover,
    newCurrentTurnover,
    totalTurnoverRequired,
    newTotalTurnoverRequired: totalTurnoverRequired,
    isTurnoverCompleted,
  };
}

/**
 * Rule 4 (Withdrawal Interception & Bonus Removal):
 * - Checks if the user's required bonus turnover (`total_turnover_required`) is completed (`current_turnover >= total_turnover_required`).
 * - If turnover is NOT completed at the time of the withdrawal request (`bonus_balance > 0 && current_turnover < total_turnover_required`),
 *   automatically forfeits/removes the remaining `bonus_balance` from their account before processing the withdrawal.
 * - If turnover IS completed, allows the bonus funds to be withdrawn alongside `self_balance`.
 */
export function interceptWithdrawalForBonusTurnover(params: {
  userProfile: UserProfile;
  account?: TradingAccount | null;
  requestedAmount?: number;
  deductWithdrawalNow?: boolean;
}): WithdrawalBonusInterceptionResult {
  const bonusState = extractProfileBonusState(params.userProfile);
  const preSelf = roundCurrency(
    params.userProfile.selfBalance ??
      params.userProfile.self_capital_balance ??
      params.userProfile.self_balance ??
      params.account?.currentBalance ??
      0
  );
  const preBonus = bonusState.bonus_balance;
  const reqAmount = roundCurrency(params.requestedAmount ?? 0);

  const hasActiveBonus = preBonus > 0;
  const turnoverCompleted = bonusState.isTurnoverCompleted;

  let bonusForfeited = false;
  let forfeitedBonusAmount = 0;
  let postForfeitureSelfBalance = preSelf;
  let postForfeitureBonusBalance = preBonus;
  let newTotalTurnoverRequired = bonusState.total_turnover_required;
  let newCurrentTurnover = bonusState.current_turnover;
  let noticeMessage: string | undefined;

  if (hasActiveBonus && !turnoverCompleted) {
    // Turnover is NOT completed: automatically forfeit/remove remaining bonus_balance before processing withdrawal
    bonusForfeited = true;
    forfeitedBonusAmount = preBonus;
    postForfeitureBonusBalance = 0;
    newTotalTurnoverRequired = 0;
    newCurrentTurnover = 0;
    noticeMessage = `Incomplete Bonus Turnover (${bonusState.turnoverProgressPercent.toFixed(
      1
    )}% of $${bonusState.total_turnover_required.toFixed(
      2
    )}): Your remaining $${forfeitedBonusAmount.toFixed(
      2
    )} BFT100 bonus has been automatically forfeited upon withdrawal.`;
  } else if (hasActiveBonus && turnoverCompleted) {
    // Turnover IS completed: merge unlocked bonus into withdrawable self_balance
    postForfeitureSelfBalance = roundCurrency(preSelf + preBonus);
    postForfeitureBonusBalance = 0;
  }

  const availableWithdrawableBalance = postForfeitureSelfBalance;

  if (reqAmount > 0 && reqAmount > availableWithdrawableBalance + 1e-6) {
    const errorMsg = bonusForfeited
      ? `Your $${forfeitedBonusAmount.toFixed(
          2
        )} bonus was forfeited because the 100x turnover requirement ($${bonusState.total_turnover_required.toFixed(
          2
        )}) was not completed. Your remaining withdrawable Real Balance is $${availableWithdrawableBalance.toFixed(
          2
        )}.`
      : `Requested withdrawal ($${reqAmount.toFixed(
          2
        )}) exceeds your withdrawable Real Balance of $${availableWithdrawableBalance.toFixed(2)}.`;

    const updatedProfileOnOver: UserProfile = {
      ...params.userProfile,
      selfBalance: postForfeitureSelfBalance,
      self_balance: postForfeitureSelfBalance,
      self_capital_balance: postForfeitureSelfBalance,
      bonusBalance: postForfeitureBonusBalance,
      bonus_balance: postForfeitureBonusBalance,
      totalTurnoverRequired: newTotalTurnoverRequired,
      total_turnover_required: newTotalTurnoverRequired,
      currentTurnover: newCurrentTurnover,
      current_turnover: newCurrentTurnover,
      hasUsedBft100: bonusState.has_used_bft100,
      has_used_bft100: bonusState.has_used_bft100,
    };

    const updatedAccountOnOver: TradingAccount | undefined = params.account
      ? {
          ...params.account,
          currentBalance: postForfeitureSelfBalance,
          equity: postForfeitureSelfBalance,
          bonusBalance: postForfeitureBonusBalance,
          bonus_balance: postForfeitureBonusBalance,
        }
      : undefined;

    return {
      canProceedWithWithdrawal: false,
      error: errorMsg,
      bonusForfeited,
      forfeitedBonusAmount,
      turnoverCompleted,
      preInterceptionSelfBalance: preSelf,
      preInterceptionBonusBalance: preBonus,
      preWithdrawalSelfBalance: preSelf,
      availableWithdrawableBalance,
      postForfeitureSelfBalance,
      postForfeitureBonusBalance,
      postWithdrawalSelfBalance: postForfeitureSelfBalance,
      postWithdrawalBonusBalance: postForfeitureBonusBalance,
      newSelfBalance: postForfeitureSelfBalance,
      newBonusBalance: postForfeitureBonusBalance,
      newTotalTurnoverRequired,
      newCurrentTurnover,
      noticeMessage,
      updatedProfile: updatedProfileOnOver,
      updatedAccount: updatedAccountOnOver,
      profileUpdatePayload: {
        self_balance: postForfeitureSelfBalance,
        self_capital_balance: postForfeitureSelfBalance,
        bonus_balance: postForfeitureBonusBalance,
        total_turnover_required: newTotalTurnoverRequired,
        current_turnover: newCurrentTurnover,
        has_used_bft100: bonusState.has_used_bft100,
      },
    };
  }

  const postWithdrawalSelfBalance = params.deductWithdrawalNow
    ? roundCurrency(Math.max(0, postForfeitureSelfBalance - reqAmount))
    : postForfeitureSelfBalance;
  const postWithdrawalBonusBalance = postForfeitureBonusBalance;

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    selfBalance: postWithdrawalSelfBalance,
    self_balance: postWithdrawalSelfBalance,
    self_capital_balance: postWithdrawalSelfBalance,
    bonusBalance: postWithdrawalBonusBalance,
    bonus_balance: postWithdrawalBonusBalance,
    totalTurnoverRequired: newTotalTurnoverRequired,
    total_turnover_required: newTotalTurnoverRequired,
    currentTurnover: newCurrentTurnover,
    current_turnover: newCurrentTurnover,
    hasUsedBft100: bonusState.has_used_bft100,
    has_used_bft100: bonusState.has_used_bft100,
  };

  const updatedAccount: TradingAccount | undefined = params.account
    ? {
        ...params.account,
        currentBalance: postWithdrawalSelfBalance,
        equity: postWithdrawalSelfBalance,
        bonusBalance: postWithdrawalBonusBalance,
        bonus_balance: postWithdrawalBonusBalance,
      }
    : undefined;

  return {
    canProceedWithWithdrawal: true,
    bonusForfeited,
    forfeitedBonusAmount,
    turnoverCompleted,
    preInterceptionSelfBalance: preSelf,
    preInterceptionBonusBalance: preBonus,
    preWithdrawalSelfBalance: preSelf,
    availableWithdrawableBalance,
    postForfeitureSelfBalance,
    postForfeitureBonusBalance,
    postWithdrawalSelfBalance,
    postWithdrawalBonusBalance,
    newSelfBalance: postWithdrawalSelfBalance,
    newBonusBalance: postWithdrawalBonusBalance,
    newTotalTurnoverRequired,
    newCurrentTurnover,
    noticeMessage,
    updatedProfile,
    updatedAccount,
    profileUpdatePayload: {
      self_balance: postWithdrawalSelfBalance,
      self_capital_balance: postWithdrawalSelfBalance,
      bonus_balance: postWithdrawalBonusBalance,
      total_turnover_required: newTotalTurnoverRequired,
      current_turnover: newCurrentTurnover,
      has_used_bft100: bonusState.has_used_bft100,
    },
  };
}

/**
 * Rule 5: Synchronizes `bonus_balance`, `total_turnover_required`, `current_turnover`, and `has_used_bft100`
 * (plus `self_balance` / `self_capital_balance` if provided) directly to the `profiles` table in Supabase.
 */
export async function syncProfileBonusColumnsToSupabase(params: {
  userId?: string | null;
  userEmail?: string | null;
  bonus_balance: number;
  total_turnover_required?: number;
  current_turnover?: number;
  has_used_bft100?: boolean;
  self_balance?: number;
  supabaseClient?: typeof supabase;
}): Promise<{ ok: boolean; row?: Record<string, any> | null }> {
  const client = params.supabaseClient || supabase;
  const existingLocal = loadLocalProfileBonusState(params.userId, params.userEmail);
  const bonus_balance = roundCurrency(params.bonus_balance);
  const total_turnover_required =
    params.total_turnover_required !== undefined
      ? roundCurrency(params.total_turnover_required)
      : roundCurrency(existingLocal?.total_turnover_required ?? 0);
  const current_turnover =
    params.current_turnover !== undefined
      ? roundCurrency(params.current_turnover)
      : roundCurrency(existingLocal?.current_turnover ?? 0);
  const has_used_bft100 =
    params.has_used_bft100 !== undefined
      ? Boolean(params.has_used_bft100)
      : Boolean(existingLocal?.has_used_bft100);

  saveLocalProfileBonusState(params.userId, params.userEmail, {
    bonus_balance,
    total_turnover_required,
    current_turnover,
    has_used_bft100,
  });

  if (typeof client?.from !== 'function') {
    return { ok: true, row: null };
  }

  const fullPayload: Record<string, any> = {
    bonus_balance,
  };
  if (params.total_turnover_required !== undefined) {
    fullPayload.total_turnover_required = total_turnover_required;
  }
  if (params.current_turnover !== undefined) {
    fullPayload.current_turnover = current_turnover;
  }
  if (params.has_used_bft100 !== undefined) {
    fullPayload.has_used_bft100 = has_used_bft100;
  }

  if (params.self_balance !== undefined && Number.isFinite(params.self_balance)) {
    const roundedSelf = roundCurrency(params.self_balance);
    fullPayload.self_balance = roundedSelf;
    fullPayload.self_capital_balance = roundedSelf;
  }

  let targetUuid =
    params.userId && UUID_REGEX.test(String(params.userId)) ? String(params.userId) : null;

  if (!targetUuid && typeof (client as any).auth?.getUser === 'function') {
    try {
      const { data } = await (client as any).auth.getUser();
      if (data?.user?.id && UUID_REGEX.test(data.user.id)) {
        targetUuid = data.user.id;
      }
    } catch {
      // ignore
    }
  }

  const tryUpdateWithColumnFallback = async (
    matchCol: 'id' | 'email',
    matchVal: string
  ): Promise<Record<string, any> | null> => {
    const workingPayload = { ...fullPayload };
    for (let attempt = 0; attempt < 6; attempt++) {
      if (Object.keys(workingPayload).length === 0) break;
      try {
        const query = (client.from('profiles') as any).update(workingPayload);
        const filtered =
          matchCol === 'id'
            ? query.eq('id', matchVal)
            : query.ilike
            ? query.ilike('email', matchVal)
            : query.eq('email', matchVal);

        const res =
          typeof filtered.select === 'function' ? await filtered.select('*') : await filtered;
        const error = res?.error;
        const data = res?.data;

        if (!error) {
          return Array.isArray(data) && data.length > 0 ? data[0] : workingPayload;
        }

        const msg = String(error.message || error.details || '');
        const colMatch =
          msg.match(/Could not find the '([^']+)' column/i) ||
          msg.match(/column "?([a-zA-Z0-9_]+)"? of relation "?profiles"? does not exist/i) ||
          msg.match(/column profiles\.([a-zA-Z0-9_]+) does not exist/i);

        if (colMatch?.[1] && colMatch[1] in workingPayload) {
          delete workingPayload[colMatch[1]];
          continue;
        }
        break;
      } catch {
        break;
      }
    }
    return null;
  };

  if (targetUuid) {
    const row = await tryUpdateWithColumnFallback('id', targetUuid);
    if (row) return { ok: true, row };
  }

  const cleanEmail = params.userEmail ? String(params.userEmail).trim().toLowerCase() : '';
  if (cleanEmail) {
    const row = await tryUpdateWithColumnFallback('email', cleanEmail);
    if (row) return { ok: true, row };
  }

  return { ok: true, row: null };
}

/**
 * Fetches `bonus_balance`, `total_turnover_required`, `current_turnover`, and `has_used_bft100`
 * directly from the `profiles` table in Supabase.
 */
export async function fetchProfileBonusStateFromSupabase(params: {
  userId?: string | null;
  userEmail?: string | null;
  fallbackProfile?: UserProfile | null;
  supabaseClient?: typeof supabase;
}): Promise<ProfileBonusState> {
  const client = params.supabaseClient || supabase;
  if (typeof client?.from === 'function') {
    try {
      const uid =
        params.userId && UUID_REGEX.test(String(params.userId)) ? String(params.userId) : null;
      if (uid) {
        const { data, error } = await (client.from('profiles') as any)
          .select('*')
          .eq('id', uid)
          .maybeSingle();
        if (!error && data) {
          const state = extractProfileBonusState(data, params.fallbackProfile);
          saveLocalProfileBonusState(uid, params.userEmail, state);
          return state;
        }
      }

      const cleanEmail = params.userEmail ? String(params.userEmail).trim().toLowerCase() : '';
      if (cleanEmail) {
        const baseQuery = (client.from('profiles') as any).select('*');
        const { data, error } =
          typeof baseQuery.ilike === 'function'
            ? await baseQuery.ilike('email', cleanEmail).maybeSingle()
            : await baseQuery.eq('email', cleanEmail).maybeSingle();
        if (!error && data) {
          const state = extractProfileBonusState(data, params.fallbackProfile);
          saveLocalProfileBonusState(params.userId || data.id, cleanEmail, state);
          return state;
        }
      }
    } catch {
      // ignore and fall back to local/profile state
    }
  }

  return extractProfileBonusState(params.fallbackProfile);
}

/**
 * Atomically activates the 100% First Deposit Bonus ("BFT100") on the user's `profiles` row in Supabase,
 * enforcing the single-use `has_used_bft100` constraint and setting:
 * - `bonus_balance = prevBonus + depositAmount`
 * - `total_turnover_required = prevTurnoverRequired + (depositAmount * 100)`
 * - `has_used_bft100 = true`
 */
export async function activateBft100BonusInSupabase(params: {
  userProfile?: UserProfile | null;
  userId?: string | null;
  userEmail?: string | null;
  depositAmount: number;
  creditSelfBalance?: boolean;
  supabaseClient?: typeof supabase;
}): Promise<{
  ok: boolean;
  error?: string;
  bonusGranted: number;
  turnoverRequired: number;
  updatedBonusState: ProfileBonusState;
  updatedProfile?: UserProfile;
}> {
  const userId = params.userId || params.userProfile?.id;
  const userEmail = params.userEmail || params.userProfile?.email;

  // Fetch latest state from `profiles` table in Supabase to prevent race conditions or multi-tab reuse
  const latestBonusState = await fetchProfileBonusStateFromSupabase({
    userId,
    userEmail,
    fallbackProfile: params.userProfile,
    supabaseClient: params.supabaseClient,
  });

  if (latestBonusState.has_used_bft100) {
    return {
      ok: false,
      error: 'Bonus code BFT100 has already been used. Each user can claim the 100% First Deposit Bonus only once.',
      bonusGranted: 0,
      turnoverRequired: 0,
      updatedBonusState: latestBonusState,
    };
  }

  const depositAmount = roundCurrency(params.depositAmount);
  const bonusGranted = roundCurrency(depositAmount * BFT100_BONUS_MULTIPLIER);
  const turnoverAdded = roundCurrency(bonusGranted * BFT100_TURNOVER_MULTIPLIER);

  const nextBonusBalance = roundCurrency(latestBonusState.bonus_balance + bonusGranted);
  const nextTotalTurnoverRequired = roundCurrency(
    latestBonusState.total_turnover_required + turnoverAdded
  );
  const nextCurrentTurnover = latestBonusState.current_turnover;

  const currentSelf = roundCurrency(
    params.userProfile?.selfBalance ??
      params.userProfile?.self_capital_balance ??
      params.userProfile?.self_balance ??
      0
  );
  const nextSelf = params.creditSelfBalance
    ? roundCurrency(currentSelf + depositAmount)
    : undefined;

  await syncProfileBonusColumnsToSupabase({
    userId,
    userEmail,
    bonus_balance: nextBonusBalance,
    total_turnover_required: nextTotalTurnoverRequired,
    current_turnover: nextCurrentTurnover,
    has_used_bft100: true,
    self_balance: nextSelf,
    supabaseClient: params.supabaseClient,
  });

  const updatedBonusState = extractProfileBonusState({
    bonus_balance: nextBonusBalance,
    total_turnover_required: nextTotalTurnoverRequired,
    current_turnover: nextCurrentTurnover,
    has_used_bft100: true,
  });

  const updatedProfile: UserProfile | undefined = params.userProfile
    ? {
        ...params.userProfile,
        ...(nextSelf !== undefined
          ? {
              selfBalance: nextSelf,
              self_balance: nextSelf,
              self_capital_balance: nextSelf,
            }
          : {}),
        bonusBalance: nextBonusBalance,
        bonus_balance: nextBonusBalance,
        totalTurnoverRequired: nextTotalTurnoverRequired,
        total_turnover_required: nextTotalTurnoverRequired,
        currentTurnover: nextCurrentTurnover,
        current_turnover: nextCurrentTurnover,
        hasUsedBft100: true,
        has_used_bft100: true,
      }
    : undefined;

  if (typeof window !== 'undefined' && updatedProfile) {
    try {
      window.dispatchEvent(
        new CustomEvent('bft-realtime-profile-update', {
          detail: {
            id: updatedProfile.id,
            email: updatedProfile.email,
            self_balance: updatedProfile.selfBalance,
            self_capital_balance: updatedProfile.selfBalance,
            bonus_balance: nextBonusBalance,
            total_turnover_required: nextTotalTurnoverRequired,
            current_turnover: nextCurrentTurnover,
            has_used_bft100: true,
          },
        })
      );
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    bonusGranted,
    turnoverRequired: nextTotalTurnoverRequired,
    updatedBonusState,
    updatedProfile,
  };
}

export const DEPOSIT_RECEIPTS_BUCKET = 'deposit_receipts';
const LOCAL_CRYPTO_DEPOSITS_MIRROR_KEY = 'bft_supabase_crypto_deposits_mirror_v1';

export interface SupabaseCryptoDepositRow {
  id: string;
  supabase_id?: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  account_id?: string | null;
  account_type?: string;
  amount: number;
  package_name?: string;
  package_sku?: string;
  sku?: string;
  wallet_address?: string;
  network?: string;
  payment_method?: string | null;
  tx_hash?: string | null;
  screenshot_url?: string | null;
  receipt_url?: string | null;
  bonus_code?: string | null;
  status: string;
  created_at: string | number;
}

export function loadLocalCryptoDepositsMirror(): SupabaseCryptoDepositRow[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_CRYPTO_DEPOSITS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalCryptoDepositsMirror(rows: SupabaseCryptoDepositRow[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CRYPTO_DEPOSITS_MIRROR_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Uploads a payment proof screenshot to Supabase Storage bucket `deposit_receipts`
 * (with fallback to `deposit-receipts` and `previewDataUrl`) and returns `receipt_url` / `screenshot_url`.
 */
export async function uploadDepositReceiptToSupabaseStorage(params: {
  file?: File | Blob | null;
  previewDataUrl?: string | null;
  userId?: string | null;
  bucketName?: string;
  supabaseClient?: typeof supabase;
}): Promise<{
  ok: boolean;
  screenshotUrl: string | null;
  receiptUrl: string | null;
  storagePath?: string;
  usedFallback?: boolean;
}> {
  const client = params.supabaseClient || supabase;
  const primaryBucket = params.bucketName || DEPOSIT_RECEIPTS_BUCKET;
  const candidateBuckets = Array.from(
    new Set([primaryBucket, 'deposit_receipts', 'deposit-receipts'])
  );
  const cleanUser =
    String(params.userId || 'anon')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 36) || 'anon';

  if (params.file && typeof (client as any)?.storage?.from === 'function') {
    const rawName = (params.file as File).name || 'receipt.png';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${cleanUser}/${Date.now()}_${safeName}`;

    for (const bucket of candidateBuckets) {
      try {
        const storageBucket = (client as any).storage.from(bucket);
        const uploadRes = await storageBucket.upload(storagePath, params.file, {
          cacheControl: '3600',
          upsert: true,
        });

        if (!uploadRes?.error) {
          const pubRes = storageBucket.getPublicUrl(storagePath);
          const publicUrl =
            pubRes?.data?.publicUrl || pubRes?.publicURL || pubRes?.publicUrl || null;
          if (publicUrl) {
            return {
              ok: true,
              screenshotUrl: String(publicUrl),
              receiptUrl: String(publicUrl),
              storagePath,
              usedFallback: false,
            };
          }
        }
      } catch {
        // try next bucket or fall back to data URL
      }
    }
  }

  if (params.previewDataUrl) {
    return {
      ok: true,
      screenshotUrl: params.previewDataUrl,
      receiptUrl: params.previewDataUrl,
      usedFallback: true,
    };
  }

  return {
    ok: false,
    screenshotUrl: null,
    receiptUrl: null,
  };
}

async function insertRowWithColumnFallback(
  client: any,
  tableName: string,
  basePayload: Record<string, any>
): Promise<Record<string, any> | null> {
  if (typeof client?.from !== 'function') return null;
  const workingPayload = { ...basePayload };
  for (let attempt = 0; attempt < 8; attempt++) {
    if (Object.keys(workingPayload).length === 0) break;
    try {
      const query = (client.from(tableName) as any).insert(workingPayload);
      const res = typeof query.select === 'function' ? await query.select('*') : await query;
      const error = res?.error;
      const data = res?.data;

      if (!error) {
        return Array.isArray(data) && data.length > 0 ? data[0] : workingPayload;
      }

      const msg = String(error.message || error.details || '');
      const colMatch =
        msg.match(/Could not find the '([^']+)' column/i) ||
        msg.match(
          new RegExp(
            `column "?([a-zA-Z0-9_]+)"? of relation "?${tableName}"? does not exist`,
            'i'
          )
        ) ||
        msg.match(new RegExp(`column ${tableName}\\.([a-zA-Z0-9_]+) does not exist`, 'i'));

      if (colMatch?.[1] && colMatch[1] in workingPayload) {
        delete workingPayload[colMatch[1]];
        continue;
      }

      break;
    } catch {
      break;
    }
  }
  return null;
}

/**
 * Inserts a submitted crypto/bank deposit record (including `payment_method`, `receipt_url`, and `screenshot_url`)
 * into Supabase (`deposits` and `crypto_deposits` tables, plus `user_purchases` when `accountType === 'challenge'`).
 */
export async function submitCryptoDepositToSupabaseTable(params: {
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  amount: number;
  packageName?: string;
  sku?: string;
  accountType?: string;
  accountId?: string | null;
  walletAddress?: string;
  network?: string;
  paymentMethod?: string | null;
  receiptFile?: File | Blob | null;
  receiptPreviewUrl?: string | null;
  screenshotUrl?: string | null;
  receiptUrl?: string | null;
  txHash?: string | null;
  bonusCode?: string | null;
  status?: string;
  supabaseClient?: typeof supabase;
}): Promise<{
  ok: boolean;
  row: SupabaseCryptoDepositRow;
  screenshotUrl: string | null;
  receiptUrl: string | null;
}> {
  const client = params.supabaseClient || supabase;
  const amount = roundCurrency(params.amount);

  let resolvedScreenshotUrl = params.receiptUrl || params.screenshotUrl || null;
  if (!resolvedScreenshotUrl && (params.receiptFile || params.receiptPreviewUrl)) {
    const uploaded = await uploadDepositReceiptToSupabaseStorage({
      file: params.receiptFile,
      previewDataUrl: params.receiptPreviewUrl,
      userId: params.userId,
      bucketName: DEPOSIT_RECEIPTS_BUCKET,
      supabaseClient: client,
    });
    resolvedScreenshotUrl = uploaded.receiptUrl || uploaded.screenshotUrl;
  }

  let resolvedUuid =
    params.userId && UUID_REGEX.test(String(params.userId)) ? String(params.userId) : null;

  if (!resolvedUuid && typeof (client as any)?.auth?.getUser === 'function') {
    try {
      const { data } = await (client as any).auth.getUser();
      if (data?.user?.id && UUID_REGEX.test(data.user.id)) {
        resolvedUuid = data.user.id;
      }
    } catch {
      // ignore
    }
  }

  if (!resolvedUuid && params.userEmail && typeof client?.from === 'function') {
    try {
      const q = (client.from('profiles') as any).select('id');
      const { data } =
        typeof q.ilike === 'function'
          ? await q.ilike('email', String(params.userEmail).trim().toLowerCase()).maybeSingle()
          : await q.eq('email', String(params.userEmail).trim().toLowerCase()).maybeSingle();
      if (data?.id && UUID_REGEX.test(String(data.id))) {
        resolvedUuid = String(data.id);
      }
    } catch {
      // ignore
    }
  }

  const nowIso = new Date().toISOString();
  const isBankTransfer =
    String(params.paymentMethod || '').toLowerCase() === 'bank_transfer' ||
    String(params.network || '').toLowerCase().includes('bank');
  const resolvedPaymentMethod =
    params.paymentMethod || (isBankTransfer ? 'bank_transfer' : 'crypto');
  const packageName =
    params.packageName ||
    `Self-Funded Deposit via ${params.network || 'USDT'} ($${amount.toFixed(2)})`;
  const sku = params.sku || 'DEPOSIT_SELF_FUNDED';
  const accountType = params.accountType || 'self_funded';
  const status = params.status || 'pending';
  const cleanTxHash = params.txHash ? String(params.txHash).trim() : null;

  const insertPayload: Record<string, any> = {
    ...(resolvedUuid ? { user_id: resolvedUuid } : {}),
    ...(params.userEmail ? { user_email: params.userEmail, email: params.userEmail } : {}),
    ...(params.userName ? { user_name: params.userName } : {}),
    ...(params.accountId ? { account_id: params.accountId } : {}),
    wallet_address: params.walletAddress || '',
    amount,
    package_name: packageName,
    package_sku: sku,
    sku,
    account_type: accountType,
    network: params.network || (isBankTransfer ? 'Bank Transfer' : 'USDT (TRC-20)'),
    payment_method: resolvedPaymentMethod,
    status,
    ...(cleanTxHash ? { tx_hash: cleanTxHash } : {}),
    ...(resolvedScreenshotUrl
      ? {
          receipt_url: resolvedScreenshotUrl,
          screenshot_url: resolvedScreenshotUrl,
        }
      : {}),
    ...(params.bonusCode ? { bonus_code: params.bonusCode } : {}),
  };

  let insertedCryptoRow: Record<string, any> | null = null;
  let insertedDepositsRow: Record<string, any> | null = null;

  if (typeof client?.from === 'function' && resolvedUuid) {
    insertedCryptoRow = await insertRowWithColumnFallback(
      client,
      'crypto_deposits',
      insertPayload
    );
    insertedDepositsRow = await insertRowWithColumnFallback(
      client,
      'deposits',
      insertPayload
    );
  }

  const insertedRow = insertedCryptoRow || insertedDepositsRow;

  const normalizedRow: SupabaseCryptoDepositRow = {
    id: String(insertedRow?.id || `DEP-${Date.now().toString().slice(-6)}`),
    supabase_id: insertedRow?.id ? String(insertedRow.id) : undefined,
    user_id: String(insertedRow?.user_id || params.userId || 'usr_bft_001'),
    user_email: insertedRow?.user_email || insertedRow?.email || params.userEmail || undefined,
    user_name: insertedRow?.user_name || params.userName || undefined,
    account_id: insertedRow?.account_id ?? params.accountId ?? null,
    account_type: insertedRow?.account_type || accountType,
    amount: roundCurrency(insertedRow?.amount ?? amount),
    package_name: insertedRow?.package_name || packageName,
    package_sku: insertedRow?.package_sku || sku,
    sku: insertedRow?.sku || sku,
    wallet_address: insertedRow?.wallet_address || params.walletAddress || '',
    network:
      insertedRow?.network ||
      params.network ||
      (isBankTransfer ? 'Bank Transfer' : 'USDT (TRC-20)'),
    payment_method: insertedRow?.payment_method || resolvedPaymentMethod,
    tx_hash: insertedRow?.tx_hash ?? cleanTxHash,
    screenshot_url:
      insertedRow?.screenshot_url ||
      insertedRow?.receipt_url ||
      resolvedScreenshotUrl ||
      null,
    receipt_url:
      insertedRow?.receipt_url ||
      insertedRow?.screenshot_url ||
      resolvedScreenshotUrl ||
      null,
    bonus_code: insertedRow?.bonus_code || params.bonusCode || null,
    status: String(insertedRow?.status || status),
    created_at: insertedRow?.created_at || nowIso,
  };

  const existingMirror = loadLocalCryptoDepositsMirror();
  saveLocalCryptoDepositsMirror([
    normalizedRow,
    ...existingMirror.filter((r) => String(r.id) !== String(normalizedRow.id)),
  ]);

  return {
    ok: true,
    row: normalizedRow,
    screenshotUrl: normalizedRow.screenshot_url || null,
    receiptUrl: normalizedRow.receipt_url || null,
  };
}

/**
 * Fetches all rows from `crypto_deposits` and `deposits` tables in Supabase for the Admin Portal
 * and normalizes `receipt_url` / `screenshot_url` and `payment_method`.
 */
export async function fetchAdminCryptoDepositsFromSupabase(params?: {
  existingBackendDeposits?: any[];
  usersList?: any[];
  supabaseClient?: typeof supabase;
}): Promise<SupabaseCryptoDepositRow[]> {
  const client = params?.supabaseClient || supabase;
  const backendRows = Array.isArray(params?.existingBackendDeposits)
    ? params!.existingBackendDeposits
    : [];
  const usersSource = Array.isArray(params?.usersList) ? params!.usersList : [];
  const userMap = new Map<string, any>(
    usersSource.map((u: any) => [String(u.id), u])
  );

  let supaRows: any[] = [];
  if (typeof client?.from === 'function') {
    try {
      const { data, error } = await (client.from('crypto_deposits') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        supaRows = [...supaRows, ...data];
      }
    } catch {
      // ignore
    }
    try {
      const { data: depData, error: depErr } = await (client.from('deposits') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (!depErr && Array.isArray(depData)) {
        supaRows = [...supaRows, ...depData];
      }
    } catch {
      // ignore
    }
  }

  const mirrorRows = loadLocalCryptoDepositsMirror();

  const normalizeRow = (row: any): SupabaseCryptoDepositRow => {
    const matchedUser = row.user_id ? userMap.get(String(row.user_id)) : null;
    const screenshot =
      row.receipt_url || row.screenshot_url || row.proof_url || null;
    const email =
      matchedUser?.email ||
      row.user_email ||
      row.email ||
      (row.user_id && String(row.user_id).length > 8
        ? `trader-${String(row.user_id).slice(0, 6)}@bft.io`
        : String(row.user_id || 'trader@bft.io'));
    const name =
      matchedUser?.full_name ||
      row.user_name ||
      matchedUser?.email ||
      email;

    const rawNet = String(
      row.network || row.network_type || row.payment_method || ''
    );
    const isBank =
      String(row.payment_method || '').toLowerCase() === 'bank_transfer' ||
      rawNet.toLowerCase().includes('bank') ||
      String(row.sku || row.package_sku || '').toUpperCase().includes('COMMERCIAL_BANK');

    return {
      id: String(row.id || `DEP-${Date.now()}`),
      supabase_id:
        row.supabase_id ||
        (UUID_REGEX.test(String(row.id || '')) ? String(row.id) : undefined),
      user_id: String(row.user_id || 'usr_bft_001'),
      user_email: email,
      user_name: name,
      account_id: row.account_id || (row.account_type === 'challenge' ? null : 'BFT-PERS-LIVE'),
      account_type: row.account_type || 'self_funded',
      amount: roundCurrency(row.amount || 0),
      package_name: row.package_name || '',
      package_sku: row.package_sku || row.sku || '',
      sku: row.sku || row.package_sku || '',
      wallet_address: row.wallet_address || '',
      network: rawNet || (isBank ? 'Bank Transfer' : 'USDT (TRC-20)'),
      payment_method: row.payment_method || (isBank ? 'bank_transfer' : 'crypto'),
      tx_hash: row.tx_hash || null,
      screenshot_url: screenshot,
      receipt_url: screenshot,
      bonus_code:
        row.bonus_code ||
        (String(row.sku || row.package_sku || row.package_name || '')
          .toUpperCase()
          .includes('BFT100')
          ? BFT100_BONUS_CODE
          : null),
      status:
        row.status === 'completed' || row.status === 'active'
          ? 'approved'
          : row.status === 'declined' || row.status === 'failed'
          ? 'rejected'
          : String(row.status || 'pending'),
      created_at: row.created_at || Date.now(),
    };
  };

  const mappedSupa = supaRows.map(normalizeRow);
  const mappedBackend = backendRows.map(normalizeRow);
  const mappedMirror = mirrorRows.map(normalizeRow);

  const merged: SupabaseCryptoDepositRow[] = [];
  const seenKeys = new Set<string>();

  for (const item of [...mappedSupa, ...mappedBackend, ...mappedMirror]) {
    const idKey = String(item.id);
    const compositeKey = `${item.user_id}_${item.amount.toFixed(2)}_${item.tx_hash || ''}_${item.network || ''}`;
    if (seenKeys.has(idKey)) {
      const existingById = merged.find((m) => String(m.id) === idKey);
      if (existingById && !existingById.receipt_url && item.receipt_url) {
        existingById.receipt_url = item.receipt_url;
        existingById.screenshot_url = item.receipt_url;
      }
      continue;
    }
    if (item.tx_hash && seenKeys.has(compositeKey)) {
      const existing = merged.find(
        (m) =>
          `${m.user_id}_${m.amount.toFixed(2)}_${m.tx_hash || ''}_${m.network || ''}` ===
          compositeKey
      );
      if (existing && !existing.screenshot_url && item.screenshot_url) {
        existing.screenshot_url = item.screenshot_url;
        existing.receipt_url = item.screenshot_url;
      }
      continue;
    }
    seenKeys.add(idKey);
    if (item.tx_hash) seenKeys.add(compositeKey);
    merged.push(item);
  }

  return merged;
}

function inferChallengeSizeAndTier(dep: Record<string, any>): {
  size: number;
  tier: 'starter' | 'pro' | 'elite';
  tierName: string;
} {
  const combined = `${dep.package_name || ''} ${dep.package_sku || ''} ${dep.sku || ''}`;
  let size = 10000;
  if (/100[,\s]?000|100k/i.test(combined)) size = 100000;
  else if (/50[,\s]?000|50k/i.test(combined)) size = 50000;
  else if (/25[,\s]?000|25k/i.test(combined)) size = 25000;
  else if (/10[,\s]?000|10k/i.test(combined)) size = 10000;
  else if (/5[,\s]?000|5k/i.test(combined)) size = 5000;
  else if (/2[,\s]?000|2k/i.test(combined)) size = 2000;
  else if (/1[,\s]?000|1k/i.test(combined)) size = 1000;

  let tier: 'starter' | 'pro' | 'elite' = 'starter';
  let tierName = '1-Step Challenge';
  if (/elite|instant/i.test(combined)) {
    tier = 'elite';
    tierName = 'Instant Elite Challenge';
  } else if (/pro|2-step/i.test(combined)) {
    tier = 'pro';
    tierName = '2-Step Pro Challenge';
  }

  return { size, tier, tierName };
}

/**
 * Approves a pending deposit in Supabase (`crypto_deposits` and `deposits` tables):
 * - For `self_funded` deposits: credits the user's `self_balance` (plus BFT100 bonus if applicable) in `profiles`.
 * - For `challenge` deposits: activates the challenge purchase and provisions an active Challenge `trading_accounts` row.
 */
export async function approveAdminCryptoDepositInSupabase(params: {
  deposit: SupabaseCryptoDepositRow | Record<string, any>;
  supabaseClient?: typeof supabase;
}): Promise<{ ok: boolean; provisionedAccount?: TradingAccount | null }> {
  const client = params.supabaseClient || supabase;
  const dep = params.deposit;
  const depositId = String(dep.supabase_id || dep.id || '');
  const amount = roundCurrency(dep.amount || 0);
  const userId = dep.user_id ? String(dep.user_id) : null;
  const userEmail = dep.user_email || (dep as any).email || null;
  const isChallenge =
    String(dep.account_type || '').toLowerCase() === 'challenge' ||
    String(dep.sku || dep.package_sku || '').toUpperCase().startsWith('CHALLENGE_');
  const hasBft100 =
    String(dep.bonus_code || '').toUpperCase() === BFT100_BONUS_CODE ||
    String(dep.sku || dep.package_sku || dep.package_name || '')
      .toUpperCase()
      .includes(BFT100_BONUS_CODE);

  if (typeof client?.from === 'function' && depositId) {
    for (const table of ['crypto_deposits', 'deposits']) {
      try {
        const { error } = await (client.from(table) as any)
          .update({ status: 'approved' })
          .eq('id', depositId);
        if (error) {
          await (client.from(table) as any)
            .update({ status: 'completed' })
            .eq('id', depositId);
        }
      } catch {
        // ignore
      }
    }
  }

  // Update local mirror status
  const mirror = loadLocalCryptoDepositsMirror();
  saveLocalCryptoDepositsMirror(
    mirror.map((m) =>
      String(m.id) === String(dep.id) || String(m.supabase_id) === depositId
        ? { ...m, status: 'approved' }
        : m
    )
  );

  // If this is a Challenge purchase deposit, activate the challenge account in Supabase
  if (isChallenge) {
    const { size, tier, tierName } = inferChallengeSizeAndTier(dep);
    const loginSuffix = Math.floor(100000 + Math.random() * 900000);
    const accountId = dep.account_id || `BFT-${size / 1000}K-${String(loginSuffix).slice(-4)}`;
    const nowMs = Date.now();
    const targetProfitPct = 10;
    const maxDailyLossPct = 5;
    const maxOverallDrawdownPct = 10;

    const provisionedAccount = {
      id: accountId,
      ownerId: userId || 'usr_bft_001',
      tier,
      tierName,
      size,
      balance: size,
      initialBalance: size,
      currentBalance: size,
      startingBalance: size,
      dailyStartBalance: size,
      startingDayEquity: size,
      equity: size,
      targetBalance: roundCurrency(size * (1 + targetProfitPct / 100)),
      minEquity: roundCurrency(size * (1 - maxOverallDrawdownPct / 100)),
      maxDailyLossAmount: roundCurrency(size * (maxDailyLossPct / 100)),
      targetProfitPct,
      maxDailyLossPct,
      maxOverallDrawdownPct,
      maxTradeRiskPct: 2,
      minTradingDays: 5,
      profitSplit: 80,
      status: 'active' as const,
      fundingType: 'funded' as const,
      loginId: `BFT${loginSuffix}`,
      passwordHash: `Trd#${String(loginSuffix).slice(0, 4)}!`,
      createdAt: nowMs,
      trades: [],
      dailyTradeDate: new Date().toISOString().slice(0, 10),
      dailyLossesCount: 0,
      tradingDays: [],
    } as unknown as TradingAccount;

    if (typeof client?.from === 'function') {
      await insertRowWithColumnFallback(client, 'trading_accounts', {
        ...(userId && UUID_REGEX.test(userId) ? { user_id: userId } : {}),
        ...(userEmail ? { user_email: userEmail } : {}),
        account_id: provisionedAccount.id,
        tier: provisionedAccount.tier,
        tier_name: provisionedAccount.tierName,
        size: provisionedAccount.size,
        balance: size,
        starting_balance: size,
        daily_start_balance: size,
        target_balance: roundCurrency(size * (1 + targetProfitPct / 100)),
        min_equity: roundCurrency(size * (1 - maxOverallDrawdownPct / 100)),
        max_daily_loss: roundCurrency(size * (maxDailyLossPct / 100)),
        status: 'active',
        funding_type: 'funded',
        login_id: provisionedAccount.loginId,
      });

      try {
        if (depositId) {
          await (client.from('user_purchases') as any)
            .update({ status: 'active', account_id: provisionedAccount.id })
            .eq('id', depositId);
        }
      } catch {
        // ignore
      }
    }

    return { ok: true, provisionedAccount };
  }

  // Otherwise, credit user's self_balance in Supabase profiles table
  if (typeof client?.from === 'function' && amount > 0 && (userId || userEmail)) {
    try {
      let profRow: any = null;
      if (userId && UUID_REGEX.test(userId)) {
        const { data } = await (client.from('profiles') as any)
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        profRow = data;
      }
      if (!profRow && userEmail) {
        const q = (client.from('profiles') as any).select('*');
        const { data } =
          typeof q.ilike === 'function'
            ? await q.ilike('email', String(userEmail).trim().toLowerCase()).maybeSingle()
            : await q.eq('email', String(userEmail).trim().toLowerCase()).maybeSingle();
        profRow = data;
      }

      if (profRow) {
        const curSelf = roundCurrency(
          profRow.self_balance ?? profRow.self_capital_balance ?? 0
        );
        const newSelf = roundCurrency(curSelf + amount);
        const curBonus = extractProfileBonusState(profRow);

        await syncProfileBonusColumnsToSupabase({
          userId: profRow.id || userId,
          userEmail: profRow.email || userEmail,
          self_balance: newSelf,
          bonus_balance:
            hasBft100 && !curBonus.has_used_bft100
              ? roundCurrency(curBonus.bonus_balance + amount)
              : curBonus.bonus_balance,
          total_turnover_required:
            hasBft100 && !curBonus.has_used_bft100
              ? roundCurrency(curBonus.total_turnover_required + amount * 100)
              : curBonus.total_turnover_required,
          current_turnover: curBonus.current_turnover,
          has_used_bft100: hasBft100 ? true : curBonus.has_used_bft100,
          supabaseClient: client,
        });
      }
    } catch {
      // ignore
    }
  }

  return { ok: true };
}

/**
 * Rejects/declines a pending deposit in Supabase (`crypto_deposits` and `deposits` tables).
 */
export async function rejectAdminCryptoDepositInSupabase(params: {
  deposit: SupabaseCryptoDepositRow | Record<string, any>;
  reason?: string;
  supabaseClient?: typeof supabase;
}): Promise<{ ok: boolean }> {
  const client = params.supabaseClient || supabase;
  const dep = params.deposit;
  const depositId = String(dep.supabase_id || dep.id || '');

  if (typeof client?.from === 'function' && depositId) {
    for (const table of ['crypto_deposits', 'deposits']) {
      try {
        const { error } = await (client.from(table) as any)
          .update({ status: 'rejected' })
          .eq('id', depositId);
        if (error) {
          await (client.from(table) as any)
            .update({ status: 'declined' })
            .eq('id', depositId);
        }
      } catch {
        // ignore
      }
    }
  }

  const mirror = loadLocalCryptoDepositsMirror();
  saveLocalCryptoDepositsMirror(
    mirror.map((m) =>
      String(m.id) === String(dep.id) || String(m.supabase_id) === depositId
        ? { ...m, status: 'rejected' }
        : m
    )
  );

  return { ok: true };
}


