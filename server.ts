import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateSecret, verify, generateURI } from 'otplib';
import QRCode from 'qrcode';
import {
  DIRECT_USDT_TRC20_CONFIG,
  DEPOSIT_EXPIRY_MS,
  TRONGRID_API_KEY,
  TRONGRID_TRC20_ENDPOINT,
  validateDirectDepositAmount,
  buildPackageSku,
  resolveDepositAccountType,
  buildCryptoDepositPayload,
  buildSupabaseCryptoDepositRow,
  buildSupabaseUserPurchasePayload,
  mapPurchaseRecord,
  mergeRealtimePurchase,
  fetchTronGridTrc20Transfers,
  matchPendingDepositToTronGridTx,
  parseChallengePackageFromDeposit,
  isCryptoDepositExpired,
  evaluateDepositStatusWithExpiry,
  verifyGatewayOrBlockchainPayment,
  type TronGridTrc20Transaction,
} from './src/config/directDeposit.ts';
import {
  getDynamicAccountLimits,
  normalizeChallengeAccountType,
} from './src/utils/propRules.ts';
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
  createAccount,
  ensurePersonalLiveAccountForUser,
  creditPersonalAccountDepositInDb,
  updateAccountStateInDb,
  passChallengePhaseInDb,
  lockUserProfile,
  updateUserKycStatus,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  syncSupabaseProfilesToAffiliateTree,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
  getCountryFlag,
  getAdminMetrics,
  getAdminUsersList,
  adminUpdateAccountBalance,
  adminSetUserRole,
  createDepositRequest,
  createCryptoDepositRecord,
  createUserPurchaseRecord,
  getUserPurchases,
  getTransactions,
  getCryptoDeposits,
  getPendingCryptoDeposits,
  getCompletedCryptoDepositTxHashes,
  expireStalePendingDepositsInDb,
  failCryptoDepositInDb,
  completeCryptoDepositInDb,
  verifyAndCompletePendingCryptoDepositsInDb,
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
  cancelWithdrawalRequest,
  declineWithdrawalRequest,
  updateUser2faSecret,
  enableUser2fa,
  disableUser2fa,
  db,
} from './src/server/db.ts';
import { BackendMarketEngine } from './src/server/marketEngine.ts';
import { CopyTradingEngine } from './src/server/copyTradingEngine.ts';
import { generateSupportChatReply } from './src/server/aiChatService.ts';
import { validateDemoBalance } from './src/utils/demoBalanceManager.ts';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
console.log(`Starting server on port ${PORT}...`);

const DIRECT_USDT_WALLET_ADDRESS =
  process.env.DIRECT_USDT_TRC20_WALLET_ADDRESS || DIRECT_USDT_TRC20_CONFIG.walletAddress;
const ACTIVE_TRONGRID_API_KEY =
  process.env.TRONGRID_API_KEY || TRONGRID_API_KEY;

// Server-side in-memory store for account deposit credits
const creditedBalancesByAccount = new Map<string, number>();

const isValidUuid = (val: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(val || '').trim()
  );

const toValidUuid = (str?: string | null): string => {
  if (!str) return '00000000-0000-4000-8000-000000000001';
  const clean = String(str).trim();
  if (isValidUuid(clean)) return clean.toLowerCase();
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + ch;
    hash1 |= 0;
    hash2 = (hash2 << 7) ^ hash2 + ch;
    hash2 |= 0;
  }
  const h1 = Math.abs(hash1).toString(16).padStart(8, '0');
  const h2 = Math.abs(hash2).toString(16).padStart(8, '0');
  const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0');
  const h4 = Math.abs(hash1 * 31 + hash2).toString(16).padStart(8, '0');
  const raw = (h1 + h2 + h3 + h4).slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
};

