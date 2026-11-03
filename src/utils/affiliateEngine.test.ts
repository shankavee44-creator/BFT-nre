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
  formatPurchasedPackageLabel,
  formatPurchaseAmountDisplay,
  buildReferredNetworkTree,
  mergeCommissionLedgers,
  COMMISSION_RATES,
  getSponsorAffiliateTier,
  VIP_ACTIVE_TRADERS_THRESHOLD,
  VIP_MILESTONE_REWARD_AMOUNT,
  isUserActiveFunded,
  BASIC_TIER_RATES,
  VIP_TIER_RATES,
  claimVipMilestoneReward,
  isMilestoneRewardClaimed,
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

test('formatPurchasedPackageLabel & formatPurchaseAmountDisplay format package names and exact amounts', () => {
  assert.strictEqual(
    formatPurchasedPackageLabel('Instant Funded ($25,000)', 'BFT-IF-25K', 250),
    '$25K Instant Funded'
  );
  assert.strictEqual(
    formatPurchasedPackageLabel('One-Step Challenge ($50,000)', 'BFT-1S-50K', 289),
    '$50K 1-Step Challenge'
  );
  assert.strictEqual(
    formatPurchasedPackageLabel('Two-Step Challenge ($100,000)', 'BFT-2S-100K', 469),
    '$100K 2-Step Challenge'
  );
  assert.strictEqual(formatPurchaseAmountDisplay(250), '$250');
  assert.strictEqual(formatPurchaseAmountDisplay(289.5), '$289.50');
  assert.strictEqual(formatPurchaseAmountDisplay(0), '$0');
});

test('buildReferredNetworkTree and mergeCommissionLedgers synchronize referred user purchases and 3-tier commissions in real-time', () => {
  const sponsorId = 'USR-SPONSOR-ROOT';
  const mockUsers: UserAccount[] = [
    {
      id: sponsorId,
      name: 'Root Sponsor',
      email: 'root@bft.com',
      referralCode: 'BFT-ROOT99',
      createdAt: '2026-01-01',
    },
    {
      id: 'USR-L1-BUYER',
      name: 'Chamika Kavindu',
      email: 'chamika@bft.com',
      referralCode: 'BFT-CHAM1',
      referredBy: sponsorId,
      createdAt: '2026-01-02',
    },
    {
      id: 'USR-L2-BUYER',
      name: 'Nethan Rathnayaka',
      email: 'nethan@bft.com',
      referralCode: 'BFT-NETH2',
      referredBy: 'USR-L1-BUYER',
      createdAt: '2026-01-03',
    },
  ];

  // L1 user purchases "$25K Instant Funded" for $250
  const l1Purchase = process3TierCommissions({
    buyerUserId: 'USR-L1-BUYER',
    buyerName: 'Chamika Kavindu',
    buyerEmail: 'chamika@bft.com',
    packageTier: 'instant',
    packageName: 'Instant Funded ($25,000)',
    packagePrice: 250,
    packageSku: 'BFT-IF-25K',
    users: mockUsers,
    existingReferrals: [],
  });

  // L2 user purchases "$50K 1-Step Challenge" for $300
  const l2Purchase = process3TierCommissions({
    buyerUserId: 'USR-L2-BUYER',
    buyerName: 'Nethan Rathnayaka',
    buyerEmail: 'nethan@bft.com',
    packageTier: 'one-step',
    packageName: 'One-Step Challenge ($50,000)',
    packagePrice: 300,
    packageSku: 'BFT-1S-50K',
    users: l1Purchase.updatedUsers,
    existingReferrals: l1Purchase.allReferrals,
  });

  const tree = buildReferredNetworkTree({
    sponsorId,
    usersList: l2Purchase.updatedUsers,
    referralsList: l2Purchase.allReferrals,
  });

  const l1Node = tree.find((n) => n.id === 'USR-L1-BUYER');
  const l2Node = tree.find((n) => n.id === 'USR-L2-BUYER');

  assert.ok(l1Node, 'L1 referred trader should be in network tree');
  assert.strictEqual(l1Node.level, 1);
  assert.strictEqual(l1Node.latestPurchase?.name, '$25K Instant Funded');
  assert.strictEqual(l1Node.latestPurchase?.amount, 250);

  assert.ok(l2Node, 'L2 referred trader should be in network tree');
  assert.strictEqual(l2Node.level, 2);
  assert.strictEqual(l2Node.latestPurchase?.name, '$50K 1-Step Challenge');
  assert.strictEqual(l2Node.latestPurchase?.amount, 300);

  const ledger = mergeCommissionLedgers({
    sponsorIds: [sponsorId],
    localReferrals: l2Purchase.allReferrals,
  });

  // Root sponsor earned 10% of $250 ($25.00) from L1 + 5% of $300 ($15.00) from L2 = $40.00
  assert.strictEqual(ledger.length, 2);
  const stats = calculateAffiliateStats(sponsorId, ledger, []);
  assert.strictEqual(stats.level1Earnings, 25.00);
  assert.strictEqual(stats.level2Earnings, 15.00);
  assert.strictEqual(stats.availableBalance, 40.00);
});

