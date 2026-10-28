/**
 * Binary Funded Trader (BFT) - Unified Full-Stack API Client
 * Connects frontend React components directly to live SQLite database endpoints
 * with JWT bearer authentication and cookie session persistence.
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

export async function apiGetGoogleOAuthUrl(referralCode?: string | null) {
  const query = referralCode ? `?referralCode=${encodeURIComponent(referralCode)}` : '';
  const res = await fetch(`/api/auth/google/url${query}`);
  return res.json();
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
  const res = await fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function apiGetMe() {
  const res = await fetch('/api/auth/me', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return { ok: false, error: 'Unauthenticated' };
  return res.json();
}

export async function apiLogout() {
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
  return res.json();
}

export async function apiLockProfile(data: {
  fullName: string;
  address: string;
  dateOfBirth: string;
  country?: string;
  telegramHandle?: string;
}) {
  const res = await fetch('/api/profile/lock', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiUpdateProfile(data: {
  fullName?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
  telegramHandle?: string;
  avatarUrl?: string;
}) {
  const res = await fetch('/api/profile/update', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return res.json();
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
  const res = await fetch('/api/kyc/submit', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function apiSubmitWithdrawal(params: {
  accountId: string;
  amount: number;
  walletAddress: string;
  network: string;
  paymentMethod: string;
}) {
  const res = await fetch('/api/withdrawals', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function apiGetWithdrawals() {
  const res = await fetch('/api/withdrawals', {
    headers: getAuthHeaders(),
  });
  return res.json();
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
  const res = await fetch('/api/accounts/purchase', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function apiPassChallenge(params: {
  accountId: string;
  provisionLiveDirectly?: boolean;
}) {
  const res = await fetch('/api/accounts/pass-challenge', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
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
  const res = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function apiGetAffiliateDashboard() {
  const res = await fetch('/api/affiliate/dashboard', {
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function apiGetLeaderboard() {
  const res = await fetch('/api/leaderboard');
  return res.json();
}

