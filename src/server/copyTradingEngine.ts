import { db } from './db.ts';
import {
  MAX_COPIERS_PER_TRADER,
  MIN_PROVIDER_WIN_RATE_3M,
  LEADERBOARD_TOP_LIMIT,
  FOLLOWER_PROFIT_SHARE_PERCENT,
  MASTER_COMMISSION_PERCENT,
  generate200TraderPool,
  queryCopyTradersPool,
  getRotationWindowInfo,
  evaluateProviderEligibility,
  type CopyTraderProfileData,
} from '../utils/copyTradingRules.ts';

export class CopyTradingEngine {
  private static instance: CopyTradingEngine;
  private updateInterval: NodeJS.Timeout | null = null;
  private customProviders: Map<string, CopyTraderProfileData> = new Map();

  private constructor() {}

  public static getInstance(): CopyTradingEngine {
    if (!CopyTradingEngine.instance) {
      CopyTradingEngine.instance = new CopyTradingEngine();
    }
    return CopyTradingEngine.instance;
  }

  public async start() {
    this.seedInitialTraders();
    this.refreshLeaderboardData();
    this.updateInterval = setInterval(() => this.refreshLeaderboardData(), 5000);
  }

  public stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  private seedInitialTraders() {
    try {
      const count = Number(
        (db.prepare('SELECT COUNT(*) as c FROM copy_trading_profiles').get() as { c: number }).c
      );
      if (count >= 200) return;

      const now = Date.now();
      const pool = generate200TraderPool(now);

      const insert = db.prepare(`
        INSERT OR REPLACE INTO copy_trading_profiles (
          id, user_id, name, country, flag, avatar, category, strategy_name, vip_level,
          starting_capital, current_balance, lifetime_earnings, daily_profit_dollars,
          weekly_profit_pct, monthly_profit_pct, win_rate, total_trades, trading_turnover,
          total_copiers, max_copiers, win_rate_3m, profit_factor, max_drawdown, sharpe_ratio, avg_holding_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      if (typeof (db as any).transaction === 'function') {
        const tx = (db as any).transaction((items: CopyTraderProfileData[]) => {
          for (const t of items) {
            insert.run(
              t.id,
              t.user_id || `usr_${t.numeric_id}`,
              t.provider_name,
              t.country,
              t.flag,
              t.avatar_url,
              t.account_category,
              t.strategy_title,
              t.vip_level,
              t.starting_balance,
              t.current_balance,
              t.all_time_withdrawals,
              t.daily_profit,
              t.weekly_profit_pct,
              t.monthly_profit_pct,
              t.win_rate_3m,
              t.total_trades,
              t.starting_balance * 18,
              t.current_copiers,
              MAX_COPIERS_PER_TRADER,
              t.win_rate_3m,
              t.profit_factor,
              t.max_drawdown,
              t.sharpe_ratio,
              t.avg_holding_time,
              now
            );
          }
        });
        tx(pool);
      } else {
        db.exec('BEGIN TRANSACTION;');
        try {
          for (const t of pool) {
            insert.run(
              t.id,
              t.user_id || `usr_${t.numeric_id}`,
              t.provider_name,
              t.country,
              t.flag,
              t.avatar_url,
              t.account_category,
              t.strategy_title,
              t.vip_level,
              t.starting_balance,
              t.current_balance,
              t.all_time_withdrawals,
              t.daily_profit,
              t.weekly_profit_pct,
              t.monthly_profit_pct,
              t.win_rate_3m,
              t.total_trades,
              t.starting_balance * 18,
              t.current_copiers,
              MAX_COPIERS_PER_TRADER,
              t.win_rate_3m,
              t.profit_factor,
              t.max_drawdown,
              t.sharpe_ratio,
              t.avg_holding_time,
              now
            );
          }
          db.exec('COMMIT;');
        } catch (e) {
          db.exec('ROLLBACK;');
          throw e;
        }
      }
    } catch (err) {
      console.warn('CopyTradingEngine seedInitialTraders warning:', err);
    }
  }

  private lastBackendTradeAtBySub: Map<string, number> = new Map();

  private static readonly HOUSE_PAYOUT_MULTIPLIER = 0.78;
  private static readonly HOUSE_SPREAD_RETAINED_MULTIPLIER = 0.22;
  private static readonly FOLLOWER_WIN_PROBABILITY = 0.46;

  private recordBackendPlatformRevenue(params: {
    tradeId: string;
    subscriptionId: string;
    copierUserId: string;
    copierAccountId: string;
    investmentAmount: number;
    outcome: 'WIN' | 'LOSS';
    settlementReason:
      | 'EXPIRATION_LOSS'
      | 'EXPIRATION_WIN'
      | 'STOP_LOSS_CUTOFF'
      | 'MAX_DRAWDOWN_CUTOFF';
    now: number;
  }) {
    try {
      const amt = Math.max(0, Number(params.investmentAmount || 0));
      const winPayout = Number((amt * CopyTradingEngine.HOUSE_PAYOUT_MULTIPLIER).toFixed(2));
      const spreadRetained =
        params.outcome === 'WIN'
          ? Number((amt * CopyTradingEngine.HOUSE_SPREAD_RETAINED_MULTIPLIER).toFixed(2))
          : 0;
      // On any LOSS or risk-cutoff liquidation, 100% of the investment amount transfers to the platform revenue pool
      const platformCredit = params.outcome === 'LOSS' ? amt : -winPayout;
      const followerDelta = params.outcome === 'LOSS' ? -amt : winPayout;
      const isCutoff =
        params.settlementReason === 'STOP_LOSS_CUTOFF' ||
        params.settlementReason === 'MAX_DRAWDOWN_CUTOFF';

      db.prepare(`
        UPDATE platform_revenue_pool
        SET
          pool_balance = ROUND(COALESCE(pool_balance, 2500000.0) + ?, 2),
          total_lost_stakes_captured = ROUND(COALESCE(total_lost_stakes_captured, 0.0) + ?, 2),
          total_win_payouts_disbursed = ROUND(COALESCE(total_win_payouts_disbursed, 0.0) + ?, 2),
          total_spread_retained = ROUND(COALESCE(total_spread_retained, 0.0) + ?, 2),
          total_cutoff_liquidations = ROUND(COALESCE(total_cutoff_liquidations, 0.0) + ?, 2),
          trades_settled_count = COALESCE(trades_settled_count, 0) + 1,
          updated_at = ?
        WHERE id = 'HOUSE_POOL_MAIN'
      `).run(
        platformCredit,
        params.outcome === 'LOSS' ? amt : 0,
        params.outcome === 'WIN' ? winPayout : 0,
        spreadRetained,
        params.outcome === 'LOSS' && isCutoff ? amt : 0,
        params.now
      );

      db.prepare(`
        INSERT OR REPLACE INTO platform_revenue_ledger (
          id, trade_id, subscription_id, copier_user_id, copier_account_id,
          investment_amount, platform_credit, house_spread_retained, settlement_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `PRL-${params.tradeId}`,
        params.tradeId,
        params.subscriptionId,
        params.copierUserId,
        params.copierAccountId,
        amt,
        platformCredit,
        spreadRetained,
        params.settlementReason,
        params.now
      );

      if (params.copierAccountId) {
        db.prepare(`
          UPDATE trading_accounts
          SET
            current_balance = MAX(0, ROUND(COALESCE(current_balance, 0) + ?, 2)),
            equity = MAX(0, ROUND(COALESCE(equity, 0) + ?, 2))
          WHERE id = ?
        `).run(followerDelta, followerDelta, params.copierAccountId);
      }
    } catch {
      // ignore if ledger update fails
    }
  }

  private refreshLeaderboardData() {
    try {
      const now = Date.now();
      const pool = this.getFullPool(now);

      // 1. Settle matured OPEN trades in copy_executed_trades and update subscription PnL
      this.settleAndExecuteBackendMirroredTrades(now, pool);

      // 2. Trigger check_copy_trade_limits logic to automatically stop out or take profit when limits are reached
      this.checkCopyTradeLimits();
    } catch {
      // ignore background sync error
    }
  }

  public checkCopyTradeLimits() {
    try {
      const now = Date.now();
      const activeSubs = db
        .prepare(`SELECT * FROM copy_trading_subscriptions WHERE status = 'active'`)
        .all() as any[];

      for (const sub of activeSubs) {
        const subId = String(sub.id);
        const stopLoss = Number(sub.stop_loss ?? sub.max_loss_limit ?? 0);
        const takeProfit = Number(sub.take_profit ?? sub.take_profit_limit ?? 0);
        const maxDrawdownPct = Number(sub.max_drawdown ?? 5.0);
        const currentRealizedPnl = Number(sub.current_pnl ?? 0);

        const openTrades = db
          .prepare(
            `SELECT * FROM copy_executed_trades WHERE subscription_id = ? AND status = 'OPEN'`
          )
          .all(subId) as any[];

        // Conservative capital-protection valuation of open risk exposure
        const openExposure = openTrades.reduce(
          (sum, tr) => sum + Math.max(0, Number(tr.amount || sub.trade_amount || 100)),
          0
        );
        const worstCasePnl = Number((currentRealizedPnl - openExposure).toFixed(2));

        let startingBal = 50000;
        if (sub.copier_account_id) {
          const accRow = db
            .prepare(
              `SELECT initial_balance, current_balance FROM trading_accounts WHERE id = ?`
            )
            .get(String(sub.copier_account_id)) as
            | { initial_balance?: number; current_balance?: number }
            | undefined;
          if (accRow && Number(accRow.initial_balance || accRow.current_balance || 0) > 0) {
            startingBal = Number(accRow.initial_balance || accRow.current_balance || 50000);
          }
        }

        const drawdownPct =
          worstCasePnl < 0
            ? Number(((Math.abs(worstCasePnl) / startingBal) * 100).toFixed(2))
            : 0;

        const hitStopLoss = stopLoss > 0 && worstCasePnl <= -stopLoss;
        const hitMaxDrawdown = maxDrawdownPct > 0 && drawdownPct >= maxDrawdownPct;
        const hitTakeProfit = takeProfit > 0 && currentRealizedPnl >= takeProfit;

        if (hitStopLoss || hitMaxDrawdown) {
          const cutoffReason = hitStopLoss ? 'STOP_LOSS_CUTOFF' : 'MAX_DRAWDOWN_CUTOFF';

          // Force-close all open positions securely in favor of the platform's capital structure
          for (const openTr of openTrades) {
            const amt = Math.max(0, Number(openTr.amount || sub.trade_amount || 100));
            const entry = Number(openTr.entry_price || 1.085);
            const isCall = String(openTr.trade_type || 'CALL').toUpperCase() !== 'PUT';
            const adverseExitPrice = Number(
              (entry * (isCall ? 0.9991 : 1.0009)).toFixed(5)
            );
            const lossPnl = -amt;

            db.prepare(
              `UPDATE copy_executed_trades SET exit_price = ?, status = 'LOSS', pnl = ? WHERE id = ?`
            ).run(adverseExitPrice, lossPnl, openTr.id);

            db.prepare(
              `UPDATE copy_trading_subscriptions SET current_pnl = ROUND(COALESCE(current_pnl, 0) + ?, 2) WHERE id = ?`
            ).run(lossPnl, subId);

            this.recordBackendPlatformRevenue({
              tradeId: String(openTr.id),
              subscriptionId: subId,
              copierUserId: String(
                openTr.copier_user_id || sub.copier_user_id || sub.user_id || 'usr_bft_001'
              ),
              copierAccountId: String(
                openTr.copier_account_id || sub.copier_account_id || 'BFT-LIVE'
              ),
              investmentAmount: amt,
              outcome: 'LOSS',
              settlementReason: cutoffReason,
              now,
            });
          }

          db.prepare(
            `UPDATE copy_trading_subscriptions SET status = 'cancelled' WHERE id = ?`
          ).run(subId);
        } else if (hitTakeProfit) {
          db.prepare(
            `UPDATE copy_trading_subscriptions SET status = 'cancelled' WHERE id = ?`
          ).run(subId);
        }
      }
    } catch {
      // ignore
    }
  }

  private settleAndExecuteBackendMirroredTrades(now: number, pool: CopyTraderProfileData[]) {
    try {
      const openRows = db
        .prepare(`SELECT * FROM copy_executed_trades WHERE status = 'OPEN'`)
        .all() as any[];

      for (const row of openRows) {
        const createdMs = Number(row.created_at || now);
        if (now - createdMs >= 60000) {
          const entry = Number(row.entry_price || 1.085);
          // House-favorable settlement: 46% follower win rate and 78% binary payout on wins
          const isWin = Math.random() < CopyTradingEngine.FOLLOWER_WIN_PROBABILITY;
          const isCall = String(row.trade_type || 'CALL').toUpperCase() !== 'PUT';
          const delta = entry * 0.00045 * (isWin ? 1 : -1);
          const exitPrice = Number((entry + (isCall ? delta : -delta)).toFixed(5));
          const amt = Number(row.amount || 100);
          const pnl = isWin
            ? Number((amt * CopyTradingEngine.HOUSE_PAYOUT_MULTIPLIER).toFixed(2))
            : -amt;
          const finalStatus = isWin ? 'WIN' : 'LOSS';

          db.prepare(
            `UPDATE copy_executed_trades SET exit_price = ?, status = ?, pnl = ? WHERE id = ?`
          ).run(exitPrice, finalStatus, pnl, row.id);

          db.prepare(
            `UPDATE copy_trading_subscriptions SET current_pnl = ROUND(COALESCE(current_pnl, 0) + ?, 2) WHERE id = ?`
          ).run(pnl, row.subscription_id);

          this.recordBackendPlatformRevenue({
            tradeId: String(row.id),
            subscriptionId: String(row.subscription_id),
            copierUserId: String(row.copier_user_id || 'usr_bft_001'),
            copierAccountId: String(row.copier_account_id || 'BFT-LIVE'),
            investmentAmount: amt,
            outcome: finalStatus,
            settlementReason: isWin ? 'EXPIRATION_WIN' : 'EXPIRATION_LOSS',
            now,
          });
        }
      }

      const activeSubs = db
        .prepare(`SELECT * FROM copy_trading_subscriptions WHERE status = 'active'`)
        .all() as any[];

      const assets = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'BTC/USDT', 'ETH/USDT', 'XAU/USD'];
      const basePrices: Record<string, number> = {
        'EUR/USD': 1.08542,
        'GBP/USD': 1.26815,
        'USD/JPY': 154.62,
        'BTC/USDT': 89420.5,
        'ETH/USDT': 3125.4,
        'XAU/USD': 2685.3,
      };

      for (const sub of activeSubs) {
        const subId = String(sub.id);
        const lastAt = this.lastBackendTradeAtBySub.get(subId) || 0;
        if (now - lastAt < 45000) continue;

        const hasOpen = db
          .prepare(
            `SELECT COUNT(*) as c FROM copy_executed_trades WHERE subscription_id = ? AND status = 'OPEN'`
          )
          .get(subId) as { c: number };
        if (Number(hasOpen?.c || 0) > 0) continue;

        const tradeAmount = Math.max(
          1,
          Number(sub.trade_amount ?? sub.allocated_capital ?? 100)
        );
        const assetSymbol = assets[Math.floor(Math.random() * assets.length)];
        const tradeType = Math.random() >= 0.45 ? 'CALL' : 'PUT';
        const entryPrice = basePrices[assetSymbol] || 1.08542;
        const execId = `CET-${subId.slice(0, 8)}-${now.toString(36)}`;

        db.prepare(`
          INSERT INTO copy_executed_trades (
            id, subscription_id, copier_user_id, copier_account_id, provider_id,
            asset_symbol, trade_type, amount, entry_price, status, pnl, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 0, ?)
        `).run(
          execId,
          subId,
          String(sub.copier_user_id || sub.user_id || 'usr_bft_001'),
          String(sub.copier_account_id || 'BFT-LIVE'),
          String(sub.provider_id),
          assetSymbol,
          tradeType,
          tradeAmount,
          entryPrice,
          now
        );

        this.lastBackendTradeAtBySub.set(subId, now);
      }
    } catch {
      // ignore
    }
  }

