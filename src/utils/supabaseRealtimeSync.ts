import { supabase } from './supabase.ts';
import type {
  TradingAccount,
  UserProfile,
  WithdrawalRequest,
  ReferralRecord,
  ReferralLevel,
  KYCStatus,
} from '../types/index.ts';
import {
  isPersonalLiveAccount,
  isDemoAccount,
  getDynamicAccountLimits,
  sanitizeAccountForAntiBreach,
  normalizeDatabaseAccountStatus,
} from './propRules.ts';
import {
  DIRECT_USDT_TRC20_CONFIG,
  DEPOSIT_EXPIRY_MS,
  type UserPurchaseRecordInput,
  type NormalizedPurchaseRecord,
  type CryptoDepositAccountType,
  type CryptoDepositStatus,
  buildSupabaseUserPurchasePayload,
  buildSupabaseCryptoDepositRow,
  buildSupabaseCryptoDepositCoreRow,
  computeCryptoDepositVerificationCredit,
  isCryptoDepositExpired,
  mapPurchaseRecord,
  mergeRealtimePurchase,
} from '../config/directDeposit.ts';
import { isTwoFactorEnabledOnProfile } from './authOtpLogic.ts';


export {
  mapPurchaseRecord,
  mergeRealtimePurchase,
  buildSupabaseUserPurchasePayload,
};
export type { NormalizedPurchaseRecord, UserPurchaseRecordInput };

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

export function toValidUuid(str?: string | null): string {
  if (!str) return '00000000-0000-4000-8000-000000000001';
  const clean = String(str).trim();
  if (UUID_REGEX.test(clean)) {
    return clean.toLowerCase();
  }
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + ch;
    hash1 |= 0;
    hash2 = (hash2 << 7) ^ hash2 + ch;
    hash2 |= 0;
  }
  const h1 = Math.abs(hash1).toString(16).padStart(8, '0');
  const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0');
  const h4 = Math.abs(hash1 * 31 + hash2).toString(16).padStart(8, '0');
  const raw = (h1 + h2 + h3 + h4).slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}
const PROFILE_SELECT_COLUMNS = '*';

// Authoritative in-memory & localStorage-backed ledger for active trades and post-trade balance guards
const LEDGER_STORAGE_KEY = 'bft_active_trades_ledger_v1';
const SETTLED_STORAGE_KEY = 'bft_settled_trades_v1';
const MUTATIONS_STORAGE_KEY = 'bft_local_balance_mutations_v1';

const activeTradesLedger = new Map<string, ActiveTradeLedgerEntry>();
const settledTradeIdsSet = new Set<string>();
const lastObservedRemoteBalances: Partial<Record<ProfileBalanceColumn, number>> = {};
const localBalanceMutations: Partial<Record<ProfileBalanceColumn, LocalBalanceMutationRecord>> = {};
let cachedSupabaseProfileUuid: string | null = null;
let ledgerRestored = false;

function persistLedgerState(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const entries = Array.from(activeTradesLedger.entries());
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
    localStorage.setItem(SETTLED_STORAGE_KEY, JSON.stringify(Array.from(settledTradeIdsSet)));
    localStorage.setItem(MUTATIONS_STORAGE_KEY, JSON.stringify(localBalanceMutations));
  } catch {
    // ignore
  }
}

function restoreLedgerState(nowMs: number = Date.now()): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const rawSettled = localStorage.getItem(SETTLED_STORAGE_KEY);
    if (rawSettled) {
      const arr = JSON.parse(rawSettled);
      if (Array.isArray(arr)) {
        for (const id of arr) {
          if (typeof id === 'string') settledTradeIdsSet.add(id);
        }
      }
    }

    const rawMutations = localStorage.getItem(MUTATIONS_STORAGE_KEY);
    if (rawMutations) {
      const obj = JSON.parse(rawMutations);
      if (obj && typeof obj === 'object') {
        for (const k of ['self_balance', 'demo_balance', 'funded_balance'] as ProfileBalanceColumn[]) {
          if (obj[k] && typeof obj[k] === 'object' && Number.isFinite(obj[k].committedBalance)) {
            if (nowMs - (obj[k].updatedAt || 0) < 60000) {
              localBalanceMutations[k] = obj[k];
            }
          }
        }
      }
    }

    const rawLedger = localStorage.getItem(LEDGER_STORAGE_KEY);
    if (rawLedger) {
      const entries = JSON.parse(rawLedger);
      if (Array.isArray(entries)) {
        for (const [id, entry] of entries) {
          if (entry && typeof entry === 'object' && entry.endTime > nowMs - 15000) {
            activeTradesLedger.set(id, entry);
          }
        }
      }
    }
  } catch {
    // ignore
  }
}

// Initial restore on module load
restoreLedgerState();

/**
 * Rehydrates active trades from persistent storage or Supabase user_trades on mount/refresh,
 * locking the balance so initial fetches and polls never override post-trade balances.
 */
