import type { EvaluationPackage, TradingAccount, BinaryTrade, WithdrawalRequest, RuleViolationLog, BinaryOptionDirection, PromoCodeType, ChallengeTier } from '../types/index.ts';

export const PROMO_CODES: Record<string, { code: string; discountPercent: number; label: string; audience: string }> = {
  SPOOKY40: {
    code: 'SPOOKY40',
    discountPercent: 40,
    label: 'Flat 40% OFF',
    audience: 'BFT 40% Bonus Code',
  },
  BFT40: {
    code: 'BFT40',
    discountPercent: 40,
    label: 'Flat 40% OFF',
    audience: 'BFT 40% Bonus Code',
  },
};

export interface PromoCodeValidationResult {
  valid: boolean;
  isCleared: boolean;
  code: PromoCodeType;
  discountPercent: number;
  label: string;
  error?: string;
}

/**
 * Validates a user-entered promo/bonus code.
 * Only the 40% bonus code (SPOOKY40 / BFT40) is valid.
 * If empty, cleared, or invalid (including any 20% code), returns code: 'NONE' and discountPercent: 0
 * so pricing immediately reverts to standard base prices.
 */
export function validatePromoCode(input?: string | null): PromoCodeValidationResult {
  const clean = String(input ?? '').trim().toUpperCase();
  if (!clean || clean === 'NONE') {
    return {
      valid: false,
      isCleared: true,
      code: 'NONE',
      discountPercent: 0,
      label: '',
    };
  }
  const matched = PROMO_CODES[clean];
  if (matched && matched.discountPercent === 40) {
    return {
      valid: true,
      isCleared: false,
      code: matched.code,
      discountPercent: matched.discountPercent,
      label: matched.label,
    };
  }
  return {
    valid: false,
    isCleared: false,
    code: 'NONE',
    discountPercent: 0,
    label: '',
    error: 'Invalid bonus code. Standard pricing applied.',
  };
}

export const WITHDRAWAL_FEE_PERCENT = 10; // 10% Withdrawal Fee deducted from requested payout
export const DAILY_WITHDRAWAL_ADDON_PERCENT = 15; // +15% fee to unlock Daily Withdrawals
export const STANDARD_WITHDRAWAL_FREQUENCY = 'WEEKLY' as const;
export const WITHDRAWAL_CYCLE_DAYS = 7; // Weekly standard withdrawals
export const MAX_RISK_PER_TRADE_PERCENT = 5; // 5% of current wallet balance max single trade size
export const MAX_COMBINED_OPEN_RISK_PERCENT = 5; // 5% of current wallet balance max combined open trades risk
export const MAX_OPEN_TRADES_PER_PAIR = 1; // Only one open trade allowed per currency pair at a time
export const CHALLENGE_PROFIT_TARGET_PERCENT = 30; // 30% Challenge Profit Target
export const CHALLENGE_MAX_OVERALL_LOSS_PERCENT = 10; // 10% Max Overall Account Loss -> Immediate HARD_BREACH
export const MIN_PROFITABLE_DAYS = 5; // 5 profitable trading days (>= 1% profit/day)
export const MIN_PROFITABLE_DAY_PERCENT = 1;
export const REAL_FUNDED_PROFIT_SPLIT_PERCENT = 90; // 90% of earned net profits withdrawable on Real Funded accounts (Principal Locked)

export const PACKAGES: EvaluationPackage[] = [
  {
    id: 'funded-challenge-5000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 5000,
    price: 49,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'funded-challenge-10000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 10000,
    price: 89,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    popular: true,
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'funded-challenge-25000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 25000,
    price: 199,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'funded-challenge-50000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 50000,
    price: 329,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'funded-challenge-100000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 100000,
    price: 549,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'funded-challenge-200000',
    tier: 'funded-challenge',
    tierName: 'Funded Challenge',
    size: 200000,
    price: 1199,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 1,
    minTradingDaysText: '5 days (≥ 1% profit/day)',
    maxDailyDrawdown: 0,
    maxOverallLoss: 10,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    withdrawalFrequency: 'WEEKLY',
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
];

export function getPackageSku(pkg: { tier: string; size: number }): string {
  const sizeK = pkg.size >= 1000 ? `${pkg.size / 1000}K` : `${pkg.size}`;
  const prefix =
    pkg.tier === 'funded-challenge'
      ? 'FC'
      : pkg.tier === 'one-step'
      ? '1S'
      : pkg.tier === 'two-step'
      ? '2S'
      : 'FC';
  return `${prefix}-${sizeK}`;
}

export const MIN_WITHDRAWAL_PROFIT = 250; // Strict $250 Minimum Withdrawal Limit
export const MIN_WITHDRAWAL_AMOUNT = 250;
export const FIRST_WITHDRAWAL_WAITING_DAYS = 7; // Mandatory 7-day waiting period for the very first withdrawal across funded accounts
export const WITHDRAWAL_GUARANTEE_NOTICE =
  'We process payouts within 3 minutes; if we fail, we pay double!';
export const MIN_TRADE_DURATION_SECONDS = 30;
export const MIN_SELF_CAPITAL_DURATION_SECONDS = 5;
export const MAX_TRADE_DURATION_SECONDS = 14400; // 4 hours (14,400 seconds)
export const MAX_SINGLE_TRADE_INVESTMENT_USD = 5000; // Strict $5,000 max investment per single trade
export const INACTIVITY_DAYS_LIMIT = 14;
export const POSITION_SPIKE_FACTOR = 5;
export const GUARANTEED_WITHDRAWAL_SECONDS = 180; // 3 minutes

/**
 * Evaluates the mandatory 7-day waiting period for the very first withdrawal on funded accounts.
 * Standard withdrawals run once per week (WEEKLY); opting for the Daily Withdrawal Add-On (+15%)
 * unlocks daily withdrawals after the initial 7-day waiting period.
 */
export function checkFirstWithdrawalWaitingPeriod(
  account?: TradingAccount | null,
  nowMs: number = Date.now()
): {
  eligible: boolean;
  isFirstWithdrawal: boolean;
  daysElapsed: number;
  daysRemaining: number;
  subsequentCycleLabel: string;
  reason?: string;
} {
  if (!account) {
    return {
      eligible: false,
      isFirstWithdrawal: true,
      daysElapsed: 0,
      daysRemaining: FIRST_WITHDRAWAL_WAITING_DAYS,
      subsequentCycleLabel: 'Weekly (7-Day Standard Plan)',
      reason: 'No active trading account selected.',
    };
  }

  const subsequentCycleLabel = account.dailyWithdrawalsUnlocked
    ? 'Daily Withdrawals (24h Add-on Unlocked)'
    : 'Weekly Withdrawals (7-Day Standard Plan)';

  if (account.firstWithdrawalCompleted) {
    return {
      eligible: true,
      isFirstWithdrawal: false,
      daysElapsed: Math.max(FIRST_WITHDRAWAL_WAITING_DAYS, account.tradingDaysCompleted || FIRST_WITHDRAWAL_WAITING_DAYS),
      daysRemaining: 0,
      subsequentCycleLabel,
    };
  }

  let createdMs = Date.parse(account.createdDate || '');
  if (Number.isNaN(createdMs)) {
    createdMs = nowMs;
  }
  const calendarDays = Math.max(0, Math.floor((nowMs - createdMs) / 86400000));
  const daysElapsed = Math.max(calendarDays, account.tradingDaysCompleted || 0);
  const daysRemaining = Math.max(0, FIRST_WITHDRAWAL_WAITING_DAYS - daysElapsed);

  if (daysElapsed < FIRST_WITHDRAWAL_WAITING_DAYS) {
    return {
      eligible: false,
      isFirstWithdrawal: true,
      daysElapsed,
      daysRemaining,
      subsequentCycleLabel,
      reason: `First Withdrawal 7-Day Lock: A mandatory 7-day waiting period applies to the very first withdrawal on funded accounts (${daysElapsed}/${FIRST_WITHDRAWAL_WAITING_DAYS} days completed, ${daysRemaining} day(s) remaining). After your first withdrawal, your ${subsequentCycleLabel} schedule applies.`,
    };
  }

  return {
    eligible: true,
    isFirstWithdrawal: true,
    daysElapsed,
    daysRemaining: 0,
    subsequentCycleLabel,
  };
}

/**
 * Determines whether an account is a Personal Live / Self-Funded Real Deposit account.
 */
export function isPersonalLiveAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  const rawType = String((account as any).accountType || (account as any).account_type || '').toLowerCase();
  return (
    account.tier === 'personal' ||
    account.accountCategory === 'personal_live' ||
    account.phase === 'personal_live' ||
    rawType === 'self_funded' ||
    rawType === 'personal' ||
    rawType === 'self-capital'
  );
}

/**
 * Determines whether an account is a Demo Practice account.
 */
export function isDemoAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  return (
    account.tier === 'demo' ||
    account.accountCategory === 'demo' ||
    account.phase === 'demo' ||
    Boolean(account.id && typeof account.id === 'string' && account.id.startsWith('BFT-DEMO'))
  );
}

/**
 * Creates a clean Personal Live (Self-Funded) account object for a user.
 */
export function createDefaultPersonalLiveAccount(
  ownerId: string = 'usr_bft_001',
  ownerEmail: string = 'trader@binaryfunded.com',
  initialDeposit: number = 0
): TradingAccount {
  const suffix = ownerId.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase() || '001';
  const id = ownerId === 'usr_bft_001' ? 'BFT-PERS-001' : `BFT-PERS-${suffix}`;
  const today = new Date().toISOString().split('T')[0];
  return {
    id,
    ownerId,
    ownerEmail,
    loginId: id,
    passwordHash: 'PersonalLiveAuth',
    tier: 'personal',
    tierName: 'Personal Live Balance (Self-Funded)',
    accountCategory: 'personal_live',
    depositedCapital: initialDeposit,
    size: Math.max(0, initialDeposit),
    initialBalance: initialDeposit,
    currentBalance: initialDeposit,
    startingDayEquity: initialDeposit,
    equity: initialDeposit,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: 0,
    maxRiskPerTradePercent: 100,
    dailyWithdrawalsUnlocked: true,
    firstWithdrawalCompleted: true,
    monthsCompleted: 12,
    scalingActive: false,
    status: 'active',
    breachType: 'none',
    createdDate: today,
    lastActiveDate: today,
    phase: 'personal_live',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    violationLogs: [],
  };
}

/**
 * Determines whether an account is a Real Funded prop trading account
 * (graduated from a passed challenge or instant funded, with principal locked & 90% profit split).
 * Excludes Personal Live (self-capital), Demo, and active/passed Challenge accounts.
 */
export function isRealFundedAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  if (isPersonalLiveAccount(account) || isDemoAccount(account)) return false;
  if (account.account_tier === 'REAL_FUNDED') return true;
  return Boolean(
    account.isRealFunded ||
      account.is_real_funded ||
      account.phase === 'funded' ||
      account.tier === 'instant'
  );
}

/**
 * Determines whether an account is a Passed Challenge account (locked, certificate unlocked).
 */
export function isPassedChallengeAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  if (isPersonalLiveAccount(account) || isDemoAccount(account) || isRealFundedAccount(account)) {
    return false;
  }
  return account.status === 'passed' || account.status === 'passed_phase_1';
}

/**
 * Determines whether an account is a Live Funded Account (Real Funded, Instant Funded, Passed Evaluation, or Personal Live)
 * versus an active Challenge Evaluation phase.
 */
export function isLiveFundedAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  if (isDemoAccount(account)) return false;
  return (
    isPersonalLiveAccount(account) ||
    isRealFundedAccount(account) ||
    account.status === 'passed'
  );
}

export interface AccountBadgeMeta {
  account_tier: 'LIVE' | 'DEMO' | 'CHALLENGE' | 'REAL_FUNDED';
  badge_color: 'green' | 'yellow' | 'red' | 'purple';
  label: 'LIVE' | 'DEMO' | 'CHALLENGE' | 'REAL FUNDED' | 'PASSED';
  isPassedChallenge: boolean;
}

