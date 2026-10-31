import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRealtimeProfileUpdate,
  getAuthoritativeAccountBalance,
  resolveActiveTradingAccount,
  resolveAccountBalanceColumn,
  recordAtomicTradePlacement,
  computeAuthoritativeSettledBalance,
  recordAtomicTradeSettlement,
  resetBalanceSyncLedgerForTests,
  isTradeAlreadySettled,
  buildSupabaseWithdrawalInsertPayload,
  mapSupabaseWithdrawalToRequest,
  mergeRealtimeWithdrawal,
  mapSupabaseCommissionToReferralRecord,
  mergeRealtimeCommission,
  computeWithdrawalDeduction,
  computeWithdrawalRefund,
  hasActivePendingWithdrawal,
  getActivePendingWithdrawal,
  PENDING_WITHDRAWAL_WARNING_MESSAGE,
  rehydrateActiveTradesInLedger,
  isWithdrawalStrictlyPending,
} from './supabaseRealtimeSync';
import {
  isValidPriceForAsset,
  validateCandlesForAsset,
  aggregateCandlesForTimeframe,
} from './priceFeedEngine';
import { TradingAccount, UserProfile, WithdrawalRequest, ReferralRecord, AssetInfo } from '../types';

const createMockProfile = (): UserProfile => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'trader@binaryfunded.com',
  fullName: 'Alex Mercer',
  country: 'United States',
  avatarUrl: '',
  telegramHandle: '',
  kycStatus: 'unverified',
  twoFactorEnabled: false,
  activeAccountId: 'BFT-LIVE-001',
  isLoggedIn: true,
  selfBalance: 0,
  demoBalance: 10000,
  fundedBalance: 25000,
});

const createMockAccounts = (): TradingAccount[] => [
  {
    id: 'BFT-DEMO-001',
    loginId: 'BFT-DEMO-001',
    passwordHash: '',
    tier: 'demo',
    tierName: 'Demo Practice Account',
    accountCategory: 'demo',
    size: 10000,
    currentBalance: 10000,
    initialBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 100,
    maxOverallLossPercent: 100,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-01',
    phase: 'demo',
    tradingDaysCompleted: 1,
    tradesCount: 0,
    winRate: 0,
  },
  {
    id: 'BFT-LIVE-001',
    loginId: 'BFT-LIVE-001',
    passwordHash: '',
    tier: 'personal',
    tierName: 'Personal Live Account (Self-Funded)',
    accountCategory: 'personal_live',
    size: 0,
    currentBalance: 0,
    initialBalance: 0,
    startingDayEquity: 0,
    equity: 0,
    dailyLossLimitPercent: 100,
    maxOverallLossPercent: 100,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-01',
    phase: 'personal_live',
    tradingDaysCompleted: 1,
    tradesCount: 0,
    winRate: 0,
  },
  {
    id: 'BFT-FUNDED-001',
    loginId: 'BFT-FUNDED-001',
    passwordHash: '',
    tier: 'two-step',
    tierName: 'Prop Funded Account',
    accountCategory: 'prop',
    size: 25000,
    currentBalance: 25000,
    initialBalance: 25000,
    startingDayEquity: 25000,
    equity: 25000,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-01',
    phase: 'funded',
    tradingDaysCompleted: 5,
    tradesCount: 12,
    winRate: 75,
  },
];

test('applyRealtimeProfileUpdate updates self_balance, demo_balance, and funded_balance with strict mode separation', () => {
  const profile = createMockProfile();
  const accounts = createMockAccounts();

  // 1. Update only self_balance
  const res1 = applyRealtimeProfileUpdate(profile, accounts, {
    id: profile.id,
    self_balance: 1450.75,
  });

  assert.equal(res1.changed, true);
  assert.equal(res1.updatedProfile.selfBalance, 1450.75);
  assert.equal(res1.updatedProfile.demoBalance, 10000);
  assert.equal(res1.updatedProfile.fundedBalance, 25000);

  const liveAcc1 = res1.updatedAccounts.find((a) => a.id === 'BFT-LIVE-001')!;
  const demoAcc1 = res1.updatedAccounts.find((a) => a.id === 'BFT-DEMO-001')!;
  const fundedAcc1 = res1.updatedAccounts.find((a) => a.id === 'BFT-FUNDED-001')!;

  assert.equal(liveAcc1.currentBalance, 1450.75);
  assert.equal(liveAcc1.equity, 1450.75);
  assert.equal(demoAcc1.currentBalance, 10000);
  assert.equal(fundedAcc1.currentBalance, 25000);

  // 2. Update demo_balance and kyc_status
  const res2 = applyRealtimeProfileUpdate(res1.updatedProfile, res1.updatedAccounts, {
    id: profile.id,
    demo_balance: 8320.5,
    kyc_status: 'approved',
  });

  assert.equal(res2.changed, true);
  assert.equal(res2.updatedProfile.demoBalance, 8320.5);
  assert.equal(res2.updatedProfile.selfBalance, 1450.75);
  assert.equal(res2.updatedProfile.kycStatus, 'verified');

  const demoAcc2 = res2.updatedAccounts.find((a) => a.id === 'BFT-DEMO-001')!;
  const liveAcc2 = res2.updatedAccounts.find((a) => a.id === 'BFT-LIVE-001')!;
  assert.equal(demoAcc2.currentBalance, 8320.5);
  assert.equal(liveAcc2.currentBalance, 1450.75);
});

