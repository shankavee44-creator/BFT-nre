import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECT_USDT_TRC20_CONFIG,
  TRONGRID_API_KEY,
  OKX_USDT_TRC20_WALLET,
  TRONGRID_TRC20_ENDPOINT,
  isValidTrc20Address,
  resolveDepositAccountType,
  buildPackageSku,
  buildCryptoDepositPayload,
  buildSupabaseCryptoDepositRow,
  validateDirectDepositAmount,
  parseTrc20TransferAmount,
  isIncomingUsdtTrc20Transfer,
  matchPendingDepositToTronGridTx,
  parseChallengePackageFromDeposit,
  fetchTronGridTrc20Transfers,
  TronGridTrc20Transaction,
  buildSupabaseUserPurchasePayload,
  mapPurchaseRecord,
  mergeRealtimePurchase,
} from './directDeposit';
import {
  createCryptoDepositRecord,
  getCryptoDeposits,
  getPendingCryptoDeposits,
  verifyAndCompletePendingCryptoDepositsInDb,
  getAccountById,
  ensurePersonalLiveAccountForUser,
  createUserPurchaseRecord,
  getUserPurchases,
} from '../server/db';

test('Static USDT TRC-20 wallet address, TronGrid API key, and endpoint match official configuration', () => {
  assert.equal(DIRECT_USDT_TRC20_CONFIG.walletAddress, 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp');
  assert.equal(OKX_USDT_TRC20_WALLET, 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp');
  assert.equal(TRONGRID_API_KEY, '79784292-381c-42f7-b834-0f6d41b7b2e5');
  assert.equal(
    TRONGRID_TRC20_ENDPOINT,
    'https://api.trongrid.io/v1/accounts/TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp/transactions/trc20'
  );
  assert.equal(isValidTrc20Address(DIRECT_USDT_TRC20_CONFIG.walletAddress), true);
  assert.equal(
    DIRECT_USDT_TRC20_CONFIG.qrCodeImageUrl,
    '/assets/aistudio/WhatsApp_Image_2026-11-01_at_6.27.58_PM_1ba5a5ce.jpeg'
  );
});

test('resolveDepositAccountType normalizes challenge and self_funded account types', () => {
  assert.equal(resolveDepositAccountType('self_funded'), 'self_funded');
  assert.equal(resolveDepositAccountType('personal_live'), 'self_funded');
  assert.equal(resolveDepositAccountType('personal'), 'self_funded');
  assert.equal(resolveDepositAccountType('challenge'), 'challenge');
  assert.equal(resolveDepositAccountType('one-step'), 'challenge');
  assert.equal(resolveDepositAccountType('two-step'), 'challenge');
});

test('buildPackageSku generates deterministic SKUs for challenge and self_funded packages', () => {
  assert.equal(
    buildPackageSku({ accountType: 'challenge', tier: 'one-step', sizeOrAmount: 10000 }),
    'BFT-1S-10K'
  );
  assert.equal(
    buildPackageSku({ accountType: 'challenge', tier: 'two-step', sizeOrAmount: 25000 }),
    'BFT-2S-25K'
  );
  assert.equal(
    buildPackageSku({ accountType: 'challenge', tier: 'instant', sizeOrAmount: 50000 }),
    'BFT-INF-50K'
  );
  assert.equal(
    buildPackageSku({ accountType: 'self_funded', sizeOrAmount: 250 }),
    'BFT-SELF-250'
  );
});

test('buildCryptoDepositPayload and buildSupabaseCryptoDepositRow build pending record with exact amount, package_name, sku/package_sku, and account_type', () => {
  const challengePayload = buildCryptoDepositPayload({
    userId: 'usr_bft_001',
    amount: 89.4,
    packageName: 'One-Step Challenge ($10,000)',
    sku: 'BFT-1S-10K',
    accountType: 'challenge',
  });

  assert.equal(challengePayload.wallet_address, 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp');
  assert.equal(challengePayload.amount, 89.4);
  assert.equal(challengePayload.package_name, 'One-Step Challenge ($10,000)');
  assert.equal(challengePayload.sku, 'BFT-1S-10K');
  assert.equal(challengePayload.package_sku, 'BFT-1S-10K');
  assert.equal(challengePayload.account_type, 'challenge');
  assert.equal(challengePayload.status, 'pending');

  const supaRow = buildSupabaseCryptoDepositRow({
    userId: '00000000-0000-0000-0000-000000000001',
    amount: 89.4,
    packageName: 'One-Step Challenge ($10,000)',
    sku: 'BFT-1S-10K',
    accountType: 'challenge',
  });
  assert.deepEqual(supaRow, {
    user_id: '00000000-0000-0000-0000-000000000001',
    wallet_address: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
    amount: 89.4,
    package_name: 'One-Step Challenge ($10,000)',
    package_sku: 'BFT-1S-10K',
    account_type: 'challenge',
    status: 'pending',
  });
});

test('parseTrc20TransferAmount and matchPendingDepositToTronGridTx match amount and target wallet TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp', () => {
  const sampleTransfers: TronGridTrc20Transaction[] = [
    {
      transaction_id: 'tx_wrong_wallet_1111111111111111',
      to: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
      value: '89400000',
      token_info: { symbol: 'USDT', decimals: 6 },
    },
    {
      transaction_id: 'tx_valid_challenge_89400000_abcdef123456',
      from: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
      to: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
      value: '89400000', // 89.40 USDT (6 decimals)
      token_info: {
        symbol: 'USDT',
        address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        decimals: 6,
        name: 'Tether USD',
      },
    },
  ];

  assert.equal(parseTrc20TransferAmount(sampleTransfers[1]), 89.4);
  assert.equal(isIncomingUsdtTrc20Transfer(sampleTransfers[0]), false);
  assert.equal(isIncomingUsdtTrc20Transfer(sampleTransfers[1]), true);

  const matched = matchPendingDepositToTronGridTx(
    {
      id: 'DEP-TEST-001',
      wallet_address: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
      amount: 89.4,
      status: 'pending',
    },
    sampleTransfers,
    new Set()
  );

  assert.ok(matched);
  assert.equal(matched.transaction_id, 'tx_valid_challenge_89400000_abcdef123456');

  // Ensure claimed transaction_id cannot be matched twice
  const alreadyClaimed = new Set(['tx_valid_challenge_89400000_abcdef123456']);
  const duplicateMatch = matchPendingDepositToTronGridTx(
    {
      id: 'DEP-TEST-002',
      wallet_address: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
      amount: 89.4,
      status: 'pending',
    },
    sampleTransfers,
    alreadyClaimed
  );
  assert.equal(duplicateMatch, null);
});

test('fetchTronGridTrc20Transfers sends TRON-PRO-API-KEY header to official TronGrid endpoint', async () => {
  let capturedUrl = '';
  let capturedApiKey = '';

  const mockFetch = async (input: any, init?: any) => {
    capturedUrl = String(input);
    capturedApiKey = init?.headers?.['TRON-PRO-API-KEY'] || '';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [
          {
            transaction_id: 'tron_tx_001',
            to: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
            value: '250000000',
            token_info: { symbol: 'USDT', decimals: 6 },
          },
        ],
      }),
    } as any;
  };

  const result = await fetchTronGridTrc20Transfers({ fetchImpl: mockFetch });
  assert.equal(result.ok, true);
  assert.ok(
    capturedUrl.startsWith(
      'https://api.trongrid.io/v1/accounts/TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp/transactions/trc20'
    )
  );
  assert.equal(capturedApiKey, '79784292-381c-42f7-b834-0f6d41b7b2e5');
  assert.equal(result.transactions.length, 1);
  assert.equal(parseTrc20TransferAmount(result.transactions[0]), 250);
});