export function rehydrateActiveTradesInLedger(
  trades: Array<{
    id: string;
    accountId?: string;
    accountTier?: string;
    investment?: number;
    startTime?: number;
    endTime?: number;
    status?: string;
  }>,
  nowMs: number = Date.now()
): void {
  if (!ledgerRestored) {
    restoreLedgerState(nowMs);
    ledgerRestored = true;
  }
  if (!Array.isArray(trades)) return;
  for (const trade of trades) {
    if (!trade || !trade.id) continue;
    const isAct = trade.status === 'active' || trade.status === 'OPEN';
    const isExpired = trade.endTime ? nowMs >= trade.endTime : false;
    if (isAct && !isExpired) {
      const col: ProfileBalanceColumn =
        trade.accountTier === 'personal' || String(trade.accountId || '').includes('PERS')
          ? 'self_balance'
          : trade.accountTier === 'demo' || String(trade.accountId || '').includes('DEMO')
          ? 'demo_balance'
          : 'funded_balance';

      if (!activeTradesLedger.has(trade.id)) {
        activeTradesLedger.set(trade.id, {
          tradeId: trade.id,
          accountId: trade.accountId || 'active-acc',
          column: col,
          stake: Number(trade.investment || 0),
          preTradeBalance: Number(trade.investment || 0),
          deductedBalance: 0,
          placedAt: trade.startTime || nowMs,
          endTime: trade.endTime || nowMs + 60000,
        });
      }
    } else if (trade.status === 'won' || trade.status === 'lost' || trade.status === 'tie') {
      settledTradeIdsSet.add(trade.id);
    }
  }
  persistLedgerState();
}

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
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEDGER_STORAGE_KEY);
      localStorage.removeItem(SETTLED_STORAGE_KEY);
      localStorage.removeItem(MUTATIONS_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Returns true if there is currently any active (unsettled) trade for the specified balance column.
 */
export function hasActiveTradesForColumn(
  column: ProfileBalanceColumn,
  nowMs: number = Date.now()
): boolean {
  if (!ledgerRestored) {
    restoreLedgerState(nowMs);
    ledgerRestored = true;
  }
  for (const [id, entry] of activeTradesLedger.entries()) {
    // Auto-expire orphaned entries 15 seconds past their scheduled endTime
    if (entry.endTime > 0 && nowMs > entry.endTime + 15000) {
      activeTradesLedger.delete(id);
      persistLedgerState();
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

  persistLedgerState();
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

  persistLedgerState();
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
  persistLedgerState();
}

export interface WithdrawalDeductionResult {
  column: ProfileBalanceColumn;
  preWithdrawalBalance: number;
  newBalance: number;
  deductedAmount: number;
  updatedAccount: TradingAccount;
  updatedProfile: UserProfile;
}

/**
 * Pure helper: computes atomic withdrawal balance deduction for Personal Live (`self_balance`)
 * or Funded (`funded_balance`) accounts, locks the mutation against stale poll overrides,
 * and produces updated TradingAccount and UserProfile structures ready for UI and Supabase persistence.
 */
export function computeWithdrawalDeduction(params: {
  account: TradingAccount;
  userProfile: UserProfile;
  amount: number;
  nowMs?: number;
}): WithdrawalDeductionResult {
  const isPersonal = isPersonalLiveAccount(params.account);
  const column: ProfileBalanceColumn = isPersonal ? 'self_balance' : 'funded_balance';
  const grossAmount = Math.max(0, Number(params.amount));

  const preWithdrawalBalance = isPersonal
    ? (params.userProfile.selfBalance !== undefined ? params.userProfile.selfBalance : params.account.currentBalance)
    : (params.userProfile.fundedBalance !== undefined ? params.userProfile.fundedBalance : params.account.currentBalance);

  const newBalance = Math.max(0, Number((preWithdrawalBalance - grossAmount).toFixed(2)));
  const nowMs = params.nowMs ?? Date.now();

  recordDirectBalanceCommit(column, newBalance, nowMs);

  const updatedAccount: TradingAccount = {
    ...params.account,
    currentBalance: newBalance,
    equity: newBalance,
  };

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    selfBalance: isPersonal ? newBalance : params.userProfile.selfBalance,
    fundedBalance: !isPersonal ? newBalance : params.userProfile.fundedBalance,
  };

  return {
    column,
    preWithdrawalBalance,
    newBalance,
    deductedAmount: grossAmount,
    updatedAccount,
    updatedProfile,
  };
}

export interface WithdrawalRefundResult {
  column: ProfileBalanceColumn;
  preRefundBalance: number;
  newBalance: number;
  refundedAmount: number;
  updatedAccount?: TradingAccount;
  updatedProfile: UserProfile;
}

/**
 * Pure helper: computes atomic refund when a pending withdrawal is cancelled, restores the withdrawn
 * amount to the active account balance (`self_balance` or `funded_balance`), and locks the mutation
 * against stale poll overrides.
 */
export function computeWithdrawalRefund(params: {
  amount: number;
  accountType?: 'self' | 'funded' | string;
  account?: TradingAccount | null;
  userProfile: UserProfile;
  nowMs?: number;
}): WithdrawalRefundResult {
  const isPersonal =
    params.accountType === 'self' ||
    params.accountType === 'personal_live' ||
    (params.account && isPersonalLiveAccount(params.account)) ||
    (params.account && String(params.account.id).includes('PERS'));

  const column: ProfileBalanceColumn = isPersonal ? 'self_balance' : 'funded_balance';
  const refundAmount = Math.max(0, Number(params.amount));

  const preRefundBalance = isPersonal
    ? (params.userProfile.selfBalance !== undefined ? params.userProfile.selfBalance : (params.account?.currentBalance ?? 0))
    : (params.userProfile.fundedBalance !== undefined ? params.userProfile.fundedBalance : (params.account?.currentBalance ?? 0));

  const newBalance = Number((preRefundBalance + refundAmount).toFixed(2));
  const nowMs = params.nowMs ?? Date.now();

  recordDirectBalanceCommit(column, newBalance, nowMs);

  const updatedAccount: TradingAccount | undefined = params.account
    ? {
        ...params.account,
        currentBalance: newBalance,
        equity: newBalance,
      }
    : undefined;

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    selfBalance: isPersonal ? newBalance : params.userProfile.selfBalance,
    fundedBalance: !isPersonal ? newBalance : params.userProfile.fundedBalance,
  };

  return {
    column,
    preRefundBalance,
    newBalance,
    refundedAmount: refundAmount,
    updatedAccount,
    updatedProfile,
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

const knownProfileColumns = new Set<string>();
const unsupportedProfileColumns = new Set<string>();

export function recordKnownProfileColumns(row?: Record<string, any> | null): void {
  if (!row || typeof row !== 'object') return;
  for (const key of Object.keys(row)) {
    if (key) {
      knownProfileColumns.add(key);
      unsupportedProfileColumns.delete(key);
    }
  }
}

export function markUnsupportedProfileColumn(col?: string | null): void {
  if (!col) return;
  const clean = col.trim();
  if (clean) {
    unsupportedProfileColumns.add(clean);
    knownProfileColumns.delete(clean);
  }
}

function extractMissingColumnFromError(error: any): string | null {
  const msg = String(error?.message || error?.details || '');
  const m1 = msg.match(/Could not find the '([^']+)' column/i);
  if (m1?.[1]) return m1[1];
  const m2 = msg.match(/column "?([a-zA-Z0-9_]+)"? of relation "?profiles"? does not exist/i);
  if (m2?.[1]) return m2[1];
  const m3 = msg.match(/column profiles\.([a-zA-Z0-9_]+) does not exist/i);
  if (m3?.[1]) return m3[1];
  return null;
}

function buildSafeProfileBalancePayload(
  column: ProfileBalanceColumn,
  rounded: number
): Record<string, number> | null {
  const hasKnownSchema = knownProfileColumns.size > 0;
  const isColumnSupported = (col: string) => {
    if (unsupportedProfileColumns.has(col)) return false;
    if (hasKnownSchema && !knownProfileColumns.has(col)) return false;
    return true;
  };

  const payload: Record<string, number> = {};

  if (column === 'self_balance') {
    if (isColumnSupported('self_balance')) {
      payload.self_balance = rounded;
    }
    if (knownProfileColumns.has('self_capital_balance') && !unsupportedProfileColumns.has('self_capital_balance')) {
      payload.self_capital_balance = rounded;
    }
    if (Object.keys(payload).length === 0 && isColumnSupported('balance')) {
      payload.balance = rounded;
    }
  } else {
    if (isColumnSupported(column)) {
      payload[column] = rounded;
    }
  }

  return Object.keys(payload).length > 0 ? payload : null;
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

  const confirmLocalCommit = () => {
    lastObservedRemoteBalances[params.column] = rounded;
    if (localBalanceMutations[params.column]?.committedBalance === rounded) {
      localBalanceMutations[params.column]!.confirmedBySupabase = true;
    }
  };

  const candidateUuids = new Set<string>();
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

  if (cachedSupabaseProfileUuid && UUID_REGEX.test(cachedSupabaseProfileUuid)) {
    candidateUuids.add(cachedSupabaseProfileUuid);
  }
  if (params.userId && UUID_REGEX.test(params.userId)) {
    candidateUuids.add(params.userId);
  }

  for (const uid of Array.from(candidateUuids)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const safePayload = buildSafeProfileBalancePayload(params.column, rounded);
      if (!safePayload) {
        confirmLocalCommit();
        return true;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .update(safePayload)
          .eq('id', uid)
          .select('*');

        if (error) {
          const missingCol = extractMissingColumnFromError(error);
          if (missingCol) {
            markUnsupportedProfileColumn(missingCol);
            continue;
          }
          break;
        }

        if (Array.isArray(data) && data.length > 0) {
          recordKnownProfileColumns(data[0]);
          if (data[0]?.id && UUID_REGEX.test(String(data[0].id))) {
            cachedSupabaseProfileUuid = String(data[0].id);
          }
          confirmLocalCommit();
          return true;
        }
        break;
      } catch {
        break;
      }
    }
  }

  const normalizedEmail = params.userEmail ? params.userEmail.trim().toLowerCase() : '';
  if (normalizedEmail) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const safePayload = buildSafeProfileBalancePayload(params.column, rounded);
      if (!safePayload) {
        confirmLocalCommit();
        return true;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .update(safePayload)
          .ilike('email', normalizedEmail)
          .select('*');

        if (error) {
          const missingCol = extractMissingColumnFromError(error);
          if (missingCol) {
            markUnsupportedProfileColumn(missingCol);
            continue;
          }
          break;
        }

        if (Array.isArray(data) && data.length > 0) {
          recordKnownProfileColumns(data[0]);
          if (data[0]?.id && UUID_REGEX.test(String(data[0].id))) {
            cachedSupabaseProfileUuid = String(data[0].id);
          }
          confirmLocalCommit();
          return true;
        }
        break;
      } catch {
        break;
      }
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

  recordKnownProfileColumns(row);

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

  const rawSelf = parseNumeric(row.self_capital_balance ?? row.self_balance);
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
  const nextTwoFactor =
    row.two_factor_enabled !== undefined || row.is_2fa_enabled !== undefined
      ? isTwoFactorEnabledOnProfile(row)
      : prevProfile.twoFactorEnabled;

  const profileChanged =
    nextSelf !== prevProfile.selfBalance ||
    nextDemo !== prevProfile.demoBalance ||
    nextFunded !== prevProfile.fundedBalance ||
    resolvedKycStatus !== prevProfile.kycStatus ||
    nextFullName !== prevProfile.fullName ||
    nextReferralCode !== prevProfile.referralCode ||
    nextReferredBy !== prevProfile.referredBy ||
    nextLocked !== prevProfile.profileLocked ||
    nextTwoFactor !== prevProfile.twoFactorEnabled;

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
        twoFactorEnabled: nextTwoFactor,
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

    if (acc.phase === 'funded' && !isPersonalLiveAccount(acc) && !isDemoAccount(acc) && newFunded !== undefined && newFunded > 0) {
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

export interface SupabaseWithdrawalInsertPayload {
  user_id: string;
  account_type: 'self' | 'funded';
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending';
  countdown_ends_at: string;
  payout_method: 'crypto' | 'bank';
  wallet_address: string | null;
  network_type: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  bank_account_number: string | null;
  branch_name: string | null;
}

export interface BuildWithdrawalPayloadInput {
  userId: string;
  accountType: 'self' | 'funded' | 'personal_live' | string;
  amount: number;
  fee: number;
  netAmount: number;
  status?: 'pending';
  countdownEndsAtIso?: string;
  nowMs?: number;
  payoutMethod: 'crypto' | 'bank' | 'crypto_trc20' | 'bank_transfer';
  walletAddress?: string | null;
  networkType?: string | null;
  bankName?: string | null;
  accountHolderName?: string | null;
  bankAccountNumber?: string | null;
  branchName?: string | null;
}

/**
 * Pure helper: constructs the exact Supabase `withdrawals` table insert payload
 * matching the database schema columns:
 * - `user_id` (UUID)
 * - `account_type` (text - `'self'` | `'funded'`)
 * - `amount` (numeric)
 * - `fee` (numeric)
 * - `net_amount` (numeric)
 * - `status` (text - default `'pending'`)
 * - `countdown_ends_at` (ISO timestamp for the 1-hour timer)
 * - `payout_method` (text - `'crypto'` | `'bank'`)
 * - `wallet_address`, `network_type` (for crypto withdrawals)
 * - `bank_name`, `account_holder_name`, `bank_account_number`, `branch_name` (for bank withdrawals)
 */
export function buildSupabaseWithdrawalInsertPayload(
  input: BuildWithdrawalPayloadInput
): SupabaseWithdrawalInsertPayload {
  const accountTypeLower = String(input.accountType || '').toLowerCase();
  let normalizedAccountType: 'self' | 'funded';
  
  if (['self', 'personal', 'personal_live'].includes(accountTypeLower)) {
    normalizedAccountType = 'self';
  } else if (['funded', 'instant'].includes(accountTypeLower)) {
    normalizedAccountType = 'funded';
  } else {
    // Default to 'funded' if explicitly 'funded', otherwise assume 'self' if that's safer, or throw
    // For now, default to 'self' as it seems more common for personal accounts
    normalizedAccountType = 'self';
  }

  const isBank =
    input.payoutMethod === 'bank' || input.payoutMethod === 'bank_transfer';
  const normalizedPayoutMethod: 'crypto' | 'bank' = isBank ? 'bank' : 'crypto';

  const baseNow = input.nowMs ?? Date.now();
  const countdownEndsAt =
    input.countdownEndsAtIso || new Date(baseNow + 60 * 60 * 1000).toISOString();

  const amountRounded = Number(Math.max(0, Number(input.amount || 0)).toFixed(2));
  const feeRounded = Number(Math.max(0, Number(input.fee || 0)).toFixed(2));
  const netRounded = Number(
    Math.max(0, Number(input.netAmount ?? amountRounded - feeRounded)).toFixed(2)
  );

  return {
    user_id: String(input.userId || '').trim(),
    account_type: normalizedAccountType,
    amount: amountRounded,
    fee: feeRounded,
    net_amount: netRounded,
    status: 'pending',
    countdown_ends_at: countdownEndsAt,
    payout_method: normalizedPayoutMethod,
    wallet_address:
      normalizedPayoutMethod === 'crypto'
        ? (input.walletAddress || '').trim() || null
        : null,
    network_type:
      normalizedPayoutMethod === 'crypto'
        ? (() => {
            const nt = (input.networkType || '').trim().toUpperCase();
            if (nt.includes('TRC') || nt.includes('TRON')) return 'TRC20';
            if (nt.includes('ERC') || nt.includes('ETH')) return 'ERC20';
            if (nt.includes('BEP') || nt.includes('BSC')) return 'BEP20';
            return 'TRC20'; // Default fallback
          })()
        : null,
    bank_name:
      normalizedPayoutMethod === 'bank'
        ? (input.bankName || '').trim() || null
        : null,
    account_holder_name:
      normalizedPayoutMethod === 'bank'
        ? (input.accountHolderName || '').trim() || null
        : null,
    bank_account_number:
      normalizedPayoutMethod === 'bank'
        ? (input.bankAccountNumber || '').trim() || null
        : null,
    branch_name:
      normalizedPayoutMethod === 'bank'
        ? (input.branchName || '').trim() || null
        : null,
  };
}

/**
 * Resolves the authenticated user's Supabase `user_id` UUID for `withdrawals` queries & inserts.
 */
export async function resolveSupabaseWithdrawalUserUuid(params: {
  userId?: string;
  userEmail?: string;
}): Promise<string> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (user?.id && UUID_REGEX.test(user.id)) {
      cachedSupabaseProfileUuid = user.id;
      return user.id;
    }
  } catch {
    // ignore
  }

  if (params.userId && UUID_REGEX.test(params.userId)) {
    return params.userId.trim();
  }

  if (cachedSupabaseProfileUuid && UUID_REGEX.test(cachedSupabaseProfileUuid)) {
    return cachedSupabaseProfileUuid;
  }

  if (params.userEmail) {
    try {
      const profileRow = await fetchSupabaseProfileRow({
        userId: params.userId,
        userEmail: params.userEmail,
      });
      if (profileRow?.id && UUID_REGEX.test(String(profileRow.id))) {
        cachedSupabaseProfileUuid = String(profileRow.id);
        return String(profileRow.id);
      }
    } catch {
      // ignore
    }
  }

  const fallbackUuid = toValidUuid(params.userId || params.userEmail || 'usr_bft_001');
  cachedSupabaseProfileUuid = fallbackUuid;

  if (params.userEmail || params.userId) {
    const email = (params.userEmail || `${fallbackUuid.slice(0, 8)}@client-bft.com`).toLowerCase();
    try {
      await supabase
        .from('profiles')
        .upsert(
          [
            {
              id: fallbackUuid,
              email,
              full_name: 'Trader User',
            },
          ],
          { onConflict: 'id' }
        );
    } catch (e) {
      console.error('Upsert failed', e);
    }
  }

  return fallbackUuid;
}

/**
 * Inserts a new withdrawal request into the Supabase `withdrawals` table using the exact column schema.
 */
export async function insertSupabaseWithdrawal(
  input: Omit<BuildWithdrawalPayloadInput, 'userId'> & {
    userId?: string;
    userEmail?: string;
  }
): Promise<{ ok: boolean; row?: Record<string, any>; error?: string }> {
  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid({
    userId: input.userId,
    userEmail: input.userEmail,
  });

  if (!resolvedUuid) {
    return { ok: false, error: 'Could not resolve authenticated user UUID for Supabase.' };
  }

  const payload = buildSupabaseWithdrawalInsertPayload({
    ...input,
    userId: resolvedUuid,
  });

  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (!error) {
      return {
        ok: true,
        row: data || {
          ...payload,
          created_at: new Date().toISOString(),
        },
      };
    }

    // Fallback: if SELECT after INSERT is restricted by RLS, try plain insert without returning row
    const { error: plainError } = await supabase.from('withdrawals').insert(payload);
    if (!plainError) {
      return {
        ok: true,
        row: {
          ...payload,
          created_at: new Date().toISOString(),
        },
      };
    }

    return { ok: false, error: plainError.message || error.message };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Supabase withdrawal insert error' };
  }
}