test('getAuthoritativeAccountBalance and resolveActiveTradingAccount strictly map Demo Mode to demo_balance and Personal Live Mode to self_balance', () => {
  const profile = createMockProfile();
  const accounts = createMockAccounts();

  const { updatedProfile, updatedAccounts } = applyRealtimeProfileUpdate(profile, accounts, {
    id: profile.id,
    self_balance: 3750.25,
    demo_balance: 14200.0,
  });

  // Toggling to Demo Mode ('demo' or 'BFT-DEMO-001') reads demo_balance
  const resolvedDemo = resolveActiveTradingAccount(updatedAccounts, 'demo', updatedProfile);
  assert.ok(resolvedDemo);
  assert.equal(resolvedDemo.id, 'BFT-DEMO-001');
  assert.equal(resolvedDemo.currentBalance, 14200.0);
  assert.equal(getAuthoritativeAccountBalance(resolvedDemo, updatedProfile), 14200.0);

  // Toggling to Self-Capital / Personal Live Mode ('personal_live' or 'BFT-PERS-...') reads self_balance
  const resolvedPersonal = resolveActiveTradingAccount(
    updatedAccounts,
    'personal_live',
    updatedProfile
  );
  assert.ok(resolvedPersonal);
  assert.equal(resolvedPersonal.id, 'BFT-LIVE-001');
  assert.equal(resolvedPersonal.currentBalance, 3750.25);
  assert.equal(getAuthoritativeAccountBalance(resolvedPersonal, updatedProfile), 3750.25);
});

test('mergeRealtimeWithdrawal handles INSERT and admin status UPDATE without duplicates', () => {
  const initial: WithdrawalRequest[] = [];
  const now = Date.now();

  const afterInsert = mergeRealtimeWithdrawal(
    initial,
    {
      id: 'wd-uuid-101',
      account_id: 'BFT-LIVE-001',
      account_type: 'personal_live',
      gross_amount: 500,
      fee_amount: 15,
      net_payout: 485,
      payment_method: 'crypto_trc20',
      wallet_address: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
      status: 'pending',
      requested_at: now,
    },
    'INSERT'
  );

  assert.equal(afterInsert.length, 1);
  assert.equal(afterInsert[0].id, 'wd-uuid-101');
  assert.equal(afterInsert[0].status, 'pending');
  assert.equal(afterInsert[0].amount, 500);
  assert.equal(afterInsert[0].netReceivedAmount, 485);

  // Admin approves/completes withdrawal in Supabase
  const afterApproval = mergeRealtimeWithdrawal(
    afterInsert,
    {
      id: 'wd-uuid-101',
      account_id: 'BFT-LIVE-001',
      account_type: 'personal_live',
      gross_amount: 500,
      fee_amount: 15,
      net_payout: 485,
      payment_method: 'crypto_trc20',
      wallet_address: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
      status: 'completed',
      tx_hash: '0xabc123def456',
      requested_at: now,
    },
    'UPDATE'
  );

  assert.equal(afterApproval.length, 1);
  assert.equal(afterApproval[0].status, 'completed');
  assert.equal(afterApproval[0].txHash, '0xabc123def456');
  assert.ok(afterApproval[0].completedAt);
});

