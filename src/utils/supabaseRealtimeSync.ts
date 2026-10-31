import { supabase } from './supabase';
import {
  TradingAccount,
  UserProfile,
  WithdrawalRequest,
  ReferralRecord,
  ReferralLevel,
  KYCStatus,
} from '../types';
import { isPersonalLiveAccount, isDemoAccount } from './propRules';

export type ProfileBalanceColumn = 'self_balance' | 'demo_balance' | 'funded_balance';

export type ProfileSyncSource = 'realtime' | 'poll' | 'initial' | 'direct';

export interface ApplyRealtimeProfileOptions {
  source?: ProfileSyncSource;
  nowMs?: number;
  userId?: string;
  userEmail?: string;
}

export interface RealtimeProfileSyncResult {
  updatedProfile: UserProfile;
  updatedAccounts: TradingAccount[];
  changed: boolean;
}

export interface ActiveTradeLedgerEntry {
  tradeId: string;
  accountId: string;
  column: ProfileBalanceColumn | null;
  stake: number;
  preTradeBalance: number;
  deductedBalance: number;
  placedAt: number;
  endTime: number;
}

export interface LocalBalanceMutationRecord {
  column: ProfileBalanceColumn;
  committedBalance: number;
  lockedPreTradeRemoteBalance?: number;
  updatedAt: number;
  confirmedBySupabase: boolean;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_SELECT_COLUMNS = '*';

// Authoritative in-memory & localStorage-backed ledger for active trades and post-trade balance guards
const activeTradesLedger = new Map<string, ActiveTradeLedgerEntry>();
const settledTradeIdsSet = new Set<string>();
const lastObservedRemoteBalances: Partial<Record<ProfileBalanceColumn, number>> = {};
const localBalanceMutations: Partial<Record<ProfileBalanceColumn, LocalBalanceMutationRecord>> = {};
let cachedSupabaseProfileUuid: string | null = null;

/**
 * Resolves which Supabase `profiles` balance column corresponds to a given TradingAccount.
 */
export function resolveAccountBalanceColumn(
  account: TradingAccount | null | undefined
): ProfileBalanceColumn | null {
  if (!account || isDemoAccount(account)) return 'demo_balance';
  if (isPersonalLiveAccount(account)) return 'self_balance';
  if (account.phase === 'funded') return 'funded_balance';
  return null;
}

/**
 * Resets the in-memory balance sync ledger (used by unit tests for clean isolation).
 */
export function resetBalanceSyncLedgerForTests(): void {
  activeTradesLedger.clear();
  settledTradeIdsSet.clear();
  delete lastObservedRemoteBalances.self_balance;
  delete lastObservedRemoteBalances.demo_balance;
  delete lastObservedRemoteBalances.funded_balance;
  delete localBalanceMutations.self_balance;
  delete localBalanceMutations.demo_balance;
  delete localBalanceMutations.funded_balance;
  cachedSupabaseProfileUuid = null;
}

/**
 * Returns true if there is currently any active (unsettled) trade for the specified balance column.
 */
export function hasActiveTradesForColumn(
  column: ProfileBalanceColumn,
  nowMs: number = Date.now()
): boolean {
  for (const [id, entry] of activeTradesLedger.entries()) {
    // Auto-expire orphaned entries 15 seconds past their scheduled endTime
    if (entry.endTime > 0 && nowMs > entry.endTime + 15000) {
      activeTradesLedger.delete(id);
      continue;
    }
    if (entry.column === column) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a trade has already been settled to prevent duplicate settlement credits.
 */
export function isTradeAlreadySettled(tradeId: string): boolean {
  return settledTradeIdsSet.has(tradeId);
}

/**
 * Records an atomic balance deduction when a user places a trade:
 * - Immediately registers the active trade so real-time/polling listeners cannot overwrite the balance while active.
 * - Captures the pre-trade remote baseline so post-trade polls never jump back to pre-trade manual values.
 */
export function recordAtomicTradePlacement(params: {
  tradeId: string;
  accountId: string;
  column: ProfileBalanceColumn | null;
  stake: number;
  preTradeBalance: number;
  deductedBalance?: number;
  durationSeconds?: number;
  endTime?: number;
  nowMs?: number;
}): { deductedBalance: number } {
  const nowMs = params.nowMs ?? Date.now();
  const stake = Number(Math.max(0, params.stake).toFixed(2));
  const preTradeBalance = Number(params.preTradeBalance.toFixed(2));
  const deductedBalance =
    params.deductedBalance !== undefined
      ? Number(params.deductedBalance.toFixed(2))
      : Number(Math.max(0, preTradeBalance - stake).toFixed(2));
  const endTime =
    params.endTime ?? (params.durationSeconds ? nowMs + params.durationSeconds * 1000 : nowMs + 60000);

  activeTradesLedger.set(params.tradeId, {
    tradeId: params.tradeId,
    accountId: params.accountId,
    column: params.column,
    stake,
    preTradeBalance,
    deductedBalance,
    placedAt: nowMs,
    endTime,
  });

  if (params.column) {
    const existingMutation = localBalanceMutations[params.column];
    const baselineRemote =
      existingMutation?.lockedPreTradeRemoteBalance !== undefined
        ? existingMutation.lockedPreTradeRemoteBalance
        : lastObservedRemoteBalances[params.column] !== undefined
        ? lastObservedRemoteBalances[params.column]
        : preTradeBalance;

    localBalanceMutations[params.column] = {
      column: params.column,
      committedBalance: deductedBalance,
      lockedPreTradeRemoteBalance: baselineRemote,
      updatedAt: nowMs,
      confirmedBySupabase: false,
    };
  }

  return { deductedBalance };
}

/**
 * Accurately calculates the final post-trade balance when a trade closes (win, loss, or tie),
 * guaranteeing the stake was deducted once and adding the payout on win (or returning stake on tie).
 */
export function computeAuthoritativeSettledBalance(params: {
  tradeId: string;
  currentAccountBalance: number;
  stake: number;
  payoutPercentage: number;
  direction: 'CALL' | 'PUT';
  strikePrice: number;
  closePrice: number;
}): {
  status: 'won' | 'lost' | 'tie';
  pnl: number;
  creditedAmount: number;
  finalBalance: number;
} {
  const stake = Number(params.stake.toFixed(2));
  const priceDiff = params.closePrice - params.strikePrice;
  const isTie = Math.abs(priceDiff) < 1e-7;
  const isWin =
    !isTie &&
    ((params.direction === 'CALL' && priceDiff > 0) ||
      (params.direction === 'PUT' && priceDiff < 0));

  let status: 'won' | 'lost' | 'tie' = 'lost';
  let pnl = -stake;
  let creditedAmount = 0;

  if (isTie) {
    status = 'tie';
    pnl = 0;
    creditedAmount = stake;
  } else if (isWin) {
    status = 'won';
    const profit = Number(((stake * params.payoutPercentage) / 100).toFixed(2));
    pnl = profit;
    creditedAmount = Number((stake + profit).toFixed(2));
  }

  const placementEntry = activeTradesLedger.get(params.tradeId);
  let baseBalanceAfterStakeDeduction = Number(params.currentAccountBalance.toFixed(2));

  if (placementEntry) {
    // If currentAccountBalance was somehow reverted to preTradeBalance instead of deductedBalance,
    // enforce the deducted balance so the stake is always accounted for accurately.
    const revertedToPreTrade =
      Math.abs(baseBalanceAfterStakeDeduction - placementEntry.preTradeBalance) < 0.005 &&
      Math.abs(placementEntry.preTradeBalance - placementEntry.deductedBalance) > 0.005;
    if (revertedToPreTrade) {
      baseBalanceAfterStakeDeduction = placementEntry.deductedBalance;
    }
  }

  const finalBalance = Number(
    Math.max(0, baseBalanceAfterStakeDeduction + creditedAmount).toFixed(2)
  );

  return {
    status,
    pnl,
    creditedAmount,
    finalBalance,
  };
}

/**
 * Records atomic trade settlement and locks the post-trade balance so real-time/polling listeners
 * reflect the true post-trade balance without jumping back to pre-trade manual values.
 */
export function recordAtomicTradeSettlement(params: {
  tradeId: string;
  accountId: string;
  column: ProfileBalanceColumn | null;
  finalBalance: number;
  nowMs?: number;
}): void {
  const nowMs = params.nowMs ?? Date.now();
  const placementEntry = activeTradesLedger.get(params.tradeId);
  activeTradesLedger.delete(params.tradeId);
  settledTradeIdsSet.add(params.tradeId);

  const column = params.column ?? placementEntry?.column ?? null;
  if (column) {
    const existingMutation = localBalanceMutations[column];
    const baselineRemote =
      existingMutation?.lockedPreTradeRemoteBalance !== undefined
        ? existingMutation.lockedPreTradeRemoteBalance
        : placementEntry?.preTradeBalance ?? lastObservedRemoteBalances[column];

    localBalanceMutations[column] = {
      column,
      committedBalance: Number(params.finalBalance.toFixed(2)),
      lockedPreTradeRemoteBalance: baselineRemote,
      updatedAt: nowMs,
      confirmedBySupabase: false,
    };
  }
}

/**
 * Records a direct local balance change (e.g. deposit, withdrawal, or demo balance reset)
 * so polling does not revert it while the Supabase write is in flight.
 */
export function recordDirectBalanceCommit(
  column: ProfileBalanceColumn,
  newBalance: number,
  nowMs: number = Date.now()
): void {
  const rounded = Number(newBalance.toFixed(2));
  const baselineRemote = lastObservedRemoteBalances[column];
  localBalanceMutations[column] = {
    column,
    committedBalance: rounded,
    lockedPreTradeRemoteBalance: baselineRemote,
    updatedAt: nowMs,
    confirmedBySupabase: false,
  };
}

/**
 * Determines whether an incoming balance value from Supabase (realtime or polling)
 * should be accepted or rejected (e.g. while a trade is active or if it's a stale pre-trade value).
 */
export function shouldAcceptRemoteBalance(
  column: ProfileBalanceColumn,
  incomingValue: number | undefined,
  currentLocalValue: number | undefined,
  source: ProfileSyncSource = 'realtime',
  nowMs: number = Date.now()
): boolean {
  if (incomingValue === undefined || !Number.isFinite(incomingValue)) {
    return false;
  }

  // 1. Strict Active Trade Lock: never override local balance while a trade is active on this mode
  if (hasActiveTradesForColumn(column, nowMs)) {
    return false;
  }

  const mutation = localBalanceMutations[column];
  if (mutation) {
    // If incoming remote value matches our locally committed post-trade balance, confirm & accept!
    if (Math.abs(incomingValue - mutation.committedBalance) < 0.005) {
      mutation.confirmedBySupabase = true;
      lastObservedRemoteBalances[column] = incomingValue;
      return true;
    }

    // If incoming value is the exact stale pre-trade manual balance from before the trade:
    const isStalePreTradeValue =
      mutation.lockedPreTradeRemoteBalance !== undefined &&
      Math.abs(incomingValue - mutation.lockedPreTradeRemoteBalance) < 0.005 &&
      Math.abs(mutation.committedBalance - mutation.lockedPreTradeRemoteBalance) > 0.005;

    if (isStalePreTradeValue) {
      // Background polls or initial fetches must NEVER revert a post-trade balance back to the pre-trade value.
      if (source === 'poll' || source === 'initial') {
        return false;
      }
      // Even on a realtime event, ignore stale echo events that arrive within 4.5s of our trade commit.
      if (nowMs - mutation.updatedAt < 4500) {
        return false;
      }
    }

    // Within 3.5s of a local trade placement/settlement commit, block stale poll responses
    if ((source === 'poll' || source === 'initial') && nowMs - mutation.updatedAt < 3500) {
      return false;
    }

    // Otherwise, this is a genuine new external/admin update in Supabase!
    delete localBalanceMutations[column];
    lastObservedRemoteBalances[column] = incomingValue;
    return true;
  }

  lastObservedRemoteBalances[column] = incomingValue;
  return true;
}

/**
 * Atomically commits an updated account balance (`self_balance`, `demo_balance`, or `funded_balance`)
 * directly to the authenticated user's row in the Supabase `profiles` table.
 */
export async function commitProfileBalanceToSupabase(params: {
  userId?: string;
  userEmail?: string;
  column: ProfileBalanceColumn;
  newBalance: number;
}): Promise<boolean> {
  const rounded = Number(params.newBalance.toFixed(2));
  const payload: Record<string, number> = { [params.column]: rounded };

  const candidateUuids = new Set<string>();
  if (cachedSupabaseProfileUuid && UUID_REGEX.test(cachedSupabaseProfileUuid)) {
    candidateUuids.add(cachedSupabaseProfileUuid);
  }
  if (params.userId && UUID_REGEX.test(params.userId)) {
    candidateUuids.add(params.userId);
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id && UUID_REGEX.test(user.id)) {
      candidateUuids.add(user.id);
    }
  } catch {
    // ignore
  }

  for (const uid of Array.from(candidateUuids)) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', uid)
        .select('id, self_balance, demo_balance, funded_balance');
      if (!error && Array.isArray(data) && data.length > 0) {
        if (data[0]?.id && UUID_REGEX.test(String(data[0].id))) {
          cachedSupabaseProfileUuid = String(data[0].id);
        }
        lastObservedRemoteBalances[params.column] = rounded;
        if (localBalanceMutations[params.column]?.committedBalance === rounded) {
          localBalanceMutations[params.column]!.confirmedBySupabase = true;
        }
        return true;
      }
    } catch {
      // try next identifier
    }
  }

