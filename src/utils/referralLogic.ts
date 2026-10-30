export interface CommissionDistributionResult {
  level: 1 | 2 | 3;
  sponsorId: string;
  rate: number;
  ratePercent: number;
  baseAmount: number;
  commissionAmount: number;
  sourceType: 'deposit' | 'purchase' | 'trade_activity' | 'withdrawal';
  description: string;
}

export interface UplineChain {
  level1SponsorId: string | null;
  level2SponsorId: string | null;
  level3SponsorId: string | null;
}

export const REFERRAL_COMMISSION_RATES = {
  deposit: {
    level1: 0.10, // 10%
    level2: 0.05, // 5%
    level3: 0.02, // 2%
  },
  purchase: {
    level1: 0.10, // 10%
    level2: 0.05, // 5%
    level3: 0.02, // 2%
  },
  trade_activity: {
    level1: 0.10, // 10%
    level2: 0.05, // 5%
    level3: 0.02, // 2%
  },
  withdrawal: {
    level1: 0.08, // 8% Direct Bonus
    level2: 0.00,
    level3: 0.00,
  },
} as const;

/**
 * Calculates 3-level multi-tier referral commissions for a transaction amount.
 * Level 1: 10%
 * Level 2: 5%
 * Level 3: 2%
 * (or 8% direct bonus on withdrawals)
 */
export function calculate3TierCommissions(params: {
  upline: UplineChain;
  amount: number;
  sourceType: 'deposit' | 'purchase' | 'trade_activity' | 'withdrawal';
  sourceUserName?: string;
}): CommissionDistributionResult[] {
  const { upline, amount, sourceType, sourceUserName = 'Trader' } = params;
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const rates = REFERRAL_COMMISSION_RATES[sourceType] || REFERRAL_COMMISSION_RATES.deposit;
  const distributions: CommissionDistributionResult[] = [];

  // Level 1: Direct Sponsor (10% or 8% on withdrawal)
  if (upline.level1SponsorId && rates.level1 > 0) {
    const comm1 = Number((amount * rates.level1).toFixed(2));
    if (comm1 > 0) {
      distributions.push({
        level: 1,
        sponsorId: upline.level1SponsorId,
        rate: rates.level1,
        ratePercent: rates.level1 * 100,
        baseAmount: amount,
        commissionAmount: comm1,
        sourceType,
        description: `Level 1 Commission (${rates.level1 * 100}% of $${amount.toFixed(2)} ${sourceType} by ${sourceUserName})`,
      });
    }
  }

  // Level 2: Parent of Sponsor (5%)
  if (upline.level2SponsorId && rates.level2 > 0) {
    const comm2 = Number((amount * rates.level2).toFixed(2));
    if (comm2 > 0) {
      distributions.push({
        level: 2,
        sponsorId: upline.level2SponsorId,
        rate: rates.level2,
        ratePercent: rates.level2 * 100,
        baseAmount: amount,
        commissionAmount: comm2,
        sourceType,
        description: `Level 2 Commission (${rates.level2 * 100}% of $${amount.toFixed(2)} ${sourceType} by ${sourceUserName})`,
      });
    }
  }

  // Level 3: Grandparent of Sponsor (2%)
  if (upline.level3SponsorId && rates.level3 > 0) {
    const comm3 = Number((amount * rates.level3).toFixed(2));
    if (comm3 > 0) {
      distributions.push({
        level: 3,
        sponsorId: upline.level3SponsorId,
        rate: rates.level3,
        ratePercent: rates.level3 * 100,
        baseAmount: amount,
        commissionAmount: comm3,
        sourceType,
        description: `Level 3 Commission (${rates.level3 * 100}% of $${amount.toFixed(2)} ${sourceType} by ${sourceUserName})`,
      });
    }
  }

  return distributions;
}
