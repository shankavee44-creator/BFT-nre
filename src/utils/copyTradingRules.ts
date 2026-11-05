import { TradingAccount, BinaryTrade, UserProfile } from '../types';

export const MAX_COPIERS_PER_TRADER = 200;
export const MIN_PROVIDER_WIN_RATE_3M = 60;
export const ROTATION_INTERVAL_MINUTES = 45;
export const ROTATION_INTERVAL_MS = ROTATION_INTERVAL_MINUTES * 60 * 1000;
export const LEADERBOARD_TOP_LIMIT = 10;
export const TOTAL_TRADER_POOL_SIZE = 200;
export const ELIGIBLE_INSTANT_FUNDED_SIZES = [25000, 50000, 100000] as const;
export const MIN_SELF_CAPITAL_REAL_BALANCE = 100;
export const FOLLOWER_PROFIT_SHARE_PERCENT = 100;
export const MASTER_COMMISSION_PERCENT = 0;

export interface CopyTraderProfileData {
  id: string;
  numeric_id: string;
  user_id?: string;
  provider_name: string;
  country_code: string;
  country: string;
  flag: string;
  avatar_url: string;
  account_category: 'instant_funded' | 'self_capital';
  account_type_label: string;
  strategy_title: string;
  tier_name: string;
  vip_level: string;
  starting_balance: number;
  current_balance: number;
  all_time_withdrawals: number;
  lifetime_earnings: number;
  // Daily ROI ($ and %)
  daily_profit: number;
  daily_profit_pct: number;
  // Weekly ROI ($ and %)
  weekly_profit: number;
  weekly_profit_pct: number;
  // Monthly ROI ($ and %)
  monthly_profit: number;
  monthly_profit_pct: number;
  // 3-Month ROI ($ and %)
  three_month_profit: number;
  three_month_profit_pct: number;
  // Verification & Risk stats
  win_rate_3m: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  avg_holding_time: string;
  total_trades: number;
  current_copiers: number;
  max_copiers: number;
  commission_pct: number;
  follower_profit_keep_pct: number;
  rank?: number;
  is_custom_provider?: boolean;
}

export interface CopySubscriptionData {
  id: string;
  user_id?: string;
  provider_id: string;
  provider_numeric_id?: string;
  provider_name?: string;
  copier_account_id?: string;
  copier_account_type?: string;
  per_trade_allocation_type: 'amount' | 'percentage';
  per_trade_allocation_value: number;
  allocated_capital: number;
  max_loss_limit: number;
  take_profit_limit: number;
  trade_sizing_type: 'proportionate' | 'fixed';
  sizing_multiplier: number;
  status: 'active' | 'paused' | 'cancelled';
  current_pnl: number;
  commission_pct?: number;
  created_at?: number | string;
  stop_loss?: number;
  take_profit?: number;
  max_drawdown?: number;
}

export interface ProviderEligibilityResult {
  eligible: boolean;
  winRate90d: number;
  requiredWinRate: number;
  tradesEvaluated90d: number;
  code: 'ELIGIBLE' | 'WIN_RATE_BELOW_60';
  message: string;
}

export interface CopierEligibilityResult {
  eligible: boolean;
  code:
    | 'ELIGIBLE_INSTANT_FUNDED'
    | 'ELIGIBLE_SELF_CAPITAL'
    | 'CHALLENGE_ACCOUNT_BARRED'
    | 'INSTANT_FUNDED_BELOW_25K'
    | 'SELF_CAPITAL_BELOW_100'
    | 'DEMO_ACCOUNT_BARRED'
    | 'ACCOUNT_INACTIVE'
    | 'NO_ACCOUNT'
    | 'ACCOUNT_TYPE_MISMATCH';
  accountCategory: 'instant_funded' | 'self_capital' | 'challenge' | 'demo' | 'none';
  accountLabel: string;
  availableBalance: number;
  realSelfBalance?: number;
  reason: string;
}

export type CanonicalCopyAccountType = 'PERSONAL_LIVE' | 'INSTANT_FUNDED' | 'CHALLENGE' | 'DEMO';

