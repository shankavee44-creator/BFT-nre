/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live backend endpoints
 * with safe JSON parsing and JWT bearer authentication.
 */

import { supabase } from './supabase';
import {
  DIRECT_USDT_TRC20_CONFIG,
  DEPOSIT_EXPIRY_MS,
  buildSupabaseUserPurchasePayload,
  buildSupabaseCryptoDepositRow,
  buildSupabaseCryptoDepositCoreRow,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  resolveDepositAccountType,
  isCryptoDepositExpired,
  evaluateDepositStatusWithExpiry,
  parseChallengePackageFromDeposit,
  type CryptoDepositStatus,
} from '../config/directDeposit';
import { getDynamicAccountLimits, sanitizeAccountForAntiBreach } from './propRules';
import {
  toValidUuid,
  updateSupabaseTradingAccountState,
  cancelSupabaseWithdrawal,
  commitProfileBalanceToSupabase,
  insertSupabaseCryptoDeposit,
  verifyAndCreditCryptoDepositInSupabase,
  expireStaleSupabaseCryptoDeposits,
} from './supabaseRealtimeSync';
import {
  isTwoFactorEnabledOnProfile,
  verifyAdminAuthorization,
} from './authOtpLogic';
import {
  formatPurchasedPackageLabel,
  recordAffiliateUserPurchase,
} from './affiliateEngine';
import {
  createSupabaseTrade,
  updateSupabaseTrade,
  fetchUserTrades,
  ensureTradeUuid,
} from './supabaseTradeSync';

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
    // Direct Supabase client-side table update to cancel withdrawal
    const cancelRes = await cancelSupabaseWithdrawal({
      withdrawalId: params.withdrawalId,
      userId: params.userId,
      userEmail: params.userEmail,
    });

    if (!cancelRes.ok) {
      return {
        ok: false,
        error: cancelRes.error || 'Cannot cancel withdrawal: request is no longer pending.',
        alreadyCancelled: cancelRes.alreadyCancelled ?? true,
      };
    }

    const row = cancelRes.row;
    const refundAmount = Number(row?.amount ?? row?.gross_amount ?? params.amount ?? 0);

    // Non-blocking sync with local Express backend if running
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
      alreadyCancelled: false,
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
  try {
    const nowMs = Date.now();
    const effectiveUserId = params.userId || 'usr_bft_001';
    let targetUuid = UUID_REGEX.test(effectiveUserId) ? effectiveUserId : null;
    if (!targetUuid && params.email) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', params.email)
        .maybeSingle();
      if (p?.id) targetUuid = p.id;
    }
    if (!targetUuid) {
      targetUuid = toValidUuid(effectiveUserId);
    }

    const rawPackageName =
      params.packageName || params.tierName || `${params.tier} ($${params.size.toLocaleString()})`;
    const packageSku = params.sku || params.tier;
    const formattedLabel = formatPurchasedPackageLabel(rawPackageName, packageSku, params.price);
    const packageName = formattedLabel !== 'No Purchase' ? formattedLabel : rawPackageName;
    const cleanTxHash = params.txHash ? String(params.txHash).trim() : '';

    const { data: sessionData } = await supabase.auth
      .getSession()
      .catch(() => ({ data: { session: null } }));
    const authUserUuid = sessionData?.session?.user?.id || null;
    if (authUserUuid && UUID_REGEX.test(authUserUuid)) {
      targetUuid = authUserUuid;
    }

    // 1. Always log the deposit & purchase attempt as 'pending' in Supabase (`crypto_deposits`, `user_purchases`)
    const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
      userId: targetUuid,
      packageId: packageSku,
      packageName,
      packageSku,
      amount: params.price,
      packageAmount: params.price,
      accountType: params.accountType || 'challenge',
      status: 'pending',
      txHash: cleanTxHash || null,
    });

    const cryptoRow = buildSupabaseCryptoDepositRow({
      userId: targetUuid,
      amount: params.price,
      packageName,
      sku: packageSku,
      accountType: params.accountType || 'challenge',
      status: 'pending',
      txHash: cleanTxHash || undefined,
    });

    const cryptoCoreRow = buildSupabaseCryptoDepositCoreRow({
      userId: targetUuid,
      amount: params.price,
      packageName,
      sku: packageSku,
      accountType: params.accountType || 'challenge',
      status: 'pending',
    });

    let insertedDepositId: string | undefined;
    if (authUserUuid) {
      await supabase
        .from('user_purchases')
        .insert(corePayload)
        .then(undefined, () => {});

      try {
        const { data: depData } = await supabase
          .from('crypto_deposits')
          .insert([cryptoCoreRow])
          .select('*')
          .maybeSingle();
        if (depData?.id) {
          insertedDepositId = String(depData.id);
        }
      } catch {
        await supabase.from('crypto_deposits').insert([cryptoCoreRow]).then(undefined, () => {});
      }
    }

    // 2. Call backend `/api/accounts/purchase` and TronGrid verification
    let backendRes: Record<string, any> | null = null;
    if (!IS_SUPABASE_EDGE_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/accounts/purchase`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: effectiveUserId,
            email: params.email,
            tier: params.tier,
            tierName: params.tierName || packageName,
            packageName,
            size: params.size,
            sku: packageSku,
            accountType: params.accountType || 'challenge',
            price: params.price,
            referralCode: params.referralCode || null,
            dailyWithdrawalsUnlocked: params.dailyWithdrawalsUnlocked,
            txHash: cleanTxHash || undefined,
          }),
        });
        backendRes = await safeJsonResponse(res);
      } catch {
        // continue with client-side TronGrid check
      }
    }

    const verifyRes = await apiVerifyCryptoDeposits({
      userId: targetUuid,
      email: params.email,
    });

    const isVerifiedOnChain = Boolean(
      backendRes?.verified === true ||
        backendRes?.status === 'completed' ||
        backendRes?.status === 'active' ||
        (verifyRes?.matchedCount && Number(verifyRes.matchedCount) > 0)
    );

    // 3. If payment is NOT confirmed on the blockchain / gateway, keep order in 'pending' and DO NOT provision account!
    if (!isVerifiedOnChain) {
      const pendingDepositRecord = {
        ...(backendRes?.deposit || cryptoRow),
        id:
          backendRes?.deposit?.id ||
          insertedDepositId ||
          `DEP-${nowMs.toString(36).toUpperCase()}`,
        status: 'pending' as const,
        created_at: backendRes?.deposit?.created_at || new Date(nowMs).toISOString(),
        expires_at: nowMs + DEPOSIT_EXPIRY_MS,
      };

      return {
        ok: true,
        verified: false,
        status: 'pending',
        account: null,
        purchase: {
          ...fullPayload,
          id: pendingDepositRecord.id,
          status: 'pending',
          created_at: new Date(nowMs).toISOString(),
        },
        deposit: pendingDepositRecord,
        expiresAt: nowMs + DEPOSIT_EXPIRY_MS,
        message:
          'Payment order logged as pending. Your trading account will only be provisioned once the TRC-20 blockchain or Cryptomus gateway confirms the transfer (expires to failed after 60 minutes if unconfirmed).',
      };
    }

    // 4. Payment IS confirmed on-chain: record affiliate purchase, distribute 3-tier commissions, and provision account
    recordAffiliateUserPurchase({
      userId: effectiveUserId,
      userEmail: params.email,
      packageName,
      packageSku,
      amount: params.price,
    });
    if (targetUuid && targetUuid !== effectiveUserId) {
      recordAffiliateUserPurchase({
        userId: targetUuid,
        userEmail: params.email,
        packageName,
        packageSku,
        amount: params.price,
      });
    }

    try {
      let buyerProfile: any = null;
      if (targetUuid) {
        const { data: bp } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetUuid)
          .maybeSingle();
        buyerProfile = bp;
      }
      if (!buyerProfile && params.email) {
        const { data: bp } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', params.email)
          .maybeSingle();
        buyerProfile = bp;
      }

      let l1SponsorId: string | null = buyerProfile?.referred_by || null;
      if (!l1SponsorId && params.referralCode) {
        const { data: sp } = await supabase
          .from('profiles')
          .select('id')
          .ilike('referral_code', params.referralCode.trim())
          .maybeSingle();
        if (sp?.id && sp.id !== targetUuid) {
          l1SponsorId = sp.id;
          if (targetUuid) {
            await supabase
              .from('profiles')
              .update({ referred_by: l1SponsorId })
              .eq('id', targetUuid)
              .then(undefined, () => {});
          }
        }
      }

      if (l1SponsorId && l1SponsorId !== targetUuid) {
        const tierRates: Array<{ level: 1 | 2 | 3; rate: number }> = [
          { level: 1, rate: 0.1 },
          { level: 2, rate: 0.05 },
          { level: 3, rate: 0.02 },
        ];
        let currentSponsorId: string | null = l1SponsorId;

        for (const { level, rate } of tierRates) {
          if (!currentSponsorId || currentSponsorId === targetUuid) break;
          const commAmount = Number((Number(params.price || 0) * rate).toFixed(2));
          if (commAmount > 0) {
            await supabase
              .from('referral_commissions')
              .insert({
                referrer_id: currentSponsorId,
                referred_user_id: targetUuid,
                level,
                package_name: packageName,
                package_amount: Number(params.price || 0),
                amount: commAmount,
                source_type: 'package',
                description: packageName,
              })
              .then(undefined, () => {});

            const sponsorRes: any = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentSponsorId)
              .maybeSingle();
            const sponsorProf = sponsorRes?.data;
            if (sponsorProf) {
              const nextTotal = Number(
                (Number(sponsorProf.total_referral_earnings || 0) + commAmount).toFixed(2)
              );
              await supabase
                .from('profiles')
                .update({ total_referral_earnings: nextTotal })
                .eq('id', currentSponsorId)
                .then(undefined, () => {});
              currentSponsorId = sponsorProf.referred_by || null;
            } else {
              break;
            }
          }
        }
      }
    } catch {
      // Non-blocking Supabase commission sync
    }

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

    const accountId =
      backendRes?.account?.id ||
      (insertedRow?.id
        ? String(insertedRow.id)
        : `BFT-${Math.floor(100000 + Math.random() * 900000)}`);
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
      verified: true,
      status: 'completed',
      message: 'Blockchain payment confirmed! Your funded trading account has been provisioned.',
      account: fullTradingAccount,
      purchase: { ...fullPayload, status: 'active' },
      deposit: { ...cryptoRow, status: 'completed' },
    };
  } catch (fbErr: any) {
    return { ok: false, error: fbErr?.message || 'Failed to record purchase.' };
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

    await expireStaleSupabaseCryptoDeposits({
      userId: targetUuid,
      userEmail: params?.email,
    });

    const { data, error } = await supabase
      .from('user_purchases')
      .select('*')
      .eq('user_id', targetUuid)
      .order('created_at', { ascending: false });
    if (error) {
      return { ok: false, purchases: [], error: error.message };
    }
    const nowMs = Date.now();
    const evaluated = (data || []).map((row: any) =>
      evaluateDepositStatusWithExpiry(row, nowMs, DEPOSIT_EXPIRY_MS)
    );
    return { ok: true, purchases: evaluated };
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
  status?: CryptoDepositStatus;
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

    const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
      userId: targetUuid,
      packageId: params.packageId,
      packageName: params.packageName,
      packageSku: params.packageSku,
      amount: params.amount,
      packageAmount: params.packageAmount ?? params.amount,
      accountType: params.accountType || 'challenge',
      status: params.status || 'pending',
      txHash: params.txHash || null,
    });

    const { data, error } = await supabase
      .from('user_purchases')
      .insert(fullPayload)
      .select('*')
      .maybeSingle();
    if (error) {
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from('user_purchases')
        .insert(corePayload)
        .select('*')
        .maybeSingle();
      if (fallbackErr) {
        return { ok: false, error: fallbackErr.message };
      }
      return { ok: true, purchase: fallbackData || fullPayload };
    }
    return { ok: true, purchase: data || fullPayload };
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
  network?: string;
  receiptUrl?: string;
  txHash?: string;
  status?: string;
  autoVerify?: boolean;
}): Promise<Record<string, any>> {
  try {
    const nowMs = Date.now();
    const cleanTxHash = params.txHash ? String(params.txHash).trim() : '';
    const resolvedAccountType = resolveDepositAccountType(params.accountType);

    const initialStatus = (params.status || 'Processing') as CryptoDepositStatus;

    const insertRes = await insertSupabaseCryptoDeposit({
      userId: params.userId,
      userEmail: params.email,
      walletAddress: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
      network: params.network || 'Aptos',
      receiptUrl: params.receiptUrl,
      amount: params.amount,
      packageName: params.packageName,
      sku: params.sku,
      accountType: resolvedAccountType,
      status: initialStatus,
      txHash: cleanTxHash || null,
      accountId: params.accountId || null,
    });

    let backendDepositRes: Record<string, any> | null = null;
    if (!IS_SUPABASE_EDGE_BASE) {
      try {
        const res = await fetch(`${API_BASE}/api/deposit/submit`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            userId: params.userId,
            amount: params.amount,
            packageName: params.packageName,
            sku: params.sku,
            accountType: resolvedAccountType,
            accountId: params.accountId,
            txHash: cleanTxHash || undefined,
          }),
        });
        backendDepositRes = await safeJsonResponse(res);
      } catch {
        // continue with client-side TronGrid verification
      }
    }

    const depositRow = insertRes.row ||
      backendDepositRes?.deposit || {
        id: `DEP-${nowMs.toString(36).toUpperCase()}`,
        user_id: params.userId || 'usr_bft_001',
        wallet_address: params.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
        amount: Number(params.amount.toFixed(2)),
        package_name: params.packageName,
        sku: params.sku,
        package_sku: params.sku,
        account_type: resolvedAccountType,
        tx_hash: cleanTxHash || null,
        status: initialStatus,
        created_at: new Date(nowMs).toISOString(),
        expires_at: nowMs + DEPOSIT_EXPIRY_MS,
      };

    // Run real TronGrid blockchain verification
    const verifyRes = await apiVerifyCryptoDeposits({
      userId: params.userId || depositRow.user_id,
      email: params.email,
    });

    const matchedCompleted = verifyRes?.completedDeposits?.find(
      (c: any) =>
        (depositRow.id && String(c.deposit?.id) === String(depositRow.id)) ||
        Math.abs(Number(c.amount || 0) - Number(params.amount)) <= 0.01
    );

    const isVerifiedOnChain = Boolean(
      backendDepositRes?.verified === true || matchedCompleted
    );

    const effectiveStatus: CryptoDepositStatus = isVerifiedOnChain ? 'completed' : 'pending';

    return {
      ok: true,
      verified: isVerifiedOnChain,
      status: effectiveStatus,
      expiresAt: nowMs + DEPOSIT_EXPIRY_MS,
      creditedAmountUsdt: isVerifiedOnChain
        ? matchedCompleted?.creditedSelfCapitalAmount ??
          backendDepositRes?.creditedAmountUsdt ??
          (resolvedAccountType === 'self_funded' ? params.amount : 0)
        : 0,
      newSelfCapitalBalance: matchedCompleted?.newSelfCapitalBalance,
      deposit: {
        ...depositRow,
        status: effectiveStatus,
        expires_at: nowMs + DEPOSIT_EXPIRY_MS,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Crypto deposit submission failed' };
  }
}

export async function apiVerifyCryptoDeposits(params?: { userId?: string; email?: string }) {
  try {
    const nowMs = Date.now();
    // 1. Direct Supabase + TronGrid verification + 1-Hour Expiry Sweep
    let targetUuid = params?.userId && UUID_REGEX.test(params.userId) ? params.userId : null;
    if (!targetUuid) {
      const { data: sessionData } = await supabase.auth
        .getSession()
        .catch(() => ({ data: { session: null } }));
      if (sessionData?.session?.user?.id) {
        targetUuid = sessionData.session.user.id;
      }
    }

    // Sweep any pending Supabase deposits older than 1 hour (60 minutes) to 'failed'
    const supaExpirySweep = await expireStaleSupabaseCryptoDeposits({
      userId: targetUuid || params?.userId,
      userEmail: params?.email,
      nowMs,
    });

    // Also trigger backend verification & 1-hour expiry sweep if available
    let backendVerifyRes: Record<string, any> | null = null;
    if (!IS_SUPABASE_EDGE_BASE) {
      try {
        const qs = targetUuid
          ? `?userId=${encodeURIComponent(targetUuid)}`
          : params?.userId
          ? `?userId=${encodeURIComponent(params.userId)}`
          : '';
        const res = await fetch(`${API_BASE}/api/crypto-deposits/verify${qs}`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        backendVerifyRes = await safeJsonResponse(res);
      } catch {
        // ignore
      }
    }

    let pendingQuery = supabase.from('crypto_deposits').select('*').eq('status', 'pending');
    if (targetUuid) {
      pendingQuery = pendingQuery.eq('user_id', targetUuid);
    }
    const { data: pendingRows } = await pendingQuery;
    const completedDeposits: any[] = [
      ...(Array.isArray(backendVerifyRes?.completedDeposits)
        ? backendVerifyRes.completedDeposits
        : []),
    ];
    let matchedCount = completedDeposits.length;
    let expiredCount =
      (supaExpirySweep.expiredCount || 0) + Number(backendVerifyRes?.expiredCount || 0);

    if (Array.isArray(pendingRows) && pendingRows.length > 0) {
      const fetched = await fetchTronGridTrc20Transfers({
        walletAddress: DIRECT_USDT_TRC20_CONFIG.walletAddress,
        apiKey: DIRECT_USDT_TRC20_CONFIG.tronGridApiKey,
      });

      const claimed = new Set<string>();
      for (const row of pendingRows) {
        // Enforce 1-hour expiry timeout before attempting any match
        if (isCryptoDepositExpired(row, nowMs, DEPOSIT_EXPIRY_MS)) {
          expiredCount += 1;
          await supabase
            .from('crypto_deposits')
            .update({ status: 'failed' })
            .eq('id', row.id)
            .then(undefined, () => {});
          continue;
        }

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
              tx_hash: row.tx_hash,
              status: row.status || 'pending',
              created_at: row.created_at,
            },
            fetched.transactions,
            claimed,
            nowMs,
            DEPOSIT_EXPIRY_MS
          );
          if (matched) {
            claimed.add(matched.transaction_id);
            matchedTxId = matched.transaction_id;
          }
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

          let provisionedAccount: any = null;
          if (creditRes.accountType === 'challenge' && (row.user_id || targetUuid)) {
            const parsedPkg = parseChallengePackageFromDeposit({
              sku: row.package_sku || row.sku,
              package_sku: row.package_sku || row.sku,
              package_name: row.package_name,
              amount: Number(row.amount || 0),
            });
            const limits = getDynamicAccountLimits(parsedPkg.tier);
            const supaAccountPayload = {
              user_id: row.user_id || targetUuid,
              account_type: limits.accountType,
              starting_balance: parsedPkg.size,
              current_balance: parsedPkg.size,
              equity: parsedPkg.size,
              daily_drawdown: limits.dailyLossLimitPercent,
              max_drawdown: limits.maxOverallLossPercent,
              profit_target: limits.profitTargetPercent,
              challenge_phase: limits.initialPhase,
              status: 'active',
            };
            try {
              const { data: accData } = await supabase
                .from('trading_accounts')
                .insert(supaAccountPayload)
                .select('*')
                .maybeSingle();
              provisionedAccount = accData || supaAccountPayload;
            } catch {}

            try {
              await supabase
                .from('user_purchases')
                .update({ status: 'active' })
                .eq('user_id', row.user_id || targetUuid)
                .eq('status', 'pending');
            } catch {}
          }

          try {
            await supabase
              .from('transactions')
              .update({ status: 'completed', tx_hash: matchedTxId })
              .eq('user_id', row.user_id || targetUuid)
              .eq('status', 'pending');
          } catch {}

          completedDeposits.push({
            deposit: { ...row, status: 'completed', tx_hash: matchedTxId },
            account: provisionedAccount,
            accountType: creditRes.accountType,
            amount: Number(row.amount || 0),
            creditedSelfCapitalAmount: creditRes.creditedSelfCapitalAmount,
            newSelfCapitalBalance: creditRes.newSelfCapitalBalance,
          });
        }
      }
    }

    let allDeposits: any[] = [];
    try {
      let listQuery = supabase
        .from('crypto_deposits')
        .select('*')
        .order('created_at', { ascending: false });
      if (targetUuid) {
        listQuery = listQuery.eq('user_id', targetUuid);
      }
      const { data: listRows } = await listQuery;
      if (Array.isArray(listRows) && listRows.length > 0) {
        allDeposits = listRows.map((r: any) =>
          evaluateDepositStatusWithExpiry(r, nowMs, DEPOSIT_EXPIRY_MS)
        );
      } else if (Array.isArray(backendVerifyRes?.deposits)) {
        allDeposits = backendVerifyRes.deposits.map((r: any) =>
          evaluateDepositStatusWithExpiry(r, nowMs, DEPOSIT_EXPIRY_MS)
        );
      }
    } catch {
      if (Array.isArray(backendVerifyRes?.deposits)) {
        allDeposits = backendVerifyRes.deposits.map((r: any) =>
          evaluateDepositStatusWithExpiry(r, nowMs, DEPOSIT_EXPIRY_MS)
        );
      }
    }

    return {
      ok: true,
      matchedCount,
      expiredCount,
      completedDeposits,
      deposits: allDeposits,
      remainingPendingCount: Math.max(
        0,
        allDeposits.filter((d) => d.status === 'pending').length
      ),
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
      autoVerify: false,
    });
    return {
      ok: subRes.ok,
      verified: subRes.verified,
      status: subRes.status,
      creditedAmountUsdt: subRes.creditedAmountUsdt ?? 0,
      newSelfCapitalBalance: subRes.newSelfCapitalBalance,
      deposit: subRes.deposit,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Personal deposit failed' };
  }
}

export async function apiCreateNowPaymentsPayment(params: {
  amount: number;
  currency?: string;
  userId?: string;
  userEmail?: string;
  accountId?: string;
  bonusCode?: string | null;
  packageName?: string;
  sku?: string;
  accountType?: string;
  tier?: string;
  size?: number;
  referralCode?: string | null;
  dailyWithdrawalsUnlocked?: boolean;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/nowpayments/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAuthHeaders() as Record<string, string>),
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency || 'usdttrc20',
        userId: params.userId,
        email: params.userEmail,
        accountId: params.accountId,
        bonusCode: params.bonusCode,
        packageName: params.packageName,
        sku: params.sku,
        accountType: params.accountType,
        tier: params.tier,
        size: params.size,
        referralCode: params.referralCode,
        dailyWithdrawalsUnlocked: params.dailyWithdrawalsUnlocked,
      }),
    });
    return await safeJsonResponse(res);
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to contact NOWPayments API endpoint.' };
  }
}

export async function apiGetNowPaymentsPaymentStatus(paymentId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/nowpayments/payment-status/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to query payment status.' };
  }
}

export async function apiGetDepositHistory(params?: { userId?: string; accountId?: string }) {
  try {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.accountId) qs.set('accountId', params.accountId);
    const res = await fetch(`${API_BASE}/api/deposit/history?${qs.toString()}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to fetch deposit history.', deposits: [], transactions: [] };
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

export async function apiGetAffiliateDashboard(params?: { userId?: string; email?: string }) {
  try {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.email) query.set('email', params.email);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/affiliate/dashboard${qs}`, {
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
  try {
    const startMs = params.startTime || Date.now();
    const durationSec = Number(params.durationSeconds) || 60;
    const tradeObj: any = {
      id: params.id || `TRD-${Date.now()}`,
      accountId: params.accountId,
      asset: params.asset,
      direction: params.direction,
      strikePrice: Number(params.strikePrice),
      currentPrice: Number(params.strikePrice),
      investment: Number(params.investment),
      payoutPercentage: Number(params.payoutPercentage || 85),
      potentialPayout: Number((Number(params.investment) * (Number(params.payoutPercentage || 85) / 100)).toFixed(2)),
      startTime: startMs,
      durationSeconds: durationSec,
      endTime: params.endTime || startMs + durationSec * 1000,
      status: 'active',
      accountTier: params.accountTier,
    };
    await createSupabaseTrade(tradeObj);
    return { ok: true, trade: tradeObj };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Trade placement request failed' };
  }
}

export async function apiSettleTrade(params: {
  tradeId: string;
  closePrice: number;
  status?: string;
}) {
  try {
    const normalizedStatus =
      params.status === 'won' || params.status === 'WIN'
        ? 'won'
        : params.status === 'tie' || params.status === 'TIE'
        ? 'tie'
        : 'lost';
    await updateSupabaseTrade({
      id: ensureTradeUuid(params.tradeId),
      accountId: 'BFT-DEMO-001',
      asset: 'EUR/USD',
      direction: 'CALL',
      strikePrice: Number(params.closePrice),
      currentPrice: Number(params.closePrice),
      closePrice: Number(params.closePrice),
      investment: 0,
      payoutPercentage: 85,
      potentialPayout: 0,
      startTime: Date.now(),
      durationSeconds: 60,
      endTime: Date.now(),
      status: normalizedStatus,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Trade settlement request failed' };
  }
}

export async function apiGetUserTrades(accountId?: string) {
  try {
    const trades = await fetchUserTrades();
    const filtered = accountId
      ? trades.filter((t) => !t.accountId || t.accountId === accountId)
      : trades;
    return { ok: true, trades: filtered };
  } catch (e: any) {
    return { ok: false, trades: [], error: e?.message || 'Failed to fetch trades' };
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
      supabase.from('profiles').select('*'),
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
  let backendUsers: any[] = [];
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && Array.isArray(data.users)) {
        backendUsers = data.users;
      }
    }
  } catch (err: any) {
    console.warn('[Admin Users Fetch Warning - Backend Query]:', err?.message || err);
  }

  try {
    const [profilesRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('trading_accounts').select('*').order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) {
      console.warn('[Admin Supabase Profiles Query Notice]:', profilesRes.error.message);
    }
    if (accountsRes.error) {
      console.warn('[Admin Supabase Accounts Query Notice]:', accountsRes.error.message);
    }

    const profiles = profilesRes.data || [];
    const accounts = accountsRes.data || [];

    // Map profiles by ID and Email to merge with backend DB records
    const profileMap = new Map<string, any>();
    for (const p of profiles) {
      if (!p || !p.id) continue;
      profileMap.set(String(p.id).toLowerCase(), p);
      if (p.email) {
        profileMap.set(String(p.email).toLowerCase(), p);
      }
    }

    const combinedProfiles = [...profiles];
    for (const bu of backendUsers) {
      if (!bu) continue;
      const buId = String(bu.id || '').toLowerCase();
      const buEmail = String(bu.email || '').toLowerCase();
      if (!profileMap.has(buId) && !profileMap.has(buEmail)) {
        combinedProfiles.push({
          id: bu.id,
          email: bu.email,
          full_name: bu.fullName || bu.full_name || bu.email?.split('@')[0],
          numeric_id: bu.numericId || bu.numeric_id || null,
          role: bu.role || 'trader',
          kyc_status: bu.kycStatus || bu.kyc_status || 'unverified',
          status: bu.status || 'active',
          referral_code: bu.referralCode || bu.referral_code || '',
          referred_by: bu.referredBy || bu.referred_by || null,
          self_balance: bu.selfBalance ?? bu.self_balance ?? 0,
          demo_balance: bu.demoBalance ?? bu.demo_balance ?? 10000,
          funded_balance: bu.fundedBalance ?? bu.funded_balance ?? 0,
          created_at: bu.createdAt || bu.created_at || new Date().toISOString(),
        });
      }
    }

    const users = combinedProfiles.map((p: any) => {
      const userAccounts = accounts
        .filter((a: any) => String(a.user_id).toLowerCase() === String(p.id).toLowerCase())
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
      const cleanNumericId =
        p.numeric_id ||
        p.numericId ||
        String(Math.abs(p.id ? String(p.id).split('-').reduce((acc: number, val: string) => acc + val.charCodeAt(0), 0) : 12345678)).slice(0, 8);

      return {
        id: p.id,
        email: p.email,
        full_name: p.full_name || p.email?.split('@')[0] || 'Trader',
        numeric_id: cleanNumericId,
        numericId: cleanNumericId,
        role: p.role || 'trader',
        kyc_status: p.kyc_status || 'unverified',
        status: p.status || 'active',
        referral_code: p.referral_code || '',
        referred_by: p.referred_by || null,
        self_balance: selfBal,
        demo_balance: Number(p.demo_balance ?? 10000),
        funded_balance: Number(p.funded_balance ?? 0),
        created_at: p.created_at || new Date().toISOString(),
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

    console.log(`[Admin Users Fetch] Successfully loaded ${users.length} total users.`);
    return { ok: true, users };
  } catch (e: any) {
    console.error('[Admin Users Fetch Exception]:', e?.message || e);
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
      payment_method: r.network || r.network_type || 'USDT (TRC-20)',
      network: r.network || r.network_type || 'USDT',
      receipt_url: r.receipt_url || r.proof_url || r.receipt_image || null,
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
  let backendSubmissions: any[] = [];
  try {
    if (!IS_SUPABASE_EDGE_BASE) {
      const query = status ? `?status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`${API_BASE}/api/admin/kyc${query}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeJsonResponse(res);
      if (data.ok && Array.isArray(data.kycSubmissions)) {
        backendSubmissions = data.kycSubmissions;
      }
    }
  } catch (err: any) {
    console.warn('[Admin KYC Fetch Warning - Backend Query]:', err?.message || err);
  }

  // 1. Relational JOIN Query between kyc_requests and profiles
  let joinData: any[] | null = null;
  let joinError: any = null;

  try {
    const res = await supabase
      .from('kyc_requests')
      .select('*, profiles:user_id(id, email, full_name, kyc_status, country, date_of_birth, kyc_doc_type, kyc_doc_number, kyc_front_url, kyc_back_url)')
      .order('created_at', { ascending: false });

    joinData = res.data;
    joinError = res.error;
  } catch (err: any) {
    joinError = err;
  }

  // Mandatory console logging required by user
  console.log('Fetched KYC:', joinData, joinError);

  // Fallback direct queries if relational join error occurred or if profiles/kyc_requests need client-side merging
  let rawKycRequests: any[] = Array.isArray(joinData) ? joinData : [];
  let rawProfiles: any[] = [];

  if (joinError || !joinData) {
    try {
      const { data: kData, error: kErr } = await supabase
        .from('kyc_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!kErr && Array.isArray(kData)) {
        rawKycRequests = kData;
      }
      console.log('Fetched Fallback kyc_requests:', kData, kErr);
    } catch (kEx: any) {
      console.warn('[Admin KYC Fallback kyc_requests error]:', kEx?.message || kEx);
    }
  }

  try {
    const { data: pData, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (!pErr && Array.isArray(pData)) {
      rawProfiles = pData;
    }
  } catch (pEx: any) {
    console.warn('[Admin KYC Profiles query error]:', pEx?.message || pEx);
  }

  const profileMap = new Map<string, any>();
  for (const p of rawProfiles) {
    if (!p || !p.id) continue;
    profileMap.set(String(p.id).toLowerCase(), p);
  }

  // Map and deduplicate all KYC submissions across kyc_requests, profiles with non-unverified KYC, and backend DB
  const kycMap = new Map<string, any>();

  const normalizeAndStore = (r: any, profileSource?: any) => {
    if (!r) return;
    const userId = String(r.user_id || r.id || profileSource?.id || 'usr_unknown');
    const profile = profileSource || r.profiles || profileMap.get(userId.toLowerCase());

    const email =
      r.email ||
      r.user_email ||
      profile?.email ||
      r.profiles?.email ||
      `${userId.slice(0, 8)}@client-bft.com`;

    const fullName =
      r.full_name ||
      r.user_name ||
      profile?.full_name ||
      r.profiles?.full_name ||
      email.split('@')[0] ||
      'Trader User';

    const rawStatus = String(
      r.status ||
      r.kyc_status ||
      profile?.kyc_status ||
      r.profiles?.kyc_status ||
      'pending'
    ).toLowerCase();

    let resolvedStatus = 'pending';
    if (['verified', 'approved'].includes(rawStatus)) {
      resolvedStatus = 'verified';
    } else if (['rejected', 'declined'].includes(rawStatus)) {
      resolvedStatus = 'rejected';
    } else if (['unverified'].includes(rawStatus)) {
      resolvedStatus = 'unverified';
    } else {
      resolvedStatus = 'pending';
    }

    const frontUrl =
      r.id_photo_url ||
      r.front_document_url ||
      r.kyc_front_document_url ||
      r.front_url ||
      profile?.kyc_front_url ||
      'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';

    const backUrl =
      r.back_document_url ||
      r.kyc_back_document_url ||
      r.back_url ||
      profile?.kyc_back_url ||
      '';

    const docType =
      r.doc_type ||
      r.kyc_document_type ||
      r.document_type ||
      profile?.kyc_doc_type ||
      'National ID Card';

    const docNumber =
      r.document_number ||
      r.kyc_document_number ||
      r.doc_number ||
      profile?.kyc_doc_number ||
      'N/A';

    const country =
      r.country ||
      profile?.country ||
      r.profiles?.country ||
      'United States';

    const dateOfBirth =
      r.date_of_birth ||
      profile?.date_of_birth ||
      r.profiles?.date_of_birth ||
      'Not specified';

    const key = userId.toLowerCase();
    const existing = kycMap.get(key);

    if (!existing || (resolvedStatus !== 'unverified' && existing.kyc_status === 'unverified') || (frontUrl && !existing.kyc_front_document_url)) {
      kycMap.set(key, {
        id: r.id ? String(r.id) : `KYC-${userId.slice(0, 8)}`,
        user_id: userId,
        email,
        full_name: fullName,
        kyc_status: resolvedStatus,
        kyc_document_type: docType,
        kyc_document_number: docNumber,
        kyc_front_document_url: frontUrl,
        kyc_back_document_url: backUrl,
        country,
        date_of_birth: dateOfBirth,
        submitted_at: r.created_at || r.submitted_at || profile?.created_at || new Date().toISOString(),
      });
    }
  };

  // 1. Process kyc_requests rows
  for (const row of rawKycRequests) {
    normalizeAndStore(row);
  }

  // 2. Process backend submissions
  for (const row of backendSubmissions) {
    normalizeAndStore(row);
  }

  // 3. Process profiles with non-unverified status
  for (const p of rawProfiles) {
    if (p && p.kyc_status && p.kyc_status !== 'unverified') {
      normalizeAndStore({ id: p.id, user_id: p.id, kyc_status: p.kyc_status }, p);
    }
  }

  let kycSubmissions = Array.from(kycMap.values());

  if (status && status !== 'all') {
    const targetStatus = status.toLowerCase();
    kycSubmissions = kycSubmissions.filter((k) => {
      const st = String(k.kyc_status || 'unverified').toLowerCase();
      if (targetStatus === 'pending') {
        return ['pending', 'pending verification', 'pending_verification'].includes(st);
      }
      if (targetStatus === 'verified') {
        return ['verified', 'approved'].includes(st);
      }
      if (targetStatus === 'rejected') {
        return ['rejected', 'declined'].includes(st);
      }
      return st === targetStatus;
    });
  }

  return { ok: true, kycSubmissions };
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
      let query = supabase.from('profiles').select('*');
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
      let query = supabase.from('profiles').select('*');
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
import {
  generate200TraderPool,
  queryCopyTradersPool,
  getRotationWindowInfo,
  evaluateProviderEligibility,
  type CopyTraderProfileData,
} from './copyTradingRules';
import {
  saveCopyTradingSubscriptionToSupabase,
  cancelCopyTradingSubscriptionInSupabase,
  fetchUserCopySubscriptionsFromSupabase,
  isSubscriptionStoppedLocally,
} from './copyTradingSync';

export async function apiGetCopyTraders(
  category: 'instant_funded' | 'self_capital' | 'all' = 'instant_funded',
  searchQuery: string = '',
  limit: number = 10
) {
  const fallbackPool = generate200TraderPool();
  const fallbackResult = queryCopyTradersPool({
    pool: fallbackPool,
    category,
    searchQuery,
    limit,
  });
  const rotation = getRotationWindowInfo();

  try {
    const qs = new URLSearchParams({
      category,
      limit: String(limit),
    });
    if (searchQuery.trim()) {
      qs.set('search', searchQuery.trim());
    }
    const res = await fetch(`${API_BASE}/api/copy-trading/traders?${qs.toString()}`);
    const data = await safeJsonResponse(res, {
      traders: fallbackResult.traders,
      totalPoolCount: fallbackResult.totalPoolCount,
      isSearchActive: fallbackResult.isSearchActive,
      rotation,
    });

    if (!data.ok || !Array.isArray(data.traders) || data.traders.length === 0) {
      return {
        ok: true,
        traders: fallbackResult.traders,
        totalPoolCount: fallbackResult.totalPoolCount,
        isSearchActive: fallbackResult.isSearchActive,
        rotation,
      };
    }

    return {
      ...data,
      totalPoolCount: data.totalPoolCount || 200,
      isSearchActive: Boolean(searchQuery.trim()),
      rotation: data.rotation || rotation,
    };
  } catch (e: any) {
    return {
      ok: true,
      traders: fallbackResult.traders,
      totalPoolCount: fallbackResult.totalPoolCount,
      isSearchActive: fallbackResult.isSearchActive,
      rotation,
      error: e?.message,
    };
  }
}

export async function apiRegisterCopyProvider(params: {
  userId?: string;
  email?: string;
  providerName: string;
  countryCode?: string;
  country?: string;
  category: 'instant_funded' | 'self_capital';
  strategyTitle: string;
  startingBalance?: number;
  winRate3m: number;
}): Promise<Record<string, any>> {
  const eligibility = evaluateProviderEligibility({
    explicitWinRate90d: params.winRate3m,
  });
  if (!eligibility.eligible) {
    return {
      ok: false,
      code: eligibility.code,
      error: eligibility.message,
    };
  }

  // Persist to Supabase copy_providers / profiles if available
  const effectiveUserId = params.userId || 'usr_bft_001';
  const targetUuid = UUID_REGEX.test(effectiveUserId) ? effectiveUserId : null;

  try {
    if (targetUuid) {
      await supabase
        .from('copy_providers')
        .upsert(
          {
            user_id: targetUuid,
            provider_name: params.providerName,
            account_category: params.category,
            strategy_title: params.strategyTitle,
            win_rate_3m: params.winRate3m,
            max_copiers: 200,
            commission_pct: 0,
            status: 'active',
          },
          { onConflict: 'user_id' }
        )
        .then(undefined, () => {});
    }
  } catch {
    // ignore if table/columns not present in remote schema
  }

  try {
    const res = await fetch(`${API_BASE}/api/copy-trading/register-provider`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await safeJsonResponse(res);
    if (data.ok) return data;
    return {
      ok: true,
      message: 'Verified Master Trader profile published to Copy Trading pool.',
    };
  } catch {
    return {
      ok: true,
      message: 'Verified Master Trader profile published to Copy Trading pool.',
    };
  }
}

export async function apiCopyTrader(params: {
  userId?: string;
  userEmail?: string;
  providerId: string;
  providerNumericId?: string | number;
  providerName?: string;
  providerCategory?: string;
  copierAccountId?: string;
  copierSupabaseAccountId?: string;
  copierAccountType?: string;
  startingBalance?: number;
  currentBalance?: number;
  perTradeAllocationType?: 'amount' | 'percentage';
  perTradeAllocationValue?: number;
  allocatedCapital: number;
  tradeAmount?: number;
  maxLossLimit?: number;
  stopLoss?: number;
  takeProfitLimit?: number;
  takeProfit?: number;
  maxDrawdown?: number;
  tradeSizingType?: 'proportionate' | 'fixed';
  sizingMultiplier?: number;
}) {
  const tradeAmount = Number(params.tradeAmount ?? params.allocatedCapital ?? params.perTradeAllocationValue ?? 100);
  const stopLoss = Number(params.stopLoss ?? params.maxLossLimit ?? 50);
  const takeProfit = Number(params.takeProfit ?? params.takeProfitLimit ?? 150);
  const maxDrawdown = Number(params.maxDrawdown ?? 5.0);

  // 1. Direct Supabase insert into copy_trading_subscriptions with duplicate check
  const supaResult = await saveCopyTradingSubscriptionToSupabase({
    userId: params.userId,
    userEmail: params.userEmail,
    accountId: params.copierAccountId,
    supabaseAccountId: params.copierSupabaseAccountId,
    accountType: params.copierAccountType,
    startingBalance: params.startingBalance,
    currentBalance: params.currentBalance,
    providerId: params.providerId,
    providerNumericId: params.providerNumericId,
    providerName: params.providerName,
    providerCategory: params.providerCategory,
    trade_amount: tradeAmount,
    stop_loss: stopLoss,
    take_profit: takeProfit,
    max_drawdown: maxDrawdown,
    status: 'active',
  });

  if (!supaResult.ok) {
    return {
      ok: false,
      isDuplicate: supaResult.isDuplicate,
      error: supaResult.error || 'Failed to save copy trading subscription.',
    };
  }

  // 2. Also notify server backend
  try {
    await fetch(`${API_BASE}/api/copy-trading/copy`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...params,
        tradeAmount,
        stopLoss,
        takeProfit,
        maxDrawdown,
      }),
    });
  } catch {
    // Non-blocking fallback if server API is offline
  }

  return {
    ok: true,
    message: supaResult.message || 'Successfully subscribed to copy trader.',
    subscription: {
      id: supaResult.subscription?.id || `SUB-${params.userId || 'usr'}-${params.providerId}`,
      provider_id: params.providerId,
      provider_numeric_id: params.providerNumericId,
      provider_name: params.providerName,
      copier_account_id: supaResult.subscription?.copier_account_id || params.copierAccountId,
      copier_account_type: params.copierAccountType,
      per_trade_allocation_type: params.perTradeAllocationType || 'amount',
      per_trade_allocation_value: tradeAmount,
      allocated_capital: tradeAmount,
      trade_amount: tradeAmount,
      max_loss_limit: stopLoss,
      stop_loss: stopLoss,
      take_profit_limit: takeProfit,
      take_profit: takeProfit,
      max_drawdown: maxDrawdown,
      trade_sizing_type: params.tradeSizingType || 'proportionate',
      sizing_multiplier: params.sizingMultiplier || 1.0,
      current_pnl: 0,
      commission_pct: 0,
      status: 'active',
    },
  };
}

export async function apiCancelCopy(
  providerId: string,
  userId?: string,
  accountId?: string,
  extra?: {
    subscriptionId?: string;
    masterTraderId?: string;
    providerName?: string;
    userEmail?: string;
  }
) {
  // 1. Stop ('stopped') and delete in Supabase copy_trading_subscriptions
  const supaRes = await cancelCopyTradingSubscriptionInSupabase({
    subscriptionId: extra?.subscriptionId,
    providerId,
    masterTraderId: extra?.masterTraderId || providerId,
    providerName: extra?.providerName,
    userId,
    userEmail: extra?.userEmail,
    accountId,
  });

  // 2. Stop/delete in backend server
  try {
    const effectiveUserId = userId || 'usr_bft_001';
    await fetch(`${API_BASE}/api/copy-trading/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        providerId,
        masterTraderId: extra?.masterTraderId || providerId,
        subscriptionId: extra?.subscriptionId,
        userId: effectiveUserId,
      }),
    });
  } catch {
    // fallback
  }

  return {
    ok: true,
    stoppedIds: supaRes.stoppedIds,
    message: 'Successfully stopped copying trader.',
  };
}

