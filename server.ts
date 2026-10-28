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
  lockUserProfile,
  updateUserKycStatus,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
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
const invoicesByUuid = new Map<string, CryptomusDepositInvoice>();
const invoicesByOrderId = new Map<string, CryptomusDepositInvoice>();
const creditedBalancesByAccount = new Map<string, number>();

// Seed one completed historical Cryptomus deposit so the history table is populated out of the box
const seededInvoice: CryptomusDepositInvoice = {
  ...createCryptomusInvoiceObject({
    amount: 500,
    accountId: 'BFT-91823',
    userId: 'usr_bft_001',
    orderId: 'BFT-DEP-91823-SEED01',
    uuid: 'c7a89012-45b1-48f2-a319-884019283746',
    nowMs: Date.now() - 86400000 * 3,
  }),
  status: 'completed',
  txHash: '8f4c9102ab7712e9038471c2b9012e88a34c91b823f91b4c8812e9032a7781c2',
  completedAt: Date.now() - 86400000 * 3 + 95000,
};
invoicesByUuid.set(seededInvoice.uuid, seededInvoice);
invoicesByOrderId.set(seededInvoice.orderId, seededInvoice);

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

  // ============================================================================
  // AUTHENTICATION & SESSION MANAGEMENT
  // ============================================================================

  // POST /api/auth/google - Authenticate or register with Google OAuth
  app.post('/api/auth/google', (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const fullName = String(req.body?.name || req.body?.fullName || 'BFT Trader').trim();
      const avatarUrl = req.body?.avatarUrl ? String(req.body.avatarUrl).trim() : undefined;
      const googleId = req.body?.googleId ? String(req.body.googleId).trim() : undefined;
      const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim().toUpperCase() : null;
      const rememberMe = req.body?.rememberMe !== false;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'Valid email is required for Google Sign-In.' });
      }

      const user = createOrUpdateGoogleUser({
        email,
        fullName,
        avatarUrl,
        googleId,
        referralCodeInput: referralCode,
      });

      const { token, expiresAt } = createSessionToken(user.id, rememberMe);
      const maxAgeMs = expiresAt - Date.now();

      // Set secure HTTP-only session cookie
      res.setHeader(
        'Set-Cookie',
        `bft_session=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; HttpOnly; SameSite=Lax`
      );

      const accounts = getAccountsForUser(user.id);

      return res.json({
        ok: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          referralCode: user.referral_code,
          referredBy: user.referred_by,
          kycStatus: user.kyc_status,
          kycDocType: user.kyc_doc_type,
          profileLocked: Boolean(user.profile_locked),
          address: user.address,
          dateOfBirth: user.date_of_birth,
          country: user.country,
          telegramHandle: user.telegram_handle,
        },
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
      return res.status(401).json({ ok: false, error: 'Unauthenticated' });
    }

    const accounts = getAccountsForUser(user.id);
    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        referralCode: user.referral_code,
        referredBy: user.referred_by,
        kycStatus: user.kyc_status,
        kycDocType: user.kyc_doc_type,
        profileLocked: Boolean(user.profile_locked),
        address: user.address,
        dateOfBirth: user.date_of_birth,
        country: user.country,
        telegramHandle: user.telegram_handle,
      },
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

  // POST /api/profile/lock - Permanently lock Full Name, Address, and Date of Birth
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
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          referralCode: updated.referral_code,
          kycStatus: updated.kyc_status,
          profileLocked: Boolean(updated.profile_locked),
          address: updated.address,
          dateOfBirth: updated.date_of_birth,
          country: updated.country,
          telegramHandle: updated.telegram_handle,
        },
      });
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Failed to lock personal details.' });
    }
  });

  // POST /api/kyc/submit - Submit KYC documents and update verification status
  app.post('/api/kyc/submit', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      if (!user.profile_locked) {
        return res.status(400).json({ ok: false, error: 'You must first save and permanently lock your Full Name, Address, and DOB.' });
      }

      const docType = String(req.body?.docType || 'Passport').trim();
      const updated = updateUserKycStatus(user.id, {
        status: 'verified',
        docType,
      });

      return res.json({
        ok: true,
        user: {
          id: updated.id,
          kycStatus: updated.kyc_status,
          kycDocType: updated.kyc_doc_type,
          profileLocked: Boolean(updated.profile_locked),
        },
        message: 'KYC Verification approved! Withdrawals unlocked.',
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

  // POST /api/accounts/purchase - Purchase challenge or instant funded account with 3-tier commission distribution
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

      const accountId = `BFT-${Math.floor(10000 + Math.random() * 89999)}`;
      const now = Date.now();
      const nowIso = new Date(now).toISOString().split('T')[0];

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
        tier === 'instant' ? 5 : 5,
        tier === 'instant' ? 12 : 10,
        tier === 'instant' ? 'funded' : 'phase_1',
        dailyWithdrawalsUnlocked ? 1 : 0,
        nowIso,
        now,
        now
      );

      // Automatically distribute 3-Tier commissions (10% L1, 5% L2, 2% L3)
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
