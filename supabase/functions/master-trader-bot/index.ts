// Supabase Edge Function: master-trader-bot
// Refactored Master Trader / Copy Trading Bot Execution Engine
// Enforces human-like, risk-managed trading rules:
// 1. Dynamic Cooldown Delay (30s - 180s random interval between trades)
// 2. Max Trades per Hour / Session Limit (3 - 5 trades/hour cap, then paused for the rest of the hour)
// 3. Consecutive Win / Loss Cool-off Rules:
//    - 2 consecutive losses -> pause trading for 1 to 2 hours
//    - 3 consecutive wins -> close session and pause for 2 to 3 hours
// 4. Volume-Based Batch Execution (trade frequency driven strictly by master signal, batch-inserted across all copiers)
// 5. Active Trading Windows (06:00 AM - 11:59 PM local time; disabled 12:00 AM - 06:00 AM overnight)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rule 1: Dynamic Cooldown Delay (30s - 180s)
const MIN_COOLDOWN_MS = 30 * 1000;
const MAX_COOLDOWN_MS = 180 * 1000;

// Rule 2: Max Trades per Hour (3 - 5 trades/hour)
const MIN_TRADES_PER_HOUR = 3;
const MAX_TRADES_PER_HOUR = 5;

// Rule 3: Consecutive Win / Loss Cool-Off Rules
const CONSECUTIVE_LOSS_THRESHOLD = 2;
const LOSS_COOLOFF_MIN_MS = 1 * 60 * 60 * 1000; // 1 hour
const LOSS_COOLOFF_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

const CONSECUTIVE_WIN_THRESHOLD = 3;
const WIN_PAUSE_MIN_MS = 2 * 60 * 60 * 1000; // 2 hours
const WIN_PAUSE_MAX_MS = 3 * 60 * 60 * 1000; // 3 hours

// Rule 5: Overnight Trading Window Disable (12:00 AM - 06:00 AM local time)
const OVERNIGHT_START_HOUR = 0;
const OVERNIGHT_END_HOUR = 6;

const HOUSE_PAYOUT_MULTIPLIER = 0.78;
const FOLLOWER_WIN_PROBABILITY = 0.46;
const MIRROR_ASSETS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USDT', 'ETH/USDT', 'XAU/USD'];

interface MasterBotState {
  provider_id: string;
  last_trade_at_ms: number;
  next_allowed_trade_at_ms: number;
  current_hour_bucket: number;
  trades_this_hour: number;
  max_trades_for_current_hour: number;
  consecutive_wins: number;
  consecutive_losses: number;
  paused_until_ms: number;
  pause_reason: string;
}

function randomIntBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function getHourBucket(nowMs: number): number {
  return Math.floor(nowMs / 3_600_000);
}

function getEndOfHourMs(nowMs: number): number {
  return (getHourBucket(nowMs) + 1) * 3_600_000;
}

