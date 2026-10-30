import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  md5Hex,
  computeCryptomusSign,
  verifyCryptomusWebhookSignature,
  validateDepositAmount,
  generateUniqueTrc20Address,
  createCryptomusInvoiceObject,
  processCryptomusWebhookPayload,
} from './cryptomusEngine.ts';
import type { CryptomusWebhookPayload } from './cryptomusEngine.ts';

test('md5Hex matches Node.js native crypto.createHash("md5") across test vectors', () => {
  const vectors = [
    '',
    'a',
    'abc',
    'message digest',
    '{"amount":"250.00","currency":"USDT","network":"tron"}',
  ];
  for (const input of vectors) {
    const expected = crypto.createHash('md5').update(input, 'utf8').digest('hex');
    assert.equal(md5Hex(input), expected);
  }
});

test('computeCryptomusSign and verifyCryptomusWebhookSignature follow official Cryptomus MD5(base64(json) + apiKey) spec', () => {
  const apiKey = 'test_cryptomus_payment_key_998877';
  const payload = {
    uuid: '98a1c3f0-1234-4abc-a999-112233445566',
    order_id: 'BFT-DEP-91823-001',
    amount: '250.00',
    currency: 'USDT',
    network: 'tron',
    status: 'paid',
    is_final: true,
  };

  const sign = computeCryptomusSign(payload, apiKey);
  const expectedBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  const expectedSign = crypto
    .createHash('md5')
    .update(expectedBase64 + apiKey, 'utf8')
    .digest('hex');

  assert.equal(sign, expectedSign);
  assert.equal(verifyCryptomusWebhookSignature({ ...payload, sign }, apiKey), true);
  assert.equal(verifyCryptomusWebhookSignature({ ...payload, sign: 'invalid_sign' }, apiKey), false);
});

test('validateDepositAmount enforces $10 minimum and $100,000 maximum USDT limits', () => {
  assert.equal(validateDepositAmount(0).valid, false);
  assert.equal(validateDepositAmount(5).valid, false);
  assert.equal(validateDepositAmount(10).valid, true);
  assert.equal(validateDepositAmount(250).valid, true);
  assert.equal(validateDepositAmount(150000).valid, false);
});

test('createCryptomusInvoiceObject and generateUniqueTrc20Address generate unique TRON T-addresses per invoice', () => {
  const inv1 = createCryptomusInvoiceObject({
    amount: 250,
    accountId: 'BFT-91823',
    orderId: 'ORD-001',
    nowMs: 1700000000000,
  });
  const inv2 = createCryptomusInvoiceObject({
    amount: 500,
    accountId: 'BFT-91823',
    orderId: 'ORD-002',
    nowMs: 1700000005000,
  });

  assert.ok(inv1.address.startsWith('T'));
  assert.equal(inv1.address.length, 34);
  assert.notEqual(inv1.address, inv2.address);
  assert.equal(inv1.status, 'pending');
  assert.equal(inv1.currency, 'USDT');
  assert.equal(inv1.network, 'tron');
});

test('processCryptomusWebhookPayload credits exact USDT amount on paid status and prevents duplicate crediting', () => {
  const apiKey = 'bft_webhook_secret_key';
  const invoice = createCryptomusInvoiceObject({
    amount: 250,
    accountId: 'BFT-91823',
    orderId: 'ORD-250',
  });

  const unsignedWebhook = {
    type: 'payment' as const,
    uuid: invoice.uuid,
    order_id: invoice.orderId,
    amount: '250.00',
    payment_amount: '250.00',
    payment_amount_usd: '250.00',
    is_final: true,
    status: 'paid' as const,
    network: 'tron',
    currency: 'USDT',
    txid: 'f91b4c8812e9032a7781c2b9012e88a34c91b823f91b4c8812e9032a7781c2b9',
  };

  const sign = computeCryptomusSign(unsignedWebhook, apiKey);
  const signedWebhook: CryptomusWebhookPayload = { ...unsignedWebhook, sign };

  // First webhook call -> transitions to completed & credits 250 USDT
  const firstResult = processCryptomusWebhookPayload(invoice, signedWebhook, apiKey);
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.updatedInvoice.status, 'completed');
  assert.equal(firstResult.creditedAmountUsdt, 250);

  // Duplicate webhook call -> idempotent, credits 0 USDT
  const duplicateResult = processCryptomusWebhookPayload(
    firstResult.updatedInvoice,
    signedWebhook,
    apiKey
  );
  assert.equal(duplicateResult.ok, true);
  assert.equal(duplicateResult.alreadyCompleted, true);
  assert.equal(duplicateResult.creditedAmountUsdt, 0);
});

test('createCryptomusInvoiceObject attaches Merchant ID 9b16fe05-6331-49c0-a1be-d574726df832', async () => {
  const { CRYPTOMUS_CONFIG } = await import('../config/cryptomus.ts');
  assert.equal(CRYPTOMUS_CONFIG.merchantId, '9b16fe05-6331-49c0-a1be-d574726df832');
  assert.equal(CRYPTOMUS_CONFIG.domainVerificationTag, '9b16fe05');

  const invoice = createCryptomusInvoiceObject({
    amount: 100,
    accountId: 'BFT-91823',
  });
  assert.equal(invoice.merchantId, '9b16fe05-6331-49c0-a1be-d574726df832');
  assert.ok(invoice.paymentUrl.startsWith('https://pay.cryptomus.com/pay/'));
});
