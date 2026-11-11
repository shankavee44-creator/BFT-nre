import type { KYCDocumentType, TradingAccount, UserProfile } from '../types/index.ts';

export const KYC_VERIFICATION_DURATION_SECONDS = 120; // 2-minute automated verification timer
export const KYC_VERIFICATION_DURATION_MS = KYC_VERIFICATION_DURATION_SECONDS * 1000;

export const KYC_WITHDRAWAL_LOCK_MESSAGE =
  'Please complete your KYC verification to unlock withdrawals.';

const KYC_VERIFIED_LOCK_PREFIX = 'bft_kyc_verified_lock_';
const memoryKycVerifiedLocks = new Set<string>();

/**
 * Permanently records in local storage (and memory) that a user's KYC status has reached 'verified'
 * so background polling or stale profile rows can never revert it back to 'unverified'.
 */
export function markKycVerifiedLock(
  userIdOrParams?: string | null | { userId?: string | null; email?: string | null },
  emailArg?: string | null
): void {
  const userId =
    typeof userIdOrParams === 'object' && userIdOrParams !== null
      ? userIdOrParams.userId
      : userIdOrParams;
  const email =
    typeof userIdOrParams === 'object' && userIdOrParams !== null
      ? userIdOrParams.email
      : emailArg;

  const cleanId = (userId || '').trim().toLowerCase();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanId) memoryKycVerifiedLocks.add(cleanId);
  if (cleanEmail) memoryKycVerifiedLocks.add(cleanEmail);

  try {
    if (typeof localStorage === 'undefined') return;
    if (cleanId) {
      localStorage.setItem(`${KYC_VERIFIED_LOCK_PREFIX}${cleanId}`, 'verified');
    }
    if (cleanEmail) {
      localStorage.setItem(`${KYC_VERIFIED_LOCK_PREFIX}${cleanEmail}`, 'verified');
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Checks whether the user's KYC status is already locked as 'verified'.
 */
export function isKycVerifiedLocked(
  userId?: string | null,
  email?: string | null,
  currentStatus?: string | null
): boolean {
  const cleanStatus = (currentStatus || '').trim().toLowerCase();
  if (cleanStatus === 'verified' || cleanStatus === 'approved') {
    markKycVerifiedLock(userId, email);
    return true;
  }
  const cleanId = (userId || '').trim().toLowerCase();
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanId && memoryKycVerifiedLocks.has(cleanId)) return true;
  if (cleanEmail && memoryKycVerifiedLocks.has(cleanEmail)) return true;

  try {
    if (typeof localStorage === 'undefined') return false;
    if (cleanId && localStorage.getItem(`${KYC_VERIFIED_LOCK_PREFIX}${cleanId}`) === 'verified') {
      memoryKycVerifiedLocks.add(cleanId);
      return true;
    }
    if (cleanEmail && localStorage.getItem(`${KYC_VERIFIED_LOCK_PREFIX}${cleanEmail}`) === 'verified') {
      memoryKycVerifiedLocks.add(cleanEmail);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Resolves a stable, non-flapping KYC status across multiple sources (local state, Supabase profile,
 * Supabase Auth user_metadata, and backend KYC records). Once 'verified' is reached in any source
 * or locked in storage, it stays 'verified' permanently without reverting to 'unverified'.
 */
export function resolveStableKycStatus(
  statuses: Array<string | undefined | null>,
  options?: { userId?: string | null; email?: string | null }
): 'unverified' | 'pending' | 'verified' | 'rejected' {
  const normalized = statuses
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  if (
    normalized.some((s) => s === 'verified' || s === 'approved') ||
    isKycVerifiedLocked(options?.userId, options?.email)
  ) {
    markKycVerifiedLock(options?.userId, options?.email);
    return 'verified';
  }

  if (
    normalized.some(
      (s) => s === 'pending' || s === 'pending verification' || s === 'pending_verification'
    )
  ) {
    return 'pending';
  }

  if (normalized.some((s) => s === 'rejected' || s === 'declined')) {
    return 'rejected';
  }

  return 'unverified';
}

export function normalizeIdentityString(val: string | undefined | null): string {
  return (val || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Formats internal KYC status values into clean user-facing badge labels.
 * Specifically maps 'pending' to 'Pending Verification'.
 */
export function formatKycStatusBadgeText(status: string | undefined | null): string {
  const clean = (status || '').trim().toLowerCase();
  if (clean === 'pending' || clean === 'pending verification' || clean === 'pending_verification') {
    return 'Pending Verification';
  }
  if (clean === 'verified' || clean === 'approved') {
    return 'Verified';
  }
  if (clean === 'rejected') {
    return 'Rejected';
  }
  return 'Unverified';
}

/**
 * Determines whether a given KYC document type requires both Front Side and Back Side uploads.
 * Passports only require the single bio-data page (Back Side optional), whereas ID Cards
 * and Driving Licenses strictly require both Front Side and Back Side uploads.
 */
export function requiresDualSidedUpload(docType: KYCDocumentType | string | undefined): boolean {
  return docType !== 'Passport';
}

/**
 * Checks whether a user is permitted to submit a withdrawal request based on strict KYC compliance.
 */
export function canUserWithdraw(profile: UserProfile | null | undefined): {
  allowed: boolean;
  message: string;
} {
  if (
    !profile ||
    (profile.kycStatus !== 'verified' &&
      profile.kycStatus !== 'approved' &&
      !isKycVerifiedLocked(profile.id, profile.email, profile.kycStatus))
  ) {
    return {
      allowed: false,
      message: KYC_WITHDRAWAL_LOCK_MESSAGE,
    };
  }
  return {
    allowed: true,
    message: 'KYC Verified. Withdrawals unlocked.',
  };
}

/**
 * Validates and permanently locks a user's personal identity fields (Full Name, Address, Date of Birth, Country).
 * Once locked, Full Name, Address, Date of Birth, and Country are immutable in the KYC identity record.
 */
export function validateAndLockProfileDetails(
  currentProfile: UserProfile,
  input: {
    fullName: string;
    address: string;
    dateOfBirth: string;
    country?: string;
    telegramHandle?: string;
  },
  nowIso: string = new Date().toISOString()
): {
  success: boolean;
  error?: string;
  updatedProfile: UserProfile;
} {
  if (currentProfile.profileLocked) {
    const attemptedNameChange =
      normalizeIdentityString(input.fullName) !== normalizeIdentityString(currentProfile.fullName);
    const attemptedAddressChange =
      normalizeIdentityString(input.address) !== normalizeIdentityString(currentProfile.address);
    const attemptedDobChange =
      (input.dateOfBirth || '').trim() !== (currentProfile.dateOfBirth || '').trim();
    const attemptedCountryChange =
      Boolean(input.country && currentProfile.country) &&
      normalizeIdentityString(input.country) !== normalizeIdentityString(currentProfile.country);

    if (
      attemptedNameChange ||
      attemptedAddressChange ||
      attemptedDobChange ||
      attemptedCountryChange
    ) {
      return {
        success: false,
        error:
          'Personal details (Full Name, Address, Date of Birth, and Country) are permanently locked and cannot be edited after submission.',
        updatedProfile: currentProfile,
      };
    }

    return {
      success: true,
      updatedProfile: {
        ...currentProfile,
        telegramHandle: input.telegramHandle?.trim() ?? currentProfile.telegramHandle,
      },
    };
  }

  const cleanName = (input.fullName || '').trim().replace(/\s+/g, ' ');
  const cleanAddress = (input.address || '').trim();
  const cleanDob = (input.dateOfBirth || '').trim();
  const cleanCountry = (input.country || currentProfile.country || 'United States').trim();

  if (cleanName.length < 3) {
    return {
      success: false,
      error: 'Please enter your official Full Name (minimum 3 characters).',
      updatedProfile: currentProfile,
    };
  }

  if (cleanAddress.length < 6) {
    return {
      success: false,
      error: 'Please enter your complete residential Address.',
      updatedProfile: currentProfile,
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDob)) {
    return {
      success: false,
      error: 'Please select a valid Date of Birth (YYYY-MM-DD).',
      updatedProfile: currentProfile,
    };
  }

  if (cleanCountry.length < 2) {
    return {
      success: false,
      error: 'Please select your Country of Residence.',
      updatedProfile: currentProfile,
    };
  }

  const updatedProfile: UserProfile = {
    ...currentProfile,
    fullName: cleanName,
    address: cleanAddress,
    dateOfBirth: cleanDob,
    country: cleanCountry,
    telegramHandle: input.telegramHandle?.trim() ?? currentProfile.telegramHandle,
    profileLocked: true,
    profileLockedAt: nowIso,
  };

  return {
    success: true,
    updatedProfile,
  };
}

/**
 * Evaluates uploaded KYC documents against the user's locked personal details.
 * Enforces Front Side + Back Side uploads for ID Card and Driving License (single-page for Passport),
 * and transitions the user's KYC status to 'pending' ("Pending Verification").
 */
export function evaluateKycDocumentUpload(
  profile: UserProfile,
  doc: {
    docType: KYCDocumentType;
    documentNumber: string;
    frontFileName: string;
    backFileName?: string;
    selfieFileName?: string;
    frontDocumentUrl?: string;
    backDocumentUrl?: string;
    selfieUrl?: string;
    extractedFullName?: string;
    extractedDob?: string;
  },
  nowMs: number = Date.now()
): {
  matched: boolean;
  error?: string;
  updatedProfile: UserProfile;
} {
  if (!profile.profileLocked || !profile.fullName || !profile.address || !profile.dateOfBirth) {
    return {
      matched: false,
      error:
        'Please complete and save your Personal Profile Details (Full Name, Address, Date of Birth, Country) before uploading your KYC document.',
      updatedProfile: profile,
    };
  }

  if (!doc.frontFileName || !doc.frontFileName.trim()) {
    return {
      matched: false,
      error: `Please upload a valid Front Side scan or photo of your ${doc.docType}.`,
      updatedProfile: profile,
    };
  }

  if (requiresDualSidedUpload(doc.docType) && (!doc.backFileName || !doc.backFileName.trim())) {
    return {
      matched: false,
      error: `Please upload a valid Back Side scan or photo of your ${doc.docType}. Both Front Side and Back Side are required.`,
      updatedProfile: profile,
    };
  }

  if (!doc.selfieFileName && !doc.selfieUrl) {
    return {
      matched: false,
      error: `Please upload a clear Live Selfie Photo to verify your photo ID against your face.`,
      updatedProfile: profile,
    };
  }

  const cleanDocNumber = (doc.documentNumber || '').trim() || `DOC-${nowMs.toString(36).toUpperCase()}`;
  if (cleanDocNumber.length < 4) {
    return {
      matched: false,
      error: `Please enter a valid ${doc.docType} serial or document number.`,
      updatedProfile: profile,
    };
  }

  const effectiveExtractedName =
    doc.extractedFullName !== undefined ? doc.extractedFullName : profile.fullName;
  const effectiveExtractedDob =
    doc.extractedDob !== undefined ? doc.extractedDob : profile.dateOfBirth;

  const nameMatches =
    normalizeIdentityString(effectiveExtractedName) === normalizeIdentityString(profile.fullName);
  const dobMatches =
    (effectiveExtractedDob || '').trim() === (profile.dateOfBirth || '').trim();

  if (!nameMatches || !dobMatches) {
    const mismatchReason = !nameMatches
      ? `Document name ("${effectiveExtractedName.trim()}") does not match locked profile Full Name ("${profile.fullName}").`
      : `Document Date of Birth ("${effectiveExtractedDob.trim()}") does not match locked profile Date of Birth ("${profile.dateOfBirth}").`;

    return {
      matched: false,
      error: `KYC Verification Failed: ${mismatchReason}`,
      updatedProfile: {
        ...profile,
        kycStatus: 'unverified',
        kycRejectionReason: mismatchReason,
      },
    };
  }

  return {
    matched: true,
    updatedProfile: {
      ...profile,
      kycStatus: 'pending',
      kycDocumentType: doc.docType,
      kycDocumentNumber: cleanDocNumber,
      kycDocumentFileName: doc.frontFileName.trim(),
      kycBackDocumentFileName: doc.backFileName?.trim() || undefined,
      kycSelfieFileName: doc.selfieFileName?.trim() || undefined,
      kycFrontDocumentUrl: doc.frontDocumentUrl?.trim() || profile.kycFrontDocumentUrl,
      kycBackDocumentUrl: doc.backDocumentUrl?.trim() || profile.kycBackDocumentUrl,
      kycSelfieUrl: doc.selfieUrl?.trim() || profile.kycSelfieUrl,
      kycExtractedName: effectiveExtractedName.trim(),
      kycExtractedDob: effectiveExtractedDob.trim(),
      kycSubmittedAt: new Date(nowMs).toISOString().split('T')[0],
      kycVerificationEndsAt: nowMs + KYC_VERIFICATION_DURATION_MS,
      kycRejectionReason: undefined,
      profileLocked: true,
    },
  };
}

/**
 * Automated Verification Status Check
 */
export function checkKycTimerCompletion(
  profile: UserProfile,
  nowMs: number = Date.now()
): {
  completed: boolean;
  remainingSeconds: number;
  updatedProfile: UserProfile;
} {
  if (profile.kycStatus === 'verified' || profile.kycStatus === 'approved') {
    return {
      completed: true,
      remainingSeconds: 0,
      updatedProfile: {
        ...profile,
        kycStatus: 'verified',
      },
    };
  }

  if (profile.kycStatus !== 'pending') {
    return {
      completed: false,
      remainingSeconds: 0,
      updatedProfile: profile,
    };
  }

  if (!profile.kycVerificationEndsAt) {
    return {
      completed: false,
      remainingSeconds: KYC_VERIFICATION_DURATION_SECONDS,
      updatedProfile: profile,
    };
  }

  const remainingMs = profile.kycVerificationEndsAt - nowMs;
  if (remainingMs > 0) {
    return {
      completed: false,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      updatedProfile: profile,
    };
  }

  return {
    completed: true,
    remainingSeconds: 0,
    updatedProfile: {
      ...profile,
      kycStatus: 'verified',
      kycVerificationEndsAt: undefined,
    },
  };
}

/**
 * Filters trading accounts so that a user only sees accounts they have explicitly purchased.
 */
export function filterAccountsForUser(
  allAccounts: TradingAccount[],
  profile: UserProfile | null | undefined
): TradingAccount[] {
  if (!profile || !profile.isLoggedIn) return [];
  return allAccounts.filter((acc) => {
    if (acc.ownerEmail && profile.email) {
      return acc.ownerEmail.toLowerCase() === profile.email.toLowerCase();
    }
    if (acc.ownerId && profile.id) {
      return acc.ownerId === profile.id;
    }
    return false;
  });
}