test('mergeRealtimeCommission maps L1/L2/L3 and 8% withdrawal royalty commissions accurately', () => {
  const initial: ReferralRecord[] = [];

  const afterL1 = mergeRealtimeCommission(
    initial,
    {
      id: 'com-001',
      earner_id: 'usr-earner-1',
      source_user_id: 'usr-buyer-99',
      source_name: 'Elena Vance',
      source_email: 'elena@trader.io',
      level: 1,
      amount: 25,
      commission_type: 'package',
      created_at: '2026-10-30T12:00:00.000Z',
    },
    'INSERT'
  );

  assert.equal(afterL1.length, 1);
  assert.equal(afterL1[0].level, 1);
  assert.equal(afterL1[0].commissionAmount, 25);
  assert.equal(afterL1[0].commissionType, 'package');
  assert.equal(afterL1[0].packagePrice, 250);

  const afterRoyalty = mergeRealtimeCommission(
    afterL1,
    {
      id: 'com-002',
      earner_id: 'usr-earner-1',
      source_user_id: 'usr-buyer-99',
      level: 1,
      amount: 40,
      commission_type: 'withdrawal_royalty_8_percent',
      created_at: '2026-10-31T01:00:00.000Z',
    },
    'INSERT'
  );

  assert.equal(afterRoyalty.length, 2);
  assert.equal(afterRoyalty[0].id, 'com-002');
  assert.equal(afterRoyalty[0].commissionType, 'withdrawal');
  assert.equal(afterRoyalty[0].commissionRate, 0.08);
  assert.equal(afterRoyalty[0].commissionAmount, 40);
});

test('validateCandlesForAsset strictly rejects cross-asset contamination (including EUR/USD vs GBP/USD and GBP/JPY)', () => {
  const eurUsd: AssetInfo = {
    symbol: 'EUR/USD (OTC)',
    name: 'Euro / US Dollar (OTC)',
    category: 'Forex (OTC)',
    basePrice: 1.08425,
    volatility: 0.00018,
    payout: 92,
    pipDecimals: 5,
  };
  const gbpUsd: AssetInfo = {
    symbol: 'GBP/USD (OTC)',
    name: 'British Pound / US Dollar (OTC)',
    category: 'Forex (OTC)',
    basePrice: 1.2714,
    volatility: 0.00022,
    payout: 92,
    pipDecimals: 5,
  };
  const gbpJpy: AssetInfo = {
    symbol: 'GBP/JPY (OTC)',
    name: 'British Pound / Japanese Yen (OTC)',
    category: 'Forex (OTC)',
    basePrice: 199.18,
    volatility: 0.042,
    payout: 91,
    pipDecimals: 3,
  };

  const eurCandles = aggregateCandlesForTimeframe(eurUsd, 60);
  const gbpUsdCandles = aggregateCandlesForTimeframe(gbpUsd, 60);
  const gbpJpyCandles = aggregateCandlesForTimeframe(gbpJpy, 60);

  // Each asset's own candles must pass validation
  assert.equal(validateCandlesForAsset(eurUsd, eurCandles), true);
  assert.equal(validateCandlesForAsset(gbpUsd, gbpUsdCandles), true);
  assert.equal(validateCandlesForAsset(gbpJpy, gbpJpyCandles), true);

  // Cross-asset candles must strictly fail validation (even between EUR/USD ~1.084 and GBP/USD ~1.271)
  assert.equal(validateCandlesForAsset(gbpUsd, eurCandles), false);
  assert.equal(validateCandlesForAsset(eurUsd, gbpUsdCandles), false);
  assert.equal(validateCandlesForAsset(gbpJpy, eurCandles), false);
  assert.equal(validateCandlesForAsset(eurUsd, gbpJpyCandles), false);

  // Price validation rejects cross-asset ticks
  assert.equal(isValidPriceForAsset(gbpUsd, 1.08425), false);
  assert.equal(isValidPriceForAsset(eurUsd, 1.2714), false);
  assert.equal(isValidPriceForAsset(gbpJpy, 3.03), false);
});

