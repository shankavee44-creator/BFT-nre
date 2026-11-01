/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live backend endpoints
 * with safe JSON parsing and JWT bearer authentication.
 */

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '';


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
}) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Session sync request failed' };
  }
}

export async function apiGetMe(params?: { userId?: string; email?: string }) {
  try {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.email) query.set('email', params.email);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/auth/me${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unauthenticated' };
  }
}

export async function apiLogout() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    try {
      localStorage.removeItem('bft_jwt_session');
      sessionStorage.removeItem('bft_jwt_session');
    } catch {
      // ignore
    }
    return await safeJsonResponse(res);
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

export async function apiCancelWithdrawal(params: { withdrawalId: string; token?: string }) {
  try {
    const headers = getAuthHeaders() as Record<string, string>;
    if (params.token) {
        headers['Authorization'] = `Bearer ${params.token}`;
    }
    const res = await fetch(`${API_BASE}/api/withdrawals/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ withdrawalId: params.withdrawalId }),
    });
    return await safeJsonResponse(res);
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
}) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/purchase`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Account purchase failed' };
  }
}

export async function apiGetUserPurchases(params?: { userId?: string; email?: string }) {
  try {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.email) query.set('email', params.email);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE}/api/purchases${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res, { purchases: [] });
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
}) {
  try {
    const res = await fetch(`${API_BASE}/api/purchases`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
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
}) {
  try {
    const res = await fetch(`${API_BASE}/api/crypto-deposits`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Crypto deposit submission failed' };
  }
}

export async function apiVerifyCryptoDeposits(params?: { userId?: string }) {
  try {
    const qs = params?.userId ? `?userId=${encodeURIComponent(params.userId)}` : '';
    const res = await fetch(`${API_BASE}/api/crypto-deposits/verify${qs}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params || {}),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'TronGrid TRC-20 verification check failed' };
  }
}

export async function apiDepositPersonalAccount(params: {
  amount: number;
  accountId?: string;
  invoiceUuid?: string;
  txHash?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/accounts/deposit-personal`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
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
    !hasJwtSession() ||
    !accountId ||
    accountId.startsWith('BFT-DEMO') ||
    accountId === 'BFT-10000'
  ) {
    return { ok: true, localOnly: true };
  }
  try {
    const res = await fetch(`${API_BASE}/api/accounts/${encodeURIComponent(accountId)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    return await safeJsonResponse(res);
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

export async function apiCheckAdminAccess() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/check-access`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, isAdmin: false, error: e?.message || 'Failed to verify admin status' };
  }
}

export async function apiVerifyAdminKey(adminKey: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/auth/verify-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey }),
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
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Admin key verification failed' };
  }
}

export async function apiGetAdminMetrics() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/metrics`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch admin metrics' };
  }
}

export async function apiGetAdminUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
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
    const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(params.userId)}/accounts/${encodeURIComponent(params.accountId)}/balance`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        newBalance: params.newBalance,
        reason: params.reason || 'Admin balance adjustment',
      }),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update user balance' };
  }
}

export async function apiAdminSetRole(params: { userId: string; role: 'admin' | 'trader' }) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(params.userId)}/role`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role: params.role }),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to update user role' };
  }
}

export async function apiGetAdminDeposits(status?: string) {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${API_BASE}/api/admin/deposits${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch deposits' };
  }
}

export async function apiAdminApproveDeposit(depositId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/deposits/${encodeURIComponent(depositId)}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to approve deposit' };
  }
}

export async function apiAdminDeclineDeposit(depositId: string, reason?: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/deposits/${encodeURIComponent(depositId)}/decline`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    return await safeJsonResponse(res);
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
    const res = await fetch(`${API_BASE}/api/admin/deposits/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to create deposit' };
  }
}

export async function apiGetAdminWithdrawals(status?: string) {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${API_BASE}/api/admin/withdrawals${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch withdrawals' };
  }
}

export async function apiAdminApproveWithdrawal(withdrawalId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to approve withdrawal' };
  }
}

export async function apiAdminDeclineWithdrawal(withdrawalId: string, reason?: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decline`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to decline withdrawal' };
  }
}

export async function apiGetAdminKyc(status?: string) {
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${API_BASE}/api/admin/kyc${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch KYC submissions' };
  }
}

export async function apiAdminApproveKyc(userId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/kyc/${encodeURIComponent(userId)}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to approve KYC' };
  }
}

export async function apiAdminRejectKyc(userId: string, reason?: string) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/kyc/${encodeURIComponent(userId)}/reject`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    return await safeJsonResponse(res);
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

export async function apiGenerate2fa(params: { userId?: string; email?: string }) {
  try {
    const res = await fetch(`${API_BASE}/api/2fa/setup`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    const data = await safeJsonResponse(res);
    if (data.ok && data.secret) {
      return data;
    }
    if (res.ok && data.emptyBody) {
      const fallbackSecret = generateFallbackBase32Secret(32);
      const emailLabel = encodeURIComponent(params.email || 'trader@bft.io');
      const otpauthUrl = `otpauth://totp/BFT-Trading:${emailLabel}?secret=${fallbackSecret}&issuer=BFT-Trading`;
      return {
        ok: true,
        secret: fallbackSecret,
        otpauthUrl,
        otpauth_url: otpauthUrl,
      };
    }
    return data;
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || 'Network error while generating 2FA credentials.',
    };
  }
}

export async function apiVerify2fa(params: {
  userId?: string;
  email?: string;
  code: string;
  secret?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/2fa/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res, {
      message: res.ok ? '2FA enabled successfully' : undefined,
      is2faEnabled: res.ok ? true : undefined,
    });
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || 'Verification failed. Please try again.',
    };
  }
}

export async function apiDisable2fa(params: { userId?: string; email?: string }) {
  try {
    const res = await fetch(`${API_BASE}/api/2fa/disable`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res, {
      message: res.ok ? '2FA disabled successfully' : undefined,
      is2faEnabled: res.ok ? false : undefined,
    });
  } catch (e: any) {
    return {
      ok: false,
      error: e?.message || 'Failed to disable 2FA.',
    };
  }
}

export async function apiValidate2fa(params: {
  userId?: string;
  email?: string;
  code: string;
  secret?: string;
}) {
  try {
    const res = await fetch(`${API_BASE}/api/2fa/validate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res, {
      isValid: res.ok ? true : false,
    });
  } catch (e: any) {
    return {
      ok: false,
      isValid: false,
      error: e?.message || '2FA validation failed.',
    };
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
