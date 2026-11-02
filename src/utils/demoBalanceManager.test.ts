import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDemoBalance,
  getNumericTraderId,
  formatAccountBalance,
  MIN_DEMO_BALANCE,
  MAX_DEMO_BALANCE,
} from './demoBalanceManager.ts';

test('validateDemoBalance strictly enforces $1 to $10,000 bounds', () => {
  // Below minimum
  const below = validateDemoBalance(0);
  assert.equal(below.isValid, false);
  assert.equal(below.normalizedBalance, MIN_DEMO_BALANCE);

  const negative = validateDemoBalance(-50);
  assert.equal(negative.isValid, false);

  // Above maximum
  const above = validateDemoBalance(15000);
  assert.equal(above.isValid, false);
  assert.equal(above.normalizedBalance, MAX_DEMO_BALANCE);

  // Valid boundaries
  const minValid = validateDemoBalance(1);
  assert.equal(minValid.isValid, true);
  assert.equal(minValid.normalizedBalance, 1);

  const maxValid = validateDemoBalance(10000);
  assert.equal(maxValid.isValid, true);
  assert.equal(maxValid.normalizedBalance, 10000);

  // Mid-range value
  const mid = validateDemoBalance('451.01');
  assert.equal(mid.isValid, true);
  assert.equal(mid.normalizedBalance, 451.01);
});

test('formatAccountBalance masks balance with asterisks when privacy mode is enabled', () => {
  const visible = formatAccountBalance(451.01, false);
  assert.equal(visible, '$451.01');

  const hidden = formatAccountBalance(451.01, true);
  assert.equal(hidden, '••••••');
});

test('getNumericTraderId produces stable 8-digit numeric strings', () => {
  const id1 = getNumericTraderId('shankavee44@gmail.com');
  const id2 = getNumericTraderId('shankavee44@gmail.com');
  assert.equal(id1, id2);
  assert.match(id1, /^[1-9][0-9]{7}$/);

  const idDefault = getNumericTraderId(null);
  assert.equal(idDefault, '90259973');
});