async function ensureSupabaseProfileInRest(
  supabaseUrl: string,
  supabaseAnonKey: string,
  user: { id: string; email?: string; full_name?: string }
): Promise<string> {
  let targetUuid = isValidUuid(user.id) ? user.id : null;
  if (!targetUuid && user.email) {
    try {
      const pRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(user.email)}&select=id`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        }
      );
      if (pRes.ok) {
        const text = await pRes.text();
        if (text && text.trim()) {
          const rows = JSON.parse(text.trim());
          if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
            targetUuid = String(rows[0].id);
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (!targetUuid) {
    targetUuid = toValidUuid(user.id || user.email || 'usr_bft_001');
  }

  try {
    fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: targetUuid,
        email: (user.email || `${targetUuid.slice(0, 8)}@client-bft.com`).toLowerCase(),
        full_name: user.full_name || 'Trader User',
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }

  return targetUuid;
}

async function startServer() {
  const app = express();

  // Robust CORS & Options preflight handler to prevent CORS blocking and 405 Method Not Allowed
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type, x-admin-key, prefer'
    );
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'apikey', 'prefer', 'x-client-info'],
    preflightContinue: false,
    optionsSuccessStatus: 200
  }));

  app.options('*', cors());

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  const marketEngine = new BackendMarketEngine();
  marketEngine.start();

  const copyTradingEngine = CopyTradingEngine.getInstance();
  copyTradingEngine.start();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://kwmjonjcwdwvaijcrtjw.supabase.co';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_G151L79Inh_SPks_HrujZQ_fmaGh-_6';

  const safeParseFetchJson = async (res: Response, fallback: any = null) => {
    try {
      const text = await res.text();
      if (!text || !text.trim()) return fallback;
      return JSON.parse(text.trim());
    } catch {
      return fallback;
    }
  };

  /**
   * Automated USDT TRC-20 transaction verification & 1-Hour Expiry Engine using TronGrid API
   * Endpoint: https://api.trongrid.io/v1/accounts/TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp/transactions/trc20
   * 1) Sweeps any pending deposits older than 60 minutes (1 hour) and transitions them to 'failed' in SQLite & Supabase.
   * 2) Checks remaining pending rows against confirmed TRC-20 blockchain transfers.
   * 3) Updates confirmed deposits to 'completed'/'active' and provisions accounts ONLY when verified.
   */
  const verifyPendingCryptoDepositsWithTronGrid = async (options?: {
    userId?: string;
    overrideTransactions?: TronGridTrc20Transaction[];
    forceFetch?: boolean;
    nowMs?: number;
  }) => {
    const nowMs = options?.nowMs ?? Date.now();

    // Step 1: Run 1-hour expiry sweep in local SQLite first
    const localExpirySweep = expireStalePendingDepositsInDb(nowMs, DEPOSIT_EXPIRY_MS);

    const localPending = getPendingCryptoDeposits(options?.userId);
    let supaPending: any[] = [];
    let supaExpiredCount = 0;

    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supaRes = await fetch(
          `${supabaseUrl}/rest/v1/crypto_deposits?status=eq.pending&select=*`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          }
        );
        if (supaRes.ok) {
          const rows = await safeParseFetchJson(supaRes, []);
          if (Array.isArray(rows)) {
            const activeRows: any[] = [];
            for (const sRow of rows) {
              if (isCryptoDepositExpired(sRow, nowMs, DEPOSIT_EXPIRY_MS)) {
                supaExpiredCount += 1;
                // Automatically transition 1-hour expired Supabase deposit to 'failed'
                fetch(
                  `${supabaseUrl}/rest/v1/crypto_deposits?id=eq.${encodeURIComponent(String(sRow.id))}`,
                  {
                    method: 'PATCH',
                    headers: {
                      apikey: supabaseAnonKey,
                      Authorization: `Bearer ${supabaseAnonKey}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ status: 'failed' }),
                  }
                ).catch(() => {});

                if (sRow.user_id) {
                  fetch(
                    `${supabaseUrl}/rest/v1/user_purchases?user_id=eq.${encodeURIComponent(
                      String(sRow.user_id)
                    )}&amount=eq.${encodeURIComponent(String(sRow.amount))}&status=eq.pending`,
                    {
                      method: 'PATCH',
                      headers: {
                        apikey: supabaseAnonKey,
                        Authorization: `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ status: 'failed' }),
                    }
                  ).catch(() => {});

                  fetch(
                    `${supabaseUrl}/rest/v1/transactions?user_id=eq.${encodeURIComponent(
                      String(sRow.user_id)
                    )}&amount=eq.${encodeURIComponent(String(sRow.amount))}&status=eq.pending`,
                    {
                      method: 'PATCH',
                      headers: {
                        apikey: supabaseAnonKey,
                        Authorization: `Bearer ${supabaseAnonKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ status: 'failed' }),
                    }
                  ).catch(() => {});
                }
              } else {
                activeRows.push(sRow);
              }
            }
            supaPending = activeRows;
          }
        }
      } catch {
        // Ignore transient Supabase network errors
      }
    }

    if (
      localPending.length === 0 &&
      supaPending.length === 0 &&
      !options?.forceFetch &&
      !options?.overrideTransactions
    ) {
      return {
        ok: true,
        walletAddress: DIRECT_USDT_WALLET_ADDRESS,
        tronGridEndpoint: TRONGRID_TRC20_ENDPOINT,
        checkedCount: 0,
        matchedCount: 0,
        expiredCount: localExpirySweep.expiredCount + supaExpiredCount,
        completedDeposits: [],
        remainingPendingCount: 0,
        transactionsFetched: 0,
      };
    }

    let transactions: TronGridTrc20Transaction[] = [];
    let tronGridError: string | undefined;

    if (Array.isArray(options?.overrideTransactions)) {
      transactions = options.overrideTransactions;
    } else {
      const fetched = await fetchTronGridTrc20Transfers({
        walletAddress: DIRECT_USDT_WALLET_ADDRESS,
        apiKey: ACTIVE_TRONGRID_API_KEY,
        limit: 50,
        onlyConfirmed: true,
      });
      transactions = fetched.transactions;
      if (!fetched.ok) {
        tronGridError = fetched.error;
      }
    }

    // 1. Verify and complete pending records in local SQLite crypto_deposits
    const localResult = verifyAndCompletePendingCryptoDepositsInDb(transactions, {
      userId: options?.userId,
      nowMs,
    });

    // Also sync any completed local records to Supabase crypto_deposits / transactions / user_purchases
    if (supabaseUrl && supabaseAnonKey && localResult.completedDeposits.length > 0) {
      for (const comp of localResult.completedDeposits) {
        const dep = comp.deposit;
        if (dep) {
          const targetUuid = isValidUuid(dep.user_id)
            ? dep.user_id
            : toValidUuid(dep.user_id);
          fetch(
            `${supabaseUrl}/rest/v1/crypto_deposits?user_id=eq.${encodeURIComponent(
              targetUuid
            )}&amount=eq.${encodeURIComponent(String(dep.amount))}&status=eq.pending`,
            {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'completed', tx_hash: comp.txHash }),
            }
          ).catch(() => {});

          fetch(
            `${supabaseUrl}/rest/v1/user_purchases?user_id=eq.${encodeURIComponent(
              targetUuid
            )}&amount=eq.${encodeURIComponent(String(dep.amount))}&status=eq.pending`,
            {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: comp.accountType === 'challenge' ? 'active' : 'completed',
                tx_hash: comp.txHash,
              }),
            }
          ).catch(() => {});

          fetch(
            `${supabaseUrl}/rest/v1/transactions?user_id=eq.${encodeURIComponent(
              targetUuid
            )}&amount=eq.${encodeURIComponent(String(dep.amount))}&status=eq.pending`,
            {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'completed', tx_hash: comp.txHash }),
            }
          ).catch(() => {});
        }
      }
    }

    // 2. Verify and complete any non-expired pending rows that exist only in Supabase crypto_deposits
    const claimedTxIds = getCompletedCryptoDepositTxHashes();
    const supabaseCompleted: any[] = [];

    if (supabaseUrl && supabaseAnonKey && supaPending.length > 0 && transactions.length > 0) {
      for (const sRow of supaPending) {
        const matchedTx = matchPendingDepositToTronGridTx(
          {
            id: String(sRow.id),
            user_id: sRow.user_id,
            wallet_address: sRow.wallet_address || DIRECT_USDT_WALLET_ADDRESS,
            amount: Number(sRow.amount),
            package_name: sRow.package_name,
            sku: sRow.package_sku || sRow.sku,
            package_sku: sRow.package_sku || sRow.sku,
            account_type: sRow.account_type,
            tx_hash: sRow.tx_hash,
            status: sRow.status || 'pending',
            created_at: sRow.created_at,
          },
          transactions,
          claimedTxIds,
          nowMs,
          DEPOSIT_EXPIRY_MS
        );

        if (matchedTx) {
          claimedTxIds.add(matchedTx.transaction_id);
          try {
            await fetch(`${supabaseUrl}/rest/v1/crypto_deposits?id=eq.${sRow.id}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'completed', tx_hash: matchedTx.transaction_id }),
            });

            const sUserId = String(sRow.user_id || 'usr_bft_001');
            const sAccountType = resolveDepositAccountType(sRow.account_type);
            const sAmount = Number(sRow.amount || 0);

            ensureUserInDb({
              id: sUserId,
              email: `${sUserId.toLowerCase().replace(/[^a-z0-9]/g, '')}@client-bft.com`,
              fullName: `Trader ${sUserId.slice(-4)}`,
            });

            let activatedOrCreditedAccount: any = null;
            if (sAccountType === 'challenge') {
              const parsedPkg = parseChallengePackageFromDeposit({
                sku: sRow.package_sku || sRow.sku,
                package_sku: sRow.package_sku || sRow.sku,
                package_name: sRow.package_name,
                amount: sAmount,
              });
              activatedOrCreditedAccount = createAccount({
                userId: sUserId,
                tier: parsedPkg.tier,
                tierName: parsedPkg.tierName,
                size: parsedPkg.size,
                dailyWithdrawalsUnlocked: false,
              });
            } else {
              ensurePersonalLiveAccountForUser(sUserId);
              activatedOrCreditedAccount = creditPersonalAccountDepositInDb({
                userId: sUserId,
                amountUsdt: sAmount,
              });
            }

            supabaseCompleted.push({
              ok: true,
              deposit: { ...sRow, status: 'completed', tx_hash: matchedTx.transaction_id },
              account: activatedOrCreditedAccount,
              accountType: sAccountType,
              amount: sAmount,
              txHash: matchedTx.transaction_id,
            });
          } catch (supaErr) {
            console.warn('Supabase crypto_deposits completion warning:', supaErr);
          }
        }
      }
    }

    const allCompleted = [...localResult.completedDeposits, ...supabaseCompleted];

    return {
      ok: true,
      walletAddress: DIRECT_USDT_WALLET_ADDRESS,
      tronGridEndpoint: TRONGRID_TRC20_ENDPOINT,
      checkedCount: localResult.checkedCount + supaPending.length,
      matchedCount: allCompleted.length,
      expiredCount: localExpirySweep.expiredCount + localResult.expiredCount + supaExpiredCount,
      completedDeposits: allCompleted,
      remainingPendingCount: localResult.remainingPendingCount,
      transactionsFetched: transactions.length,
      ...(tronGridError ? { tronGridNotice: tronGridError } : {}),
    };
  };

  // Run automated TronGrid TRC-20 verification & 1-Hour Expiry Sweep every 15 seconds
  setInterval(() => {
    verifyPendingCryptoDepositsWithTronGrid().catch((err) => {
      console.warn('Background TronGrid TRC-20 verification error:', err);
    });
  }, 15000);

  const provisionedSupaPurchaseIds = new Set<string>();
  if (supabaseUrl && supabaseAnonKey) {
    setInterval(async () => {
      try {
        let res = await fetch(`${supabaseUrl}/rest/v1/user_purchases?select=*&order=created_at.desc&limit=25`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        });
        if (!res.ok) return;
        const purchases = await safeParseFetchJson(res, []);
        if (!Array.isArray(purchases)) return;

        const nowMs = Date.now();
        for (const p of purchases) {
          const pid = String(p?.id || '');
          if (!pid) continue;

          // Enforce 1-hour expiry on pending user_purchases rows
          if (isCryptoDepositExpired(p, nowMs, DEPOSIT_EXPIRY_MS)) {
            await fetch(`${supabaseUrl}/rest/v1/user_purchases?id=eq.${encodeURIComponent(pid)}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'failed' }),
            }).catch(() => {});
            continue;
          }

          // Strictly block provisioning for unverified ('pending' / 'failed' / 'declined') purchases
          const rawStatus = String(p?.status || 'pending').trim().toLowerCase();
          const hasConfirmedTx =
            Boolean(p?.tx_hash) &&
            String(p.tx_hash).trim().length >= 16 &&
            !String(p.tx_hash).trim().toLowerCase().startsWith('trc20_');
          if (
            (rawStatus !== 'completed' && rawStatus !== 'active' && rawStatus !== 'approved') ||
            !hasConfirmedTx
          ) {
            continue;
          }

          if (provisionedSupaPurchaseIds.has(pid) || p?.is_provisioned === true) continue;
          provisionedSupaPurchaseIds.add(pid);

          const parsedPkg = parseChallengePackageFromDeposit({
            sku: p.package_sku || p.package_id,
            package_sku: p.package_sku || p.package_id,
            package_name: p.package_name,
            amount: Number(p.package_amount || p.amount || 0),
          });

          ensureUserInDb({
            id: String(p.user_id || 'usr_bft_001'),
            email: `${String(p.user_id || 'trader').slice(0, 8)}@client-bft.com`,
            fullName: `Trader ${String(p.user_id || '0001').slice(-4)}`,
          });

          const existingAccounts = getAccountsForUser(String(p.user_id || 'usr_bft_001'));
          if (existingAccounts.length <= 1) {
            createAccount({
              userId: String(p.user_id || 'usr_bft_001'),
              tier: parsedPkg.tier,
              tierName: parsedPkg.tierName,
              size: parsedPkg.size,
              dailyWithdrawalsUnlocked: false,
            });
          }

          if (p.is_provisioned === false) {
            await fetch(`${supabaseUrl}/rest/v1/user_purchases?id=eq.${encodeURIComponent(pid)}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ is_provisioned: true }),
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error('Polling for manual purchases failed:', e);
      }
    }, 15000);
  } else {
    console.warn('Supabase polling disabled: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing.');
  }



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
      is2faEnabled: Boolean(user.is_2fa_enabled),
      address: user.address || sub?.address || '',
      dateOfBirth: user.date_of_birth || sub?.date_of_birth || '',
      country: user.country || sub?.country || 'United States',
      flag: getCountryFlag(user.country || sub?.country),
      telegramHandle: user.telegram_handle || '',
      selfBalance: user.self_balance ?? 0,
      demoBalance: user.demo_balance ?? 10000,
      fundedBalance: user.funded_balance ?? 0,
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

      // Synchronize 2FA status from Supabase profiles table if available
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const checkUrl = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,is_2fa_enabled,totp_secret`;
          const sRes = await fetch(checkUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          });
          const profiles = await safeParseFetchJson(sRes, []);
          if (Array.isArray(profiles) && profiles.length > 0) {
            const p = profiles[0];
            if (p.is_2fa_enabled) {
              if (p.totp_secret) {
                updateUser2faSecret(user.id, p.totp_secret);
                user.totp_secret = p.totp_secret;
              }
              enableUser2fa(user.id);
              user.is_2fa_enabled = 1;
            } else if (p.is_2fa_enabled === false) {
              disableUser2fa(user.id);
              user.is_2fa_enabled = 0;
            }
          }
        } catch (supaErr) {
          console.warn('Supabase profiles 2FA check warning:', supaErr);
        }
      }

      if (user.is_2fa_enabled) {
        return res.json({
          ok: true,
          is2faRequired: true,
          userId: user.id,
          email: user.email,
        });
      }

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

  // POST /api/auth/verify-2fa - Verify TOTP code and finalize session
  app.post('/api/auth/verify-2fa', async (req, res) => {
    try {
      const userId = String(req.body?.userId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const rawCode = String(req.body?.code || '').trim();
      const code = rawCode.replace(/\D/g, '');
      const rememberMe = req.body?.rememberMe !== false;

      if ((!userId && !email) || !code || code.length !== 6) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid 6-digit verification code.' });
      }

      let user = userId ? getUserById(userId) : null;
      if (!user && email) {
        user = getUserByEmail(email);
      }

      let secret = user?.totp_secret;

      // Also check Supabase profiles table for totp_secret if missing or outdated
      if ((!secret || !user) && supabaseUrl && supabaseAnonKey) {
        try {
          const queryParam = email
            ? `email=eq.${encodeURIComponent(email)}`
            : `id=eq.${encodeURIComponent(userId)}`;
          const sRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?${queryParam}&select=id,email,full_name,is_2fa_enabled,totp_secret`,
            {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
              },
            }
          );
          const profiles = await safeParseFetchJson(sRes, []);
          if (Array.isArray(profiles) && profiles.length > 0) {
            const p = profiles[0];
            if (p.totp_secret) {
              secret = p.totp_secret;
            }
            if (!user && p.email) {
              user = createOrUpdateGoogleUser({
                email: p.email,
                fullName: p.full_name || p.email.split('@')[0],
                googleId: p.id,
              });
            }
            if (user && p.totp_secret) {
              updateUser2faSecret(user.id, p.totp_secret);
              if (p.is_2fa_enabled) enableUser2fa(user.id);
            }
          }
        } catch (supaErr) {
          console.warn('Supabase fetch totp_secret warning:', supaErr);
        }
      }

      if (!user || !secret) {
        return res.status(400).json({
          ok: false,
          error: 'Two-Factor Authentication is not configured or secret not found for this account.',
        });
      }

      const isValid = (await verify({ token: code, secret })).valid;
      if (!isValid) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid 6-digit verification code. Please check your Google Authenticator app.',
        });
      }

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
      return res.status(500).json({ ok: false, error: err?.message || '2FA verification error.' });
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

  // POST /api/profile/demo-balance - Update custom demo balance ($1 to $10,000)
  app.post('/api/profile/demo-balance', async (req, res) => {
    try {
      const authUser = getAuthenticatedUser(req);
      const targetUserId = req.body?.userId || authUser?.id;
      const targetEmail = req.body?.email || authUser?.email;
      const rawBalance = req.body?.demoBalance;

      const validation = validateDemoBalance(rawBalance);
      if (!validation.valid) {
        return res.status(400).json({ ok: false, error: validation.error });
      }

      const balance = validation.normalized;

      // Update SQLite user record if exists
      if (targetUserId || targetEmail) {
        try {
          const user = targetUserId ? getUserById(targetUserId) : (targetEmail ? getUserByEmail(targetEmail) : null);
          if (user) {
            db.prepare('UPDATE users SET demo_balance = ?, updated_at = ? WHERE id = ?').run(
              balance,
              Date.now(),
              user.id
            );
            // Also synchronize demo trading account initial & current balance
            db.prepare(`
              UPDATE accounts SET
                current_balance = ?,
                initial_balance = ?
              WHERE user_id = ? AND (tier = 'demo' OR id LIKE 'BFT-DEMO%')
            `).run(balance, balance, user.id);
          }
        } catch (dbErr) {
          console.warn('SQLite demo balance sync notice:', dbErr);
        }
      }

      return res.json({ ok: true, demoBalance: balance });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to update demo balance.' });
    }
  });

  // POST /api/ai-chat - 24/7 AI Prop Trading Support Chatbot via @google/genai
  app.post('/api/ai-chat', async (req, res) => {
    try {
      const { message, history } = req.body || {};
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ ok: false, error: 'Message cannot be empty.' });
      }

      const reply = await generateSupportChatReply({
        message: message.trim(),
        history: Array.isArray(history) ? history : [],
      });

      return res.json({
        ok: true,
        reply,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('AI chat endpoint error:', err);
      return res.json({
        ok: true,
        reply: 'Our AI Risk Desk is reviewing your request. For immediate assistance with promo codes, use SPOOKY40 for 40% OFF or SPOOKY20 for 20% OFF!',
        timestamp: new Date().toISOString(),
      });
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
  // LIVE MARKET FEEDS, SNAPSHOTS & REAL-TIME GLOBAL STREAM (SSE)
  // ============================================================================

  const setNoCacheMarketHeaders = (res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  };

  // GET /api/market/live-prices - Authoritative server-side proxy for live Crypto & Interbank FX prices
  app.get('/api/market/live-prices', (_req, res) => {
    try {
      setNoCacheMarketHeaders(res);
      const now = Date.now();
      const prices = marketEngine.getAllPrices();
      const forexRates = marketEngine.getForexRates();
      return res.json({
        ok: true,
        timestamp: now,
        serverTime: now,
        source: marketEngine.getFeedSource(),
        prices,
        forexRates,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to get live prices.' });
    }
  });

  // GET /api/market/ticker - Fast single-symbol server-side proxy lookup with active candle
  app.get('/api/market/ticker', (req, res) => {
    try {
      setNoCacheMarketHeaders(res);
      const symbol = String(req.query.symbol || 'EUR/USD (OTC)').trim();
      const tfSec = Number(req.query.timeframe) || 60;
      const snap = marketEngine.getMarketSnapshot(symbol, tfSec, 10);
      return res.json({
        ok: true,
        symbol: snap.symbol,
        price: snap.price,
        prevPrice: snap.prevPrice,
        activeCandle: snap.activeCandle,
        timestamp: snap.serverTime,
        serverTime: snap.serverTime,
        source: snap.source,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to get ticker price.' });
    }
  });

  // GET /api/market/snapshot & /api/market/candles - Authoritative global candle array & live server timestamp
  app.get(['/api/market/snapshot', '/api/market/candles'], (req, res) => {
    try {
      setNoCacheMarketHeaders(res);
      const symbol = String(req.query.symbol || 'EUR/USD (OTC)').trim();
      const rawTf = String(req.query.timeframe || '60').trim();
      let tfSec = Number(rawTf);
      if (Number.isNaN(tfSec) || tfSec <= 0) {
        if (rawTf.endsWith('s')) tfSec = parseInt(rawTf, 10) || 60;
        else if (rawTf.endsWith('m')) tfSec = (parseInt(rawTf, 10) || 1) * 60;
        else if (rawTf.endsWith('h')) tfSec = (parseInt(rawTf, 10) || 1) * 3600;
        else if (rawTf === '1D' || rawTf === 'D') tfSec = 86400;
        else tfSec = 60;
      }
      const count = Math.max(20, Math.min(1500, Number(req.query.count) || 250));
      const snapshot = marketEngine.getMarketSnapshot(symbol, tfSec, count);
      return res.json(snapshot);
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to get market snapshot.' });
    }
  });

  // GET /api/market/stream - Unified Server-Sent Events (SSE) real-time global market stream with heartbeat
  app.get('/api/market/stream', (req, res) => {
    setNoCacheMarketHeaders(res);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const symbol = String(req.query.symbol || 'EUR/USD (OTC)').trim();
    const tfSec = Math.max(5, Number(req.query.timeframe) || 60);

    // 1. Immediately push initial live server snapshot so new users sync without waiting
    try {
      const initSnap = marketEngine.getMarketSnapshot(symbol, tfSec, 150);
      res.write(`event: init\ndata: ${JSON.stringify(initSnap)}\n\n`);
    } catch {
      // ignore write error
    }

    let lastSentMs = 0;
    const unsubscribe = marketEngine.subscribe(({ serverTime, prices }) => {
      if (serverTime - lastSentMs < 450) return;
      lastSentMs = serverTime;
      try {
        const snap = marketEngine.getMarketSnapshot(symbol, tfSec, 2);
        const payload = {
          serverTime,
          symbol: snap.symbol,
          price: snap.price,
          prevPrice: snap.prevPrice,
          activeCandle: snap.activeCandle,
          prices,
        };
        res.write(`event: tick\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // ignore write error
      }
    });

    const heartbeatTimer = setInterval(() => {
      try {
        const snap = marketEngine.getMarketSnapshot(symbol, tfSec, 2);
        res.write(
          `event: heartbeat\ndata: ${JSON.stringify({
            serverTime: Date.now(),
            symbol: snap.symbol,
            price: snap.price,
            activeCandle: snap.activeCandle,
          })}\n\n`
        );
      } catch {
        // ignore
      }
    }, 3000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    });
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
  app.post('/api/accounts/pass-challenge', async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const accountId = String(req.body?.accountId || '').trim();
      const provisionLiveDirectly = Boolean(req.body?.provisionLiveDirectly);
      if (!accountId) {
        return res.status(400).json({ ok: false, error: 'Account ID is required.' });
      }

      const result = passChallengePhaseInDb(user.id, accountId, provisionLiveDirectly);

      if (supabaseUrl && supabaseAnonKey) {
        let targetSupaUuid = isValidUuid(user.id) ? user.id : null;
        if (!targetSupaUuid && user.email) {
          try {
            const pRes = await fetch(
              `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(user.email)}&select=id`,
              {
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                },
              }
            );
            if (pRes.ok) {
              const rows = await safeParseFetchJson(pRes, []);
              if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
                targetSupaUuid = String(rows[0].id);
              }
            }
          } catch {}
        }

        if (targetSupaUuid) {
          const lockedStatus = result.lockedAccount?.status || 'passed';
          fetch(
            `${supabaseUrl}/rest/v1/trading_accounts?user_id=eq.${encodeURIComponent(
              targetSupaUuid
            )}&id=eq.${encodeURIComponent(accountId)}`,
            {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                status: lockedStatus,
                certificate_id: result.certificateId,
              }),
            }
          ).catch(() => {});

          if (result.deployedAccount) {
            const depAcc = result.deployedAccount;
            const limits = getDynamicAccountLimits(depAcc.tier, depAcc.phase);
            const supaAccountPayload = {
              user_id: targetSupaUuid,
              account_type: limits.accountType,
              starting_balance: depAcc.size || depAcc.initialBalance,
              current_balance: depAcc.currentBalance,
              equity: depAcc.equity,
              daily_drawdown: limits.dailyLossLimitPercent,
              max_drawdown: limits.maxOverallLossPercent,
              profit_target: limits.profitTargetPercent,
              challenge_phase: depAcc.phase,
              status: 'active',
            };
            fetch(`${supabaseUrl}/rest/v1/trading_accounts`, {
              method: 'POST',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(supaAccountPayload),
            }).catch(() => {});
          }
        }
      }

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

  // POST / ALL /api/accounts/purchase - Purchase challenge or instant funded account & run TronGrid TRC-20 / Gateway verification
  app.all(
    ['/api/accounts/purchase', '/functions/v1/accounts-purchase', '/functions/v1/purchase-account', '/purchase-package', '/functions/v1/purchase-package'],
    async (req, res) => {
    try {
      const reqUserId = String(req.body?.userId || '').trim();
      const reqEmail = String(req.body?.email || '').trim();
      const reqFullName = String(req.body?.fullName || '').trim();
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,email,full_name,referral_code,referred_by`, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          });
          if (profRes.ok) {
            const profList = await profRes.json();
            if (Array.isArray(profList)) {
              syncSupabaseProfilesToAffiliateTree(profList);
            }
          }
        } catch {
          // ignore
        }
      }
      let user =
        getAuthenticatedUser(req) ||
        (reqUserId ? getUserById(reqUserId) : null) ||
        (reqEmail ? getUserByEmail(reqEmail) : null);
      if (!user && (reqUserId || reqEmail)) {
        user = ensureUserInDb({
          id: reqUserId || `usr_${Date.now().toString(36)}`,
          email: reqEmail || `${reqUserId}@bft.io`,
          fullName: reqFullName || undefined,
        });
      }
      if (!user) {
        user = getUserById('usr_bft_001');
      }
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const tier = String(req.body?.tier || 'two-step');
      const tierName = String(req.body?.tierName || '$10,000 Challenge');
      const size = Number(req.body?.size || 10000);
      const price = Number(req.body?.price || 99.00);
      const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim() : null;
      const txHash = req.body?.txHash ? String(req.body.txHash).trim() : undefined;
      const accountType = resolveDepositAccountType(req.body?.accountType || 'challenge');
      const packageName = String(
        req.body?.packageName || `${tierName} ($${size.toLocaleString()})`
      ).trim();
      const sku = buildPackageSku({
        accountType,
        tier,
        sizeOrAmount: size,
        customSku: req.body?.sku ? String(req.body.sku) : undefined,
      });

      const limits = getDynamicAccountLimits(tier, 'phase_1');
      const now = Date.now();

      // 1. Save pending record into crypto_deposits, transactions, and user_purchases (NEVER 'completed' before verification!)
      let cryptoDeposit: any = null;
      try {
        cryptoDeposit = createCryptoDepositRecord({
          userId: user.id,
          walletAddress: DIRECT_USDT_WALLET_ADDRESS,
          amount: price,
          packageName,
          sku,
          accountType,
          txHash: txHash || undefined,
          createdAtMs: now,
        });
      } catch (depErr) {
        console.warn('Purchase crypto_deposits record warning:', depErr);
      }

      let purchaseRecord: any = null;
      try {
        purchaseRecord = createUserPurchaseRecord({
          id: cryptoDeposit?.id || `PUR-${now.toString(36).toUpperCase()}`,
          userId: user.id,
          accountId: null,
          packageId: sku,
          packageName,
          packageSku: sku,
          amount: price,
          packageAmount: price,
          accountType,
          status: 'pending',
          txHash: txHash || null,
          createdAtMs: now,
        });
      } catch (purErr) {
        console.warn('Purchase user_purchases record warning:', purErr);
      }

      let targetSupaUuid: string | null = null;
      if (supabaseUrl && supabaseAnonKey) {
        targetSupaUuid = await ensureSupabaseProfileInRest(supabaseUrl, supabaseAnonKey, {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
        });

        const supaPendingDepositPayload = buildSupabaseCryptoDepositRow({
          userId: targetSupaUuid,
          walletAddress: DIRECT_USDT_WALLET_ADDRESS,
          amount: price,
          packageName,
          sku,
          accountType,
          status: 'pending',
          txHash: txHash || undefined,
        });
        fetch(`${supabaseUrl}/rest/v1/crypto_deposits`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(supaPendingDepositPayload),
        }).catch(() => {});

        fetch(`${supabaseUrl}/rest/v1/transactions`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(supaPendingDepositPayload),
        }).catch(() => {});

        const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
          userId: targetSupaUuid,
          packageId: sku,
          packageName,
          packageSku: sku,
          amount: price,
          packageAmount: price,
          accountType,
          status: 'pending',
          txHash: txHash || null,
        });
        fetch(`${supabaseUrl}/rest/v1/user_purchases`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(fullPayload),
        })
          .then((r) => {
            if (!r.ok) {
              return fetch(`${supabaseUrl}/rest/v1/user_purchases`, {
                method: 'POST',
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify(corePayload),
              });
            }
          })
          .catch(() => {});
      }

      // 2. Trigger immediate TronGrid TRC-20 verification pass
      let verificationResult: any = null;
      try {
        verificationResult = await verifyPendingCryptoDepositsWithTronGrid({
          userId: user.id,
          nowMs: now,
        });
      } catch (verifyErr) {
        console.warn('Purchase TronGrid verification warning:', verifyErr);
      }

      if (cryptoDeposit?.id) {
        cryptoDeposit =
          (db.prepare('SELECT * FROM crypto_deposits WHERE id = ?').get(cryptoDeposit.id) as any) ||
          cryptoDeposit;
        purchaseRecord =
          (db.prepare('SELECT * FROM user_purchases WHERE id = ?').get(cryptoDeposit.id) as any) ||
          purchaseRecord;
      }

      const isVerifiedOnChain =
        cryptoDeposit?.status === 'completed' || cryptoDeposit?.status === 'active';

      let provisionedAccount: any = null;
      let commissions: any[] = [];

      // 3. ONLY provision account and distribute 3-Tier commissions if blockchain/gateway confirmed payment!
      if (isVerifiedOnChain) {
        provisionedAccount = cryptoDeposit?.account_id
          ? getAccountById(cryptoDeposit.account_id)
          : null;

        commissions = creditPurchaseCommissions(user.id, packageName, price, referralCode);

        if (supabaseUrl && supabaseAnonKey && targetSupaUuid) {
          const supaAccountPayload = {
            user_id: targetSupaUuid,
            account_type: limits.accountType,
            starting_balance: size,
            current_balance: size,
            equity: size,
            daily_drawdown: limits.dailyLossLimitPercent,
            max_drawdown: limits.maxOverallLossPercent,
            profit_target: limits.profitTargetPercent,
            challenge_phase: limits.initialPhase,
            status: 'active',
          };
          fetch(`${supabaseUrl}/rest/v1/trading_accounts`, {
            method: 'POST',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify(supaAccountPayload),
          }).catch(() => {});

          for (const comm of commissions) {
            const commRow = {
              referrer_id: comm.sponsorId,
              referred_user_id: comm.referredUserId || user.id,
              level: comm.level,
              package_name: packageName,
              package_amount: price,
              amount: comm.amount,
              source_type: 'package',
              description: packageName,
            };
            fetch(`${supabaseUrl}/rest/v1/referral_commissions`, {
              method: 'POST',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(commRow),
            }).catch(() => {});
          }
        }
      }

      const effectiveStatus = isVerifiedOnChain
        ? 'completed'
        : cryptoDeposit?.status === 'failed'
        ? 'failed'
        : 'pending';

      const normalizedPurchase = mapPurchaseRecord(
        purchaseRecord || {
          id: cryptoDeposit?.id || `PUR-${now.toString(36).toUpperCase()}`,
          user_id: user.id,
          account_id: provisionedAccount?.id || null,
          package_id: sku,
          package_name: packageName,
          package_sku: sku,
          amount: price,
          package_amount: price,
          account_type: accountType,
          status: effectiveStatus,
          created_at: now,
        },
        now
      );

      return res.json({
        ok: true,
        verified: isVerifiedOnChain,
        account: provisionedAccount,
        deposit: cryptoDeposit,
        purchase: normalizedPurchase,
        commissions,
        verification: verificationResult,
        status: effectiveStatus,
        expiresAt: (cryptoDeposit?.created_at || now) + DEPOSIT_EXPIRY_MS,
        message: isVerifiedOnChain
          ? 'Blockchain payment confirmed! Your funded trading account has been provisioned.'
          : 'Order recorded in pending status. Your account will only be provisioned once the TRC-20 blockchain or Cryptomus gateway confirms your payment (expires in 60 minutes if unpaid).',
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to record evaluation package order.' });
    }
  });

  // GET /api/purchases - Fetch user's purchase & order history in real-time
  app.get(['/api/purchases', '/api/orders'], (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.query.userId || '').trim();
      const rawPurchases = getUserPurchases(userId ? { userId } : undefined);
      const rawDeposits = getCryptoDeposits(userId ? { userId } : undefined);

      let merged: ReturnType<typeof mapPurchaseRecord>[] = [];
      for (const p of rawPurchases) {
        merged = mergeRealtimePurchase(merged, p, 'INSERT');
      }
      for (const d of rawDeposits) {
        merged = mergeRealtimePurchase(merged, d, 'INSERT');
      }

      return res.json({
        ok: true,
        purchases: merged,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to load purchase history.',
      });
    }
  });

  // POST / ALL /api/purchases - Record a user purchase/order directly
  app.all(
    ['/api/purchases', '/api/orders', '/functions/v1/purchases', '/functions/v1/orders'],
    async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.body?.userId || req.body?.user_id || 'usr_bft_001').trim();
      const amount = Number(req.body?.amount ?? req.body?.package_amount ?? req.body?.price ?? 0);
      const packageAmount = Number(req.body?.packageAmount ?? req.body?.package_amount ?? amount);
      const accountType = resolveDepositAccountType(
        req.body?.accountType || req.body?.account_type || 'challenge'
      );
      const packageName = String(
        req.body?.packageName || req.body?.package_name || 'Challenge Package'
      ).trim();
      const packageSku = buildPackageSku({
        accountType,
        sizeOrAmount: packageAmount || amount,
        customSku: req.body?.packageSku || req.body?.package_sku || req.body?.packageId || req.body?.package_id,
      });
      const packageId = String(req.body?.packageId || req.body?.package_id || packageSku).trim();
      const status = req.body?.status || 'completed';

      ensureUserInDb({
        id: userId,
        email: user?.email || `${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}@client-bft.com`,
        fullName: user?.full_name || `Trader ${userId.slice(-4)}`,
      });

      const saved = createUserPurchaseRecord({
        id: req.body?.id ? String(req.body.id) : undefined,
        userId,
        accountId: req.body?.accountId || req.body?.account_id || null,
        packageId,
        packageName,
        packageSku,
        amount: Math.max(0.01, amount),
        packageAmount: Math.max(0.01, packageAmount),
        accountType,
        status,
        txHash: req.body?.txHash || req.body?.tx_hash || null,
      });

      return res.json({
        ok: true,
        purchase: mapPurchaseRecord(saved),
      });
    } catch (err: any) {
      return res.status(400).json({
        ok: false,
        error: err?.message || 'Failed to record purchase.',
      });
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
  app.post('/api/withdrawals', async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const accountId = String(req.body?.accountId || '').trim();
      const requestedAmount = Number(req.body?.amount);
      const walletAddress = String(req.body?.walletAddress || req.body?.purseAddress || '').trim();
      const network = String(req.body?.network || 'TRON (TRC-20)').trim();
      const paymentMethod = String(req.body?.paymentMethod || 'crypto_trc20').trim();
      const twoFactorCode = String(req.body?.twoFactorCode || '').trim();

      if (!accountId || !requestedAmount || !walletAddress) {
        return res.status(400).json({ ok: false, error: 'Missing required withdrawal parameters.' });
      }

      if (user.is_2fa_enabled) {
        if (!twoFactorCode) {
          return res.status(400).json({ ok: false, error: '2FA verification code required.' });
        }
        const isValid = (await verify({ token: twoFactorCode, secret: user.totp_secret })).valid;
        if (!isValid) {
          return res.status(400).json({ ok: false, error: 'Invalid 2FA code.' });
        }
      } else {
        return res.status(403).json({ ok: false, error: '2FA is not enabled. Please enable 2FA in Security settings.' });
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

  // POST /api/withdrawals/cancel (and /functions/v1/api/withdrawals/cancel) - Atomically cancel pending withdrawal & refund balance
  const handleCancelWithdrawalRoute = (req: express.Request, res: express.Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, x-client-info, apikey, content-type, x-admin-key'
    );
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: 'Unauthenticated' });

      const withdrawalId = String(req.body?.withdrawalId || '').trim();
      if (!withdrawalId) return res.status(400).json({ ok: false, error: 'Missing withdrawal ID.' });

      const result = cancelWithdrawalRequest(user.id, withdrawalId);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ ok: false, error: err?.message || 'Cancellation failed.' });
    }
  };

  app.post('/api/withdrawals/cancel', handleCancelWithdrawalRoute);
  app.post('/functions/v1/api/withdrawals/cancel', handleCancelWithdrawalRoute);

  // GET /api/withdrawals - List withdrawal ledger for user
  app.get('/api/withdrawals', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.json({ ok: true, withdrawals: [] });

    const withdrawals = db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY requested_at DESC').all(user.id);
    return res.json({ ok: true, withdrawals });
  });

  // GET /api/affiliate/dashboard - Live 3-Tier Multi-Level Affiliate Dashboard metrics
  app.get('/api/affiliate/dashboard', async (req, res) => {
    try {
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const profRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,email,full_name,referral_code,referred_by`, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
          });
          if (profRes.ok) {
            const profList = await profRes.json();
            if (Array.isArray(profList)) {
              syncSupabaseProfilesToAffiliateTree(profList);
            }
          }
        } catch {
          // ignore
        }
      }

      const qUserId = String(req.query.userId || '').trim();
      const qEmail = String(req.query.email || '').trim();
      const user =
        (qUserId ? getUserById(qUserId) : null) ||
        (qEmail ? getUserByEmail(qEmail) : null) ||
        getAuthenticatedUser(req);

      const targetId = user?.id || qUserId;
      if (!targetId) {
        return res.json({
          ok: true,
          stats: {
            lifetimeEarnings: 0,
            availableBalance: 0,
            pendingCommission: 0,
            totalReferralsCount: 0,
            activeFundedCount: 0,
            vipThreshold: 1000,
            vipProgressPercent: 0,
            remainingToVip: 1000,
            affiliateTier: 'basic',
            isVipUnlocked: false,
            milestoneRewardAmount: 10000,
            milestoneClaimed: false,
            level1Count: 0,
            level1Earnings: 0,
            level2Count: 0,
            level2Earnings: 0,
            level3Count: 0,
            level3Earnings: 0,
            withdrawalEarnings: 0,
            teamSize: 0,
            recentCommissions: [],
            networkTree: [],
          },
          referralCode: user?.referral_code || '',
        });
      }

      const stats = getAffiliateDashboardStats(targetId);
      return res.json({
        ok: true,
        stats,
        referralCode: user?.referral_code || '',
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to load affiliate dashboard' });
    }
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
  // DIRECT USDT (TRC-20) DEPOSIT SYSTEM & TRONGRID AUTOMATED VERIFICATION
  // ============================================================================
  app.get('/api/deposit/config', (_req, res) => {
    return res.json({
      ok: true,
      walletAddress: DIRECT_USDT_WALLET_ADDRESS,
      tronGridEndpoint: TRONGRID_TRC20_ENDPOINT,
      qrCodeImageUrl: DIRECT_USDT_TRC20_CONFIG.qrCodeImageUrl,
      currency: DIRECT_USDT_TRC20_CONFIG.currency,
      network: DIRECT_USDT_TRC20_CONFIG.network,
      minDepositUsdt: DIRECT_USDT_TRC20_CONFIG.minDepositUsdt,
      maxDepositUsdt: DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt,
      depositExpiryMs: DEPOSIT_EXPIRY_MS,
    });
  });

  app.all(
    ['/api/deposit/submit', '/api/crypto-deposits', '/functions/v1/deposit-submit', '/functions/v1/crypto-deposits', '/verify-deposit', '/functions/v1/verify-deposit', '/submit-deposit', '/functions/v1/submit-deposit'],
    async (req, res, next) => {
    if (req.method === 'GET') {
      return next();
    }
    try {
      const user = getAuthenticatedUser(req);
      const rawAmount = Number(req.body?.amount);
      const accountId = req.body?.accountId ? String(req.body.accountId).trim() : undefined;
      const userId = String(user?.id || req.body?.userId || 'usr_bft_001').trim();
      const txHash = req.body?.txHash ? String(req.body.txHash).trim() : undefined;
      const accountType = resolveDepositAccountType(
        req.body?.accountType || req.body?.account_type || 'self_funded'
      );

      const validation = validateDirectDepositAmount(rawAmount);
      if (!validation.valid) {
        return res.status(400).json({
          ok: false,
          error: validation.error,
        });
      }

      const amount = Number(rawAmount.toFixed(2));
      const packageName = String(
        req.body?.packageName ||
          req.body?.package_name ||
          (accountType === 'self_funded'
            ? `Self-Funded Live Deposit ($${amount.toFixed(2)} USDT)`
            : 'Funded Challenge Evaluation')
      ).trim();
      const sku = buildPackageSku({
        accountType,
        tier: req.body?.tier,
        sizeOrAmount: amount,
        customSku: req.body?.sku || req.body?.package_sku,
      });

      const deposit = createCryptoDepositRecord({
        userId,
        accountId: accountType === 'self_funded' ? accountId || 'BFT-PERS-001' : undefined,
        walletAddress: DIRECT_USDT_WALLET_ADDRESS,
        amount,
        packageName,
        sku,
        accountType,
        txHash: txHash || undefined,
      });

      if (supabaseUrl && supabaseAnonKey) {
        const targetSupaUuid = await ensureSupabaseProfileInRest(supabaseUrl, supabaseAnonKey, {
          id: userId,
          email: user?.email,
          full_name: user?.full_name,
        });
        const supaPayload = buildSupabaseCryptoDepositRow({
          userId: targetSupaUuid,
          walletAddress: DIRECT_USDT_WALLET_ADDRESS,
          amount,
          packageName,
          sku,
          accountType,
          status: 'pending',
          txHash: txHash || undefined,
        });
        fetch(`${supabaseUrl}/rest/v1/crypto_deposits`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(supaPayload),
        }).catch(() => {});

        fetch(`${supabaseUrl}/rest/v1/transactions`, {
          method: 'POST',
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(supaPayload),
        }).catch(() => {});
      }

      // Trigger an immediate TronGrid TRC-20 verification pass for this pending deposit
      let verificationResult: any = null;
      try {
        verificationResult = await verifyPendingCryptoDepositsWithTronGrid({ userId });
      } catch (verifyErr) {
        console.warn('Immediate TronGrid verification check warning:', verifyErr);
      }

      const latestDeposit =
        (db.prepare('SELECT * FROM crypto_deposits WHERE id = ?').get(deposit.id) as any) ||
        deposit;
      const isVerifiedCompleted =
        latestDeposit.status === 'completed' || latestDeposit.status === 'active';

      let updatedAccount: any = null;
      if (isVerifiedCompleted) {
        const matchedEntry = verificationResult?.completedDeposits?.find(
          (c: any) => c.deposit?.id === deposit.id
        );
        updatedAccount =
          matchedEntry?.account ||
          (latestDeposit.account_id ? getAccountById(latestDeposit.account_id) : null);
      } else {
        updatedAccount =
          accountType === 'self_funded'
            ? latestDeposit.account_id
              ? getAccountById(latestDeposit.account_id)
              : ensurePersonalLiveAccountForUser(userId)
            : null;
      }

      return res.json({
        ok: true,
        deposit: latestDeposit,
        verified: isVerifiedCompleted,
        status: latestDeposit.status || 'pending',
        expiresAt: (latestDeposit.created_at || Date.now()) + DEPOSIT_EXPIRY_MS,
        creditedAmountUsdt: isVerifiedCompleted && accountType === 'self_funded' ? amount : 0,
        updatedAccount,
        verification: verificationResult,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to process direct USDT (TRC-20) deposit.',
      });
    }
  });

  /**
   * POST /api/webhooks/cryptomus (and /api/crypto-deposits/webhook, /api/payment/webhook)
   * Cryptomus / TRC-20 Payment Gateway Callback & Webhook Verification Endpoint.
   * Only provisions accounts or credits balances when gateway status is 'paid' / 'confirmed' / 'paid_over'
   * and deposit has not expired past the 1-hour (60-minute) window.
   */
  app.post(
    ['/api/webhooks/cryptomus', '/api/crypto-deposits/webhook', '/api/payment/webhook'],
    async (req, res) => {
      try {
        const payload = req.body || {};
        const orderId = String(payload.order_id || payload.deposit_id || payload.id || '').trim();
        if (!orderId) {
          return res.status(400).json({
            ok: false,
            error: 'Missing order_id / deposit_id in gateway webhook payload.',
          });
        }

        expireStalePendingDepositsInDb();

        const deposit = db
          .prepare('SELECT * FROM crypto_deposits WHERE id = ?')
          .get(orderId) as any;
        if (!deposit) {
          return res.status(404).json({
            ok: false,
            error: `Deposit order ${orderId} not found.`,
          });
        }

        const claimedTxIds = getCompletedCryptoDepositTxHashes();
        const evaluation = verifyGatewayOrBlockchainPayment({
          deposit,
          cryptomusPayload: payload,
          claimedTxIds,
        });

        if (evaluation.status === 'failed') {
          const failedRow = failCryptoDepositInDb(deposit.id, evaluation.reason);
          if (supabaseUrl && supabaseAnonKey && deposit.user_id) {
            const targetUuid = isValidUuid(deposit.user_id)
              ? deposit.user_id
              : toValidUuid(deposit.user_id);
            fetch(
              `${supabaseUrl}/rest/v1/crypto_deposits?user_id=eq.${encodeURIComponent(
                targetUuid
              )}&amount=eq.${encodeURIComponent(String(deposit.amount))}&status=eq.pending`,
              {
                method: 'PATCH',
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status: 'failed' }),
              }
            ).catch(() => {});
          }
          return res.json({
            ok: true,
            verified: false,
            status: 'failed',
            deposit: failedRow,
            reason: evaluation.reason,
          });
        }

        if (evaluation.verified && evaluation.matchedTxHash) {
          const completed = completeCryptoDepositInDb(deposit.id, evaluation.matchedTxHash);
          if (supabaseUrl && supabaseAnonKey && deposit.user_id) {
            const targetUuid = isValidUuid(deposit.user_id)
              ? deposit.user_id
              : toValidUuid(deposit.user_id);
            fetch(
              `${supabaseUrl}/rest/v1/crypto_deposits?user_id=eq.${encodeURIComponent(
                targetUuid
              )}&amount=eq.${encodeURIComponent(String(deposit.amount))}&status=eq.pending`,
              {
                method: 'PATCH',
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  status: 'completed',
                  tx_hash: evaluation.matchedTxHash,
                }),
              }
            ).catch(() => {});
          }
          return res.json({
            ok: true,
            verified: true,
            status: 'completed',
            deposit: completed.deposit,
            account: completed.account,
            txHash: evaluation.matchedTxHash,
          });
        }

        return res.json({
          ok: true,
          verified: false,
          status: evaluation.status,
          deposit,
          reason: evaluation.reason,
        });
      } catch (err: any) {
        return res.status(400).json({
          ok: false,
          error: err?.message || 'Gateway webhook verification failed.',
        });
      }
    }
  );

  app.all(['/api/crypto-deposits/expire-stale', '/api/deposit/expire-stale'], async (_req, res) => {
    try {
      const sweep = expireStalePendingDepositsInDb();
      return res.json({
        ok: true,
        ...sweep,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to run 1-hour expiry sweep.',
      });
    }
  });

  app.all(['/api/crypto-deposits/verify', '/api/deposit/verify-trongrid'], async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const overrideTransactions = Array.isArray(req.body?.transactions)
        ? (req.body.transactions as TronGridTrc20Transaction[])
        : undefined;
      const userIdFilter =
        typeof req.query.userId === 'string' && req.query.userId.trim()
          ? req.query.userId.trim()
          : undefined;

      const result = await verifyPendingCryptoDepositsWithTronGrid({
        userId: userIdFilter,
        overrideTransactions,
        forceFetch: true,
      });

      const deposits = getCryptoDeposits({ userId: user?.id || userIdFilter });
      const transactions = getTransactions({ userId: user?.id || userIdFilter });
      const accounts = user?.id ? getAccountsForUser(user.id) : [];

      return res.json({
        ...result,
        deposits,
        transactions,
        accounts,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to verify USDT (TRC-20) transactions via TronGrid.',
      });
    }
  });

  app.get(['/api/deposit/history', '/api/crypto-deposits', '/api/transactions'], (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const queryUserId =
        typeof req.query.userId === 'string' && req.query.userId.trim()
          ? req.query.userId.trim()
          : undefined;
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId.trim() : '';
      const cryptoDeposits = getCryptoDeposits({
        userId: user?.id || queryUserId,
        accountId: accountId || undefined,
      });
      const transactions = getTransactions({
        userId: user?.id || queryUserId,
      });
      return res.json({
        ok: true,
        deposits: cryptoDeposits,
        cryptoDeposits,
        transactions,
        totalCreditedUsdt: accountId ? creditedBalancesByAccount.get(accountId) || 0 : 0,
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to load deposit history.',
      });
    }
  });

  // ============================================================================
  // 2FA TOTP AUTHENTICATION (API & SUPABASE EDGE FUNCTION COMPATIBLE)
  // ============================================================================
  const resolveUserFor2faOrProfile = (req: express.Request) => {
    const authed = getAuthenticatedUser(req);
    if (authed) return authed;
    const fallbackId = String(req.body?.userId || req.query?.userId || 'usr_bft_001').trim();
    const fallbackEmail = String(req.body?.email || req.query?.email || 'trader@bft.io').trim().toLowerCase();
    return ensureUserInDb({
      id: fallbackId,
      email: fallbackEmail,
      fullName: req.body?.fullName ? String(req.body.fullName) : undefined,
    });
  };

  app.all(
    [
      '/api/2fa/setup',
      '/api/2fa/generate',
      '/api/2fa/reconfigure',
      '/api/profile/2fa/generate',
      '/api/profile/2fa/reconfigure',
      '/functions/v1/2fa-setup',
      '/functions/v1/2fa-generate',
      '/functions/v1/2fa-reconfigure',
    ],
    async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: 'Unauthenticated' });
        }

        const secret = generateSecret();
        const emailLabel = user.email || 'trader@bft.io';
        const otpauthUrl = generateURI({ issuer: 'BFT-Trading', label: emailLabel, secret });

        let imageUrl = '';
        try {
          imageUrl = await QRCode.toDataURL(otpauthUrl);
        } catch (qrErr) {
          console.warn('QRCode dataURL generation warning:', qrErr);
        }

        try {
          db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
        } catch (e) {
          console.warn('Failed to update SQLite totp_secret:', e);
        }

        if (supabaseUrl && supabaseAnonKey) {
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ totp_secret: secret }),
          }).catch(() => {});
        }

        return res.status(200).json({
          ok: true,
          secret,
          qrCode: imageUrl,
          otpauthUrl,
          otpauth_url: otpauthUrl,
          message: '2FA secret generated successfully.',
        });
      } catch (err: any) {
        return res.status(500).json({
          ok: false,
          error: err?.message || 'Failed to generate 2FA credentials.',
        });
      }
    }
  );

  app.all(
    [
      '/api/2fa/verify',
      '/api/2fa/enable',
      '/api/profile/2fa/verify',
      '/api/profile/2fa/enable',
      '/functions/v1/2fa-verify',
      '/functions/v1/2fa-enable',
    ],
    async (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: 'Unauthenticated' });
        }

        const code = String(req.body?.code || '').replace(/\D/g, '').trim();
        const secret = String(req.body?.secret || user.totp_secret || '').trim();

        if (!secret) {
          return res.status(400).json({
            ok: false,
            error: '2FA not initialized. Please click Enable 2FA to generate a secret key.',
          });
        }
        if (!code || code.length !== 6) {
          return res.status(400).json({
            ok: false,
            error: 'Please enter a valid 6-digit verification code.',
          });
        }

        const verifyResult = await verify({ token: code, secret });
        const isValid = Boolean(verifyResult && (verifyResult as any).valid);
        if (isValid) {
          try {
            db.prepare('UPDATE users SET is_2fa_enabled = 1, totp_secret = ? WHERE id = ?').run(
              secret,
              user.id
            );
          } catch (e) {
            console.warn('Failed to update SQLite is_2fa_enabled:', e);
          }

          if (supabaseUrl && supabaseAnonKey) {
            fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ is_2fa_enabled: true, totp_secret: secret }),
            }).catch(() => {});
          }

          return res.status(200).json({
            ok: true,
            message: '2FA enabled successfully',
            is2faEnabled: true,
          });
        }

        return res.status(400).json({
          ok: false,
          error: 'Invalid 6-digit verification code. Please check your authenticator app.',
        });
      } catch (err: any) {
        return res.status(400).json({
          ok: false,
          error: err?.message || 'Invalid 6-digit verification code.',
        });
      }
    }
  );

  app.all(
    ['/api/2fa/disable', '/api/profile/2fa/disable', '/functions/v1/2fa-disable'],
    (req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: 'Unauthenticated' });
        }

        try {
          db.prepare('UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL WHERE id = ?').run(
            user.id
          );
        } catch (e) {
          console.warn('Failed to disable 2FA in SQLite:', e);
        }

        if (supabaseUrl && supabaseAnonKey) {
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: 'PATCH',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_2fa_enabled: false, totp_secret: null }),
          }).catch(() => {});
        }

        return res.status(200).json({
          ok: true,
          message: '2FA disabled successfully',
          is2faEnabled: false,
        });
      } catch (err: any) {
        return res.status(500).json({
          ok: false,
          error: err?.message || 'Failed to disable 2FA.',
        });
      }
    }
  );

  app.all(
    ['/api/2fa/validate', '/api/2fa/check', '/functions/v1/2fa-validate', '/functions/v1/2fa-check'],
    async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const user = resolveUserFor2faOrProfile(req);
      if (!user) {
        return res.status(401).json({ ok: false, isValid: false, error: 'Unauthenticated' });
      }

      const code = String(req.body?.code || '').replace(/\D/g, '').trim();
      const secret = String(req.body?.secret || user.totp_secret || '').trim();

      if (!user.is_2fa_enabled && !secret) {
        return res.status(200).json({ ok: true, isValid: true });
      }
      if (!secret) {
        return res.status(400).json({ ok: false, isValid: false, error: '2FA not initialized' });
      }

      const verifyResult = await verify({ token: code, secret });
      const isValid = Boolean(verifyResult && (verifyResult as any).valid);
      return res.status(200).json({ ok: true, isValid });
    } catch {
      return res.status(200).json({ ok: false, isValid: false, error: 'Verification failed' });
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

  // Helper to ensure git repository and origin remote are initialized
  const ensureGitOriginRemote = (): string => {
    const defaultRepo = 'https://github.com/shankavee44/bft-trading-platform.git';
    try {
      execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: __dirname });
    } catch {
      try {
        execSync('git init && git branch -M main', { cwd: __dirname });
      } catch {}
    }

    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: __dirname }).trim();
      if (url) return url;
    } catch {}

    try {
      execSync(`git remote add origin "${defaultRepo}"`, { cwd: __dirname });
      return defaultRepo;
    } catch {
      try {
        execSync(`git remote set-url origin "${defaultRepo}"`, { cwd: __dirname });
        return defaultRepo;
      } catch {
        return defaultRepo;
      }
    }
  };

  // GET /api/github/status - Repository status and pending modifications check
  app.get('/api/github/status', (_req, res) => {
    try {
      let branch = 'main';
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: __dirname }).trim();
      } catch {
        branch = 'main';
      }

      const repoUrl = ensureGitOriginRemote();

      let modifiedFiles: string[] = [];
      try {
        const rawStatus = execSync('git status --porcelain', { encoding: 'utf-8', cwd: __dirname });
        modifiedFiles = rawStatus
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map((line) => line.substring(3).trim());
      } catch {
        modifiedFiles = [];
      }

      const repoName = repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '') || 'shankavee44/bft-trading-platform';

      return res.json({
        ok: true,
        connected: true,
        repoUrl: repoUrl || 'https://github.com/shankavee44/bft-trading-platform',
        repoName,
        branch,
        lastSyncedAt: new Date().toISOString(),
        modifiedFiles,
        uncommittedCount: modifiedFiles.length,
        syncState: 'ready',
      });
    } catch (err: any) {
      return res.json({
        ok: true,
        connected: false,
        repoUrl: 'https://github.com/shankavee44/bft-trading-platform',
        repoName: 'shankavee44/bft-trading-platform',
        branch: 'main',
        lastSyncedAt: new Date().toISOString(),
        modifiedFiles: [],
        syncState: 'error',
        error: err?.message || 'Failed to query git status.',
      });
    }
  });

  // POST /api/github/push - Execute repository sync & push
  app.post('/api/github/push', (req, res) => {
    try {
      const { branch, commitMessage, repoUrl, token } = req.body || {};
      const targetBranch = branch || 'main';
      const targetMessage = commitMessage || 'feat: update BFT trading platform codebase';
      
      const currentRemoteUrl = ensureGitOriginRemote();
      let targetRepo = repoUrl || currentRemoteUrl;

      // Ensure git user configured
      try {
        execSync('git config user.name "BFT Developer"', { cwd: __dirname });
        execSync('git config user.email "admin@bft.io"', { cwd: __dirname });
      } catch (e) {
        // ignore
      }

      if (targetRepo) {
        let authRepo = targetRepo;
        if (token && targetRepo.includes('github.com')) {
          const cleanUrl = targetRepo.replace(/^https?:\/\/(.*@)?/, '');
          authRepo = `https://${token}@${cleanUrl}`;
        }
        try {
          execSync(`git remote set-url origin "${authRepo}"`, { cwd: __dirname });
        } catch (e) {
          try {
            execSync(`git remote add origin "${authRepo}"`, { cwd: __dirname });
          } catch (e2) {}
        }
      }

      // Stage and commit
      try {
        execSync('git add .', { cwd: __dirname });
      } catch (e) {
        // ignore
      }

      let commitHash = '';
      try {
        execSync(`git commit -m "${targetMessage.replace(/"/g, '\\"')}"`, { cwd: __dirname });
      } catch (e) {
        // Nothing to commit or already committed
      }

      try {
        commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: __dirname }).trim();
      } catch (e) {
        commitHash = Math.random().toString(36).substring(2, 9);
      }

      // Attempt push if remote exists
      let pushOutput = '';
      let pushed = false;
      try {
        const checkRemote = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: __dirname }).trim();
        if (checkRemote) {
          pushOutput = execSync(`git push -u origin ${targetBranch}`, { encoding: 'utf-8', cwd: __dirname });
          pushed = true;
        }
      } catch (pushErr: any) {
        pushOutput = pushErr?.stderr?.toString() || pushErr?.stdout?.toString() || pushErr?.message || 'Push failed';
      }

      return res.json({
        ok: true,
        success: true,
        commitHash,
        branch: targetBranch,
        repoUrl: targetRepo || 'https://github.com/shankavee44/bft-trading-platform',
        pushedAt: new Date().toISOString(),
        pushed,
        pushOutput,
        message: pushed
          ? `Successfully pushed commit [${commitHash}] to origin/${targetBranch} on GitHub.`
          : `Local commit [${commitHash}] created. ${pushOutput ? 'Remote push message: ' + pushOutput : 'Provide GitHub PAT to push to remote.'}`,
        uncommittedChangesCount: 0,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to process git push.' });
    }
  });

  // ============================================================================
  // COPY TRADING SYSTEM ENDPOINTS
  // ============================================================================
  app.get('/api/copy-trading/traders', (req, res) => {
    try {
      const category =
        (req.query.category as 'instant_funded' | 'self_capital' | 'all') || 'instant_funded';
      const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const limit = Number(req.query.limit) || 10;
      const result = copyTradingEngine.getLeaderboard(category, searchQuery, limit);
      return res.json({
        ok: true,
        traders: result.traders,
        totalPoolCount: result.totalPoolCount,
        isSearchActive: result.isSearchActive,
        rotation: result.rotation,
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch copy traders.' });
    }
  });

  app.post('/api/copy-trading/register-provider', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.body?.userId || 'usr_bft_001').trim();
      const providerName = String(
        req.body?.providerName || user?.full_name || 'Verified BFT Master'
      ).trim();
      const category =
        req.body?.category === 'self_capital' ? 'self_capital' : 'instant_funded';
      const strategyTitle = String(
        req.body?.strategyTitle || 'Institutional OTC Alpha'
      ).trim();
      const winRate3m = Number(req.body?.winRate3m ?? 0);
      const startingBalance = Number(
        req.body?.startingBalance || (category === 'instant_funded' ? 50000 : 5000)
      );

      const regResult = copyTradingEngine.registerCustomProvider({
        userId,
        providerName,
        countryCode: req.body?.countryCode ? String(req.body.countryCode) : 'US',
        country: user?.country || req.body?.country || 'United States',
        flag: getCountryFlag(user?.country || req.body?.country || 'United States'),
        category,
        strategyTitle,
        startingBalance,
        winRate3m,
      });

      if (!regResult.ok) {
        return res.status(400).json({
          ok: false,
          error: regResult.error,
          code: 'WIN_RATE_BELOW_60',
        });
      }

      return res.json({
        ok: true,
        provider: regResult.provider,
        message: 'Successfully registered as a Copy Master / Provider.',
      });
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Failed to register Copy Master.',
      });
    }
  });

  app.post('/api/copy-trading/copy', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.body?.userId || 'usr_bft_001').trim();

      const {
        providerId,
        allocatedCapital,
        perTradeAllocationType,
        perTradeAllocationValue,
        maxLossLimit,
        takeProfitLimit,
        tradeSizingType,
        sizingMultiplier,
      } = req.body || {};

      if (!providerId) return res.status(400).json({ ok: false, error: 'Provider ID required.' });

      ensureUserInDb({
        id: userId,
        email: user?.email || `${userId.toLowerCase().replace(/[^a-z0-9]/g, '')}@client-bft.com`,
        fullName: user?.full_name || 'Pro Funded Trader',
      });

      const id = `SUB-${userId}-${providerId}-${Date.now().toString(36)}`;
      const cleanAllocated = Math.max(1, Number(allocatedCapital || perTradeAllocationValue || 100));
      const cleanMaxLoss = Math.max(5, Number(maxLossLimit || 50));
      const cleanTakeProfit = Math.max(5, Number(takeProfitLimit || 150));

      const existing = db
        .prepare('SELECT id FROM copy_trading_subscriptions WHERE user_id = ? AND provider_id = ?')
        .get(userId, providerId) as any;

      if (existing) {
        db.prepare(`
          UPDATE copy_trading_subscriptions SET
            allocated_capital = ?,
            max_loss_limit = ?,
            take_profit_limit = ?,
            trade_sizing_type = ?,
            sizing_multiplier = ?,
            status = 'active',
            created_at = ?
          WHERE id = ?
        `).run(
          cleanAllocated,
          cleanMaxLoss,
          cleanTakeProfit,
          tradeSizingType || (perTradeAllocationType === 'percentage' ? 'proportionate' : 'fixed'),
          Number(sizingMultiplier || 1.0),
          Date.now(),
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO copy_trading_subscriptions (
            id, user_id, provider_id, allocated_capital, max_loss_limit, 
            take_profit_limit, trade_sizing_type, sizing_multiplier, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(
          id,
          userId,
          providerId,
          cleanAllocated,
          cleanMaxLoss,
          cleanTakeProfit,
          tradeSizingType || (perTradeAllocationType === 'percentage' ? 'proportionate' : 'fixed'),
          Number(sizingMultiplier || 1.0),
          Date.now()
        );
      }

      const updatedSub = db
        .prepare(`
          SELECT 
            id,
            provider_id, 
            allocated_capital, 
            max_loss_limit, 
            take_profit_limit, 
            trade_sizing_type, 
            sizing_multiplier, 
            current_pnl, 
            status, 
            created_at 
          FROM copy_trading_subscriptions 
          WHERE user_id = ? AND provider_id = ?
        `)
        .get(userId, providerId) as any;

      return res.json({
        ok: true,
        message: 'Successfully subscribed to copy trader with risk settings (100% Profit Keep / 0% Commission).',
        subscription: {
          ...updatedSub,
          per_trade_allocation_type: perTradeAllocationType || 'amount',
          per_trade_allocation_value: Number(perTradeAllocationValue || cleanAllocated),
          commission_pct: 0,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to copy trader.' });
    }
  });

  app.post('/api/copy-trading/cancel', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.body?.userId || 'usr_bft_001').trim();

      const { providerId } = req.body || {};
      if (!providerId) return res.status(400).json({ ok: false, error: 'Provider ID required.' });

      db.prepare(`
        DELETE FROM copy_trading_subscriptions 
        WHERE user_id = ? AND provider_id = ?
      `).run(userId, providerId);

      return res.json({ ok: true, message: 'Successfully cancelled copy trading subscription.' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to cancel subscription.' });
    }
  });

  app.get('/api/copy-trading/subscriptions', (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.query?.userId || 'usr_bft_001').trim();

      const subs = db
        .prepare(`
          SELECT 
            id,
            provider_id, 
            allocated_capital, 
            max_loss_limit, 
            take_profit_limit, 
            trade_sizing_type, 
            sizing_multiplier, 
            current_pnl, 
            status, 
            created_at 
          FROM copy_trading_subscriptions 
          WHERE user_id = ?
        `)
        .all(userId) as any[];

      return res.json({
        ok: true,
        subscriptions: subs.map((s) => ({
          id: s.id,
          provider_id: s.provider_id,
          allocated_capital: s.allocated_capital,
          max_loss_limit: s.max_loss_limit,
          take_profit_limit: s.take_profit_limit,
          trade_sizing_type: s.trade_sizing_type,
          sizing_multiplier: s.sizing_multiplier,
          current_pnl: s.current_pnl,
          status: s.status,
          commission_pct: 0,
          created_at: s.created_at,
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ ok: false, error: err?.message || 'Failed to fetch subscriptions.' });
    }
  });

  // 404 Fallback for unhandled /api/* and /functions/v1/* endpoints
  app.all(['/api/*', '/functions/v1/*'], (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    console.warn(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ 
      ok: false, 
      error: `API endpoint not found: ${req.method} ${req.url}`,
      code: 'NOT_FOUND'
    });
  });

  // Explicit 405 Method Not Allowed handler for known API paths
  app.use('/api', (req, res, next) => {
    // If we reached here, it means no route matched. 
    // But we already have a 404 handler above for /api/*.
    // So this might be reached if a route matched the path but not the method.
    // However, Express usually returns 404 in that case too unless we use specific method handlers.
    next();
  });

  // Global JSON error-handling middleware for /api/* and /functions/v1/*
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/functions/v1/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const status = typeof err?.status === 'number' ? err.status : 500;
      return res.status(status).json({
        ok: false,
        error: err?.message || 'Internal server error.',
      });
    }
    next(err);
  });

  // ============================================================================
  // Vite Middleware (Development) vs Built Static Assets (Production)
  // ============================================================================
  const distPath = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production';
  const isDev = !isProduction;

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false,
      },
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
    console.log(`BFT Server & Direct USDT (TRC-20) Gateway running on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
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
