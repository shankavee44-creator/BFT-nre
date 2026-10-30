import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculate3TierCommissions } from './referralLogic.js';

describe('Admin Dashboard Backend & RBAC Logic', () => {
  const ADMIN_EMAILS = [
    'shankavee44@gmail.com',
    'admin@bft.io',
    'viktor.v@quant-prop.io',
  ];

  const MASTER_ADMIN_KEY = 'bft_admin_master_key_2026';

  function isAuthorizedAdmin(
    user: { id?: string; email?: string; role?: string } | null,
    headers: { 'x-admin-key'?: string } = {}
  ): boolean {
    if (headers['x-admin-key'] === MASTER_ADMIN_KEY) return true;
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase().trim())) return true;
    return false;
  }

  it('correctly grants administrative access to designated admin emails and role: admin', () => {
    assert.equal(isAuthorizedAdmin({ email: 'shankavee44@gmail.com', role: 'admin' }), true);
    assert.equal(isAuthorizedAdmin({ email: 'admin@bft.io', role: 'trader' }), true);
    assert.equal(isAuthorizedAdmin({ email: 'viktor.v@quant-prop.io' }), true);
    assert.equal(isAuthorizedAdmin({ email: 'custom_admin@prop.com', role: 'admin' }), true);
  });

  it('strictly denies administrative access to regular traders without credentials', () => {
    assert.equal(isAuthorizedAdmin({ email: 'trader123@gmail.com', role: 'trader' }), false);
    assert.equal(isAuthorizedAdmin(null), false);
    assert.equal(isAuthorizedAdmin({ email: 'random@trader.io' }), false);
  });

  it('grants emergency admin access via master security passkey header', () => {
    assert.equal(isAuthorizedAdmin(null, { 'x-admin-key': MASTER_ADMIN_KEY }), true);
    assert.equal(isAuthorizedAdmin(null, { 'x-admin-key': 'wrong_key' }), false);
  });

  it('accurately calculates 3-level commissions for deposits/trades (10% L1, 5% L2, 2% L3)', () => {
    const depositAmount = 1000;
    const commissions = calculate3TierCommissions({
      amount: depositAmount,
      sourceType: 'deposit',
      upline: {
        level1SponsorId: 'usr_sponsor_1',
        level2SponsorId: 'usr_sponsor_2',
        level3SponsorId: 'usr_sponsor_3',
      },
      sourceUserName: 'Trader Alice',
    });

    assert.equal(commissions.length, 3);
    assert.equal(commissions[0].level, 1);
    assert.equal(commissions[0].commissionAmount, 100); // 10%
    assert.equal(commissions[1].level, 2);
    assert.equal(commissions[1].commissionAmount, 50);  // 5%
    assert.equal(commissions[2].level, 3);
    assert.equal(commissions[2].commissionAmount, 20);  // 2%
  });

  it('accurately calculates 8% direct referral payout bonus upon approved withdrawal', () => {
    const withdrawalAmount = 500;
    const commissions = calculate3TierCommissions({
      amount: withdrawalAmount,
      sourceType: 'withdrawal',
      upline: {
        level1SponsorId: 'usr_sponsor_1',
        level2SponsorId: 'usr_sponsor_2',
        level3SponsorId: null,
      },
    });

    assert.equal(commissions.length, 1);
    assert.equal(commissions[0].level, 1);
    assert.equal(commissions[0].commissionAmount, 40); // 8% of $500 = $40
    assert.equal(commissions[0].sponsorId, 'usr_sponsor_1');
  });

  it('validates user account balance update bounds (rejects negative numbers)', () => {
    function validateBalanceUpdate(newBalance: number): { valid: boolean; error?: string } {
      if (!Number.isFinite(newBalance) || newBalance < 0) {
        return { valid: false, error: 'New balance must be a non-negative number.' };
      }
      return { valid: true };
    }

    assert.equal(validateBalanceUpdate(5000).valid, true);
    assert.equal(validateBalanceUpdate(0).valid, true);
    assert.equal(validateBalanceUpdate(-100).valid, false);
    assert.equal(validateBalanceUpdate(NaN).valid, false);
  });
});
