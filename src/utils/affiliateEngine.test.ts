import test from 'node:test';
import assert from 'node:assert';
import {
  isSelfReferral,
  process3TierCommissions,
  calculateAffiliateStats,
  requestAffiliatePayout,
  registerNewUserAccount,
  validateSponsorReferralCode,
  processWithdrawalCommission,
  COMMISSION_RATES,
  UserAccount,
  ReferralRecord,
} from './affiliateEngine';

test('isSelfReferral blocks user from referring themselves', () => {
  const users: UserAccount[] = [
    {
      id: 'USR-01',
      name: 'Trader Alex',
      email: 'alex@test.com',
      referralCode: 'BFT-ALEX77',
      createdAt: '2026-01-01',
    },
  ];

  assert.strictEqual(isSelfReferral('BFT-ALEX77', 'USR-01', users), true);
  assert.strictEqual(isSelfReferral('bft-alex77', 'USR-01', users), true); // Case-insensitive
  assert.strictEqual(isSelfReferral('BFT-OTHER99', 'USR-01', users), false);
});

test('process3TierCommissions distributes 10%, 5%, and 2% correctly down the chain', () => {
  // Setup 3-tier chain:
  // Master (L3) -> Parent (L2) -> Direct (L1) -> Buyer
  const mockUsers: UserAccount[] = [
    {
      id: 'USR-MASTER',
      name: 'Master Trader',
      email: 'master@test.com',
      referralCode: 'BFT-MASTER',
      createdAt: '2026-01-01',
    },
    {
      id: 'USR-PARENT',
      name: 'Parent Affiliate',
      email: 'parent@test.com',
      referralCode: 'BFT-PARENT',
      referredBy: 'USR-MASTER',
      createdAt: '2026-01-02',
    },
    {
      id: 'USR-DIRECT',
      name: 'Direct Sponsor',
      email: 'direct@test.com',
      referralCode: 'BFT-DIRECT',
      referredBy: 'USR-PARENT',
      createdAt: '2026-01-03',
    },
    {
      id: 'USR-BUYER',
      name: 'New Trader',
      email: 'buyer@test.com',
      referralCode: 'BFT-BUYER',
      referredBy: 'USR-DIRECT',
      createdAt: '2026-01-04',
    },
  ];

  // Buyer purchases $10,000 One-Step Challenge for $89.00
  const packagePrice = 89;
  const result = process3TierCommissions({
    buyerUserId: 'USR-BUYER',
    buyerName: 'New Trader',
    buyerEmail: 'buyer@test.com',
    packageTier: 'one-step',
    packageName: 'One-Step Challenge ($10,000)',
    packagePrice,
    users: mockUsers,
    existingReferrals: [],
  });

  assert.strictEqual(result.newReferrals.length, 3, 'Should generate 3 referral records (L1, L2, L3)');

  const l1 = result.newReferrals.find((r) => r.level === 1);
  const l2 = result.newReferrals.find((r) => r.level === 2);
  const l3 = result.newReferrals.find((r) => r.level === 3);

  // Check L1: 10% of $89 = $8.90
  assert.ok(l1);
  assert.strictEqual(l1.referrerId, 'USR-DIRECT');
  assert.strictEqual(l1.commissionRate, 0.10);
  assert.strictEqual(l1.commissionAmount, 8.90);

  // Check L2: 5% of $89 = $4.45
  assert.ok(l2);
  assert.strictEqual(l2.referrerId, 'USR-PARENT');
  assert.strictEqual(l2.commissionRate, 0.05);
  assert.strictEqual(l2.commissionAmount, 4.45);

  // Check L3: 2% of $89 = $1.78
  assert.ok(l3);
  assert.strictEqual(l3.referrerId, 'USR-MASTER');
  assert.strictEqual(l3.commissionRate, 0.02);
  assert.strictEqual(l3.commissionAmount, 1.78);
});

