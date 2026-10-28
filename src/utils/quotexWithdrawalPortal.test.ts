import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatQuotexDateAndTime,
  calculateQuotexAccountSummary,
  buildMergedTransactionLedger,
  paginateTransactions,
  validateQuotexPurseAddress,
  QUOTEX_WITHDRAWAL_FAQS,
} from './quotexWithdrawalPortal';
import { TradingAccount, WithdrawalRequest } from '../types';

test('formatQuotexDateAndTime formats UTC timestamps in DD/MM/YYYY and HH:mm:ss format', () => {
  const ts = Date.UTC(2026, 9, 27, 16, 42, 11);
  const formatted = formatQuotexDateAndTime(ts);
  assert.equal(formatted.dateFormatted, '27/10/2026');
  assert.equal(formatted.timeFormatted, '16:42:11');
  assert.equal(formatted.combined, '27/10/2026 16:42:11');
});

test('calculateQuotexAccountSummary returns 0.00 $ for null account and exact balances + 10% fee for funded account', () => {
  const emptySummary = calculateQuotexAccountSummary(null);
  assert.equal(emptySummary.inTheAccountFormatted, '0.00 $');
  assert.equal(emptySummary.availableForWithdrawalFormatted, '0.00 $');
  assert.equal(emptySummary.commissionFormatted, '10% (Withdrawal Fee)');
  assert.equal(emptySummary.minWithdrawalAmount, 250);

  const fundedAccount: TradingAccount = {
    id: 'BFT-91823',
    loginId: 'BFT-91823',
    passwordHash: 'secret',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10680,
    startingDayEquity: 10520,
    equity: 10680,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    status: 'active',
    createdDate: '2026-10-01',
    lastActiveDate: '2026-10-27',
    phase: 'funded',
    tradingDaysCompleted: 14,
    tradesCount: 38,
    winRate: 73.6,
  };

  const summary = calculateQuotexAccountSummary(fundedAccount);
  assert.equal(summary.inTheAccount, 10680);
  assert.equal(summary.availableForWithdrawal, 680);
  assert.equal(summary.inTheAccountFormatted, '10,680.00 $');
  assert.equal(summary.availableForWithdrawalFormatted, '680.00 $');
  assert.equal(summary.withdrawalFeePercent, 10);
  assert.equal(summary.minWithdrawalAmount, 250);
});

test('buildMergedTransactionLedger and paginateTransactions produce 2 pages with Payout and Deposit rows', () => {
  const mockWithdrawals: WithdrawalRequest[] = [
    {
      id: 'WD-9001',
      accountId: 'BFT-91823',
      amount: 300,
      withdrawalFee: 30,
      netReceivedAmount: 270,
      profitSplitApplied: 90,
      paymentMethod: 'crypto_trc20',
      trc20Address: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
      requestedAt: Date.UTC(2026, 9, 28, 10, 0, 0),
      status: 'paid',
      txHash: '0xabc1234567890def',
      isDoublePayoutEligible: true,
      timeElapsedSeconds: 65,
    },
  ];

  const ledger = buildMergedTransactionLedger(mockWithdrawals);
  assert.ok(ledger.length >= 8);
  assert.equal(ledger[0].id, 'WD-9001');
  assert.equal(ledger[0].type, 'Payout');
  assert.equal(ledger[0].signedAmountFormatted, '-270.00 $');
  assert.equal(ledger[0].feeFormatted, '10% fee ($30.00)');

  const page1 = paginateTransactions(ledger, 1, 5);
  assert.equal(page1.currentPage, 1);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.pageItems.length, 5);
  assert.equal(page1.hasNext, true);
  assert.equal(page1.hasPrev, false);

  const page2 = paginateTransactions(ledger, 2, 5);
  assert.equal(page2.currentPage, 2);
  assert.equal(page2.hasNext, false);
  assert.equal(page2.hasPrev, true);
});

test('validateQuotexPurseAddress validates BEP20 and TRC20 addresses and QUOTEX_WITHDRAWAL_FAQS has 6 items with $250 min and 3-min guarantee', () => {
  assert.equal(QUOTEX_WITHDRAWAL_FAQS.length, 6);
  const allFaqText = QUOTEX_WITHDRAWAL_FAQS.map((f) => `${f.question} ${f.answer}`).join(' ');
  assert.match(allFaqText, /We process payouts within 3 minutes; if we fail, we pay double!/);
  assert.match(allFaqText, /\$250\.00/);
  assert.match(allFaqText, /14-day waiting period/);

  const validBep20 = validateQuotexPurseAddress(
    '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    'BSC (BEP20)',
    'USDT'
  );
  assert.equal(validBep20.valid, true);

  const validTrc20 = validateQuotexPurseAddress(
    'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    'TRON (TRC-20)',
    'USDT'
  );
  assert.equal(validTrc20.valid, true);

  const emptyPurse = validateQuotexPurseAddress('', 'BSC (BEP20)', 'USDT');
  assert.equal(emptyPurse.valid, false);
});
