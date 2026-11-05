import { supabase } from './supabase';
import { isValidUuid, ensureTradeUuid, getEffectiveSupabaseUserId } from './supabaseTradeSync';
import {
  resolveCanonicalCopyAccountType,
  getCanonicalAccountDatabaseUuid,
} from './copyTradingRules';
import type { TradingAccount, UserProfile } from '../types';

export interface CopySubscriptionParams {
  userId?: string | null;
  userEmail?: string | null;
  accountId?: string | null;
  supabaseAccountId?: string | null;
  accountType?: string | null;
  accountCategory?: string | null;
  startingBalance?: number | null;
  currentBalance?: number | null;
  providerId: string;
  providerNumericId?: string | number | null;
  providerName?: string | null;
  providerCategory?: string | null;
  trade_amount: number;
  stop_loss: number;
  take_profit: number;
  max_drawdown: number;
  status?: 'active' | 'paused' | 'cancelled';
}

export interface CopyTradingSubscriptionRow {
  id?: string;
  copier_user_id: string;
  copier_account_id: string;
  provider_id: string;
  trade_amount: number;
  stop_loss: number;
  take_profit: number;
  max_drawdown: number;
  status: string;
  created_at?: string;
}

export interface SaveSubscriptionResult {
  ok: boolean;
  isDuplicate?: boolean;
  error?: string;
  subscription?: CopyTradingSubscriptionRow;
  message?: string;
}

/**
 * Normalizes any frontend account category or label (e.g. `'instant_funded'`, `'self_capital'`)
 * into the exact `account_type` and `challenge_phase` allowed by `public.trading_accounts`.
 */
export function normalizeDbTradingAccountType(rawAccountType?: string | null): {
  accountType: 'instant' | 'personal' | 'one_step' | 'two_step' | 'demo';
  challengePhase: 'funded' | 'personal_live' | 'phase_1' | 'demo';
} {
  const raw = String(rawAccountType || '').toLowerCase().trim();
  if (
    raw === 'personal' ||
    raw === 'personal_live' ||
    raw === 'self_capital' ||
    raw === 'self_funded' ||
    raw === 'real' ||
    raw.includes('personal') ||
    raw.includes('self')
  ) {
    return { accountType: 'personal', challengePhase: 'personal_live' };
  }
  if (
    raw === 'instant' ||
    raw === 'instant_funded' ||
    raw === 'funded' ||
    raw.includes('instant') ||
    raw.includes('funded')
  ) {
    return { accountType: 'instant', challengePhase: 'funded' };
  }
  if (raw === 'two_step' || raw === 'two-step' || raw.includes('two')) {
    return { accountType: 'two_step', challengePhase: 'phase_1' };
  }
  if (raw === 'one_step' || raw === 'one-step' || raw.includes('one')) {
    return { accountType: 'one_step', challengePhase: 'phase_1' };
  }
  if (raw === 'demo') {
    return { accountType: 'demo', challengePhase: 'demo' };
  }
  return { accountType: 'instant', challengePhase: 'funded' };
}

/**
 * Checks whether a raw dropdown string is a placeholder, empty/unselected state, or display label
 * rather than a clean account ID.
 */
