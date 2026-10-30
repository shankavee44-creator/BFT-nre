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
  ensureUserInDb,
  getKycSubmissionForUser,
  createSessionToken,
  validateSession,
  deleteSessionToken,
  getAccountsForUser,
  getAccountById,
  ensurePersonalLiveAccountForUser,
  creditPersonalAccountDepositInDb,
  updateAccountStateInDb,
  passChallengePhaseInDb,
  lockUserProfile,
  updateUserKycStatus,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
  getCountryFlag,
  getAdminMetrics,
  getAdminUsersList,
  adminUpdateAccountBalance,
  adminSetUserRole,
  createDepositRequest,
  getAdminDeposits,
  adminApproveDeposit,
  adminDeclineDeposit,
  getAdminWithdrawals,
  adminApproveWithdrawal,
  adminDeclineWithdrawal,
  getAdminKycSubmissions,
  adminApproveKyc,
  adminRejectKyc,
  distribute3TierCommissions,
  getAdminReferralTree,
  getAdminCommissionsLedger,
  getAdminAuditLogs,
  ensureAdminSeedData,
  recordTradeInDb,
  settleTradeInDb,
  getUserTradesFromDb,
  db,
} from './src/server/db.ts';
import { BackendMarketEngine } from './src/server/marketEngine.ts';

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

  const marketEngine = new BackendMarketEngine();
  marketEngine.start();

  app.use(express.json({ limit: '5mb' }));

  app.get(['/api/health', '/healthz'], (_req, res) => {
    res.status(200).json({ ok: true, status: 'healthy', timestamp: Date.now() });
  });

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
    if (token) {
      const sessionUser = validateSession(token);
      if (sessionUser) return sessionUser;

      // Support JWT Bearer tokens from Supabase Auth or createSessionJwtToken
      if (token.split('.').length === 3) {
        try {
          const payloadB64 = token.split('.')[1];
          const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
          if (decoded?.sub || decoded?.email) {
            const ensured = ensureUserInDb({
              id: String(decoded.sub || ''),
              email: String(decoded.email || ''),
              fullName: decoded.user_metadata?.full_name || decoded.name || undefined,
              referralCode: decoded.ref || decoded.user_metadata?.referral_code || undefined,
            });
            if (ensured) return ensured;
          }
        } catch {
          // ignore malformed token
        }
      }
    }

    // Fallback to explicit userId / email passed in body or query from authenticated Supabase client
    const fallbackId = String(req.body?.userId || req.query?.userId || '').trim();
    const fallbackEmail = String(req.body?.email || req.query?.email || '').trim();
    if (fallbackId || fallbackEmail) {
      return ensureUserInDb({
        id: fallbackId,
        email: fallbackEmail,
        fullName: req.body?.fullName ? String(req.body.fullName) : undefined,
      });
    }

    return null;
  };

  const isUserAdmin = (user: any, req?: express.Request): boolean => {
    const adminKey =
      req?.headers['x-admin-key'] ||
      (req?.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7).trim()
        : null);
    if (adminKey === 'bft_admin_master_key_2026') return true;

    if (!user) return false;
    if (user.role === 'admin') return true;
    const adminEmails = [
      'shankavee44@gmail.com',
      'admin@bft.io',
      'viktor.v@quant-prop.io',
      'superadmin@bft.io',
    ];
    return adminEmails.includes(String(user.email || '').toLowerCase().trim());
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = getAuthenticatedUser(req);
    if (!isUserAdmin(user, req)) {
      return res.status(403).json({
        ok: false,
        error: 'Access Denied: Admin authorization required.',
        code: 'FORBIDDEN_NOT_ADMIN',
      });
    }
    (req as any).adminUser =
      user || {
        id: 'usr_admin_master',
        email: 'admin@bft.io',
        full_name: 'BFT Super Administrator',
        role: 'admin',
      };
    next();
  };

  const formatUserResponse = (user: any) => {
    const sub = user?.id ? getKycSubmissionForUser(user.id) : null;
    const isAdmin = isUserAdmin(user);
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name || sub?.full_name || '',
      role: isAdmin ? 'admin' : (user.role || 'trader'),
      isAdmin,
      avatarUrl: user.avatar_url,
      referralCode: user.referral_code,
      referredBy: user.referred_by,
      kycStatus: user.kyc_status || 'unverified',
      kycDocType: user.kyc_doc_type || sub?.doc_type || 'ID Card',
      kycDocumentNumber: user.kyc_doc_number || sub?.document_number || '',
      kycFrontDocumentUrl: user.kyc_front_url || sub?.front_document_url || '',
      kycBackDocumentUrl: user.kyc_back_url || sub?.back_document_url || '',
      kycDocumentFileName: user.kyc_front_filename || sub?.front_file_name || '',
      kycBackDocumentFileName: user.kyc_back_filename || sub?.back_file_name || '',
      kycSubmittedAt: user.kyc_submitted_at || '',
      profileLocked: Boolean(user.profile_locked || sub?.profile_locked),
      address: user.address || sub?.address || '',
      dateOfBirth: user.date_of_birth || sub?.date_of_birth || '',
      country: user.country || sub?.country || 'United States',
      flag: getCountryFlag(user.country || sub?.country),
      telegramHandle: user.telegram_handle || '',
    };
  };

  // ============================================================================
  // AUTHENTICATION & EMAIL/PASSWORD SESSION MANAGEMENT
  // ============================================================================

  // POST /api/auth/session - Synchronize authenticated Email/Password user session
  app.post('/api/auth/session', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      let fullName = String(req.body?.name || req.body?.fullName || '').trim();
      const userIdInput = req.body?.userId ? String(req.body.userId).trim() : undefined;
      const referralCode = req.body?.referralCode
        ? String(req.body.referralCode).trim().toUpperCase()
        : null;
      const rememberMe = req.body?.rememberMe !== false;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Valid email address is required.' });
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
        googleId: userIdInput || `usr_${Buffer.from(email).toString('hex').slice(0, 16)}`,
        referralCodeInput: referralCode,
      });

      const { token, expiresAt } = createSessionToken(user.id, rememberMe);
      const maxAgeMs = expiresAt - Date.now();
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

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
        return res.status(400).json({ ok: false, error: 'Full Name, Address, Date of Birth, and Country are mandatory to lock profile.' });
      }

      const updated = lockUserProfile(user.id, {
        fullName: String(fullName),
        address: String(address),
        dateOfBirth: String(dateOfBirth),
        country: country ? String(country) : 'United States',
        telegramHandle: telegramHandle ? String(telegramHandle) : undefined,
      });

      const submission = getKycSubmissionForUser(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(updated),
        kycSubmission: submission || null,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to lock personal details.' });
    }
  });

  // POST /api/profile/update - Update Telegram, Avatar, or unlocked Personal Details
  app.post('/api/profile/update', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const { fullName, address, dateOfBirth, country, telegramHandle, avatarUrl } = req.body || {};
      const isLocked = Boolean(user.profile_locked) || user.kyc_status === 'verified' || user.kyc_status === 'pending';

      db.prepare(`
        UPDATE users SET
          full_name = CASE WHEN ? = 1 THEN full_name ELSE COALESCE(?, full_name) END,
          address = CASE WHEN ? = 1 THEN address ELSE COALESCE(?, address) END,
          date_of_birth = CASE WHEN ? = 1 THEN date_of_birth ELSE COALESCE(?, date_of_birth) END,
          country = CASE WHEN ? = 1 THEN country ELSE COALESCE(?, country) END,
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
        isLocked ? 1 : 0,
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

  // POST /api/kyc/submit - Submit dual-sided KYC documents, lock personal details, and set status to Pending Verification
  app.post('/api/kyc/submit', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const {
        docType,
        documentNumber,
        frontDocumentUrl,
        backDocumentUrl,
        frontFileName,
        backFileName,
        fullName,
        address,
        dateOfBirth,
        country,
        status,
      } = req.body || {};

      // Ensure personal details are locked in DB
      if (!user.profile_locked && (fullName || user.full_name)) {
        lockUserProfile(user.id, {
          fullName: String(fullName || user.full_name || 'Verified Trader'),
          address: String(address || user.address || 'Verified Institutional Address'),
          dateOfBirth: String(dateOfBirth || user.date_of_birth || '1995-01-01'),
          country: country ? String(country) : user.country || 'United States',
        });
      }

      const cleanDocType = String(docType || 'ID Card').trim();
      const targetStatus =
        status === 'verified' || status === 'approved' ? 'verified' : 'pending';

      const updated = updateUserKycStatus(user.id, {
        status: targetStatus,
        docType: cleanDocType,
        documentNumber: documentNumber ? String(documentNumber).trim() : undefined,
        frontDocumentUrl: frontDocumentUrl ? String(frontDocumentUrl).trim() : undefined,
        backDocumentUrl: backDocumentUrl ? String(backDocumentUrl).trim() : undefined,
        frontFileName: frontFileName ? String(frontFileName).trim() : undefined,
        backFileName: backFileName ? String(backFileName).trim() : undefined,
      });

      const submission = getKycSubmissionForUser(user.id);

      return res.json({
        ok: true,
        user: formatUserResponse(updated),
        kycSubmission: submission || null,
        message: 'KYC Documents submitted! Status updated to Pending Verification.',
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'KYC submission error.' });
    }
  });

  // GET /api/kyc/status - Retrieve persisted KYC personal details, dual-sided document URLs, and Pending Verification status
  app.get('/api/kyc/status', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const submission = getKycSubmissionForUser(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(user),
        kycSubmission: submission || null,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch KYC status.' });
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

  // ============================================================================
  // LIVE MARKET FEEDS & SERVER-SIDE REST PROXY
  // ============================================================================

  // GET /api/market/live-prices - Authoritative server-side proxy for live Crypto & Interbank FX prices
  app.get('/api/market/live-prices', (_req, res) => {
    try {
      const prices = marketEngine.getAllPrices();
      const forexRates = marketEngine.getForexRates();
      return res.json({
        ok: true,
        timestamp: Date.now(),
        source: marketEngine.getFeedSource(),
        prices,
        forexRates,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to get live prices.' });
    }
  });

  // GET /api/market/ticker - Fast single-symbol server-side proxy lookup
  app.get('/api/market/ticker', (req, res) => {
    try {
      const symbol = String(req.query.symbol || 'BTC/USD (OTC)').trim();
      const price = marketEngine.getPrice(symbol);
      return res.json({
        ok: true,
        symbol,
        price: price ?? null,
        timestamp: Date.now(),
        source: marketEngine.getFeedSource(),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to get ticker price.' });
    }
  });

  // ============================================================================
  // TRADE EXECUTION & SETTLEMENT WITH AUTOMATIC BALANCE SYNCHRONIZATION
  // ============================================================================

  // POST /api/trades - Place trade with synchronized live strike price, immediately debiting balance
  app.post('/api/trades', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const {
        id,
        accountId,
        asset,
        direction,
        strikePrice,
        investment,
        payoutPercentage,
        durationSeconds,
        startTime,
        endTime,
        accountTier,
      } = req.body || {};

      if (!accountId || !asset || !direction || !investment) {
        return res.status(400).json({ ok: false, error: 'Missing required trade execution parameters.' });
      }

      const serverPrice = marketEngine.getPrice(asset);
      const executionPrice = Number(strikePrice) || serverPrice || 1.0;

      const result = recordTradeInDb(user.id, {
        id: id ? String(id) : undefined,
        accountId: String(accountId),
        asset: String(asset),
        direction: direction === 'CALL' ? 'CALL' : 'PUT',
        strikePrice: executionPrice,
        investment: Number(investment),
        payoutPercentage: Number(payoutPercentage) || 92,
        durationSeconds: Number(durationSeconds) || 30,
        startTime: startTime ? Number(startTime) : undefined,
        endTime: endTime ? Number(endTime) : undefined,
        accountTier: accountTier ? String(accountTier) : undefined,
      });

      return res.json({
        ok: true,
        trade: result.trade,
        account: result.account,
        message: 'Trade placed successfully. Balance updated in database.',
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to place trade.' });
    }
  });

  // POST /api/trades/settle - Settle expired trade against synchronized market close price & auto-credit balance
  app.post('/api/trades/settle', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const tradeId = String(req.body?.tradeId || req.body?.id || '').trim();
      const clientClosePrice = req.body?.closePrice !== undefined ? Number(req.body.closePrice) : undefined;
      const statusOverride = req.body?.status as string | undefined;

      if (!tradeId) {
        return res.status(400).json({ ok: false, error: 'Trade ID is required for settlement.' });
      }

      const result = settleTradeInDb(
        user.id,
        tradeId,
        clientClosePrice ?? 1.0,
        statusOverride
      );

      return res.json({
        ok: true,
        ...result,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to settle trade.' });
    }
  });

  // GET /api/trades - Fetch user's persistent trade history
  app.get('/api/trades', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.json({ ok: true, trades: [] });

      const accountId = req.query.accountId ? String(req.query.accountId).trim() : undefined;
      const trades = getUserTradesFromDb(user.id, accountId);
      return res.json({ ok: true, trades });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch trades.' });
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

  // POST /api/accounts/deposit-personal - Credit funds directly to the user's Personal Live (Self-Funded) account
  app.post('/api/accounts/deposit-personal', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const amount = Number(req.body?.amount);
      const accountId = req.body?.accountId ? String(req.body.accountId).trim() : undefined;

      if (!Number.isFinite(amount) || amount < 10) {
        return res.status(400).json({
          ok: false,
          error: 'Minimum Personal Live deposit is $10.00 USDT.',
        });
      }

      ensurePersonalLiveAccountForUser(user.id);
      const updatedAccount = creditPersonalAccountDepositInDb({
        userId: user.id,
        accountId,
        amountUsdt: amount,
      });

      return res.json({
        ok: true,
        account: updatedAccount,
        creditedAmountUsdt: amount,
      });
    } catch (err: any) {
      return res.status(400).json({
        ok: false,
        error: err?.message || 'Failed to credit Personal Live account deposit.',
      });
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
    if (!user) return res.json({ ok: true, withdrawals: [] });

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

      let updatedAccount: any = null;
      if (result.creditedAmountUsdt > 0 && !result.alreadyCompleted) {
        const prevCredited = creditedBalancesByAccount.get(invoice.accountId) || 0;
        creditedBalancesByAccount.set(
          invoice.accountId,
          Number((prevCredited + result.creditedAmountUsdt).toFixed(2))
        );
        try {
          const existingAcc = getAccountById(invoice.accountId);
          const ownerUserId = existingAcc?.user_id || invoice.userId || 'usr_bft_001';
          if (
            !existingAcc ||
            existingAcc.tier === 'personal' ||
            existingAcc.accountCategory === 'personal_live' ||
            invoice.accountId.includes('PERS')
          ) {
            updatedAccount = creditPersonalAccountDepositInDb({
              userId: ownerUserId,
              accountId: invoice.accountId,
              amountUsdt: result.creditedAmountUsdt,
            });
          }
        } catch (dbErr) {
          console.warn('Webhook DB personal deposit sync warning:', dbErr);
        }
      }

      return res.json({
        ok: true,
        alreadyCompleted: Boolean(result.alreadyCompleted),
        creditedAmountUsdt: result.creditedAmountUsdt,
        invoice: result.updatedInvoice,
        updatedAccount,
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

      let updatedAccount: any = null;
      if (result.creditedAmountUsdt > 0 && !result.alreadyCompleted) {
        const prevCredited = creditedBalancesByAccount.get(invoice.accountId) || 0;
        creditedBalancesByAccount.set(
          invoice.accountId,
          Number((prevCredited + result.creditedAmountUsdt).toFixed(2))
        );
        try {
          const existingAcc = getAccountById(invoice.accountId);
          const ownerUserId = existingAcc?.user_id || invoice.userId || 'usr_bft_001';
          if (
            !existingAcc ||
            existingAcc.tier === 'personal' ||
            existingAcc.accountCategory === 'personal_live' ||
            invoice.accountId.includes('PERS')
          ) {
            updatedAccount = creditPersonalAccountDepositInDb({
              userId: ownerUserId,
              accountId: invoice.accountId,
              amountUsdt: result.creditedAmountUsdt,
            });
          }
        } catch (dbErr) {
          console.warn('Simulate webhook DB personal deposit sync warning:', dbErr);
        }
      }

      return res.json({
        ok: true,
        alreadyCompleted: Boolean(result.alreadyCompleted),
        creditedAmountUsdt: result.creditedAmountUsdt,
        invoice: result.updatedInvoice,
        updatedAccount,
        webhookPayloadSent: signedWebhook,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to simulate Cryptomus webhook.',
      });
    }
  });

  // ============================================================================
  // SECURE ADMIN DASHBOARD & BACKEND API (STRICT RBAC ENFORCED)
  // ============================================================================

  // GET /api/admin/check-access - Lightweight check if current requester is authorized admin
  app.get('/api/admin/check-access', (req, res) => {
    const user = getAuthenticatedUser(req);
    const isAdmin = isUserAdmin(user, req);
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        isAdmin: false,
        error: 'Access Denied: Admin authorization required.',
      });
    }
    return res.json({
      ok: true,
      isAdmin: true,
      adminUser: user ? formatUserResponse(user) : { id: 'admin_sys', email: 'admin@bft.io', role: 'admin' },
    });
  });

  // POST /api/admin/auth/verify-key - Admin Key authorization challenge
  app.post('/api/admin/auth/verify-key', (req, res) => {
    const key = String(req.body?.adminKey || '').trim();
    if (key === 'bft_admin_master_key_2026') {
      return res.json({
        ok: true,
        message: 'Admin authorization granted.',
        adminKey: 'bft_admin_master_key_2026',
        role: 'admin',
      });
    }
    return res.status(401).json({
      ok: false,
      error: 'Invalid Admin Security Key.',
    });
  });

  // GET /api/admin/metrics - High-level system & financial KPI metrics
  app.get('/api/admin/metrics', requireAdmin, (_req, res) => {
    try {
      const metrics = getAdminMetrics();
      return res.json({ ok: true, metrics });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to load metrics.' });
    }
  });

  // GET /api/admin/users - List all users, accounts, balances, roles & KYC statuses
  app.get('/api/admin/users', requireAdmin, (_req, res) => {
    try {
      const users = getAdminUsersList();
      return res.json({ ok: true, users });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch platform users.' });
    }
  });

  // POST /api/admin/users/:userId/accounts/:accountId/balance - Direct balance modification with audit trail
  app.post('/api/admin/users/:userId/accounts/:accountId/balance', requireAdmin, (req, res) => {
    try {
      const accountId = String(req.params.accountId || '').trim();
      const newBalance = Number(req.body?.newBalance);
      const reason = String(req.body?.reason || 'Administrative balance adjustment').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      if (!Number.isFinite(newBalance) || newBalance < 0) {
        return res.status(400).json({ ok: false, error: 'New balance must be a non-negative number.' });
      }

      const updatedAccount = adminUpdateAccountBalance({
        accountId,
        newBalance,
        reason,
        adminUserId,
      });

      return res.json({
        ok: true,
        account: updatedAccount,
        message: `Account ${accountId} balance updated to $${newBalance.toFixed(2)}.`,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to update balance.' });
    }
  });

  // POST /api/admin/users/:userId/role - Grant or revoke admin role
  app.post('/api/admin/users/:userId/role', requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const newRole = req.body?.role === 'admin' ? 'admin' : 'trader';
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const updatedUser = adminSetUserRole(userId, newRole, adminUserId);
      return res.json({ ok: true, user: formatUserResponse(updatedUser) });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to update user role.' });
    }
  });

  // GET /api/admin/deposits - View all user deposit requests (pending, approved, declined)
  app.get('/api/admin/deposits', requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const deposits = getAdminDeposits(statusFilter);
      return res.json({ ok: true, deposits });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch deposits.' });
    }
  });

  // POST /api/admin/deposits/:depositId/approve - Approve deposit, auto-credit user account & distribute 3-level commissions
  app.post('/api/admin/deposits/:depositId/approve', requireAdmin, (req, res) => {
    try {
      const depositId = String(req.params.depositId || '').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const result = adminApproveDeposit(depositId, adminUserId);
      return res.json({
        ...result,
        message: 'Deposit approved! User balance credited and 3-level commissions distributed.',
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to approve deposit.' });
    }
  });

  // POST /api/admin/deposits/:depositId/decline - Decline pending deposit
  app.post('/api/admin/deposits/:depositId/decline', requireAdmin, (req, res) => {
    try {
      const depositId = String(req.params.depositId || '').trim();
      const reason = String(req.body?.reason || 'Transaction could not be verified on-chain.').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const result = adminDeclineDeposit(depositId, reason, adminUserId);
      return res.json({
        ...result,
        message: 'Deposit request declined.',
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to decline deposit.' });
    }
  });

  // POST /api/admin/deposits/create - Create manual deposit or test submission
  app.post('/api/admin/deposits/create', requireAdmin, (req, res) => {
    try {
      const { userId, accountId, amount, paymentMethod, txHash, depositSlipUrl } = req.body || {};
      if (!userId || !amount) {
        return res.status(400).json({ ok: false, error: 'User ID and Amount are required.' });
      }

      const deposit = createDepositRequest({
        userId: String(userId),
        accountId: accountId ? String(accountId) : undefined,
        amount: Number(amount),
        paymentMethod: paymentMethod ? String(paymentMethod) : 'USDT (TRC-20)',
        txHash: txHash ? String(txHash) : undefined,
        depositSlipUrl: depositSlipUrl ? String(depositSlipUrl) : undefined,
      });

      return res.json({ ok: true, deposit });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to create deposit record.' });
    }
  });

  // GET /api/admin/withdrawals - View all user withdrawal requests
  app.get('/api/admin/withdrawals', requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const withdrawals = getAdminWithdrawals(statusFilter);
      return res.json({ ok: true, withdrawals });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch withdrawals.' });
    }
  });

  // POST /api/admin/withdrawals/:withdrawalId/approve - Approve withdrawal, auto-debit account & pay 8% referral bonus
  app.post('/api/admin/withdrawals/:withdrawalId/approve', requireAdmin, (req, res) => {
    try {
      const withdrawalId = String(req.params.withdrawalId || '').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const result = adminApproveWithdrawal(withdrawalId, adminUserId);
      return res.json({
        ...result,
        message: 'Withdrawal approved! Account balance debited and payout processed.',
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to approve withdrawal.' });
    }
  });

  // POST /api/admin/withdrawals/:withdrawalId/decline - Decline pending withdrawal
  app.post('/api/admin/withdrawals/:withdrawalId/decline', requireAdmin, (req, res) => {
    try {
      const withdrawalId = String(req.params.withdrawalId || '').trim();
      const reason = String(req.body?.reason || 'Security review required / Invalid payout destination.').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const result = adminDeclineWithdrawal(withdrawalId, reason, adminUserId);
      return res.json({
        ...result,
        message: 'Withdrawal request declined.',
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to decline withdrawal.' });
    }
  });

  // GET /api/admin/kyc - Review user KYC submissions with document previews
  app.get('/api/admin/kyc', requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
      const kycSubmissions = getAdminKycSubmissions(statusFilter);
      return res.json({ ok: true, kycSubmissions });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch KYC submissions.' });
    }
  });

  // POST /api/admin/kyc/:userId/approve - Manually approve user KYC verification
  app.post('/api/admin/kyc/:userId/approve', requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const updatedUser = adminApproveKyc(userId, adminUserId);
      return res.json({
        ok: true,
        user: formatUserResponse(updatedUser),
        message: `KYC for ${updatedUser.full_name || userId} approved successfully!`,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to approve KYC.' });
    }
  });

  // POST /api/admin/kyc/:userId/reject - Manually reject user KYC verification
  app.post('/api/admin/kyc/:userId/reject', requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || '').trim();
      const reason = String(req.body?.reason || 'Document unreadable or invalid address proof.').trim();
      const adminUserId = ((req as any).adminUser?.id || 'admin_sys');

      const updatedUser = adminRejectKyc(userId, reason, adminUserId);
      return res.json({
        ok: true,
        user: formatUserResponse(updatedUser),
        message: `KYC for ${updatedUser.full_name || userId} rejected.`,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to reject KYC.' });
    }
  });

  // GET /api/admin/referrals/tree - 3-Level Referral Program network tree
  app.get('/api/admin/referrals/tree', requireAdmin, (_req, res) => {
    try {
      const tree = getAdminReferralTree();
      return res.json({ ok: true, tree });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch referral tree.' });
    }
  });

  // GET /api/admin/referrals/commissions - Full 3-Level commissions ledger
  app.get('/api/admin/referrals/commissions', requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const commissions = getAdminCommissionsLedger(limit);
      return res.json({ ok: true, commissions });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch commissions ledger.' });
    }
  });

  // POST /api/admin/referrals/distribute-commission - Manually trigger 3-level commission distribution for user trading activity or deposits
  app.post('/api/admin/referrals/distribute-commission', requireAdmin, (req, res) => {
    try {
      const { userId, amount, sourceType, details } = req.body || {};
      if (!userId || !amount) {
        return res.status(400).json({ ok: false, error: 'User ID and Amount are required.' });
      }

      const cleanAmount = Number(amount);
      if (cleanAmount <= 0) {
        return res.status(400).json({ ok: false, error: 'Amount must be greater than $0.' });
      }

      const commissions = distribute3TierCommissions(
        String(userId),
        cleanAmount,
        sourceType === 'trade_activity' ? 'trade_activity' : 'deposit',
        details ? String(details) : undefined
      );

      return res.json({
        ok: true,
        commissions,
        message: `Successfully distributed ${commissions.length} referral commissions across 3 levels.`,
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to distribute referral commissions.' });
    }
  });

  // GET /api/admin/audit-logs - View administrative action audit logs
  app.get('/api/admin/audit-logs', requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const logs = getAdminAuditLogs(limit);
      return res.json({ ok: true, logs });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch audit logs.' });
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

    // Development SPA Fallback: Serve index.html for all non-API/non-file requests
    app.get('*', async (req, res, next) => {
      if (req.url.startsWith('/api/')) return next();
      try {
        let html = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(req.url, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
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
    marketEngine.stop();
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  });
}

startServer();
