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
  lookupRecipientByNumericId,
  createP2PTransferRecord,
  deduplicateP2PTransferRecords,
  fetchP2PTransfersFromSupabase,
  formatBalanceTransferToastMessage,
} from './p2pTransfer.ts';
import { getNumericTraderId } from './demoBalanceManager.ts';
import {
  formatP2PReceivedToastMessage,
  normalizeUserNotificationRow,
  processIncomingP2PTransfer,
  subscribeToRealtimeBalanceTransfers,
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
  assert.equal(toastMsg, 'Received $75.50 P2P transfer successfully! (From User #100201)');
  assert.equal(formatBalanceTransferToastMessage(75.5), 'Received $75.50 P2P transfer successfully!');

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
    'Received $75.50 P2P transfer successfully! (From User #100201)'
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

test('Bug Fix 1 & 2: executeP2PBalanceTransfer strictly deducts sender balance once even if RPC returns double-deducted value, and credits receiver Self-Capital balance', async () => {
  const profileUpdates: Array<{ id: string; payload: any }> = [];
  let receiverRow: any = {
    id: '99991048-1111-4222-8333-444455556666',
    numeric_id: '100201',
    full_name: 'Kasun Perera',
    email: 'kasun@example.com',
    self_balance: 100.0,
    self_capital_balance: 0, // Un-synced 0 column on receiver
  };

  const fakeSupabaseClient: any = {
    rpc: async () => ({
      // Simulate a buggy DB trigger + RPC that tried to deduct $50 twice (250.5 - 100 = 150.5)
      data: {
        success: true,
        new_balance: 150.5,
        receiver_name: 'Kasun Perera',
      },
      error: null,
    }),
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            or: () => ({
              limit: async () => ({
                data: [receiverRow],
                error: null,
              }),
            }),
            eq: (_col: string, val: any) => ({
              maybeSingle: async () => {
                if (String(val) === '100201' || String(val) === receiverRow.id) {
                  return { data: receiverRow, error: null };
                }
                return { data: null, error: null };
              },
              limit: async () => ({
                data: String(val) === '100201' ? [receiverRow] : [],
                error: null,
              }),
            }),
            limit: async () => ({
              data: [receiverRow],
              error: null,
            }),
          }),
          update: (payload: any) => ({
            eq: (_col: string, val: any) => {
              profileUpdates.push({ id: String(val), payload });
              if (String(val) === receiverRow.id) {
                receiverRow = { ...receiverRow, ...payload };
              }
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: 'a1234567-89ab-cdef-0123-456789abcdef', created_at: new Date().toISOString() },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  };

  const result = await executeP2PBalanceTransfer({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount, mockFundedAccount],
    receiverNumericId: '100201',
    transferAmount: 50.0,
    supabaseClient: fakeSupabaseClient,
  });

  assert.equal(result.ok, true);
  // Sender balance must be deducted strictly ONCE: 250.50 - 50.00 = 200.50 (NOT 150.50)
  assert.equal(result.previousBalance, 250.5);
  assert.equal(result.newBalance, 200.5);
  assert.equal(result.updatedProfile?.selfBalance, 200.5);
  assert.equal(result.updatedProfile?.self_capital_balance, 200.5);
  assert.equal(result.updatedAccount?.currentBalance, 200.5);

  // Receiver Self-Capital must be incremented from 100.00 to 150.00 on both self_balance and self_capital_balance
  assert.equal(receiverRow.self_balance, 150.0);
  assert.equal(receiverRow.self_capital_balance, 150.0);
});