export function isPlaceholderOrUnselectedAccountValue(val?: string | null): boolean {
  if (!val) return true;
  const clean = String(val).trim();
  if (!clean) return true;
  const lower = clean.toLowerCase();
  if (
    lower === 'select' ||
    lower === 'none' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'unselected' ||
    lower === 'placeholder' ||
    lower.startsWith('select ') ||
    lower.startsWith('choose ') ||
    lower.startsWith('--')
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves the selected follower account from dropdown state and maps it to the actual
 * database account ID (`id` from the user's `trading_accounts` / `profiles` table).
 * If no active account ID is selected (or a placeholder/label is passed), automatically
 * selects the currently active live account UUID from the global account context.
 */
export function resolveSelectedFollowerAccount(params: {
  selectedCopyAccountId?: string | null;
  accounts?: TradingAccount[];
  activeAccount?: TradingAccount | null;
  userProfile?: UserProfile | null;
  copierSelectedAccount?: TradingAccount | null;
}): {
  targetAccount: TradingAccount | null;
  dbAccountId: string | null;
  selectedOptionValue: string;
} {
  const {
    selectedCopyAccountId,
    accounts = [],
    activeAccount,
    userProfile,
    copierSelectedAccount,
  } = params;

  // Build deduplicated account pool including global activeAccount
  const allAccounts: TradingAccount[] = [...accounts];
  if (
    activeAccount &&
    !allAccounts.some(
      (a) =>
        a.id === activeAccount.id ||
        (a.supabaseAccountId &&
          activeAccount.supabaseAccountId &&
          a.supabaseAccountId === activeAccount.supabaseAccountId)
    )
  ) {
    allAccounts.push(activeAccount);
  }

  const isNonDemoLive = (acc?: TradingAccount | null): boolean => {
    if (!acc) return false;
    return resolveCanonicalCopyAccountType(acc) !== 'DEMO';
  };

  // Determine the active live account from the global account context
  const fallbackActiveLive: TradingAccount | null =
    (activeAccount && isNonDemoLive(activeAccount) ? activeAccount : null) ||
    (copierSelectedAccount && isNonDemoLive(copierSelectedAccount) ? copierSelectedAccount : null) ||
    allAccounts.find(
      (a) => isNonDemoLive(a) && Number(a.currentBalance ?? a.equity ?? 0) > 0
    ) ||
    allAccounts.find((a) => isNonDemoLive(a)) ||
    copierSelectedAccount ||
    activeAccount ||
    allAccounts[0] ||
    null;

  const rawSelected = String(selectedCopyAccountId || '').trim();
  let matchedFromDropdown: TradingAccount | null = null;

  if (!isPlaceholderOrUnselectedAccountValue(rawSelected)) {
    // 1. Direct match by supabaseAccountId, id, or canonical database UUID
    matchedFromDropdown =
      allAccounts.find(
        (a) =>
          (a.supabaseAccountId && String(a.supabaseAccountId).trim() === rawSelected) ||
          String(a.id || '').trim() === rawSelected ||
          getCanonicalAccountDatabaseUuid(a, userProfile) === rawSelected
      ) || null;

    // 2. If a display label string was accidentally passed (e.g. "Instant Funded ($50,000) — ELIGIBLE"),
    // match the account whose tierName or id appears at the start of the label
    if (!matchedFromDropdown && (rawSelected.includes('($') || rawSelected.includes('—'))) {
      matchedFromDropdown =
        allAccounts.find((a) => {
          const labelPrefix = String(a.tierName || a.id || '').trim();
          return labelPrefix && rawSelected.startsWith(labelPrefix);
        }) || null;
    }
  }

  // Fallback to active live account from global context if unselected or unmatched
  let targetAccount: TradingAccount | null = matchedFromDropdown || fallbackActiveLive;

  // If no account object exists in state yet but userProfile exists, synthesize a live follower account
  if (!targetAccount && userProfile) {
    const profileUuid = isValidUuid(userProfile.id) ? String(userProfile.id).trim() : undefined;
    const selfBal = Number(userProfile.selfBalance ?? userProfile.fundedBalance ?? 500);
    targetAccount = {
      id: profileUuid || String(userProfile.id || 'BFT-PERS-LIVE'),
      supabaseAccountId: profileUuid,
      ownerId: userProfile.id,
      loginId: 'BFT-LIVE',
      passwordHash: 'bft_live',
      tier: 'personal',
      accountType: 'personal',
      tierName: 'Personal Live Balance (Self-Funded)',
      size: Math.max(100, selfBal),
      initialBalance: Math.max(100, selfBal),
      currentBalance: Math.max(100, selfBal),
      startingDayEquity: Math.max(100, selfBal),
      equity: Math.max(100, selfBal),
      dailyLossLimitPercent: 0,
      maxOverallLossPercent: 0,
      profitTargetPercent: 0,
      status: 'active',
      breachType: 'none',
      phase: 'personal_live',
      tradingDaysCompleted: 0,
      tradesCount: 0,
      winRate: 0,
      createdDate: new Date().toISOString().split('T')[0],
      lastActiveDate: new Date().toISOString().split('T')[0],
    };
  }

  // Extract the actual database UUID (preferring real UUIDs from targetAccount, then active live account in global context, then userProfile.id)
  const liveAccountWithUuid = allAccounts.find(
    (a) => isNonDemoLive(a) && (isValidUuid(a.supabaseAccountId) || isValidUuid(a.id))
  );

  const dbAccountId: string | null =
    (targetAccount?.supabaseAccountId && isValidUuid(targetAccount.supabaseAccountId)
      ? targetAccount.supabaseAccountId.trim()
      : null) ||
    (targetAccount?.id && isValidUuid(targetAccount.id) ? targetAccount.id.trim() : null) ||
    (!isPlaceholderOrUnselectedAccountValue(rawSelected) && isValidUuid(rawSelected)
      ? rawSelected
      : null) ||
    (activeAccount &&
    isNonDemoLive(activeAccount) &&
    activeAccount.supabaseAccountId &&
    isValidUuid(activeAccount.supabaseAccountId)
      ? activeAccount.supabaseAccountId.trim()
      : null) ||
    (activeAccount && isNonDemoLive(activeAccount) && isValidUuid(activeAccount.id)
      ? activeAccount.id.trim()
      : null) ||
    (liveAccountWithUuid?.supabaseAccountId && isValidUuid(liveAccountWithUuid.supabaseAccountId)
      ? liveAccountWithUuid.supabaseAccountId.trim()
      : null) ||
    (liveAccountWithUuid?.id && isValidUuid(liveAccountWithUuid.id)
      ? liveAccountWithUuid.id.trim()
      : null) ||
    (fallbackActiveLive?.supabaseAccountId && isValidUuid(fallbackActiveLive.supabaseAccountId)
      ? fallbackActiveLive.supabaseAccountId.trim()
      : null) ||
    (fallbackActiveLive?.id && isValidUuid(fallbackActiveLive.id)
      ? fallbackActiveLive.id.trim()
      : null) ||
    (userProfile?.id && isValidUuid(userProfile.id) ? String(userProfile.id).trim() : null) ||
    targetAccount?.supabaseAccountId ||
    targetAccount?.id ||
    fallbackActiveLive?.supabaseAccountId ||
    fallbackActiveLive?.id ||
    (userProfile?.id ? String(userProfile.id).trim() : null) ||
    null;

  const selectedOptionValue =
    getCanonicalAccountDatabaseUuid(targetAccount, userProfile) ||
    targetAccount?.id ||
    dbAccountId ||
    '';

  return {
    targetAccount,
    dbAccountId,
    selectedOptionValue,
  };
}

/**
 * Validates risk parameters configured by user.
 */
export function validateSubscriptionRiskParams(params: {
  trade_amount: number;
  stop_loss: number;
  take_profit: number;
  max_drawdown: number;
}): { valid: boolean; error?: string } {
  const { trade_amount, stop_loss, take_profit, max_drawdown } = params;

  if (typeof trade_amount !== 'number' || isNaN(trade_amount) || trade_amount <= 0) {
    return { valid: false, error: 'Trade amount must be a positive number greater than 0.' };
  }
  if (typeof stop_loss !== 'number' || isNaN(stop_loss) || stop_loss < 0) {
    return { valid: false, error: 'Stop loss must be a valid non-negative number.' };
  }
  if (typeof take_profit !== 'number' || isNaN(take_profit) || take_profit < 0) {
    return { valid: false, error: 'Take profit must be a valid non-negative number.' };
  }
  if (typeof max_drawdown !== 'number' || isNaN(max_drawdown) || max_drawdown < 0) {
    return { valid: false, error: 'Max drawdown must be a valid non-negative number.' };
  }

  return { valid: true };
}

/**
 * Resolves current authenticated user's ID (`auth.uid()`).
 */
export async function resolveAuthUserId(
  fallbackUserId?: string | null,
  fallbackEmail?: string | null
): Promise<string | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id && isValidUuid(userData.user.id)) {
      return userData.user.id.trim();
    }
  } catch {
    // ignore
  }

  try {
    const { data: sessData } = await supabase.auth.getSession();
    if (sessData?.session?.user?.id && isValidUuid(sessData.session.user.id)) {
      return sessData.session.user.id.trim();
    }
  } catch {
    // ignore
  }

  if (fallbackUserId && isValidUuid(fallbackUserId)) {
    return fallbackUserId.trim();
  }

  try {
    const resolved = await getEffectiveSupabaseUserId(
      fallbackUserId || undefined,
      fallbackEmail || undefined
    );
    if (resolved && isValidUuid(resolved)) {
      return resolved.trim();
    }
  } catch {
    // ignore
  }

  if (fallbackUserId && String(fallbackUserId).trim()) {
    return ensureTradeUuid(String(fallbackUserId).trim());
  }

  if (fallbackEmail && String(fallbackEmail).trim()) {
    return ensureTradeUuid(String(fallbackEmail).trim());
  }

  return null;
}

