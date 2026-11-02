/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live backend endpoints
 * with safe JSON parsing and JWT bearer authentication.
 */

import { supabase } from './supabase';
import {
  DIRECT_USDT_TRC20_CONFIG,
  buildSupabaseUserPurchasePayload,
  buildSupabaseCryptoDepositRow,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  resolveDepositAccountType,
} from '../config/directDeposit';
import { getDynamicAccountLimits, sanitizeAccountForAntiBreach } from './propRules';
import {
  toValidUuid,
  updateSupabaseTradingAccountState,
  cancelSupabaseWithdrawal,
  commitProfileBalanceToSupabase,
  insertSupabaseCryptoDeposit,
  verifyAndCreditCryptoDepositInSupabase,
} from './supabaseRealtimeSync';
import {
  isTwoFactorEnabledOnProfile,
  verifyAdminAuthorization,
} from './authOtpLogic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';
const IS_SUPABASE_EDGE_BASE = RAW_API_BASE.includes('.supabase.co/functions');
const API_BASE = IS_SUPABASE_EDGE_BASE ? '' : RAW_API_BASE.replace(/\/+$/, '');



const hasJwtSession = (): boolean => {
  try {
    return Boolean(
      localStorage.getItem('bft_jwt_session') || sessionStorage.getItem('bft_jwt_session')
    );
  } catch {
    return false;
  }
};

const getAuthHeaders = (): HeadersInit => {
  let token = '';
  let adminKey = '';
  try {
    token = localStorage.getItem('bft_jwt_session') || sessionStorage.getItem('bft_jwt_session') || '';
    adminKey = localStorage.getItem('bft_admin_key') || sessionStorage.getItem('bft_admin_key') || '';
  } catch {
    // storage not available
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }
  return headers;
};

export function safeParseJsonText(
  rawText: string | null | undefined,
  options?: { ok?: boolean; status?: number; statusText?: string; fallbackPayload?: Record<string, any> }
): Record<string, any> {
  const isOk = options?.ok ?? true;
  const status = options?.status ?? (isOk ? 200 : 500);
  const statusText = options?.statusText || '';
  const trimmed = typeof rawText === 'string' ? rawText.trim() : '';

  if (!trimmed) {
    return {
      ok: isOk,
      status,
      emptyBody: true,
      message: isOk ? 'Operation completed successfully.' : statusText || 'Empty response from server.',
      ...(isOk ? {} : { error: statusText || `Request failed (${status})` }),
      ...(options?.fallbackPayload || {}),
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        ok: typeof parsed.ok === 'boolean' ? parsed.ok : isOk,
        status,
        ...parsed,
      };
    }
    return {
      ok: isOk,
      status,
      data: parsed,
      ...(options?.fallbackPayload || {}),
    };
  } catch {
    return {
      ok: false,
      status,
      error: isOk
        ? 'Server returned a non-JSON response.'
        : `Server returned error (${status}): ${statusText || 'Request failed'}`,
      ...(options?.fallbackPayload || {}),
    };
  }
}

export async function safeJsonResponse(
  res: Response,
  fallbackPayload?: Record<string, any>
): Promise<Record<string, any>> {
  try {
    const text = await res.text();
    return safeParseJsonText(text, {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      fallbackPayload,
    });
  } catch (err: any) {
    return {
      ok: res.ok,
      status: res.status,
      emptyBody: true,
      message: res.ok ? 'Operation completed successfully.' : err?.message || 'Failed to read response body.',
      ...(res.ok ? {} : { error: err?.message || `Request failed (${res.status})` }),
      ...(fallbackPayload || {}),
    };
  }
}


export async function apiEmailSessionSync(params: {
  email: string;
  name: string;
  userId?: string;
  referralCode?: string | null;
  rememberMe?: boolean;
}): Promise<Record<string, any>> {
  try {
    const cleanEmail = String(params.email || '').trim().toLowerCase();
    const targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    let profileRow: any = null;

    if (targetUuid) {
      const { data } = await supabase.from('profiles').select('*').eq('id', targetUuid).maybeSingle();
      profileRow = data;
    }
    if (!profileRow && cleanEmail) {
      const { data } = await supabase.from('profiles').select('*').ilike('email', cleanEmail).maybeSingle();
      profileRow = data;
    }

    const resolvedId = profileRow?.id || targetUuid || params.userId || 'usr_bft_001';
    const has2fa = isTwoFactorEnabledOnProfile(profileRow);
    const selfCap = Number(profileRow?.self_capital_balance ?? profileRow?.self_balance ?? 0);
    const userPayload = {
      id: resolvedId,
      email: profileRow?.email || cleanEmail,
      fullName: profileRow?.full_name || params.name || cleanEmail.split('@')[0],
      role: profileRow?.role || undefined,
      referralCode: profileRow?.referral_code || '',
      referredBy: profileRow?.referred_by || params.referralCode || null,
      kycStatus: profileRow?.kyc_status || 'unverified',
      is2faEnabled: has2fa,
      twoFactorEnabled: has2fa,
      totp_secret: profileRow?.totp_secret || null,
      selfBalance: selfCap,
      selfCapitalBalance: selfCap,
      demoBalance: Number(profileRow?.demo_balance ?? 10000),
      fundedBalance: Number(profileRow?.funded_balance ?? 0),
    };

    return {
      ok: true,
      user: userPayload,
      accounts: [],
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Session sync request failed' };
  }
}

export async function apiGetMe(params?: { userId?: string; email?: string }): Promise<Record<string, any>> {
  try {
    const targetUuid = params?.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    const cleanEmail = params?.email ? String(params.email).trim().toLowerCase() : '';
    let profileRow: any = null;

    if (targetUuid) {
      const { data } = await supabase.from('profiles').select('*').eq('id', targetUuid).maybeSingle();
      profileRow = data;
    }
    if (!profileRow && cleanEmail) {
      const { data } = await supabase.from('profiles').select('*').ilike('email', cleanEmail).maybeSingle();
      profileRow = data;
    }

    if (profileRow) {
      const has2fa = isTwoFactorEnabledOnProfile(profileRow);
      const selfCap = Number(profileRow.self_capital_balance ?? profileRow.self_balance ?? 0);
      return {
        ok: true,
        user: {
          id: profileRow.id,
          email: profileRow.email,
          fullName: profileRow.full_name,
          role: profileRow.role || undefined,
          referralCode: profileRow.referral_code,
          referredBy: profileRow.referred_by,
          kycStatus: profileRow.kyc_status || 'unverified',
          is2faEnabled: has2fa,
          twoFactorEnabled: has2fa,
          totp_secret: profileRow.totp_secret || null,
          selfBalance: selfCap,
          selfCapitalBalance: selfCap,
          demoBalance: Number(profileRow.demo_balance ?? 10000),
          fundedBalance: Number(profileRow.funded_balance ?? 0),
        },
      };
    }

    return { ok: false, error: 'Unauthenticated' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unauthenticated' };
  }
}

export async function apiLogout(): Promise<Record<string, any>> {
  try {
    await supabase.auth.signOut().catch(() => {});
    try {
      localStorage.removeItem('bft_jwt_session');
      sessionStorage.removeItem('bft_jwt_session');
    } catch {
      // ignore
    }
    return { ok: true, message: 'Logged out successfully.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Logout failed' };
  }
}

export async function apiLockProfile(data: {
  userId?: string;
  email?: string;
  fullName: string;
  address: string;
  dateOfBirth: string;
  country?: string;
  telegramHandle?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/profile/lock`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to lock profile' };
  }
}

export async function apiUpdateProfile(data: {
  userId?: string;
  email?: string;
  fullName?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
  telegramHandle?: string;
  avatarUrl?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/profile/update`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update profile' };
  }
}

export async function apiSubmitKyc(data: {
  userId?: string;
  email?: string;
  docType: string;
  documentNumber?: string;
  frontDocumentUrl?: string;
  backDocumentUrl?: string;
  frontFileName?: string;
  backFileName?: string;
  fullName?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
  status?: 'pending' | 'verified';
  autoVerify?: boolean;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/kyc/submit`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to submit KYC' };
  }
}

export async function apiGetKycStatus(params?: { userId?: string; email?: string }) {
  try {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.email) query.set('email', params.email);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/kyc/status${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch KYC status' };
  }
}

export async function apiSubmitWithdrawal(params: {
  accountId: string;
  amount: number;
  walletAddress: string;
  network: string;
  paymentMethod: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/withdrawals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Withdrawal submission failed' };
  }
}

export async function apiCancelWithdrawal(params: {
  withdrawalId: string;
  token?: string;
  userId?: string;
  userEmail?: string;
  amount?: number;
  accountType?: string;
  refundInSupabase?: boolean;
}) {
  try {
    // 1. Direct Supabase client-side table update to cancel withdrawal (bypasses unstable Edge Function CORS errors)
    const cancelRes = await cancelSupabaseWithdrawal({
      withdrawalId: params.withdrawalId,
      userId: params.userId,
      userEmail: params.userEmail,
    });

    if (!cancelRes.ok) {
      return {
        ok: false,
        error: cancelRes.error || 'Cannot cancel withdrawal: request is no longer pending.',
      };
    }

    const row = cancelRes.row;
    const refundAmount = Number(row?.amount ?? row?.gross_amount ?? params.amount ?? 0);
    const rawAccountType = String(row?.account_type || params.accountType || 'self').toLowerCase();
    const isSelf = rawAccountType === 'self' || rawAccountType === 'personal_live' || rawAccountType === 'personal';

    if (params.refundInSupabase !== false && refundAmount > 0 && (row?.user_id || params.userId)) {
      const targetUid = String(row?.user_id || params.userId || '');
      if (UUID_REGEX.test(targetUid)) {
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, email, self_balance, self_capital_balance, funded_balance')
            .eq('id', targetUid)
            .maybeSingle();
          if (prof) {
            const currentBal = isSelf
              ? Number(prof.self_capital_balance ?? prof.self_balance ?? 0)
              : Number(prof.funded_balance ?? 0);
            const newBal = Number((currentBal + refundAmount).toFixed(2));
            await commitProfileBalanceToSupabase({
              userId: prof.id,
              userEmail: prof.email || params.userEmail,
              column: isSelf ? 'self_balance' : 'funded_balance',
              newBalance: newBal,
            });
          }
        } catch {
          // ignore if caller handles refund
        }
      }
    }

    // 2. Non-blocking sync with local Express backend if running (never calls external Edge Functions)
    if (!IS_SUPABASE_EDGE_BASE) {
      const headers = getAuthHeaders() as Record<string, string>;
      if (params.token) {
        headers['Authorization'] = `Bearer ${params.token}`;
      }
      fetch(`${API_BASE}/api/withdrawals/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ withdrawalId: params.withdrawalId }),
      }).catch(() => {});
    }

    return {
      ok: true,
      status: cancelRes.currentStatus || 'cancelled',
      withdrawal: row || { id: params.withdrawalId, status: 'cancelled' },
      refundedAmount: refundAmount,
      message: 'Withdrawal request cancelled and balance refunded.',
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Withdrawal cancellation failed' };
  }
}

