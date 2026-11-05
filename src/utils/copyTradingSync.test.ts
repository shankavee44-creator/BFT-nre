import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSelectedFollowerAccount,
  normalizeDbTradingAccountType,
  isPlaceholderOrUnselectedAccountValue,
  resolveCopierAccountId,
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
});
