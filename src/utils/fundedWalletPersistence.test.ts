import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialFundedWalletFromAccount,
  buildSupabaseWalletPayload,
  mapPurchasedFundedWalletToTradingAccount,
  persistWalletWithAdapter,
  type PurchasedFundedWallet,
} from './fundedWalletAnalytics';
import {
  insertTradingAccountWithAdapter,
  mapSupabaseTradingAccountRow,
  mergeSupabaseFundedAccounts,
} from './supabaseRealtimeSync';
import {
  PACKAGES,
  executeSelfCapitalChallengePurchase,
  getAccountBadgeDisplayText,
} from './propRules';

const TEST_UUID = '5e0fb76f-1234-4a5b-8c9d-0123456789ab';

function createPurchasedChallengeAccount() {
  const pkg = PACKAGES[0]; // $5,000 Funded Challenge
  const outcome = executeSelfCapitalChallengePurchase({
    pkg,
    selfCapitalBalance: 250,
    promoCode: 'NONE',
    ownerId: TEST_UUID,
    ownerEmail: 'trader@binaryfundedtrader.com',
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) throw new Error('Expected purchase to succeed');
  return outcome.account;
}

test('buildSupabaseWalletPayload omits null certificate_id so live schema inserts succeed on first try', () => {
  const account = createPurchasedChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(account, TEST_UUID);
  const payload = buildSupabaseWalletPayload(wallet);

  assert.equal(payload.user_id, TEST_UUID);
  assert.equal(payload.account_id, account.id);
  assert.equal(payload.account_tier, 'CHALLENGE');
  assert.equal(payload.badge_color, 'red');
  assert.equal(payload.account_status, 'ACTIVE');
  assert.equal('certificate_id' in payload, false);
  assert.equal('min_profitable_days' in payload, false);
  assert.ok(payload.created_at);
});

test('persistWalletWithAdapter adapts across 9 missing schema columns without hitting the old 6-attempt cap', async () => {
  const account = createPurchasedChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(account, TEST_UUID);
  const missingOnLegacyDb = new Set([
    'account_tier',
    'badge_color',
    'is_real_funded',
    'principal_locked',
    'profit_split_percent',
    'certificate_unlocked',
    'passed_at',
    'created_at',
    'soft_breach_until',
  ]);
  const unsupportedSet = new Set<string>();
  let insertAttempts = 0;
  const savedPayloads: Record<string, any>[] = [];

  const result = await persistWalletWithAdapter(
    wallet,
    {
      selectExisting: async () => ({ data: [], error: null }),
      updateRow: async () => ({ data: null, error: null }),
      insertRow: async (payload) => {
        insertAttempts += 1;
        for (const col of missingOnLegacyDb) {
          if (col in payload) {
            return {
              data: null,
              error: {
                code: 'PGRST204',
                message: `Could not find the '${col}' column of 'purchased_funded_wallets' in the schema cache`,
              },
            };
          }
        }
        savedPayloads.push({ ...payload });
        return { data: { id: 'db-row-uuid-1', ...payload }, error: null };
      },
      insertRowPlain: async () => ({ error: null }),
    },
    { unsupportedColumnsSet: unsupportedSet, skipLocalSave: true }
  );

  assert.equal(result.ok, true);
  assert.equal(result.syncedToSupabase, true);
  assert.equal(insertAttempts, missingOnLegacyDb.size + 1);
  const savedPayload = savedPayloads[0];
  assert.ok(savedPayload);
  assert.equal(savedPayload.account_id, account.id);
  assert.equal(savedPayload.user_id, TEST_UUID);
  for (const col of missingOnLegacyDb) {
    assert.equal(col in savedPayload, false);
  }
});

test('persistWalletWithAdapter surfaces RLS errors instead of failing silently', async () => {
  const account = createPurchasedChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(account, TEST_UUID);

  const rlsError = {
    code: '42501',
    message: 'new row violates row-level security policy for table "purchased_funded_wallets"',
  };

  const result = await persistWalletWithAdapter(
    wallet,
    {
      selectExisting: async () => ({ data: [], error: null }),
      updateRow: async () => ({ data: null, error: rlsError }),
      insertRow: async () => ({ data: null, error: rlsError }),
      insertRowPlain: async () => ({ error: rlsError }),
    },
    { unsupportedColumnsSet: new Set<string>(), skipLocalSave: true }
  );

  assert.equal(result.ok, false);
  assert.equal(result.syncedToSupabase, false);
  assert.equal(result.errorCode, '42501');
  assert.match(String(result.error), /row-level security/i);
});

test('persistWalletWithAdapter rejects non-UUID fallback IDs with a clear error instead of silent no-op', async () => {
  const account = createPurchasedChallengeAccount();
  const wallet: PurchasedFundedWallet = {
    ...buildInitialFundedWalletFromAccount(account, 'usr_bft_001'),
    user_id: 'usr_bft_001',
  };

  const result = await persistWalletWithAdapter(
    wallet,
    {
      selectExisting: async () => ({ data: [], error: null }),
      updateRow: async () => ({ data: null, error: null }),
      insertRow: async () => ({ data: null, error: null }),
      insertRowPlain: async () => ({ error: null }),
    },
    { skipLocalSave: true }
  );

  assert.equal(result.ok, false);
  assert.equal(result.syncedToSupabase, false);
  assert.equal(result.errorCode, 'UNAUTHENTICATED_USER_ID');
});

test('persistWalletWithAdapter recovers from duplicate key 23505 by updating existing row', async () => {
  const account = createPurchasedChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(account, TEST_UUID);
  let updateCalled = false;

  const result = await persistWalletWithAdapter(
    wallet,
    {
      selectExisting: async () => ({ data: [], error: null }),
      insertRow: async () => ({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }),
      insertRowPlain: async () => ({ error: null }),
      updateRow: async (_accountId, payload) => {
        updateCalled = true;
        return { data: { id: 'existing-uuid', account_id: wallet.account_id, user_id: TEST_UUID, ...payload }, error: null };
      },
    },
    { unsupportedColumnsSet: new Set<string>(), skipLocalSave: true }
  );

  assert.equal(updateCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.syncedToSupabase, true);
});

test('mapPurchasedFundedWalletToTradingAccount reconstructs Challenge account with exact badge and rules', () => {
  const account = createPurchasedChallengeAccount();
  const wallet = buildInitialFundedWalletFromAccount(account, TEST_UUID);
  const mapped = mapPurchasedFundedWalletToTradingAccount(wallet, 'trader@binaryfundedtrader.com');

  assert.equal(mapped.id, account.id);
  assert.equal(mapped.tier, 'funded-challenge');
  assert.equal(mapped.accountType, 'funded_challenge');
  assert.equal(mapped.account_tier, 'CHALLENGE');
  assert.equal(mapped.badge_color, 'red');
  assert.equal(mapped.isRealFunded, false);
  assert.equal(getAccountBadgeDisplayText(mapped), 'Challenge');
  assert.equal(mapped.initialBalance, account.initialBalance);
  assert.equal(mapped.currentBalance, account.currentBalance);
  assert.equal(mapped.profitTargetPercent, 30);
  assert.equal(mapped.maxOverallLossPercent, 10);
});

test('mapSupabaseTradingAccountRow maps funded_challenge correctly instead of Demo Practice', () => {
  const row = {
    id: '2a1b3c4d-5678-4e9f-8a1b-2c3d4e5f6789',
    user_id: TEST_UUID,
    account_type: 'funded_challenge',
    starting_balance: 5000,
    current_balance: 5000,
    equity: 5000,
    daily_drawdown: 0,
    max_drawdown: 10,
    profit_target: 30,
    challenge_phase: 'phase_1',
    status: 'active',
    created_at: '2026-11-25T10:00:00.000Z',
    updated_at: '2026-11-25T10:00:00.000Z',
  };

  const mapped = mapSupabaseTradingAccountRow(row);
  assert.equal(mapped.tierName, 'Funded Challenge');
  assert.equal(mapped.accountType, 'funded_challenge');
  assert.equal(mapped.account_tier, 'CHALLENGE');
  assert.equal(mapped.badge_color, 'red');
  assert.equal(getAccountBadgeDisplayText(mapped), 'Challenge');
  assert.equal(mapped.profitTargetPercent, 30);
  assert.equal(mapped.maxOverallLossPercent, 10);
});

test('insertTradingAccountWithAdapter falls back from funded_challenge to one_step on legacy CHECK constraint', async () => {
  const account = createPurchasedChallengeAccount();
  const attemptedTypes: string[] = [];

  const result = await insertTradingAccountWithAdapter({
    account,
    userId: TEST_UUID,
    unsupportedColumnsSet: new Set<string>(),
    adapter: {
      insertSelect: async (payload) => {
        attemptedTypes.push(String(payload.account_type));
        if (payload.account_type === 'funded_challenge') {
          return {
            data: null,
            error: {
              code: '23514',
              message: 'new row for relation "trading_accounts" violates check constraint "trading_accounts_account_type_check"',
            },
          };
        }
        return {
          data: {
            id: '99887766-5544-4332-8110-aabbccddeeff',
            ...payload,
            created_at: '2026-11-25T10:00:00.000Z',
          },
          error: null,
        };
      },
      insertPlain: async () => ({ error: null }),
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(attemptedTypes, ['funded_challenge', 'one_step']);
  assert.equal(result.account?.supabaseAccountId, '99887766-5544-4332-8110-aabbccddeeff');
  assert.equal(result.account?.id, account.id);
  assert.equal(getAccountBadgeDisplayText(result.account!), 'Challenge');
});

test('mergeSupabaseFundedAccounts deduplicates dual-inserted challenge rows while keeping unique rows from either table', () => {
  const merged = mergeSupabaseFundedAccounts({
    ownerEmail: 'trader@binaryfundedtrader.com',
    fundedWalletRows: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        account_id: 'BFT-CH-100001',
        user_id: TEST_UUID,
        challenge_type: 'Funded Challenge',
        account_tier: 'CHALLENGE',
        badge_color: 'red',
        is_real_funded: false,
        account_status: 'ACTIVE',
        initial_balance: 5000,
        current_balance: 5000,
        current_equity: 5000,
        profit_target_percent: 30,
        max_drawdown_limit_percent: 10,
        daily_drawdown_limit_percent: 0,
        created_at: '2026-11-25T10:00:00.000Z',
        updated_at: '2026-11-25T10:00:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        account_id: 'BFT-CH-100002',
        user_id: TEST_UUID,
        challenge_type: 'Funded Challenge',
        account_tier: 'CHALLENGE',
        badge_color: 'red',
        is_real_funded: false,
        account_status: 'ACTIVE',
        initial_balance: 10000,
        current_balance: 10450,
        current_equity: 10450,
        profit_target_percent: 30,
        max_drawdown_limit_percent: 10,
        daily_drawdown_limit_percent: 0,
        created_at: '2026-11-25T11:00:00.000Z',
        updated_at: '2026-11-25T11:00:00.000Z',
      },
    ],
    tradingAccountRows: [
      // Dual-inserted counterpart for BFT-CH-100001 (same size, 2 seconds apart)
      {
        id: '33333333-3333-4333-8333-333333333333',
        user_id: TEST_UUID,
        account_type: 'funded_challenge',
        starting_balance: 5000,
        current_balance: 5000,
        equity: 5000,
        daily_drawdown: 0,
        max_drawdown: 10,
        profit_target: 30,
        challenge_phase: 'phase_1',
        status: 'active',
        created_at: '2026-11-25T10:00:02.000Z',
        updated_at: '2026-11-25T10:00:02.000Z',
      },
      // Legacy row present only in trading_accounts
      {
        id: '44444444-4444-4444-8444-444444444444',
        user_id: TEST_UUID,
        account_type: 'funded_challenge',
        starting_balance: 25000,
        current_balance: 25200,
        equity: 25200,
        daily_drawdown: 0,
        max_drawdown: 10,
        profit_target: 30,
        challenge_phase: 'phase_1',
        status: 'active',
        created_at: '2026-11-20T09:00:00.000Z',
        updated_at: '2026-11-20T09:00:00.000Z',
      },
    ],
  });

  // 2 wallet rows + 1 legacy trading_accounts row (the duplicate 5000 row was merged!)
  assert.equal(merged.length, 3);
  const first = merged.find((a) => a.id === 'BFT-CH-100001');
  assert.ok(first);
  assert.equal(first!.supabaseAccountId, '33333333-3333-4333-8333-333333333333');
  assert.equal(getAccountBadgeDisplayText(first!), 'Challenge');

  const second = merged.find((a) => a.id === 'BFT-CH-100002');
  assert.ok(second);
  assert.equal(second!.currentBalance, 10450);

  const legacy = merged.find((a) => a.id === '44444444-4444-4444-8444-444444444444');
  assert.ok(legacy);
  assert.equal(legacy!.size, 25000);
  assert.equal(legacy!.tierName, 'Funded Challenge');
});