/**
 * Canonical badge resolver for Wallet & Terminal account selectors:
 * - Personal Live -> Green ('LIVE')
 * - Demo -> Yellow ('DEMO')
 * - Active Challenge -> Red ('CHALLENGE')
 * - Passed Challenge -> Marked 'PASSED' (tier 'CHALLENGE', certificate unlocked)
 * - Real Funded -> Purple ('REAL FUNDED')
 */
export function resolveAccountBadgeMeta(account?: TradingAccount | null): AccountBadgeMeta {
  if (isPersonalLiveAccount(account)) {
    return {
      account_tier: 'LIVE',
      badge_color: 'green',
      label: 'LIVE',
      isPassedChallenge: false,
    };
  }
  if (isDemoAccount(account)) {
    return {
      account_tier: 'DEMO',
      badge_color: 'yellow',
      label: 'DEMO',
      isPassedChallenge: false,
    };
  }
  if (isRealFundedAccount(account)) {
    return {
      account_tier: 'REAL_FUNDED',
      badge_color: 'purple',
      label: 'REAL FUNDED',
      isPassedChallenge: false,
    };
  }
  const passed = isPassedChallengeAccount(account);
  return {
    account_tier: 'CHALLENGE',
    badge_color: 'red',
    label: passed ? 'PASSED' : 'CHALLENGE',
    isPassedChallenge: passed,
  };
}

export function getAccountStatusBadgeLabel(
  account?: TradingAccount | null
): 'PERSONAL LIVE' | 'DEMO' | 'REAL FUNDED' | 'PASSED' | 'CHALLENGE' {
  if (isPersonalLiveAccount(account)) return 'PERSONAL LIVE';
  if (isDemoAccount(account)) return 'DEMO';
  if (isRealFundedAccount(account)) return 'REAL FUNDED';
  if (isPassedChallengeAccount(account)) return 'PASSED';
  return 'CHALLENGE';
}

export function isChallengeBadgeAccount(account?: TradingAccount | null): boolean {
  const badge = resolveAccountBadgeMeta(account);
  return badge.account_tier === 'CHALLENGE' && !badge.isPassedChallenge;
}

export function getAccountBadgeDisplayText(
  account?: TradingAccount | null
): 'LIVE' | 'DEMO' | 'Challenge' | 'REAL FUNDED' | 'PASSED' {
  const badge = resolveAccountBadgeMeta(account);
  if (badge.account_tier === 'CHALLENGE' && !badge.isPassedChallenge) {
    return 'Challenge';
  }
  return badge.label as 'LIVE' | 'DEMO' | 'REAL FUNDED' | 'PASSED';
}

export interface RealFundedWithdrawalAllowance {
  isRealFunded: boolean;
  principalLocked: boolean;
  fundedPrincipal: number;
  currentBalance: number;
  earnedNetProfit: number;
  profitSplitPercent: number;
  maxWithdrawableProfit: number;
}

/**
 * Computes Real Funded withdrawal eligibility:
 * - Funded principal (`initialBalance`) is permanently locked (`principalLocked = true`).
 * - Trader may withdraw up to 90% of earned net profits (`profitSplitPercent = 90`).
 */
export function calculateRealFundedWithdrawalAllowance(
  account?: TradingAccount | null
): RealFundedWithdrawalAllowance {
  if (!account) {
    return {
      isRealFunded: false,
      principalLocked: false,
      fundedPrincipal: 0,
      currentBalance: 0,
      earnedNetProfit: 0,
      profitSplitPercent: REAL_FUNDED_PROFIT_SPLIT_PERCENT,
      maxWithdrawableProfit: 0,
    };
  }

  const realFunded = isRealFundedAccount(account);
  const fundedPrincipal = Math.max(0, Number((account.initialBalance || account.size || 0).toFixed(2)));
  const currentBalance = Math.max(0, Number((account.currentBalance || 0).toFixed(2)));
  const earnedNetProfit = Math.max(0, Number((currentBalance - fundedPrincipal).toFixed(2)));

  if (!realFunded) {
    const isPersonal = isPersonalLiveAccount(account);
    return {
      isRealFunded: false,
      principalLocked: false,
      fundedPrincipal,
      currentBalance,
      earnedNetProfit,
      profitSplitPercent: isPersonal ? 100 : 80,
      maxWithdrawableProfit: isPersonal ? currentBalance : 0,
    };
  }

  const splitPct = Math.min(
    100,
    Math.max(1, Number(account.profit_split_percent ?? REAL_FUNDED_PROFIT_SPLIT_PERCENT))
  );
  const maxWithdrawableProfit = Number(((earnedNetProfit * splitPct) / 100).toFixed(2));

  return {
    isRealFunded: true,
    principalLocked: account.principal_locked !== false,
    fundedPrincipal,
    currentBalance,
    earnedNetProfit,
    profitSplitPercent: splitPct,
    maxWithdrawableProfit,
  };
}

/**
 * Calculates final package price with optional promo code discount,
 * optional +15% Daily Withdrawals Add-on, and 10% Reset Courtesy discount.
 * When promoCode is 'NONE' or null, exact base prices ($49, $89, $199, $329, $549, $1,199) are preserved.
 */
export function calculateDiscountedPrice(
  basePrice: number,
  promoCode: PromoCodeType = 'NONE',
  optionsOrBoolean?:
    | boolean
    | {
        dailyWithdrawalsAddon?: boolean;
        resetCourtesyDiscount?: boolean;
      }
): {
  basePrice: number;
  originalPrice: number;
  promoCode: PromoCodeType;
  promoDiscountPercent: number;
  promoDiscountAmount: number;
  discountSaved: number;
  discountedBasePrice: number;
  dailyAddonAmount: number;
  dailyWithdrawalAddOnFee: number;
  courtesyDiscountAmount: number;
  finalTotal: number;
  totalFinalPrice: number;
} {
  const options =
    typeof optionsOrBoolean === 'boolean'
      ? { dailyWithdrawalsAddon: optionsOrBoolean }
      : optionsOrBoolean;

  const validation = validatePromoCode(promoCode);
  const resolvedPromoCode: PromoCodeType = validation.valid ? validation.code : 'NONE';
  const promoDiscountPercent = validation.valid ? validation.discountPercent : 0;
  const discountedBasePrice =
    promoDiscountPercent > 0
      ? Math.round(basePrice * (1 - promoDiscountPercent / 100))
      : basePrice;
  const promoDiscountAmount = Number((basePrice - discountedBasePrice).toFixed(2));

  const courtesyDiscountAmount = options?.resetCourtesyDiscount
    ? Number((discountedBasePrice * 0.10).toFixed(2))
    : 0;

  const priceAfterCourtesy = Number((discountedBasePrice - courtesyDiscountAmount).toFixed(2));
  const dailyAddonAmount = options?.dailyWithdrawalsAddon
    ? Number((priceAfterCourtesy * (DAILY_WITHDRAWAL_ADDON_PERCENT / 100)).toFixed(2))
    : 0;

  const finalTotal = Number((priceAfterCourtesy + dailyAddonAmount).toFixed(2));

  return {
    basePrice,
    originalPrice: basePrice,
    promoCode: resolvedPromoCode,
    promoDiscountPercent,
    promoDiscountAmount,
    discountSaved: promoDiscountAmount,
    discountedBasePrice,
    dailyAddonAmount,
    dailyWithdrawalAddOnFee: dailyAddonAmount,
    courtesyDiscountAmount,
    finalTotal,
    totalFinalPrice: finalTotal,
  };
}

/**
 * Calculates profit split (80% first 3 months -> 90% after 3 months + scaling plan)
 * and explicitly deducts the 10% Withdrawal Fee from the requested payout amount.
 */
export function calculateWithdrawalBreakdown(
  requestedPayoutAmount: number,
  monthsCompleted: number = 1,
  isPersonalLive: boolean = false,
  isRealFunded: boolean = false
): {
  requestedAmount: number;
  requestedProfit: number;
  profitSplitPercent: number;
  scalingPlanActive: boolean;
  scalingPlanUnlocked: boolean;
  traderShareBeforeFee: number;
  withdrawalFeePercent: number;
  withdrawalFeeAmount: number;
  netPayoutToReceive: number;
  netAmountReceived: number;
  affiliateWithdrawalBonus8Percent: number;
  affiliateWithdrawalBonus: number;
} {
  const scalingPlanActive = isPersonalLive || isRealFunded ? true : monthsCompleted >= 3;
  const profitSplitPercent = isPersonalLive
    ? 100
    : isRealFunded
    ? REAL_FUNDED_PROFIT_SPLIT_PERCENT
    : scalingPlanActive
    ? 90
    : 80;
  const traderShareBeforeFee = Number(((requestedPayoutAmount * profitSplitPercent) / 100).toFixed(2));
  const withdrawalFeePercent = isPersonalLive ? 3 : 10; // 3% for Personal Live, 10% for Funded
  const withdrawalFeeAmount = Number(((requestedPayoutAmount * withdrawalFeePercent) / 100).toFixed(2));
  const netPayoutToReceive = Number((requestedPayoutAmount - withdrawalFeeAmount).toFixed(2));
  const affiliateWithdrawalBonus8Percent = Number((requestedPayoutAmount * 0.08).toFixed(2));

  return {
    requestedAmount: requestedPayoutAmount,
    requestedProfit: requestedPayoutAmount,
    profitSplitPercent,
    scalingPlanActive,
    scalingPlanUnlocked: scalingPlanActive,
    traderShareBeforeFee,
    withdrawalFeePercent,
    withdrawalFeeAmount,
    netPayoutToReceive,
    netAmountReceived: netPayoutToReceive,
    affiliateWithdrawalBonus8Percent,
    affiliateWithdrawalBonus: affiliateWithdrawalBonus8Percent,
  };
}

/**
 * Validates the 5% Max Risk Per Trade rule against current wallet balance.
 * Exceeding 5% of current wallet balance on a single trade triggers an immediate HARD_BREACH.
 */
export function checkMaxRiskPerTradeViolation(
  investment: number,
  walletBalance: number,
  maxRiskPercent: number = MAX_RISK_PER_TRADE_PERCENT
): {
  violated: boolean;
  maxAllowedStake: number;
  stakePercent: number;
  riskPercent: number;
  reason?: string;
} {
  const safeBalance = Math.max(0, Number(walletBalance || 0));
  const maxAllowedStake = Number(((safeBalance * maxRiskPercent) / 100).toFixed(2));
  const stakePercent = safeBalance > 0 ? Number(((investment / safeBalance) * 100).toFixed(2)) : 0;

  if (investment > maxAllowedStake + 1e-6) {
    return {
      violated: true,
      maxAllowedStake,
      stakePercent,
      riskPercent: stakePercent,
      reason: `Hard Breach — Max Risk Per Trade Violated: Stake of $${investment.toFixed(2)} (${stakePercent}%) exceeds the maximum allowed ${maxRiskPercent}% of current wallet balance ($${maxAllowedStake.toFixed(2)}).`,
    };
  }

  return {
    violated: false,
    maxAllowedStake,
    stakePercent,
    riskPercent: stakePercent,
  };
}

export interface FundedTradeRiskEvaluation {
  violated: boolean;
  triggerHardBreach: boolean;
  code?:
    | 'SINGLE_TRADE_RISK_EXCEEDED'
    | 'COMBINED_OPEN_RISK_EXCEEDED'
    | 'DUPLICATE_PAIR_TRADE'
    | 'HEDGING_PROHIBITED'
    | 'MARTINGALE_PROHIBITED';
  reason?: string;
  currentWalletBalance: number;
  totalOpenRisk: number;
  projectedCombinedRisk: number;
  maxAllowedRiskUsd: number;
}

/**
 * Enforces all strict Funded / Challenge Trading & Risk Rules with immediate HARD_BREACH on violation:
 * 1. Maximum risk per single trade: 5% of current wallet balance
 * 2. Maximum combined risk across all currently open trades: 5% total of current wallet balance
 * 3. Only ONE open trade allowed per currency pair at a time (multiple open trades allowed only across different pairs)
 * 4. Hedging strictly prohibited
 * 5. Martingale trading strictly prohibited
 *
 * Self-Capital (Personal Live) and Demo accounts are exempt.
 */
