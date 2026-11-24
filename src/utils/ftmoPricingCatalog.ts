import { ChallengeTier, EvaluationPackage, PromoCodeType } from '../types';
import { PACKAGES, calculateDiscountedPrice } from './propRules';

export type PricingCurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'CHF' | 'USDT';

export interface CurrencyConfig {
  code: PricingCurrencyCode;
  label: string;
  accountSymbol: string;
  feeSymbol: string;
  accountMultiplier: number;
  feeMultiplier: number;
  isPrimaryPill: boolean;
}

export const PRICING_CURRENCIES: CurrencyConfig[] = [
  {
    code: 'USD',
    label: 'USD',
    accountSymbol: '$',
    feeSymbol: '$',
    accountMultiplier: 1,
    feeMultiplier: 1,
    isPrimaryPill: true,
  },
  {
    code: 'EUR',
    label: 'EUR',
    accountSymbol: '€',
    feeSymbol: '€',
    accountMultiplier: 1,
    feeMultiplier: 0.92,
    isPrimaryPill: true,
  },
  {
    code: 'GBP',
    label: 'GBP',
    accountSymbol: '£',
    feeSymbol: '£',
    accountMultiplier: 1,
    feeMultiplier: 0.79,
    isPrimaryPill: true,
  },
  {
    code: 'USDT',
    label: 'USDT ($)',
    accountSymbol: '$',
    feeSymbol: '$',
    accountMultiplier: 1,
    feeMultiplier: 1,
    isPrimaryPill: false,
  },
  {
    code: 'CAD',
    label: 'CAD ($)',
    accountSymbol: 'CA$',
    feeSymbol: 'CA$',
    accountMultiplier: 1,
    feeMultiplier: 1.38,
    isPrimaryPill: false,
  },
  {
    code: 'AUD',
    label: 'AUD ($)',
    accountSymbol: 'A$',
    feeSymbol: 'A$',
    accountMultiplier: 1,
    feeMultiplier: 1.52,
    isPrimaryPill: false,
  },
  {
    code: 'CHF',
    label: 'CHF (Fr)',
    accountSymbol: 'CHF ',
    feeSymbol: 'CHF ',
    accountMultiplier: 1,
    feeMultiplier: 0.88,
    isPrimaryPill: false,
  },
];

export interface BftPricingCardSpec {
  pkg: EvaluationPackage;
  size: number;
  tier: ChallengeTier;
  tierName: string;
  isBestValue: boolean;
  phase1TargetPercent: number;
  phase2TargetPercent: number | null;
  maxDailyLossPercent: number;
  maxLossPercent: number;
  maxRiskPerTradePercent: number;
  maxCombinedRiskPercent: number;
  maxOpenTradesPerPair: number;
  minTradingDaysLabel: string;
  tradingPeriodLabel: string;
  withdrawalCycleLabel: string;
  refundLabel: string;
  refundBadge: string | null;
  rewardsLabel: string;
  originalPriceUsd: number;
  finalPriceUsd: number;
  discountSavedUsd: number;
  dailyAddonFeeUsd: number;
  avgRewardUsd: number;
}

/**
 * Unified BFT Funded Challenge account sizes ($200,000 down to $5,000).
 */
export const BFT_ORIGINAL_ACCOUNT_SIZES = [200000, 100000, 50000, 25000, 10000, 5000] as const;

export function getCurrencyConfig(code: PricingCurrencyCode): CurrencyConfig {
  return PRICING_CURRENCIES.find((c) => c.code === code) || PRICING_CURRENCIES[0];
}

/**
 * Builds the unified Funded Challenge card specifications directly from PACKAGES & calculateDiscountedPrice.
 */
export function getUnifiedChallengeCards(
  activePromoCode: PromoCodeType = 'NONE',
  dailyWithdrawalsAddOn: boolean = false
): BftPricingCardSpec[] {
  // Order descending ($200,000 -> $100,000 -> $50,000 -> $25,000 -> $10,000 -> $5,000)
  const orderedPackages = [...PACKAGES].sort((a, b) => b.size - a.size);

  return orderedPackages.map((pkg) => {
    const pricing = calculateDiscountedPrice(pkg.price, activePromoCode, dailyWithdrawalsAddOn);

    const phase1TargetPercent = pkg.profitTarget ?? 30;
    const phase2TargetPercent = null;
    const maxDailyLossPercent = pkg.maxDailyDrawdown ?? 0;
    const maxLossPercent = pkg.maxOverallLoss ?? 10;
    const maxRiskPerTradePercent = pkg.maxRiskPerTradePercent ?? 5;
    const maxCombinedRiskPercent = 5;
    const maxOpenTradesPerPair = 1;

    const minTradingDaysLabel = pkg.minTradingDaysText || '5 days (≥1%/day)';
    const tradingPeriodLabel = pkg.unlimitedTime !== false ? 'Unlimited' : '30 Days';
    const withdrawalCycleLabel = dailyWithdrawalsAddOn
      ? 'Daily (+15% Active)'
      : 'Weekly (7-Day 1st Wait)';

    const refundLabel = pkg.refundOnFirstPayout ? 'Yes' : 'No';
    const refundBadge = pkg.refundOnFirstPayout ? '100%' : null;

    const splitStart = pkg.payoutSplit ?? 80;
    const splitUpgraded = pkg.upgradedPayoutSplit ?? 90;
    const rewardsLabel = `${splitStart}% → ${splitUpgraded}%`;

    const avgRewardUsd = Math.round(pkg.size * 0.145);

    return {
      pkg,
      size: pkg.size,
      tier: pkg.tier,
      tierName: pkg.tierName,
      isBestValue: Boolean(pkg.popular),
      phase1TargetPercent,
      phase2TargetPercent,
      maxDailyLossPercent,
      maxLossPercent,
      maxRiskPerTradePercent,
      maxCombinedRiskPercent,
      maxOpenTradesPerPair,
      minTradingDaysLabel,
      tradingPeriodLabel,
      withdrawalCycleLabel,
      refundLabel,
      refundBadge,
      rewardsLabel,
      originalPriceUsd: pricing.originalPrice,
      finalPriceUsd: pricing.totalFinalPrice,
      discountSavedUsd: pricing.discountSaved,
      dailyAddonFeeUsd: pricing.dailyWithdrawalAddOnFee,
      avgRewardUsd,
    };
  });
}

export function getBftCardsForTier(
  _tier?: ChallengeTier,
  activePromoCode: PromoCodeType = 'NONE',
  dailyWithdrawalsAddOn: boolean = false
): BftPricingCardSpec[] {
  return getUnifiedChallengeCards(activePromoCode, dailyWithdrawalsAddOn);
}

export function formatFtmoCurrencyAmount(amount: number, symbol: string): string {
  const hasDecimals = Math.abs(amount - Math.round(amount)) > 0.001;
  if (hasDecimals) {
    return `${symbol}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatMetricValue(params: {
  size: number;
  percent: number;
  showNumbers: boolean;
  accountSymbol: string;
  accountMultiplier: number;
}): string {
  const { size, percent, showNumbers, accountSymbol, accountMultiplier } = params;
  if (!showNumbers) {
    return `${percent}%`;
  }
  const value = Math.round(((size * accountMultiplier) * percent) / 100);
  return `${accountSymbol}${value.toLocaleString('en-US')} (${percent}%)`;
}