  const normalizedEmail = params.userEmail ? params.userEmail.trim().toLowerCase() : '';
  if (normalizedEmail) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(payload)
        .ilike('email', normalizedEmail)
        .select('id, self_balance, demo_balance, funded_balance');
      if (!error && Array.isArray(data) && data.length > 0) {
        if (data[0]?.id && UUID_REGEX.test(String(data[0].id))) {
          cachedSupabaseProfileUuid = String(data[0].id);
        }
        lastObservedRemoteBalances[params.column] = rounded;
        if (localBalanceMutations[params.column]?.committedBalance === rounded) {
          localBalanceMutations[params.column]!.confirmedBySupabase = true;
        }
        return true;
      }
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * Pure helper: applies a Supabase `profiles` row (from initial fetch or real-time UPDATE/INSERT)
 * to the current UserProfile and TradingAccount[] state, maintaining strict separation between
 * Personal Live (`self_balance`), Demo (`demo_balance`), and Funded (`funded_balance`) modes
 * while protecting active trades and post-trade balances from stale overrides.
 */
export function applyRealtimeProfileUpdate(
  prevProfile: UserProfile,
  prevAccounts: TradingAccount[],
  row: Record<string, any> | null | undefined,
  options?: ApplyRealtimeProfileOptions
): RealtimeProfileSyncResult {
  if (!row || typeof row !== 'object') {
    return { updatedProfile: prevProfile, updatedAccounts: prevAccounts, changed: false };
  }

  if (typeof row.id === 'string' && UUID_REGEX.test(row.id)) {
    cachedSupabaseProfileUuid = row.id;
  }

  const source: ProfileSyncSource = options?.source ?? 'realtime';
  const nowMs = options?.nowMs ?? Date.now();

  const parseNumeric = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const num = Number(val);
    return Number.isFinite(num) ? num : undefined;
  };

