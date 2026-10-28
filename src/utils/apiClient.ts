/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live backend endpoints
 * with safe JSON parsing and JWT bearer authentication.
 */

const getAuthHeaders = (): HeadersInit => {
  let token = '';
  try {
    token = localStorage.getItem('bft_jwt_session') || sessionStorage.getItem('bft_jwt_session') || '';
  } catch {
    // storage not available
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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

export async function apiGetGoogleOAuthUrl(referralCode?: string | null) {
  try {
    const query = referralCode ? `?referralCode=${encodeURIComponent(referralCode)}` : '';
    const res = await fetch(`/api/auth/google/url${query}`);
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unable to fetch Google OAuth URL' };
  }
}

export async function apiGoogleSignIn(params: {
  email: string;
  name: string;
  avatarUrl?: string;
  googleId?: string;
  credential?: string;
  referralCode?: string | null;
  rememberMe?: boolean;
}) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await safeJsonResponse(res);
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Google Sign-In request failed' };
  }
}

export async function apiGetMe() {
  try {
    const res = await fetch('/api/auth/me', {
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
  docType: string;
  documentNumber?: string;
  fullName?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
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
