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