  const rawSelf = parseNumeric(row.self_balance);
  const rawDemo = parseNumeric(row.demo_balance);
  const rawFunded = parseNumeric(row.funded_balance);

  const acceptSelf = shouldAcceptRemoteBalance(
    'self_balance',
    rawSelf,
    prevProfile.selfBalance,
    source,
    nowMs
  );
  const acceptDemo = shouldAcceptRemoteBalance(
    'demo_balance',
    rawDemo,
    prevProfile.demoBalance,
    source,
    nowMs
  );
  const acceptFunded = shouldAcceptRemoteBalance(
    'funded_balance',
    rawFunded,
    prevProfile.fundedBalance,
    source,
    nowMs
  );

  const newSelf = acceptSelf
    ? rawSelf
    : localBalanceMutations.self_balance?.committedBalance ?? prevProfile.selfBalance;
  const newDemo = acceptDemo
    ? rawDemo
    : localBalanceMutations.demo_balance?.committedBalance ?? prevProfile.demoBalance;
  const newFunded = acceptFunded
    ? rawFunded
    : localBalanceMutations.funded_balance?.committedBalance ?? prevProfile.fundedBalance;

  // If a poll returned a stale pre-trade balance while we have an unconfirmed local mutation,
  // proactively re-commit the authoritative post-trade balance to Supabase.
  if (source === 'poll') {
    const uid = (typeof row.id === 'string' && row.id) || options?.userId || prevProfile.id;
    const uemail = (typeof row.email === 'string' && row.email) || options?.userEmail || prevProfile.email;
    if (!acceptSelf && rawSelf !== undefined && localBalanceMutations.self_balance) {
      commitProfileBalanceToSupabase({
        userId: uid,
        userEmail: uemail,
        column: 'self_balance',
        newBalance: localBalanceMutations.self_balance.committedBalance,
      }).catch(() => {});
    }
    if (!acceptDemo && rawDemo !== undefined && localBalanceMutations.demo_balance) {
      commitProfileBalanceToSupabase({
        userId: uid,
        userEmail: uemail,
        column: 'demo_balance',
        newBalance: localBalanceMutations.demo_balance.committedBalance,
      }).catch(() => {});
    }
    if (!acceptFunded && rawFunded !== undefined && localBalanceMutations.funded_balance) {
      commitProfileBalanceToSupabase({
        userId: uid,
        userEmail: uemail,
        column: 'funded_balance',
        newBalance: localBalanceMutations.funded_balance.committedBalance,
      }).catch(() => {});
    }
  }