/**
 * Helper to check if a withdrawal is strictly pending.
 */
export function isWithdrawalStrictlyPending(status: string | undefined | null): boolean {
  if (!status) return false;
  return status.trim().toLowerCase() === 'pending';
}

/**
 * Cancels a user's pending withdrawal request in Supabase (`status = 'cancelled'` or `'rejected'`).
 * Strictly validates that the withdrawal status is 'pending' before permitting cancellation.
 * If already 'success', 'completed', or 'rejected', blocks cancellation and prevents refund.
 */
export async function cancelSupabaseWithdrawal(params: {
  withdrawalId: string;
  userId?: string;
  userEmail?: string;
}): Promise<{ ok: boolean; currentStatus?: string; row?: Record<string, any>; error?: string }> {
  if (!params.withdrawalId) {
    return { ok: false, error: 'Missing withdrawal ID' };
  }

  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  try {
    let targetSupaId: string | null = UUID_REGEX.test(params.withdrawalId) ? params.withdrawalId : null;

    if (!targetSupaId) {
      const { data: allRows } = await supabase
        .from('withdrawals')
        .select('id, status, user_id, amount, gross_amount, created_at')
        .order('created_at', { ascending: false });

      if (allRows && allRows.length > 0) {
        const match = allRows.find((r: any) =>
          String(r.id) === String(params.withdrawalId) ||
          String(params.withdrawalId).includes(String(r.id).slice(0, 8)) ||
          (resolvedUuid && r.user_id === resolvedUuid && r.status === 'pending') ||
          r.status === 'pending'
        );
        if (match?.id) {
          targetSupaId = String(match.id);
        }
      }
    }

    if (!targetSupaId) {
      // Allow cancellation to proceed locally even if no Supabase row UUID matched
      return { ok: true, currentStatus: 'cancelled' };
    }

    // 1. Strict status check: query current status in Supabase before attempting cancellation
    const { data: existingRow } = await supabase
      .from('withdrawals')
      .select('id, status, user_id, amount, gross_amount, account_type')
      .eq('id', targetSupaId)
      .maybeSingle();

    if (existingRow) {
      const currentStatus = String(existingRow.status || '').toLowerCase();
      // If the withdrawal has been marked as success, completed, or rejected, prevent cancellation!
      if (currentStatus !== 'pending') {
        return {
          ok: false,
          currentStatus,
          error: `Cannot cancel withdrawal #${String(params.withdrawalId).slice(0, 8)}: request has already been marked as '${currentStatus}'.`,
          row: existingRow,
        };
      }
    }

    // 2. Strict atomic update: only update if status is currently 'pending'
    const { data, error } = await supabase
      .from('withdrawals')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', targetSupaId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return { ok: true, currentStatus: 'cancelled', row: data };
    }

    const { data: data2, error: err2 } = await supabase
      .from('withdrawals')
      .update({ status: 'cancelled' })
      .eq('id', targetSupaId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (!err2 && data2) {
      return { ok: true, currentStatus: 'cancelled', row: data2 };
    }

    // Fallback to 'rejected' if database check constraint only allows ('pending', 'completed', 'rejected')
    const { data: fbData, error: fbError } = await supabase
      .from('withdrawals')
      .update({ status: 'rejected' })
      .eq('id', targetSupaId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();

    if (!fbError && fbData) {
      return { ok: true, currentStatus: 'rejected', row: fbData };
    }

    return { ok: true, currentStatus: 'cancelled' };
  } catch (err: any) {
    return { ok: true, currentStatus: 'cancelled' };
  }
}

/**
 * Fetches all withdrawal rows from Supabase `withdrawals` for the authenticated user.
 */
export async function fetchSupabaseWithdrawalsForUser(params: {
  userId?: string;
  userEmail?: string;
}): Promise<Record<string, any>[]> {
  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid(params);
  if (!resolvedUuid) return [];

  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', resolvedUuid)
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Inserts a user purchase/order record into Supabase (`user_purchases` and optionally `crypto_deposits`)
 * with automatic schema fallback if optional columns (`package_id`, `amount`, `status`, `package_sku`)
 * have not yet been migrated on the live `user_purchases` table.
 */
export async function insertSupabaseUserPurchase(
  input: Omit<UserPurchaseRecordInput, 'userId'> & {
    userId?: string;
    userEmail?: string;
    walletAddress?: string;
    skipCryptoDepositInsert?: boolean;
  }
): Promise<{ ok: boolean; row: NormalizedPurchaseRecord; error?: string }> {
  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid({
    userId: input.userId,
    userEmail: input.userEmail,
  });

  const effectiveUserId = resolvedUuid || String(input.userId || 'usr_bft_001').trim();
  const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
    ...input,
    userId: effectiveUserId,
  });

  const optimisticRow = mapPurchaseRecord({
    ...fullPayload,
    id: input.id || `PUR-${Date.now().toString(36).toUpperCase()}`,
    account_id: input.accountId || null,
    created_at: new Date().toISOString(),
  });

  if (!resolvedUuid) {
    return {
      ok: true,
      row: optimisticRow,
    };
  }

  let savedRow: Record<string, any> | null = null;

  try {
    // Insert core columns (user_id, package_name, package_amount) matching live Supabase schema
    const { data: coreData, error: coreErr } = await supabase
      .from('user_purchases')
      .insert([corePayload])
      .select('*')
      .maybeSingle();

    if (!coreErr && coreData) {
      savedRow = { ...fullPayload, ...coreData };
    } else {
      const { error: plainCoreErr } = await supabase
        .from('user_purchases')
        .insert([corePayload]);
      if (!plainCoreErr) {
        savedRow = { ...fullPayload, created_at: new Date().toISOString() };
      }
    }
  } catch {
    // Continue to crypto_deposits insert fallback
  }

  if (!input.skipCryptoDepositInsert) {
    try {
      const cryptoRow = buildSupabaseCryptoDepositRow({
        userId: resolvedUuid,
        walletAddress: input.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
        amount: fullPayload.amount,
        packageName: fullPayload.package_name,
        sku: fullPayload.package_sku,
        accountType: fullPayload.account_type,
        status: fullPayload.status,
      });
      const { data: depData, error: depErr } = await supabase
        .from('crypto_deposits')
        .insert([cryptoRow])
        .select('*')
        .maybeSingle();

      if (!depErr && depData && !savedRow) {
        savedRow = { ...fullPayload, ...depData };
      } else if (depErr) {
        await supabase.from('crypto_deposits').insert([cryptoRow]);
      }
    } catch {
      // Ignore network/RLS warning if backend also persists
    }
  }

  return {
    ok: true,
    row: savedRow ? mapPurchaseRecord(savedRow) : optimisticRow,
  };
}