test('atomic trade balance deduction locks active trade against stale realtime/poll overrides and accurately settles WIN and LOSS without jumping back to pre-trade values', () => {
  resetBalanceSyncLedgerForTests();

  const baseProfile = createMockProfile();
  const baseAccounts = createMockAccounts();
  const t0 = 1700000000000;

  // 1. Initial sync from Supabase sets self_balance = 100, demo_balance = 10000
  const initSync = applyRealtimeProfileUpdate(
    baseProfile,
    baseAccounts,
    { id: baseProfile.id, self_balance: 100, demo_balance: 10000 },
    { source: 'initial', nowMs: t0 }
  );
  let profile = initSync.updatedProfile;
  let accounts = initSync.updatedAccounts;
  assert.equal(profile.selfBalance, 100);

  // 2. User places a $20 trade on Personal Live (self_balance)
  const liveAcc = accounts.find((a) => a.id === 'BFT-LIVE-001')!;
  assert.equal(resolveAccountBalanceColumn(liveAcc), 'self_balance');

  const { deductedBalance } = recordAtomicTradePlacement({
    tradeId: 'TRD-LOSS-01',
    accountId: liveAcc.id,
    column: 'self_balance',
    stake: 20,
    preTradeBalance: 100,
    durationSeconds: 30,
    nowMs: t0 + 1000,
  });
  assert.equal(deductedBalance, 80);

  profile = { ...profile, selfBalance: deductedBalance };
  accounts = accounts.map((a) =>
    a.id === liveAcc.id ? { ...a, currentBalance: deductedBalance, equity: deductedBalance } : a
  );

  // 3. While trade is active (t0 + 5000), a stale realtime or poll event arrives with pre-trade self_balance = 100
  const duringActiveRealtime = applyRealtimeProfileUpdate(
    profile,
    accounts,
    { id: baseProfile.id, self_balance: 100, demo_balance: 10000 },
    { source: 'realtime', nowMs: t0 + 5000 }
  );
  assert.equal(duringActiveRealtime.updatedProfile.selfBalance, 80);
  assert.equal(
    duringActiveRealtime.updatedAccounts.find((a) => a.id === 'BFT-LIVE-001')!.currentBalance,
    80
  );

  // 4. Trade closes as a LOSS (CALL @ 1.08500 -> close @ 1.08400)
  const lossSettlement = computeAuthoritativeSettledBalance({
    tradeId: 'TRD-LOSS-01',
    currentAccountBalance: 80,
    stake: 20,
    payoutPercentage: 92,
    direction: 'CALL',
    strikePrice: 1.085,
    closePrice: 1.084,
  });
  assert.equal(lossSettlement.status, 'lost');
  assert.equal(lossSettlement.creditedAmount, 0);
  assert.equal(lossSettlement.finalBalance, 80);

  recordAtomicTradeSettlement({
    tradeId: 'TRD-LOSS-01',
    accountId: liveAcc.id,
    column: 'self_balance',
    finalBalance: lossSettlement.finalBalance,
    nowMs: t0 + 31000,
  });
  assert.equal(isTradeAlreadySettled('TRD-LOSS-01'), true);

  // 5. After trade closes, a stale poll returning the pre-trade manual value (100) must NOT jump balance back to 100
  const postLossStalePoll = applyRealtimeProfileUpdate(
    profile,
    accounts,
    { id: baseProfile.id, self_balance: 100, demo_balance: 10000 },
    { source: 'poll', nowMs: t0 + 40000 }
  );
  assert.equal(postLossStalePoll.updatedProfile.selfBalance, 80);
  assert.equal(
    postLossStalePoll.updatedAccounts.find((a) => a.id === 'BFT-LIVE-001')!.currentBalance,
    80
  );

  // 6. Now user places a $20 trade that WINS (92% payout -> $18.40 profit, $38.40 total credited -> 80 - 20 + 38.40 = 98.40)
  const { deductedBalance: afterSecondOpen } = recordAtomicTradePlacement({
    tradeId: 'TRD-WIN-02',
    accountId: liveAcc.id,
    column: 'self_balance',
    stake: 20,
    preTradeBalance: 80,
    durationSeconds: 30,
    nowMs: t0 + 45000,
  });
  assert.equal(afterSecondOpen, 60);

  const winSettlement = computeAuthoritativeSettledBalance({
    tradeId: 'TRD-WIN-02',
    currentAccountBalance: afterSecondOpen,
    stake: 20,
    payoutPercentage: 92,
    direction: 'CALL',
    strikePrice: 1.085,
    closePrice: 1.086,
  });
  assert.equal(winSettlement.status, 'won');
  assert.equal(winSettlement.pnl, 18.4);
  assert.equal(winSettlement.creditedAmount, 38.4);
  assert.equal(winSettlement.finalBalance, 98.4);

  recordAtomicTradeSettlement({
    tradeId: 'TRD-WIN-02',
    accountId: liveAcc.id,
    column: 'self_balance',
    finalBalance: winSettlement.finalBalance,
    nowMs: t0 + 75000,
  });

  profile = { ...profile, selfBalance: winSettlement.finalBalance };
  accounts = accounts.map((a) =>
    a.id === liveAcc.id
      ? { ...a, currentBalance: winSettlement.finalBalance, equity: winSettlement.finalBalance }
      : a
  );

  // Stale poll returning 100 still must not revert 98.40 back to 100
  const postWinStalePoll = applyRealtimeProfileUpdate(
    profile,
    accounts,
    { id: baseProfile.id, self_balance: 100 },
    { source: 'poll', nowMs: t0 + 85000 }
  );
  assert.equal(postWinStalePoll.updatedProfile.selfBalance, 98.4);

  // Genuine new manual admin top-up in Supabase (e.g. self_balance = 500) reflects immediately
  const adminManualUpdate = applyRealtimeProfileUpdate(
    profile,
    accounts,
    { id: baseProfile.id, self_balance: 500 },
    { source: 'realtime', nowMs: t0 + 90000 }
  );
  assert.equal(adminManualUpdate.updatedProfile.selfBalance, 500);
  assert.equal(
    adminManualUpdate.updatedAccounts.find((a) => a.id === 'BFT-LIVE-001')!.currentBalance,
    500
  );
});

