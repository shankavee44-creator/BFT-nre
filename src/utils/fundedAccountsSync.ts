import { supabase } from './supabase.ts';
import type { TradingAccount } from '../types/index.ts';
import {
  getDynamicAccountLimits,
  sanitizeAccountForAntiBreach,
  REAL_FUNDED_PROFIT_SPLIT_PERCENT,
} from './propRules.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function round2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

export interface FundedAccountRow {
  id: string;
  user_id: string;
  account_size: number;
  paid_amount: number;
  current_balance: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface FundedAccountInsertPayload {
  user_id: string;
  account_size: number;
  paid_amount: number;
  current_balance: number;
  status: string;
}

export interface AtomicFundedPurchaseAdapter {
  updateSelfCapitalBalance: (newBalance: number) => Promise<{ ok: boolean; error?: string }>;
  insertFundedAccount: (
    payload: FundedAccountInsertPayload
  ) => Promise<{ ok: boolean; row?: FundedAccountRow; error?: string }>;
}

export type AtomicFundedPurchaseResult =
  | {
      ok: true;
      row: FundedAccountRow;
      account: TradingAccount;
    }
  | {
      ok: false;
      stage: 'auth' | 'validation' | 'balance_deduction' | 'funded_account_insert';
      error: string;
      rolledBack: boolean;
    };

/**
 * Pure helper: builds the exact insert payload matching `public.funded_accounts`.
 */
export function buildFundedAccountInsertPayload(params: {
  userId: string;
  accountSize: number;
  paidAmount: number;
  status?: string;
}): FundedAccountInsertPayload {
  const size = round2(Math.max(0, Number(params.accountSize) || 0));
  const paid = round2(Math.max(0, Number(params.paidAmount) || 0));
  return {
    user_id: String(params.userId).trim(),
    account_size: size,
    paid_amount: paid,
    current_balance: size,
    status: params.status && params.status.trim() ? params.status.trim() : 'Challenge',
  };
}

/**
 * Pure helper: maps a `public.funded_accounts.status` value into TradingAccount status/phase/badge metadata.
 */
export function mapFundedAccountStatusToTradingState(rawStatus?: string | null): {
  status: TradingAccount['status'];
  phase: TradingAccount['phase'];
  breachType: 'none' | 'soft' | 'hard';
  accountTier: 'CHALLENGE' | 'REAL_FUNDED';
  badgeColor: 'red' | 'purple';
  isRealFunded: boolean;
  tierName: string;
  canonicalDbStatus: string;
} {
  const clean = String(rawStatus || 'Challenge').trim();
  const lower = clean.toLowerCase();

  if (lower.includes('real') || lower === 'funded' || lower === 'live_funded') {
    return {
      status: 'active',
      phase: 'funded',
      breachType: 'none',
      accountTier: 'REAL_FUNDED',
      badgeColor: 'purple',
      isRealFunded: true,
      tierName: 'Real Funded Account',
      canonicalDbStatus: 'Real Funded',
    };
  }

  if (lower.includes('pass')) {
    return {
      status: 'passed',
      phase: 'phase_1',
      breachType: 'none',
      accountTier: 'CHALLENGE',
      badgeColor: 'red',
      isRealFunded: false,
      tierName: 'Funded Challenge',
      canonicalDbStatus: 'Passed',
    };
  }

  if (lower.includes('soft')) {
    return {
      status: 'soft_breached',
      phase: 'phase_1',
      breachType: 'soft',
      accountTier: 'CHALLENGE',
      badgeColor: 'red',
      isRealFunded: false,
      tierName: 'Funded Challenge',
      canonicalDbStatus: 'Soft Breached',
    };
  }

  if (lower.includes('breach') || lower.includes('hard') || lower.includes('fail')) {
    return {
      status: 'hard_breached',
      phase: 'phase_1',
      breachType: 'hard',
      accountTier: 'CHALLENGE',
      badgeColor: 'red',
      isRealFunded: false,
      tierName: 'Funded Challenge',
      canonicalDbStatus: 'Breached',
    };
  }

  return {
    status: 'active',
    phase: 'phase_1',
    breachType: 'none',
    accountTier: 'CHALLENGE',
    badgeColor: 'red',
    isRealFunded: false,
    tierName: 'Funded Challenge',
    canonicalDbStatus: 'Challenge',
  };
}

/**
 * Pure helper: maps a frontend `TradingAccount` back to a clean `public.funded_accounts.status` string.
 */
export function mapTradingAccountToFundedStatus(account: Partial<TradingAccount>): string {
  const st = String(account.status || '').toLowerCase();
  if (st.includes('soft')) return 'Soft Breached';
  if (st.includes('hard') || st.includes('breach') || st === 'failed') return 'Breached';
  if (
    account.isRealFunded ||
    account.is_real_funded ||
    account.account_tier === 'REAL_FUNDED' ||
    (account.phase === 'funded' && st === 'active')
  ) {
    return 'Real Funded';
  }
  if (st === 'passed' || st === 'passed_phase_1') {
    return 'Passed';
  }
  return 'Challenge';
}

/**
 * Pure helper: converts a `public.funded_accounts` row into a full `TradingAccount`
 * compatible with Dashboard, Account Switcher, and Trading Terminal while preserving
 * Single Challenge rules and strict `"Challenge"` badge display.
 */
export function mapFundedAccountRowToTradingAccount(
  row: Record<string, any>,
  ownerEmail?: string
): TradingAccount {
  const rowId = String(row.id || `BFT-CH-${Date.now()}`).trim();
  const accountSize = round2(
    Number(row.account_size ?? row.initial_balance ?? row.starting_balance ?? row.size ?? 5000) || 5000
  );
  const paidAmount = round2(Number(row.paid_amount ?? 0) || 0);
  const state = mapFundedAccountStatusToTradingState(row.status);
  const limits = getDynamicAccountLimits('funded_challenge', state.phase);

  const rawBal = row.current_balance;
  const parsedBal =
    rawBal !== undefined && rawBal !== null && rawBal !== '' ? Number(rawBal) : NaN;
  const isBreached = state.breachType === 'hard' || state.breachType === 'soft';
  const currentBalance =
    Number.isFinite(parsedBal) && (parsedBal > 0 || isBreached)
      ? round2(parsedBal)
      : accountSize;

  const shortCode = rowId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'CH0001';
  const today = new Date().toISOString().split('T')[0];
  const createdDate =
    typeof row.created_at === 'string' && row.created_at ? row.created_at.split('T')[0] : today;
  const lastActiveDate =
    typeof row.updated_at === 'string' && row.updated_at ? row.updated_at.split('T')[0] : createdDate;

  const baseAccount: TradingAccount = {
    id: rowId,
    supabaseAccountId: rowId,
    fundedAccountId: rowId,
    ownerId: row.user_id ? String(row.user_id) : undefined,
    ownerEmail,
    loginId: `BFT-CH-${shortCode}`,
    passwordHash: `bft_live_${shortCode.toLowerCase()}`,
    tier: 'funded-challenge',
    accountType: 'funded_challenge',
    account_tier: state.accountTier,
    badge_color: state.badgeColor,
    tierName: state.tierName,
    fundedAccountStatus: String(row.status || state.canonicalDbStatus),
    paidAmount,
    size: accountSize,
    initialBalance: accountSize,
    currentBalance,
    startingDayEquity: currentBalance,
    equity: currentBalance,
    dailyLossLimitPercent: limits.dailyLossLimitPercent,
    maxOverallLossPercent: limits.maxOverallLossPercent,
    profitTargetPercent: state.isRealFunded ? 0 : limits.profitTargetPercent,
    maxRiskPerTradePercent: limits.maxRiskPerTradePercent,
    status: state.status,
    breachType: state.breachType,
    phase: state.phase,
    challengePhase: state.phase,
    isRealFunded: state.isRealFunded,
    is_real_funded: state.isRealFunded,
    principalLocked: state.isRealFunded,
    principal_locked: state.isRealFunded,
    profit_split_percent: state.isRealFunded ? REAL_FUNDED_PROFIT_SPLIT_PERCENT : 80,
    certificate_unlocked: state.status === 'passed' || state.isRealFunded,
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
    createdDate,
    lastActiveDate,
    sourceTable: 'funded_accounts',
  };

  // Preserve explicit DB breached status even when tradesCount is 0
  if (isBreached) {
    return {
      ...sanitizeAccountForAntiBreach(baseAccount),
      status: state.status,
      breachType: state.breachType,
      currentBalance,
      equity: currentBalance,
    };
  }

  return sanitizeAccountForAntiBreach(baseAccount);
}

/**
 * Pure helper: atomically orchestrates Self Capital balance deduction in Supabase (`profiles`)
 * followed by inserting the new Challenge row into `public.funded_accounts`.
 *
 * Guarantees balances never go out of sync:
 * - If Self Capital deduction fails, `public.funded_accounts` is NOT inserted.
 * - If `public.funded_accounts` insert fails after deduction, Self Capital is immediately
 *   rolled back to `previousSelfCapital`.
 */
export async function executeAtomicFundedAccountPurchaseWithAdapter(
  params: {
    userId: string;
    userEmail?: string;
    accountSize: number;
    paidAmount: number;
    previousSelfCapital: number;
    remainingSelfCapital: number;
  },
  adapter: AtomicFundedPurchaseAdapter
): Promise<AtomicFundedPurchaseResult> {
  const cleanUserId = String(params.userId || '').trim();
  if (!UUID_REGEX.test(cleanUserId)) {
    return {
      ok: false,
      stage: 'auth',
      error:
        'Unable to verify your Supabase account session. Please sign out and sign back in before purchasing a funded challenge.',
      rolledBack: false,
    };
  }

  const paidAmount = round2(params.paidAmount);
  const previousBalance = round2(params.previousSelfCapital);
  const remainingBalance = round2(params.remainingSelfCapital);
  const accountSize = round2(params.accountSize);

  if (paidAmount <= 0 || accountSize <= 0 || remainingBalance < 0 || previousBalance < paidAmount) {
    return {
      ok: false,
      stage: 'validation',
      error: 'Insufficient Self Capital balance or invalid package amount.',
      rolledBack: false,
    };
  }

  // Step 1: Deduct final price from user's Self Capital balance in Supabase
  const deductRes = await adapter.updateSelfCapitalBalance(remainingBalance);
  if (!deductRes.ok) {
    return {
      ok: false,
      stage: 'balance_deduction',
      error:
        deductRes.error ||
        'Could not deduct Self Capital balance in Supabase. Your balance was not changed—please try again.',
      rolledBack: false,
    };
  }

  // Step 2: Insert new row into public.funded_accounts
  const insertPayload = buildFundedAccountInsertPayload({
    userId: cleanUserId,
    accountSize,
    paidAmount,
    status: 'Challenge',
  });

  const insertRes = await adapter.insertFundedAccount(insertPayload);
  if (!insertRes.ok || !insertRes.row) {
    // Compensating rollback so Self Capital balance never goes out of sync
    const rollbackRes = await adapter
      .updateSelfCapitalBalance(previousBalance)
      .catch(() => ({ ok: false, error: 'Rollback failed' }));

    const baseReason = insertRes.error || 'Database insert failed';
    const syncNote = rollbackRes.ok
      ? 'Your Self Capital balance has been automatically restored.'
      : 'Please refresh or contact support to verify your Self Capital balance.';

    return {
      ok: false,
      stage: 'funded_account_insert',
      error: `Failed to save funded challenge to Supabase (${baseReason}). ${syncNote}`,
      rolledBack: rollbackRes.ok,
    };
  }

  const mappedAccount = mapFundedAccountRowToTradingAccount(insertRes.row, params.userEmail);
  return {
    ok: true,
    row: insertRes.row,
    account: mappedAccount,
  };
}

/**
 * Resolves the authenticated Supabase user UUID (preferring active Auth session so RLS `auth.uid() = user_id` matches).
 */
export async function resolveActiveFundedUserUuid(fallbackUserId?: string): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (session?.user?.id && UUID_REGEX.test(session.user.id)) {
      return session.user.id;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id && UUID_REGEX.test(user.id)) {
      return user.id;
    }
  } catch {
    // ignore
  }

  if (fallbackUserId && UUID_REGEX.test(fallbackUserId.trim())) {
    return fallbackUserId.trim();
  }
  return null;
}

