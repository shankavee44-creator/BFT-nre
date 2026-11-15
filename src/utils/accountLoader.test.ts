import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAccountIdFromSearch,
  buildTerminalUrlWithAccountId,
  isExplicitNonDemoAccountId,
  findMatchingAccount,
  mapPurchaseOrdersToAccounts,
  buildTradingAccountFromDbRow,
} from './accountLoader.ts';
import { mergeRealtimePurchase } from '../config/directDeposit.ts';
import {
  recordAffiliateUserPurchase,
  saveAffiliateUserPurchases,
  buildReferredNetworkTree,
  buildDetailedReferralList,
} from './affiliateEngine.ts';
import { resolveActiveTradingAccount } from './supabaseRealtimeSync.ts';
import type { TradingAccount, ReferralRecord } from '../types/index.ts';

function makeChallengeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'BFT-2S-101',
    loginId: 'BFT-2S-101',
    passwordHash: 'pw_1',
    tier: 'two-step',
    accountType: 'two_step',
    tierName: 'Two-Step Challenge',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 5,
    maxOverallLossPercent: 10,
    profitTargetPercent: 8,
    maxRiskPerTradePercent: 5,
    status: 'active',
    createdDate: '2026-11-10',
    lastActiveDate: '2026-11-15',
    phase: 'phase_1',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    ...overrides,
  };
}

test('URL query parsing & strict account matching never fall back to Demo', () => {
  assert.equal(parseAccountIdFromSearch('?accountId=BFT-2S-102'), 'BFT-2S-102');
  assert.equal(parseAccountIdFromSearch('?tab=terminal&account_id=ACC-999'), 'ACC-999');
  assert.equal(parseAccountIdFromSearch(''), null);

  assert.equal(buildTerminalUrlWithAccountId('BFT-2S-102'), '/terminal?accountId=BFT-2S-102');
  assert.equal(buildTerminalUrlWithAccountId(null), '/terminal');

  assert.equal(isExplicitNonDemoAccountId('BFT-2S-102'), true);
  assert.equal(isExplicitNonDemoAccountId('BFT-DEMO-001'), false);
  assert.equal(isExplicitNonDemoAccountId('demo'), false);

  const demo = makeChallengeAccount({
    id: 'BFT-DEMO-001',
    loginId: 'BFT-DEMO-001',
    tier: 'demo',
    accountType: 'demo',
    phase: 'demo',
    currentBalance: 10000,
  });
  const acc1 = makeChallengeAccount({ id: 'BFT-2S-101', currentBalance: 10450, equity: 10450 });
  const acc2 = makeChallengeAccount({
    id: 'BFT-2S-102',
    supabaseAccountId: '11111111-1111-4111-a111-111111111102',
    currentBalance: 9800,
    equity: 9800,
  });

  // Strict match by supabaseAccountId & id
  assert.equal(findMatchingAccount([demo, acc1, acc2], 'BFT-2S-102')?.currentBalance, 9800);
  assert.equal(
    findMatchingAccount([demo, acc1, acc2], '11111111-1111-4111-a111-111111111102')?.id,
    'BFT-2S-102'
  );
  assert.equal(findMatchingAccount([demo, acc1, acc2], 'NON-EXISTENT'), undefined);

  // resolveActiveTradingAccount with strictMatch must return undefined rather than Demo when account is not loaded yet
  assert.equal(
    resolveActiveTradingAccount([demo, acc1], 'BFT-2S-102', null, { strictMatch: true }),
    undefined
  );
  assert.equal(
    resolveActiveTradingAccount([demo, acc1, acc2], 'BFT-2S-102', null, { strictMatch: true })?.currentBalance,
    9800
  );
});

test('mapPurchaseOrdersToAccounts maps multiple identical-SKU purchases 1-to-1 without collapsing', () => {
  const acc1 = makeChallengeAccount({ id: 'BFT-2S-101', currentBalance: 10450 });
  const acc2 = makeChallengeAccount({ id: 'BFT-2S-102', currentBalance: 9800 });
  const personal = makeChallengeAccount({
    id: 'BFT-PERS-001',
    tier: 'personal',
    accountType: 'personal',
    accountCategory: 'personal_live',
    phase: 'personal_live',
    currentBalance: 500,
  });

  const purchases = [
    {
      id: 'PUR-001',
      package_name: '$10K Two-Step Challenge',
      package_sku: 'BFT-2S-10K',
      amount: 99,
      package_amount: 99,
      account_type: 'challenge',
      status: 'completed',
      created_at: '2026-11-15T10:00:00Z',
    },
    {
      id: 'PUR-002',
      package_name: '$10K Two-Step Challenge',
      package_sku: 'BFT-2S-10K',
      amount: 99,
      package_amount: 99,
      account_type: 'challenge',
      status: 'completed',
      created_at: '2026-11-15T10:01:00Z',
    },
    {
      id: 'PUR-003',
      account_id: 'BFT-PERS-001',
      package_name: 'Self-Funded Deposit',
      package_sku: 'BFT-SELF-500',
      amount: 500,
      package_amount: 500,
      account_type: 'self_funded',
      status: 'completed',
      created_at: '2026-11-15T10:02:00Z',
    },
  ];

  const mapped = mapPurchaseOrdersToAccounts(purchases, [acc1, acc2, personal]);
  assert.equal(mapped.get('PUR-001')?.id, 'BFT-2S-101');
  assert.equal(mapped.get('PUR-002')?.id, 'BFT-2S-102');
  assert.equal(mapped.get('PUR-003')?.id, 'BFT-PERS-001');
});