export function resolveCanonicalCopyAccountType(
  accountOrCategory: any
): CanonicalCopyAccountType {
  if (!accountOrCategory) return 'DEMO';

  if (typeof accountOrCategory === 'string') {
    const raw = accountOrCategory.toLowerCase().trim();
    if (raw === 'demo') return 'DEMO';
    if (
      raw === 'personal' ||
      raw === 'personal_live' ||
      raw === 'self_funded' ||
      raw === 'self_capital' ||
      raw === 'real' ||
      raw.includes('personal') ||
      raw.includes('self')
    ) {
      return 'PERSONAL_LIVE';
    }
    if (
      raw === 'instant' ||
      raw === 'instant_funded' ||
      raw === 'funded' ||
      raw.includes('instant') ||
      raw.includes('funded')
    ) {
      return 'INSTANT_FUNDED';
    }
    if (
      raw === 'challenge' ||
      raw === 'one_step' ||
      raw === 'one-step' ||
      raw === 'two_step' ||
      raw === 'two-step' ||
      raw.includes('challenge') ||
      raw.includes('phase') ||
      raw.includes('step')
    ) {
      return 'CHALLENGE';
    }
    return 'DEMO';
  }

  const tier = String(accountOrCategory.tier || '').toLowerCase();
  const accountType = String(
    accountOrCategory.accountType || accountOrCategory.account_type || ''
  ).toLowerCase();
  const category = String(
    accountOrCategory.accountCategory ||
      accountOrCategory.account_category ||
      accountOrCategory.category ||
      ''
  ).toLowerCase();
  const label = String(
    accountOrCategory.account_type_label || accountOrCategory.tierName || ''
  ).toLowerCase();
  const id = String(accountOrCategory.id || '').toUpperCase();

  if (
    tier === 'demo' ||
    accountType === 'demo' ||
    category === 'demo' ||
    id.startsWith('BFT-DEMO') ||
    id === 'BFT-10000'
  ) {
    return 'DEMO';
  }

  if (
    tier === 'personal' ||
    accountType === 'personal' ||
    accountType === 'self_funded' ||
    category === 'personal_live' ||
    category === 'self_capital' ||
    category === 'self_funded' ||
    label.includes('personal') ||
    label.includes('self') ||
    id.includes('PERS')
  ) {
    return 'PERSONAL_LIVE';
  }

  if (
    tier === 'one-step' ||
    tier === 'two-step' ||
    accountType === 'one_step' ||
    accountType === 'two_step' ||
    accountType === 'challenge' ||
    category === 'challenge' ||
    label.includes('challenge') ||
    label.includes('phase') ||
    label.includes('step')
  ) {
    return 'CHALLENGE';
  }

  if (
    tier === 'instant' ||
    accountType === 'instant' ||
    accountType === 'funded' ||
    category === 'instant_funded' ||
    label.includes('instant') ||
    label.includes('funded') ||
    id.startsWith('BFT-')
  ) {
    return 'INSTANT_FUNDED';
  }

  return 'DEMO';
}

