import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUserWithdraw,
  validateAndLockProfileDetails,
  evaluateKycDocumentUpload,
  checkKycTimerCompletion,
  filterAccountsForUser,
  formatKycStatusBadgeText,
  requiresDualSidedUpload,
  KYC_WITHDRAWAL_LOCK_MESSAGE,
  KYC_VERIFICATION_DURATION_MS,
} from './kycVerification';
import { TradingAccount, UserProfile } from '../types';

const createMockUnverifiedProfile = (): UserProfile => ({
  id: 'usr_new_101',
  email: 'jordan.vance@example.com',
  fullName: 'Jordan Vance',
  address: '',
  dateOfBirth: '',
  profileLocked: false,
  country: 'United States',
  avatarUrl: '',
  telegramHandle: '@jordan_v',
  kycStatus: 'unverified',
  twoFactorEnabled: false,
  activeAccountId: '',
  isLoggedIn: true,
});

test('newly registered user defaults to Unverified and is blocked from withdrawals with exact compliance prompt', () => {
  const profile = createMockUnverifiedProfile();
  assert.equal(profile.kycStatus, 'unverified');
  assert.equal(formatKycStatusBadgeText(profile.kycStatus), 'Unverified');

  const check = canUserWithdraw(profile);
  assert.equal(check.allowed, false);
  assert.equal(check.message, KYC_WITHDRAWAL_LOCK_MESSAGE);
  assert.equal(
    check.message,
    'Please complete your KYC verification to unlock withdrawals.'
  );
});

test('validateAndLockProfileDetails validates Full Name, Address, DOB, and Country and locks them permanently', () => {
  const profile = createMockUnverifiedProfile();

  // Missing address or invalid DOB should fail
  const invalidAttempt = validateAndLockProfileDetails(profile, {
    fullName: 'Jordan Vance',
    address: '',
    dateOfBirth: '',
    country: 'United States',
  });
  assert.equal(invalidAttempt.success, false);
  assert.equal(invalidAttempt.updatedProfile.profileLocked, false);

  // Valid Full Name, Address, DOB, and Country locks the profile permanently
  const validLock = validateAndLockProfileDetails(
    profile,
    {
      fullName: 'Jordan Vance',
      address: '742 Evergreen Terrace, Suite 200, New York, NY 10001',
      dateOfBirth: '1994-08-15',
      country: 'Canada',
    },
    '2026-10-27T12:00:00.000Z'
  );
  assert.equal(validLock.success, true);
  assert.equal(validLock.updatedProfile.profileLocked, true);
  assert.equal(validLock.updatedProfile.fullName, 'Jordan Vance');
  assert.equal(
    validLock.updatedProfile.address,
    '742 Evergreen Terrace, Suite 200, New York, NY 10001'
  );
  assert.equal(validLock.updatedProfile.dateOfBirth, '1994-08-15');
  assert.equal(validLock.updatedProfile.country, 'Canada');

  // Subsequent attempt to edit Full Name, Address, DOB, or Country must be rejected (immutable)
  const editAttempt = validateAndLockProfileDetails(validLock.updatedProfile, {
    fullName: 'Another Name',
    address: '999 Different Street',
    dateOfBirth: '1990-01-01',
    country: 'Germany',
  });
  assert.equal(editAttempt.success, false);
  assert.equal(editAttempt.updatedProfile.fullName, 'Jordan Vance');
  assert.equal(
    editAttempt.updatedProfile.address,
    '742 Evergreen Terrace, Suite 200, New York, NY 10001'
  );
  assert.equal(editAttempt.updatedProfile.dateOfBirth, '1994-08-15');
  assert.equal(editAttempt.updatedProfile.country, 'Canada');
});

test('dual-sided document upload requires both Front and Back for ID Card and Driving License, single-page for Passport', () => {
  assert.equal(requiresDualSidedUpload('ID Card'), true);
  assert.equal(requiresDualSidedUpload('Driving License'), true);
  assert.equal(requiresDualSidedUpload('Passport'), false);

  const locked = validateAndLockProfileDetails(createMockUnverifiedProfile(), {
    fullName: 'Jordan Vance',
    address: '742 Evergreen Terrace, Suite 200, New York, NY 10001',
    dateOfBirth: '1994-08-15',
    country: 'United States',
  }).updatedProfile;

  // Missing Back Side for ID Card must fail
  const missingBackIdCard = evaluateKycDocumentUpload(locked, {
    docType: 'ID Card',
    documentNumber: 'ID99281722',
    frontFileName: 'id_front.png',
    backFileName: '',
    extractedFullName: 'Jordan Vance',
    extractedDob: '1994-08-15',
  });
  assert.equal(missingBackIdCard.matched, false);
  assert.ok(missingBackIdCard.error?.includes('Back Side'));

  // Providing both Front Side and Back Side for ID Card succeeds and sets status to 'pending' ("Pending Verification")
  const validDualSidedIdCard = evaluateKycDocumentUpload(locked, {
    docType: 'ID Card',
    documentNumber: 'ID99281722',
    frontFileName: 'id_front.png',
    backFileName: 'id_back.png',
    frontDocumentUrl: 'https://kwmjonjcwdwvaijcrtjw.supabase.co/storage/v1/object/public/kyc-documents/usr_new_101/front.png',
    backDocumentUrl: 'https://kwmjonjcwdwvaijcrtjw.supabase.co/storage/v1/object/public/kyc-documents/usr_new_101/back.png',
    extractedFullName: 'Jordan Vance',
    extractedDob: '1994-08-15',
  });
  assert.equal(validDualSidedIdCard.matched, true);
  assert.equal(validDualSidedIdCard.updatedProfile.kycStatus, 'pending');
  assert.equal(formatKycStatusBadgeText(validDualSidedIdCard.updatedProfile.kycStatus), 'Pending Verification');
  assert.equal(validDualSidedIdCard.updatedProfile.kycDocumentFileName, 'id_front.png');
  assert.equal(validDualSidedIdCard.updatedProfile.kycBackDocumentFileName, 'id_back.png');
  assert.ok(validDualSidedIdCard.updatedProfile.kycFrontDocumentUrl?.includes('/front.png'));
  assert.ok(validDualSidedIdCard.updatedProfile.kycBackDocumentUrl?.includes('/back.png'));
});

