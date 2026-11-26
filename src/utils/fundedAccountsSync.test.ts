import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFundedAccountInsertPayload,
  mapFundedAccountRowToTradingAccount,
  executeAtomicFundedAccountPurchaseWithAdapter,
  applyFundedAccountRealtimeEvent,
  type FundedAccountRow,
} from './fundedAccountsSync.ts';
import { mergeSupabaseFundedAccounts } from './supabaseRealtimeSync.ts';
import {
  PACKAGES,
  executeSelfCapitalChallengePurchase,
  getAccountBadgeDisplayText,
} from './propRules.ts';

const TEST_USER_UUID = '5e0fb76f-1111-4222-8333-444455556666';
const TEST_FUNDED_ROW_UUID = '9a9a9a9a-2222-4333-8444-555566667777';

test('buildFundedAccountInsertPayload produces exact public.funded_accounts columns with discounted paid_amount', () => {
  const pkg5k = PACKAGES.find((p) => p.size === 5000)!;
  const purchaseCalc = executeSelfCapitalChallengePurchase({
    pkg: pkg5k,
    selfCapitalBalance: 250,
    promoCode: 'BFT40',
    ownerId: TEST_USER_UUID,
    ownerEmail: 'trader@bft.test',
  });
  assert.equal(purchaseCalc.ok, true);
  if (!purchaseCalc.ok) return;

  // 40% off $49 rounded by existing pricing calculator = $29
  assert.equal(purchaseCalc.deductedAmount, 29);
  assert.equal(purchaseCalc.remainingSelfCapital, 221);

  const payload = buildFundedAccountInsertPayload({
    userId: TEST_USER_UUID,
    accountSize: pkg5k.size,
    paidAmount: purchaseCalc.deductedAmount,
  });

  assert.deepEqual(payload, {
    user_id: TEST_USER_UUID,
    account_size: 5000,
    paid_amount: 29,
    current_balance: 5000,
    status: 'Challenge',
  });
});

test('mapFundedAccountRowToTradingAccount maps Challenge, Passed, Real Funded, and Breached rows with strict badge & Single Challenge rules', () => {
  const challengeAcc = mapFundedAccountRowToTradingAccount(
    {
      id: TEST_FUNDED_ROW_UUID,
      user_id: TEST_USER_UUID,
      account_size: 10000,
      paid_amount: 53.4,
      current_balance: 10450,
      status: 'Challenge',
      created_at: '2026-11-25T10:00:00.000Z',
    },
    'trader@bft.test'
  );

  assert.equal(challengeAcc.id, TEST_FUNDED_ROW_UUID);
  assert.equal(challengeAcc.fundedAccountId, TEST_FUNDED_ROW_UUID);
  assert.equal(challengeAcc.initialBalance, 10000);
  assert.equal(challengeAcc.currentBalance, 10450);
  assert.equal(challengeAcc.paidAmount, 53.4);
  assert.equal(challengeAcc.dailyLossLimitPercent, 0);
  assert.equal(challengeAcc.maxOverallLossPercent, 10);
  assert.equal(challengeAcc.profitTargetPercent, 30);
  assert.equal(challengeAcc.maxRiskPerTradePercent, 5);
  assert.equal(challengeAcc.status, 'active');
  assert.equal(getAccountBadgeDisplayText(challengeAcc), 'Challenge');

  const passedAcc = mapFundedAccountRowToTradingAccount({
    id: '22222222-2222-4222-8222-222222222222',
    user_id: TEST_USER_UUID,
    account_size: 10000,
    paid_amount: 89,
    current_balance: 11550,
    status: 'Passed',
  });
  assert.equal(passedAcc.status, 'passed');
  assert.equal(getAccountBadgeDisplayText(passedAcc), 'PASSED');

  const realFundedAcc = mapFundedAccountRowToTradingAccount({
    id: '33333333-3333-4333-8333-333333333333',
    user_id: TEST_USER_UUID,
    account_size: 25000,
    paid_amount: 189,
    current_balance: 26200,
    status: 'Real Funded',
  });
  assert.equal(realFundedAcc.isRealFunded, true);
  assert.equal(realFundedAcc.phase, 'funded');
  assert.equal(getAccountBadgeDisplayText(realFundedAcc), 'REAL FUNDED');

  const breachedAcc = mapFundedAccountRowToTradingAccount({
    id: '44444444-4444-4444-8444-444444444444',
    user_id: TEST_USER_UUID,
    account_size: 5000,
    paid_amount: 49,
    current_balance: 3900,
    status: 'Breached',
  });
  assert.equal(breachedAcc.status, 'hard_breached');
  assert.equal(breachedAcc.breachType, 'hard');
});

