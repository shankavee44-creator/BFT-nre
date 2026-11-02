/**
 * Binary Funded Trader (BFT) - Direct USDT TRC-20 Deposit System Configuration
 * Official Depository Wallet and Parameters for Direct Blockchain Transfers
 */
export type CryptoDepositAccountType = 'challenge' | 'self_funded';

export interface CryptoDepositRecordInput {
  userId?: string;
  accountId?: string | null;
  walletAddress?: string;
  amount: number;
  packageName: string;
  sku: string;
  accountType: CryptoDepositAccountType;
  txHash?: string;
  status?: 'pending' | 'completed' | 'approved' | 'declined';
}

export interface TronGridTrc20TokenInfo {
  symbol?: string;
  address?: string;
  decimals?: number;
  name?: string;
}

export interface TronGridTrc20Transaction {
  transaction_id: string;
  token_info?: TronGridTrc20TokenInfo;
  block_timestamp?: number;
  from?: string;
  to: string;
  type?: string;
  value: string | number;
  amount?: number;
}

export interface PendingCryptoDepositRow {
  id: string;
  user_id?: string;
  account_id?: string | null;
  wallet_address?: string;
  amount: number;
  package_name?: string;
  sku?: string;
  package_sku?: string;
  account_type?: CryptoDepositAccountType | string;
  tx_hash?: string | null;
  status: string;
  created_at?: number | string;
}

export const TRONGRID_API_KEY = '79784292-381c-42f7-b834-0f6d41b7b2e5';
export const OKX_USDT_TRC20_WALLET = 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp';
export const TRONGRID_TRC20_ENDPOINT =
  'https://api.trongrid.io/v1/accounts/TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp/transactions/trc20';

export const DIRECT_USDT_TRC20_CONFIG = {
  /**
   * Primary settlement currency for instantaneous low-fee trader deposits
   */
  currency: 'USDT' as const,

  /**
   * Primary network for high speed & lowest network fees
   */
  network: 'TRON (TRC-20)' as const,
  networkShort: 'TRC-20' as const,
  networkLabel: 'TRC-20 (TRON Network)',

  /**
   * Official BFT Company Static USDT TRC-20 Depository Wallet Address (OKX)
   */
  walletAddress: OKX_USDT_TRC20_WALLET,

  /**
   * Official TronGrid API Key and TRC-20 Transactions Endpoint
   */
  tronGridApiKey: TRONGRID_API_KEY,
  tronGridTrc20Endpoint: TRONGRID_TRC20_ENDPOINT,
  usdtContractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',

  /**
   * Official QR Code image asset for TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp
   */
  qrCodeImageUrl: '/assets/aistudio/WhatsApp_Image_2026-11-01_at_6.27.58_PM_1ba5a5ce.jpeg',

  /**
   * Minimum and maximum USDT deposit constraints
   */
  minDepositUsdt: 10,
  maxDepositUsdt: 100000,

  /**
   * TronScan Explorer transaction verification template
   */
  explorerTxUrl: 'https://tronscan.org/#/transaction/',
  explorerAddressUrl: 'https://tronscan.org/#/address/',
} as const;

export type DirectDepositConfig = typeof DIRECT_USDT_TRC20_CONFIG;

export function isValidTrc20Address(address: string): boolean {
  return (
    typeof address === 'string' &&
    address.startsWith('T') &&
    address.length === 34 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(address)
  );
}

export function resolveDepositAccountType(
  tierOrCategory?: string | null
): CryptoDepositAccountType {
  const normalized = String(tierOrCategory || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'self_funded' ||
    normalized === 'personal' ||
    normalized === 'personal_live' ||
    normalized === 'self'
  ) {
    return 'self_funded';
  }
  return 'challenge';
}