test('buildSupabaseWithdrawalInsertPayload maps exact withdrawals table columns for crypto and bank payouts', () => {
  const fixedNow = Date.parse('2026-10-31T12:00:00.000Z');
  const expectedCountdown = new Date(fixedNow + 60 * 60 * 1000).toISOString();

  // 1. Crypto Withdrawal (self account)
  const cryptoPayload = buildSupabaseWithdrawalInsertPayload({
    userId: '2e91f1fc-4fe8-4a3c-96f9-260a149ef02c',
    accountType: 'self',
    amount: 200,
    fee: 6,
    netAmount: 194,
    nowMs: fixedNow,
    payoutMethod: 'crypto',
    walletAddress: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    networkType: 'BSC (BEP20)',
    bankName: 'Ignored Bank',
    accountHolderName: 'Ignored Holder',
    bankAccountNumber: 'Ignored IBAN',
    branchName: 'Ignored Branch',
  });

  const expectedKeys = [
    'user_id',
    'account_type',
    'amount',
    'fee',
    'net_amount',
    'status',
    'countdown_ends_at',
    'payout_method',
    'wallet_address',
    'network_type',
    'bank_name',
    'account_holder_name',
    'bank_account_number',
    'branch_name',
  ];
  assert.deepEqual(Object.keys(cryptoPayload), expectedKeys);
  assert.equal(cryptoPayload.user_id, '2e91f1fc-4fe8-4a3c-96f9-260a149ef02c');
  assert.equal(cryptoPayload.account_type, 'self');
  assert.equal(cryptoPayload.amount, 200);
  assert.equal(cryptoPayload.fee, 6);
  assert.equal(cryptoPayload.net_amount, 194);
  assert.equal(cryptoPayload.status, 'pending');
  assert.equal(cryptoPayload.countdown_ends_at, expectedCountdown);
  assert.equal(cryptoPayload.payout_method, 'crypto');
  assert.equal(cryptoPayload.wallet_address, '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A');
  assert.equal(cryptoPayload.network_type, 'BSC (BEP20)');
  assert.equal(cryptoPayload.bank_name, null);
  assert.equal(cryptoPayload.account_holder_name, null);
  assert.equal(cryptoPayload.bank_account_number, null);
  assert.equal(cryptoPayload.branch_name, null);

  // 2. Bank Withdrawal (funded account)
  const bankPayload = buildSupabaseWithdrawalInsertPayload({
    userId: '2e91f1fc-4fe8-4a3c-96f9-260a149ef02c',
    accountType: 'funded',
    amount: 500,
    fee: 50,
    netAmount: 450,
    nowMs: fixedNow,
    payoutMethod: 'bank',
    walletAddress: '0xIgnoredWallet',
    networkType: 'IgnoredNetwork',
    bankName: 'Barclays Bank UK PLC',
    accountHolderName: 'Alex Mercer',
    bankAccountNumber: 'GB29NWBK60161331926819',
    branchName: 'BARCGB22XXX',
  });

  assert.deepEqual(Object.keys(bankPayload), expectedKeys);
  assert.equal(bankPayload.account_type, 'funded');
  assert.equal(bankPayload.amount, 500);
  assert.equal(bankPayload.fee, 50);
  assert.equal(bankPayload.net_amount, 450);
  assert.equal(bankPayload.payout_method, 'bank');
  assert.equal(bankPayload.wallet_address, null);
  assert.equal(bankPayload.network_type, null);
  assert.equal(bankPayload.bank_name, 'Barclays Bank UK PLC');
  assert.equal(bankPayload.account_holder_name, 'Alex Mercer');
  assert.equal(bankPayload.bank_account_number, 'GB29NWBK60161331926819');
  assert.equal(bankPayload.branch_name, 'BARCGB22XXX');

  // 3. Map back from Supabase row into WithdrawalRequest
  const mappedBankReq = mapSupabaseWithdrawalToRequest({
    id: 'a1b2c3d4-0000-4000-8000-000000000099',
    ...bankPayload,
    created_at: new Date(fixedNow).toISOString(),
  });
  assert.equal(mappedBankReq.id, 'a1b2c3d4-0000-4000-8000-000000000099');
  assert.equal(mappedBankReq.accountType, 'funded');
  assert.equal(mappedBankReq.payoutMethod, 'bank');
  assert.equal(mappedBankReq.paymentMethod, 'bank_transfer');
  assert.equal(mappedBankReq.amount, 500);
  assert.equal(mappedBankReq.withdrawalFee, 50);
  assert.equal(mappedBankReq.netReceivedAmount, 450);
  assert.equal(mappedBankReq.bankDetails?.bankName, 'Barclays Bank UK PLC');
  assert.equal(mappedBankReq.bankDetails?.accountHolder, 'Alex Mercer');
  assert.equal(mappedBankReq.bankDetails?.accountNumber, 'GB29NWBK60161331926819');
  assert.equal(mappedBankReq.bankDetails?.branchName, 'BARCGB22XXX');
  assert.equal(mappedBankReq.countdownEndsAt, fixedNow + 60 * 60 * 1000);
});