test('calculateAffiliateStats accurately groups multi-tier counts and balances', () => {
  const userId = 'USR-TEST-ME';
  const mockReferrals: ReferralRecord[] = [
    {
      id: 'R1',
      referrerId: userId,
      referredUserId: 'U1',
      referredUserName: 'User 1',
      referredUserEmail: 'u1@test.com',
      level: 1,
      packageTier: 'one-step',
      packageName: 'One-Step $10k',
      packagePrice: 89,
      commissionRate: COMMISSION_RATES.LEVEL_1,
      commissionAmount: 8.90,
      status: 'paid',
      createdAt: '2026-01-01',
    },
    {
      id: 'R2',
      referrerId: userId,
      referredUserId: 'U2',
      referredUserName: 'User 2',
      referredUserEmail: 'u2@test.com',
      level: 2,
      packageTier: 'two-step',
      packageName: 'Two-Step $25k',
      packagePrice: 149,
      commissionRate: COMMISSION_RATES.LEVEL_2,
      commissionAmount: 7.45,
      status: 'paid',
      createdAt: '2026-01-02',
    },
    {
      id: 'R3',
      referrerId: userId,
      referredUserId: 'U3',
      referredUserName: 'User 3',
      referredUserEmail: 'u3@test.com',
      level: 3,
      packageTier: 'instant',
      packageName: 'Instant $50k',
      packagePrice: 899,
      commissionRate: COMMISSION_RATES.LEVEL_3,
      commissionAmount: 17.98,
      status: 'paid',
      createdAt: '2026-01-03',
    },
  ];

  const stats = calculateAffiliateStats(userId, mockReferrals, []);

  assert.strictEqual(stats.totalReferralsCount, 3);
  assert.strictEqual(stats.level1Count, 1);
  assert.strictEqual(stats.level1Earnings, 8.90);
  assert.strictEqual(stats.level2Count, 1);
  assert.strictEqual(stats.level2Earnings, 7.45);
  assert.strictEqual(stats.level3Count, 1);
  assert.strictEqual(stats.level3Earnings, 17.98);
  assert.strictEqual(stats.lifetimeEarnings, 34.33);
  assert.strictEqual(stats.availableBalance, 34.33);
});

test('requestAffiliatePayout enforces $50 minimum and available balance limit', () => {
  const userId = 'USR-PAYOUT-TEST';
  const mockReferrals: ReferralRecord[] = [
    {
      id: 'R1',
      referrerId: userId,
      referredUserId: 'U1',
      referredUserName: 'User 1',
      referredUserEmail: 'u1@test.com',
      level: 1,
      packageTier: 'instant',
      packageName: 'Instant $50k',
      packagePrice: 899,
      commissionRate: 0.10,
      commissionAmount: 89.90, // Earned $89.90
      status: 'paid',
      createdAt: '2026-01-01',
    },
  ];

  // Attempt under $50 minimum ($30)
  const lowResult = requestAffiliatePayout({
    userId,
    amount: 30,
    method: 'USDT (TRC-20)',
    details: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referrals: mockReferrals,
    payouts: [],
  });
  assert.strictEqual(lowResult.success, false);
  assert.match(lowResult.error || '', /Minimum payout threshold is \$50\.00/);

  // Attempt more than available ($150)
  const overResult = requestAffiliatePayout({
    userId,
    amount: 150,
    method: 'USDT (TRC-20)',
    details: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referrals: mockReferrals,
    payouts: [],
  });
  assert.strictEqual(overResult.success, false);
  assert.match(overResult.error || '', /Insufficient available balance/);

  // Valid payout ($60)
  const validResult = requestAffiliatePayout({
    userId,
    amount: 60,
    method: 'USDT (TRC-20)',
    details: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referrals: mockReferrals,
    payouts: [],
  });
  assert.strictEqual(validResult.success, true);
  assert.ok(validResult.payout);
  assert.strictEqual(validResult.payout.amount, 60);

  // Check remaining balance after payout
  const updatedStats = calculateAffiliateStats(userId, mockReferrals, validResult.updatedPayouts);
  assert.strictEqual(updatedStats.availableBalance, 29.90);
});

test('registerNewUserAccount attributes new user to sponsor and processWithdrawalCommission awards 8%', () => {
  const mockUsers: UserAccount[] = [
    {
      id: 'USR-SPONSOR-1',
      name: 'Viktor Vance',
      email: 'viktor@bft.com',
      referralCode: 'BFT-VIKTOR88',
      createdAt: '2026-01-01',
    },
  ];

  const val = validateSponsorReferralCode('bft-viktor88', mockUsers);
  assert.strictEqual(val.valid, true);
  assert.strictEqual(val.sponsor?.id, 'USR-SPONSOR-1');

  const reg = registerNewUserAccount({
    name: 'Elena Stone',
    email: 'elena@stone.io',
    referralCodeInput: 'BFT-VIKTOR88',
    users: mockUsers,
  });

  assert.strictEqual(reg.newUser.referredBy, 'USR-SPONSOR-1');

  // Now Elena withdraws $500 -> Viktor earns 8% ($40.00)
  const wdComm = processWithdrawalCommission({
    traderUserId: reg.newUser.id,
    traderName: reg.newUser.name,
    traderEmail: reg.newUser.email,
    withdrawalAmount: 500,
    users: reg.updatedUsers,
    existingReferrals: [],
  });

  assert.ok(wdComm.commissionRecord);
  assert.strictEqual(wdComm.commissionRecord.referrerId, 'USR-SPONSOR-1');
  assert.strictEqual(wdComm.commissionRecord.commissionRate, 0.08);
  assert.strictEqual(wdComm.commissionRecord.commissionAmount, 40.00);
  assert.strictEqual(wdComm.commissionRecord.commissionType, 'withdrawal');
});