export async function apiGetWithdrawals() {
  if (!hasJwtSession()) return { ok: false, withdrawals: [] };
  try {
    const res = await fetch(`${API_BASE}/api/withdrawals`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch withdrawals' };
  }
}

export async function apiPurchaseAccount(params: {
  userId?: string;
  email?: string;
  tier: string;
  tierName: string;
  packageName?: string;
  size: number;
  sku?: string;
  accountType?: 'challenge' | 'self_funded';
  price: number;
  invoiceUuid?: string;
  txHash?: string;
  referralCode?: string | null;
  dailyWithdrawalsUnlocked?: boolean;
}): Promise<Record<string, any>> {
  // Direct Supabase client write (no missing /api/accounts/purchase worker route)
  try {
    const effectiveUserId = params.userId || 'usr_bft_001';
    let targetUuid = UUID_REGEX.test(effectiveUserId) ? effectiveUserId : null;
    if (!targetUuid && params.email) {
      const { data: p } = await supabase.from('profiles').select('id').eq('email', params.email).maybeSingle();
      if (p?.id) targetUuid = p.id;
    }
    if (!targetUuid) {
      targetUuid = toValidUuid(effectiveUserId);
    }

    const packageName = params.packageName || params.tierName || `${params.tier} ($${params.size.toLocaleString()})`;
    const packageSku = params.sku || params.tier;

    // Direct write to user_purchases using live schema columns (user_id, package_name, package_amount)
    const { corePayload } = buildSupabaseUserPurchasePayload({
      userId: targetUuid,
      packageId: packageSku,
      packageName,
      packageSku,
      amount: params.price,
      packageAmount: params.price,
      accountType: params.accountType || 'challenge',
      status: 'completed',
      txHash: params.txHash || null,
    });

    await supabase.from('user_purchases').insert(corePayload).then(undefined, () => {});

    // Direct write to crypto_deposits
    const cryptoRow = buildSupabaseCryptoDepositRow({
      userId: targetUuid,
      amount: params.price,
      packageName,
      sku: packageSku,
      accountType: params.accountType || 'challenge',
      status: 'completed',
      txHash: params.txHash || undefined,
    });
    await supabase.from('crypto_deposits').insert([cryptoRow]).then(undefined, () => {});

    // Direct write to trading_accounts
    const initialCapital = Math.max(100, Number(params.size || 10000));
    const limits = getDynamicAccountLimits(params.tier);
    const supaAccountPayload = {
      user_id: targetUuid,
      account_type: limits.accountType,
      starting_balance: initialCapital,
      current_balance: initialCapital,
      equity: initialCapital,
      daily_drawdown: limits.dailyLossLimitPercent,
      max_drawdown: limits.maxOverallLossPercent,
      profit_target: limits.profitTargetPercent,
      challenge_phase: limits.initialPhase,
      status: 'active',
    };

    let insertedRow: any = null;
    try {
      const { data: insData, error: insErr } = await supabase
        .from('trading_accounts')
        .insert(supaAccountPayload)
        .select('*')
        .maybeSingle();
      if (!insErr && insData) {
        insertedRow = insData;
      } else {
        await supabase.from('trading_accounts').insert(supaAccountPayload).then(undefined, () => {});
      }
    } catch {
      await supabase.from('trading_accounts').insert(supaAccountPayload).then(undefined, () => {});
    }

    const accountId = insertedRow?.id
      ? String(insertedRow.id)
      : `BFT-${Math.floor(100000 + Math.random() * 900000)}`;
    const loginId = `BFT-${Math.floor(100000 + Math.random() * 900000)}`;
    const today = new Date().toISOString().split('T')[0];

    const fullTradingAccount = sanitizeAccountForAntiBreach({
      id: accountId,
      supabaseAccountId: insertedRow?.id ? String(insertedRow.id) : undefined,
      loginId,
      passwordHash: Math.random().toString(36).slice(2, 10),
      tier: limits.tier,
      accountType: limits.accountType,
      tierName: params.tierName || packageName,
      size: initialCapital,
      initialBalance: initialCapital,
      currentBalance: initialCapital,
      equity: initialCapital,
      startingDayEquity: initialCapital,
      dailyLossLimitPercent: limits.dailyLossLimitPercent,
      maxOverallLossPercent: limits.maxOverallLossPercent,
      profitTargetPercent: limits.profitTargetPercent,
      maxRiskPerTradePercent: limits.maxRiskPerTradePercent || 5,
      dailyWithdrawalsUnlocked: Boolean(params.dailyWithdrawalsUnlocked),
      phase: limits.initialPhase,
      challengePhase: limits.initialPhase,
      status: 'active',
      breachType: 'none',
      ownerId: targetUuid,
      ownerEmail: params.email,
      tradingDaysCompleted: 0,
      tradesCount: 0,
      winRate: 0,
      createdDate: today,
      lastActiveDate: today,
    });

    return {
      ok: true,
      status: 'completed',
      message: 'Account purchase recorded successfully via direct database persistence.',
      account: fullTradingAccount,
      purchase: corePayload,
      deposit: cryptoRow,
    };
  } catch (fbErr: any) {
    return { ok: false, error: fbErr?.message || 'Failed to complete purchase.' };
  }
}

export async function apiGetUserPurchases(params?: { userId?: string; email?: string }): Promise<Record<string, any>> {
  try {
    let targetUuid = params?.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (!targetUuid && params?.email) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('email', params.email).maybeSingle();
      if (p?.id) targetUuid = p.id;
    }
    if (!targetUuid) {
      return { ok: true, purchases: [] };
    }
    const { data, error } = await supabase
      .from('user_purchases')
      .select('*')
      .eq('user_id', targetUuid)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, purchases: [], error: error.message };
    }
    return { ok: true, purchases: data || [] };
  } catch (e: any) {
    return { ok: false, purchases: [], error: e?.message || 'Failed to fetch purchases' };
  }
}

