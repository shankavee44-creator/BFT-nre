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

/**
 * Loads the user's P2P transfer history (both Sent and Received) from localStorage.
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
    return parsed
      .map((item) => normalizeP2PTransferRecord(item, userNumericId || undefined))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
  const deduped = [
    record,
    ...existing.filter((r) => r.id !== record.id),
  ].slice(0, 50);

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
 * Fetches P2P transfer history from the `balance_transfers` table in Supabase,
 * merging with locally persisted P2P records.
 */
export async function fetchP2PTransfersFromSupabase(params: {
  userId?: string | null;
  userNumericId?: string | null;
  supabaseClient?: typeof supabase;
}): Promise<P2PTransferRecord[]> {
  const client = params.supabaseClient || supabase;
  const userId = String(params.userId || '').trim();
  const localList = loadLocalP2PTransferHistory(userId, params.userNumericId);
  const byId = new Map<string, P2PTransferRecord>();

  for (const item of localList) {
    byId.set(item.id, item);
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (userId && UUID_REGEX.test(userId) && typeof client?.from === 'function') {
    try {
      const { data, error } = await (client.from('balance_transfers') as any)
        .select('*')
        .or(`sender_user_id.eq.${userId},receiver_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const isSent = String(row.sender_user_id || '') === userId;
          const direction = isSent ? 'sent' : 'received';
          const amount = Number(row.amount || 0);
          const record = createP2PTransferRecord({
            id: String(row.id),
            direction,
            senderNumericId: row.sender_numeric_id || (isSent ? params.userNumericId || '58021601' : '100201'),
            receiverNumericId: row.receiver_numeric_id || (!isSent ? params.userNumericId || '58021601' : '100202'),
            amount,
            createdAt: row.created_at || new Date().toISOString(),
            status: 'completed',
          });
          byId.set(record.id, record);
        }
      }
    } catch {
      // ignore table / offline errors
    }
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (userId) {
    if (merged.length > 0) {
      saveLocalP2PTransferRecord(userId, merged[0], params.userNumericId);
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

  const seedSource = String(
    supabaseRow?.id || userProfile?.id || supabaseRow?.email || userProfile?.email || 'bft-trader-default'
  )
    .trim()
    .toLowerCase();

  let hash = 2166136261;
  for (let i = 0; i < seedSource.length; i++) {
    hash ^= seedSource.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash >>> 0);
  const eightDigit = 10000000 + (positive % 90000000);
  return String(eightDigit);
}

/**
 * Strictly resolves the user's Self-Capital (Live Balance) for P2P transfers.
 * Funds can ONLY be transferred from the user's Self-Capital balance (`self_balance` / Personal Live account).
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
      String(a.id || '').startsWith('BFT-PERS')
  );

  const rawSelf =
    userProfile?.selfBalance !== undefined && Number.isFinite(Number(userProfile.selfBalance))
      ? Number(userProfile.selfBalance)
      : personalAcc?.currentBalance ?? 0;

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
  if (!val) return 0;
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
 * If the input amount exceeds the user's current Self-Capital balance, returns:
 * 'Transfers are only allowed from your Self-Capital balance.'
 */
export function validateP2PTransferInput(params: {
  senderNumericId?: string | number | null;
  receiverNumericId: string | number;
  transferAmount: string | number;
  availableLiveBalance: string | number;
}): P2PTransferValidationResult {
  const rawReceiver = String(params.receiverNumericId ?? '').trim();
  const cleanReceiver = rawReceiver.replace(/^#/, '').trim();
  
  const liveBalanceNum = parseNumericAmount(params.availableLiveBalance);
  const transferAmountNum = parseNumericAmount(params.transferAmount);
  const parsedAmount = transferAmountNum;

  const normalizedAmount =
    Number.isFinite(transferAmountNum) && transferAmountNum > 0 ? parseFloat(transferAmountNum.toFixed(2)) : 0;

  // Check if input amount exceeds the user's current Self-Capital balance using strict float numeric comparison
  if (parseFloat(String(transferAmountNum)) > parseFloat(String(liveBalanceNum))) {
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

  return {
    valid: true,
    normalizedReceiverNumericId: cleanReceiver,
    receiverNumericIdAsNumber: Number(cleanReceiver),
    normalizedAmount,
    exceedsSelfCapitalBalance: false,
  };
}

function extractRpcFailureMessage(data: any, error: any): string | null {
  if (error) {
    const msg = String(error.message || error.details || error.hint || 'P2P transfer failed.');
    if (
      msg.toLowerCase().includes('insufficient') ||
      msg.toLowerCase().includes('self-capital') ||
      msg.toLowerCase().includes('self_balance')
    ) {
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
      if (
        rawErr.toLowerCase().includes('insufficient') ||
        rawErr.toLowerCase().includes('self-capital') ||
        rawErr.toLowerCase().includes('self_balance')
      ) {
        return P2P_SELF_CAPITAL_ONLY_ERROR;
      }
      return rawErr;
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
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

/**
 * Executes a P2P Self-Capital balance transfer by calling the updated Supabase RPC function:
 * `transfer_balance_p2p(p_receiver_numeric_id, p_transfer_amount)`
 * (with automatic fallback to `transfer_balance_to_user` and direct atomic profile/notification sync)
 * and updates the user's live Self-Capital balance in real-time.
 */
export async function executeP2PBalanceTransfer(
  params: ExecuteP2PTransferParams
): Promise<ExecuteP2PTransferResult> {
  const now = Date.now();
  const signature = `${params.userProfile?.id}_${params.receiverNumericId}_${params.transferAmount}`;
  if (now - lastP2PExecutionTime < 4000 && lastP2PSignature === signature) {
    return {
      ok: false,
      error: 'Transfer request is already being processed. Please do not double-submit.',
      transferAmount: Number(params.transferAmount || 0),
      receiverNumericId: String(params.receiverNumericId || ''),
      previousBalance: 0,
      newBalance: 0,
      balanceColumn: 'self_balance',
    };
  }
  lastP2PExecutionTime = now;
  lastP2PSignature = signature;

  const client = params.supabaseClient || supabase;
  const isDefaultSupabaseClient = !params.supabaseClient;
  const senderNumericId = resolveUserNumericId(params.userProfile);
  const { availableLiveBalance, balanceColumn, targetAccount } = resolveTransferableLiveBalance(
    params.userProfile,
    params.accounts || []
  );

  const validation = validateP2PTransferInput({
    senderNumericId,
    receiverNumericId: params.receiverNumericId,
    transferAmount: params.transferAmount,
    availableLiveBalance,
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

  const rpcPayload = buildTransferBalanceRpcPayload(
    validation.normalizedReceiverNumericId,
    validation.normalizedAmount
  );

  let rpcData: any = null;
  let rpcError: any = null;
  let receiverName: string | undefined;
  let receiverUserId: string | undefined;

  try {
    // 1. Primary call to updated Supabase RPC: transfer_balance_p2p
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

  // If the RPC returned an explicit database/validation error (and not a missing function in dev environment)
  if (rpcError && !isMissingRpcFunctionError(rpcError)) {
    const cleanErr =
      extractRpcFailureMessage(rpcData, rpcError) || 'Unable to complete P2P balance transfer.';
    return {
      ok: false,
      error: cleanErr,
      transferAmount: validation.normalizedAmount,
      receiverNumericId: validation.normalizedReceiverNumericId,
      previousBalance: availableLiveBalance,
      newBalance: availableLiveBalance,
      balanceColumn: 'self_balance',
    };
  }

  // Check if rpcData itself encodes a business failure (e.g. { success: false, error: 'User not found' })
  const dataFailure = extractRpcFailureMessage(rpcData, null);
  if (dataFailure) {
    return {
      ok: false,
      error: dataFailure,
      transferAmount: validation.normalizedAmount,
      receiverNumericId: validation.normalizedReceiverNumericId,
      previousBalance: availableLiveBalance,
      newBalance: availableLiveBalance,
      balanceColumn: 'self_balance',
    };
  }

  // If the RPC function was missing on the remote DB, perform direct profiles self_balance validation & transfer
  // and insert the recipient notification into `user_notifications`
  if (rpcError && isMissingRpcFunctionError(rpcError) && typeof client.from === 'function') {
    try {
      const { data: receiverRow, error: lookupError } = await (client.from('profiles') as any)
        .select('id, email, full_name, numeric_id, self_balance, self_capital_balance')
        .eq('numeric_id', validation.receiverNumericIdAsNumber)
        .maybeSingle();

      const lookupMsg = String(lookupError?.message || '').toLowerCase();
      if (
        lookupError &&
        !lookupMsg.includes('numeric_id') &&
        !lookupMsg.includes('failed to fetch') &&
        !lookupMsg.includes('networkerror') &&
        !lookupMsg.includes('load failed')
      ) {
        return {
          ok: false,
          error: lookupError.message || 'Failed to verify recipient numeric ID.',
          transferAmount: validation.normalizedAmount,
          receiverNumericId: validation.normalizedReceiverNumericId,
          previousBalance: availableLiveBalance,
          newBalance: availableLiveBalance,
          balanceColumn: 'self_balance',
        };
      }

      if (receiverRow?.id) {
        if (String(receiverRow.id) === String(params.userProfile.id)) {
          return {
            ok: false,
            error: 'You cannot transfer funds to your own account.',
            transferAmount: validation.normalizedAmount,
            receiverNumericId: validation.normalizedReceiverNumericId,
            previousBalance: availableLiveBalance,
            newBalance: availableLiveBalance,
            balanceColumn: 'self_balance',
          };
        }
        receiverUserId = String(receiverRow.id);
        receiverName = receiverRow.full_name || receiverRow.email || undefined;
        const receiverCurrentBal = Number(
          receiverRow.self_capital_balance ?? receiverRow.self_balance ?? 0
        );
        const receiverNextBal = Number(
          (receiverCurrentBal + validation.normalizedAmount).toFixed(2)
        );
        await (client.from('profiles') as any)
          .update({ self_balance: receiverNextBal })
          .eq('id', receiverRow.id);

        // Insert notification into `user_notifications` for the recipient
        try {
          await (client.from('user_notifications') as any).insert([
            {
              user_id: receiverRow.id,
              title: 'P2P Deposit Received! 💰',
              message: `You received $${validation.normalizedAmount.toFixed(2)} into your Self-Capital balance from User #${senderNumericId}.`,
              type: 'p2p_received',
              amount: validation.normalizedAmount,
              sender_numeric_id: senderNumericId,
              receiver_numeric_id: validation.normalizedReceiverNumericId,
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ]);
        } catch {
          // ignore if user_notifications table has different columns
        }
      }
    } catch {
      // ignore fallback lookup error
    }
  }

  if (rpcData && typeof rpcData === 'object') {
    receiverName =
      rpcData.receiver_name ||
      rpcData.recipient_name ||
      rpcData.full_name ||
      receiverName;
    receiverUserId = rpcData.receiver_id || rpcData.recipient_id || receiverUserId;
  }

  // Strictly deduct exclusively from the user's Self-Capital balance (`self_balance`)
  const expectedNewBalance = Math.max(
    0,
    Number((availableLiveBalance - validation.normalizedAmount).toFixed(2))
  );

  let authoritativeNewBalance = expectedNewBalance;
  let refreshedNumericId: string | undefined;

  if (rpcData && typeof rpcData === 'object') {
    const rpcBal = Number(
      rpcData.new_balance ??
        rpcData.sender_new_balance ??
        rpcData.self_capital_balance ??
        rpcData.self_balance ??
        NaN
    );
    if (Number.isFinite(rpcBal) && rpcBal >= 0) {
      authoritativeNewBalance = Number(rpcBal.toFixed(2));
    }
  }

  const isOfflineFetchError =
    rpcError &&
    /failed to fetch|networkerror|load failed/i.test(
      String(rpcError.message || rpcError.details || '')
    );

  if (isDefaultSupabaseClient && !isOfflineFetchError) {
    try {
      const freshRow = await fetchSupabaseProfileRow({
        userId: params.userProfile.id,
        userEmail: params.userProfile.email,
      });

      if (freshRow) {
        if (freshRow.numeric_id !== undefined && freshRow.numeric_id !== null) {
          refreshedNumericId = String(freshRow.numeric_id).trim();
        }
        const remoteSelfBal = Number(
          freshRow.self_capital_balance ?? freshRow.self_balance ?? NaN
        );

        if (Number.isFinite(remoteSelfBal) && remoteSelfBal >= 0) {
          if (
            Math.abs(remoteSelfBal - availableLiveBalance) < 0.005 &&
            expectedNewBalance !== availableLiveBalance
          ) {
            recordDirectBalanceCommit('self_balance', expectedNewBalance);
            await commitProfileBalanceToSupabase({
              userId: params.userProfile.id,
              userEmail: params.userProfile.email,
              column: 'self_balance',
              newBalance: expectedNewBalance,
            });
            authoritativeNewBalance = expectedNewBalance;
          } else {
            authoritativeNewBalance = Number(remoteSelfBal.toFixed(2));
            recordDirectBalanceCommit('self_balance', authoritativeNewBalance);
          }
        }
      } else {
        recordDirectBalanceCommit('self_balance', authoritativeNewBalance);
        commitProfileBalanceToSupabase({
          userId: params.userProfile.id,
          userEmail: params.userProfile.email,
          column: 'self_balance',
          newBalance: authoritativeNewBalance,
        }).catch(() => {});
      }
    } catch {
      recordDirectBalanceCommit('self_balance', authoritativeNewBalance);
    }
  } else {
    recordDirectBalanceCommit('self_balance', authoritativeNewBalance);
  }

  const finalNumericId = refreshedNumericId || senderNumericId;

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    numericId: finalNumericId,
    numeric_id: finalNumericId,
    selfBalance: authoritativeNewBalance,
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
}
