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

  private refreshLeaderboardData() {
    try {
      const now = Date.now();
      const pool = this.getFullPool(now);

      // Sync active subscriptions PnL and enforce Max Loss Stop / Target Profit Stop
      for (const trader of pool) {
        const traderDailyRoiRatio =
          trader.starting_balance > 0 ? trader.daily_profit / trader.starting_balance : 0.02;

        db.prepare(`
          UPDATE copy_trading_subscriptions 
          SET current_pnl = ROUND(allocated_capital * ? * 0.35, 2)
          WHERE provider_id = ? AND status = 'active'
        `).run(Number(traderDailyRoiRatio.toFixed(6)), trader.id);
      }

      // Auto-terminate subscriptions that hit Stop Loss or Take Profit
      db.prepare(`
        UPDATE copy_trading_subscriptions 
        SET status = 'cancelled'
        WHERE status = 'active' 
        AND (
          (max_loss_limit > 0 AND current_pnl <= -max_loss_limit) OR
          (take_profit_limit > 0 AND current_pnl >= take_profit_limit)
        )
      `).run();
    } catch {
      // ignore background sync error
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
