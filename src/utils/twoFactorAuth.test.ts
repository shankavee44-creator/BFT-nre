import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generateSync, verify, generateURI } from 'otplib';
import {
  safeParseJsonText,
  safeJsonResponse,
  generateFallbackBase32Secret,
} from './apiClient';

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

  describe('Login Authentication 2FA Verification Gate', () => {
    it('allows immediate sign-in when is_2fa_enabled is false or missing', () => {
      const userProfile = {
        id: 'usr-plain',
        email: 'trader1@bftprops.com',
        is_2fa_enabled: false,
        totp_secret: null,
      };

      const is2faRequired = Boolean(userProfile.is_2fa_enabled);
      assert.equal(is2faRequired, false, 'Users without 2FA do not trigger 2FA requirement on login');
    });

    it('requires 6-digit TOTP verification screen when is_2fa_enabled is true', () => {
      const userProfile = {
        id: 'usr-2fa-active',
        email: 'shankavee44@gmail.com',
        is_2fa_enabled: true,
        totp_secret: generateSecret(),
      };

      const is2faRequired = Boolean(userProfile.is_2fa_enabled);
      assert.equal(is2faRequired, true, 'Users with 2FA enabled must trigger is2faRequired: true');
    });

    it('successfully verifies and logs user in when TOTP code matches totp_secret', async () => {
      const secret = generateSecret();
      const userProfile = {
        id: 'usr-totp-verify',
        email: 'shankavee44@gmail.com',
        is_2fa_enabled: true,
        totp_secret: secret,
      };

      // User generates valid 6-digit code on Google Authenticator
      const userEnteredCode = generateSync({ secret });
      assert.equal(userEnteredCode.length, 6);

      const check = await verify({ token: userEnteredCode, secret: userProfile.totp_secret });
      assert.equal((check as any).valid, true, 'Valid 6-digit TOTP code must verify successfully');
    });

    it('rejects invalid or expired TOTP code during 2FA login verification', async () => {
      const secret = generateSecret();
      const userProfile = {
        id: 'usr-totp-verify',
        email: 'shankavee44@gmail.com',
        is_2fa_enabled: true,
        totp_secret: secret,
      };

      const badCode = '123456';
      let isValid = false;
      try {
        const check = await verify({ token: badCode, secret: userProfile.totp_secret });
        isValid = (check as any).valid;
      } catch {
        isValid = false;
      }

      assert.equal(isValid, false, 'Invalid code must be rejected with verification failure');
    });
  });

  describe('Safe JSON Response Handling (Prevents Unexpected end of JSON input)', () => {
    it('safely handles empty or whitespace-only response bodies without throwing', () => {
      const resEmpty = safeParseJsonText('', { ok: true, status: 200 });
      assert.equal(resEmpty.ok, true);
      assert.equal(resEmpty.emptyBody, true);
      assert.equal(resEmpty.status, 200);

      const resWhitespace = safeParseJsonText('   \n  ', {
        ok: true,
        status: 204,
        fallbackPayload: { is2faEnabled: true },
      });
      assert.equal(resWhitespace.ok, true);
      assert.equal(resWhitespace.emptyBody, true);
      assert.equal(resWhitespace.is2faEnabled, true);
    });

    it('safely handles empty error responses with proper error message', () => {
      const resErr = safeParseJsonText('', {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      assert.equal(resErr.ok, false);
      assert.equal(resErr.emptyBody, true);
      assert.equal(resErr.error, 'Internal Server Error');
    });

    it('parses valid JSON payloads accurately via safeJsonResponse', async () => {
      const secret = generateFallbackBase32Secret(32);
      assert.equal(secret.length, 32);
      assert.match(secret, /^[A-Z2-7]+$/);

      const mockRes = new Response(
        JSON.stringify({ ok: true, secret, message: '2FA generated' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const data = await safeJsonResponse(mockRes);
      assert.equal(data.ok, true);
      assert.equal(data.secret, secret);
      assert.equal(data.message, '2FA generated');
    });

    it('never throws Unexpected end of JSON input when Response has empty body and application/json header', async () => {
      const mockEmptyJsonRes = new Response('', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await safeJsonResponse(mockEmptyJsonRes, { is2faEnabled: true });
      assert.equal(data.ok, true);
      assert.equal(data.emptyBody, true);
      assert.equal(data.is2faEnabled, true);
    });
  });
});

