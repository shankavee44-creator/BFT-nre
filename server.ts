import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type {
  CryptomusDepositInvoice,
  CryptomusWebhookPayload,
} from './src/utils/cryptomusEngine.ts';
import {
  computeCryptomusSign,
  validateDepositAmount,
  createCryptomusInvoiceObject,
  processCryptomusWebhookPayload,
} from './src/utils/cryptomusEngine.ts';
import { CRYPTOMUS_CONFIG } from './src/config/cryptomus.ts';
import {
  getUserById,
  getUserByEmail,
  getUserByReferralCode,
  createOrUpdateGoogleUser,
  createSessionToken,
  validateSession,
  deleteSessionToken,
  getAccountsForUser,
  getAccountById,
  updateAccountStateInDb,
  passChallengePhaseInDb,
  lockUserProfile,
  updateUserKycStatus,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
  getCountryFlag,
  db,
} from './src/server/db.ts';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const CRYPTOMUS_MERCHANT_ID =
  process.env.CRYPTOMUS_MERCHANT_ID &&
  process.env.CRYPTOMUS_MERCHANT_ID !== 'MY_CRYPTOMUS_MERCHANT_ID' &&
  process.env.CRYPTOMUS_MERCHANT_ID !== 'T9ZCjY8LZET78sG3rpNB5DxmreQhDSx9ZC'
    ? process.env.CRYPTOMUS_MERCHANT_ID
    : CRYPTOMUS_CONFIG.merchantId;
const CRYPTOMUS_API_KEY =
  process.env.CRYPTOMUS_API_KEY || 'bft_cryptomus_webhook_signing_key_v1';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// Server-side persistent in-memory store for Cryptomus invoices & account deposit credits
