import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTradingViewSymbol,
  computeOrderLineState,
  createTradingViewOrderLine,
  evaluateLockedTradeSettlement,
  type OrderLineSeriesHost,
} from './tradingViewOrderLineEngine';

test('resolveTradingViewSymbol maps Forex, Crypto, Stocks, and Commodities accurately', () => {
  const fx = resolveTradingViewSymbol('EUR/USD (OTC)');
  assert.equal(fx.tvSymbol, 'FX:EURUSD');
  assert.equal(fx.exchange, 'FX');
  assert.equal(fx.marketCategory, 'Forex');

  const gbpJpy = resolveTradingViewSymbol('GBP/JPY (OTC)');
  assert.equal(gbpJpy.tvSymbol, 'FX:GBPJPY');
  assert.equal(gbpJpy.marketCategory, 'Forex');

  const btc = resolveTradingViewSymbol('BTC/USDT (OTC)');
  assert.equal(btc.tvSymbol, 'BINANCE:BTCUSDT');
  assert.equal(btc.exchange, 'BINANCE');
  assert.equal(btc.marketCategory, 'Crypto');

  const aapl = resolveTradingViewSymbol('AAPL (OTC)');
  assert.equal(aapl.tvSymbol, 'NASDAQ:AAPL');
  assert.equal(aapl.exchange, 'NASDAQ');
  assert.equal(aapl.marketCategory, 'Stocks');

  const jpm = resolveTradingViewSymbol('JPM (OTC)');
  assert.equal(jpm.tvSymbol, 'NYSE:JPM');
  assert.equal(jpm.exchange, 'NYSE');
  assert.equal(jpm.marketCategory, 'Stocks');

  const gold = resolveTradingViewSymbol('XAU/USD (OTC)');
  assert.equal(gold.tvSymbol, 'OANDA:XAUUSD');
  assert.equal(gold.exchange, 'OANDA');
  assert.equal(gold.marketCategory, 'Commodities');

  const oil = resolveTradingViewSymbol('WTI/USD (OTC)');
  assert.equal(oil.tvSymbol, 'TVC:USOIL');
  assert.equal(oil.marketCategory, 'Commodities');
});

test('computeOrderLineState formats Call/Put direction, amount, timer, and dynamic Green ITM / Red OTM colors', () => {
  const now = 1_700_000_000_000;
  const callTrade = {
    id: 'TRD-101',
    asset: 'EUR/USD (OTC)',
    direction: 'CALL' as const,
    strikePrice: 1.085,
    investment: 50,
    payoutPercentage: 92,
    startTime: now,
    endTime: now + 45_000,
  };

  // In-The-Money (currentPrice > strikePrice for CALL)
  const itmState = computeOrderLineState(callTrade, 1.0858, now);
  assert.equal(itmState.isInTheMoney, true);
  assert.equal(itmState.lineColor, '#00e676');
  assert.equal(itmState.directionBadge, 'CALL ▲');
  assert.equal(itmState.formattedAmount, '$50.00');
  assert.equal(itmState.formattedTimer, '00:45');
  assert.equal(itmState.statusLabel, 'ITM');
  assert.equal(itmState.formattedPnl, '+$46.00');
  assert.equal(itmState.cancellable, false);

  // Out-Of-The-Money (currentPrice < strikePrice for CALL)
  const otmState = computeOrderLineState(callTrade, 1.0842, now + 15_000);
  assert.equal(otmState.isInTheMoney, false);
  assert.equal(otmState.lineColor, '#ff334b');
  assert.equal(otmState.formattedTimer, '00:30');
  assert.equal(otmState.statusLabel, 'OTM');
  assert.equal(otmState.formattedPnl, '-$50.00');
});

test('createTradingViewOrderLine attaches, updates dynamically, and removes upon settlement', () => {
  const createdLines: Array<Record<string, any>> = [];
  let removedCount = 0;

  const mockSeries: OrderLineSeriesHost = {
    createPriceLine(opts) {
      const record = { ...opts };
      createdLines.push(record);
      return {
        applyOptions(nextOpts) {
          Object.assign(record, nextOpts);
        },
      };
    },
    removePriceLine() {
      removedCount += 1;
    },
  };

  const now = 1_700_000_000_000;
  const putTrade = {
    id: 'TRD-202',
    asset: 'BTC/USDT (OTC)',
    direction: 'PUT' as const,
    strikePrice: 96500,
    investment: 100,
    payoutPercentage: 95,
    startTime: now,
    endTime: now + 60_000,
  };

  const initial = computeOrderLineState(putTrade, 96420, now, 2);
  const orderLine = createTradingViewOrderLine(mockSeries, initial);

  assert.equal(createdLines.length, 1);
  assert.equal(createdLines[0].price, 96500);
  assert.equal(createdLines[0].color, '#00e676'); // PUT is ITM when currentPrice < strikePrice

  // Price moves above strike -> PUT becomes OTM (Red)
  const nextState = computeOrderLineState(putTrade, 96580, now + 20_000, 2);
  orderLine.applyState(nextState);
  assert.equal(createdLines[0].color, '#ff334b');
  assert.equal(orderLine.getState().formattedTimer, '00:40');
  assert.equal(orderLine.getState().cancellable, false);

  // Remove upon trade expiration
  orderLine.remove();
  assert.equal(orderLine.isRemoved(), true);
  assert.equal(removedCount, 1);
});

test('evaluateLockedTradeSettlement enforces lock before expiry and updates balance + removes line on settlement', () => {
  const now = 1_700_000_000_000;
  const trade = {
    direction: 'CALL' as const,
    strikePrice: 230.0,
    investment: 50,
    payoutPercentage: 90,
    endTime: now + 30_000,
  };

  // Before expiry: trade is strictly locked and order line remains on chart
  const midEval = evaluateLockedTradeSettlement(trade, 231.5, 9950, now + 10_000);
  assert.equal(midEval.isLocked, true);
  assert.equal(midEval.canCloseEarly, false);
  assert.equal(midEval.shouldSettleNow, false);
  assert.equal(midEval.shouldRemoveOrderLine, false);
  assert.equal(midEval.updatedBalance, 9950);

  // At expiry (winning CALL): balance increases by stake + profit ($50 + $45 = $95 -> $10045) and order line is removed
  const winEval = evaluateLockedTradeSettlement(trade, 231.5, 9950, now + 30_000);
  assert.equal(winEval.isLocked, false);
  assert.equal(winEval.shouldSettleNow, true);
  assert.equal(winEval.shouldRemoveOrderLine, true);
  assert.equal(winEval.outcome, 'won');
  assert.equal(winEval.creditedAmount, 95);
  assert.equal(winEval.netPnl, 45);
  assert.equal(winEval.updatedBalance, 10045);

  // At expiry (losing CALL): balance remains 9950 (stake was already deducted at entry) and order line is removed
  const lossEval = evaluateLockedTradeSettlement(trade, 228.5, 9950, now + 30_000);
  assert.equal(lossEval.shouldSettleNow, true);
  assert.equal(lossEval.shouldRemoveOrderLine, true);
  assert.equal(lossEval.outcome, 'lost');
  assert.equal(lossEval.creditedAmount, 0);
  assert.equal(lossEval.netPnl, -50);
  assert.equal(lossEval.updatedBalance, 9950);
});
