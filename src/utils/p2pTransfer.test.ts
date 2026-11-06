import test from 'node:test';
import assert from 'node:assert/strict';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  P2P_SELF_CAPITAL_ONLY_ERROR,
  resolveUserNumericId,
  resolveTransferableLiveBalance,
  buildTransferBalanceRpcPayload,
  validateP2PTransferInput,
  executeP2PBalanceTransfer,
  createP2PTransferRecord,
  deduplicateP2PTransferRecords,
} from './p2pTransfer.ts';
import {
  formatP2PReceivedToastMessage,
  normalizeUserNotificationRow,
  processIncomingP2PTransfer,
} from './userNotifications.ts';
import {
  mapP2PTransferToQuotexTransaction,
  buildMergedTransactionLedger,
} from './quotexWithdrawalPortal.ts';

const mockUserProfile: UserProfile = {
  id: '38291048-1111-4222-8333-444455556666',
  fullName: 'Alex Vance',
  email: 'alex.vance@example.com',
  country: 'United States',
  kycStatus: 'verified',
  referralCode: 'BFT-ALEX',
  numericId: '88412095',
  numeric_id: '88412095',
  selfBalance: 250.5,
  fundedBalance: 5000,
  demoBalance: 10000,
  avatarUrl: '',
  telegramHandle: '@alexvance',
  activeAccountId: 'BFT-PERS-1',
} as any;

const mockPersonalAccount: TradingAccount = {
  id: 'BFT-PERS-1',
  loginId: '99001122',
  tier: 'personal',
  tierName: 'Personal Live Account',
  accountType: 'personal',
  accountCategory: 'personal_live',
  size: 250.5,
  initialBalance: 250.5,
  currentBalance: 250.5,
  equity: 250.5,
  dailyStartBalance: 250.5,
  lastActiveDate: '2026-11-05',
  status: 'active',
  phase: 'personal_live',
  profitTarget: 0,
  maxDailyLoss: 0,
  maxTotalLoss: 0,
  profitSplit: 100,
  tradingDaysCompleted: 5,
  minTradingDays: 0,
  createdAt: '2026-01-01',
} as any;

const mockFundedAccount: TradingAccount = {
  ...mockPersonalAccount,
  id: 'BFT-FUND-1',
  tier: 'instant',
  accountType: 'instant',
  accountCategory: 'funded',
  phase: 'live' as any,
  size: 5000,
  initialBalance: 5000,
  currentBalance: 5000,
  equity: 5000,
} as any;

test('resolveUserNumericId extracts explicit numeric_id or derives deterministic 8-digit ID', () => {
  assert.equal(resolveUserNumericId(mockUserProfile), '88412095');

  const derived = resolveUserNumericId({
    id: 'user-uuid-123',
    email: 'trader@bft.com',
  });
  assert.match(derived, /^\d{8}$/);
  assert.equal(
    derived,
    resolveUserNumericId({ id: 'user-uuid-123', email: 'trader@bft.com' })
  );
});

test('resolveTransferableLiveBalance strictly uses Self-Capital (self_balance) and never falls back to funded_balance', () => {
  const res = resolveTransferableLiveBalance(mockUserProfile, [
    mockPersonalAccount,
    mockFundedAccount,
  ]);
  assert.equal(res.balanceColumn, 'self_balance');
  assert.equal(res.availableLiveBalance, 250.5);
  assert.equal(res.selfCapitalBalance, 250.5);
  assert.equal(res.targetAccount?.id, 'BFT-PERS-1');

  // Even if selfBalance is 0 and fundedBalance is $5,000, P2P transfers strictly read Self-Capital (0)
  const zeroSelfProfile: UserProfile = {
    ...mockUserProfile,
    selfBalance: 0,
    fundedBalance: 5000,
  };
  const zeroSelfAcc: TradingAccount = {
    ...mockPersonalAccount,
    currentBalance: 0,
    equity: 0,
  };
  const resZero = resolveTransferableLiveBalance(zeroSelfProfile, [
    zeroSelfAcc,
    mockFundedAccount,
  ]);
  assert.equal(resZero.balanceColumn, 'self_balance');
  assert.equal(resZero.availableLiveBalance, 0);
  assert.equal(resZero.selfCapitalBalance, 0);
});

test('buildTransferBalanceRpcPayload constructs p_receiver_numeric_id and p_transfer_amount', () => {
  const payload = buildTransferBalanceRpcPayload('#49201844', '75.259');
  assert.deepEqual(payload, {
    p_receiver_numeric_id: 49201844,
    p_transfer_amount: 75.26,
  });
});