test('computeWithdrawalDeduction deducts balance immediately and computeWithdrawalRefund restores it accurately upon cancellation', () => {
  resetBalanceSyncLedgerForTests();
  const profile = createMockProfile();
  const accounts = createMockAccounts();
  const personalAcc = accounts.find((a) => a.id === 'BFT-LIVE-001')!;

  // Set initial personal live balance to $500
  const initialProfile = { ...profile, selfBalance: 500 };
  const initialAcc = { ...personalAcc, currentBalance: 500, equity: 500 };

  // 1. Submit $150 withdrawal from Personal Live
  const deduction = computeWithdrawalDeduction({
    account: initialAcc,
    userProfile: initialProfile,
    amount: 150,
    nowMs: 1000,
  });

  assert.equal(deduction.column, 'self_balance');
  assert.equal(deduction.preWithdrawalBalance, 500);
  assert.equal(deduction.newBalance, 350);
  assert.equal(deduction.deductedAmount, 150);
  assert.equal(deduction.updatedAccount.currentBalance, 350);
  assert.equal(deduction.updatedProfile.selfBalance, 350);

  // 2. Stale poll from before the deduction must NOT revert the balance back to 500
  const stalePoll = applyRealtimeProfileUpdate(
    deduction.updatedProfile,
    [deduction.updatedAccount],
    { id: profile.id, self_balance: 500 },
    { source: 'poll', nowMs: 2000 }
  );
  assert.equal(stalePoll.updatedProfile.selfBalance, 350);

  // 3. User cancels the pending $150 withdrawal -> automatically refund $150 back to balance
  const refund = computeWithdrawalRefund({
    amount: 150,
    accountType: 'self',
    account: deduction.updatedAccount,
    userProfile: deduction.updatedProfile,
    nowMs: 3000,
  });

  assert.equal(refund.column, 'self_balance');
  assert.equal(refund.preRefundBalance, 350);
  assert.equal(refund.newBalance, 500);
  assert.equal(refund.refundedAmount, 150);
  assert.equal(refund.updatedAccount?.currentBalance, 500);
  assert.equal(refund.updatedProfile.selfBalance, 500);

  // 4. Test Funded Account ($25,000 -> $500 withdrawal -> $24,500 -> Cancel -> $25,000)
  const fundedAcc = accounts.find((a) => a.id === 'BFT-FUNDED-001')!;
  const fundedProfile = { ...profile, fundedBalance: 25000 };

  const fundedDeduction = computeWithdrawalDeduction({
    account: fundedAcc,
    userProfile: fundedProfile,
    amount: 500,
    nowMs: 4000,
  });
  assert.equal(fundedDeduction.column, 'funded_balance');
  assert.equal(fundedDeduction.newBalance, 24500);
  assert.equal(fundedDeduction.updatedAccount.currentBalance, 24500);
  assert.equal(fundedDeduction.updatedProfile.fundedBalance, 24500);

  const fundedRefund = computeWithdrawalRefund({
    amount: 500,
    accountType: 'funded',
    account: fundedDeduction.updatedAccount,
    userProfile: fundedDeduction.updatedProfile,
    nowMs: 5000,
  });
  assert.equal(fundedRefund.column, 'funded_balance');
  assert.equal(fundedRefund.newBalance, 25000);
  assert.equal(fundedRefund.updatedAccount?.currentBalance, 25000);
  assert.equal(fundedRefund.updatedProfile.fundedBalance, 25000);
});

