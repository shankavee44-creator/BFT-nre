import { EvaluationPackage, TradingAccount, BinaryTrade, WithdrawalRequest, RuleViolationLog, BinaryOptionDirection, PromoCodeType } from '../types';

export const PROMO_CODES: Record<PromoCodeType, { code: PromoCodeType; discountPercent: number; label: string; audience: string }> = {
  SPOOKY40: {
    code: 'SPOOKY40',
    discountPercent: 40,
    label: 'Flat 40% OFF',
    audience: 'New Users / First-Time Orders',
  },
  SPOOKY20: {
    code: 'SPOOKY20',
    discountPercent: 20,
    label: 'Flat 20% OFF',
    audience: 'Existing Users / Repeat Orders',
  },
  BFT40: {
    code: 'BFT40',
    discountPercent: 40,
    label: 'Flat 40% OFF',
    audience: 'New Users / First-Time Orders',
  },
  BFT20: {
    code: 'BFT20',
    discountPercent: 20,
    label: 'Flat 20% OFF',
    audience: 'Existing Users / Repeat Orders',
  },
};

export const WITHDRAWAL_FEE_PERCENT = 10; // 10% Withdrawal Fee deducted from requested payout
export const DAILY_WITHDRAWAL_ADDON_PERCENT = 15; // +15% fee to unlock Daily Withdrawals
export const MAX_RISK_PER_TRADE_PERCENT = 5; // 5% of initial capital max single trade size
export const MIN_PROFITABLE_DAYS = 5; // 5 profitable trading days (>= 0.5% profit/day)
export const MIN_PROFITABLE_DAY_PERCENT = 0.5;

