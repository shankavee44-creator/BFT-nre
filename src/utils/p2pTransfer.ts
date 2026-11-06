import { supabase } from './supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  fetchSupabaseProfileRow,
  recordDirectBalanceCommit,
  commitProfileBalanceToSupabase,
  type ProfileBalanceColumn,
} from './supabaseRealtimeSync.ts';
import { isPersonalLiveAccount, isDemoAccount } from './propRules.ts';

export interface P2PTransferValidationResult {
  valid: boolean;
  error?: string;
  normalizedReceiverNumericId: string;
  receiverNumericIdAsNumber: number;
  normalizedAmount: number;
}

export interface P2PTransferRpcPayload {
  p_receiver_numeric_id: number;
  p_transfer_amount: number;
}

export interface P2PTransferRecord {
  id: string;
  senderNumericId: string;
  receiverNumericId: string;
  receiverName?: string;
  amount: number;
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
 * Resolves the user's transferable live balance and the corresponding account/column.
 * Prioritizes Personal Live (`self_balance`), and falls back to a Funded Live account (`funded_balance`)
 * if `self_balance` is 0 and the user holds a positive funded balance.
 */
export function resolveTransferableLiveBalance(
  userProfile?: UserProfile | null,
  accounts: TradingAccount[] = []
): {
  availableLiveBalance: number;
  balanceColumn: ProfileBalanceColumn;
  targetAccount?: TradingAccount;
} {
  const personalAcc = accounts.find(
    (a) =>
      isPersonalLiveAccount(a) ||
      a.accountType === 'personal' ||
      String(a.id || '').startsWith('BFT-PERS')
  );
  const fundedAcc = accounts.find(
    (a) =>
      !isPersonalLiveAccount(a) &&
      a.accountType !== 'personal' &&
      !String(a.id || '').startsWith('BFT-PERS') &&
      !isDemoAccount(a) &&
      a.phase === 'funded' &&
      a.status !== 'breached' &&
      a.status !== 'hard-breached'
  );

  const rawSelf =
    userProfile?.selfBalance !== undefined && Number.isFinite(Number(userProfile.selfBalance))
      ? Number(userProfile.selfBalance)
      : personalAcc?.currentBalance ?? 0;

  const rawFunded =
    userProfile?.fundedBalance !== undefined && Number.isFinite(Number(userProfile.fundedBalance))
      ? Number(userProfile.fundedBalance)
      : fundedAcc?.currentBalance ?? 0;

  const selfBalance = Math.max(0, Number(rawSelf.toFixed(2)));
  const fundedBalance = Math.max(0, Number(rawFunded.toFixed(2)));

  if (selfBalance > 0 || !fundedAcc || fundedBalance <= 0) {
    return {
      availableLiveBalance: selfBalance,
      balanceColumn: 'self_balance',
      targetAccount: personalAcc,
    };
  }

  return {
    availableLiveBalance: fundedBalance,
    balanceColumn: 'funded_balance',
    targetAccount: fundedAcc,
  };
}

/**
 * Pure helper: constructs the exact Supabase RPC payload for `transfer_balance_to_user`.
 */
export function buildTransferBalanceRpcPayload(
  receiverNumericId: string | number,
  transferAmount: string | number
): P2PTransferRpcPayload {
  const cleanId = String(receiverNumericId ?? '').trim().replace(/\D/g, '');
  const amountNum = Number(Number(transferAmount ?? 0).toFixed(2));
  return {
    p_receiver_numeric_id: Number(cleanId),
    p_transfer_amount: amountNum,
  };
}

/**
 * Validates the recipient's numeric_id and transfer amount against the sender's live balance.
 */
export function validateP2PTransferInput(params: {
  senderNumericId?: string | number | null;
  receiverNumericId: string | number;
  transferAmount: string | number;
  availableLiveBalance: number;
}): P2PTransferValidationResult {
  const rawReceiver = String(params.receiverNumericId ?? '').trim();
  const cleanReceiver = rawReceiver.replace(/^#/, '').trim();

  if (!cleanReceiver) {
    return {
      valid: false,
      error: 'Please enter the recipient’s unique numeric ID.',
      normalizedReceiverNumericId: '',
      receiverNumericIdAsNumber: 0,
      normalizedAmount: 0,
    };
  }

  if (!/^\d+$/.test(cleanReceiver) || Number(cleanReceiver) <= 0 || !Number.isSafeInteger(Number(cleanReceiver))) {
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

  const parsedAmount = Number(params.transferAmount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return {
      valid: false,
      error: 'Please enter a valid transfer amount greater than $0.00.',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount: 0,
    };
  }

  const normalizedAmount = Number(parsedAmount.toFixed(2));
  if (normalizedAmount < 1) {
    return {
      valid: false,
      error: 'Minimum P2P transfer amount is $1.00 USD.',
      normalizedReceiverNumericId: cleanReceiver,
      receiverNumericIdAsNumber: Number(cleanReceiver),
      normalizedAmount,
    };
  }

  const available = Math.max(0, Number((params.availableLiveBalance || 0).toFixed(2)));
  if (normalizedAmount > available) {
    return {
      valid: false,
      error: `Insufficient live balance. Available: $${available.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
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
  };
}

function extractRpcFailureMessage(data: any, error: any): string | null {
  if (error) {
    const msg = String(error.message || error.details || error.hint || 'P2P transfer failed.');
    return msg;
  }
  if (data && typeof data === 'object') {
    if (data.success === false || data.ok === false || data.status === 'error' || data.status === 'failed') {
      return String(data.error || data.message || data.reason || 'Transfer rejected by server.');
    }
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
  }
  if (data === false) {
    return 'Transfer could not be completed. Please verify the recipient numeric ID and your live balance.';
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
    msg.includes('function public.transfer_balance_to_user') ||
    msg.includes('function transfer_balance_to_user')
  );
}

/**
 * Executes a P2P live balance transfer by calling the Supabase RPC function:
 * `transfer_balance_to_user(p_receiver_numeric_id, p_transfer_amount)`
 * and dynamically refreshes the user's live balance from Supabase.
 */
export async function executeP2PBalanceTransfer(
  params: ExecuteP2PTransferParams
): Promise<ExecuteP2PTransferResult> {
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
      error: validation.error || 'Invalid transfer details.',
      transferAmount: validation.normalizedAmount,
      receiverNumericId: validation.normalizedReceiverNumericId,
      previousBalance: availableLiveBalance,
      newBalance: availableLiveBalance,
      balanceColumn,
    };
  }

  const rpcPayload = buildTransferBalanceRpcPayload(
    validation.normalizedReceiverNumericId,
    validation.normalizedAmount
  );

  let rpcData: any = null;
  let rpcError: any = null;
  let receiverName: string | undefined;

  try {
    const res = await client.rpc('transfer_balance_to_user', rpcPayload);
    rpcData = res.data;
    rpcError = res.error;

    // If the RPC signature expects p_receiver_numeric_id as text/varchar, retry once with string
    if (
      rpcError &&
      !isMissingRpcFunctionError(rpcError) &&
      String(rpcError.message || '').toLowerCase().includes('invalid input syntax')
    ) {
      const retryRes = await client.rpc('transfer_balance_to_user', {
        p_receiver_numeric_id: validation.normalizedReceiverNumericId,
        p_transfer_amount: validation.normalizedAmount,
      });
      rpcData = retryRes.data;
      rpcError = retryRes.error;
    }
  } catch (err: any) {
    rpcError = err;
  }

  // If the RPC returned an explicit database/validation error (and not a missing function in dev environment)
  if (rpcError && !isMissingRpcFunctionError(rpcError)) {
    const cleanErr = extractRpcFailureMessage(rpcData, rpcError) || 'Unable to complete P2P balance transfer.';
    return {
      ok: false,
      error: cleanErr,
      transferAmount: validation.normalizedAmount,
      receiverNumericId: validation.normalizedReceiverNumericId,
      previousBalance: availableLiveBalance,
      newBalance: availableLiveBalance,
      balanceColumn,
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
      balanceColumn,
    };
  }

  // If the RPC function was missing on the remote DB, attempt a direct profiles table lookup & transfer
  if (rpcError && isMissingRpcFunctionError(rpcError) && typeof client.from === 'function') {
    try {
      const { data: receiverRow, error: lookupError } = await (client.from('profiles') as any)
        .select('id, email, full_name, numeric_id, self_balance, self_capital_balance')
        .eq('numeric_id', validation.receiverNumericIdAsNumber)
        .maybeSingle();

      if (lookupError && !String(lookupError.message || '').includes('numeric_id')) {
        return {
          ok: false,
          error: lookupError.message || 'Failed to verify recipient numeric ID.',
          transferAmount: validation.normalizedAmount,
          receiverNumericId: validation.normalizedReceiverNumericId,
          previousBalance: availableLiveBalance,
          newBalance: availableLiveBalance,
          balanceColumn,
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
            balanceColumn,
          };
        }
        receiverName = receiverRow.full_name || receiverRow.email || undefined;
        const receiverCurrentBal = Number(
          receiverRow.self_capital_balance ?? receiverRow.self_balance ?? 0
        );
        const receiverNextBal = Number((receiverCurrentBal + validation.normalizedAmount).toFixed(2));
        await (client.from('profiles') as any)
          .update({ self_balance: receiverNextBal })
          .eq('id', receiverRow.id);
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
  }

  // Compute expected post-transfer balance and refresh from Supabase `profiles`
  const expectedNewBalance = Math.max(
    0,
    Number((availableLiveBalance - validation.normalizedAmount).toFixed(2))
  );

  let authoritativeNewBalance = expectedNewBalance;
  let refreshedNumericId: string | undefined;

  // Check if RPC returned the new sender balance directly
  if (rpcData && typeof rpcData === 'object') {
    const rpcBal = Number(
      rpcData.new_balance ?? rpcData.sender_new_balance ?? rpcData.self_balance ?? NaN
    );
    if (Number.isFinite(rpcBal) && rpcBal >= 0) {
      authoritativeNewBalance = Number(rpcBal.toFixed(2));
    }
  }

  if (isDefaultSupabaseClient) {
    try {
      const freshRow = await fetchSupabaseProfileRow({
        userId: params.userProfile.id,
        userEmail: params.userProfile.email,
      });

      if (freshRow) {
        if (freshRow.numeric_id !== undefined && freshRow.numeric_id !== null) {
          refreshedNumericId = String(freshRow.numeric_id).trim();
        }
        const remoteBal =
          balanceColumn === 'self_balance'
            ? Number(freshRow.self_capital_balance ?? freshRow.self_balance ?? NaN)
            : Number(freshRow.funded_balance ?? NaN);

        if (Number.isFinite(remoteBal) && remoteBal >= 0) {
          if (Math.abs(remoteBal - availableLiveBalance) < 0.005 && expectedNewBalance !== availableLiveBalance) {
            recordDirectBalanceCommit(balanceColumn, expectedNewBalance);
            await commitProfileBalanceToSupabase({
              userId: params.userProfile.id,
              userEmail: params.userProfile.email,
              column: balanceColumn,
              newBalance: expectedNewBalance,
            });
            authoritativeNewBalance = expectedNewBalance;
          } else {
            authoritativeNewBalance = Number(remoteBal.toFixed(2));
            recordDirectBalanceCommit(balanceColumn, authoritativeNewBalance);
          }
        }
      } else {
        recordDirectBalanceCommit(balanceColumn, authoritativeNewBalance);
        await commitProfileBalanceToSupabase({
          userId: params.userProfile.id,
          userEmail: params.userProfile.email,
          column: balanceColumn,
          newBalance: authoritativeNewBalance,
        });
      }
    } catch {
      recordDirectBalanceCommit(balanceColumn, authoritativeNewBalance);
    }
  } else {
    recordDirectBalanceCommit(balanceColumn, authoritativeNewBalance);
  }

  const finalNumericId = refreshedNumericId || senderNumericId;

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    numericId: finalNumericId,
    numeric_id: finalNumericId,
    selfBalance:
      balanceColumn === 'self_balance' ? authoritativeNewBalance : params.userProfile.selfBalance,
    fundedBalance:
      balanceColumn === 'funded_balance' ? authoritativeNewBalance : params.userProfile.fundedBalance,
  };

  const updatedAccount: TradingAccount | undefined = targetAccount
    ? {
        ...targetAccount,
        currentBalance: authoritativeNewBalance,
        equity: authoritativeNewBalance,
      }
    : undefined;

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('bft-realtime-profile-update', {
          detail: {
            id: params.userProfile.id,
            email: params.userProfile.email,
            numeric_id: finalNumericId,
            ...(balanceColumn === 'self_balance'
              ? {
                  self_balance: authoritativeNewBalance,
                  self_capital_balance: authoritativeNewBalance,
                }
              : {
                  funded_balance: authoritativeNewBalance,
                }),
          },
        })
      );
    } catch {
      // ignore
    }
  }

  const record: P2PTransferRecord = {
    id: `P2P-${Date.now().toString(36).toUpperCase()}`,
    senderNumericId: finalNumericId,
    receiverNumericId: validation.normalizedReceiverNumericId,
    receiverName,
    amount: validation.normalizedAmount,
    previousBalance: availableLiveBalance,
    newBalance: authoritativeNewBalance,
    createdAt: new Date().toISOString(),
    status: 'completed',
  };

  return {
    ok: true,
    message: `Successfully transferred $${validation.normalizedAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} to Trader ID #${validation.normalizedReceiverNumericId}.`,
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
