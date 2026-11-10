import test from 'node:test';
import assert from 'node:assert/strict';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  BFT100_BONUS_CODE,
  validateBft100BonusCode,
  computeBft100BonusGrant,
  calculateTradePlacementWithBonusPriority,
  applyTradingLossWithRealFirstPriority,
  calculateTradeSettlementWithBonusAndTurnover,
  interceptWithdrawalForBonusTurnover,
  activateBft100BonusInSupabase,
  syncProfileBonusColumnsToSupabase,
  fetchProfileBonusStateFromSupabase,
  uploadDepositReceiptToSupabaseStorage,
  submitCryptoDepositToSupabaseTable,
  fetchAdminCryptoDepositsFromSupabase,
  approveAdminCryptoDepositInSupabase,
  DEPOSIT_RECEIPTS_BUCKET,
} from './depositBonus.ts';

const baseProfile: UserProfile = {
  id: '22221048-1111-4222-8333-444455556666',
  fullName: 'Nimal Perera',
  email: 'nimal@example.com',
  country: 'Sri Lanka',
  kycStatus: 'verified',
  selfBalance: 100,
  self_balance: 100,
  self_capital_balance: 100,
  bonusBalance: 0,
  bonus_balance: 0,
  totalTurnoverRequired: 0,
  total_turnover_required: 0,
  currentTurnover: 0,
  current_turnover: 0,
  hasUsedBft100: false,
  has_used_bft100: false,
};

const basePersonalAccount: TradingAccount = {
  id: 'BFT-PERS-101',
  loginId: '99110022',
  passwordHash: '',
  tier: 'personal',
  accountType: 'personal',
  accountCategory: 'personal_live',
  tierName: 'Personal Live Account',
  size: 100,
  initialBalance: 100,
  currentBalance: 100,
  startingDayEquity: 100,
  equity: 100,
  dailyLossLimitPercent: 0,
  maxOverallLossPercent: 0,
  status: 'active',
  phase: 'personal_live',
  tradingDaysCompleted: 1,
  tradesCount: 0,
  winRate: 0,
  createdDate: '2026-11-01',
  lastActiveDate: '2026-11-10',
};

