import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_TIER_RATES,
  VIP_TIER_RATES,
  VIP_ACTIVE_TRADERS_THRESHOLD,
  VIP_MILESTONE_REWARD_AMOUNT,
  SELF_FUNDED_TURNOVER_THRESHOLD,
  SELF_FUNDED_TURNOVER_BASIC_RATE,
  SELF_FUNDED_TURNOVER_UPGRADED_RATE,
  getSelfFundedTurnoverRateForTraderIndex,
  calculateReferralTurnoverCommission,
  getSelfFundedTurnoverTierStatus,
  normalizeAffiliateReferralDetailRow,
  buildDetailedReferralList,
} from './affiliateEngine.ts';

describe('Dual Affiliate Commission Structure (Funded + Self-Funded Turnover)', () => {
  it('validates Funded Challenge Basic & VIP tier rate constants', () => {
    assert.equal(BASIC_TIER_RATES.LEVEL_1, 0.10);
    assert.equal(BASIC_TIER_RATES.LEVEL_2, 0.05);
    assert.equal(BASIC_TIER_RATES.LEVEL_3, 0.02);
    assert.equal(BASIC_TIER_RATES.WITHDRAWAL_ROYALTY, 0.08);

    assert.equal(VIP_TIER_RATES.LEVEL_1, 0.15);
    assert.equal(VIP_TIER_RATES.LEVEL_2, 0.08);
    assert.equal(VIP_TIER_RATES.LEVEL_3, 0.05);
    assert.equal(VIP_TIER_RATES.WITHDRAWAL_ROYALTY, 0.10);
    assert.equal(VIP_ACTIVE_TRADERS_THRESHOLD, 1000);
    assert.equal(VIP_MILESTONE_REWARD_AMOUNT, 10000);
  });

  it('applies 5% turnover commission for the first 200 referred traders and 7% from the 201st trader onwards', () => {
    assert.equal(SELF_FUNDED_TURNOVER_THRESHOLD, 200);
    assert.equal(SELF_FUNDED_TURNOVER_BASIC_RATE, 0.05);
    assert.equal(SELF_FUNDED_TURNOVER_UPGRADED_RATE, 0.07);

    // Trader #1 -> 5%
    assert.equal(getSelfFundedTurnoverRateForTraderIndex(1), 0.05);
    const t1 = calculateReferralTurnoverCommission(10000, 1);
    assert.equal(t1.rate, 0.05);
    assert.equal(t1.ratePercent, 5);
    assert.equal(t1.commissionEarned, 500);
    assert.equal(t1.isUpgradedTier, false);

    // Trader #200 -> 5%
    assert.equal(getSelfFundedTurnoverRateForTraderIndex(200), 0.05);
    const t200 = calculateReferralTurnoverCommission(4500, 200);
    assert.equal(t200.rate, 0.05);
    assert.equal(t200.commissionEarned, 225);

    // Trader #201 -> 7%
    assert.equal(getSelfFundedTurnoverRateForTraderIndex(201), 0.07);
    const t201 = calculateReferralTurnoverCommission(10000, 201);
    assert.equal(t201.rate, 0.07);
    assert.equal(t201.ratePercent, 7);
    assert.equal(t201.commissionEarned, 700);
    assert.equal(t201.isUpgradedTier, true);

    // Trader #350 -> 7%
    const t350 = calculateReferralTurnoverCommission(2500.5, 350);
    assert.equal(t350.rate, 0.07);
    assert.equal(t350.commissionEarned, 175.04);
  });

  it('tracks progress toward the 200 completed traders threshold for 7% turnover upgrade', () => {
    const s50 = getSelfFundedTurnoverTierStatus(50);
    assert.equal(s50.is7PercentUnlocked, false);
    assert.equal(s50.currentRatePercent, 5);
    assert.equal(s50.remainingToUpgrade, 150);
    assert.equal(s50.progressPercent, 25);

    const s200 = getSelfFundedTurnoverTierStatus(200);
    assert.equal(s200.is7PercentUnlocked, true);
    assert.equal(s200.currentRatePercent, 7);
    assert.equal(s200.remainingToUpgrade, 0);
    assert.equal(s200.progressPercent, 100);
  });

  it('normalizes affiliate_referral_details rows and calculates commission automatically', () => {
    const row1 = normalizeAffiliateReferralDetailRow(
      {
        id: 'ard-1',
        referrer_id: 'sponsor-1',
        referred_user_id: 'usr-981234',
        referral_name: 'Vikram Patel',
        account_balance: 1450.75,
        bonus_amount: 300,
        total_trade_turnover: 12400,
        trader_index: 12,
      },
      0
    );

    assert.equal(row1.referralName, 'Vikram Patel');
    assert.equal(row1.accountBalance, 1450.75);
    assert.equal(row1.bonusAmount, 300);
    assert.equal(row1.totalTradeTurnover, 12400);
    assert.equal(row1.turnoverCommissionRate, 0.05);
    assert.equal(row1.commissionEarned, 620); // 5% of 12,400

    const row201 = normalizeAffiliateReferralDetailRow(
      {
        id: 'ard-201',
        referrer_id: 'sponsor-1',
        referred_user_id: 'usr-999201',
        referral_name: 'Elena Rostova',
        account_balance: 5200,
        bonus_amount: 1000,
        total_trade_turnover: 30000,
        trader_index: 201,
      },
      200
    );

    assert.equal(row201.turnoverCommissionRate, 0.07);
    assert.equal(row201.commissionEarned, 2100); // 7% of 30,000

    const merged = buildDetailedReferralList({
      sponsorId: 'sponsor-1',
      rawDetailRows: [row1, row201],
    });
    assert.equal(merged.length, 2);
  });

  it('never fabricates simulated balance, bonus, or turnover multipliers when a referred user has 0 live stats', () => {
    const mergedZero = buildDetailedReferralList({
      sponsorId: 'sponsor-real',
      rawDetailRows: [],
      networkNodes: [
        {
          id: 'real-user-1',
          fullName: 'Real Trader One',
          email: 'real1@bft.io',
          level: 1,
          joinedDate: '2026-11-10',
          latestPurchase: {
            id: 'pur-1',
            packageName: 'Pro Challenge',
            amount: 199,
            status: 'completed',
            createdAt: '2026-11-10',
          },
        } as any,
      ],
    });

    assert.equal(mergedZero.length, 1);
    assert.equal(mergedZero[0].referralName, 'Real Trader One');
    assert.equal(mergedZero[0].accountBalance, 0);
    assert.equal(mergedZero[0].bonusAmount, 0);
    assert.equal(mergedZero[0].totalTradeTurnover, 0);
    assert.equal(mergedZero[0].commissionEarned, 0);
  });
});


