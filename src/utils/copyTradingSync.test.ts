import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSelectedFollowerAccount,
  normalizeDbTradingAccountType,
  isPlaceholderOrUnselectedAccountValue,
  resolveCopierAccountId,
  evaluateCopySubscriptionLimits,
  mapCopyExecutedTradeRowToBinaryTrade,
  triggerCheckCopyTradeLimits,
  COPY_TRADE_HOUSE_PAYOUT_PERCENT,
  COPY_TRADE_FOLLOWER_WIN_PROBABILITY,
  liquidateOpenCopyTradesInFavorOfPlatform,
  recordPlatformRevenueFromCopyTrade,
  getPlatformCopyRevenuePoolState,
  cancelCopyTradingSubscriptionInSupabase,
  isSubscriptionStoppedLocally,
  clearStoppedSubscriptionLocally,
} from './copyTradingSync';
import { getCanonicalAccountDatabaseUuid, resolveCopierEligibilityForUser } from './copyTradingRules';
import type { TradingAccount, UserProfile } from '../types';

const SAMPLE_LIVE_UUID = '44444444-5555-4666-8777-888888888888';
const SAMPLE_PROFILE_UUID = '11111111-2222-4333-8444-555555555555';
const SAMPLE_SECOND_LIVE_UUID = '99999999-aaaa-4bbb-8ccc-dddddddddddd';

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'BFT-IF-50K',
    supabaseAccountId: SAMPLE_LIVE_UUID,
    loginId: 'BFT-50000',
    passwordHash: 'hash',
    tier: 'instant',
    accountType: 'instant',
    tierName: '$50K Instant Funded',
    size: 50000,
    initialBalance: 50000,
    currentBalance: 50000,
    startingDayEquity: 50000,
    equity: 50000,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    profitTargetPercent: 0,
    status: 'active',
    breachType: 'none',
    phase: 'funded',
    tradingDaysCompleted: 1,
    tradesCount: 2,
    winRate: 75,
    createdDate: '2026-01-01',
    lastActiveDate: '2026-01-02',
    ...overrides,
  };
}

const sampleProfile: UserProfile = {
  id: SAMPLE_PROFILE_UUID,
  email: 'trader@bft.com',
  fullName: 'Test Trader',
  country: 'India',
  avatarUrl: '',
  telegramHandle: '@testtrader',
  twoFactorEnabled: false,
  activeAccountId: SAMPLE_LIVE_UUID,
  referralCode: 'BFT123',
  kycStatus: 'verified',
  selfBalance: 500,
  demoBalance: 10000,
  fundedBalance: 50000,
};