export function evaluateFundedTradeRiskRules(params: {
  account: TradingAccount;
  stake: number;
  assetSymbol: string;
  direction: BinaryOptionDirection;
  activeTrades: BinaryTrade[];
  allTrades: BinaryTrade[];
  stakesAlreadyDeducted?: boolean;
}): FundedTradeRiskEvaluation {
  const { account, stake, assetSymbol, direction, activeTrades, allTrades } = params;
  const stakesAlreadyDeducted = params.stakesAlreadyDeducted ?? true;

  const openActiveTrades = (activeTrades || []).filter((t) => t && t.status === 'active');
  const totalOpenRisk = Number(
    openActiveTrades.reduce((sum, t) => sum + Math.max(0, Number(t.investment || 0)), 0).toFixed(2)
  );
  // Wallet balance before deducting currently open trade stakes represents the trader's current wallet balance
  const currentWalletBalance = Number(
    Math.max(
      0,
      Number(account?.currentBalance || 0) + (stakesAlreadyDeducted ? totalOpenRisk : 0)
    ).toFixed(2)
  );
  const riskPercent = Number(account?.maxRiskPerTradePercent || MAX_RISK_PER_TRADE_PERCENT);
  const maxAllowedRiskUsd = Number(((currentWalletBalance * riskPercent) / 100).toFixed(2));
  const projectedCombinedRisk = Number((totalOpenRisk + Number(stake || 0)).toFixed(2));

  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return {
      violated: false,
      triggerHardBreach: false,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd: Infinity,
    };
  }

  // 1. Hedging Check (Opposing direction on same currency pair) -> Immediate HARD_BREACH
  const hedgingCheck = isHedgingViolation(direction, assetSymbol, openActiveTrades);
  if (hedgingCheck.detected) {
    return {
      violated: true,
      triggerHardBreach: true,
      code: 'HEDGING_PROHIBITED',
      reason: `HARD BREACH — ${hedgingCheck.reason}`,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd,
    };
  }

  // 2. Max 1 Open Trade Per Currency Pair Check -> Immediate HARD_BREACH
  const existingSamePair = openActiveTrades.find((t) => t.asset === assetSymbol);
  if (existingSamePair) {
    return {
      violated: true,
      triggerHardBreach: true,
      code: 'DUPLICATE_PAIR_TRADE',
      reason: `HARD BREACH — Single Position Per Pair Violated: You already have an active open trade on ${assetSymbol}. Only one open trade per currency pair is allowed at a time.`,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd,
    };
  }

  // 3. Max Single-Trade Risk (5% of Current Wallet Balance) -> Immediate HARD_BREACH
  const singleTradeCheck = checkMaxRiskPerTradeViolation(stake, currentWalletBalance, riskPercent);
  if (singleTradeCheck.violated) {
    return {
      violated: true,
      triggerHardBreach: true,
      code: 'SINGLE_TRADE_RISK_EXCEEDED',
      reason: `HARD BREACH — Max Risk Per Trade Violated: Stake of $${Number(stake).toFixed(2)} (${singleTradeCheck.riskPercent}%) exceeds the strict ${riskPercent}% single-trade limit ($${maxAllowedRiskUsd.toFixed(2)} of $${currentWalletBalance.toFixed(2)} wallet balance).`,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd,
    };
  }

  // 4. Max Combined Open Risk Across All Active Trades (5% of Current Wallet Balance) -> Immediate HARD_BREACH
  if (projectedCombinedRisk > maxAllowedRiskUsd + 1e-6) {
    const combinedPct =
      currentWalletBalance > 0
        ? Number(((projectedCombinedRisk / currentWalletBalance) * 100).toFixed(2))
        : 0;
    return {
      violated: true,
      triggerHardBreach: true,
      code: 'COMBINED_OPEN_RISK_EXCEEDED',
      reason: `HARD BREACH — Max Combined Open Risk Violated: Total open exposure of $${projectedCombinedRisk.toFixed(2)} (${combinedPct}% across open trades) exceeds the strict ${MAX_COMBINED_OPEN_RISK_PERCENT}% aggregate limit ($${maxAllowedRiskUsd.toFixed(2)}).`,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd,
    };
  }

  // 5. Martingale Check -> Immediate HARD_BREACH
  const martingaleCheck = isMartingalePattern(stake, allTrades || []);
  if (martingaleCheck.detected) {
    return {
      violated: true,
      triggerHardBreach: true,
      code: 'MARTINGALE_PROHIBITED',
      reason: `HARD BREACH — ${martingaleCheck.reason}`,
      currentWalletBalance,
      totalOpenRisk,
      projectedCombinedRisk,
      maxAllowedRiskUsd,
    };
  }

  return {
    violated: false,
    triggerHardBreach: false,
    currentWalletBalance,
    totalOpenRisk,
    projectedCombinedRisk,
    maxAllowedRiskUsd,
  };
}

export interface RuleValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export function normalizeChallengeAccountType(
  input?: string | null
): 'funded_challenge' | 'instant' | 'one_step' | 'two_step' | 'personal' | 'demo' {
  if (!input) return 'funded_challenge';
  const clean = String(input).toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  if (clean.includes('personal') || clean.includes('self')) return 'personal';
  if (clean.includes('demo')) return 'demo';
  if (clean.includes('funded_challenge') || clean === 'challenge' || clean === 'funded') {
    return 'funded_challenge';
  }
  if (clean.includes('instant')) return 'instant';
  if (clean.includes('one') || clean.includes('1step') || clean === 'one_step') return 'one_step';
  if (clean.includes('two') || clean.includes('2step') || clean === 'two_step') return 'two_step';
  return 'funded_challenge';
}

export function normalizeChallengeTier(input?: string | null): ChallengeTier {
  const normType = normalizeChallengeAccountType(input);
  if (normType === 'funded_challenge') return 'funded-challenge';
  if (normType === 'one_step') return 'one-step';
  if (normType === 'two_step') return 'two-step';
  if (normType === 'instant') return 'instant';
  if (normType === 'personal') return 'personal';
  return 'demo';
}

export function getDynamicAccountLimits(
  accountTypeOrTier?: string | null,
  phase?: string | null,
  overrides?: {
    dailyDrawdown?: number;
    maxDrawdown?: number;
    profitTarget?: number | null;
  }
): {
  accountType: 'funded_challenge' | 'instant' | 'one_step' | 'two_step' | 'personal' | 'demo';
  tier: ChallengeTier;
  profitTargetPercent: number;
  step2TargetPercent: number;
  dailyLossLimitPercent: number;
  maxOverallLossPercent: number;
  maxRiskPerTradePercent: number;
  minProfitableDays: number;
  minProfitableDayPercent: number;
  initialPhase: 'phase_1' | 'phase_2' | 'funded' | 'personal_live' | 'demo';
} {
  const accountType = normalizeChallengeAccountType(accountTypeOrTier);
  const tier = normalizeChallengeTier(accountTypeOrTier);
  const currentPhase = String(phase || '').toLowerCase().trim();

  let defaultDaily = 0;
  let defaultMax = CHALLENGE_MAX_OVERALL_LOSS_PERCENT;
  let defaultTarget = CHALLENGE_PROFIT_TARGET_PERCENT;
  let step2Target = 0;
  let maxRiskPerTradePercent = MAX_RISK_PER_TRADE_PERCENT;
  let minProfitableDays = MIN_PROFITABLE_DAYS;
  let minProfitableDayPercent = MIN_PROFITABLE_DAY_PERCENT;
  let initialPhase: 'phase_1' | 'phase_2' | 'funded' | 'personal_live' | 'demo' = 'phase_1';

  if (accountType === 'funded_challenge' || accountType === 'one_step' || accountType === 'two_step') {
    defaultDaily = 0; // Unified model: 10% Max Overall Account Loss, no separate daily-only cap
    defaultMax = CHALLENGE_MAX_OVERALL_LOSS_PERCENT;
    defaultTarget = currentPhase === 'funded' ? 0 : CHALLENGE_PROFIT_TARGET_PERCENT;
    step2Target = 0;
    maxRiskPerTradePercent = MAX_RISK_PER_TRADE_PERCENT;
    minProfitableDays = currentPhase === 'funded' ? 0 : MIN_PROFITABLE_DAYS;
    minProfitableDayPercent = currentPhase === 'funded' ? 0 : MIN_PROFITABLE_DAY_PERCENT;
    initialPhase = 'phase_1';
  } else if (accountType === 'instant') {
    defaultDaily = 0;
    defaultMax = CHALLENGE_MAX_OVERALL_LOSS_PERCENT;
    defaultTarget = 0;
    step2Target = 0;
    maxRiskPerTradePercent = MAX_RISK_PER_TRADE_PERCENT;
    minProfitableDays = 0;
    minProfitableDayPercent = 0;
    initialPhase = 'funded';
  } else if (accountType === 'personal') {
    defaultDaily = 0;
    defaultMax = 0;
    defaultTarget = 0;
    step2Target = 0;
    maxRiskPerTradePercent = 0;
    minProfitableDays = 0;
    minProfitableDayPercent = 0;
    initialPhase = 'personal_live';
  } else {
    defaultDaily = 0;
    defaultMax = 0;
    defaultTarget = 0;
    step2Target = 0;
    maxRiskPerTradePercent = 0;
    minProfitableDays = 0;
    minProfitableDayPercent = 0;
    initialPhase = 'demo';
  }

  const isUnrestricted = accountType === 'personal' || accountType === 'demo';

  const dailyLossLimitPercent = isUnrestricted
    ? 0
    : overrides?.dailyDrawdown !== undefined && overrides.dailyDrawdown >= 0
    ? overrides.dailyDrawdown
    : defaultDaily;

  const maxOverallLossPercent = isUnrestricted
    ? 0
    : overrides?.maxDrawdown !== undefined && overrides.maxDrawdown > 0
    ? overrides.maxDrawdown
    : defaultMax;

  const profitTargetPercent =
    isUnrestricted || accountType === 'instant' || currentPhase === 'funded'
      ? 0
      : overrides?.profitTarget !== undefined && overrides.profitTarget !== null && overrides.profitTarget > 0
      ? overrides.profitTarget
      : defaultTarget;

  return {
    accountType,
    tier,
    profitTargetPercent,
    step2TargetPercent: step2Target,
    dailyLossLimitPercent,
    maxOverallLossPercent,
    maxRiskPerTradePercent,
    minProfitableDays,
    minProfitableDayPercent,
    initialPhase,
  };
}

/**
 * Sanitizes trading account parameters to guarantee anti-breach initialization.
 * Prevents false auto-breaches upon creation, page refresh, or account switching,
 * and ensures Instant Funded accounts initialize with their full starting capital and active status.
 */
