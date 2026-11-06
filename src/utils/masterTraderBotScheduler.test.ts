import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_MIN_COOLDOWN_MS,
  BOT_MAX_COOLDOWN_MS,
  BOT_MIN_TRADES_PER_HOUR,
  BOT_MAX_TRADES_PER_HOUR,
  BOT_LOSS_COOLOFF_MIN_MS,
  BOT_LOSS_COOLOFF_MAX_MS,
  BOT_WIN_TAKE_PROFIT_MIN_MS,
  BOT_WIN_TAKE_PROFIT_MAX_MS,
  generateDynamicTradeCooldownMs,
  generateHourlyTradeLimit,
  evaluateActiveTradingWindow,
  createInitialMasterBotState,
  evaluateMasterSignalEligibility,
  recordMasterSignalExecution,
  recordMasterSignalOutcome,
  groupActiveSubscriptionsByProvider,
  resetAllMasterTraderBotStatesForTests,
} from './masterTraderBotScheduler';

test('Rule 1: Dynamic Cooldown Delay generates random delay strictly between 30s and 180s and blocks sequential trades', () => {
  resetAllMasterTraderBotStatesForTests();

  for (const r of [0, 0.15, 0.5, 0.85, 0.9999]) {
    const delayMs = generateDynamicTradeCooldownMs(() => r);
    assert.ok(
      delayMs >= BOT_MIN_COOLDOWN_MS && delayMs <= BOT_MAX_COOLDOWN_MS,
      `Expected delay ${delayMs}ms to be within [30000, 180000]`
    );
  }

  const baseNow = new Date('2026-05-12T14:00:00Z').getTime();
  let state = createInitialMasterBotState('provider-alpha', baseNow, () => 0.5);

  // First trade during active session (2:00 PM local hour override = 14) is eligible
  const firstCheck = evaluateMasterSignalEligibility({
    state,
    nowMs: baseNow,
    localHourOverride: 14,
  });
  assert.equal(firstCheck.canExecute, true);

  // Execute trade with rng = 0.5 -> cooldown ~105s
  state = recordMasterSignalExecution({
    state: firstCheck.state,
    nowMs: baseNow,
    rng: () => 0.5,
  });
  const assignedCooldown = state.nextEligibleTradeAt - baseNow;
  assert.ok(assignedCooldown >= 30_000 && assignedCooldown <= 180_000);

  // Attempt immediate sequential trade 10 seconds later -> must be blocked by COOLDOWN_DELAY
  const tooEarlyCheck = evaluateMasterSignalEligibility({
    state,
    nowMs: baseNow + 10_000,
    localHourOverride: 14,
  });
  assert.equal(tooEarlyCheck.canExecute, false);
  assert.equal(tooEarlyCheck.reason, 'COOLDOWN_DELAY');

  // After cooldown expires -> eligible again
  const afterCooldownCheck = evaluateMasterSignalEligibility({
    state,
    nowMs: state.nextEligibleTradeAt + 1000,
    localHourOverride: 14,
  });
  assert.equal(afterCooldownCheck.canExecute, true);
});