test('evaluateKycDocumentUpload checks document match and transitions to Pending Verification', () => {
  const baseProfile = createMockUnverifiedProfile();
  const locked = validateAndLockProfileDetails(baseProfile, {
    fullName: 'Jordan Vance',
    address: '742 Evergreen Terrace, Suite 200, New York, NY 10001',
    dateOfBirth: '1994-08-15',
  }).updatedProfile;

  const startMs = 1700000000000;

  // Mismatched document name must fail verification
  const mismatchRes = evaluateKycDocumentUpload(
    locked,
    {
      docType: 'Passport',
      documentNumber: 'P99281722',
      frontFileName: 'passport_scan.jpg',
      extractedFullName: 'Wrong Person',
      extractedDob: '1994-08-15',
    },
    startMs
  );
  assert.equal(mismatchRes.matched, false);
  assert.equal(mismatchRes.updatedProfile.kycStatus, 'unverified');

  // Matching document data transitions to 'pending' ("Pending Verification")
  const matchRes = evaluateKycDocumentUpload(
    locked,
    {
      docType: 'Passport',
      documentNumber: 'P99281722',
      frontFileName: 'jordan_vance_passport.png',
      extractedFullName: 'Jordan Vance',
      extractedDob: '1994-08-15',
    },
    startMs
  );
  assert.equal(matchRes.matched, true);
  assert.equal(matchRes.updatedProfile.kycStatus, 'pending');
  assert.equal(
    matchRes.updatedProfile.kycVerificationEndsAt,
    startMs + KYC_VERIFICATION_DURATION_MS
  );

  // While pending (e.g. 60s elapsed), withdrawals are still blocked and 60s remain
  const midCheck = checkKycTimerCompletion(matchRes.updatedProfile, startMs + 60 * 1000);
  assert.equal(midCheck.completed, false);
  assert.equal(midCheck.remainingSeconds, 60);
  assert.equal(canUserWithdraw(midCheck.updatedProfile).allowed, false);

  // At 2 minutes (120s elapsed), status automatically updates to 'verified' and unlocks withdrawals
  const doneCheck = checkKycTimerCompletion(
    matchRes.updatedProfile,
    startMs + KYC_VERIFICATION_DURATION_MS
  );
  assert.equal(doneCheck.completed, true);
  assert.equal(doneCheck.remainingSeconds, 0);
  assert.equal(doneCheck.updatedProfile.kycStatus, 'verified');
  assert.equal(canUserWithdraw(doneCheck.updatedProfile).allowed, true);
});

test('filterAccountsForUser returns empty array for newly registered user without purchases', () => {
  const newTrader = createMockUnverifiedProfile();
  const otherUserAccount: TradingAccount = {
    id: 'BFT-91823',
    ownerId: 'usr_other_999',
    ownerEmail: 'other@bft-capital.com',
    loginId: 'BFT-91823',
    passwordHash: 'secret',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10000,
    startingDayEquity: 10000,
    equity: 10000,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    status: 'active',
    createdDate: '2026-10-27',
    lastActiveDate: '2026-10-27',
    phase: 'funded',
    tradingDaysCompleted: 0,
    tradesCount: 0,
    winRate: 0,
  };

  // Newly registered user has 0 accounts
  const filteredBeforePurchase = filterAccountsForUser([otherUserAccount], newTrader);
  assert.equal(filteredBeforePurchase.length, 0);

  // Once user purchases an account, it is returned for that user
  const purchasedAccount: TradingAccount = {
    ...otherUserAccount,
    id: 'BFT-55102',
    ownerId: newTrader.id,
    ownerEmail: newTrader.email,
  };
  const filteredAfterPurchase = filterAccountsForUser(
    [otherUserAccount, purchasedAccount],
    newTrader
  );
  assert.equal(filteredAfterPurchase.length, 1);
  assert.equal(filteredAfterPurchase[0].id, 'BFT-55102');
});