test('Bug Fix 3: resolveTransferableLiveBalance and validateP2PTransferInput never trigger false Insufficient Capital when one self-capital field is 0 and another is positive', () => {
  const unSyncedProfile: UserProfile = {
    ...mockUserProfile,
    selfBalance: 0,
    self_capital_balance: 420.75,
  };
  const resolved = resolveTransferableLiveBalance(unSyncedProfile, [
    { ...mockPersonalAccount, currentBalance: 0, equity: 0 },
  ]);
  assert.equal(resolved.availableLiveBalance, 420.75);
  assert.equal(resolved.selfCapitalBalance, 420.75);

  const validation = validateP2PTransferInput({
    senderNumericId: '88412095',
    receiverNumericId: '100202',
    transferAmount: 120.75,
    availableLiveBalance: resolved.availableLiveBalance,
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.exceedsSelfCapitalBalance, false);
});

test('fetchP2PTransfersFromSupabase queries balance_transfers using sender_id and receiver_id and enriches counterparty names from profiles', async () => {
  const orFiltersUsed: Array<{ table: string; filter: string }> = [];
  const fakeSupabaseClient: any = {
    from: (table: string) => {
      if (table === 'balance_transfers') {
        return {
          select: () => ({
            or: (filter: string) => {
              orFiltersUsed.push({ table, filter });
              return {
                order: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: 'b1111111-1111-4111-8111-111111111111',
                        sender_id: mockUserProfile.id,
                        receiver_id: '99991048-1111-4222-8333-444455556666',
                        amount: 80.0,
                        status: 'completed',
                        created_at: '2026-11-10T01:30:00.000Z',
                      },
                      {
                        id: 'b2222222-2222-4222-8222-222222222222',
                        sender_id: '99991048-1111-4222-8333-444455556666',
                        receiver_id: mockUserProfile.id,
                        amount: 140.0,
                        status: 'completed',
                        created_at: '2026-11-10T01:40:00.000Z',
                      },
                    ],
                    error: null,
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                {
                  id: '99991048-1111-4222-8333-444455556666',
                  numeric_id: '100201',
                  full_name: 'Kasun Perera',
                  email: 'kasun@example.com',
                },
                {
                  id: mockUserProfile.id,
                  numeric_id: mockUserProfile.numericId,
                  full_name: mockUserProfile.fullName,
                  email: mockUserProfile.email,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => ({
          or: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    },
  };

  const records = await fetchP2PTransfersFromSupabase({
    userId: mockUserProfile.id,
    userNumericId: mockUserProfile.numericId,
    supabaseClient: fakeSupabaseClient,
  });

  // Verify the primary query on balance_transfers targeted sender_id and receiver_id
  assert.equal(
    orFiltersUsed[0]?.filter,
    `sender_id.eq.${mockUserProfile.id},receiver_id.eq.${mockUserProfile.id}`
  );
  assert.equal(records.length, 2);

  // Most recent first (b222... is received +$140.00 from Kasun Perera #100201)
  assert.equal(records[0].id, 'b2222222-2222-4222-8222-222222222222');
  assert.equal(records[0].direction, 'received');
  assert.equal(records[0].senderNumericId, '100201');
  assert.equal(records[0].senderName, 'Kasun Perera');
  assert.equal(records[0].amount, 140.0);
  assert.equal(records[0].status, 'completed');

  // Second record (b111... is sent -$80.00 to Kasun Perera #100201)
  assert.equal(records[1].id, 'b1111111-1111-4111-8111-111111111111');
  assert.equal(records[1].direction, 'sent');
  assert.equal(records[1].receiverNumericId, '100201');
  assert.equal(records[1].receiverName, 'Kasun Perera');
  assert.equal(records[1].amount, 80.0);
  assert.equal(records[1].status, 'completed');
});

test('subscribeToRealtimeBalanceTransfers listens to INSERT on balance_transfers where receiver_id = auth.uid(), triggers instant toast, and updates active balance', async () => {
  const registeredHandlers: Array<{ config: any; callback: (payload: any) => Promise<void> }> = [];
  let incomingCallbackResult: any = null;

  const fakeSupabaseClient: any = {
    channel: (_name: string) => {
      const ch: any = {
        on: (_type: string, config: any, cb: (payload: any) => Promise<void>) => {
          registeredHandlers.push({ config, callback: cb });
          return ch;
        },
        subscribe: () => ch,
        unsubscribe: () => {},
      };
      return ch;
    },
    removeChannel: () => {},
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: '99991048-1111-4222-8333-444455556666',
                  numeric_id: '100201',
                  full_name: 'Kasun Perera',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert: async () => ({ data: null, error: null }),
      };
    },
  };

  const unsubscribe = subscribeToRealtimeBalanceTransfers({
    userProfile: mockUserProfile,
    accounts: [mockPersonalAccount],
    supabaseClient: fakeSupabaseClient,
    onIncomingTransfer: (res) => {
      incomingCallbackResult = res;
    },
  });

  const receiverHandler = registeredHandlers.find(
    (h) =>
      h.config.table === 'balance_transfers' &&
      h.config.event === 'INSERT' &&
      h.config.filter === `receiver_id=eq.${mockUserProfile.id}`
  );
  assert.ok(receiverHandler, 'Must register INSERT listener on balance_transfers with receiver_id filter');

  await receiverHandler.callback({
    new: {
      id: 'c3333333-3333-4333-8333-333333333333',
      sender_id: '99991048-1111-4222-8333-444455556666',
      receiver_id: mockUserProfile.id,
      amount: 125.0,
      status: 'completed',
      created_at: '2026-11-10T01:55:00.000Z',
    },
  });

  assert.ok(incomingCallbackResult, 'onIncomingTransfer must be called when INSERT arrives');
  assert.match(
    incomingCallbackResult.toastMessage,
    /Received \$125\.00 P2P transfer successfully!/
  );
  assert.equal(incomingCallbackResult.updatedProfile.selfBalance, 375.5);
  assert.equal(incomingCallbackResult.updatedAccount?.currentBalance, 375.5);
  assert.equal(incomingCallbackResult.transferRecord.id, 'c3333333-3333-4333-8333-333333333333');
  assert.equal(incomingCallbackResult.transferRecord.senderName, 'Kasun Perera');

  unsubscribe();
});



