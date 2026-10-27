import { KYCDocumentType, TradingAccount, UserProfile } from '../types';

export const KYC_VERIFICATION_DURATION_SECONDS = 120; // 2-minute automated verification timer
export const KYC_VERIFICATION_DURATION_MS = KYC_VERIFICATION_DURATION_SECONDS * 1000;

export const KYC_WITHDRAWAL_LOCK_MESSAGE =
  'Please complete your KYC verification to unlock withdrawals.';

export function normalizeIdentityString(val: string | undefined | null): string {
  return (val || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Checks whether a user is permitted to submit a withdrawal request based on strict KYC compliance.
 */
export function canUserWithdraw(profile: UserProfile | null | undefined): {
  allowed: boolean;
  message: string;
} {
  if (!profile || profile.kycStatus !== 'verified') {
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
 * Validates and permanently locks a user's personal identity fields (Full Name, Address, Date of Birth).
 * Once locked, Full Name, Address, and Date of Birth are immutable and cannot be edited.
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

    if (attemptedNameChange || attemptedAddressChange || attemptedDobChange) {
      return {
        success: false,
        error:
          'Personal details (Full Name, Address, and Date of Birth) are permanently locked and cannot be edited after submission.',
        updatedProfile: currentProfile,
      };
    }

    // Allow non-immutable fields (like Telegram handle) to be saved while keeping identity fields locked
    return {
      success: true,
      updatedProfile: {
        ...currentProfile,
        country: input.country?.trim() || currentProfile.country,
        telegramHandle: input.telegramHandle?.trim() ?? currentProfile.telegramHandle,
      },
    };
  }

  const cleanName = (input.fullName || '').trim().replace(/\s+/g, ' ');
  const cleanAddress = (input.address || '').trim();
  const cleanDob = (input.dateOfBirth || '').trim();

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

  const updatedProfile: UserProfile = {
    ...currentProfile,
    fullName: cleanName,
    address: cleanAddress,
    dateOfBirth: cleanDob,
    country: input.country?.trim() || currentProfile.country,
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
 * Evaluates an uploaded KYC document against the user's locked personal details.
 * If the extracted document data matches the locked profile details, starts the 2-minute verification timer.
 */
export function evaluateKycDocumentUpload(
  profile: UserProfile,
  doc: {
    docType: KYCDocumentType;
    documentNumber: string;
    fileName: string;
    extractedFullName: string;
    extractedDob: string;
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
        'Please complete and save your Personal Profile Details (Full Name, Address, Date of Birth) before uploading your KYC document.',
      updatedProfile: profile,
    };
  }

  if (!doc.fileName || !doc.fileName.trim()) {
    return {
      matched: false,
      error: `Please upload a valid ${doc.docType} scan or photo file.`,
      updatedProfile: profile,
    };
  }

  if (!doc.documentNumber || doc.documentNumber.trim().length < 4) {
    return {
      matched: false,
      error: `Please enter a valid ${doc.docType} serial or document number.`,
      updatedProfile: profile,
    };
  }

  const nameMatches =
    normalizeIdentityString(doc.extractedFullName) === normalizeIdentityString(profile.fullName);
  const dobMatches = (doc.extractedDob || '').trim() === (profile.dateOfBirth || '').trim();

  if (!nameMatches || !dobMatches) {
    const mismatchReason = !nameMatches
      ? `Document name ("${doc.extractedFullName.trim()}") does not match locked profile Full Name ("${profile.fullName}").`
      : `Document Date of Birth ("${doc.extractedDob.trim()}") does not match locked profile Date of Birth ("${profile.dateOfBirth}").`;

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

  const verificationEndsAt = nowMs + KYC_VERIFICATION_DURATION_MS;

  return {
    matched: true,
    updatedProfile: {
      ...profile,
      kycStatus: 'pending',
      kycDocumentType: doc.docType,
      kycDocumentNumber: doc.documentNumber.trim(),
      kycDocumentFileName: doc.fileName.trim(),
      kycExtractedName: doc.extractedFullName.trim(),
      kycExtractedDob: doc.extractedDob.trim(),
      kycSubmittedAt: new Date(nowMs).toISOString().split('T')[0],
      kycVerificationEndsAt: verificationEndsAt,
      kycRejectionReason: undefined,
    },
  };
}

/**
 * Checks whether a pending 2-minute KYC verification timer has completed and transitions status to 'verified'.
 */
export function checkKycTimerCompletion(
  profile: UserProfile,
  nowMs: number = Date.now()
): {
  completed: boolean;
  remainingSeconds: number;
  updatedProfile: UserProfile;
} {
  if (profile.kycStatus === 'verified') {
    return {
      completed: true,
      remainingSeconds: 0,
      updatedProfile: profile,
    };
  }

  if (profile.kycStatus !== 'pending' || !profile.kycVerificationEndsAt) {
    return {
      completed: false,
      remainingSeconds: 0,
      updatedProfile: profile,
    };
  }

  const remainingMs = profile.kycVerificationEndsAt - nowMs;
  if (remainingMs <= 0) {
    return {
      completed: true,
      remainingSeconds: 0,
      updatedProfile: {
        ...profile,
        kycStatus: 'verified',
        kycVerificationEndsAt: undefined,
        kycRejectionReason: undefined,
      },
    };
  }

  return {
    completed: false,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    updatedProfile: profile,
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
