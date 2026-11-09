export interface SupabaseUserLike {
  id: string;
  email?: string;
  role?: string;
  app_metadata?: {
    role?: string;
    is_admin?: boolean;
  };
  user_metadata?: {
    full_name?: string;
    name?: string;
    referral_code?: string;
    avatar_url?: string;
    picture?: string;
    kyc_status?: string;
    profile_locked?: boolean;
    address?: string;
    date_of_birth?: string;
    country?: string;
    role?: string;
    is_admin?: boolean;
    two_factor_enabled?: boolean;
    is_2fa_enabled?: boolean;
    totp_secret?: string;
    numeric_id?: string | number;
    status?: string;
  };
}

export interface ProfileRecordLike {
  id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  status?: string;
  numeric_id?: string | number;
  is_admin?: boolean;
  referral_code?: string;
  referred_by?: string | null;
  kyc_status?: string;
  profile_locked?: boolean;
  two_factor_enabled?: boolean | number;
  is_2fa_enabled?: boolean | number;
  totp_secret?: string | null;
  address?: string;
  date_of_birth?: string;
  country?: string;
  balance?: number;
  self_capital_balance?: number;
  self_balance?: number;
  demo_balance?: number;
  funded_balance?: number;
}

export const AUTHORIZED_ADMIN_EMAILS = [
  'shankavee44@gmail.com',
  'admin@bft.io',
  'viktor.v@quant-prop.io',
  'superadmin@bft.io',
];

export const VALID_ADMIN_SECURITY_KEYS = [
  'bft_admin_master_key_2026',
  'BFT-ADMIN-2026',
  'admin123',
];

/**
 * Pure helper: Checks whether Two-Factor Authentication (2FA) is enabled for a user
 * by inspecting both `two_factor_enabled` and `is_2fa_enabled` on the `profiles` row
 * as well as Supabase Auth `user_metadata`.
 */