test('buildTradingAccountFromDbRow constructs accurate accounts from trading_accounts and user_purchases rows', () => {
  const fromTradingRow = buildTradingAccountFromDbRow({
    id: '22222222-2222-4222-a222-222222222222',
    user_id: 'usr_abc',
    account_type: 'instant',
    starting_balance: 25000,
    current_balance: 26350.5,
    equity: 26350.5,
    challenge_phase: 'funded',
    status: 'active',
  });
  assert.equal(fromTradingRow.id, '22222222-2222-4222-a222-222222222222');
  assert.equal(fromTradingRow.currentBalance, 26350.5);
  assert.equal(fromTradingRow.initialBalance, 25000);
  assert.equal(fromTradingRow.accountType, 'instant');

  const fromPurchaseRow = buildTradingAccountFromDbRow({
    id: 'PUR-909',
    account_id: 'BFT-IF-909',
    user_id: 'usr_abc',
    package_name: '$25K Instant Funded',
    package_sku: 'BFT-IF-25K',
    amount: 250,
    account_type: 'challenge',
    status: 'completed',
  });
  assert.equal(fromPurchaseRow.id, 'BFT-IF-909');
  assert.equal(fromPurchaseRow.initialBalance, 25000);
  assert.equal(fromPurchaseRow.currentBalance, 25000);
  assert.equal(fromPurchaseRow.accountType, 'instant');
});

test('mergeRealtimePurchase keeps multiple same-SKU/same-amount purchases separate', () => {
  const nowIso1 = new Date(Date.now() - 2000).toISOString();
  const nowIso2 = new Date(Date.now() - 1000).toISOString();

  let list = mergeRealtimePurchase([], {
    id: 'PUR-FIRST-1',
    user_id: 'usr_1',
    account_id: 'BFT-2S-101',
    package_name: '$10K Two-Step Challenge',
    package_sku: 'BFT-2S-10K',
    amount: 99,
    account_type: 'challenge',
    status: 'completed',
    created_at: nowIso1,
  });

  list = mergeRealtimePurchase(list, {
    id: 'PUR-SECOND-2',
    user_id: 'usr_1',
    account_id: 'BFT-2S-102',
    package_name: '$10K Two-Step Challenge',
    package_sku: 'BFT-2S-10K',
    amount: 99,
    account_type: 'challenge',
    status: 'completed',
    created_at: nowIso2,
  });

  assert.equal(list.length, 2);

  // Two distinct UUIDs without account_id within 15s also stay separate
  let uuidList = mergeRealtimePurchase([], {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1',
    user_id: 'usr_1',
    package_name: '$10K Two-Step Challenge',
    package_sku: 'BFT-2S-10K',
    amount: 99,
    account_type: 'challenge',
    status: 'completed',
    created_at: nowIso1,
  });
  uuidList = mergeRealtimePurchase(uuidList, {
    id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb2',
    user_id: 'usr_1',
    package_name: '$10K Two-Step Challenge',
    package_sku: 'BFT-2S-10K',
    amount: 99,
    account_type: 'challenge',
    status: 'completed',
    created_at: nowIso2,
  });
  assert.equal(uuidList.length, 2);
});

test('Affiliate multi-account purchase tracking counts & displays all accounts per referred trader', () => {
  saveAffiliateUserPurchases([]);
  recordAffiliateUserPurchase({
    id: 'PUR-AFF-1',
    accountId: 'BFT-2S-201',
    userId: 'ref_trader_1',
    userEmail: 'alex@trader.com',
    userName: 'Alex Trader',
    packageName: '$10K Two-Step Challenge',
    packageSku: 'BFT-2S-10K',
    amount: 99,
  });
  const records = recordAffiliateUserPurchase({
    id: 'PUR-AFF-2',
    accountId: 'BFT-IF-202',
    userId: 'ref_trader_1',
    userEmail: 'alex@trader.com',
    userName: 'Alex Trader',
    packageName: '$25K Instant Funded',
    packageSku: 'BFT-IF-25K',
    amount: 250,
  });

  const forTrader = records.filter((r) => r.userId === 'ref_trader_1');
  assert.equal(forTrader.length, 2);

  const referrals: ReferralRecord[] = [
    {
      id: 'COMM-1',
      referrerId: 'sponsor_1',
      referredUserId: 'ref_trader_1',
      referredUserName: 'Alex Trader',
      referredUserEmail: 'a***@trader.com',
      level: 1,
      packagePrice: 99,
      commissionRate: 0.1,
      commissionAmount: 9.9,
      status: 'paid',
    },
    {
      id: 'COMM-2',
      referrerId: 'sponsor_1',
      referredUserId: 'ref_trader_1',
      referredUserName: 'Alex Trader',
      referredUserEmail: 'a***@trader.com',
      level: 1,
      packagePrice: 250,
      commissionRate: 0.1,
      commissionAmount: 25,
      status: 'paid',
    },
  ];

  const tree = buildReferredNetworkTree({
    sponsorId: 'sponsor_1',
    externalNodes: [{ id: 'ref_trader_1', fullName: 'Alex Trader', email: 'alex@trader.com', level: 1 }],
    purchasesList: forTrader,
    referralsList: referrals,
  });

  assert.equal(tree.length, 1);
  assert.equal(tree[0].accountCount, 2);
  assert.equal(tree[0].purchases?.length, 2);
  assert.equal(tree[0].totalPurchaseAmount, 349);

  const details = buildDetailedReferralList({
    sponsorId: 'sponsor_1',
    networkNodes: tree,
    referralsList: referrals,
  });

  assert.equal(details.length, 1);
  assert.equal(details[0].accountCount, 2);
  assert.equal(details[0].purchasedAccounts?.length, 2);
});