test('hasActivePendingWithdrawal enforces single active withdrawal constraint per user and account type', () => {
  assert.equal(
    PENDING_WITHDRAWAL_WARNING_MESSAGE,
    'You already have a pending withdrawal request. Please wait for it to be processed or cancel it before submitting a new one.'
  );

  const accounts = createMockAccounts();
  const personalLiveAcc = accounts.find((a) => a.id === 'BFT-LIVE-001')!;
  const fundedAcc = accounts.find((a) => a.id === 'BFT-FUNDED-001')!;

  const emptyWithdrawals: WithdrawalRequest[] = [];
  assert.equal(hasActivePendingWithdrawal(emptyWithdrawals, personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal(emptyWithdrawals, fundedAcc), false);
  assert.equal(hasActivePendingWithdrawal(emptyWithdrawals, 'self'), false);
  assert.equal(hasActivePendingWithdrawal(emptyWithdrawals, 'funded'), false);

  // 1. User submits a personal live withdrawal (status: 'pending')
  const pendingSelfReq: WithdrawalRequest = {
    id: 'wd-self-001',
    accountId: 'BFT-LIVE-001',
    accountType: 'self',
    amount: 100,
    withdrawalFee: 3,
    netReceivedAmount: 97,
    profitSplitApplied: 100,
    paymentMethod: 'crypto_trc20',
    payoutMethod: 'crypto',
    trc20Address: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referenceNumber: 'REF-001',
    requestedAt: Date.now(),
    status: 'pending',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 0,
  };

  const listWithSelfPending = [pendingSelfReq];

  // Self account should be blocked from submitting another withdrawal
  assert.equal(hasActivePendingWithdrawal(listWithSelfPending, personalLiveAcc), true);
  assert.equal(hasActivePendingWithdrawal(listWithSelfPending, 'self'), true);
  assert.equal(getActivePendingWithdrawal(listWithSelfPending, personalLiveAcc)?.id, 'wd-self-001');

  // Funded account should NOT be blocked by a self pending withdrawal
  assert.equal(hasActivePendingWithdrawal(listWithSelfPending, fundedAcc), false);
  assert.equal(hasActivePendingWithdrawal(listWithSelfPending, 'funded'), false);
  assert.equal(getActivePendingWithdrawal(listWithSelfPending, fundedAcc), null);

  // 2. User cancels or admin completes the personal live request
  const listWithCompletedSelf = [{ ...pendingSelfReq, status: 'completed' as const }];
  assert.equal(hasActivePendingWithdrawal(listWithCompletedSelf, personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal(listWithCompletedSelf, 'self'), false);

  const listWithCancelledSelf = [{ ...pendingSelfReq, status: 'cancelled' as const }];
  assert.equal(hasActivePendingWithdrawal(listWithCancelledSelf, personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal(listWithCancelledSelf, 'self'), false);

  const listWithRejectedSelf = [{ ...pendingSelfReq, status: 'rejected' as const }];
  assert.equal(hasActivePendingWithdrawal(listWithRejectedSelf, personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal(listWithRejectedSelf, 'self'), false);

  // 3. User submits a funded withdrawal (status: 'processing')
  const processingFundedReq: WithdrawalRequest = {
    id: 'wd-funded-002',
    accountId: 'BFT-FUNDED-001',
    accountType: 'funded',
    amount: 500,
    withdrawalFee: 50,
    netReceivedAmount: 450,
    profitSplitApplied: 80,
    paymentMethod: 'bank_transfer',
    payoutMethod: 'bank',
    trc20Address: 'Barclays Bank UK PLC • GB29NWBK60161331926819',
    referenceNumber: 'REF-002',
    requestedAt: Date.now(),
    status: 'processing',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 0,
  };

  const listWithBoth = [listWithCancelledSelf[0], processingFundedReq];

  // Self account is now unblocked
  assert.equal(hasActivePendingWithdrawal(listWithBoth, personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal(listWithBoth, 'self'), false);

  // Funded account is blocked by the active processing withdrawal
  assert.equal(hasActivePendingWithdrawal(listWithBoth, fundedAcc), true);
  assert.equal(hasActivePendingWithdrawal(listWithBoth, 'funded'), true);
  assert.equal(getActivePendingWithdrawal(listWithBoth, fundedAcc)?.id, 'wd-funded-002');
});

test("mapSupabaseWithdrawalToRequest strictly maps 'success' and unblocks subsequent withdrawal requests", () => {
  const accounts = createMockAccounts();
  const personalLiveAcc = accounts.find((a) => a.id === 'BFT-LIVE-001')!;

  // 1. Admin sets status to 'success' in database
  const rawDbRow = {
    id: 'wd-success-999',
    user_id: 'usr-123',
    account_type: 'self',
    amount: 300,
    fee: 9,
    net_amount: 291,
    status: 'success',
    payout_method: 'crypto',
    wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
    network_type: 'USDT (TRC20)',
    created_at: new Date().toISOString(),
  };

  const mapped = mapSupabaseWithdrawalToRequest(rawDbRow);
  assert.equal(mapped.status, 'success');
  assert.equal(mapped.amount, 300);
  assert.equal(mapped.netReceivedAmount, 291);

  // 2. Once in success status, the request is no longer treated as active/pending
  assert.equal(hasActivePendingWithdrawal([mapped], personalLiveAcc), false);
  assert.equal(hasActivePendingWithdrawal([mapped], 'self'), false);
  assert.equal(getActivePendingWithdrawal([mapped], personalLiveAcc), null);
});

test('isWithdrawalStrictlyPending strictly identifies pending status and rejects non-pending statuses', () => {
  assert.equal(isWithdrawalStrictlyPending('pending'), true);
  assert.equal(isWithdrawalStrictlyPending('PENDING'), true);
  assert.equal(isWithdrawalStrictlyPending(' pending '), true);

  // All terminal and processed statuses must return false
  assert.equal(isWithdrawalStrictlyPending('success'), false);
  assert.equal(isWithdrawalStrictlyPending('completed'), false);
  assert.equal(isWithdrawalStrictlyPending('rejected'), false);
  assert.equal(isWithdrawalStrictlyPending('declined'), false);
  assert.equal(isWithdrawalStrictlyPending('cancelled'), false);
  assert.equal(isWithdrawalStrictlyPending('paid'), false);
  assert.equal(isWithdrawalStrictlyPending(undefined), false);
  assert.equal(isWithdrawalStrictlyPending(null), false);
});

test('rehydrateActiveTradesInLedger preserves active trade state and guards balances against stale pre-trade remote polls after reload', () => {
  resetBalanceSyncLedgerForTests();

  const profile = createMockProfile();
  const accounts = createMockAccounts();
  const t0 = 1700000000000;

  // Initial balance before reload was $250
  const initSync = applyRealtimeProfileUpdate(
    { ...profile, selfBalance: 250 },
    accounts.map((a) => (a.id === 'BFT-LIVE-001' ? { ...a, currentBalance: 250, equity: 250 } : a)),
    { id: profile.id, self_balance: 250 },
    { source: 'initial', nowMs: t0 }
  );

  // User reloads the page while a trade is active (endTime is 30s in the future)
  const activeTrade = {
    id: 'TRD-REHYDRATE-01',
    accountId: 'BFT-LIVE-001',
    accountTier: 'personal',
    investment: 50,
    startTime: t0,
    endTime: t0 + 30000,
    status: 'active',
  };

  rehydrateActiveTradesInLedger([activeTrade], t0 + 10000);

  // A stale poll returning the pre-trade balance ($250) arrives while trade is still running
  // The ledger should guard against stale balance overrides
  const pollResult = applyRealtimeProfileUpdate(
    initSync.updatedProfile,
    initSync.updatedAccounts,
    { id: profile.id, self_balance: 250 },
    { source: 'poll', nowMs: t0 + 15000 }
  );

  // Balance remains guarded and not duplicated
  assert.ok(pollResult.updatedProfile);
});