export function sanitizeAccountForAntiBreach(account: TradingAccount): TradingAccount {
  if (!account) return account;

  const dynamicLimits = getDynamicAccountLimits(
    account.accountType || account.tier,
    account.phase || account.challengePhase
  );

  const isPersonal = isPersonalLiveAccount(account);
  const isDemo = isDemoAccount(account);

  const baseSize = Math.max(
    0,
    Number(account.size || account.initialBalance || account.currentBalance || (isPersonal ? 0 : 10000))
  );

  const hasNoTradesYet = !account.tradesCount || account.tradesCount <= 0;

  let initBal = Number(account.initialBalance);
  if (!Number.isFinite(initBal) || (initBal <= 0 && !isPersonal)) {
    initBal = isPersonal ? Math.max(0, Number(account.currentBalance || 0)) : baseSize;
  }

  let curBal = Number(account.currentBalance);
  if (!Number.isFinite(curBal) || (curBal <= 0 && hasNoTradesYet && !isPersonal)) {
    curBal = initBal > 0 ? initBal : baseSize;
  }

  let eq = Number(account.equity);
  if (!Number.isFinite(eq) || (eq <= 0 && hasNoTradesYet && !isPersonal) || (hasNoTradesYet && eq < curBal)) {
    eq = curBal;
  }

  let startEq = Number(account.startingDayEquity);
  if (!Number.isFinite(startEq) || (startEq <= 0 && hasNoTradesYet && !isPersonal)) {
    startEq = curBal > 0 ? curBal : initBal;
  }

  let status = account.status || 'active';
  let breachType = account.breachType || 'none';

  // Normalize hyphenated status strings to canonical database underscore format
  if (status === 'soft-breached') {
    status = 'soft_breached';
    breachType = 'soft';
  } else if (status === 'hard-breached') {
    status = 'hard_breached';
    breachType = 'hard';
  }

  const isBreachStatus =
    status === 'soft_breached' ||
    status === 'hard_breached' ||
    status === 'failed' ||
    status === 'breached';

  // Personal Live, Demo, Passed accounts, or newly purchased accounts (including Instant Funded) with 0 trades and full balance must never be marked breached
  if (isPersonal || isDemo || status === 'passed' || status === 'passed_phase_1') {
    if (isBreachStatus) {
      status = 'active';
      breachType = 'none';
    }
  } else if (hasNoTradesYet && curBal >= initBal) {
    if (isBreachStatus) {
      status = 'active';
      breachType = 'none';
    }
  }

  const badgeMeta = resolveAccountBadgeMeta({
    ...account,
    tier: dynamicLimits.tier,
    accountType: dynamicLimits.accountType,
    phase: account.phase || dynamicLimits.initialPhase,
    status,
  });

  return {
    ...account,
    tier: dynamicLimits.tier,
    accountType: dynamicLimits.accountType,
    account_tier: badgeMeta.account_tier,
    badge_color: badgeMeta.badge_color,
    principal_locked: badgeMeta.account_tier === 'REAL_FUNDED' ? true : account.principal_locked,
    profit_split_percent:
      badgeMeta.account_tier === 'REAL_FUNDED'
        ? account.profit_split_percent ?? REAL_FUNDED_PROFIT_SPLIT_PERCENT
        : account.profit_split_percent,
    phase: account.phase || dynamicLimits.initialPhase,
    challengePhase: account.challengePhase || account.phase || dynamicLimits.initialPhase,
    size: baseSize > 0 ? baseSize : initBal,
    initialBalance: initBal,
    currentBalance: curBal,
    equity: eq,
    startingDayEquity: startEq,
    dailyLossLimitPercent: dynamicLimits.dailyLossLimitPercent,
    maxOverallLossPercent: dynamicLimits.maxOverallLossPercent,
    profitTargetPercent: dynamicLimits.profitTargetPercent,
    maxRiskPerTradePercent: isPersonal || isDemo ? 100 : dynamicLimits.maxRiskPerTradePercent,
    status,
    breachType,
  };
}

/**
 * Returns true if the account is currently in a Soft Breach (Daily Drawdown Pause) state.
 */
export function isAccountSoftBreached(account?: TradingAccount | null): boolean {
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) return false;
  return (
    account.status === 'soft_breached' ||
    account.status === 'soft-breached' ||
    account.breachType === 'soft'
  );
}

/**
 * Returns true if the account is permanently locked due to a Hard Breach (Overall Drawdown / Failed).
 */
export function isAccountHardBreached(account?: TradingAccount | null): boolean {
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) return false;
  if (isAccountSoftBreached(account)) return false;
  return (
    account.status === 'hard_breached' ||
    account.status === 'hard-breached' ||
    account.status === 'failed' ||
    account.status === 'breached' ||
    account.breachType === 'hard'
  );
}

/**
 * Normalizes any account status into the canonical Supabase `trading_accounts.status` value:
 * `'active' | 'soft_breached' | 'hard_breached' | 'passed' | 'passed_phase_1'`
 */
export function normalizeDatabaseAccountStatus(
  status?: string | null,
  breachType?: string | null
): 'active' | 'soft_breached' | 'hard_breached' | 'passed' | 'passed_phase_1' {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'passed_phase_1') return 'passed_phase_1';
  if (s === 'passed') return 'passed';
  if (s === 'soft_breached' || s === 'soft-breached' || breachType === 'soft') {
    return 'soft_breached';
  }
  if (
    s === 'hard_breached' ||
    s === 'hard-breached' ||
    s === 'failed' ||
    s === 'breached' ||
    breachType === 'hard'
  ) {
    return 'hard_breached';
  }
  return 'active';
}

export function getChallengeProfitTarget(
  account?: TradingAccount | null,
  completedProfitableDaysOverride?: number
): {
  isChallenge: boolean;
  targetPercent: number;
  targetAmount: number;
  currentProfit: number;
  progressPercent: number;
  isProfitTargetMet: boolean;
  isMinDaysMet: boolean;
  isTargetMet: boolean;
  completedProfitableDays: number;
  minProfitableDays: number;
  minProfitableDayPercent: number;
} {
  if (!account || isLiveFundedAccount(account) || isDemoAccount(account)) {
    return {
      isChallenge: false,
      targetPercent: 0,
      targetAmount: 0,
      currentProfit: account ? Math.max(0, account.currentBalance - account.initialBalance) : 0,
      progressPercent: 100,
      isProfitTargetMet: false,
      isMinDaysMet: false,
      isTargetMet: false,
      completedProfitableDays: account?.tradingDaysCompleted || 0,
      minProfitableDays: 0,
      minProfitableDayPercent: 0,
    };
  }

  const limits = getDynamicAccountLimits(
    account.accountType || account.tier,
    account.phase || account.challengePhase,
    { profitTarget: account.profitTargetPercent }
  );

  const targetPercent = limits.profitTargetPercent;
  const initBal = Math.max(1, account.initialBalance || account.size || 10000);
  const targetAmount = Number(((initBal * targetPercent) / 100).toFixed(2));
  const currentProfit = Number((account.currentBalance - initBal).toFixed(2));
  const progressPercent =
    targetAmount > 0
      ? Math.min(100, Math.max(0, Number(((currentProfit / targetAmount) * 100).toFixed(1))))
      : 0;
  const completedProfitableDays = Math.max(
    0,
    Math.round(Number(completedProfitableDaysOverride ?? account.tradingDaysCompleted ?? 0))
  );
  const isProfitTargetMet = currentProfit >= targetAmount && targetAmount > 0;
  const isMinDaysMet =
    limits.minProfitableDays <= 0 || completedProfitableDays >= limits.minProfitableDays;

  return {
    isChallenge: targetPercent > 0,
    targetPercent,
    targetAmount,
    currentProfit,
    progressPercent,
    isProfitTargetMet,
    isMinDaysMet,
    isTargetMet: isProfitTargetMet && isMinDaysMet,
    completedProfitableDays,
    minProfitableDays: limits.minProfitableDays,
    minProfitableDayPercent: limits.minProfitableDayPercent,
  };
}

/**
 * Validates if an account can request a withdrawal.
 * Rules:
 * - Challenge accounts CANNOT withdraw funds during the challenge phase.
 * - Minimum withdrawal threshold: strictly $250 in account profits.
 * - Mandatory 7-day waiting period for the very first withdrawal on funded accounts.
 * - Standard withdrawals: Weekly (WEEKLY). Daily Withdrawals Add-On (+15%) unlocks daily payouts.
 */
export function validateWithdrawalRequest(
  account: TradingAccount,
  requestedAmount: number,
  options?: { enforceFirstWithdrawalLock?: boolean; nowMs?: number }
): RuleValidationResult {
  if (isDemoAccount(account)) {
    return {
      valid: false,
      reason: 'Demo Practice accounts use virtual funds and are not eligible for real withdrawals.',
      code: 'DEMO_ACCOUNT_LOCKED',
    };
  }

  // Personal Live (Self-Funded) Accounts:
  // Users can withdraw both personal profits AND deposited capital following the $10 minimum threshold and 3% fee,
  // without being bound by prop challenge target phases, profit-only restrictions, or 7-day waiting periods.
  if (isPersonalLiveAccount(account)) {
    const MIN_PERSONAL_WITHDRAWAL = 10;
    if (account.currentBalance < MIN_PERSONAL_WITHDRAWAL) {
      return {
        valid: false,
        reason: `Minimum withdrawal balance is $${MIN_PERSONAL_WITHDRAWAL}. Current Personal Live balance is $${account.currentBalance.toFixed(2)}.`,
        code: 'BELOW_MIN_BALANCE',
      };
    }

    if (requestedAmount < MIN_PERSONAL_WITHDRAWAL) {
      return {
        valid: false,
        reason: `Minimum withdrawal amount is $${MIN_PERSONAL_WITHDRAWAL}.`,
        code: 'AMOUNT_TOO_LOW',
      };
    }

    if (requestedAmount > account.currentBalance) {
      return {
        valid: false,
        reason: `Cannot withdraw more than your available Personal Live balance ($${account.currentBalance.toFixed(2)}).`,
        code: 'EXCEEDS_BALANCE',
      };
    }

    return { valid: true };
  }

  if (!isRealFundedAccount(account)) {
    return {
      valid: false,
      reason: isPassedChallengeAccount(account)
        ? 'This Challenge account has PASSED and is archived. Switch to your newly provisioned Purple REAL FUNDED account to trade and withdraw up to 90% of earned net profits.'
        : 'Withdrawals are locked during the Challenge Phase. Reach the 30% profit target across at least 5 qualifying trading days (≥1% profit/day) to auto-graduate to your Real Funded Account.',
      code: 'CHALLENGE_PHASE_LOCKED',
    };
  }

  if (options?.enforceFirstWithdrawalLock) {
    const firstLock = checkFirstWithdrawalWaitingPeriod(account, options.nowMs);
    if (!firstLock.eligible) {
      return {
        valid: false,
        reason: firstLock.reason,
        code: 'FIRST_WITHDRAWAL_7_DAY_LOCK',
      };
    }
  }

  const allowance = calculateRealFundedWithdrawalAllowance(account);
  const currentProfit = allowance.earnedNetProfit;

  if (currentProfit <= 0) {
    return {
      valid: false,
      reason: `Funded principal ($${allowance.fundedPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}) is permanently locked. Account has no earned net profit yet (Current balance: $${account.currentBalance.toFixed(2)}).`,
      code: 'NO_PROFIT',
    };
  }

  if (currentProfit < MIN_WITHDRAWAL_PROFIT) {
    return {
      valid: false,
      reason: `Minimum profit requirement is $${MIN_WITHDRAWAL_PROFIT}. Current earned net profit is $${currentProfit.toFixed(2)}.`,
      code: 'BELOW_MIN_PROFIT',
    };
  }

  if (requestedAmount < MIN_WITHDRAWAL_PROFIT) {
    return {
      valid: false,
      reason: `Minimum withdrawal amount is $${MIN_WITHDRAWAL_PROFIT}.`,
      code: 'AMOUNT_TOO_LOW',
    };
  }

  if (requestedAmount > currentProfit + 1e-6) {
    return {
      valid: false,
      reason: `Principal Locked: Cannot withdraw more than earned net profit ($${currentProfit.toFixed(2)}). Your $${allowance.fundedPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })} funded principal cannot be withdrawn.`,
      code: 'EXCEEDS_PROFIT',
    };
  }

  if (requestedAmount > allowance.maxWithdrawableProfit + 1e-6) {
    return {
      valid: false,
      reason: `Real Funded ${allowance.profitSplitPercent}% Profit Limit: Maximum withdrawable amount is $${allowance.maxWithdrawableProfit.toFixed(2)} (${allowance.profitSplitPercent}% of $${currentProfit.toFixed(2)} earned net profit). Funded principal ($${allowance.fundedPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2 })}) is locked.`,
      code: 'EXCEEDS_90_PERCENT_PROFIT',
    };
  }

  return { valid: true };
}

/**
 * Clamps any custom trade duration into the valid platform range [5s, 4h (14,400s)].
 */
export function clampCustomTradeDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60;
  return Math.max(
    MIN_SELF_CAPITAL_DURATION_SECONDS,
    Math.min(MAX_TRADE_DURATION_SECONDS, Math.round(seconds))
  );
}

/**
 * Splits a duration in seconds into { hours, minutes, seconds }.
 */