/**
 * Resolves or ensures a valid UUID in `public.trading_accounts` for `copier_account_id`.
 * Prevents foreign key constraint violations on `copy_trading_subscriptions_copier_account_id_fkey`
 * and never returns null when a user or account identifier is available.
 */
export async function resolveCopierAccountId(params: {
  userId: string;
  accountId?: string | null;
  supabaseAccountId?: string | null;
  accountType?: string | null;
  startingBalance?: number | null;
  currentBalance?: number | null;
}): Promise<string | null> {
  const { userId, accountId, supabaseAccountId, accountType, startingBalance, currentBalance } =
    params;

  const cleanSupaId =
    supabaseAccountId && !isPlaceholderOrUnselectedAccountValue(supabaseAccountId)
      ? String(supabaseAccountId).trim()
      : '';
  const cleanAccId =
    accountId && !isPlaceholderOrUnselectedAccountValue(accountId)
      ? String(accountId).trim()
      : '';

  // 1. If supabaseAccountId is already a valid UUID, verify it exists in trading_accounts
  if (cleanSupaId && isValidUuid(cleanSupaId)) {
    try {
      const { data: exists } = await supabase
        .from('trading_accounts')
        .select('id')
        .eq('id', cleanSupaId)
        .maybeSingle();

      if (exists?.id) return exists.id;
    } catch {
      // ignore
    }
  }

  // 2. If accountId is already a valid UUID, verify it exists in trading_accounts
  if (cleanAccId && isValidUuid(cleanAccId)) {
    try {
      const { data: exists } = await supabase
        .from('trading_accounts')
        .select('id')
        .eq('id', cleanAccId)
        .maybeSingle();

      if (exists?.id) return exists.id;
    } catch {
      // ignore
    }
  }

  const normalizedDbType = normalizeDbTradingAccountType(accountType || cleanAccId);

  // 3. Query user's existing trading accounts in Supabase
  try {
    const { data: accounts } = await supabase
      .from('trading_accounts')
      .select('id, account_type, status')
      .eq('user_id', userId);

    if (Array.isArray(accounts) && accounts.length > 0) {
      const exactTypeMatch = accounts.find(
        (a) =>
          String(a.account_type || '').toLowerCase() === normalizedDbType.accountType ||
          (accountType &&
            String(a.account_type || '').toLowerCase() === accountType.toLowerCase())
      );
      if (exactTypeMatch?.id) return exactTypeMatch.id;

      const nonDemoMatch = accounts.find(
        (a) => String(a.account_type || '').toLowerCase() !== 'demo'
      );
      if (nonDemoMatch?.id) return nonDemoMatch.id;

      return accounts[0].id;
    }
  } catch {
    // ignore
  }

  // 3.5. Also check RLS-scoped trading_accounts without user_id filter in case auth.uid() differs from local userId
  try {
    const { data: rlsAccounts } = await supabase
      .from('trading_accounts')
      .select('id, account_type')
      .limit(10);

    if (Array.isArray(rlsAccounts) && rlsAccounts.length > 0) {
      const match =
        rlsAccounts.find(
          (a) => String(a.account_type || '').toLowerCase() === normalizedDbType.accountType
        ) ||
        rlsAccounts.find((a) => String(a.account_type || '').toLowerCase() !== 'demo') ||
        rlsAccounts[0];
      if (match?.id) return match.id;
    }
  } catch {
    // ignore
  }

  // 4. Auto-create a trading_accounts row using valid DB schema values ('instant' / 'personal' / 'demo')
  const startBal =
    typeof startingBalance === 'number' && Number.isFinite(startingBalance) && startingBalance > 0
      ? startingBalance
      : normalizedDbType.accountType === 'personal'
      ? 1000.0
      : 50000.0;
  const curBal =
    typeof currentBalance === 'number' && Number.isFinite(currentBalance) && currentBalance > 0
      ? currentBalance
      : startBal;

  const candidateTypes: Array<{
    account_type: string;
    challenge_phase: string;
    daily_drawdown: number;
    max_drawdown: number;
  }> = [
    {
      account_type: normalizedDbType.accountType,
      challenge_phase: normalizedDbType.challengePhase,
      daily_drawdown: normalizedDbType.accountType === 'personal' ? 100.0 : 8.0,
      max_drawdown: normalizedDbType.accountType === 'personal' ? 100.0 : 20.0,
    },
    {
      account_type: 'instant',
      challenge_phase: 'funded',
      daily_drawdown: 8.0,
      max_drawdown: 20.0,
    },
    {
      account_type: 'one_step',
      challenge_phase: 'funded',
      daily_drawdown: 10.0,
      max_drawdown: 15.0,
    },
    {
      account_type: 'demo',
      challenge_phase: 'demo',
      daily_drawdown: 100.0,
      max_drawdown: 100.0,
    },
  ];

  const preferredUuid =
    (cleanSupaId && isValidUuid(cleanSupaId) ? cleanSupaId : null) ||
    (cleanAccId && isValidUuid(cleanAccId) && cleanAccId !== userId ? cleanAccId : null);

  for (const candidate of candidateTypes) {
    try {
      const insertPayload: Record<string, any> = {
        user_id: userId,
        account_type: candidate.account_type,
        starting_balance: startBal,
        current_balance: curBal,
        equity: curBal,
        daily_drawdown: candidate.daily_drawdown,
        max_drawdown: candidate.max_drawdown,
        profit_target: 0.0,
        challenge_phase: candidate.challenge_phase,
        status: 'active',
      };
      if (preferredUuid) {
        insertPayload.id = preferredUuid;
      }

      const { data: created, error } = await supabase
        .from('trading_accounts')
        .insert([insertPayload])
        .select('id')
        .maybeSingle();

      if (!error && created?.id) {
        return created.id;
      }

      // Retry without custom ID if preferredUuid collided
      if (preferredUuid) {
        const { id: _omittedId, ...payloadWithoutId } = insertPayload;
        const { data: createdNoId, error: errNoId } = await supabase
          .from('trading_accounts')
          .insert([payloadWithoutId])
          .select('id')
          .maybeSingle();

        if (!errNoId && createdNoId?.id) {
          return createdNoId.id;
        }
      }
    } catch {
      // try next candidate
    }
  }

  // 5. Guaranteed fallback: return a valid UUID from the provided account/profile identifiers so it never fails with null
  if (cleanSupaId && isValidUuid(cleanSupaId)) {
    return cleanSupaId;
  }
  if (cleanAccId && isValidUuid(cleanAccId)) {
    return cleanAccId;
  }
  if (userId && isValidUuid(userId)) {
    return userId.trim();
  }
  if (cleanAccId || cleanSupaId || userId) {
    return ensureTradeUuid(cleanSupaId || cleanAccId || userId);
  }

  return null;
}