/**
 * Fetches all rows from `public.funded_accounts` for the logged-in user.
 */
export async function fetchFundedAccountsForUser(params: {
  userId?: string;
  userEmail?: string;
}): Promise<TradingAccount[]> {
  const candidateUuids = new Set<string>();
  const activeUid = await resolveActiveFundedUserUuid(params.userId);
  if (activeUid) candidateUuids.add(activeUid);
  if (params.userId && UUID_REGEX.test(params.userId.trim())) {
    candidateUuids.add(params.userId.trim());
  }

  const uuids = Array.from(candidateUuids);
  if (uuids.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('funded_accounts')
      .select('*')
      .in('user_id', uuids)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Supabase funded_accounts] Fetch failed:', error.message);
      return [];
    }

    if (!Array.isArray(data)) return [];
    return data.map((row) => mapFundedAccountRowToTradingAccount(row, params.userEmail));
  } catch (err: any) {
    console.error('[Supabase funded_accounts] Fetch exception:', err?.message || err);
    return [];
  }
}

/**
 * Executes the live Supabase purchase flow:
 * 1. Deducts final package price from `profiles` (`self_balance` / `self_capital_balance`).
 * 2. Inserts a new row into `public.funded_accounts` with `user_id`, `account_size`, `paid_amount`, `current_balance = account_size`, and `status = 'Challenge'`.
 * 3. Rolls back the Self Capital deduction if the insert fails.
 */