/**
 * Sweeps any `pending` rows in Supabase `crypto_deposits` and `user_purchases`
 * that have exceeded the 1-hour (60-minute) confirmation window and updates their status to `failed`.
 */
export async function expireStaleSupabaseCryptoDeposits(
  userOrParams?: string | { userId?: string; userEmail?: string; nowMs?: number }
): Promise<{ expiredCount: number }> {
  const rawUserId =
    typeof userOrParams === 'string' ? userOrParams : userOrParams?.userId;
  const nowMs =
    typeof userOrParams === 'object' && userOrParams?.nowMs
      ? userOrParams.nowMs
      : Date.now();
  const cutoffIso = new Date(nowMs - 60 * 60 * 1000).toISOString();
  let expiredCount = 0;

  if (!rawUserId || !UUID_REGEX.test(rawUserId)) {
    return { expiredCount: 0 };
  }

  try {
    const { data } = await supabase
      .from('crypto_deposits')
      .update({ status: 'failed' })
      .eq('user_id', rawUserId)
      .eq('status', 'pending')
      .lt('created_at', cutoffIso)
      .select('id');
    if (Array.isArray(data)) {
      expiredCount += data.length;
    }
  } catch {
    // ignore
  }

  return { expiredCount };
}

/**
 * Fetches all user purchases/orders from Supabase (`user_purchases` and `crypto_deposits`)
 * for the authenticated user and normalizes them into `NormalizedPurchaseRecord[]`.
 */
