import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate3TierCommissions,
  REFERRAL_COMMISSION_RATES,
} from './referralLogic.ts';

test('calculate3TierCommissions distributes 10%, 5%, and 2% on $1,000 deposit across full 3-level upline', () => {
  const upline = {
    level1SponsorId: 'USR-L1-SPONSOR',
    level2SponsorId: 'USR-L2-PARENT',
    level3SponsorId: 'USR-L3-GRAND',
  };

  const results = calculate3TierCommissions({
    upline,
    amount: 1000,
    sourceType: 'deposit',
    sourceUserName: 'Trader Bob',
  });

  assert.equal(results.length, 3);

  // Level 1: 10% of 1000 = $100
  assert.equal(results[0].level, 1);
  assert.equal(results[0].sponsorId, 'USR-L1-SPONSOR');
  assert.equal(results[0].ratePercent, 10);
  assert.equal(results[0].commissionAmount, 100.0);

  // Level 2: 5% of 1000 = $50
  assert.equal(results[1].level, 2);
  assert.equal(results[1].sponsorId, 'USR-L2-PARENT');
  assert.equal(results[1].ratePercent, 5);
  assert.equal(results[1].commissionAmount, 50.0);

  // Level 3: 2% of 1000 = $20
  assert.equal(results[2].level, 3);
  assert.equal(results[2].sponsorId, 'USR-L3-GRAND');
  assert.equal(results[2].ratePercent, 2);
  assert.equal(results[2].commissionAmount, 20.0);
});

test('calculate3TierCommissions handles partial upline chains gracefully', () => {
  // Only Level 1 sponsor, no L2 or L3
  const singleUpline = {
    level1SponsorId: 'USR-SOLO-SPONSOR',
    level2SponsorId: null,
    level3SponsorId: null,
  };

  const results = calculate3TierCommissions({
    upline: singleUpline,
    amount: 500,
    sourceType: 'trade_activity',
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].level, 1);
  assert.equal(results[0].commissionAmount, 50.0); // 10% of 500
});

test('calculate3TierCommissions calculates 8% direct bonus on withdrawals', () => {
  const upline = {
    level1SponsorId: 'USR-SPONSOR',
    level2SponsorId: 'USR-PARENT',
    level3SponsorId: 'USR-GRAND',
  };

  const results = calculate3TierCommissions({
    upline,
    amount: 250,
    sourceType: 'withdrawal',
  });

  // Only direct sponsor receives 8% on withdrawal
  assert.equal(results.length, 1);
  assert.equal(results[0].level, 1);
  assert.equal(results[0].ratePercent, 8);
  assert.equal(results[0].commissionAmount, 20.0); // 8% of 250 = $20.00
});

test('calculate3TierCommissions rejects zero or negative amounts', () => {
  const upline = {
    level1SponsorId: 'USR-SPONSOR',
    level2SponsorId: 'USR-PARENT',
    level3SponsorId: 'USR-GRAND',
  };

  assert.deepEqual(calculate3TierCommissions({ upline, amount: 0, sourceType: 'deposit' }), []);
  assert.deepEqual(calculate3TierCommissions({ upline, amount: -100, sourceType: 'deposit' }), []);
});