export function isTwoFactorEnabledOnProfile(
  profileRow?: ProfileRecordLike | Record<string, any> | null,
  authUser?: SupabaseUserLike | Record<string, any> | null
): boolean {
  if (profileRow && typeof profileRow === 'object') {
    if (
      profileRow.two_factor_enabled === true ||
      profileRow.two_factor_enabled === 1 ||
      profileRow.is_2fa_enabled === true ||
      profileRow.is_2fa_enabled === 1
    ) {
      return true;
    }
  }

  const meta = authUser?.user_metadata;
  if (meta && typeof meta === 'object') {
    if (
      meta.two_factor_enabled === true ||
      meta.two_factor_enabled === 1 ||
      meta.is_2fa_enabled === true ||
      meta.is_2fa_enabled === 1
    ) {
      return true;
    }
  }

  if (profileRow && typeof profileRow === 'object') {
    if (
      profileRow.two_factor_enabled === false ||
      profileRow.two_factor_enabled === 0 ||
      profileRow.is_2fa_enabled === false ||
      profileRow.is_2fa_enabled === 0
    ) {
      return false;
    }
    if (typeof profileRow.totp_secret === 'string' && profileRow.totp_secret.trim().length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Pure helper: Verifies whether a user or key challenge is authorized to access the BFT Admin Panel
 * by checking Admin Master Keys, Supabase user_metadata / app_metadata, profile role, and admin email list.
 */
export function verifyAdminAuthorization(params: {
  adminKey?: string | null;
  profileRow?: ProfileRecordLike | Record<string, any> | null;
  authUser?: SupabaseUserLike | Record<string, any> | null;
  currentUser?: Record<string, any> | null;
  envAdminKey?: string | null;
}): { isAdmin: boolean; matchedBy: string | null } {
  const cleanKey = String(params.adminKey || '').trim();
  if (cleanKey) {
    if (
      VALID_ADMIN_SECURITY_KEYS.includes(cleanKey) ||
      (params.envAdminKey && cleanKey === String(params.envAdminKey).trim())
    ) {
      return { isAdmin: true, matchedBy: 'admin_key' };
    }
  }

  const profileRole = String(params.profileRow?.role || '').trim().toLowerCase();
  if (profileRole === 'admin' || profileRole === 'superadmin' || params.profileRow?.is_admin === true) {
    return { isAdmin: true, matchedBy: 'profile_role' };
  }

  const userMetaRole = String(params.authUser?.user_metadata?.role || '').trim().toLowerCase();
  const appMetaRole = String(params.authUser?.app_metadata?.role || '').trim().toLowerCase();
  const directRole = String(params.authUser?.role || '').trim().toLowerCase();
  if (
    userMetaRole === 'admin' ||
    userMetaRole === 'superadmin' ||
    appMetaRole === 'admin' ||
    appMetaRole === 'superadmin' ||
    directRole === 'admin' ||
    params.authUser?.user_metadata?.is_admin === true ||
    params.authUser?.app_metadata?.is_admin === true
  ) {
    return { isAdmin: true, matchedBy: 'supabase_metadata' };
  }

  const currentUserRole = String(params.currentUser?.role || '').trim().toLowerCase();
  if (currentUserRole === 'admin' || currentUserRole === 'superadmin' || params.currentUser?.isAdmin === true) {
    return { isAdmin: true, matchedBy: 'current_user_role' };
  }

  const candidateEmails = [
    params.profileRow?.email,
    params.authUser?.email,
    params.currentUser?.email,
  ]
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);

  for (const em of candidateEmails) {
    if (AUTHORIZED_ADMIN_EMAILS.includes(em)) {
      return { isAdmin: true, matchedBy: 'admin_email' };
    }
  }

  return { isAdmin: false, matchedBy: null };
}

export function sanitizeOtpEmail(rawEmail: string): string {
  return String(rawEmail || '').trim().toLowerCase();
}

export function isValidEmailForOtp(rawEmail: string): boolean {
  const clean = sanitizeOtpEmail(rawEmail);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
}

export function sanitizeOtpCode(rawCode: string): string {
  return String(rawCode || '').replace(/\D/g, '').slice(0, 6);
}

export function isValidSixDigitOtp(rawCode: string): boolean {
  const clean = sanitizeOtpCode(rawCode);
  return /^\d{6}$/.test(clean);
}

export function generateSixDigitOtp(seedNumber?: number): string {
  if (typeof seedNumber === 'number' && Number.isFinite(seedNumber)) {
    const normalized = Math.abs(Math.floor(seedNumber)) % 900000;
    return String(100000 + normalized);
  }
  const randomVal = Math.floor(100000 + Math.random() * 900000);
  return String(randomVal);
}

export function buildOAuthCallbackUrl(origin: string): string {
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  if (!cleanOrigin) return '/auth/callback';
  return `${cleanOrigin}/auth/callback`;
}

export function resolveOrBuildUserProfile(
  user: SupabaseUserLike,
  existingProfile?: ProfileRecordLike | null,
  sponsorReferralCode?: string | null
): {
  needsUpsert: boolean;
  upsertPayload: Record<string, any>;
  resolvedProfile: {
    id: string;
    email: string;
    fullName: string;
    numericId?: string;
    numeric_id?: string;
    referralCode: string;
    referredBy: string | null;
    kycStatus: 'unverified' | 'pending' | 'verified';
    profileLocked: boolean;
    twoFactorEnabled: boolean;
    address: string;
    dateOfBirth: string;
    country: string;
    balance: number;
    selfBalance?: number;
    demoBalance?: number;
    fundedBalance?: number;
  };
} {
  const cleanEmail = sanitizeOtpEmail(user.email || existingProfile?.email || '');
  const fallbackNameFromEmail = cleanEmail
    ? cleanEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
    : 'BFT Trader';

  const resolvedFullName =
    existingProfile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    fallbackNameFromEmail;

  const defaultReferralCode =
    existingProfile?.referral_code ||
    user.user_metadata?.referral_code ||
    `BFT-${String(user.id || 'PRO')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase()}`;

  const rawKyc =
    existingProfile?.kyc_status || user.user_metadata?.kyc_status || 'unverified';
  const kycStatus: 'unverified' | 'pending' | 'verified' =
    rawKyc === 'verified' || rawKyc === 'approved'
      ? 'verified'
      : rawKyc === 'pending' || rawKyc === 'Pending Verification'
      ? 'pending'
      : 'unverified';

  const profileLocked = Boolean(
    existingProfile?.profile_locked ??
      user.user_metadata?.profile_locked ??
      (kycStatus === 'verified' || kycStatus === 'pending')
  );

  const twoFactorEnabled = isTwoFactorEnabledOnProfile(existingProfile, user);
  const rawSelfCap =
    existingProfile?.self_capital_balance !== undefined && existingProfile?.self_capital_balance !== null
      ? Number(existingProfile.self_capital_balance)
      : existingProfile?.self_balance !== undefined && existingProfile?.self_balance !== null
      ? Number(existingProfile.self_balance)
      : undefined;

  const resolvedNumericId = String(
    existingProfile?.numeric_id ||
      user.user_metadata?.numeric_id ||
      Math.floor(10000000 + Math.random() * 90000000)
  );

  const resolvedRole = existingProfile?.role || user.user_metadata?.role || 'trader';
  const resolvedStatus = existingProfile?.status || 'active';

  const needsUpsert = !existingProfile || !existingProfile.id;

  return {
    needsUpsert,
    upsertPayload: {
      id: user.id,
      email: cleanEmail,
      full_name: resolvedFullName,
      numeric_id: resolvedNumericId,
      referral_code: defaultReferralCode,
      referred_by: existingProfile?.referred_by || sponsorReferralCode || null,
      kyc_status: kycStatus,
      role: resolvedRole,
      status: resolvedStatus,
      self_balance: existingProfile?.self_balance ?? 0.00,
      self_capital_balance: existingProfile?.self_capital_balance ?? 0.00,
      demo_balance: existingProfile?.demo_balance ?? 10000.00,
      funded_balance: existingProfile?.funded_balance ?? 0.00,
    },
    resolvedProfile: {
      id: user.id,
      email: cleanEmail,
      fullName: resolvedFullName,
      numericId: resolvedNumericId,
      numeric_id: resolvedNumericId,
      referralCode: defaultReferralCode,
      referredBy: existingProfile?.referred_by || sponsorReferralCode || null,
      kycStatus,
      profileLocked,
      twoFactorEnabled,
      address: existingProfile?.address || user.user_metadata?.address || '',
      dateOfBirth: existingProfile?.date_of_birth || user.user_metadata?.date_of_birth || '',
      country: existingProfile?.country || user.user_metadata?.country || 'United States',
      balance: Number(existingProfile?.balance || 0),
      selfBalance: rawSelfCap,
      demoBalance:
        existingProfile?.demo_balance !== undefined && existingProfile?.demo_balance !== null
          ? Number(existingProfile.demo_balance)
          : undefined,
      fundedBalance:
        existingProfile?.funded_balance !== undefined && existingProfile?.funded_balance !== null
          ? Number(existingProfile.funded_balance)
          : undefined,
    },
  };
}