test('parseChallengePackageFromDeposit extracts tier, size, and tierName from SKU and package_name', () => {
  const pkg1 = parseChallengePackageFromDeposit({
    sku: 'BFT-1S-10K',
    package_name: '1-Step Blitz ($10,000)',
    amount: 89.4,
  });
  assert.equal(pkg1.tier, 'one-step');
  assert.equal(pkg1.size, 10000);

  const pkg2 = parseChallengePackageFromDeposit({
    sku: 'BFT-INF-50K',
    package_name: 'Instant Funding ($50,000)',
    amount: 299,
  });
  assert.equal(pkg2.tier, 'instant');
  assert.equal(pkg2.size, 50000);
});

test('verifyAndCompletePendingCryptoDepositsInDb updates deposit status to completed and activates challenge package or credits self-funded balance', () => {
  // 1. Create a pending challenge deposit (without an existing accountId so verifier provisions & activates it)
  const pendingChallenge = createCryptoDepositRecord({
    userId: 'usr_bft_001',
    amount: 149.25,
    packageName: '1-Step Blitz ($25,000)',
    sku: 'BFT-1S-25K',
    accountType: 'challenge',
  });
  assert.equal(pendingChallenge.status, 'pending');

  // 2. Create a pending self_funded deposit
  const personalBefore = ensurePersonalLiveAccountForUser('usr_bft_001');
  const balanceBefore = Number(personalBefore?.currentBalance || 0);

  const pendingSelfFunded = createCryptoDepositRecord({
    userId: 'usr_bft_001',
    accountId: personalBefore?.id,
    amount: 315.5,
    packageName: 'Self-Funded Live Deposit ($315.50 USDT)',
    sku: 'BFT-SELF-316',
    accountType: 'self_funded',
  });
  assert.equal(pendingSelfFunded.status, 'pending');

  // Ensure both appear in getPendingCryptoDeposits
  const pendingRows = getPendingCryptoDeposits('usr_bft_001');
  assert.ok(pendingRows.some((r) => r.id === pendingChallenge.id));
  assert.ok(pendingRows.some((r) => r.id === pendingSelfFunded.id));

  // 3. Simulate incoming TRC-20 transfers from TronGrid to TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp
  const tronGridTransfers: TronGridTrc20Transaction[] = [
    {
      transaction_id: `tx_challenge_${Date.now()}_01`,
      to: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
      value: '149250000', // 149.25 USDT
      token_info: { symbol: 'USDT', decimals: 6 },
    },
    {
      transaction_id: `tx_selffunded_${Date.now()}_02`,
      to: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
      value: '315500000', // 315.50 USDT
      token_info: { symbol: 'USDT', decimals: 6 },
    },
  ];

  const verification = verifyAndCompletePendingCryptoDepositsInDb(tronGridTransfers, {
    userId: 'usr_bft_001',
  });

  assert.ok(verification.matchedCount >= 2);

  // Verify both deposits are now 'completed'
  const allUserDeposits = getCryptoDeposits({ userId: 'usr_bft_001' });
  const updatedChallengeDep = allUserDeposits.find((d) => d.id === pendingChallenge.id);
  const updatedSelfFundedDep = allUserDeposits.find((d) => d.id === pendingSelfFunded.id);

  assert.equal(updatedChallengeDep?.status, 'completed');
  assert.ok(updatedChallengeDep?.account_id);

  // Verify the challenge package account was automatically activated with $25,000 size and 'one-step' tier
  const activatedChallengeAcc = getAccountById(updatedChallengeDep.account_id);
  assert.ok(activatedChallengeAcc);
  assert.equal(activatedChallengeAcc.status, 'active');
  assert.equal(activatedChallengeAcc.tier, 'one-step');
  assert.equal(activatedChallengeAcc.size, 25000);

  // Verify the self_funded deposit status is 'completed' and user's self-funded balance increased by $315.50
  assert.equal(updatedSelfFundedDep?.status, 'completed');
  const personalAfter = ensurePersonalLiveAccountForUser('usr_bft_001');
  assert.equal(
    Number(personalAfter?.currentBalance || 0),
    Number((balanceBefore + 315.5).toFixed(2))
  );
});

