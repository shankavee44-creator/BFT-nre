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
  computeSelfFundedSummary,
  isUserActiveFunded,
  countActiveFundedReferrals,
  AFFILIATE_MIN_WITHDRAWAL,
  AFFILIATE_MIN_ACTIVE_TRADERS,
  COUNTRY_MANAGER_REFERRALS_GUIDELINE,
  FRIDAY_ONLY_WITHDRAWAL_NOTICE,
  countCombinedActiveReferrals,
  evaluateAffiliateWithdrawalEligibility,
  requestAffiliatePayout,
  validateAffiliateSocialSubmission,
  validateCountryManagerApplication,
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
    const s50 = getSelfFundedTurnoverTierStatus(50, 120);
    assert.equal(s50.is7PercentUnlocked, false);
    assert.equal(s50.currentRatePercent, 5);
    assert.equal(s50.remainingToUpgrade, 150);
    assert.equal(s50.progressPercent, 25);
    assert.equal(s50.activeDepositedCount, 50);
    assert.equal(s50.totalRegisteredReferrals, 120);

    const s200 = getSelfFundedTurnoverTierStatus(200, 310);
    assert.equal(s200.is7PercentUnlocked, true);
    assert.equal(s200.currentRatePercent, 7);
    assert.equal(s200.remainingToUpgrade, 0);
    assert.equal(s200.progressPercent, 100);
    assert.equal(s200.activeDepositedCount, 200);
    assert.equal(s200.totalRegisteredReferrals, 310);
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

  it('does NOT count empty $0 registrations, pending self-deposits, or challenge-only referrals toward the 200-trader 7% tier', () => {
    const networkNodes: any[] = [];
    // 250 empty $0 registered users
    for (let i = 1; i <= 250; i++) {
      networkNodes.push({
        id: `empty-reg-${i}`,
        fullName: `Empty User ${i}`,
        email: `empty${i}@bft.io`,
        level: 1,
        joinedDate: '2026-11-10',
      });
    }
    // 5 users with ONLY Funded Challenge purchases (no self-capital deposit)
    for (let i = 1; i <= 5; i++) {
      networkNodes.push({
        id: `challenge-only-${i}`,
        fullName: `Challenge Trader ${i}`,
        email: `chal${i}@bft.io`,
        level: 1,
        joinedDate: '2026-11-11',
        purchases: [
          {
            id: `pur-chal-${i}`,
            packageName: '$25K Instant Funded',
            sku: 'BFT-IF-25K',
            amount: 250,
            accountType: 'challenge',
            status: 'completed',
          },
        ],
      });
    }
    // 2 users with PENDING self-capital deposits (not active yet)
    for (let i = 1; i <= 2; i++) {
      networkNodes.push({
        id: `pending-self-${i}`,
        fullName: `Pending Self ${i}`,
        email: `pend${i}@bft.io`,
        level: 1,
        joinedDate: '2026-11-12',
        purchases: [
          {
            id: `dep-pend-${i}`,
            packageName: 'Self-Funded Live Deposit',
            sku: 'BFT-SELF-500',
            amount: 500,
            accountType: 'self_funded',
            status: 'pending',
          },
        ],
      });
    }
    // 3 users with ACTIVE self-capital deposits
    for (let i = 1; i <= 3; i++) {
      networkNodes.push({
        id: `active-self-${i}`,
        fullName: `Active Self ${i}`,
        email: `active${i}@bft.io`,
        level: 1,
        joinedDate: '2026-11-13',
        accountBalance: 1000,
        totalTradeTurnover: 5000,
        purchases: [
          {
            id: `dep-act-${i}`,
            packageName: 'Self-Funded Live Deposit',
            sku: 'BFT-SELF-1000',
            amount: 1000,
            accountType: 'self_funded',
            status: 'completed',
          },
        ],
      });
    }

    const detailed = buildDetailedReferralList({
      sponsorId: 'sponsor-strict',
      networkNodes,
    });
    const summary = computeSelfFundedSummary(detailed);

    assert.equal(summary.totalRegisteredReferrals, 260);
    assert.equal(summary.activeDepositedCount, 3);
    assert.equal(summary.tierStatus.is7PercentUnlocked, false);
    assert.equal(summary.tierStatus.currentRatePercent, 5);
    assert.equal(summary.tierStatus.remainingToUpgrade, 197);

    const emptyRow = detailed.find((r) => r.referredUserId === 'empty-reg-1')!;
    assert.equal(emptyRow.hasActiveSelfCapitalDeposit, false);
    assert.equal(emptyRow.traderIndex, 0);
    assert.equal(emptyRow.status, 'registered');

    const challengeOnlyRow = detailed.find((r) => r.referredUserId === 'challenge-only-1')!;
    assert.equal(challengeOnlyRow.hasActiveSelfCapitalDeposit, false);
    assert.equal(challengeOnlyRow.hasActiveFundedChallenge, true);
    assert.equal(challengeOnlyRow.traderIndex, 0);

    const pendingSelfRow = detailed.find((r) => r.referredUserId === 'pending-self-1')!;
    assert.equal(pendingSelfRow.hasActiveSelfCapitalDeposit, false);
    assert.equal(pendingSelfRow.traderIndex, 0);
    assert.equal(pendingSelfRow.status, 'pending');

    const activeSelfRow = detailed.find((r) => r.referredUserId === 'active-self-1')!;
    assert.equal(activeSelfRow.hasActiveSelfCapitalDeposit, true);
    assert.equal(activeSelfRow.traderIndex, 1);
    assert.equal(activeSelfRow.commissionEarned, 250); // 5% of 5000
  });

  it('unlocks 7% at the 201st+ Active Self-Capital Deposited trader and excludes non-challenge accounts from Active Funded counts', () => {
    const activeNodes: any[] = [];
    for (let i = 1; i <= 205; i++) {
      activeNodes.push({
        id: `self-dep-${i}`,
        fullName: `Depositor ${i}`,
        email: `dep${i}@bft.io`,
        level: 1,
        accountBalance: 500,
        totalTradeTurnover: 10000,
        purchases: [
          {
            id: `dep-${i}`,
            packageName: 'Self-Funded Live Deposit',
            sku: 'BFT-SELF-500',
            amount: 500,
            accountType: 'self_funded',
            status: 'completed',
          },
        ],
      });
    }

    const detailed = buildDetailedReferralList({
      sponsorId: 'sponsor-vip-self',
      networkNodes: activeNodes,
    });
    const summary = computeSelfFundedSummary(detailed);

    assert.equal(summary.activeDepositedCount, 205);
    assert.equal(summary.tierStatus.is7PercentUnlocked, true);
    assert.equal(summary.tierStatus.currentRatePercent, 7);

    const row200 = detailed.find((r) => r.referredUserId === 'self-dep-200')!;
    const row201 = detailed.find((r) => r.referredUserId === 'self-dep-201')!;
    assert.equal(row200.traderIndex, 200);
    assert.equal(row200.turnoverCommissionRate, 0.05);
    assert.equal(row200.commissionEarned, 500);
    assert.equal(row201.traderIndex, 201);
    assert.equal(row201.turnoverCommissionRate, 0.07);
    assert.equal(row201.commissionEarned, 700);

    // Active Funded count must exclude $0 registered, pending/failed challenges, and self-funded-only accounts
    const fundedCount = countActiveFundedReferrals({
      sponsorId: 'sponsor-funded-check',
      networkTree: [
        { id: 'u-empty', fullName: 'Empty', level: 1 },
        {
          id: 'u-self-only',
          fullName: 'Self Only',
          level: 1,
          purchases: [
            {
              id: 'p-self',
              name: 'Self-Funded Live',
              sku: 'BFT-SELF-500',
              amount: 500,
              accountType: 'self_funded',
              status: 'completed',
            },
          ],
        },
        {
          id: 'u-pending-chal',
          fullName: 'Pending Chal',
          level: 1,
          purchases: [
            {
              id: 'p-pend',
              name: '$25K Instant Funded',
              sku: 'BFT-IF-25K',
              amount: 250,
              accountType: 'challenge',
              status: 'pending',
            },
          ],
        },
        {
          id: 'u-failed-chal',
          fullName: 'Failed Chal',
          level: 1,
          purchases: [
            {
              id: 'p-fail',
              name: '$50K 1-Step Challenge',
              sku: 'BFT-1S-50K',
              amount: 279,
              accountType: 'challenge',
              status: 'failed',
            },
          ],
        },
        {
          id: 'u-active-l1',
          fullName: 'Active L1 Challenge',
          level: 1,
          purchases: [
            {
              id: 'p-l1',
              name: '$25K Instant Funded',
              sku: 'BFT-IF-25K',
              amount: 250,
              accountType: 'challenge',
              status: 'completed',
            },
          ],
        },
        {
          id: 'u-active-l3',
          fullName: 'Active L3 Challenge',
          level: 3,
          purchases: [
            {
              id: 'p-l3',
              name: '$10K Two-Step Challenge',
              sku: 'BFT-2S-10K',
              amount: 99,
              accountType: 'challenge',
              status: 'active',
            },
          ],
        },
      ],
    });
    assert.equal(fundedCount, 2);
    assert.equal(isUserActiveFunded({ id: 'u-self-only', purchases: [{ name: 'Self-Funded Live', sku: 'BFT-SELF-500', amount: 500, accountType: 'self_funded', status: 'completed' }] }), false);
    assert.equal(isUserActiveFunded({ id: 'u-pending', purchases: [{ name: '$25K Instant Funded', sku: 'BFT-IF-25K', amount: 250, accountType: 'challenge', status: 'pending' }] }), false);
  });

  it('enforces $100 min withdrawal, 15 combined active traders, and Friday-only payout window', () => {
    assert.equal(AFFILIATE_MIN_WITHDRAWAL, 100);
    assert.equal(AFFILIATE_MIN_ACTIVE_TRADERS, 15);
    assert.equal(COUNTRY_MANAGER_REFERRALS_GUIDELINE, 200);
    assert.equal(FRIDAY_ONLY_WITHDRAWAL_NOTICE, 'Withdrawals are only available on Fridays.');

    // Build mixed network: 8 active funded + 7 active self-funded = 15 combined active, plus 5 empty/pending
    const mixedNetwork: any[] = [];
    for (let i = 1; i <= 8; i++) {
      mixedNetwork.push({
        id: `funded-${i}`,
        fullName: `Funded ${i}`,
        level: 1,
        hasActiveFunded: true,
        purchases: [{ id: `pf-${i}`, amount: 199, status: 'active' }],
      });
    }
    for (let i = 1; i <= 7; i++) {
      mixedNetwork.push({
        id: `self-${i}`,
        fullName: `Self ${i}`,
        level: 1,
        hasActiveSelfCapitalDeposit: true,
        purchases: [{ id: `ps-${i}`, amount: 300, status: 'completed', accountType: 'self_funded' }],
      });
    }
    for (let i = 1; i <= 5; i++) {
      mixedNetwork.push({
        id: `empty-${i}`,
        fullName: `Empty ${i}`,
        level: 1,
      });
    }
    assert.equal(countCombinedActiveReferrals(mixedNetwork), 15);

    const fridayDate = new Date('2026-11-13T12:00:00Z'); // Friday (getDay() === 5)
    const sundayDate = new Date('2026-11-15T12:00:00Z'); // Sunday (getDay() === 0)

    // Blocked when active traders < 15 even on Friday with $500 balance
    const blockedLowTraders = evaluateAffiliateWithdrawalEligibility({
      amount: 150,
      availableBalance: 500,
      activeTradersCount: 14,
      now: fridayDate,
    });
    assert.equal(blockedLowTraders.canSubmit, false);
    assert.equal(blockedLowTraders.isMinTradersMet, false);
    assert.ok(blockedLowTraders.tradersWarning?.includes('14/15'));

    // Blocked on non-Friday even when 15 active traders & $500 balance
    const blockedSunday = evaluateAffiliateWithdrawalEligibility({
      amount: 150,
      availableBalance: 500,
      activeTradersCount: 15,
      now: sundayDate,
    });
    assert.equal(blockedSunday.canSubmit, false);
    assert.equal(blockedSunday.isFriday, false);
    assert.equal(blockedSunday.fridayNotice, 'Withdrawals are only available on Fridays.');

    // Blocked when amount < $100 even on Friday with 15 active traders
    const blockedBelowMin = evaluateAffiliateWithdrawalEligibility({
      amount: 99,
      availableBalance: 500,
      activeTradersCount: 15,
      now: fridayDate,
    });
    assert.equal(blockedBelowMin.canSubmit, false);
    assert.equal(blockedBelowMin.isMinAmountMet, false);

    // Allowed when Friday + 15+ active traders + >= $100 + sufficient balance
    const allowed = evaluateAffiliateWithdrawalEligibility({
      amount: 100,
      availableBalance: 500,
      activeTradersCount: 15,
      now: fridayDate,
    });
    assert.equal(allowed.canSubmit, true);

    const sampleRef: any[] = [
      {
        id: 'ref-earned-1',
        referrerId: 'sponsor-wd-test',
        referredUserId: 'trd-1',
        referredUserName: 'Trader One',
        referredUserEmail: 't@bft.io',
        level: 1,
        packageTier: 'one-step',
        packageName: '$25K Instant',
        packagePrice: 2500,
        commissionRate: 0.1,
        commissionAmount: 250,
        commissionType: 'package',
        status: 'paid',
        createdAt: '2026-11-10T00:00:00Z',
      },
    ];

    const sundayReq = requestAffiliatePayout({
      userId: 'sponsor-wd-test',
      amount: 120,
      method: 'USDT (TRC-20)',
      details: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      referrals: sampleRef,
      payouts: [],
      activeTradersCount: 15,
      now: sundayDate,
    });
    assert.equal(sundayReq.success, false);
    assert.equal(sundayReq.error, 'Withdrawals are only available on Fridays.');

    const fridaySuccess = requestAffiliatePayout({
      userId: 'sponsor-wd-test',
      amount: 120,
      method: 'USDT (TRC-20)',
      details: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      referrals: sampleRef,
      payouts: [],
      activeTradersCount: 15,
      now: fridayDate,
    });
    assert.equal(fridaySuccess.success, true);
    assert.equal(fridaySuccess.payout?.amount, 120);
  });

  it('validates Social Media One-Time Lock and BFT Country Manager applications', () => {
    const emptySocial = validateAffiliateSocialSubmission({
      platformType: 'YouTube',
      links: [''],
      alreadyLocked: false,
    });
    assert.equal(emptySocial.valid, false);

    const validSocial = validateAffiliateSocialSubmission({
      platformType: 'Telegram',
      links: ['https://t.me/bft_signals', 'https://t.me/bft_signals', 'https://youtube.com/@bft_pro'],
      alreadyLocked: false,
    });
    assert.equal(validSocial.valid, true);
    assert.deepEqual(validSocial.socialLinks, [
      'https://t.me/bft_signals',
      'https://youtube.com/@bft_pro',
    ]);

    const lockedSocial = validateAffiliateSocialSubmission({
      platformType: 'Telegram',
      links: ['https://t.me/another'],
      alreadyLocked: true,
    });
    assert.equal(lockedSocial.valid, false);
    assert.ok(lockedSocial.error?.includes('Verified & Locked'));

    const invalidCm = validateCountryManagerApplication({
      fullName: 'Viktor Vance',
      targetCountry: 'United Arab Emirates',
      telegramHandle: 'viktor_uae',
      estimatedAudienceSize: '30,000 traders',
      marketingStrategy: 'Too short',
      socialLinks: 'https://t.me/viktor_uae',
    });
    assert.equal(invalidCm.valid, false);

    const validCm = validateCountryManagerApplication({
      fullName: 'Viktor Vance',
      targetCountry: 'United Arab Emirates',
      telegramHandle: 'viktor_uae',
      estimatedAudienceSize: '30,000 traders',
      marketingStrategy: 'Weekly live binary & funded trading workshops across Dubai and MENA Telegram communities.',
      socialLinks: 'https://t.me/viktor_uae, https://youtube.com/@viktor_mena',
    });
    assert.equal(validCm.valid, true);
    assert.equal(validCm.normalized?.telegramHandle, '@viktor_uae');
    assert.equal(validCm.normalized?.socialLinks.length, 2);
  });
});