test('VIP Tier qualification requires 1,000 active funded referrals', () => {
  assert.strictEqual(VIP_ACTIVE_TRADERS_THRESHOLD, 1000);
  assert.strictEqual(VIP_MILESTONE_REWARD_AMOUNT, 10000);

  // Test below threshold
  const basicTier = getSponsorAffiliateTier({
    sponsorId: 'USR-TEST-001',
    activeCountOverride: 450,
  });
  assert.strictEqual(basicTier.tier, 'basic');
  assert.strictEqual(basicTier.isVipUnlocked, false);
  assert.strictEqual(basicTier.activeFundedCount, 450);
  assert.strictEqual(basicTier.remainingToVip, 550);
  assert.strictEqual(basicTier.vipProgressPercent, 45.0);

  // Test at threshold
  const vipTier = getSponsorAffiliateTier({
    sponsorId: 'USR-TEST-001',
    activeCountOverride: 1000,
  });
  assert.strictEqual(vipTier.tier, 'vip');
  assert.strictEqual(vipTier.isVipUnlocked, true);
  assert.strictEqual(basicTier.milestoneRewardAmount, 10000);
  assert.strictEqual(vipTier.remainingToVip, 0);
  assert.strictEqual(vipTier.vipProgressPercent, 100);
});

test('Active trader definition counts only purchases > $0', () => {
  // $0 free/demo registration does NOT count
  const freeUser = {
    id: 'USR-FREE-01',
    latestPurchase: { name: 'Demo Registration', amount: 0, sku: 'BFT-DEMO' },
  };
  assert.strictEqual(isUserActiveFunded(freeUser), false);

  // Paid challenge package counts
  const paidUser = {
    id: 'USR-PAID-01',
    latestPurchase: { name: '$25K Instant Funded', amount: 250, sku: 'BFT-IF-25K' },
  };
  assert.strictEqual(isUserActiveFunded(paidUser), true);
});

test('Historical Rate Isolation: Basic referrals keep 10% L1, new VIP referrals earn 15% L1', () => {
  const sponsorUser = {
    id: 'USR-SPONSOR',
    name: 'Top Sponsor',
    email: 'sponsor@bft.com',
    referralCode: 'BFT-TOP1',
    createdAt: '2026-01-01',
  };

  // User 1 joined while sponsor was Basic tier
  const basicBuyer = {
    id: 'USR-BUYER-BASIC',
    name: 'Old Trader',
    email: 'old@bft.com',
    referralCode: 'BFT-OLD',
    referredBy: 'USR-SPONSOR',
    registeredTier: 'basic' as const,
    createdAt: '2026-01-10',
  };

  // User 2 joined after sponsor unlocked VIP tier
  const vipBuyer = {
    id: 'USR-BUYER-VIP',
    name: 'New VIP Trader',
    email: 'newvip@bft.com',
    referralCode: 'BFT-NEWVIP',
    referredBy: 'USR-SPONSOR',
    registeredTier: 'vip' as const,
    createdAt: '2026-02-01',
  };

  const usersList = [sponsorUser, basicBuyer, vipBuyer];

  // Old buyer purchases $1,000 package -> earns Basic rate 10% ($100)
  const basicRes = process3TierCommissions({
    buyerUserId: 'USR-BUYER-BASIC',
    buyerName: 'Old Trader',
    buyerEmail: 'old@bft.com',
    packageTier: 'instant',
    packageName: 'Instant Funded ($100,000)',
    packagePrice: 1000,
    users: usersList,
    existingReferrals: [],
  });

  const basicL1 = basicRes.newReferrals.find((r: any) => r.level === 1);
  assert.ok(basicL1);
  assert.strictEqual(basicL1.commissionRate, BASIC_TIER_RATES.LEVEL_1); // 0.10
  assert.strictEqual(basicL1.commissionAmount, 100.00);
  assert.strictEqual(basicL1.affiliateTier, 'basic');

  // VIP buyer purchases $1,000 package -> earns VIP rate 15% ($150)
  const vipRes = process3TierCommissions({
    buyerUserId: 'USR-BUYER-VIP',
    buyerName: 'New VIP Trader',
    buyerEmail: 'newvip@bft.com',
    packageTier: 'instant',
    packageName: 'Instant Funded ($100,000)',
    packagePrice: 1000,
    users: usersList,
    existingReferrals: [],
  });

  const vipL1 = vipRes.newReferrals.find((r: any) => r.level === 1);
  assert.ok(vipL1);
  assert.strictEqual(vipL1.commissionRate, VIP_TIER_RATES.LEVEL_1); // 0.15
  assert.strictEqual(vipL1.commissionAmount, 150.00);
  assert.strictEqual(vipL1.affiliateTier, 'vip');
});