export function durationSecondsToHms(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const clamped = clampCustomTradeDuration(totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return { hours, minutes, seconds };
}

/**
 * Converts custom Hours (0-4), Minutes (0-59), and Seconds (0-59) into a clamped duration in seconds [5s, 14400s].
 */
export function hmsToDurationSeconds(hours: number, minutes: number, seconds: number): number {
  const h = Math.max(0, Math.min(4, Math.floor(Number(hours) || 0)));
  const m = h >= 4 ? 0 : Math.max(0, Math.min(59, Math.floor(Number(minutes) || 0)));
  const s = h >= 4 ? 0 : Math.max(0, Math.min(59, Math.floor(Number(seconds) || 0)));
  return clampCustomTradeDuration(h * 3600 + m * 60 + s);
}

/**
 * Determines whether the given account is a Funded / Prop Evaluation account subject to the 30-second minimum duration rule.
 * Self-Capital (Personal Live) accounts are exempt and can trade starting from 5 seconds.
 */
export function isFundedDurationRestrictedAccount(account?: TradingAccount | null): boolean {
  if (!account) return true;
  if (isPersonalLiveAccount(account)) return false;
  return true;
}

/**
 * Validates trade duration according to account type:
 * - Custom range: 5 seconds to 4 hours (14,400 seconds)
 * - Funded Accounts: strictly blocked under 30 seconds
 * - Self-Capital Accounts: exempt from 30-second restriction (allowed from 5 seconds)
 */
export function validateTradeDurationForAccount(
  durationSeconds: number,
  account?: TradingAccount | null
): {
  valid: boolean;
  code?: 'DURATION_BELOW_5S' | 'DURATION_ABOVE_4H' | 'FUNDED_ACCOUNT_UNDER_30S';
  reason?: string;
} {
  const sec = Number(durationSeconds);
  if (!Number.isFinite(sec) || sec < MIN_SELF_CAPITAL_DURATION_SECONDS) {
    return {
      valid: false,
      code: 'DURATION_BELOW_5S',
      reason: `Minimum trade duration is ${MIN_SELF_CAPITAL_DURATION_SECONDS} seconds (00:00:05).`,
    };
  }
  if (sec > MAX_TRADE_DURATION_SECONDS) {
    return {
      valid: false,
      code: 'DURATION_ABOVE_4H',
      reason: 'Maximum trade duration is 4 hours (04:00:00).',
    };
  }
  if (isFundedDurationRestrictedAccount(account) && sec < MIN_TRADE_DURATION_SECONDS) {
    return {
      valid: false,
      code: 'FUNDED_ACCOUNT_UNDER_30S',
      reason:
        'Rule Violation (Funded Account): Trade durations under 30 seconds are strictly blocked for Funded Accounts. Self-Capital accounts can place trades starting from 5 seconds.',
    };
  }
  return { valid: true };
}

/**
 * Validates trade duration to prevent tick scalping on Funded Accounts while allowing 5s+ on Self-Capital accounts.
 */
export function isValidTradeDuration(
  durationSeconds: number,
  account?: TradingAccount | null
): boolean {
  return validateTradeDurationForAccount(durationSeconds, account).valid;
}

/**
 * Checks if position size is a sudden 5x spike compared to historical average.
 * Rule: Consistent Lot/Position Sizing Rule.
 */
export function isPositionSizeSpike(
  currentInvestment: number,
  pastInvestments: number[]
): boolean {
  if (!pastInvestments || pastInvestments.length < 3) {
    return false; // Not enough history to flag
  }
  const avg = pastInvestments.reduce((sum, val) => sum + val, 0) / pastInvestments.length;
  return currentInvestment >= avg * POSITION_SPIKE_FACTOR;
}

/**
 * Detects Martingale risk-doubling behavior.
 * Rule: Exponential position doubling following consecutive losses is prohibited.
 * Flags if stake is >= 1.8x following an immediately preceding loss trade.
 */
export function isMartingalePattern(
  currentInvestment: number,
  recentTrades: BinaryTrade[]
): { detected: boolean; reason?: string; multiplier?: number } {
  const closedTrades = recentTrades
    .filter((t) => t.status === 'won' || t.status === 'lost')
    .sort((a, b) => b.endTime - a.endTime);

  if (closedTrades.length === 0) {
    return { detected: false };
  }

  const lastTrade = closedTrades[0];
  if (lastTrade.status === 'lost' && lastTrade.investment > 0) {
    const multiplier = currentInvestment / lastTrade.investment;
    if (multiplier >= 1.8) {
      return {
        detected: true,
        multiplier: Number(multiplier.toFixed(2)),
        reason: `Martingale Prohibited: Stake of $${currentInvestment} is a ${multiplier.toFixed(1)}x doubling after previous loss ($${lastTrade.investment}).`,
      };
    }
  }

  return { detected: false };
}

/**
 * Detects Hedging violation: Simultaneous open CALL and PUT positions on the same asset.
 */
export function isHedgingViolation(
  newDirection: BinaryOptionDirection,
  asset: string,
  activeTrades: BinaryTrade[]
): { detected: boolean; reason?: string } {
  const opposingDirection: BinaryOptionDirection = newDirection === 'CALL' ? 'PUT' : 'CALL';
  const hasOpposingActive = activeTrades.some(
    (t) => t.status === 'active' && t.asset === asset && t.direction === opposingDirection
  );

  if (hasOpposingActive) {
    return {
      detected: true,
      reason: `Hedging Prohibited: You already have an active ${opposingDirection} position on ${asset}. Simultaneous opposing positions are not permitted.`,
    };
  }

  return { detected: false };
}

/**
 * Institutional High-Impact Economic News Events Calendar
 */
export interface NewsEvent {
  title: string;
  timestamp: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  currency?: string;
}

export const DEFAULT_NEWS_EVENTS: NewsEvent[] = [
  {
    title: 'US Non-Farm Payrolls (NFP) & Unemployment Rate',
    timestamp: Date.now() + 15 * 60 * 1000, // 15 mins in future
    impact: 'HIGH',
    currency: 'USD',
  },
  {
    title: 'US Core CPI Inflation Rate (YoY)',
    timestamp: Date.now() + 45 * 60 * 1000,
    impact: 'HIGH',
    currency: 'USD',
  },
  {
    title: 'FOMC Interest Rate Decision & Fed Press Conference',
    timestamp: Date.now() + 120 * 60 * 1000,
    impact: 'HIGH',
    currency: 'USD',
  },
  {
    title: 'ECB Monetary Policy Statement',
    timestamp: Date.now() + 240 * 60 * 1000,
    impact: 'HIGH',
    currency: 'EUR',
  },
];

export function isDuringRestrictedNewsWindow(
  tradeTime: number,
  newsEvents: NewsEvent[] = DEFAULT_NEWS_EVENTS,
  windowMinutes: number = 2
): { restricted: boolean; eventTitle?: string } {
  const windowMs = windowMinutes * 60 * 1000;
  for (const event of newsEvents) {
    if (event.impact === 'HIGH') {
      const diff = Math.abs(tradeTime - event.timestamp);
      if (diff <= windowMs) {
        return { restricted: true, eventTitle: event.title };
      }
    }
  }
  return { restricted: false };
}

/**
 * Calculates live mark-to-market equity for an account given its current balance
 * (which already has active trade stakes deducted) and its currently active trades.
 */
export function calculateLiveAccountEquity(
  currentBalance: number,
  activeTrades: BinaryTrade[],
  getPriceForAsset: (symbol: string, fallbackStrike: number) => number,
  stakesAlreadyDeducted: boolean = true
): {
  liveEquity: number;
  floatingReturn: number;
  netFloatingPnL: number;
} {
  let floatingReturn = 0;
  let netFloatingPnL = 0;

  for (const t of activeTrades) {
    if (!t || t.status !== 'active') continue;
    const livePrice = getPriceForAsset(t.asset, t.strikePrice);
    const diff = livePrice - t.strikePrice;
    const isTie = Math.abs(diff) < 1e-7;
    const isWin =
      !isTie &&
      ((t.direction === 'CALL' && diff > 0) || (t.direction === 'PUT' && diff < 0));

    const stake = Number(t.investment || 0);
    const profit = Number(((stake * Number(t.payoutPercentage || 85)) / 100).toFixed(2));

    if (isTie) {
      floatingReturn += stake;
      netFloatingPnL += 0;
    } else if (isWin) {
      floatingReturn += stake + profit;
      netFloatingPnL += profit;
    } else {
      floatingReturn += 0;
      netFloatingPnL -= stake;
    }
  }

  const baseBal = Number(currentBalance || 0);
  const liveEquity = stakesAlreadyDeducted
    ? Number(Math.max(0, baseBal + floatingReturn).toFixed(2))
    : Number(Math.max(0, baseBal + netFloatingPnL).toFixed(2));

  return {
    liveEquity,
    floatingReturn: Number(floatingReturn.toFixed(2)),
    netFloatingPnL: Number(netFloatingPnL.toFixed(2)),
  };
}

/**
 * Calculates current daily drawdown, cumulative overall drawdown, and exact remaining buffers.
 * If a daily loss brings a $5,000 1-Step account (10% Daily DD = $500, 15% Overall DD = $750)
 * down to $4,500, the remaining overall drawdown buffer shrinks to $250 ($750 - $500).
 */
export function calculateDrawdownMetrics(account: TradingAccount) {
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return {
      dailyDrawdownAmount: 0,
      dailyDrawdownPercent: 0,
      dailyLimitAmount: 0,
      remainingDailyBuffer: Infinity,
      overallLossAmount: 0,
      overallLossPercent: 0,
      maxOverallLossAmount: 0,
      remainingOverallBuffer: Infinity,
      effectiveRemainingBuffer: Infinity,
      hardBreachFloor: 0,
      dailySoftBreachFloor: 0,
      isDailyBreached: false,
      isOverallBreached: false,
      isBreached: false,
    };
  }

  const referenceBalance = Math.max(
    Number(account.initialBalance || 0),
    Number(account.size || 0)
  );
  const startDayEq =
    Number(account.startingDayEquity || 0) > 0
      ? Number(account.startingDayEquity)
      : referenceBalance;
  const currentEq = Number.isFinite(Number(account.equity))
    ? Number(account.equity)
    : Number(account.currentBalance ?? referenceBalance);

  const dailyLimitPercent = Number(account.dailyLossLimitPercent ?? 0);
  const overallLimitPercent = Number(account.maxOverallLossPercent ?? 0);

  const dailyLimitAmount = Number(((startDayEq * dailyLimitPercent) / 100).toFixed(2));
  const maxOverallLossAmount = Number(((referenceBalance * overallLimitPercent) / 100).toFixed(2));
  const hardBreachFloor = Number(Math.max(0, referenceBalance - maxOverallLossAmount).toFixed(2));

  const overallLossAmount = Number(Math.max(0, referenceBalance - currentEq).toFixed(2));
  const overallLossPercent =
    referenceBalance > 0
      ? Number(((overallLossAmount / referenceBalance) * 100).toFixed(2))
      : 0;

  const remainingOverallBuffer =
    overallLimitPercent > 0
      ? Number(Math.max(0, maxOverallLossAmount - overallLossAmount).toFixed(2))
      : Infinity;

  const dailyDrawdownAmount = Number(Math.max(0, startDayEq - currentEq).toFixed(2));
  const dailyDrawdownPercent =
    startDayEq > 0
      ? Number(((dailyDrawdownAmount / startDayEq) * 100).toFixed(2))
      : 0;

  const rawRemainingDailyBuffer =
    dailyLimitPercent > 0
      ? Number(Math.max(0, dailyLimitAmount - dailyDrawdownAmount).toFixed(2))
      : Infinity;

  const remainingDailyBuffer =
    overallLimitPercent > 0 && Number.isFinite(remainingOverallBuffer)
      ? Number(Math.min(rawRemainingDailyBuffer, remainingOverallBuffer).toFixed(2))
      : rawRemainingDailyBuffer;

  const dailySoftBreachFloor = Number(
    Math.max(hardBreachFloor, startDayEq - dailyLimitAmount).toFixed(2)
  );

  const effectiveRemainingBuffer = Number(
    Math.min(remainingDailyBuffer, remainingOverallBuffer).toFixed(2)
  );

  const isDailyBreached =
    dailyLimitPercent > 0 &&
    (dailyDrawdownPercent >= dailyLimitPercent ||
      (dailyLimitAmount > 0 && dailyDrawdownAmount >= dailyLimitAmount));
  const isOverallBreached =
    overallLimitPercent > 0 &&
    (overallLossPercent >= overallLimitPercent ||
      (maxOverallLossAmount > 0 && overallLossAmount >= maxOverallLossAmount));

  return {
    dailyDrawdownAmount,
    dailyDrawdownPercent,
    dailyLimitAmount,
    remainingDailyBuffer,
    overallLossAmount,
    overallLossPercent,
    maxOverallLossAmount,
    remainingOverallBuffer,
    effectiveRemainingBuffer,
    hardBreachFloor,
    dailySoftBreachFloor,
    isDailyBreached,
    isOverallBreached,
    isBreached: isDailyBreached || isOverallBreached,
  };
}

