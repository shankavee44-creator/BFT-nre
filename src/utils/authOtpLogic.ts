export interface SupabaseUserLike {
  id: string;
  email?: string;
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
  };
}

export interface ProfileRecordLike {
  id?: string;
  email?: string;
  full_name?: string;
  referral_code?: string;
  referred_by?: string | null;
  kyc_status?: string;
  profile_locked?: boolean;
  address?: string;
  date_of_birth?: string;
  country?: string;
  balance?: number;
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
  upsertPayload: {
    id: string;
    email: string;
    full_name: string;
    referral_code: string;
    kyc_status: string;
  };
  resolvedProfile: {
    id: string;
    email: string;
    fullName: string;
    referralCode: string;
    referredBy: string | null;
    kycStatus: 'unverified' | 'pending' | 'verified';
    profileLocked: boolean;
    address: string;
    dateOfBirth: string;
    country: string;
    balance: number;
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

  const needsUpsert = !existingProfile || !existingProfile.id;

  return {
    needsUpsert,
    upsertPayload: {
      id: user.id,
      email: cleanEmail,
      full_name: resolvedFullName,
      referral_code: defaultReferralCode,
      kyc_status: kycStatus,
    },
    resolvedProfile: {
      id: user.id,
      email: cleanEmail,
      fullName: resolvedFullName,
      referralCode: defaultReferralCode,
      referredBy: existingProfile?.referred_by || sponsorReferralCode || null,
      kycStatus,
      profileLocked,
      address: existingProfile?.address || user.user_metadata?.address || '',
      dateOfBirth: existingProfile?.date_of_birth || user.user_metadata?.date_of_birth || '',
      country: existingProfile?.country || user.user_metadata?.country || 'United States',
      balance: Number(existingProfile?.balance || 0),
    },
  };
}