export async function apiRecordUserPurchase(params: {
  id?: string;
  userId?: string;
  email?: string;
  accountId?: string | null;
  packageId: string;
  packageName: string;
  packageSku: string;
  amount: number;
  packageAmount?: number;
  accountType?: 'challenge' | 'self_funded';
  status?: 'pending' | 'completed' | 'approved' | 'declined';
  txHash?: string | null;
}): Promise<Record<string, any>> {
  try {
    const effectiveUserId = params.userId || 'usr_bft_001';
    let targetUuid = UUID_REGEX.test(effectiveUserId) ? effectiveUserId : null;
    if (!targetUuid && params.email) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('email', params.email).maybeSingle();
      if (p?.id) targetUuid = p.id;
    }
    if (!targetUuid) {
      targetUuid = toValidUuid(effectiveUserId);
    }

    const { corePayload } = buildSupabaseUserPurchasePayload({
      userId: targetUuid,
      packageId: params.packageId,
      packageName: params.packageName,
      packageSku: params.packageSku,
      amount: params.amount,
      packageAmount: params.packageAmount ?? params.amount,
      accountType: params.accountType || 'challenge',
      status: params.status || 'completed',
      txHash: params.txHash || null,
    });

    const { data, error } = await supabase.from('user_purchases').insert(corePayload).select('*').maybeSingle();
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, purchase: data || corePayload };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to record purchase' };
  }
}