test('validateP2PTransferInput enforces Self-Capital balance limit with exact required error message', () => {
  const overSelfCapital = validateP2PTransferInput({
    senderNumericId: '88412095',
    receiverNumericId: '100201',
    transferAmount: 500,
    availableLiveBalance: 250.5,
  });
  assert.equal(overSelfCapital.valid, false);
  assert.equal(overSelfCapital.exceedsSelfCapitalBalance, true);
  assert.equal(
    overSelfCapital.error,
    'P2P Transfer Failed: Insufficient self-capital balance.'
  );
  assert.equal(overSelfCapital.error, P2P_SELF_CAPITAL_ONLY_ERROR);

  const selfTransfer = validateP2PTransferInput({
    senderNumericId: '88412095',
    receiverNumericId: '88412095',
    transferAmount: 25,
    availableLiveBalance: 250.5,
  });
  assert.equal(selfTransfer.valid, false);
  assert.match(selfTransfer.error || '', /own numeric ID/i);

  const validCheck = validateP2PTransferInput({
    senderNumericId: '88412095',
    receiverNumericId: '#100201',
    transferAmount: '50.50',
    availableLiveBalance: 250.5,
  });
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.normalizedReceiverNumericId, '100201');
  assert.equal(validCheck.receiverNumericIdAsNumber, 100201);
  assert.equal(validCheck.normalizedAmount, 50.5);
});

test('executeP2PBalanceTransfer calls transfer_balance_p2p RPC, deducts strictly from selfBalance, and records P2P Transfer Sent', async () => {
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  const fakeSupabaseClient: any = {
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return {
        data: {
          success: true,
          new_balance: 200.0,
          receiver_name: 'Marcus Sterling',
        },
        error: null,
      };
    },
  };

  const result = await executeP2PBalanceTransfer({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount, mockFundedAccount],
    receiverNumericId: '100201',
    transferAmount: 50.5,
    supabaseClient: fakeSupabaseClient,
  });

  assert.equal(result.ok, true);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'transfer_balance_p2p');
  assert.deepEqual(rpcCalls[0].args, {
    p_receiver_numeric_id: 100201,
    p_transfer_amount: 50.5,
  });
  assert.equal(result.previousBalance, 250.5);
  assert.equal(result.newBalance, 200.0);
  assert.equal(result.balanceColumn, 'self_balance');
  assert.equal(result.updatedProfile?.selfBalance, 200.0);
  assert.equal(result.updatedAccount?.currentBalance, 200.0);
  assert.equal(result.record?.type, 'P2P Transfer Sent');
  assert.equal(result.record?.signedAmountFormatted, '-$50.50');
  assert.equal(result.record?.counterpartyLabel, 'Receiver ID: #100201');
});

test('Sent and Received P2P transfers format accurately for Payment History / Transactions ledger', () => {
  const sentRecord = createP2PTransferRecord({
    id: 'P2P-SENT-1',
    direction: 'sent',
    senderNumericId: '88412095',
    receiverNumericId: '100201',
    amount: 45.0,
    previousBalance: 250.5,
    newBalance: 205.5,
  });

  assert.equal(sentRecord.type, 'P2P Transfer Sent');
  assert.equal(sentRecord.signedAmount, -45.0);
  assert.equal(sentRecord.signedAmountFormatted, '-$45.00');
  assert.equal(sentRecord.counterpartyLabel, 'Receiver ID: #100201');

  const receivedRecord = createP2PTransferRecord({
    id: 'P2P-RCV-1',
    direction: 'received',
    senderNumericId: '100201',
    receiverNumericId: '88412095',
    amount: 120.75,
    previousBalance: 205.5,
    newBalance: 326.25,
  });

  assert.equal(receivedRecord.type, 'P2P Deposit Received');
  assert.equal(receivedRecord.signedAmount, 120.75);
  assert.equal(receivedRecord.signedAmountFormatted, '+$120.75');
  assert.equal(receivedRecord.counterpartyLabel, 'Sender ID: #100201');

  const ledger = buildMergedTransactionLedger([], [], false, [sentRecord, receivedRecord]);
  assert.equal(ledger.length, 2);

  const mappedSent = mapP2PTransferToQuotexTransaction(sentRecord);
  assert.equal(mappedSent.type, 'P2P Transfer Sent');
  assert.equal(mappedSent.signedAmountFormatted, '-$45.00');
  assert.equal(mappedSent.counterpartyLabel, 'Receiver ID: #100201');

  const mappedRcv = mapP2PTransferToQuotexTransaction(receivedRecord);
  assert.equal(mappedRcv.type, 'P2P Deposit Received');
  assert.equal(mappedRcv.signedAmountFormatted, '+$120.75');
  assert.equal(mappedRcv.counterpartyLabel, 'Sender ID: #100201');
});