test('Rule 2: Max Trades per Hour caps trades at 3 - 5 per hour and pauses bot for the rest of the hour', () => {
  resetAllMasterTraderBotStatesForTests();

  for (const r of [0, 0.4, 0.99]) {
    const cap = generateHourlyTradeLimit('provider-cap', Date.now(), () => r);
    assert.ok(cap >= BOT_MIN_TRADES_PER_HOUR && cap <= BOT_MAX_TRADES_PER_HOUR);
  }

  // Start at 10:00:00 AM
  const hourStartMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  // rng = 0 -> maxTradesThisHour = 3
  let state = createInitialMasterBotState('provider-hourly', hourStartMs, () => 0);
  assert.equal(state.maxTradesThisHour, 3);

  let currentClock = hourStartMs + 60_000;
  for (let i = 1; i <= 3; i++) {
    const check = evaluateMasterSignalEligibility({
      state,
      nowMs: currentClock,
      localHourOverride: 10,
    });
    assert.equal(check.canExecute, true, `Trade #${i} should be allowed`);
    state = recordMasterSignalExecution({
      state: check.state,
      nowMs: currentClock,
      cooldownOverrideMs: 30_000,
    });
    currentClock += 35_000;
  }

  assert.equal(state.tradesExecutedThisHour, 3);
  assert.equal(state.pauseReason, 'HOURLY_TRADE_LIMIT');

  // 4th trade within the same hour must be blocked
  const fourthCheck = evaluateMasterSignalEligibility({
    state,
    nowMs: currentClock,
    localHourOverride: 10,
  });
  assert.equal(fourthCheck.canExecute, false);
  assert.equal(fourthCheck.reason, 'HOURLY_TRADE_LIMIT');

  // Advance to the next hour -> hourly counter resets and bot resumes
  const nextHourClock = hourStartMs + 3_600_000 + 5_000;
  const nextHourCheck = evaluateMasterSignalEligibility({
    state: fourthCheck.state,
    nowMs: nextHourClock,
    localHourOverride: 11,
  });
  assert.equal(nextHourCheck.canExecute, true);
  assert.equal(nextHourCheck.state.tradesExecutedThisHour, 0);
});

test('Rule 3a: Consecutive Loss Protection pauses trading for 1 to 2 hours after 2 consecutive losses', () => {
  resetAllMasterTraderBotStatesForTests();

  const nowMs = 1_750_000_000_000;
  let state = createInitialMasterBotState('provider-loss-guard', nowMs);

  // 1st loss -> not paused yet
  const loss1 = recordMasterSignalOutcome({
    state,
    outcome: 'LOSS',
    nowMs,
    rng: () => 0.5,
  });
  state = loss1.updatedState;
  assert.equal(state.consecutiveLosses, 1);
  assert.equal(state.pausedUntilMs, 0);
  assert.equal(loss1.triggeredPause, false);

  // 2nd consecutive loss -> paused for 1 to 2 hours
  const loss2 = recordMasterSignalOutcome({
    state,
    outcome: 'LOSS',
    nowMs: nowMs + 60_000,
    rng: () => 0.5,
  });
  state = loss2.updatedState;
  assert.equal(loss2.triggeredPause, true);
  assert.equal(state.consecutiveLosses, 0); // streak reset upon entering cool-off
  assert.equal(state.pauseReason, 'CONSECUTIVE_LOSS_COOL_OFF');

  const pauseDuration = state.pausedUntilMs - (nowMs + 60_000);
  assert.ok(
    pauseDuration >= BOT_LOSS_COOLOFF_MIN_MS && pauseDuration <= BOT_LOSS_COOLOFF_MAX_MS,
    `Expected loss cool-off ${pauseDuration}ms to be between 1h and 2h`
  );

  // Attempting to trade 30 minutes later must be blocked
  const duringCooloff = evaluateMasterSignalEligibility({
    state,
    nowMs: nowMs + 30 * 60_000,
    localHourOverride: 14,
  });
  assert.equal(duringCooloff.canExecute, false);
  assert.equal(duringCooloff.reason, 'CONSECUTIVE_LOSS_COOL_OFF');
});

