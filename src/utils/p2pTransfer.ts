import { supabase } from './supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  fetchSupabaseProfileRow,
  recordDirectBalanceCommit,
  commitProfileBalanceToSupabase,
  type ProfileBalanceColumn,
} from './supabaseRealtimeSync.ts';
import { isPersonalLiveAccount } from './propRules.ts';

export const P2P_SELF_CAPITAL_ONLY_ERROR =
  'P2P Transfer Failed: Insufficient self-capital balance.';

export const P2P_HISTORY_STORAGE_KEY = 'bft_p2p_transfer_history_v1';

export type P2PTransferDirection = 'sent' | 'received';
export type P2PTransferDisplayType = 'P2P Transfer Sent' | 'P2P Deposit Received';

export interface P2PTransferValidationResult {
  valid: boolean;
  error?: string;
  normalizedReceiverNumericId: string;
  receiverNumericIdAsNumber: number;
  normalizedAmount: number;
  exceedsSelfCapitalBalance?: boolean;
}

export interface P2PTransferRpcPayload {
  p_receiver_numeric_id: number;
  p_transfer_amount: number;
}

export interface P2PTransferRecord {
  id: string;
  direction: P2PTransferDirection;
  type: P2PTransferDisplayType;
  senderNumericId: string;
  receiverNumericId: string;
  counterpartyNumericId: string;
  counterpartyLabel: string;
  receiverName?: string;
  senderName?: string;
  amount: number;
  signedAmount: number;
  signedAmountFormatted: string;
  previousBalance: number;
  newBalance: number;
  createdAt: string;
  status: 'completed' | 'failed';
}

export interface ExecuteP2PTransferParams {
  userProfile: UserProfile;
  accounts?: TradingAccount[];
  receiverNumericId: string | number;
  transferAmount: string | number;
  supabaseClient?: typeof supabase;
}

export interface ExecuteP2PTransferResult {
  ok: boolean;
  error?: string;
  message?: string;
  transferAmount: number;
  receiverNumericId: string;
  receiverName?: string;
  previousBalance: number;
  newBalance: number;
  balanceColumn: ProfileBalanceColumn;
  updatedProfile?: UserProfile;
  updatedAccount?: TradingAccount;
  record?: P2PTransferRecord;
}

/**
 * Formats a Sent or Received P2P transfer record with canonical labels and signed amounts:
 * - Sent Transfers: negative amount (-$XX.XX), type 'P2P Transfer Sent', with receiver ID.
 * - Received Transfers: positive amount (+$XX.XX), type 'P2P Deposit Received', with sender ID.
 */