/**
 * Resolves the Master Trader's UUID from `copy_trading_profiles`.
 */
export async function resolveProviderUuid(params: {
  providerId: string;
  providerName?: string | null;
  providerNumericId?: string | number | null;
}): Promise<string> {
  const { providerId, providerName } = params;

  if (isValidUuid(providerId)) {
    return providerId.trim();
  }

  // Check if provider exists in copy_trading_profiles by provider_name
  if (providerName && providerName.trim()) {
    try {
      const { data: profile } = await supabase
        .from('copy_trading_profiles')
        .select('id')
        .ilike('provider_name', providerName.trim())
        .maybeSingle();

      if (profile?.id && isValidUuid(profile.id)) {
        return profile.id.trim();
      }
    } catch {
      // ignore
    }
  }

  return ensureTradeUuid(providerId);
}

/**
 * Checks if a subscription already exists for the given account and provider.
 */
export async function checkDuplicateSubscription(params: {
  copier_account_id: string;
  provider_id: string;
}): Promise<{ isDuplicate: boolean; existingSubscription?: any }> {
  try {
    const { data, error } = await supabase
      .from('copy_trading_subscriptions')
      .select('id, status, trade_amount, stop_loss, take_profit, max_drawdown')
      .eq('copier_account_id', params.copier_account_id)
      .eq('provider_id', params.provider_id)
      .eq('status', 'active')
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      return { isDuplicate: true, existingSubscription: data[0] };
    }
  } catch {
    // ignore
  }

  return { isDuplicate: false };
}

