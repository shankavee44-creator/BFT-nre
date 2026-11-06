import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveUserNumericId,
  resolveTransferableLiveBalance,
  buildTransferBalanceRpcPayload,
  validateP2PTransferInput,
  executeP2PBalanceTransfer,
} from './p2pTransfer.ts';
import type { UserProfile, TradingAccount } from '../types/index.ts';

const mockUserProfile: UserProfile = {
  id: '9f8e7d6c-5b4a-4321-8765-1234567890ab',
  email: 'trader@bft.io',
  fullName: 'Alex Mercer',
  avatarUrl: 'https://example.com/avatar.png',
  country: 'United States',
  telegramHandle: '@alexmercer',
  referralCode: 'BFT-ALEX',
  kycStatus: 'verified',
  twoFactorEnabled: true,
  activeAccountId: 'BFT-PERS-01',
  selfBalance: 250.5,
  demoBalance: 10000,
  fundedBalance: 0,
  numeric_id: 48291034,
};

const mockPersonalAccount: TradingAccount = {
  id: 'BFT-PERS-01',
  loginId: 'BFT-PERS-01',
  tierName: 'Personal Live',
  size: 250.5,
  initialBalance: 250.5,
  currentBalance: 250.5,
  equity: 250.5,
  startingDayEquity: 250.5,
  dailyLossLimitPercent: 0,
  maxOverallLossPercent: 0,
  profitTargetPercent: 0,
  status: 'active',
  phase: 'funded',
  accountType: 'personal',
  tier: 'personal',
  passwordHash: 'pass123',
  createdDate: new Date().toISOString(),
  lastActiveDate: new Date().toISOString(),
  tradingDaysCompleted: 1,
  tradesCount: 0,
  winRate: 0,
};

test('resolveUserNumericId returns explicit numeric_id from profile or supabase row', () => {
  assert.equal(resolveUserNumericId(mockUserProfile), '48291034');
  assert.equal(
    resolveUserNumericId({ ...mockUserProfile, numeric_id: undefined }, { numeric_id: '99123456' }),
    '99123456'
  );
});

test('resolveUserNumericId generates deterministic 8-digit numeric ID fallback when unset', () => {
  const profileWithoutNumId: UserProfile = {
    ...mockUserProfile,
    numeric_id: undefined,
    numericId: undefined,
  };
  const id1 = resolveUserNumericId(profileWithoutNumId);
  const id2 = resolveUserNumericId(profileWithoutNumId);
  assert.match(id1, /^\d{8}$/);
  assert.equal(id1, id2);
});

test('resolveTransferableLiveBalance prioritizes self_balance and maps personal live account', () => {
  const res = resolveTransferableLiveBalance(mockUserProfile, [mockPersonalAccount]);
  assert.equal(res.availableLiveBalance, 250.5);
  assert.equal(res.balanceColumn, 'self_balance');
  assert.equal(res.targetAccount?.id, 'BFT-PERS-01');
});

test('buildTransferBalanceRpcPayload constructs exact p_receiver_numeric_id and p_transfer_amount parameters', () => {
  const payload = buildTransferBalanceRpcPayload('88392011', '75.259');
  assert.deepEqual(payload, {
    p_receiver_numeric_id: 88392011,
    p_transfer_amount: 75.26,
  });
});

test('validateP2PTransferInput enforces numeric ID, self-transfer prevention, and live balance limits', () => {
  // Missing recipient ID
  const emptyRes = validateP2PTransferInput({
    senderNumericId: '48291034',
    receiverNumericId: '',
    transferAmount: 50,
    availableLiveBalance: 250.5,
  });
  assert.equal(emptyRes.valid, false);

  // Self-transfer blocked
  const selfRes = validateP2PTransferInput({
    senderNumericId: '48291034',
    receiverNumericId: '48291034',
    transferAmount: 50,
    availableLiveBalance: 250.5,
  });
  assert.equal(selfRes.valid, false);
  assert.match(selfRes.error || '', /own numeric ID/i);

  // Exceeds available balance
  const exceedRes = validateP2PTransferInput({
    senderNumericId: '48291034',
    receiverNumericId: '88392011',
    transferAmount: 300,
    availableLiveBalance: 250.5,
  });
  assert.equal(exceedRes.valid, false);
  assert.match(exceedRes.error || '', /Insufficient live balance/i);

  // Valid transfer
  const validRes = validateP2PTransferInput({
    senderNumericId: '48291034',
    receiverNumericId: '#88392011',
    transferAmount: '50.5',
    availableLiveBalance: 250.5,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.normalizedReceiverNumericId, '88392011');
  assert.equal(validRes.receiverNumericIdAsNumber, 88392011);
  assert.equal(validRes.normalizedAmount, 50.5);
});

test('executeP2PBalanceTransfer calls supabase.rpc("transfer_balance_to_user") and updates live balance', async () => {
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  const fakeSupabaseClient: any = {
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return {
        data: {
          success: true,
          new_balance: 200.0,
          receiver_name: 'Recipient Trader',
        },
        error: null,
      };
    },
  };

  const result = await executeP2PBalanceTransfer({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount],
    receiverNumericId: '88392011',
    transferAmount: 50.5,
    supabaseClient: fakeSupabaseClient,
  });

  assert.equal(result.ok, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'transfer_balance_to_user');
  assert.deepEqual(rpcCalls[0].args, {
    p_receiver_numeric_id: 88392011,
    p_transfer_amount: 50.5,
  });
  assert.equal(result.previousBalance, 250.5);
  assert.equal(result.newBalance, 200.0);
  assert.equal(result.updatedProfile?.selfBalance, 200.0);
  assert.equal(result.updatedAccount?.currentBalance, 200.0);
});

test('executeP2PBalanceTransfer surfaces RPC error cleanly without deducting balance', async () => {
  const fakeSupabaseClient: any = {
    rpc: async () => ({
      data: null,
      error: {
        code: 'P0001',
        message: 'Recipient numeric_id 99999999 does not exist',
      },
    }),
  };

  const result = await executeP2PBalanceTransfer({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount],
    receiverNumericId: '99999999',
    transferAmount: 25,
    supabaseClient: fakeSupabaseClient,
  });

  assert.equal(result.ok, false);
  assert.match(result.error || '', /Recipient numeric_id 99999999 does not exist/);
  assert.equal(result.newBalance, 250.5);
});