  let resolvedKycStatus: KYCStatus = prevProfile.kycStatus;
  if (typeof row.kyc_status === 'string' && row.kyc_status.trim()) {
    const raw = row.kyc_status.trim().toLowerCase();
    if (raw === 'verified' || raw === 'approved') {
      resolvedKycStatus = 'verified';
    } else if (raw === 'pending' || raw === 'pending_verification' || raw === 'pending verification') {
      resolvedKycStatus = 'pending';
    } else if (raw === 'rejected' || raw === 'declined') {
      resolvedKycStatus = 'rejected';
    } else if (raw === 'unverified') {
      resolvedKycStatus = 'unverified';
    }
  }

  const nextSelf = newSelf !== undefined ? newSelf : prevProfile.selfBalance;
  const nextDemo = newDemo !== undefined ? newDemo : prevProfile.demoBalance;
  const nextFunded = newFunded !== undefined ? newFunded : prevProfile.fundedBalance;
  const nextFullName =
    typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : prevProfile.fullName;
  const nextReferralCode =
    typeof row.referral_code === 'string' && row.referral_code.trim()
      ? row.referral_code.trim()
      : prevProfile.referralCode;
  const nextReferredBy =
    typeof row.referred_by === 'string' && row.referred_by.trim()
      ? row.referred_by.trim()
      : prevProfile.referredBy;
  const nextLocked =
    row.profile_locked !== undefined && row.profile_locked !== null
      ? Boolean(row.profile_locked)
      : prevProfile.profileLocked;

  const profileChanged =
    nextSelf !== prevProfile.selfBalance ||
    nextDemo !== prevProfile.demoBalance ||
    nextFunded !== prevProfile.fundedBalance ||
    resolvedKycStatus !== prevProfile.kycStatus ||
    nextFullName !== prevProfile.fullName ||
    nextReferralCode !== prevProfile.referralCode ||
    nextReferredBy !== prevProfile.referredBy ||
    nextLocked !== prevProfile.profileLocked;

  const updatedProfile: UserProfile = profileChanged
    ? {
        ...prevProfile,
        id: typeof row.id === 'string' && row.id ? row.id : prevProfile.id,
        email: typeof row.email === 'string' && row.email ? row.email : prevProfile.email,
        fullName: nextFullName,
        referralCode: nextReferralCode,
        referredBy: nextReferredBy,
        kycStatus: resolvedKycStatus,
        profileLocked: nextLocked,
        selfBalance: nextSelf,
        demoBalance: nextDemo,
        fundedBalance: nextFunded,
      }
    : prevProfile;

  let accountsChanged = false;
  const updatedAccounts = prevAccounts.map((acc) => {
    if (isPersonalLiveAccount(acc) && newSelf !== undefined) {
      if (acc.currentBalance !== newSelf || acc.equity !== newSelf) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newSelf,
          equity: newSelf,
          startingDayEquity: newSelf > 0 && acc.startingDayEquity === 0 ? newSelf : acc.startingDayEquity,
          initialBalance: newSelf > 0 && acc.initialBalance === 0 ? newSelf : acc.initialBalance,
        };
      }
      return acc;
    }