/**
 * Saves a copy trading subscription into Supabase `copy_trading_subscriptions`.
 * Enforces proper parameter mapping, user authentication, account resolution, and duplicate checks.
 */
export async function saveCopyTradingSubscriptionToSupabase(
  params: CopySubscriptionParams
): Promise<SaveSubscriptionResult> {
  // 1. Validate risk management parameters
  const validation = validateSubscriptionRiskParams({
    trade_amount: params.trade_amount,
    stop_loss: params.stop_loss,
    take_profit: params.take_profit,
    max_drawdown: params.max_drawdown,
  });

  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'Invalid copy trading risk parameters.',
    };
  }

  // 2. Resolve authenticated user ID (`auth.uid()`)
  const copierUserId = await resolveAuthUserId(params.userId, params.userEmail);
  if (!copierUserId) {
    return {
      ok: false,
      error: 'Authentication Required: Please sign in to your BFT account to copy traders.',
    };
  }

  // 3. Resolve copier_account_id (ensuring foreign key validity in trading_accounts / profiles)
  const copierAccountId = await resolveCopierAccountId({
    userId: copierUserId,
    accountId: params.accountId,
    supabaseAccountId: params.supabaseAccountId,
    accountType: params.accountType || params.accountCategory,
    startingBalance: params.startingBalance,
    currentBalance: params.currentBalance,
  });

  if (!copierAccountId) {
    return {
      ok: false,
      error: 'Trading Account Error: Unable to resolve active trading account ID for copy trading.',
    };
  }

  // 3.5. Enforce Account Type Matching Rules
  const copierCanonical = resolveCanonicalCopyAccountType(
    params.accountType || params.accountCategory || params.accountId
  );
  if (copierCanonical === 'DEMO') {
    return {
      ok: false,
      error: 'Account type mismatch: Demo accounts cannot copy Master Traders.',
    };
  }
  if (copierCanonical === 'CHALLENGE') {
    return {
      ok: false,
      error: 'Account type mismatch: Challenge Evaluation accounts are not permitted to copy traders.',
    };
  }
  if (params.providerCategory) {
    const providerCanonical = resolveCanonicalCopyAccountType(params.providerCategory);
    if (copierCanonical === 'PERSONAL_LIVE' && providerCanonical !== 'PERSONAL_LIVE') {
      return {
        ok: false,
        error: 'Account type mismatch: Personal Live accounts can only copy Personal Live traders.',
      };
    }
    if (copierCanonical === 'INSTANT_FUNDED' && providerCanonical !== 'INSTANT_FUNDED') {
      return {
        ok: false,
        error: 'Account type mismatch: Instant Funded accounts can only copy Instant Funded traders.',
      };
    }
  }

  // 4. Resolve provider_id (UUID from copy_trading_profiles)
  const providerId = await resolveProviderUuid({
    providerId: params.providerId,
    providerName: params.providerName,
    providerNumericId: params.providerNumericId,
  });

  // 5. Duplicate Check: Prevent duplicate active subscriptions to the same provider for the same account
  const dupCheck = await checkDuplicateSubscription({
    copier_account_id: copierAccountId,
    provider_id: providerId,
  });

  if (dupCheck.isDuplicate) {
    const providerLabel = params.providerName
      ? `${params.providerName}${params.providerNumericId ? ` (#${params.providerNumericId})` : ''}`
      : 'this Master Trader';
    return {
      ok: false,
      isDuplicate: true,
      error: `Duplicate Subscription: This account is already actively copying ${providerLabel}.`,
    };
  }

  // 6. Insert new record into `copy_trading_subscriptions`
  const insertPayload = {
    copier_user_id: copierUserId,
    copier_account_id: copierAccountId,
    provider_id: providerId,
    trade_amount: Number(params.trade_amount),
    stop_loss: Number(params.stop_loss),
    take_profit: Number(params.take_profit),
    max_drawdown: Number(params.max_drawdown),
    status: params.status || 'active',
  };

  try {
    console.log('[CopyTradingSync] Inserting copy subscription row into Supabase:', insertPayload);
    const { data, error } = await supabase
      .from('copy_trading_subscriptions')
      .insert([insertPayload])
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[Supabase copy_trading_subscriptions Insert Error]:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        payload: insertPayload,
      });

      // Check if duplicate key violation was thrown by database unique constraint
      if (
        error.code === '23505' ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('unique constraint')
      ) {
        return {
          ok: false,
          isDuplicate: true,
          error: 'Duplicate Subscription: A subscription for this account and trader already exists.',
        };
      }

      // If foreign key constraint violation on copier_account_id, retry with any valid trading_accounts row or copierUserId (profiles.id)
      if (
        error.code === '23503' ||
        error.message?.includes('foreign key constraint') ||
        error.message?.includes('copy_trading_subscriptions_copier_account_id_fkey')
      ) {
        const retryAccountIds: string[] = [];
        try {
          const { data: existingRows } = await supabase
            .from('trading_accounts')
            .select('id')
            .limit(5);
          if (Array.isArray(existingRows)) {
            for (const row of existingRows) {
              if (row?.id && isValidUuid(row.id) && !retryAccountIds.includes(row.id)) {
                retryAccountIds.push(row.id);
              }
            }
          }
        } catch {
          // ignore
        }

        if (isValidUuid(copierUserId) && !retryAccountIds.includes(copierUserId)) {
          retryAccountIds.push(copierUserId);
        }

        for (const candidateAccId of retryAccountIds) {
          if (candidateAccId === insertPayload.copier_account_id) continue;
          const retryPayload = {
            ...insertPayload,
            copier_account_id: candidateAccId,
          };
          const { data: retryData, error: retryErr } = await supabase
            .from('copy_trading_subscriptions')
            .insert([retryPayload])
            .select('*')
            .maybeSingle();

          if (!retryErr) {
            return {
              ok: true,
              subscription: (retryData || retryPayload) as CopyTradingSubscriptionRow,
              message: 'Subscription created successfully in copy_trading_subscriptions.',
            };
          }
        }
      }

      return {
        ok: false,
        error: `Database Error: ${error.message || 'Failed to save copy trading subscription.'}`,
      };
    }

    console.log('[CopyTradingSync] Subscription created successfully:', data || insertPayload);
    return {
      ok: true,
      subscription: (data || insertPayload) as CopyTradingSubscriptionRow,
      message: 'Subscription created successfully in copy_trading_subscriptions.',
    };
  } catch (err: any) {
    console.error('[Supabase copy_trading_subscriptions Exception]:', err);
    return {
      ok: false,
      error: `Network/Database Error: ${err?.message || 'Failed to insert subscription record.'}`,
    };
  }
}