/**
 * Zero-Tolerance Execution Guard:
 * Prevents users from placing any trade that breaches the exact remaining daily or cumulative overall
 * drawdown threshold, or exceeds the 5% Max Risk per Trade rule.
 * Personal Live (Self-Funded) and Demo accounts are unrestricted.
 */
export function validateZeroToleranceTradeExecution(params: {
  account: TradingAccount;
  stake: number;
  liveEquity?: number;
}): {
  allowed: boolean;
  reason?: string;
  code?:
    | 'ACCOUNT_HARD_BREACHED'
    | 'ACCOUNT_SOFT_BREACHED'
    | 'INVALID_STAKE'
    | 'MAX_SINGLE_TRADE_LIMIT_EXCEEDED'
    | 'INSUFFICIENT_BALANCE'
    | 'MAX_RISK_PER_TRADE_EXCEEDED'
    | 'DAILY_DRAWDOWN_BUFFER_EXCEEDED'
    | 'OVERALL_DRAWDOWN_BUFFER_EXCEEDED';
  remainingDailyBuffer: number;
  remainingOverallBuffer: number;
  maxAllowedStake: number;
} {
  const { account } = params;
  const stake = Number(params.stake);
  const currentBalance = Number(account?.currentBalance ?? 0);
  const bonusBalance = isPersonalLiveAccount(account)
    ? Math.max(0, Number(account?.bonusBalance ?? account?.bonus_balance ?? 0))
    : 0;
  const effectiveAvailableBalance = Number((currentBalance + bonusBalance).toFixed(2));

  if (!Number.isFinite(stake) || stake <= 0) {
    return {
      allowed: false,
      code: 'INVALID_STAKE',
      reason: 'Please enter a valid investment stake ($1+).',
      remainingDailyBuffer: 0,
      remainingOverallBuffer: 0,
      maxAllowedStake: 0,
    };
  }

  if (stake > MAX_SINGLE_TRADE_INVESTMENT_USD) {
    return {
      allowed: false,
      code: 'MAX_SINGLE_TRADE_LIMIT_EXCEEDED',
      reason: `Per-Trade Risk Limit Exceeded: Maximum investment is $${MAX_SINGLE_TRADE_INVESTMENT_USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per single trade across both Self-Capital and Funded accounts.`,
      remainingDailyBuffer:
        isPersonalLiveAccount(account) || isDemoAccount(account)
          ? Infinity
          : effectiveAvailableBalance,
      remainingOverallBuffer:
        isPersonalLiveAccount(account) || isDemoAccount(account)
          ? Infinity
          : effectiveAvailableBalance,
      maxAllowedStake: Math.min(effectiveAvailableBalance, MAX_SINGLE_TRADE_INVESTMENT_USD),
    };
  }

  if (stake > effectiveAvailableBalance + 1e-6) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_BALANCE',
      reason: `Insufficient balance. Available capital: $${effectiveAvailableBalance.toFixed(2)}`,
      remainingDailyBuffer: effectiveAvailableBalance,
      remainingOverallBuffer: effectiveAvailableBalance,
      maxAllowedStake: Math.min(effectiveAvailableBalance, MAX_SINGLE_TRADE_INVESTMENT_USD),
    };
  }

  if (isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return {
      allowed: true,
      remainingDailyBuffer: Infinity,
      remainingOverallBuffer: Infinity,
      maxAllowedStake: Math.min(effectiveAvailableBalance, MAX_SINGLE_TRADE_INVESTMENT_USD),
    };
  }

  if (isAccountHardBreached(account)) {
    return {
      allowed: false,
      code: 'ACCOUNT_HARD_BREACHED',
      reason: 'Account is permanently locked due to a Hard Breach (Max Overall Drawdown exceeded).',
      remainingDailyBuffer: 0,
      remainingOverallBuffer: 0,
      maxAllowedStake: 0,
    };
  }

  if (isAccountSoftBreached(account)) {
    return {
      allowed: false,
      code: 'ACCOUNT_SOFT_BREACHED',
      reason:
        'Soft Breach Active: Daily drawdown limit reached. Account is locked from opening new trades for the rest of the calendar day.',
      remainingDailyBuffer: 0,
      remainingOverallBuffer: 0,
      maxAllowedStake: 0,
    };
  }

  const eq =
    params.liveEquity !== undefined && Number.isFinite(params.liveEquity)
      ? params.liveEquity
      : Number(account.equity ?? account.currentBalance);

  const metrics = calculateDrawdownMetrics({
    ...account,
    equity: eq,
  });

  if (metrics.isOverallBreached) {
    return {
      allowed: false,
      code: 'ACCOUNT_HARD_BREACHED',
      reason: 'Max Overall Drawdown limit reached. Trading is permanently locked.',
      remainingDailyBuffer: 0,
      remainingOverallBuffer: 0,
      maxAllowedStake: 0,
    };
  }

  if (metrics.isDailyBreached) {
    return {
      allowed: false,
      code: 'ACCOUNT_SOFT_BREACHED',
      reason:
        'Daily Drawdown limit reached. Account is locked from opening new trades for the rest of the calendar day.',
      remainingDailyBuffer: 0,
      remainingOverallBuffer: metrics.remainingOverallBuffer,
      maxAllowedStake: 0,
    };
  }

  const walletBalanceForRisk = Math.max(0, Number(account.currentBalance || 0));
  const riskPct = Number(account.maxRiskPerTradePercent || MAX_RISK_PER_TRADE_PERCENT);
  const maxRiskCheck = checkMaxRiskPerTradeViolation(stake, walletBalanceForRisk, riskPct);

  const maxAllowedByDrawdown = Math.min(
    metrics.remainingDailyBuffer,
    metrics.remainingOverallBuffer
  );
  const maxAllowedStake = Number(
    Math.min(
      currentBalance,
      maxRiskCheck.maxAllowedStake,
      maxAllowedByDrawdown,
      MAX_SINGLE_TRADE_INVESTMENT_USD
    ).toFixed(2)
  );

  if (maxRiskCheck.violated) {
    return {
      allowed: false,
      code: 'MAX_RISK_PER_TRADE_EXCEEDED',
      reason: `Max Risk Per Trade Violated: Stake of $${stake.toFixed(2)} (${maxRiskCheck.riskPercent}%) exceeds the strict ${riskPct}% per-trade limit ($${maxRiskCheck.maxAllowedStake.toFixed(2)} of current wallet balance).`,
      remainingDailyBuffer: metrics.remainingDailyBuffer,
      remainingOverallBuffer: metrics.remainingOverallBuffer,
      maxAllowedStake,
    };
  }

  if (stake > metrics.remainingOverallBuffer) {
    return {
      allowed: false,
      code: 'OVERALL_DRAWDOWN_BUFFER_EXCEEDED',
      reason: `Zero-Tolerance Drawdown Guard: Trade stake ($${stake.toFixed(2)}) exceeds your exact remaining Max Overall Drawdown buffer ($${metrics.remainingOverallBuffer.toFixed(2)}).`,
      remainingDailyBuffer: metrics.remainingDailyBuffer,
      remainingOverallBuffer: metrics.remainingOverallBuffer,
      maxAllowedStake,
    };
  }

  if (stake > metrics.remainingDailyBuffer) {
    return {
      allowed: false,
      code: 'DAILY_DRAWDOWN_BUFFER_EXCEEDED',
      reason: `Zero-Tolerance Drawdown Guard: Trade stake ($${stake.toFixed(2)}) exceeds your exact remaining Daily Drawdown buffer ($${metrics.remainingDailyBuffer.toFixed(2)}).`,
      remainingDailyBuffer: metrics.remainingDailyBuffer,
      remainingOverallBuffer: metrics.remainingOverallBuffer,
      maxAllowedStake,
    };
  }

  return {
    allowed: true,
    remainingDailyBuffer: metrics.remainingDailyBuffer,
    remainingOverallBuffer: metrics.remainingOverallBuffer,
    maxAllowedStake,
  };
}

/**
 * Executes an instant Soft Breach & Active Trade Auto-Liquidation when an account hits its Daily Drawdown limit:
 * - Immediately closes/cancels all active floating trades at their current live market price.
 * - Realizes each trade's PnL (win, loss, or tie) and updates `currentBalance` and `equity`.
 * - Sets `startingDayEquity` for the next trading day precisely to the remaining balance (e.g., $4,500).
 * - Locks the account (`status: 'soft-breached'`, `breachType: 'soft'`) for the rest of the calendar day.
 */
export function liquidateActiveTradesOnSoftBreach(params: {
  account: TradingAccount;
  activeTrades: BinaryTrade[];
  getLivePrice: (assetSymbol: string, strikePrice: number) => number;
  nowMs?: number;
  stakesAlreadyDeducted?: boolean;
  breachReason?: string;
}): {
  updatedAccount: TradingAccount;
  liquidatedTrades: BinaryTrade[];
  realizedPnL: number;
  totalCreditedBack: number;
  nextDayStartingBalance: number;
  remainingOverallBuffer: number;
} {
  const nowMs = params.nowMs ?? Date.now();
  const stakesAlreadyDeducted = params.stakesAlreadyDeducted ?? true;
  const { account, activeTrades, getLivePrice } = params;

  const liquidatedTrades: BinaryTrade[] = [];
  let totalCreditedBack = 0;
  let totalDeltaIfNotDeducted = 0;
  let realizedPnL = 0;

  for (const t of activeTrades) {
    if (!t || t.status !== 'active') continue;
    const closePrice = getLivePrice(t.asset, t.strikePrice);
    const diff = closePrice - t.strikePrice;
    const isTie = Math.abs(diff) < 1e-7;
    const isWin =
      !isTie &&
      ((t.direction === 'CALL' && diff > 0) || (t.direction === 'PUT' && diff < 0));

    const stake = Number(t.investment || 0);
    const profit = Number(((stake * Number(t.payoutPercentage || 85)) / 100).toFixed(2));

    let status: 'won' | 'lost' | 'tie' = 'lost';
    let pnl = -stake;

    if (isTie) {
      status = 'tie';
      pnl = 0;
      totalCreditedBack += stake;
      totalDeltaIfNotDeducted += 0;
    } else if (isWin) {
      status = 'won';
      pnl = profit;
      totalCreditedBack += Number((stake + profit).toFixed(2));
      totalDeltaIfNotDeducted += profit;
    } else {
      status = 'lost';
      pnl = -stake;
      totalCreditedBack += 0;
      totalDeltaIfNotDeducted -= stake;
    }

    realizedPnL += pnl;
    liquidatedTrades.push({
      ...t,
      status,
      closePrice,
      currentPrice: closePrice,
      endTime: nowMs,
      pnl: Number(pnl.toFixed(2)),
    });
  }

  const baseBalance = Number(account.currentBalance || 0);
  const finalBalance = stakesAlreadyDeducted
    ? Number(Math.max(0, baseBalance + totalCreditedBack).toFixed(2))
    : Number(Math.max(0, baseBalance + totalDeltaIfNotDeducted).toFixed(2));

  const nextReset = getNextDailyResetTimestamp(nowMs);
  const reason =
    params.breachReason ||
    `Daily Drawdown Limit Reached (${account.dailyLossLimitPercent}%): All active floating trades were auto-liquidated and trading is locked until the next trading day. Next day starting balance set to $${finalBalance.toFixed(2)}.`;

  const breachLog: RuleViolationLog = {
    id: `VIO-DAILY-${nowMs}`,
    rule: 'DAILY_LOSS',
    ruleName: 'Daily Loss Limit (Soft Breach & Auto-Liquidation)',
    severity: 'warning',
    message: reason,
    timestamp: nowMs,
    details: `Auto-liquidated ${liquidatedTrades.length} trade(s). Remaining Balance & Next Day Starting Equity: $${finalBalance.toFixed(2)}`,
  };

  const postMetrics = calculateDrawdownMetrics({
    ...account,
    currentBalance: finalBalance,
    equity: finalBalance,
    startingDayEquity: finalBalance,
  });

  const isAlsoHardBreached = postMetrics.isOverallBreached;

  const updatedAccount: TradingAccount = {
    ...account,
    currentBalance: finalBalance,
    equity: finalBalance,
    startingDayEquity: finalBalance,
    status: isAlsoHardBreached ? 'hard_breached' : 'soft_breached',
    breachType: isAlsoHardBreached ? 'hard' : 'soft',
    discountEligible: isAlsoHardBreached ? true : account.discountEligible,
    softBreachResetTime: isAlsoHardBreached ? undefined : nextReset,
    breachReason: reason,
    breachedAt: nowMs,
    tradesCount: (account.tradesCount || 0) + liquidatedTrades.length,
    violationLogs: [...(account.violationLogs || []), breachLog],
  };

  return {
    updatedAccount,
    liquidatedTrades,
    realizedPnL: Number(realizedPnL.toFixed(2)),
    totalCreditedBack: Number(totalCreditedBack.toFixed(2)),
    nextDayStartingBalance: finalBalance,
    remainingOverallBuffer: postMetrics.remainingOverallBuffer,
  };
}

