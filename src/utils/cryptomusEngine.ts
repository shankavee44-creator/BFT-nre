export type CryptomusInvoiceStatus =
  | 'pending'
  | 'confirming'
  | 'completed'
  | 'expired'
  | 'failed';

export interface CryptomusDepositInvoice {
  uuid: string;
  orderId: string;
  accountId: string;
  userId: string;
  amount: number;
  currency: 'USDT';
  network: 'tron';
  networkLabel: 'TRC-20 (TRON Network)';
  address: string;
  paymentUrl: string;
  qrCodeUri: string;
  status: CryptomusInvoiceStatus;
  txHash?: string;
  createdAt: number;
  expiresAt: number;
  completedAt?: number;
  isLiveApi: boolean;
  errorMessage?: string;
  merchantId?: string;
}

export interface CryptomusWebhookPayload {
  type?: 'payment';
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount?: string;
  payment_amount_usd?: string;
  merchant_amount?: string;
  commission?: string;
  is_final: boolean;
  status: 'paid' | 'paid_over' | 'wrong_amount' | 'process' | 'confirm_check' | 'cancel' | 'fail';
  from?: string;
  wallet_address_uuid?: string;
  network: string;
  currency: string;
  payer_currency?: string;
  txid?: string;
  sign: string;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Pure UTF-8 to Base64 encoder that works identically in Node.js and browser runtimes.
 */
export function encodeBase64(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Pure RFC 1321 MD5 implementation (zero external dependencies, runs in Node & browser)
 * for generating and verifying official Cryptomus API MD5(base64(json) + apiKey) signatures.
 */
export function md5Hex(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const bitLen = utf8.length * 8;

  const padLen = ((56 - ((utf8.length + 1) % 64)) + 64) % 64;
  const totalLen = utf8.length + 1 + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(utf8);
  buf[utf8.length] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) {
    K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
  }

  const leftRotate = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  for (let offset = 0; offset < totalLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + leftRotate(F, s[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);

  return Array.from(out)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Computes the official Cryptomus API signature:
 * sign = md5(base64_encode(json_encode(data_without_sign)) + apiKey)
 */
export function computeCryptomusSign(
  payload: Record<string, unknown>,
  apiKey: string
): string {
  const cloned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k !== 'sign' && v !== undefined) {
      cloned[k] = v;
    }
  }
  const jsonStr = JSON.stringify(cloned);
  const base64Payload = encodeBase64(jsonStr);
  return md5Hex(base64Payload + apiKey);
}

/**
 * Verifies the `sign` attribute on an incoming Cryptomus webhook payload.
 */
export function verifyCryptomusWebhookSignature(
  payload: Record<string, unknown>,
  apiKey: string
): boolean {
  const providedSign = typeof payload.sign === 'string' ? payload.sign.trim().toLowerCase() : '';
  if (!providedSign) return false;
  const expectedSign = computeCryptomusSign(payload, apiKey).toLowerCase();
  return providedSign === expectedSign;
}

/**
 * Validates a user's requested USDT (TRC-20) deposit amount.
 */
export function validateDepositAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (typeof amount !== 'number' || Number.isNaN(amount) || !Number.isFinite(amount)) {
    return { valid: false, error: 'Please enter a valid numeric USDT deposit amount.' };
  }
  if (amount < 10) {
    return {
      valid: false,
      error: 'Minimum Cryptomus USDT (TRC-20) deposit amount is $10.00 USDT.',
    };
  }
  if (amount > 100000) {
    return {
      valid: false,
      error: 'Maximum single transaction limit is $100,000.00 USDT.',
    };
  }
  return { valid: true };
}

/**
 * Generates a unique, valid-format TRON (TRC-20) deposit address ('T' + 33 Base58 chars)
 * seeded from the orderId so each transaction gets its own dedicated deposit address.
 */
export function generateUniqueTrc20Address(seed: string): string {
  const hash1 = md5Hex(`tron:trc20:${seed}:a`);
  const hash2 = md5Hex(`tron:trc20:${seed}:b`);
  const combined = hash1 + hash2;
  let addr = 'T';
  for (let i = 0; i < 33; i++) {
    const byteVal = parseInt(combined.slice((i * 2) % 60, ((i * 2) % 60) + 2), 16);
    addr += BASE58_ALPHABET[byteVal % BASE58_ALPHABET.length];
  }
  return addr;
}

/**
 * Creates a new Cryptomus USDT (TRC-20) payment invoice object.
 */
export function createCryptomusInvoiceObject(params: {
  amount: number;
  accountId: string;
  userId?: string;
  orderId?: string;
  uuid?: string;
  address?: string;
  paymentUrl?: string;
  isLiveApi?: boolean;
  merchantId?: string;
  nowMs?: number;
}): CryptomusDepositInvoice {
  const now = params.nowMs ?? Date.now();
  const normalizedAmount = Number(params.amount.toFixed(2));
  const orderId =
    params.orderId ||
    `BFT-DEP-${params.accountId.replace(/[^A-Z0-9]/gi, '')}-${now.toString(36).toUpperCase()}`;
  const uuidHash = md5Hex(`${orderId}:${normalizedAmount}:${now}`);
  const uuid =
    params.uuid ||
    `${uuidHash.slice(0, 8)}-${uuidHash.slice(8, 12)}-4${uuidHash.slice(13, 16)}-a${uuidHash.slice(17, 20)}-${uuidHash.slice(20, 32)}`;
  const address = params.address || generateUniqueTrc20Address(`${uuid}:${orderId}`);
  const paymentUrl = params.paymentUrl || `https://pay.cryptomus.com/pay/${uuid}`;
  const qrCodeUri = `tron:${address}?amount=${normalizedAmount.toFixed(2)}&token=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;

  return {
    uuid,
    orderId,
    accountId: params.accountId,
    userId: params.userId || 'usr_bft_001',
    amount: normalizedAmount,
    currency: 'USDT',
    network: 'tron',
    networkLabel: 'TRC-20 (TRON Network)',
    address,
    paymentUrl,
    qrCodeUri,
    status: 'pending',
    createdAt: now,
    expiresAt: now + 3600 * 1000, // 60-minute invoice validity window
    isLiveApi: Boolean(params.isLiveApi),
    merchantId: params.merchantId || '9b16fe05-6331-49c0-a1be-d574726df832',
  };
}

/**
 * Processes an incoming Cryptomus webhook confirmation payload against an existing invoice.
 * Enforces signature verification, status transition ('paid' | 'paid_over' -> 'completed'),
 * and idempotency so duplicate webhooks never double-credit an account.
 */
export function processCryptomusWebhookPayload(
  invoice: CryptomusDepositInvoice,
  webhook: CryptomusWebhookPayload,
  apiKey: string
): {
  ok: boolean;
  alreadyCompleted?: boolean;
  error?: string;
  updatedInvoice: CryptomusDepositInvoice;
  creditedAmountUsdt: number;
} {
  const isValidSign = verifyCryptomusWebhookSignature(
    webhook as unknown as Record<string, unknown>,
    apiKey
  );
  if (!isValidSign) {
    return {
      ok: false,
      error: 'Invalid Cryptomus webhook MD5 signature.',
      updatedInvoice: invoice,
      creditedAmountUsdt: 0,
    };
  }

  // Idempotency guard: if already completed, do not credit again
  if (invoice.status === 'completed') {
    return {
      ok: true,
      alreadyCompleted: true,
      updatedInvoice: invoice,
      creditedAmountUsdt: 0,
    };
  }

  if (webhook.status === 'paid' || webhook.status === 'paid_over') {
    const parsedPaid = Number(webhook.payment_amount || webhook.amount || invoice.amount);
    const creditAmount =
      Number.isFinite(parsedPaid) && parsedPaid > 0
        ? Number(parsedPaid.toFixed(2))
        : invoice.amount;

    const updatedInvoice: CryptomusDepositInvoice = {
      ...invoice,
      status: 'completed',
      amount: creditAmount,
      txHash:
        webhook.txid ||
        `tron_tx_${md5Hex(`${invoice.uuid}:${Date.now()}`)}${md5Hex(invoice.orderId)}`,
      completedAt: Date.now(),
    };

    return {
      ok: true,
      alreadyCompleted: false,
      updatedInvoice,
      creditedAmountUsdt: creditAmount,
    };
  }

  if (webhook.status === 'process' || webhook.status === 'confirm_check') {
    return {
      ok: true,
      updatedInvoice: {
        ...invoice,
        status: 'confirming',
        txHash: webhook.txid || invoice.txHash,
      },
      creditedAmountUsdt: 0,
    };
  }

  if (webhook.status === 'cancel' || webhook.status === 'fail' || webhook.status === 'wrong_amount') {
    return {
      ok: true,
      updatedInvoice: {
        ...invoice,
        status: 'failed',
        errorMessage: `Cryptomus payment status reported: ${webhook.status}`,
      },
      creditedAmountUsdt: 0,
    };
  }

  return {
    ok: true,
    updatedInvoice: invoice,
    creditedAmountUsdt: 0,
  };
}