test('validateDirectDepositAmount enforces $10 - $100,000 USDT bounds', () => {
  assert.equal(validateDirectDepositAmount(5).valid, false);
  assert.equal(validateDirectDepositAmount(250).valid, true);
  assert.equal(validateDirectDepositAmount(150000).valid, false);
});

test('buildSupabaseUserPurchasePayload, mapPurchaseRecord, mergeRealtimePurchase, and createUserPurchaseRecord persist and normalize user purchases', () => {
  const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
    userId: '00000000-0000-0000-0000-000000000001',
    packageId: 'BFT-1S-25K',
    packageName: '1-Step Blitz ($25,000)',
    amount: 149.25,
    status: 'completed',
    accountType: 'challenge',
  });

  assert.equal(fullPayload.user_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(fullPayload.package_id, 'BFT-1S-25K');
  assert.equal(fullPayload.package_sku, 'BFT-1S-25K');
  assert.equal(fullPayload.package_name, '1-Step Blitz ($25,000)');
  assert.equal(fullPayload.amount, 149.25);
  assert.equal(fullPayload.package_amount, 149.25);
  assert.equal(fullPayload.status, 'completed');
  assert.deepEqual(corePayload, {
    user_id: '00000000-0000-0000-0000-000000000001',
    package_name: '1-Step Blitz ($25,000)',
    package_amount: 149.25,
  });

  // Verify SQLite persistence and retrieval
  const created = createUserPurchaseRecord({
    userId: 'usr_bft_001',
    packageId: 'BFT-2S-50K',
    packageName: '2-Step Pro ($50,000)',
    packageSku: 'BFT-2S-50K',
    amount: 249.5,
    accountType: 'challenge',
    status: 'completed',
  });

  assert.equal(created.package_id, 'BFT-2S-50K');
  assert.equal(created.amount, 249.5);
  assert.equal(created.status, 'completed');

  const userPurchases = getUserPurchases('usr_bft_001');
  assert.ok(userPurchases.some((p) => p.id === created.id));

  // Verify real-time merge deduplicates and updates status
  const mappedPending = mapPurchaseRecord({
    id: 'PUR-RT-01',
    user_id: 'usr_bft_001',
    package_id: 'BFT-1S-10K',
    package_name: '1-Step Blitz ($10,000)',
    amount: 89.4,
    status: 'pending',
    created_at: '2026-11-01T12:00:00.000Z',
  });
  const mappedCompleted = mapPurchaseRecord({
    id: 'PUR-RT-01',
    user_id: 'usr_bft_001',
    package_id: 'BFT-1S-10K',
    package_name: '1-Step Blitz ($10,000)',
    amount: 89.4,
    status: 'completed',
    created_at: '2026-11-01T12:00:00.000Z',
  });

  const merged = mergeRealtimePurchase([mappedPending], mappedCompleted);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'completed');
});