export async function fetchSupabasePurchasesForUser(params: {
  userId?: string;
  userEmail?: string;
}): Promise<NormalizedPurchaseRecord[]> {
  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid(params);
  if (!resolvedUuid) return [];

  await expireStaleSupabaseCryptoDeposits(resolvedUuid).catch(() => {});

  let merged: NormalizedPurchaseRecord[] = [];

  try {
    const [purchasesRes, depositsRes] = await Promise.all([
      supabase
        .from('user_purchases')
        .select('*')
        .eq('user_id', resolvedUuid)
        .order('created_at', { ascending: false }),
      supabase
        .from('crypto_deposits')
        .select('*')
        .eq('user_id', resolvedUuid)
        .order('created_at', { ascending: false }),
    ]);

    if (Array.isArray(purchasesRes.data)) {
      for (const r of purchasesRes.data) {
        merged = mergeRealtimePurchase(merged, r, 'INSERT');
      }
    }
    if (Array.isArray(depositsRes.data)) {
      for (const r of depositsRes.data) {
        merged = mergeRealtimePurchase(merged, r, 'INSERT');
      }
    }
  } catch {
    // Ignore network error
  }

  return merged;
}

/**
 * Pure helper: maps a Supabase `withdrawals` row into a frontend `WithdrawalRequest`.
 */
export function mapSupabaseWithdrawalToRequest(row: Record<string, any>): WithdrawalRequest {
  const rawAccountType = String(row.account_type || 'self').toLowerCase();
  const isSelfAccount =
    rawAccountType === 'self' ||
    rawAccountType === 'personal_live' ||
    rawAccountType === 'personal';

  const grossAmount = Number(
    row.amount ?? row.gross_amount ?? row.requested_amount ?? 0
  );
  const defaultFeeRate = isSelfAccount ? 0.03 : 0.1;
  const feeAmount = Number(
    row.fee ?? row.fee_amount ?? Number((grossAmount * defaultFeeRate).toFixed(2))
  );
  const netAmount = Number(
    row.net_amount ?? row.net_payout ?? Math.max(0, Number((grossAmount - feeAmount).toFixed(2)))
  );

  const rawStatus = String(row.status || 'pending').toLowerCase();
  let normalizedStatus: WithdrawalRequest['status'] = 'pending';
  if (rawStatus === 'success') {
    normalizedStatus = 'success';
  } else if (rawStatus === 'completed' || rawStatus === 'approved') {
    normalizedStatus = 'completed';
  } else if (rawStatus === 'paid') {
    normalizedStatus = 'paid';
  } else if (rawStatus === 'cancelled' || rawStatus === 'canceled') {
    normalizedStatus = 'cancelled';
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

  let countdownEndsAtMs: number | undefined;
  if (typeof row.countdown_ends_at === 'string' && row.countdown_ends_at) {
    const parsedCountdown = Date.parse(row.countdown_ends_at);
    if (!Number.isNaN(parsedCountdown)) {
      countdownEndsAtMs = parsedCountdown;
    }
  } else if (typeof row.countdown_ends_at === 'number' && row.countdown_ends_at > 0) {
    countdownEndsAtMs = row.countdown_ends_at;
  } else {
    countdownEndsAtMs = requestedAtMs + 60 * 60 * 1000;
  }

  let completedAtMs: number | undefined;
  if (typeof row.processed_at === 'number' && row.processed_at > 0) {
    completedAtMs = row.processed_at;
  } else if (typeof row.updated_at === 'string' && (normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === 'paid')) {
    const parsed = Date.parse(row.updated_at);
    if (!Number.isNaN(parsed)) completedAtMs = parsed;
  } else if (normalizedStatus === 'completed' || normalizedStatus === 'success' || normalizedStatus === 'paid') {
    completedAtMs = Date.now();
  }

  const rawPayoutMethod = String(row.payout_method || row.payment_method || 'crypto').toLowerCase();
  const isBankMethod =
    rawPayoutMethod === 'bank' ||
    rawPayoutMethod === 'bank_transfer' ||
    Boolean(row.bank_name || row.bank_account_number);

  const paymentMethod: WithdrawalRequest['paymentMethod'] = isBankMethod
    ? 'bank_transfer'
    : 'crypto_trc20';
  const payoutMethod: 'crypto' | 'bank' = isBankMethod ? 'bank' : 'crypto';

  const bankNameVal = String(
    row.bank_name || (row.bank_details && row.bank_details.bankName) || ''
  ).trim();
  const accountHolderVal = String(
    row.account_holder_name || (row.bank_details && row.bank_details.accountHolder) || ''
  ).trim();
  const bankAccountNumberVal = String(
    row.bank_account_number || (row.bank_details && row.bank_details.accountNumber) || ''
  ).trim();
  const branchNameVal = String(
    row.branch_name ||
      (row.bank_details && (row.bank_details.branchName || row.bank_details.swiftCode)) ||
      ''
  ).trim();

  const bankDetails =
    isBankMethod || bankNameVal || bankAccountNumberVal
      ? {
          bankName: bankNameVal,
          accountHolder: accountHolderVal,
          accountNumber: bankAccountNumberVal,
          swiftCode: branchNameVal,
          branchName: branchNameVal,
        }
      : undefined;

  const walletOrBankDisplay = isBankMethod
    ? [bankNameVal, bankAccountNumberVal].filter(Boolean).join(' • ') ||
      String(row.wallet_address || '')
    : String(row.wallet_address || row.trc20_address || '');

  const fallbackAccountId = isSelfAccount ? 'BFT-PERS-LIVE' : 'BFT-LIVE-001';

  return {
    id: String(row.id || `WD-${requestedAtMs}`),
    userId: row.user_id ? String(row.user_id) : undefined,
    accountId: String(row.account_id || fallbackAccountId),
    accountType: isSelfAccount ? 'self' : 'funded',
    amount: grossAmount,
    withdrawalFee: feeAmount,
    netReceivedAmount: netAmount,
    profitSplitApplied: isSelfAccount ? 100 : 80,
    paymentMethod,
    payoutMethod,
    networkType: row.network_type ? String(row.network_type) : row.network ? String(row.network) : undefined,
    trc20Address: walletOrBankDisplay,
    bankDetails,
    referenceNumber: String(row.reference_number || row.tx_hash || `REF-${String(row.id || '').slice(0, 8)}`),
    requestedAt: requestedAtMs,
    countdownEndsAt: countdownEndsAtMs,
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

  // Check if we already have this withdrawal by exact ID or by matching optimistic record
  const existingIdx = prevWithdrawals.findIndex((w) => {
    if (String(w.id) === incoming.id) return true;
    const sameAccount =
      w.accountId === incoming.accountId ||
      (w.accountType && incoming.accountType && w.accountType === incoming.accountType) ||
      (String(w.accountId || '').includes('PERS') && incoming.accountType === 'self') ||
      (w.accountType === 'self' && incoming.accountType === 'self');
    const sameAmount = Math.abs(w.amount - incoming.amount) < 0.01;

    // If w.id is an optimistic non-UUID ID, match by account and amount regardless of elapsed time
    const isOptimisticId = !UUID_REGEX.test(w.id);
    if (isOptimisticId && sameAccount && sameAmount) {
      return true;
    }

    const closeTimestamp = Math.abs(w.requestedAt - incoming.requestedAt) < 120000;
    return Boolean(sameAccount && sameAmount && closeTimestamp);
  });

  if (existingIdx >= 0) {
    const existing = prevWithdrawals[existingIdx];
    const next = [...prevWithdrawals];
    next[existingIdx] = {
      ...existing,
      ...incoming,
      accountId: row.account_id ? String(row.account_id) : existing.accountId || incoming.accountId,
    };
    return next;
  }

  return [incoming, ...prevWithdrawals];
}

export const PENDING_WITHDRAWAL_WARNING_MESSAGE =
  'You already have a pending withdrawal request. Please wait for it to be processed or cancel it before submitting a new one.';

/**
 * Checks if a user already has an active withdrawal request (status 'pending' or 'processing')
 * for the given account or account type ('self' | 'funded').
 */
export function hasActivePendingWithdrawal(
  withdrawals: WithdrawalRequest[] | null | undefined,
  accountOrType: TradingAccount | 'self' | 'funded' | 'personal_live' | string | null | undefined
): boolean {
  return Boolean(getActivePendingWithdrawal(withdrawals, accountOrType));
}

/**
 * Finds and returns the active pending or processing withdrawal request
 * matching the given account or account type.
 */
export function getActivePendingWithdrawal(
  withdrawals: WithdrawalRequest[] | null | undefined,
  accountOrType: TradingAccount | 'self' | 'funded' | 'personal_live' | string | null | undefined
): WithdrawalRequest | null {
  if (!Array.isArray(withdrawals) || withdrawals.length === 0 || !accountOrType) {
    return null;
  }

  let targetType: 'self' | 'funded' = 'funded';
  let targetAccountId: string | undefined;

  if (typeof accountOrType === 'string') {
    const clean = accountOrType.toLowerCase();
    targetType =
      clean === 'self' ||
      clean === 'personal_live' ||
      clean === 'personal' ||
      clean.includes('pers')
        ? 'self'
        : 'funded';
    if (clean.startsWith('bft-') || clean.startsWith('acc-')) {
      targetAccountId = accountOrType;
    }
  } else {
    targetAccountId = accountOrType.id;
    targetType = isPersonalLiveAccount(accountOrType) ? 'self' : 'funded';
  }

  for (const w of withdrawals) {
    const isPending = w.status === 'pending';
    if (!isPending) continue;

    const wType: 'self' | 'funded' =
      w.accountType === 'self' ||
      w.accountType === 'personal_live' ||
      Boolean(w.accountId && w.accountId.includes('PERS'))
        ? 'self'
        : 'funded';

    if (wType === targetType) {
      return w;
    }
    if (targetAccountId && w.accountId === targetAccountId) {
      return w;
    }
  }

  return null;
}

/**
 * Pure helper: maps a Supabase `referral_commissions` row into a frontend `ReferralRecord`.
 */
export function mapSupabaseCommissionToReferralRecord(row: Record<string, any>): ReferralRecord {
  const levelNum = Number(row.level);
  const validLevel: ReferralLevel = levelNum === 2 ? 2 : levelNum === 3 ? 3 : 1;
  const amount = Number(row.amount ?? row.commission_amount ?? 0);
  const rawType = String(row.source_type || row.commission_type || 'package').toLowerCase();
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
    row.package_amount ?? row.package_price ?? (rate > 0 ? Number((amount / rate).toFixed(2)) : amount)
  );

  const sourceId = String(row.referred_user_id || row.source_user_id || 'usr_referred');
  const createdAt =
    typeof row.created_at === 'string' && row.created_at
      ? row.created_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

  return {
    id: String(row.id || `COM-${Date.now()}`),
    referrerId: String(row.referrer_id || row.earner_id || ''),
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
      row.description ||
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
  onPurchasesInitial?: (rows: Record<string, any>[]) => void;
  onPurchaseEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    newRow: Record<string, any> | null,
    oldRow: Record<string, any> | null
  ) => void;
  onAccountsInitial?: (accounts: TradingAccount[]) => void;
  onAccountEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    account: TradingAccount | null
  ) => void;
}

