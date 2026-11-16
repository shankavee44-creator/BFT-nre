import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_TRADING_TOP_24H_TRADERS,
  ROTATION_INTERVAL_MS,
  generate200TraderPool,
  queryCopyTradersPool,
  computeDynamicTraderTimeframeStats,
  getRotatedTop24hTraders,
  validateCopyTradingAccountTypeMatch,
  evaluateSingleAccountCopyEligibility,
} from './copyTradingRules';
import {
  prepareRlsSafeTradePayload,
  createSupabaseTrade,
} from './supabaseTradeSync';

test('All traders use realistic human names from India, Bangladesh, Pakistan, Dubai, and Ukraine and maintain >= 60% win rate', () => {
  assert.equal(SOCIAL_TRADING_TOP_24H_TRADERS.length, 12);
  const allowedCodes = new Set(['IN', 'BD', 'PK', 'AE', 'UA']);

  for (const trader of SOCIAL_TRADING_TOP_24H_TRADERS) {
    assert.ok(trader.provider_name && !/^user\d+$/i.test(trader.provider_name));
    assert.ok(trader.display_handle && !/^user\d+$/i.test(trader.display_handle));
    assert.ok(allowedCodes.has(trader.country_code), `Unexpected country code: ${trader.country_code}`);
    assert.ok((trader.profitable_trades_pct ?? 0) >= 60, `Win rate below 60% for ${trader.provider_name}`);
    assert.ok((trader.win_rate_3m ?? 0) >= 60, `3m win rate below 60% for ${trader.provider_name}`);
  }

  const pool = generate200TraderPool();
  for (const trader of pool) {
    assert.ok(trader.provider_name && !/^user\d+$/i.test(trader.provider_name));
    assert.ok(trader.display_handle && !/^user\d+$/i.test(trader.display_handle));
    assert.ok(allowedCodes.has(trader.country_code));
    assert.ok((trader.profitable_trades_pct ?? 0) >= 60);
    assert.ok((trader.win_rate_3m ?? 0) >= 60);
  }
});

test('computeDynamicTraderTimeframeStats dynamically changes win rates and metrics across timeframes while keeping >= 60% floor', () => {
  const trader = SOCIAL_TRADING_TOP_24H_TRADERS[0];
  const timeframes = ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'All time'] as const;
  const winRates = new Set<number>();
  const tradesCounts = new Set<number>();

  for (const tf of timeframes) {
    const stats = computeDynamicTraderTimeframeStats(trader, tf);
    assert.ok(stats.profitableTradesPct >= 60, `Timeframe ${tf} win rate ${stats.profitableTradesPct}% < 60%`);
    winRates.add(stats.profitableTradesPct);
    tradesCounts.add(stats.trades);
  }

  assert.equal(winRates.size, 5, 'Expected each timeframe to have a distinct dynamic win rate');
  assert.ok(tradesCounts.size >= 4, 'Expected trades count to scale dynamically across timeframes');
});

test('Account type separation & capital rules enforce strict Self-Funded vs Funded copying', () => {
  const fundedTrader = SOCIAL_TRADING_TOP_24H_TRADERS.find((t) => t.account_category === 'instant_funded')!;
  const selfTrader = SOCIAL_TRADING_TOP_24H_TRADERS.find((t) => t.account_category === 'self_capital')!;

  const selfAccount: any = {
    id: 'BFT-PERS-1',
    tier: 'personal',
    accountType: 'self_funded',
    currentBalance: 150,
    status: 'active',
  };
  const funded25kAccount: any = {
    id: 'BFT-IF-25K',
    tier: 'instant',
    accountType: 'instant',
    size: 25000,
    initialBalance: 25000,
    currentBalance: 25000,
    status: 'active',
  };
  const funded10kAccount: any = {
    id: 'BFT-IF-10K',
    tier: 'instant',
    accountType: 'instant',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    status: 'active',
  };

  // Self-Funded can copy Self-Funded, cannot copy Funded
  assert.equal(validateCopyTradingAccountTypeMatch(selfAccount, selfTrader).isMatch, true);
  assert.equal(validateCopyTradingAccountTypeMatch(selfAccount, fundedTrader).isMatch, false);

  // Funded can copy Funded, cannot copy Self-Funded
  assert.equal(validateCopyTradingAccountTypeMatch(funded25kAccount, fundedTrader).isMatch, true);
  assert.equal(validateCopyTradingAccountTypeMatch(funded25kAccount, selfTrader).isMatch, false);

  // Funded must be >= $25K
  assert.equal(
    evaluateSingleAccountCopyEligibility({
      account: funded10kAccount,
      targetProviderCategory: 'instant_funded',
    }).eligible,
    false
  );
  assert.equal(
    evaluateSingleAccountCopyEligibility({
      account: funded25kAccount,
      targetProviderCategory: 'instant_funded',
    }).eligible,
    true
  );

  // Self-Funded must have >= $100 real capital excluding bonus
  assert.equal(
    evaluateSingleAccountCopyEligibility({
      account: { ...selfAccount, currentBalance: 120 },
      bonusFunds: 50,
      targetProviderCategory: 'self_capital',
    }).eligible,
    false
  );
  assert.equal(
    evaluateSingleAccountCopyEligibility({
      account: { ...selfAccount, currentBalance: 160 },
      bonusFunds: 50,
      targetProviderCategory: 'self_capital',
    }).eligible,
    true
  );
});

