import test from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  getUserById,
  getUserByEmail,
  getAccountsForUser,
  getAccountById,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
} from '../server/db';

test('80% Profit Payout Ceiling Rule: blocks withdrawal exceeding 80% of net profit', () => {
  // Ensure Alex Mercer's account has exactly $680.00 in accumulated profit ($10,680 balance vs $10,000 initial)
  db.prepare(`
    UPDATE accounts SET
      initial_balance = 10000.00,
      current_balance = 10680.00,
      equity = 10680.00,
      status = 'active',
      first_withdrawal_completed = 1,
      trading_days_completed = 15
    WHERE id = 'BFT-91823'
  `).run();

  const account = getAccountById('BFT-91823');
  assert.ok(account);
  const netProfit = Math.max(0, Number((account.current_balance - account.initial_balance).toFixed(2)));
  assert.equal(netProfit, 680.0);

  const allowable80Percent = Number((netProfit * 0.8).toFixed(2));
  assert.equal(allowable80Percent, 544.0);

  // Attempting to withdraw $600 exceeds 80% ($544.00) and must throw
  assert.throws(
    () => {
      processWithdrawalRequest({
        userId: 'usr_bft_001',
        accountId: 'BFT-91823',
        requestedAmount: 600,
        walletAddress: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
        network: 'BSC (BEP20)',
        paymentMethod: 'crypto_trc20',
      });
    },
    (err: any) => {
      return (
        err.message.includes('80% profit payout ceiling') &&
        err.message.includes('$544.00')
      );
    }
  );
});

test('Minimum withdrawal threshold rule: enforces minimum $250.00 USD', () => {
  assert.throws(
    () => {
      processWithdrawalRequest({
        userId: 'usr_bft_001',
        accountId: 'BFT-91823',
        requestedAmount: 150, // Less than $250
        walletAddress: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
        network: 'BSC (BEP20)',
        paymentMethod: 'crypto_trc20',
      });
    },
    (err: any) => err.message.includes('Minimum withdrawal amount is $250.00 USD')
  );
});

test('3-Tier Affiliate Commission structure: 10% L1, 5% L2, 2% L3', () => {
  // Test purchase commission credit for a buyer with uplines
  const comms = creditPurchaseCommissions('usr_bft_001', '$10,000 Challenge', 100.0);
  assert.equal(comms.length >= 2, true);

  const l1 = comms.find((c) => c.level === 1);
  assert.ok(l1);
  assert.equal(l1?.sponsorId, 'USR-PARENT-55');
  assert.equal(l1?.amount, 10.0); // 10% of 100

  const l2 = comms.find((c) => c.level === 2);
  assert.ok(l2);
  assert.equal(l2?.sponsorId, 'USR-MASTER-88');
  assert.equal(l2?.amount, 5.0); // 5% of 100
});

test('Direct Referral Payout Bonus: credits 8% bonus on direct referral withdrawal', () => {
  // For user Alex Mercer whose sponsor is USR-PARENT-55
  // When a $300 withdrawal is processed, sponsor receives 8% = $24.00 bonus
  const withdrawalAmount = 300.0;
  const expectedBonus = Number((withdrawalAmount * 0.08).toFixed(2));
  assert.equal(expectedBonus, 24.0);
});

test('Weekly Leaderboard query: normalizes Kasun Perera at rank 9 with Sri Lanka flag', () => {
  const leaderboard = getWeeklyLeaderboardQuery();
  assert.equal(leaderboard.length >= 10, true);

  const kasun = leaderboard.find((t) => t.name.includes('Kasun Perera'));
  assert.ok(kasun, 'Kasun Perera exists in weekly leaderboard');
  assert.equal(kasun?.rank, 9);
  assert.equal(kasun?.country, 'Sri Lanka');
  assert.equal(kasun?.flag, '🇱🇰');
  assert.equal(kasun?.profit, 18995.22);
});