    if (isDemoAccount(acc) && newDemo !== undefined) {
      if (acc.currentBalance !== newDemo || acc.equity !== newDemo) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newDemo,
          equity: newDemo,
        };
      }
      return acc;
    }

    if (acc.phase === 'funded' && !isPersonalLiveAccount(acc) && !isDemoAccount(acc) && newFunded !== undefined) {
      if (acc.currentBalance !== newFunded || acc.equity !== newFunded) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newFunded,
          equity: newFunded,
        };
      }
      return acc;
    }

    return acc;
  });

  return {
    updatedProfile,
    updatedAccounts: accountsChanged ? updatedAccounts : prevAccounts,
    changed: profileChanged || accountsChanged,
  };
}

/**
 * Pure helper: maps a Supabase `withdrawals` row into a frontend `WithdrawalRequest`.
 */
export function mapSupabaseWithdrawalToRequest(row: Record<string, any>): WithdrawalRequest {
  const grossAmount = Number(
    row.gross_amount ?? row.requested_amount ?? row.amount ?? 0
  );
  const feeAmount = Number(
    row.fee_amount ?? row.fee ?? Number((grossAmount * 0.1).toFixed(2))
  );
  const netAmount = Number(
    row.net_payout ?? row.net_amount ?? Math.max(0, Number((grossAmount - feeAmount).toFixed(2)))
  );

  const rawStatus = String(row.status || 'pending').toLowerCase();
  let normalizedStatus: WithdrawalRequest['status'] = 'pending';
  if (rawStatus === 'completed' || rawStatus === 'approved') {
    normalizedStatus = 'completed';
  } else if (rawStatus === 'paid') {
    normalizedStatus = 'paid';
  } else if (rawStatus === 'declined' || rawStatus === 'rejected') {
    normalizedStatus = 'rejected';
  } else if (rawStatus === 'processing') {
    normalizedStatus = 'processing';
  } else if (rawStatus === 'doubled') {
    normalizedStatus = 'doubled';
  } else {
    normalizedStatus = 'pending';
  }

  let requestedAtMs = Date.now();
  if (typeof row.requested_at === 'number' && row.requested_at > 0) {
    requestedAtMs = row.requested_at;
  } else if (typeof row.created_at === 'string' && row.created_at) {
    const parsed = Date.parse(row.created_at);
    if (!Number.isNaN(parsed)) requestedAtMs = parsed;
  }

  let completedAtMs: number | undefined;
  if (typeof row.processed_at === 'number' && row.processed_at > 0) {
    completedAtMs = row.processed_at;
  } else if (typeof row.updated_at === 'string' && (normalizedStatus === 'completed' || normalizedStatus === 'paid')) {
    const parsed = Date.parse(row.updated_at);
    if (!Number.isNaN(parsed)) completedAtMs = parsed;
  } else if (normalizedStatus === 'completed' || normalizedStatus === 'paid') {
    completedAtMs = Date.now();
  }

  const paymentMethod =
    row.payment_method === 'bank_transfer' || row.payout_method === 'bank_transfer'
      ? 'bank_transfer'
      : 'crypto_trc20';

  const bankDetails =
    row.bank_details && typeof row.bank_details === 'object' && row.bank_details.bankName
      ? {
          bankName: String(row.bank_details.bankName || ''),
          accountHolder: String(row.bank_details.accountHolder || ''),
          accountNumber: String(row.bank_details.accountNumber || ''),
          swiftCode: String(row.bank_details.swiftCode || ''),
        }
      : undefined;

  return {
    id: String(row.id || `WD-${requestedAtMs}`),
    accountId: String(row.account_id || 'BFT-LIVE-001'),
    amount: grossAmount,
    withdrawalFee: feeAmount,
    netReceivedAmount: netAmount,
    profitSplitApplied: row.account_type === 'personal_live' ? 100 : 80,
    paymentMethod,
    trc20Address: String(row.wallet_address || row.trc20_address || ''),
    bankDetails,
    referenceNumber: String(row.reference_number || row.tx_hash || `REF-${String(row.id || '').slice(0, 8)}`),
    requestedAt: requestedAtMs,
    completedAt: completedAtMs,
    status: normalizedStatus,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    txHash: row.tx_hash ? String(row.tx_hash) : undefined,
    isDoublePayoutEligible: Boolean(row.is_double_payout_eligible),
    timeElapsedSeconds: Number(row.time_elapsed_seconds || 92),
  };
}

/**
 * Pure helper: merges a real-time withdrawal event (`INSERT`, `UPDATE`, `DELETE`)
 * into the existing `WithdrawalRequest[]` list without duplicates.
 */
export function mergeRealtimeWithdrawal(
  prevWithdrawals: WithdrawalRequest[],
  row: Record<string, any> | null | undefined,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  oldRow?: Record<string, any> | null
): WithdrawalRequest[] {
  if (eventType === 'DELETE') {
    const deleteId = String(oldRow?.id || row?.id || '');
    if (!deleteId) return prevWithdrawals;
    return prevWithdrawals.filter((w) => String(w.id) !== deleteId);
  }

  if (!row || typeof row !== 'object') return prevWithdrawals;
  const incoming = mapSupabaseWithdrawalToRequest(row);

  // Check if we already have this withdrawal by exact ID or by matching accountId + amount within 15 seconds (optimistic local record)
  const existingIdx = prevWithdrawals.findIndex((w) => {
    if (String(w.id) === incoming.id) return true;
    const sameAccount = w.accountId === incoming.accountId;
    const sameAmount = Math.abs(w.amount - incoming.amount) < 0.01;
    const closeTimestamp = Math.abs(w.requestedAt - incoming.requestedAt) < 15000;
    return sameAccount && sameAmount && closeTimestamp;
  });

  if (existingIdx >= 0) {
    const next = [...prevWithdrawals];
    next[existingIdx] = {
      ...prevWithdrawals[existingIdx],
      ...incoming,
    };
    return next;
  }

  return [incoming, ...prevWithdrawals];
}