export async function purchaseFundedAccountInSupabase(params: {
  userId?: string;
  userEmail?: string;
  accountSize: number;
  paidAmount: number;
  previousSelfCapital: number;
  remainingSelfCapital: number;
  updateProfileBalance: (
    userId: string,
    userEmail: string | undefined,
    newBalance: number
  ) => Promise<{ ok: boolean; error?: string }>;
}): Promise<AtomicFundedPurchaseResult> {
  const resolvedUuid = await resolveActiveFundedUserUuid(params.userId);
  if (!resolvedUuid) {
    console.error('[Supabase funded_accounts] Purchase aborted: no authenticated Supabase UUID.');
    return {
      ok: false,
      stage: 'auth',
      error:
        'Please sign in with your account to purchase a funded challenge. Your Self Capital balance was not changed.',
      rolledBack: false,
    };
  }

  return executeAtomicFundedAccountPurchaseWithAdapter(
    {
      userId: resolvedUuid,
      userEmail: params.userEmail,
      accountSize: params.accountSize,
      paidAmount: params.paidAmount,
      previousSelfCapital: params.previousSelfCapital,
      remainingSelfCapital: params.remainingSelfCapital,
    },
    {
      updateSelfCapitalBalance: async (newBalance) =>
        params.updateProfileBalance(resolvedUuid, params.userEmail, newBalance),
      insertFundedAccount: async (payload) => {
        try {
          const { data, error } = await supabase
            .from('funded_accounts')
            .insert([payload])
            .select('*')
            .single();

          if (error) {
            console.error('[Supabase funded_accounts] Insert failed:', {
              code: error.code,
              message: error.message,
              details: (error as any).details,
              payload,
            });
            return {
              ok: false,
              error: error.message || `Insert error (${error.code || 'unknown'})`,
            };
          }

          if (!data) {
            console.error('[Supabase funded_accounts] Insert returned empty row:', payload);
            return {
              ok: false,
              error: 'No row returned after insert into funded_accounts.',
            };
          }

          return { ok: true, row: data as FundedAccountRow };
        } catch (err: any) {
          console.error('[Supabase funded_accounts] Insert exception:', err?.message || err);
          return {
            ok: false,
            error: err?.message || 'Network error while saving funded account.',
          };
        }
      },
    }
  );
}

