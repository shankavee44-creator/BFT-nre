import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSubscriptionRiskParams,
} from './copyTradingSync';

describe('copyTradingSync unit tests', () => {
  it('validates correct risk parameters successfully', () => {
    const result = validateSubscriptionRiskParams({
      trade_amount: 100,
      stop_loss: 50,
      take_profit: 150,
      max_drawdown: 5.0,
    });
    assert.equal(result.valid, true);
    assert.equal(result.error, undefined);
  });

  it('rejects non-positive trade amounts', () => {
    const res1 = validateSubscriptionRiskParams({
      trade_amount: 0,
      stop_loss: 50,
      take_profit: 150,
      max_drawdown: 5.0,
    });
    assert.equal(res1.valid, false);
    assert.match(res1.error || '', /positive number greater than 0/);

    const res2 = validateSubscriptionRiskParams({
      trade_amount: -25,
      stop_loss: 50,
      take_profit: 150,
      max_drawdown: 5.0,
    });
    assert.equal(res2.valid, false);

    const res3 = validateSubscriptionRiskParams({
      trade_amount: NaN,
      stop_loss: 50,
      take_profit: 150,
      max_drawdown: 5.0,
    });
    assert.equal(res3.valid, false);
  });

  it('rejects negative stop loss or take profit', () => {
    const resSl = validateSubscriptionRiskParams({
      trade_amount: 100,
      stop_loss: -10,
      take_profit: 150,
      max_drawdown: 5.0,
    });
    assert.equal(resSl.valid, false);
    assert.match(resSl.error || '', /Stop loss/);

    const resTp = validateSubscriptionRiskParams({
      trade_amount: 100,
      stop_loss: 50,
      take_profit: -5,
      max_drawdown: 5.0,
    });
    assert.equal(resTp.valid, false);
    assert.match(resTp.error || '', /Take profit/);
  });

  it('rejects negative max drawdown', () => {
    const resDd = validateSubscriptionRiskParams({
      trade_amount: 100,
      stop_loss: 50,
      take_profit: 150,
      max_drawdown: -2.5,
    });
    assert.equal(resDd.valid, false);
    assert.match(resDd.error || '', /Max drawdown/);
  });

  it('allows 0 for stop_loss and take_profit if user disables stops', () => {
    const res = validateSubscriptionRiskParams({
      trade_amount: 100,
      stop_loss: 0,
      take_profit: 0,
      max_drawdown: 0,
    });
    assert.equal(res.valid, true);
  });
});