function isWithinActiveTradingHours(nowMs: number, timezoneOffsetMinutes = 0): {
  allowed: boolean;
  localHour: number;
  reason?: string;
} {
  const localDate = new Date(nowMs - timezoneOffsetMinutes * 60_000);
  const localHour = localDate.getHours();
  if (localHour >= OVERNIGHT_START_HOUR && localHour < OVERNIGHT_END_HOUR) {
    return {
      allowed: false,
      localHour,
      reason: `Overnight low-liquidity window (12:00 AM - 06:00 AM local time, hour=${localHour}:00). Bot execution disabled.`,
    };
  }
  return { allowed: true, localHour };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const nowMs = Date.now();
    const timezoneOffsetMinutes = Number(body?.timezoneOffsetMinutes ?? 0);

    // 1. Check Rule 5: Active Trading Windows / Schedule (Disable 12:00 AM - 06:00 AM local time)
    const scheduleWindow = isWithinActiveTradingHours(nowMs, timezoneOffsetMinutes);
    if (!scheduleWindow.allowed) {
      return new Response(
        JSON.stringify({
          status: 'PAUSED_OVERNIGHT',
          reason: scheduleWindow.reason,
          localHour: scheduleWindow.localHour,
          executedSignals: 0,
          batchInsertedCopierTrades: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 2. Fetch all active subscriptions and group by Master Trader (`provider_id`) for Rule 4 (Volume-Based Batch Execution)
    const { data: activeSubs, error: subError } = await supabase
      .from('copy_trading_subscriptions')
      .select('*')
      .eq('status', 'active');

    if (subError) {
      throw subError;
    }

    const subscriptions = Array.isArray(activeSubs) ? activeSubs : [];
    if (subscriptions.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'NO_ACTIVE_SUBSCRIPTIONS',
          executedSignals: 0,
          batchInsertedCopierTrades: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 3. Settle matured OPEN trades (>= 60s old) and update consecutive win/loss streaks per Master Trader
    const { data: openTrades } = await supabase
      .from('copy_executed_trades')
      .select('*')
      .eq('status', 'OPEN');

    const openSubIds = new Set<string>();
    const settledOutcomesByProvider = new Map<string, 'WIN' | 'LOSS'>();

    for (const trade of openTrades || []) {
      const createdMs = trade.created_at ? new Date(trade.created_at).getTime() : nowMs;
      if (nowMs - createdMs >= 60_000) {
        const providerId = String(trade.provider_id || trade.subscription_id);
        const isWin = settledOutcomesByProvider.has(providerId)
          ? settledOutcomesByProvider.get(providerId) === 'WIN'
          : Math.random() < FOLLOWER_WIN_PROBABILITY;
        const outcome: 'WIN' | 'LOSS' = isWin ? 'WIN' : 'LOSS';
        settledOutcomesByProvider.set(providerId, outcome);

        const entry = Number(trade.entry_price || 1.085);
        const isCall = String(trade.trade_type || 'CALL').toUpperCase() !== 'PUT';
        const delta = entry * 0.00045 * (isWin ? 1 : -1);
        const exitPrice = Number((entry + (isCall ? delta : -delta)).toFixed(5));
        const amount = Number(trade.amount || 100);
        const pnl = isWin ? Number((amount * HOUSE_PAYOUT_MULTIPLIER).toFixed(2)) : -amount;

        await supabase
          .from('copy_executed_trades')
          .update({
            exit_price: exitPrice,
            status: outcome,
            pnl,
          })
          .eq('id', trade.id);

        // Trigger check_copy_trade_limits RPC on settlement price update
        await supabase.rpc('check_copy_trade_limits', {
          p_trade_id: trade.id,
          p_current_price: exitPrice,
        });
      } else {
        openSubIds.add(String(trade.subscription_id));
      }
    }

    // Group eligible subscriptions by Master Trader (`provider_id`)
    const subsByProvider = new Map<string, any[]>();
    for (const sub of subscriptions) {
      if (openSubIds.has(String(sub.id))) continue;
      const providerId = String(sub.provider_id);
      const list = subsByProvider.get(providerId) || [];
      list.push(sub);
      subsByProvider.set(providerId, list);
    }

    let executedSignals = 0;
    let batchInsertedCopierTrades = 0;
    const providerLogs: Record<string, any> = {};

    for (const [providerId, providerSubs] of subsByProvider.entries()) {
      // Load or initialize bot state for this Master Trader
      const { data: stateRow } = await supabase
        .from('master_trader_bot_state')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();

      const hourBucket = getHourBucket(nowMs);
      let state: MasterBotState = stateRow || {
        provider_id: providerId,
        last_trade_at_ms: 0,
        next_allowed_trade_at_ms: 0,
        current_hour_bucket: hourBucket,
        trades_this_hour: 0,
        max_trades_for_current_hour: randomIntBetween(MIN_TRADES_PER_HOUR, MAX_TRADES_PER_HOUR),
        consecutive_wins: 0,
        consecutive_losses: 0,
        paused_until_ms: 0,
        pause_reason: 'NONE',
      };

      // Reset hourly counter on new hour bucket
      if (state.current_hour_bucket !== hourBucket) {
        state.current_hour_bucket = hourBucket;
        state.trades_this_hour = 0;
        state.max_trades_for_current_hour = randomIntBetween(MIN_TRADES_PER_HOUR, MAX_TRADES_PER_HOUR);
        if (state.pause_reason === 'HOURLY_TRADE_CAP_REACHED' && nowMs >= state.paused_until_ms) {
          state.paused_until_ms = 0;
          state.pause_reason = 'NONE';
        }
      }

      // Apply settled signal outcome for Rule 3 (Consecutive Win / Loss Cool-Off Rules)
      const recentOutcome = settledOutcomesByProvider.get(providerId);
      if (recentOutcome === 'LOSS') {
        state.consecutive_losses += 1;
        state.consecutive_wins = 0;
        if (state.consecutive_losses >= CONSECUTIVE_LOSS_THRESHOLD) {
          const coolOffMs = randomIntBetween(LOSS_COOLOFF_MIN_MS, LOSS_COOLOFF_MAX_MS);
          state.paused_until_ms = nowMs + coolOffMs;
          state.pause_reason = 'CONSECUTIVE_LOSS_COOLOFF';
          state.consecutive_losses = 0;
        }
      } else if (recentOutcome === 'WIN') {
        state.consecutive_wins += 1;
        state.consecutive_losses = 0;
        if (state.consecutive_wins >= CONSECUTIVE_WIN_THRESHOLD) {
          const takeProfitPauseMs = randomIntBetween(WIN_PAUSE_MIN_MS, WIN_PAUSE_MAX_MS);
          state.paused_until_ms = nowMs + takeProfitPauseMs;
          state.pause_reason = 'CONSECUTIVE_WIN_TAKE_PROFIT';
          state.consecutive_wins = 0;
        }
      }

      // Check active cool-off or session pause
      if (state.paused_until_ms > nowMs) {
        providerLogs[providerId] = {
          canExecute: false,
          reason: state.pause_reason,
          pausedUntil: new Date(state.paused_until_ms).toISOString(),
        };
        await supabase.from('master_trader_bot_state').upsert(state, { onConflict: 'provider_id' });
        continue;
      }

      // Rule 2: Check Max Trades per Hour (3 - 5 trades/hour cap)
      if (state.trades_this_hour >= state.max_trades_for_current_hour) {
        state.paused_until_ms = getEndOfHourMs(nowMs);
        state.pause_reason = 'HOURLY_TRADE_CAP_REACHED';
        providerLogs[providerId] = {
          canExecute: false,
          reason: 'HOURLY_TRADE_CAP_REACHED',
          tradesThisHour: state.trades_this_hour,
          maxTradesForCurrentHour: state.max_trades_for_current_hour,
        };
        await supabase.from('master_trader_bot_state').upsert(state, { onConflict: 'provider_id' });
        continue;
      }

      // Rule 1: Check Dynamic Cooldown Delay (30s - 180s interval between trades)
      if (state.next_allowed_trade_at_ms > nowMs) {
        providerLogs[providerId] = {
          canExecute: false,
          reason: 'COOLDOWN_DELAY_ACTIVE',
          remainingCooldownMs: state.next_allowed_trade_at_ms - nowMs,
        };
        await supabase.from('master_trader_bot_state').upsert(state, { onConflict: 'provider_id' });
        continue;
      }

      // Rule 4: Generate ONE Master Trader signal and batch-execute across all copiers
      const assetSymbol =
        MIRROR_ASSETS[Math.abs(providerId.charCodeAt(0) + Math.floor(nowMs / 15_000)) % MIRROR_ASSETS.length];
      const tradeType: 'CALL' | 'PUT' = Math.random() >= 0.45 ? 'CALL' : 'PUT';
      const fallbackPrices: Record<string, number> = {
        'EUR/USD': 1.08542,
        'GBP/USD': 1.26815,
        'USD/JPY': 154.62,
        'BTC/USDT': 89420.5,
        'ETH/USDT': 3125.4,
        'XAU/USD': 2685.3,
      };
      const entryPrice = fallbackPrices[assetSymbol] || 1.08542;

      const batchPayload = providerSubs.map((sub: any) => ({
        subscription_id: sub.id,
        user_id: sub.copier_user_id || sub.user_id,
        copier_account_id: sub.copier_account_id,
        provider_id: providerId,
        asset_symbol: assetSymbol,
        trade_type: tradeType,
        amount: Math.max(1, Number(sub.trade_amount || 100)),
        entry_price: entryPrice,
        status: 'OPEN',
        pnl: 0,
        created_at: new Date(nowMs).toISOString(),
      }));

      const { error: insertErr } = await supabase
        .from('copy_executed_trades')
        .insert(batchPayload);

      if (!insertErr) {
        const cooldownMs = randomIntBetween(MIN_COOLDOWN_MS, MAX_COOLDOWN_MS);
        state.last_trade_at_ms = nowMs;
        state.next_allowed_trade_at_ms = nowMs + cooldownMs;
        state.trades_this_hour += 1;

        if (state.trades_this_hour >= state.max_trades_for_current_hour) {
          state.paused_until_ms = getEndOfHourMs(nowMs);
          state.pause_reason = 'HOURLY_TRADE_CAP_REACHED';
        } else {
          state.paused_until_ms = 0;
          state.pause_reason = 'NONE';
        }

        await supabase.from('master_trader_bot_state').upsert(state, { onConflict: 'provider_id' });

        executedSignals += 1;
        batchInsertedCopierTrades += batchPayload.length;
        providerLogs[providerId] = {
          canExecute: true,
          assetSymbol,
          tradeType,
          copiersExecutedInBatch: batchPayload.length,
          nextCooldownSeconds: Math.round(cooldownMs / 1000),
          tradesThisHour: state.trades_this_hour,
          maxTradesForCurrentHour: state.max_trades_for_current_hour,
        };
      }
    }

    return new Response(
      JSON.stringify({
        status: 'OK',
        executedSignals,
        batchInsertedCopierTrades,
        providers: providerLogs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal execution error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