export const PACKAGES: EvaluationPackage[] = [
  // Tier 1: One-Step Challenge (30% Target, 10% Daily DD, 15% Max DD, 5% Max Risk/Trade, 5 Profitable Days)
  {
    id: 'one-step-2500',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 2500,
    price: 49,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'one-step-5000',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 5000,
    price: 82,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'one-step-10000',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 10000,
    price: 149,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    popular: true,
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'one-step-25000',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 25000,
    price: 315,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'one-step-50000',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 50000,
    price: 549,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'one-step-100000',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 100000,
    price: 915,
    profitTarget: 30,
    profitDaysRequirement: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 10,
    maxOverallLoss: 15,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },

  // Tier 2: Two-Step Challenge (Phase 1: 25%, Phase 2: 15%, Daily DD: 8%, Overall DD: 20%, 5% Risk/Trade, 5 Days)
  {
    id: 'two-step-2500',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 2500,
    price: 32,
    profitTarget: 25, // Phase 1 Target
    step2Target: 15,  // Phase 2 Target
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'two-step-5000',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 5000,
    price: 59,
    profitTarget: 25,
    step2Target: 15,
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'two-step-10000',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 10000,
    price: 115,
    profitTarget: 25,
    step2Target: 15,
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    popular: true,
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'two-step-25000',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 25000,
    price: 249,
    profitTarget: 25,
    step2Target: 15,
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'two-step-50000',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 50000,
    price: 465,
    profitTarget: 25,
    step2Target: 15,
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'two-step-100000',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 100000,
    price: 782,
    profitTarget: 25,
    step2Target: 15,
    profitDaysRequirement: 5,
    step2Days: 5,
    minProfitableDayPercent: 0.5,
    minTradingDaysText: '5 days (≥ 0.5% profit/day)',
    maxDailyDrawdown: 8,
    maxOverallLoss: 20,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:100',
    unlimitedTime: true,
    refundOnFirstPayout: true,
    resetCourtesyDiscount: 10,
  },

  // Tier 3: Instant Funded Account (Direct Live Account, Daily DD: 6%, Overall DD: 12%)
  {
    id: 'instant-2500',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 2500,
    price: 132,
    profitTarget: 0, // Direct Live Account
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'instant-5000',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 5000,
    price: 232,
    profitTarget: 0,
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'instant-10000',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    price: 415,
    profitTarget: 0,
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    popular: true,
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'instant-25000',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 25000,
    price: 832,
    profitTarget: 0,
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'instant-50000',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 50000,
    price: 1499,
    profitTarget: 0,
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
  {
    id: 'instant-100000',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 100000,
    price: 2665,
    profitTarget: 0,
    minTradingDaysText: 'None (Direct Real Account)',
    maxDailyDrawdown: 6,
    maxOverallLoss: 12,
    maxRiskPerTradePercent: 5,
    payoutSplit: 80,
    upgradedPayoutSplit: 90,
    leverage: '1:50',
    unlimitedTime: true,
    refundOnFirstPayout: false,
    resetCourtesyDiscount: 10,
  },
];

export const MIN_WITHDRAWAL_PROFIT = 250; // Strict $250 Minimum Withdrawal Limit
export const MIN_WITHDRAWAL_AMOUNT = 250;
export const FIRST_WITHDRAWAL_WAITING_DAYS = 14; // Mandatory 14-day waiting period for the very first withdrawal across all account types
export const WITHDRAWAL_GUARANTEE_NOTICE =
  'We process payouts within 3 minutes; if we fail, we pay double!';
export const MIN_TRADE_DURATION_SECONDS = 30;
export const INACTIVITY_DAYS_LIMIT = 14;
export const POSITION_SPIKE_FACTOR = 5;
export const GUARANTEED_WITHDRAWAL_SECONDS = 180; // 3 minutes

/**
 * Evaluates the mandatory 14-day waiting period for the very first withdrawal across all account types.
 * After the first withdrawal is completed, users who purchased the daily withdrawal add-on (+15%)
 * or weekly plan (7-day cycle) proceed according to their package rules.
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
      daysElapsed: Math.max(FIRST_WITHDRAWAL_WAITING_DAYS, account.tradingDaysCompleted || 14),
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
      reason: `First Withdrawal 14-Day Lock: A mandatory 14-day waiting period applies to the very first withdrawal across all account types (${daysElapsed}/${FIRST_WITHDRAWAL_WAITING_DAYS} days completed, ${daysRemaining} day(s) remaining). After your first withdrawal, your ${subsequentCycleLabel} schedule applies.`,
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
 * Determines whether an account is a Live Funded Account (Instant Funded or Passed Evaluation)
 * versus an active Challenge Evaluation phase.
 */
export function isLiveFundedAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  return account.tier === 'instant' || account.phase === 'funded' || account.status === 'passed';
}

export function getAccountStatusBadgeLabel(account?: TradingAccount | null): 'LIVE ACCOUNT' | 'CHALLENGE' {
  return isLiveFundedAccount(account) ? 'LIVE ACCOUNT' : 'CHALLENGE';
}

/**
 * Calculates final discounted package price after applying SPOOKY40 (40% OFF) or SPOOKY20 (20% OFF),
 * plus optional +15% Daily Withdrawals Add-on and 10% Reset Courtesy discount.
 */