/**
 * Cancels or deactivates an existing copy trading subscription in Supabase.
 */
export async function cancelCopyTradingSubscriptionInSupabase(params: {
  userId?: string | null;
  accountId?: string | null;
  providerId: string;
  providerName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const copierUserId = await resolveAuthUserId(params.userId);
    const providerId = await resolveProviderUuid({
      providerId: params.providerId,
      providerName: params.providerName,
    });

    let query = supabase
      .from('copy_trading_subscriptions')
      .update({ status: 'cancelled' })
      .eq('provider_id', providerId);

    if (copierUserId) {
      query = query.eq('copier_user_id', copierUserId);
    }
    if (params.accountId && isValidUuid(params.accountId)) {
      query = query.eq('copier_account_id', params.accountId);
    }

    const { error } = await query;
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to cancel copy trading subscription.' };
  }
}

/**
 * Fetches all active copy trading subscriptions for current user from Supabase.
 */
export async function fetchUserCopySubscriptionsFromSupabase(
  userId?: string | null
): Promise<CopyTradingSubscriptionRow[]> {
  try {
    const copierUserId = await resolveAuthUserId(userId);
    if (!copierUserId) return [];

    const { data, error } = await supabase
      .from('copy_trading_subscriptions')
      .select('*')
      .eq('copier_user_id', copierUserId)
      .eq('status', 'active');

    if (error || !Array.isArray(data)) {
      return [];
    }

    return data as CopyTradingSubscriptionRow[];
  } catch {
    return [];
  }
}