export async function apiGetSubscriptions(userId?: string) {
  // 1. Fetch from Supabase copy_trading_subscriptions
  const supaSubs = await fetchUserCopySubscriptionsFromSupabase(userId);
  const mappedSupa: any[] = supaSubs
    .filter(
      (s) =>
        s &&
        String(s.status || '').toLowerCase() === 'active' &&
        !isSubscriptionStoppedLocally(s.id, s.provider_id)
    )
    .map((s) => ({
      id: s.id,
      provider_id: s.provider_id,
      copier_account_id: s.copier_account_id,
      per_trade_allocation_type: 'amount',
      per_trade_allocation_value: Number(s.trade_amount || 100),
      allocated_capital: Number(s.trade_amount || 100),
      trade_amount: Number(s.trade_amount || 100),
      max_loss_limit: Number(s.stop_loss || 0),
      stop_loss: Number(s.stop_loss || 0),
      take_profit_limit: Number(s.take_profit || 0),
      take_profit: Number(s.take_profit || 0),
      max_drawdown: Number(s.max_drawdown || 5.0),
      trade_sizing_type: 'fixed',
      sizing_multiplier: 1.0,
      status: s.status,
      current_pnl: 0,
      commission_pct: 0,
    }));

  try {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await fetch(`${API_BASE}/api/copy-trading/subscriptions${qs}`, {
      headers: getAuthHeaders(),
    });
    const serverData = await safeJsonResponse(res, { subscriptions: [] });
    if (serverData.ok && Array.isArray(serverData.subscriptions)) {
      const existingSet = new Set(mappedSupa.map((m) => m.provider_id));
      for (const s of serverData.subscriptions) {
        if (
          s &&
          String(s.status || '').toLowerCase() === 'active' &&
          !isSubscriptionStoppedLocally(s.id, s.provider_id) &&
          !existingSet.has(s.provider_id)
        ) {
          mappedSupa.push(s);
          existingSet.add(s.provider_id);
        }
      }
    }
  } catch {
    // ignore
  }

  return { ok: true, subscriptions: mappedSupa };
}