export function buildPackageSku(params: {
  accountType: CryptoDepositAccountType;
  tier?: string;
  sizeOrAmount: number;
  customSku?: string;
}): string {
  if (params.customSku && params.customSku.trim().length > 0) {
    return params.customSku.trim().toUpperCase();
  }
  const cleanAmount = Math.max(0, Math.round(Number(params.sizeOrAmount) || 0));
  if (params.accountType === 'self_funded') {
    return `BFT-SELF-${cleanAmount}`;
  }
  const tierNorm = String(params.tier || 'two-step').toLowerCase();
  const tierCode =
    tierNorm === 'one-step'
      ? '1S'
      : tierNorm === 'instant'
      ? 'INF'
      : '2S';
  const sizeLabel = cleanAmount >= 1000 ? `${cleanAmount / 1000}K` : String(cleanAmount);
  return `BFT-${tierCode}-${sizeLabel}`;
}

export function buildCryptoDepositPayload(input: CryptoDepositRecordInput) {
  const exactAmount = Number(Number(input.amount || 0).toFixed(2));
  const accountType: CryptoDepositAccountType =
    input.accountType === 'self_funded' ? 'self_funded' : 'challenge';
  const packageName =
    String(input.packageName || '').trim() ||
    (accountType === 'self_funded'
      ? `Self-Funded Live Deposit ($${exactAmount.toFixed(2)} USDT)`
      : 'Funded Challenge Package');
  const sku =
    String(input.sku || '').trim().toUpperCase() ||
    buildPackageSku({ accountType, sizeOrAmount: exactAmount });

  return {
    user_id: input.userId || 'usr_bft_001',
    account_id: input.accountId || null,
    wallet_address: input.walletAddress || DIRECT_USDT_TRC20_CONFIG.walletAddress,
    amount: exactAmount,
    package_name: packageName,
    sku,
    package_sku: sku,
    account_type: accountType,
    currency: 'USDT',
    network: 'TRC-20',
    tx_hash: input.txHash ? String(input.txHash).trim() : null,
    status: (input.status || 'pending') as 'pending' | 'completed' | 'approved' | 'declined',
  };
}

export function buildSupabaseCryptoDepositRow(input: CryptoDepositRecordInput) {
  const payload = buildCryptoDepositPayload(input);
  return {
    ...(input.userId ? { user_id: input.userId } : {}),
    wallet_address: payload.wallet_address,
    amount: payload.amount,
    package_name: payload.package_name,
    package_sku: payload.package_sku,
    account_type: payload.account_type,
    status: payload.status,
    ...(payload.tx_hash ? { tx_hash: payload.tx_hash } : {}),
  };
}

export function buildSupabaseCryptoDepositCoreRow(input: CryptoDepositRecordInput) {
  const payload = buildCryptoDepositPayload(input);
  return {
    ...(input.userId ? { user_id: input.userId } : {}),
    wallet_address: payload.wallet_address,
    amount: payload.amount,
    package_name: payload.package_name,
    package_sku: payload.package_sku,
    account_type: payload.account_type,
    status: payload.status,
  };
}


export interface UserPurchaseRecordInput {
  id?: string;
  userId: string;
  packageId?: string;
  packageName: string;
  packageSku?: string;
  amount: number;
  packageAmount?: number;
  accountType?: CryptoDepositAccountType | string;
  status?: 'pending' | 'completed' | 'approved' | 'declined' | string;
  txHash?: string | null;
  accountId?: string | null;
}

export interface NormalizedPurchaseRecord {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  package_sku: string;
  amount: number;
  package_amount: number;
  account_type: CryptoDepositAccountType;
  status: 'pending' | 'completed' | 'approved' | 'declined';
  tx_hash: string | null;
  account_id: string | null;
  created_at: string;
}

/**
 * Pure helper: builds both the full Supabase `user_purchases` insert payload
 * (including `user_id`, `package_id`, `amount`, `status`, `package_name`, `package_sku`, `package_amount`)
 * and the minimal fallback payload (`user_id`, `package_name`, `package_amount`) in case optional columns
 * have not yet been migrated on the remote database.
 */
