import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseMarketSyncEngine, MarketTickPayload } from './supabaseMarketSync';

test('SupabaseMarketSyncEngine subscribes and broadcasts ticks correctly', async () => {
  const syncEngine = new SupabaseMarketSyncEngine();

  let receivedTick: MarketTickPayload | null = null;
  const unsubscribe = syncEngine.subscribeTicks((tick) => {
    receivedTick = tick;
  });

  const testPayload: MarketTickPayload = {
    symbol: 'EUR/USD (OTC)',
    price: 1.08452,
    prevPrice: 1.08450,
    timestamp: Date.now(),
  };

  await syncEngine.broadcastTick(testPayload);

  assert.notEqual(receivedTick, null);
  assert.equal(receivedTick?.symbol, 'EUR/USD (OTC)');
  assert.equal(receivedTick?.price, 1.08452);

  unsubscribe();
  syncEngine.cleanup();
});

test('SupabaseMarketSyncEngine handles rate-limiting and multiple listeners', async () => {
  const syncEngine = new SupabaseMarketSyncEngine();

  let count1 = 0;
  let count2 = 0;

  const un1 = syncEngine.subscribeTicks(() => { count1++; });
  const un2 = syncEngine.subscribeTicks(() => { count2++; });

  await syncEngine.broadcastTick({
    symbol: 'GBP/USD (OTC)',
    price: 1.2950,
    prevPrice: 1.2948,
    timestamp: Date.now(),
  });

  assert.equal(count1, 1);
  assert.equal(count2, 1);

  un1();
  un2();
  syncEngine.cleanup();
});