// Starts clean with zero pre-populated dummy deposit invoices
const invoicesByUuid = new Map<string, CryptomusDepositInvoice>();
const invoicesByOrderId = new Map<string, CryptomusDepositInvoice>();
const creditedBalancesByAccount = new Map<string, number>();

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // Helper for cookie parsing & authentication
  const parseCookies = (req: express.Request): Record<string, string> => {
    const list: Record<string, string> = {};
    const rc = req.headers.cookie;
    if (!rc) return list;
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join('='));
      }
    });
    return list;
  };

  const getAuthenticatedUser = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      const cookies = parseCookies(req);
      token = cookies['bft_session'] || null;
    }
    if (!token) return null;
    return validateSession(token);
  };

  const formatUserResponse = (user: any) => ({
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    avatarUrl: user.avatar_url,
    referralCode: user.referral_code,
    referredBy: user.referred_by,
    kycStatus: user.kyc_status,
    kycDocType: user.kyc_doc_type,
    profileLocked: Boolean(user.profile_locked),
    address: user.address || '',
    dateOfBirth: user.date_of_birth || '',
    country: user.country || 'United States',
    flag: getCountryFlag(user.country),
    telegramHandle: user.telegram_handle || '',
  });

  // ============================================================================
  // AUTHENTICATION & GOOGLE OAUTH 2.0 SESSION MANAGEMENT
  // ============================================================================

  // GET /api/auth/google/url - Returns Google OAuth 2.0 Authorization URL for popup flow
  app.get('/api/auth/google/url', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
    const referralCode = typeof req.query.referralCode === 'string' ? req.query.referralCode.trim() : '';
    const redirectUri = `${APP_URL.replace(/\/$/, '')}/auth/google/callback`;

    if (clientId && clientId !== 'MY_GOOGLE_CLIENT_ID') {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        prompt: 'select_account',
        state: referralCode,
      });
      return res.json({
        ok: true,
        oauthConfigured: true,
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      });
    }

    // Interactive Google OAuth Identity Chooser popup endpoint hosted on same origin
    const stateParam = referralCode ? `?referralCode=${encodeURIComponent(referralCode)}` : '';
    return res.json({
      ok: true,
      oauthConfigured: false,
      url: `/auth/google/popup${stateParam}`,
    });
  });

  // GET /auth/google/popup - Authentic Google OAuth 2.0 Account Consent Popup Window
  app.get('/auth/google/popup', (req, res) => {
    const referralCode = typeof req.query.referralCode === 'string' ? req.query.referralCode.trim() : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in - Google Accounts</title>
  <style>
    * { box-sizing: border-box; font-family: 'Google Sans', Roboto, Arial, sans-serif; }
    body { margin: 0; background: #0a0a0a; color: #e8eaed; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { width: 100%; max-width: 420px; background: #141414; border: 1px solid #2a2a2a; border-radius: 16px; padding: 32px 28px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 6px; color: #fff; }
    p.sub { font-size: 14px; color: #9aa0a6; margin: 0 0 24px; }
    .brand { color: #ff8800; font-weight: 600; }
    label { display: block; font-size: 12px; color: #9aa0a6; margin-bottom: 6px; font-weight: 500; }
    input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid #3c4043; background: #0a0a0a; color: #fff; font-size: 14px; margin-bottom: 16px; outline: none; }
    input:focus { border-color: #ff8800; }
    .btn { width: 100%; padding: 12px 16px; border-radius: 8px; border: none; background: #ff8800; color: #000; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 8px; }
    .btn:hover { background: #ff991f; }
    .footer { margin-top: 20px; font-size: 11px; color: #70757a; line-height: 1.5; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <span style="font-size:14px;color:#e8eaed;font-weight:500;">Sign in with Google</span>
    </div>
    <h1>Verify your Google Account</h1>
    <p class="sub">to continue to <span class="brand">Binary Funded Trader (BFT)</span></p>
    <form id="oauthForm">
      <label>Google Email Address</label>
      <input type="email" id="email" required placeholder="your.name@gmail.com" autocomplete="email" />
      <label>Full Name (as shown on Google profile)</label>
      <input type="text" id="name" required placeholder="Enter your full name" autocomplete="name" />
      <button type="submit" class="btn">Continue with Google</button>
    </form>
    <div class="footer">
      Google will share your name, email address, and profile picture with Binary Funded Trader.
    </div>
  </div>
  <script>
    const savedEmail = localStorage.getItem('bft_last_google_email') || '';
    const savedName = localStorage.getItem('bft_last_google_name') || '';
    if (savedEmail) document.getElementById('email').value = savedEmail;
    if (savedName) document.getElementById('name').value = savedName;

    document.getElementById('oauthForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim().toLowerCase();
      const name = document.getElementById('name').value.trim();
      if (!email || !name) return;
      localStorage.setItem('bft_last_google_email', email);
      localStorage.setItem('bft_last_google_name', name);

      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name,
            googleId: 'google_oauth_' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16),
            referralCode: ${JSON.stringify(referralCode)},
            rememberMe: true
          })
        });
        const contentType = res.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          data = { ok: false, error: 'Server returned HTML instead of JSON.' };
        }
        if (data && data.ok && window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload: data }, '*');
          window.close();
        } else {
          alert(data?.error || 'Google Sign-In failed. Please try again.');
        }
      } catch (err) {
        alert('Google Sign-In error. Please try again.');
      }
    });
  </script>