test('Rule 1 & 2: validateBft100BonusCode grants 100% bonus and 100x turnover requirement, and blocks reuse when has_used_bft100 is true', () => {
  // Valid first-time application on $150 deposit
  const validRes = validateBft100BonusCode({
    code: 'bft100',
    depositAmount: 150,
    userProfile: baseProfile,
    accountType: 'self_funded',
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.code, BFT100_BONUS_CODE);
  assert.equal(validRes.depositAmount, 150);
  assert.equal(validRes.bonusAmount, 150); // 100% match
  assert.equal(validRes.totalCreditAmount, 300); // $150 deposit + $150 bonus
  assert.equal(validRes.turnoverRequired, 15000); // 100 * $150 = $15,000 turnover required

  // Single-use enforcement: reject if has_used_bft100 is true
  const usedProfile: UserProfile = {
    ...baseProfile,
    has_used_bft100: true,
    hasUsedBft100: true,
  };
  const secondUseRes = validateBft100BonusCode({
    code: 'BFT100',
    depositAmount: 200,
    userProfile: usedProfile,
    accountType: 'self_funded',
  });
  assert.equal(secondUseRes.valid, false);
  assert.equal(secondUseRes.alreadyUsed, true);
  assert.match(secondUseRes.error || '', /already been used|only once/i);

  // Invalid code rejected
  const invalidCodeRes = validateBft100BonusCode({
    code: 'WELCOME50',
    depositAmount: 100,
    userProfile: baseProfile,
    accountType: 'self_funded',
  });
  assert.equal(invalidCodeRes.valid, false);
  assert.match(invalidCodeRes.error || '', /Invalid bonus code/i);
});

test('Rule 3 (Loss Priority): Real/Self balance is lost FIRST; once real balance reaches 0, losses deduct from bonus_balance', () => {
  // Trader has $100 Real/Self balance and $100 Bonus balance
  let selfBal = 100;
  let bonusBal = 100;

  // Loss 1: Trader loses $60 -> deducted strictly from Real/Self balance ($100 -> $40), Bonus stays $100
  const loss1 = applyTradingLossWithRealFirstPriority({
    lossAmount: 60,
    selfBalance: selfBal,
    bonusBalance: bonusBal,
  });
  assert.equal(loss1.deductedFromSelf, 60);
  assert.equal(loss1.deductedFromBonus, 0);
  assert.equal(loss1.newSelfBalance, 40);
  assert.equal(loss1.newBonusBalance, 100);

  selfBal = loss1.newSelfBalance;
  bonusBal = loss1.newBonusBalance;

  // Loss 2: Trader loses another $60 (only $40 Real/Self balance left) ->
  // Real/Self balance drops by $40 to $0, and remaining $20 loss is deducted from Bonus ($100 -> $80)
  const loss2 = applyTradingLossWithRealFirstPriority({
    lossAmount: 60,
    selfBalance: selfBal,
    bonusBalance: bonusBal,
  });
  assert.equal(loss2.deductedFromSelf, 40);
  assert.equal(loss2.deductedFromBonus, 20);
  assert.equal(loss2.newSelfBalance, 0);
  assert.equal(loss2.newBonusBalance, 80);

  selfBal = loss2.newSelfBalance;
  bonusBal = loss2.newBonusBalance;

  // Loss 3: Trader loses $30 while Real/Self balance is $0 -> deducted from Bonus ($80 -> $50)
  const loss3 = applyTradingLossWithRealFirstPriority({
    lossAmount: 30,
    selfBalance: selfBal,
    bonusBalance: bonusBal,
  });
  assert.equal(loss3.deductedFromSelf, 0);
  assert.equal(loss3.deductedFromBonus, 30);
  assert.equal(loss3.newSelfBalance, 0);
  assert.equal(loss3.newBonusBalance, 50);
});

test('Rule 2 & 3: Trade placement and settlement track turnover and enforce Real-first loss priority and Bonus restoration on wins', () => {
  // Trader has $40 Real balance, $100 Bonus balance, $10,000 required turnover, $500 current turnover
  const placement = calculateTradePlacementWithBonusPriority({
    stake: 60,
    selfBalance: 40,
    bonusBalance: 100,
  });
  assert.equal(placement.allowed, true);
  assert.equal(placement.stakeFromSelf, 40);
  assert.equal(placement.stakeFromBonus, 20);
  assert.equal(placement.newSelfBalance, 0);
  assert.equal(placement.newBonusBalance, 80);

  // Case A: Trade is LOST -> Real stays $0, Bonus stays $80, turnover increases by $60 ($500 -> $560)
  const lossSettlement = calculateTradeSettlementWithBonusAndTurnover({
    status: 'lost',
    stake: 60,
    payoutPercentage: 85,
    postPlacementSelfBalance: placement.newSelfBalance,
    postPlacementBonusBalance: placement.newBonusBalance,
    stakeFromSelf: placement.stakeFromSelf,
    stakeFromBonus: placement.stakeFromBonus,
    currentTurnover: 500,
    totalTurnoverRequired: 10000,
  });
  assert.equal(lossSettlement.finalSelfBalance, 0);
  assert.equal(lossSettlement.finalBonusBalance, 80);
  assert.equal(lossSettlement.deductedFromSelfOnLoss, 40);
  assert.equal(lossSettlement.deductedFromBonusOnLoss, 20);
  assert.equal(lossSettlement.newCurrentTurnover, 560);
  assert.equal(lossSettlement.isTurnoverCompleted, false);

  // Case B: Trade is WON (80% payout = $48 profit) ->
  // Bonus stake ($20) is restored to Bonus ($80 + $20 = $100), and Real stake ($40) + profit ($48) = $88 is credited to Real balance!
  const winSettlement = calculateTradeSettlementWithBonusAndTurnover({
    status: 'won',
    stake: 60,
    payoutPercentage: 80,
    postPlacementSelfBalance: placement.newSelfBalance,
    postPlacementBonusBalance: placement.newBonusBalance,
    stakeFromSelf: placement.stakeFromSelf,
    stakeFromBonus: placement.stakeFromBonus,
    currentTurnover: 500,
    totalTurnoverRequired: 10000,
  });
  assert.equal(winSettlement.finalSelfBalance, 88);
  assert.equal(winSettlement.finalBonusBalance, 100);
  assert.equal(winSettlement.newCurrentTurnover, 560);
});

test('Rule 4 (Withdrawal Interception & Bonus Removal): Automatically forfeits remaining bonus when turnover is incomplete, and allows bonus withdrawal when 100x turnover is completed', () => {
  // Scenario A: Turnover is INCOMPLETE ($1,200 / $10,000). User has $180 Real balance and $100 Bonus balance.
  const incompleteProfile: UserProfile = {
    ...baseProfile,
    selfBalance: 180,
    self_balance: 180,
    self_capital_balance: 180,
    bonusBalance: 100,
    bonus_balance: 100,
    totalTurnoverRequired: 10000,
    total_turnover_required: 10000,
    currentTurnover: 1200,
    current_turnover: 1200,
    hasUsedBft100: true,
    has_used_bft100: true,
  };

  // User requests a $120 withdrawal -> Bonus ($100) is automatically forfeited/removed to $0, and $120 is deducted from Real balance ($180 -> $60)
  const interceptValid = interceptWithdrawalForBonusTurnover({
    userProfile: incompleteProfile,
    account: { ...basePersonalAccount, currentBalance: 180, bonusBalance: 100 },
    requestedAmount: 120,
    deductWithdrawalNow: true,
  });
  assert.equal(interceptValid.canProceedWithWithdrawal, true);
  assert.equal(interceptValid.bonusForfeited, true);
  assert.equal(interceptValid.forfeitedBonusAmount, 100);
  assert.equal(interceptValid.postForfeitureBonusBalance, 0);
  assert.equal(interceptValid.postWithdrawalSelfBalance, 60);
  assert.equal(interceptValid.postWithdrawalBonusBalance, 0);
  assert.equal(interceptValid.updatedProfile.bonus_balance, 0);
  assert.equal(interceptValid.updatedProfile.self_balance, 60);
  assert.equal(interceptValid.profileUpdatePayload.bonus_balance, 0);
  assert.equal(interceptValid.profileUpdatePayload.self_balance, 60);

  // Scenario B: Turnover is COMPLETED ($10,000 / $10,000). User has $150 Real balance and $100 Bonus balance.
  const completedProfile: UserProfile = {
    ...incompleteProfile,
    selfBalance: 150,
    self_balance: 150,
    self_capital_balance: 150,
    bonusBalance: 100,
    bonus_balance: 100,
    currentTurnover: 10000,
    current_turnover: 10000,
  };

  // User can withdraw $220 (including unlocked bonus) without forfeiture!
  const interceptCompleted = interceptWithdrawalForBonusTurnover({
    userProfile: completedProfile,
    account: { ...basePersonalAccount, currentBalance: 150, bonusBalance: 100 },
    requestedAmount: 220,
    deductWithdrawalNow: true,
  });
  assert.equal(interceptCompleted.canProceedWithWithdrawal, true);
  assert.equal(interceptCompleted.bonusForfeited, false);
  assert.equal(interceptCompleted.forfeitedBonusAmount, 0);
  assert.equal(interceptCompleted.availableWithdrawableBalance, 250);
  assert.equal(interceptCompleted.postWithdrawalSelfBalance, 30);
  assert.equal(interceptCompleted.postWithdrawalBonusBalance, 0);
});

test('Rule 5 (Supabase profiles Table Integration): Fetches and updates bonus_balance, total_turnover_required, current_turnover, and has_used_bft100 directly in profiles table', async () => {
  let dbProfileRow: Record<string, any> = {
    id: baseProfile.id,
    email: baseProfile.email,
    self_balance: 200,
    self_capital_balance: 200,
    bonus_balance: 0,
    total_turnover_required: 0,
    current_turnover: 0,
    has_used_bft100: false,
  };

  const fakeSupabase: any = {
    from: (table: string) => {
      assert.equal(table, 'profiles');
      return {
        select: () => ({
          eq: (_col: string, val: any) => ({
            maybeSingle: async () => ({
              data: String(val) === dbProfileRow.id ? { ...dbProfileRow } : null,
              error: null,
            }),
          }),
          ilike: (_col: string, val: any) => ({
            maybeSingle: async () => ({
              data: String(val).toLowerCase() === dbProfileRow.email ? { ...dbProfileRow } : null,
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, any>) => ({
          eq: (_col: string, val: any) => ({
            select: async () => {
              if (String(val) === dbProfileRow.id) {
                dbProfileRow = { ...dbProfileRow, ...payload };
              }
              return { data: [{ ...dbProfileRow }], error: null };
            },
          }),
        }),
      };
    },
  };

  // 1. Activate BFT100 on a $200 deposit
  const actRes = await activateBft100BonusInSupabase({
    userProfile: { ...baseProfile, selfBalance: 200 },
    depositAmount: 200,
    supabaseClient: fakeSupabase,
  });
  assert.equal(actRes.ok, true);
  assert.equal(actRes.bonusGranted, 200);
  assert.equal(actRes.turnoverRequired, 20000);
  assert.equal(dbProfileRow.bonus_balance, 200);
  assert.equal(dbProfileRow.total_turnover_required, 20000);
  assert.equal(dbProfileRow.current_turnover, 0);
  assert.equal(dbProfileRow.has_used_bft100, true);

  // 2. Attempting to activate BFT100 a second time for the same user is blocked by profiles.has_used_bft100
  const secondActRes = await activateBft100BonusInSupabase({
    userProfile: actRes.updatedProfile,
    depositAmount: 100,
    supabaseClient: fakeSupabase,
  });
  assert.equal(secondActRes.ok, false);
  assert.equal(dbProfileRow.bonus_balance, 200); // Unchanged

  // 3. Sync updated turnover and loss deduction back to profiles table
  await syncProfileBonusColumnsToSupabase({
    userId: baseProfile.id,
    userEmail: baseProfile.email,
    bonus_balance: 150,
    total_turnover_required: 20000,
    current_turnover: 1250,
    has_used_bft100: true,
    self_balance: 0,
    supabaseClient: fakeSupabase,
  });

  const fetchedState = await fetchProfileBonusStateFromSupabase({
    userId: baseProfile.id,
    userEmail: baseProfile.email,
    supabaseClient: fakeSupabase,
  });
  assert.equal(fetchedState.bonus_balance, 150);
  assert.equal(fetchedState.total_turnover_required, 20000);
  assert.equal(fetchedState.current_turnover, 1250);
  assert.equal(fetchedState.has_used_bft100, true);
  assert.equal(fetchedState.isTurnoverCompleted, false);
});

test('Rule 6 (Crypto Deposits & Admin Portal Integration): Uploads screenshot to deposit-receipts bucket, inserts into crypto_deposits with screenshot_url, and fetches/approves in Admin Portal', async () => {
  const cryptoDepositRows: any[] = [];
  let dbProfileRow: Record<string, any> = {
    id: baseProfile.id,
    email: baseProfile.email,
    self_balance: 50,
    self_capital_balance: 50,
    bonus_balance: 0,
    total_turnover_required: 0,
    current_turnover: 0,
    has_used_bft100: false,
  };

  let uploadedBucketName = '';
  let uploadedFilePath = '';

  const fakeSupabase: any = {
    storage: {
      from: (bucket: string) => {
        uploadedBucketName = bucket;
        return {
          upload: async (path: string, _file: any) => {
            uploadedFilePath = path;
            return { data: { path }, error: null };
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`,
            },
          }),
        };
      },
    },
    from: (table: string) => {
      if (table === 'crypto_deposits') {
        return {
          insert: (payload: Record<string, any>) => ({
            select: async () => {
              const created = {
                id: '88889999-1111-4222-8333-444455556666',
                ...payload,
                created_at: '2026-11-10T09:30:00.000Z',
              };
              cryptoDepositRows.unshift(created);
              return { data: [created], error: null };
            },
          }),
          select: () => ({
            order: async () => ({
              data: [...cryptoDepositRows],
              error: null,
            }),
          }),
          update: (payload: Record<string, any>) => ({
            eq: async (_col: string, val: any) => {
              const idx = cryptoDepositRows.findIndex((r) => String(r.id) === String(val));
              if (idx >= 0) {
                cryptoDepositRows[idx] = { ...cryptoDepositRows[idx], ...payload };
              }
              return { data: cryptoDepositRows[idx] ? [cryptoDepositRows[idx]] : [], error: null };
            },
          }),
        };
      }

      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, val: any) => ({
              maybeSingle: async () => ({
                data: String(val) === dbProfileRow.id ? { ...dbProfileRow } : null,
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, any>) => ({
            eq: (_col: string, val: any) => ({
              select: async () => {
                if (String(val) === dbProfileRow.id) {
                  dbProfileRow = { ...dbProfileRow, ...payload };
                }
                return { data: [{ ...dbProfileRow }], error: null };
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const mockBlob = new Blob(['fake-image-bytes'], { type: 'image/png' });
  (mockBlob as any).name = 'payment_proof.png';

  // 1. Submit crypto deposit with screenshot and BFT100 bonus code
  const submitRes = await submitCryptoDepositToSupabaseTable({
    userId: baseProfile.id,
    userEmail: baseProfile.email,
    userName: baseProfile.fullName,
    amount: 300,
    packageName: 'Self-Funded Deposit via USDT (TRC-20) ($300.00 + $300.00 BFT100 Bonus)',
    sku: 'DEPOSIT_USDT_TRC20_BFT100',
    accountType: 'self_funded',
    accountId: 'BFT-PERS-101',
    walletAddress: 'TLLn2X85UrcgYa4Cn3CCfHnspUg5asBVDo',
    network: 'USDT (TRC-20)',
    receiptFile: mockBlob,
    txHash: '0xabc123def456',
    bonusCode: 'BFT100',
    status: 'pending',
    supabaseClient: fakeSupabase,
  });

  assert.equal(submitRes.ok, true);
  assert.equal(uploadedBucketName, DEPOSIT_RECEIPTS_BUCKET);
  assert.match(uploadedFilePath, /payment_proof\.png$/);
  assert.match(
    submitRes.screenshotUrl || '',
    /https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/deposit-receipts\//
  );
  assert.equal(cryptoDepositRows.length, 1);
  assert.equal(cryptoDepositRows[0].screenshot_url, submitRes.screenshotUrl);
  assert.equal(cryptoDepositRows[0].receipt_url, submitRes.screenshotUrl);
  assert.equal(cryptoDepositRows[0].status, 'pending');

  // 2. Fetch pending deposits for Admin Portal from `crypto_deposits`
  const adminList = await fetchAdminCryptoDepositsFromSupabase({
    supabaseClient: fakeSupabase,
  });
  assert.equal(adminList.length, 1);
  assert.equal(adminList[0].id, '88889999-1111-4222-8333-444455556666');
  assert.equal(adminList[0].screenshot_url, submitRes.screenshotUrl);
  assert.equal(adminList[0].receipt_url, submitRes.screenshotUrl);
  assert.equal(adminList[0].amount, 300);

  // 3. Approve deposit in Admin Portal -> updates crypto_deposits status to 'approved' and credits profiles
  const approveRes = await approveAdminCryptoDepositInSupabase({
    deposit: adminList[0],
    supabaseClient: fakeSupabase,
  });
  assert.equal(approveRes.ok, true);
  assert.equal(cryptoDepositRows[0].status, 'approved');
  assert.equal(dbProfileRow.self_balance, 350); // $50 + $300 deposit
  assert.equal(dbProfileRow.bonus_balance, 300); // 100% BFT100 bonus
  assert.equal(dbProfileRow.total_turnover_required, 30000); // 100x bonus turnover
  assert.equal(dbProfileRow.has_used_bft100, true);
});