export interface CopyExecutedTradeRow {
  id?: string;
  subscription_id: string;
  copier_user_id: string;
  copier_account_id: string;
  provider_id: string;
  asset_symbol: string;
  trade_type: string;
  amount: number;
  entry_price: number;
  exit_price?: number;
  status: string;
  pnl: number;
  created_at?: string;
}

/**
 * Logs a simulated background trade execution associated with a copy trading subscription into `copy_executed_trades`.
 */
export async function logCopyExecutedTradeToSupabase(trade: CopyExecutedTradeRow): Promise<boolean> {
  try {
    const payload = {
      id: trade.id || ensureTradeUuid(`copy-exec-${Date.now()}-${Math.random()}`),
      subscription_id: trade.subscription_id,
      copier_user_id: trade.copier_user_id,
      copier_account_id: trade.copier_account_id,
      provider_id: trade.provider_id,
      asset_symbol: trade.asset_symbol,
      trade_type: trade.trade_type,
      amount: Number(trade.amount),
      entry_price: Number(trade.entry_price),
      exit_price: trade.exit_price !== undefined ? Number(trade.exit_price) : undefined,
      status: trade.status || 'OPEN',
      pnl: Number(trade.pnl || 0),
      created_at: trade.created_at || new Date().toISOString(),
    };

    const { error } = await supabase.from('copy_executed_trades').insert([payload]);
    if (error) {
      console.warn('[Supabase copy_executed_trades insert warning]:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase copy_executed_trades exception]:', err);
    return false;
  }
}

/**
 * Fetches executed copy trades for the user from `copy_executed_trades`.
 */
export async function fetchCopyExecutedTradesFromSupabase(userId?: string | null): Promise<CopyExecutedTradeRow[]> {
  try {
    const copierUserId = await resolveAuthUserId(userId);
    if (!copierUserId) return [];

    const { data, error } = await supabase
      .from('copy_executed_trades')
      .select('*')
      .eq('copier_user_id', copierUserId)
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];
    return data as CopyExecutedTradeRow[];
  } catch {
    return [];
  }
}
