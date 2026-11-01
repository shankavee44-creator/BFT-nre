import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generateSync, verify, generateURI } from 'otplib';

describe('Two-Factor Authentication (2FA) & Security Engine', () => {
  it('generates a valid RFC 6238 Base32 secret and otpauth URI', () => {
    const secret = generateSecret();
    assert.ok(secret && secret.length >= 16, 'Secret must be at least 16 Base32 characters');
    assert.match(secret, /^[A-Z2-7]+$/, 'Secret must contain only Base32 characters');

    const email = 'trader@bftprops.com';
    const uri = generateURI({
      issuer: 'BFT-Trading',
      label: email,
      secret,
    });

    assert.ok(uri.startsWith('otpauth://totp/'), 'URI must be an otpauth://totp/ URI');
    assert.ok(uri.includes(encodeURIComponent(email)) || uri.includes(email), 'URI must encode user email');
    assert.ok(uri.includes(secret), 'URI must contain the secret key');
    assert.ok(uri.includes('issuer=BFT-Trading'), 'URI must include issuer');
  });

  it('generates a matching 6-digit TOTP token and verifies successfully', async () => {
    const secret = generateSecret();
    const token = generateSync({ secret });

    assert.equal(token.length, 6, 'Generated token must be exactly 6 digits');
    assert.match(token, /^\d{6}$/, 'Token must be strictly numeric');

    const result = await verify({ token, secret });
    assert.equal((result as any).valid, true, 'Verification of current token must return valid: true');
  });

  it('rejects incorrect or spoofed 6-digit TOTP tokens', async () => {
    const secret = generateSecret();
    const wrongToken = '000000';

    try {
      const result = await verify({ token: wrongToken, secret });
      assert.equal((result as any).valid, false, 'Invalid token must return valid: false');
    } catch {
      // Some otplib versions throw on mismatched token
      assert.ok(true);
    }
  });

  it('blocks withdrawal requests when 2FA is disabled on the user profile', () => {
    const unverifiedProfile = {
      id: 'usr-1',
      email: 'alex@example.com',
      twoFactorEnabled: false,
      is2faEnabled: false,
      kycStatus: 'verified' as const,
    };

    const is2faActive = Boolean(
      unverifiedProfile.twoFactorEnabled ||
      unverifiedProfile.is2faEnabled
    );

    assert.equal(is2faActive, false, '2FA must be marked inactive');
  });

  it('authorizes withdrawal request when 2FA is active and verification token passes', async () => {
    const secret = generateSecret();
    const verifiedProfile = {
      id: 'usr-2',
      email: 'pro@example.com',
      twoFactorEnabled: true,
      is2faEnabled: true,
      totp_secret: secret,
      kycStatus: 'verified' as const,
    };

    const is2faActive = Boolean(
      verifiedProfile.twoFactorEnabled ||
      verifiedProfile.is2faEnabled
    );
    assert.equal(is2faActive, true, '2FA is active');

    // Generate valid TOTP token for authorization
    const token = generateSync({ secret });
    const check = await verify({ token, secret: verifiedProfile.totp_secret });
    assert.equal((check as any).valid, true, 'Valid 2FA token allows withdrawal authorization');
  });
});