/**
 * Pure helper: maps a Supabase `referral_commissions` row into a frontend `ReferralRecord`.
 */
export function mapSupabaseCommissionToReferralRecord(row: Record<string, any>): ReferralRecord {
  const levelNum = Number(row.level);
  const validLevel: ReferralLevel = levelNum === 2 ? 2 : levelNum === 3 ? 3 : 1;
  const amount = Number(row.amount ?? row.commission_amount ?? 0);
  const rawType = String(row.commission_type || 'package').toLowerCase();
  const isWithdrawalBonus =
    rawType.includes('withdrawal') || rawType.includes('payout') || rawType.includes('royalty');

  const defaultRate = isWithdrawalBonus
    ? 0.08
    : validLevel === 1
    ? 0.1
    : validLevel === 2
    ? 0.05
    : 0.02;
  const rate = Number(row.commission_rate ?? defaultRate);
  const basePrice = Number(
    row.package_price ?? (rate > 0 ? Number((amount / rate).toFixed(2)) : amount)
  );

  const sourceId = String(row.source_user_id || row.referred_user_id || 'usr_referred');
  const createdAt =
    typeof row.created_at === 'string' && row.created_at
      ? row.created_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

  return {
    id: String(row.id || `COM-${Date.now()}`),
    referrerId: String(row.earner_id || row.referrer_id || ''),
    referredUserId: sourceId,
    referredUserName: String(
      row.source_name || row.referred_user_name || `Trader #${sourceId.slice(0, 6)}`
    ),
    referredUserEmail: String(
      row.source_email || row.referred_user_email || `${sourceId.slice(0, 6)}@trader.bft`
    ),
    level: validLevel,
    commissionType: isWithdrawalBonus ? 'withdrawal' : 'package',
    packageTier: (row.package_tier as any) || 'two-step',
    packageName: String(
      row.package_name ||
        (isWithdrawalBonus ? '8% Lifetime Payout Royalty' : `Level ${validLevel} Referral Commission`)
    ),
    packagePrice: basePrice,
    commissionRate: rate,
    commissionAmount: amount,
    status: row.status === 'pending' ? 'pending' : 'paid',
    createdAt,
  };
}

/**
 * Pure helper: merges a real-time referral commission event (`INSERT`, `UPDATE`, `DELETE`)
 * into the existing `ReferralRecord[]` list without duplicates.
 */
export function mergeRealtimeCommission(
  prevReferrals: ReferralRecord[],
  row: Record<string, any> | null | undefined,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  oldRow?: Record<string, any> | null
): ReferralRecord[] {
  if (eventType === 'DELETE') {
    const deleteId = String(oldRow?.id || row?.id || '');
    if (!deleteId) return prevReferrals;
    return prevReferrals.filter((r) => String(r.id) !== deleteId);
  }

  if (!row || typeof row !== 'object') return prevReferrals;
  const incoming = mapSupabaseCommissionToReferralRecord(row);

  const existingIdx = prevReferrals.findIndex((r) => String(r.id) === incoming.id);
  if (existingIdx >= 0) {
    const next = [...prevReferrals];
    next[existingIdx] = {
      ...prevReferrals[existingIdx],
      ...incoming,
    };
    return next;
  }

  return [incoming, ...prevReferrals];
}

export interface UserRealtimeSubscriptionCallbacks {
  userId: string;
  userEmail?: string;
  accountIds?: string[];
  onProfileRow: (row: Record<string, any>, source?: ProfileSyncSource) => void;
  onWithdrawalsInitial?: (rows: Record<string, any>[]) => void;
  onWithdrawalEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    newRow: Record<string, any> | null,
    oldRow: Record<string, any> | null
  ) => void;
  onCommissionsInitial?: (rows: Record<string, any>[]) => void;
  onCommissionEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    newRow: Record<string, any> | null,
    oldRow: Record<string, any> | null
  ) => void;
}

/**
 * Resolves the authoritative balance for a given account mode directly from the synchronized
 * UserProfile state (`selfBalance` for Personal Live / Self-Capital mode, `demoBalance` for Demo mode,
 * `fundedBalance` for Funded mode), falling back to the account's own `currentBalance`.
 */