/**
 * Updates `current_balance`, `status`, and `updated_at` on an existing `public.funded_accounts` row
 * when trades settle or challenge status changes (Passed / Real Funded / Breached).
 */
export async function updateFundedAccountInSupabase(params: {
  accountId: string;
  supabaseAccountId?: string;
  fundedAccountId?: string;
  currentBalance?: number;
  status?: string;
}): Promise<{ ok: boolean; row?: FundedAccountRow; error?: string }> {
  const candidateId = [params.fundedAccountId, params.supabaseAccountId, params.accountId].find(
    (id) => typeof id === 'string' && UUID_REGEX.test(id.trim())
  );
  if (!candidateId) {
    return { ok: false, error: 'Non-UUID account ID; skipped funded_accounts update.' };
  }

  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (params.currentBalance !== undefined && Number.isFinite(Number(params.currentBalance))) {
    updatePayload.current_balance = round2(Number(params.currentBalance));
  }
  if (params.status && params.status.trim()) {
    updatePayload.status = params.status.trim();
  }

  try {
    const { data, error } = await supabase
      .from('funded_accounts')
      .update(updatePayload)
      .eq('id', candidateId.trim())
      .select('*')
      .maybeSingle();

    if (error) {
      console.warn('[Supabase funded_accounts] Update warning:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, row: (data as FundedAccountRow) || undefined };
  } catch (err: any) {
    console.warn('[Supabase funded_accounts] Update exception:', err?.message || err);
    return { ok: false, error: err?.message || 'Exception updating funded_accounts' };
  }
}

/**
 * Pure helper: checks whether an incoming `funded_accounts` Realtime event matches an existing
 * account in React state and merges it cleanly without duplicates.
 */
export function applyFundedAccountRealtimeEvent(
  prevAccounts: TradingAccount[],
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  incomingAccount: TradingAccount | null
): TradingAccount[] {
  if (!incomingAccount) return prevAccounts;
  const updated = [...prevAccounts];
  const idx = updated.findIndex(
    (a) =>
      a.id === incomingAccount.id ||
      (a.fundedAccountId && a.fundedAccountId === incomingAccount.id) ||
      (a.supabaseAccountId && a.supabaseAccountId === incomingAccount.id) ||
      (incomingAccount.supabaseAccountId && a.id === incomingAccount.supabaseAccountId) ||
      (incomingAccount.loginId && a.loginId && a.loginId === incomingAccount.loginId)
  );

  if (eventType === 'DELETE') {
    if (idx >= 0) updated.splice(idx, 1);
    return updated;
  }

  if (idx >= 0) {
    const existing = updated[idx];
    updated[idx] = {
      ...existing,
      ...incomingAccount,
      id: existing.id || incomingAccount.id,
      supabaseAccountId: incomingAccount.supabaseAccountId || incomingAccount.id,
      fundedAccountId: incomingAccount.fundedAccountId || incomingAccount.id,
      loginId: existing.loginId || incomingAccount.loginId,
      tradesCount: Math.max(existing.tradesCount || 0, incomingAccount.tradesCount || 0),
      winRate: existing.winRate || incomingAccount.winRate,
    };
    return updated;
  }

  // Place newly inserted challenge/funded accounts at the front so they appear immediately
  return [incomingAccount, ...updated];
}