test('Rule 3b: Consecutive Win Take-Profit closes session and pauses for 2 to 3 hours after 3 consecutive wins', () => {
  resetAllMasterTraderBotStatesForTests();

  const nowMs = 1_750_000_000_000;
  let state = createInitialMasterBotState('provider-win-tp', nowMs);

  state = recordMasterSignalOutcome({
    state,
    outcome: 'WIN',
    nowMs,
    rng: () => 0.5,
  }).updatedState;
  assert.equal(state.consecutiveWins, 1);

  state = recordMasterSignalOutcome({
    state,
    outcome: 'WIN',
    nowMs: nowMs + 60_000,
    rng: () => 0.5,
  }).updatedState;
  assert.equal(state.consecutiveWins, 2);
  assert.equal(state.pausedUntilMs, 0);

  // 3rd consecutive win -> closes session and pauses for 2 to 3 hours
  const win3 = recordMasterSignalOutcome({
    state,
    outcome: 'WIN',
    nowMs: nowMs + 120_000,
    rng: () => 0.5,
  });
  state = win3.updatedState;
  assert.equal(win3.triggeredPause, true);
  assert.equal(state.consecutiveWins, 0);
  assert.equal(state.pauseReason, 'CONSECUTIVE_WIN_TAKE_PROFIT');

  const pauseDuration = state.pausedUntilMs - (nowMs + 120_000);
  assert.ok(
    pauseDuration >= BOT_WIN_TAKE_PROFIT_MIN_MS &&
      pauseDuration <= BOT_WIN_TAKE_PROFIT_MAX_MS,
    `Expected win take-profit pause ${pauseDuration}ms to be between 2h and 3h`
  );

  // Attempting to trade 90 minutes later must still be blocked
  const duringSessionPause = evaluateMasterSignalEligibility({
    state,
    nowMs: nowMs + 90 * 60_000,
    localHourOverride: 15,
  });
  assert.equal(duringSessionPause.canExecute, false);
  assert.equal(duringSessionPause.reason, 'CONSECUTIVE_WIN_TAKE_PROFIT');
});

test('Rule 4: Volume-Based Batch Execution groups all copiers per Master Trader so trade frequency does not increase with copier count', () => {
  resetAllMasterTraderBotStatesForTests();

  const mockSubscriptions = [
    { id: 'sub-1', provider_id: 'master-1', copier_user_id: 'u-1', status: 'active' },
    { id: 'sub-2', provider_id: 'master-1', copier_user_id: 'u-2', status: 'active' },
    { id: 'sub-3', provider_id: 'master-1', copier_user_id: 'u-3', status: 'active' },
    { id: 'sub-4', provider_id: 'master-2', copier_user_id: 'u-4', status: 'active' },
    { id: 'sub-5', provider_id: 'master-1', copier_user_id: 'u-5', status: 'stopped' },
  ];

  const grouped = groupActiveSubscriptionsByProvider(mockSubscriptions);
  assert.equal(grouped.size, 2);
  assert.equal(grouped.get('master-1')?.length, 3);
  assert.equal(grouped.get('master-2')?.length, 1);

  // Executing one signal for 'master-1' increments tradesExecutedThisHour by 1 regardless of having 3 copiers
  const nowMs = Date.now();
  let master1State = createInitialMasterBotState('master-1', nowMs, () => 0.5);
  master1State = recordMasterSignalExecution({ state: master1State, nowMs });
  assert.equal(master1State.tradesExecutedThisHour, 1);
});

test('Rule 5: Active Trading Windows disables execution during overnight hours (12:00 AM - 06:00 AM local time) and enables during active hours', () => {
  resetAllMasterTraderBotStatesForTests();

  for (const overnightHour of [0, 1, 2, 3, 4, 5]) {
    const windowCheck = evaluateActiveTradingWindow(Date.now(), overnightHour);
    assert.equal(
      windowCheck.allowed,
      false,
      `Expected hour ${overnightHour}:00 to be blocked during overnight window`
    );

    const state = createInitialMasterBotState('provider-overnight', Date.now());
    const eligibility = evaluateMasterSignalEligibility({
      state,
      nowMs: Date.now(),
      localHourOverride: overnightHour,
    });
    assert.equal(eligibility.canExecute, false);
    assert.equal(eligibility.reason, 'OVERNIGHT_OFF_HOURS');
  }

  for (const activeHour of [6, 9, 12, 16, 20, 23]) {
    const windowCheck = evaluateActiveTradingWindow(Date.now(), activeHour);
    assert.equal(
      windowCheck.allowed,
      true,
      `Expected hour ${activeHour}:00 to be allowed during active market sessions`
    );

    const state = createInitialMasterBotState('provider-daytime', Date.now());
    const eligibility = evaluateMasterSignalEligibility({
      state,
      nowMs: Date.now(),
      localHourOverride: activeHour,
    });
    assert.equal(eligibility.canExecute, true);
  }
});
