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
  // Social Trading UI fields
  social_profile_id?: string;
  display_handle?: string;
  full_legal_name?: string;
  profile_level?: string;
  account_level?: number;
  status_text?: string;
  followers_count?: number;
  watchers_count?: number;
  avatar_variant?:
    | 'gold_ring_silhouette'
    | 'blue_ring_silhouette'
    | 'vip_octagon_silhouette'
    | 'purple_ring_photo_1'
    | 'vip_octagon_flag_uz'
    | 'purple_ring_photo_2'
    | 'blue_ring_flag_tj'
    | 'vip_octagon_flag_ru'
    | 'vip_octagon_flag_tm';
  is_vip_badge?: boolean;
  trades_24h?: number;
  trades_today_profile?: number;
  profitable_trades_pct?: number;
  trading_turnover?: number;
  trading_profit?: number;
  max_trade?: number;
  min_trade?: number;
  max_profit?: number;
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
    | 'ACCOUNT_TYPE_MISMATCH'
    | 'ACCOUNT_INSUFFICIENT_BALANCE';
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
        error: 'Account type mismatch: Self-Funded (Personal Live) accounts can only copy Self-Funded traders.',
        badgeLabel: 'Incompatible (Needs Self-Funded)',
        badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      };
    }
    return {
      isMatch: true,
      copierType,
      masterType,
      badgeLabel: 'Compatible (Self-Funded)',
      badgeColor: 'bg-emerald-500/20 text-[#00F5A0] border-emerald-500/30',
    };
  }

  if (copierType === 'INSTANT_FUNDED') {
    if (masterType !== 'INSTANT_FUNDED') {
      return {
        isMatch: false,
        copierType,
        masterType,
        error: 'Account type mismatch: Funded accounts can only copy Funded traders.',
        badgeLabel: 'Incompatible (Needs Funded)',
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

  const validTargetCategory =
    params.targetProviderCategory === 'self_capital' ||
    params.targetProviderCategory === 'instant_funded'
      ? params.targetProviderCategory
      : undefined;

  if (isSelfCapital) {
    const rawBalance =
      userProfile?.selfBalance !== undefined && userProfile?.selfBalance !== null
        ? Math.max(Number(userProfile.selfBalance), Number(account.currentBalance || 0))
        : Number(account.currentBalance ?? account.depositedCapital ?? account.initialBalance ?? 0);
    const hasSeparateSelfBalance =
      userProfile?.selfBalance !== undefined && userProfile?.selfBalance !== null;
    const inferredBonus =
      Number(bonusFunds || 0) ||
      Number((account as any)?.bonusFunds ?? (userProfile as any)?.bonusFunds ?? 0) ||
      (!hasSeparateSelfBalance
        ? Number((account as any)?.bonusBalance ?? (userProfile as any)?.bonusBalance ?? 0)
        : 0);
    const cleanBonus = Math.max(0, inferredBonus);
    const realBalance = Number(Math.max(0, rawBalance - cleanBonus).toFixed(2));

    if (validTargetCategory && validTargetCategory !== 'self_capital') {
      return {
        eligible: false,
        code: 'ACCOUNT_TYPE_MISMATCH',
        accountCategory: 'self_capital',
        accountLabel: 'Self-Capital Account',
        availableBalance: realBalance,
        realSelfBalance: realBalance,
        reason: 'Account Type Restriction: Self-Funded accounts can only copy Self-Funded traders.',
      };
    }

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

  if (validTargetCategory && validTargetCategory !== 'instant_funded') {
    return {
      eligible: false,
      code: 'ACCOUNT_TYPE_MISMATCH',
      accountCategory: 'instant_funded',
      accountLabel: account.tierName || 'Instant Funded Account',
      availableBalance: Number(account.currentBalance || 0),
      reason: 'Account Type Restriction: Funded accounts can only copy Funded traders.',
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

  // Must be Instant Funded of $25K or higher ($25K, $50K, or $100K)
  const isInstantTier = tier === 'instant' || accountType === 'instant' || phase === 'funded';
  const accountSize = Number(account.size || account.initialBalance || 0);
  const isAllowedSize =
    accountSize >= 25000 && (ELIGIBLE_INSTANT_FUNDED_SIZES as readonly number[]).includes(accountSize);

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

  const curBal = Number(account.currentBalance ?? accountSize);
  if (curBal <= 0) {
    return {
      eligible: false,
      code: 'ACCOUNT_INSUFFICIENT_BALANCE',
      accountCategory: 'instant_funded',
      accountLabel: `Instant Funded $${(accountSize / 1000).toFixed(0)}K`,
      availableBalance: curBal,
      reason: 'Insufficient Account Balance: Your account balance is $0.00. Please deposit funds or select an active account with sufficient balance to copy trades.',
    };
  }

  return {
    eligible: true,
    code: 'ELIGIBLE_INSTANT_FUNDED',
    accountCategory: 'instant_funded',
    accountLabel: `Instant Funded $${(accountSize / 1000).toFixed(0)}K`,
    availableBalance: curBal,
    reason: `Eligible active $${(accountSize / 1000).toFixed(0)}K Instant Funded account verified.`,
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts the canonical database account UUID for a TradingAccount,
 * preferring `supabaseAccountId`, then a UUID `id`, or `userProfile.id` for personal live accounts.
 */
export function getCanonicalAccountDatabaseUuid(
  account?: TradingAccount | null,
  userProfile?: UserProfile | null
): string {
  if (!account) {
    if (userProfile?.id && UUID_PATTERN.test(String(userProfile.id).trim())) {
      return String(userProfile.id).trim();
    }
    return '';
  }

  const supaId = String(account.supabaseAccountId || '').trim();
  if (supaId && UUID_PATTERN.test(supaId)) {
    return supaId;
  }

  const rawId = String(account.id || '').trim();
  if (rawId && UUID_PATTERN.test(rawId)) {
    return rawId;
  }

  const canonicalType = resolveCanonicalCopyAccountType(account);
  if (
    canonicalType === 'PERSONAL_LIVE' &&
    userProfile?.id &&
    UUID_PATTERN.test(String(userProfile.id).trim())
  ) {
    return String(userProfile.id).trim();
  }

  return supaId || rawId;
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

  // If a specific account ID was chosen, evaluate it directly (matching id, supabaseAccountId, or canonical DB UUID)
  const cleanSelectedId = String(selectedAccountId || '').trim();
  const isPlaceholderSelection =
    !cleanSelectedId ||
    cleanSelectedId.toLowerCase() === 'select' ||
    cleanSelectedId.toLowerCase() === 'none' ||
    cleanSelectedId.toLowerCase() === 'unselected' ||
    cleanSelectedId.toLowerCase() === 'placeholder';

  if (!isPlaceholderSelection) {
    const found = allEvaluations.find((item) => {
      const accId = String(item.account.id || '').trim();
      const supaId = String(item.account.supabaseAccountId || '').trim();
      const canonicalUuid = getCanonicalAccountDatabaseUuid(item.account, userProfile);
      return (
        accId === cleanSelectedId ||
        (supaId && supaId === cleanSelectedId) ||
        (canonicalUuid && canonicalUuid === cleanSelectedId)
      );
    });
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

const REGIONAL_PROFILES: Array<{
  country: string;
  code: string;
  flag: string;
  firstNames: string[];
  lastNames: string[];
}> = [
  {
    country: 'India',
    code: 'IN',
    flag: '🇮🇳',
    firstNames: [
      'Aarav', 'Rajesh', 'Vikramaditya', 'Arjun', 'Rohan', 'Aditya', 'Siddharth', 'Karan',
      'Pranav', 'Nikhil', 'Ananya', 'Priya', 'Harsh', 'Devansh', 'Yash', 'Varun',
    ],
    lastNames: [
      'Sharma', 'Singhania', 'Deshmukh', 'Verma', 'Patel', 'Malhotra', 'Mehta', 'Kapoor',
      'Reddy', 'Nair', 'Chatterjee', 'Mukherjee', 'Iyer', 'Chauhan', 'Joshi', 'Kulkarni',
    ],
  },
  {
    country: 'Bangladesh',
    code: 'BD',
    flag: '🇧🇩',
    firstNames: [
      'Tanvir', 'Mahmudul', 'Rakibul', 'Shakil', 'Nusrat', 'Farhan', 'Sabbir', 'Tamim',
      'Mushfiq', 'Mehedi', 'Ashraful', 'Nayeem', 'Tawhid', 'Riyad', 'Fahim', 'Tahmid',
    ],
    lastNames: [
      'Ahmed', 'Chowdhury', 'Hasan', 'Mahmud', 'Jahan', 'Rahman', 'Hossain', 'Islam',
      'Talukder', 'Sikder', 'Bhuiyan', 'Uddin', 'Miah', 'Kazi', 'Akter', 'Sarkar',
    ],
  },
  {
    country: 'Pakistan',
    code: 'PK',
    flag: '🇵🇰',
    firstNames: [
      'Tariq', 'Kamran', 'Muhammad', 'Zain', 'Bilal', 'Usman', 'Hamza', 'Faisal',
      'Imran', 'Zubair', 'Shahid', 'Mustafa', 'Hassan', 'Saad', 'Fahad', 'Salman',
    ],
    lastNames: [
      'Qureshi', 'Malik', 'Khan', 'Ali', 'Tariq', 'Siddiqui', 'Raza', 'Abbasi',
      'Bukhari', 'Mirza', 'Farooqi', 'Chaudhry', 'Sheikh', 'Hashmi', 'Javed', 'Niazi',
    ],
  },
  {
    country: 'Dubai, UAE',
    code: 'AE',
    flag: '🇦🇪',
    firstNames: [
      'Rashid', 'Zayed', 'Hamdan', 'Saeed', 'Khalid', 'Mansoor', 'Majid', 'Omar',
      'Sultan', 'Nasser', 'Tariq', 'Faisal', 'Yousef', 'Abdullah', 'Marwan', 'Kareem',
    ],
    lastNames: [
      'Al-Maktoum', 'Al-Nuaimi', 'Al-Mansoori', 'Al-Hashemi', 'Al-Suwaidi', 'Al-Mazrouei',
      'Al-Qasimi', 'Al-Falasi', 'Al-Shamsi', 'Al-Zaabi', 'Al-Ketbi', 'Al-Muhairi',
    ],
  },
  {
    country: 'Ukraine',
    code: 'UA',
    flag: '🇺🇦',
    firstNames: [
      'Oleksandr', 'Dmytro', 'Artem', 'Maksym', 'Bohdan', 'Vladyslav', 'Andriy', 'Mykola',
      'Taras', 'Yaroslav', 'Kyrylo', 'Denys', 'Illia', 'Roman', 'Pavlo', 'Ruslan',
    ],
    lastNames: [
      'Kovalenko', 'Bondarenko', 'Shevchenko', 'Tkachenko', 'Kravchenko', 'Oliynyk',
      'Melnyk', 'Boiko', 'Savchenko', 'Rudenko', 'Moroz', 'Lysenko', 'Marchenko', 'Petrenko',
    ],
  },
];

const STRATEGY_DESCRIPTORS = [
  'Mumbai Institutional Nifty & FX',
  'Lahore Liquidity Pulse',
  'Dhaka Momentum Alpha',
  'Dubai DIFC Institutional Flow',
  'Kyiv Quantitative Volatility Engine',
  'Karachi OTC Flow Engine',
  'Chittagong Price Action',
  'Delhi Smart Money Breakout',
  'Islamabad Trend Sniper',
  'Lviv High-Frequency Scalper',
  'Abu Dhabi Orderblock Pro',
  'Bengaluru Algorithmic Momentum',
];

interface FeaturedTraderConfig {
  name: string;
  country: string;
  countryCode: string;
  flag: string;
  category: 'instant_funded' | 'self_capital';
  startingBalance: number;
  strategy: string;
  winRate3m: number;
  baseDailyProfit: number;
  copiers: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgHoldingTime: string;
}

/**
 * Generates the authoritative pool of 200 Master Copy Traders
 * (100 Instant Funded + 100 Self-Capital) with unique numeric IDs (100101 - 100300)
 * and 45-minute dynamic profit & rank rotation using realistic names from
 * India, Bangladesh, Pakistan, Dubai (UAE), and Ukraine.
 */
export function generate200TraderPool(nowMs: number = Date.now()): CopyTraderProfileData[] {
  const rotationSlot = Math.floor(nowMs / ROTATION_INTERVAL_MS);
  const startOfUtcDay = new Date(nowMs);
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const elapsedMsToday = Math.max(0, nowMs - startOfUtcDay.getTime());
  const dayProgress = Math.min(1, elapsedMsToday / (24 * 60 * 60 * 1000));
  const intradayMultiplier = 0.35 + 0.65 * dayProgress;

  const pool: CopyTraderProfileData[] = [];

  const featuredOverrides: Record<number, FeaturedTraderConfig> = {
    // Instant Funded Top Traders
    0: {
      name: 'Rajesh Sharma',
      country: 'India',
      countryCode: 'IN',
      flag: '🇮🇳',
      category: 'instant_funded',
      startingBalance: 100000,
      strategy: 'Mumbai Institutional Nifty & FX $100K',
      winRate3m: 81.6,
      baseDailyProfit: 26200,
      copiers: 192,
      totalTrades: 1480,
      profitFactor: 2.68,
      maxDrawdown: 2.6,
      sharpeRatio: 2.88,
      avgHoldingTime: '1m 15s',
    },
    1: {
      name: 'Rashid Al-Maktoum',
      country: 'Dubai, UAE',
      countryCode: 'AE',
      flag: '🇦🇪',
      category: 'instant_funded',
      startingBalance: 100000,
      strategy: 'Dubai DIFC Liquidity Pulse $100K',
      winRate3m: 79.8,
      baseDailyProfit: 24800,
      copiers: 184,
      totalTrades: 1360,
      profitFactor: 2.52,
      maxDrawdown: 2.9,
      sharpeRatio: 2.72,
      avgHoldingTime: '1m 20s',
    },
    2: {
      name: 'Tanvir Ahmed',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'instant_funded',
      startingBalance: 100000,
      strategy: 'Dhaka Momentum Alpha $100K',
      winRate3m: 78.4,
      baseDailyProfit: 23500,
      copiers: 178,
      totalTrades: 1290,
      profitFactor: 2.45,
      maxDrawdown: 3.1,
      sharpeRatio: 2.62,
      avgHoldingTime: '1m 25s',
    },
    3: {
      name: 'Oleksandr Kovalenko',
      country: 'Ukraine',
      countryCode: 'UA',
      flag: '🇺🇦',
      category: 'instant_funded',
      startingBalance: 100000,
      strategy: 'Kyiv Quantitative Scalper $100K',
      winRate3m: 77.2,
      baseDailyProfit: 22400,
      copiers: 170,
      totalTrades: 1220,
      profitFactor: 2.38,
      maxDrawdown: 3.3,
      sharpeRatio: 2.51,
      avgHoldingTime: '1m 30s',
    },
    4: {
      name: 'Tariq Mahmood Qureshi',
      country: 'Pakistan',
      countryCode: 'PK',
      flag: '🇵🇰',
      category: 'instant_funded',
      startingBalance: 50000,
      strategy: 'Karachi OTC Flow Engine $50K',
      winRate3m: 76.1,
      baseDailyProfit: 21200,
      copiers: 162,
      totalTrades: 1150,
      profitFactor: 2.30,
      maxDrawdown: 3.5,
      sharpeRatio: 2.42,
      avgHoldingTime: '1m 35s',
    },
    5: {
      name: 'Rakibul Hasan',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'instant_funded',
      startingBalance: 50000,
      strategy: 'Chittagong Price Action $50K',
      winRate3m: 75.3,
      baseDailyProfit: 20100,
      copiers: 156,
      totalTrades: 1080,
      profitFactor: 2.25,
      maxDrawdown: 3.7,
      sharpeRatio: 2.34,
      avgHoldingTime: '1m 40s',
    },
    6: {
      name: 'Vikramaditya Singhania',
      country: 'India',
      countryCode: 'IN',
      flag: '🇮🇳',
      category: 'instant_funded',
      startingBalance: 50000,
      strategy: 'Delhi Smart Money Breakout $50K',
      winRate3m: 74.5,
      baseDailyProfit: 19200,
      copiers: 148,
      totalTrades: 1020,
      profitFactor: 2.20,
      maxDrawdown: 3.8,
      sharpeRatio: 2.28,
      avgHoldingTime: '1m 45s',
    },
    7: {
      name: 'Dmytro Bondarenko',
      country: 'Ukraine',
      countryCode: 'UA',
      flag: '🇺🇦',
      category: 'instant_funded',
      startingBalance: 50000,
      strategy: 'Lviv Volatility Sniper $50K',
      winRate3m: 73.8,
      baseDailyProfit: 18400,
      copiers: 142,
      totalTrades: 960,
      profitFactor: 2.16,
      maxDrawdown: 4.0,
      sharpeRatio: 2.20,
      avgHoldingTime: '1m 50s',
    },
    8: {
      name: 'Zayed Al-Nuaimi',
      country: 'Dubai, UAE',
      countryCode: 'AE',
      flag: '🇦🇪',
      category: 'instant_funded',
      startingBalance: 25000,
      strategy: 'Dubai Gold & FX Precision $25K',
      winRate3m: 73.0,
      baseDailyProfit: 17600,
      copiers: 136,
      totalTrades: 910,
      profitFactor: 2.12,
      maxDrawdown: 4.1,
      sharpeRatio: 2.15,
      avgHoldingTime: '1m 52s',
    },
    9: {
      name: 'Kamran Shahzad Malik',
      country: 'Pakistan',
      countryCode: 'PK',
      flag: '🇵🇰',
      category: 'instant_funded',
      startingBalance: 25000,
      strategy: 'Lahore Volatility Surge $25K',
      winRate3m: 72.4,
      baseDailyProfit: 16800,
      copiers: 130,
      totalTrades: 870,
      profitFactor: 2.08,
      maxDrawdown: 4.2,
      sharpeRatio: 2.10,
      avgHoldingTime: '1m 55s',
    },
    10: {
      name: 'Artem Shevchenko',
      country: 'Ukraine',
      countryCode: 'UA',
      flag: '🇺🇦',
      category: 'instant_funded',
      startingBalance: 25000,
      strategy: 'Odessa Orderblock Pro $25K',
      winRate3m: 71.8,
      baseDailyProfit: 16100,
      copiers: 125,
      totalTrades: 820,
      profitFactor: 2.05,
      maxDrawdown: 4.3,
      sharpeRatio: 2.06,
      avgHoldingTime: '1m 58s',
    },
    11: {
      name: 'Mahmudul Hasan Chowdhury',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'instant_funded',
      startingBalance: 25000,
      strategy: 'Sylhet Currency Flow $25K',
      winRate3m: 71.2,
      baseDailyProfit: 15400,
      copiers: 120,
      totalTrades: 790,
      profitFactor: 2.02,
      maxDrawdown: 4.4,
      sharpeRatio: 2.02,
      avgHoldingTime: '2m 00s',
    },

    // Self Capital Top Traders
    100: {
      name: 'Aarav Deshmukh',
      country: 'India',
      countryCode: 'IN',
      flag: '🇮🇳',
      category: 'self_capital',
      startingBalance: 25000,
      strategy: 'Mumbai Micro Scalper Live',
      winRate3m: 80.5,
      baseDailyProfit: 9500,
      copiers: 188,
      totalTrades: 960,
      profitFactor: 2.62,
      maxDrawdown: 2.8,
      sharpeRatio: 2.80,
      avgHoldingTime: '1m 15s',
    },
    101: {
      name: 'Hamdan Al-Mansoori',
      country: 'Dubai, UAE',
      countryCode: 'AE',
      flag: '🇦🇪',
      category: 'self_capital',
      startingBalance: 25000,
      strategy: 'Dubai Marina OTC Momentum Live',
      winRate3m: 79.2,
      baseDailyProfit: 9100,
      copiers: 180,
      totalTrades: 910,
      profitFactor: 2.48,
      maxDrawdown: 3.0,
      sharpeRatio: 2.68,
      avgHoldingTime: '1m 20s',
    },
    102: {
      name: 'Tanvir Ahmed',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'self_capital',
      startingBalance: 20000,
      strategy: 'Dhaka Price Action Live',
      winRate3m: 77.9,
      baseDailyProfit: 8700,
      copiers: 174,
      totalTrades: 860,
      profitFactor: 2.40,
      maxDrawdown: 3.2,
      sharpeRatio: 2.58,
      avgHoldingTime: '1m 25s',
    },
    103: {
      name: 'Maksym Tkachenko',
      country: 'Ukraine',
      countryCode: 'UA',
      flag: '🇺🇦',
      category: 'self_capital',
      startingBalance: 20000,
      strategy: 'Kyiv Trend Follower Live',
      winRate3m: 76.5,
      baseDailyProfit: 8400,
      copiers: 166,
      totalTrades: 820,
      profitFactor: 2.34,
      maxDrawdown: 3.4,
      sharpeRatio: 2.48,
      avgHoldingTime: '1m 30s',
    },
    104: {
      name: 'Bilal Ahmed Siddiqui',
      country: 'Pakistan',
      countryCode: 'PK',
      flag: '🇵🇰',
      category: 'self_capital',
      startingBalance: 15000,
      strategy: 'Karachi Volatility Sniper Live',
      winRate3m: 75.4,
      baseDailyProfit: 8100,
      copiers: 158,
      totalTrades: 770,
      profitFactor: 2.26,
      maxDrawdown: 3.6,
      sharpeRatio: 2.38,
      avgHoldingTime: '1m 35s',
    },
    105: {
      name: 'Sabbir Hossain',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'self_capital',
      startingBalance: 15000,
      strategy: 'Chittagong Breakout Live',
      winRate3m: 74.6,
      baseDailyProfit: 7800,
      copiers: 152,
      totalTrades: 730,
      profitFactor: 2.22,
      maxDrawdown: 3.8,
      sharpeRatio: 2.30,
      avgHoldingTime: '1m 40s',
    },
    106: {
      name: 'Siddharth Malhotra',
      country: 'India',
      countryCode: 'IN',
      flag: '🇮🇳',
      category: 'self_capital',
      startingBalance: 10000,
      strategy: 'Delhi FX Pulse Live',
      winRate3m: 73.9,
      baseDailyProfit: 7500,
      copiers: 144,
      totalTrades: 690,
      profitFactor: 2.18,
      maxDrawdown: 3.9,
      sharpeRatio: 2.24,
      avgHoldingTime: '1m 45s',
    },
    107: {
      name: 'Bohdan Kravchenko',
      country: 'Ukraine',
      countryCode: 'UA',
      flag: '🇺🇦',
      category: 'self_capital',
      startingBalance: 10000,
      strategy: 'Kharkiv Alpha Live',
      winRate3m: 73.1,
      baseDailyProfit: 7200,
      copiers: 138,
      totalTrades: 650,
      profitFactor: 2.14,
      maxDrawdown: 4.1,
      sharpeRatio: 2.18,
      avgHoldingTime: '1m 50s',
    },
    108: {
      name: 'Saeed Al-Hashemi',
      country: 'Dubai, UAE',
      countryCode: 'AE',
      flag: '🇦🇪',
      category: 'self_capital',
      startingBalance: 10000,
      strategy: 'Dubai Creek Orderblock Live',
      winRate3m: 72.5,
      baseDailyProfit: 6900,
      copiers: 132,
      totalTrades: 610,
      profitFactor: 2.10,
      maxDrawdown: 4.2,
      sharpeRatio: 2.12,
      avgHoldingTime: '1m 52s',
    },
    109: {
      name: 'Rohan Kapoor',
      country: 'India',
      countryCode: 'IN',
      flag: '🇮🇳',
      category: 'self_capital',
      startingBalance: 5000,
      strategy: 'Mumbai Mean Reversion Live',
      winRate3m: 71.9,
      baseDailyProfit: 6600,
      copiers: 126,
      totalTrades: 570,
      profitFactor: 2.06,
      maxDrawdown: 4.3,
      sharpeRatio: 2.08,
      avgHoldingTime: '1m 55s',
    },
    110: {
      name: 'Usman Tariq',
      country: 'Pakistan',
      countryCode: 'PK',
      flag: '🇵🇰',
      category: 'self_capital',
      startingBalance: 5000,
      strategy: 'Rawalpindi Scalp Live',
      winRate3m: 71.2,
      baseDailyProfit: 6300,
      copiers: 122,
      totalTrades: 540,
      profitFactor: 2.03,
      maxDrawdown: 4.4,
      sharpeRatio: 2.04,
      avgHoldingTime: '1m 58s',
    },
    111: {
      name: 'Shakil Mahmud',
      country: 'Bangladesh',
      countryCode: 'BD',
      flag: '🇧🇩',
      category: 'self_capital',
      startingBalance: 5000,
      strategy: 'Padma Momentum Live',
      winRate3m: 70.6,
      baseDailyProfit: 6000,
      copiers: 118,
      totalTrades: 510,
      profitFactor: 2.00,
      maxDrawdown: 4.5,
      sharpeRatio: 2.00,
      avgHoldingTime: '2m 00s',
    },
  };

  for (let i = 0; i < TOTAL_TRADER_POOL_SIZE; i++) {
    const isInstant = i < 100;
    const category: 'instant_funded' | 'self_capital' = isInstant ? 'instant_funded' : 'self_capital';
    const numericId = String(100101 + i); // 100101 .. 100300
    const id = isInstant ? `trd_if_${numericId}` : `trd_sc_${numericId}`;
    const seed = deterministicHash(`${id}_base`);
    const slotSeed = deterministicHash(`${id}_slot_${rotationSlot}`);

    const override = featuredOverrides[i];
    // Rotate regional profile deterministically incorporating the 45-minute slot so non-override names & rankings also stay fresh
    const regionProfile = REGIONAL_PROFILES[(i + (seed % REGIONAL_PROFILES.length)) % REGIONAL_PROFILES.length];
    const firstName = regionProfile.firstNames[(i * 5 + (seed % 11)) % regionProfile.firstNames.length];
    const lastName = regionProfile.lastNames[(i * 7 + (seed % 13)) % regionProfile.lastNames.length];
    const providerName = override ? override.name : `${firstName} ${lastName}`;

    const countryObj = override
      ? { name: override.country, code: override.countryCode, flag: override.flag }
      : { name: regionProfile.country, code: regionProfile.code, flag: regionProfile.flag };

    const startingBalance = override
      ? override.startingBalance
      : isInstant
      ? ELIGIBLE_INSTANT_FUNDED_SIZES[i % ELIGIBLE_INSTANT_FUNDED_SIZES.length]
      : [1000, 2500, 5000, 8000, 10000, 15000, 25000][i % 7];

    const strategyTitle = override
      ? override.strategy
      : `${STRATEGY_DESCRIPTORS[i % STRATEGY_DESCRIPTORS.length]} #${(i % 50) + 1}`;

    // 45-minute dynamic surge factor: different traders surge every 45 minutes
    const surgeWave = ((slotSeed % 1000) / 1000); // 0.0 to 1.0
    const isSurgingInThis45mSlot = (slotSeed % 8) === 0;

    let dailyProfit: number;
    let dailyProfitPct: number;

    if (override) {
      // Dynamic 45-minute rank rotation among top masters
      const slotVariance = 0.86 + ((slotSeed % 280) / 1000); // 0.86 .. 1.14
      dailyProfit = Number((override.baseDailyProfit * intradayMultiplier * slotVariance).toFixed(2));
      dailyProfitPct = Number(((dailyProfit / startingBalance) * 100).toFixed(2));
    } else {
      const dailyRoiBasePct = isInstant
        ? (1.4 + (seed % 35) / 10) * (isSurgingInThis45mSlot ? 1.85 + surgeWave * 0.65 : 0.45 + surgeWave * 0.55)
        : (1.4 + (seed % 35) / 10) * (isSurgingInThis45mSlot ? 1.55 + surgeWave * 0.55 : 0.40 + surgeWave * 0.45);

      dailyProfitPct = Number((dailyRoiBasePct * intradayMultiplier).toFixed(2));
      dailyProfit = Number(((dailyProfitPct / 100) * startingBalance).toFixed(2));
    }

    // Weekly, Monthly, and 3-Month ROI ($ and %)
    const weeklyProfitPct = override
      ? Number((dailyProfitPct * 2.8).toFixed(2))
      : Number((dailyProfitPct * (3.2 + ((seed % 25) / 10))).toFixed(2));
    const weeklyProfit = Number(((weeklyProfitPct / 100) * startingBalance).toFixed(2));

    const monthlyProfitPct = override
      ? Number((weeklyProfitPct * 2.5).toFixed(2))
      : Number((weeklyProfitPct * (2.6 + ((seed % 18) / 10))).toFixed(2));
    const monthlyProfit = Number(((monthlyProfitPct / 100) * startingBalance).toFixed(2));

    const threeMonthProfitPct = override
      ? Number((monthlyProfitPct * 2.3).toFixed(2))
      : Number((monthlyProfitPct * (2.4 + ((seed % 16) / 10))).toFixed(2));
    const threeMonthProfit = Number(((threeMonthProfitPct / 100) * startingBalance).toFixed(2));

    // Current balance & all-time withdrawals
    const retainedGain = Number((monthlyProfit * 0.35 + dailyProfit).toFixed(2));
    const currentBalance = Number((startingBalance + retainedGain).toFixed(2));
    const allTimeWithdrawals = Number((threeMonthProfit * 0.78).toFixed(2));

    // Proven >= 60% 3-month win rate floor
    const rawWinRate = override ? override.winRate3m : Number((61.5 + ((seed % 235) / 10)).toFixed(1));
    const winRate3m = Math.max(60, rawWinRate);
    const profitFactor = override ? override.profitFactor : Number((1.75 + ((seed % 160) / 100)).toFixed(2));
    const maxDrawdown = override ? override.maxDrawdown : Number((1.8 + ((seed % 55) / 10)).toFixed(1));
    const sharpeRatio = override ? override.sharpeRatio : Number((1.55 + ((seed % 140) / 100)).toFixed(2));
    const avgHoldingTime = override ? override.avgHoldingTime : `${1 + (seed % 6)}m ${15 + (seed % 40)}s`;
    const totalTrades = override ? override.totalTrades : 240 + (seed % 1650);

    // Copiers strictly capped at 200 max (X / 200 Copiers)
    const baseCopiers = 38 + (seed % 148) + (isSurgingInThis45mSlot ? 12 : 0);
    const currentCopiers = override ? override.copiers : Math.min(MAX_COPIERS_PER_TRADER, baseCopiers);

    const accountTypeLabel = isInstant
      ? `Instant Funded ($${(startingBalance / 1000).toFixed(0)}K)`
      : 'Self-Capital Live';

    const tierName = isInstant
      ? `$${(startingBalance / 1000).toFixed(0)}K Instant Funded`
      : 'Self-Capital Account';

    const avatarVariants: NonNullable<CopyTraderProfileData['avatar_variant']>[] = [
      'gold_ring_silhouette',
      'blue_ring_silhouette',
      'vip_octagon_silhouette',
      'purple_ring_photo_1',
      'vip_octagon_flag_uz',
      'purple_ring_photo_2',
      'blue_ring_flag_tj',
      'vip_octagon_flag_ru',
      'vip_octagon_flag_tm',
    ];
    const avatarVariant = avatarVariants[i % avatarVariants.length];
    const isVipBadge = avatarVariant.startsWith('vip_octagon');
    const trades24h = 28 + ((seed + (slotSeed % 19)) % 220);
    const profitablePct = Math.max(60, Math.round(winRate3m));
    const turnover = Number((dailyProfit * 4.44).toFixed(2));
    const maxTrade = Number((dailyProfit * 0.188).toFixed(2));
    const minTrade = Number((maxTrade * 0.1).toFixed(2));
    const maxProfit = Number((maxTrade * 0.92).toFixed(2));

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
      avg_holding_time: avgHoldingTime,
      total_trades: totalTrades,
      current_copiers: currentCopiers,
      max_copiers: MAX_COPIERS_PER_TRADER,
      commission_pct: MASTER_COMMISSION_PERCENT,
      follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
      social_profile_id: numericId,
      display_handle: providerName,
      full_legal_name: providerName,
      profile_level: 'Guru',
      account_level: 6,
      status_text: 'last seen recently',
      followers_count: 45 + (seed % 120),
      watchers_count: 95 + (seed % 180),
      avatar_variant: avatarVariant,
      is_vip_badge: isVipBadge,
      trades_24h: trades24h,
      trades_today_profile: Math.max(1, trades24h - 1),
      profitable_trades_pct: profitablePct,
      trading_turnover: turnover,
      trading_profit: dailyProfit,
      max_trade: maxTrade,
      min_trade: minTrade,
      max_profit: maxProfit,
    });
  }

  return pool;
}

/**
 * Authoritative Top Ranked Traders for 24h featuring realistic human names
 * from India, Bangladesh, Pakistan, Dubai (UAE), and Ukraine, all with >= 60% win rates.
 */
export const SOCIAL_TRADING_TOP_24H_TRADERS: CopyTraderProfileData[] = [
  {
    id: 'trd_social_11101163',
    numeric_id: '11101163',
    social_profile_id: '11101163',
    user_id: 'usr_provider_11101163',
    display_handle: 'Rashid Al-Maktoum',
    provider_name: 'Rashid Al-Maktoum',
    full_legal_name: 'Rashid Al-Maktoum',
    country_code: 'AE',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    avatar_url: '🇦🇪',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($100K)',
    strategy_title: 'Institutional OTC & FX Flow',
    tier_name: '$100K Instant Funded',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 75,
    watchers_count: 155,
    avatar_variant: 'gold_ring_silhouette',
    is_vip_badge: false,
    starting_balance: 50000,
    current_balance: 64495.8,
    all_time_withdrawals: 42850.0,
    lifetime_earnings: 57345.8,
    daily_profit: 14495.8,
    daily_profit_pct: 28.99,
    weekly_profit: 38420.5,
    weekly_profit_pct: 76.84,
    monthly_profit: 94210.0,
    monthly_profit_pct: 188.42,
    three_month_profit: 186400.0,
    three_month_profit_pct: 372.8,
    win_rate_3m: 74.5,
    profit_factor: 2.64,
    max_drawdown: 2.8,
    sharpe_ratio: 2.75,
    avg_holding_time: '1m 20s',
    total_trades: 80,
    trades_24h: 80,
    trades_today_profile: 79,
    profitable_trades_pct: 74,
    trading_turnover: 64306.41,
    trading_profit: 14245.3,
    max_trade: 2722.94,
    min_trade: 272.26,
    max_profit: 2505.11,
    current_copiers: 75,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 1,
  },
  {
    id: 'trd_social_139597257',
    numeric_id: '139597257',
    social_profile_id: '139597257',
    user_id: 'usr_provider_139597257',
    display_handle: 'Tariq Mahmood Qureshi',
    provider_name: 'Tariq Mahmood Qureshi',
    full_legal_name: 'Tariq Mahmood Qureshi',
    country_code: 'PK',
    country: 'Pakistan',
    flag: '🇵🇰',
    avatar_url: '🇵🇰',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($100K)',
    strategy_title: 'High-Frequency Momentum Scalp',
    tier_name: '$100K Instant Funded',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 68,
    watchers_count: 142,
    avatar_variant: 'blue_ring_silhouette',
    is_vip_badge: false,
    starting_balance: 50000,
    current_balance: 64140.8,
    all_time_withdrawals: 39100.0,
    lifetime_earnings: 53240.8,
    daily_profit: 14140.8,
    daily_profit_pct: 28.28,
    weekly_profit: 36200.0,
    weekly_profit_pct: 72.4,
    monthly_profit: 88500.0,
    monthly_profit_pct: 177.0,
    three_month_profit: 172000.0,
    three_month_profit_pct: 344.0,
    win_rate_3m: 71.2,
    profit_factor: 2.51,
    max_drawdown: 3.1,
    sharpe_ratio: 2.62,
    avg_holding_time: '1m 15s',
    total_trades: 172,
    trades_24h: 172,
    trades_today_profile: 172,
    profitable_trades_pct: 71,
    trading_turnover: 61840.25,
    trading_profit: 14140.8,
    max_trade: 2450.0,
    min_trade: 210.5,
    max_profit: 2254.0,
    current_copiers: 68,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 2,
  },
  {
    id: 'trd_social_127298296',
    numeric_id: '127298296',
    social_profile_id: '127298296',
    user_id: 'usr_provider_127298296',
    display_handle: 'Vikramaditya Singhania',
    provider_name: 'Vikramaditya Singhania',
    full_legal_name: 'Vikramaditya Singhania',
    country_code: 'IN',
    country: 'India',
    flag: '🇮🇳',
    avatar_url: '🇮🇳',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($50K)',
    strategy_title: 'VIP Institutional Orderblock',
    tier_name: '$50K Instant Funded',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 54,
    watchers_count: 118,
    avatar_variant: 'vip_octagon_silhouette',
    is_vip_badge: true,
    starting_balance: 25000,
    current_balance: 30432.77,
    all_time_withdrawals: 21400.0,
    lifetime_earnings: 26832.77,
    daily_profit: 5432.77,
    daily_profit_pct: 21.73,
    weekly_profit: 16290.0,
    weekly_profit_pct: 65.16,
    monthly_profit: 41200.0,
    monthly_profit_pct: 164.8,
    three_month_profit: 89400.0,
    three_month_profit_pct: 357.6,
    win_rate_3m: 68.5,
    profit_factor: 2.32,
    max_drawdown: 3.4,
    sharpe_ratio: 2.41,
    avg_holding_time: '1m 30s',
    total_trades: 64,
    trades_24h: 64,
    trades_today_profile: 64,
    profitable_trades_pct: 69,
    trading_turnover: 28940.12,
    trading_profit: 5432.77,
    max_trade: 1850.0,
    min_trade: 150.0,
    max_profit: 1702.0,
    current_copiers: 54,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 3,
  },
  {
    id: 'trd_social_85396639',
    numeric_id: '85396639',
    social_profile_id: '85396639',
    user_id: 'usr_provider_85396639',
    display_handle: 'Oleksandr Kovalenko',
    provider_name: 'Oleksandr Kovalenko',
    full_legal_name: 'Oleksandr Kovalenko',
    country_code: 'UA',
    country: 'Ukraine',
    flag: '🇺🇦',
    avatar_url: '🇺🇦',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($50K)',
    strategy_title: 'Gold & FX Precision Breakout',
    tier_name: '$50K Instant Funded',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 61,
    watchers_count: 129,
    avatar_variant: 'gold_ring_silhouette',
    is_vip_badge: false,
    starting_balance: 25000,
    current_balance: 29352.01,
    all_time_withdrawals: 19800.0,
    lifetime_earnings: 24152.01,
    daily_profit: 4352.01,
    daily_profit_pct: 17.41,
    weekly_profit: 13800.0,
    weekly_profit_pct: 55.2,
    monthly_profit: 36400.0,
    monthly_profit_pct: 145.6,
    three_month_profit: 78200.0,
    three_month_profit_pct: 312.8,
    win_rate_3m: 67.0,
    profit_factor: 2.24,
    max_drawdown: 3.5,
    sharpe_ratio: 2.35,
    avg_holding_time: '1m 40s',
    total_trades: 113,
    trades_24h: 113,
    trades_today_profile: 113,
    profitable_trades_pct: 67,
    trading_turnover: 24180.55,
    trading_profit: 4352.01,
    max_trade: 1420.0,
    min_trade: 120.0,
    max_profit: 1306.4,
    current_copiers: 61,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 4,
  },
  {
    id: 'trd_social_143581606',
    numeric_id: '143581606',
    social_profile_id: '143581606',
    user_id: 'usr_provider_143581606',
    display_handle: 'Arjun Deshmukh',
    provider_name: 'Arjun Deshmukh',
    full_legal_name: 'Arjun Deshmukh',
    country_code: 'IN',
    country: 'India',
    flag: '🇮🇳',
    avatar_url: '🇮🇳',
    account_category: 'self_capital',
    account_type_label: 'Self-Capital Live',
    strategy_title: 'Algorithmic Volatility Pulse',
    tier_name: 'Self-Capital Account',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 5,
    status_text: 'last seen recently',
    followers_count: 49,
    watchers_count: 104,
    avatar_variant: 'purple_ring_photo_1',
    is_vip_badge: false,
    starting_balance: 20000,
    current_balance: 23621.25,
    all_time_withdrawals: 16500.0,
    lifetime_earnings: 20121.25,
    daily_profit: 3621.25,
    daily_profit_pct: 18.11,
    weekly_profit: 11200.0,
    weekly_profit_pct: 56.0,
    monthly_profit: 29800.0,
    monthly_profit_pct: 149.0,
    three_month_profit: 64500.0,
    three_month_profit_pct: 322.5,
    win_rate_3m: 65.0,
    profit_factor: 2.18,
    max_drawdown: 3.6,
    sharpe_ratio: 2.28,
    avg_holding_time: '1m 25s',
    total_trades: 290,
    trades_24h: 290,
    trades_today_profile: 290,
    profitable_trades_pct: 65,
    trading_turnover: 21450.8,
    trading_profit: 3621.25,
    max_trade: 980.0,
    min_trade: 85.0,
    max_profit: 901.6,
    current_copiers: 49,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 5,
  },
  {
    id: 'trd_social_119680988',
    numeric_id: '119680988',
    social_profile_id: '119680988',
    user_id: 'usr_provider_119680988',
    display_handle: 'Tanvir Ahmed Chowdhury',
    provider_name: 'Tanvir Ahmed Chowdhury',
    full_legal_name: 'Tanvir Ahmed Chowdhury',
    country_code: 'BD',
    country: 'Bangladesh',
    flag: '🇧🇩',
    avatar_url: '🇧🇩',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($25K)',
    strategy_title: 'Dhaka VIP Liquidity Sniper',
    tier_name: '$25K Instant Funded',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 44,
    watchers_count: 98,
    avatar_variant: 'vip_octagon_flag_uz',
    is_vip_badge: true,
    starting_balance: 25000,
    current_balance: 28501.52,
    all_time_withdrawals: 15200.0,
    lifetime_earnings: 18701.52,
    daily_profit: 3501.52,
    daily_profit_pct: 14.01,
    weekly_profit: 10850.0,
    weekly_profit_pct: 43.4,
    monthly_profit: 27400.0,
    monthly_profit_pct: 109.6,
    three_month_profit: 59800.0,
    three_month_profit_pct: 239.2,
    win_rate_3m: 66.8,
    profit_factor: 2.15,
    max_drawdown: 3.8,
    sharpe_ratio: 2.22,
    avg_holding_time: '1m 45s',
    total_trades: 65,
    trades_24h: 65,
    trades_today_profile: 65,
    profitable_trades_pct: 67,
    trading_turnover: 19820.4,
    trading_profit: 3501.52,
    max_trade: 1120.0,
    min_trade: 95.0,
    max_profit: 1030.4,
    current_copiers: 44,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 6,
  },
  {
    id: 'trd_social_108442910',
    numeric_id: '108442910',
    social_profile_id: '108442910',
    user_id: 'usr_provider_108442910',
    display_handle: 'Dmytro Bondarenko',
    provider_name: 'Dmytro Bondarenko',
    full_legal_name: 'Dmytro Bondarenko',
    country_code: 'UA',
    country: 'Ukraine',
    flag: '🇺🇦',
    avatar_url: '🇺🇦',
    account_category: 'self_capital',
    account_type_label: 'Self-Capital Live',
    strategy_title: 'High Win-Rate OTC Scalper',
    tier_name: 'Self-Capital Account',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 82,
    watchers_count: 164,
    avatar_variant: 'purple_ring_photo_2',
    is_vip_badge: false,
    starting_balance: 20000,
    current_balance: 23406.65,
    all_time_withdrawals: 18400.0,
    lifetime_earnings: 21806.65,
    daily_profit: 3406.65,
    daily_profit_pct: 17.03,
    weekly_profit: 10400.0,
    weekly_profit_pct: 52.0,
    monthly_profit: 26900.0,
    monthly_profit_pct: 134.5,
    three_month_profit: 58400.0,
    three_month_profit_pct: 292.0,
    win_rate_3m: 72.0,
    profit_factor: 2.58,
    max_drawdown: 2.9,
    sharpe_ratio: 2.68,
    avg_holding_time: '1m 10s',
    total_trades: 72,
    trades_24h: 72,
    trades_today_profile: 72,
    profitable_trades_pct: 72,
    trading_turnover: 18950.0,
    trading_profit: 3406.65,
    max_trade: 940.0,
    min_trade: 100.0,
    max_profit: 864.8,
    current_copiers: 82,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 7,
  },
  {
    id: 'trd_social_140257047',
    numeric_id: '140257047',
    social_profile_id: '140257047',
    user_id: 'usr_provider_140257047',
    display_handle: 'Zayed bin Rashid Al-Nuaimi',
    provider_name: 'Zayed bin Rashid Al-Nuaimi',
    full_legal_name: 'Zayed bin Rashid Al-Nuaimi',
    country_code: 'AE',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    avatar_url: '🇦🇪',
    account_category: 'self_capital',
    account_type_label: 'Self-Capital Live',
    strategy_title: 'Dubai DIFC Rapid Execution',
    tier_name: 'Self-Capital Account',
    vip_level: 'Guru',
    profile_level: 'Guru',
    account_level: 5,
    status_text: 'last seen recently',
    followers_count: 39,
    watchers_count: 87,
    avatar_variant: 'blue_ring_flag_tj',
    is_vip_badge: false,
    starting_balance: 15000,
    current_balance: 18390.69,
    all_time_withdrawals: 14100.0,
    lifetime_earnings: 17490.69,
    daily_profit: 3390.69,
    daily_profit_pct: 22.6,
    weekly_profit: 9980.0,
    weekly_profit_pct: 66.53,
    monthly_profit: 25100.0,
    monthly_profit_pct: 167.33,
    three_month_profit: 54200.0,
    three_month_profit_pct: 361.33,
    win_rate_3m: 64.5,
    profit_factor: 2.12,
    max_drawdown: 3.9,
    sharpe_ratio: 2.18,
    avg_holding_time: '1m 05s',
    total_trades: 358,
    trades_24h: 358,
    trades_today_profile: 358,
    profitable_trades_pct: 65,
    trading_turnover: 22840.75,
    trading_profit: 3390.69,
    max_trade: 890.0,
    min_trade: 75.0,
    max_profit: 818.8,
    current_copiers: 39,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 8,
  },
  {
    id: 'trd_social_128871612',
    numeric_id: '128871612',
    social_profile_id: '128871612',
    user_id: 'usr_provider_128871612',
    display_handle: 'Artem Shevchenko',
    provider_name: 'Artem Shevchenko',
    full_legal_name: 'Artem Shevchenko',
    country_code: 'UA',
    country: 'Ukraine',
    flag: '🇺🇦',
    avatar_url: '🇺🇦',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($25K)',
    strategy_title: 'VIP Precision Swing & OTC',
    tier_name: '$25K Instant Funded',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 52,
    watchers_count: 112,
    avatar_variant: 'vip_octagon_flag_ru',
    is_vip_badge: true,
    starting_balance: 25000,
    current_balance: 28340.9,
    all_time_withdrawals: 16200.0,
    lifetime_earnings: 19540.9,
    daily_profit: 3340.9,
    daily_profit_pct: 13.36,
    weekly_profit: 9750.0,
    weekly_profit_pct: 39.0,
    monthly_profit: 24600.0,
    monthly_profit_pct: 98.4,
    three_month_profit: 53100.0,
    three_month_profit_pct: 212.4,
    win_rate_3m: 64.0,
    profit_factor: 2.1,
    max_drawdown: 3.7,
    sharpe_ratio: 2.15,
    avg_holding_time: '1m 50s',
    total_trades: 62,
    trades_24h: 62,
    trades_today_profile: 62,
    profitable_trades_pct: 64,
    trading_turnover: 17420.3,
    trading_profit: 3340.9,
    max_trade: 1250.0,
    min_trade: 140.0,
    max_profit: 1150.0,
    current_copiers: 52,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 9,
  },
  {
    id: 'trd_social_110028311',
    numeric_id: '110028311',
    social_profile_id: '110028311',
    user_id: 'usr_provider_110028311',
    display_handle: 'Kamran Shahzad Malik',
    provider_name: 'Kamran Shahzad Malik',
    full_legal_name: 'Kamran Shahzad Malik',
    country_code: 'PK',
    country: 'Pakistan',
    flag: '🇵🇰',
    avatar_url: '🇵🇰',
    account_category: 'instant_funded',
    account_type_label: 'Instant Funded ($25K)',
    strategy_title: 'VIP Smart Money Execution',
    tier_name: '$25K Instant Funded',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 47,
    watchers_count: 94,
    avatar_variant: 'vip_octagon_silhouette',
    is_vip_badge: true,
    starting_balance: 25000,
    current_balance: 28139.84,
    all_time_withdrawals: 14900.0,
    lifetime_earnings: 18039.84,
    daily_profit: 3139.84,
    daily_profit_pct: 12.56,
    weekly_profit: 9320.0,
    weekly_profit_pct: 37.28,
    monthly_profit: 23400.0,
    monthly_profit_pct: 93.6,
    three_month_profit: 51200.0,
    three_month_profit_pct: 204.8,
    win_rate_3m: 63.2,
    profit_factor: 2.08,
    max_drawdown: 4.0,
    sharpe_ratio: 2.12,
    avg_holding_time: '1m 35s',
    total_trades: 61,
    trades_24h: 61,
    trades_today_profile: 61,
    profitable_trades_pct: 63,
    trading_turnover: 16890.45,
    trading_profit: 3139.84,
    max_trade: 960.0,
    min_trade: 110.0,
    max_profit: 883.2,
    current_copiers: 47,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 10,
  },
  {
    id: 'trd_social_134435450',
    numeric_id: '134435450',
    social_profile_id: '134435450',
    user_id: 'usr_provider_134435450',
    display_handle: 'Mahmudul Hasan Rahman',
    provider_name: 'Mahmudul Hasan Rahman',
    full_legal_name: 'Mahmudul Hasan Rahman',
    country_code: 'BD',
    country: 'Bangladesh',
    flag: '🇧🇩',
    avatar_url: '🇧🇩',
    account_category: 'self_capital',
    account_type_label: 'Self-Capital Live',
    strategy_title: 'VIP Currency & Index Alpha',
    tier_name: 'Self-Capital Account',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 58,
    watchers_count: 121,
    avatar_variant: 'vip_octagon_silhouette',
    is_vip_badge: true,
    starting_balance: 15000,
    current_balance: 18126.7,
    all_time_withdrawals: 14500.0,
    lifetime_earnings: 17626.7,
    daily_profit: 3126.7,
    daily_profit_pct: 20.84,
    weekly_profit: 9150.0,
    weekly_profit_pct: 61.0,
    monthly_profit: 22900.0,
    monthly_profit_pct: 152.67,
    three_month_profit: 49800.0,
    three_month_profit_pct: 332.0,
    win_rate_3m: 62.0,
    profit_factor: 2.06,
    max_drawdown: 4.1,
    sharpe_ratio: 2.1,
    avg_holding_time: '1m 42s',
    total_trades: 95,
    trades_24h: 95,
    trades_today_profile: 95,
    profitable_trades_pct: 62,
    trading_turnover: 16420.18,
    trading_profit: 3126.7,
    max_trade: 910.0,
    min_trade: 95.0,
    max_profit: 837.2,
    current_copiers: 58,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 11,
  },
  {
    id: 'trd_social_109384721',
    numeric_id: '109384721',
    social_profile_id: '109384721',
    user_id: 'usr_provider_109384721',
    display_handle: 'Rajeshwar Sharma',
    provider_name: 'Rajeshwar Sharma',
    full_legal_name: 'Rajeshwar Sharma',
    country_code: 'IN',
    country: 'India',
    flag: '🇮🇳',
    avatar_url: '🇮🇳',
    account_category: 'self_capital',
    account_type_label: 'Self-Capital Live',
    strategy_title: 'Mumbai VIP Price Action',
    tier_name: 'Self-Capital Account',
    vip_level: 'VIP',
    profile_level: 'Guru',
    account_level: 6,
    status_text: 'last seen recently',
    followers_count: 42,
    watchers_count: 89,
    avatar_variant: 'vip_octagon_flag_tm',
    is_vip_badge: true,
    starting_balance: 15000,
    current_balance: 17867.04,
    all_time_withdrawals: 13800.0,
    lifetime_earnings: 16667.04,
    daily_profit: 2867.04,
    daily_profit_pct: 19.11,
    weekly_profit: 8640.0,
    weekly_profit_pct: 57.6,
    monthly_profit: 21500.0,
    monthly_profit_pct: 143.33,
    three_month_profit: 46900.0,
    three_month_profit_pct: 312.67,
    win_rate_3m: 61.5,
    profit_factor: 2.04,
    max_drawdown: 4.2,
    sharpe_ratio: 2.05,
    avg_holding_time: '1m 55s',
    total_trades: 66,
    trades_24h: 66,
    trades_today_profile: 66,
    profitable_trades_pct: 61,
    trading_turnover: 15280.9,
    trading_profit: 2867.04,
    max_trade: 840.0,
    min_trade: 90.0,
    max_profit: 772.8,
    current_copiers: 42,
    max_copiers: MAX_COPIERS_PER_TRADER,
    commission_pct: MASTER_COMMISSION_PERCENT,
    follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
    rank: 12,
  },
];

export type TraderProfileTimeframe =
  | 'Today'
  | 'Yesterday'
  | 'Last 7 days'
  | 'Last 30 days'
  | 'All time';

/**
 * Dynamically calculates realistic trading statistics per timeframe filter
 * (Today, Yesterday, Last 7 days, Last 30 days, All time), ensuring that:
 * 1. Win rates (`profitableTradesPct`) dynamically change across timeframes (never static/identical).
 * 2. The minimum Win Rate floor is strictly maintained at >= 60% for all top-performing traders.
 */
export function computeDynamicTraderTimeframeStats(
  trader: CopyTraderProfileData,
  timeframe: TraderProfileTimeframe
): {
  trades: number;
  profitableTradesPct: number;
  tradingTurnover: number;
  tradingProfit: number;
  maxTrade: number;
  minTrade: number;
  maxProfit: number;
} {
  const seed = deterministicHash(
    `${trader.id || ''}_${trader.numeric_id || ''}_${trader.provider_name || ''}`
  );
  const baseTrades = Math.max(12, trader.trades_today_profile ?? trader.trades_24h ?? trader.total_trades ?? 79);
  const rawBaseWinPct = trader.profitable_trades_pct ?? Math.round(trader.win_rate_3m || 68);
  // Clamp base into [64, 84] so offsets around it stay strictly >= 60% and <= 92%
  const anchorWinPct = Math.min(84, Math.max(64, Math.round(rawBaseWinPct)));

  // Deterministic, mutually distinct offsets per timeframe so each tab shows a unique, realistic win rate >= 60%
  const sign = seed % 2 === 0 ? 1 : -1;
  const shiftA = 2 + (seed % 2); // 2 or 3
  const shiftB = 4 + ((seed >> 2) % 2); // 4 or 5
  const tfOffsets: Record<TraderProfileTimeframe, number> = {
    'Today': 0,
    'Yesterday': -sign * shiftA,
    'Last 7 days': sign * shiftA,
    'Last 30 days': -sign * shiftB,
    'All time': sign * shiftB,
  };

  const profitableTradesPct = Math.max(60, Math.min(92, anchorWinPct + (tfOffsets[timeframe] ?? 0)));

  const baseTurnover =
    trader.trading_turnover ?? Number(((trader.daily_profit || 14245.3) * 4.51).toFixed(2));
  const baseProfit = trader.trading_profit ?? trader.daily_profit ?? 14245.3;
  const baseMaxTrade = trader.max_trade ?? Number((baseProfit * 0.191).toFixed(2));
  const baseMinTrade = trader.min_trade ?? Number((baseMaxTrade * 0.1).toFixed(2));
  const baseMaxProfit = trader.max_profit ?? Number((baseMaxTrade * 0.92).toFixed(2));

  const multMap: Record<TraderProfileTimeframe, number> = {
    'Today': 1,
    'Yesterday': Number((0.88 + ((seed % 18) / 100)).toFixed(2)),
    'Last 7 days': Number((4.6 + ((seed % 14) / 10)).toFixed(2)),
    'Last 30 days': Number((15.8 + ((seed % 28) / 10)).toFixed(2)),
    'All time': Number((36.5 + ((seed % 45) / 10)).toFixed(2)),
  };
  const mult = multMap[timeframe] ?? 1;

  const maxScale =
    timeframe === 'Today'
      ? 1
      : timeframe === 'Yesterday'
      ? 0.96
      : timeframe === 'Last 7 days'
      ? 1.14
      : timeframe === 'Last 30 days'
      ? 1.28
      : 1.42;

  return {
    trades: Math.max(1, Math.round(baseTrades * mult)),
    profitableTradesPct,
    tradingTurnover: Number((baseTurnover * mult).toFixed(2)),
    tradingProfit: Number((baseProfit * mult).toFixed(2)),
    maxTrade: Number((baseMaxTrade * maxScale).toFixed(2)),
    minTrade: Number(
      (baseMinTrade * (timeframe === 'All time' ? 0.85 : timeframe === 'Last 30 days' ? 0.9 : 1)).toFixed(2)
    ),
    maxProfit: Number((baseMaxProfit * maxScale).toFixed(2)),
  };
}

/**
 * Seamlessly rotates and shuffles the displayed Top 24h traders every 45 minutes
 * using realistic human names from India, Bangladesh, Pakistan, Dubai (UAE), and Ukraine.
 */
export function getRotatedTop24hTraders(
  nowMs: number = Date.now(),
  pool?: CopyTraderProfileData[]
): CopyTraderProfileData[] {
  const rotationSlot = Math.floor(nowMs / ROTATION_INTERVAL_MS);
  const activePool = pool && pool.length > 0 ? pool : generate200TraderPool(nowMs);

  // Combine the 12 core social traders with top surging traders from the regional pool
  const topFromPool = [...activePool]
    .sort((a, b) => (b.daily_profit || 0) - (a.daily_profit || 0))
    .slice(0, 12);

  const candidatesMap = new Map<string, CopyTraderProfileData>();
  for (const t of SOCIAL_TRADING_TOP_24H_TRADERS) {
    candidatesMap.set(t.numeric_id, t);
  }
  for (const t of topFromPool) {
    if (!candidatesMap.has(t.numeric_id)) {
      candidatesMap.set(t.numeric_id, t);
    }
  }

  const allCandidates = Array.from(candidatesMap.values());

  const rotated = allCandidates.map((t, idx) => {
    const slotHash = deterministicHash(`${t.id}_rot_${rotationSlot}_${idx}`);
    // Organic 45-minute profit & trade volume wave (0.82x to 1.24x) so rankings & displayed traders shift naturally every 45m
    const waveFactor = 0.82 + ((slotHash % 420) / 1000);
    const adjustedDailyProfit = Number(Math.max(950, (t.daily_profit || 3000) * waveFactor).toFixed(2));
    const adjustedDailyPct = Number(
      ((adjustedDailyProfit / Math.max(1000, t.starting_balance || 25000)) * 100).toFixed(2)
    );
    const baseWinPct = Math.max(60, Math.round(t.profitable_trades_pct ?? t.win_rate_3m ?? 66));
    const winDelta = (slotHash % 5) - 2; // -2 .. +2
    const rotatedWinPct = Math.max(60, Math.min(88, baseWinPct + winDelta));
    const baseTrades = Math.max(24, t.trades_24h ?? t.total_trades ?? 72);
    const rotatedTrades = Math.max(18, baseTrades + ((slotHash % 23) - 11));
    const humanName = t.provider_name || t.full_legal_name || t.display_handle || 'Rajesh Sharma';

    return {
      ...t,
      provider_name: humanName,
      full_legal_name: humanName,
      display_handle: humanName,
      daily_profit: adjustedDailyProfit,
      daily_profit_pct: adjustedDailyPct,
      trading_profit: adjustedDailyProfit,
      trading_turnover: Number((adjustedDailyProfit * 4.42).toFixed(2)),
      profitable_trades_pct: rotatedWinPct,
      win_rate_3m: Math.max(60, Number((t.win_rate_3m || rotatedWinPct).toFixed(1))),
      trades_24h: rotatedTrades,
      trades_today_profile: rotatedTrades,
    };
  });

  return rotated
    .sort((a, b) => (b.daily_profit || 0) - (a.daily_profit || 0))
    .slice(0, 12)
    .map((t, index) => ({
      ...t,
      rank: index + 1,
    }));
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
 * - If searchQuery is provided (e.g. numeric Trader ID "100105" or "11101163" or name), searches across
 *   both the Social Trading Top 12 and ALL 200 traders so any trader can be found immediately by ID or handle.
 * - If no searchQuery is provided, filters by active category and returns the ranked list.
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
  const numericOnlyQuery = cleanQuery.replace(/^#|^user/i, '').trim();

  // Combine featured social traders (avoiding duplicate IDs) for search
  const combinedForSearch = [
    ...SOCIAL_TRADING_TOP_24H_TRADERS,
    ...pool.filter(
      (p) => !SOCIAL_TRADING_TOP_24H_TRADERS.some((s) => s.numeric_id === p.numeric_id || s.id === p.id)
    ),
  ];

  if (cleanQuery.length > 0) {
    const matched = combinedForSearch
      .filter((t) => {
        const matchesCategory = category === 'all' ? true : t.account_category === category;
        const matchesNumeric =
          String(t.numeric_id || '').includes(numericOnlyQuery) ||
          String(t.social_profile_id || '').includes(numericOnlyQuery);
        const matchesId = String(t.id || '').toLowerCase().includes(cleanQuery.toLowerCase());
        const matchesHandle = String(t.display_handle || '')
          .toLowerCase()
          .includes(cleanQuery.toLowerCase());
        const matchesName =
          String(t.provider_name || '').toLowerCase().includes(cleanQuery.toLowerCase()) ||
          String(t.full_legal_name || '').toLowerCase().includes(cleanQuery.toLowerCase());
        if (/^\d+$/.test(numericOnlyQuery)) {
          return matchesNumeric;
        }
        return matchesCategory && (matchesNumeric || matchesId || matchesHandle || matchesName);
      })
      .sort((a, b) => {
        const aExact =
          String(a.numeric_id) === numericOnlyQuery || String(a.social_profile_id) === numericOnlyQuery
            ? 1
            : 0;
        const bExact =
          String(b.numeric_id) === numericOnlyQuery || String(b.social_profile_id) === numericOnlyQuery
            ? 1
            : 0;
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