export function calculateDiscountedPrice(
  basePrice: number,
  promoCode: PromoCodeType = 'SPOOKY40',
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

  const promoInfo = PROMO_CODES[promoCode] || PROMO_CODES.SPOOKY40;
  const promoDiscountPercent = promoInfo.discountPercent;
  const discountedBasePrice = Math.round(basePrice * (1 - promoDiscountPercent / 100));
  const promoDiscountAmount = basePrice - discountedBasePrice;

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
    promoCode,
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
  monthsCompleted: number = 1
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
  const scalingPlanActive = monthsCompleted >= 3;
  const profitSplitPercent = scalingPlanActive ? 90 : 80;
  const traderShareBeforeFee = Number(((requestedPayoutAmount * profitSplitPercent) / 100).toFixed(2));
  const withdrawalFeePercent = WITHDRAWAL_FEE_PERCENT;
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
 * Validates the 5% Max Risk Per Trade rule.
 * Exceeding 5% of initial capital on a single binary trade triggers a Hard Breach.
 */
export function checkMaxRiskPerTradeViolation(
  investment: number,
  initialBalance: number,
  maxRiskPercent: number = MAX_RISK_PER_TRADE_PERCENT
): {
  violated: boolean;
  maxAllowedStake: number;
  stakePercent: number;
  riskPercent: number;
  reason?: string;
} {
  const maxAllowedStake = Number(((initialBalance * maxRiskPercent) / 100).toFixed(2));
  const stakePercent = initialBalance > 0 ? Number(((investment / initialBalance) * 100).toFixed(2)) : 0;

  if (investment > maxAllowedStake) {
    return {
      violated: true,
      maxAllowedStake,
      stakePercent,
      riskPercent: stakePercent,
      reason: `Hard Breach — Max Risk Per Trade Violated: Stake of $${investment.toFixed(2)} (${stakePercent}%) exceeds the maximum allowed ${maxRiskPercent}% per-trade limit ($${maxAllowedStake.toFixed(2)}).`,
    };
  }

  return {
    violated: false,
    maxAllowedStake,
    stakePercent,
    riskPercent: stakePercent,
  };
}

export interface RuleValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

/**
 * Validates if an account can request a withdrawal.
 * Rules:
 * - Minimum withdrawal threshold: strictly $250 in account profits.
 * - Mandatory 14-day waiting period for the very first withdrawal across all account types.
 */
export function validateWithdrawalRequest(
  account: TradingAccount,
  requestedAmount: number,
  options?: { enforceFirstWithdrawalLock?: boolean; nowMs?: number }
): RuleValidationResult {
  if (options?.enforceFirstWithdrawalLock) {
    const firstLock = checkFirstWithdrawalWaitingPeriod(account, options.nowMs);
    if (!firstLock.eligible) {
      return {
        valid: false,
        reason: firstLock.reason,
        code: 'FIRST_WITHDRAWAL_14_DAY_LOCK',
      };
    }
  }

  const currentProfit = account.currentBalance - account.initialBalance;

  if (currentProfit <= 0) {
    return {
      valid: false,
      reason: `Account has no net profit. Current balance is $${account.currentBalance.toFixed(2)} vs initial $${account.initialBalance.toFixed(2)}.`,
      code: 'NO_PROFIT',
    };
  }

  if (currentProfit < MIN_WITHDRAWAL_PROFIT) {
    return {
      valid: false,
      reason: `Minimum profit requirement is $${MIN_WITHDRAWAL_PROFIT}. Current profit is $${currentProfit.toFixed(2)}.`,
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

  if (requestedAmount > currentProfit) {
    return {
      valid: false,
      reason: `Cannot withdraw more than accumulated profit ($${currentProfit.toFixed(2)}). Initial capital cannot be withdrawn directly.`,
      code: 'EXCEEDS_PROFIT',
    };
  }

  return { valid: true };
}

/**
 * Validates trade duration to prevent tick scalping.
 * Rule: Minimum trade duration: >= 30 seconds.
 */
export function isValidTradeDuration(durationSeconds: number): boolean {
  return durationSeconds >= MIN_TRADE_DURATION_SECONDS;
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
 * Calculates current daily drawdown and overall drawdown percentages.
 */
export function calculateDrawdownMetrics(account: TradingAccount) {
  const dailyDrawdownAmount = Math.max(0, account.startingDayEquity - account.equity);
  const dailyDrawdownPercent = account.startingDayEquity > 0
    ? Number(((dailyDrawdownAmount / account.startingDayEquity) * 100).toFixed(2))
    : 0;

  const overallLossAmount = Math.max(0, account.initialBalance - account.equity);
  const overallLossPercent = account.initialBalance > 0
    ? Number(((overallLossAmount / account.initialBalance) * 100).toFixed(2))
    : 0;

  const isDailyBreached = dailyDrawdownPercent >= account.dailyLossLimitPercent;
  const isOverallBreached = overallLossPercent >= account.maxOverallLossPercent;

  return {
    dailyDrawdownAmount,
    dailyDrawdownPercent,
    overallLossAmount,
    overallLossPercent,
    isDailyBreached,
    isOverallBreached,
    isBreached: isDailyBreached || isOverallBreached,
  };
}

/**
 * Live Risk Barricade Engine:
 * Prevents any new trades once 80% of the Daily Loss Limit or Max Overall Loss is consumed.
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
 * Resets a soft-breached account when the daily reset cycle finishes.
 */
export function resetSoftBreachedAccount(account: TradingAccount): TradingAccount {
  return {
    ...account,
    status: 'active',
    breachType: 'none',
    breachReason: undefined,
    softBreachResetTime: undefined,
    startingDayEquity: account.equity || account.currentBalance,
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
  const elapsed = (currentTimestamp - request.requestedAt) / 1000;
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
 * Progresses an evaluation challenge account when objectives are met:
 * - One-Step Challenge (Phase 1): Generates Achievement Certificate, locks challenge account ('passed'),
 *   and deploys a clean Real Funded Account with the accumulated balance.
 * - Two-Step Challenge (Phase 1): Locks Phase 1 ('passed') and deploys Phase 2 account (15% target).
 * - Two-Step Challenge (Phase 2): Generates Achievement Certificate, locks Phase 2 ('passed'),
 *   and deploys a clean Real Funded Account with the accumulated balance.
 */
export function advanceChallengeAccountPhase(account: TradingAccount): {
  lockedAccount: TradingAccount;
  lockedPreviousAccount: TradingAccount;
  deployedAccount: TradingAccount;
  deployedNextAccount: TradingAccount;
  certificateId: string;
  isRealFundedDeployed: boolean;
} {
  const nowDate = new Date().toISOString().split('T')[0];
  const certId = `CERT-${account.id}-${Math.floor(1000 + Math.random() * 9000)}`;

  const lockedAccount: TradingAccount = {
    ...account,
    status: 'passed',
    certificateId: certId,
    passedAt: nowDate,
  };

  const isToPhase2 = account.tier === 'two-step' && account.phase === 'phase_1';
  const creds = generateAccountCredentials(isToPhase2 ? 'BFT-P2' : 'BFT-LIVE');
  const nextBalance = Math.max(account.initialBalance, account.currentBalance);

  const deployedAccount: TradingAccount = {
    id: creds.loginId,
    loginId: creds.loginId,
    passwordHash: creds.password,
    tier: account.tier,
    tierName: isToPhase2
      ? `${account.tierName} (Phase 2)`
      : `Real Funded (${account.tierName})`,
    size: account.size,
    initialBalance: account.size,
    currentBalance: isToPhase2 ? account.size : nextBalance,
    startingDayEquity: isToPhase2 ? account.size : nextBalance,
    equity: isToPhase2 ? account.size : nextBalance,
    dailyLossLimitPercent: account.dailyLossLimitPercent,
    maxOverallLossPercent: account.maxOverallLossPercent,
    maxRiskPerTradePercent: account.maxRiskPerTradePercent || 5,
    dailyWithdrawalsUnlocked: account.dailyWithdrawalsUnlocked,
    monthsCompleted: 1,
    scalingActive: false,
    status: 'active',
    createdDate: nowDate,
    lastActiveDate: nowDate,
    phase: isToPhase2 ? 'phase_2' : 'funded',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    certificateId: !isToPhase2 ? certId : undefined,
  };

  return {
    lockedAccount,
    lockedPreviousAccount: lockedAccount,
    deployedAccount,
    deployedNextAccount: deployedAccount,
    certificateId: certId,
    isRealFundedDeployed: !isToPhase2,
  };
}

