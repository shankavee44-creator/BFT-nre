import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOCIAL_TRADING_TOP_24H_TRADERS,
  generate200TraderPool,
  queryCopyTradersPool,
} from './copyTradingRules';

test('SOCIAL_TRADING_TOP_24H_TRADERS has exact rank 1 trader user11101163 with profile stats matching screenshot', () => {
  assert.equal(SOCIAL_TRADING_TOP_24H_TRADERS.length, 12);
  const rank1 = SOCIAL_TRADING_TOP_24H_TRADERS[0];
  assert.equal(rank1.numeric_id, '11101163');
  assert.equal(rank1.social_profile_id, '11101163');
  assert.equal(rank1.display_handle, 'user11101163');
  assert.equal(rank1.full_legal_name, 'Abdulla Ishaq Abdulla Mulla Ali A.');
  assert.equal(rank1.profile_level, 'Guru');
  assert.equal(rank1.account_level, 6);
  assert.equal(rank1.status_text, 'last seen recently');
  assert.equal(rank1.followers_count, 75);
  assert.equal(rank1.watchers_count, 155);
  assert.equal(rank1.trades_24h, 80);
  assert.equal(rank1.trades_today_profile, 79);
  assert.equal(rank1.daily_profit, 14495.8);
  assert.equal(rank1.profitable_trades_pct, 61);
  assert.equal(rank1.trading_turnover, 64306.41);
  assert.equal(rank1.trading_profit, 14245.3);
  assert.equal(rank1.max_trade, 2722.94);
  assert.equal(rank1.min_trade, 272.26);
  assert.equal(rank1.max_profit, 2505.11);
});

test('queryCopyTradersPool finds social traders by numeric ID or handle', () => {
  const pool = generate200TraderPool();
  const byId = queryCopyTradersPool({ pool, searchQuery: '11101163' });
  assert.equal(byId.isSearchActive, true);
  assert.ok(byId.traders.length >= 1);
  assert.equal(byId.traders[0].numeric_id, '11101163');

  const byHandle = queryCopyTradersPool({ pool, category: 'all', searchQuery: 'Maksimys' });
  assert.ok(byHandle.traders.some((t) => t.display_handle === 'Maksimys'));
});