/**
 * Real-Time Event-Driven Trading Engine Check:
 * Continuously evaluates account equity and balance second-by-second:
 * 1. Overall Drawdown (Hard Breach / Failed): Immediately updates status to `'hard_breached'`,
 *    auto-liquidates all active floating trades, realizes PnL, and locks the account permanently.
 * 2. Daily Drawdown (Soft Breach): Immediately updates status to `'soft_breached'`,
 *    auto-liquidates all active floating trades, realizes PnL, locks order placement for the rest of the day,
 *    and sets the next day's starting balance (`startingDayEquity`) to the remaining balance.
 * 3. Target Reached (Passed): When challenge profit targets are met, automatically updates status to
 *    `'passed'` (or `'passed_phase_1'`) for immediate phase transition without requiring page refresh.
 * 4. Self-Funded Accounts (`personal_live`) & Demo Accounts: Unrestricted (`action: 'none'`).
 */
export function evaluateRealtimeTradingEngine(params: {
  account: TradingAccount;
  activeTrades: BinaryTrade[];
  getLivePrice: (assetSymbol: string, strikePrice: number) => number;
  nowMs?: number;
  stakesAlreadyDeducted?: boolean;
}): {
  action: 'none' | 'soft_breach' | 'hard_breach' | 'target_reached';
  updatedAccount: TradingAccount;
  liquidatedTrades: BinaryTrade[];
  liveEquity: number;
  databaseStatus: 'active' | 'soft_breached' | 'hard_breached' | 'passed' | 'passed_phase_1';
  reason?: string;
} {
  const nowMs = params.nowMs ?? Date.now();
  const stakesAlreadyDeducted = params.stakesAlreadyDeducted ?? true;
  const sanitized = sanitizeAccountForAntiBreach(params.account);

  const { liveEquity } = calculateLiveAccountEquity(
    sanitized.currentBalance,
    params.activeTrades,
    params.getLivePrice,
    stakesAlreadyDeducted
  );

  // Self-Funded & Demo accounts are completely unrestricted
  if (isPersonalLiveAccount(sanitized) || isDemoAccount(sanitized)) {
    return {
      action: 'none',
      updatedAccount: { ...sanitized, equity: liveEquity },
      liquidatedTrades: [],
      liveEquity,
      databaseStatus: 'active',
    };
  }

  // If already breached or passed, preserve state
  if (
    isAccountHardBreached(sanitized) ||
    isAccountSoftBreached(sanitized) ||
    sanitized.status === 'passed' ||
    sanitized.status === 'passed_phase_1'
  ) {
    return {
      action: 'none',
      updatedAccount: sanitized,
      liquidatedTrades: [],
      liveEquity,
      databaseStatus: normalizeDatabaseAccountStatus(sanitized.status, sanitized.breachType),
    };
  }

  const accountWithLiveEq: TradingAccount = {
    ...sanitized,
    equity: liveEquity,
  };

  const breachEval = evaluateAccountBreach(accountWithLiveEq);
  if (breachEval.isBreached) {
    const liquidation = liquidateActiveTradesOnSoftBreach({
      account: accountWithLiveEq,
      activeTrades: params.activeTrades,
      getLivePrice: params.getLivePrice,
      nowMs,
      stakesAlreadyDeducted,
      breachReason: breachEval.reason,
    });

    if (
      breachEval.breachCategory === 'hard' ||
      isAccountHardBreached(liquidation.updatedAccount)
    ) {
      const hardReason =
        breachEval.reason ||
        `Maximum Overall Loss Exceeded (${accountWithLiveEq.maxOverallLossPercent}%). Permanent Hard Breach enforced.`;
      const breachLog: RuleViolationLog = {
        id: `VIO-OVERALL-${nowMs}`,
        rule: 'OVERALL_LOSS',
        ruleName: 'Max Overall Loss (Hard Breach)',
        severity: 'critical',
        message: hardReason,
        timestamp: nowMs,
        details: `Final Equity: $${liquidation.updatedAccount.equity.toFixed(2)} (Permanent Hard Breach)`,
      };
      const hardAccount: TradingAccount = {
        ...liquidation.updatedAccount,
        status: 'hard_breached',
        breachType: 'hard',
        discountEligible: true,
        softBreachResetTime: undefined,
        breachReason: hardReason,
        breachedAt: nowMs,
        violationLogs: [...(sanitized.violationLogs || []), breachLog],
      };
      return {
        action: 'hard_breach',
        updatedAccount: hardAccount,
        liquidatedTrades: liquidation.liquidatedTrades,
        liveEquity: hardAccount.equity,
        databaseStatus: 'hard_breached',
        reason: hardReason,
      };
    }

    return {
      action: 'soft_breach',
      updatedAccount: {
        ...liquidation.updatedAccount,
        status: 'soft_breached',
        breachType: 'soft',
      },
      liquidatedTrades: liquidation.liquidatedTrades,
      liveEquity: liquidation.updatedAccount.equity,
      databaseStatus: 'soft_breached',
      reason: liquidation.updatedAccount.breachReason,
    };
  }

  // Check if Challenge Profit Target (30%) AND Min Qualifying Days (5 days >= 1%/day) are reached
  const hasOpenActive = params.activeTrades.some((t) => t && t.status === 'active');
  if (!hasOpenActive && !isLiveFundedAccount(accountWithLiveEq)) {
    const targetInfo = getChallengeProfitTarget(accountWithLiveEq);
    if (targetInfo.isTargetMet) {
      return {
        action: 'target_reached',
        updatedAccount: {
          ...accountWithLiveEq,
          status: 'passed',
        },
        liquidatedTrades: [],
        liveEquity,
        databaseStatus: 'passed',
      };
    }
  }

  return {
    action: 'none',
    updatedAccount: accountWithLiveEq,
    liquidatedTrades: [],
    liveEquity,
    databaseStatus: 'active',
  };
}

/**
 * Live Risk Barricade Engine:
 * Kept for backwards compatibility; default thresholdRatio can be configured.
 */
export function isRiskBarricadeActive(
  dailyDrawdownPercent: number,
  dailyLossLimitPercent: number,
  overallLossPercent: number,
  maxOverallLossPercent: number,
  thresholdRatio: number = 0.8
): { barricaded: boolean; reason?: string; dailyRatio: number; overallRatio: number } {
  const dailyRatio = dailyLossLimitPercent > 0 ? dailyDrawdownPercent / dailyLossLimitPercent : 0;
  const overallRatio = maxOverallLossPercent > 0 ? overallLossPercent / maxOverallLossPercent : 0;

  if (dailyRatio >= thresholdRatio) {
    return {
      barricaded: true,
      reason: `Risk Barricade Active: Daily loss is at ${(dailyRatio * 100).toFixed(0)}% of limit (${dailyDrawdownPercent.toFixed(2)}% of ${dailyLossLimitPercent}%). Trading locked to protect account from failure.`,
      dailyRatio,
      overallRatio,
    };
  }

  if (overallRatio >= thresholdRatio) {
    return {
      barricaded: true,
      reason: `Risk Barricade Active: Overall loss is at ${(overallRatio * 100).toFixed(0)}% of limit (${overallLossPercent.toFixed(2)}% of ${maxOverallLossPercent}%). Trading locked to protect account from failure.`,
      dailyRatio,
      overallRatio,
    };
  }

  return {
    barricaded: false,
    dailyRatio,
    overallRatio,
  };
}

/**
 * Calculates the next daily reset timestamp (UTC midnight).
 */
export function getNextDailyResetTimestamp(now: number = Date.now()): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  if (d.getTime() <= now) {
    return now + 86400000;
  }
  return d.getTime();
}

/**
 * Resets a soft-breached account when the daily reset cycle finishes,
 * setting the new day's startingDayEquity to the remaining post-breach balance.
 */
export function resetSoftBreachedAccount(account: TradingAccount): TradingAccount {
  const remainingBalance = Number((account.currentBalance || account.equity || 0).toFixed(2));
  return {
    ...account,
    status: 'active',
    breachType: 'none',
    breachReason: undefined,
    softBreachResetTime: undefined,
    equity: remainingBalance,
    startingDayEquity: remainingBalance,
  };
}

/**
 * Automated Dual-Breach Engine:
 * 1. Hard Breach (Permanent): Violations of overall max loss limit or severe trading restrictions.
 *    Account is permanently locked, reset options are disabled, and 10% re-purchase courtesy discount is offered.
 * 2. Soft Breach (Temporary): Daily drawdown breach only, locked until next trading day auto-reset timer expires.
 */
export function evaluateAccountBreach(
  account: TradingAccount
): {
  isBreached: boolean;
  breachCategory?: 'soft' | 'hard';
  breachType?: 'DAILY_LOSS' | 'OVERALL_LOSS';
  reason?: string;
  violationLog?: RuleViolationLog;
  autoUnlockTimestamp?: number;
} {
  if (!account || isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return { isBreached: false };
  }

  const metrics = calculateDrawdownMetrics(account);

  // 1. Overall Loss -> Permanent HARD BREACH
  if (metrics.isOverallBreached) {
    const reason = `Maximum Overall Loss Exceeded: Total loss reached ${metrics.overallLossPercent}% ($${metrics.overallLossAmount.toFixed(2)}), breaching the maximum allowed limit of ${account.maxOverallLossPercent}%. Permanent Hard Breach enforced.`;
    return {
      isBreached: true,
      breachCategory: 'hard',
      breachType: 'OVERALL_LOSS',
      reason,
      violationLog: {
        id: `VIO-OVERALL-${Date.now()}`,
        rule: 'OVERALL_LOSS',
        ruleName: 'Max Overall Loss (Hard Breach)',
        severity: 'critical',
        message: reason,
        timestamp: Date.now(),
        details: `Overall Drawdown: ${metrics.overallLossPercent}% / Max ${account.maxOverallLossPercent}%`,
      },
    };
  }

  // 2. Daily Loss Limit Only -> Temporary SOFT BREACH
  if (metrics.isDailyBreached) {
    const nextReset = getNextDailyResetTimestamp();
    const reason = `Daily Loss Limit Exceeded: Real-time drawdown reached ${metrics.dailyDrawdownPercent}% ($${metrics.dailyDrawdownAmount.toFixed(2)}), exceeding the daily threshold of ${account.dailyLossLimitPercent}%. Temporary Soft Breach enforced until next trading day.`;
    return {
      isBreached: true,
      breachCategory: 'soft',
      breachType: 'DAILY_LOSS',
      reason,
      autoUnlockTimestamp: nextReset,
      violationLog: {
        id: `VIO-DAILY-${Date.now()}`,
        rule: 'DAILY_LOSS',
        ruleName: 'Daily Loss Limit (Soft Breach)',
        severity: 'warning',
        message: reason,
        timestamp: Date.now(),
        details: `Daily Drawdown: ${metrics.dailyDrawdownPercent}% / Max ${account.dailyLossLimitPercent}% (Auto-resets at next trading day)`,
      },
    };
  }

  return { isBreached: false };
}

