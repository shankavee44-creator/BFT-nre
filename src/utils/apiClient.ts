/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live backend endpoints
 * with safe JSON parsing and JWT bearer authentication.
 */

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

async function safeJsonResponse(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return { ok: false, error: 'Server returned invalid JSON response.' };
    }
  }
  const text = await res.text();
  return {
    ok: false,
    error: res.ok
      ? 'Server returned HTML instead of JSON.'
      : `Server returned error (${res.status}): ${res.statusText || 'Request failed'}`,
  };
}

export async function apiEmailSessionSync(params: {
  email: string;
  name: string;
  userId?: string;
  referralCode?: string | null;
  rememberMe?: boolean;
}) {
  try {
    const res = await fetch('/api/auth/session', {
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
    const res = await fetch(`/api/auth/me${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unauthenticated' };
  }
}

export async function apiLogout() {
  try {
    const res = await fetch('/api/auth/logout', {
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
    const res = await fetch('/api/profile/lock', {
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
    const res = await fetch('/api/profile/update', {
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
    const res = await fetch('/api/kyc/submit', {
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
    const res = await fetch(`/api/kyc/status${qs}`, {
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
    const res = await fetch('/api/withdrawals', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Withdrawal submission failed' };
  }
}

export async function apiGetWithdrawals() {
  if (!hasJwtSession()) return { ok: false, withdrawals: [] };
  try {
    const res = await fetch('/api/withdrawals', {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch withdrawals' };
  }
}

export async function apiPurchaseAccount(params: {
  tier: string;
  tierName: string;
  size: number;
  price: number;
  invoiceUuid: string;
  referralCode?: string | null;
  dailyWithdrawalsUnlocked?: boolean;
}) {
  try {
    const res = await fetch('/api/accounts/purchase', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Account purchase failed' };
  }
}

export async function apiDepositPersonalAccount(params: {
  amount: number;
  accountId?: string;
  invoiceUuid?: string;
}) {
  try {
    const res = await fetch('/api/accounts/deposit-personal', {
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
    const res = await fetch('/api/accounts/pass-challenge', {
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
    const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
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
    const res = await fetch('/api/affiliate/dashboard', {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch affiliate metrics' };
  }
}

export async function apiGetLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch leaderboard' };
  }
}

export async function apiGetLiveMarketPrices() {
  try {
    const res = await fetch('/api/market/live-prices');
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
    const res = await fetch('/api/trades', {
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
    const res = await fetch('/api/trades/settle', {
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
    const res = await fetch(`/api/trades${qs}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch trades' };
  }
}

export async function apiCheckAdminAccess() {
  try {
    const res = await fetch('/api/admin/check-access', {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, isAdmin: false, error: e?.message || 'Failed to verify admin status' };
  }
}

export async function apiVerifyAdminKey(adminKey: string) {
  try {
    const res = await fetch('/api/admin/auth/verify-key', {
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
    const res = await fetch('/api/admin/metrics', {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch admin metrics' };
  }
}

export async function apiGetAdminUsers() {
  try {
    const res = await fetch('/api/admin/users', {
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
    const res = await fetch(`/api/admin/users/${encodeURIComponent(params.userId)}/accounts/${encodeURIComponent(params.accountId)}/balance`, {
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
    const res = await fetch(`/api/admin/users/${encodeURIComponent(params.userId)}/role`, {
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
    const res = await fetch(`/api/admin/deposits${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch deposits' };
  }
}

export async function apiAdminApproveDeposit(depositId: string) {
  try {
    const res = await fetch(`/api/admin/deposits/${encodeURIComponent(depositId)}/approve`, {
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
    const res = await fetch(`/api/admin/deposits/${encodeURIComponent(depositId)}/decline`, {
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
    const res = await fetch('/api/admin/deposits/create', {
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
    const res = await fetch(`/api/admin/withdrawals${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch withdrawals' };
  }
}

export async function apiAdminApproveWithdrawal(withdrawalId: string) {
  try {
    const res = await fetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/approve`, {
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
    const res = await fetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/decline`, {
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
    const res = await fetch(`/api/admin/kyc${query}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch KYC submissions' };
  }
}

export async function apiAdminApproveKyc(userId: string) {
  try {
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(userId)}/approve`, {
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
    const res = await fetch(`/api/admin/kyc/${encodeURIComponent(userId)}/reject`, {
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
    const res = await fetch('/api/admin/referrals/tree', {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch referral tree' };
  }
}

export async function apiGetAdminCommissions(limit: number = 100) {
  try {
    const res = await fetch(`/api/admin/referrals/commissions?limit=${limit}`, {
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
    const res = await fetch('/api/admin/referrals/distribute-commission', {
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
    const res = await fetch(`/api/admin/audit-logs?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to fetch audit logs' };
  }
}

