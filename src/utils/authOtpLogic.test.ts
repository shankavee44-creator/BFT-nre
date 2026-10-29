import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeOtpEmail,
  isValidEmailForOtp,
  sanitizeOtpCode,
  isValidSixDigitOtp,
  generateSixDigitOtp,
  buildOAuthCallbackUrl,
  resolveOrBuildUserProfile,
} from './authOtpLogic';

test('sanitizeOtpEmail and isValidEmailForOtp validate returning user emails', () => {
  assert.equal(sanitizeOtpEmail('  Trader.One@BFT.io  '), 'trader.one@bft.io');
  assert.equal(isValidEmailForOtp('trader.one@bft.io'), true);
  assert.equal(isValidEmailForOtp('invalid-email'), false);
  assert.equal(isValidEmailForOtp('missing@domain'), false);
});

test('sanitizeOtpCode and isValidSixDigitOtp enforce 6-digit numeric OTP tokens', () => {
  assert.equal(sanitizeOtpCode('12 34-56'), '123456');
  assert.equal(sanitizeOtpCode('987654321'), '987654');
  assert.equal(isValidSixDigitOtp('482910'), true);
  assert.equal(isValidSixDigitOtp('48291'), false);
  assert.equal(isValidSixDigitOtp('abcdef'), false);
});

test('generateSixDigitOtp always produces a 6-digit code', () => {
  const seeded = generateSixDigitOtp(42319);
  assert.equal(seeded.length, 6);
  assert.equal(isValidSixDigitOtp(seeded), true);

  const randomOtp = generateSixDigitOtp();
  assert.equal(randomOtp.length, 6);
  assert.equal(isValidSixDigitOtp(randomOtp), true);
});

test('buildOAuthCallbackUrl constructs clean callback URL without double slashes', () => {
  assert.equal(
    buildOAuthCallbackUrl('https://ais-dev-jzoimqrhwgupinwhqns6xi-736487999845.asia-northeast1.run.app/'),
    'https://ais-dev-jzoimqrhwgupinwhqns6xi-736487999845.asia-northeast1.run.app/auth/callback'
  );
  assert.equal(
    buildOAuthCallbackUrl('http://localhost:3000'),
    'http://localhost:3000/auth/callback'
  );
});

test('resolveOrBuildUserProfile skips upsert when profile already exists from trigger', () => {
  const user = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'returning@bft.io',
    user_metadata: {
      full_name: 'Meta Name',
    },
  };
  const existingProfile = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    email: 'returning@bft.io',
    full_name: 'Trigger Created Name',
    referral_code: 'BFT-TRIG99',
    kyc_status: 'Pending Verification',
    profile_locked: true,
    address: '742 Evergreen Terrace',
    date_of_birth: '1992-04-15',
    country: 'United Kingdom',
  };

  const res = resolveOrBuildUserProfile(user, existingProfile);
  assert.equal(res.needsUpsert, false);
  assert.equal(res.resolvedProfile.fullName, 'Trigger Created Name');
  assert.equal(res.resolvedProfile.referralCode, 'BFT-TRIG99');
  assert.equal(res.resolvedProfile.kycStatus, 'pending');
  assert.equal(res.resolvedProfile.profileLocked, true);
});

test('resolveOrBuildUserProfile prepares safe upsert payload when OAuth user has no profile row yet', () => {
  const user = {
    id: 'f9e8d7c6-b5a4-3210-fedc-ba0987654321',
    email: 'google.trader@gmail.com',
    user_metadata: {
      name: 'Alex Mercer',
    },
  };

  const res = resolveOrBuildUserProfile(user, null, 'BFT-SPONSOR');
  assert.equal(res.needsUpsert, true);
  assert.equal(res.upsertPayload.id, user.id);
  assert.equal(res.upsertPayload.email, 'google.trader@gmail.com');
  assert.equal(res.upsertPayload.full_name, 'Alex Mercer');
  assert.equal(res.upsertPayload.referral_code, 'BFT-F9E8D7');
  assert.equal(res.resolvedProfile.referredBy, 'BFT-SPONSOR');
  assert.equal(res.resolvedProfile.kycStatus, 'unverified');
});