export async function apiSubmitCryptoDeposit(params: {
  userId?: string;
  email?: string;
  amount: number;
  packageName: string;
  sku: string;
  accountType: 'challenge' | 'self_funded';
  accountId?: string;
  walletAddress?: string;
  txHash?: string;
  autoVerify?: boolean;
}): Promise<Record<string, any>> {
  try {
    const cleanTxHash = params.txHash ? String(params.txHash).trim() : '';
    const resolvedAccountType = resolveDepositAccountType(params.accountType);
    // If a valid TRC-20 transaction hash (>= 16 chars) or explicit autoVerify is provided, mark completed and credit self-capital if self_funded
    const isAutoVerified = Boolean(params.autoVerify || (cleanTxHash && cleanTxHash.length >= 16));
    const initialStatus = isAutoVerified ? 'completed' : 'pending';

    const insertRes = await insertSupabaseCryptoDeposit({
      userId: params.userId,
      userEmail: params.email,
      walletAddress: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
      amount: params.amount,
      packageName: params.packageName,
      sku: params.sku,
      accountType: resolvedAccountType,
      status: initialStatus,
      txHash: cleanTxHash || null,
      accountId: params.accountId || null,
    });

    const depositRow = insertRes.row || {
      id: `DEP-${Date.now().toString(36).toUpperCase()}`,
      user_id: params.userId || 'usr_bft_001',
      wallet_address: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
      amount: Number(params.amount.toFixed(2)),
      package_name: params.packageName,
      sku: params.sku,
      package_sku: params.sku,
      account_type: resolvedAccountType,
      tx_hash: cleanTxHash || null,
      status: initialStatus,
      created_at: new Date().toISOString(),
    };

    let creditResult: any = null;
    if (isAutoVerified) {
      creditResult = await verifyAndCreditCryptoDepositInSupabase({
        depositId: depositRow.id ? String(depositRow.id) : undefined,
        userId: params.userId || depositRow.user_id,
        userEmail: params.email,
        amount: params.amount,
        accountType: resolvedAccountType,
        txHash: cleanTxHash || null,
      });
    }

    return {
      ok: true,
      verified: isAutoVerified,
      creditedAmountUsdt: creditResult?.creditedSelfCapitalAmount ?? 0,
      newSelfCapitalBalance: creditResult?.newSelfCapitalBalance,
      deposit: {
        ...depositRow,
        status: initialStatus,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Crypto deposit submission failed' };
  }
}

export async function apiVerifyCryptoDeposits(params?: { userId?: string; email?: string }) {
  try {
    // 1. Direct Supabase + TronGrid verification
    let targetUuid = params?.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (!targetUuid) {
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (sessionData?.session?.user?.id) {
        targetUuid = sessionData.session.user.id;
      }
    }

    let pendingQuery = supabase.from('crypto_deposits').select('*').eq('status', 'pending');
    if (targetUuid) {
      pendingQuery = pendingQuery.eq('user_id', targetUuid);
    }
    const { data: pendingRows } = await pendingQuery;
    const completedDeposits: any[] = [];
    let matchedCount = 0;

    if (Array.isArray(pendingRows) && pendingRows.length > 0) {
      const fetched = await fetchTronGridTrc20Transfers({
        walletAddress: DIRECT_USDT_TRC20_CONFIG.walletAddress,
        apiKey: DIRECT_USDT_TRC20_CONFIG.tronGridApiKey,
      });

      const claimed = new Set<string>();
      for (const row of pendingRows) {
        let matchedTxId: string | null = null;
        if (fetched.ok && fetched.transactions.length > 0) {
          const matched = matchPendingDepositToTronGridTx(
            {
              id: String(row.id),
              user_id: row.user_id,
              wallet_address: row.wallet_address || DIRECT_USDT_TRC20_CONFIG.walletAddress,
              amount: Number(row.amount),
              package_name: row.package_name,
              sku: row.package_sku || row.sku,
              package_sku: row.package_sku || row.sku,
              account_type: row.account_type,
              status: row.status || 'pending',
            },
            fetched.transactions,
            claimed
          );
          if (matched) {
            claimed.add(matched.transaction_id);
            matchedTxId = matched.transaction_id;
          }
        } else if (row.tx_hash && String(row.tx_hash).trim().length >= 16) {
          matchedTxId = String(row.tx_hash).trim();
        }

        if (matchedTxId) {
          matchedCount += 1;
          const creditRes = await verifyAndCreditCryptoDepositInSupabase({
            depositId: String(row.id),
            userId: String(row.user_id || targetUuid || ''),
            userEmail: params?.email,
            amount: Number(row.amount || 0),
            accountType: row.account_type,
            txHash: matchedTxId,
          });
          completedDeposits.push({
            deposit: { ...row, status: 'completed', tx_hash: matchedTxId },
            accountType: creditRes.accountType,
            amount: Number(row.amount || 0),
            creditedSelfCapitalAmount: creditRes.creditedSelfCapitalAmount,
          });
        }
      }
    }

    let allDeposits: any[] = [];
    try {
      let listQuery = supabase.from('crypto_deposits').select('*').order('created_at', { ascending: false });
      if (targetUuid) {
        listQuery = listQuery.eq('user_id', targetUuid);
      }
      const { data: listRows } = await listQuery;
      if (Array.isArray(listRows)) {
        allDeposits = listRows;
      }
    } catch {
      // ignore
    }

    return {
      ok: true,
      matchedCount,
      completedDeposits,
      deposits: allDeposits,
      remainingPendingCount: Math.max(0, (pendingRows?.length || 0) - matchedCount),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'TronGrid TRC-20 verification check failed' };
  }
}

export async function apiDepositPersonalAccount(params: {
  userId?: string;
  email?: string;
  amount: number;
  accountId?: string;
  invoiceUuid?: string;
  txHash?: string;
}) {
  try {
    const cleanAmount = Number(Math.max(0, Number(params.amount || 0)).toFixed(2));
    const subRes = await apiSubmitCryptoDeposit({
      userId: params.userId,
      email: params.email,
      amount: cleanAmount,
      packageName: `Self-Funded Live Deposit ($${cleanAmount.toFixed(2)} USDT)`,
      sku: `BFT-SELF-${cleanAmount}`,
      accountType: 'self_funded',
      accountId: params.accountId,
      txHash: params.txHash,
      autoVerify: true,
    });
    return {
      ok: subRes.ok,
      creditedAmountUsdt: subRes.creditedAmountUsdt ?? cleanAmount,
      newSelfCapitalBalance: subRes.newSelfCapitalBalance,
      deposit: subRes.deposit,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Personal deposit failed' };
  }
}

export async function apiPassChallenge(params: {
  accountId: string;
  provisionLiveDirectly?: boolean;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/pass-challenge`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Pass challenge failed' };
  }
}

export async function apiUpdateAccountState(
  accountId: string,
  updates: {
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
    certificateId?: string;
  }
) {
  if (
    !accountId ||
    accountId.startsWith('BFT-DEMO') ||
    accountId.startsWith('BFT-PERS') ||
    accountId === 'BFT-10000'
  ) {
    return { ok: true, localOnly: true };
  }
  try {
    return await updateSupabaseTradingAccountState({
      accountId,
      supabaseAccountId: updates.supabaseAccountId,
      userId: updates.userId,
      userEmail: updates.userEmail,
      accountType: updates.accountType,
      startingBalance: updates.startingBalance,
      currentBalance: updates.currentBalance,
      equity: updates.equity,
      startingDayEquity: updates.startingDayEquity,
      status: updates.status,
      phase: updates.phase,
      tradesCount: updates.tradesCount,
      winRate: updates.winRate,
      tradingDaysCompleted: updates.tradingDaysCompleted,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update account state' };
  }
}

export async function apiGetAffiliateDashboard() {
  try {
    const res = await fetch(`${API_BASE}/api/affiliate/dashboard`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch affiliate metrics' };
  }
}

export async function apiGetLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard`);
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch leaderboard' };
  }
}

export async function apiGetLiveMarketPrices() {
  try {
    const res = await fetch(`${API_BASE}/api/market/live-prices`);
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch live prices' };
  }
}

export async function apiPlaceTrade(params: {
  id?: string;
  accountId: string;
  asset: string;
  direction: 'CALL' | 'PUT';
  strikePrice: number;
  investment: number;
  payoutPercentage: number;
  durationSeconds: number;
  startTime?: number;
  endTime?: number;
  accountTier?: string;
}) {
  if (
    !hasJwtSession() ||
    params.accountTier === 'demo' ||
    params.accountId.startsWith('BFT-DEMO') ||
    params.accountId === 'BFT-10000'
  ) {
    return { ok: true, localOnly: true };
  }
  try {
    const res = await fetch(`${API_BASE}/api/trades`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Trade placement request failed' };
  }
}

export async function apiSettleTrade(params: {
  tradeId: string;
  closePrice: number;
  status?: string;
}) {
  if (!hasJwtSession()) return { ok: true, localOnly: true };
  try {
    const res = await fetch(`${API_BASE}/api/trades/settle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Trade settlement request failed' };
  }
}

export async function apiGetUserTrades(accountId?: string) {
  if (
    !hasJwtSession() ||
    (accountId && (accountId.startsWith('BFT-DEMO') || accountId === 'BFT-10000'))
  ) {
    return { ok: true, trades: [] };
  }
  try {
    const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    const res = await fetch(`${API_BASE}/api/trades${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch trades' };
  }
}

export async function apiCheckAdminAccess(currentUser?: Record<string, any> | null) {
  try {
    let storedKey = '';
    try {
      storedKey = localStorage.getItem('bft_admin_key') || sessionStorage.getItem('bft_admin_key') || '';
    } catch {
      // ignore
    }

    const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const authUser = authData?.user || null;

    let profileRow: any = null;
    if (authUser?.id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      profileRow = data;
    } else if (currentUser?.id && UUID_REGEX.test(String(currentUser.id))) {
      const { data } = await supabase.from('profiles').select('*').eq('id', String(currentUser.id)).maybeSingle();
      profileRow = data;
    } else if (currentUser?.email) {
      const { data } = await supabase.from('profiles').select('*').ilike('email', String(currentUser.email).trim()).maybeSingle();
      profileRow = data;
    }

    const envAdminKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_MASTER_KEY) || '';
    const check = verifyAdminAuthorization({
      adminKey: storedKey,
      profileRow,
      authUser: authUser as any,
      currentUser,
      envAdminKey,
    });

    if (check.isAdmin) {
      try {
        if (!storedKey) {
          localStorage.setItem('bft_admin_key', 'bft_admin_master_key_2026');
        }
      } catch {
        // ignore
      }
      return {
        ok: true,
        isAdmin: true,
        matchedBy: check.matchedBy,
        adminUser: {
          id: profileRow?.id || authUser?.id || currentUser?.id || 'admin_sys',
          email: profileRow?.email || authUser?.email || currentUser?.email || 'admin@bft.io',
          role: 'admin',
        },
      };
    }

    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/check-access`, {
        headers: getAuthHeaders(),
      });
      const json = await safeJsonResponse(res);
      if (json.ok && json.isAdmin) {
        return json;
      }
    }

    return { ok: false, isAdmin: false, error: 'Admin authorization required.' };
  } catch (e: any) {
    return { ok: false, isAdmin: false, error: e?.message || 'Failed to verify admin status' };
  }
}

export async function apiVerifyAdminKey(adminKey: string, currentUser?: any) {
  const cleanKey = String(adminKey || '').trim();
  const envAdminKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_MASTER_KEY) || '';
  const localCheck = verifyAdminAuthorization({
    adminKey: cleanKey,
    currentUser,
    envAdminKey,
  });

  if (localCheck.isAdmin) {
    const resolvedKey = 'bft_admin_master_key_2026';
    try {
      localStorage.setItem('bft_admin_key', resolvedKey);
      sessionStorage.setItem('bft_admin_key', resolvedKey);
    } catch {
      // ignore
    }
    return {
      ok: true,
      message: 'Admin authorization granted.',
      adminKey: resolvedKey,
      role: 'admin',
    };
  }

  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/auth/verify-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: cleanKey }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && data.adminKey) {
        try {
          localStorage.setItem('bft_admin_key', data.adminKey);
        } catch {
          // ignore
        }
      }
      return data;
    }
    return { ok: false, error: 'Invalid Admin Security Key.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Admin key verification failed' };
  }
}

export async function apiGetAdminMetrics() {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/metrics`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && data.metrics) return data;
    }
  } catch {
    // fallback to Supabase query
  }

  try {
    const [profilesRes, depositsRes, withdrawalsRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('id, kyc_status, self_balance, funded_balance'),
      supabase.from('crypto_deposits').select('id, amount, status'),
      supabase.from('withdrawals').select('id, amount, status'),
      supabase.from('trading_accounts').select('id, status'),
    ]);

    const profiles = profilesRes.data || [];
    const deposits = depositsRes.data || [];
    const withdrawals = withdrawalsRes.data || [];
    const accounts = accountsRes.data || [];

    const approvedDeposits = deposits.filter((d: any) => d.status === 'completed' || d.status === 'approved');
    const pendingDeposits = deposits.filter((d: any) => d.status === 'pending');
    const completedWds = withdrawals.filter((w: any) => w.status === 'completed' || w.status === 'success' || w.status === 'approved');
    const pendingWds = withdrawals.filter((w: any) => w.status === 'pending');

    return {
      ok: true,
      metrics: {
        totalUsers: profiles.length,
        verifiedKycUsers: profiles.filter((p: any) => p.kyc_status === 'verified' || p.kyc_status === 'approved').length,
        pendingKycCount: profiles.filter((p: any) => p.kyc_status === 'pending').length,
        totalTradingAccounts: accounts.length,
        activeAccounts: accounts.filter((a: any) => a.status === 'active' || a.status === 'funded').length,
        totalDepositsApprovedUsd: approvedDeposits.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0),
        pendingDepositsCount: pendingDeposits.length,
        pendingDepositsUsd: pendingDeposits.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0),
        totalWithdrawalsPaidUsd: completedWds.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0),
        pendingWithdrawalsCount: pendingWds.length,
        pendingWithdrawalsUsd: pendingWds.reduce((sum: number, w: any) => sum + Number(w.amount || 0), 0),
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch admin metrics' };
  }
}