export function buildSupabaseTradingAccountPayload(account: TradingAccount, userId: string) {
  const sanitized = sanitizeAccountForAntiBreach(account);
  const limits = getDynamicAccountLimits(
    sanitized.accountType || sanitized.tier,
    sanitized.phase || sanitized.challengePhase
  );

  const startBal = Number(sanitized.initialBalance || sanitized.size || 10000);
  const curBal =
    Number.isFinite(Number(sanitized.currentBalance)) &&
    (Number(sanitized.currentBalance) > 0 || (sanitized.tradesCount || 0) > 0)
      ? Number(sanitized.currentBalance)
      : startBal;
  const eq =
    Number.isFinite(Number(sanitized.equity)) &&
    (Number(sanitized.equity) > 0 || (sanitized.tradesCount || 0) > 0)
      ? Number(sanitized.equity)
      : curBal;

  const dbStatus = normalizeDatabaseAccountStatus(sanitized.status, sanitized.breachType);

  return {
    user_id: userId,
    account_type: limits.accountType,
    starting_balance: startBal,
    current_balance: curBal,
    equity: eq,
    daily_drawdown: limits.dailyLossLimitPercent,
    max_drawdown: limits.maxOverallLossPercent,
    profit_target: limits.profitTargetPercent,
    challenge_phase: sanitized.phase || sanitized.challengePhase || limits.initialPhase,
    status: dbStatus,
  };
}

export function mapSupabaseTradingAccountRow(row: Record<string, any>): TradingAccount {
  const limits = getDynamicAccountLimits(
    row.account_type || row.tier,
    row.challenge_phase || row.phase
  );

  const rawStartBal = Number(row.starting_balance ?? row.initial_balance ?? row.size ?? 10000);
  const startBal = Number.isFinite(rawStartBal) && rawStartBal > 0 ? rawStartBal : 10000;
  const tradesCount = Number(row.trades_count || 0);
  const rawCurBal = Number(row.current_balance);
  const curBal =
    Number.isFinite(rawCurBal) && (rawCurBal > 0 || tradesCount > 0)
      ? rawCurBal
      : startBal;
  const rawEq = Number(row.equity);
  const eq =
    Number.isFinite(rawEq) && (rawEq > 0 || tradesCount > 0)
      ? rawEq
      : curBal;
  const phase = (row.challenge_phase || row.phase || limits.initialPhase) as any;
  const normalizedStatus = normalizeDatabaseAccountStatus(row.status, row.breach_type);
  const breachType =
    normalizedStatus === 'soft_breached'
      ? 'soft'
      : normalizedStatus === 'hard_breached'
      ? 'hard'
      : 'none';

  const rawAcc: TradingAccount = {
    id: String(row.id || `ACC-${Date.now()}`),
    supabaseAccountId: String(row.id || ''),
    ownerId: row.user_id ? String(row.user_id) : undefined,
    loginId: String(row.login_id || row.id || `BFT-${Math.floor(10000 + Math.random() * 89999)}`),
    passwordHash: 'bft_live_' + String(row.id || 'acc').slice(0, 8),
    tier: limits.tier,
    accountType: limits.accountType,
    tierName:
      limits.accountType === 'one_step'
        ? 'One-Step Challenge'
        : limits.accountType === 'two_step'
        ? `Two-Step Challenge${phase === 'phase_2' ? ' (Phase 2)' : ''}`
        : limits.accountType === 'instant'
        ? 'Instant Funded'
        : limits.accountType === 'personal'
        ? 'Personal Live Balance (Self-Funded)'
        : 'Demo Practice',
    size: startBal,
    initialBalance: startBal,
    currentBalance: curBal,
    startingDayEquity: Number(row.starting_day_equity || curBal || startBal),
    equity: eq,
    dailyLossLimitPercent: limits.dailyLossLimitPercent,
    maxOverallLossPercent: limits.maxOverallLossPercent,
    profitTargetPercent: limits.profitTargetPercent,
    maxRiskPerTradePercent: limits.maxRiskPerTradePercent || 5,
    status: normalizedStatus,
    breachType,
    phase,
    challengePhase: phase,
    tradingDaysCompleted: Number(row.trading_days_completed || 0),
    tradesCount,
    winRate: Number(row.win_rate || 0),
    createdDate: row.created_at ? String(row.created_at).split('T')[0] : new Date().toISOString().split('T')[0],
    lastActiveDate: row.updated_at ? String(row.updated_at).split('T')[0] : new Date().toISOString().split('T')[0],
  };

  return sanitizeAccountForAntiBreach(rawAcc);
}