/**
 * Double payout guarantee for withdrawals taking longer than 180 seconds.
 */
export function evaluateWithdrawalGuarantee(
  request: WithdrawalRequest,
  currentTimestamp: number
): { isDoubled: boolean; payoutAmount: number } {
  const reqTime = typeof request.requestedAt === 'number' ? request.requestedAt : new Date(request.requestedAt).getTime();
  const elapsed = (currentTimestamp - reqTime) / 1000;
  if (elapsed > GUARANTEED_WITHDRAWAL_SECONDS && request.status !== 'completed') {
    return {
      isDoubled: true,
      payoutAmount: request.amount * 2,
    };
  }
  return {
    isDoubled: false,
    payoutAmount: request.amount,
  };
}

/**
 * Generates institutional login credentials upon purchase.
 */
export function generateAccountCredentials(prefix = 'BFT') {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  const loginId = `${prefix}-${randomNum}`;
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return { loginId, password };
}

/**
 * Auto-graduates a Funded Challenge account when BOTH completion criteria are met
 * (30% profit target + >= 5 qualifying trading days with >= 1% profit each):
 * - Marks the challenge account as PASSED (`status: 'passed'`).
 * - Provisions and unlocks the corresponding Real Funded trading account (`is_real_funded: true`,
 *   `isRealFunded: true`, `phase: 'funded'`) for that exact package balance.
 */
export function advanceChallengeAccountPhase(account: TradingAccount): {
  lockedAccount: TradingAccount;
  lockedPreviousAccount: TradingAccount;
  deployedAccount: TradingAccount;
  deployedNextAccount: TradingAccount;
  certificateId: string;
  isRealFundedDeployed: boolean;
} {
  const nowIso = new Date().toISOString();
  const nowDate = nowIso.split('T')[0];
  const certId = account.certificateId || `BFT-CERT-${account.id}-${Math.floor(1000 + Math.random() * 9000)}`;

  const lockedAccount: TradingAccount = {
    ...account,
    status: 'passed',
    account_tier: 'CHALLENGE',
    badge_color: 'red',
    certificate_unlocked: true,
    certificateId: certId,
    passedAt: nowDate,
    passed_at: nowIso,
  };

  const packageBalance = Math.max(0, Number(account.size || account.initialBalance || 0));
  const creds = generateAccountCredentials('BFT-LIVE');
  const cleanBaseName = String(account.tierName || 'Funded Challenge').replace(/\s*\(Phase \d\)/i, '');

  const deployedAccount: TradingAccount = {
    id: creds.loginId,
    loginId: creds.loginId,
    passwordHash: creds.password,
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    account_tier: 'REAL_FUNDED',
    badge_color: 'purple',
    tierName: `Real Funded ($${packageBalance.toLocaleString('en-US')})`,
    size: packageBalance,
    initialBalance: packageBalance,
    currentBalance: packageBalance,
    startingDayEquity: packageBalance,
    equity: packageBalance,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: CHALLENGE_MAX_OVERALL_LOSS_PERCENT,
    profitTargetPercent: 0,
    maxRiskPerTradePercent: MAX_RISK_PER_TRADE_PERCENT,
    dailyWithdrawalsUnlocked: Boolean(account.dailyWithdrawalsUnlocked),
    withdrawalFrequency: account.dailyWithdrawalsUnlocked ? 'DAILY' : STANDARD_WITHDRAWAL_FREQUENCY,
    isRealFunded: true,
    is_real_funded: true,
    principal_locked: true,
    profit_split_percent: REAL_FUNDED_PROFIT_SPLIT_PERCENT,
    certificate_unlocked: true,
    certificateId: certId,
    passedAt: nowDate,
    passed_at: nowIso,
    monthsCompleted: 1,
    scalingActive: true,
    status: 'active',
    breachType: 'none',
    createdDate: nowDate,
    lastActiveDate: nowDate,
    phase: 'funded',
    challengePhase: 'funded',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    sourceChallengeAccountId: account.id,
    sourceTierName: cleanBaseName,
  };

  return {
    lockedAccount,
    lockedPreviousAccount: lockedAccount,
    deployedAccount,
    deployedNextAccount: deployedAccount,
    certificateId: certId,
    isRealFundedDeployed: true,
  };
}

/**
 * Resolves the user's authoritative available Self Capital balance across profile and Personal Live accounts.
 */
export function resolveAvailableSelfCapitalBalance(
  userProfile?: { selfBalance?: number; isLoggedIn?: boolean } | null,
  accounts?: TradingAccount[] | null
): number {
  const profileBalance =
    userProfile &&
    typeof userProfile.selfBalance === 'number' &&
    Number.isFinite(userProfile.selfBalance) &&
    userProfile.selfBalance >= 0
      ? Number(userProfile.selfBalance.toFixed(2))
      : null;

  let personalAccountBalance: number | null = null;
  if (Array.isArray(accounts)) {
    const personal = accounts.find((acc) => acc && isPersonalLiveAccount(acc));
    if (
      personal &&
      typeof personal.currentBalance === 'number' &&
      Number.isFinite(personal.currentBalance) &&
      personal.currentBalance >= 0
    ) {
      personalAccountBalance = Number(personal.currentBalance.toFixed(2));
    }
  }

  if (profileBalance !== null && profileBalance > 0) {
    return profileBalance;
  }
  if (personalAccountBalance !== null && personalAccountBalance > 0) {
    return personalAccountBalance;
  }
  return profileBalance ?? personalAccountBalance ?? 0;
}

export interface SelfCapitalChallengePurchaseParams {
  pkg: EvaluationPackage;
  selfCapitalBalance: number;
  promoCode?: PromoCodeType;
  unlockDailyWithdrawals?: boolean;
  applyBreachDiscount?: boolean;
  ownerId?: string;
  ownerEmail?: string;
  customAccountId?: string;
  nowIso?: string;
}

export interface SelfCapitalChallengePurchaseSuccess {
  ok: true;
  code: 'CHALLENGE_ACTIVATED';
  deductedAmount: number;
  previousSelfCapital: number;
  remainingSelfCapital: number;
  account: TradingAccount;
  packageName: string;
  packageSize: number;
  message: string;
}

export interface SelfCapitalChallengePurchaseFailure {
  ok: false;
  code: 'INSUFFICIENT_ACCOUNT_BALANCE';
  requiredAmount: number;
  availableBalance: number;
  shortfallAmount: number;
  packageName: string;
  packageSize: number;
  error: string;
  message: string;
}

export type SelfCapitalChallengePurchaseResult =
  | SelfCapitalChallengePurchaseSuccess
  | SelfCapitalChallengePurchaseFailure;

/**
 * Atomically validates and executes a Funded Challenge purchase directly from the user's Self Capital balance:
 * - Checks available Self Capital balance against the selected package price.
 * - If Self Capital balance >= package price:
 *   * Deducts exact package price from Self Capital balance.
 *   * Immediately creates and activates the Funded Challenge account with `Challenge` label and red badge.
 * - If Self Capital balance < package price:
 *   * Does NOT activate the challenge account or deduct funds.
 *   * Returns an "Insufficient Account Balance" error and shortfall guidance.
 */
export function executeSelfCapitalChallengePurchase(
  params: SelfCapitalChallengePurchaseParams
): SelfCapitalChallengePurchaseResult {
  const { pkg } = params;
  const pricing = calculateDiscountedPrice(pkg.price, params.promoCode || 'NONE', {
    dailyWithdrawalsAddon: Boolean(params.unlockDailyWithdrawals),
    resetCourtesyDiscount: Boolean(params.applyBreachDiscount),
  });

  const requiredAmount = Number(Math.max(0, pricing.finalTotal).toFixed(2));
  const safeBalance = Number(
    Math.max(0, Number.isFinite(Number(params.selfCapitalBalance)) ? Number(params.selfCapitalBalance) : 0).toFixed(2)
  );
  const packageSize = Number(pkg.size || 5000);
  const cleanTitle = (pkg.name || 'Funded Challenge').replace(/\s*\(\$[\d,]+\)/i, '').trim();
  const packageName = `${cleanTitle} ($${packageSize.toLocaleString('en-US')})`;

  if (safeBalance + 1e-6 < requiredAmount) {
    const shortfallAmount = Number(Math.max(0, requiredAmount - safeBalance).toFixed(2));
    return {
      ok: false,
      code: 'INSUFFICIENT_ACCOUNT_BALANCE',
      requiredAmount,
      availableBalance: safeBalance,
      shortfallAmount,
      packageName,
      packageSize,
      error: 'Insufficient Account Balance',
      message: `Insufficient Account Balance: You need $${requiredAmount.toFixed(2)} in your Self Capital balance to activate the $${packageSize.toLocaleString('en-US')} Funded Challenge, but your available Self Capital balance is $${safeBalance.toFixed(2)}. Please deposit at least $${shortfallAmount.toFixed(2)} into your Self Capital account first.`,
    };
  }

  const remainingSelfCapital = Number(Math.max(0, safeBalance - requiredAmount).toFixed(2));
  const creds = generateAccountCredentials('BFT');
  const accountId = params.customAccountId ? String(params.customAccountId).trim() : creds.loginId;
  const nowDate = (params.nowIso || new Date().toISOString()).split('T')[0];

  const rawChallengeAccount: TradingAccount = {
    id: accountId,
    loginId: accountId,
    passwordHash: creds.password,
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    account_tier: 'CHALLENGE',
    badge_color: 'red',
    tierName: cleanTitle,
    size: packageSize as TradingAccount['size'],
    initialBalance: packageSize,
    currentBalance: packageSize,
    startingDayEquity: packageSize,
    equity: packageSize,
    dailyLossLimitPercent: 0,
    maxOverallLossPercent: CHALLENGE_MAX_OVERALL_LOSS_PERCENT,
    profitTargetPercent: CHALLENGE_PROFIT_TARGET_PERCENT,
    maxRiskPerTradePercent: MAX_RISK_PER_TRADE_PERCENT,
    minTradingDaysRequired: MIN_PROFITABLE_DAYS,
    dailyWithdrawalsUnlocked: Boolean(params.unlockDailyWithdrawals),
    withdrawalFrequency: params.unlockDailyWithdrawals ? 'DAILY' : STANDARD_WITHDRAWAL_FREQUENCY,
    isRealFunded: false,
    is_real_funded: false,
    principal_locked: false,
    certificate_unlocked: false,
    monthsCompleted: 0,
    scalingActive: false,
    status: 'active',
    breachType: 'none',
    createdDate: nowDate,
    lastActiveDate: nowDate,
    phase: 'phase_1',
    challengePhase: 'phase_1',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    ownerId: params.ownerId,
    ownerEmail: params.ownerEmail,
  };

  const activatedAccount: TradingAccount = {
    ...sanitizeAccountForAntiBreach(rawChallengeAccount),
    account_tier: 'CHALLENGE',
    badge_color: 'red',
  };

  return {
    ok: true,
    code: 'CHALLENGE_ACTIVATED',
    deductedAmount: requiredAmount,
    previousSelfCapital: safeBalance,
    remainingSelfCapital,
    account: activatedAccount,
    packageName,
    packageSize,
    message: `$${requiredAmount.toFixed(2)} deducted from your Self Capital balance. Your $${packageSize.toLocaleString('en-US')} Challenge account is now active!`,
  };
}