test('getRotatedTop24hTraders seamlessly rotates traders every 45 minutes', () => {
  const t0 = 1700000000000;
  const slot1 = getRotatedTop24hTraders(t0);
  const slot2 = getRotatedTop24hTraders(t0 + ROTATION_INTERVAL_MS);

  assert.equal(slot1.length, 12);
  assert.equal(slot2.length, 12);
  assert.notDeepEqual(
    slot1.map((t) => `${t.numeric_id}:${t.daily_profit}`),
    slot2.map((t) => `${t.numeric_id}:${t.daily_profit}`)
  );
});

test('queryCopyTradersPool finds social traders by numeric ID or human name', () => {
  const pool = generate200TraderPool();
  const byId = queryCopyTradersPool({ pool, searchQuery: '11101163' });
  assert.equal(byId.isSearchActive, true);
  assert.ok(byId.traders.length >= 1);
  assert.equal(byId.traders[0].numeric_id, '11101163');

  const byName = queryCopyTradersPool({ pool, category: 'all', searchQuery: 'Dmytro Bondarenko' });
  assert.ok(byName.traders.some((t) => t.provider_name === 'Dmytro Bondarenko'));
});

test('prepareRlsSafeTradePayload and createSupabaseTrade handle RLS 42501 and unauthenticated sessions cleanly', async () => {
  const initialPayload = {
    id: 'da15afaa-da15-4faa-afb0-0a0f2f7097ce',
    user_id: '13c8ccda-753a-4717-bee2-3c0536f1b110',
    asset_symbol: 'EUR/USD',
    trade_type: 'PUT',
    amount: 50,
    entry_price: 1.08404,
    duration_seconds: 60,
    status: 'OPEN',
    account_type: 'SELF_FUNDED',
    account_id: '1d61647f-8811-4b11-99ed-dceb48bcb3c0',
    created_at: '2026-11-15T14:57:30.556Z',
  };

  const rlsError = {
    code: '42501',
    message: 'new row violates row-level security policy for table "user_trades"',
  };

  const firstAttempt = prepareRlsSafeTradePayload(
    initialPayload,
    '13c8ccda-753a-4717-bee2-3c0536f1b110',
    rlsError
  );
  assert.equal(firstAttempt.mutated, true);
  assert.equal(firstAttempt.nextPayload.account_id, null);
  assert.equal(firstAttempt.nextPayload.user_id, '13c8ccda-753a-4717-bee2-3c0536f1b110');

  // Second call once account_id is already null should report mutated = false so circuit breaker stops retrying
  const secondAttempt = prepareRlsSafeTradePayload(
    firstAttempt.nextPayload,
    '13c8ccda-753a-4717-bee2-3c0536f1b110',
    rlsError
  );
  assert.equal(secondAttempt.mutated, false);

  // Unauthenticated createSupabaseTrade should return false cleanly without throwing or logging console.error
  const result = await createSupabaseTrade(
    {
      id: 'da15afaa-da15-4faa-afb0-0a0f2f7097ce',
      accountId: '1d61647f-8811-4b11-99ed-dceb48bcb3c0',
      asset: 'EUR/USD',
      direction: 'PUT',
      investment: 50,
      payoutPercentage: 85,
      potentialPayout: 42.5,
      strikePrice: 1.08404,
      currentPrice: 1.08404,
      startTime: Date.now(),
      endTime: Date.now() + 60000,
      durationSeconds: 60,
      status: 'active',
      accountTier: 'personal',
    },
    '13c8ccda-753a-4717-bee2-3c0536f1b110'
  );
  assert.equal(result, false);
});

