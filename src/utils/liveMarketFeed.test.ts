import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiveMarketFeedEngine,
  calculateTradeSettlement,
  computeAccountWinRate,
} from './liveMarketFeed.ts';
import {
  ensureUserInDb,
  getAccountsForUser,
  creditPersonalAccountDepositInDb,
  recordTradeInDb,
  settleTradeInDb,
  getUserTradesFromDb,
} from '../server/db.ts';

test('LiveMarketFeed - Symbol resolution maps platform assets to Binance tickers', () => {
  const engine = new LiveMarketFeedEngine();

  assert.equal(engine.resolveBinanceSymbol('BTC/USD (OTC)'), 'BTCUSDT');
  assert.equal(engine.resolveBinanceSymbol('ETH/USD (OTC)'), 'ETHUSDT');
  assert.equal(engine.resolveBinanceSymbol('SOL/USD (OTC)'), 'SOLUSDT');
  assert.equal(engine.resolveBinanceSymbol('XRP/USD (OTC)'), 'XRPUSDT');
  assert.equal(engine.resolveBinanceSymbol('BNB/USD (OTC)'), 'BNBUSDT');
  assert.equal(engine.resolveBinanceSymbol('DOGE/USD (OTC)'), 'DOGEUSDT');
  assert.equal(engine.resolveBinanceSymbol('ADA/USD (OTC)'), 'ADAUSDT');
  assert.equal(engine.resolveBinanceSymbol('AVAX/USD (OTC)'), 'AVAXUSDT');
  assert.equal(engine.resolveBinanceSymbol('BTC/USD'), 'BTCUSDT');
  assert.equal(engine.resolveBinanceSymbol('ETH/USDT'), 'ETHUSDT');

  // Forex is handled by interbank engine, not Binance
  assert.equal(engine.resolveBinanceSymbol('EUR/USD (OTC)'), null);
  assert.equal(engine.resolveBinanceSymbol('GBP/JPY (OTC)'), null);

  engine.destroy();
});

test('calculateTradeSettlement - Correctly evaluates ITM Call Win', () => {
  const result = calculateTradeSettlement({
    direction: 'CALL',
    strikePrice: 96000.0,
    closePrice: 96050.25,
    investment: 100,
    payoutPercentage: 92,
  });

  assert.equal(result.status, 'won');
  assert.equal(result.pnl, 92.0);
  assert.equal(result.creditedAmount, 192.0); // original 100 + 92 profit
  assert.equal(result.closePrice, 96050.25);
});

test('calculateTradeSettlement - Correctly evaluates ITM Put Win', () => {
  const result = calculateTradeSettlement({
    direction: 'PUT',
    strikePrice: 1.08500,
    closePrice: 1.08480,
    investment: 250,
    payoutPercentage: 90,
  });

  assert.equal(result.status, 'won');
  assert.equal(result.pnl, 225.0);
  assert.equal(result.creditedAmount, 475.0); // 250 + 225
});

test('calculateTradeSettlement - Correctly evaluates OTM Loss', () => {
  const result = calculateTradeSettlement({
    direction: 'CALL',
    strikePrice: 96100.0,
    closePrice: 96050.0,
    investment: 100,
    payoutPercentage: 92,
  });

  assert.equal(result.status, 'lost');
  assert.equal(result.pnl, -100.0);
  assert.equal(result.creditedAmount, 0.0); // stake was already debited, nothing credited
});

test('calculateTradeSettlement - Correctly evaluates Tie/Push (100% Stake Refund)', () => {
  const result = calculateTradeSettlement({
    direction: 'CALL',
    strikePrice: 96000.0,
    closePrice: 96000.0,
    investment: 150,
    payoutPercentage: 92,
  });

  assert.equal(result.status, 'tie');
  assert.equal(result.pnl, 0.0);
  assert.equal(result.creditedAmount, 150.0); // 100% refund of original investment
});

test('computeAccountWinRate - Correctly calculates win rates', () => {
  assert.equal(computeAccountWinRate([]), 0);

  const sampleTrades = [
    { status: 'won' },
    { status: 'won' },
    { status: 'won' },
    { status: 'lost' },
  ];
  assert.equal(computeAccountWinRate(sampleTrades), 75.0);

  const tenTrades = [
    { status: 'won' }, { status: 'won' }, { status: 'won' }, { status: 'won' },
    { status: 'won' }, { status: 'won' }, { status: 'won' }, { status: 'won' },
    { status: 'lost' }, { status: 'lost' },
  ];
  assert.equal(computeAccountWinRate(tenTrades), 80.0);
});

test('Database Trade Execution & Settlement - Atomic Balance Updates', () => {
  const testUserId = `usr_trade_${Date.now()}`;
  const testUser = ensureUserInDb({
    id: testUserId,
    email: `${testUserId}@bft.io`,
    fullName: 'Test Trader',
  });
  assert.ok(testUser);

  // Fund test user's personal live account with $500
  creditPersonalAccountDepositInDb({
    userId: testUserId,
    amountUsdt: 500,
  });

  const accounts = getAccountsForUser(testUserId);
  assert.ok(accounts.length > 0);
  const targetAcc = accounts[0];
  const initialBalance = targetAcc.currentBalance;
  assert.equal(initialBalance, 500);

  // 1. Place a trade of $100
  const tradeStake = 100;
  const placement = recordTradeInDb(testUserId, {
    id: `TRD-TEST-${Date.now()}`,
    accountId: targetAcc.id,
    asset: 'BTC/USD (OTC)',
    direction: 'CALL',
    strikePrice: 96500.0,
    investment: tradeStake,
    payoutPercentage: 92,
    durationSeconds: 30,
  });

  assert.ok(placement.trade);
  assert.equal(placement.trade.status, 'active');
  assert.equal(placement.account.currentBalance, Number((initialBalance - tradeStake).toFixed(2)));

  // 2. Settle trade as WON at higher close price (e.g. 96550)
  const settlement = settleTradeInDb(testUserId, placement.trade.id, 96550.0);
  assert.ok(settlement.settlement);
  assert.equal(settlement.settlement.status, 'won');
  assert.equal(settlement.settlement.pnl, 92.0);
  assert.equal(settlement.settlement.creditedAmount, 192.0);

  // Expected balance: initialBalance - 100 + 192 = initialBalance + 92 = 592
  assert.equal(settlement.account.currentBalance, Number((initialBalance + 92).toFixed(2)));
  assert.equal(settlement.account.tradesCount, 1);
  assert.equal(settlement.account.winRate, 100.0);

  // Verify trade history in database
  const userTrades = getUserTradesFromDb(testUserId, targetAcc.id);
  assert.ok(userTrades.length > 0 && userTrades[0]);
  assert.equal(userTrades[0].id, placement.trade.id);
  assert.equal(userTrades[0].status, 'won');
});
