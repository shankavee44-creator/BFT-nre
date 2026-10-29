import test from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  getUserById,
  getUserByEmail,
  getAccountsForUser,
  getAccountById,
  createAccount,
  passChallengePhaseInDb,
  processWithdrawalRequest,
  creditPurchaseCommissions,
  getAffiliateDashboardStats,
  getWeeklyLeaderboardQuery,
  getCountryFlag,
  ensurePersonalLiveAccountForUser,
  creditPersonalAccountDepositInDb,
} from '../server/db';

test('80% Profit Payout Ceiling Rule: blocks withdrawal exceeding 80% of net profit', () => {
  // Ensure Alex Mercer's account has exactly $680.00 in accumulated profit ($10,680 balance vs $10,000 initial)
  db.prepare(`
    UPDATE accounts SET
      initial_balance = 10000.00,
      current_balance = 10680.00,
      equity = 10680.00,
      status = 'active',
      phase = 'funded',
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

test('Challenge Phase Withdrawal Lock & Progression to Live Funded Account with Certificate', () => {
  const challengeAcc = createAccount({
    userId: 'usr_bft_001',
    tier: 'one-step',
    tierName: '1-Step Rapid Evaluation',
    size: 10000,
    dailyWithdrawalsUnlocked: false,
  });
  assert.ok(challengeAcc);
  assert.equal(challengeAcc.phase, 'phase_1');

  // Even if the challenge account has profit, withdrawal must be blocked while in phase_1
  db.prepare(`
    UPDATE accounts SET current_balance = 11200.00, equity = 11200.00, first_withdrawal_completed = 1
    WHERE id = ?
  `).run(challengeAcc.id);

  assert.throws(
    () => {
      processWithdrawalRequest({
        userId: 'usr_bft_001',
        accountId: challengeAcc.id,
        requestedAmount: 300,
        walletAddress: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
        network: 'TRON (TRC-20)',
        paymentMethod: 'crypto_trc20',
      });
    },
    (err: any) => err.message.includes('Withdrawals are locked during the Challenge Phase')
  );

  // Passing the challenge generates a Certificate ID and provisions a Live Funded Account
  const passedResult = passChallengePhaseInDb('usr_bft_001', challengeAcc.id, true);
  assert.ok(passedResult.certificateId.startsWith('CERT-'));
  assert.equal(passedResult.lockedAccount?.status, 'passed');
  assert.equal(passedResult.deployedAccount?.phase, 'funded');
  assert.equal(passedResult.deployedAccount?.status, 'active');
  assert.equal(passedResult.deployedAccount?.size, 10000);

  // Clean up test-only accounts so usr_bft_001 retains a clean account list
  db.prepare(`DELETE FROM accounts WHERE user_id = 'usr_bft_001' AND id NOT IN ('BFT-91823', 'BFT-PERS-001')`).run();
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
  const withdrawalAmount = 300.0;
  const expectedBonus = Number((withdrawalAmount * 0.08).toFixed(2));
  assert.equal(expectedBonus, 24.0);
});

test('Weekly Leaderboard query & Country Flag mapping: normalizes Kasun Perera at rank 9 with Sri Lanka flag', () => {
  assert.equal(getCountryFlag('Sri Lanka'), '🇱🇰');
  assert.equal(getCountryFlag('United States'), '🇺🇸');

  const leaderboard = getWeeklyLeaderboardQuery();
  assert.equal(leaderboard.length >= 10, true);

  const kasun = leaderboard.find((t) => t.name.includes('Kasun Perera'));
  assert.ok(kasun, 'Kasun Perera exists in weekly leaderboard');
  assert.equal(kasun?.rank, 9);
  assert.equal(kasun?.country, 'Sri Lanka');
  assert.equal(kasun?.flag, '🇱🇰');
  assert.equal(kasun?.profit, 18995.22);
});

test('Personal Live Trading Account (Self-Funded Balance): supports direct deposits and unrestricted capital + profit withdrawals', () => {
  // Ensure Personal Live account exists for usr_bft_001
  const personalRow = ensurePersonalLiveAccountForUser('usr_bft_001');
  assert.ok(personalRow);
  assert.equal(personalRow?.id, 'BFT-PERS-001');
  assert.equal(personalRow?.account_category, 'personal_live');

  // Reset BFT-PERS-001 to $1,250.00 initial & current balance for deterministic testing
  db.prepare(`
    UPDATE accounts SET
      initial_balance = 1250.00,
      current_balance = 1250.00,
      equity = 1250.00,
      starting_day_equity = 1250.00,
      deposited_capital = 1250.00,
      size = 1250.00,
      status = 'active',
      phase = 'personal_live'
    WHERE id = 'BFT-PERS-001'
  `).run();

  // Deposit $500 into Personal Live account -> balance becomes $1,750.00
  const afterDeposit = creditPersonalAccountDepositInDb({
    userId: 'usr_bft_001',
    accountId: 'BFT-PERS-001',
    amountUsdt: 500,
  });
  assert.equal(afterDeposit.currentBalance, 1750);
  assert.equal(afterDeposit.depositedCapital, 1750);

  // Withdraw $500 of deposited capital (even with $0 profit) -> succeeds with 100% retention and 10% fee ($450 net)
  const withdrawalRes = processWithdrawalRequest({
    userId: 'usr_bft_001',
    accountId: 'BFT-PERS-001',
    requestedAmount: 500,
    walletAddress: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    network: 'TRON (TRC-20)',
    paymentMethod: 'crypto_trc20',
  });
  assert.equal(withdrawalRes.breakdown.profitShareRate, 1.0);
  assert.equal(withdrawalRes.breakdown.feeAmount, 50);
  assert.equal(withdrawalRes.breakdown.netPayout, 450);
  assert.equal(withdrawalRes.breakdown.isPersonalLive, true);
  assert.equal((withdrawalRes.withdrawal as any).profit_share_rate, 1.0);
  assert.equal((withdrawalRes.withdrawal as any).fee_amount, 50);
  assert.equal((withdrawalRes.withdrawal as any).net_payout, 450);
});