export function buildSupabaseUserPurchasePayload(input: UserPurchaseRecordInput) {
  const cleanAmount = Number(Math.max(0.01, Number(input.amount || input.packageAmount || 0)).toFixed(2));
  const cleanPackageAmount = Number(
    Math.max(0.01, Number(input.packageAmount ?? input.amount ?? 0)).toFixed(2)
  );
  const accountType: CryptoDepositAccountType =
    resolveDepositAccountType(input.accountType);
  const packageName =
    String(input.packageName || '').trim() ||
    (accountType === 'self_funded'
      ? `Self-Funded Live Deposit ($${cleanAmount.toFixed(2)} USDT)`
      : 'Funded Challenge Package');
  const packageSku =
    String(input.packageSku || input.packageId || '').trim().toUpperCase() ||
    buildPackageSku({ accountType, sizeOrAmount: cleanPackageAmount });
  const packageId = String(input.packageId || packageSku).trim();
  const rawStatus = String(input.status || 'completed').trim().toLowerCase();
  const status: 'pending' | 'completed' | 'approved' | 'declined' =
    rawStatus === 'pending'
      ? 'pending'
      : rawStatus === 'approved'
      ? 'approved'
      : rawStatus === 'declined' || rawStatus === 'rejected'
      ? 'declined'
      : 'completed';

  return {
    fullPayload: {
      user_id: String(input.userId || '').trim(),
      package_id: packageId,
      package_name: packageName,
      package_sku: packageSku,
      amount: cleanAmount,
      package_amount: cleanPackageAmount,
      account_type: accountType,
      status,
      ...(input.txHash ? { tx_hash: String(input.txHash).trim() } : {}),
    },
    corePayload: {
      user_id: String(input.userId || '').trim(),
      package_name: packageName,
      package_amount: cleanAmount,
    },
  };
}

/**
 * Pure helper: normalizes a raw row from `user_purchases`, `crypto_deposits`, or `/api/purchases`
 * into a unified `NormalizedPurchaseRecord` for real-time UI rendering.
 */