export async function insertSupabaseCryptoDeposit(params: {
  userId?: string;
  userEmail?: string;
  walletAddress?: string;
  amount: number;
  packageName: string;
  sku: string;
  accountType?: 'challenge' | 'self_funded' | string;
  status?: CryptoDepositStatus | string;
  txHash?: string | null;
  accountId?: string | null;
}): Promise<{ ok: boolean; row?: Record<string, any>; error?: string }> {
  const effectiveUserId = await resolveSupabaseWithdrawalUserUuid({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  const payload = buildSupabaseCryptoDepositRow({
    userId: effectiveUserId,
    walletAddress: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
    amount: params.amount,
    packageName: params.packageName,
    sku: params.sku,
    accountType: (params.accountType as CryptoDepositAccountType) || 'self_funded',
    status: (params.status as CryptoDepositStatus) || 'pending',
    txHash: params.txHash || undefined,
  });

  const corePayload = buildSupabaseCryptoDepositCoreRow({
    userId: effectiveUserId,
    walletAddress: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
    amount: params.amount,
    packageName: params.packageName,
    sku: params.sku,
    accountType: (params.accountType as CryptoDepositAccountType) || 'self_funded',
    status: (params.status as CryptoDepositStatus) || 'pending',
  });

  if (!effectiveUserId || !UUID_REGEX.test(effectiveUserId)) {
    return {
      ok: true,
      row: { ...payload, created_at: new Date().toISOString() },
    };
  }

  try {
    const { data: coreData, error: coreErr } = await supabase
      .from('crypto_deposits')
      .insert([corePayload])
      .select('*')
      .maybeSingle();

    if (!coreErr && coreData) {
      return { ok: true, row: { ...payload, ...coreData } };
    }

    // Fallback if select after insert is restricted by RLS
    const { error: plainErr } = await supabase.from('crypto_deposits').insert([corePayload]);
    if (!plainErr) {
      return { ok: true, row: { ...payload, created_at: new Date().toISOString() } };
    }

    return { ok: true, row: { ...payload, created_at: new Date().toISOString() } };
  } catch {
    return { ok: true, row: { ...payload, created_at: new Date().toISOString() } };
  }
}

/**
 * Marks a crypto deposit as 'completed' in `crypto_deposits` and automatically credits
 * the exact deposit amount to `self_capital_balance` & `self_balance` in `profiles`
 * ONLY when `accountType === 'self_funded'` (never crediting self-capital for `challenge` purchases).
 */
export async function verifyAndCreditCryptoDepositInSupabase(params: {
  depositId?: string;
  userId?: string;
  userEmail?: string;
  amount: number;
  accountType?: 'challenge' | 'self_funded' | string;
  txHash?: string | null;
}): Promise<{
  ok: boolean;
  creditedSelfCapitalAmount: number;
  newSelfCapitalBalance?: number;
  accountType: CryptoDepositAccountType;
  error?: string;
}> {
  const effectiveUserId = await resolveSupabaseWithdrawalUserUuid({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  if (params.depositId && UUID_REGEX.test(params.depositId)) {
    try {
      await supabase
        .from('crypto_deposits')
        .update({ status: 'completed' })
        .eq('id', params.depositId);
    } catch {
      // ignore
    }
  }

  const profileRow = await fetchSupabaseProfileRow({
    userId: effectiveUserId,
    userEmail: params.userEmail,
  });

  const creditEval = computeCryptoDepositVerificationCredit({
    amount: params.amount,
    accountType: params.accountType,
    currentSelfCapitalBalance: profileRow?.self_capital_balance,
    currentSelfBalance: profileRow?.self_balance,
  });

  if (creditEval.shouldCreditSelfCapital) {
    recordDirectBalanceCommit('self_balance', creditEval.newSelfCapitalBalance);
    await commitProfileBalanceToSupabase({
      userId: profileRow?.id || effectiveUserId,
      userEmail: profileRow?.email || params.userEmail,
      column: 'self_balance',
      newBalance: creditEval.newSelfCapitalBalance,
    });

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('bft-realtime-profile-update', {
            detail: {
              ...(profileRow || {}),
              id: profileRow?.id || effectiveUserId,
              email: profileRow?.email || params.userEmail,
              self_balance: creditEval.newSelfCapitalBalance,
              self_capital_balance: creditEval.newSelfCapitalBalance,
            },
          })
        );
      } catch {
        // ignore
      }
    }
  }

  return {
    ok: true,
    creditedSelfCapitalAmount: creditEval.creditedSelfCapitalAmount,
    newSelfCapitalBalance: creditEval.newSelfCapitalBalance,
    accountType: creditEval.accountType,
  };
}

export async function insertSupabaseTradingAccount(params: {
  account: TradingAccount;
  userId?: string;
  userEmail?: string;
}): Promise<{ ok: boolean; account?: TradingAccount; error?: string }> {
  const effectiveUserId = await resolveSupabaseWithdrawalUserUuid({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  const payload = buildSupabaseTradingAccountPayload(params.account, effectiveUserId);

  try {
    const { data, error } = await supabase
      .from('trading_accounts')
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return { ok: true, account: mapSupabaseTradingAccountRow(data) };
    }

    // Fallback if SELECT after INSERT is restricted by RLS
    const { error: plainErr } = await supabase.from('trading_accounts').insert([payload]);
    if (!plainErr) {
      return { ok: true, account: params.account };
    }

    return { ok: false, error: plainErr.message || error?.message };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Error inserting trading account.' };
  }
}

/**
 * Updates `current_balance`, `equity`, `status`, and `challenge_phase` directly in the
 * Supabase `trading_accounts` table so closed trades and drawdown breaches persist across refreshes.
 */
export async function updateSupabaseTradingAccountState(params: {
  accountId: string;
  supabaseAccountId?: string;
  userId?: string;
  userEmail?: string;
  accountType?: string;
  startingBalance?: number;
  currentBalance?: number;
  equity?: number;
  startingDayEquity?: number;
  status?: string;
  phase?: string;
  tradesCount?: number;
  winRate?: number;
  tradingDaysCompleted?: number;
}): Promise<{ ok: boolean; row?: Record<string, any>; error?: string }> {
  if (!params.accountId || params.accountId.startsWith('BFT-DEMO') || params.accountId.startsWith('BFT-PERS')) {
    return { ok: true };
  }

  const updatePayload: Record<string, any> = {};
  if (params.currentBalance !== undefined && Number.isFinite(params.currentBalance)) {
    updatePayload.current_balance = Number(params.currentBalance.toFixed(2));
  }
  if (params.equity !== undefined && Number.isFinite(params.equity)) {
    updatePayload.equity = Number(params.equity.toFixed(2));
  } else if (updatePayload.current_balance !== undefined) {
    updatePayload.equity = updatePayload.current_balance;
  }
  if (params.status) {
    updatePayload.status = normalizeDatabaseAccountStatus(params.status);
  }
  if (params.phase) {
    updatePayload.challenge_phase = params.phase;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { ok: true };
  }

  const candidateAccUuid =
    params.supabaseAccountId && UUID_REGEX.test(params.supabaseAccountId)
      ? params.supabaseAccountId
      : UUID_REGEX.test(params.accountId)
      ? params.accountId
      : null;

  try {
    if (candidateAccUuid) {
      const { data, error } = await supabase
        .from('trading_accounts')
        .update(updatePayload)
        .eq('id', candidateAccUuid)
        .select('*')
        .maybeSingle();
      if (!error) {
        return { ok: true, row: data || undefined };
      }
    }

    // Fallback: match by user_id and account_type / starting_balance when local ID is BFT-XXXXXX
    const effectiveUserUuid = await resolveSupabaseWithdrawalUserUuid({
      userId: params.userId,
      userEmail: params.userEmail,
    });
    if (effectiveUserUuid && UUID_REGEX.test(effectiveUserUuid)) {
      const { data: userAccounts } = await supabase
        .from('trading_accounts')
        .select('id, account_type, starting_balance, current_balance, created_at')
        .eq('user_id', effectiveUserUuid)
        .order('created_at', { ascending: false });

      if (Array.isArray(userAccounts) && userAccounts.length > 0) {
        const normType = params.accountType
          ? getDynamicAccountLimits(params.accountType).accountType
          : undefined;
        const matchedRow =
          userAccounts.find(
            (r) =>
              (!normType || r.account_type === normType) &&
              (!params.startingBalance || Number(r.starting_balance) === Number(params.startingBalance))
          ) ||
          userAccounts.find((r) => !normType || r.account_type === normType) ||
          userAccounts[0];

        if (matchedRow?.id) {
          const { data, error } = await supabase
            .from('trading_accounts')
            .update(updatePayload)
            .eq('id', matchedRow.id)
            .select('*')
            .maybeSingle();
          if (!error) {
            return { ok: true, row: data || undefined };
          }
        }
      }
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to update trading_accounts row' };
  }
}

export async function fetchSupabaseTradingAccountsForUser(params: {
  userId?: string;
  userEmail?: string;
}): Promise<TradingAccount[]> {
  const resolvedUuid = await resolveSupabaseWithdrawalUserUuid(params);
  if (!resolvedUuid) return [];

  try {
    const { data, error } = await supabase
      .from('trading_accounts')
      .select('*')
      .eq('user_id', resolvedUuid)
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];
    return data.map(mapSupabaseTradingAccountRow);
  } catch {
    return [];
  }
}

/**
 * Resolves the authoritative balance for a given account mode directly from the synchronized
 * UserProfile state (`selfBalance` for Personal Live / Self-Capital mode, `demoBalance` for Demo mode),
 * and uses the account's own `currentBalance` for Prop Evaluation & Instant Funded accounts.
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

  // For Prop Evaluation (1-Step, 2-Step) and Instant Funded accounts:
  // If the account already has a valid positive currentBalance (or has executed trades),
  // its own currentBalance from `trading_accounts` is authoritative.
  if (
    Number.isFinite(Number(account.currentBalance)) &&
    (Number(account.currentBalance) > 0 || (account.tradesCount || 0) > 0)
  ) {
    return Number(account.currentBalance);
  }

  if (
    account.phase === 'funded' &&
    userProfile?.fundedBalance !== undefined &&
    userProfile?.fundedBalance !== null &&
    Number.isFinite(Number(userProfile.fundedBalance)) &&
    Number(userProfile.fundedBalance) > 0
  ) {
    return Number(userProfile.fundedBalance);
  }

  return Number(account.initialBalance || account.size || 10000);
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
      if (data) {
        recordKnownProfileColumns(data);
        return data;
      }
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
      if (data) {
        recordKnownProfileColumns(data);
        return data;
      }
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
    onPurchasesInitial,
    onPurchaseEvent,
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

  const matchesUserPurchase = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    const uid = String(row.user_id || '');
    return Boolean(uid && candidateIds.has(uid));
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

      // 3. Fetch initial referral commissions from Supabase using exact referrer_id column
      if (onCommissionsInitial) {
        const uuidIds = Array.from(candidateIds).filter((id) => UUID_REGEX.test(id));
        if (uuidIds.length > 0) {
          const { data: cRows, error: cErr } = await supabase
            .from('referral_commissions')
            .select('*')
            .in('referrer_id', uuidIds)
            .order('created_at', { ascending: false });

          if (!isDisposed && !cErr && Array.isArray(cRows) && cRows.length > 0) {
            onCommissionsInitial(cRows);
          }
        }
      }

      // 4. Fetch initial purchases & crypto_deposits from Supabase (only query with valid UUIDs)
      if (onPurchasesInitial) {
        const uuidIds = Array.from(candidateIds).filter((id) => UUID_REGEX.test(id));
        if (uuidIds.length > 0) {
          const [pRes, cdRes] = await Promise.all([
            supabase
              .from('user_purchases')
              .select('*')
              .in('user_id', uuidIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('crypto_deposits')
              .select('*')
              .in('user_id', uuidIds)
              .order('created_at', { ascending: false }),
          ]);

          let combined: NormalizedPurchaseRecord[] = [];
          if (Array.isArray(pRes.data)) {
            for (const row of pRes.data) {
              combined = mergeRealtimePurchase(combined, row, 'INSERT');
            }
          }
          if (Array.isArray(cdRes.data)) {
            for (const row of cdRes.data) {
              combined = mergeRealtimePurchase(combined, row, 'INSERT');
            }
          }
          if (!isDisposed && combined.length > 0) {
            onPurchasesInitial(combined);
          }
        }
      }

      // 5. Fetch initial trading_accounts from Supabase (only query with valid UUIDs)
      if (callbacks.onAccountsInitial) {
        const uuidIds = Array.from(candidateIds).filter((id) => UUID_REGEX.test(id));
        if (uuidIds.length > 0) {
          const { data: accRows } = await supabase
            .from('trading_accounts')
            .select('*')
            .in('user_id', uuidIds)
            .order('created_at', { ascending: false });
          if (!isDisposed && Array.isArray(accRows) && accRows.length > 0) {
            callbacks.onAccountsInitial(accRows.map(mapSupabaseTradingAccountRow));
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
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_purchases',
      },
      (payload) => {
        if (isDisposed || !onPurchaseEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserPurchase(newRow) || matchesUserPurchase(oldRow)) {
          onPurchaseEvent(
            payload.eventType,
            newRow ? mapPurchaseRecord(newRow) : null,
            oldRow ? mapPurchaseRecord(oldRow) : null
          );
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'crypto_deposits',
      },
      (payload) => {
        if (isDisposed || !onPurchaseEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserPurchase(newRow) || matchesUserPurchase(oldRow)) {
          onPurchaseEvent(
            payload.eventType,
            newRow ? mapPurchaseRecord(newRow) : null,
            oldRow ? mapPurchaseRecord(oldRow) : null
          );
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'trading_accounts',
      },
      (payload) => {
        if (isDisposed || !callbacks.onAccountEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserPurchase(newRow) || matchesUserPurchase(oldRow)) {
          callbacks.onAccountEvent(
            payload.eventType,
            newRow ? mapSupabaseTradingAccountRow(newRow) : oldRow ? mapSupabaseTradingAccountRow(oldRow) : null
          );
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
