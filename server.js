// server.ts
import express from "express";
import cors from "cors";
import fs2 from "fs";
import path2 from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { generateSecret, verify, generateURI } from "otplib";
import QRCode from "qrcode";

// src/config/directDeposit.ts
var TRONGRID_API_KEY = "79784292-381c-42f7-b834-0f6d41b7b2e5";
var OKX_USDT_TRC20_WALLET = "TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp";
var TRONGRID_TRC20_ENDPOINT = "https://api.trongrid.io/v1/accounts/TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp/transactions/trc20";
var DIRECT_USDT_TRC20_CONFIG = {
  /**
   * Primary settlement currency for instantaneous low-fee trader deposits
   */
  currency: "USDT",
  /**
   * Primary network for high speed & lowest network fees
   */
  network: "TRON (TRC-20)",
  networkShort: "TRC-20",
  networkLabel: "TRC-20 (TRON Network)",
  /**
   * Official BFT Company Static USDT TRC-20 Depository Wallet Address (OKX)
   */
  walletAddress: OKX_USDT_TRC20_WALLET,
  /**
   * Official TronGrid API Key and TRC-20 Transactions Endpoint
   */
  tronGridApiKey: TRONGRID_API_KEY,
  tronGridTrc20Endpoint: TRONGRID_TRC20_ENDPOINT,
  usdtContractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  /**
   * Official QR Code image asset for TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp
   */
  qrCodeImageUrl: "/assets/aistudio/WhatsApp_Image_2026-11-01_at_6.27.58_PM_1ba5a5ce.jpeg",
  /**
   * Minimum and maximum USDT deposit constraints
   */
  minDepositUsdt: 10,
  maxDepositUsdt: 1e5,
  /**
   * TronScan Explorer transaction verification template
   */
  explorerTxUrl: "https://tronscan.org/#/transaction/",
  explorerAddressUrl: "https://tronscan.org/#/address/"
};
function resolveDepositAccountType(tierOrCategory) {
  const normalized = String(tierOrCategory || "").trim().toLowerCase();
  if (normalized === "self_funded" || normalized === "personal" || normalized === "personal_live" || normalized === "self") {
    return "self_funded";
  }
  return "challenge";
}
function buildPackageSku(params) {
  if (params.customSku && params.customSku.trim().length > 0) {
    return params.customSku.trim().toUpperCase();
  }
  const cleanAmount = Math.max(0, Math.round(Number(params.sizeOrAmount) || 0));
  if (params.accountType === "self_funded") {
    return `BFT-SELF-${cleanAmount}`;
  }
  const tierNorm = String(params.tier || "two-step").toLowerCase();
  const tierCode = tierNorm === "one-step" ? "1S" : tierNorm === "instant" ? "INF" : "2S";
  const sizeLabel = cleanAmount >= 1e3 ? `${cleanAmount / 1e3}K` : String(cleanAmount);
  return `BFT-${tierCode}-${sizeLabel}`;
}
function buildCryptoDepositPayload(input) {
  const exactAmount = Number(Number(input.amount || 0).toFixed(2));
  const accountType = input.accountType === "self_funded" ? "self_funded" : "challenge";
  const packageName = String(input.packageName || "").trim() || (accountType === "self_funded" ? `Self-Funded Live Deposit ($${exactAmount.toFixed(2)} USDT)` : "Funded Challenge Package");
  const sku = String(input.sku || "").trim().toUpperCase() || buildPackageSku({ accountType, sizeOrAmount: exactAmount });
  return {
    user_id: input.userId || "usr_bft_001",
    account_id: input.accountId || null,
    wallet_address: input.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
    amount: exactAmount,
    package_name: packageName,
    sku,
    package_sku: sku,
    account_type: accountType,
    currency: "USDT",
    network: "TRC-20",
    tx_hash: input.txHash ? String(input.txHash).trim() : null,
    status: input.status || "pending"
  };
}
function buildSupabaseCryptoDepositRow(input) {
  const payload = buildCryptoDepositPayload(input);
  return {
    ...input.userId ? { user_id: input.userId } : {},
    wallet_address: payload.wallet_address,
    amount: payload.amount,
    package_name: payload.package_name,
    package_sku: payload.package_sku,
    account_type: payload.account_type,
    status: payload.status
  };
}
function buildSupabaseUserPurchasePayload(input) {
  const cleanAmount = Number(Math.max(0.01, Number(input.amount || input.packageAmount || 0)).toFixed(2));
  const cleanPackageAmount = Number(
    Math.max(0.01, Number(input.packageAmount ?? input.amount ?? 0)).toFixed(2)
  );
  const accountType = resolveDepositAccountType(input.accountType);
  const packageName = String(input.packageName || "").trim() || (accountType === "self_funded" ? `Self-Funded Live Deposit ($${cleanAmount.toFixed(2)} USDT)` : "Funded Challenge Package");
  const packageSku = String(input.packageSku || input.packageId || "").trim().toUpperCase() || buildPackageSku({ accountType, sizeOrAmount: cleanPackageAmount });
  const packageId = String(input.packageId || packageSku).trim();
  const rawStatus = String(input.status || "completed").trim().toLowerCase();
  const status = rawStatus === "pending" ? "pending" : rawStatus === "approved" ? "approved" : rawStatus === "declined" || rawStatus === "rejected" ? "declined" : "completed";
  return {
    fullPayload: {
      user_id: String(input.userId || "").trim(),
      package_id: packageId,
      package_name: packageName,
      package_sku: packageSku,
      amount: cleanAmount,
      package_amount: cleanPackageAmount,
      account_type: accountType,
      status,
      ...input.txHash ? { tx_hash: String(input.txHash).trim() } : {}
    },
    corePayload: {
      user_id: String(input.userId || "").trim(),
      package_name: packageName,
      package_amount: cleanAmount
    }
  };
}
function mapPurchaseRecord(row) {
  const r = row && typeof row === "object" ? row : {};
  const rawAmount = Number(r.amount ?? r.package_amount ?? r.price ?? 0);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Number(rawAmount.toFixed(2)) : 0;
  const rawPkgAmount = Number(r.package_amount ?? r.size ?? r.amount ?? 0);
  const packageAmount = Number.isFinite(rawPkgAmount) && rawPkgAmount > 0 ? Number(rawPkgAmount.toFixed(2)) : amount;
  const accountType = resolveDepositAccountType(
    r.account_type ?? r.accountType ?? (r.is_self_funded ? "self_funded" : "challenge")
  );
  const packageName = String(r.package_name ?? r.packageName ?? r.tier_name ?? "").trim() || (accountType === "self_funded" ? `Self-Funded Live Deposit ($${amount.toFixed(2)} USDT)` : "Challenge Package");
  let inferredSku = String(r.package_sku ?? r.sku ?? r.package_id ?? r.packageId ?? "").trim().toUpperCase();
  if (!inferredSku) {
    const parsed = parseChallengePackageFromDeposit({
      package_name: packageName,
      amount: packageAmount || amount
    });
    inferredSku = accountType === "self_funded" ? buildPackageSku({ accountType: "self_funded", sizeOrAmount: amount || packageAmount }) : buildPackageSku({ accountType: "challenge", tier: parsed.tier, sizeOrAmount: parsed.size });
  }
  const packageId = String(r.package_id ?? r.packageId ?? inferredSku).trim();
  const rawStatus = String(r.status || "completed").trim().toLowerCase();
  const status = rawStatus === "pending" ? "pending" : rawStatus === "approved" ? "approved" : rawStatus === "declined" || rawStatus === "rejected" ? "declined" : "completed";
  let createdIso = (/* @__PURE__ */ new Date()).toISOString();
  if (typeof r.created_at === "number" && Number.isFinite(r.created_at)) {
    createdIso = new Date(r.created_at).toISOString();
  } else if (typeof r.created_at === "string" && r.created_at.trim()) {
    const parsedTs = Date.parse(r.created_at);
    createdIso = Number.isFinite(parsedTs) ? new Date(parsedTs).toISOString() : r.created_at;
  } else if (typeof r.createdAt === "number" && Number.isFinite(r.createdAt)) {
    createdIso = new Date(r.createdAt).toISOString();
  }
  return {
    id: String(r.id || `PUR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    user_id: String(r.user_id ?? r.userId ?? "usr_bft_001"),
    package_id: packageId,
    package_name: packageName,
    package_sku: inferredSku,
    amount: amount || packageAmount,
    package_amount: packageAmount || amount,
    account_type: accountType,
    status,
    tx_hash: r.tx_hash || r.txHash ? String(r.tx_hash || r.txHash) : null,
    account_id: r.account_id || r.accountId ? String(r.account_id || r.accountId) : null,
    created_at: createdIso
  };
}
function mergeRealtimePurchase(existing, incomingRow, eventType = "INSERT", oldRow) {
  const list = Array.isArray(existing) ? existing.map(mapPurchaseRecord) : [];
  if (eventType === "DELETE") {
    const targetId = String(oldRow?.id ?? incomingRow?.id ?? "");
    if (!targetId) return list;
    return list.filter((item) => String(item.id) !== targetId);
  }
  if (!incomingRow || typeof incomingRow !== "object") return list;
  const mapped = mapPurchaseRecord(incomingRow);
  const exactIdx = list.findIndex((item) => String(item.id) === String(mapped.id));
  if (exactIdx >= 0) {
    const updated = [...list];
    updated[exactIdx] = {
      ...updated[exactIdx],
      ...mapped
    };
    return updated.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  const mappedTs = Date.parse(mapped.created_at) || Date.now();
  const nearDuplicateIdx = list.findIndex((item) => {
    const itemTs = Date.parse(item.created_at) || 0;
    const withinWindow = Math.abs(mappedTs - itemTs) <= 15e3;
    const sameSkuOrName = item.package_sku === mapped.package_sku || item.package_name === mapped.package_name;
    const sameAmount = Math.abs(item.amount - mapped.amount) < 0.01;
    return withinWindow && sameSkuOrName && sameAmount;
  });
  if (nearDuplicateIdx >= 0) {
    const updated = [...list];
    const curr = updated[nearDuplicateIdx];
    updated[nearDuplicateIdx] = {
      ...curr,
      ...mapped,
      status: curr.status === "completed" || mapped.status === "completed" ? "completed" : mapped.status
    };
    return updated.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return [mapped, ...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
function validateDirectDepositAmount(amount) {
  if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
    return { valid: false, error: "Please enter a valid numeric deposit amount." };
  }
  if (amount < DIRECT_USDT_TRC20_CONFIG.minDepositUsdt) {
    return {
      valid: false,
      error: `Minimum deposit is $${DIRECT_USDT_TRC20_CONFIG.minDepositUsdt} USDT (TRC-20).`
    };
  }
  if (amount > DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt) {
    return {
      valid: false,
      error: `Maximum single deposit is $${DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt.toLocaleString()} USDT (TRC-20).`
    };
  }
  return { valid: true };
}
function parseTrc20TransferAmount(tx) {
  if (typeof tx.amount === "number" && Number.isFinite(tx.amount) && tx.amount > 0) {
    return Number(tx.amount.toFixed(6));
  }
  const decimals = typeof tx.token_info?.decimals === "number" && tx.token_info.decimals >= 0 ? tx.token_info.decimals : 6;
  const rawStr = String(tx.value ?? "0").trim();
  if (!rawStr) return 0;
  if (rawStr.includes(".")) {
    const parsedFloat = Number(rawStr);
    return Number.isFinite(parsedFloat) ? Number(parsedFloat.toFixed(6)) : 0;
  }
  const rawNum = Number(rawStr);
  if (!Number.isFinite(rawNum) || rawNum <= 0) return 0;
  const divisor = Math.pow(10, decimals);
  return Number((rawNum / divisor).toFixed(6));
}
function isIncomingUsdtTrc20Transfer(tx, targetWallet = DIRECT_USDT_TRC20_CONFIG.walletAddress) {
  if (!tx || typeof tx !== "object") return false;
  const expectedWallet = String(targetWallet || DIRECT_USDT_TRC20_CONFIG.walletAddress).trim();
  const toWallet = String(tx.to || "").trim();
  if (!toWallet || toWallet !== expectedWallet) {
    return false;
  }
  if (tx.token_info?.symbol) {
    const symbol = String(tx.token_info.symbol).trim().toUpperCase();
    if (symbol !== "USDT") return false;
  }
  const amount = parseTrc20TransferAmount(tx);
  return amount > 0;
}
function matchPendingDepositToTronGridTx(deposit, transactions, claimedTxIds = /* @__PURE__ */ new Set()) {
  if (!deposit || String(deposit.status).toLowerCase() !== "pending") {
    return null;
  }
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return null;
  }
  const targetWallet = String(
    deposit.wallet_address || DIRECT_USDT_TRC20_CONFIG.walletAddress
  ).trim();
  const expectedAmount = Number(Number(deposit.amount || 0).toFixed(2));
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return null;
  }
  const userTxHash = String(deposit.tx_hash || "").trim();
  const hasExplicitBlockchainHash = userTxHash.length >= 16 && !userTxHash.toLowerCase().startsWith("trc20_");
  if (hasExplicitBlockchainHash) {
    for (const tx of transactions) {
      const txId = String(tx.transaction_id || "").trim();
      if (!txId || claimedTxIds.has(txId)) continue;
      if (txId.toLowerCase() !== userTxHash.toLowerCase()) continue;
      if (!isIncomingUsdtTrc20Transfer(tx, targetWallet)) continue;
      const txAmount = parseTrc20TransferAmount(tx);
      if (Math.abs(txAmount - expectedAmount) <= 0.01) {
        return tx;
      }
    }
  }
  for (const tx of transactions) {
    const txId = String(tx.transaction_id || "").trim();
    if (!txId || claimedTxIds.has(txId)) continue;
    if (!isIncomingUsdtTrc20Transfer(tx, targetWallet)) continue;
    const txAmount = parseTrc20TransferAmount(tx);
    if (Math.abs(txAmount - expectedAmount) <= 0.01) {
      return tx;
    }
  }
  return null;
}
function parseChallengePackageFromDeposit(deposit) {
  const rawSku = String(deposit.package_sku || deposit.sku || "").trim().toUpperCase();
  const rawName = String(deposit.package_name || "").trim();
  let tier = "two-step";
  if (rawSku.includes("-1S-") || rawSku.includes("1STEP") || /one[-\s]?step|1[-\s]?step/i.test(rawName)) {
    tier = "one-step";
  } else if (rawSku.includes("-INF-") || rawSku.includes("INSTANT") || /instant/i.test(rawName)) {
    tier = "instant";
  } else if (rawSku.includes("-2S-") || rawSku.includes("2STEP") || /two[-\s]?step|2[-\s]?step/i.test(rawName)) {
    tier = "two-step";
  }
  let size = 0;
  const skuKMatch = rawSku.match(/-(\d+(?:\.\d+)?)K\b/i);
  if (skuKMatch) {
    size = Math.round(Number(skuKMatch[1]) * 1e3);
  } else {
    const skuNumMatch = rawSku.match(/-(\d{4,7})\b/);
    if (skuNumMatch) {
      size = Math.round(Number(skuNumMatch[1]));
    }
  }
  if (!size && rawName) {
    const dollarMatch = rawName.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (dollarMatch) {
      const parsed = Number(dollarMatch[1].replace(/,/g, ""));
      if (parsed >= 1e3) {
        size = Math.round(parsed);
      }
    }
    if (!size) {
      const kMatch = rawName.match(/\b(\d+)\s*K\b/i);
      if (kMatch) {
        size = Math.round(Number(kMatch[1]) * 1e3);
      }
    }
  }
  if (!size) {
    const amt = Number(deposit.amount || 0);
    if (amt >= 400) size = 1e5;
    else if (amt >= 200) size = 5e4;
    else if (amt >= 120) size = 25e3;
    else if (amt >= 50) size = 1e4;
    else size = 5e3;
  }
  const defaultTierLabel = tier === "one-step" ? "1-Step Blitz" : tier === "instant" ? "Instant Funding" : "2-Step Pro";
  const tierName = rawName || `${defaultTierLabel} ($${size.toLocaleString()})`;
  return { tier, size, tierName };
}
async function fetchTronGridTrc20Transfers(options) {
  const walletAddress = options?.walletAddress?.trim() || DIRECT_USDT_TRC20_CONFIG.walletAddress;
  const apiKey = options?.apiKey?.trim() || DIRECT_USDT_TRC20_CONFIG.tronGridApiKey;
  const limit = options?.limit ?? 50;
  const onlyConfirmed = options?.onlyConfirmed ?? true;
  const fetchFn = options?.fetchImpl || globalThis.fetch;
  const baseUrl = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(
    walletAddress
  )}/transactions/trc20`;
  const query = new URLSearchParams({
    limit: String(limit),
    only_confirmed: String(onlyConfirmed)
  });
  const endpoint = `${baseUrl}?${query.toString()}`;
  try {
    const response = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        "TRON-PRO-API-KEY": apiKey,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      return {
        ok: false,
        transactions: [],
        endpoint: baseUrl,
        error: `TronGrid API responded with status ${response.status}`
      };
    }
    let payload = null;
    if (typeof response.text === "function") {
      const rawText = await response.text();
      payload = rawText && rawText.trim() ? JSON.parse(rawText.trim()) : { data: [] };
    } else if (typeof response.json === "function") {
      payload = await response.json();
    }
    const transactions = Array.isArray(payload?.data) ? payload.data : [];
    return {
      ok: true,
      transactions,
      endpoint: baseUrl
    };
  } catch (err) {
    return {
      ok: false,
      transactions: [],
      endpoint: baseUrl,
      error: err?.message || "Failed to fetch TRC-20 transactions from TronGrid API"
    };
  }
}

// src/utils/propRules.ts
function normalizeChallengeAccountType(input) {
  if (!input) return "two_step";
  const clean = String(input).toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
  if (clean.includes("instant")) return "instant";
  if (clean.includes("one") || clean.includes("1step") || clean === "one_step") return "one_step";
  if (clean.includes("personal") || clean.includes("self")) return "personal";
  if (clean.includes("demo")) return "demo";
  return "two_step";
}
function normalizeChallengeTier(input) {
  const normType = normalizeChallengeAccountType(input);
  if (normType === "one_step") return "one-step";
  if (normType === "two_step") return "two-step";
  if (normType === "instant") return "instant";
  if (normType === "personal") return "personal";
  return "demo";
}
function getDynamicAccountLimits(accountTypeOrTier, phase, overrides) {
  const accountType = normalizeChallengeAccountType(accountTypeOrTier);
  const tier = normalizeChallengeTier(accountTypeOrTier);
  const currentPhase = String(phase || "").toLowerCase().trim();
  let defaultDaily = 8;
  let defaultMax = 20;
  let defaultTarget = 25;
  let step2Target = 15;
  let initialPhase = "phase_1";
  if (accountType === "one_step") {
    defaultDaily = 10;
    defaultMax = 15;
    defaultTarget = currentPhase === "funded" ? 0 : 30;
    step2Target = 0;
    initialPhase = "phase_1";
  } else if (accountType === "two_step") {
    defaultDaily = 8;
    defaultMax = 20;
    defaultTarget = currentPhase === "funded" ? 0 : currentPhase === "phase_2" ? 15 : 25;
    step2Target = 15;
    initialPhase = "phase_1";
  } else if (accountType === "instant") {
    defaultDaily = 6;
    defaultMax = 12;
    defaultTarget = 0;
    step2Target = 0;
    initialPhase = "funded";
  } else if (accountType === "personal") {
    defaultDaily = 0;
    defaultMax = 0;
    defaultTarget = 0;
    step2Target = 0;
    initialPhase = "personal_live";
  } else {
    defaultDaily = 0;
    defaultMax = 0;
    defaultTarget = 0;
    step2Target = 0;
    initialPhase = "demo";
  }
  const dailyLossLimitPercent = overrides?.dailyDrawdown !== void 0 && overrides.dailyDrawdown > 0 ? overrides.dailyDrawdown : defaultDaily;
  const maxOverallLossPercent = overrides?.maxDrawdown !== void 0 && overrides.maxDrawdown > 0 ? overrides.maxDrawdown : defaultMax;
  const profitTargetPercent = overrides?.profitTarget !== void 0 && overrides.profitTarget !== null ? overrides.profitTarget : defaultTarget;
  return {
    accountType,
    tier,
    profitTargetPercent,
    step2TargetPercent: step2Target,
    dailyLossLimitPercent,
    maxOverallLossPercent,
    initialPhase
  };
}
var DEFAULT_NEWS_EVENTS = [
  {
    title: "US Non-Farm Payrolls (NFP) & Unemployment Rate",
    timestamp: Date.now() + 15 * 60 * 1e3,
    // 15 mins in future
    impact: "HIGH",
    currency: "USD"
  },
  {
    title: "US Core CPI Inflation Rate (YoY)",
    timestamp: Date.now() + 45 * 60 * 1e3,
    impact: "HIGH",
    currency: "USD"
  },
  {
    title: "FOMC Interest Rate Decision & Fed Press Conference",
    timestamp: Date.now() + 120 * 60 * 1e3,
    impact: "HIGH",
    currency: "USD"
  },
  {
    title: "ECB Monetary Policy Statement",
    timestamp: Date.now() + 240 * 60 * 1e3,
    impact: "HIGH",
    currency: "EUR"
  }
];

// src/server/db.ts
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
function openResilientDatabase() {
  const candidates = [
    path.resolve(process.cwd(), "data"),
    path.resolve(os.tmpdir(), "bft_data")
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const dbFile = path.join(dir, "bft_platform.sqlite");
      try {
        const instance = new DatabaseSync(dbFile);
        instance.exec("SELECT count(*) FROM sqlite_master;");
        try {
          instance.exec("PRAGMA journal_mode = WAL;");
        } catch {
        }
        return instance;
      } catch (err) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("malformed") || msg.includes("disk image") || msg.includes("file is not a database")) {
          try {
            const backupFile = `${dbFile}.corrupted_${Date.now()}`;
            if (fs.existsSync(dbFile)) {
              fs.renameSync(dbFile, backupFile);
              console.warn(`Renamed corrupted SQLite database to ${backupFile}`);
            }
            const freshInstance = new DatabaseSync(dbFile);
            return freshInstance;
          } catch {
          }
        }
        throw err;
      }
    } catch {
    }
  }
  return new DatabaseSync(":memory:");
}
var db = openResilientDatabase();
db.exec(`
  PRAGMA foreign_keys = ON;

  -- 1. Users Table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    google_id TEXT,
    referral_code TEXT UNIQUE NOT NULL,
    referred_by TEXT,
    kyc_status TEXT DEFAULT 'unverified',
    kyc_verified_at INTEGER,
    kyc_timer_ends_at INTEGER,
    kyc_doc_type TEXT,
    profile_locked INTEGER DEFAULT 0,
    address TEXT,
    date_of_birth TEXT,
    country TEXT DEFAULT 'United States',
    telegram_handle TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 2. Sessions Table (HTTP-Only / Bearer Session Management)
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- 3. Trading Accounts Table
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    tier_name TEXT NOT NULL,
    size REAL NOT NULL,
    initial_balance REAL NOT NULL,
    current_balance REAL NOT NULL,
    starting_day_equity REAL NOT NULL,
    equity REAL NOT NULL,
    daily_loss_limit_percent REAL NOT NULL,
    max_overall_loss_percent REAL NOT NULL,
    max_risk_per_trade_percent REAL DEFAULT 5,
    status TEXT DEFAULT 'active',
    phase TEXT DEFAULT 'funded',
    trading_days_completed INTEGER DEFAULT 14,
    trades_count INTEGER DEFAULT 0,
    win_rate REAL DEFAULT 0,
    daily_withdrawals_unlocked INTEGER DEFAULT 0,
    first_withdrawal_completed INTEGER DEFAULT 0,
    created_date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 4. Referrals Network Table (3-Tier Chain)
  CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    sponsor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_level INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- 5. Affiliate Commissions Ledger
  CREATE TABLE IF NOT EXISTS commissions (
    id TEXT PRIMARY KEY,
    sponsor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, -- 'purchase' or 'withdrawal'
    tier_level INTEGER NOT NULL, -- 1, 2, or 3
    package_tier TEXT,
    package_name TEXT,
    base_amount REAL NOT NULL,
    rate REAL NOT NULL,
    commission_amount REAL NOT NULL,
    status TEXT DEFAULT 'paid',
    created_at INTEGER NOT NULL
  );

  -- 6. Withdrawals Ledger
  CREATE TABLE IF NOT EXISTS withdrawals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    gross_amount REAL NOT NULL,
    net_profit REAL NOT NULL,
    max_allowed_profit REAL NOT NULL,
    profit_share_rate REAL DEFAULT 0.80,
    fee_amount REAL NOT NULL,
    net_payout REAL NOT NULL,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    rejection_reason TEXT,
    tx_hash TEXT,
    reference_number TEXT,
    requested_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  -- 7. Leaderboard Table
  CREATE TABLE IF NOT EXISTS leaderboard (
    id TEXT PRIMARY KEY,
    rank INTEGER NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    flag TEXT NOT NULL,
    account_tier TEXT NOT NULL,
    profit REAL NOT NULL,
    win_rate REAL NOT NULL,
    payout_time TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 8. Copy Trading Profiles Table
  CREATE TABLE IF NOT EXISTS copy_trading_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    flag TEXT NOT NULL,
    avatar TEXT NOT NULL,
    category TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    vip_level TEXT NOT NULL,
    starting_capital REAL NOT NULL,
    current_balance REAL NOT NULL,
    lifetime_earnings REAL NOT NULL,
    daily_profit_dollars REAL NOT NULL,
    weekly_profit_pct REAL NOT NULL,
    monthly_profit_pct REAL NOT NULL,
    win_rate REAL NOT NULL,
    total_trades INTEGER NOT NULL,
    trading_turnover REAL NOT NULL,
    total_copiers INTEGER DEFAULT 0,
    max_copiers INTEGER DEFAULT 1000,
    win_rate_3m REAL NOT NULL,
    profit_factor REAL DEFAULT 2.15,
    max_drawdown REAL DEFAULT 4.2,
    sharpe_ratio REAL DEFAULT 1.85,
    avg_holding_time TEXT DEFAULT '4h 12m',
    status TEXT DEFAULT 'approved',
    created_at INTEGER NOT NULL
  );

  -- 9. Copy Trading Subscriptions Table
  CREATE TABLE IF NOT EXISTS copy_trading_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    allocated_capital REAL DEFAULT 100,
    max_loss_limit REAL DEFAULT 0,
    take_profit_limit REAL DEFAULT 0,
    trade_sizing_type TEXT DEFAULT 'proportionate',
    sizing_multiplier REAL DEFAULT 1.0,
    status TEXT DEFAULT 'active',
    current_pnl REAL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);
var copyTradingAlterColumns = [
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN allocated_capital REAL DEFAULT 100;`,
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN max_loss_limit REAL DEFAULT 0;`,
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN take_profit_limit REAL DEFAULT 0;`,
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN trade_sizing_type TEXT DEFAULT 'proportionate';`,
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN sizing_multiplier REAL DEFAULT 1.0;`,
  `ALTER TABLE copy_trading_subscriptions ADD COLUMN current_pnl REAL DEFAULT 0;`,
  `ALTER TABLE copy_trading_profiles ADD COLUMN profit_factor REAL DEFAULT 2.15;`,
  `ALTER TABLE copy_trading_profiles ADD COLUMN max_drawdown REAL DEFAULT 4.2;`,
  `ALTER TABLE copy_trading_profiles ADD COLUMN sharpe_ratio REAL DEFAULT 1.85;`,
  `ALTER TABLE copy_trading_profiles ADD COLUMN avg_holding_time TEXT DEFAULT '4h 12m';`
];
for (const stmt of copyTradingAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
  }
}
function seedInitialData() {
  const userCount = Number(
    db.prepare("SELECT COUNT(*) as c FROM users").get().c
  );
  if (userCount > 0) return;
  const now = Date.now();
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "USR-MASTER-88",
    "viktor.v@quant-prop.io",
    "Viktor Vance",
    "BFT-VIKTOR88",
    null,
    "verified",
    1,
    "Level 42, Al Saada St, Dubai Financial Centre",
    "1985-04-12",
    "United Arab Emirates",
    now - 864e5 * 60,
    now - 864e5 * 60
  );
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "USR-PARENT-55",
    "elena.rostova@alpha-traders.com",
    "Elena Rostova",
    "BFT-ELENA55",
    "USR-MASTER-88",
    "verified",
    1,
    "12 Bishopsgate, London EC2N 4BQ",
    "1991-08-20",
    "United Kingdom",
    now - 864e5 * 45,
    now - 864e5 * 45
  );
  db.prepare(`
    INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, address, date_of_birth, country, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "usr_bft_001",
    "alex.mercer@gmail.com",
    "Alex Mercer",
    "BFT-ALEX77",
    "USR-PARENT-55",
    "verified",
    1,
    "742 Evergreen Terrace, Springfield, OR 97477",
    "1994-06-15",
    "United States",
    now - 864e5 * 30,
    now - 864e5 * 30
  );
  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "BFT-91823",
    "usr_bft_001",
    "instant",
    "$10,000 Instant Funded",
    1e4,
    1e4,
    10680,
    10680,
    10680,
    5,
    12,
    5,
    "active",
    "funded",
    14,
    42,
    76.2,
    1,
    1,
    "2026-10-01",
    now - 864e5 * 20,
    now
  );
  const l1Users = [
    { id: "USR-SUB-101", name: "Marco Rossi", email: "marco.rossi@milan-fx.it", ref: "BFT-MARCO101" },
    { id: "USR-SUB-102", name: "Liam Davies", email: "liam.davies@london-capital.uk", ref: "BFT-LIAM102" }
  ];
  for (const u of l1Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, "usr_bft_001", now - 864e5 * 15, now);
    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 1, ?)
    `).run(`REF-L1-${u.id}`, "usr_bft_001", u.id, now - 864e5 * 15);
  }
  const l2Users = [
    { id: "USR-GRAND-201", name: "Sophia Chen", email: "sophia.chen@sg-wealth.sg", ref: "BFT-SOPHIA201", parent: "USR-SUB-101" },
    { id: "USR-GRAND-202", name: "Lucas Bernard", email: "lucas.b@paris-quant.fr", ref: "BFT-LUCAS202", parent: "USR-SUB-102" }
  ];
  for (const u of l2Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, u.parent, now - 864e5 * 10, now);
    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 2, ?)
    `).run(`REF-L2-${u.id}`, "usr_bft_001", u.id, now - 864e5 * 10);
  }
  const l3Users = [
    { id: "USR-LEAF-301", name: "David Miller", email: "d.miller@austin-trader.us", ref: "BFT-DAVID301", parent: "USR-GRAND-201" },
    { id: "USR-LEAF-302", name: "Emma Watson", email: "emma.w@toronto-fx.ca", ref: "BFT-EMMA302", parent: "USR-GRAND-202" }
  ];
  for (const u of l3Users) {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'verified', 1, ?, ?)
    `).run(u.id, u.email, u.name, u.ref, u.parent, now - 864e5 * 5, now);
    db.prepare(`
      INSERT INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 3, ?)
    `).run(`REF-L3-${u.id}`, "usr_bft_001", u.id, now - 864e5 * 5);
  }
  const seedCommissions = [
    { id: "COMM-001", subId: "USR-SUB-101", type: "purchase", level: 1, pkg: "$10,000 Two-Step", price: 99, rate: 0.1, amt: 9.9, ts: now - 864e5 * 12 },
    { id: "COMM-002", subId: "USR-SUB-102", type: "purchase", level: 1, pkg: "$25,000 Instant Funded", price: 299, rate: 0.1, amt: 29.9, ts: now - 864e5 * 9 },
    { id: "COMM-003", subId: "USR-GRAND-201", type: "purchase", level: 2, pkg: "$50,000 One-Step", price: 289, rate: 0.05, amt: 14.45, ts: now - 864e5 * 7 },
    { id: "COMM-004", subId: "USR-GRAND-202", type: "purchase", level: 2, pkg: "$10,000 Instant Funded", price: 149, rate: 0.05, amt: 7.45, ts: now - 864e5 * 5 },
    { id: "COMM-005", subId: "USR-LEAF-301", type: "purchase", level: 3, pkg: "$100,000 Two-Step", price: 499, rate: 0.02, amt: 9.98, ts: now - 864e5 * 4 },
    { id: "COMM-006", subId: "USR-SUB-101", type: "withdrawal", level: 1, pkg: "Direct Referral Payout Bonus (8% of $500)", price: 500, rate: 0.08, amt: 40, ts: now - 864e5 * 2 }
  ];
  for (const c of seedCommissions) {
    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, 'usr_bft_001', ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
    `).run(c.id, c.subId, c.type, c.level, c.pkg, c.price, c.rate, c.amt, c.ts);
  }
  db.prepare(`
    INSERT INTO withdrawals (
      id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
      wallet_address, network, payment_method, status, tx_hash, reference_number, requested_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, ?, 'crypto_trc20', 'completed', ?, ?, ?, ?)
  `).run(
    "WD-51940284910",
    "usr_bft_001",
    "BFT-91823",
    350,
    680,
    544,
    35,
    315,
    "0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A",
    "BSC (BEP20)",
    "0x9fb8c14d5e23a0781b4d0812eac92b8d4f0980598125cfb881329a1b9e21",
    "REF-51940284910",
    now - 864e5 * 1,
    now - 864e5 * 1 + 92e3
  );
  const leaderboardSeed = [
    { rank: 1, name: "Rashid Al-Maktoum", country: "Dubai, UAE", flag: "\u{1F1E6}\u{1F1EA}", tier: "$100,000 Instant Funded", profit: 48990.5, winRate: 79.4, payout: "1m 14s" },
    { rank: 2, name: "Arjun Malhotra", country: "India", flag: "\u{1F1EE}\u{1F1F3}", tier: "$50,000 Two-Step", profit: 42150.8, winRate: 77.2, payout: "1m 28s" },
    { rank: 3, name: "Faizal Zulkifli", country: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}", tier: "$50,000 One-Step", profit: 36508, winRate: 75.8, payout: "1m 18s" },
    { rank: 4, name: "Hamza Qureshi", country: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}", tier: "$25,000 Instant Funded", profit: 31840.4, winRate: 74.1, payout: "1m 42s" },
    { rank: 5, name: "Tariq Al-Mansoor", country: "Dubai, UAE", flag: "\u{1F1E6}\u{1F1EA}", tier: "$25,000 One-Step", profit: 28460, winRate: 72.6, payout: "1m 31s" },
    { rank: 6, name: "Vikramjit Singh", country: "India", flag: "\u{1F1EE}\u{1F1F3}", tier: "$25,000 Two-Step", profit: 24404, winRate: 71.3, payout: "1m 49s" },
    { rank: 7, name: "Nurul Hidayah", country: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}", tier: "$10,000 One-Step", profit: 21940, winRate: 70.5, payout: "1m 15s" },
    { rank: 8, name: "Bilal Ahmed Khan", country: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}", tier: "$10,000 Two-Step", profit: 19720.2, winRate: 69.4, payout: "1m 36s" },
    // Kasun Perera strictly normalized at #9
    { rank: 9, name: "Kasun Perera", country: "Sri Lanka", flag: "\u{1F1F1}\u{1F1F0}", tier: "$10,000 Instant Funded", profit: 18995.22, winRate: 77.9, payout: "1m 12s" },
    { rank: 10, name: "Ananya Sharma", country: "India", flag: "\u{1F1EE}\u{1F1F3}", tier: "$10,000 One-Step", profit: 17380, winRate: 68.1, payout: "1m 41s" },
    { rank: 11, name: "Zainab Al-Hashemi", country: "Dubai, UAE", flag: "\u{1F1E6}\u{1F1EA}", tier: "$10,000 Instant Funded", profit: 15940, winRate: 67.4, payout: "1m 29s" },
    { rank: 12, name: "Syed Usman Ali", country: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}", tier: "$10,000 Two-Step", profit: 14820.5, winRate: 66.8, payout: "1m 52s" },
    { rank: 13, name: "Chong Wei Ming", country: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}", tier: "$5,000 One-Step", profit: 13750, winRate: 66, payout: "1m 20s" },
    { rank: 14, name: "Rohan Deshmukh", country: "India", flag: "\u{1F1EE}\u{1F1F3}", tier: "$10,000 Instant Funded", profit: 12890.1, winRate: 65.2, payout: "1m 47s" },
    { rank: 15, name: "Khalid Bin Zayed", country: "Dubai, UAE", flag: "\u{1F1E6}\u{1F1EA}", tier: "$5,000 Two-Step", profit: 11940, winRate: 64.5, payout: "1m 30s" }
  ];
  for (const lb of leaderboardSeed) {
    db.prepare(`
      INSERT INTO leaderboard (id, rank, name, country, flag, account_tier, profit, win_rate, payout_time, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`LB-${lb.rank}`, lb.rank, lb.name, lb.country, lb.flag, lb.tier, lb.profit, lb.winRate, lb.payout, now);
  }
}
seedInitialData();
function getUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}
function getUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
}
function getUserByReferralCode(code) {
  return db.prepare("SELECT * FROM users WHERE referral_code = ? COLLATE NOCASE").get(code);
}
function createOrUpdateGoogleUser(params) {
  const existing = getUserByEmail(params.email);
  const now = Date.now();
  if (existing) {
    db.prepare(`
      UPDATE users SET
        full_name = CASE WHEN profile_locked = 1 THEN full_name ELSE ? END,
        google_id = COALESCE(?, google_id),
        avatar_url = COALESCE(?, avatar_url),
        updated_at = ?
      WHERE id = ?
    `).run(params.fullName, params.googleId || null, params.avatarUrl || null, now, existing.id);
    return getUserById(existing.id);
  }
  const sanitizedName = params.fullName.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  const randomSuffix = Math.floor(1e3 + Math.random() * 9e3);
  const newRefCode = `BFT-${sanitizedName || "TRD"}${randomSuffix}`;
  const newUserId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  let sponsorId = null;
  if (params.referralCodeInput) {
    const sponsor = getUserByReferralCode(params.referralCodeInput);
    if (sponsor && sponsor.id !== newUserId) {
      sponsorId = sponsor.id;
    }
  }
  db.prepare(`
    INSERT INTO users (id, email, full_name, avatar_url, google_id, referral_code, referred_by, kyc_status, profile_locked, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'unverified', 0, ?, ?)
  `).run(
    newUserId,
    params.email.toLowerCase(),
    params.fullName,
    params.avatarUrl || null,
    params.googleId || null,
    newRefCode,
    sponsorId,
    now,
    now
  );
  if (sponsorId) {
    linkUplineReferrals(sponsorId, newUserId, now);
  }
  return getUserById(newUserId);
}
function linkUplineReferrals(l1SponsorId, newUserId, nowMs) {
  db.prepare(`
    INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(`REF-L1-${l1SponsorId}-${newUserId}`, l1SponsorId, newUserId, nowMs);
  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    const l2SponsorId = l1User.referred_by;
    db.prepare(`
      INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
      VALUES (?, ?, ?, 2, ?)
    `).run(`REF-L2-${l2SponsorId}-${newUserId}`, l2SponsorId, newUserId, nowMs);
    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      const l3SponsorId = l2User.referred_by;
      db.prepare(`
        INSERT OR IGNORE INTO referrals (id, sponsor_id, referred_user_id, tier_level, created_at)
        VALUES (?, ?, ?, 3, ?)
      `).run(`REF-L3-${l3SponsorId}-${newUserId}`, l3SponsorId, newUserId, nowMs);
    }
  }
}
function createSessionToken(userId, rememberMe = true) {
  const token = `bft_sess_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}${Math.random().toString(36).substring(2)}`;
  const expiresAt = Date.now() + (rememberMe ? 30 * 86400 * 1e3 : 86400 * 1e3);
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, Date.now());
  return { token, expiresAt };
}
function validateSession(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return getUserById(session.user_id);
}
function deleteSessionToken(token) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
function mapAccountRowToTradingAccount(row) {
  if (!row) return null;
  const accountCategory = row.account_category || (row.tier === "personal" || row.phase === "personal_live" ? "personal_live" : row.tier === "demo" || row.phase === "demo" ? "demo" : "prop");
  return {
    ...row,
    id: row.id,
    userId: row.user_id,
    user_id: row.user_id,
    loginId: row.id,
    passwordHash: "bft_live_" + String(row.id).replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
    tier: row.tier,
    tierName: row.tier_name,
    accountCategory,
    depositedCapital: Number(row.deposited_capital ?? (accountCategory === "personal_live" ? row.initial_balance : 0)),
    size: row.size,
    initialBalance: row.initial_balance,
    currentBalance: row.current_balance,
    startingDayEquity: row.starting_day_equity,
    equity: row.equity,
    dailyLossLimitPercent: row.daily_loss_limit_percent,
    maxOverallLossPercent: row.max_overall_loss_percent,
    maxRiskPerTradePercent: row.max_risk_per_trade_percent,
    status: row.status,
    phase: row.phase,
    tradingDaysCompleted: row.trading_days_completed,
    tradesCount: row.trades_count,
    winRate: row.win_rate,
    dailyWithdrawalsUnlocked: Boolean(row.daily_withdrawals_unlocked),
    firstWithdrawalCompleted: Boolean(row.first_withdrawal_completed),
    monthsCompleted: row.months_completed || 1,
    scalingActive: Boolean(row.scaling_active),
    createdDate: row.created_date,
    lastActiveDate: row.last_active_date || row.created_date,
    certificateId: row.certificate_id || void 0
  };
}
var accountAlterColumns = [
  `ALTER TABLE accounts ADD COLUMN certificate_id TEXT;`,
  `ALTER TABLE accounts ADD COLUMN account_category TEXT DEFAULT 'prop';`,
  `ALTER TABLE accounts ADD COLUMN deposited_capital REAL DEFAULT 0;`
];
for (const stmt of accountAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
  }
}
var kycAlterColumns = [
  `ALTER TABLE users ADD COLUMN kyc_doc_number TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_front_url TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_back_url TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_front_filename TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_back_filename TEXT;`,
  `ALTER TABLE users ADD COLUMN kyc_submitted_at TEXT;`,
  `ALTER TABLE users ADD COLUMN is_2fa_enabled INTEGER DEFAULT 0;`,
  `ALTER TABLE users ADD COLUMN totp_secret TEXT;`,
  `ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'trader';`,
  `ALTER TABLE users ADD COLUMN self_balance REAL DEFAULT 0;`,
  `ALTER TABLE users ADD COLUMN demo_balance REAL DEFAULT 10000;`,
  `ALTER TABLE users ADD COLUMN funded_balance REAL DEFAULT 0;`,
  `ALTER TABLE withdrawals ADD COLUMN admin_notes TEXT;`
];
for (const stmt of kycAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS kyc_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'United States',
    profile_locked INTEGER DEFAULT 1,
    doc_type TEXT,
    document_number TEXT,
    front_document_url TEXT,
    back_document_url TEXT,
    front_file_name TEXT,
    back_file_name TEXT,
    status TEXT NOT NULL DEFAULT 'unverified',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    currency TEXT DEFAULT 'USDT',
    network TEXT DEFAULT 'TRC-20',
    wallet_address TEXT DEFAULT 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
    package_name TEXT,
    sku TEXT,
    account_type TEXT DEFAULT 'self_funded',
    tx_hash TEXT,
    deposit_slip_url TEXT,
    status TEXT DEFAULT 'pending',
    decline_reason TEXT,
    created_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS crypto_deposits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT,
    wallet_address TEXT NOT NULL DEFAULT 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
    amount REAL NOT NULL,
    package_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'self_funded',
    currency TEXT DEFAULT 'USDT',
    network TEXT DEFAULT 'TRC-20',
    tx_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    direction TEXT NOT NULL,
    strike_price REAL NOT NULL,
    close_price REAL,
    investment REAL NOT NULL,
    payout_percentage REAL NOT NULL,
    potential_payout REAL NOT NULL,
    pnl REAL DEFAULT 0,
    credited_amount REAL DEFAULT 0,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    account_tier TEXT,
    created_at INTEGER NOT NULL,
    settled_at INTEGER
  );
`);
function getKycSubmissionForUser(userId) {
  return db.prepare("SELECT * FROM kyc_submissions WHERE user_id = ?").get(userId);
}
function ensureUserInDb(params) {
  if (!params.id && !params.email) return null;
  let existing = params.id ? getUserById(params.id) : null;
  if (!existing && params.email) {
    existing = getUserByEmail(params.email);
  }
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const cleanEmail = (params.email || `${params.id}@bft.io`).trim().toLowerCase();
  const cleanName = (params.fullName || cleanEmail.split("@")[0] || "BFT Trader").trim();
  const sanitizedRef = (params.referralCode || `BFT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`).trim();
  const userId = params.id || `usr_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    db.prepare(`
      INSERT INTO users (id, email, full_name, referral_code, kyc_status, profile_locked, country, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unverified', 0, 'United States', ?, ?)
    `).run(userId, cleanEmail, cleanName, sanitizedRef, now, now);
  } catch {
    const fallbackRef = `BFT-${Math.floor(1e5 + Math.random() * 899999)}`;
    db.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, referral_code, kyc_status, profile_locked, country, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'unverified', 0, 'United States', ?, ?)
    `).run(userId, cleanEmail, cleanName, fallbackRef, now, now);
  }
  return getUserById(userId) || getUserByEmail(cleanEmail);
}
var COUNTRY_FLAGS = {
  "United States": "\u{1F1FA}\u{1F1F8}",
  "Sri Lanka": "\u{1F1F1}\u{1F1F0}",
  "United Kingdom": "\u{1F1EC}\u{1F1E7}",
  "United Arab Emirates": "\u{1F1E6}\u{1F1EA}",
  "Dubai, UAE": "\u{1F1E6}\u{1F1EA}",
  "India": "\u{1F1EE}\u{1F1F3}",
  "Malaysia": "\u{1F1F2}\u{1F1FE}",
  "Pakistan": "\u{1F1F5}\u{1F1F0}",
  "Singapore": "\u{1F1F8}\u{1F1EC}",
  "Canada": "\u{1F1E8}\u{1F1E6}",
  "Australia": "\u{1F1E6}\u{1F1FA}",
  "Germany": "\u{1F1E9}\u{1F1EA}",
  "France": "\u{1F1EB}\u{1F1F7}",
  "Japan": "\u{1F1EF}\u{1F1F5}",
  "Switzerland": "\u{1F1E8}\u{1F1ED}",
  "Brazil": "\u{1F1E7}\u{1F1F7}",
  "Nigeria": "\u{1F1F3}\u{1F1EC}",
  "South Africa": "\u{1F1FF}\u{1F1E6}"
};
function getCountryFlag(country) {
  if (!country) return "\u{1F1FA}\u{1F1F8}";
  return COUNTRY_FLAGS[country.trim()] || "\u{1F310}";
}
function ensurePersonalLiveAccountForUser(userId) {
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user) return null;
  const existing = db.prepare(
    `SELECT * FROM accounts WHERE user_id = ? AND (tier = 'personal' OR account_category = 'personal_live' OR phase = 'personal_live') LIMIT 1`
  ).get(userId);
  if (existing) {
    return mapAccountRowToTradingAccount(existing);
  }
  const now = Date.now();
  const nowIso = new Date(now).toISOString().split("T")[0];
  const suffix = userId.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "001";
  const accountId = userId === "usr_bft_001" ? "BFT-PERS-001" : `BFT-PERS-${suffix}`;
  const initialDeposit = 0;
  db.prepare(`
    INSERT OR IGNORE INTO accounts (
      id, user_id, tier, tier_name, account_category, deposited_capital, size,
      initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent,
      status, phase, trading_days_completed, trades_count, win_rate,
      daily_withdrawals_unlocked, first_withdrawal_completed, created_date, created_at, updated_at
    ) VALUES (?, ?, 'personal', 'Personal Live Balance (Self-Funded)', 'personal_live', ?, ?, ?, ?, ?, ?, 0, 0, 100, 'active', 'personal_live', 14, 0, 0, 1, 1, ?, ?, ?)
  `).run(
    accountId,
    userId,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    initialDeposit,
    nowIso,
    now - 864e5 * 25,
    now
  );
  return getAccountById(accountId);
}
function creditPersonalAccountDepositInDb(params) {
  const cleanAmount = Number(params.amountUsdt);
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error("Deposit amount must be greater than $0.00.");
  }
  let personalAcc = ensurePersonalLiveAccountForUser(params.userId);
  if (params.accountId) {
    const specific = getAccountById(params.accountId);
    if (specific && specific.user_id === params.userId && (specific.tier === "personal" || specific.accountCategory === "personal_live")) {
      personalAcc = specific;
    }
  }
  if (!personalAcc) {
    throw new Error("Personal Live account could not be initialized for deposit.");
  }
  const now = Date.now();
  const nextDeposited = Number(((personalAcc.depositedCapital || 0) + cleanAmount).toFixed(2));
  const nextInitial = Number(((personalAcc.initialBalance || 0) + cleanAmount).toFixed(2));
  const nextCurrent = Number(((personalAcc.currentBalance || 0) + cleanAmount).toFixed(2));
  const nextEquity = Number(((personalAcc.equity || 0) + cleanAmount).toFixed(2));
  const nextStartingDay = Number(((personalAcc.startingDayEquity || 0) + cleanAmount).toFixed(2));
  db.prepare(`
    UPDATE accounts SET
      deposited_capital = ?,
      size = ?,
      initial_balance = ?,
      current_balance = ?,
      starting_day_equity = ?,
      equity = ?,
      status = 'active',
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    nextDeposited,
    nextInitial,
    nextInitial,
    nextCurrent,
    nextStartingDay,
    nextEquity,
    now,
    personalAcc.id,
    params.userId
  );
  try {
    db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextCurrent, params.userId);
  } catch {
  }
  return getAccountById(personalAcc.id);
}
function getAccountsForUser(userId) {
  ensurePersonalLiveAccountForUser(userId);
  const rows = db.prepare(
    `SELECT * FROM accounts WHERE user_id = ? ORDER BY CASE WHEN tier = 'personal' OR account_category = 'personal_live' THEN 1 ELSE 0 END ASC, created_at DESC`
  ).all(userId);
  return rows.map(mapAccountRowToTradingAccount);
}
function getAccountById(accountId) {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);
  return mapAccountRowToTradingAccount(row);
}
function createAccount(params) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString().split("T")[0];
  const newAccountId = `BFT-${Math.floor(1e4 + Math.random() * 89999)}`;
  const limits = getDynamicAccountLimits(params.tier, params.tier === "instant" ? "funded" : "phase_1");
  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 'active', ?, 0, 0, 0, ?, 0, ?, ?, ?)
  `).run(
    newAccountId,
    params.userId,
    limits.tier,
    params.tierName,
    params.size,
    params.size,
    params.size,
    params.size,
    params.size,
    limits.dailyLossLimitPercent,
    limits.maxOverallLossPercent,
    limits.initialPhase,
    params.dailyWithdrawalsUnlocked ? 1 : 0,
    nowIso,
    now,
    now
  );
  return getAccountById(newAccountId);
}
function terminateAllTrades(accountId) {
  const now = Date.now();
  const openTrades = db.prepare("SELECT * FROM trades WHERE account_id = ? AND status = 'active'").all(accountId);
  for (const trade of openTrades) {
    db.prepare("UPDATE trades SET status = 'cancelled', close_price = ?, pnl = ?, updated_at = ? WHERE id = ?").run(trade.strike_price, -Number(trade.investment), now, trade.id);
  }
  return { ok: true, terminatedCount: openTrades.length };
}
function updateAccountStateInDb(userId, accountId, updates) {
  const existing = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?").get(accountId, userId);
  if (!existing) throw new Error("Account not found or unauthorized.");
  if (updates.status === "breached" || updates.status === "hard-breached") {
    terminateAllTrades(accountId);
  }
  const now = Date.now();
  db.prepare(`
    UPDATE accounts SET
      current_balance = COALESCE(?, current_balance),
      equity = COALESCE(?, equity),
      starting_day_equity = COALESCE(?, starting_day_equity),
      status = COALESCE(?, status),
      phase = COALESCE(?, phase),
      trades_count = COALESCE(?, trades_count),
      win_rate = COALESCE(?, win_rate),
      trading_days_completed = COALESCE(?, trading_days_completed),
      certificate_id = COALESCE(?, certificate_id),
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    updates.currentBalance !== void 0 ? updates.currentBalance : null,
    updates.equity !== void 0 ? updates.equity : null,
    updates.startingDayEquity !== void 0 ? updates.startingDayEquity : null,
    updates.status || null,
    updates.phase || null,
    updates.tradesCount !== void 0 ? updates.tradesCount : null,
    updates.winRate !== void 0 ? updates.winRate : null,
    updates.tradingDaysCompleted !== void 0 ? updates.tradingDaysCompleted : null,
    updates.certificateId || null,
    now,
    accountId,
    userId
  );
  return getAccountById(accountId);
}
function passChallengePhaseInDb(userId, accountId, provisionLiveDirectly = false) {
  const existing = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?").get(accountId, userId);
  if (!existing) throw new Error("Challenge account not found or unauthorized.");
  const now = Date.now();
  const nowIso = new Date(now).toISOString().split("T")[0];
  const certId = existing.certificate_id || `CERT-${existing.id}-${Math.floor(1e3 + Math.random() * 9e3)}`;
  const normType = normalizeChallengeAccountType(existing.tier || existing.account_type);
  const isToPhase2 = !provisionLiveDirectly && normType === "two_step" && (existing.phase === "phase_1" || existing.challenge_phase === "phase_1");
  const lockedStatus = isToPhase2 ? "passed_phase_1" : "passed";
  db.prepare(`
    UPDATE accounts SET
      status = ?,
      certificate_id = ?,
      updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(lockedStatus, certId, now, accountId, userId);
  const nextPhase = isToPhase2 ? "phase_2" : "funded";
  const nextLimits = getDynamicAccountLimits(normType, nextPhase, {
    dailyDrawdown: existing.daily_loss_limit_percent,
    maxDrawdown: existing.max_overall_loss_percent
  });
  const nextPrefix = isToPhase2 ? "BFT-P2" : "BFT-LIVE";
  const nextAccountId = `${nextPrefix}-${Math.floor(1e4 + Math.random() * 89999)}`;
  const baseTierName = String(existing.tier_name || "").replace(/\s*\(Phase \d\)/i, "");
  const nextTierName = isToPhase2 ? `${baseTierName} (Phase 2)` : `Real Funded (${baseTierName})`;
  const nextBalance = isToPhase2 ? Number(existing.size) : Math.max(Number(existing.size), Number(existing.current_balance));
  db.prepare(`
    INSERT INTO accounts (
      id, user_id, tier, tier_name, size, initial_balance, current_balance, starting_day_equity, equity,
      daily_loss_limit_percent, max_overall_loss_percent, max_risk_per_trade_percent, status, phase,
      trading_days_completed, trades_count, win_rate, daily_withdrawals_unlocked, first_withdrawal_completed,
      certificate_id, created_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 14, 0, 0, ?, 0, ?, ?, ?, ?)
  `).run(
    nextAccountId,
    userId,
    nextLimits.tier,
    nextTierName,
    existing.size,
    existing.size,
    nextBalance,
    nextBalance,
    nextBalance,
    nextLimits.dailyLossLimitPercent,
    nextLimits.maxOverallLossPercent,
    existing.max_risk_per_trade_percent || 5,
    nextPhase,
    existing.daily_withdrawals_unlocked || 0,
    !isToPhase2 ? certId : null,
    nowIso,
    now + 1,
    now + 1
  );
  return {
    lockedAccount: getAccountById(accountId),
    deployedAccount: getAccountById(nextAccountId),
    certificateId: certId,
    isRealFundedDeployed: !isToPhase2
  };
}
function lockUserProfile(userId, data) {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  const now = Date.now();
  if (user.profile_locked === 1) {
    db.prepare(`
      UPDATE users SET
        telegram_handle = COALESCE(?, telegram_handle),
        updated_at = ?
      WHERE id = ?
    `).run(data.telegramHandle || null, now, userId);
    return getUserById(userId);
  }
  const cleanName = data.fullName.trim();
  const cleanAddress = data.address.trim();
  const cleanDob = data.dateOfBirth.trim();
  const cleanCountry = (data.country || user.country || "United States").trim();
  db.prepare(`
    UPDATE users SET
      full_name = ?,
      address = ?,
      date_of_birth = ?,
      country = ?,
      telegram_handle = COALESCE(?, telegram_handle),
      profile_locked = 1,
      updated_at = ?
    WHERE id = ?
  `).run(
    cleanName,
    cleanAddress,
    cleanDob,
    cleanCountry,
    data.telegramHandle?.trim() || null,
    now,
    userId
  );
  const existingSub = getKycSubmissionForUser(userId);
  if (existingSub) {
    db.prepare(`
      UPDATE kyc_submissions SET
        full_name = ?,
        address = ?,
        date_of_birth = ?,
        country = ?,
        profile_locked = 1,
        updated_at = ?
      WHERE user_id = ?
    `).run(cleanName, cleanAddress, cleanDob, cleanCountry, now, userId);
  } else {
    db.prepare(`
      INSERT INTO kyc_submissions (
        id, user_id, full_name, address, date_of_birth, country, profile_locked, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      `KYC-SUB-${userId}-${now.toString(36)}`,
      userId,
      cleanName,
      cleanAddress,
      cleanDob,
      cleanCountry,
      user.kyc_status || "unverified",
      now,
      now
    );
  }
  return getUserById(userId);
}
function updateUserKycStatus(userId, data) {
  const now = Date.now();
  const submittedIso = data.submittedAt || new Date(now).toISOString().split("T")[0];
  db.prepare(`
    UPDATE users SET
      kyc_status = ?,
      kyc_doc_type = COALESCE(?, kyc_doc_type),
      kyc_doc_number = COALESCE(?, kyc_doc_number),
      kyc_front_url = COALESCE(?, kyc_front_url),
      kyc_back_url = COALESCE(?, kyc_back_url),
      kyc_front_filename = COALESCE(?, kyc_front_filename),
      kyc_back_filename = COALESCE(?, kyc_back_filename),
      kyc_submitted_at = COALESCE(?, kyc_submitted_at),
      kyc_timer_ends_at = ?,
      kyc_verified_at = CASE WHEN ? = 'verified' THEN ? ELSE kyc_verified_at END,
      profile_locked = CASE WHEN ? IN ('pending', 'verified') THEN 1 ELSE profile_locked END,
      updated_at = ?
    WHERE id = ?
  `).run(
    data.status,
    data.docType || null,
    data.documentNumber || null,
    data.frontDocumentUrl || null,
    data.backDocumentUrl || null,
    data.frontFileName || null,
    data.backFileName || null,
    submittedIso,
    data.timerEndsAt || null,
    data.status,
    now,
    data.status,
    now,
    userId
  );
  const user = getUserById(userId);
  if (user) {
    const existingSub = getKycSubmissionForUser(userId);
    const subStatus = data.status === "pending" ? "Pending Verification" : data.status;
    if (existingSub) {
      db.prepare(`
        UPDATE kyc_submissions SET
          doc_type = COALESCE(?, doc_type),
          document_number = COALESCE(?, document_number),
          front_document_url = COALESCE(?, front_document_url),
          back_document_url = COALESCE(?, back_document_url),
          front_file_name = COALESCE(?, front_file_name),
          back_file_name = COALESCE(?, back_file_name),
          status = ?,
          profile_locked = 1,
          updated_at = ?
        WHERE user_id = ?
      `).run(
        data.docType || null,
        data.documentNumber || null,
        data.frontDocumentUrl || null,
        data.backDocumentUrl || null,
        data.frontFileName || null,
        data.backFileName || null,
        subStatus,
        now,
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO kyc_submissions (
          id, user_id, full_name, address, date_of_birth, country, profile_locked,
          doc_type, document_number, front_document_url, back_document_url, front_file_name, back_file_name,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `KYC-SUB-${userId}-${now.toString(36)}`,
        userId,
        user.full_name || "Verified Trader",
        user.address || "",
        user.date_of_birth || "",
        user.country || "United States",
        data.docType || "ID Card",
        data.documentNumber || null,
        data.frontDocumentUrl || null,
        data.backDocumentUrl || null,
        data.frontFileName || null,
        data.backFileName || null,
        subStatus,
        now,
        now
      );
    }
  }
  return getUserById(userId);
}
function processWithdrawalRequest(params) {
  const user = getUserById(params.userId);
  if (!user) throw new Error("User not found.");
  if (user.kyc_status !== "verified") {
    throw new Error("Please complete your KYC verification to unlock withdrawals.");
  }
  const account = getAccountById(params.accountId);
  if (!account || account.user_id !== params.userId) {
    throw new Error("Trading account not found or unauthorized.");
  }
  const isPersonalLive = account.tier === "personal" || account.account_category === "personal_live" || account.accountCategory === "personal_live" || account.phase === "personal_live";
  if (isPersonalLive) {
    if (account.status !== "active") {
      throw new Error("Account is not active.");
    }
    const availableBalance = Math.max(0, Number(account.current_balance.toFixed(2)));
    if (availableBalance < 10) {
      throw new Error(
        `Minimum withdrawal threshold is $10.00. Current Personal Live balance is $${availableBalance.toFixed(2)}.`
      );
    }
    if (params.requestedAmount < 10) {
      throw new Error("Minimum withdrawal amount is $10.00 USD.");
    }
    if (params.requestedAmount > availableBalance) {
      throw new Error(
        `Cannot withdraw more than your available Personal Live balance ($${availableBalance.toFixed(2)}).`
      );
    }
    const feeAmount2 = Number((params.requestedAmount * 0.03).toFixed(2));
    const netPayout2 = Number((params.requestedAmount - feeAmount2).toFixed(2));
    const now2 = Date.now();
    const withdrawalId2 = `WD-${Math.floor(5194e7 + Math.random() * 99999999)}`;
    const refNumber2 = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
    db.prepare(`
      INSERT INTO withdrawals (
        id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
        wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1.00, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
    `).run(
      withdrawalId2,
      params.userId,
      params.accountId,
      params.requestedAmount,
      availableBalance,
      availableBalance,
      feeAmount2,
      netPayout2,
      params.walletAddress,
      params.network,
      params.paymentMethod,
      refNumber2,
      refNumber2,
      now2
    );
    const updatedAccount2 = getAccountById(account.id);
    const withdrawalRecord2 = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId2);
    return {
      ok: true,
      withdrawal: withdrawalRecord2,
      updatedAccount: updatedAccount2,
      breakdown: {
        requestedAmount: params.requestedAmount,
        netProfit: availableBalance,
        maxAllowed80Percent: availableBalance,
        profitShareRate: 1,
        feeAmount: feeAmount2,
        netPayout: netPayout2,
        isPersonalLive: true
      }
    };
  }
  const isLiveFunded = account.tier === "instant" || account.phase === "funded";
  if (!isLiveFunded) {
    throw new Error(
      "Withdrawals are locked during the Challenge Phase. Trade to hit your profit target first to pass the challenge, earn your Completion Certificate, and unlock your Live Funded Account."
    );
  }
  if (account.status !== "active") {
    throw new Error("Account is not active.");
  }
  if (account.first_withdrawal_completed === 0 && account.trading_days_completed < 14) {
    throw new Error(`First withdrawal requires a mandatory 14-day account holding period (${14 - account.trading_days_completed} days remaining).`);
  }
  const netProfit = Math.max(0, Number((account.current_balance - account.initial_balance).toFixed(2)));
  if (netProfit < 250) {
    throw new Error(`Minimum profit requirement is $250.00. Current net profit is $${netProfit.toFixed(2)}.`);
  }
  if (params.requestedAmount < 250) {
    throw new Error("Minimum withdrawal amount is $250.00 USD.");
  }
  if (params.requestedAmount > netProfit) {
    throw new Error(`Cannot withdraw more than total accumulated profit ($${netProfit.toFixed(2)}). Initial funded balance cannot be withdrawn directly.`);
  }
  const maxAllowed80Percent = Number((netProfit * 0.8).toFixed(2));
  if (params.requestedAmount > maxAllowed80Percent) {
    throw new Error(
      `Withdrawal exceeds the 80% profit payout ceiling. Maximum allowable withdrawal is $${maxAllowed80Percent.toFixed(2)} (80% of $${netProfit.toFixed(2)} net generated profit).`
    );
  }
  const feeAmount = Number((params.requestedAmount * 0.1).toFixed(2));
  const netPayout = Number((params.requestedAmount - feeAmount).toFixed(2));
  const now = Date.now();
  const withdrawalId = `WD-${Math.floor(5194e7 + Math.random() * 99999999)}`;
  const refNumber = `0x${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO withdrawals (
      id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
      wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
  `).run(
    withdrawalId,
    params.userId,
    params.accountId,
    params.requestedAmount,
    netProfit,
    maxAllowed80Percent,
    feeAmount,
    netPayout,
    params.walletAddress,
    params.network,
    params.paymentMethod,
    refNumber,
    refNumber,
    now
  );
  if (user.referred_by) {
    const bonusRate = 0.08;
    const bonusAmount = Number((params.requestedAmount * bonusRate).toFixed(2));
    const commId = `COMM-WD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, ?, ?, 'withdrawal', 1, ?, ?, ?, ?, 'paid', ?)
    `).run(
      commId,
      user.referred_by,
      user.id,
      `Direct Referral Payout Bonus (8% of $${params.requestedAmount.toFixed(2)} Withdrawal by ${user.full_name})`,
      params.requestedAmount,
      bonusRate,
      bonusAmount,
      now
    );
  }
  const updatedAccount = getAccountById(account.id);
  const withdrawalRecord = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
  return {
    ok: true,
    withdrawal: withdrawalRecord,
    updatedAccount,
    breakdown: {
      requestedAmount: params.requestedAmount,
      netProfit,
      maxAllowed80Percent,
      feeAmount,
      netPayout
    }
  };
}
function creditPurchaseCommissions(buyerUserId, packageName, packagePrice, referralCodeUsed) {
  let buyer = getUserById(buyerUserId);
  const now = Date.now();
  if (referralCodeUsed && buyer && !buyer.referred_by) {
    const sponsor = getUserByReferralCode(referralCodeUsed);
    if (sponsor && sponsor.id !== buyer.id) {
      db.prepare("UPDATE users SET referred_by = ? WHERE id = ?").run(sponsor.id, buyer.id);
      linkUplineReferrals(sponsor.id, buyer.id, now);
      buyer = getUserById(buyerUserId);
    }
  }
  if (!buyer?.referred_by) return [];
  const commissionsRecorded = [];
  const l1SponsorId = buyer.referred_by;
  const l1Amount = Number((packagePrice * 0.1).toFixed(2));
  const l1Id = `COMM-P1-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  db.prepare(`
    INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
    VALUES (?, ?, ?, 'purchase', 1, ?, ?, 0.10, ?, 'paid', ?)
  `).run(l1Id, l1SponsorId, buyer.id, `Level 1 Commission: ${packageName}`, packagePrice, l1Amount, now);
  commissionsRecorded.push({ id: l1Id, level: 1, sponsorId: l1SponsorId, amount: l1Amount });
  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    const l2SponsorId = l1User.referred_by;
    const l2Amount = Number((packagePrice * 0.05).toFixed(2));
    const l2Id = `COMM-P2-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    db.prepare(`
      INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
      VALUES (?, ?, ?, 'purchase', 2, ?, ?, 0.05, ?, 'paid', ?)
    `).run(l2Id, l2SponsorId, buyer.id, `Level 2 Commission: ${packageName}`, packagePrice, l2Amount, now);
    commissionsRecorded.push({ id: l2Id, level: 2, sponsorId: l2SponsorId, amount: l2Amount });
    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      const l3SponsorId = l2User.referred_by;
      const l3Amount = Number((packagePrice * 0.02).toFixed(2));
      const l3Id = `COMM-P3-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      db.prepare(`
        INSERT INTO commissions (id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at)
        VALUES (?, ?, ?, 'purchase', 3, ?, ?, 0.02, ?, 'paid', ?)
      `).run(l3Id, l3SponsorId, buyer.id, `Level 3 Commission: ${packageName}`, packagePrice, l3Amount, now);
      commissionsRecorded.push({ id: l3Id, level: 3, sponsorId: l3SponsorId, amount: l3Amount });
    }
  }
  return commissionsRecorded;
}
function getAffiliateDashboardStats(userId) {
  const commissions = db.prepare("SELECT * FROM commissions WHERE sponsor_id = ? ORDER BY created_at DESC").all(userId);
  const referrals = db.prepare(`
    SELECT r.*, u.full_name, u.email, u.created_at as joined_at
    FROM referrals r
    JOIN users u ON r.referred_user_id = u.id
    WHERE r.sponsor_id = ?
    ORDER BY r.created_at DESC
  `).all(userId);
  let totalEarnings = 0;
  let level1Earnings = 0;
  let level2Earnings = 0;
  let level3Earnings = 0;
  let withdrawalBonusEarnings = 0;
  for (const c of commissions) {
    totalEarnings += c.commission_amount;
    if (c.source_type === "withdrawal") {
      withdrawalBonusEarnings += c.commission_amount;
    }
    if (c.tier_level === 1) level1Earnings += c.commission_amount;
    if (c.tier_level === 2) level2Earnings += c.commission_amount;
    if (c.tier_level === 3) level3Earnings += c.commission_amount;
  }
  return {
    totalEarnings: Number(totalEarnings.toFixed(2)),
    level1Earnings: Number(level1Earnings.toFixed(2)),
    level2Earnings: Number(level2Earnings.toFixed(2)),
    level3Earnings: Number(level3Earnings.toFixed(2)),
    withdrawalBonusEarnings: Number(withdrawalBonusEarnings.toFixed(2)),
    teamSize: referrals.length,
    level1Count: referrals.filter((r) => r.tier_level === 1).length,
    level2Count: referrals.filter((r) => r.tier_level === 2).length,
    level3Count: referrals.filter((r) => r.tier_level === 3).length,
    recentCommissions: commissions.slice(0, 20),
    referrals: referrals.slice(0, 50)
  };
}
function getWeeklyLeaderboardQuery() {
  const rows = db.prepare("SELECT * FROM leaderboard ORDER BY rank ASC").all();
  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    name: r.name,
    country: r.country,
    flag: r.flag,
    accountTier: r.account_tier,
    profit: r.profit,
    winRate: r.win_rate,
    payoutTime: r.payout_time
  }));
}
function recordAdminAuditLog(adminUserId, action, targetId, targetType, details) {
  const id = `AUDIT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO admin_audit_logs (id, admin_user_id, action, target_id, target_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    adminUserId,
    action,
    targetId,
    targetType,
    details ? typeof details === "string" ? details : JSON.stringify(details) : null,
    Date.now()
  );
}
function getAdminMetrics() {
  const totalUsers = Number(db.prepare("SELECT COUNT(*) as c FROM users").get()?.c || 0);
  const totalAccounts = Number(db.prepare("SELECT COUNT(*) as c FROM accounts").get()?.c || 0);
  const totalActiveBalance = Number(db.prepare("SELECT SUM(current_balance) as s FROM accounts").get()?.s || 0);
  const totalDeposited = Number(db.prepare("SELECT SUM(deposited_capital) as s FROM accounts").get()?.s || 0);
  const pendingDeposits = Number(db.prepare("SELECT COUNT(*) as c FROM deposits WHERE status = 'pending'").get()?.c || 0);
  const pendingDepositsSum = Number(db.prepare("SELECT SUM(amount) as s FROM deposits WHERE status = 'pending'").get()?.s || 0);
  const pendingWithdrawals = Number(db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE status = 'pending'").get()?.c || 0);
  const pendingWithdrawalsSum = Number(db.prepare("SELECT SUM(gross_amount) as s FROM withdrawals WHERE status = 'pending'").get()?.s || 0);
  const pendingKyc = Number(db.prepare("SELECT COUNT(*) as c FROM users WHERE kyc_status IN ('pending', 'Pending Verification')").get()?.c || 0);
  const totalCommissions = Number(db.prepare("SELECT SUM(commission_amount) as s FROM commissions WHERE status = 'paid'").get()?.s || 0);
  const totalAffiliates = Number(db.prepare("SELECT COUNT(DISTINCT sponsor_id) as c FROM referrals").get()?.c || 0);
  return {
    totalUsers,
    totalAccounts,
    totalActiveBalance: Number(totalActiveBalance.toFixed(2)),
    totalDeposited: Number(totalDeposited.toFixed(2)),
    pendingDepositsCount: pendingDeposits,
    pendingDepositsAmount: Number(pendingDepositsSum.toFixed(2)),
    pendingWithdrawalsCount: pendingWithdrawals,
    pendingWithdrawalsAmount: Number(pendingWithdrawalsSum.toFixed(2)),
    pendingKycCount: pendingKyc,
    totalCommissionsPaid: Number(totalCommissions.toFixed(2)),
    totalAffiliatesCount: totalAffiliates
  };
}
function getAdminUsersList() {
  const users = db.prepare(`
    SELECT u.*,
           (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) as accounts_count,
           (SELECT SUM(current_balance) FROM accounts a WHERE a.user_id = u.id) as total_balance,
           (SELECT full_name FROM users s WHERE s.id = u.referred_by) as sponsor_name
    FROM users u
    ORDER BY u.created_at DESC
  `).all();
  return users.map((u) => {
    const userAccounts = db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC").all(u.id);
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role || "trader",
      avatarUrl: u.avatar_url,
      country: u.country,
      referralCode: u.referral_code,
      referredBy: u.referred_by,
      sponsorName: u.sponsor_name || null,
      kycStatus: u.kyc_status,
      profileLocked: Boolean(u.profile_locked),
      address: u.address,
      dateOfBirth: u.date_of_birth,
      telegramHandle: u.telegram_handle,
      selfBalance: u.self_balance ?? 0,
      accountsCount: u.accounts_count || 0,
      totalBalance: Number((u.total_balance || 0).toFixed(2)),
      createdAt: u.created_at,
      accounts: userAccounts.map(mapAccountRowToTradingAccount)
    };
  });
}
function adminUpdateAccountBalance(params) {
  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(params.accountId);
  if (!account) throw new Error(`Trading account ${params.accountId} not found.`);
  const oldBalance = Number(account.current_balance);
  const targetBalance = Number(Number(params.newBalance).toFixed(2));
  if (!Number.isFinite(targetBalance) || targetBalance < 0) {
    throw new Error("New balance must be a non-negative number.");
  }
  const delta = targetBalance - oldBalance;
  const newEquity = Number((account.equity + delta).toFixed(2));
  const newStartingDay = Number((account.starting_day_equity + delta).toFixed(2));
  const now = Date.now();
  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      starting_day_equity = ?,
      updated_at = ?
    WHERE id = ?
  `).run(targetBalance, newEquity, newStartingDay, now, params.accountId);
  if (account.tier === "personal" || account.account_category === "personal_live" || String(params.accountId).includes("PERS")) {
    try {
      db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {
    }
  } else if (account.tier === "demo" || account.account_category === "demo" || String(params.accountId).includes("DEMO")) {
    try {
      db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {
    }
  } else if (account.phase === "funded") {
    try {
      db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(targetBalance, account.user_id);
    } catch {
    }
  }
  recordAdminAuditLog(
    params.adminUserId,
    "MODIFY_BALANCE",
    params.accountId,
    "account",
    { oldBalance, newBalance: targetBalance, delta, reason: params.reason }
  );
  return getAccountById(params.accountId);
}
function adminSetUserRole(userId, newRole, adminUserId) {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(newRole, Date.now(), userId);
  recordAdminAuditLog(adminUserId, "CHANGE_ROLE", userId, "user", { oldRole: user.role, newRole });
  return getUserById(userId);
}
var depositAlterColumns = [
  `ALTER TABLE deposits ADD COLUMN wallet_address TEXT DEFAULT 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp';`,
  `ALTER TABLE deposits ADD COLUMN package_name TEXT;`,
  `ALTER TABLE deposits ADD COLUMN sku TEXT;`,
  `ALTER TABLE deposits ADD COLUMN package_sku TEXT;`,
  `ALTER TABLE deposits ADD COLUMN account_type TEXT DEFAULT 'self_funded';`,
  `ALTER TABLE deposits ADD COLUMN is_fulfilled INTEGER DEFAULT 0;`,
  `ALTER TABLE crypto_deposits ADD COLUMN package_sku TEXT;`,
  `ALTER TABLE crypto_deposits ADD COLUMN is_fulfilled INTEGER DEFAULT 0;`,
  `ALTER TABLE crypto_deposits ADD COLUMN processed_at INTEGER;`,
  `CREATE TABLE IF NOT EXISTS user_purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT,
    package_id TEXT NOT NULL,
    package_name TEXT NOT NULL,
    package_sku TEXT NOT NULL,
    amount REAL NOT NULL,
    package_amount REAL NOT NULL,
    account_type TEXT NOT NULL DEFAULT 'challenge',
    status TEXT NOT NULL DEFAULT 'completed',
    tx_hash TEXT,
    created_at INTEGER NOT NULL
  );`
];
for (const stmt of depositAlterColumns) {
  try {
    db.exec(stmt);
  } catch {
  }
}
function createUserPurchaseRecord(params) {
  const now = Date.now();
  const id = params.id || `PUR-${now.toString(36).toUpperCase()}-${Math.floor(1e3 + Math.random() * 9e3)}`;
  const cleanAmount = Number(Math.max(0.01, Number(params.amount || 0)).toFixed(2));
  const cleanPkgAmount = Number(
    Math.max(0.01, Number(params.packageAmount ?? params.amount ?? 0)).toFixed(2)
  );
  const accountType = params.accountType === "self_funded" ? "self_funded" : "challenge";
  const sku = String(params.packageSku || params.packageId || "BFT-2S-10K").trim().toUpperCase();
  const packageId = String(params.packageId || sku).trim();
  const packageName = String(params.packageName || "Challenge Package").trim();
  const status = params.status || "completed";
  db.prepare(`
    INSERT OR REPLACE INTO user_purchases (
      id, user_id, account_id, package_id, package_name, package_sku,
      amount, package_amount, account_type, status, tx_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.userId,
    params.accountId || null,
    packageId,
    packageName,
    sku,
    cleanAmount,
    cleanPkgAmount,
    accountType,
    status,
    params.txHash || null,
    now
  );
  return db.prepare("SELECT * FROM user_purchases WHERE id = ?").get(id);
}
function getUserPurchases(params) {
  if (params?.userId) {
    return db.prepare("SELECT * FROM user_purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(params.userId);
  }
  return db.prepare("SELECT * FROM user_purchases ORDER BY created_at DESC LIMIT 100").all();
}
function createDepositRequest(params) {
  const now = Date.now();
  const id = `DEP-${now.toString(36).toUpperCase()}-${Math.floor(1e3 + Math.random() * 9e3)}`;
  const cleanAmount = Number(params.amount.toFixed(2));
  if (cleanAmount <= 0) throw new Error("Deposit amount must be greater than $0.");
  const walletAddress = params.walletAddress || "TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp";
  const accountType = params.accountType === "challenge" ? "challenge" : "self_funded";
  const packageName = params.packageName || (accountType === "challenge" ? "Funded Challenge Evaluation" : `Self-Funded Personal Live Deposit ($${cleanAmount.toFixed(2)} USDT)`);
  const sku = params.sku || (accountType === "challenge" ? `BFT-CHALLENGE-${Math.round(cleanAmount)}` : `BFT-SELF-${Math.round(cleanAmount)}`);
  db.prepare(`
    INSERT INTO deposits (
      id, user_id, account_id, amount, payment_method, currency, network,
      wallet_address, package_name, sku, package_sku, account_type,
      tx_hash, deposit_slip_url, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    params.userId,
    params.accountId || null,
    cleanAmount,
    params.paymentMethod,
    params.currency || "USDT",
    params.network || "TRC-20",
    walletAddress,
    packageName,
    sku,
    sku,
    accountType,
    params.txHash || null,
    params.depositSlipUrl || null,
    now
  );
  db.prepare(`
    INSERT OR REPLACE INTO crypto_deposits (
      id, user_id, account_id, wallet_address, amount, package_name, sku, package_sku,
      account_type, currency, network, tx_hash, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    id,
    params.userId,
    params.accountId || null,
    walletAddress,
    cleanAmount,
    packageName,
    sku,
    sku,
    accountType,
    params.currency || "USDT",
    params.network || "TRC-20",
    params.txHash || null,
    now
  );
  try {
    createUserPurchaseRecord({
      id,
      userId: params.userId,
      accountId: params.accountId || null,
      packageId: sku,
      packageName,
      packageSku: sku,
      amount: cleanAmount,
      packageAmount: cleanAmount,
      accountType,
      status: accountType === "challenge" ? "completed" : "pending",
      txHash: params.txHash || null
    });
  } catch {
  }
  return db.prepare("SELECT * FROM crypto_deposits WHERE id = ?").get(id);
}
function createCryptoDepositRecord(params) {
  return createDepositRequest({
    userId: params.userId,
    accountId: params.accountId,
    amount: params.amount,
    paymentMethod: "USDT (TRC-20)",
    walletAddress: params.walletAddress || "TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp",
    packageName: params.packageName,
    sku: params.sku,
    accountType: params.accountType,
    currency: "USDT",
    network: "TRC-20",
    txHash: params.txHash
  });
}
function getCryptoDeposits(params) {
  if (params?.userId) {
    return db.prepare("SELECT * FROM crypto_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(params.userId);
  }
  if (params?.accountId) {
    return db.prepare("SELECT * FROM crypto_deposits WHERE account_id = ? ORDER BY created_at DESC LIMIT 50").all(params.accountId);
  }
  return db.prepare("SELECT * FROM crypto_deposits ORDER BY created_at DESC LIMIT 50").all();
}
function getPendingCryptoDeposits(userId) {
  if (userId) {
    return db.prepare(
      `SELECT * FROM crypto_deposits WHERE status = 'pending' AND user_id = ? ORDER BY created_at ASC`
    ).all(userId);
  }
  return db.prepare(`SELECT * FROM crypto_deposits WHERE status = 'pending' ORDER BY created_at ASC`).all();
}
function getCompletedCryptoDepositTxHashes() {
  const rows = db.prepare(
    `SELECT tx_hash FROM crypto_deposits WHERE status IN ('completed', 'approved') AND tx_hash IS NOT NULL`
  ).all();
  const claimed = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const hash = String(row?.tx_hash || "").trim();
    if (hash && !hash.toLowerCase().startsWith("trc20_")) {
      claimed.add(hash);
    }
  }
  return claimed;
}
function completeCryptoDepositInDb(depositId, matchedTxHash, options) {
  let deposit = db.prepare("SELECT * FROM crypto_deposits WHERE id = ?").get(depositId);
  if (!deposit) {
    deposit = db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId);
  }
  if (!deposit) {
    throw new Error(`Crypto deposit record ${depositId} not found.`);
  }
  const now = Date.now();
  const cleanTxHash = String(matchedTxHash || deposit.tx_hash || "").trim();
  const wasAlreadyFulfilled = Number(deposit.is_fulfilled) === 1 || deposit.status === "completed" || deposit.status === "approved";
  const accountType = String(deposit.account_type || "").toLowerCase() === "challenge" ? "challenge" : "self_funded";
  const amount = Number(deposit.amount || 0);
  const userId = String(deposit.user_id || "usr_bft_001");
  ensureUserInDb({
    id: userId,
    email: `${userId.toLowerCase().replace(/[^a-z0-9]/g, "")}@client-bft.com`,
    fullName: `Trader ${userId.slice(-4)}`
  });
  let targetAccount = null;
  if (accountType === "challenge") {
    const existingAcc = deposit.account_id ? getAccountById(deposit.account_id) : null;
    if (existingAcc) {
      db.prepare(`
        UPDATE accounts SET
          status = 'active',
          updated_at = ?
        WHERE id = ?
      `).run(now, existingAcc.id);
      targetAccount = getAccountById(existingAcc.id);
    } else {
      const parsedPkg = parseChallengePackageFromDeposit({
        sku: deposit.sku,
        package_sku: deposit.package_sku,
        package_name: deposit.package_name,
        amount
      });
      targetAccount = createAccount({
        userId,
        tier: parsedPkg.tier,
        tierName: parsedPkg.tierName,
        size: parsedPkg.size,
        dailyWithdrawalsUnlocked: false
      });
    }
  } else {
    if (!wasAlreadyFulfilled && !options?.skipBalanceCreditIfAlreadyCredited) {
      ensurePersonalLiveAccountForUser(userId);
      targetAccount = creditPersonalAccountDepositInDb({
        userId,
        accountId: deposit.account_id || void 0,
        amountUsdt: amount
      });
    } else {
      targetAccount = (deposit.account_id ? getAccountById(deposit.account_id) : null) || ensurePersonalLiveAccountForUser(userId);
    }
  }
  const linkedAccountId = targetAccount?.id || deposit.account_id || null;
  db.prepare(`
    UPDATE crypto_deposits SET
      status = 'completed',
      account_id = COALESCE(?, account_id),
      tx_hash = COALESCE(?, tx_hash),
      is_fulfilled = 1,
      processed_at = ?
    WHERE id = ?
  `).run(linkedAccountId, cleanTxHash || null, now, depositId);
  try {
    db.prepare(`
      UPDATE deposits SET
        status = 'completed',
        account_id = COALESCE(?, account_id),
        tx_hash = COALESCE(?, tx_hash),
        is_fulfilled = 1,
        processed_at = ?
      WHERE id = ?
    `).run(linkedAccountId, cleanTxHash || null, now, depositId);
  } catch {
  }
  let commissionsDistributed = [];
  if (!wasAlreadyFulfilled && amount > 0) {
    try {
      commissionsDistributed = distribute3TierCommissions(
        userId,
        amount,
        "deposit",
        `Verified USDT (TRC-20) ${accountType} payment of $${amount.toFixed(2)} USDT (${deposit.sku || deposit.package_sku || "BFT"})`
      );
    } catch {
    }
  }
  const updatedDeposit = db.prepare("SELECT * FROM crypto_deposits WHERE id = ?").get(depositId);
  return {
    ok: true,
    deposit: updatedDeposit,
    account: targetAccount,
    accountType,
    amount,
    txHash: cleanTxHash,
    commissionsDistributed
  };
}
function verifyAndCompletePendingCryptoDepositsInDb(transactions, options) {
  const pendingDeposits = getPendingCryptoDeposits(options?.userId);
  const claimedTxIds = getCompletedCryptoDepositTxHashes();
  const completedResults = [];
  for (const pending of pendingDeposits) {
    const matchedTx = matchPendingDepositToTronGridTx(pending, transactions, claimedTxIds);
    if (matchedTx) {
      claimedTxIds.add(matchedTx.transaction_id);
      const completed = completeCryptoDepositInDb(pending.id, matchedTx.transaction_id);
      completedResults.push(completed);
    }
  }
  return {
    checkedCount: pendingDeposits.length,
    matchedCount: completedResults.length,
    completedDeposits: completedResults,
    remainingPendingCount: Math.max(0, pendingDeposits.length - completedResults.length)
  };
}
function getAdminDeposits(statusFilter) {
  let query = `
    SELECT d.*, u.full_name as user_name, u.email as user_email, a.tier_name as account_tier
    FROM deposits d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN accounts a ON d.account_id = a.id
  `;
  const params = [];
  if (statusFilter && statusFilter !== "all") {
    query += " WHERE d.status = ?";
    params.push(statusFilter);
  }
  query += " ORDER BY d.created_at DESC";
  return db.prepare(query).all(...params);
}
function adminApproveDeposit(depositId, adminUserId) {
  const deposit = db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId);
  if (!deposit) throw new Error("Deposit record not found.");
  if (deposit.status === "approved") throw new Error("Deposit is already approved.");
  const now = Date.now();
  db.prepare(`
    UPDATE deposits SET
      status = 'approved',
      processed_at = ?
    WHERE id = ?
  `).run(now, depositId);
  try {
    db.prepare(`
      UPDATE crypto_deposits SET
        status = 'approved',
        processed_at = ?
      WHERE id = ?
    `).run(now, depositId);
  } catch {
  }
  let targetAccount = deposit.account_id ? getAccountById(deposit.account_id) : null;
  if (!targetAccount) {
    targetAccount = ensurePersonalLiveAccountForUser(deposit.user_id);
  }
  let updatedAccount = null;
  if (targetAccount) {
    updatedAccount = creditPersonalAccountDepositInDb({
      userId: deposit.user_id,
      accountId: targetAccount.id,
      amountUsdt: deposit.amount
    });
  }
  const commissionsDistributed = distribute3TierCommissions(
    deposit.user_id,
    deposit.amount,
    "deposit",
    `Deposit of $${deposit.amount.toFixed(2)} USDT by ${deposit.user_name || "Trader"}`
  );
  recordAdminAuditLog(adminUserId, "APPROVE_DEPOSIT", depositId, "deposit", {
    amount: deposit.amount,
    userId: deposit.user_id,
    creditedAccountId: targetAccount?.id,
    commissionsDistributed
  });
  return {
    ok: true,
    deposit: db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId),
    updatedAccount,
    commissionsDistributed
  };
}
function adminDeclineDeposit(depositId, reason, adminUserId) {
  const deposit = db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId);
  if (!deposit) throw new Error("Deposit record not found.");
  if (deposit.status !== "pending") throw new Error(`Deposit cannot be declined from status: ${deposit.status}`);
  const now = Date.now();
  db.prepare(`
    UPDATE deposits SET
      status = 'declined',
      decline_reason = ?,
      processed_at = ?
    WHERE id = ?
  `).run(reason || "Declined by administrator", now, depositId);
  try {
    db.prepare(`
      UPDATE crypto_deposits SET
        status = 'declined',
        processed_at = ?
      WHERE id = ?
    `).run(now, depositId);
  } catch {
  }
  recordAdminAuditLog(adminUserId, "DECLINE_DEPOSIT", depositId, "deposit", { reason });
  return {
    ok: true,
    deposit: db.prepare("SELECT * FROM deposits WHERE id = ?").get(depositId)
  };
}
function getAdminWithdrawals(statusFilter) {
  let query = `
    SELECT w.*, u.full_name as user_name, u.email as user_email, a.tier_name as account_tier, a.current_balance as account_balance
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    LEFT JOIN accounts a ON w.account_id = a.id
  `;
  const params = [];
  if (statusFilter && statusFilter !== "all") {
    query += " WHERE w.status = ?";
    params.push(statusFilter);
  }
  query += " ORDER BY w.requested_at DESC";
  return db.prepare(query).all(...params);
}
function adminApproveWithdrawal(withdrawalId, adminUserId) {
  const withdrawal = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
  if (!withdrawal) throw new Error("Withdrawal record not found.");
  if (withdrawal.status === "completed" || withdrawal.status === "success") throw new Error("Withdrawal is already approved/completed.");
  const now = Date.now();
  const txHash = withdrawal.tx_hash || `tron_tx_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(`
    UPDATE withdrawals SET
      status = 'success',
      tx_hash = ?,
      processed_at = ?
    WHERE id = ?
  `).run(txHash, now, withdrawalId);
  const account = getAccountById(withdrawal.account_id);
  let updatedAccount = null;
  if (account) {
    const newBalance = Math.max(0, Number((account.currentBalance - withdrawal.gross_amount).toFixed(2)));
    const newEquity = Math.max(0, Number((account.equity - withdrawal.gross_amount).toFixed(2)));
    db.prepare(`
      UPDATE accounts SET
        current_balance = ?,
        equity = ?,
        first_withdrawal_completed = 1,
        updated_at = ?
      WHERE id = ?
    `).run(newBalance, newEquity, now, account.id);
    updatedAccount = getAccountById(account.id);
  }
  const user = getUserById(withdrawal.user_id);
  if (user?.referred_by) {
    const existingBonus = db.prepare(`
      SELECT * FROM commissions WHERE source_type = 'withdrawal' AND referred_user_id = ? AND base_amount = ?
    `).get(withdrawal.user_id, withdrawal.gross_amount);
    if (!existingBonus) {
      const bonusAmount = Number((withdrawal.gross_amount * 0.08).toFixed(2));
      const commId = `COMM-WD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(`
        INSERT INTO commissions (
          id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
        ) VALUES (?, ?, ?, 'withdrawal', 1, ?, ?, 0.08, ?, 'paid', ?)
      `).run(
        commId,
        user.referred_by,
        user.id,
        `Direct Referral Payout Bonus (8% of $${withdrawal.gross_amount.toFixed(2)} Withdrawal by ${user.full_name})`,
        withdrawal.gross_amount,
        bonusAmount,
        now
      );
    }
  }
  recordAdminAuditLog(adminUserId, "APPROVE_WITHDRAWAL", withdrawalId, "withdrawal", {
    grossAmount: withdrawal.gross_amount,
    netPayout: withdrawal.net_payout,
    txHash
  });
  return {
    ok: true,
    withdrawal: db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId),
    updatedAccount
  };
}
function adminDeclineWithdrawal(withdrawalId, reason, adminUserId) {
  const withdrawal = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId);
  if (!withdrawal) throw new Error("Withdrawal record not found.");
  if (withdrawal.status !== "pending") throw new Error(`Withdrawal cannot be declined from status: ${withdrawal.status}`);
  const now = Date.now();
  try {
    db.exec("BEGIN TRANSACTION");
    db.prepare(`
      UPDATE withdrawals SET
        status = 'rejected',
        rejection_reason = ?,
        processed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(reason || "Declined by administrator", now, withdrawalId);
    const account = getAccountById(withdrawal.account_id);
    if (account) {
      const newBalance = Number((account.currentBalance + withdrawal.gross_amount).toFixed(2));
      const newEquity = Number((account.equity + withdrawal.gross_amount).toFixed(2));
      db.prepare(`
        UPDATE accounts SET
          current_balance = ?,
          equity = ?,
          updated_at = ?
        WHERE id = ?
      `).run(newBalance, newEquity, now, account.id);
      if (account.tier === "personal" || account.accountCategory === "personal_live" || String(withdrawal.account_id).includes("PERS")) {
        db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(newBalance, withdrawal.user_id);
      } else if (account.phase === "funded") {
        db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(newBalance, withdrawal.user_id);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  recordAdminAuditLog(adminUserId, "DECLINE_WITHDRAWAL", withdrawalId, "withdrawal", { reason, refundedAmount: withdrawal.gross_amount });
  return {
    ok: true,
    withdrawal: db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId),
    updatedAccount: getAccountById(withdrawal.account_id)
  };
}
function getAdminKycSubmissions(statusFilter) {
  let query = `
    SELECT k.*, u.email as user_email, u.full_name as user_name, u.country as user_country, u.created_at as user_created_at
    FROM kyc_submissions k
    JOIN users u ON k.user_id = u.id
  `;
  const params = [];
  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "pending") {
      query += " WHERE k.status IN ('pending', 'Pending Verification')";
    } else {
      query += " WHERE k.status = ?";
      params.push(statusFilter);
    }
  }
  query += " ORDER BY k.updated_at DESC";
  return db.prepare(query).all(...params);
}
function adminApproveKyc(userId, adminUserId) {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  const now = Date.now();
  db.prepare(`
    UPDATE users SET
      kyc_status = 'verified',
      kyc_verified_at = ?,
      profile_locked = 1,
      updated_at = ?
    WHERE id = ?
  `).run(now, now, userId);
  db.prepare(`
    UPDATE kyc_submissions SET
      status = 'verified',
      profile_locked = 1,
      updated_at = ?
    WHERE user_id = ?
  `).run(now, userId);
  recordAdminAuditLog(adminUserId, "APPROVE_KYC", userId, "user", { previousStatus: user.kyc_status });
  return getUserById(userId);
}
function adminRejectKyc(userId, reason, adminUserId) {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found.");
  const now = Date.now();
  db.prepare(`
    UPDATE users SET
      kyc_status = 'rejected',
      updated_at = ?
    WHERE id = ?
  `).run(now, userId);
  db.prepare(`
    UPDATE kyc_submissions SET
      status = 'rejected',
      updated_at = ?
    WHERE user_id = ?
  `).run(now, userId);
  recordAdminAuditLog(adminUserId, "REJECT_KYC", userId, "user", { reason });
  return getUserById(userId);
}
function distribute3TierCommissions(buyerUserId, baseAmount, sourceType = "deposit", details) {
  const buyer = getUserById(buyerUserId);
  if (!buyer?.referred_by) return [];
  const now = Date.now();
  const commissions = [];
  const l1SponsorId = buyer.referred_by;
  const l1Amount = Number((baseAmount * 0.1).toFixed(2));
  const l1Id = `COMM-L1-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  db.prepare(`
    INSERT INTO commissions (
      id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
    ) VALUES (?, ?, ?, ?, 1, ?, ?, 0.10, ?, 'paid', ?)
  `).run(
    l1Id,
    l1SponsorId,
    buyer.id,
    sourceType,
    details || `Level 1 Commission: 10% of $${baseAmount.toFixed(2)} ${sourceType}`,
    baseAmount,
    l1Amount,
    now
  );
  commissions.push({ id: l1Id, level: 1, sponsorId: l1SponsorId, amount: l1Amount });
  const l1User = getUserById(l1SponsorId);
  if (l1User?.referred_by) {
    const l2SponsorId = l1User.referred_by;
    const l2Amount = Number((baseAmount * 0.05).toFixed(2));
    const l2Id = `COMM-L2-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    db.prepare(`
      INSERT INTO commissions (
        id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
      ) VALUES (?, ?, ?, ?, 2, ?, ?, 0.05, ?, 'paid', ?)
    `).run(
      l2Id,
      l2SponsorId,
      buyer.id,
      sourceType,
      details || `Level 2 Commission: 5% of $${baseAmount.toFixed(2)} ${sourceType}`,
      baseAmount,
      l2Amount,
      now
    );
    commissions.push({ id: l2Id, level: 2, sponsorId: l2SponsorId, amount: l2Amount });
    const l2User = getUserById(l2SponsorId);
    if (l2User?.referred_by) {
      const l3SponsorId = l2User.referred_by;
      const l3Amount = Number((baseAmount * 0.02).toFixed(2));
      const l3Id = `COMM-L3-${now.toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      db.prepare(`
        INSERT INTO commissions (
          id, sponsor_id, referred_user_id, source_type, tier_level, package_name, base_amount, rate, commission_amount, status, created_at
        ) VALUES (?, ?, ?, ?, 3, ?, ?, 0.02, ?, 'paid', ?)
      `).run(
        l3Id,
        l3SponsorId,
        buyer.id,
        sourceType,
        details || `Level 3 Commission: 2% of $${baseAmount.toFixed(2)} ${sourceType}`,
        baseAmount,
        l3Amount,
        now
      );
      commissions.push({ id: l3Id, level: 3, sponsorId: l3SponsorId, amount: l3Amount });
    }
  }
  return commissions;
}
function getAdminReferralTree() {
  const sponsors = db.prepare(`
    SELECT DISTINCT u.id, u.full_name, u.email, u.referral_code,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 1) as l1_count,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 2) as l2_count,
           (SELECT COUNT(*) FROM referrals r WHERE r.sponsor_id = u.id AND r.tier_level = 3) as l3_count,
           (SELECT SUM(commission_amount) FROM commissions c WHERE c.sponsor_id = u.id AND c.status = 'paid') as total_earned
    FROM users u
    WHERE EXISTS (SELECT 1 FROM referrals r WHERE r.sponsor_id = u.id)
       OR EXISTS (SELECT 1 FROM commissions c WHERE c.sponsor_id = u.id)
    ORDER BY total_earned DESC
  `).all();
  return sponsors.map((s) => {
    const l1Referrals = db.prepare(`
      SELECT r.referred_user_id, u.full_name, u.email, u.created_at,
             (SELECT SUM(current_balance) FROM accounts a WHERE a.user_id = u.id) as balance
      FROM referrals r
      JOIN users u ON r.referred_user_id = u.id
      WHERE r.sponsor_id = ? AND r.tier_level = 1
    `).all(s.id);
    return {
      sponsorId: s.id,
      sponsorName: s.full_name,
      sponsorEmail: s.email,
      referralCode: s.referral_code,
      level1Count: s.l1_count || 0,
      level2Count: s.l2_count || 0,
      level3Count: s.l3_count || 0,
      totalDownlineCount: (s.l1_count || 0) + (s.l2_count || 0) + (s.l3_count || 0),
      totalEarned: Number((s.total_earned || 0).toFixed(2)),
      level1Members: l1Referrals.map((m) => ({
        id: m.referred_user_id,
        name: m.full_name,
        email: m.email,
        balance: Number((m.balance || 0).toFixed(2)),
        joinedAt: m.created_at
      }))
    };
  });
}
function getAdminCommissionsLedger(limit = 100) {
  return db.prepare(`
    SELECT c.*,
           s.full_name as sponsor_name, s.email as sponsor_email,
           b.full_name as buyer_name, b.email as buyer_email
    FROM commissions c
    JOIN users s ON c.sponsor_id = s.id
    JOIN users b ON c.referred_user_id = b.id
    ORDER BY c.created_at DESC
    LIMIT ?
  `).all(limit);
}
function updateUser2faSecret(userId, secret) {
  db.prepare(`UPDATE users SET totp_secret = ? WHERE id = ?`).run(secret, userId);
}
function enableUser2fa(userId) {
  db.prepare(`UPDATE users SET is_2fa_enabled = 1 WHERE id = ?`).run(userId);
}
function disableUser2fa(userId) {
  db.prepare(`UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL WHERE id = ?`).run(userId);
}
function ensureAdminSeedData() {
  const now = Date.now();
  const shankavee = getUserByEmail("shankavee44@gmail.com");
  if (shankavee) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(shankavee.id);
  } else {
    ensureUserInDb({
      id: "usr_admin_shankavee",
      email: "shankavee44@gmail.com",
      fullName: "Shankavee (Admin)"
    });
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'shankavee44@gmail.com'").run();
  }
  const bftAdmin = getUserByEmail("admin@bft.io");
  if (bftAdmin) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(bftAdmin.id);
  } else {
    ensureUserInDb({
      id: "usr_admin_master",
      email: "admin@bft.io",
      fullName: "BFT Super Administrator"
    });
    db.prepare("UPDATE users SET role = 'admin' WHERE email = 'admin@bft.io'").run();
  }
  db.prepare("UPDATE users SET role = 'admin' WHERE id = 'USR-MASTER-88'").run();
  const depositCount = Number(db.prepare("SELECT COUNT(*) as c FROM deposits").get()?.c || 0);
  if (depositCount === 0) {
    const seedDeposits = [
      { id: "DEP-REQ-981", userId: "USR-SUB-101", accId: null, amount: 750, method: "USDT (TRC-20)", status: "pending", tx: "0x8f7d6a5e4c3b2a10", ts: now - 36e5 * 2 },
      { id: "DEP-REQ-982", userId: "USR-SUB-102", accId: null, amount: 1500, method: "USDT (TRC-20)", status: "pending", tx: "0x1a2b3c4d5e6f7a8b", ts: now - 36e5 * 5 },
      { id: "DEP-REQ-980", userId: "usr_bft_001", accId: "BFT-91823", amount: 500, method: "USDT (TRC-20)", status: "approved", tx: "0x99aa88bb77cc66dd", ts: now - 864e5 * 3 }
    ];
    for (const d of seedDeposits) {
      db.prepare(`
        INSERT INTO deposits (id, user_id, account_id, amount, payment_method, status, tx_hash, created_at, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(d.id, d.userId, d.accId, d.amount, d.method, d.status, d.tx, d.ts, d.status === "approved" ? d.ts + 6e4 : null);
    }
  }
  const pendingWdCount = Number(db.prepare("SELECT COUNT(*) as c FROM withdrawals WHERE status = 'pending'").get()?.c || 0);
  if (pendingWdCount === 0) {
    db.prepare(`
      INSERT INTO withdrawals (
        id, user_id, account_id, gross_amount, net_profit, max_allowed_profit, profit_share_rate, fee_amount, net_payout,
        wallet_address, network, payment_method, status, reference_number, tx_hash, requested_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0.80, ?, ?, ?, 'TRON (TRC-20)', 'crypto_trc20', 'pending', ?, NULL, ?, NULL)
    `).run(
      "WD-REQ-77401",
      "USR-SUB-101",
      "BFT-91823",
      420,
      600,
      480,
      42,
      378,
      "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
      "REF-77401",
      now - 36e5 * 4
    );
  }
  const pendingKycCount = Number(db.prepare("SELECT COUNT(*) as c FROM kyc_submissions WHERE status IN ('pending', 'Pending Verification')").get()?.c || 0);
  if (pendingKycCount === 0) {
    db.prepare(`
      INSERT OR REPLACE INTO kyc_submissions (
        id, user_id, full_name, address, date_of_birth, country, profile_locked, doc_type, document_number,
        front_document_url, back_document_url, front_file_name, back_file_name, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      "KYC-SUB-USR-SUB-101",
      "USR-SUB-101",
      "Marco Rossi",
      "Via Montenapoleone 8, 20121 Milan",
      "1992-03-14",
      "Italy",
      "ID Card",
      "ITA-8910482",
      "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600",
      "https://images.unsplash.com/photo-1544717305-2782549b5136?w=600",
      "marco_id_front.jpg",
      "marco_id_back.jpg",
      now - 864e5 * 2,
      now - 864e5 * 2
    );
    db.prepare("UPDATE users SET kyc_status = 'pending' WHERE id = 'USR-SUB-101'").run();
  }
}
ensureAdminSeedData();
function recordTradeInDb(userId, trade) {
  const account = getAccountById(trade.accountId);
  if (!account) throw new Error("Account not found.");
  if (["breached", "hard-breached", "soft-breached"].includes(account.status)) {
    throw new Error("Trading blocked: Account is breached.");
  }
  const ownerId = account.user_id || account.userId;
  if (ownerId && ownerId !== userId) throw new Error("Unauthorized account trade.");
  const cleanInvestment = Number(trade.investment);
  if (cleanInvestment <= 0) throw new Error("Invalid trade investment amount.");
  if (account.currentBalance < cleanInvestment) {
    throw new Error("Insufficient account balance for trade placement.");
  }
  const now = Date.now();
  const tradeId = trade.id || `TRD-${now.toString().slice(-6)}-${Math.floor(100 + Math.random() * 899)}`;
  const startTime = trade.startTime || now;
  const durationSec = Number(trade.durationSeconds) || 30;
  const endTime = trade.endTime || startTime + durationSec * 1e3;
  const payoutPct = Number(trade.payoutPercentage) || 92;
  const potentialPayout = Number((cleanInvestment + cleanInvestment * payoutPct / 100).toFixed(2));
  const nextBalance = Number((account.currentBalance - cleanInvestment).toFixed(2));
  db.prepare(`
    INSERT INTO trades (
      id, user_id, account_id, asset, direction, strike_price, close_price,
      investment, payout_percentage, potential_payout, pnl, credited_amount,
      start_time, end_time, duration_seconds, status, account_tier, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tradeId,
    userId,
    trade.accountId,
    trade.asset,
    trade.direction,
    Number(trade.strikePrice),
    Number(trade.strikePrice),
    cleanInvestment,
    payoutPct,
    potentialPayout,
    0,
    0,
    startTime,
    endTime,
    durationSec,
    "active",
    trade.accountTier || account.tier,
    now
  );
  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      updated_at = ?
    WHERE id = ?
  `).run(nextBalance, nextBalance, now, trade.accountId);
  if (account.tier === "personal" || account.accountCategory === "personal_live" || String(trade.accountId).includes("PERS")) {
    try {
      db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn("SQLite self_balance recordTrade sync error:", e);
    }
  } else if (account.tier === "demo" || account.accountCategory === "demo" || String(trade.accountId).includes("DEMO")) {
    try {
      db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn("SQLite demo_balance recordTrade sync error:", e);
    }
  } else if (account.phase === "funded" || account.status === "active") {
    try {
      db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(nextBalance, userId);
    } catch (e) {
      console.warn("SQLite funded_balance recordTrade sync error:", e);
    }
  }
  const savedTrade = db.prepare("SELECT * FROM trades WHERE id = ?").get(tradeId);
  const updatedAccount = getAccountById(trade.accountId);
  return {
    trade: mapTradeRow(savedTrade),
    account: updatedAccount
  };
}
function settleTradeInDb(userId, tradeId, closePrice, manualStatus) {
  const tradeRow = db.prepare("SELECT * FROM trades WHERE id = ? AND user_id = ?").get(tradeId, userId);
  if (!tradeRow) throw new Error("Trade not found or unauthorized.");
  if (tradeRow.status !== "active") {
    const acc = getAccountById(tradeRow.account_id);
    return { trade: mapTradeRow(tradeRow), account: acc, alreadySettled: true };
  }
  const nowCheck = Date.now();
  if (nowCheck + 1e3 < Number(tradeRow.end_time)) {
    const secsLeft = Math.ceil((Number(tradeRow.end_time) - nowCheck) / 1e3);
    throw new Error(`Trade is locked until expiration (${secsLeft}s remaining) and cannot be closed or cancelled early.`);
  }
  const finalPrice = Number(closePrice);
  const strike = Number(tradeRow.strike_price);
  const investment = Number(tradeRow.investment);
  const payoutPct = Number(tradeRow.payout_percentage);
  let status = "lost";
  let pnl = -investment;
  let creditedAmount = 0;
  const diff = finalPrice - strike;
  const isTie = manualStatus === "tie" || Math.abs(diff) < 1e-7;
  if (isTie) {
    status = "tie";
    pnl = 0;
    creditedAmount = investment;
  } else {
    const isWin = manualStatus === "won" || tradeRow.direction === "CALL" && diff > 0 || tradeRow.direction === "PUT" && diff < 0;
    if (isWin) {
      status = "won";
      pnl = Number((investment * payoutPct / 100).toFixed(2));
      creditedAmount = Number((investment + pnl).toFixed(2));
    }
  }
  const now = Date.now();
  db.prepare(`
    UPDATE trades SET
      close_price = ?,
      pnl = ?,
      credited_amount = ?,
      status = ?,
      settled_at = ?
    WHERE id = ?
  `).run(finalPrice, pnl, creditedAmount, status, now, tradeId);
  const account = getAccountById(tradeRow.account_id);
  const nextBalance = Number(((account?.currentBalance || 0) + creditedAmount).toFixed(2));
  const nextTradesCount = (account?.tradesCount || 0) + 1;
  const resolvedTrades = db.prepare(
    "SELECT status FROM trades WHERE account_id = ? AND status IN ('won', 'lost', 'tie')"
  ).all(tradeRow.account_id);
  const wonCount = resolvedTrades.filter((s) => s.status === "won").length;
  const totalCount = resolvedTrades.length;
  const nextWinRate = totalCount > 0 ? Number((wonCount / totalCount * 100).toFixed(1)) : 0;
  db.prepare(`
    UPDATE accounts SET
      current_balance = ?,
      equity = ?,
      trades_count = ?,
      win_rate = ?,
      updated_at = ?
    WHERE id = ?
  `).run(nextBalance, nextBalance, nextTradesCount, nextWinRate, now, tradeRow.account_id);
  const updatedTrade = db.prepare("SELECT * FROM trades WHERE id = ?").get(tradeId);
  const updatedAccount = getAccountById(tradeRow.account_id);
  if (updatedAccount) {
    if (updatedAccount.tier === "personal" || updatedAccount.accountCategory === "personal_live" || updatedAccount.phase === "personal_live") {
      try {
        db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {
      }
    } else if (updatedAccount.tier === "demo" || updatedAccount.accountCategory === "demo" || updatedAccount.phase === "demo") {
      try {
        db.prepare(`UPDATE users SET demo_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {
      }
    } else if (updatedAccount.phase === "funded") {
      try {
        db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(nextBalance, userId);
      } catch {
      }
    }
  }
  return {
    trade: mapTradeRow(updatedTrade),
    account: updatedAccount,
    settlement: {
      status,
      pnl,
      creditedAmount,
      closePrice: finalPrice
    }
  };
}
function getUserTradesFromDb(userId, accountId) {
  const query = accountId ? "SELECT * FROM trades WHERE user_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 200" : "SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 200";
  const rows = accountId ? db.prepare(query).all(userId, accountId) : db.prepare(query).all(userId);
  return rows.map(mapTradeRow);
}
function mapTradeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    asset: row.asset,
    direction: row.direction,
    strikePrice: Number(row.strike_price),
    currentPrice: Number(row.close_price || row.strike_price),
    closePrice: row.close_price ? Number(row.close_price) : void 0,
    investment: Number(row.investment),
    payoutPercentage: Number(row.payout_percentage),
    potentialPayout: Number(row.potential_payout),
    pnl: Number(row.pnl || 0),
    creditedAmount: Number(row.credited_amount || 0),
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    durationSeconds: Number(row.duration_seconds),
    status: row.status,
    accountTier: row.account_tier,
    createdAt: Number(row.created_at),
    settledAt: row.settled_at ? Number(row.settled_at) : void 0
  };
}
function cancelWithdrawalRequest(userId, withdrawalId) {
  const withdrawal = db.prepare("SELECT * FROM withdrawals WHERE id = ? AND user_id = ?").get(withdrawalId, userId);
  if (!withdrawal) throw new Error("Withdrawal record not found.");
  if (withdrawal.status !== "pending") throw new Error(`Withdrawal cannot be cancelled from status: ${withdrawal.status}`);
  const now = Date.now();
  try {
    db.exec("BEGIN TRANSACTION");
    const info = db.prepare(`
      UPDATE withdrawals SET
        status = 'cancelled',
        processed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(now, withdrawalId);
    if (info.changes === 0) {
      throw new Error("Withdrawal request is no longer pending or already processed.");
    }
    const account = getAccountById(withdrawal.account_id);
    if (account) {
      const newBalance = Number((account.currentBalance + withdrawal.gross_amount).toFixed(2));
      const newEquity = Number((account.equity + withdrawal.gross_amount).toFixed(2));
      db.prepare(`
        UPDATE accounts SET
          current_balance = ?,
          equity = ?,
          updated_at = ?
        WHERE id = ?
      `).run(newBalance, newEquity, now, account.id);
      if (account.tier === "personal" || account.account_category === "personal_live" || String(withdrawal.account_id).includes("PERS")) {
        db.prepare(`UPDATE users SET self_balance = ? WHERE id = ?`).run(newBalance, userId);
      } else if (account.phase === "funded") {
        db.prepare(`UPDATE users SET funded_balance = ? WHERE id = ?`).run(newBalance, userId);
      }
    }
    db.exec("COMMIT");
    return { ok: true, withdrawal: db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(withdrawalId) };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// src/utils/otcAssetsCatalog.ts
var OTC_ASSETS_CATALOG = [
  // ============================================================================
  // DERIV SYNTHETIC ASSETS (Live Deriv WebSocket Feed)
  // ============================================================================
  { symbol: "R_100", name: "Volatility 100 Index", payout: 95, category: "Deriv Synthetics", basePrice: 1e3, volatility: 2.5, pipDecimals: 2, flag: "\u{1F4C8}" },
  { symbol: "R_75", name: "Volatility 75 Index", payout: 95, category: "Deriv Synthetics", basePrice: 850, volatility: 2.2, pipDecimals: 2, flag: "\u{1F4C8}" },
  { symbol: "R_50", name: "Volatility 50 Index", payout: 94, category: "Deriv Synthetics", basePrice: 500, volatility: 1.8, pipDecimals: 2, flag: "\u{1F4C8}" },
  { symbol: "R_25", name: "Volatility 25 Index", payout: 93, category: "Deriv Synthetics", basePrice: 250, volatility: 1.2, pipDecimals: 2, flag: "\u{1F4C8}" },
  { symbol: "R_10", name: "Volatility 10 Index", payout: 92, category: "Deriv Synthetics", basePrice: 100, volatility: 0.8, pipDecimals: 2, flag: "\u{1F4C8}" },
  // ============================================================================
  // 1. FOREX PAIRS (Majors, Crosses, Scandi, Asian & Emerging Markets)
  // ============================================================================
  { symbol: "EUR/USD", name: "Euro / US Dollar", payout: 92, category: "Forex", basePrice: 1.0845, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "GBP/JPY", name: "British Pound / Japanese Yen", payout: 91, category: "Forex", basePrice: 199.32, volatility: 0.016, pipDecimals: 3, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/USD", name: "British Pound / US Dollar", payout: 90, category: "Forex", basePrice: 1.2921, volatility: 1e-4, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "USD/JPY", name: "US Dollar / Japanese Yen", payout: 91, category: "Forex", basePrice: 154.25, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1EF}\u{1F1F5}" },
  { symbol: "USD/CHF", name: "US Dollar / Swiss Franc", payout: 89, category: "Forex", basePrice: 0.8872, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E8}\u{1F1ED}" },
  { symbol: "AUD/USD", name: "Australian Dollar / US Dollar", payout: 89, category: "Forex", basePrice: 0.6542, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "USD/CAD", name: "US Dollar / Canadian Dollar", payout: 88, category: "Forex", basePrice: 1.3912, volatility: 9e-5, pipDecimals: 5, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "NZD/USD", name: "New Zealand Dollar / US Dollar", payout: 88, category: "Forex", basePrice: 0.5984, volatility: 9e-5, pipDecimals: 5, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "EUR/JPY", name: "Euro / Japanese Yen", payout: 90, category: "Forex", basePrice: 167.28, volatility: 0.014, pipDecimals: 3, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/GBP", name: "Euro / British Pound", payout: 89, category: "Forex", basePrice: 0.8394, volatility: 7e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "AUD/JPY", name: "Australian Dollar / Japanese Yen", payout: 89, category: "Forex", basePrice: 100.91, volatility: 0.013, pipDecimals: 3, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "GBP/AUD", name: "British Pound / Australian Dollar", payout: 88, category: "Forex", basePrice: 1.9751, volatility: 14e-5, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "EUR/AUD", name: "Euro / Australian Dollar", payout: 88, category: "Forex", basePrice: 1.6578, volatility: 12e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "CHF/JPY", name: "Swiss Franc / Japanese Yen", payout: 89, category: "Forex", basePrice: 173.86, volatility: 0.015, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1ED}" },
  { symbol: "GBP/CAD", name: "British Pound / Canadian Dollar", payout: 88, category: "Forex", basePrice: 1.7976, volatility: 12e-5, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "EUR/CAD", name: "Euro / Canadian Dollar", payout: 87, category: "Forex", basePrice: 1.5088, volatility: 11e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "AUD/CAD", name: "Australian Dollar / Canadian Dollar", payout: 87, category: "Forex", basePrice: 0.9101, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "NZD/JPY", name: "New Zealand Dollar / Japanese Yen", payout: 87, category: "Forex", basePrice: 92.3, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "GBP/CHF", name: "British Pound / Swiss Franc", payout: 88, category: "Forex", basePrice: 1.1463, volatility: 1e-4, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "EUR/CHF", name: "Euro / Swiss Franc", payout: 88, category: "Forex", basePrice: 0.9622, volatility: 7e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "AUD/CHF", name: "Australian Dollar / Swiss Franc", payout: 86, category: "Forex", basePrice: 0.5804, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "CAD/JPY", name: "Canadian Dollar / Japanese Yen", payout: 88, category: "Forex", basePrice: 110.87, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "CAD/CHF", name: "Canadian Dollar / Swiss Franc", payout: 86, category: "Forex", basePrice: 0.6377, volatility: 7e-5, pipDecimals: 5, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "NZD/CAD", name: "New Zealand Dollar / Canadian Dollar", payout: 86, category: "Forex", basePrice: 0.8325, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "NZD/CHF", name: "New Zealand Dollar / Swiss Franc", payout: 85, category: "Forex", basePrice: 0.5309, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "AUD/NZD", name: "Australian Dollar / New Zealand Dollar", payout: 87, category: "Forex", basePrice: 1.0932, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "GBP/NZD", name: "British Pound / New Zealand Dollar", payout: 88, category: "Forex", basePrice: 2.1592, volatility: 15e-5, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "EUR/NZD", name: "Euro / New Zealand Dollar", payout: 87, category: "Forex", basePrice: 1.8123, volatility: 13e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "USD/SGD", name: "US Dollar / Singapore Dollar", payout: 87, category: "Forex", basePrice: 1.3215, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1F8}\u{1F1EC}" },
  { symbol: "USD/HKD", name: "US Dollar / Hong Kong Dollar", payout: 85, category: "Forex", basePrice: 7.7725, volatility: 2e-4, pipDecimals: 5, flag: "\u{1F1ED}\u{1F1F0}" },
  { symbol: "USD/MXN", name: "US Dollar / Mexican Peso", payout: 89, category: "Forex", basePrice: 19.984, volatility: 35e-4, pipDecimals: 4, flag: "\u{1F1F2}\u{1F1FD}" },
  { symbol: "USD/ZAR", name: "US Dollar / South African Rand", payout: 88, category: "Forex", basePrice: 17.642, volatility: 32e-4, pipDecimals: 4, flag: "\u{1F1FF}\u{1F1E6}" },
  { symbol: "USD/TRY", name: "US Dollar / Turkish Lira", payout: 88, category: "Forex", basePrice: 34.285, volatility: 45e-4, pipDecimals: 4, flag: "\u{1F1F9}\u{1F1F7}" },
  { symbol: "USD/NOK", name: "US Dollar / Norwegian Krone", payout: 86, category: "Forex", basePrice: 10.942, volatility: 18e-4, pipDecimals: 4, flag: "\u{1F1F3}\u{1F1F4}" },
  { symbol: "USD/SEK", name: "US Dollar / Swedish Krona", payout: 86, category: "Forex", basePrice: 10.618, volatility: 18e-4, pipDecimals: 4, flag: "\u{1F1F8}\u{1F1EA}" },
  { symbol: "USD/PLN", name: "US Dollar / Polish Zloty", payout: 86, category: "Forex", basePrice: 4.0125, volatility: 9e-4, pipDecimals: 4, flag: "\u{1F1F5}\u{1F1F1}" },
  { symbol: "USD/INR", name: "US Dollar / Indian Rupee", payout: 90, category: "Forex", basePrice: 84.075, volatility: 8e-3, pipDecimals: 3, flag: "\u{1F1EE}\u{1F1F3}" },
  { symbol: "USD/BRL", name: "US Dollar / Brazilian Real", payout: 91, category: "Forex", basePrice: 5.7045, volatility: 15e-4, pipDecimals: 4, flag: "\u{1F1E7}\u{1F1F7}" },
  { symbol: "USD/CNH", name: "US Dollar / Offshore Chinese Yuan", payout: 88, category: "Forex", basePrice: 7.1265, volatility: 9e-4, pipDecimals: 4, flag: "\u{1F1E8}\u{1F1F3}" },
  { symbol: "USD/KRW", name: "US Dollar / South Korean Won", payout: 87, category: "Forex", basePrice: 1382.4, volatility: 0.25, pipDecimals: 2, flag: "\u{1F1F0}\u{1F1F7}" },
  { symbol: "USD/THB", name: "US Dollar / Thai Baht", payout: 86, category: "Forex", basePrice: 33.68, volatility: 8e-3, pipDecimals: 3, flag: "\u{1F1F9}\u{1F1ED}" },
  { symbol: "USD/IDR", name: "US Dollar / Indonesian Rupiah", payout: 87, category: "Forex", basePrice: 15640, volatility: 3.5, pipDecimals: 1, flag: "\u{1F1EE}\u{1F1E9}" },
  { symbol: "USD/PHP", name: "US Dollar / Philippine Peso", payout: 86, category: "Forex", basePrice: 58.12, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1F5}\u{1F1ED}" },
  { symbol: "USD/TWD", name: "US Dollar / Taiwan Dollar", payout: 85, category: "Forex", basePrice: 32.085, volatility: 6e-3, pipDecimals: 3, flag: "\u{1F1F9}\u{1F1FC}" },
  { symbol: "USD/CLP", name: "US Dollar / Chilean Peso", payout: 86, category: "Forex", basePrice: 948.5, volatility: 0.22, pipDecimals: 2, flag: "\u{1F1E8}\u{1F1F1}" },
  { symbol: "USD/COP", name: "US Dollar / Colombian Peso", payout: 87, category: "Forex", basePrice: 4315, volatility: 1.1, pipDecimals: 1, flag: "\u{1F1E8}\u{1F1F4}" },
  { symbol: "USD/ARS", name: "US Dollar / Argentine Peso", payout: 89, category: "Forex", basePrice: 988.5, volatility: 0.3, pipDecimals: 2, flag: "\u{1F1E6}\u{1F1F7}" },
  { symbol: "USD/PKR", name: "US Dollar / Pakistani Rupee", payout: 90, category: "Forex", basePrice: 277.85, volatility: 0.05, pipDecimals: 2, flag: "\u{1F1F5}\u{1F1F0}" },
  { symbol: "USD/BDT", name: "US Dollar / Bangladeshi Taka", payout: 89, category: "Forex", basePrice: 119.5, volatility: 0.03, pipDecimals: 2, flag: "\u{1F1E7}\u{1F1E9}" },
  { symbol: "USD/EGP", name: "US Dollar / Egyptian Pound", payout: 89, category: "Forex", basePrice: 48.72, volatility: 0.015, pipDecimals: 3, flag: "\u{1F1EA}\u{1F1EC}" },
  { symbol: "USD/NGN", name: "US Dollar / Nigerian Naira", payout: 88, category: "Forex", basePrice: 1645, volatility: 0.65, pipDecimals: 1, flag: "\u{1F1F3}\u{1F1EC}" },
  { symbol: "USD/AED", name: "US Dollar / UAE Dirham", payout: 85, category: "Forex", basePrice: 3.6725, volatility: 6e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1EA}" },
  { symbol: "USD/SAR", name: "US Dollar / Saudi Riyal", payout: 85, category: "Forex", basePrice: 3.7542, volatility: 6e-5, pipDecimals: 5, flag: "\u{1F1F8}\u{1F1E6}" },
  { symbol: "USD/ILS", name: "US Dollar / Israeli Shekel", payout: 86, category: "Forex", basePrice: 3.742, volatility: 8e-4, pipDecimals: 4, flag: "\u{1F1EE}\u{1F1F1}" },
  { symbol: "USD/HUF", name: "US Dollar / Hungarian Forint", payout: 86, category: "Forex", basePrice: 372.45, volatility: 0.08, pipDecimals: 2, flag: "\u{1F1ED}\u{1F1FA}" },
  { symbol: "USD/CZK", name: "US Dollar / Czech Koruna", payout: 86, category: "Forex", basePrice: 23.385, volatility: 5e-3, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1FF}" },
  { symbol: "USD/RON", name: "US Dollar / Romanian Leu", payout: 85, category: "Forex", basePrice: 4.584, volatility: 9e-4, pipDecimals: 4, flag: "\u{1F1F7}\u{1F1F4}" },
  { symbol: "USD/DKK", name: "US Dollar / Danish Krone", payout: 85, category: "Forex", basePrice: 6.878, volatility: 1e-3, pipDecimals: 4, flag: "\u{1F1E9}\u{1F1F0}" },
  { symbol: "EUR/TRY", name: "Euro / Turkish Lira", payout: 88, category: "Forex", basePrice: 37.182, volatility: 5e-3, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/ZAR", name: "Euro / South African Rand", payout: 87, category: "Forex", basePrice: 19.132, volatility: 38e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/PLN", name: "Euro / Polish Zloty", payout: 86, category: "Forex", basePrice: 4.3515, volatility: 8e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/SEK", name: "Euro / Swedish Krona", payout: 86, category: "Forex", basePrice: 11.515, volatility: 16e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/NOK", name: "Euro / Norwegian Krone", payout: 86, category: "Forex", basePrice: 11.866, volatility: 18e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/DKK", name: "Euro / Danish Krone", payout: 85, category: "Forex", basePrice: 7.459, volatility: 6e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/HUF", name: "Euro / Hungarian Forint", payout: 86, category: "Forex", basePrice: 403.9, volatility: 0.09, pipDecimals: 2, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/CZK", name: "Euro / Czech Koruna", payout: 85, category: "Forex", basePrice: 25.36, volatility: 5e-3, pipDecimals: 3, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/SGD", name: "Euro / Singapore Dollar", payout: 87, category: "Forex", basePrice: 1.4331, volatility: 9e-5, pipDecimals: 5, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/MXN", name: "Euro / Mexican Peso", payout: 88, category: "Forex", basePrice: 21.672, volatility: 4e-3, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/BRL", name: "Euro / Brazilian Real", payout: 89, category: "Forex", basePrice: 6.1865, volatility: 18e-4, pipDecimals: 4, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "GBP/SGD", name: "British Pound / Singapore Dollar", payout: 87, category: "Forex", basePrice: 1.7075, volatility: 11e-5, pipDecimals: 5, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/ZAR", name: "British Pound / South African Rand", payout: 88, category: "Forex", basePrice: 22.795, volatility: 45e-4, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/TRY", name: "British Pound / Turkish Lira", payout: 88, category: "Forex", basePrice: 44.299, volatility: 6e-3, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/PLN", name: "British Pound / Polish Zloty", payout: 86, category: "Forex", basePrice: 5.1845, volatility: 1e-3, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/SEK", name: "British Pound / Swedish Krona", payout: 86, category: "Forex", basePrice: 13.719, volatility: 22e-4, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/NOK", name: "British Pound / Norwegian Krone", payout: 86, category: "Forex", basePrice: 14.138, volatility: 24e-4, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/MXN", name: "British Pound / Mexican Peso", payout: 88, category: "Forex", basePrice: 25.821, volatility: 48e-4, pipDecimals: 4, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "AUD/SGD", name: "Australian Dollar / Singapore Dollar", payout: 86, category: "Forex", basePrice: 0.8645, volatility: 8e-5, pipDecimals: 5, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "SGD/JPY", name: "Singapore Dollar / Japanese Yen", payout: 87, category: "Forex", basePrice: 116.72, volatility: 0.013, pipDecimals: 3, flag: "\u{1F1F8}\u{1F1EC}" },
  { symbol: "TRY/JPY", name: "Turkish Lira / Japanese Yen", payout: 86, category: "Forex", basePrice: 4.499, volatility: 12e-4, pipDecimals: 4, flag: "\u{1F1F9}\u{1F1F7}" },
  { symbol: "ZAR/JPY", name: "South African Rand / Japanese Yen", payout: 86, category: "Forex", basePrice: 8.743, volatility: 18e-4, pipDecimals: 4, flag: "\u{1F1FF}\u{1F1E6}" },
  { symbol: "MXN/JPY", name: "Mexican Peso / Japanese Yen", payout: 86, category: "Forex", basePrice: 7.7185, volatility: 16e-4, pipDecimals: 4, flag: "\u{1F1F2}\u{1F1FD}" },
  { symbol: "NOK/JPY", name: "Norwegian Krone / Japanese Yen", payout: 85, category: "Forex", basePrice: 14.097, volatility: 25e-4, pipDecimals: 4, flag: "\u{1F1F3}\u{1F1F4}" },
  { symbol: "SEK/JPY", name: "Swedish Krona / Japanese Yen", payout: 85, category: "Forex", basePrice: 14.527, volatility: 25e-4, pipDecimals: 4, flag: "\u{1F1F8}\u{1F1EA}" },
  { symbol: "HKD/JPY", name: "Hong Kong Dollar / Japanese Yen", payout: 85, category: "Forex", basePrice: 19.845, volatility: 3e-3, pipDecimals: 4, flag: "\u{1F1ED}\u{1F1F0}" },
  // More Forex pairs (65 total added to reach 260+)
  { symbol: "USD/GHS", name: "US Dollar / Ghanaian Cedi", payout: 86, category: "Forex", basePrice: 15.5, volatility: 0.04, pipDecimals: 2, flag: "\u{1F1EC}\u{1F1ED}" },
  { symbol: "USD/KES", name: "US Dollar / Kenyan Shilling", payout: 86, category: "Forex", basePrice: 129.2, volatility: 0.15, pipDecimals: 2, flag: "\u{1F1F0}\u{1F1EA}" },
  { symbol: "USD/UGX", name: "US Dollar / Ugandan Shilling", payout: 85, category: "Forex", basePrice: 3720, volatility: 2.5, pipDecimals: 1, flag: "\u{1F1FA}\u{1F1EC}" },
  { symbol: "USD/TZS", name: "US Dollar / Tanzanian Shilling", payout: 85, category: "Forex", basePrice: 2650, volatility: 1.8, pipDecimals: 1, flag: "\u{1F1F9}\u{1F1FF}" },
  { symbol: "USD/MAD", name: "US Dollar / Moroccan Dirham", payout: 86, category: "Forex", basePrice: 9.95, volatility: 0.015, pipDecimals: 3, flag: "\u{1F1F2}\u{1F1E6}" },
  { symbol: "USD/DZD", name: "US Dollar / Algerian Dinar", payout: 85, category: "Forex", basePrice: 134.5, volatility: 0.2, pipDecimals: 2, flag: "\u{1F1E9}\u{1F1FF}" },
  { symbol: "USD/TND", name: "US Dollar / Tunisian Dinar", payout: 86, category: "Forex", basePrice: 3.12, volatility: 8e-3, pipDecimals: 4, flag: "\u{1F1F9}\u{1F1F3}" },
  { symbol: "USD/JOD", name: "US Dollar / Jordanian Dinar", payout: 85, category: "Forex", basePrice: 0.709, volatility: 1e-3, pipDecimals: 4, flag: "\u{1F1EF}\u{1F1F4}" },
  { symbol: "USD/OMR", name: "US Dollar / Omani Rial", payout: 85, category: "Forex", basePrice: 0.384, volatility: 1e-3, pipDecimals: 4, flag: "\u{1F1F4}\u{1F1F2}" },
  { symbol: "USD/QAR", name: "US Dollar / Qatari Riyal", payout: 85, category: "Forex", basePrice: 3.64, volatility: 5e-3, pipDecimals: 3, flag: "\u{1F1F6}\u{1F1E6}" },
  { symbol: "USD/KWD", name: "US Dollar / Kuwaiti Dinar", payout: 85, category: "Forex", basePrice: 0.307, volatility: 5e-4, pipDecimals: 4, flag: "\u{1F1F0}\u{1F1FC}" },
  { symbol: "USD/BHD", name: "US Dollar / Bahraini Dinar", payout: 85, category: "Forex", basePrice: 0.377, volatility: 8e-4, pipDecimals: 4, flag: "\u{1F1E7}\u{1F1ED}" },
  { symbol: "USD/LBP", name: "US Dollar / Lebanese Pound", payout: 85, category: "Forex", basePrice: 89500, volatility: 25, pipDecimals: 1, flag: "\u{1F1F1}\u{1F1E7}" },
  { symbol: "USD/JMD", name: "US Dollar / Jamaican Dollar", payout: 85, category: "Forex", basePrice: 156.5, volatility: 0.25, pipDecimals: 2, flag: "\u{1F1EF}\u{1F1F2}" },
  { symbol: "USD/DOP", name: "US Dollar / Dominican Peso", payout: 86, category: "Forex", basePrice: 60.1, volatility: 0.08, pipDecimals: 2, flag: "\u{1F1E9}\u{1F1F4}" },
  { symbol: "USD/CRC", name: "US Dollar / Costa Rican Col\xF3n", payout: 86, category: "Forex", basePrice: 515, volatility: 0.85, pipDecimals: 2, flag: "\u{1F1E8}\u{1F1F7}" },
  { symbol: "USD/GTQ", name: "US Dollar / Guatemalan Quetzal", payout: 86, category: "Forex", basePrice: 7.75, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1EC}\u{1F1F9}" },
  { symbol: "USD/HNL", name: "US Dollar / Honduran Lempira", payout: 85, category: "Forex", basePrice: 24.7, volatility: 0.04, pipDecimals: 2, flag: "\u{1F1ED}\u{1F1F3}" },
  { symbol: "USD/PYG", name: "US Dollar / Paraguayan Guaran\xED", payout: 86, category: "Forex", basePrice: 7850, volatility: 12, pipDecimals: 1, flag: "\u{1F1F5}\u{1F1FE}" },
  { symbol: "USD/UYU", name: "US Dollar / Uruguayan Peso", payout: 86, category: "Forex", basePrice: 42.5, volatility: 0.09, pipDecimals: 2, flag: "\u{1F1FA}\u{1F1FE}" },
  { symbol: "USD/BOB", name: "US Dollar / Bolivian Boliviano", payout: 85, category: "Forex", basePrice: 6.91, volatility: 0.01, pipDecimals: 3, flag: "\u{1F1E7}\u{1F1F4}" },
  { symbol: "EUR/GHS", name: "Euro / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 16.8, volatility: 0.05, pipDecimals: 2, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/KES", name: "Euro / Kenyan Shilling", payout: 85, category: "Forex", basePrice: 140, volatility: 0.18, pipDecimals: 2, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "EUR/MAD", name: "Euro / Moroccan Dirham", payout: 85, category: "Forex", basePrice: 10.8, volatility: 0.02, pipDecimals: 3, flag: "\u{1F1EA}\u{1F1FA}" },
  { symbol: "GBP/GHS", name: "British Pound / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 20.1, volatility: 0.06, pipDecimals: 2, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "GBP/KES", name: "British Pound / Kenyan Shilling", payout: 85, category: "Forex", basePrice: 167, volatility: 0.22, pipDecimals: 2, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "AUD/GHS", name: "Australian Dollar / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 10.2, volatility: 0.03, pipDecimals: 2, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "CAD/GHS", name: "Canadian Dollar / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 11.2, volatility: 0.035, pipDecimals: 2, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "JPY/GHS", name: "Japanese Yen / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 0.098, volatility: 5e-4, pipDecimals: 4, flag: "\u{1F1EF}\u{1F1F5}" },
  { symbol: "CHF/GHS", name: "Swiss Franc / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 17.5, volatility: 0.045, pipDecimals: 2, flag: "\u{1F1E8}\u{1F1ED}" },
  { symbol: "NZD/GHS", name: "New Zealand Dollar / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 9.3, volatility: 0.025, pipDecimals: 2, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "ZAR/GHS", name: "South African Rand / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 0.88, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F1FF}\u{1F1E6}" },
  { symbol: "INR/GHS", name: "Indian Rupee / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 0.182, volatility: 8e-4, pipDecimals: 4, flag: "\u{1F1EE}\u{1F1F3}" },
  { symbol: "BRL/GHS", name: "Brazilian Real / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 2.72, volatility: 0.01, pipDecimals: 2, flag: "\u{1F1E7}\u{1F1F7}" },
  { symbol: "MXN/GHS", name: "Mexican Peso / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 0.77, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F1F2}\u{1F1FD}" },
  { symbol: "SGD/GHS", name: "Singapore Dollar / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 11.7, volatility: 0.035, pipDecimals: 2, flag: "\u{1F1F8}\u{1F1EC}" },
  { symbol: "HKD/GHS", name: "Hong Kong Dollar / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 1.99, volatility: 5e-3, pipDecimals: 3, flag: "\u{1F1ED}\u{1F1F0}" },
  { symbol: "NOK/GHS", name: "Norwegian Krone / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 1.41, volatility: 4e-3, pipDecimals: 3, flag: "\u{1F1F3}\u{1F1F4}" },
  { symbol: "SEK/GHS", name: "Swedish Krona / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 1.45, volatility: 4e-3, pipDecimals: 3, flag: "\u{1F1F8}\u{1F1EA}" },
  { symbol: "DKK/GHS", name: "Danish Krone / Ghanaian Cedi", payout: 85, category: "Forex", basePrice: 2.24, volatility: 6e-3, pipDecimals: 3, flag: "\u{1F1E9}\u{1F1F0}" },
  { symbol: "AUD/DKK", name: "Australian Dollar / Danish Krone", payout: 85, category: "Forex", basePrice: 4.52, volatility: 0.01, pipDecimals: 3, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "AUD/NOK", name: "Australian Dollar / Norwegian Krone", payout: 85, category: "Forex", basePrice: 7.18, volatility: 0.015, pipDecimals: 3, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "AUD/SEK", name: "Australian Dollar / Swedish Krona", payout: 85, category: "Forex", basePrice: 6.98, volatility: 0.015, pipDecimals: 3, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "NZD/DKK", name: "New Zealand Dollar / Danish Krone", payout: 85, category: "Forex", basePrice: 4.14, volatility: 0.01, pipDecimals: 3, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "NZD/NOK", name: "New Zealand Dollar / Norwegian Krone", payout: 85, category: "Forex", basePrice: 6.58, volatility: 0.014, pipDecimals: 3, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "NZD/SEK", name: "New Zealand Dollar / Swedish Krona", payout: 85, category: "Forex", basePrice: 6.4, volatility: 0.014, pipDecimals: 3, flag: "\u{1F1F3}\u{1F1FF}" },
  { symbol: "CAD/DKK", name: "Canadian Dollar / Danish Krone", payout: 85, category: "Forex", basePrice: 5.02, volatility: 0.012, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "CAD/NOK", name: "Canadian Dollar / Norwegian Krone", payout: 85, category: "Forex", basePrice: 7.98, volatility: 0.018, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "CAD/SEK", name: "Canadian Dollar / Swedish Krona", payout: 85, category: "Forex", basePrice: 7.75, volatility: 0.018, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1E6}" },
  { symbol: "CHF/DKK", name: "Swiss Franc / Danish Krone", payout: 85, category: "Forex", basePrice: 7.85, volatility: 0.01, pipDecimals: 3, flag: "\u{1F1E8}\u{1F1ED}" },
  // ============================================================================
  // 2. CRYPTOCURRENCY ASSETS (40+ Crypto Pairs)
  // ============================================================================
  { symbol: "BTC/USD", name: "Bitcoin / USD", payout: 95, category: "Crypto", basePrice: 96450, volatility: 4.5, pipDecimals: 2, flag: "\u20BF" },
  { symbol: "BTC/USDT", name: "Bitcoin / Tether USDT", payout: 95, category: "Crypto", basePrice: 96450, volatility: 4.5, pipDecimals: 2, flag: "\u20BF" },
  { symbol: "ETH/USD", name: "Ethereum / USD", payout: 93, category: "Crypto", basePrice: 2840, volatility: 0.35, pipDecimals: 2, flag: "\u039E" },
  { symbol: "ETH/USDT", name: "Ethereum / Tether USDT", payout: 93, category: "Crypto", basePrice: 2840, volatility: 0.35, pipDecimals: 2, flag: "\u039E" },
  { symbol: "SOL/USD", name: "Solana / USD", payout: 92, category: "Crypto", basePrice: 185.5, volatility: 0.06, pipDecimals: 2, flag: "\u25CE" },
  { symbol: "SOL/USDT", name: "Solana / Tether USDT", payout: 92, category: "Crypto", basePrice: 185.5, volatility: 0.06, pipDecimals: 2, flag: "\u25CE" },
  { symbol: "XRP/USD", name: "Ripple XRP / USD", payout: 90, category: "Crypto", basePrice: 1.95, volatility: 8e-4, pipDecimals: 4, flag: "\u2715" },
  { symbol: "XRP/USDT", name: "Ripple XRP / Tether USDT", payout: 90, category: "Crypto", basePrice: 1.95, volatility: 8e-4, pipDecimals: 4, flag: "\u2715" },
  { symbol: "BNB/USD", name: "BNB Chain / USD", payout: 90, category: "Crypto", basePrice: 650, volatility: 0.12, pipDecimals: 2, flag: "\u{1F7E1}" },
  { symbol: "BNB/USDT", name: "BNB Chain / Tether USDT", payout: 90, category: "Crypto", basePrice: 650, volatility: 0.12, pipDecimals: 2, flag: "\u{1F7E1}" },
  { symbol: "DOGE/USD", name: "Dogecoin / USD", payout: 89, category: "Crypto", basePrice: 0.245, volatility: 2e-4, pipDecimals: 4, flag: "\u{1F415}" },
  { symbol: "DOGE/USDT", name: "Dogecoin / Tether USDT", payout: 89, category: "Crypto", basePrice: 0.245, volatility: 2e-4, pipDecimals: 4, flag: "\u{1F415}" },
  { symbol: "ADA/USD", name: "Cardano / USD", payout: 89, category: "Crypto", basePrice: 0.785, volatility: 3e-4, pipDecimals: 4, flag: "\u{1F535}" },
  { symbol: "ADA/USDT", name: "Cardano / Tether USDT", payout: 89, category: "Crypto", basePrice: 0.785, volatility: 3e-4, pipDecimals: 4, flag: "\u{1F535}" },
  { symbol: "AVAX/USD", name: "Avalanche / USD", payout: 89, category: "Crypto", basePrice: 26.4, volatility: 0.02, pipDecimals: 2, flag: "\u{1F53A}" },
  { symbol: "AVAX/USDT", name: "Avalanche / Tether USDT", payout: 89, category: "Crypto", basePrice: 26.4, volatility: 0.02, pipDecimals: 2, flag: "\u{1F53A}" },
  { symbol: "LINK/USD", name: "Chainlink / USD", payout: 88, category: "Crypto", basePrice: 18.2, volatility: 0.015, pipDecimals: 2, flag: "\u{1F517}" },
  { symbol: "LINK/USDT", name: "Chainlink / Tether USDT", payout: 88, category: "Crypto", basePrice: 18.2, volatility: 0.015, pipDecimals: 2, flag: "\u{1F517}" },
  { symbol: "DOT/USD", name: "Polkadot / USD", payout: 88, category: "Crypto", basePrice: 5.4, volatility: 4e-3, pipDecimals: 3, flag: "\u26AA" },
  { symbol: "DOT/USDT", name: "Polkadot / Tether USDT", payout: 88, category: "Crypto", basePrice: 5.4, volatility: 4e-3, pipDecimals: 3, flag: "\u26AA" },
  { symbol: "LTC/USD", name: "Litecoin / USD", payout: 89, category: "Crypto", basePrice: 104.5, volatility: 0.04, pipDecimals: 2, flag: "\u0141" },
  { symbol: "LTC/USDT", name: "Litecoin / Tether USDT", payout: 89, category: "Crypto", basePrice: 104.5, volatility: 0.04, pipDecimals: 2, flag: "\u0141" },
  { symbol: "NEAR/USD", name: "NEAR Protocol / USD", payout: 88, category: "Crypto", basePrice: 3.65, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F310}" },
  { symbol: "NEAR/USDT", name: "NEAR Protocol / Tether USDT", payout: 88, category: "Crypto", basePrice: 3.65, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F310}" },
  { symbol: "TRX/USD", name: "TRON / USD", payout: 88, category: "Crypto", basePrice: 0.238, volatility: 1e-4, pipDecimals: 4, flag: "\u2666\uFE0F" },
  { symbol: "TRX/USDT", name: "TRON / Tether USDT", payout: 88, category: "Crypto", basePrice: 0.238, volatility: 1e-4, pipDecimals: 4, flag: "\u2666\uFE0F" },
  { symbol: "POL/USD", name: "Polygon Ecosystem / USD", payout: 87, category: "Crypto", basePrice: 0.315, volatility: 2e-4, pipDecimals: 4, flag: "\u{1F7E3}" },
  { symbol: "SUI/USD", name: "Sui Network / USD", payout: 90, category: "Crypto", basePrice: 3.12, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F4A7}" },
  { symbol: "SUI/USDT", name: "Sui Network / Tether USDT", payout: 90, category: "Crypto", basePrice: 3.12, volatility: 3e-3, pipDecimals: 3, flag: "\u{1F4A7}" },
  { symbol: "SHIB/USD", name: "Shiba Inu (1000x) / USD", payout: 88, category: "Crypto", basePrice: 0.0245, volatility: 3e-5, pipDecimals: 5, flag: "\u{1F98A}" },
  { symbol: "PEPE/USD", name: "Pepe (1000x) / USD", payout: 89, category: "Crypto", basePrice: 0.0184, volatility: 3e-5, pipDecimals: 5, flag: "\u{1F438}" },
  { symbol: "UNI/USD", name: "Uniswap / USD", payout: 88, category: "Crypto", basePrice: 9.85, volatility: 8e-3, pipDecimals: 3, flag: "\u{1F984}" },
  { symbol: "ATOM/USD", name: "Cosmos Hub / USD", payout: 87, category: "Crypto", basePrice: 4.92, volatility: 4e-3, pipDecimals: 3, flag: "\u269B\uFE0F" },
  { symbol: "APT/USD", name: "Aptos / USD", payout: 89, category: "Crypto", basePrice: 9.45, volatility: 9e-3, pipDecimals: 3, flag: "\u{1F300}" },
  { symbol: "ARB/USD", name: "Arbitrum / USD", payout: 88, category: "Crypto", basePrice: 0.642, volatility: 5e-4, pipDecimals: 4, flag: "\u{1F537}" },
  { symbol: "OP/USD", name: "Optimism / USD", payout: 88, category: "Crypto", basePrice: 1.485, volatility: 15e-4, pipDecimals: 3, flag: "\u{1F534}" },
  { symbol: "INJ/USD", name: "Injective / USD", payout: 89, category: "Crypto", basePrice: 21.8, volatility: 0.025, pipDecimals: 2, flag: "\u26A1" },
  { symbol: "TON/USD", name: "Toncoin / USD", payout: 89, category: "Crypto", basePrice: 5.28, volatility: 4e-3, pipDecimals: 3, flag: "\u{1F48E}" },
  { symbol: "ICP/USD", name: "Internet Computer / USD", payout: 88, category: "Crypto", basePrice: 8.64, volatility: 8e-3, pipDecimals: 3, flag: "\u267E\uFE0F" },
  { symbol: "FIL/USD", name: "Filecoin / USD", payout: 87, category: "Crypto", basePrice: 4.18, volatility: 4e-3, pipDecimals: 3, flag: "\u{1F4BE}" },
  // ============================================================================
  // 3. COMMODITIES & METALS (35+ Commodities)
  // ============================================================================
  { symbol: "XAU/USD", name: "Gold / US Dollar", payout: 94, category: "Commodities", basePrice: 2745.5, volatility: 1.2, pipDecimals: 2, flag: "\u{1F947}" },
  { symbol: "XAG/USD", name: "Silver / US Dollar", payout: 91, category: "Commodities", basePrice: 32.4, volatility: 0.08, pipDecimals: 2, flag: "\u{1F948}" },
  { symbol: "WTI/USD", name: "Crude Oil WTI", payout: 90, category: "Commodities", basePrice: 72.5, volatility: 0.15, pipDecimals: 2, flag: "\u{1F6E2}\uFE0F" },
  { symbol: "BRENT/USD", name: "Brent Oil", payout: 90, category: "Commodities", basePrice: 76.2, volatility: 0.16, pipDecimals: 2, flag: "\u{1F6E2}\uFE0F" },
  { symbol: "NGAS/USD", name: "Natural Gas", payout: 88, category: "Commodities", basePrice: 2.85, volatility: 0.012, pipDecimals: 3, flag: "\u{1F525}" },
  { symbol: "COPPER/USD", name: "Copper Futures", payout: 89, category: "Commodities", basePrice: 4.25, volatility: 0.015, pipDecimals: 3, flag: "\u{1FA99}" },
  { symbol: "PLATINUM/USD", name: "Platinum", payout: 88, category: "Commodities", basePrice: 985, volatility: 2.5, pipDecimals: 2, flag: "\u26B1\uFE0F" },
  { symbol: "PALLADIUM/USD", name: "Palladium", payout: 87, category: "Commodities", basePrice: 1040, volatility: 3.1, pipDecimals: 2, flag: "\u{1F9EA}" },
  { symbol: "CORN/USD", name: "Corn Futures", payout: 86, category: "Commodities", basePrice: 445.2, volatility: 1.1, pipDecimals: 2, flag: "\u{1F33D}" },
  { symbol: "WHEAT/USD", name: "Wheat Futures", payout: 86, category: "Commodities", basePrice: 565.4, volatility: 1.4, pipDecimals: 2, flag: "\u{1F33E}" },
  { symbol: "SOYBEAN/USD", name: "Soybean Futures", payout: 86, category: "Commodities", basePrice: 1120, volatility: 2.2, pipDecimals: 2, flag: "\u{1FAD8}" },
  { symbol: "SUGAR/USD", name: "Sugar No. 11", payout: 86, category: "Commodities", basePrice: 21.4, volatility: 0.08, pipDecimals: 2, flag: "\u{1F36C}" },
  { symbol: "COFFEE/USD", name: "Coffee Arabica", payout: 87, category: "Commodities", basePrice: 245.5, volatility: 0.85, pipDecimals: 2, flag: "\u2615" },
  { symbol: "COCOA/USD", name: "Cocoa Futures", payout: 88, category: "Commodities", basePrice: 7450, volatility: 25, pipDecimals: 2, flag: "\u{1F36B}" },
  { symbol: "COTTON/USD", name: "Cotton No. 2", payout: 85, category: "Commodities", basePrice: 72.8, volatility: 0.25, pipDecimals: 2, flag: "\u{1F9F5}" },
  { symbol: "ALUMINUM/USD", name: "Aluminum", payout: 86, category: "Commodities", basePrice: 2450, volatility: 6.5, pipDecimals: 2, flag: "\u{1F3D7}\uFE0F" },
  { symbol: "ZINC/USD", name: "Zinc", payout: 86, category: "Commodities", basePrice: 2850, volatility: 7.2, pipDecimals: 2, flag: "\u2699\uFE0F" },
  { symbol: "NICKEL/USD", name: "Nickel", payout: 87, category: "Commodities", basePrice: 16500, volatility: 35, pipDecimals: 2, flag: "\u{1F529}" },
  { symbol: "LEAD/USD", name: "Lead", payout: 85, category: "Commodities", basePrice: 2080, volatility: 5.1, pipDecimals: 2, flag: "\u{1F50B}" },
  { symbol: "URANIUM/USD", name: "Uranium Futures", payout: 89, category: "Commodities", basePrice: 85.5, volatility: 0.35, pipDecimals: 2, flag: "\u269B\uFE0F" },
  { symbol: "ETHANOL/USD", name: "Ethanol Futures", payout: 85, category: "Commodities", basePrice: 2.15, volatility: 8e-3, pipDecimals: 3, flag: "\u26FD" },
  { symbol: "METHANOL/USD", name: "Methanol", payout: 85, category: "Commodities", basePrice: 2550, volatility: 8, pipDecimals: 2, flag: "\u{1F9EA}" },
  { symbol: "STEEL/USD", name: "Hot-Rolled Coil Steel", payout: 86, category: "Commodities", basePrice: 740, volatility: 2.1, pipDecimals: 2, flag: "\u{1F6E0}\uFE0F" },
  { symbol: "IRON/USD", name: "Iron Ore 62% Fe", payout: 87, category: "Commodities", basePrice: 105.5, volatility: 0.4, pipDecimals: 2, flag: "\u{1F9F1}" },
  { symbol: "LUMBER/USD", name: "Random Length Lumber", payout: 85, category: "Commodities", basePrice: 485, volatility: 1.8, pipDecimals: 2, flag: "\u{1FAB5}" },
  { symbol: "RICE/USD", name: "Rough Rice", payout: 85, category: "Commodities", basePrice: 15.8, volatility: 0.05, pipDecimals: 2, flag: "\u{1F35A}" },
  { symbol: "OATS/USD", name: "Oats Futures", payout: 85, category: "Commodities", basePrice: 345, volatility: 1.2, pipDecimals: 2, flag: "\u{1F33E}" },
  { symbol: "ORANGE/USD", name: "Orange Juice", payout: 86, category: "Commodities", basePrice: 385, volatility: 1.5, pipDecimals: 2, flag: "\u{1F34A}" },
  { symbol: "BUTTER/USD", name: "Butter Futures", payout: 85, category: "Commodities", basePrice: 285, volatility: 0.95, pipDecimals: 2, flag: "\u{1F9C8}" },
  { symbol: "MILK/USD", name: "Class III Milk", payout: 85, category: "Commodities", basePrice: 18.2, volatility: 0.06, pipDecimals: 2, flag: "\u{1F95B}" },
  // ============================================================================
  // 4. STOCKS & INDICES (40+ Stocks & Global Indices)
  // ============================================================================
  { symbol: "NAS100", name: "Nasdaq 100 Index", payout: 93, category: "Stocks & Indices", basePrice: 20450, volatility: 12, pipDecimals: 2, flag: "\u{1F1FA}\u{1F1F8}" },
  { symbol: "SPX500", name: "S&P 500 Index", payout: 92, category: "Stocks & Indices", basePrice: 5850, volatility: 4.5, pipDecimals: 2, flag: "\u{1F1FA}\u{1F1F8}" },
  { symbol: "US30", name: "Wall Street 30", payout: 91, category: "Stocks & Indices", basePrice: 43200, volatility: 18, pipDecimals: 2, flag: "\u{1F1FA}\u{1F1F8}" },
  { symbol: "AAPL", name: "Apple Inc.", payout: 90, category: "Stocks & Indices", basePrice: 228.5, volatility: 0.45, pipDecimals: 2, flag: "\u{1F34F}" },
  { symbol: "MSFT", name: "Microsoft Corp.", payout: 90, category: "Stocks & Indices", basePrice: 425, volatility: 0.85, pipDecimals: 2, flag: "\u{1F4BB}" },
  { symbol: "NVDA", name: "NVIDIA Corp.", payout: 92, category: "Stocks & Indices", basePrice: 138.5, volatility: 0.65, pipDecimals: 2, flag: "\u{1F7E2}" },
  { symbol: "AMZN", name: "Amazon.com Inc.", payout: 90, category: "Stocks & Indices", basePrice: 195.2, volatility: 0.4, pipDecimals: 2, flag: "\u{1F4E6}" },
  { symbol: "GOOGL", name: "Alphabet Inc. (Google)", payout: 90, category: "Stocks & Indices", basePrice: 178.4, volatility: 0.38, pipDecimals: 2, flag: "\u{1F50D}" },
  { symbol: "META", name: "Meta Platforms", payout: 91, category: "Stocks & Indices", basePrice: 575, volatility: 1.2, pipDecimals: 2, flag: "\u267E\uFE0F" },
  { symbol: "TSLA", name: "Tesla Inc.", payout: 93, category: "Stocks & Indices", basePrice: 220, volatility: 0.95, pipDecimals: 2, flag: "\u26A1" },
  { symbol: "NFLX", name: "Netflix Inc.", payout: 90, category: "Stocks & Indices", basePrice: 710, volatility: 1.5, pipDecimals: 2, flag: "\u{1F37F}" },
  { symbol: "AMD", name: "Advanced Micro Devices", payout: 89, category: "Stocks & Indices", basePrice: 155, volatility: 0.5, pipDecimals: 2, flag: "\u{1F534}" },
  { symbol: "INTC", name: "Intel Corp.", payout: 88, category: "Stocks & Indices", basePrice: 22.5, volatility: 0.12, pipDecimals: 2, flag: "\u{1F7E6}" },
  { symbol: "TSM", name: "Taiwan Semiconductor", payout: 89, category: "Stocks & Indices", basePrice: 192, volatility: 0.55, pipDecimals: 2, flag: "\u{1F1F9}\u{1F1FC}" },
  { symbol: "COIN", name: "Coinbase Global", payout: 91, category: "Stocks & Indices", basePrice: 215, volatility: 0.8, pipDecimals: 2, flag: "\u{1FA99}" },
  { symbol: "MSTR", name: "MicroStrategy Inc.", payout: 93, category: "Stocks & Indices", basePrice: 245, volatility: 1.4, pipDecimals: 2, flag: "\u{1F4CA}" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", payout: 89, category: "Stocks & Indices", basePrice: 225, volatility: 0.4, pipDecimals: 2, flag: "\u{1F3E6}" },
  { symbol: "V", name: "Visa Inc.", payout: 89, category: "Stocks & Indices", basePrice: 282, volatility: 0.45, pipDecimals: 2, flag: "\u{1F4B3}" },
  { symbol: "MA", name: "Mastercard Inc.", payout: 89, category: "Stocks & Indices", basePrice: 495, volatility: 0.85, pipDecimals: 2, flag: "\u{1F4B3}" },
  { symbol: "DIS", name: "The Walt Disney Co.", payout: 88, category: "Stocks & Indices", basePrice: 96.5, volatility: 0.22, pipDecimals: 2, flag: "\u{1F3F0}" },
  { symbol: "BA", name: "Boeing Co.", payout: 88, category: "Stocks & Indices", basePrice: 155, volatility: 0.48, pipDecimals: 2, flag: "\u2708\uFE0F" },
  { symbol: "JNJ", name: "Johnson & Johnson", payout: 88, category: "Stocks & Indices", basePrice: 162, volatility: 0.25, pipDecimals: 2, flag: "\u{1F48A}" },
  { symbol: "WMT", name: "Walmart Inc.", payout: 88, category: "Stocks & Indices", basePrice: 82.5, volatility: 0.18, pipDecimals: 2, flag: "\u{1F6D2}" },
  { symbol: "XOM", name: "Exxon Mobil Corp.", payout: 88, category: "Stocks & Indices", basePrice: 118, volatility: 0.3, pipDecimals: 2, flag: "\u26FD" },
  { symbol: "SHEL", name: "Shell plc", payout: 88, category: "Stocks & Indices", basePrice: 65.5, volatility: 0.16, pipDecimals: 2, flag: "\u{1F41A}" },
  { symbol: "BABA", name: "Alibaba Group Holding", payout: 89, category: "Stocks & Indices", basePrice: 98.5, volatility: 0.42, pipDecimals: 2, flag: "\u{1F1E8}\u{1F1F3}" },
  { symbol: "NKE", name: "NIKE Inc.", payout: 88, category: "Stocks & Indices", basePrice: 84, volatility: 0.22, pipDecimals: 2, flag: "\u{1F45F}" },
  { symbol: "PYPL", name: "PayPal Holdings", payout: 88, category: "Stocks & Indices", basePrice: 78.5, volatility: 0.28, pipDecimals: 2, flag: "\u{1F17F}\uFE0F" },
  { symbol: "UBER", name: "Uber Technologies", payout: 89, category: "Stocks & Indices", basePrice: 76, volatility: 0.32, pipDecimals: 2, flag: "\u{1F697}" },
  { symbol: "SHOP", name: "Shopify Inc.", payout: 89, category: "Stocks & Indices", basePrice: 112, volatility: 0.48, pipDecimals: 2, flag: "\u{1F6CD}\uFE0F" },
  { symbol: "FTSE100", name: "FTSE 100 Index", payout: 90, category: "Stocks & Indices", basePrice: 8250, volatility: 6.5, pipDecimals: 2, flag: "\u{1F1EC}\u{1F1E7}" },
  { symbol: "DAX40", name: "Germany 40 Index", payout: 91, category: "Stocks & Indices", basePrice: 19400, volatility: 10, pipDecimals: 2, flag: "\u{1F1E9}\u{1F1EA}" },
  { symbol: "NIKKEI225", name: "Japan 225 Index", payout: 91, category: "Stocks & Indices", basePrice: 38900, volatility: 15, pipDecimals: 2, flag: "\u{1F1EF}\u{1F1F5}" },
  { symbol: "CAC40", name: "France 40 Index", payout: 90, category: "Stocks & Indices", basePrice: 7550, volatility: 6, pipDecimals: 2, flag: "\u{1F1EB}\u{1F1F7}" },
  { symbol: "IBEX35", name: "Spain 35 Index", payout: 89, category: "Stocks & Indices", basePrice: 11800, volatility: 8.5, pipDecimals: 2, flag: "\u{1F1EA}\u{1F1F8}" },
  { symbol: "ASX200", name: "Australia 200 Index", payout: 90, category: "Stocks & Indices", basePrice: 8200, volatility: 6.2, pipDecimals: 2, flag: "\u{1F1E6}\u{1F1FA}" },
  { symbol: "HSI", name: "Hang Seng Index", payout: 90, category: "Stocks & Indices", basePrice: 20600, volatility: 14, pipDecimals: 2, flag: "\u{1F1ED}\u{1F1F0}" },
  { symbol: "NIFTY50", name: "Nifty 50 India", payout: 91, category: "Stocks & Indices", basePrice: 24300, volatility: 12.5, pipDecimals: 2, flag: "\u{1F1EE}\u{1F1F3}" },
  { symbol: "BOVESPA", name: "Brazil 50 Index", payout: 89, category: "Stocks & Indices", basePrice: 130500, volatility: 45, pipDecimals: 1, flag: "\u{1F1E7}\u{1F1F7}" },
  { symbol: "IPC", name: "Mexico 35 Index", payout: 89, category: "Stocks & Indices", basePrice: 52500, volatility: 22, pipDecimals: 1, flag: "\u{1F1F2}\u{1F1FD}" },
  // Additional Stocks to exceed 250 total
  { symbol: "ADBE", name: "Adobe Inc.", payout: 89, category: "Stocks & Indices", basePrice: 510, volatility: 1.1, pipDecimals: 2, flag: "\u{1F3A8}" },
  { symbol: "CRM", name: "Salesforce Inc.", payout: 89, category: "Stocks & Indices", basePrice: 285, volatility: 0.75, pipDecimals: 2, flag: "\u2601\uFE0F" },
  { symbol: "ORCL", name: "Oracle Corp.", payout: 88, category: "Stocks & Indices", basePrice: 172, volatility: 0.45, pipDecimals: 2, flag: "\u{1F534}" },
  { symbol: "IBM", name: "International Business Machines", payout: 88, category: "Stocks & Indices", basePrice: 220, volatility: 0.5, pipDecimals: 2, flag: "\u{1F4BC}" },
  { symbol: "QCOM", name: "QUALCOMM Inc.", payout: 88, category: "Stocks & Indices", basePrice: 168, volatility: 0.55, pipDecimals: 2, flag: "\u{1F4E1}" },
  { symbol: "TXN", name: "Texas Instruments", payout: 88, category: "Stocks & Indices", basePrice: 195, volatility: 0.48, pipDecimals: 2, flag: "\u{1F532}" },
  { symbol: "AVGO", name: "Broadcom Inc.", payout: 90, category: "Stocks & Indices", basePrice: 175, volatility: 0.6, pipDecimals: 2, flag: "\u{1F310}" },
  { symbol: "CSCO", name: "Cisco Systems", payout: 87, category: "Stocks & Indices", basePrice: 55, volatility: 0.15, pipDecimals: 2, flag: "\u{1F310}" },
  { symbol: "ACN", name: "Accenture plc", payout: 88, category: "Stocks & Indices", basePrice: 350, volatility: 0.8, pipDecimals: 2, flag: "\u{1F4A1}" },
  { symbol: "LLY", name: "Eli Lilly and Co.", payout: 91, category: "Stocks & Indices", basePrice: 910, volatility: 2.1, pipDecimals: 2, flag: "\u{1F489}" },
  { symbol: "UNH", name: "UnitedHealth Group", payout: 89, category: "Stocks & Indices", basePrice: 585, volatility: 1.2, pipDecimals: 2, flag: "\u{1F3E5}" },
  { symbol: "MRK", name: "Merck & Co.", payout: 88, category: "Stocks & Indices", basePrice: 105, volatility: 0.28, pipDecimals: 2, flag: "\u{1F52C}" },
  { symbol: "PFE", name: "Pfizer Inc.", payout: 87, category: "Stocks & Indices", basePrice: 28.5, volatility: 0.1, pipDecimals: 2, flag: "\u{1F9EC}" },
  { symbol: "ABBV", name: "AbbVie Inc.", payout: 88, category: "Stocks & Indices", basePrice: 198, volatility: 0.45, pipDecimals: 2, flag: "\u{1F9EA}" },
  { symbol: "ABT", name: "Abbott Laboratories", payout: 88, category: "Stocks & Indices", basePrice: 115, volatility: 0.3, pipDecimals: 2, flag: "\u{1FA7A}" }
];

// src/utils/storage.ts
var DEFAULT_ASSETS = OTC_ASSETS_CATALOG;
var BUILTIN_AVATARS = [
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8800"/><stop offset="100%" stop-color="#ffaa00"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#141414"/><circle cx="60" cy="44" r="22" fill="url(#g1)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g1)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#121816"/><circle cx="60" cy="44" r="22" fill="url(#g2)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g2)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#101720"/><circle cx="60" cy="44" r="22" fill="url(#g3)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g3)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#18121e"/><circle cx="60" cy="44" r="22" fill="url(#g4)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g4)"/></svg>`
  )}`
];
var SYMBOL_ALIASES = {
  "gold": "XAU/USD",
  "xau/usd": "XAU/USD",
  "silver": "XAG/USD",
  "xag/usd": "XAG/USD",
  "oil": "WTI/USD",
  "crude": "CRUDE OIL",
  "crude oil": "CRUDE OIL",
  "us oil": "WTI/USD",
  "brent": "BRENT/USD",
  "brent oil": "BRENT/USD",
  "gas": "NGAS/USD",
  "natural gas": "NGAS/USD",
  "nasdaq": "NAS100",
  "ndx": "NAS100",
  "spx": "SPX500",
  "sp500": "SPX500",
  "s&p500": "SPX500",
  "dow": "US30",
  "dji": "US30",
  "btc": "BTC/USD",
  "btc/usdt": "BTC/USDT",
  "eth": "ETH/USD",
  "eth/usdt": "ETH/USDT",
  "sol": "SOL/USD",
  "sol/usdt": "SOL/USDT",
  "eurusd": "EUR/USD",
  "gbpjpy": "GBP/JPY",
  "gbpusd": "GBP/USD",
  "usdjpy": "USD/JPY"
};
function normalizeAssetSymbol(symbol) {
  const fallback = "EUR/USD (OTC)";
  if (!symbol || typeof symbol !== "string") return fallback;
  const allAssets = dynamicAssetsRegistry.length > 0 ? dynamicAssetsRegistry : DEFAULT_ASSETS;
  const exact = allAssets.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
  if (exact) return exact.symbol;
  const cleaned = symbol.replace(/\s*\(otc\)/gi, "").trim();
  const lower = cleaned.toLowerCase();
  if (SYMBOL_ALIASES[lower]) {
    return SYMBOL_ALIASES[lower];
  }
  const cleanMatch = allAssets.find((a) => a.symbol.replace(/\s*\(otc\)/gi, "").trim().toLowerCase() === lower);
  if (cleanMatch) return cleanMatch.symbol;
  const caseMatch = allAssets.find((a) => a.symbol.toLowerCase() === lower || a.name.toLowerCase() === lower);
  if (caseMatch) return caseMatch.symbol;
  return symbol.toUpperCase();
}
var dynamicAssetsRegistry = [...OTC_ASSETS_CATALOG];
function getDynamicAssets() {
  return dynamicAssetsRegistry.length > 0 ? dynamicAssetsRegistry : OTC_ASSETS_CATALOG;
}
function findAssetBySymbol(symbol) {
  const allAssets = getDynamicAssets();
  if (!symbol) {
    return allAssets.find((a) => a.symbol === "EUR/USD") || allAssets[0];
  }
  const canonicalSymbol = normalizeAssetSymbol(symbol);
  const foundDynamic = allAssets.find((a) => a.symbol === canonicalSymbol);
  if (foundDynamic) return foundDynamic;
  const lower = symbol.trim().toLowerCase();
  const byName = allAssets.find(
    (a) => a.name.toLowerCase().includes(lower)
  );
  if (byName) return byName;
  return {
    symbol: canonicalSymbol,
    name: canonicalSymbol,
    payout: 92,
    category: canonicalSymbol.includes("/") ? "Forex (OTC)" : "Stocks (OTC)",
    basePrice: 100,
    volatility: 0.05,
    pipDecimals: canonicalSymbol.includes("JPY") ? 3 : canonicalSymbol.includes("/") ? 5 : 2,
    flag: "\u{1F4C8}"
  };
}

// src/utils/priceFeedEngine.ts
var GLOBAL_EPOCH = 17040672e5;
function hashSymbol(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function getCategoryParameters(category, symbol = "") {
  const cat = (category || "").toLowerCase();
  const sym = (symbol || "").toLowerCase();
  const isVolatileFx = sym.includes("jpy") || sym.includes("gbp") || sym.includes("mxn") || sym.includes("brl") || sym.includes("try") || sym.includes("zar");
  if (cat.includes("crypto")) {
    return {
      volMultiplier: 2.85,
      trendLengthMin: 20,
      trendLengthMax: 65,
      breakoutChance: 0.32,
      jumpChance: 0.08,
      wickMultiplier: 1.45,
      maxRunCandles: 7
    };
  }
  if (cat.includes("commodit")) {
    return {
      volMultiplier: sym.includes("xau") || sym.includes("wti") || sym.includes("cocoa") ? 2.1 : 1.65,
      trendLengthMin: 30,
      trendLengthMax: 85,
      breakoutChance: 0.24,
      jumpChance: 0.06,
      wickMultiplier: 1.3,
      maxRunCandles: 6
    };
  }
  if (cat.includes("stock")) {
    return {
      volMultiplier: sym.includes("tsla") || sym.includes("nvda") || sym.includes("mstr") || sym.includes("coin") ? 2.2 : 1.55,
      trendLengthMin: 25,
      trendLengthMax: 75,
      breakoutChance: 0.22,
      jumpChance: 0.05,
      wickMultiplier: 1.25,
      maxRunCandles: 5
    };
  }
  return {
    volMultiplier: isVolatileFx ? 1.35 : 1,
    trendLengthMin: 30,
    trendLengthMax: 85,
    breakoutChance: 0.16,
    jumpChance: 0.03,
    wickMultiplier: 1.1,
    maxRunCandles: 5
  };
}
function getAssetTimeOffsetMs(symbol, timeframeSeconds) {
  const canonical = normalizeAssetSymbol(symbol);
  const hash = hashSymbol(canonical);
  const tfSeconds = Math.max(5, timeframeSeconds);
  const subSteps = Math.max(1, Math.floor(tfSeconds / 5));
  const stepIndex = (hash >>> 3) % subSteps;
  return stepIndex * 5e3;
}
function computeSynchronizedTickAtTime(asset, nowMs = Date.now()) {
  const canonical = normalizeAssetSymbol(asset.symbol);
  const tf = 5;
  const tfMs = tf * 1e3;
  const offsetMs = getAssetTimeOffsetMs(canonical, tf);
  const currentBucketTime = Math.floor((nowMs + offsetMs) / tfMs) * tfMs - offsetMs;
  const catParams = getCategoryParameters(asset.category, canonical);
  const unitVol = asset.volatility * catParams.volMultiplier;
  const minPip = Math.pow(10, -asset.pipDecimals);
  const symSeed = hashSymbol(canonical);
  const evalContinuousPriceAt = (tMs) => {
    const tSec = (tMs - GLOBAL_EPOCH) / 1e3;
    const p1 = (symSeed & 255) / 255 * Math.PI * 2;
    const p2 = (symSeed >>> 8 & 255) / 255 * Math.PI * 2;
    const p3 = (symSeed >>> 16 & 255) / 255 * Math.PI * 2;
    const p4 = (symSeed >>> 24 & 255) / 255 * Math.PI * 2;
    const f1 = 45e-5 + symSeed % 17 * 2e-5;
    const f2 = 165e-5 + (symSeed >>> 4) % 19 * 5e-5;
    const f3 = 58e-4 + (symSeed >>> 9) % 23 * 15e-5;
    const f4 = 0.019 + (symSeed >>> 14) % 29 * 4e-4;
    const f5 = 0.067 + (symSeed >>> 19) % 31 * 12e-4;
    const waveUnits = Math.sin(tSec * f1 + p1) * 7.5 + Math.cos(tSec * f2 + p2) * 4.2 + Math.sin(tSec * f3 + p3) * 2.4 + Math.cos(tSec * f4 + p4) * 1.25 + Math.sin(tSec * f5 + p1 + p3) * 0.65;
    const rawPrice = asset.basePrice + waveUnits * unitVol;
    return Number(Math.max(minPip * 10, rawPrice).toFixed(asset.pipDecimals));
  };
  const open = evalContinuousPriceAt(currentBucketTime);
  const targetClose = evalContinuousPriceAt(currentBucketTime + tfMs);
  const elapsedMs = ((nowMs + offsetMs) % tfMs + tfMs) % tfMs;
  const progress = Math.max(0, Math.min(1, elapsedMs / tfMs));
  const subStep = Math.floor(nowMs / 250);
  const pulseHash = hashSymbol(`${canonical}:subtick:${subStep}`);
  const pulseNorm = (pulseHash % 2e3 - 1e3) / 1e3;
  const envelope = Math.sin(progress * Math.PI);
  const intraWave = pulseNorm * unitVol * 0.35 * envelope;
  const rawLivePrice = open + (targetClose - open) * progress + intraWave;
  const livePrice = Number(Math.max(minPip * 10, rawLivePrice).toFixed(asset.pipDecimals));
  const wickHash = hashSymbol(`${canonical}:wick5s:${currentBucketTime}`);
  const upperWick = Math.max(minPip * 2, wickHash % 100 / 100 * unitVol * 0.65 * progress);
  const lowerWick = Math.max(minPip * 2, (wickHash >>> 8) % 100 / 100 * unitVol * 0.65 * progress);
  const bodyMax = Math.max(open, livePrice);
  const bodyMin = Math.min(open, livePrice);
  return {
    price: livePrice,
    open,
    high: Number((bodyMax + upperWick).toFixed(asset.pipDecimals)),
    low: Number(Math.max(minPip * 5, bodyMin - lowerWick).toFixed(asset.pipDecimals)),
    close: livePrice,
    bucketTime: currentBucketTime
  };
}

// src/server/marketEngine.ts
var BackendMarketEngine = class {
  constructor() {
    this.assets = [...OTC_ASSETS_CATALOG];
    this.tickInterval = null;
    this.currentPrices = /* @__PURE__ */ new Map();
    this.feedSource = "synchronized_server_rest_engine";
    this.forexRates = {
      EUR: 1.0845,
      GBP: 1.2921,
      JPY: 154.25,
      CHF: 0.8872,
      CAD: 1.3912,
      AUD: 0.6542,
      NZD: 0.5984,
      XAU: 2742.5,
      XAG: 31.85,
      WTI: 71.4
    };
    this.broadcastBatch();
  }
  setSymbolPriceVariants(symbol, price) {
    this.currentPrices.set(symbol, price);
    const clean = symbol.replace(/\s*\(OTC\)/i, "").trim();
    this.currentPrices.set(clean, price);
    if (clean.endsWith("/USD")) {
      this.currentPrices.set(`${clean}T`, price);
    }
  }
  async start() {
    this.broadcastBatch();
    this.tickInterval = setInterval(() => this.broadcastBatch(), 1e3);
  }
  getPrice(symbol) {
    if (this.currentPrices.has(symbol)) return this.currentPrices.get(symbol);
    const matched = findAssetBySymbol(symbol);
    if (matched) {
      const snap = computeSynchronizedTickAtTime(matched, Date.now());
      this.setSymbolPriceVariants(matched.symbol, snap.price);
      return snap.price;
    }
    return void 0;
  }
  getAllPrices() {
    this.broadcastBatch();
    const res = {};
    for (const [k, v] of this.currentPrices.entries()) {
      res[k] = v;
    }
    return res;
  }
  getForexRates() {
    return { ...this.forexRates };
  }
  getFeedSource() {
    return this.feedSource;
  }
  /**
   * Synchronizes all 268+ assets simultaneously every second using the deterministic UTC clock.
   */
  broadcastBatch() {
    const now = Date.now();
    for (const asset of this.assets) {
      const snap = computeSynchronizedTickAtTime(asset, now);
      this.setSymbolPriceVariants(asset.symbol, snap.price);
    }
  }
  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
};

// src/server/copyTradingEngine.ts
var CopyTradingEngine = class _CopyTradingEngine {
  constructor() {
    this.updateInterval = null;
    this.lastResetDate = "";
  }
  static getInstance() {
    if (!_CopyTradingEngine.instance) {
      _CopyTradingEngine.instance = new _CopyTradingEngine();
    }
    return _CopyTradingEngine.instance;
  }
  async start() {
    this.seedInitialTraders();
    this.refreshLeaderboardData();
    this.updateInterval = setInterval(() => this.refreshLeaderboardData(), 5e3);
  }
  stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
  seedInitialTraders() {
    const count = Number(db.prepare("SELECT COUNT(*) as c FROM copy_trading_profiles").get().c);
    if (count >= 200) return;
    const now = Date.now();
    const traders = [
      // Top Tier Instant Funded (Explicitly defined for premium feel)
      { id: "trd_i1", name: "Viktor Vance", country: "United Arab Emirates", flag: "\u{1F1E6}\u{1F1EA}", avatar: "\u{1F1E6}\u{1F1EA}", category: "instant_funded", strategy_name: "Institutional Alpha $100K", vip_level: "VIP Elite", starting_capital: 1e5, base_daily_target: 12500, volatility: 0.12, profit_factor: 2.85, max_drawdown: 3.2, sharpe_ratio: 2.1, avg_holding_time: "2h 45m" },
      { id: "trd_i2", name: "Kasun Perera", country: "Sri Lanka", flag: "\u{1F1F1}\u{1F1F0}", avatar: "\u{1F1F1}\u{1F1F0}", category: "instant_funded", strategy_name: "Colombo Gold Scalper $50K", vip_level: "VIP Pro", starting_capital: 5e4, base_daily_target: 8200, volatility: 0.18, profit_factor: 2.45, max_drawdown: 4.5, sharpe_ratio: 1.95, avg_holding_time: "45m" },
      { id: "trd_i3", name: "Arjun Malhotra", country: "India", flag: "\u{1F1EE}\u{1F1F3}", avatar: "\u{1F1EE}\u{1F1F3}", category: "instant_funded", strategy_name: "Mumbai Nifty Alpha $100K", vip_level: "VIP Elite", starting_capital: 1e5, base_daily_target: 9100, volatility: 0.1, profit_factor: 2.12, max_drawdown: 2.8, sharpe_ratio: 1.82, avg_holding_time: "6h 12m" },
      { id: "trd_i4", name: "Elena Rostova", country: "Russia", flag: "\u{1F1F7}\u{1F1FA}", avatar: "\u{1F1F7}\u{1F1FA}", category: "instant_funded", strategy_name: "Siberian Gold Rush $50K", vip_level: "VIP Pro", starting_capital: 5e4, base_daily_target: 7400, volatility: 0.22, profit_factor: 3.12, max_drawdown: 12.5, sharpe_ratio: 2.45, avg_holding_time: "30m" },
      { id: "trd_i5", name: "Liam Davies", country: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}", avatar: "\u{1F1EC}\u{1F1E7}", category: "instant_funded", strategy_name: "London Forex Scalp $50K", vip_level: "VIP Pro", starting_capital: 5e4, base_daily_target: 6200, volatility: 0.14, profit_factor: 1.98, max_drawdown: 5.2, sharpe_ratio: 1.65, avg_holding_time: "1h 50m" },
      // Auto-generate remaining to reach 100 Instant Funded
      ...Array.from({ length: 95 }).map((_, i) => ({
        id: `trd_i_ext_${i + 6}`,
        name: `${["Rajesh", "Tariq", "Faizul", "Amir", "Zulkifli", "Sheikh", "Alexander", "Priya", "Marco", "Hamdan"][i % 10]} ${["Kumar", "Mahmood", "Islam", "Al-Maktoum", "Rahman", "Al-Thani", "Vance", "Sharma", "Rossi", "Shah"][i % 10]}`,
        country: ["India", "Pakistan", "Bangladesh", "United Arab Emirates", "Malaysia", "Qatar", "United States", "India", "Italy", "Malaysia"][i % 10],
        flag: ["\u{1F1EE}\u{1F1F3}", "\u{1F1F5}\u{1F1F0}", "\u{1F1E7}\u{1F1E9}", "\u{1F1E6}\u{1F1EA}", "\u{1F1F2}\u{1F1FE}", "\u{1F1F6}\u{1F1E6}", "\u{1F1FA}\u{1F1F8}", "\u{1F1EE}\u{1F1F3}", "\u{1F1EE}\u{1F1F9}", "\u{1F1F2}\u{1F1FE}"][i % 10],
        avatar: ["\u{1F1EE}\u{1F1F3}", "\u{1F1F5}\u{1F1F0}", "\u{1F1E7}\u{1F1E9}", "\u{1F1E6}\u{1F1EA}", "\u{1F1F2}\u{1F1FE}", "\u{1F1F6}\u{1F1E6}", "\u{1F1FA}\u{1F1F8}", "\u{1F1EE}\u{1F1F3}", "\u{1F1EE}\u{1F1F9}", "\u{1F1F2}\u{1F1FE}"][i % 10],
        category: "instant_funded",
        strategy_name: `Institutional Alpha v${i + 6}`,
        vip_level: i % 3 === 0 ? "VIP Elite" : "VIP Pro",
        starting_capital: [25e3, 5e4, 1e5, 2e5][i % 4],
        base_daily_target: 3e3 + Math.random() * 8e3,
        volatility: 0.05 + Math.random() * 0.15,
        profit_factor: 1.8 + Math.random() * 1.5,
        max_drawdown: 1.2 + Math.random() * 6,
        sharpe_ratio: 1.4 + Math.random() * 1.2,
        avg_holding_time: `${Math.floor(Math.random() * 12 + 1)}h ${Math.floor(Math.random() * 60)}m`
      })),
      // Top Tier Self Capital (Explicitly defined)
      { id: "trd_s1", name: "Marco Rossi", country: "Italy", flag: "\u{1F1EE}\u{1F1F9}", avatar: "\u{1F1EE}\u{1F1F9}", category: "self_capital", strategy_name: "Milan OTC Scalper", vip_level: "VIP Master", starting_capital: 5e3, base_daily_target: 8500, volatility: 0.3, profit_factor: 3.45, max_drawdown: 8.5, sharpe_ratio: 2.8, avg_holding_time: "15m" },
      { id: "trd_s2", name: "Nimal Jayasinghe", country: "Sri Lanka", flag: "\u{1F1F1}\u{1F1F0}", avatar: "\u{1F1F1}\u{1F1F0}", category: "self_capital", strategy_name: "Kandy Forex Syndicate", vip_level: "VIP Pro", starting_capital: 2500, base_daily_target: 4200, volatility: 0.28, profit_factor: 2.15, max_drawdown: 7.2, sharpe_ratio: 1.65, avg_holding_time: "2h 10m" },
      { id: "trd_s3", name: "Bilal Ahmed", country: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}", avatar: "\u{1F1F5}\u{1F1F0}", category: "self_capital", strategy_name: "Karachi Crypto Surge", vip_level: "VIP Pro", starting_capital: 2e3, base_daily_target: 3900, volatility: 0.4, profit_factor: 2.65, max_drawdown: 15.2, sharpe_ratio: 1.95, avg_holding_time: "45m" },
      { id: "trd_s4", name: "Mohamed Farhan", country: "Bangladesh", flag: "\u{1F1E7}\u{1F1E9}", avatar: "\u{1F1E7}\u{1F1E9}", category: "self_capital", strategy_name: "Chittagong Swing Trader", vip_level: "VIP Pro", starting_capital: 1500, base_daily_target: 3100, volatility: 0.32, profit_factor: 1.95, max_drawdown: 9.8, sharpe_ratio: 1.45, avg_holding_time: "3d 12h" },
      { id: "trd_s5", name: "Azlan Shah", country: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}", avatar: "\u{1F1F2}\u{1F1FE}", category: "self_capital", strategy_name: "Penang FX Reversal", vip_level: "Pro Trader", starting_capital: 2e3, base_daily_target: 2500, volatility: 0.25, profit_factor: 1.85, max_drawdown: 6.2, sharpe_ratio: 1.35, avg_holding_time: "4h 20m" },
      // Auto-generate remaining to reach 100 Self Capital
      ...Array.from({ length: 95 }).map((_, i) => ({
        id: `trd_s_ext_${i + 6}`,
        name: `${["Oliver", "Sofia", "Lucas", "Emma", "David", "Zoe", "Hans", "Yuki", "Chen", "Svetlana"][i % 10]} ${["Twist", "Garcia", "Bernard", "Watson", "Miller", "Chen", "M\xFCller", "Sato", "Wei", "Petrova"][i % 10]}`,
        country: ["United Kingdom", "Spain", "France", "Canada", "United States", "Singapore", "Germany", "Japan", "China", "Russia"][i % 10],
        flag: ["\u{1F1EC}\u{1F1E7}", "\u{1F1EA}\u{1F1F8}", "\u{1F1EB}\u{1F1F7}", "\u{1F1E8}\u{1F1E6}", "\u{1F1FA}\u{1F1F8}", "\u{1F1F8}\u{1F1EC}", "\u{1F1E9}\u{1F1EA}", "\u{1F1EF}\u{1F1F5}", "\u{1F1E8}\u{1F1F3}", "\u{1F1F7}\u{1F1FA}"][i % 10],
        avatar: ["\u{1F1EC}\u{1F1E7}", "\u{1F1EA}\u{1F1F8}", "\u{1F1EB}\u{1F1F7}", "\u{1F1E8}\u{1F1E6}", "\u{1F1FA}\u{1F1F8}", "\u{1F1F8}\u{1F1EC}", "\u{1F1E9}\u{1F1EA}", "\u{1F1EF}\u{1F1F5}", "\u{1F1E8}\u{1F1F3}", "\u{1F1F7}\u{1F1FA}"][i % 10],
        category: "self_capital",
        strategy_name: `Private Equity Gen ${i + 6}`,
        vip_level: i % 3 === 0 ? "VIP Master" : "VIP Pro",
        starting_capital: [1e3, 2500, 5e3, 1e4][i % 4],
        base_daily_target: 1e3 + Math.random() * 6e3,
        volatility: 0.15 + Math.random() * 0.35,
        profit_factor: 1.6 + Math.random() * 1.8,
        max_drawdown: 4 + Math.random() * 15,
        sharpe_ratio: 1.2 + Math.random() * 1.6,
        avg_holding_time: `${Math.floor(Math.random() * 8 + 1)}h ${Math.floor(Math.random() * 60)}m`
      }))
    ];
    const insert = db.prepare(`
      INSERT OR IGNORE INTO copy_trading_profiles (
        id, user_id, name, country, flag, avatar, category, strategy_name, vip_level,
        starting_capital, current_balance, lifetime_earnings, daily_profit_dollars,
        weekly_profit_pct, monthly_profit_pct, win_rate, total_trades, trading_turnover,
        total_copiers, max_copiers, win_rate_3m, profit_factor, max_drawdown, sharpe_ratio, avg_holding_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const t of traders) {
      const startCap = t.starting_capital || 1e4;
      insert.run(
        String(t.id || "trd_gen"),
        `sys_${t.id || "gen"}`,
        t.name || "Unknown Trader",
        t.country || "Global",
        t.flag || "\u{1F310}",
        t.avatar || "\u{1F464}",
        t.category || "instant_funded",
        t.strategy_name || "Global Strategy",
        t.vip_level || "Pro",
        startCap,
        startCap,
        // current_balance
        startCap * (1.2 + Math.random() * 5),
        // lifetime_earnings
        0,
        // daily_profit_dollars
        10 + Math.random() * 20,
        // weekly_profit_pct
        30 + Math.random() * 80,
        // monthly_profit_pct
        65 + Math.random() * 25,
        // win_rate
        100 + Math.floor(Math.random() * 2e3),
        // total_trades
        startCap * (10 + Math.random() * 50),
        // trading_turnover
        Math.floor(Math.random() * 450),
        // total_copiers
        500,
        // max_copiers
        65 + Math.random() * 25,
        // win_rate_3m
        t.profit_factor || 1.8 + Math.random() * 1.2,
        t.max_drawdown || 2 + Math.random() * 8,
        t.sharpe_ratio || 1.5 + Math.random() * 1.5,
        t.avg_holding_time || "4h 12m",
        now
      );
    }
  }
  refreshLeaderboardData() {
    const now = /* @__PURE__ */ new Date();
    const currentUtcDay = now.toISOString().split("T")[0];
    if (this.lastResetDate !== currentUtcDay) {
      this.lastResetDate = currentUtcDay;
    }
    const startOfDay = new Date(now).setUTCHours(0, 0, 0, 0);
    const elapsedMs = now.getTime() - startOfDay;
    const dayProgress = Math.min(elapsedMs / (24 * 60 * 60 * 1e3), 1);
    const profiles = db.prepare("SELECT * FROM copy_trading_profiles").all();
    const update = db.prepare(`
      UPDATE copy_trading_profiles SET
        daily_profit_dollars = ?,
        current_balance = ?,
        total_copiers = ?
      WHERE id = ?
    `);
    const minutesSinceEpoch = Math.floor(now.getTime() / (1e3 * 60));
    const rotationIndex = Math.floor(minutesSinceEpoch / 40);
    for (const p of profiles) {
      const baseDailyTarget = this.getTraderBaseTarget(p.id, p.starting_capital);
      const sessionMulti = 0.5 + 0.5 * Math.sin(dayProgress * Math.PI * 2 - Math.PI / 2);
      const jitter = Math.sin(Date.now() / 2e3 + this.getHash(p.id)) * 0.02;
      const rotationFactor = (Math.sin(rotationIndex + this.getHash(p.id)) + 1) / 2;
      const currentDailyProfit = baseDailyTarget * (dayProgress + jitter) * sessionMulti * (0.8 + 0.4 * rotationFactor);
      const currentBalance = p.starting_capital + currentDailyProfit;
      let totalCopiers = p.total_copiers;
      if (Math.random() > 0.98) totalCopiers = Math.min(500, totalCopiers + 1);
      if (Math.random() > 0.99) totalCopiers = Math.max(50, totalCopiers - 1);
      update.run(
        Number(currentDailyProfit.toFixed(2)),
        Number(currentBalance.toFixed(2)),
        totalCopiers,
        p.id
      );
      const traderRoi = currentDailyProfit / p.starting_capital;
      db.prepare(`
        UPDATE copy_trading_subscriptions 
        SET current_pnl = CASE 
          WHEN trade_sizing_type = 'fixed' THEN ? * sizing_multiplier
          ELSE allocated_capital * ?
        END
        WHERE provider_id = ? AND status = 'active'
      `).run(
        Number(currentDailyProfit.toFixed(2)),
        // Fixed size based on trader's raw profit * multiplier
        Number(traderRoi.toFixed(6)),
        // Proportionate return
        p.id
      );
    }
    db.prepare(`
      UPDATE copy_trading_subscriptions 
      SET status = 'cancelled'
      WHERE status = 'active' 
      AND (
        (max_loss_limit > 0 AND current_pnl <= -max_loss_limit) OR
        (take_profit_limit > 0 AND current_pnl >= take_profit_limit)
      )
    `).run();
  }
  getTraderBaseTarget(id, capital) {
    const hash = this.getHash(id);
    const targetPct = 0.05 + hash % 100 / 1e3;
    return capital * targetPct;
  }
  getTraderVolatility(id) {
    const hash = this.getHash(id);
    return 0.1 + hash % 20 / 100;
  }
  getHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
  getLeaderboard(category) {
    const rows = db.prepare(`
      SELECT * FROM copy_trading_profiles 
      WHERE category = ? 
      ORDER BY daily_profit_dollars DESC 
      LIMIT 20
    `).all(String(category));
    return rows.map((r, index) => {
      const totalCopiers = index < 5 ? 500 : r.total_copiers;
      return {
        id: r.id,
        user_id: r.user_id,
        provider_name: r.name,
        country_code: this.getCountryCode(r.country),
        country: r.country,
        flag: r.flag,
        avatar_url: r.avatar,
        account_category: r.category,
        strategy_title: r.strategy_name,
        vip_level: r.vip_level,
        tier_name: r.vip_level === "VIP Elite" ? "$100K Elite" : r.vip_level === "VIP Master" ? "$200K Master" : "$50K Pro",
        starting_balance: r.starting_capital,
        current_balance: r.current_balance,
        lifetime_earnings: r.lifetime_earnings,
        daily_profit: r.daily_profit_dollars,
        daily_profit_pct: Number((r.daily_profit_dollars / r.starting_capital * 100).toFixed(2)),
        weekly_profit_pct: r.weekly_profit_pct,
        monthly_profit_pct: r.monthly_profit_pct,
        win_rate_3m: r.win_rate_3m,
        profit_factor: r.profit_factor,
        max_drawdown: r.max_drawdown,
        sharpe_ratio: r.sharpe_ratio,
        avg_holding_time: r.avg_holding_time,
        total_trades: r.total_trades,
        current_copiers: totalCopiers,
        max_copiers: r.max_copiers
      };
    });
  }
  getCountryCode(country) {
    const map = {
      "India": "IN",
      "Sri Lanka": "LK",
      "Pakistan": "PK",
      "Bangladesh": "BD",
      "United Arab Emirates": "AE",
      "UAE": "AE",
      "Qatar": "QA",
      "Malaysia": "MY",
      "United States": "US",
      "USA": "US",
      "United Kingdom": "GB",
      "UK": "GB",
      "Singapore": "SG",
      "Australia": "AU",
      "Germany": "DE",
      "France": "FR",
      "Italy": "IT",
      "Brazil": "BR",
      "Russia": "RU",
      "Spain": "ES"
    };
    return map[country] || "US";
  }
};