test('Instant Notification: formatP2PReceivedToastMessage and processIncomingP2PTransfer update Self-Capital balance and create user_notifications entry', async () => {
  const toastMsg = formatP2PReceivedToastMessage(75.5, '100201');
  assert.equal(toastMsg, 'You received $75.50 into your Self-Capital balance from User #100201.');

  const normalizedNotif = normalizeUserNotificationRow({
    id: 'notif-99',
    user_id: mockUserProfile.id,
    title: 'P2P Funds Received',
    message: 'P2P Funds Received: +$75.50 from User #100201',
    is_read: false,
    created_at: '2026-11-05T20:00:00.000Z',
  });
  assert.equal(normalizedNotif.type, 'p2p_received');
  assert.equal(normalizedNotif.amount, 75.5);
  assert.equal(normalizedNotif.sender_numeric_id, '100201');

  const fakeClient: any = {
    from: () => ({
      insert: async () => ({ data: null, error: null }),
    }),
  };

  const incomingRes = await processIncomingP2PTransfer({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount],
    amount: 75.5,
    senderNumericId: '100201',
    notificationId: 'notif-incoming-1',
    supabaseClient: fakeClient,
  });

  assert.equal(
    incomingRes.toastMessage,
    'You received $75.50 into your Self-Capital balance from User #100201.'
  );
  assert.equal(incomingRes.updatedProfile.selfBalance, 326.0);
  assert.equal(incomingRes.updatedAccount?.currentBalance, 326.0);
  assert.equal(incomingRes.transferRecord.type, 'P2P Deposit Received');
  assert.equal(incomingRes.transferRecord.signedAmountFormatted, '+$75.50');
  assert.equal(incomingRes.transferRecord.counterpartyLabel, 'Sender ID: #100201');
  assert.equal(incomingRes.notification.is_read, false);
});

test('validateP2PTransferInput and buildTransferBalanceRpcPayload handle formatted string balances with commas (e.g. $762 with $29,762.30 balance)', () => {
  const result = validateP2PTransferInput({
    senderNumericId: '88412095',
    receiverNumericId: '100201',
    transferAmount: '762',
    availableLiveBalance: '29,762.30',
  });
  assert.equal(result.valid, true);
  assert.equal(result.exceedsSelfCapitalBalance, false);
  assert.equal(result.normalizedAmount, 762);

  const payload = buildTransferBalanceRpcPayload('#100201', '762.50');
  assert.deepEqual(payload, {
    p_receiver_numeric_id: 100201,
    p_transfer_amount: 762.50,
  });
});

test('deduplicateP2PTransferRecords deduplicates both identical IDs and temporary client vs authoritative DB UUID duplicates', () => {
  const records = [
    createP2PTransferRecord({
      id: 'P2P-CLIENT-TEMP-01',
      direction: 'sent',
      senderNumericId: '88412095',
      receiverNumericId: '100201',
      amount: 150.00,
      createdAt: '2026-11-06T10:00:05.000Z',
    }),
    createP2PTransferRecord({
      id: 'e1234567-89ab-cdef-0123-456789abcdef', // Authoritative DB UUID for the same transaction
      direction: 'sent',
      senderNumericId: '88412095',
      receiverNumericId: '100201',
      amount: 150.00,
      createdAt: '2026-11-06T10:00:07.000Z',
    }),
    createP2PTransferRecord({
      id: 'e1234567-89ab-cdef-0123-456789abcdef', // Exact duplicate of the UUID
      direction: 'sent',
      senderNumericId: '88412095',
      receiverNumericId: '100201',
      amount: 150.00,
      createdAt: '2026-11-06T10:00:07.000Z',
    }),
    createP2PTransferRecord({
      id: 'f9999999-89ab-cdef-0123-456789abcdef',
      direction: 'received',
      senderNumericId: '100201',
      receiverNumericId: '88412095',
      amount: 50.00,
      createdAt: '2026-11-06T09:30:00.000Z',
    }),
  ];

  const deduped = deduplicateP2PTransferRecords(records);
  assert.equal(deduped.length, 2);
  // The first transfer should keep the authoritative UUID rather than the temporary client ID
  assert.equal(deduped[0].id, 'e1234567-89ab-cdef-0123-456789abcdef');
  assert.equal(deduped[0].amount, 150.00);
  assert.equal(deduped[1].id, 'f9999999-89ab-cdef-0123-456789abcdef');
  assert.equal(deduped[1].amount, 50.00);
});