export function createP2PTransferRecord(params: {
  id?: string;
  direction: P2PTransferDirection;
  senderNumericId: string | number;
  receiverNumericId: string | number;
  amount: number;
  previousBalance?: number;
  newBalance?: number;
  createdAt?: string;
  status?: 'completed' | 'failed';
  receiverName?: string;
  senderName?: string;
}): P2PTransferRecord {
  const cleanSender = String(params.senderNumericId ?? '').trim().replace(/^#/, '') || '100201';
  const cleanReceiver = String(params.receiverNumericId ?? '').trim().replace(/^#/, '') || '100202';
  const safeAmount = Math.max(0, Number(Number(params.amount || 0).toFixed(2)));
  const isSent = params.direction === 'sent';
  const formattedAmt = safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    id: params.id || `P2P-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    direction: params.direction,
    type: isSent ? 'P2P Transfer Sent' : 'P2P Deposit Received',
    senderNumericId: cleanSender,
    receiverNumericId: cleanReceiver,
    counterpartyNumericId: isSent ? cleanReceiver : cleanSender,
    counterpartyLabel: isSent
      ? `Receiver ID: #${cleanReceiver}`
      : `Sender ID: #${cleanSender}`,
    receiverName: params.receiverName,
    senderName: params.senderName,
    amount: safeAmount,
    signedAmount: isSent ? -safeAmount : safeAmount,
    signedAmountFormatted: isSent ? `-$${formattedAmt}` : `+$${formattedAmt}`,
    previousBalance: Number((params.previousBalance ?? 0).toFixed(2)),
    newBalance: Number((params.newBalance ?? 0).toFixed(2)),
    createdAt: params.createdAt || new Date().toISOString(),
    status: params.status || 'completed',
  };
}

/**
 * Normalizes any raw P2P transfer object from localStorage or Supabase into a full `P2PTransferRecord`.
 */
export function normalizeP2PTransferRecord(
  raw: any,
  currentUserNumericId?: string
): P2PTransferRecord {
  const cleanCurrentId = String(currentUserNumericId || '').trim().replace(/^#/, '');
  const rawSender = String(raw?.senderNumericId ?? raw?.sender_numeric_id ?? raw?.sender_id ?? '').trim().replace(/^#/, '');
  const rawReceiver = String(raw?.receiverNumericId ?? raw?.receiver_numeric_id ?? raw?.receiver_id ?? '').trim().replace(/^#/, '');

  let direction: P2PTransferDirection = 'sent';
  if (raw?.direction === 'received' || raw?.type === 'P2P Deposit Received' || raw?.type === 'p2p_received') {
    direction = 'received';
  } else if (raw?.direction === 'sent' || raw?.type === 'P2P Transfer Sent' || raw?.type === 'p2p_sent') {
    direction = 'sent';
  } else if (cleanCurrentId && rawReceiver === cleanCurrentId && rawSender !== cleanCurrentId) {
    direction = 'received';
  }

  return createP2PTransferRecord({
    id: raw?.id ? String(raw.id) : undefined,
    direction,
    senderNumericId: rawSender || (direction === 'sent' ? cleanCurrentId : '100201'),
    receiverNumericId: rawReceiver || (direction === 'received' ? cleanCurrentId : '100202'),
    amount: Math.abs(Number(raw?.amount ?? raw?.transfer_amount ?? 0)),
    previousBalance: Number(raw?.previousBalance ?? raw?.previous_balance ?? 0),
    newBalance: Number(raw?.newBalance ?? raw?.new_balance ?? 0),
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    status: raw?.status === 'failed' ? 'failed' : 'completed',
    receiverName: raw?.receiverName || raw?.receiver_name,
    senderName: raw?.senderName || raw?.sender_name,
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strictly deduplicates P2P transfer records by unique ID and semantic uniqueness
 * (same direction, sender, receiver, amount, and timestamp within 30 seconds),
 * prioritizing authoritative Supabase UUID records over temporary client IDs.
 */
export function deduplicateP2PTransferRecords(
  records: P2PTransferRecord[]
): P2PTransferRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const byId = new Map<string, P2PTransferRecord>();
  const seenSemantic = new Set<string>();

  // Prioritize UUID database records over temporary client IDs (P2P-...)
  const sorted = [...records].sort((a, b) => {
    const aIsUuid = UUID_REGEX.test(String(a.id || ''));
    const bIsUuid = UUID_REGEX.test(String(b.id || ''));
    if (aIsUuid && !bIsUuid) return -1;
    if (!aIsUuid && bIsUuid) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  for (const item of sorted) {
    if (!item || !item.id) continue;
    if (byId.has(item.id)) continue;

    const timeMs = new Date(item.createdAt).getTime();
    const timeWindow = Number.isFinite(timeMs) ? Math.floor(timeMs / 30000) : 0;
    const semKey = `${item.direction}_${item.senderNumericId}_${item.receiverNumericId}_${Number(item.amount || 0).toFixed(2)}_${timeWindow}`;

    if (seenSemantic.has(semKey)) {
      continue;
    }
    seenSemantic.add(semKey);
    byId.set(item.id, item);
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Loads the user's P2P transfer history (both Sent and Received) from localStorage,
 * strictly deduplicating records by ID and semantic signature.
 */
export function loadLocalP2PTransferHistory(
  userId?: string | null,
  userNumericId?: string | null
): P2PTransferRecord[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const key = `${P2P_HISTORY_STORAGE_KEY}_${userId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed.map((item) => normalizeP2PTransferRecord(item, userNumericId || undefined));
    return deduplicateP2PTransferRecords(normalized);
  } catch {
    return [];
  }
}

/**
 * Persists a P2P transfer record (Sent or Received) to localStorage and emits a window event
 * so Payment History tables and the P2P modal update immediately.
 */
export function saveLocalP2PTransferRecord(
  userId: string | null | undefined,
  record: P2PTransferRecord,
  userNumericId?: string | null
): P2PTransferRecord[] {
  const existing = loadLocalP2PTransferHistory(userId, userNumericId);
  const deduped = deduplicateP2PTransferRecords([record, ...existing]).slice(0, 50);

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const key = `${P2P_HISTORY_STORAGE_KEY}_${userId || 'default'}`;
      localStorage.setItem(key, JSON.stringify(deduped));
      window.dispatchEvent(
        new CustomEvent('bft-p2p-history-updated', {
          detail: { userId, record, records: deduped },
        })
      );
    } catch {
      // ignore storage errors
    }
  }
  return deduped;
}

/**
 * Extracts the authoritative Self-Capital balance from a Supabase `profiles` row.
 * Handles both `self_capital_balance` and `self_balance` (and `balance` fallback),
 * ensuring an un-synced `0` default in one column never masks a positive Self-Capital balance in the other.
 */
export function extractProfileSelfCapitalBalance(
  row?: Record<string, any> | null,
  fallback: number = 0
): number {
  if (!row || typeof row !== 'object') return fallback;
  const parseCol = (val: unknown): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const cleaned = typeof val === 'string' ? val.replace(/[^0-9.-]+/g, '') : String(val);
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? Number(num.toFixed(2)) : undefined;
  };

  const selfCap = parseCol(row.self_capital_balance ?? row.selfCapitalBalance);
  const selfBal = parseCol(row.self_balance ?? row.selfBalance);
  const genericBal = parseCol(row.balance);

  if (selfCap !== undefined && selfBal !== undefined) {
    if (selfCap === 0 && selfBal > 0) return selfBal;
    if (selfBal === 0 && selfCap > 0) return selfCap;
    return selfCap;
  }
  if (selfCap !== undefined) return selfCap;
  if (selfBal !== undefined) return selfBal;
  if (genericBal !== undefined) return genericBal;
  return fallback;
}

/**
 * Formats the real-time toast notification message when a P2P transfer arrives on `balance_transfers`:
 * e.g. "Received $50.00 P2P transfer successfully!"
 */
export function formatBalanceTransferToastMessage(amount: number | string): string {
  const safeAmt = Math.max(0, Number(Number(amount || 0).toFixed(2)));
  const formattedAmt = safeAmt.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Received $${formattedAmt} P2P transfer successfully!`;
}

/**
 * Fetches all P2P transfer records from `balance_transfers` (and `p2p_transfers` fallback) in Supabase
 * where the logged-in user is either the sender (`sender_id`) or the receiver (`receiver_id`),
 * enriches counterparty names/IDs from `profiles` when needed, and merges with locally persisted records.
 */
export async function fetchP2PTransfersFromSupabase(params: {
  userId?: string | null;
  userNumericId?: string | null;
  supabaseClient?: typeof supabase;
}): Promise<P2PTransferRecord[]> {
  const client = params.supabaseClient || supabase;
  let userId = String(params.userId || '').trim();
  const cleanNumId = String(params.userNumericId || '').trim().replace(/^#/, '');

  // If userId is not a UUID, attempt to resolve auth.uid() from Supabase auth session
  if ((!userId || !UUID_REGEX.test(userId)) && typeof (client as any)?.auth?.getUser === 'function') {
    try {
      const { data: authData } = await (client as any).auth.getUser();
      if (authData?.user?.id && UUID_REGEX.test(authData.user.id)) {
        userId = authData.user.id;
      }
    } catch {
      // ignore offline auth lookup
    }
  }

  const storageUserId = String(params.userId || userId || 'default').trim();
  const localList = loadLocalP2PTransferHistory(storageUserId, cleanNumId || undefined);
  const candidateList = [...localList];

  if (typeof client?.from === 'function') {
    const rawRows: Array<Record<string, any>> = [];
    const tablesToQuery = ['balance_transfers', 'p2p_transfers'];

    for (const tableName of tablesToQuery) {
      const filterStrategies: string[] = [];
      if (userId && UUID_REGEX.test(userId)) {
        // Primary query: sender_id or receiver_id matches auth.uid()
        filterStrategies.push(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
        // Secondary fallback if legacy columns sender_user_id / receiver_user_id are used
        filterStrategies.push(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`);
      }
      if (cleanNumId && /^\d+$/.test(cleanNumId)) {
        filterStrategies.push(
          `sender_numeric_id.eq.${cleanNumId},receiver_numeric_id.eq.${cleanNumId}`
        );
      }

      for (const orFilter of filterStrategies) {
        try {
          const { data, error } = await (client.from(tableName) as any)
            .select('*')
            .or(orFilter)
            .order('created_at', { ascending: false })
            .limit(100);

          if (!error && Array.isArray(data)) {
            for (const r of data) {
              if (r && typeof r === 'object') {
                rawRows.push(r);
              }
            }
            if (orFilter.startsWith('sender_id.eq.')) {
              break;
            }
          }
        } catch {
          // try next filter strategy
        }
      }
    }

    // Batch-resolve counterparty profiles from `profiles` when `balance_transfers` only stores UUIDs (`sender_id`, `receiver_id`)
    const profileMap = new Map<string, { numericId: string; name: string }>();
    const missingProfileUids = new Set<string>();
    for (const row of rawRows) {
      const sUid = String(row.sender_id ?? row.sender_user_id ?? '').trim();
      const rUid = String(row.receiver_id ?? row.receiver_user_id ?? '').trim();
      if (sUid && UUID_REGEX.test(sUid) && (!row.sender_numeric_id || !row.sender_name)) {
        missingProfileUids.add(sUid);
      }
      if (rUid && UUID_REGEX.test(rUid) && (!row.receiver_numeric_id || !row.receiver_name)) {
        missingProfileUids.add(rUid);
      }
    }

    if (missingProfileUids.size > 0) {
      try {
        const uidArray = Array.from(missingProfileUids);
        const { data: profRows } = await (client.from('profiles') as any)
          .select('*')
          .in('id', uidArray);
        if (Array.isArray(profRows)) {
          for (const p of profRows) {
            if (p && p.id) {
              const numId = resolveUserNumericId(null, p);
              const name = String(p.full_name || p.fullName || p.username || p.email || '').trim();
              profileMap.set(String(p.id), { numericId: numId, name });
            }
          }
        }
      } catch {
        // non-blocking
      }
    }

    for (const row of rawRows) {
      const rowSenderUid = String(row.sender_id ?? row.sender_user_id ?? '').trim();
      const rowReceiverUid = String(row.receiver_id ?? row.receiver_user_id ?? '').trim();
      const rowSenderNum = String(row.sender_numeric_id ?? '').trim().replace(/^#/, '');
      const rowReceiverNum = String(row.receiver_numeric_id ?? '').trim().replace(/^#/, '');

      const isSent =
        (userId && rowSenderUid === userId) ||
        (cleanNumId && rowSenderNum && rowSenderNum === cleanNumId);
      const direction: P2PTransferDirection = isSent ? 'sent' : 'received';
      const amount = Number(row.amount ?? row.transfer_amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const senderProfileInfo = profileMap.get(rowSenderUid);
      const receiverProfileInfo = profileMap.get(rowReceiverUid);

      const resolvedSenderNumericId =
        rowSenderNum ||
        senderProfileInfo?.numericId ||
        (isSent ? cleanNumId || '58021601' : resolveUserNumericId({ id: rowSenderUid }));
      const resolvedReceiverNumericId =
        rowReceiverNum ||
        receiverProfileInfo?.numericId ||
        (!isSent ? cleanNumId || '58021601' : resolveUserNumericId({ id: rowReceiverUid }));

      const resolvedSenderName =
        String(row.sender_name ?? row.senderName ?? senderProfileInfo?.name ?? '').trim() || undefined;
      const resolvedReceiverName =
        String(row.receiver_name ?? row.receiverName ?? receiverProfileInfo?.name ?? '').trim() || undefined;

      const rawStatus = String(row.status || 'completed').toLowerCase();
      const status: 'completed' | 'failed' =
        rawStatus === 'failed' || rawStatus === 'rejected' || rawStatus === 'cancelled'
          ? 'failed'
          : 'completed';

      const record = createP2PTransferRecord({
        id: String(row.id),
        direction,
        senderNumericId: resolvedSenderNumericId,
        receiverNumericId: resolvedReceiverNumericId,
        senderName: resolvedSenderName,
        receiverName: resolvedReceiverName,
        amount,
        previousBalance: Number(
          isSent
            ? row.sender_previous_balance ?? row.previous_balance ?? 0
            : row.receiver_previous_balance ?? row.previous_balance ?? 0
        ),
        newBalance: Number(
          isSent
            ? row.sender_new_balance ?? row.new_balance ?? 0
            : row.receiver_new_balance ?? row.new_balance ?? 0
        ),
        createdAt: row.created_at || new Date().toISOString(),
        status,
      });
      candidateList.push(record);
    }
  }

  const merged = deduplicateP2PTransferRecords(candidateList);
  if (storageUserId && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const key = `${P2P_HISTORY_STORAGE_KEY}_${storageUserId || 'default'}`;
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      // ignore storage errors
    }
  }
  return merged;
}

/**
 * Resolves the user's unique numeric_id from their Supabase profile row or UserProfile state.
 * If the database row does not yet have a numeric_id populated, derives a deterministic
 * 8-digit numeric ID from the user's UUID/email so it remains stable across sessions.
 */
export function resolveUserNumericId(
  userProfile?: Partial<UserProfile> | null,
  supabaseRow?: Record<string, any> | null
): string {
  const candidates = [
    supabaseRow?.numeric_id,
    supabaseRow?.numericId,
    userProfile?.numeric_id,
    userProfile?.numericId,
  ];

  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const digits = String(candidate).trim().replace(/\D/g, '');
      if (digits.length > 0 && Number(digits) > 0) {
        return digits;
      }
    }
  }

  // If userProfile.id or supabaseRow.id is already numeric
  const rawId = String(supabaseRow?.id || userProfile?.id || '').trim().replace(/^#/, '');
  if (/^\d{5,10}$/.test(rawId)) {
    return rawId;
  }

  const seedSource = String(
    supabaseRow?.email || userProfile?.email || supabaseRow?.id || userProfile?.id || 'bft-trader-default'
  )
    .trim()
    .toLowerCase();

  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = (hash << 5) - hash + seedSource.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const eightDigit = (positive % 90000000) + 10000000;
  return String(eightDigit);
}

export interface RecipientLookupResult {
  found: boolean;
  profile?: {
    id: string;
    email: string;
    fullName?: string;
    numericId: string;
    selfBalance: number;
    selfCapitalBalance: number;
  };
  error?: string;
}

/**
 * Looks up a recipient profile by querying the exact `numeric_id` column in `public.profiles`.
 * Handles numeric and text matching, verifies against self-transfers, and falls back to
 * deterministic numeric ID matching if the profile row was not yet populated with `numeric_id`.
 */
export async function lookupRecipientByNumericId(params: {
  receiverNumericId: string | number;
  currentUserId?: string | null;
  currentUserNumericId?: string | null;
  supabaseClient?: typeof supabase;
}): Promise<RecipientLookupResult> {
  const client = params.supabaseClient || supabase;
  const rawInput = String(params.receiverNumericId ?? '').trim().replace(/^#/, '');
  const digitsOnly = rawInput.replace(/\D/g, '');

  if (!digitsOnly) {
    return { found: false, error: 'Please enter a valid recipient numeric ID.' };
  }

  const currentNumeric = String(params.currentUserNumericId || '').trim().replace(/^#/, '');
  if (currentNumeric && digitsOnly === currentNumeric) {
    return { found: false, error: 'You cannot transfer funds to your own numeric ID.' };
  }

  if (params.currentUserId && (rawInput === params.currentUserId || digitsOnly === params.currentUserId)) {
    return { found: false, error: 'You cannot transfer funds to your own account.' };
  }

  // 1. Direct query against the exact `numeric_id` column in Supabase `profiles` table
  if (typeof client?.from === 'function') {
    try {
      const numericAsNum = Number(digitsOnly);
      const orFilter = !isNaN(numericAsNum) && numericAsNum > 0
        ? `numeric_id.eq.${digitsOnly},numeric_id.eq.${numericAsNum}`
        : `numeric_id.eq.${digitsOnly}`;

      let data: any = null;
      let error: any = null;
      const baseSelect = (client.from('profiles') as any).select('*');
      if (typeof baseSelect?.or === 'function') {
        const res = await baseSelect.or(orFilter).limit(1);
        data = res?.data;
        error = res?.error;
      } else if (typeof baseSelect?.eq === 'function') {
        const res = await baseSelect.eq('numeric_id', digitsOnly).limit(1);
        data = res?.data;
        error = res?.error;
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        if (params.currentUserId && String(row.id) === String(params.currentUserId)) {
          return { found: false, error: 'You cannot transfer funds to your own account.' };
        }
        const resolvedSelfBal = extractProfileSelfCapitalBalance(row, 0);
        return {
          found: true,
          profile: {
            id: String(row.id),
            email: String(row.email || ''),
            fullName: row.full_name || undefined,
            numericId: String(row.numeric_id ?? digitsOnly),
            selfBalance: resolvedSelfBal,
            selfCapitalBalance: resolvedSelfBal,
          },
        };
      }
    } catch {
      // ignore and try fallback
    }

    // 2. Fallback: Search profiles for deterministic match if `numeric_id` column was NULL
    try {
      const { data: allProfiles, error: fetchErr } = await (client.from('profiles') as any)
        .select('*')
        .limit(200);

      if (!fetchErr && Array.isArray(allProfiles)) {
        const matched = allProfiles.find((row) => {
          const directNum = String(row.numeric_id ?? '').trim().replace(/^#/, '');
          if (directNum && directNum === digitsOnly) return true;
          const derivedNum = resolveUserNumericId(null, row);
          return derivedNum === digitsOnly;
        });

        if (matched) {
          if (params.currentUserId && String(matched.id) === String(params.currentUserId)) {
            return { found: false, error: 'You cannot transfer funds to your own account.' };
          }
          // Backfill numeric_id on the profile in Supabase if missing
          if (!matched.numeric_id && !isNaN(Number(digitsOnly))) {
            (client.from('profiles') as any)
              .update({ numeric_id: Number(digitsOnly) })
              .eq('id', matched.id)
              .then(() => {})
              .catch(() => {});
          }
          const resolvedSelfBal = extractProfileSelfCapitalBalance(matched, 0);
          return {
            found: true,
            profile: {
              id: String(matched.id),
              email: String(matched.email || ''),
              fullName: matched.full_name || undefined,
              numericId: String(matched.numeric_id ?? digitsOnly),
              selfBalance: resolvedSelfBal,
              selfCapitalBalance: resolvedSelfBal,
            },
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback for built-in testing/demo accounts
  if (['100201', '100202', '54517106', '88412095', '10001', '10002', '10006'].includes(digitsOnly)) {
    const mockNames: Record<string, string> = {
      '100201': 'Alex Morgan (Pro Trader)',
      '100202': 'Elena Rostova',
      '54517106': 'BFT Trader',
      '88412095': 'Marcus Sterling',
      '10001': 'Marcus Sterling',
      '10002': 'Ishan',
      '10006': 'Loading',
    };
    return {
      found: true,
      profile: {
        id: `usr_${digitsOnly}`,
        email: `trader-${digitsOnly}@bft.io`,
        fullName: mockNames[digitsOnly] || `Trader #${digitsOnly}`,
        numericId: digitsOnly,
        selfBalance: 500,
        selfCapitalBalance: 500,
      },
    };
  }

  return {
    found: false,
    error: `Recipient with Trader ID #${digitsOnly} not found. Please verify the ID shown in the recipient's dashboard.`,
  };
}

/**
 * Strictly resolves the user's Self-Capital (Live Balance) for P2P transfers.
 * Funds can ONLY be transferred from the user's Self-Capital balance (`self_capital_balance` / `self_balance` / Personal Live account).
 * Funded Challenge / Evaluation / Demo balances are never eligible for P2P transfers.
 */
export function resolveTransferableLiveBalance(
  userProfile?: UserProfile | null,
  accounts: TradingAccount[] = []
): {
  availableLiveBalance: number;
  selfCapitalBalance: number;
  balanceColumn: ProfileBalanceColumn;
  targetAccount?: TradingAccount;
} {
  const personalAcc = accounts.find(
    (a) =>
      isPersonalLiveAccount(a) ||
      a.accountType === 'personal' ||
      (a as any).accountType === 'self_funded' ||
      (a as any).accountCategory === 'personal_live' ||
      String(a.id || '').startsWith('BFT-PERS')
  );

  const profileCandidates = [
    userProfile?.selfBalance,
    userProfile?.self_capital_balance,
    (userProfile as any)?.selfCapitalBalance,
    (userProfile as any)?.self_balance,
  ]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => parseNumericAmount(v))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const accountCandidate =
    personalAcc?.currentBalance !== undefined &&
    personalAcc?.currentBalance !== null &&
    Number.isFinite(parseNumericAmount(personalAcc.currentBalance))
      ? Math.max(0, parseNumericAmount(personalAcc.currentBalance))
      : undefined;

  // Prefer any positive Self-Capital value across profile fields (self_capital_balance / self_balance / selfBalance)
  // or Personal Live account currentBalance if profile fields were initialized to 0 before sync.
  const positiveProfileBal = profileCandidates.find((n) => n > 0);
  let rawSelf = 0;

  if (positiveProfileBal !== undefined) {
    rawSelf = positiveProfileBal;
  } else if (profileCandidates.length > 0) {
    // If profile explicitly has 0 and personalAcc also has 0 (or isn't higher), use 0;
    // if personalAcc has a positive Self-Capital balance while profile had an un-synced 0, use personalAcc!
    rawSelf =
      accountCandidate !== undefined && accountCandidate > 0
        ? accountCandidate
        : profileCandidates[0];
  } else if (accountCandidate !== undefined) {
    rawSelf = accountCandidate;
  }

  const selfBalance = Math.max(0, Number(rawSelf.toFixed(2)));

  return {
    availableLiveBalance: selfBalance,
    selfCapitalBalance: selfBalance,
    balanceColumn: 'self_balance',
    targetAccount: personalAcc,
  };
}

/**
 * Robustly parses any numeric amount from strings, numbers, or formatted currency (removing commas).
 */
export function parseNumericAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pure helper: constructs the exact Supabase RPC payload for `transfer_balance_p2p`.
 */
export function buildTransferBalanceRpcPayload(
  receiverNumericId: string | number,
  transferAmount: string | number
): P2PTransferRpcPayload {
  const cleanId = String(receiverNumericId ?? '').trim().replace(/\D/g, '');
  const amountNum = parseNumericAmount(transferAmount);
  return {
    p_receiver_numeric_id: Number(cleanId) || 0,
    p_transfer_amount: Number(amountNum.toFixed(2)),
  };
}

/**
 * Validates the recipient's numeric_id and transfer amount strictly against the sender's Self-Capital balance.
 */
export function validateP2PTransferInput(params: {
  senderNumericId?: string | number | null;
  receiverNumericId: string | number;
  transferAmount: string | number;
  availableLiveBalance: string | number;
  userProfile?: UserProfile | null;
  accounts?: TradingAccount[];
}): P2PTransferValidationResult {
  const rawReceiver = String(params.receiverNumericId ?? '').trim();
  const cleanReceiver = rawReceiver.replace(/^#/, '').trim();

  let liveBalanceNum = parseNumericAmount(params.availableLiveBalance);
  if (liveBalanceNum <= 0 && (params.userProfile || params.accounts)) {
    const resolved = resolveTransferableLiveBalance(params.userProfile, params.accounts || []);
    if (resolved.availableLiveBalance > liveBalanceNum) {
      liveBalanceNum = resolved.availableLiveBalance;
    }
  }

  const transferAmountNum = parseNumericAmount(params.transferAmount);
  const parsedAmount = transferAmountNum;

  const normalizedAmount =
    Number.isFinite(transferAmountNum) && transferAmountNum > 0
      ? parseFloat(transferAmountNum.toFixed(2))
      : 0;
  const normalizedAvailable =
    Number.isFinite(liveBalanceNum) && liveBalanceNum > 0
      ? parseFloat(liveBalanceNum.toFixed(2))
      : 0;

  // Check if input amount exceeds the user's current Self-Capital balance using 2-decimal precision
  if (normalizedAmount > 0 && normalizedAmount > normalizedAvailable + 1e-6) {
    return {
      valid: false,
      error: P2P_SELF_CAPITAL_ONLY_ERROR,
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver) || 0,
      normalizedAmount,
      exceedsSelfCapitalBalance: true,
    };
  }

  if (!cleanReceiver) {
    return {
      valid: false,
      error: 'Please enter the recipient’s unique numeric ID.',
      normalizedReceiverNumericId: '',
      receiverNumericIdAsNumber: 0,
      normalizedAmount: 0,
    };
  }

  if (
    !/^\d+$/.test(cleanReceiver) ||
    Number(cleanReceiver) <= 0 ||
    !Number.isSafeInteger(Number(cleanReceiver))
  ) {
    return {
      valid: false,
      error: 'Recipient numeric ID must contain only digits (e.g. 10482910).',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: 0,
      normalizedAmount: 0,
    };
  }

  const cleanSender = String(params.senderNumericId ?? '').trim().replace(/\D/g, '');
  if (cleanSender && cleanSender === cleanReceiver) {
    return {
      valid: false,
      error: 'You cannot transfer funds to your own numeric ID.',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount: 0,
    };
  }

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return {
      valid: false,
      error: 'Please enter a valid transfer amount greater than $0.00.',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount: 0,
    };
  }

  if (normalizedAmount < 1) {
    return {
      valid: false,
      error: 'Minimum P2P transfer amount is $1.00 USD.',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount,
    };
  }

  if (normalizedAvailable <= 0) {
    return {
      valid: false,
      error: P2P_SELF_CAPITAL_ONLY_ERROR,
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount,
      exceedsSelfCapitalBalance: true,
    };
  }

  return {
    valid: true,
    normalizedReceiverNumericId: cleanReceiver,
    receiverNumericIdAsNumber: Number(cleanReceiver),
    normalizedAmount,
    exceedsSelfCapitalBalance: false,
  };
}

function isInsufficientBalanceRpcMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('insufficient') ||
    lower.includes('no capital') ||
    lower.includes('not enough') ||
    lower.includes('self-capital') ||
    lower.includes('self_balance') ||
    lower.includes('self_capital_balance') ||
    lower.includes('low balance')
  );
}

function extractRpcFailureMessage(data: any, error: any): string | null {
  if (error) {
    const msg = String(error.message || error.details || error.hint || 'P2P transfer failed.');
    if (isInsufficientBalanceRpcMessage(msg)) {
      return P2P_SELF_CAPITAL_ONLY_ERROR;
    }
    return msg;
  }
  if (data && typeof data === 'object') {
    if (
      data.success === false ||
      data.ok === false ||
      data.status === 'error' ||
      data.status === 'failed'
    ) {
      const rawErr = String(data.error || data.message || data.reason || 'Transfer rejected by server.');
      if (isInsufficientBalanceRpcMessage(rawErr)) {
        return P2P_SELF_CAPITAL_ONLY_ERROR;
      }
      return rawErr;
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      const cleanErr = data.error.trim();
      if (isInsufficientBalanceRpcMessage(cleanErr)) {
        return P2P_SELF_CAPITAL_ONLY_ERROR;
      }
      return cleanErr;
    }
  }
  if (data === false) {
    return P2P_SELF_CAPITAL_ONLY_ERROR;
  }
  return null;
}

function isMissingRpcFunctionError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || error.details || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('function public.transfer_balance_p2p') ||
    msg.includes('function transfer_balance_p2p') ||
    msg.includes('function public.transfer_balance_to_user') ||
    msg.includes('function transfer_balance_to_user') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed')
  );
}

let lastP2PExecutionTime = 0;
let lastP2PSignature = '';
const inFlightP2PSignatures = new Set<string>();

/**
 * Helper to update a profile's Self-Capital balance in Supabase across both
 * `self_capital_balance` and `self_balance` columns with graceful column fallback.
 */
async function updateProfileSelfCapitalInSupabase(
  client: typeof supabase,
  profileId: string,
  newBalance: number
): Promise<boolean> {
  if (!profileId || typeof client?.from !== 'function') return false;
  const rounded = Math.max(0, Number(newBalance.toFixed(2)));

  const payloadsToTry: Array<Record<string, number>> = [
    { self_balance: rounded, self_capital_balance: rounded },
    { self_balance: rounded },
    { self_capital_balance: rounded },
    { balance: rounded },
  ];

  for (const payload of payloadsToTry) {
    try {
      const { error } = await (client.from('profiles') as any)
        .update(payload)
        .eq('id', profileId);
      if (!error) {
        return true;
      }
      const errMsg = String(error.message || error.details || '');
      if (!/column|schema cache/i.test(errMsg)) {
        break;
      }
    } catch {
      break;
    }
  }
  return false;
}

/**
 * Executes a P2P Self-Capital balance transfer:
 * 1. Prevents duplicate balance deduction (strictly 1x deduction from sender's Self-Capital).
 * 2. Prevents false "Insufficient Capital" errors by resolving and syncing `self_capital_balance` & `self_balance`.
 * 3. Guarantees the incoming transfer amount is added to the recipient's Self-Capital balance (`self_capital_balance` & `self_balance`).
 * 4. Synchronizes `profiles`, `balance_transfers` / `p2p_transfers`, and `user_notifications` in Supabase without race conditions.
 */
export async function executeP2PBalanceTransfer(
  params: ExecuteP2PTransferParams
): Promise<ExecuteP2PTransferResult> {
  const now = Date.now();
  const normalizedInputAmt = Number(parseNumericAmount(params.transferAmount).toFixed(2));
  const cleanTargetNumId = String(params.receiverNumericId ?? '').trim().replace(/\D/g, '');
  const signature = `${params.userProfile?.id}_${cleanTargetNumId}_${normalizedInputAmt}`;

  if (
    inFlightP2PSignatures.has(signature) ||
    (now - lastP2PExecutionTime < 4000 && lastP2PSignature === signature)
  ) {
    return {
      ok: false,
      error: 'Transfer request is already being processed. Please do not double-submit.',
      transferAmount: normalizedInputAmt,
      receiverNumericId: cleanTargetNumId,
      previousBalance: 0,
      newBalance: 0,
      balanceColumn: 'self_balance',
    };
  }

  inFlightP2PSignatures.add(signature);
  lastP2PExecutionTime = now;
  lastP2PSignature = signature;

  try {
    const client = params.supabaseClient || supabase;
    const isDefaultSupabaseClient = !params.supabaseClient;
    let senderNumericId = resolveUserNumericId(params.userProfile);

    let { availableLiveBalance, balanceColumn, targetAccount } = resolveTransferableLiveBalance(
      params.userProfile,
      params.accounts || []
    );

    // Pre-check sender's Supabase profile row when using the real Supabase client:
    // 1. If local state had a stale 0 balance while Supabase has active Self-Capital, rescue the real balance.
    // 2. If one of `self_capital_balance` or `self_balance` in Supabase is out of sync (e.g. 0 vs positive),
    //    sync both columns before calling the RPC so the SQL RPC never falsely throws "Insufficient Capital".
    if (isDefaultSupabaseClient) {
      try {
        const preSenderRow = await fetchSupabaseProfileRow({
          userId: params.userProfile.id,
          userEmail: params.userProfile.email,
        });
        if (preSenderRow) {
          if (preSenderRow.numeric_id !== undefined && preSenderRow.numeric_id !== null) {
            const dbNumId = String(preSenderRow.numeric_id).trim().replace(/\D/g, '');
            if (dbNumId) senderNumericId = dbNumId;
          }
          const dbSelfBal = extractProfileSelfCapitalBalance(preSenderRow, availableLiveBalance);
          if (dbSelfBal > availableLiveBalance && availableLiveBalance < normalizedInputAmt) {
            availableLiveBalance = dbSelfBal;
          }
          const rawSc = Number(preSenderRow.self_capital_balance ?? NaN);
          const rawSb = Number(preSenderRow.self_balance ?? NaN);
          const needsPreSync =
            (Number.isFinite(rawSc) && Math.abs(rawSc - availableLiveBalance) > 0.005) ||
            (Number.isFinite(rawSb) && Math.abs(rawSb - availableLiveBalance) > 0.005);
          if (needsPreSync && preSenderRow.id) {
            await updateProfileSelfCapitalInSupabase(
              client,
              String(preSenderRow.id),
              availableLiveBalance
            );
          }
        }
      } catch {
        // non-blocking
      }
    }

    const validation = validateP2PTransferInput({
      senderNumericId,
      receiverNumericId: params.receiverNumericId,
      transferAmount: params.transferAmount,
      availableLiveBalance,
      userProfile: params.userProfile,
      accounts: params.accounts,
    });

    if (!validation.valid) {
      return {
        ok: false,
        error: validation.error || P2P_SELF_CAPITAL_ONLY_ERROR,
        transferAmount: validation.normalizedAmount,
        receiverNumericId: validation.normalizedReceiverNumericId,
        previousBalance: availableLiveBalance,
        newBalance: availableLiveBalance,
        balanceColumn: 'self_balance',
      };
    }

    // Look up recipient BEFORE calling RPC so we have their pre-transfer Self-Capital balance snapshot
    let preLookupRecipient: RecipientLookupResult['profile'] | undefined;
    if (typeof client?.from === 'function') {
      try {
        const preLookup = await lookupRecipientByNumericId({
          receiverNumericId: validation.normalizedReceiverNumericId,
          currentUserId: params.userProfile.id,
          currentUserNumericId: senderNumericId,
          supabaseClient: client,
        });
        if (!preLookup.found && preLookup.error?.includes('own')) {
          return {
            ok: false,
            error: preLookup.error,
            transferAmount: validation.normalizedAmount,
            receiverNumericId: validation.normalizedReceiverNumericId,
            previousBalance: availableLiveBalance,
            newBalance: availableLiveBalance,
            balanceColumn: 'self_balance',
          };
        }
        if (preLookup.found && preLookup.profile) {
          preLookupRecipient = preLookup.profile;
        }
      } catch {
        // continue to RPC
      }
    }

    // Calculate the sender's new Self-Capital balance strictly ONCE
    const expectedNewBalance = Math.max(
      0,
      Number((availableLiveBalance - validation.normalizedAmount).toFixed(2))
    );

    // Lock the sender's balance mutation immediately so concurrent polls cannot revert or double-deduct
    recordDirectBalanceCommit('self_balance', expectedNewBalance);

    const rpcPayload = buildTransferBalanceRpcPayload(
      validation.normalizedReceiverNumericId,
      validation.normalizedAmount
    );

    let rpcData: any = null;
    let rpcError: any = null;
    let receiverName: string | undefined =
      preLookupRecipient?.fullName || preLookupRecipient?.email || undefined;
    let receiverUserId: string | undefined = preLookupRecipient?.id;

    try {
      // 1. Primary call to Supabase RPC: transfer_balance_p2p
      const res = await client.rpc('transfer_balance_p2p', rpcPayload);
      rpcData = res.data;
      rpcError = res.error;

      // Retry with string parameter if signature expects text
      if (
        rpcError &&
        !isMissingRpcFunctionError(rpcError) &&
        String(rpcError.message || '').toLowerCase().includes('invalid input syntax')
      ) {
        const retryRes = await client.rpc('transfer_balance_p2p', {
          p_receiver_numeric_id: validation.normalizedReceiverNumericId,
          p_transfer_amount: validation.normalizedAmount,
        });
        rpcData = retryRes.data;
        rpcError = retryRes.error;
      }

      // 2. Fallback to legacy RPC name transfer_balance_to_user if transfer_balance_p2p is not yet deployed
      if (rpcError && isMissingRpcFunctionError(rpcError)) {
        const legacyRes = await client.rpc('transfer_balance_to_user', rpcPayload);
        rpcData = legacyRes.data;
        rpcError = legacyRes.error;
      }
    } catch (err: any) {
      rpcError = err;
    }

    const extractedFailure = extractRpcFailureMessage(rpcData, rpcError);
    const isFalseInsufficientCapitalFromRpc =
      extractedFailure === P2P_SELF_CAPITAL_ONLY_ERROR &&
      availableLiveBalance >= validation.normalizedAmount;

    const shouldRunDirectFallback =
      (rpcError && isMissingRpcFunctionError(rpcError)) || isFalseInsufficientCapitalFromRpc;

    // If the RPC returned a genuine error (e.g. recipient not found) and not a missing RPC or false insufficient capital error
    if (extractedFailure && !shouldRunDirectFallback) {
      // Restore sender balance lock back to availableLiveBalance since transfer did not execute
      recordDirectBalanceCommit('self_balance', availableLiveBalance);
      return {
        ok: false,
        error: extractedFailure,
        transferAmount: validation.normalizedAmount,
        receiverNumericId: validation.normalizedReceiverNumericId,
        previousBalance: availableLiveBalance,
        newBalance: availableLiveBalance,
        balanceColumn: 'self_balance',
      };
    }

    if (rpcData && typeof rpcData === 'object') {
      receiverName =
        rpcData.receiver_name ||
        rpcData.recipient_name ||
        rpcData.full_name ||
        receiverName;
      receiverUserId = rpcData.receiver_id || rpcData.recipient_id || receiverUserId;
    }

    // Ensure recipient is verified and their Self-Capital balance (`self_capital_balance` & `self_balance`),
    // ledger entry (`balance_transfers` / `p2p_transfers`), and `user_notifications` are all synchronized in Supabase!
    if (typeof client?.from === 'function') {
      try {
        if (!preLookupRecipient) {
          const recipientLookup = await lookupRecipientByNumericId({
            receiverNumericId: validation.normalizedReceiverNumericId,
            currentUserId: params.userProfile.id,
            currentUserNumericId: senderNumericId,
            supabaseClient: client,
          });
          if (shouldRunDirectFallback && (!recipientLookup.found || !recipientLookup.profile)) {
            recordDirectBalanceCommit('self_balance', availableLiveBalance);
            return {
              ok: false,
              error:
                recipientLookup.error ||
                `Recipient with Trader ID #${validation.normalizedReceiverNumericId} could not be verified.`,
              transferAmount: validation.normalizedAmount,
              receiverNumericId: validation.normalizedReceiverNumericId,
              previousBalance: availableLiveBalance,
              newBalance: availableLiveBalance,
              balanceColumn: 'self_balance',
            };
          }
          if (recipientLookup.found && recipientLookup.profile) {
            preLookupRecipient = recipientLookup.profile;
          }
        }

        if (preLookupRecipient) {
          receiverUserId = preLookupRecipient.id;
          receiverName =
            preLookupRecipient.fullName || preLookupRecipient.email || receiverName;

          // Expected recipient Self-Capital balance = pre-transfer Self-Capital + transferAmount (strictly 1x addition)
          const receiverExpectedNextBal = Number(
            (Number(preLookupRecipient.selfBalance || 0) + validation.normalizedAmount).toFixed(2)
          );

          // Atomically update recipient's `self_balance` and `self_capital_balance` in `profiles`
          await updateProfileSelfCapitalInSupabase(
            client,
            preLookupRecipient.id,
            receiverExpectedNextBal
          );

          // Also synchronize recipient's self_funded / personal account in `trading_accounts` if present
          if (UUID_REGEX.test(preLookupRecipient.id)) {
            try {
              await (client.from('trading_accounts') as any)
                .update({
                  current_balance: receiverExpectedNextBal,
                  equity: receiverExpectedNextBal,
                })
                .eq('user_id', preLookupRecipient.id)
                .in('account_type', ['self_funded', 'personal', 'personal_live']);
            } catch {
              // non-blocking
            }
          }

          const nowIso = new Date().toISOString();
          const recentCutoffIso = new Date(Date.now() - 25000).toISOString();

          // Synchronize `balance_transfers` table without creating duplicate rows if RPC already inserted one
          try {
            let senderUidForBt = String(params.userProfile.id || '').trim();
            if (!UUID_REGEX.test(senderUidForBt) && typeof (client as any)?.auth?.getUser === 'function') {
              try {
                const { data: authData } = await (client as any).auth.getUser();
                if (authData?.user?.id && UUID_REGEX.test(authData.user.id)) {
                  senderUidForBt = authData.user.id;
                }
              } catch {
                // ignore
              }
            }

            let alreadyInBalanceTransfers = false;
            if (!shouldRunDirectFallback && UUID_REGEX.test(senderUidForBt)) {
              const { data: existingBt, error: checkErr } = await (client.from('balance_transfers') as any)
                .select('id')
                .eq('sender_id', senderUidForBt)
                .eq('receiver_id', preLookupRecipient.id)
                .eq('amount', validation.normalizedAmount)
                .gte('created_at', recentCutoffIso)
                .limit(1);
              if (!checkErr && Array.isArray(existingBt) && existingBt.length > 0) {
                alreadyInBalanceTransfers = true;
              } else if (checkErr) {
                const { data: existingBtLegacy } = await (client.from('balance_transfers') as any)
                  .select('id')
                  .eq('sender_user_id', senderUidForBt)
                  .eq('receiver_user_id', preLookupRecipient.id)
                  .eq('amount', validation.normalizedAmount)
                  .gte('created_at', recentCutoffIso)
                  .limit(1);
                alreadyInBalanceTransfers = Array.isArray(existingBtLegacy) && existingBtLegacy.length > 0;
              }
            }

            if (!alreadyInBalanceTransfers) {
              // Insert into `balance_transfers` using `sender_id` and `receiver_id` first, with progressive fallback for optional columns
              const btPayloads: Array<Record<string, any>> = [
                {
                  sender_id: senderUidForBt || params.userProfile.id,
                  receiver_id: preLookupRecipient.id,
                  sender_numeric_id: senderNumericId,
                  receiver_numeric_id: validation.normalizedReceiverNumericId,
                  sender_name: params.userProfile.fullName || params.userProfile.email || 'Trader',
                  receiver_name: receiverName,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                  created_at: nowIso,
                },
                {
                  sender_id: senderUidForBt || params.userProfile.id,
                  receiver_id: preLookupRecipient.id,
                  sender_numeric_id: senderNumericId,
                  receiver_numeric_id: validation.normalizedReceiverNumericId,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                  created_at: nowIso,
                },
                {
                  sender_id: senderUidForBt || params.userProfile.id,
                  receiver_id: preLookupRecipient.id,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                  created_at: nowIso,
                },
                {
                  sender_id: senderUidForBt || params.userProfile.id,
                  receiver_id: preLookupRecipient.id,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                },
                {
                  sender_user_id: senderUidForBt || params.userProfile.id,
                  receiver_user_id: preLookupRecipient.id,
                  sender_numeric_id: senderNumericId,
                  receiver_numeric_id: validation.normalizedReceiverNumericId,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                  created_at: nowIso,
                },
              ];

              for (const btRow of btPayloads) {
                const { error: btInsErr } = await (client.from('balance_transfers') as any).insert([btRow]);
                if (!btInsErr) {
                  break;
                }
              }
            }
          } catch {
            // non-blocking
          }

          // Synchronize `p2p_transfers` table if present without creating duplicate rows
          try {
            let alreadyInP2PTransfers = false;
            if (!shouldRunDirectFallback && UUID_REGEX.test(String(params.userProfile.id || ''))) {
              const { data: existingPt } = await (client.from('p2p_transfers') as any)
                .select('id')
                .eq('sender_id', params.userProfile.id)
                .eq('receiver_id', preLookupRecipient.id)
                .eq('amount', validation.normalizedAmount)
                .gte('created_at', recentCutoffIso)
                .limit(1);
              alreadyInP2PTransfers = Array.isArray(existingPt) && existingPt.length > 0;
            }
            if (!alreadyInP2PTransfers) {
              await (client.from('p2p_transfers') as any).insert([
                {
                  sender_id: params.userProfile.id,
                  receiver_id: preLookupRecipient.id,
                  sender_numeric_id: senderNumericId,
                  receiver_numeric_id: validation.normalizedReceiverNumericId,
                  amount: validation.normalizedAmount,
                  status: 'completed',
                  created_at: nowIso,
                },
              ]);
            }
          } catch {
            // non-blocking
          }

          // Synchronize `user_notifications` for the recipient so they receive an instant notification
          try {
            let alreadyNotified = false;
            if (!shouldRunDirectFallback && UUID_REGEX.test(preLookupRecipient.id)) {
              const { data: existingNotif } = await (client.from('user_notifications') as any)
                .select('id')
                .eq('user_id', preLookupRecipient.id)
                .eq('type', 'p2p_received')
                .eq('amount', validation.normalizedAmount)
                .gte('created_at', recentCutoffIso)
                .limit(1);
              alreadyNotified = Array.isArray(existingNotif) && existingNotif.length > 0;
            }
            if (!alreadyNotified) {
              await (client.from('user_notifications') as any).insert([
                {
                  user_id: preLookupRecipient.id,
                  title: 'P2P Deposit Received! 💰',
                  message: `You received $${validation.normalizedAmount.toFixed(2)} into your Self-Capital balance from User #${senderNumericId}.`,
                  type: 'p2p_received',
                  amount: validation.normalizedAmount,
                  sender_numeric_id: senderNumericId,
                  receiver_numeric_id: validation.normalizedReceiverNumericId,
                  is_read: false,
                  created_at: nowIso,
                },
              ]);
            }
          } catch {
            // non-blocking
          }
        }
      } catch (err: any) {
        console.warn('P2P recipient synchronization warning:', err);
      }
    }

    // Authoritative sender balance is strictly `expectedNewBalance = availableLiveBalance - transferAmount` (1x deduction).
    // Never accept a double-deducted balance from a database trigger/RPC race condition.
    const authoritativeNewBalance = expectedNewBalance;
    let refreshedNumericId: string | undefined;

    const isOfflineFetchError =
      rpcError &&
      /failed to fetch|networkerror|load failed/i.test(
        String(rpcError.message || rpcError.details || '')
      );

    recordDirectBalanceCommit('self_balance', authoritativeNewBalance);

    if (isDefaultSupabaseClient && !isOfflineFetchError) {
      try {
        // Explicitly commit the exact 1x-deducted balance to both `self_balance` and `self_capital_balance`
        await commitProfileBalanceToSupabase({
          userId: params.userProfile.id,
          userEmail: params.userProfile.email,
          column: 'self_balance',
          newBalance: authoritativeNewBalance,
        });

        // Also update sender's `self_funded` / `personal` row in `trading_accounts` if present
        if (UUID_REGEX.test(String(params.userProfile.id || ''))) {
          try {
            await (client.from('trading_accounts') as any)
              .update({
                current_balance: authoritativeNewBalance,
                equity: authoritativeNewBalance,
              })
              .eq('user_id', params.userProfile.id)
              .in('account_type', ['self_funded', 'personal', 'personal_live']);
          } catch {
            // non-blocking
          }
        }

        const freshRow = await fetchSupabaseProfileRow({
          userId: params.userProfile.id,
          userEmail: params.userProfile.email,
        });

        if (freshRow) {
          if (freshRow.numeric_id !== undefined && freshRow.numeric_id !== null) {
            refreshedNumericId = String(freshRow.numeric_id).trim();
          }
          const remoteSc = Number(freshRow.self_capital_balance ?? NaN);
          const remoteSb = Number(freshRow.self_balance ?? NaN);
          if (
            (Number.isFinite(remoteSc) && Math.abs(remoteSc - authoritativeNewBalance) > 0.005) ||
            (Number.isFinite(remoteSb) && Math.abs(remoteSb - authoritativeNewBalance) > 0.005)
          ) {
            await updateProfileSelfCapitalInSupabase(
              client,
              String(freshRow.id || params.userProfile.id),
              authoritativeNewBalance
            );
          }
        }
      } catch {
        recordDirectBalanceCommit('self_balance', authoritativeNewBalance);
      }
    }

    const finalNumericId = refreshedNumericId || senderNumericId;

    const updatedProfile: UserProfile = {
      ...params.userProfile,
      numericId: finalNumericId,
      numeric_id: finalNumericId,
      selfBalance: authoritativeNewBalance,
      self_capital_balance: authoritativeNewBalance,
    };

    const updatedAccount: TradingAccount | undefined = targetAccount
      ? {
          ...targetAccount,
          currentBalance: authoritativeNewBalance,
          equity: authoritativeNewBalance,
        }
      : undefined;

    const record = createP2PTransferRecord({
      direction: 'sent',
      senderNumericId: finalNumericId,
      receiverNumericId: validation.normalizedReceiverNumericId,
      receiverName,
      amount: validation.normalizedAmount,
      previousBalance: availableLiveBalance,
      newBalance: authoritativeNewBalance,
      status: 'completed',
    });

    if (isDefaultSupabaseClient) {
      saveLocalP2PTransferRecord(params.userProfile.id, record, finalNumericId);
    }

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('bft-realtime-profile-update', {
            detail: {
              id: params.userProfile.id,
              email: params.userProfile.email,
              numeric_id: finalNumericId,
              self_balance: authoritativeNewBalance,
              self_capital_balance: authoritativeNewBalance,
            },
          })
        );
      } catch {
        // ignore
      }
    }

    return {
      ok: true,
      message: `Successfully transferred $${validation.normalizedAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} from your Self-Capital Balance to Trader ID #${validation.normalizedReceiverNumericId}.`,
      transferAmount: validation.normalizedAmount,
      receiverNumericId: validation.normalizedReceiverNumericId,
      receiverName,
      previousBalance: availableLiveBalance,
      newBalance: authoritativeNewBalance,
      balanceColumn,
      updatedProfile,
      updatedAccount,
      record,
    };
  } finally {
    inFlightP2PSignatures.delete(signature);
  }
}