test('executeAtomicFundedAccountPurchaseWithAdapter deducts Self Capital then inserts public.funded_accounts row', async () => {
  const ops: string[] = [];
  let recordedPayload: any = null;

  const result = await executeAtomicFundedAccountPurchaseWithAdapter(
    {
      userId: TEST_USER_UUID,
      userEmail: 'trader@bft.test',
      accountSize: 5000,
      paidAmount: 29.4,
      previousSelfCapital: 250,
      remainingSelfCapital: 220.6,
    },
    {
      updateSelfCapitalBalance: async (newBal) => {
        ops.push(`update_balance:${newBal}`);
        return { ok: true };
      },
      insertFundedAccount: async (payload) => {
        ops.push(`insert_funded:${payload.account_size}:${payload.paid_amount}:${payload.status}`);
        recordedPayload = payload;
        const row: FundedAccountRow = {
          id: TEST_FUNDED_ROW_UUID,
          ...payload,
          created_at: '2026-11-25T10:05:00.000Z',
        };
        return { ok: true, row };
      },
    }
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(ops, ['update_balance:220.6', 'insert_funded:5000:29.4:Challenge']);
  assert.equal(recordedPayload.current_balance, 5000);
  assert.equal(result.account.id, TEST_FUNDED_ROW_UUID);
  assert.equal(getAccountBadgeDisplayText(result.account), 'Challenge');
});

test('executeAtomicFundedAccountPurchaseWithAdapter aborts before funded_accounts insert if Self Capital update fails', async () => {
  let insertCalled = false;

  const result = await executeAtomicFundedAccountPurchaseWithAdapter(
    {
      userId: TEST_USER_UUID,
      accountSize: 5000,
      paidAmount: 49,
      previousSelfCapital: 250,
      remainingSelfCapital: 201,
    },
    {
      updateSelfCapitalBalance: async () => ({
        ok: false,
        error: 'RLS policy blocked profiles update',
      }),
      insertFundedAccount: async () => {
        insertCalled = true;
        return { ok: true };
      },
    }
  );

  assert.equal(insertCalled, false);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'balance_deduction');
  assert.match(result.error, /RLS policy blocked profiles update/i);
});

test('executeAtomicFundedAccountPurchaseWithAdapter rolls back Self Capital balance if funded_accounts insert fails', async () => {
  const balanceWrites: number[] = [];

  const result = await executeAtomicFundedAccountPurchaseWithAdapter(
    {
      userId: TEST_USER_UUID,
      accountSize: 5000,
      paidAmount: 49,
      previousSelfCapital: 250,
      remainingSelfCapital: 201,
    },
    {
      updateSelfCapitalBalance: async (newBal) => {
        balanceWrites.push(newBal);
        return { ok: true };
      },
      insertFundedAccount: async () => ({
        ok: false,
        error: 'new row violates row-level security policy for table "funded_accounts"',
      }),
    }
  );

  assert.deepEqual(balanceWrites, [201, 250]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.stage, 'funded_account_insert');
  assert.equal(result.rolledBack, true);
  assert.match(result.error, /automatically restored/i);
});

test('applyFundedAccountRealtimeEvent handles INSERT, UPDATE, and DELETE without duplicates', () => {
  const initialAcc = mapFundedAccountRowToTradingAccount({
    id: TEST_FUNDED_ROW_UUID,
    user_id: TEST_USER_UUID,
    account_size: 5000,
    paid_amount: 49,
    current_balance: 5000,
    status: 'Challenge',
  });

  // Insert once
  let list = applyFundedAccountRealtimeEvent([], 'INSERT', initialAcc);
  assert.equal(list.length, 1);

  // Duplicate INSERT with same ID must not create duplicate
  list = applyFundedAccountRealtimeEvent(list, 'INSERT', initialAcc);
  assert.equal(list.length, 1);

  // Realtime UPDATE with new balance and Passed status updates immediately
  const updatedAcc = mapFundedAccountRowToTradingAccount({
    id: TEST_FUNDED_ROW_UUID,
    user_id: TEST_USER_UUID,
    account_size: 5000,
    paid_amount: 49,
    current_balance: 5820,
    status: 'Passed',
  });
  list = applyFundedAccountRealtimeEvent(list, 'UPDATE', updatedAcc);
  assert.equal(list.length, 1);
  assert.equal(list[0].currentBalance, 5820);
  assert.equal(list[0].status, 'passed');
  assert.equal(getAccountBadgeDisplayText(list[0]), 'PASSED');

  // Realtime DELETE removes account
  list = applyFundedAccountRealtimeEvent(list, 'DELETE', updatedAcc);
  assert.equal(list.length, 0);
});

test('mergeSupabaseFundedAccounts prioritizes public.funded_accounts and deduplicates matching legacy rows', () => {
  const createdIso = '2026-11-25T10:15:00.000Z';
  const merged = mergeSupabaseFundedAccounts({
    fundedAccountRows: [
      {
        id: TEST_FUNDED_ROW_UUID,
        user_id: TEST_USER_UUID,
        account_size: 5000,
        paid_amount: 29.4,
        current_balance: 5180,
        status: 'Challenge',
        created_at: createdIso,
      },
    ],
    fundedWalletRows: [
      {
        id: 'legacy-wallet-uuid',
        account_id: 'BFT-CH-LEGACY1',
        user_id: TEST_USER_UUID,
        challenge_type: 'funded_challenge',
        account_status: 'ACTIVE',
        initial_balance: 5000,
        current_balance: 5000,
        created_at: '2026-11-25T10:15:05.000Z',
      },
    ],
    tradingAccountRows: [
      {
        id: 'legacy-trading-uuid',
        user_id: TEST_USER_UUID,
        account_type: 'funded_challenge',
        starting_balance: 5000,
        current_balance: 5000,
        equity: 5000,
        status: 'active',
        challenge_phase: 'phase_1',
        created_at: '2026-11-25T10:15:04.000Z',
      },
    ],
    ownerEmail: 'trader@bft.test',
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, TEST_FUNDED_ROW_UUID);
  assert.equal(merged[0].currentBalance, 5180);
  assert.equal(getAccountBadgeDisplayText(merged[0]), 'Challenge');
});