describe('Copy Trading Follower Account Resolution & Active Live Account UUID Fallback', () => {
  it('identifies placeholder or unselected dropdown values accurately', () => {
    assert.equal(isPlaceholderOrUnselectedAccountValue(''), true);
    assert.equal(isPlaceholderOrUnselectedAccountValue(null), true);
    assert.equal(isPlaceholderOrUnselectedAccountValue('select'), true);
    assert.equal(isPlaceholderOrUnselectedAccountValue('unselected'), true);
    assert.equal(isPlaceholderOrUnselectedAccountValue('-- Select Account --'), true);
    assert.equal(isPlaceholderOrUnselectedAccountValue(SAMPLE_LIVE_UUID), false);
  });

  it('maps selected follower account directly to its database UUID (supabaseAccountId)', () => {
    const demoAcc = makeAccount({
      id: 'BFT-DEMO',
      supabaseAccountId: undefined,
      tier: 'demo',
      accountType: 'demo',
      phase: 'demo',
      tierName: 'Demo Practice',
    });
    const fundedAcc = makeAccount({
      id: 'BFT-IF-50K',
      supabaseAccountId: SAMPLE_LIVE_UUID,
    });

    const resolved = resolveSelectedFollowerAccount({
      selectedCopyAccountId: SAMPLE_LIVE_UUID,
      accounts: [demoAcc, fundedAcc],
      activeAccount: fundedAcc,
      userProfile: sampleProfile,
    });

    assert.equal(resolved.targetAccount?.id, 'BFT-IF-50K');
    assert.equal(resolved.dbAccountId, SAMPLE_LIVE_UUID);
    assert.equal(resolved.selectedOptionValue, SAMPLE_LIVE_UUID);
  });

  it('automatically falls back to the currently active live account UUID from global context when unselected or placeholder', () => {
    const demoAcc = makeAccount({
      id: 'BFT-DEMO',
      supabaseAccountId: undefined,
      tier: 'demo',
      accountType: 'demo',
      phase: 'demo',
      tierName: 'Demo Practice',
    });
    const activeLiveAcc = makeAccount({
      id: 'BFT-IF-100K',
      supabaseAccountId: SAMPLE_SECOND_LIVE_UUID,
      size: 100000,
      initialBalance: 100000,
      currentBalance: 102400,
      equity: 102400,
      tierName: '$100K Instant Funded',
    });

    const resolvedWhenEmpty = resolveSelectedFollowerAccount({
      selectedCopyAccountId: '',
      accounts: [demoAcc],
      activeAccount: activeLiveAcc,
      userProfile: sampleProfile,
    });

    assert.equal(resolvedWhenEmpty.targetAccount?.id, 'BFT-IF-100K');
    assert.equal(resolvedWhenEmpty.dbAccountId, SAMPLE_SECOND_LIVE_UUID);

    const resolvedWhenPlaceholder = resolveSelectedFollowerAccount({
      selectedCopyAccountId: 'select',
      accounts: [demoAcc, activeLiveAcc],
      activeAccount: activeLiveAcc,
      userProfile: sampleProfile,
    });

    assert.equal(resolvedWhenPlaceholder.targetAccount?.id, 'BFT-IF-100K');
    assert.equal(resolvedWhenPlaceholder.dbAccountId, SAMPLE_SECOND_LIVE_UUID);
  });

  it('extracts the database UUID even if a formatted label string was passed instead of value', () => {
    const fundedAcc = makeAccount({
      id: 'BFT-IF-50K',
      supabaseAccountId: SAMPLE_LIVE_UUID,
      tierName: '$50K Instant Funded',
    });

    const resolved = resolveSelectedFollowerAccount({
      selectedCopyAccountId: '$50K Instant Funded ($50,000) — ELIGIBLE',
      accounts: [fundedAcc],
      activeAccount: fundedAcc,
      userProfile: sampleProfile,
    });

    assert.equal(resolved.targetAccount?.id, 'BFT-IF-50K');
    assert.equal(resolved.dbAccountId, SAMPLE_LIVE_UUID);
  });

  it('maps Personal Live account without supabaseAccountId to the authenticated user profile UUID', () => {
    const personalLiveAcc = makeAccount({
      id: 'BFT-PERS-LIVE',
      supabaseAccountId: undefined,
      tier: 'personal',
      accountType: 'personal',
      phase: 'personal_live',
      tierName: 'Personal Live Balance (Self-Funded)',
      size: 500,
      initialBalance: 500,
      currentBalance: 500,
      equity: 500,
    });

    const canonicalUuid = getCanonicalAccountDatabaseUuid(personalLiveAcc, sampleProfile);
    assert.equal(canonicalUuid, SAMPLE_PROFILE_UUID);

    const resolved = resolveSelectedFollowerAccount({
      selectedCopyAccountId: '',
      accounts: [personalLiveAcc],
      activeAccount: personalLiveAcc,
      userProfile: sampleProfile,
    });

    assert.equal(resolved.targetAccount?.id, 'BFT-PERS-LIVE');
    assert.equal(resolved.dbAccountId, SAMPLE_PROFILE_UUID);
  });

  it('normalizes frontend account categories into valid trading_accounts DB types', () => {
    assert.deepEqual(normalizeDbTradingAccountType('instant_funded'), {
      accountType: 'instant',
      challengePhase: 'funded',
    });
    assert.deepEqual(normalizeDbTradingAccountType('self_capital'), {
      accountType: 'personal',
      challengePhase: 'personal_live',
    });
  });

  it('resolveCopierEligibilityForUser matches selectedAccountId by supabaseAccountId or canonical UUID', () => {
    const fundedAcc = makeAccount({
      id: 'BFT-IF-50K',
      supabaseAccountId: SAMPLE_LIVE_UUID,
    });

    const eligibility = resolveCopierEligibilityForUser({
      selectedAccountId: SAMPLE_LIVE_UUID,
      accounts: [fundedAcc],
      userProfile: sampleProfile,
      targetProviderCategory: 'instant_funded',
    });

    assert.equal(eligibility.selectedAccount?.id, 'BFT-IF-50K');
    assert.equal(eligibility.selectedResult.eligible, true);
  });

  it('resolveCopierAccountId never returns null when valid user/account UUIDs are provided', async () => {
    const resolvedId = await resolveCopierAccountId({
      userId: SAMPLE_PROFILE_UUID,
      accountId: SAMPLE_LIVE_UUID,
      supabaseAccountId: SAMPLE_LIVE_UUID,
      accountType: 'instant_funded',
      startingBalance: 50000,
      currentBalance: 50000,
    });

    assert.ok(resolvedId, 'Expected a non-null UUID');
    assert.equal(resolvedId, SAMPLE_LIVE_UUID);
  });

  it('maps copy_executed_trades row into a seamless BinaryTrade with 78% house-edge payout and no bot text', () => {
    assert.equal(COPY_TRADE_HOUSE_PAYOUT_PERCENT, 78);
    assert.equal(COPY_TRADE_FOLLOWER_WIN_PROBABILITY, 0.46);

    const mapped = mapCopyExecutedTradeRowToBinaryTrade(
      {
        id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
        subscription_id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
        copier_user_id: SAMPLE_PROFILE_UUID,
        copier_account_id: SAMPLE_LIVE_UUID,
        provider_id: '55555555-6666-4777-8888-999999999999',
        asset_symbol: 'EUR/USD',
        trade_type: 'CALL',
        amount: 150,
        entry_price: 1.085,
        exit_price: 1.0858,
        status: 'WIN',
        pnl: 117,
        created_at: '2026-11-05T10:00:00.000Z',
      },
      'instant'
    );

    assert.equal(mapped.asset, 'EUR/USD');
    assert.equal(mapped.direction, 'CALL');
    assert.equal(mapped.investment, 150);
    assert.equal(mapped.payoutPercentage, 78);
    assert.equal(mapped.potentialPayout, 267);
    assert.equal(mapped.strikePrice, 1.085);
    assert.equal(mapped.closePrice, 1.0858);
    assert.equal(mapped.status, 'won');
    assert.equal(mapped.pnl, 117);
    assert.equal(mapped.accountId, SAMPLE_LIVE_UUID);
  });

  it('evaluates check_copy_trade_limits stop_loss, take_profit, and max_drawdown accurately', () => {
    const sub = {
      stop_loss: 250,
      take_profit: 500,
      max_drawdown: 5.0,
    };

    const withinLimits = evaluateCopySubscriptionLimits({
      subscription: sub,
      realizedPnl: 120,
      floatingPnl: 0,
      accountStartingBalance: 50000,
    });
    assert.equal(withinLimits.breached, false);

    const hitStopLoss = evaluateCopySubscriptionLimits({
      subscription: sub,
      realizedPnl: -200,
      floatingPnl: -60,
      accountStartingBalance: 50000,
    });
    assert.equal(hitStopLoss.breached, true);
    assert.equal(hitStopLoss.reason, 'stop_loss');

    const hitTakeProfit = evaluateCopySubscriptionLimits({
      subscription: sub,
      realizedPnl: 520,
      floatingPnl: 0,
      accountStartingBalance: 50000,
    });
    assert.equal(hitTakeProfit.breached, true);
    assert.equal(hitTakeProfit.reason, 'take_profit');

    const hitMaxDrawdown = evaluateCopySubscriptionLimits({
      subscription: { stop_loss: 0, take_profit: 0, max_drawdown: 5.0 },
      realizedPnl: -300,
      floatingPnl: 0,
      accountStartingBalance: 5000, // -300 / 5000 = 6.0% drawdown >= 5.0%
    });
    assert.equal(hitMaxDrawdown.breached, true);
    assert.equal(hitMaxDrawdown.reason, 'max_drawdown');
  });

  it('closes open positions securely in favor of the platform on Max Loss or Max Drawdown cutoff and transfers stakes to platform pool', async () => {
    const openTrades = [
      {
        id: '12121212-3434-4567-89ab-cdef01234567',
        subscription_id: '66666666-7777-4888-8999-aaaaaaaaaaaa',
        copier_user_id: SAMPLE_PROFILE_UUID,
        copier_account_id: SAMPLE_LIVE_UUID,
        provider_id: '55555555-6666-4777-8888-999999999999',
        asset_symbol: 'EUR/USD',
        trade_type: 'CALL',
        amount: 200,
        entry_price: 1.085,
        status: 'OPEN',
        pnl: 0,
      },
    ];

    const liq = liquidateOpenCopyTradesInFavorOfPlatform({
      openTrades,
      reason: 'stop_loss',
      currentPrice: 1.0842,
    });

    assert.equal(liq.closedRows.length, 1);
    assert.equal(liq.closedRows[0].status, 'LOSS');
    assert.equal(liq.closedRows[0].pnl, -200);
    assert.equal(liq.totalTransferredToPlatformPool, 200);

    const beforePool = getPlatformCopyRevenuePoolState();
    const rev = await recordPlatformRevenueFromCopyTrade({
      tradeId: '12121212-3434-4567-89ab-cdef01234567',
      subscriptionId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
      copierUserId: SAMPLE_PROFILE_UUID,
      copierAccountId: SAMPLE_LIVE_UUID,
      amount: 200,
      outcome: 'LOSS',
      reason: 'STOP_LOSS_CUTOFF',
    });

    assert.equal(rev.platformCreditDelta, 200);
    assert.equal(rev.followerBalanceDelta, -200);
    assert.equal(rev.poolState.poolBalance, Number((beforePool.poolBalance + 200).toFixed(2)));
    assert.equal(
      rev.poolState.totalLostStakesCaptured,
      Number((beforePool.totalLostStakesCaptured + 200).toFixed(2))
    );
    assert.equal(
      rev.poolState.totalCutoffLiquidations,
      Number((beforePool.totalCutoffLiquidations + 200).toFixed(2))
    );
  });

  it('triggerCheckCopyTradeLimits executes cleanly on price updates', async () => {
    const res = await triggerCheckCopyTradeLimits({
      userId: SAMPLE_PROFILE_UUID,
      accountId: SAMPLE_LIVE_UUID,
      assetSymbol: 'EUR/USD',
      currentPrice: 1.0854,
      accountStartingBalance: 50000,
      forceRpc: true,
    });

    assert.equal(res.triggered, true);
    assert.ok(Array.isArray(res.stoppedSubscriptionIds));
    assert.ok(Array.isArray(res.liquidatedTrades));
  });

  it('stops and deletes copy trading subscription cleanly via cancelCopyTradingSubscriptionInSupabase', async () => {
    const subId = '66666666-7777-4888-8999-aaaaaaaaaaaa';
    const providerId = 'CT-100105';

    const cancelRes = await cancelCopyTradingSubscriptionInSupabase({
      subscriptionId: subId,
      userId: SAMPLE_PROFILE_UUID,
      accountId: SAMPLE_LIVE_UUID,
      providerId,
      masterTraderId: providerId,
      providerName: 'QuantumFX Alpha',
    });

    assert.equal(cancelRes.ok, true);
    assert.equal(isSubscriptionStoppedLocally(subId, providerId), true);

    clearStoppedSubscriptionLocally([subId, providerId]);
    assert.equal(isSubscriptionStoppedLocally(subId, providerId), false);
  });
});