export function mapPurchaseRecord(row: Record<string, any> | null | undefined): NormalizedPurchaseRecord {
  const r = row && typeof row === 'object' ? row : {};
  const rawAmount = Number(r.amount ?? r.package_amount ?? r.price ?? 0);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Number(rawAmount.toFixed(2)) : 0;
  const rawPkgAmount = Number(r.package_amount ?? r.size ?? r.amount ?? 0);
  const packageAmount =
    Number.isFinite(rawPkgAmount) && rawPkgAmount > 0 ? Number(rawPkgAmount.toFixed(2)) : amount;

  const accountType: CryptoDepositAccountType = resolveDepositAccountType(
    r.account_type ?? r.accountType ?? (r.is_self_funded ? 'self_funded' : 'challenge')
  );

  const packageName =
    String(r.package_name ?? r.packageName ?? r.tier_name ?? '').trim() ||
    (accountType === 'self_funded'
      ? `Self-Funded Live Deposit ($${amount.toFixed(2)} USDT)`
      : 'Challenge Package');

  let inferredSku = String(r.package_sku ?? r.sku ?? r.package_id ?? r.packageId ?? '').trim().toUpperCase();
  if (!inferredSku) {
    const parsed = parseChallengePackageFromDeposit({
      package_name: packageName,
      amount: packageAmount || amount,
    });
    inferredSku =
      accountType === 'self_funded'
        ? buildPackageSku({ accountType: 'self_funded', sizeOrAmount: amount || packageAmount })
        : buildPackageSku({ accountType: 'challenge', tier: parsed.tier, sizeOrAmount: parsed.size });
  }

  const packageId = String(r.package_id ?? r.packageId ?? inferredSku).trim();
  const rawStatus = String(r.status || 'completed').trim().toLowerCase();
  const status: 'pending' | 'completed' | 'approved' | 'declined' =
    rawStatus === 'pending'
      ? 'pending'
      : rawStatus === 'approved'
      ? 'approved'
      : rawStatus === 'declined' || rawStatus === 'rejected'
      ? 'declined'
      : 'completed';

  let createdIso = new Date().toISOString();
  if (typeof r.created_at === 'number' && Number.isFinite(r.created_at)) {
    createdIso = new Date(r.created_at).toISOString();
  } else if (typeof r.created_at === 'string' && r.created_at.trim()) {
    const parsedTs = Date.parse(r.created_at);
    createdIso = Number.isFinite(parsedTs) ? new Date(parsedTs).toISOString() : r.created_at;
  } else if (typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)) {
    createdIso = new Date(r.createdAt).toISOString();
  }

  return {
    id: String(r.id || `PUR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    user_id: String(r.user_id ?? r.userId ?? 'usr_bft_001'),
    package_id: packageId,
    package_name: packageName,
    package_sku: inferredSku,
    amount: amount || packageAmount,
    package_amount: packageAmount || amount,
    account_type: accountType,
    status,
    tx_hash: r.tx_hash || r.txHash ? String(r.tx_hash || r.txHash) : null,
    account_id: r.account_id || r.accountId ? String(r.account_id || r.accountId) : null,
    created_at: createdIso,
  };
}

/**
 * Pure helper: merges a purchase row (`INSERT`, `UPDATE`, `DELETE`) into an existing list of purchases,
 * deduplicating by `id` (or matching `package_sku` + `amount` within 10 seconds for optimistic records)
 * and sorting newest first.
 */
export function mergeRealtimePurchase(
  existing: NormalizedPurchaseRecord[],
  incomingRow: Record<string, any> | null | undefined,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string = 'INSERT',
  oldRow?: Record<string, any> | null
): NormalizedPurchaseRecord[] {
  const list = Array.isArray(existing) ? existing.map(mapPurchaseRecord) : [];

  if (eventType === 'DELETE') {
    const targetId = String(oldRow?.id ?? incomingRow?.id ?? '');
    if (!targetId) return list;
    return list.filter((item) => String(item.id) !== targetId);
  }

  if (!incomingRow || typeof incomingRow !== 'object') return list;
  const mapped = mapPurchaseRecord(incomingRow);

  const exactIdx = list.findIndex((item) => String(item.id) === String(mapped.id));
  if (exactIdx >= 0) {
    const updated = [...list];
    updated[exactIdx] = {
      ...updated[exactIdx],
      ...mapped,
    };
    return updated.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  // Deduplicate optimistic or cross-table (user_purchases vs crypto_deposits) records for the same purchase within 15s
  const mappedTs = Date.parse(mapped.created_at) || Date.now();
  const nearDuplicateIdx = list.findIndex((item) => {
    const itemTs = Date.parse(item.created_at) || 0;
    const withinWindow = Math.abs(mappedTs - itemTs) <= 15000;
    const sameSkuOrName =
      item.package_sku === mapped.package_sku || item.package_name === mapped.package_name;
    const sameAmount = Math.abs(item.amount - mapped.amount) < 0.01;
    return withinWindow && sameSkuOrName && sameAmount;
  });

  if (nearDuplicateIdx >= 0) {
    const updated = [...list];
    const curr = updated[nearDuplicateIdx];
    updated[nearDuplicateIdx] = {
      ...curr,
      ...mapped,
      status:
        curr.status === 'completed' || mapped.status === 'completed'
          ? 'completed'
          : mapped.status,
    };
    return updated.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  return [mapped, ...list].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function validateDirectDepositAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return { valid: false, error: 'Please enter a valid numeric deposit amount.' };
  }
  if (amount < DIRECT_USDT_TRC20_CONFIG.minDepositUsdt) {
    return {
      valid: false,
      error: `Minimum deposit is $${DIRECT_USDT_TRC20_CONFIG.minDepositUsdt} USDT (TRC-20).`,
    };
  }
  if (amount > DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt) {
    return {
      valid: false,
      error: `Maximum single deposit is $${DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt.toLocaleString()} USDT (TRC-20).`,
    };
  }
  return { valid: true };
}

/**
 * Parses a TronGrid TRC-20 transfer's raw token value into a decimal USDT amount.
 * Standard TRON USDT (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) uses 6 decimals.
 */
export function parseTrc20TransferAmount(tx: TronGridTrc20Transaction): number {
  if (typeof tx.amount === 'number' && Number.isFinite(tx.amount) && tx.amount > 0) {
    return Number(tx.amount.toFixed(6));
  }
  const decimals =
    typeof tx.token_info?.decimals === 'number' && tx.token_info.decimals >= 0
      ? tx.token_info.decimals
      : 6;
  const rawStr = String(tx.value ?? '0').trim();
  if (!rawStr) return 0;

  // If the string already contains a decimal point, parse as float directly
  if (rawStr.includes('.')) {
    const parsedFloat = Number(rawStr);
    return Number.isFinite(parsedFloat) ? Number(parsedFloat.toFixed(6)) : 0;
  }

  const rawNum = Number(rawStr);
  if (!Number.isFinite(rawNum) || rawNum <= 0) return 0;

  const divisor = Math.pow(10, decimals);
  return Number((rawNum / divisor).toFixed(6));
}

/**
 * Checks if a TronGrid TRC-20 transaction is a valid incoming USDT transfer to our target wallet.
 */
export function isIncomingUsdtTrc20Transfer(
  tx: TronGridTrc20Transaction,
  targetWallet: string = DIRECT_USDT_TRC20_CONFIG.walletAddress
): boolean {
  if (!tx || typeof tx !== 'object') return false;
  const expectedWallet = String(targetWallet || DIRECT_USDT_TRC20_CONFIG.walletAddress).trim();
  const toWallet = String(tx.to || '').trim();
  if (!toWallet || toWallet !== expectedWallet) {
    return false;
  }

  // If token_info is present, verify symbol is USDT (or contract address matches TRON USDT)
  if (tx.token_info?.symbol) {
    const symbol = String(tx.token_info.symbol).trim().toUpperCase();
    if (symbol !== 'USDT') return false;
  }

  const amount = parseTrc20TransferAmount(tx);
  return amount > 0;
}

/**
 * Matches a pending crypto_deposits row against recent TronGrid TRC-20 transfers.
 * Matches target wallet (TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp) and exact transaction amount
 * (within 0.01 USDT tolerance for floating-point rounding), ensuring each blockchain
 * transaction_id is only claimed once.
 */
export function matchPendingDepositToTronGridTx(
  deposit: PendingCryptoDepositRow,
  transactions: TronGridTrc20Transaction[],
  claimedTxIds: Set<string> = new Set()
): TronGridTrc20Transaction | null {
  if (!deposit || String(deposit.status).toLowerCase() !== 'pending') {
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

  const userTxHash = String(deposit.tx_hash || '').trim();
  const hasExplicitBlockchainHash =
    userTxHash.length >= 16 && !userTxHash.toLowerCase().startsWith('trc20_');

  // 1. If the deposit has an explicit blockchain tx_hash, check for an exact hash + wallet + amount match first
  if (hasExplicitBlockchainHash) {
    for (const tx of transactions) {
      const txId = String(tx.transaction_id || '').trim();
      if (!txId || claimedTxIds.has(txId)) continue;
      if (txId.toLowerCase() !== userTxHash.toLowerCase()) continue;
      if (!isIncomingUsdtTrc20Transfer(tx, targetWallet)) continue;

      const txAmount = parseTrc20TransferAmount(tx);
      if (Math.abs(txAmount - expectedAmount) <= 0.01) {
        return tx;
      }
    }
  }

  // 2. Match by target wallet + transaction amount on unclaimed TRC-20 transfers
  for (const tx of transactions) {
    const txId = String(tx.transaction_id || '').trim();
    if (!txId || claimedTxIds.has(txId)) continue;
    if (!isIncomingUsdtTrc20Transfer(tx, targetWallet)) continue;

    const txAmount = parseTrc20TransferAmount(tx);
    if (Math.abs(txAmount - expectedAmount) <= 0.01) {
      return tx;
    }
  }

  return null;
}

/**
 * Parses challenge package parameters (tier, size, tierName) from a crypto_deposits row's
 * SKU (e.g. BFT-1S-10K, BFT-2S-25K, BFT-INF-50K) and package_name.
 */
export function parseChallengePackageFromDeposit(deposit: {
  sku?: string | null;
  package_sku?: string | null;
  package_name?: string | null;
  amount?: number;
}): {
  tier: 'one-step' | 'two-step' | 'instant';
  size: number;
  tierName: string;
} {
  const rawSku = String(deposit.package_sku || deposit.sku || '')
    .trim()
    .toUpperCase();
  const rawName = String(deposit.package_name || '').trim();

  let tier: 'one-step' | 'two-step' | 'instant' = 'two-step';
  if (
    rawSku.includes('-1S-') ||
    rawSku.includes('1STEP') ||
    /one[-\s]?step|1[-\s]?step/i.test(rawName)
  ) {
    tier = 'one-step';
  } else if (
    rawSku.includes('-INF-') ||
    rawSku.includes('INSTANT') ||
    /instant/i.test(rawName)
  ) {
    tier = 'instant';
  } else if (
    rawSku.includes('-2S-') ||
    rawSku.includes('2STEP') ||
    /two[-\s]?step|2[-\s]?step/i.test(rawName)
  ) {
    tier = 'two-step';
  }

  let size = 0;
  // Extract size from SKU e.g. BFT-1S-10K -> 10000, BFT-2S-25K -> 25000, BFT-INF-100K -> 100000
  const skuKMatch = rawSku.match(/-(\d+(?:\.\d+)?)K\b/i);
  if (skuKMatch) {
    size = Math.round(Number(skuKMatch[1]) * 1000);
  } else {
    const skuNumMatch = rawSku.match(/-(\d{4,7})\b/);
    if (skuNumMatch) {
      size = Math.round(Number(skuNumMatch[1]));
    }
  }

  // Fallback: extract size from package_name e.g. "One-Step Challenge ($10,000)" or "$25,000"
  if (!size && rawName) {
    const dollarMatch = rawName.match(/\$\s*([\d,]+(?:\.\d+)?)/);
    if (dollarMatch) {
      const parsed = Number(dollarMatch[1].replace(/,/g, ''));
      if (parsed >= 1000) {
        size = Math.round(parsed);
      }
    }
    if (!size) {
      const kMatch = rawName.match(/\b(\d+)\s*K\b/i);
      if (kMatch) {
        size = Math.round(Number(kMatch[1]) * 1000);
      }
    }
  }

  // Fallback: infer standard evaluation size from deposit price if size still 0
  if (!size) {
    const amt = Number(deposit.amount || 0);
    if (amt >= 400) size = 100000;
    else if (amt >= 200) size = 50000;
    else if (amt >= 120) size = 25000;
    else if (amt >= 50) size = 10000;
    else size = 5000;
  }

  const defaultTierLabel =
    tier === 'one-step'
      ? '1-Step Blitz'
      : tier === 'instant'
      ? 'Instant Funding'
      : '2-Step Pro';
  const tierName = rawName || `${defaultTierLabel} ($${size.toLocaleString()})`;

  return { tier, size, tierName };
}

/**
 * Fetches recent TRC-20 token transfers to the OKX USDT TRC-20 wallet from TronGrid API.
 */
export async function fetchTronGridTrc20Transfers(options?: {
  walletAddress?: string;
  apiKey?: string;
  limit?: number;
  onlyConfirmed?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{
  ok: boolean;
  transactions: TronGridTrc20Transaction[];
  endpoint: string;
  error?: string;
}> {
  const walletAddress =
    options?.walletAddress?.trim() || DIRECT_USDT_TRC20_CONFIG.walletAddress;
  const apiKey = options?.apiKey?.trim() || DIRECT_USDT_TRC20_CONFIG.tronGridApiKey;
  const limit = options?.limit ?? 50;
  const onlyConfirmed = options?.onlyConfirmed ?? true;
  const fetchFn = options?.fetchImpl || globalThis.fetch;

  const baseUrl = `https://api.trongrid.io/v1/accounts/${encodeURIComponent(
    walletAddress
  )}/transactions/trc20`;
  const query = new URLSearchParams({
    limit: String(limit),
    only_confirmed: String(onlyConfirmed),
  });
  const endpoint = `${baseUrl}?${query.toString()}`;

  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        'TRON-PRO-API-KEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        transactions: [],
        endpoint: baseUrl,
        error: `TronGrid API responded with status ${response.status}`,
      };
    }

    let payload: any = null;
    if (typeof (response as any).text === 'function') {
      const rawText = await response.text();
      payload = rawText && rawText.trim() ? JSON.parse(rawText.trim()) : { data: [] };
    } else if (typeof (response as any).json === 'function') {
      payload = await response.json();
    }
    const transactions: TronGridTrc20Transaction[] = Array.isArray(payload?.data)
      ? payload.data
      : [];

    return {
      ok: true,
      transactions,
      endpoint: baseUrl,
    };
  } catch (err: any) {
    return {
      ok: false,
      transactions: [],
      endpoint: baseUrl,
      error: err?.message || 'Failed to fetch TRC-20 transactions from TronGrid API',
    };
  }
}

export interface CryptoDepositCreditEvaluation {
  shouldCreditSelfCapital: boolean;
  accountType: CryptoDepositAccountType;
  depositAmount: number;
  previousSelfCapitalBalance: number;
  creditedSelfCapitalAmount: number;
  newSelfCapitalBalance: number;
  profileUpdatePayload: {
    self_capital_balance: number;
    self_balance: number;
  } | null;
}

/**
 * Pure helper: Evaluates whether a verified crypto deposit should credit the user's
 * `self_capital_balance` / `self_balance` in the `profiles` table.
 * Strictly credits ONLY when `accountType === 'self_funded'`, ensuring package purchases
 * (`accountType === 'challenge'`) NEVER add funds to the self-capital balance.
 */
export function computeCryptoDepositVerificationCredit(params: {
  amount: number;
  accountType?: CryptoDepositAccountType | string | null;
  currentSelfCapitalBalance?: number | null;
  currentSelfBalance?: number | null;
}): CryptoDepositCreditEvaluation {
  const resolvedType = resolveDepositAccountType(params.accountType);
  const cleanDepositAmount = Number(Math.max(0, Number(params.amount || 0)).toFixed(2));
  const rawPrev =
    params.currentSelfCapitalBalance !== undefined && params.currentSelfCapitalBalance !== null
      ? Number(params.currentSelfCapitalBalance)
      : params.currentSelfBalance !== undefined && params.currentSelfBalance !== null
      ? Number(params.currentSelfBalance)
      : 0;
  const previousSelfCapitalBalance = Number(
    (Number.isFinite(rawPrev) ? Math.max(0, rawPrev) : 0).toFixed(2)
  );

  if (resolvedType === 'self_funded' && cleanDepositAmount > 0) {
    const newSelfCapitalBalance = Number(
      (previousSelfCapitalBalance + cleanDepositAmount).toFixed(2)
    );
    return {
      shouldCreditSelfCapital: true,
      accountType: 'self_funded',
      depositAmount: cleanDepositAmount,
      previousSelfCapitalBalance,
      creditedSelfCapitalAmount: cleanDepositAmount,
      newSelfCapitalBalance,
      profileUpdatePayload: {
        self_capital_balance: newSelfCapitalBalance,
        self_balance: newSelfCapitalBalance,
      },
    };
  }

  return {
    shouldCreditSelfCapital: false,
    accountType: 'challenge',
    depositAmount: cleanDepositAmount,
    previousSelfCapitalBalance,
    creditedSelfCapitalAmount: 0,
    newSelfCapitalBalance: previousSelfCapitalBalance,
    profileUpdatePayload: null,
  };
}