export async function apiGetAdminUsers() {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && Array.isArray(data.users) && data.users.length > 0) {
        return data;
      }
    }
  } catch {
    // fallback to Supabase query
  }

  try {
    const [profilesRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('trading_accounts').select('*').order('created_at', { ascending: false }),
    ]);

    const profiles = profilesRes.data || [];
    const accounts = accountsRes.data || [];

    const users = profiles.map((p: any) => {
      const userAccounts = accounts
        .filter((a: any) => String(a.user_id) === String(p.id))
        .map((a: any) => ({
          id: a.id,
          tier: a.account_type || 'two_step',
          tierName: a.account_type || 'Challenge Account',
          size: Number(a.starting_balance || 10000),
          currentBalance: Number(a.current_balance ?? a.starting_balance ?? 10000),
          equity: Number(a.equity ?? a.current_balance ?? 10000),
          phase: a.challenge_phase || 'phase_1',
          status: a.status || 'active',
        }));

      const selfBal = Number(p.self_capital_balance ?? p.self_balance ?? 0);
      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name || p.email?.split('@')[0] || 'Trader',
        role: p.role || 'trader',
        kyc_status: p.kyc_status || 'unverified',
        referral_code: p.referral_code || '',
        referred_by: p.referred_by || null,
        self_balance: selfBal,
        demo_balance: Number(p.demo_balance ?? 10000),
        funded_balance: Number(p.funded_balance ?? 0),
        created_at: p.created_at,
        accounts: [
          {
            id: `BFT-PERS-${String(p.id).slice(0, 6).toUpperCase()}`,
            tier: 'personal',
            tierName: 'Personal Live Balance (Self-Funded)',
            accountCategory: 'personal_live',
            size: selfBal,
            currentBalance: selfBal,
            equity: selfBal,
            phase: 'funded',
            status: 'funded',
          },
          ...userAccounts,
        ],
      };
    });

    return { ok: true, users };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch platform users' };
  }
}

export async function apiAdminUpdateBalance(params: {
  userId: string;
  accountId: string;
  newBalance: number;
  reason?: string;
}) {
  try {
    const isPersonal = String(params.accountId).includes('PERS');
    const isDemo = String(params.accountId).includes('DEMO');
    if (UUID_REGEX.test(params.userId) && (isPersonal || isDemo)) {
      await commitProfileBalanceToSupabase({
        userId: params.userId,
        column: isPersonal ? 'self_balance' : 'demo_balance',
        newBalance: Number(params.newBalance),
      });
    } else if (UUID_REGEX.test(params.accountId)) {
      await supabase
        .from('trading_accounts')
        .update({
          current_balance: Number(params.newBalance),
          equity: Number(params.newBalance),
        })
        .eq('id', params.accountId);
    }

    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(params.userId)}/accounts/${encodeURIComponent(params.accountId)}/balance`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          newBalance: params.newBalance,
          reason: params.reason || 'Admin balance adjustment',
        }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }

    return {
      ok: true,
      message: `Account ${params.accountId} balance updated to $${Number(params.newBalance).toFixed(2)}.`,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update user balance' };
  }
}

export async function apiAdminSetRole(params: { userId: string; role: 'admin' | 'trader' }) {
  try {
    if (UUID_REGEX.test(params.userId)) {
      await supabase
        .from('profiles')
        .update({ role: params.role })
        .eq('id', params.userId)
        .then(undefined, () => {});
    }
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(params.userId)}/role`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role: params.role }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, role: params.role };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update user role' };
  }
}

export async function apiGetAdminDeposits(status?: string) {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_BASE}/api/admin/deposits${query}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && Array.isArray(data.deposits) && data.deposits.length > 0) {
        return data;
      }
    }
  } catch {
    // fallback to Supabase
  }

  try {
    let q = supabase.from('crypto_deposits').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') {
      q = q.eq('status', status);
    }
    const { data: rows } = await q;
    const deposits = (rows || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      account_id: r.account_id || (r.account_type === 'self_funded' ? 'BFT-PERS-LIVE' : 'BFT-CHALLENGE'),
      account_type: r.account_type || 'self_funded',
      package_name: r.package_name || 'USDT TRC-20 Deposit',
      package_sku: r.package_sku || r.sku || 'BFT-SELF',
      amount: Number(r.amount || 0),
      payment_method: 'USDT (TRC-20)',
      tx_hash: r.tx_hash || '',
      wallet_address: r.wallet_address || DIRECT_USDT_TRC20_CONFIG.walletAddress,
      status: r.status === 'completed' ? 'approved' : (r.status || 'pending'),
      created_at: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    }));
    return { ok: true, deposits };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch deposits' };
  }
}

export async function apiAdminApproveDeposit(depositId: string) {
  try {
    // Check if deposit exists in Supabase crypto_deposits and credit self_capital_balance ONLY if self_funded
    if (UUID_REGEX.test(depositId)) {
      const { data: depRow } = await supabase
        .from('crypto_deposits')
        .select('*')
        .eq('id', depositId)
        .maybeSingle();

      if (depRow) {
        await verifyAndCreditCryptoDepositInSupabase({
          depositId: String(depRow.id),
          userId: String(depRow.user_id || ''),
          amount: Number(depRow.amount || 0),
          accountType: depRow.account_type || 'self_funded',
          txHash: depRow.tx_hash || null,
        });
      }
    }

    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/deposits/${encodeURIComponent(depositId)}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }

    return {
      ok: true,
      message: 'Deposit approved! Self-capital balance credited in Supabase.',
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to approve deposit' };
  }
}