export function validateCopyTradingAccountTypeMatch(
  copierAccount: TradingAccount | null | undefined,
  masterTrader: CopyTraderProfileData | null | undefined
): {
  isMatch: boolean;
  copierType: CanonicalCopyAccountType;
  masterType: CanonicalCopyAccountType;
  error?: string;
  badgeLabel: string;
  badgeColor: string;
} {
  const copierType = resolveCanonicalCopyAccountType(copierAccount);
  const masterType = resolveCanonicalCopyAccountType(masterTrader);

  if (copierType === 'DEMO') {
    return {
      isMatch: false,
      copierType,
      masterType,
      error: 'Demo accounts cannot copy Master Traders. Please switch to an active Personal Live or Instant Funded account.',
      badgeLabel: 'Incompatible (Demo)',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
  }

  if (copierType === 'CHALLENGE') {
    return {
      isMatch: false,
      copierType,
      masterType,
      error: 'Account type mismatch: Challenge Evaluation accounts are not permitted to copy traders.',
      badgeLabel: 'Incompatible (Challenge)',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };
  }

  if (copierType === 'PERSONAL_LIVE') {
    if (masterType !== 'PERSONAL_LIVE') {
      return {
        isMatch: false,
        copierType,
        masterType,
        error: 'Account type mismatch: Personal Live accounts can only copy Personal Live traders.',
        badgeLabel: 'Incompatible (Needs Personal Live)',
        badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      };
    }
    return {
      isMatch: true,
      copierType,
      masterType,
      badgeLabel: 'Compatible (Personal Live)',
      badgeColor: 'bg-emerald-500/20 text-[#00F5A0] border-emerald-500/30',
    };
  }

  if (copierType === 'INSTANT_FUNDED') {
    if (masterType !== 'INSTANT_FUNDED') {
      return {
        isMatch: false,
        copierType,
        masterType,
        error: 'Account type mismatch: Instant Funded accounts can only copy Instant Funded traders.',
        badgeLabel: 'Incompatible (Needs Instant Funded)',
        badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      };
    }
    return {
      isMatch: true,
      copierType,
      masterType,
      badgeLabel: 'Compatible (Instant Funded)',
      badgeColor: 'bg-emerald-500/20 text-[#00F5A0] border-emerald-500/30',
    };
  }

  return {
    isMatch: false,
    copierType,
    masterType,
    error: 'Account type mismatch: Incompatible trading account type.',
    badgeLabel: 'Incompatible',
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  };
}

export interface CopyRiskValidationResult {
  valid: boolean;
  perTradeDollarAmount: number;
  perTradePercentOfBalance: number;
  maxLossStopUsd: number;
  targetProfitStopUsd: number;
  error?: string;
}

/**
 * 1. Provider Eligibility & Registration Gatekeeper
 * Enforces strict minimum 60% Win Rate over the last 3 months (90 days).
 */
export function evaluateProviderEligibility(params: {
  accounts?: TradingAccount[];
  trades?: BinaryTrade[];
  explicitWinRate90d?: number | null;
  nowMs?: number;
}): ProviderEligibilityResult {
  const now = params.nowMs ?? Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  let computedWinRate = 0;
  let tradesCount90d = 0;

  if (typeof params.explicitWinRate90d === 'number' && Number.isFinite(params.explicitWinRate90d)) {
    computedWinRate = Number(params.explicitWinRate90d.toFixed(2));
    tradesCount90d = 10;
  } else {
    const recentClosedTrades = (params.trades || []).filter((t) => {
      if (t.status !== 'won' && t.status !== 'lost') return false;
      if (t.accountTier === 'demo' || String(t.accountId || '').startsWith('BFT-DEMO')) return false;
      const tradeTime = t.endTime || t.startTime || now;
      return tradeTime >= ninetyDaysAgo;
    });

    if (recentClosedTrades.length > 0) {
      tradesCount90d = recentClosedTrades.length;
      const wins = recentClosedTrades.filter((t) => t.status === 'won').length;
      computedWinRate = Number(((wins / tradesCount90d) * 100).toFixed(2));
    } else if (Array.isArray(params.accounts) && params.accounts.length > 0) {
      // Check non-demo accounts that have recorded winRate
      const realAccounts = params.accounts.filter(
        (a) =>
          a.tier !== 'demo' &&
          a.phase !== 'demo' &&
          !String(a.id || '').startsWith('BFT-DEMO') &&
          typeof a.winRate === 'number' &&
          a.winRate > 0
      );
      if (realAccounts.length > 0) {
        const bestAcc = realAccounts.reduce((best, curr) =>
          (curr.winRate || 0) > (best.winRate || 0) ? curr : best
        );
        computedWinRate = Number((bestAcc.winRate || 0).toFixed(2));
        tradesCount90d = Math.max(1, bestAcc.tradesCount || 0);
      }
    }
  }

  if (computedWinRate < MIN_PROVIDER_WIN_RATE_3M) {
    return {
      eligible: false,
      winRate90d: computedWinRate,
      requiredWinRate: MIN_PROVIDER_WIN_RATE_3M,
      tradesEvaluated90d: tradesCount90d,
      code: 'WIN_RATE_BELOW_60',
      message: `Registration Blocked: Only traders with a proven minimum ${MIN_PROVIDER_WIN_RATE_3M}% Win Rate over the last 3 months (90 days) can join as a Copy Master / Provider. Your verified 90-day Win Rate is ${computedWinRate.toFixed(1)}%.`,
    };
  }

  return {
    eligible: true,
    winRate90d: computedWinRate,
    requiredWinRate: MIN_PROVIDER_WIN_RATE_3M,
    tradesEvaluated90d: tradesCount90d,
    code: 'ELIGIBLE',
    message: `Verified ${computedWinRate.toFixed(1)}% 90-Day Win Rate meets the ≥${MIN_PROVIDER_WIN_RATE_3M}% Master Trader threshold.`,
  };
}

/**
 * 2. Copier Account Eligibility Restrictions
 * - Challenge accounts (One-Step, Two-Step, Phase 1, Phase 2) are strictly barred from copying anyone.
 * - Funded accounts: Must hold an active Instant Funded account of $25K, $50K, or $100K only.
 *   Challenge accounts and Instant Funded accounts below $25K ($2.5K, $5K, $10K) are blocked.
 * - Self-Capital accounts: Must hold a real balance of at least $100 (excluding promotional bonus funds).
 */
export function evaluateSingleAccountCopyEligibility(params: {
  account?: TradingAccount | null;
  userProfile?: UserProfile | null;
  bonusFunds?: number;
  targetProviderCategory?: 'instant_funded' | 'self_capital';
}): CopierEligibilityResult {
  const { account, userProfile, bonusFunds = 0 } = params;

  if (!account) {
    return {
      eligible: false,
      code: 'NO_ACCOUNT',
      accountCategory: 'none',
      accountLabel: 'No Account Selected',
      availableBalance: 0,
      reason: 'Please select an active Instant Funded ($25K, $50K, or $100K) or Self-Capital ($100+ real balance) account to copy trades.',
    };
  }

  const tier = String(account.tier || '').toLowerCase();
  const accountType = String(account.accountType || '').toLowerCase();
  const category = String(account.accountCategory || '').toLowerCase();
  const phase = String(account.phase || account.challengePhase || '').toLowerCase();
  const id = String(account.id || '').toUpperCase();
  const status = String(account.status || 'active').toLowerCase();

  // Check Demo account
  if (tier === 'demo' || accountType === 'demo' || category === 'demo' || phase === 'demo' || id.startsWith('BFT-DEMO')) {
    return {
      eligible: false,
      code: 'DEMO_ACCOUNT_BARRED',
      accountCategory: 'demo',
      accountLabel: 'Demo Account',
      availableBalance: Number(account.currentBalance || 0),
      reason: 'Demo accounts cannot copy live Master Traders. Switch to an active Instant Funded ($25K / $50K / $100K) or Self-Capital ($100+ real balance) account.',
    };
  }

  // Check Self-Capital / Personal Live account
  const isSelfCapital =
    tier === 'personal' ||
    accountType === 'personal' ||
    accountType === 'self_funded' ||
    category === 'personal_live' ||
    phase === 'personal_live' ||
    id.includes('PERS');

  if (isSelfCapital) {
    const rawBalance =
      userProfile?.selfBalance !== undefined && userProfile?.selfBalance !== null
        ? Math.max(Number(userProfile.selfBalance), Number(account.currentBalance || 0))
        : Number(account.currentBalance ?? account.depositedCapital ?? account.initialBalance ?? 0);
    const cleanBonus = Math.max(0, Number(bonusFunds || 0));
    const realBalance = Number(Math.max(0, rawBalance - cleanBonus).toFixed(2));

    if (realBalance < MIN_SELF_CAPITAL_REAL_BALANCE) {
      return {
        eligible: false,
        code: 'SELF_CAPITAL_BELOW_100',
        accountCategory: 'self_capital',
        accountLabel: 'Self-Capital Account',
        availableBalance: realBalance,
        realSelfBalance: realBalance,
        reason: `Self-Capital Copy Restriction: You must hold a real balance of at least $${MIN_SELF_CAPITAL_REAL_BALANCE}.00 (excluding promotional bonus funds) to copy traders. Current real balance: $${realBalance.toFixed(2)}.`,
      };
    }

    return {
      eligible: true,
      code: 'ELIGIBLE_SELF_CAPITAL',
      accountCategory: 'self_capital',
      accountLabel: `Self-Capital ($${realBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      availableBalance: realBalance,
      realSelfBalance: realBalance,
      reason: 'Eligible Self-Capital account ($100+ real balance verified).',
    };
  }

  // Check Challenge Accounts (One-Step / Two-Step / Phase 1 / Phase 2) -> Strictly Barred!
  const isChallengeAccount =
    tier === 'one-step' ||
    tier === 'two-step' ||
    accountType === 'one_step' ||
    accountType === 'two_step' ||
    accountType === 'challenge' ||
    phase === 'phase_1' ||
    phase === 'phase_2' ||
    phase === 'step_1' ||
    phase === 'step_2' ||
    phase === 'evaluation';

  if (isChallengeAccount) {
    return {
      eligible: false,
      code: 'CHALLENGE_ACCOUNT_BARRED',
      accountCategory: 'challenge',
      accountLabel: account.tierName || 'Challenge Evaluation Account',
      availableBalance: Number(account.currentBalance || 0),
      reason: 'Challenge Account Barred: One-Step and Two-Step Challenge accounts are strictly prohibited from copying any trader. Only Instant Funded ($25K, $50K, $100K) or Self-Capital ($100+ real balance) accounts are permitted.',
    };
  }

  // Check Instant Funded account status
  const isActiveStatus = status === 'active' || status === 'funded' || status === 'passed';
  if (!isActiveStatus) {
    return {
      eligible: false,
      code: 'ACCOUNT_INACTIVE',
      accountCategory: 'instant_funded',
      accountLabel: account.tierName || 'Instant Funded Account',
      availableBalance: Number(account.currentBalance || 0),
      reason: `Account status is "${status}". Only active Instant Funded ($25K, $50K, $100K) accounts can copy traders.`,
    };
  }

  // Must be Instant Funded of $25K, $50K, or $100K ONLY
  const isInstantTier = tier === 'instant' || accountType === 'instant' || phase === 'funded';
  const accountSize = Number(account.size || account.initialBalance || 0);
  const isAllowedSize = (ELIGIBLE_INSTANT_FUNDED_SIZES as readonly number[]).includes(accountSize);

  if (!isInstantTier || !isAllowedSize) {
    return {
      eligible: false,
      code: 'INSTANT_FUNDED_BELOW_25K',
      accountCategory: 'instant_funded',
      accountLabel: `Instant Funded ($${accountSize.toLocaleString()})`,
      availableBalance: Number(account.currentBalance || accountSize),
      reason: `Funded Account Tier Restricted: Instant Funded accounts below $25,000 (your account: $${accountSize.toLocaleString()}) are blocked from copying traders. Follower must hold an active Instant Funded account of $25K, $50K, or $100K only.`,
    };
  }

  return {
    eligible: true,
    code: 'ELIGIBLE_INSTANT_FUNDED',
    accountCategory: 'instant_funded',
    accountLabel: `Instant Funded $${(accountSize / 1000).toFixed(0)}K`,
    availableBalance: Number(account.currentBalance || accountSize),
    reason: `Eligible active $${(accountSize / 1000).toFixed(0)}K Instant Funded account verified.`,
  };
}

/**
 * Resolves the best eligible copying account for a user or explains why their current account is blocked.
 */
export function resolveCopierEligibilityForUser(params: {
  selectedAccountId?: string;
  accounts: TradingAccount[];
  userProfile?: UserProfile | null;
  bonusFunds?: number;
  targetProviderCategory?: 'instant_funded' | 'self_capital';
}): {
  selectedResult: CopierEligibilityResult;
  selectedAccount: TradingAccount | null;
  eligibleAccounts: Array<{ account: TradingAccount; result: CopierEligibilityResult }>;
  allEvaluations: Array<{ account: TradingAccount; result: CopierEligibilityResult }>;
} {
  const { selectedAccountId, accounts = [], userProfile, bonusFunds = 0, targetProviderCategory } = params;

  const allEvaluations = accounts.map((account) => ({
    account,
    result: evaluateSingleAccountCopyEligibility({
      account,
      userProfile,
      bonusFunds,
      targetProviderCategory,
    }),
  }));

  const eligibleAccounts = allEvaluations.filter((item) => item.result.eligible);

  // If a specific account ID was chosen, evaluate it directly
  if (selectedAccountId) {
    const found = allEvaluations.find((item) => item.account.id === selectedAccountId);
    if (found) {
      return {
        selectedResult: found.result,
        selectedAccount: found.account,
        eligibleAccounts,
        allEvaluations,
      };
    }
  }

  // If user has an eligible account matching targetProviderCategory, prefer it
  if (targetProviderCategory && eligibleAccounts.length > 0) {
    const categoryMatch = eligibleAccounts.find(
      (item) => item.result.accountCategory === targetProviderCategory
    );
    if (categoryMatch) {
      return {
        selectedResult: categoryMatch.result,
        selectedAccount: categoryMatch.account,
        eligibleAccounts,
        allEvaluations,
      };
    }
  }

  if (eligibleAccounts.length > 0) {
    return {
      selectedResult: eligibleAccounts[0].result,
      selectedAccount: eligibleAccounts[0].account,
      eligibleAccounts,
      allEvaluations,
    };
  }

  // Otherwise return the most informative rejection (e.g. Challenge or <$25K Instant Funded or <$100 Self-Capital)
  const nonDemo = allEvaluations.filter((e) => e.result.code !== 'DEMO_ACCOUNT_BARRED');
  const primaryRejection = nonDemo[0] || allEvaluations[0];

  return {
    selectedResult: primaryRejection
      ? primaryRejection.result
      : evaluateSingleAccountCopyEligibility({ account: null, userProfile, bonusFunds }),
    selectedAccount: primaryRejection ? primaryRejection.account : null,
    eligibleAccounts: [],
    allEvaluations,
  };
}

/**
 * 3. Custom Copy Risk Management Parameters Validation
 */
export function validateCopyRiskSettings(params: {
  perTradeAllocationType: 'amount' | 'percentage';
  perTradeAllocationValue: number;
  maxLossStopUsd: number;
  targetProfitStopUsd: number;
  accountBalance: number;
  isInstantFunded?: boolean;
}): CopyRiskValidationResult {
  const {
    perTradeAllocationType,
    perTradeAllocationValue,
    maxLossStopUsd,
    targetProfitStopUsd,
    accountBalance,
    isInstantFunded = false,
  } = params;

  const cleanBalance = Math.max(0, Number(accountBalance || 0));
  if (cleanBalance <= 0) {
    return {
      valid: false,
      perTradeDollarAmount: 0,
      perTradePercentOfBalance: 0,
      maxLossStopUsd: 0,
      targetProfitStopUsd: 0,
      error: 'Account balance must be greater than $0 to allocate copy trades.',
    };
  }

  const rawVal = Number(perTradeAllocationValue || 0);
  const perTradeDollarAmount =
    perTradeAllocationType === 'percentage'
      ? Number(((rawVal / 100) * cleanBalance).toFixed(2))
      : Number(rawVal.toFixed(2));
  const perTradePercentOfBalance =
    perTradeAllocationType === 'percentage'
      ? Number(rawVal.toFixed(2))
      : Number(((rawVal / cleanBalance) * 100).toFixed(2));

  if (!Number.isFinite(rawVal) || perTradeDollarAmount < 1) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd,
      targetProfitStopUsd,
      error: 'Per-Trade Allocation must be at least $1.00.',
    };
  }

  if (perTradeDollarAmount > cleanBalance) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd,
      targetProfitStopUsd,
      error: `Per-Trade Allocation ($${perTradeDollarAmount.toFixed(2)}) cannot exceed available balance ($${cleanBalance.toFixed(2)}).`,
    };
  }

  if (isInstantFunded && perTradePercentOfBalance > 5) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd,
      targetProfitStopUsd,
      error: `Instant Funded Risk Rule: Per-Trade Allocation cannot exceed 5% of balance ($${(cleanBalance * 0.05).toFixed(2)} max per trade).`,
    };
  }

  const cleanMaxLoss = Number(maxLossStopUsd || 0);
  if (!Number.isFinite(cleanMaxLoss) || cleanMaxLoss < 5) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd: cleanMaxLoss,
      targetProfitStopUsd,
      error: 'Max Loss Stop (Stop Copying) must be at least $5.00.',
    };
  }

  if (cleanMaxLoss > cleanBalance) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd: cleanMaxLoss,
      targetProfitStopUsd,
      error: `Max Loss Stop ($${cleanMaxLoss.toFixed(2)}) cannot exceed your account balance ($${cleanBalance.toFixed(2)}).`,
    };
  }

  const cleanTakeProfit = Number(targetProfitStopUsd || 0);
  if (!Number.isFinite(cleanTakeProfit) || cleanTakeProfit < 5) {
    return {
      valid: false,
      perTradeDollarAmount,
      perTradePercentOfBalance,
      maxLossStopUsd: cleanMaxLoss,
      targetProfitStopUsd: cleanTakeProfit,
      error: 'Target Profit Stop (Take Profit) must be at least $5.00.',
    };
  }

  return {
    valid: true,
    perTradeDollarAmount,
    perTradePercentOfBalance,
    maxLossStopUsd: Number(cleanMaxLoss.toFixed(2)),
    targetProfitStopUsd: Number(cleanTakeProfit.toFixed(2)),
  };
}

/**
 * Deterministic hash helper
 */
export function deterministicHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

const FIRST_NAMES = [
  'Viktor', 'Kasun', 'Arjun', 'Elena', 'Liam', 'Marco', 'Faizul', 'Tariq', 'Zulkifli', 'Alexander',
  'Rashid', 'Nimal', 'Bilal', 'Mohamed', 'Azlan', 'Oliver', 'Sofia', 'Lucas', 'Emma', 'David',
  'Zoe', 'Hans', 'Yuki', 'Chen', 'Svetlana', 'Mateo', 'Aiden', 'Chloe', 'Ibrahim', 'Priya',
  'Rohan', 'Kenji', 'Fatima', 'Henrik', 'jaan', 'Diego', 'Amara', 'Nikolai', 'Zayd', 'Sora',
];

const LAST_NAMES = [
  'Vance', 'Perera', 'Malhotra', 'Rostova', 'Davies', 'Rossi', 'Islam', 'Al-Mansoor', 'Rahman', 'Sterling',
  'Al-Maktoum', 'Jayasinghe', 'Ahmed', 'Farhan', 'Shah', 'Mercer', 'Garcia', 'Bernard', 'Watson', 'Miller',
  'Chen', 'Müller', 'Sato', 'Wei', 'Petrova', 'Silva', 'Kowalski', 'Novak', 'Qureshi', 'Sharma',
  'Deshmukh', 'Takahashi', 'Al-Hashemi', 'Lindqvist', 'Vermeer', 'Mendoza', 'Okafor', 'Volkov', 'bin Zayed', 'Watanabe',
];

const COUNTRIES: Array<{ name: string; code: string; flag: string }> = [
  { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪' },
  { name: 'Sri Lanka', code: 'LK', flag: '🇱🇰' },
  { name: 'India', code: 'IN', flag: '🇮🇳' },
  { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬' },
  { name: 'United States', code: 'US', flag: '🇺🇸' },
  { name: 'Malaysia', code: 'MY', flag: '🇲🇾' },
  { name: 'Qatar', code: 'QA', flag: '🇶🇦' },
  { name: 'Germany', code: 'DE', flag: '🇩🇪' },
  { name: 'Switzerland', code: 'CH', flag: '🇨🇭' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵' },
  { name: 'Italy', code: 'IT', flag: '🇮🇹' },
  { name: 'Pakistan', code: 'PK', flag: '🇵🇰' },
  { name: 'Bangladesh', code: 'BD', flag: '🇧🇩' },
  { name: 'Canada', code: 'CA', flag: '🇨🇦' },
  { name: 'Australia', code: 'AU', flag: '🇦🇺' },
  { name: 'France', code: 'FR', flag: '🇫🇷' },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷' },
  { name: 'Spain', code: 'ES', flag: '🇪🇸' },
  { name: 'Russia', code: 'RU', flag: '🇷🇺' },
];

const STRATEGY_DESCRIPTORS = [
  'Institutional OTC Alpha',
  'London Session Momentum',
  'Gold & FX Liquidity Scalper',
  'NY Open Volatility Breakout',
  'Algorithmic Mean Reversion',
  'High-Frequency Binary Pulse',
  'Asian Session Range Sniper',
  'Macro Currency Flow Engine',
  'Multi-Asset Price Action',
  'Smart Money Orderblock Pro',
];

/**
 * Generates the authoritative pool of 200 Master Copy Traders
 * (100 Instant Funded + 100 Self-Capital) with unique numeric IDs (100101 - 100300)
 * and 45-minute dynamic profit & rank rotation.
 */
export function generate200TraderPool(nowMs: number = Date.now()): CopyTraderProfileData[] {
  const rotationSlot = Math.floor(nowMs / ROTATION_INTERVAL_MS);
  const startOfUtcDay = new Date(nowMs);
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const elapsedMsToday = Math.max(0, nowMs - startOfUtcDay.getTime());
  // Smooth progression from morning (0.30 baseline at 00:00 UTC) to evening (1.00 at 23:59 UTC)
  const dayProgress = Math.min(1, elapsedMsToday / (24 * 60 * 60 * 1000));
  const intradayMultiplier = 0.32 + 0.68 * dayProgress;

  const pool: CopyTraderProfileData[] = [];

  // Featured flagship traders at fixed indices so well-known names exist in the 200 pool
  const featuredOverrides: Record<
    number,
    {
      name: string;
      countryIdx: number;
      category: 'instant_funded' | 'self_capital';
      startingBalance: number;
      strategy: string;
    }
  > = {
    0: { name: 'Viktor Vance', countryIdx: 0, category: 'instant_funded', startingBalance: 100000, strategy: 'Institutional Alpha $100K' },
    1: { name: 'Kasun Perera', countryIdx: 1, category: 'instant_funded', startingBalance: 50000, strategy: 'Colombo Gold Scalper $50K' },
    2: { name: 'Arjun Malhotra', countryIdx: 2, category: 'instant_funded', startingBalance: 100000, strategy: 'Mumbai Nifty Alpha $100K' },
    3: { name: 'Liam Davies', countryIdx: 3, category: 'instant_funded', startingBalance: 50000, strategy: 'London Forex Scalp $50K' },
    4: { name: 'Zulkifli Rahman', countryIdx: 6, category: 'instant_funded', startingBalance: 25000, strategy: 'Kuala Lumpur Breakout $25K' },
    100: { name: 'Marco Rossi', countryIdx: 11, category: 'self_capital', startingBalance: 10000, strategy: 'Milan OTC Scalper' },
    101: { name: 'Elena Rostova', countryIdx: 19, category: 'self_capital', startingBalance: 15000, strategy: 'Siberian Gold Rush' },
    102: { name: 'Nimal Jayasinghe', countryIdx: 1, category: 'self_capital', startingBalance: 5000, strategy: 'Kandy Forex Syndicate' },
    103: { name: 'Bilal Ahmed', countryIdx: 12, category: 'self_capital', startingBalance: 8000, strategy: 'Karachi Crypto Surge' },
    104: { name: 'Alexander Sterling', countryIdx: 5, category: 'self_capital', startingBalance: 20000, strategy: 'Wall Street Index Pro' },
  };

  for (let i = 0; i < TOTAL_TRADER_POOL_SIZE; i++) {
    const isInstant = i < 100;
    const category: 'instant_funded' | 'self_capital' = isInstant ? 'instant_funded' : 'self_capital';
    const numericId = String(100101 + i); // 100101 .. 100300
    const id = isInstant ? `trd_if_${numericId}` : `trd_sc_${numericId}`;
    const seed = deterministicHash(`${id}_base`);
    const slotSeed = deterministicHash(`${id}_slot_${rotationSlot}`);

    const override = featuredOverrides[i];
    const firstName = FIRST_NAMES[(i * 7 + (seed % 13)) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(i * 11 + (seed % 17)) % LAST_NAMES.length];
    const providerName = override ? override.name : `${firstName} ${lastName}`;

    const countryObj = override
      ? COUNTRIES[override.countryIdx]
      : COUNTRIES[(i * 3 + (seed % 7)) % COUNTRIES.length];

    const startingBalance = override
      ? override.startingBalance
      : isInstant
      ? ELIGIBLE_INSTANT_FUNDED_SIZES[i % ELIGIBLE_INSTANT_FUNDED_SIZES.length]
      : [1000, 2500, 5000, 8000, 10000, 15000, 25000][i % 7];

    const strategyTitle = override
      ? override.strategy
      : `${STRATEGY_DESCRIPTORS[i % STRATEGY_DESCRIPTORS.length]} #${(i % 50) + 1}`;

    // 45-minute dynamic surge factor: different traders surge into the Top 10 every 45 minutes
    const surgeWave = ((slotSeed % 1000) / 1000); // 0.0 to 1.0
    const isSurgingInThis45mSlot = (slotSeed % 12) === 0; // ~16-18 traders per category peak each 45m window
    const dailyRoiBasePct = isInstant
      ? (1.8 + (seed % 45) / 10) * (isSurgingInThis45mSlot ? 1.85 + surgeWave * 0.7 : 0.55 + surgeWave * 0.65)
      : (3.2 + (seed % 85) / 10) * (isSurgingInThis45mSlot ? 1.9 + surgeWave * 0.8 : 0.5 + surgeWave * 0.65);

    const dailyProfitPct = Number((dailyRoiBasePct * intradayMultiplier).toFixed(2));
    const dailyProfit = Number(((dailyProfitPct / 100) * startingBalance).toFixed(2));

    // Weekly, Monthly, and 3-Month ROI ($ and %)
    const weeklyProfitPct = Number((dailyProfitPct * (3.2 + ((seed % 25) / 10))).toFixed(2));
    const weeklyProfit = Number(((weeklyProfitPct / 100) * startingBalance).toFixed(2));

    const monthlyProfitPct = Number((weeklyProfitPct * (2.6 + ((seed % 18) / 10))).toFixed(2));
    const monthlyProfit = Number(((monthlyProfitPct / 100) * startingBalance).toFixed(2));

    const threeMonthProfitPct = Number((monthlyProfitPct * (2.4 + ((seed % 16) / 10))).toFixed(2));
    const threeMonthProfit = Number(((threeMonthProfitPct / 100) * startingBalance).toFixed(2));

    // Current balance & all-time withdrawals
    const retainedGain = Number((monthlyProfit * 0.35 + dailyProfit).toFixed(2));
    const currentBalance = Number((startingBalance + retainedGain).toFixed(2));
    const allTimeWithdrawals = Number((threeMonthProfit * 0.78).toFixed(2));

    // Proven >= 60% 3-month win rate (62.4% to 89.4%)
    const winRate3m = Number((62.4 + ((seed % 270) / 10)).toFixed(1));
    const profitFactor = Number((1.75 + ((seed % 160) / 100)).toFixed(2));
    const maxDrawdown = Number((1.8 + ((seed % 55) / 10)).toFixed(1));
    const sharpeRatio = Number((1.55 + ((seed % 140) / 100)).toFixed(2));

    // Copiers strictly capped at 200 max (X / 200 Copiers)
    const baseCopiers = 38 + (seed % 148) + (isSurgingInThis45mSlot ? 12 : 0);
    const currentCopiers = Math.min(MAX_COPIERS_PER_TRADER, baseCopiers);

    const accountTypeLabel = isInstant
      ? `Instant Funded ($${(startingBalance / 1000).toFixed(0)}K)`
      : 'Self-Capital Live';

    const tierName = isInstant
      ? `$${(startingBalance / 1000).toFixed(0)}K Instant Funded`
      : 'Self-Capital Account';

    pool.push({
      id,
      numeric_id: numericId,
      user_id: `usr_provider_${numericId}`,
      provider_name: providerName,
      country_code: countryObj.code,
      country: countryObj.name,
      flag: countryObj.flag,
      avatar_url: countryObj.flag,
      account_category: category,
      account_type_label: accountTypeLabel,
      strategy_title: strategyTitle,
      tier_name: tierName,
      vip_level: startingBalance >= 100000 ? 'VIP Elite' : startingBalance >= 50000 ? 'VIP Pro' : 'Master Trader',
      starting_balance: startingBalance,
      current_balance: currentBalance,
      all_time_withdrawals: allTimeWithdrawals,
      lifetime_earnings: allTimeWithdrawals,
      daily_profit: dailyProfit,
      daily_profit_pct: dailyProfitPct,
      weekly_profit: weeklyProfit,
      weekly_profit_pct: weeklyProfitPct,
      monthly_profit: monthlyProfit,
      monthly_profit_pct: monthlyProfitPct,
      three_month_profit: threeMonthProfit,
      three_month_profit_pct: threeMonthProfitPct,
      win_rate_3m: winRate3m,
      profit_factor: profitFactor,
      max_drawdown: maxDrawdown,
      sharpe_ratio: sharpeRatio,
      avg_holding_time: `${1 + (seed % 6)}m ${15 + (seed % 40)}s`,
      total_trades: 240 + (seed % 1650),
      current_copiers: currentCopiers,
      max_copiers: MAX_COPIERS_PER_TRADER,
      commission_pct: MASTER_COMMISSION_PERCENT,
      follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    });
  }

  return pool;
}

/**
 * Computes 45-minute rotation metadata (current slot, seconds remaining until next 45m rotation)
 */
export function getRotationWindowInfo(nowMs: number = Date.now()): {
  rotationSlot: number;
  intervalMinutes: number;
  msUntilNextRotation: number;
  secondsUntilNextRotation: number;
  formattedCountdown: string;
} {
  const rotationSlot = Math.floor(nowMs / ROTATION_INTERVAL_MS);
  const nextRotationMs = (rotationSlot + 1) * ROTATION_INTERVAL_MS;
  const msUntilNextRotation = Math.max(0, nextRotationMs - nowMs);
  const secondsUntilNextRotation = Math.ceil(msUntilNextRotation / 1000);
  const mins = Math.floor(secondsUntilNextRotation / 60);
  const secs = secondsUntilNextRotation % 60;
  return {
    rotationSlot,
    intervalMinutes: ROTATION_INTERVAL_MINUTES,
    msUntilNextRotation,
    secondsUntilNextRotation,
    formattedCountdown: `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`,
  };
}

/**
 * Filters and ranks the 200-trader pool:
 * - If searchQuery is provided (e.g. numeric Trader ID "100105" or name), searches across ALL 200 traders
 *   so any trader in the 200-profile pool can be found immediately by their unique numeric ID.
 * - If no searchQuery is provided, filters by active category and returns strictly the Daily Top 10
 *   sorted by 24h daily_profit DESC.
 */
export function queryCopyTradersPool(params: {
  pool: CopyTraderProfileData[];
  category?: 'instant_funded' | 'self_capital' | 'all';
  searchQuery?: string;
  limit?: number;
}): {
  traders: CopyTraderProfileData[];
  totalPoolCount: number;
  isSearchActive: boolean;
} {
  const { pool, category = 'instant_funded', searchQuery = '', limit = LEADERBOARD_TOP_LIMIT } = params;
  const cleanQuery = String(searchQuery || '').trim();
  const numericOnlyQuery = cleanQuery.replace(/^#/, '').trim();

  if (cleanQuery.length > 0) {
    // Search across the entire 200-trader pool by unique numeric_id first (and name/id fallback)
    const matched = pool
      .filter((t) => {
        const matchesCategory = category === 'all' ? true : t.account_category === category;
        const matchesNumeric = String(t.numeric_id || '').includes(numericOnlyQuery);
        const matchesId = String(t.id || '').toLowerCase().includes(cleanQuery.toLowerCase());
        const matchesName = String(t.provider_name || '').toLowerCase().includes(cleanQuery.toLowerCase());
        // If user typed digits, match across all 200 traders regardless of tab if exact numeric ID matches, or within tab
        if (/^\d+$/.test(numericOnlyQuery)) {
          return matchesNumeric;
        }
        return matchesCategory && (matchesNumeric || matchesId || matchesName);
      })
      .sort((a, b) => {
        // Exact numeric_id match comes first, then by daily_profit DESC
        const aExact = String(a.numeric_id) === numericOnlyQuery ? 1 : 0;
        const bExact = String(b.numeric_id) === numericOnlyQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return (b.daily_profit || 0) - (a.daily_profit || 0);
      })
      .map((t, idx) => ({ ...t, rank: idx + 1 }));

    return {
      traders: matched.slice(0, Math.max(limit, 20)),
      totalPoolCount: pool.length,
      isSearchActive: true,
    };
  }

  const categoryFiltered =
    category === 'all' ? pool : pool.filter((t) => t.account_category === category);

  const ranked = [...categoryFiltered]
    .sort((a, b) => (b.daily_profit || 0) - (a.daily_profit || 0))
    .slice(0, limit)
    .map((t, idx) => ({
      ...t,
      rank: idx + 1,
    }));

  return {
    traders: ranked,
    totalPoolCount: pool.length,
    isSearchActive: false,
  };
}
