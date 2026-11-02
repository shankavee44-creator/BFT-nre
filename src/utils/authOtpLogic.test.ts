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
  isTwoFactorEnabledOnProfile,
  verifyAdminAuthorization,
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
    two_factor_enabled: true,
    self_capital_balance: 500.25,
  };

  const res = resolveOrBuildUserProfile(user, existingProfile);
  assert.equal(res.needsUpsert, false);
  assert.equal(res.resolvedProfile.fullName, 'Trigger Created Name');
  assert.equal(res.resolvedProfile.referralCode, 'BFT-TRIG99');
  assert.equal(res.resolvedProfile.kycStatus, 'pending');
  assert.equal(res.resolvedProfile.profileLocked, true);
  assert.equal(res.resolvedProfile.twoFactorEnabled, true);
  assert.equal(res.resolvedProfile.selfBalance, 500.25);
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

test('isTwoFactorEnabledOnProfile checks two_factor_enabled, is_2fa_enabled, and auth user metadata', () => {
  assert.equal(isTwoFactorEnabledOnProfile({ two_factor_enabled: true }), true);
  assert.equal(isTwoFactorEnabledOnProfile({ is_2fa_enabled: true }), true);
  assert.equal(isTwoFactorEnabledOnProfile({ two_factor_enabled: 1 }), true);
  assert.equal(
    isTwoFactorEnabledOnProfile(
      { two_factor_enabled: false },
      { user_metadata: { two_factor_enabled: true } }
    ),
    true
  );
  assert.equal(isTwoFactorEnabledOnProfile({ two_factor_enabled: false, is_2fa_enabled: false }), false);
  assert.equal(isTwoFactorEnabledOnProfile(null, null), false);
});

test('verifyAdminAuthorization authorizes valid security keys, profile roles, and Supabase metadata roles', () => {
  // Valid master security key
  const byKey = verifyAdminAuthorization({ adminKey: 'bft_admin_master_key_2026' });
  assert.equal(byKey.isAdmin, true);
  assert.equal(byKey.matchedBy, 'admin_key');

  // Authorized profile role
  const byProfileRole = verifyAdminAuthorization({
    profileRow: { role: 'admin', email: 'operator@custom.io' },
  });
  assert.equal(byProfileRole.isAdmin, true);
  assert.equal(byProfileRole.matchedBy, 'profile_role');

  // Authorized Supabase user_metadata role
  const byMetaRole = verifyAdminAuthorization({
    authUser: { email: 'meta@custom.io', user_metadata: { role: 'superadmin' } },
  });
  assert.equal(byMetaRole.isAdmin, true);
  assert.equal(byMetaRole.matchedBy, 'supabase_metadata');

  // Authorized admin email
  const byEmail = verifyAdminAuthorization({
    currentUser: { email: 'shankavee44@gmail.com', role: 'user' },
  });
  assert.equal(byEmail.isAdmin, true);
  assert.equal(byEmail.matchedBy, 'admin_email');

  // Unauthorized guest/user
  const denied = verifyAdminAuthorization({
    adminKey: 'wrong_key',
    profileRow: { role: 'user', email: 'regular@user.com' },
  });
  assert.equal(denied.isAdmin, false);
});