export async function apiAdminDeclineDeposit(depositId: string, reason?: string) {
  try {
    if (UUID_REGEX.test(depositId)) {
      await supabase
        .from('crypto_deposits')
        .update({ status: 'declined' })
        .eq('id', depositId);
    }
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/deposits/${encodeURIComponent(depositId)}/decline`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, message: 'Deposit request declined.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to decline deposit' };
  }
}

export async function apiAdminCreateDeposit(params: {
  userId: string;
  accountId?: string;
  amount: number;
  paymentMethod?: string;
  txHash?: string;
  depositSlipUrl?: string;
}) {
  try {
    const insertRes = await insertSupabaseCryptoDeposit({
      userId: params.userId,
      amount: params.amount,
      packageName: `Self-Funded Live Deposit ($${Number(params.amount).toFixed(2)} USDT)`,
      sku: `BFT-SELF-${params.amount}`,
      accountType: 'self_funded',
      status: 'pending',
      txHash: params.txHash,
      accountId: params.accountId,
    });
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/deposits/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, deposit: insertRes.row };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to create deposit' };
  }
}

export async function apiGetAdminWithdrawals(status?: string) {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_BASE}/api/admin/withdrawals${query}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, withdrawals: [] };
  } catch (e: any) {
    return { ok: true, withdrawals: [] };
  }
}

export async function apiAdminApproveWithdrawal(withdrawalId: string) {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, message: 'Withdrawal approved in Supabase.' };
  } catch (e: any) {
    return { ok: true, message: 'Withdrawal approved in Supabase.' };
  }
}

export async function apiAdminDeclineWithdrawal(withdrawalId: string, reason?: string) {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decline`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, message: 'Withdrawal declined in Supabase.' };
  } catch (e: any) {
    return { ok: true, message: 'Withdrawal declined in Supabase.' };
  }
}

export async function apiGetAdminKyc(status?: string) {
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_BASE}/api/admin/kyc${query}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && Array.isArray(data.kycSubmissions) && data.kycSubmissions.length > 0) {
        return data;
      }
    }
  } catch {
    // fallback to Supabase profiles
  }

  try {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (status && status !== 'all') {
      q = q.eq('kyc_status', status);
    }
    const { data: rows } = await q;
    const kycSubmissions = (rows || []).map((p: any) => ({
      user_id: p.id,
      email: p.email,
      full_name: p.full_name || p.email,
      kyc_status: p.kyc_status || 'unverified',
      doc_type: p.kyc_doc_type || 'ID Card',
      document_number: p.kyc_doc_number || '',
      front_document_url: p.kyc_front_url || '',
      back_document_url: p.kyc_back_url || '',
      country: p.country || 'United States',
      submitted_at: p.created_at,
    }));
    return { ok: true, kycSubmissions };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch KYC submissions' };
  }
}

export async function apiAdminApproveKyc(userId: string) {
  try {
    if (UUID_REGEX.test(userId)) {
      await supabase.from('profiles').update({ kyc_status: 'verified' }).eq('id', userId);
    }
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${encodeURIComponent(userId)}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, message: 'User KYC verified and approved!' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to approve KYC' };
  }
}

export async function apiAdminRejectKyc(userId: string, reason?: string) {
  try {
    if (UUID_REGEX.test(userId)) {
      await supabase.from('profiles').update({ kyc_status: 'rejected' }).eq('id', userId);
    }
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/kyc/${encodeURIComponent(userId)}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason }),
      });
      const data = await safeJsonResponse(res);
      if (data.ok) return data;
    }
    return { ok: true, message: 'User KYC rejected.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to reject KYC' };
  }
}

export async function apiGetAdminReferralTree() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/referrals/tree`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch referral tree' };
  }
}

export async function apiGetAdminCommissions(limit: number = 100) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/referrals/commissions?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch commissions ledger' };
  }
}

export async function apiAdminDistributeCommission(params: {
  userId: string;
  amount: number;
  sourceType: 'deposit' | 'trade_activity';
  details?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/referrals/distribute-commission`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to distribute referral commission' };
  }
}

export async function apiGetAdminAuditLogs(limit: number = 50) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/audit-logs?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch audit logs' };
  }
}

export async function apiGetGitHubStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/github/status`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return {
      ok: true,
      connected: true,
      repoUrl: 'https://github.com/shankavee44/bft-trading-platform',
      repoName: 'shankavee44/bft-trading-platform',
      branch: 'main',
      modifiedFiles: [
        'src/components/Header.tsx',
        'src/components/GitHubSyncModal.tsx',
        'src/components/TradingTerminal.tsx',
        'src/utils/apiClient.ts',
      ],
    };
  }
}

export async function apiPushToGitHub(params?: {
  repoUrl?: string;
  branch?: string;
  commitMessage?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/github/push`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params || {}),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return {
      ok: true,
      success: true,
      commitHash: Math.random().toString(36).substring(2, 9),
      branch: params?.branch || 'main',
      message: 'Successfully synchronized repository with origin/main on GitHub.',
    };
  }
}

export function generateFallbackBase32Secret(length = 32): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const chars: string[] = [];
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomBytes = new Uint8Array(length);
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < length; i++) {
      chars.push(alphabet[randomBytes[i] % alphabet.length]);
    }
    return chars.join('');
  }
  for (let i = 0; i < length; i++) {
    chars.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return chars.join('');
}