  public getFullPool(nowMs: number = Date.now()): CopyTraderProfileData[] {
    const basePool = generate200TraderPool(nowMs);
    const customList = Array.from(this.customProviders.values());
    if (customList.length === 0) return basePool;
    return [...customList, ...basePool];
  }

  public getLeaderboard(
    category: 'instant_funded' | 'self_capital' | 'all' = 'instant_funded',
    searchQuery: string = '',
    limit: number = LEADERBOARD_TOP_LIMIT
  ) {
    const now = Date.now();
    const pool = this.getFullPool(now);
    const result = queryCopyTradersPool({
      pool,
      category,
      searchQuery,
      limit,
    });
    const rotation = getRotationWindowInfo(now);
    return {
      traders: result.traders,
      totalPoolCount: result.totalPoolCount,
      isSearchActive: result.isSearchActive,
      rotation,
    };
  }

  public registerCustomProvider(params: {
    userId: string;
    providerName: string;
    countryCode?: string;
    country?: string;
    flag?: string;
    category: 'instant_funded' | 'self_capital';
    strategyTitle: string;
    startingBalance?: number;
    winRate3m: number;
  }): { ok: boolean; error?: string; provider?: CopyTraderProfileData } {
    const eligibility = evaluateProviderEligibility({
      explicitWinRate90d: params.winRate3m,
    });
    if (!eligibility.eligible) {
      return {
        ok: false,
        error: eligibility.message,
      };
    }

    const numericId = String(100301 + this.customProviders.size);
    const id =
      params.category === 'instant_funded' ? `trd_if_${numericId}` : `trd_sc_${numericId}`;
    const startBal =
      params.startingBalance || (params.category === 'instant_funded' ? 50000 : 5000);
    const dailyProfit = Number((startBal * 0.065).toFixed(2));
    const weeklyProfit = Number((startBal * 0.21).toFixed(2));
    const monthlyProfit = Number((startBal * 0.58).toFixed(2));
    const threeMonthProfit = Number((startBal * 1.45).toFixed(2));

    const newProvider: CopyTraderProfileData = {
      id,
      numeric_id: numericId,
      user_id: params.userId,
      provider_name: params.providerName,
      country_code: params.countryCode || 'US',
      country: params.country || 'United States',
      flag: params.flag || '🇺🇸',
      avatar_url: params.flag || '🇺🇸',
      account_category: params.category,
      account_type_label:
        params.category === 'instant_funded'
          ? `Instant Funded ($${(startBal / 1000).toFixed(0)}K)`
          : 'Self-Capital Live',
      strategy_title: params.strategyTitle || 'Verified Master Strategy',
      tier_name:
        params.category === 'instant_funded'
          ? `$${(startBal / 1000).toFixed(0)}K Instant Funded`
          : 'Self-Capital Account',
      vip_level: 'Master Trader',
      starting_balance: startBal,
      current_balance: Number((startBal + dailyProfit).toFixed(2)),
      all_time_withdrawals: Number((threeMonthProfit * 0.75).toFixed(2)),
      lifetime_earnings: Number((threeMonthProfit * 0.75).toFixed(2)),
      daily_profit: dailyProfit,
      daily_profit_pct: 6.5,
      weekly_profit: weeklyProfit,
      weekly_profit_pct: 21.0,
      monthly_profit: monthlyProfit,
      monthly_profit_pct: 58.0,
      three_month_profit: threeMonthProfit,
      three_month_profit_pct: 145.0,
      win_rate_3m: Number(params.winRate3m.toFixed(1)),
      profit_factor: 2.4,
      max_drawdown: 3.1,
      sharpe_ratio: 2.05,
      avg_holding_time: '2m 30s',
      total_trades: 310,
      current_copiers: 1,
      max_copiers: MAX_COPIERS_PER_TRADER,
      commission_pct: MASTER_COMMISSION_PERCENT,
      follower_profit_keep_pct: FOLLOWER_PROFIT_SHARE_PERCENT,
      is_custom_provider: true,
    };

    this.customProviders.set(id, newProvider);
    return {
      ok: true,
      provider: newProvider,
    };
  }
}
