import type { EvaluationPackage, TradingAccount, BinaryTrade, WithdrawalRequest, RuleViolationLog, BinaryOptionDirection, PromoCodeType, ChallengeTier } from '../types/index.ts';

export const PROMO_CODES: Record<string, { code: string; discountPercent: number; label: string; audience: string }> = {
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

export function getPackageSku(pkg: { tier: string; size: number }): string {
  const sizeK = pkg.size >= 1000 ? `${pkg.size / 1000}K` : `${pkg.size}`;
  const prefix = pkg.tier === 'one-step' ? '1S' : pkg.tier === 'two-step' ? '2S' : 'INF';
  return `${prefix}-${sizeK}`;
}

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
 * Determines whether an account is a Personal Live / Self-Funded Real Deposit account.
 */
export function isPersonalLiveAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  return (
    account.tier === 'personal' ||
    account.accountCategory === 'personal_live' ||
    account.phase === 'personal_live'
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
 * Determines whether an account is a Live Funded Account (Instant Funded, Passed Evaluation, or Personal Live)
 * versus an active Challenge Evaluation phase.
 */
export function isLiveFundedAccount(account?: TradingAccount | null): boolean {
  if (!account) return false;
  if (isDemoAccount(account)) return false;
  return (
    isPersonalLiveAccount(account) ||
    account.tier === 'instant' ||
    account.phase === 'funded' ||
    account.status === 'passed'
  );
}

export function getAccountStatusBadgeLabel(
  account?: TradingAccount | null
): 'PERSONAL LIVE' | 'DEMO' | 'LIVE ACCOUNT' | 'CHALLENGE' {
  if (isPersonalLiveAccount(account)) return 'PERSONAL LIVE';
  if (isDemoAccount(account)) return 'DEMO';
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

  const promoInfo = (promoCode && PROMO_CODES[promoCode]) || PROMO_CODES.SPOOKY40;
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
  monthsCompleted: number = 1,
  isPersonalLive: boolean = false
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
  const scalingPlanActive = isPersonalLive ? true : monthsCompleted >= 3;
  const profitSplitPercent = isPersonalLive ? 100 : scalingPlanActive ? 90 : 80;
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

export function normalizeChallengeAccountType(
  input?: string | null
): 'instant' | 'one_step' | 'two_step' | 'personal' | 'demo' {
  if (!input) return 'two_step';
  const clean = String(input).toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  if (clean.includes('instant')) return 'instant';
  if (clean.includes('one') || clean.includes('1step') || clean === 'one_step') return 'one_step';
  if (clean.includes('personal') || clean.includes('self')) return 'personal';
  if (clean.includes('demo')) return 'demo';
  return 'two_step';
}

export function normalizeChallengeTier(input?: string | null): ChallengeTier {
  const normType = normalizeChallengeAccountType(input);
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
  accountType: 'instant' | 'one_step' | 'two_step' | 'personal' | 'demo';
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

  let defaultDaily = 8;
  let defaultMax = 20;
  let defaultTarget = 25;
  let step2Target = 15;
  let maxRiskPerTradePercent = 5;
  let minProfitableDays = 5;
  let minProfitableDayPercent = 0.5;
  let initialPhase: 'phase_1' | 'phase_2' | 'funded' | 'personal_live' | 'demo' = 'phase_1';

  if (accountType === 'one_step') {
    defaultDaily = 10;
    defaultMax = 15;
    defaultTarget = currentPhase === 'funded' ? 0 : 30;
    step2Target = 0;
    maxRiskPerTradePercent = 5;
    minProfitableDays = currentPhase === 'funded' ? 0 : 5;
    minProfitableDayPercent = currentPhase === 'funded' ? 0 : 0.5;
    initialPhase = 'phase_1';
  } else if (accountType === 'two_step') {
    defaultDaily = 8;
    defaultMax = 20;
    defaultTarget = currentPhase === 'funded' ? 0 : currentPhase === 'phase_2' ? 15 : 25;
    step2Target = 15;
    maxRiskPerTradePercent = 5;
    minProfitableDays = currentPhase === 'funded' ? 0 : 5;
    minProfitableDayPercent = currentPhase === 'funded' ? 0 : 0.5;
    initialPhase = 'phase_1';
  } else if (accountType === 'instant') {
    defaultDaily = 6;
    defaultMax = 12;
    defaultTarget = 0;
    step2Target = 0;
    maxRiskPerTradePercent = 5;
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
    : overrides?.dailyDrawdown !== undefined && overrides.dailyDrawdown > 0
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

  return {
    ...account,
    tier: dynamicLimits.tier,
    accountType: dynamicLimits.accountType,
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

export function getChallengeProfitTarget(account?: TradingAccount | null): {
  isChallenge: boolean;
  targetPercent: number;
  targetAmount: number;
  currentProfit: number;
  progressPercent: number;
  isTargetMet: boolean;
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
      isTargetMet: false,
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

  return {
    isChallenge: targetPercent > 0,
    targetPercent,
    targetAmount,
    currentProfit,
    progressPercent,
    isTargetMet: currentProfit >= targetAmount && targetAmount > 0,
    minProfitableDays: limits.minProfitableDays,
    minProfitableDayPercent: limits.minProfitableDayPercent,
  };
}

/**
 * Validates if an account can request a withdrawal.
 * Rules:
 * - Challenge accounts (One-Step / Two-Step in phase_1 or phase_2) CANNOT withdraw funds during the challenge phase.
 * - Minimum withdrawal threshold: strictly $250 in account profits.
 * - Mandatory 14-day waiting period for the very first withdrawal across all account types.
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
  // without being bound by prop challenge target phases, profit-only restrictions, or 14-day waiting periods.
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

  if (!isLiveFundedAccount(account)) {
    return {
      valid: false,
      reason:
        'Withdrawals are locked during the Challenge Phase. Trade to hit your profit target first to pass the challenge, earn your Completion Certificate, and unlock your Live Funded Account.',
      code: 'CHALLENGE_PHASE_LOCKED',
    };
  }

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

  if (stake > effectiveAvailableBalance + 1e-6) {
    return {
      allowed: false,
      code: 'INSUFFICIENT_BALANCE',
      reason: `Insufficient balance. Available capital: $${effectiveAvailableBalance.toFixed(2)}`,
      remainingDailyBuffer: effectiveAvailableBalance,
      remainingOverallBuffer: effectiveAvailableBalance,
      maxAllowedStake: effectiveAvailableBalance,
    };
  }

  if (isPersonalLiveAccount(account) || isDemoAccount(account)) {
    return {
      allowed: true,
      remainingDailyBuffer: Infinity,
      remainingOverallBuffer: Infinity,
      maxAllowedStake: effectiveAvailableBalance,
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

  const baseInit = Math.max(Number(account.initialBalance || 0), Number(account.size || 0));
  const riskPct = Number(account.maxRiskPerTradePercent || MAX_RISK_PER_TRADE_PERCENT);
  const maxRiskCheck = checkMaxRiskPerTradeViolation(stake, baseInit, riskPct);

  const maxAllowedByDrawdown = Math.min(
    metrics.remainingDailyBuffer,
    metrics.remainingOverallBuffer
  );
  const maxAllowedStake = Number(
    Math.min(currentBalance, maxRiskCheck.maxAllowedStake, maxAllowedByDrawdown).toFixed(2)
  );

  if (maxRiskCheck.violated) {
    return {
      allowed: false,
      code: 'MAX_RISK_PER_TRADE_EXCEEDED',
      reason: `Max Risk Per Trade Violated: Stake of $${stake.toFixed(2)} (${maxRiskCheck.riskPercent}%) exceeds the strict ${riskPct}% per-trade limit ($${maxRiskCheck.maxAllowedStake.toFixed(2)}).`,
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

  // Check if Challenge Profit Target is reached (when no open trades are pending settlement)
  const hasOpenActive = params.activeTrades.some((t) => t && t.status === 'active');
  if (!hasOpenActive && !isLiveFundedAccount(accountWithLiveEq)) {
    const targetInfo = getChallengeProfitTarget(accountWithLiveEq);
    if (targetInfo.isTargetMet) {
      const normType = normalizeChallengeAccountType(
        accountWithLiveEq.accountType || accountWithLiveEq.tier
      );
      const isToPhase2 =
        normType === 'two_step' &&
        (accountWithLiveEq.phase === 'phase_1' || accountWithLiveEq.challengePhase === 'phase_1');
      const passedStatus: 'passed_phase_1' | 'passed' = isToPhase2 ? 'passed_phase_1' : 'passed';
      return {
        action: 'target_reached',
        updatedAccount: {
          ...accountWithLiveEq,
          status: passedStatus,
        },
        liquidatedTrades: [],
        liveEquity,
        databaseStatus: passedStatus,
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

  const normType = normalizeChallengeAccountType(account.accountType || account.tier);
  const isToPhase2 = normType === 'two_step' && (account.phase === 'phase_1' || account.challengePhase === 'phase_1');
  const nextPhase: 'phase_2' | 'funded' = isToPhase2 ? 'phase_2' : 'funded';

  const lockedAccount: TradingAccount = {
    ...account,
    status: isToPhase2 ? 'passed_phase_1' : 'passed',
    certificateId: certId,
    passedAt: nowDate,
  };

  const nextLimits = getDynamicAccountLimits(normType, nextPhase, {
    dailyDrawdown: account.dailyLossLimitPercent,
    maxDrawdown: account.maxOverallLossPercent,
  });

  const creds = generateAccountCredentials(isToPhase2 ? 'BFT-P2' : 'BFT-LIVE');
  const nextBalance = Math.max(account.initialBalance, account.currentBalance);
  const cleanBaseName = String(account.tierName || '').replace(/\s*\(Phase \d\)/i, '');

  const deployedAccount: TradingAccount = {
    id: creds.loginId,
    loginId: creds.loginId,
    passwordHash: creds.password,
    tier: nextLimits.tier,
    accountType: nextLimits.accountType,
    tierName: isToPhase2
      ? `${cleanBaseName} (Phase 2)`
      : `Real Funded (${cleanBaseName})`,
    size: account.size,
    initialBalance: account.size,
    currentBalance: isToPhase2 ? account.size : nextBalance,
    startingDayEquity: isToPhase2 ? account.size : nextBalance,
    equity: isToPhase2 ? account.size : nextBalance,
    dailyLossLimitPercent: nextLimits.dailyLossLimitPercent,
    maxOverallLossPercent: nextLimits.maxOverallLossPercent,
    profitTargetPercent: nextLimits.profitTargetPercent,
    maxRiskPerTradePercent: account.maxRiskPerTradePercent || 5,
    dailyWithdrawalsUnlocked: account.dailyWithdrawalsUnlocked,
    monthsCompleted: 1,
    scalingActive: false,
    status: 'active',
    createdDate: nowDate,
    lastActiveDate: nowDate,
    phase: nextPhase,
    challengePhase: nextPhase,
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