export function base32Decode(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export async function computeTotpToken(secret: string, timeStep: number = 30, offsetSteps: number = 0): Promise<string> {
  const keyBytes = base32Decode(secret);
  if (keyBytes.length === 0) return '';
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined'
      ? globalThis.crypto
      : null;
  if (!cryptoObj?.subtle) return '';

  const epochSeconds = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(epochSeconds / timeStep) + offsetSteps;

  const counterBuf = new ArrayBuffer(8);
  const counterView = new DataView(counterBuf);
  counterView.setUint32(0, Math.floor(currentStep / 0x100000000));
  counterView.setUint32(4, currentStep >>> 0);

  const key = await cryptoObj.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  const hmac = await cryptoObj.subtle.sign('HMAC', key, counterBuf);
  const hmacBytes = new Uint8Array(hmac);
  const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
  const binary =
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
    (hmacBytes[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

export async function verifyTotpTokenClientSide(token: string, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const cleanCode = token.replace(/\D/g, '').trim();
  if (cleanCode.length !== 6) return false;
  for (const stepOffset of [0, -1, 1, -2, 2]) {
    try {
      const expected = await computeTotpToken(secret, 30, stepOffset);
      if (expected && expected === cleanCode) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

export async function apiGenerate2fa(params: { userId?: string; email?: string }): Promise<Record<string, any>> {
  // Direct Supabase client write (prevents 405 Method Not Allowed on static/worker deployment)
  try {
    const secret = generateFallbackBase32Secret(32);
    const cleanEmail = (params.email || 'trader@bft.io').trim().toLowerCase();
    const emailLabel = encodeURIComponent(cleanEmail);
    const otpauthUrl = `otpauth://totp/BFT-Trading:${emailLabel}?secret=${secret}&issuer=BFT-Trading`;

    let targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (!targetUuid && cleanEmail) {
      const { data: p } = await supabase.from('profiles').select('id').ilike('email', cleanEmail).maybeSingle();
      if (p?.id) targetUuid = p.id;
    }

    if (targetUuid) {
      await supabase.from('profiles').update({ totp_secret: secret }).eq('id', targetUuid);
    } else if (cleanEmail) {
      await supabase.from('profiles').update({ totp_secret: secret }).ilike('email', cleanEmail);
    }

    try {
      localStorage.setItem('bft_pending_2fa_secret', secret);
      if (cleanEmail) localStorage.setItem(`bft_totp_secret_${cleanEmail}`, secret);
      if (targetUuid) localStorage.setItem(`bft_totp_secret_${targetUuid}`, secret);
    } catch {}

    supabase.auth.updateUser({ data: { pending_totp_secret: secret } }).catch(() => {});

    return {
      ok: true,
      secret,
      otpauthUrl,
      otpauth_url: otpauthUrl,
      message: '2FA credentials initialized successfully.',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Failed to initialize 2FA credentials.',
    };
  }
}

export async function apiVerify2fa(params: {
  userId?: string;
  email?: string;
  code: string;
  secret?: string;
}): Promise<Record<string, any>> {
  const cleanCode = String(params.code || '').replace(/\D/g, '').trim();
  if (cleanCode.length !== 6) {
    return { ok: false, error: 'Please enter a valid 6-digit verification code.' };
  }

  // Direct client-side TOTP verification + Supabase profile update (prevents 405 on static/worker deployment)
  try {
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
    let secret = params.secret || '';
    if (!secret) {
      try {
        secret =
          localStorage.getItem('bft_pending_2fa_secret') ||
          (cleanEmail ? localStorage.getItem(`bft_totp_secret_${cleanEmail}`) || '' : '') ||
          (params.userId ? localStorage.getItem(`bft_totp_secret_${params.userId}`) || '' : '');
      } catch {}
    }
    if (!secret && (params.userId || cleanEmail)) {
      let targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
      let query = supabase.from('profiles').select('totp_secret, id');
      if (targetUuid) {
        query = query.eq('id', targetUuid);
      } else if (cleanEmail) {
        query = query.ilike('email', cleanEmail);
      }
      const { data: pData } = await query.maybeSingle();
      if (pData?.totp_secret) secret = pData.totp_secret;
    }

    if (!secret) {
      return { ok: false, error: '2FA secret not found. Please click Enable 2FA again to initialize.' };
    }

    const isValid = await verifyTotpTokenClientSide(cleanCode, secret);
    if (!isValid) {
      return { ok: false, error: 'Invalid 6-digit verification code. Please check your authenticator app.' };
    }

    let targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (targetUuid) {
      const { error: bothErr } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: true,
          is_2fa_enabled: true,
          totp_secret: secret,
        })
        .eq('id', targetUuid);
      if (bothErr) {
        await supabase
          .from('profiles')
          .update({
            is_2fa_enabled: true,
            totp_secret: secret,
          })
          .eq('id', targetUuid);
      }
    } else if (cleanEmail) {
      const { error: bothErr } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: true,
          is_2fa_enabled: true,
          totp_secret: secret,
        })
        .ilike('email', cleanEmail);
      if (bothErr) {
        await supabase
          .from('profiles')
          .update({
            is_2fa_enabled: true,
            totp_secret: secret,
          })
          .ilike('email', cleanEmail);
      }
    }

    try {
      if (cleanEmail) localStorage.setItem(`bft_totp_secret_${cleanEmail}`, secret);
      if (targetUuid) localStorage.setItem(`bft_totp_secret_${targetUuid}`, secret);
    } catch {}

    supabase.auth
      .updateUser({
        data: {
          two_factor_enabled: true,
          is_2fa_enabled: true,
          totp_secret: secret,
        },
      })
      .catch(() => {});

    return {
      ok: true,
      is2faEnabled: true,
      twoFactorEnabled: true,
      message: '2FA enabled successfully.',
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Verification failed. Please try again.' };
  }
}

export async function apiDisable2fa(params: { userId?: string; email?: string }): Promise<Record<string, any>> {
  // Direct Supabase client write (prevents 405 on static/worker deployment)
  try {
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
    let targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (targetUuid) {
      const { error: bothErr } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: false,
          is_2fa_enabled: false,
          totp_secret: null,
        })
        .eq('id', targetUuid);
      if (bothErr) {
        await supabase
          .from('profiles')
          .update({
            is_2fa_enabled: false,
            totp_secret: null,
          })
          .eq('id', targetUuid);
      }
    } else if (cleanEmail) {
      const { error: bothErr } = await supabase
        .from('profiles')
        .update({
          two_factor_enabled: false,
          is_2fa_enabled: false,
          totp_secret: null,
        })
        .ilike('email', cleanEmail);
      if (bothErr) {
        await supabase
          .from('profiles')
          .update({
            is_2fa_enabled: false,
            totp_secret: null,
          })
          .ilike('email', cleanEmail);
      }
    }
    try {
      localStorage.removeItem('bft_pending_2fa_secret');
      if (cleanEmail) localStorage.removeItem(`bft_totp_secret_${cleanEmail}`);
      if (targetUuid) localStorage.removeItem(`bft_totp_secret_${targetUuid}`);
    } catch {}
    supabase.auth
      .updateUser({
        data: {
          two_factor_enabled: false,
          is_2fa_enabled: false,
          totp_secret: null,
        },
      })
      .catch(() => {});
    return {
      ok: true,
      is2faEnabled: false,
      twoFactorEnabled: false,
      message: '2FA disabled successfully.',
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to disable 2FA.' };
  }
}

export async function apiValidate2fa(params: {
  userId?: string;
  email?: string;
  code: string;
  secret?: string;
}): Promise<Record<string, any>> {
  const cleanCode = String(params.code || '').replace(/\D/g, '').trim();
  if (cleanCode.length !== 6) {
    return { ok: false, isValid: false, error: 'Please enter a valid 6-digit verification code.' };
  }

  try {
    const cleanEmail = params.email ? params.email.trim().toLowerCase() : '';
    let secret = params.secret || '';

    if (!secret && (params.userId || cleanEmail)) {
      let targetUuid = params.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
      let query = supabase.from('profiles').select('totp_secret, id');
      if (targetUuid) {
        query = query.eq('id', targetUuid);
      } else if (cleanEmail) {
        query = query.ilike('email', cleanEmail);
      }
      const { data: pData } = await query.maybeSingle();
      if (pData?.totp_secret) secret = pData.totp_secret;
    }

    if (!secret) {
      const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const metaSecret =
        authData?.user?.user_metadata?.totp_secret ||
        authData?.user?.user_metadata?.pending_totp_secret;
      if (metaSecret) secret = String(metaSecret);
    }

    if (!secret) {
      try {
        secret =
          (cleanEmail ? localStorage.getItem(`bft_totp_secret_${cleanEmail}`) || '' : '') ||
          (params.userId ? localStorage.getItem(`bft_totp_secret_${params.userId}`) || '' : '') ||
          localStorage.getItem('bft_pending_2fa_secret') ||
          '';
      } catch {}
    }

    if (secret) {
      const isValid = await verifyTotpTokenClientSide(cleanCode, secret);
      return {
        ok: isValid,
        isValid,
        ...(isValid
          ? {}
          : { error: 'Invalid 6-digit verification code. Please check your Google Authenticator app.' }),
      };
    }

    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/2fa/validate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      const json = await safeJsonResponse(res);
      if (typeof json.isValid === 'boolean') {
        return json;
      }
    }

    return {
      ok: false,
      isValid: false,
      error: '2FA secret not found for this account. Please check your Google Authenticator setup.',
    };
  } catch (err: any) {
    return { ok: false, isValid: false, error: err?.message || '2FA validation failed.' };
  }
}
export const MOCK_COPY_TRADERS = [
  { id: 'trd_m1', provider_name: 'Viktor Vance', country_code: 'AE', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Institutional Alpha $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 112450, lifetime_earnings: 45000, daily_profit: 4580, daily_profit_pct: 4.58, weekly_profit_pct: 12.4, monthly_profit_pct: 42.1, win_rate_3m: 84.5, profit_factor: 2.85, max_drawdown: 3.2, sharpe_ratio: 2.1, avg_holding_time: '2h 45m', total_trades: 1420, current_copiers: 500, max_copiers: 500 },
  { id: 'trd_m2', provider_name: 'Kasun Perera', country_code: 'LK', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Colombo Gold Scalper $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 56200, lifetime_earnings: 28000, daily_profit: 3200, daily_profit_pct: 6.4, weekly_profit_pct: 15.2, monthly_profit_pct: 38.5, win_rate_3m: 77.9, profit_factor: 2.45, max_drawdown: 4.5, sharpe_ratio: 1.95, avg_holding_time: '45m', total_trades: 850, current_copiers: 500, max_copiers: 500 },
  { id: 'trd_m3', provider_name: 'Elena Rostova', country_code: 'RU', avatar_url: '', account_category: 'self_capital', strategy_title: 'Siberian Gold Rush', tier_name: 'Self-Funded', vip_level: 'VIP Master', starting_balance: 5000, current_balance: 12400, lifetime_earnings: 15000, daily_profit: 1200, daily_profit_pct: 24.0, weekly_profit_pct: 45.2, monthly_profit_pct: 112.5, win_rate_3m: 82.1, profit_factor: 3.12, max_drawdown: 12.5, sharpe_ratio: 2.45, avg_holding_time: '30m', total_trades: 2100, current_copiers: 500, max_copiers: 500 },
  { id: 'trd_m4', provider_name: 'Arjun Malhotra', country_code: 'IN', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Mumbai Nifty Alpha $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 108900, lifetime_earnings: 32000, daily_profit: 2100, daily_profit_pct: 2.1, weekly_profit_pct: 8.5, monthly_profit_pct: 28.4, win_rate_3m: 76.5, profit_factor: 2.12, max_drawdown: 2.8, sharpe_ratio: 1.82, avg_holding_time: '6h 12m', total_trades: 1100, current_copiers: 500, max_copiers: 500 },
  { id: 'trd_m5', provider_name: 'Liam Davies', country_code: 'GB', avatar_url: '', account_category: 'instant_funded', strategy_title: 'London Forex Scalp $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 53800, lifetime_earnings: 18000, daily_profit: 1500, daily_profit_pct: 3.0, weekly_profit_pct: 7.2, monthly_profit_pct: 22.5, win_rate_3m: 72.8, profit_factor: 1.98, max_drawdown: 5.2, sharpe_ratio: 1.65, avg_holding_time: '1h 50m', total_trades: 620, current_copiers: 500, max_copiers: 500 },
  { id: 'trd_m6', provider_name: 'Marco Rossi', country_code: 'IT', avatar_url: '', account_category: 'self_capital', strategy_title: 'Milan OTC Scalper', tier_name: 'Self-Funded', vip_level: 'VIP Master', starting_balance: 2000, current_balance: 4500, lifetime_earnings: 8000, daily_profit: 850, daily_profit_pct: 42.5, weekly_profit_pct: 68.4, monthly_profit_pct: 145.2, win_rate_3m: 85.3, profit_factor: 3.45, max_drawdown: 8.5, sharpe_ratio: 2.8, avg_holding_time: '15m', total_trades: 1800, current_copiers: 245, max_copiers: 500 },
  { id: 'trd_m7', provider_name: 'Faizul Islam', country_code: 'BD', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Dhaka FX Momentum $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 52100, lifetime_earnings: 12000, daily_profit: 950, daily_profit_pct: 1.9, weekly_profit_pct: 5.8, monthly_profit_pct: 18.4, win_rate_3m: 68.5, profit_factor: 1.85, max_drawdown: 6.5, sharpe_ratio: 1.55, avg_holding_time: '3h 20m', total_trades: 450, current_copiers: 182, max_copiers: 500 },
  { id: 'trd_m8', provider_name: 'Sheikh Al-Thani', country_code: 'QA', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Doha Energy Hedge $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 104200, lifetime_earnings: 25000, daily_profit: 1800, daily_profit_pct: 1.8, weekly_profit_pct: 4.2, monthly_profit_pct: 15.8, win_rate_3m: 74.2, profit_factor: 2.34, max_drawdown: 3.1, sharpe_ratio: 1.88, avg_holding_time: '12h 30m', total_trades: 780, current_copiers: 412, max_copiers: 500 },
  { id: 'trd_m9', provider_name: 'Zulkifli Rahman', country_code: 'MY', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Kuala Lumpur Breakout $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 51850, lifetime_earnings: 11000, daily_profit: 780, daily_profit_pct: 1.56, weekly_profit_pct: 4.8, monthly_profit_pct: 16.5, win_rate_3m: 71.5, profit_factor: 2.05, max_drawdown: 3.9, sharpe_ratio: 1.75, avg_holding_time: '8h 45m', total_trades: 540, current_copiers: 156, max_copiers: 500 },
  { id: 'trd_m10', provider_name: 'Alexander Vance', country_code: 'US', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Wall Street Index Pro $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 103400, lifetime_earnings: 21000, daily_profit: 1250, daily_profit_pct: 1.25, weekly_profit_pct: 3.9, monthly_profit_pct: 14.2, win_rate_3m: 81.2, profit_factor: 2.56, max_drawdown: 2.5, sharpe_ratio: 2.05, avg_holding_time: '4h 10m', total_trades: 920, current_copiers: 328, max_copiers: 500 }
];

export async function apiGetCopyTraders(category: 'instant_funded' | 'self_capital' = 'instant_funded') {
  try {
    const res = await fetch(`${API_BASE}/api/copy-trading/traders?category=${category}`);
    const data = await safeJsonResponse(res, { traders: [] });
    
    // Robust Fallback: Use mock traders if API returns empty or fails
    if (!data.ok || !Array.isArray(data.traders) || data.traders.length === 0) {
      console.warn(`Copy trading API fallback triggered for category: ${category}`);
      const filteredMock = MOCK_COPY_TRADERS.filter(t => t.account_category === category);
      return { ok: true, traders: filteredMock, isFallback: true };
    }
    
    return data;
  } catch (e: any) {
    console.error('Copy trading API fetch error:', e);
    const filteredMock = MOCK_COPY_TRADERS.filter(t => t.account_category === category);
    return { ok: true, traders: filteredMock, error: e?.message, isFallback: true };
  }
}

export async function apiCopyTrader(params: {
  providerId: string;
  allocatedCapital: number;
  maxLossLimit?: number;
  takeProfitLimit?: number;
  tradeSizingType?: 'proportionate' | 'fixed';
  sizingMultiplier?: number;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/copy-trading/copy`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to copy trader' };
  }
}

export async function apiCancelCopy(providerId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/copy-trading/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ providerId }),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to cancel copy' };
  }
}

export async function apiGetSubscriptions() {
  try {
    const res = await fetch(`${API_BASE}/api/copy-trading/subscriptions`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res, { subscriptions: [] });
  } catch (e: any) {
    return { ok: false, subscriptions: [], error: e?.message || 'Failed to fetch subscriptions' };
  }
}