export function getAuthoritativeAccountBalance(
  account: TradingAccount | null | undefined,
  userProfile?: UserProfile | null
): number {
  if (!account || isDemoAccount(account)) {
    if (
      userProfile?.demoBalance !== undefined &&
      userProfile?.demoBalance !== null &&
      Number.isFinite(Number(userProfile.demoBalance))
    ) {
      return Number(userProfile.demoBalance);
    }
    return Number(account?.currentBalance ?? 10000);
  }

  if (isPersonalLiveAccount(account)) {
    if (
      userProfile?.selfBalance !== undefined &&
      userProfile?.selfBalance !== null &&
      Number.isFinite(Number(userProfile.selfBalance))
    ) {
      return Number(userProfile.selfBalance);
    }
    return Number(account.currentBalance ?? 0);
  }

  if (
    account.phase === 'funded' &&
    userProfile?.fundedBalance !== undefined &&
    userProfile?.fundedBalance !== null &&
    Number.isFinite(Number(userProfile.fundedBalance))
  ) {
    return Number(userProfile.fundedBalance);
  }

  return Number(account.currentBalance ?? 0);
}

/**
 * Resolves the active trading account when toggling between Demo Mode (`demo_balance`),
 * Self-Capital / Personal Live Mode (`self_balance`), and Prop Evaluation/Funded accounts,
 * guaranteeing that the returned account carries the latest synchronized balance.
 */
export function resolveActiveTradingAccount(
  accounts: TradingAccount[],
  activeAccountId: string,
  userProfile?: UserProfile | null
): TradingAccount | undefined {
  if (!Array.isArray(accounts) || accounts.length === 0) return undefined;

  const cleanId = (activeAccountId || '').trim();
  let matched: TradingAccount | undefined;

  if (cleanId) {
    matched = accounts.find((acc) => acc.id === cleanId);
  }

  if (!matched && (cleanId === 'personal_live' || cleanId.startsWith('BFT-PERS'))) {
    matched = accounts.find((acc) => isPersonalLiveAccount(acc));
  }

  if (!matched && (cleanId === 'demo' || cleanId.startsWith('BFT-DEMO'))) {
    matched = accounts.find((acc) => isDemoAccount(acc));
  }

  if (!matched) {
    matched =
      accounts.find((acc) => isPersonalLiveAccount(acc) && getAuthoritativeAccountBalance(acc, userProfile) > 0) ||
      accounts[0];
  }

  if (!matched) return undefined;

  const authoritativeBal = getAuthoritativeAccountBalance(matched, userProfile);
  if (matched.currentBalance !== authoritativeBal || matched.equity !== authoritativeBal) {
    return {
      ...matched,
      currentBalance: authoritativeBal,
      equity: authoritativeBal,
    };
  }
  return matched;
}

/**
 * Fetches the user's row from the Supabase `profiles` table by `auth.uid()`, candidate UUIDs, or email fallback.
 */
export async function fetchSupabaseProfileRow(params: {
  userId?: string;
  userEmail?: string;
  authUid?: string;
  candidateIds?: Iterable<string>;
}): Promise<Record<string, any> | null> {
  const uuidsToTry = new Set<string>();
  if (params.authUid && UUID_REGEX.test(params.authUid)) {
    uuidsToTry.add(params.authUid);
  }
  if (params.userId && UUID_REGEX.test(params.userId)) {
    uuidsToTry.add(params.userId);
  }
  if (params.candidateIds) {
    for (const cid of params.candidateIds) {
      if (cid && UUID_REGEX.test(cid)) {
        uuidsToTry.add(cid);
      }
    }
  }

  for (const uid of Array.from(uuidsToTry)) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .eq('id', uid)
        .maybeSingle();
      if (data) return data;
    } catch {
      // ignore and try next
    }
  }

  const normalizedEmail = params.userEmail ? params.userEmail.trim().toLowerCase() : '';
  if (normalizedEmail) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (data) return data;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Sets up comprehensive Supabase real-time subscriptions (`postgres_changes`) for:
 * 1. `profiles` table (instant `self_balance`, `demo_balance`, `funded_balance`, and `kyc_status` sync)
 * 2. `withdrawals` table (instant pending -> completed/approved/declined status sync)
 * 3. `referral_commissions` table (instant affiliate commission & 8% withdrawal royalty sync)
 */