test('processWithdrawalCommission applies 8% for Basic and 10% for VIP referrals', () => {
  const sponsor = {
    id: 'USR-SPONSOR-WD',
    name: 'Sponsor WD',
    email: 'sponsor-wd@bft.com',
    referralCode: 'BFT-SPWD',
    createdAt: '2026-01-01',
  };

  const basicTrader = {
    id: 'USR-TRADER-BASIC',
    name: 'Basic Trader',
    email: 'trader-basic@bft.com',
    referralCode: 'BFT-TBASIC',
    referredBy: sponsor.id,
    registeredTier: 'basic' as const,
    createdAt: '2026-01-05',
  };

  const vipTrader = {
    id: 'USR-TRADER-VIP',
    name: 'VIP Trader',
    email: 'trader-vip@bft.com',
    referralCode: 'BFT-TVIP',
    referredBy: sponsor.id,
    registeredTier: 'vip' as const,
    createdAt: '2026-01-20',
  };

  const users = [sponsor, basicTrader, vipTrader];

  // Basic trader withdraws $1,000 -> 8% ($80)
  const basicWd = processWithdrawalCommission({
    traderUserId: basicTrader.id,
    traderName: basicTrader.name,
    traderEmail: basicTrader.email,
    withdrawalAmount: 1000,
    users,
    existingReferrals: [],
  });
  assert.strictEqual(basicWd.commissionRecord?.commissionRate, BASIC_TIER_RATES.WITHDRAWAL_ROYALTY); // 0.08
  assert.strictEqual(basicWd.commissionRecord?.commissionAmount, 80.00);
  assert.strictEqual(basicWd.commissionRecord?.affiliateTier, 'basic');

  // VIP trader withdraws $1,000 -> 10% ($100)
  const vipWd = processWithdrawalCommission({
    traderUserId: vipTrader.id,
    traderName: vipTrader.name,
    traderEmail: vipTrader.email,
    withdrawalAmount: 1000,
    users,
    existingReferrals: [],
  });
  assert.strictEqual(vipWd.commissionRecord?.commissionRate, VIP_TIER_RATES.WITHDRAWAL_ROYALTY); // 0.10
  assert.strictEqual(vipWd.commissionRecord?.commissionAmount, 100.00);
  assert.strictEqual(vipWd.commissionRecord?.affiliateTier, 'vip');
});

test('claimVipMilestoneReward awards $10,000 only when 1,000 active referrals achieved', () => {
  // Fails when active count < 1000
  const failRes = claimVipMilestoneReward({
    userId: 'USR-MILESTONE-TEST',
    activeCountOverride: 999,
  });
  assert.strictEqual(failRes.success, false);
  assert.ok(failRes.error?.includes('1,000'));

  // Succeeds when active count >= 1000
  const successRes = claimVipMilestoneReward({
    userId: 'USR-MILESTONE-TEST-2',
    activeCountOverride: 1000,
  });
  assert.strictEqual(successRes.success, true);
  assert.strictEqual(successRes.rewardRecord?.commissionAmount, 10000);
  assert.strictEqual(successRes.rewardRecord?.commissionRate, 1.0);
  assert.strictEqual(successRes.rewardRecord?.affiliateTier, 'vip');
});