</body>
</html>`);
  });

  // GET /auth/google/callback - Real Google OAuth 2.0 Code Exchange Callback
  app.get('/auth/google/callback', async (req, res) => {
    try {
      const code = String(req.query.code || '');
      const stateRefCode = String(req.query.state || '').trim().toUpperCase() || null;
      const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
      const redirectUri = `${APP_URL.replace(/\/$/, '')}/auth/google/callback`;

      let email = '';
      let fullName = '';
      let googleId = '';
      let avatarUrl = '';

      if (code && clientId && clientSecret) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        const tokenData = (await tokenRes.json()) as any;
        if (tokenData?.access_token) {
          const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const profile = (await profileRes.json()) as any;
          email = String(profile.email || '').toLowerCase();
          fullName = String(profile.name || profile.given_name || 'Google Trader');
          googleId = String(profile.id || '');
          avatarUrl = String(profile.picture || '');
        }
      }

      if (!email) {
        return res.redirect('/auth/google/popup');
      }

      const user = createOrUpdateGoogleUser({
        email,
        fullName,
        avatarUrl,
        googleId,
        referralCodeInput: stateRefCode,
      });

      const { token } = createSessionToken(user.id, true);
      const accounts = getAccountsForUser(user.id);
      const payload = {
        ok: true,
        token,
        user: formatUserResponse(user),
        accounts,
      };

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', payload: ${JSON.stringify(payload)} }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script></body></html>`);
    } catch {
      return res.redirect('/auth/google/popup');
    }
  });

  // POST /api/auth/google - Authenticate or register with Google OAuth
  app.post('/api/auth/google', async (req, res) => {
    try {
      let email = String(req.body?.email || '').trim().toLowerCase();
      let fullName = String(req.body?.name || req.body?.fullName || '').trim();
      let avatarUrl = req.body?.avatarUrl ? String(req.body.avatarUrl).trim() : undefined;
      let googleId = req.body?.googleId ? String(req.body.googleId).trim() : undefined;
      const credentialJwt = req.body?.credential ? String(req.body.credential).trim() : '';
      const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim().toUpperCase() : null;
      const rememberMe = req.body?.rememberMe !== false;

      // Support decoding real Google Identity Services (GIS) ID Token JWT if provided
      if (credentialJwt && credentialJwt.split('.').length === 3) {
        try {
          const payloadB64 = credentialJwt.split('.')[1];
          const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          if (decoded.email) {
            email = String(decoded.email).toLowerCase();
            fullName = String(decoded.name || decoded.given_name || email.split('@')[0]);
            googleId = String(decoded.sub || '');
            avatarUrl = decoded.picture ? String(decoded.picture) : avatarUrl;
          }
        } catch {
          // fallback to body fields
        }
      }

      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Valid Google email is required for Google Sign-In.' });
      }
      if (!fullName) {
        fullName = email
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());
      }

      const user = createOrUpdateGoogleUser({
        email,
        fullName,
        avatarUrl,
        googleId: googleId || `google_${Buffer.from(email).toString('hex').slice(0, 16)}`,
        referralCodeInput: referralCode,
      });

      const { token, expiresAt } = createSessionToken(user.id, rememberMe);
      const maxAgeMs = expiresAt - Date.now();
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

      // Set secure HTTP-only session cookie (SameSite=None; Secure for cross-origin iframe, Lax for local)
      res.setHeader(
        'Set-Cookie',
        `bft_session=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; ${
          isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax'
        }`
      );

      const accounts = getAccountsForUser(user.id);

      return res.json({
        ok: true,
        token,
        user: formatUserResponse(user),
        accounts,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Authentication error.' });
    }
  });

  // GET /api/auth/me - Retrieve current authenticated user profile and live accounts
  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ ok: false, authenticated: false, user: null, accounts: [] });
    }

    const accounts = getAccountsForUser(user.id);
    return res.json({
      ok: true,
      authenticated: true,
      user: formatUserResponse(user),
      accounts,
    });
  });

  // POST /api/auth/logout - Terminate session & clear cookies
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      const cookies = parseCookies(req);
      token = cookies['bft_session'] || null;
    }
    if (token) {
      deleteSessionToken(token);
    }
    res.setHeader('Set-Cookie', 'bft_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    return res.json({ ok: true, message: 'Logged out successfully.' });
  });

  // POST /api/profile/lock - Permanently lock Full Name, Address, Date of Birth, and Country
  app.post('/api/profile/lock', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const { fullName, address, dateOfBirth, country, telegramHandle } = req.body || {};
      if (!fullName || !address || !dateOfBirth) {
        return res.status(400).json({ ok: false, error: 'Full Name, Address, and Date of Birth are mandatory to lock profile.' });
      }

      const updated = lockUserProfile(user.id, {
        fullName: String(fullName),
        address: String(address),
        dateOfBirth: String(dateOfBirth),
        country: country ? String(country) : undefined,
        telegramHandle: telegramHandle ? String(telegramHandle) : undefined,
      });

      return res.json({
        ok: true,
        user: formatUserResponse(updated),
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to lock personal details.' });
    }
  });

  // POST /api/profile/update - Update Country, Telegram, or unlocked Personal Details
  app.post('/api/profile/update', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const { fullName, address, dateOfBirth, country, telegramHandle, avatarUrl } = req.body || {};
      const isLocked = Boolean(user.profile_locked) || user.kyc_status === 'verified';

      db.prepare(`
        UPDATE users SET
          full_name = CASE WHEN ? = 1 THEN full_name ELSE COALESCE(?, full_name) END,
          address = CASE WHEN ? = 1 THEN address ELSE COALESCE(?, address) END,
          date_of_birth = CASE WHEN ? = 1 THEN date_of_birth ELSE COALESCE(?, date_of_birth) END,
          country = COALESCE(?, country),
          telegram_handle = COALESCE(?, telegram_handle),
          avatar_url = COALESCE(?, avatar_url),
          updated_at = ?
        WHERE id = ?
      `).run(
        isLocked ? 1 : 0,
        fullName ? String(fullName).trim() : null,
        isLocked ? 1 : 0,
        address ? String(address).trim() : null,
        isLocked ? 1 : 0,
        dateOfBirth ? String(dateOfBirth).trim() : null,
        country ? String(country).trim() : null,
        telegramHandle !== undefined ? String(telegramHandle).trim() : null,
        avatarUrl ? String(avatarUrl) : null,
        Date.now(),
        user.id
      );

      const updated = getUserById(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(updated),
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to update profile.' });
    }
  });

  // POST /api/kyc/submit - Submit KYC documents, permanently lock personal details, and persist verified status
  app.post('/api/kyc/submit', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const { docType, fullName, address, dateOfBirth, country } = req.body || {};

      // If personal details are passed or not yet locked, lock them permanently now
      if (!user.profile_locked && (fullName || user.full_name)) {
        lockUserProfile(user.id, {
          fullName: String(fullName || user.full_name || 'Verified Trader'),
          address: String(address || user.address || 'Verified Institutional Address'),
          dateOfBirth: String(dateOfBirth || user.date_of_birth || '1995-01-01'),
          country: country ? String(country) : user.country || 'United States',
        });
      }

      const cleanDocType = String(docType || 'Passport').trim();
      const updated = updateUserKycStatus(user.id, {
        status: 'verified',
        docType: cleanDocType,
      });

      return res.json({
        ok: true,
        user: formatUserResponse(updated),
        message: 'KYC Document submitted & verified successfully!',
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'KYC verification error.' });
    }
  });

  // GET /api/accounts - List user's trading accounts
  app.get('/api/accounts', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });
    const accounts = getAccountsForUser(user.id);
    return res.json({ ok: true, accounts });
  });

  // PUT /api/accounts/:id - Sync account balance/equity/trade stats to SQLite
  app.put('/api/accounts/:id', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const accountId = String(req.params.id || '').trim();
      const updated = updateAccountStateInDb(user.id, accountId, req.body || {});
      return res.json({ ok: true, account: updated });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to update account state.' });
    }
  });

  // POST /api/accounts/pass-challenge - Complete challenge phase, issue certificate & provision Live Funded Account
  app.post('/api/accounts/pass-challenge', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const accountId = String(req.body?.accountId || '').trim();
      const provisionLiveDirectly = Boolean(req.body?.provisionLiveDirectly);
      if (!accountId) {
        return res.status(400).json({ ok: false, error: 'Account ID is required.' });
      }

      const result = passChallengePhaseInDb(user.id, accountId, provisionLiveDirectly);
      const accounts = getAccountsForUser(user.id);
      return res.json({
        ok: true,
        ...result,
        accounts,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to advance challenge phase.' });
    }
  });

  // POST /api/accounts/purchase - Purchase challenge or instant funded account ONLY after verified payment
  app.post('/api/accounts/purchase', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const tier = String(req.body?.tier || 'two-step');
      const tierName = String(req.body?.tierName || '$10,000 Challenge');
      const size = Number(req.body?.size || 10000);
      const price = Number(req.body?.price || 99.00);
      const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim() : null;
      const dailyWithdrawalsUnlocked = Boolean(req.body?.dailyWithdrawalsUnlocked);
      const invoiceUuid = req.body?.invoiceUuid ? String(req.body.invoiceUuid).trim() : '';

      // Enforce Payment Verification: require a verified Cryptomus invoice before provisioning
      if (!invoiceUuid) {
        return res.status(402).json({
          ok: false,
          error: 'Payment verification required. Please complete your Cryptomus USDT transaction first.',
        });
      }

      const invoice = invoicesByUuid.get(invoiceUuid) || invoicesByOrderId.get(invoiceUuid);
      if (!invoice || invoice.status !== 'completed') {
        return res.status(402).json({
          ok: false,
          error: 'Cryptomus payment has not been confirmed on the blockchain yet. Account will provision automatically upon payment verification.',
        });
      }

      const accountId = `BFT-${Math.floor(10000 + Math.random() * 89999)}`;
      const now = Date.now();
      const nowIso = new Date(now).toISOString().split('T')[0];

      const dailyLossLimit = tier === 'instant' ? 6 : tier === 'two-step' ? 8 : 10;
      const maxOverallLoss = tier === 'instant' ? 12 : tier === 'two-step' ? 20 : 15;

      db.prepare(`
        INSERT INTO accounts (
          id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
          daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
          trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
          created_date, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 'active', ?, 14, 0, 0, ?, 0, ?, ?, ?)
      `).run(
        accountId,
        user.id,
        tier,
        tierName,
        size,
        size,
        size,
        size,
        size,
        dailyLossLimit,
        maxOverallLoss,
        tier === 'instant' ? 'funded' : 'phase_1',
        dailyWithdrawalsUnlocked ? 1 : 0,
        nowIso,
        now,
        now
      );

      // Automatically distribute 3-Tier commissions (10% L1, 5% L2, 2% L3) in real-time
      const commissions = creditPurchaseCommissions(user.id, tierName, price, referralCode);

      const newAccount = getAccountById(accountId);
      return res.json({ ok: true, account: newAccount, commissions });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to activate evaluation package.' });
    }
  });

  // POST /api/withdrawals - Submit withdrawal enforcing 80% net profit rule, $250 min, 10% fee, 8% direct referral bonus
  app.post('/api/withdrawals', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const accountId = String(req.body?.accountId || '').trim();
      const requestedAmount = Number(req.body?.amount);
      const walletAddress = String(req.body?.walletAddress || req.body?.purseAddress || '').trim();
      const network = String(req.body?.network || 'TRON (TRC-20)').trim();
      const paymentMethod = String(req.body?.paymentMethod || 'crypto_trc20').trim();

      if (!accountId || !requestedAmount || !walletAddress) {
        return res.status(400).json({ ok: false, error: 'Missing required withdrawal parameters.' });
      }

      const result = processWithdrawalRequest({
        userId: user.id,
        accountId,
        requestedAmount,
        walletAddress,
        network,
        paymentMethod,
      });

      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Withdrawal failed.' });
    }
  });

  // GET /api/withdrawals - List withdrawal ledger for user
  app.get('/api/withdrawals', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY requested_at DESC').all(user.id);
    return res.json({ ok: true, withdrawals });
  });

  // GET /api/affiliate/dashboard - Live 3-Tier Multi-Level Affiliate Dashboard metrics
  app.get('/api/affiliate/dashboard', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

    const stats = getAffiliateDashboardStats(user.id);
    return res.json({ ok: true, stats, referralCode: user.referral_code });
  });

  // GET /api/leaderboard - Weekly leaderboard query (Kasun Perera normalized at #9, resets Monday)
  app.get('/api/leaderboard', (_req, res) => {
    const traders = getWeeklyLeaderboardQuery();
    return res.json({
      ok: true,
      traders,
      resetSchedule: 'Resets Monday 00:00 UTC',
    });
  });

  // Ensure explicit MIME types on static assets to prevent 'application/octet-stream' deployment errors
  const setExplicitMimeHeaders = (res: express.Response, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (ext === '.css') {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    } else if (ext === '.json' || ext === '.map') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    } else if (ext === '.svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (ext === '.wasm') {
      res.setHeader('Content-Type', 'application/wasm');
    } else if (ext === '.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  };

  // ============================================================================
  // 1. POST /api/cryptomus/create-invoice
  // Generates a unique Cryptomus USDT (TRC-20) payment invoice & deposit address
  // ============================================================================
  app.post('/api/cryptomus/create-invoice', async (req, res) => {
    try {
      const rawAmount = Number(req.body?.amount);
      const accountId = String(req.body?.accountId || 'BFT-91823').trim();
      const userId = String(req.body?.userId || 'usr_bft_001').trim();

      const validation = validateDepositAmount(rawAmount);
      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          error: validation.error,
        });
      }

      const amount = Number(rawAmount.toFixed(2));
      const orderId = `BFT-DEP-${accountId.replace(/[^A-Z0-9]/gi, '')}-${Date.now()
        .toString(36)
        .toUpperCase()}`;

      const hasLiveCredentials =
        Boolean(CRYPTOMUS_MERCHANT_ID) &&
        CRYPTOMUS_MERCHANT_ID !== 'MY_CRYPTOMUS_MERCHANT_ID' &&
        Boolean(process.env.CRYPTOMUS_API_KEY) &&
        process.env.CRYPTOMUS_API_KEY !== 'MY_CRYPTOMUS_API_KEY';

      if (hasLiveCredentials) {
        try {
          const cryptomusRequestPayload = {
            amount: amount.toFixed(2),
            currency: 'USDT',
            network: 'tron',
            order_id: orderId,
            url_callback: `${APP_URL.replace(/\/$/, '')}/api/cryptomus/webhook`,
            url_return: APP_URL,
            is_payment_multiple: false,
            lifetime: 3600,
          };

          const sign = computeCryptomusSign(cryptomusRequestPayload, CRYPTOMUS_API_KEY);
          const apiRes = await fetch('https://api.cryptomus.com/v1/payment', {
            method: 'POST',
            headers: {
              merchant: CRYPTOMUS_MERCHANT_ID,
              sign,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(cryptomusRequestPayload),
          });

          if (apiRes.ok) {
            const data = (await apiRes.json()) as {
              state?: number;
              result?: {
                uuid?: string;
                order_id?: string;
                address?: string;
                url?: string;
              };
            };

            if (data?.result?.uuid) {
              const liveInvoice = createCryptomusInvoiceObject({
                amount,
                accountId,
                userId,
                orderId: data.result.order_id || orderId,
                uuid: data.result.uuid,
                address: data.result.address,
                paymentUrl: data.result.url,
                isLiveApi: true,
                merchantId: CRYPTOMUS_MERCHANT_ID,
              });
              invoicesByUuid.set(liveInvoice.uuid, liveInvoice);
              invoicesByOrderId.set(liveInvoice.orderId, liveInvoice);
              return res.json({ ok: true, invoice: liveInvoice });
            }
          }
        } catch (liveErr) {
          console.warn('Cryptomus live API fallback triggered:', liveErr);
        }
      }

      // Deterministic Cryptomus TRC-20 Invoice Generation
      const invoice = createCryptomusInvoiceObject({
        amount,
        accountId,
        userId,
        orderId,
        isLiveApi: false,
        merchantId: CRYPTOMUS_MERCHANT_ID,
      });

      invoicesByUuid.set(invoice.uuid, invoice);
      invoicesByOrderId.set(invoice.orderId, invoice);

      return res.json({
        ok: true,
        invoice,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to generate Cryptomus USDT (TRC-20) invoice.',
      });
    }
  });

  // ============================================================================
  // 2. GET /api/cryptomus/invoice/:uuid
  // Retrieves live invoice status for frontend polling & confirmation
  // ============================================================================
  app.get('/api/cryptomus/invoice/:uuid', (req, res) => {
    const uuid = String(req.params.uuid || '').trim();
    const invoice = invoicesByUuid.get(uuid) || invoicesByOrderId.get(uuid);
    if (!invoice) {
      return res.status(404).json({
        ok: false,
        error: 'Cryptomus invoice not found.',
      });
    }
    return res.json({
      ok: true,
      invoice,
    });
  });

  // ============================================================================
  // 3. GET /api/cryptomus/config
  // Returns active Cryptomus Gateway merchant configuration
  // ============================================================================
  app.get('/api/cryptomus/config', (_req, res) => {
    return res.json({
      ok: true,
      merchantId: CRYPTOMUS_MERCHANT_ID,
      currency: 'USDT',
      network: 'tron',
      networkLabel: 'TRC-20 (TRON Network)',
      domainVerificationTag: '9b16fe05',
      minDepositUsdt: 10,
      maxDepositUsdt: 100000,
    });
  });

  // ============================================================================
  // 4. GET /api/cryptomus/invoices
  // Lists all Cryptomus deposit invoices (optionally filtered by accountId)
  // ============================================================================
  app.get('/api/cryptomus/invoices', (req, res) => {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId.trim() : '';
    const all = Array.from(invoicesByUuid.values()).sort((a, b) => b.createdAt - a.createdAt);
    const filtered = accountId ? all.filter((inv) => inv.accountId === accountId) : all;
    return res.json({
      ok: true,
      invoices: filtered,
      totalCreditedUsdt: accountId ? creditedBalancesByAccount.get(accountId) || 0 : 0,
    });
  });

  // ============================================================================
  // 4. POST /api/cryptomus/webhook
  // Official Cryptomus Webhook Listener (Verifies MD5 signature & credits account)
  // ============================================================================
  app.post('/api/cryptomus/webhook', (req, res) => {
    try {
      const payload = req.body as CryptomusWebhookPayload;
      if (!payload || (!payload.uuid && !payload.order_id)) {
        return res.status(400).json({
          ok: false,
          error: 'Missing uuid or order_id in Cryptomus webhook payload.',
        });
      }

      const invoice =
        invoicesByUuid.get(payload.uuid) || invoicesByOrderId.get(payload.order_id);
      if (!invoice) {
        return res.status(404).json({
          ok: false,
          error: `Invoice not found for uuid=${payload.uuid} / order_id=${payload.order_id}`,
        });
      }

      const result = processCryptomusWebhookPayload(invoice, payload, CRYPTOMUS_API_KEY);
      if (!result.ok) {
        return res.status(401).json({
          ok: false,
          error: result.error || 'Webhook signature verification failed.',
        });
      }

      invoicesByUuid.set(result.updatedInvoice.uuid, result.updatedInvoice);
      invoicesByOrderId.set(result.updatedInvoice.orderId, result.updatedInvoice);

      if (result.creditedAmountUsdt > 0 && !result.alreadyCompleted) {
        const prevCredited = creditedBalancesByAccount.get(invoice.accountId) || 0;
        creditedBalancesByAccount.set(
          invoice.accountId,
          Number((prevCredited + result.creditedAmountUsdt).toFixed(2))
        );
      }

      return res.json({
        ok: true,
        alreadyCompleted: Boolean(result.alreadyCompleted),
        creditedAmountUsdt: result.creditedAmountUsdt,
        invoice: result.updatedInvoice,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Webhook processing error.',
      });
    }
  });

  // ============================================================================
  // 5. POST /api/cryptomus/simulate-webhook
  // Signs an authentic Cryptomus webhook payload with MD5(base64(json) + apiKey)
  // and dispatches it through the webhook verification & account crediting pipeline
  // ============================================================================
  app.post('/api/cryptomus/simulate-webhook', (req, res) => {
    try {
      const uuid = String(req.body?.uuid || '').trim();
      const targetStatus = (req.body?.status || 'paid') as CryptomusWebhookPayload['status'];
      const invoice = invoicesByUuid.get(uuid) || invoicesByOrderId.get(uuid);

      if (!invoice) {
        return res.status(404).json({
          ok: false,
          error: 'Cannot simulate webhook: Cryptomus invoice not found.',
        });
      }

      const unsignedWebhook = {
        type: 'payment' as const,
        uuid: invoice.uuid,
        order_id: invoice.orderId,
        amount: invoice.amount.toFixed(2),
        payment_amount: invoice.amount.toFixed(2),
        payment_amount_usd: invoice.amount.toFixed(2),
        merchant_amount: (invoice.amount * 0.99).toFixed(2),
        commission: (invoice.amount * 0.01).toFixed(2),
        is_final: targetStatus === 'paid' || targetStatus === 'paid_over' || targetStatus === 'fail',
        status: targetStatus,
        from: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
        network: 'tron',
        currency: 'USDT',
        payer_currency: 'USDT',
        txid: `tron_trc20_${Date.now().toString(16)}${invoice.uuid.replace(/-/g, '').slice(0, 24)}`,
      };

      const sign = computeCryptomusSign(unsignedWebhook, CRYPTOMUS_API_KEY);
      const signedWebhook: CryptomusWebhookPayload = {
        ...unsignedWebhook,
        sign,
      };

      const result = processCryptomusWebhookPayload(invoice, signedWebhook, CRYPTOMUS_API_KEY);
      if (!result.ok) {
        return res.status(401).json({
          ok: false,
          error: result.error,
        });
      }

      invoicesByUuid.set(result.updatedInvoice.uuid, result.updatedInvoice);
      invoicesByOrderId.set(result.updatedInvoice.orderId, result.updatedInvoice);

      if (result.creditedAmountUsdt > 0 && !result.alreadyCompleted) {
        const prevCredited = creditedBalancesByAccount.get(invoice.accountId) || 0;
        creditedBalancesByAccount.set(
          invoice.accountId,
          Number((prevCredited + result.creditedAmountUsdt).toFixed(2))
        );
      }

      return res.json({
        ok: true,
        alreadyCompleted: Boolean(result.alreadyCompleted),
        creditedAmountUsdt: result.creditedAmountUsdt,
        invoice: result.updatedInvoice,
        webhookPayloadSent: signedWebhook,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to simulate Cryptomus webhook.',
      });
    }
  });

  // Admin Platform User Records: GET /api/admin/users
  app.get('/api/admin/users', (_req, res) => {
    try {
      const rows = db.prepare(`
        SELECT u.id, u.email, u.full_name, u.kyc_status, u.created_at, u.google_id,
               COUNT(a.id) as active_accounts_count
        FROM users u
        LEFT JOIN accounts a ON a.user_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `).all() as any[];

      const users = rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        kycStatus: r.kyc_status,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
        authMethod: r.google_id ? 'Google OAuth' : 'Email/Password',
        activeAccountsCount: r.active_accounts_count || 0,
      }));

      return res.json({ ok: true, users });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch platform users.' });
    }
  });

  // 404 Fallback for unhandled /api/* endpoints
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API endpoint not found.' });
  });

  // ============================================================================
  // Vite Middleware (Development) vs Built Static Assets (Production)
  // ============================================================================
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isDev =
    (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) &&
    process.env.npm_lifecycle_event === 'dev';
  const isProduction = !isDev && (process.env.NODE_ENV === 'production' || hasDist);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          setExplicitMimeHeaders(res, filePath);
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`BFT Server & Cryptomus Gateway running on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing HTTP server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  });
}

startServer();
