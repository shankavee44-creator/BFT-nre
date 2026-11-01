import { db } from './db.ts';

interface CopyTraderProfile {
  id: string;
  user_id: string;
  name: string;
  country: string;
  flag: string;
  avatar: string;
  category: 'instant_funded' | 'self_capital';
  strategy_name: string;
  vip_level: string;
  starting_capital: number;
  current_balance: number;
  lifetime_earnings: number;
  daily_profit_dollars: number;
  weekly_profit_pct: number;
  monthly_profit_pct: number;
  win_rate: number;
  total_trades: number;
  trading_turnover: number;
  total_copiers: number;
  max_copiers: number;
  win_rate_3m: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  avg_holding_time: string;
  base_daily_target: number; // The target profit for the end of the day
  volatility: number; // How much it fluctuates
}

export class CopyTradingEngine {
  private static instance: CopyTradingEngine;
  private updateInterval: NodeJS.Timeout | null = null;
  private lastResetDate: string = '';

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
    this.updateInterval = setInterval(() => this.refreshLeaderboardData(), 5000); // Update every 5 seconds for "live" feel
  }

  public stop() {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  private seedInitialTraders() {
    const count = Number((db.prepare('SELECT COUNT(*) as c FROM copy_trading_profiles').get() as { c: number }).c);
    if (count >= 200) return; // Already fully seeded

    const now = Date.now();
    const traders: Partial<CopyTraderProfile>[] = [
      // Top Tier Instant Funded (Explicitly defined for premium feel)
      { id: 'trd_i1', name: 'Viktor Vance', country: 'United Arab Emirates', flag: '🇦🇪', avatar: '🇦🇪', category: 'instant_funded', strategy_name: 'Institutional Alpha $100K', vip_level: 'VIP Elite', starting_capital: 100000, base_daily_target: 12500, volatility: 0.12, profit_factor: 2.85, max_drawdown: 3.2, sharpe_ratio: 2.1, avg_holding_time: '2h 45m' },
      { id: 'trd_i2', name: 'Kasun Perera', country: 'Sri Lanka', flag: '🇱🇰', avatar: '🇱🇰', category: 'instant_funded', strategy_name: 'Colombo Gold Scalper $50K', vip_level: 'VIP Pro', starting_capital: 50000, base_daily_target: 8200, volatility: 0.18, profit_factor: 2.45, max_drawdown: 4.5, sharpe_ratio: 1.95, avg_holding_time: '45m' },
      { id: 'trd_i3', name: 'Arjun Malhotra', country: 'India', flag: '🇮🇳', avatar: '🇮🇳', category: 'instant_funded', strategy_name: 'Mumbai Nifty Alpha $100K', vip_level: 'VIP Elite', starting_capital: 100000, base_daily_target: 9100, volatility: 0.1, profit_factor: 2.12, max_drawdown: 2.8, sharpe_ratio: 1.82, avg_holding_time: '6h 12m' },
      { id: 'trd_i4', name: 'Elena Rostova', country: 'Russia', flag: '🇷🇺', avatar: '🇷🇺', category: 'instant_funded', strategy_name: 'Siberian Gold Rush $50K', vip_level: 'VIP Pro', starting_capital: 50000, base_daily_target: 7400, volatility: 0.22, profit_factor: 3.12, max_drawdown: 12.5, sharpe_ratio: 2.45, avg_holding_time: '30m' },
      { id: 'trd_i5', name: 'Liam Davies', country: 'United Kingdom', flag: '🇬🇧', avatar: '🇬🇧', category: 'instant_funded', strategy_name: 'London Forex Scalp $50K', vip_level: 'VIP Pro', starting_capital: 50000, base_daily_target: 6200, volatility: 0.14, profit_factor: 1.98, max_drawdown: 5.2, sharpe_ratio: 1.65, avg_holding_time: '1h 50m' },
      
      // Auto-generate remaining to reach 100 Instant Funded
      ...Array.from({ length: 95 }).map((_, i) => ({
        id: `trd_i_ext_${i + 6}`,
        name: `${['Rajesh', 'Tariq', 'Faizul', 'Amir', 'Zulkifli', 'Sheikh', 'Alexander', 'Priya', 'Marco', 'Hamdan'][i % 10]} ${['Kumar', 'Mahmood', 'Islam', 'Al-Maktoum', 'Rahman', 'Al-Thani', 'Vance', 'Sharma', 'Rossi', 'Shah'][i % 10]}`,
        country: ['India', 'Pakistan', 'Bangladesh', 'United Arab Emirates', 'Malaysia', 'Qatar', 'United States', 'India', 'Italy', 'Malaysia'][i % 10],
        flag: ['🇮🇳', '🇵🇰', '🇧🇩', '🇦🇪', '🇲🇾', '🇶🇦', '🇺🇸', '🇮🇳', '🇮🇹', '🇲🇾'][i % 10],
        avatar: ['🇮🇳', '🇵🇰', '🇧🇩', '🇦🇪', '🇲🇾', '🇶🇦', '🇺🇸', '🇮🇳', '🇮🇹', '🇲🇾'][i % 10],
        category: 'instant_funded' as const,
        strategy_name: `Institutional Alpha v${i + 6}`,
        vip_level: i % 3 === 0 ? 'VIP Elite' : 'VIP Pro',
        starting_capital: [25000, 50000, 100000, 200000][i % 4],
        base_daily_target: 3000 + (Math.random() * 8000),
        volatility: 0.05 + (Math.random() * 0.15),
        profit_factor: 1.8 + Math.random() * 1.5,
        max_drawdown: 1.2 + Math.random() * 6,
        sharpe_ratio: 1.4 + Math.random() * 1.2,
        avg_holding_time: `${Math.floor(Math.random() * 12 + 1)}h ${Math.floor(Math.random() * 60)}m`
      })),
      
      // Top Tier Self Capital (Explicitly defined)
      { id: 'trd_s1', name: 'Marco Rossi', country: 'Italy', flag: '🇮🇹', avatar: '🇮🇹', category: 'self_capital', strategy_name: 'Milan OTC Scalper', vip_level: 'VIP Master', starting_capital: 5000, base_daily_target: 8500, volatility: 0.3, profit_factor: 3.45, max_drawdown: 8.5, sharpe_ratio: 2.8, avg_holding_time: '15m' },
      { id: 'trd_s2', name: 'Nimal Jayasinghe', country: 'Sri Lanka', flag: '🇱🇰', avatar: '🇱🇰', category: 'self_capital', strategy_name: 'Kandy Forex Syndicate', vip_level: 'VIP Pro', starting_capital: 2500, base_daily_target: 4200, volatility: 0.28, profit_factor: 2.15, max_drawdown: 7.2, sharpe_ratio: 1.65, avg_holding_time: '2h 10m' },
      { id: 'trd_s3', name: 'Bilal Ahmed', country: 'Pakistan', flag: '🇵🇰', avatar: '🇵🇰', category: 'self_capital', strategy_name: 'Karachi Crypto Surge', vip_level: 'VIP Pro', starting_capital: 2000, base_daily_target: 3900, volatility: 0.4, profit_factor: 2.65, max_drawdown: 15.2, sharpe_ratio: 1.95, avg_holding_time: '45m' },
      { id: 'trd_s4', name: 'Mohamed Farhan', country: 'Bangladesh', flag: '🇧🇩', avatar: '🇧🇩', category: 'self_capital', strategy_name: 'Chittagong Swing Trader', vip_level: 'VIP Pro', starting_capital: 1500, base_daily_target: 3100, volatility: 0.32, profit_factor: 1.95, max_drawdown: 9.8, sharpe_ratio: 1.45, avg_holding_time: '3d 12h' },
      { id: 'trd_s5', name: 'Azlan Shah', country: 'Malaysia', flag: '🇲🇾', avatar: '🇲🇾', category: 'self_capital', strategy_name: 'Penang FX Reversal', vip_level: 'Pro Trader', starting_capital: 2000, base_daily_target: 2500, volatility: 0.25, profit_factor: 1.85, max_drawdown: 6.2, sharpe_ratio: 1.35, avg_holding_time: '4h 20m' },

      // Auto-generate remaining to reach 100 Self Capital
      ...Array.from({ length: 95 }).map((_, i) => ({
        id: `trd_s_ext_${i + 6}`,
        name: `${['Oliver', 'Sofia', 'Lucas', 'Emma', 'David', 'Zoe', 'Hans', 'Yuki', 'Chen', 'Svetlana'][i % 10]} ${['Twist', 'Garcia', 'Bernard', 'Watson', 'Miller', 'Chen', 'Müller', 'Sato', 'Wei', 'Petrova'][i % 10]}`,
        country: ['United Kingdom', 'Spain', 'France', 'Canada', 'United States', 'Singapore', 'Germany', 'Japan', 'China', 'Russia'][i % 10],
        flag: ['🇬🇧', '🇪🇸', '🇫🇷', '🇨🇦', '🇺🇸', '🇸🇬', '🇩🇪', '🇯🇵', '🇨🇳', '🇷🇺'][i % 10],
        avatar: ['🇬🇧', '🇪🇸', '🇫🇷', '🇨🇦', '🇺🇸', '🇸🇬', '🇩🇪', '🇯🇵', '🇨🇳', '🇷🇺'][i % 10],
        category: 'self_capital' as const,
        strategy_name: `Private Equity Gen ${i + 6}`,
        vip_level: i % 3 === 0 ? 'VIP Master' : 'VIP Pro',
        starting_capital: [1000, 2500, 5000, 10000][i % 4],
        base_daily_target: 1000 + (Math.random() * 6000),
        volatility: 0.15 + (Math.random() * 0.35),
        profit_factor: 1.6 + Math.random() * 1.8,
        max_drawdown: 4 + Math.random() * 15,
        sharpe_ratio: 1.2 + Math.random() * 1.6,
        avg_holding_time: `${Math.floor(Math.random() * 8 + 1)}h ${Math.floor(Math.random() * 60)}m`
      })),
    ];

    const insert = db.prepare(`
      INSERT OR IGNORE INTO copy_trading_profiles (
        id, user_id, name, country, flag, avatar, category, strategy_name, vip_level,
        starting_capital, current_balance, lifetime_earnings, daily_profit_dollars,
        weekly_profit_pct, monthly_profit_pct, win_rate, total_trades, trading_turnover,
        total_copiers, max_copiers, win_rate_3m, profit_factor, max_drawdown, sharpe_ratio, avg_holding_time, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of traders) {
      const startCap = t.starting_capital || 10000;
      insert.run(
        String(t.id || 'trd_gen'),
        `sys_${t.id || 'gen'}`,
        t.name || 'Unknown Trader',
        t.country || 'Global',
        t.flag || '🌐',
        t.avatar || '👤',
        t.category || 'instant_funded',
        t.strategy_name || 'Global Strategy',
        t.vip_level || 'Pro',
        startCap,
        startCap, // current_balance
        startCap * (1.2 + Math.random() * 5), // lifetime_earnings
        0, // daily_profit_dollars
        10 + Math.random() * 20, // weekly_profit_pct
        30 + Math.random() * 80, // monthly_profit_pct
        65 + Math.random() * 25, // win_rate
        100 + Math.floor(Math.random() * 2000), // total_trades
        startCap * (10 + Math.random() * 50), // trading_turnover
        Math.floor(Math.random() * 450), // total_copiers
        500, // max_copiers
        65 + Math.random() * 25, // win_rate_3m
        t.profit_factor || (1.8 + Math.random() * 1.2),
        t.max_drawdown || (2 + Math.random() * 8),
        t.sharpe_ratio || (1.5 + Math.random() * 1.5),
        t.avg_holding_time || '4h 12m',
        now
      );
    }
  }

  private refreshLeaderboardData() {
    const now = new Date();
    // UTC+5:30 reset is 00:00 UTC
    const currentUtcDay = now.toISOString().split('T')[0];
    
    if (this.lastResetDate !== currentUtcDay) {
      this.lastResetDate = currentUtcDay;
      // Option to reset some stats or rotate traders
    }

    const startOfDay = new Date(now).setUTCHours(0, 0, 0, 0);
    const elapsedMs = now.getTime() - startOfDay;
    const dayProgress = Math.min(elapsedMs / (24 * 60 * 60 * 1000), 1);

    const profiles = db.prepare('SELECT * FROM copy_trading_profiles').all() as any[];
    
    const update = db.prepare(`
      UPDATE copy_trading_profiles SET
        daily_profit_dollars = ?,
        current_balance = ?,
        total_copiers = ?
      WHERE id = ?
    `);

    // 40-minute rotation logic
    const minutesSinceEpoch = Math.floor(now.getTime() / (1000 * 60));
    const rotationIndex = Math.floor(minutesSinceEpoch / 40);
    
    // Deterministic random walk based on trader ID and current time
    for (const p of profiles) {
      const baseDailyTarget = this.getTraderBaseTarget(p.id, p.starting_capital);
      
      // Calculate growth: it should grow over the day
      const sessionMulti = 0.5 + 0.5 * Math.sin((dayProgress * Math.PI * 2) - Math.PI / 2);
      
      // Add some "jitter" for real-time feel
      const jitter = (Math.sin(Date.now() / 2000 + this.getHash(p.id)) * 0.02);
      
      // Rotation factor: deterministic but changes every 40 mins per trader
      const rotationFactor = (Math.sin(rotationIndex + this.getHash(p.id)) + 1) / 2; // 0 to 1
      
      const currentDailyProfit = baseDailyTarget * (dayProgress + jitter) * sessionMulti * (0.8 + 0.4 * rotationFactor);
      const currentBalance = p.starting_capital + currentDailyProfit;
      
      // Update copiers slightly
      let totalCopiers = p.total_copiers;
      if (Math.random() > 0.98) totalCopiers = Math.min(500, totalCopiers + 1);
      if (Math.random() > 0.99) totalCopiers = Math.max(50, totalCopiers - 1);

      update.run(
        Number(currentDailyProfit.toFixed(2)),
        Number(currentBalance.toFixed(2)),
        totalCopiers,
        p.id
      );

      // --- SYNC SUBSCRIPTIONS PNL ---
      // Update PnL for all active users copying this trader
      const traderRoi = currentDailyProfit / p.starting_capital;
      
      db.prepare(`
        UPDATE copy_trading_subscriptions 
        SET current_pnl = CASE 
          WHEN trade_sizing_type = 'fixed' THEN ? * sizing_multiplier
          ELSE allocated_capital * ?
        END
        WHERE provider_id = ? AND status = 'active'
      `).run(
        Number(currentDailyProfit.toFixed(2)), // Fixed size based on trader's raw profit * multiplier
        Number(traderRoi.toFixed(6)),          // Proportionate return
        p.id
      );
    }

    // --- ENFORCE RISK LIMITS ---
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
  }

  private getTraderBaseTarget(id: string, capital: number): number {
    // Return a somewhat deterministic target based on ID
    const hash = this.getHash(id);
    const targetPct = 0.05 + (hash % 100) / 1000; // 5% to 15% daily target
    return capital * targetPct;
  }

  private getTraderVolatility(id: string): number {
    const hash = this.getHash(id);
    return 0.1 + (hash % 20) / 100;
  }

  private getHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  public getLeaderboard(category: 'instant_funded' | 'self_capital') {
    const rows = db.prepare(`
      SELECT * FROM copy_trading_profiles 
      WHERE category = ? 
      ORDER BY daily_profit_dollars DESC 
      LIMIT 20
    `).all(String(category)) as any[];

    return rows.map((r, index) => {
      // Scarcity Rule: Top 5 are fully booked
      const totalCopiers = index < 5 ? 500 : r.total_copiers;
      return {
        id: r.id,
        user_id: r.user_id,
        provider_name: r.name,
        country_code: this.getCountryCode(r.country),
        country: r.country,
        flag: r.flag,
        avatar_url: r.avatar,
        account_category: r.category,
        strategy_title: r.strategy_name,
        vip_level: r.vip_level,
        tier_name: r.vip_level === 'VIP Elite' ? '$100K Elite' : r.vip_level === 'VIP Master' ? '$200K Master' : '$50K Pro',
        starting_balance: r.starting_capital,
        current_balance: r.current_balance,
        lifetime_earnings: r.lifetime_earnings,
        daily_profit: r.daily_profit_dollars,
        daily_profit_pct: Number(((r.daily_profit_dollars / r.starting_capital) * 100).toFixed(2)),
        weekly_profit_pct: r.weekly_profit_pct,
        monthly_profit_pct: r.monthly_profit_pct,
        win_rate_3m: r.win_rate_3m,
        profit_factor: r.profit_factor,
        max_drawdown: r.max_drawdown,
        sharpe_ratio: r.sharpe_ratio,
        avg_holding_time: r.avg_holding_time,
        total_trades: r.total_trades,
        current_copiers: totalCopiers,
        max_copiers: r.max_copiers
      };
    });
  }

  private getCountryCode(country: string): string {
    const map: Record<string, string> = {
      'India': 'IN',
      'Sri Lanka': 'LK',
      'Pakistan': 'PK',
      'Bangladesh': 'BD',
      'United Arab Emirates': 'AE',
      'UAE': 'AE',
      'Qatar': 'QA',
      'Malaysia': 'MY',
      'United States': 'US',
      'USA': 'US',
      'United Kingdom': 'GB',
      'UK': 'GB',
      'Singapore': 'SG',
      'Australia': 'AU',
      'Germany': 'DE',
      'France': 'FR',
      'Italy': 'IT',
      'Brazil': 'BR',
      'Russia': 'RU',
      'Spain': 'ES'
    };
    return map[country] || 'US';
  }
}
