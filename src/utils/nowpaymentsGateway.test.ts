import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOWPAYMENTS_CONFIG,
  NOWPAYMENTS_CURRENCIES,
  sortObjectKeysAlphabetically,
  verifyNowPaymentsIpnSignature,
  generateNowPaymentsIpnSignature,
  parseNowPaymentsIpnPayload,
  generateDynamicNowPaymentsAddress,
  createNowPaymentsPayment,
} from './nowpaymentsGateway';

test('NOWPayments configuration uses the exact production credentials requested', () => {
  assert.equal(NOWPAYMENTS_CONFIG.apiKey, 'ZYWP93K-6EE4JYP-JEE41KB-DJFRCWJ');
  assert.equal(NOWPAYMENTS_CONFIG.publicKey, '81e45fae-76b9-43bf-be98-c20d359a124c');
  assert.equal(NOWPAYMENTS_CONFIG.ipnSecretKey, 'MRtdlK6QOFZbS5SglqliuVgYFoduLFNR');
  assert.equal(NOWPAYMENTS_CONFIG.apiBaseUrl, 'https://api.nowpayments.io/v1');
});

test('NOWPayments currency options include USDT (TRC-20) as primary option', () => {
  const trc20 = NOWPAYMENTS_CURRENCIES.find((c) => c.code === 'usdttrc20');
  assert.ok(trc20, 'USDT TRC-20 option must exist');
  assert.equal(trc20?.network, 'TRON');
  assert.equal(trc20?.symbol, 'USDT');
});

test('sortObjectKeysAlphabetically sorts root and nested keys in alphabetical order', () => {
  const unordered = {
    payment_status: 'finished',
    amount: 100,
    z_extra: 'value',
    details: {
      network: 'TRON',
      address: 'TQjZ...',
    },
  };

  const sorted = sortObjectKeysAlphabetically(unordered);
  const keys = Object.keys(sorted);
  assert.deepEqual(keys, ['amount', 'details', 'payment_status', 'z_extra']);
  assert.deepEqual(Object.keys(sorted.details), ['address', 'network']);
});

test('verifyNowPaymentsIpnSignature verifies authentic HMAC-SHA512 signatures with production secret key', () => {
  const payload = {
    payment_id: 5077125051,
    payment_status: 'finished',
    pay_address: 'TQDwK92G5H28J6N218731bF9a0',
    price_amount: 250,
    price_currency: 'usd',
    pay_amount: 250,
    actually_paid: 250,
    pay_currency: 'usdttrc20',
    order_id: 'NOW-ORD-TEST-001',
  };

  // Generate valid signature using the official IPN secret key
  const validSig = generateNowPaymentsIpnSignature(payload, NOWPAYMENTS_CONFIG.ipnSecretKey);
  assert.ok(validSig.length > 32);

  // Verification must succeed
  const isValid = verifyNowPaymentsIpnSignature(payload, validSig, NOWPAYMENTS_CONFIG.ipnSecretKey);
  assert.equal(isValid, true);

  // Tampered payload must fail
  const tamperedPayload = { ...payload, price_amount: 500 };
  const isTamperedValid = verifyNowPaymentsIpnSignature(
    tamperedPayload,
    validSig,
    NOWPAYMENTS_CONFIG.ipnSecretKey
  );
  assert.equal(isTamperedValid, false);

  // Invalid signature string must fail
  assert.equal(
    verifyNowPaymentsIpnSignature(payload, 'deadbeefbadsignature', NOWPAYMENTS_CONFIG.ipnSecretKey),
    false
  );
});

test('parseNowPaymentsIpnPayload parses finished, confirming, waiting, and failed statuses', () => {
  const finishedPayload = {
    payment_id: 123456,
    payment_status: 'finished',
    pay_address: 'TQ1234567890abcdef',
    price_amount: 100,
    price_currency: 'usd',
    pay_amount: 100,
    actually_paid: 100,
    pay_currency: 'usdttrc20',
    order_id: 'ORD-FIN-1',
  };

  const finishedSig = generateNowPaymentsIpnSignature(finishedPayload);
  const parsedFinished = parseNowPaymentsIpnPayload(finishedPayload, finishedSig);
  assert.equal(parsedFinished.valid, true);
  assert.equal(parsedFinished.isFinished, true);
  assert.equal(parsedFinished.status, 'finished');
  assert.equal(parsedFinished.paidAmountUsd, 100);
  assert.equal(parsedFinished.orderId, 'ORD-FIN-1');

  // Confirming status
  const confirmingPayload = { ...finishedPayload, payment_status: 'confirming', order_id: 'ORD-CONF-1' };
  const confirmingSig = generateNowPaymentsIpnSignature(confirmingPayload);
  const parsedConfirming = parseNowPaymentsIpnPayload(confirmingPayload, confirmingSig);
  assert.equal(parsedConfirming.valid, true);
  assert.equal(parsedConfirming.isFinished, false);
  assert.equal(parsedConfirming.status, 'confirming');

  // Expired / failed status
  const expiredPayload = { ...finishedPayload, payment_status: 'expired', order_id: 'ORD-EXP-1' };
  const expiredSig = generateNowPaymentsIpnSignature(expiredPayload);
  const parsedExpired = parseNowPaymentsIpnPayload(expiredPayload, expiredSig);
  assert.equal(parsedExpired.valid, true);
  assert.equal(parsedExpired.isFinished, false);
  assert.equal(parsedExpired.status, 'expired');
});

test('generateDynamicNowPaymentsAddress produces valid TRON TRC-20 addresses starting with T and EVM addresses starting with 0x', () => {
  const trc20 = generateDynamicNowPaymentsAddress('NOW-ORD-991', 'usdttrc20');
  assert.ok(trc20.startsWith('T'), 'TRC-20 address must start with T');
  assert.equal(trc20.length, 34);

  const evm = generateDynamicNowPaymentsAddress('NOW-ORD-992', 'usdtbsc');
  assert.ok(evm.startsWith('0x'), 'EVM address must start with 0x');
  assert.equal(evm.length, 42);

  const btc = generateDynamicNowPaymentsAddress('NOW-ORD-993', 'btc');
  assert.ok(btc.startsWith('bc1q'), 'BTC address should start with bc1q');
});

test('createNowPaymentsPayment produces a structured payment response with deposit address and order id', async () => {
  const result = await createNowPaymentsPayment({
    amountUsd: 150,
    payCurrency: 'usdttrc20',
    orderId: 'NOW-ORD-UNIT-150',
    orderDescription: 'BFT $150 Deposit',
    customerEmail: 'trader@client-bft.com',
  });

  assert.ok(result.payment_id);
  assert.ok(result.pay_address);
  assert.equal(result.price_amount, 150);
  assert.equal(result.pay_currency, 'usdttrc20');
  assert.equal(result.order_id, 'NOW-ORD-UNIT-150');
});