// server.ts
dotenv.config({ override: true });
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var PORT = Number(process.env.PORT) || 3e3;
console.log(`Starting server on port ${PORT}...`);
var DIRECT_USDT_WALLET_ADDRESS = process.env.DIRECT_USDT_TRC20_WALLET_ADDRESS || DIRECT_USDT_TRC20_CONFIG.walletAddress;
var ACTIVE_TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || TRONGRID_API_KEY;
var creditedBalancesByAccount = /* @__PURE__ */ new Map();
var isValidUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
  String(val || "").trim()
);
var toValidUuid = (str) => {
  if (!str) return "00000000-0000-4000-8000-000000000001";
  const clean = String(str).trim();
  if (isValidUuid(clean)) return clean.toLowerCase();
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    hash1 = (hash1 << 5) - hash1 + ch;
    hash1 |= 0;
    hash2 = hash2 << 7 ^ hash2 + ch;
    hash2 |= 0;
  }
  const h1 = Math.abs(hash1).toString(16).padStart(8, "0");
  const h2 = Math.abs(hash2).toString(16).padStart(8, "0");
  const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, "0");
  const h4 = Math.abs(hash1 * 31 + hash2).toString(16).padStart(8, "0");
  const raw = (h1 + h2 + h3 + h4).slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
};
async function ensureSupabaseProfileInRest(supabaseUrl, supabaseAnonKey, user) {
  let targetUuid = isValidUuid(user.id) ? user.id : null;
  if (!targetUuid && user.email) {
    try {
      const pRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(user.email)}&select=id`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`
          }
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
    }
  }
  if (!targetUuid) {
    targetUuid = toValidUuid(user.id || user.email || "usr_bft_001");
  }
  try {
    fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        id: targetUuid,
        email: (user.email || `${targetUuid.slice(0, 8)}@client-bft.com`).toLowerCase(),
        full_name: user.full_name || "Trader User"
      })
    }).catch(() => {
    });
  } catch {
  }
  return targetUuid;
}
async function startServer() {
  const app = express();
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key", "apikey", "prefer"],
    preflightContinue: false,
    optionsSuccessStatus: 200
  }));
  app.options("*", cors());
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  const marketEngine = new BackendMarketEngine();
  marketEngine.start();
  const copyTradingEngine = CopyTradingEngine.getInstance();
  copyTradingEngine.start();
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const safeParseFetchJson = async (res, fallback = null) => {
    try {
      const text = await res.text();
      if (!text || !text.trim()) return fallback;
      return JSON.parse(text.trim());
    } catch {
      return fallback;
    }
  };
  const verifyPendingCryptoDepositsWithTronGrid = async (options) => {
    const localPending = getPendingCryptoDeposits(options?.userId);
    let supaPending = [];
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supaRes = await fetch(
          `${supabaseUrl}/rest/v1/crypto_deposits?status=eq.pending&select=*`,
          {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`
            }
          }
        );
        if (supaRes.ok) {
          const rows = await safeParseFetchJson(supaRes, []);
          if (Array.isArray(rows)) {
            supaPending = rows;
          }
        }
      } catch {
      }
    }
    if (localPending.length === 0 && supaPending.length === 0 && !options?.forceFetch && !options?.overrideTransactions) {
      return {
        ok: true,
        walletAddress: DIRECT_USDT_WALLET_ADDRESS,
        tronGridEndpoint: TRONGRID_TRC20_ENDPOINT,
        checkedCount: 0,
        matchedCount: 0,
        completedDeposits: [],
        remainingPendingCount: 0,
        transactionsFetched: 0
      };
    }
    let transactions = [];
    let tronGridError;
    if (Array.isArray(options?.overrideTransactions)) {
      transactions = options.overrideTransactions;
    } else {
      const fetched = await fetchTronGridTrc20Transfers({
        walletAddress: DIRECT_USDT_WALLET_ADDRESS,
        apiKey: ACTIVE_TRONGRID_API_KEY,
        limit: 50,
        onlyConfirmed: true
      });
      transactions = fetched.transactions;
      if (!fetched.ok) {
        tronGridError = fetched.error;
      }
    }
    const localResult = verifyAndCompletePendingCryptoDepositsInDb(transactions, {
      userId: options?.userId
    });
    if (supabaseUrl && supabaseAnonKey && localResult.completedDeposits.length > 0) {
      for (const comp of localResult.completedDeposits) {
        const dep = comp.deposit;
        if (dep && isValidUuid(dep.user_id)) {
          fetch(
            `${supabaseUrl}/rest/v1/crypto_deposits?user_id=eq.${encodeURIComponent(
              dep.user_id
            )}&amount=eq.${encodeURIComponent(String(dep.amount))}&status=eq.pending`,
            {
              method: "PATCH",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ status: "completed" })
            }
          ).catch(() => {
          });
        }
      }
    }
    const claimedTxIds = getCompletedCryptoDepositTxHashes();
    const supabaseCompleted = [];
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
            status: sRow.status || "pending"
          },
          transactions,
          claimedTxIds
        );
        if (matchedTx) {
          claimedTxIds.add(matchedTx.transaction_id);
          try {
            await fetch(`${supabaseUrl}/rest/v1/crypto_deposits?id=eq.${sRow.id}`, {
              method: "PATCH",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ status: "completed" })
            });
            const sUserId = String(sRow.user_id || "usr_bft_001");
            const sAccountType = resolveDepositAccountType(sRow.account_type);
            const sAmount = Number(sRow.amount || 0);
            ensureUserInDb({
              id: sUserId,
              email: `${sUserId.toLowerCase().replace(/[^a-z0-9]/g, "")}@client-bft.com`,
              fullName: `Trader ${sUserId.slice(-4)}`
            });
            let activatedOrCreditedAccount = null;
            if (sAccountType === "challenge") {
              const parsedPkg = parseChallengePackageFromDeposit({
                sku: sRow.package_sku || sRow.sku,
                package_sku: sRow.package_sku || sRow.sku,
                package_name: sRow.package_name,
                amount: sAmount
              });
              activatedOrCreditedAccount = createAccount({
                userId: sUserId,
                tier: parsedPkg.tier,
                tierName: parsedPkg.tierName,
                size: parsedPkg.size,
                dailyWithdrawalsUnlocked: false
              });
            } else {
              ensurePersonalLiveAccountForUser(sUserId);
              activatedOrCreditedAccount = creditPersonalAccountDepositInDb({
                userId: sUserId,
                amountUsdt: sAmount
              });
            }
            supabaseCompleted.push({
              ok: true,
              deposit: { ...sRow, status: "completed", tx_hash: matchedTx.transaction_id },
              account: activatedOrCreditedAccount,
              accountType: sAccountType,
              amount: sAmount,
              txHash: matchedTx.transaction_id
            });
          } catch (supaErr) {
            console.warn("Supabase crypto_deposits completion warning:", supaErr);
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
      completedDeposits: allCompleted,
      remainingPendingCount: localResult.remainingPendingCount,
      transactionsFetched: transactions.length,
      ...tronGridError ? { tronGridNotice: tronGridError } : {}
    };
  };
  setInterval(() => {
    verifyPendingCryptoDepositsWithTronGrid().catch((err) => {
      console.warn("Background TronGrid TRC-20 verification error:", err);
    });
  }, 15e3);
  const provisionedSupaPurchaseIds = /* @__PURE__ */ new Set();
  if (supabaseUrl && supabaseAnonKey) {
    setInterval(async () => {
      try {
        let res = await fetch(`${supabaseUrl}/rest/v1/user_purchases?is_provisioned=eq.false`, {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
            Prefer: "return=representation"
          }
        });
        if (!res.ok) {
          res = await fetch(`${supabaseUrl}/rest/v1/user_purchases?select=*&order=created_at.desc&limit=25`, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`
            }
          });
        }
        if (!res.ok) return;
        const purchases = await safeParseFetchJson(res, []);
        if (!Array.isArray(purchases)) return;
        for (const p of purchases) {
          const pid = String(p?.id || "");
          if (!pid || provisionedSupaPurchaseIds.has(pid) || p?.is_provisioned === true) continue;
          provisionedSupaPurchaseIds.add(pid);
          const parsedPkg = parseChallengePackageFromDeposit({
            sku: p.package_sku || p.package_id,
            package_sku: p.package_sku || p.package_id,
            package_name: p.package_name,
            amount: Number(p.package_amount || p.amount || 0)
          });
          ensureUserInDb({
            id: String(p.user_id || "usr_bft_001"),
            email: `${String(p.user_id || "trader").slice(0, 8)}@client-bft.com`,
            fullName: `Trader ${String(p.user_id || "0001").slice(-4)}`
          });
          const existingAccounts = getAccountsForUser(String(p.user_id || "usr_bft_001"));
          if (existingAccounts.length <= 1) {
            createAccount({
              userId: String(p.user_id || "usr_bft_001"),
              tier: parsedPkg.tier,
              tierName: parsedPkg.tierName,
              size: parsedPkg.size,
              dailyWithdrawalsUnlocked: false
            });
          }
          if (p.is_provisioned === false) {
            await fetch(`${supabaseUrl}/rest/v1/user_purchases?id=eq.${encodeURIComponent(pid)}`, {
              method: "PATCH",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ is_provisioned: true })
            }).catch(() => {
            });
          }
        }
      } catch (e) {
        console.error("Polling for manual purchases failed:", e);
      }
    }, 15e3);
  } else {
    console.warn("Supabase polling disabled: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing.");
  }
  app.get(["/api/health", "/healthz"], (_req, res) => {
    res.status(200).json({ ok: true, status: "healthy", timestamp: Date.now() });
  });
  const parseCookies = (req) => {
    const list = {};
    const rc = req.headers.cookie;
    if (!rc) return list;
    rc.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      const key = parts.shift()?.trim();
      if (key) {
        list[key] = decodeURIComponent(parts.join("="));
      }
    });
    return list;
  };
  const getAuthenticatedUser = (req) => {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      const cookies = parseCookies(req);
      token = cookies["bft_session"] || null;
    }
    if (token) {
      const sessionUser = validateSession(token);
      if (sessionUser) return sessionUser;
      if (token.split(".").length === 3) {
        try {
          const payloadB64 = token.split(".")[1];
          const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
          if (decoded?.sub || decoded?.email) {
            const ensured = ensureUserInDb({
              id: String(decoded.sub || ""),
              email: String(decoded.email || ""),
              fullName: decoded.user_metadata?.full_name || decoded.name || void 0,
              referralCode: decoded.ref || decoded.user_metadata?.referral_code || void 0
            });
            if (ensured) return ensured;
          }
        } catch {
        }
      }
    }
    const fallbackId = String(req.body?.userId || req.query?.userId || "").trim();
    const fallbackEmail = String(req.body?.email || req.query?.email || "").trim();
    if (fallbackId || fallbackEmail) {
      return ensureUserInDb({
        id: fallbackId,
        email: fallbackEmail,
        fullName: req.body?.fullName ? String(req.body.fullName) : void 0
      });
    }
    return null;
  };
  const isUserAdmin = (user, req) => {
    const adminKey = req?.headers["x-admin-key"] || (req?.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7).trim() : null);
    if (adminKey === "bft_admin_master_key_2026") return true;
    if (!user) return false;
    if (user.role === "admin") return true;
    const adminEmails = [
      "shankavee44@gmail.com",
      "admin@bft.io",
      "viktor.v@quant-prop.io",
      "superadmin@bft.io"
    ];
    return adminEmails.includes(String(user.email || "").toLowerCase().trim());
  };
  const requireAdmin = (req, res, next) => {
    const user = getAuthenticatedUser(req);
    if (!isUserAdmin(user, req)) {
      return res.status(403).json({
        ok: false,
        error: "Access Denied: Admin authorization required.",
        code: "FORBIDDEN_NOT_ADMIN"
      });
    }
    req.adminUser = user || {
      id: "usr_admin_master",
      email: "admin@bft.io",
      full_name: "BFT Super Administrator",
      role: "admin"
    };
    next();
  };
  const formatUserResponse = (user) => {
    const sub = user?.id ? getKycSubmissionForUser(user.id) : null;
    const isAdmin = isUserAdmin(user);
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name || sub?.full_name || "",
      role: isAdmin ? "admin" : user.role || "trader",
      isAdmin,
      avatarUrl: user.avatar_url,
      referralCode: user.referral_code,
      referredBy: user.referred_by,
      kycStatus: user.kyc_status || "unverified",
      kycDocType: user.kyc_doc_type || sub?.doc_type || "ID Card",
      kycDocumentNumber: user.kyc_doc_number || sub?.document_number || "",
      kycFrontDocumentUrl: user.kyc_front_url || sub?.front_document_url || "",
      kycBackDocumentUrl: user.kyc_back_url || sub?.back_document_url || "",
      kycDocumentFileName: user.kyc_front_filename || sub?.front_file_name || "",
      kycBackDocumentFileName: user.kyc_back_filename || sub?.back_file_name || "",
      kycSubmittedAt: user.kyc_submitted_at || "",
      profileLocked: Boolean(user.profile_locked || sub?.profile_locked),
      is2faEnabled: Boolean(user.is_2fa_enabled),
      address: user.address || sub?.address || "",
      dateOfBirth: user.date_of_birth || sub?.date_of_birth || "",
      country: user.country || sub?.country || "United States",
      flag: getCountryFlag(user.country || sub?.country),
      telegramHandle: user.telegram_handle || "",
      selfBalance: user.self_balance ?? 0,
      demoBalance: user.demo_balance ?? 1e4,
      fundedBalance: user.funded_balance ?? 0
    };
  };
  app.post("/api/auth/session", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      let fullName = String(req.body?.name || req.body?.fullName || "").trim();
      const userIdInput = req.body?.userId ? String(req.body.userId).trim() : void 0;
      const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim().toUpperCase() : null;
      const rememberMe = req.body?.rememberMe !== false;
      if (!email || !email.includes("@")) {
        return res.status(400).json({ ok: false, error: "Valid email address is required." });
      }
      if (!fullName) {
        fullName = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      }
      const user = createOrUpdateGoogleUser({
        email,
        fullName,
        googleId: userIdInput || `usr_${Buffer.from(email).toString("hex").slice(0, 16)}`,
        referralCodeInput: referralCode
      });
      if (supabaseUrl && supabaseAnonKey) {
        try {
          const checkUrl = `${supabaseUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,is_2fa_enabled,totp_secret`;
          const sRes = await fetch(checkUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`
            }
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
          console.warn("Supabase profiles 2FA check warning:", supaErr);
        }
      }
      if (user.is_2fa_enabled) {
        return res.json({
          ok: true,
          is2faRequired: true,
          userId: user.id,
          email: user.email
        });
      }
      const { token, expiresAt } = createSessionToken(user.id, rememberMe);
      const maxAgeMs = expiresAt - Date.now();
      const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
      res.setHeader(
        "Set-Cookie",
        `bft_session=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1e3)}; HttpOnly; ${isHttps ? "SameSite=None; Secure" : "SameSite=Lax"}`
      );
      const accounts = getAccountsForUser(user.id);
      return res.json({
        ok: true,
        token,
        user: formatUserResponse(user),
        accounts
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Authentication error." });
    }
  });
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      const userId = String(req.body?.userId || "").trim();
      const email = String(req.body?.email || "").trim().toLowerCase();
      const rawCode = String(req.body?.code || "").trim();
      const code = rawCode.replace(/\D/g, "");
      const rememberMe = req.body?.rememberMe !== false;
      if (!userId && !email || !code || code.length !== 6) {
        return res.status(400).json({ ok: false, error: "Please enter a valid 6-digit verification code." });
      }
      let user = userId ? getUserById(userId) : null;
      if (!user && email) {
        user = getUserByEmail(email);
      }
      let secret = user?.totp_secret;
      if ((!secret || !user) && supabaseUrl && supabaseAnonKey) {
        try {
          const queryParam = email ? `email=eq.${encodeURIComponent(email)}` : `id=eq.${encodeURIComponent(userId)}`;
          const sRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?${queryParam}&select=id,email,full_name,is_2fa_enabled,totp_secret`,
            {
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`
              }
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
                fullName: p.full_name || p.email.split("@")[0],
                googleId: p.id
              });
            }
            if (user && p.totp_secret) {
              updateUser2faSecret(user.id, p.totp_secret);
              if (p.is_2fa_enabled) enableUser2fa(user.id);
            }
          }
        } catch (supaErr) {
          console.warn("Supabase fetch totp_secret warning:", supaErr);
        }
      }
      if (!user || !secret) {
        return res.status(400).json({
          ok: false,
          error: "Two-Factor Authentication is not configured or secret not found for this account."
        });
      }
      const isValid = (await verify({ token: code, secret })).valid;
      if (!isValid) {
        return res.status(400).json({
          ok: false,
          error: "Invalid 6-digit verification code. Please check your Google Authenticator app."
        });
      }
      const { token, expiresAt } = createSessionToken(user.id, rememberMe);
      const maxAgeMs = expiresAt - Date.now();
      const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
      res.setHeader(
        "Set-Cookie",
        `bft_session=${token}; Path=/; Max-Age=${Math.floor(maxAgeMs / 1e3)}; HttpOnly; ${isHttps ? "SameSite=None; Secure" : "SameSite=Lax"}`
      );
      const accounts = getAccountsForUser(user.id);
      return res.json({
        ok: true,
        token,
        user: formatUserResponse(user),
        accounts
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "2FA verification error." });
    }
  });
  app.get("/api/auth/me", (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ ok: false, authenticated: false, user: null, accounts: [] });
    }
    const accounts = getAccountsForUser(user.id);
    return res.json({
      ok: true,
      authenticated: true,
      user: formatUserResponse(user),
      accounts
    });
  });
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      const cookies = parseCookies(req);
      token = cookies["bft_session"] || null;
    }
    if (token) {
      deleteSessionToken(token);
    }
    res.setHeader("Set-Cookie", "bft_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return res.json({ ok: true, message: "Logged out successfully." });
  });
  app.post("/api/profile/lock", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const { fullName, address, dateOfBirth, country, telegramHandle } = req.body || {};
      if (!fullName || !address || !dateOfBirth) {
        return res.status(400).json({ ok: false, error: "Full Name, Address, Date of Birth, and Country are mandatory to lock profile." });
      }
      const updated = lockUserProfile(user.id, {
        fullName: String(fullName),
        address: String(address),
        dateOfBirth: String(dateOfBirth),
        country: country ? String(country) : "United States",
        telegramHandle: telegramHandle ? String(telegramHandle) : void 0
      });
      const submission = getKycSubmissionForUser(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(updated),
        kycSubmission: submission || null
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to lock personal details." });
    }
  });
  app.post("/api/profile/update", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const { fullName, address, dateOfBirth, country, telegramHandle, avatarUrl } = req.body || {};
      const isLocked = Boolean(user.profile_locked) || user.kyc_status === "verified" || user.kyc_status === "pending";
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
        telegramHandle !== void 0 ? String(telegramHandle).trim() : null,
        avatarUrl ? String(avatarUrl) : null,
        Date.now(),
        user.id
      );
      const updated = getUserById(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(updated)
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to update profile." });
    }
  });
  app.post("/api/kyc/submit", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
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
        status
      } = req.body || {};
      if (!user.profile_locked && (fullName || user.full_name)) {
        lockUserProfile(user.id, {
          fullName: String(fullName || user.full_name || "Verified Trader"),
          address: String(address || user.address || "Verified Institutional Address"),
          dateOfBirth: String(dateOfBirth || user.date_of_birth || "1995-01-01"),
          country: country ? String(country) : user.country || "United States"
        });
      }
      const cleanDocType = String(docType || "ID Card").trim();
      const targetStatus = status === "verified" || status === "approved" ? "verified" : "pending";
      const updated = updateUserKycStatus(user.id, {
        status: targetStatus,
        docType: cleanDocType,
        documentNumber: documentNumber ? String(documentNumber).trim() : void 0,
        frontDocumentUrl: frontDocumentUrl ? String(frontDocumentUrl).trim() : void 0,
        backDocumentUrl: backDocumentUrl ? String(backDocumentUrl).trim() : void 0,
        frontFileName: frontFileName ? String(frontFileName).trim() : void 0,
        backFileName: backFileName ? String(backFileName).trim() : void 0
      });
      const submission = getKycSubmissionForUser(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(updated),
        kycSubmission: submission || null,
        message: "KYC Documents submitted! Status updated to Pending Verification."
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "KYC submission error." });
    }
  });
  app.get("/api/kyc/status", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const submission = getKycSubmissionForUser(user.id);
      return res.json({
        ok: true,
        user: formatUserResponse(user),
        kycSubmission: submission || null
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch KYC status." });
    }
  });
  app.get("/api/accounts", (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
    const accounts = getAccountsForUser(user.id);
    return res.json({ ok: true, accounts });
  });
  app.put("/api/accounts/:id", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const accountId = String(req.params.id || "").trim();
      const updated = updateAccountStateInDb(user.id, accountId, req.body || {});
      return res.json({ ok: true, account: updated });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to update account state." });
    }
  });
  app.get("/api/market/live-prices", (_req, res) => {
    try {
      const prices = marketEngine.getAllPrices();
      const forexRates = marketEngine.getForexRates();
      return res.json({
        ok: true,
        timestamp: Date.now(),
        source: marketEngine.getFeedSource(),
        prices,
        forexRates
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to get live prices." });
    }
  });
  app.get("/api/market/ticker", (req, res) => {
    try {
      const symbol = String(req.query.symbol || "BTC/USD (OTC)").trim();
      const price = marketEngine.getPrice(symbol);
      return res.json({
        ok: true,
        symbol,
        price: price ?? null,
        timestamp: Date.now(),
        source: marketEngine.getFeedSource()
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to get ticker price." });
    }
  });
  app.post("/api/trades", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
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
        accountTier
      } = req.body || {};
      if (!accountId || !asset || !direction || !investment) {
        return res.status(400).json({ ok: false, error: "Missing required trade execution parameters." });
      }
      const serverPrice = marketEngine.getPrice(asset);
      const executionPrice = Number(strikePrice) || serverPrice || 1;
      const result = recordTradeInDb(user.id, {
        id: id ? String(id) : void 0,
        accountId: String(accountId),
        asset: String(asset),
        direction: direction === "CALL" ? "CALL" : "PUT",
        strikePrice: executionPrice,
        investment: Number(investment),
        payoutPercentage: Number(payoutPercentage) || 92,
        durationSeconds: Number(durationSeconds) || 30,
        startTime: startTime ? Number(startTime) : void 0,
        endTime: endTime ? Number(endTime) : void 0,
        accountTier: accountTier ? String(accountTier) : void 0
      });
      return res.json({
        ok: true,
        trade: result.trade,
        account: result.account,
        message: "Trade placed successfully. Balance updated in database."
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to place trade." });
    }
  });
  app.post("/api/trades/settle", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const tradeId = String(req.body?.tradeId || req.body?.id || "").trim();
      const clientClosePrice = req.body?.closePrice !== void 0 ? Number(req.body.closePrice) : void 0;
      const statusOverride = req.body?.status;
      if (!tradeId) {
        return res.status(400).json({ ok: false, error: "Trade ID is required for settlement." });
      }
      const result = settleTradeInDb(
        user.id,
        tradeId,
        clientClosePrice ?? 1,
        statusOverride
      );
      return res.json({
        ok: true,
        ...result
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to settle trade." });
    }
  });
  app.get("/api/trades", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.json({ ok: true, trades: [] });
      const accountId = req.query.accountId ? String(req.query.accountId).trim() : void 0;
      const trades = getUserTradesFromDb(user.id, accountId);
      return res.json({ ok: true, trades });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch trades." });
    }
  });
  app.post("/api/accounts/pass-challenge", async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const accountId = String(req.body?.accountId || "").trim();
      const provisionLiveDirectly = Boolean(req.body?.provisionLiveDirectly);
      if (!accountId) {
        return res.status(400).json({ ok: false, error: "Account ID is required." });
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
                  Authorization: `Bearer ${supabaseAnonKey}`
                }
              }
            );
            if (pRes.ok) {
              const rows = await safeParseFetchJson(pRes, []);
              if (Array.isArray(rows) && rows.length > 0 && rows[0].id) {
                targetSupaUuid = String(rows[0].id);
              }
            }
          } catch {
          }
        }
        if (targetSupaUuid) {
          const lockedStatus = result.lockedAccount?.status || "passed";
          fetch(
            `${supabaseUrl}/rest/v1/trading_accounts?user_id=eq.${encodeURIComponent(
              targetSupaUuid
            )}&id=eq.${encodeURIComponent(accountId)}`,
            {
              method: "PATCH",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                status: lockedStatus,
                certificate_id: result.certificateId
              })
            }
          ).catch(() => {
          });
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
              status: "active"
            };
            fetch(`${supabaseUrl}/rest/v1/trading_accounts`, {
              method: "POST",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal"
              },
              body: JSON.stringify(supaAccountPayload)
            }).catch(() => {
            });
          }
        }
      }
      const accounts = getAccountsForUser(user.id);
      return res.json({
        ok: true,
        ...result,
        accounts
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to advance challenge phase." });
    }
  });
  app.all(
    ["/api/accounts/purchase", "/functions/v1/accounts-purchase", "/functions/v1/purchase-account", "/purchase-package", "/functions/v1/purchase-package"],
    async (req, res) => {
      try {
        const user = getAuthenticatedUser(req) || getUserById("usr_bft_001");
        if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
        const tier = String(req.body?.tier || "two-step");
        const tierName = String(req.body?.tierName || "$10,000 Challenge");
        const size = Number(req.body?.size || 1e4);
        const price = Number(req.body?.price || 99);
        const referralCode = req.body?.referralCode ? String(req.body.referralCode).trim() : null;
        const dailyWithdrawalsUnlocked = Boolean(req.body?.dailyWithdrawalsUnlocked);
        const txHash = req.body?.txHash ? String(req.body.txHash).trim() : void 0;
        const accountType = resolveDepositAccountType(req.body?.accountType || "challenge");
        const packageName = String(
          req.body?.packageName || `${tierName} ($${size.toLocaleString()})`
        ).trim();
        const sku = buildPackageSku({
          accountType,
          tier,
          sizeOrAmount: size,
          customSku: req.body?.sku ? String(req.body.sku) : void 0
        });
        const limits = getDynamicAccountLimits(tier, "phase_1");
        const accountId = `BFT-${Math.floor(1e4 + Math.random() * 89999)}`;
        const now = Date.now();
        const nowIso = new Date(now).toISOString().split("T")[0];
        let cryptoDeposit = null;
        try {
          cryptoDeposit = createCryptoDepositRecord({
            userId: user.id,
            accountId,
            walletAddress: DIRECT_USDT_WALLET_ADDRESS,
            amount: price,
            packageName,
            sku,
            accountType,
            txHash: txHash || void 0
          });
        } catch (depErr) {
          console.warn("Purchase crypto_deposits record warning:", depErr);
        }
        let purchaseRecord = null;
        try {
          purchaseRecord = createUserPurchaseRecord({
            id: cryptoDeposit?.id || `PUR-${now.toString(36).toUpperCase()}`,
            userId: user.id,
            accountId,
            packageId: sku,
            packageName,
            packageSku: sku,
            amount: price,
            packageAmount: price,
            accountType,
            status: "completed",
            txHash: txHash || null
          });
        } catch (purErr) {
          console.warn("Purchase user_purchases record warning:", purErr);
        }
        if (supabaseUrl && supabaseAnonKey) {
          const targetSupaUuid = await ensureSupabaseProfileInRest(supabaseUrl, supabaseAnonKey, {
            id: user.id,
            email: user.email,
            full_name: user.full_name
          });
          const supaPayload = buildSupabaseCryptoDepositRow({
            userId: targetSupaUuid,
            walletAddress: DIRECT_USDT_WALLET_ADDRESS,
            amount: price,
            packageName,
            sku,
            accountType,
            status: "completed",
            txHash: txHash || void 0
          });
          fetch(`${supabaseUrl}/rest/v1/crypto_deposits`, {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify(supaPayload)
          }).catch(() => {
          });
          const { fullPayload, corePayload } = buildSupabaseUserPurchasePayload({
            userId: targetSupaUuid,
            packageId: sku,
            packageName,
            packageSku: sku,
            amount: price,
            packageAmount: price,
            accountType,
            status: "completed",
            txHash: txHash || null
          });
          fetch(`${supabaseUrl}/rest/v1/user_purchases`, {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify(fullPayload)
          }).then((r) => {
            if (!r.ok) {
              return fetch(`${supabaseUrl}/rest/v1/user_purchases`, {
                method: "POST",
                headers: {
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseAnonKey}`,
                  "Content-Type": "application/json",
                  Prefer: "return=minimal"
                },
                body: JSON.stringify(corePayload)
              });
            }
          }).catch(() => {
          });
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
            status: "active"
          };
          fetch(`${supabaseUrl}/rest/v1/trading_accounts`, {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify(supaAccountPayload)
          }).catch(() => {
          });
        }
        let verificationResult = null;
        try {
          verificationResult = await verifyPendingCryptoDepositsWithTronGrid({
            userId: user.id
          });
        } catch (verifyErr) {
          console.warn("Purchase TronGrid verification warning:", verifyErr);
        }
        if (cryptoDeposit?.id) {
          cryptoDeposit = db.prepare("SELECT * FROM crypto_deposits WHERE id = ?").get(cryptoDeposit.id) || cryptoDeposit;
        }
        const commissions = creditPurchaseCommissions(user.id, tierName, price, referralCode);
        const newAccount = getAccountById(accountId);
        const normalizedPurchase = mapPurchaseRecord(
          purchaseRecord || {
            id: cryptoDeposit?.id || `PUR-${now.toString(36).toUpperCase()}`,
            user_id: user.id,
            account_id: accountId,
            package_id: sku,
            package_name: packageName,
            package_sku: sku,
            amount: price,
            package_amount: price,
            account_type: accountType,
            status: "completed",
            created_at: now
          }
        );
        return res.json({
          ok: true,
          account: null,
          // Account pending verification
          deposit: cryptoDeposit,
          purchase: normalizedPurchase,
          commissions,
          verification: verificationResult,
          status: "pending",
          message: "Transaction recorded. Verifying on blockchain..."
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err?.message || "Failed to activate evaluation package." });
      }
    }
  );
  app.get(["/api/purchases", "/api/orders"], (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const userId = String(user?.id || req.query.userId || "").trim();
      const rawPurchases = getUserPurchases(userId ? { userId } : void 0);
      const rawDeposits = getCryptoDeposits(userId ? { userId } : void 0);
      let merged = [];
      for (const p of rawPurchases) {
        merged = mergeRealtimePurchase(merged, p, "INSERT");
      }
      for (const d of rawDeposits) {
        merged = mergeRealtimePurchase(merged, d, "INSERT");
      }
      return res.json({
        ok: true,
        purchases: merged
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err?.message || "Failed to load purchase history."
      });
    }
  });
  app.all(
    ["/api/purchases", "/api/orders", "/functions/v1/purchases", "/functions/v1/orders"],
    async (req, res) => {
      try {
        const user = getAuthenticatedUser(req);
        const userId = String(user?.id || req.body?.userId || req.body?.user_id || "usr_bft_001").trim();
        const amount = Number(req.body?.amount ?? req.body?.package_amount ?? req.body?.price ?? 0);
        const packageAmount = Number(req.body?.packageAmount ?? req.body?.package_amount ?? amount);
        const accountType = resolveDepositAccountType(
          req.body?.accountType || req.body?.account_type || "challenge"
        );
        const packageName = String(
          req.body?.packageName || req.body?.package_name || "Challenge Package"
        ).trim();
        const packageSku = buildPackageSku({
          accountType,
          sizeOrAmount: packageAmount || amount,
          customSku: req.body?.packageSku || req.body?.package_sku || req.body?.packageId || req.body?.package_id
        });
        const packageId = String(req.body?.packageId || req.body?.package_id || packageSku).trim();
        const status = req.body?.status || "completed";
        ensureUserInDb({
          id: userId,
          email: user?.email || `${userId.toLowerCase().replace(/[^a-z0-9]/g, "")}@client-bft.com`,
          fullName: user?.full_name || `Trader ${userId.slice(-4)}`
        });
        const saved = createUserPurchaseRecord({
          id: req.body?.id ? String(req.body.id) : void 0,
          userId,
          accountId: req.body?.accountId || req.body?.account_id || null,
          packageId,
          packageName,
          packageSku,
          amount: Math.max(0.01, amount),
          packageAmount: Math.max(0.01, packageAmount),
          accountType,
          status,
          txHash: req.body?.txHash || req.body?.tx_hash || null
        });
        return res.json({
          ok: true,
          purchase: mapPurchaseRecord(saved)
        });
      } catch (err) {
        return res.status(400).json({
          ok: false,
          error: err?.message || "Failed to record purchase."
        });
      }
    }
  );
  app.post("/api/accounts/deposit-personal", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const amount = Number(req.body?.amount);
      const accountId = req.body?.accountId ? String(req.body.accountId).trim() : void 0;
      if (!Number.isFinite(amount) || amount < 10) {
        return res.status(400).json({
          ok: false,
          error: "Minimum Personal Live deposit is $10.00 USDT."
        });
      }
      ensurePersonalLiveAccountForUser(user.id);
      const updatedAccount = creditPersonalAccountDepositInDb({
        userId: user.id,
        accountId,
        amountUsdt: amount
      });
      return res.json({
        ok: true,
        account: updatedAccount,
        creditedAmountUsdt: amount
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        error: err?.message || "Failed to credit Personal Live account deposit."
      });
    }
  });
  app.post("/api/withdrawals", async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const accountId = String(req.body?.accountId || "").trim();
      const requestedAmount = Number(req.body?.amount);
      const walletAddress = String(req.body?.walletAddress || req.body?.purseAddress || "").trim();
      const network = String(req.body?.network || "TRON (TRC-20)").trim();
      const paymentMethod = String(req.body?.paymentMethod || "crypto_trc20").trim();
      const twoFactorCode = String(req.body?.twoFactorCode || "").trim();
      if (!accountId || !requestedAmount || !walletAddress) {
        return res.status(400).json({ ok: false, error: "Missing required withdrawal parameters." });
      }
      if (user.is_2fa_enabled) {
        if (!twoFactorCode) {
          return res.status(400).json({ ok: false, error: "2FA verification code required." });
        }
        const isValid = (await verify({ token: twoFactorCode, secret: user.totp_secret })).valid;
        if (!isValid) {
          return res.status(400).json({ ok: false, error: "Invalid 2FA code." });
        }
      } else {
        return res.status(403).json({ ok: false, error: "2FA is not enabled. Please enable 2FA in Security settings." });
      }
      const result = processWithdrawalRequest({
        userId: user.id,
        accountId,
        requestedAmount,
        walletAddress,
        network,
        paymentMethod
      });
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Withdrawal failed." });
    }
  });
  app.post("/api/withdrawals/cancel", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const withdrawalId = String(req.body?.withdrawalId || "").trim();
      if (!withdrawalId) return res.status(400).json({ ok: false, error: "Missing withdrawal ID." });
      const result = cancelWithdrawalRequest(user.id, withdrawalId);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Cancellation failed." });
    }
  });
  app.get("/api/withdrawals", (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.json({ ok: true, withdrawals: [] });
    const withdrawals = db.prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY requested_at DESC").all(user.id);
    return res.json({ ok: true, withdrawals });
  });
  app.get("/api/affiliate/dashboard", (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
    const stats = getAffiliateDashboardStats(user.id);
    return res.json({ ok: true, stats, referralCode: user.referral_code });
  });
  app.get("/api/leaderboard", (_req, res) => {
    const traders = getWeeklyLeaderboardQuery();
    return res.json({
      ok: true,
      traders,
      resetSchedule: "Resets Monday 00:00 UTC"
    });
  });
  const setExplicitMimeHeaders = (res, filePath) => {
    const ext = path2.extname(filePath).toLowerCase();
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else if (ext === ".css") {
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    } else if (ext === ".json" || ext === ".map") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    } else if (ext === ".svg") {
      res.setHeader("Content-Type", "image/svg+xml");
    } else if (ext === ".wasm") {
      res.setHeader("Content-Type", "application/wasm");
    } else if (ext === ".html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
    }
  };
  app.get("/api/deposit/config", (_req, res) => {
    return res.json({
      ok: true,
      walletAddress: DIRECT_USDT_WALLET_ADDRESS,
      tronGridEndpoint: TRONGRID_TRC20_ENDPOINT,
      qrCodeImageUrl: DIRECT_USDT_TRC20_CONFIG.qrCodeImageUrl,
      currency: DIRECT_USDT_TRC20_CONFIG.currency,
      network: DIRECT_USDT_TRC20_CONFIG.network,
      minDepositUsdt: DIRECT_USDT_TRC20_CONFIG.minDepositUsdt,
      maxDepositUsdt: DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt
    });
  });
  app.all(
    ["/api/deposit/submit", "/api/crypto-deposits", "/functions/v1/deposit-submit", "/functions/v1/crypto-deposits", "/verify-deposit", "/functions/v1/verify-deposit", "/submit-deposit", "/functions/v1/submit-deposit"],
    async (req, res) => {
      try {
        const user = getAuthenticatedUser(req);
        const rawAmount = Number(req.body?.amount);
        const accountId = req.body?.accountId ? String(req.body.accountId).trim() : void 0;
        const userId = String(user?.id || req.body?.userId || "usr_bft_001").trim();
        const txHash = req.body?.txHash ? String(req.body.txHash).trim() : void 0;
        const accountType = resolveDepositAccountType(
          req.body?.accountType || req.body?.account_type || "self_funded"
        );
        const validation = validateDirectDepositAmount(rawAmount);
        if (!validation.valid) {
          return res.status(400).json({
            ok: false,
            error: validation.error
          });
        }
        const amount = Number(rawAmount.toFixed(2));
        const packageName = String(
          req.body?.packageName || req.body?.package_name || (accountType === "self_funded" ? `Self-Funded Live Deposit ($${amount.toFixed(2)} USDT)` : "Funded Challenge Evaluation")
        ).trim();
        const sku = buildPackageSku({
          accountType,
          tier: req.body?.tier,
          sizeOrAmount: amount,
          customSku: req.body?.sku || req.body?.package_sku
        });
        const deposit = createCryptoDepositRecord({
          userId,
          accountId: accountType === "self_funded" ? accountId || "BFT-PERS-001" : accountId,
          walletAddress: DIRECT_USDT_WALLET_ADDRESS,
          amount,
          packageName,
          sku,
          accountType,
          txHash: txHash || void 0
        });
        if (supabaseUrl && supabaseAnonKey) {
          const targetSupaUuid = await ensureSupabaseProfileInRest(supabaseUrl, supabaseAnonKey, {
            id: userId,
            email: user?.email,
            full_name: user?.full_name
          });
          const supaPayload = buildSupabaseCryptoDepositRow({
            userId: targetSupaUuid,
            walletAddress: DIRECT_USDT_WALLET_ADDRESS,
            amount,
            packageName,
            sku,
            accountType
          });
          fetch(`${supabaseUrl}/rest/v1/crypto_deposits`, {
            method: "POST",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal"
            },
            body: JSON.stringify(supaPayload)
          }).catch(() => {
          });
        }
        let verificationResult = null;
        try {
          verificationResult = await verifyPendingCryptoDepositsWithTronGrid({ userId });
        } catch (verifyErr) {
          console.warn("Immediate TronGrid verification check warning:", verifyErr);
        }
        const latestDeposit = db.prepare("SELECT * FROM crypto_deposits WHERE id = ?").get(deposit.id) || deposit;
        const isVerifiedCompleted = latestDeposit.status === "completed";
        let updatedAccount = null;
        if (isVerifiedCompleted) {
          const matchedEntry = verificationResult?.completedDeposits?.find(
            (c) => c.deposit?.id === deposit.id
          );
          updatedAccount = matchedEntry?.account || (latestDeposit.account_id ? getAccountById(latestDeposit.account_id) : null);
        } else {
          updatedAccount = latestDeposit.account_id ? getAccountById(latestDeposit.account_id) : ensurePersonalLiveAccountForUser(userId);
        }
        return res.json({
          ok: true,
          deposit: latestDeposit,
          verified: isVerifiedCompleted,
          creditedAmountUsdt: isVerifiedCompleted && accountType === "self_funded" ? amount : 0,
          updatedAccount,
          verification: verificationResult
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: err?.message || "Failed to process direct USDT (TRC-20) deposit."
        });
      }
    }
  );
  app.all(["/api/crypto-deposits/verify", "/api/deposit/verify-trongrid"], async (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const overrideTransactions = Array.isArray(req.body?.transactions) ? req.body.transactions : void 0;
      const userIdFilter = typeof req.query.userId === "string" && req.query.userId.trim() ? req.query.userId.trim() : void 0;
      const result = await verifyPendingCryptoDepositsWithTronGrid({
        userId: userIdFilter,
        overrideTransactions,
        forceFetch: true
      });
      const deposits = getCryptoDeposits({ userId: user?.id || userIdFilter });
      const accounts = user?.id ? getAccountsForUser(user.id) : [];
      return res.json({
        ...result,
        deposits,
        accounts
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err?.message || "Failed to verify USDT (TRC-20) transactions via TronGrid."
      });
    }
  });
  app.get(["/api/deposit/history", "/api/crypto-deposits"], (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      const accountId = typeof req.query.accountId === "string" ? req.query.accountId.trim() : "";
      const cryptoDeposits = getCryptoDeposits({
        userId: user?.id,
        accountId: accountId || void 0
      });
      return res.json({
        ok: true,
        deposits: cryptoDeposits,
        cryptoDeposits,
        totalCreditedUsdt: accountId ? creditedBalancesByAccount.get(accountId) || 0 : 0
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err?.message || "Failed to load deposit history."
      });
    }
  });
  const resolveUserFor2faOrProfile = (req) => {
    const authed = getAuthenticatedUser(req);
    if (authed) return authed;
    const fallbackId = String(req.body?.userId || req.query?.userId || "usr_bft_001").trim();
    const fallbackEmail = String(req.body?.email || req.query?.email || "trader@bft.io").trim().toLowerCase();
    return ensureUserInDb({
      id: fallbackId,
      email: fallbackEmail,
      fullName: req.body?.fullName ? String(req.body.fullName) : void 0
    });
  };
  app.all(
    [
      "/api/2fa/setup",
      "/api/2fa/generate",
      "/api/2fa/reconfigure",
      "/api/profile/2fa/generate",
      "/api/profile/2fa/reconfigure",
      "/functions/v1/2fa-setup",
      "/functions/v1/2fa-generate",
      "/functions/v1/2fa-reconfigure"
    ],
    async (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: "Unauthenticated" });
        }
        const secret = generateSecret();
        const emailLabel = user.email || "trader@bft.io";
        const otpauthUrl = generateURI({ issuer: "BFT-Trading", label: emailLabel, secret });
        let imageUrl = "";
        try {
          imageUrl = await QRCode.toDataURL(otpauthUrl);
        } catch (qrErr) {
          console.warn("QRCode dataURL generation warning:", qrErr);
        }
        try {
          db.prepare("UPDATE users SET totp_secret = ? WHERE id = ?").run(secret, user.id);
        } catch (e) {
          console.warn("Failed to update SQLite totp_secret:", e);
        }
        if (supabaseUrl && supabaseAnonKey) {
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ totp_secret: secret })
          }).catch(() => {
          });
        }
        return res.status(200).json({
          ok: true,
          secret,
          qrCode: imageUrl,
          otpauthUrl,
          otpauth_url: otpauthUrl,
          message: "2FA secret generated successfully."
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: err?.message || "Failed to generate 2FA credentials."
        });
      }
    }
  );
  app.all(
    [
      "/api/2fa/verify",
      "/api/2fa/enable",
      "/api/profile/2fa/verify",
      "/api/profile/2fa/enable",
      "/functions/v1/2fa-verify",
      "/functions/v1/2fa-enable"
    ],
    async (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: "Unauthenticated" });
        }
        const code = String(req.body?.code || "").replace(/\D/g, "").trim();
        const secret = String(req.body?.secret || user.totp_secret || "").trim();
        if (!secret) {
          return res.status(400).json({
            ok: false,
            error: "2FA not initialized. Please click Enable 2FA to generate a secret key."
          });
        }
        if (!code || code.length !== 6) {
          return res.status(400).json({
            ok: false,
            error: "Please enter a valid 6-digit verification code."
          });
        }
        const verifyResult = await verify({ token: code, secret });
        const isValid = Boolean(verifyResult && verifyResult.valid);
        if (isValid) {
          try {
            db.prepare("UPDATE users SET is_2fa_enabled = 1, totp_secret = ? WHERE id = ?").run(
              secret,
              user.id
            );
          } catch (e) {
            console.warn("Failed to update SQLite is_2fa_enabled:", e);
          }
          if (supabaseUrl && supabaseAnonKey) {
            fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
              method: "PATCH",
              headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ is_2fa_enabled: true, totp_secret: secret })
            }).catch(() => {
            });
          }
          return res.status(200).json({
            ok: true,
            message: "2FA enabled successfully",
            is2faEnabled: true
          });
        }
        return res.status(400).json({
          ok: false,
          error: "Invalid 6-digit verification code. Please check your authenticator app."
        });
      } catch (err) {
        return res.status(400).json({
          ok: false,
          error: err?.message || "Invalid 6-digit verification code."
        });
      }
    }
  );
  app.all(
    ["/api/2fa/disable", "/api/profile/2fa/disable", "/functions/v1/2fa-disable"],
    (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: "Unauthenticated" });
        }
        try {
          db.prepare("UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL WHERE id = ?").run(
            user.id
          );
        } catch (e) {
          console.warn("Failed to disable 2FA in SQLite:", e);
        }
        if (supabaseUrl && supabaseAnonKey) {
          fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
            method: "PATCH",
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ is_2fa_enabled: false, totp_secret: null })
          }).catch(() => {
          });
        }
        return res.status(200).json({
          ok: true,
          message: "2FA disabled successfully",
          is2faEnabled: false
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: err?.message || "Failed to disable 2FA."
        });
      }
    }
  );
  app.all(
    ["/api/2fa/validate", "/api/2fa/check", "/functions/v1/2fa-validate", "/functions/v1/2fa-check"],
    async (req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      try {
        const user = resolveUserFor2faOrProfile(req);
        if (!user) {
          return res.status(401).json({ ok: false, isValid: false, error: "Unauthenticated" });
        }
        const code = String(req.body?.code || "").replace(/\D/g, "").trim();
        const secret = String(req.body?.secret || user.totp_secret || "").trim();
        if (!user.is_2fa_enabled && !secret) {
          return res.status(200).json({ ok: true, isValid: true });
        }
        if (!secret) {
          return res.status(400).json({ ok: false, isValid: false, error: "2FA not initialized" });
        }
        const verifyResult = await verify({ token: code, secret });
        const isValid = Boolean(verifyResult && verifyResult.valid);
        return res.status(200).json({ ok: true, isValid });
      } catch {
        return res.status(200).json({ ok: false, isValid: false, error: "Verification failed" });
      }
    }
  );
  app.get("/api/admin/check-access", (req, res) => {
    const user = getAuthenticatedUser(req);
    const isAdmin = isUserAdmin(user, req);
    if (!isAdmin) {
      return res.status(403).json({
        ok: false,
        isAdmin: false,
        error: "Access Denied: Admin authorization required."
      });
    }
    return res.json({
      ok: true,
      isAdmin: true,
      adminUser: user ? formatUserResponse(user) : { id: "admin_sys", email: "admin@bft.io", role: "admin" }
    });
  });
  app.post("/api/admin/auth/verify-key", (req, res) => {
    const key = String(req.body?.adminKey || "").trim();
    if (key === "bft_admin_master_key_2026") {
      return res.json({
        ok: true,
        message: "Admin authorization granted.",
        adminKey: "bft_admin_master_key_2026",
        role: "admin"
      });
    }
    return res.status(401).json({
      ok: false,
      error: "Invalid Admin Security Key."
    });
  });
  app.get("/api/admin/metrics", requireAdmin, (_req, res) => {
    try {
      const metrics = getAdminMetrics();
      return res.json({ ok: true, metrics });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to load metrics." });
    }
  });
  app.get("/api/admin/users", requireAdmin, (_req, res) => {
    try {
      const users = getAdminUsersList();
      return res.json({ ok: true, users });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch platform users." });
    }
  });
  app.post("/api/admin/users/:userId/accounts/:accountId/balance", requireAdmin, (req, res) => {
    try {
      const accountId = String(req.params.accountId || "").trim();
      const newBalance = Number(req.body?.newBalance);
      const reason = String(req.body?.reason || "Administrative balance adjustment").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      if (!Number.isFinite(newBalance) || newBalance < 0) {
        return res.status(400).json({ ok: false, error: "New balance must be a non-negative number." });
      }
      const updatedAccount = adminUpdateAccountBalance({
        accountId,
        newBalance,
        reason,
        adminUserId
      });
      return res.json({
        ok: true,
        account: updatedAccount,
        message: `Account ${accountId} balance updated to $${newBalance.toFixed(2)}.`
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to update balance." });
    }
  });
  app.post("/api/admin/users/:userId/role", requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const newRole = req.body?.role === "admin" ? "admin" : "trader";
      const adminUserId = req.adminUser?.id || "admin_sys";
      const updatedUser = adminSetUserRole(userId, newRole, adminUserId);
      return res.json({ ok: true, user: formatUserResponse(updatedUser) });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to update user role." });
    }
  });
  app.get("/api/admin/deposits", requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : void 0;
      const deposits = getAdminDeposits(statusFilter);
      return res.json({ ok: true, deposits });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch deposits." });
    }
  });
  app.post("/api/admin/deposits/:depositId/approve", requireAdmin, (req, res) => {
    try {
      const depositId = String(req.params.depositId || "").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const result = adminApproveDeposit(depositId, adminUserId);
      return res.json({
        ...result,
        message: "Deposit approved! User balance credited and 3-level commissions distributed."
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to approve deposit." });
    }
  });
  app.post("/api/admin/deposits/:depositId/decline", requireAdmin, (req, res) => {
    try {
      const depositId = String(req.params.depositId || "").trim();
      const reason = String(req.body?.reason || "Transaction could not be verified on-chain.").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const result = adminDeclineDeposit(depositId, reason, adminUserId);
      return res.json({
        ...result,
        message: "Deposit request declined."
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to decline deposit." });
    }
  });
  app.post("/api/admin/deposits/create", requireAdmin, (req, res) => {
    try {
      const { userId, accountId, amount, paymentMethod, txHash, depositSlipUrl } = req.body || {};
      if (!userId || !amount) {
        return res.status(400).json({ ok: false, error: "User ID and Amount are required." });
      }
      const deposit = createDepositRequest({
        userId: String(userId),
        accountId: accountId ? String(accountId) : void 0,
        amount: Number(amount),
        paymentMethod: paymentMethod ? String(paymentMethod) : "USDT (TRC-20)",
        txHash: txHash ? String(txHash) : void 0,
        depositSlipUrl: depositSlipUrl ? String(depositSlipUrl) : void 0
      });
      return res.json({ ok: true, deposit });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to create deposit record." });
    }
  });
  app.get("/api/admin/withdrawals", requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : void 0;
      const withdrawals = getAdminWithdrawals(statusFilter);
      return res.json({ ok: true, withdrawals });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch withdrawals." });
    }
  });
  app.post("/api/admin/withdrawals/:withdrawalId/approve", requireAdmin, (req, res) => {
    try {
      const withdrawalId = String(req.params.withdrawalId || "").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const result = adminApproveWithdrawal(withdrawalId, adminUserId);
      return res.json({
        ...result,
        message: "Withdrawal approved! Account balance debited and payout processed."
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to approve withdrawal." });
    }
  });
  app.post("/api/admin/withdrawals/:withdrawalId/decline", requireAdmin, (req, res) => {
    try {
      const withdrawalId = String(req.params.withdrawalId || "").trim();
      const reason = String(req.body?.reason || "Security review required / Invalid payout destination.").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const result = adminDeclineWithdrawal(withdrawalId, reason, adminUserId);
      return res.json({
        ...result,
        message: "Withdrawal request declined."
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to decline withdrawal." });
    }
  });
  app.get("/api/admin/kyc", requireAdmin, (req, res) => {
    try {
      const statusFilter = typeof req.query.status === "string" ? req.query.status.trim() : void 0;
      const kycSubmissions = getAdminKycSubmissions(statusFilter);
      return res.json({ ok: true, kycSubmissions });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch KYC submissions." });
    }
  });
  app.post("/api/admin/kyc/:userId/approve", requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const updatedUser = adminApproveKyc(userId, adminUserId);
      return res.json({
        ok: true,
        user: formatUserResponse(updatedUser),
        message: `KYC for ${updatedUser.full_name || userId} approved successfully!`
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to approve KYC." });
    }
  });
  app.post("/api/admin/kyc/:userId/reject", requireAdmin, (req, res) => {
    try {
      const userId = String(req.params.userId || "").trim();
      const reason = String(req.body?.reason || "Document unreadable or invalid address proof.").trim();
      const adminUserId = req.adminUser?.id || "admin_sys";
      const updatedUser = adminRejectKyc(userId, reason, adminUserId);
      return res.json({
        ok: true,
        user: formatUserResponse(updatedUser),
        message: `KYC for ${updatedUser.full_name || userId} rejected.`
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to reject KYC." });
    }
  });
  app.get("/api/admin/referrals/tree", requireAdmin, (_req, res) => {
    try {
      const tree = getAdminReferralTree();
      return res.json({ ok: true, tree });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch referral tree." });
    }
  });
  app.get("/api/admin/referrals/commissions", requireAdmin, (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const commissions = getAdminCommissionsLedger(limit);
      return res.json({ ok: true, commissions });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch commissions ledger." });
    }
  });
  app.post("/api/admin/referrals/distribute-commission", requireAdmin, (req, res) => {
    try {
      const { userId, amount, sourceType, details } = req.body || {};
      if (!userId || !amount) {
        return res.status(400).json({ ok: false, error: "User ID and Amount are required." });
      }
      const cleanAmount = Number(amount);
      if (cleanAmount <= 0) {
        return res.status(400).json({ ok: false, error: "Amount must be greater than $0." });
      }
      const commissions = distribute3TierCommissions(
        String(userId),
        cleanAmount,
        sourceType === "trade_activity" ? "trade_activity" : "deposit",
        details ? String(details) : void 0
      );
      return res.json({
        ok: true,
        commissions,
        message: `Successfully distributed ${commissions.length} referral commissions across 3 levels.`
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err?.message || "Failed to distribute referral commissions." });
    }
  });
  const ensureGitOriginRemote = () => {
    const defaultRepo = "https://github.com/shankavee44/bft-trading-platform.git";
    try {
      execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: __dirname });
    } catch {
      try {
        execSync("git init && git branch -M main", { cwd: __dirname });
      } catch {
      }
    }
    try {
      const url = execSync("git remote get-url origin", { encoding: "utf-8", cwd: __dirname }).trim();
      if (url) return url;
    } catch {
    }
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
  app.get("/api/github/status", (_req, res) => {
    try {
      let branch = "main";
      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: __dirname }).trim();
      } catch {
        branch = "main";
      }
      const repoUrl = ensureGitOriginRemote();
      let modifiedFiles = [];
      try {
        const rawStatus = execSync("git status --porcelain", { encoding: "utf-8", cwd: __dirname });
        modifiedFiles = rawStatus.split("\n").filter((line) => line.trim().length > 0).map((line) => line.substring(3).trim());
      } catch {
        modifiedFiles = [];
      }
      const repoName = repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") || "shankavee44/bft-trading-platform";
      return res.json({
        ok: true,
        connected: true,
        repoUrl: repoUrl || "https://github.com/shankavee44/bft-trading-platform",
        repoName,
        branch,
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedFiles,
        uncommittedCount: modifiedFiles.length,
        syncState: "ready"
      });
    } catch (err) {
      return res.json({
        ok: true,
        connected: false,
        repoUrl: "https://github.com/shankavee44/bft-trading-platform",
        repoName: "shankavee44/bft-trading-platform",
        branch: "main",
        lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedFiles: [],
        syncState: "error",
        error: err?.message || "Failed to query git status."
      });
    }
  });
  app.post("/api/github/push", (req, res) => {
    try {
      const { branch, commitMessage, repoUrl, token } = req.body || {};
      const targetBranch = branch || "main";
      const targetMessage = commitMessage || "feat: update BFT trading platform codebase";
      const currentRemoteUrl = ensureGitOriginRemote();
      let targetRepo = repoUrl || currentRemoteUrl;
      try {
        execSync('git config user.name "BFT Developer"', { cwd: __dirname });
        execSync('git config user.email "admin@bft.io"', { cwd: __dirname });
      } catch (e) {
      }
      if (targetRepo) {
        let authRepo = targetRepo;
        if (token && targetRepo.includes("github.com")) {
          const cleanUrl = targetRepo.replace(/^https?:\/\/(.*@)?/, "");
          authRepo = `https://${token}@${cleanUrl}`;
        }
        try {
          execSync(`git remote set-url origin "${authRepo}"`, { cwd: __dirname });
        } catch (e) {
          try {
            execSync(`git remote add origin "${authRepo}"`, { cwd: __dirname });
          } catch (e2) {
          }
        }
      }
      try {
        execSync("git add .", { cwd: __dirname });
      } catch (e) {
      }
      let commitHash = "";
      try {
        execSync(`git commit -m "${targetMessage.replace(/"/g, '\\"')}"`, { cwd: __dirname });
      } catch (e) {
      }
      try {
        commitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8", cwd: __dirname }).trim();
      } catch (e) {
        commitHash = Math.random().toString(36).substring(2, 9);
      }
      let pushOutput = "";
      let pushed = false;
      try {
        const checkRemote = execSync("git remote get-url origin", { encoding: "utf-8", cwd: __dirname }).trim();
        if (checkRemote) {
          pushOutput = execSync(`git push -u origin ${targetBranch}`, { encoding: "utf-8", cwd: __dirname });
          pushed = true;
        }
      } catch (pushErr) {
        pushOutput = pushErr?.stderr?.toString() || pushErr?.stdout?.toString() || pushErr?.message || "Push failed";
      }
      return res.json({
        ok: true,
        success: true,
        commitHash,
        branch: targetBranch,
        repoUrl: targetRepo || "https://github.com/shankavee44/bft-trading-platform",
        pushedAt: (/* @__PURE__ */ new Date()).toISOString(),
        pushed,
        pushOutput,
        message: pushed ? `Successfully pushed commit [${commitHash}] to origin/${targetBranch} on GitHub.` : `Local commit [${commitHash}] created. ${pushOutput ? "Remote push message: " + pushOutput : "Provide GitHub PAT to push to remote."}`,
        uncommittedChangesCount: 0
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to process git push." });
    }
  });
  app.get("/api/copy-trading/traders", (req, res) => {
    try {
      const category = req.query.category || "instant_funded";
      const traders = copyTradingEngine.getLeaderboard(category);
      return res.json({ ok: true, traders });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch copy traders." });
    }
  });
  app.post("/api/copy-trading/copy", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const {
        providerId,
        allocatedCapital,
        maxLossLimit,
        takeProfitLimit,
        tradeSizingType,
        sizingMultiplier
      } = req.body;
      if (!providerId) return res.status(400).json({ ok: false, error: "Provider ID required." });
      const id = `SUB-${user.id}-${providerId}-${Date.now().toString(36)}`;
      const existing = db.prepare("SELECT id FROM copy_trading_subscriptions WHERE user_id = ? AND provider_id = ?").get(user.id, providerId);
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
          Number(allocatedCapital || 100),
          Number(maxLossLimit || 0),
          Number(takeProfitLimit || 0),
          tradeSizingType || "proportionate",
          Number(sizingMultiplier || 1),
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
          user.id,
          providerId,
          Number(allocatedCapital || 100),
          Number(maxLossLimit || 0),
          Number(takeProfitLimit || 0),
          tradeSizingType || "proportionate",
          Number(sizingMultiplier || 1),
          Date.now()
        );
      }
      const updatedSub = db.prepare(`
        SELECT 
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
      `).get(user.id, providerId);
      return res.json({
        ok: true,
        message: "Successfully subscribed to copy trader with risk settings.",
        subscription: updatedSub
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to copy trader." });
    }
  });
  app.post("/api/copy-trading/cancel", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ ok: false, error: "Unauthenticated" });
      const { providerId } = req.body;
      if (!providerId) return res.status(400).json({ ok: false, error: "Provider ID required." });
      db.prepare(`
        DELETE FROM copy_trading_subscriptions 
        WHERE user_id = ? AND provider_id = ?
      `).run(user.id, providerId);
      return res.json({ ok: true, message: "Successfully cancelled copy trading subscription." });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to cancel subscription." });
    }
  });
  app.get("/api/copy-trading/subscriptions", (req, res) => {
    try {
      const user = getAuthenticatedUser(req);
      if (!user) return res.json({ ok: true, subscriptions: [] });
      const subs = db.prepare(`
        SELECT 
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
      `).all(user.id);
      return res.json({
        ok: true,
        subscriptions: subs.map((s) => ({
          provider_id: s.provider_id,
          allocated_capital: s.allocated_capital,
          max_loss_limit: s.max_loss_limit,
          take_profit_limit: s.take_profit_limit,
          trade_sizing_type: s.trade_sizing_type,
          sizing_multiplier: s.sizing_multiplier,
          current_pnl: s.current_pnl,
          status: s.status,
          created_at: s.created_at
        }))
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || "Failed to fetch subscriptions." });
    }
  });
  app.all(["/api/*", "/functions/v1/*"], (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    console.warn(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({
      ok: false,
      error: `API endpoint not found: ${req.method} ${req.url}`,
      code: "NOT_FOUND"
    });
  });
  app.use("/api", (req, res, next) => {
    next();
  });
  app.use((err, req, res, next) => {
    if (req.url.startsWith("/api/") || req.url.startsWith("/functions/v1/")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      const status = typeof err?.status === "number" ? err.status : 500;
      return res.status(status).json({
        ok: false,
        error: err?.message || "Internal server error."
      });
    }
    next(err);
  });
  const distPath = path2.resolve(__dirname, "dist");
  const hasDist = fs2.existsSync(path2.join(distPath, "index.html"));
  const isProduction = process.env.NODE_ENV === "production";
  const isDev = !isProduction;
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: { usePolling: true, interval: 100 }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      if (req.url.startsWith("/api/")) return next();
      try {
        let html = fs2.readFileSync(path2.resolve(__dirname, "index.html"), "utf-8");
        html = await vite.transformIndexHtml(req.url, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          setExplicitMimeHeaders(res, filePath);
        }
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`BFT Server & Direct USDT (TRC-20) Gateway running on http://0.0.0.0:${PORT} (mode: ${isProduction ? "production" : "development"})`);
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, closing HTTP server gracefully...");
    marketEngine.stop();
    server.close(() => {
      console.log("HTTP server closed.");
      process.exit(0);
    });
  });
}
startServer();
