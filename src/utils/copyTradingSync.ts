import { supabase } from './supabase';
import { isValidUuid, ensureTradeUuid } from './supabaseTradeSync';
import { resolveCanonicalCopyAccountType } from './copyTradingRules';

export interface CopySubscriptionParams {
  userId?: string | null;
  userEmail?: string | null;
  accountId?: string | null;
  supabaseAccountId?: string | null;
  accountType?: string | null;
  accountCategory?: string | null;
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
export async function resolveAuthUserId(fallbackUserId?: string | null): Promise<string | null> {
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

  return null;
}

/**
 * Resolves or ensures a valid UUID in `public.trading_accounts` for `copier_account_id`.
 * Prevents foreign key constraint violations on `copy_trading_subscriptions_copier_account_id_fkey`.
 */
export async function resolveCopierAccountId(params: {
  userId: string;
  accountId?: string | null;
  supabaseAccountId?: string | null;
  accountType?: string | null;
}): Promise<string | null> {
  const { userId, accountId, supabaseAccountId, accountType } = params;

  // 1. If supabaseAccountId is already a valid UUID, verify it exists in trading_accounts
  if (supabaseAccountId && isValidUuid(supabaseAccountId)) {
    try {
      const { data: exists } = await supabase
        .from('trading_accounts')
        .select('id')
        .eq('id', supabaseAccountId)
        .maybeSingle();

      if (exists?.id) return exists.id;
    } catch {
      // ignore
    }
  }

  // 2. If accountId is already a valid UUID, verify or return it
  if (accountId && isValidUuid(accountId)) {
    try {
      const { data: exists } = await supabase
        .from('trading_accounts')
        .select('id')
        .eq('id', accountId)
        .maybeSingle();

      if (exists?.id) return exists.id;
    } catch {
      // ignore
    }
  }

  // 3. Query user's existing trading accounts in Supabase
  try {
    const { data: accounts } = await supabase
      .from('trading_accounts')
      .select('id, account_type')
      .eq('user_id', userId);

    if (Array.isArray(accounts) && accounts.length > 0) {
      if (accountType) {
        const match = accounts.find(
          (a) => a.account_type?.toLowerCase() === accountType.toLowerCase()
        );
        if (match?.id) return match.id;
      }
      return accounts[0].id;
    }
  } catch {
    // ignore
  }

  // 4. If no trading account exists, create default funded or live account row in trading_accounts
  try {
    const insertPayload: Record<string, any> = {
      user_id: userId,
      account_type: accountType || 'instant',
      starting_balance: 50000.0,
      current_balance: 50000.0,
      equity: 50000.0,
      daily_drawdown: 8.0,
      max_drawdown: 20.0,
      profit_target: 0.0,
      challenge_phase: 'funded',
      status: 'active',
    };
    if (accountId && isValidUuid(accountId)) {
      insertPayload.id = accountId;
    }

    const { data: created, error } = await supabase
      .from('trading_accounts')
      .insert([insertPayload])
      .select('id')
      .maybeSingle();

    if (!error && created?.id) {
      return created.id;
    }
  } catch {
    // ignore
  }

  // 5. Emergency fallback: create a guaranteed valid account row in trading_accounts without custom ID
  try {
    const { data: createdEmergency, error: errEmergency } = await supabase
      .from('trading_accounts')
      .insert([{
        user_id: userId,
        account_type: accountType || 'instant',
        starting_balance: 50000.0,
        current_balance: 50000.0,
        equity: 50000.0,
        status: 'active',
      }])
      .select('id')
      .maybeSingle();

    if (!errEmergency && createdEmergency?.id) {
      return createdEmergency.id;
    }
  } catch {
    // ignore
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
  const copierUserId = await resolveAuthUserId(params.userId);
  if (!copierUserId) {
    return {
      ok: false,
      error: 'Authentication Required: Please sign in to your BFT account to copy traders.',
    };
  }

  // 3. Resolve copier_account_id (ensuring foreign key validity in trading_accounts)
  const copierAccountId = await resolveCopierAccountId({
    userId: copierUserId,
    accountId: params.accountId,
    supabaseAccountId: params.supabaseAccountId,
    accountType: params.accountType || params.accountCategory,
  });

  if (!copierAccountId) {
    return {
      ok: false,
      error: 'Trading Account Error: Unable to resolve active trading account ID for copy trading.',
    };
  }

  // 3.5. Enforce Account Type Matching Rules
  const copierCanonical = resolveCanonicalCopyAccountType(params.accountType || params.accountCategory || params.accountId);
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
