import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidUuid,
  ensureTradeUuid,
  getEffectiveSupabaseUserId,
  fetchUserTrades,
  mapFromSupabaseRow,
} from './supabaseTradeSync.ts';

test('isValidUuid correctly validates standard UUIDs and rejects non-UUID identifiers', () => {
  // Valid UUIDs
  assert.equal(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
  assert.equal(isValidUuid('550E8400-E29B-41D4-A716-446655440000'), true);
  assert.equal(isValidUuid('00000000-0000-0000-0000-000000000000'), true);

  // Non-UUID strings (including exact error report: usr_mvulnwy8_ej1z)
  assert.equal(isValidUuid('usr_mvulnwy8_ej1z'), false);
  assert.equal(isValidUuid('usr_bft_001'), false);
  assert.equal(isValidUuid('TRD-123456'), false);
  assert.equal(isValidUuid('BFT-91823'), false);
  assert.equal(isValidUuid(''), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
  assert.equal(isValidUuid('   '), false);
});

test('ensureTradeUuid produces valid RFC 4122 compatible UUIDs deterministically', () => {
  const tradeIdA = 'TRD-981234';
  const tradeIdB = 'TRD-556677';
  const existingUuid = 'e9f4c3a2-1111-4222-8333-abcdef123456';

  const uuidA1 = ensureTradeUuid(tradeIdA);
  const uuidA2 = ensureTradeUuid(tradeIdA);
  const uuidB = ensureTradeUuid(tradeIdB);
  const uuidExisting = ensureTradeUuid(existingUuid);

  // Must match standard UUID format
  assert.equal(isValidUuid(uuidA1), true);
  assert.equal(isValidUuid(uuidB), true);

  // Must be deterministic
  assert.equal(uuidA1, uuidA2);

  // Different inputs yield different UUIDs
  assert.notEqual(uuidA1, uuidB);

  // Already valid UUIDs are preserved
  assert.equal(uuidExisting, existingUuid);
});

test('getEffectiveSupabaseUserId returns null for non-UUID strings without Supabase session', async () => {
  // Passing backend SQLite user identifier (such as usr_mvulnwy8_ej1z)
  const result = await getEffectiveSupabaseUserId('usr_mvulnwy8_ej1z');
  assert.equal(result, null);

  // Passing valid UUID returns the UUID directly
  const validUuid = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const validResult = await getEffectiveSupabaseUserId(validUuid);
  assert.equal(validResult, validUuid);
});

test('fetchUserTrades gracefully returns empty array for non-UUID user without throwing syntax error', async () => {
  // Exact user ID from user error: "usr_mvulnwy8_ej1z"
  const trades = await fetchUserTrades('usr_mvulnwy8_ej1z');
  assert.ok(Array.isArray(trades));
  assert.equal(trades.length, 0);

  // Empty string or null
  assert.deepEqual(await fetchUserTrades(''), []);
});

test('mapFromSupabaseRow correctly translates database rows to BinaryTrade schema', () => {
  const sampleRow = {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    account_id: 'BFT-91823',
    symbol: 'EUR/USD (OTC)',
    trade_type: 'CALL',
    entry_price: 1.08542,
    exit_price: 1.08590,
    amount: 100,
    payout_multiplier: 1.92,
    status: 'WON',
    created_at: '2026-10-30T00:00:00.000Z',
    expires_at: '2026-10-30T00:01:00.000Z',
    account_type: 'REAL',
  };

  const trade = mapFromSupabaseRow(sampleRow);
  assert.equal(trade.id, sampleRow.id);
  assert.equal(trade.asset, 'EUR/USD (OTC)');
  assert.equal(trade.direction, 'CALL');
  assert.equal(trade.strikePrice, 1.08542);
  assert.equal(trade.closePrice, 1.08590);
  assert.equal(trade.investment, 100);
  assert.equal(trade.payoutPercentage, 92);
  assert.equal(trade.status, 'won');
  assert.equal(trade.pnl, 92);
  assert.equal(trade.durationSeconds, 60);
  assert.equal(trade.accountTier, 'personal');
});