export function subscribeUserRealtimeChannels(callbacks: UserRealtimeSubscriptionCallbacks): () => void {
  const {
    userId,
    userEmail,
    accountIds = [],
    onProfileRow,
    onWithdrawalsInitial,
    onWithdrawalEvent,
    onCommissionsInitial,
    onCommissionEvent,
  } = callbacks;

  let isDisposed = false;
  const candidateIds = new Set<string>();
  if (userId) candidateIds.add(userId);
  let normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : '';
  const accountIdSet = new Set<string>(accountIds.filter(Boolean));
  let resolvedAuthUid: string | undefined;
  let authUidChannel: ReturnType<typeof supabase.channel> | null = null;

  const matchesUserProfile = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    if (row.id && candidateIds.has(String(row.id))) return true;
    if (
      normalizedEmail &&
      typeof row.email === 'string' &&
      row.email.trim().toLowerCase() === normalizedEmail
    ) {
      if (row.id) candidateIds.add(String(row.id));
      return true;
    }
    return false;
  };

  const matchesUserWithdrawal = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    if (row.user_id && candidateIds.has(String(row.user_id))) return true;
    if (
      normalizedEmail &&
      typeof row.user_email === 'string' &&
      row.user_email.trim().toLowerCase() === normalizedEmail
    ) {
      return true;
    }
    if (row.account_id && accountIdSet.has(String(row.account_id))) return true;
    return false;
  };

  const matchesUserCommission = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    const earnerId = String(row.earner_id || row.referrer_id || '');
    return Boolean(earnerId && candidateIds.has(earnerId));
  };

  const attachFilteredProfileChannel = (uid: string) => {
    if (isDisposed || !UUID_REGEX.test(uid)) return;
    if (authUidChannel) {
      supabase.removeChannel(authUidChannel);
      authUidChannel = null;
    }
    authUidChannel = supabase
      .channel(`realtime:profile_uid:${uid}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${uid}`,
        },
        (payload) => {
          if (isDisposed) return;
          const newRow = (payload.new as Record<string, any>) || null;
          if (newRow) {
            if (newRow.id) candidateIds.add(String(newRow.id));
            onProfileRow(newRow, 'realtime');
          }
        }
      )
      .subscribe();
  };

  const syncLatestProfileNow = async () => {
    if (isDisposed) return;
    try {
      const profileRow = await fetchSupabaseProfileRow({
        userId,
        userEmail: normalizedEmail,
        authUid: resolvedAuthUid,
        candidateIds,
      });
      if (!isDisposed && profileRow) {
        if (profileRow.id) {
          const pid = String(profileRow.id);
          const wasKnown = candidateIds.has(pid);
          candidateIds.add(pid);
          if (!wasKnown && UUID_REGEX.test(pid) && !authUidChannel) {
            attachFilteredProfileChannel(pid);
          }
        }
        onProfileRow(profileRow, 'poll');
      }
    } catch {
      // Ignore network/offline errors
    }
  };

  // Initial resolution of Supabase Auth user + initial data fetch
  const initAsync = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (session?.access_token) {
        try {
          supabase.realtime.setAuth(session.access_token);
        } catch {
          // ignore
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser().catch(() => ({ data: { user: session?.user ?? null } }));
      if (isDisposed) return;
      if (user?.id) {
        resolvedAuthUid = user.id;
        candidateIds.add(user.id);
        attachFilteredProfileChannel(user.id);
      }
      if (user?.email && !normalizedEmail) {
        normalizedEmail = user.email.trim().toLowerCase();
      }

      // 1. Fetch profile row by auth.uid(), ID, or Email
      await syncLatestProfileNow();
      if (isDisposed) return;

      // 2. Fetch initial withdrawals from Supabase (only query with valid UUIDs)
      if (onWithdrawalsInitial) {
        const uuidIds = Array.from(candidateIds).filter((id) => UUID_REGEX.test(id));
        if (uuidIds.length > 0) {
          const { data: wRows } = await supabase
            .from('withdrawals')
            .select('*')
            .in('user_id', uuidIds)
            .order('created_at', { ascending: false });
          if (!isDisposed && Array.isArray(wRows) && wRows.length > 0) {
            onWithdrawalsInitial(wRows);
          }
        }
      }

      // 3. Fetch initial referral commissions from Supabase (only query with valid UUIDs)
      if (onCommissionsInitial) {
        const uuidIds = Array.from(candidateIds).filter((id) => UUID_REGEX.test(id));
        if (uuidIds.length > 0) {
          const { data: cRows } = await supabase
            .from('referral_commissions')
            .select('*')
            .in('earner_id', uuidIds)
            .order('created_at', { ascending: false });
          if (!isDisposed && Array.isArray(cRows) && cRows.length > 0) {
            onCommissionsInitial(cRows);
          }
        }
      }
    } catch {
      // Ignore network/offline errors on initial sync
    }
  };

  initAsync();

  const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
    if (isDisposed) return;
    if (session?.access_token) {
      try {
        supabase.realtime.setAuth(session.access_token);
      } catch {
        // ignore
      }
    }
    if (session?.user?.id) {
      resolvedAuthUid = session.user.id;
      candidateIds.add(session.user.id);
      attachFilteredProfileChannel(session.user.id);
    }
    if (session?.user?.email && !normalizedEmail) {
      normalizedEmail = session.user.email.trim().toLowerCase();
    }
    if (session?.user) {
      syncLatestProfileNow();
    }
  });

  const channelKey = `realtime:user_sync:${userId || 'anon'}:${Date.now()}`;
  const channel = supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        if (isDisposed) return;
        const newRow = (payload.new as Record<string, any>) || null;
        if (newRow && matchesUserProfile(newRow)) {
          onProfileRow(newRow, 'realtime');
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'withdrawals',
      },
      (payload) => {
        if (isDisposed || !onWithdrawalEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserWithdrawal(newRow) || matchesUserWithdrawal(oldRow)) {
          onWithdrawalEvent(payload.eventType, newRow, oldRow);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'referral_commissions',
      },
      (payload) => {
        if (isDisposed || !onCommissionEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserCommission(newRow) || matchesUserCommission(oldRow)) {
          onCommissionEvent(payload.eventType, newRow, oldRow);
        }
      }
    )
    .subscribe();

  const pollInterval = setInterval(() => {
    if (!isDisposed) {
      syncLatestProfileNow();
    }
  }, 3000);

  const handleVisibilityOrFocus = () => {
    if (!isDisposed && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
      syncLatestProfileNow();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  }

  return () => {
    isDisposed = true;
    clearInterval(pollInterval);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    }
    authListener?.subscription?.unsubscribe();
    if (authUidChannel) {
      supabase.removeChannel(authUidChannel);
    }
    supabase.removeChannel(channel);
  };
}
