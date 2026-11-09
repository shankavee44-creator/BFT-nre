export interface LeaderboardTrader {
  id: string;
  rank: number;
  name: string;
  country: string;
  flag: string;
  isoCode?: string;
  accountTier: string;
  profit: number;
  winRate: number;
  payoutTime: string;
  recentWin?: boolean;
}

export const YOHAN_SIRIWARDHANA_ENTRY: LeaderboardTrader = {
  id: 'usr_07',
  rank: 7,
  name: 'Yohan Siriwardhana',
  country: 'Sri Lanka',
  flag: '🇱🇰',
  isoCode: 'LK',
  accountTier: '$50,000 Instant Funded',
  profit: 29456.71,
  winRate: 78.4,
  payoutTime: '1m 15s',
};

// Backwards compatibility alias if needed
export const KASUN_PERERA_ENTRY = YOHAN_SIRIWARDHANA_ENTRY;

export const WEEKLY_LEADERBOARD_TRADERS: LeaderboardTrader[] = [
  { id: 'usr_01', rank: 1, name: 'Rashid Al-Maktoum', country: 'Dubai, UAE', flag: '🇦🇪', isoCode: 'AE', accountTier: '$100,000 Instant Funded', profit: 66456.11, winRate: 81.2, payoutTime: '1m 14s' },
  { id: 'usr_02', rank: 2, name: 'Arjun Malhotra', country: 'India', flag: '🇮🇳', isoCode: 'IN', accountTier: '$100,000 Two-Step', profit: 54120.80, winRate: 79.5, payoutTime: '1m 28s' },
  { id: 'usr_03', rank: 3, name: 'Hamza Qureshi', country: 'Pakistan', flag: '🇵🇰', isoCode: 'PK', accountTier: '$50,000 Instant Funded', profit: 46890.40, winRate: 77.8, payoutTime: '1m 35s' },
  { id: 'usr_04', rank: 4, name: 'Tanvir Hossain', country: 'Bangladesh', flag: '🇧🇩', isoCode: 'BD', accountTier: '$50,000 One-Step', profit: 39540.00, winRate: 76.2, payoutTime: '1m 22s' },
  { id: 'usr_05', rank: 5, name: 'Tariq Al-Mansoor', country: 'Dubai, UAE', flag: '🇦🇪', isoCode: 'AE', accountTier: '$50,000 One-Step', profit: 34820.50, winRate: 75.1, payoutTime: '1m 31s' },
  { id: 'usr_06', rank: 6, name: 'Vikramjit Singh', country: 'India', flag: '🇮🇳', isoCode: 'IN', accountTier: '$25,000 Two-Step', profit: 31250.00, winRate: 74.3, payoutTime: '1m 49s' },
  YOHAN_SIRIWARDHANA_ENTRY,
  { id: 'usr_08', rank: 8, name: 'Bilal Ahmed Khan', country: 'Pakistan', flag: '🇵🇰', isoCode: 'PK', accountTier: '$25,000 Two-Step', profit: 26840.20, winRate: 72.9, payoutTime: '1m 36s' },
  { id: 'usr_09', rank: 9, name: 'Faizal Zulkifli', country: 'Malaysia', flag: '🇲🇾', isoCode: 'MY', accountTier: '$25,000 Instant Funded', profit: 23410.00, winRate: 71.8, payoutTime: '1m 18s' },
  { id: 'usr_10', rank: 10, name: 'Ananya Sharma', country: 'India', flag: '🇮🇳', isoCode: 'IN', accountTier: '$25,000 One-Step', profit: 20780.00, winRate: 70.4, payoutTime: '1m 41s' },
  { id: 'usr_11', rank: 11, name: 'Zainab Al-Hashemi', country: 'Dubai, UAE', flag: '🇦🇪', isoCode: 'AE', accountTier: '$10,000 Instant Funded', profit: 18650.00, winRate: 69.2, payoutTime: '1m 29s' },
  { id: 'usr_12', rank: 12, name: 'Syed Usman Ali', country: 'Pakistan', flag: '🇵🇰', isoCode: 'PK', accountTier: '$10,000 Two-Step', profit: 16920.50, winRate: 68.1, payoutTime: '1m 52s' },
  { id: 'usr_13', rank: 13, name: 'Shakib Rahman', country: 'Bangladesh', flag: '🇧🇩', isoCode: 'BD', accountTier: '$10,000 One-Step', profit: 15340.00, winRate: 67.5, payoutTime: '1m 38s' },
  { id: 'usr_14', rank: 14, name: 'Rohan Deshmukh', country: 'India', flag: '🇮🇳', isoCode: 'IN', accountTier: '$10,000 Instant Funded', profit: 13890.10, winRate: 66.3, payoutTime: '1m 47s' },
  { id: 'usr_15', rank: 15, name: 'Alexander Schmidt', country: 'Germany', flag: '🇩🇪', isoCode: 'DE', accountTier: '$10,000 Two-Step', profit: 12450.00, winRate: 65.7, payoutTime: '1m 30s' },
];

/**
 * Validates if an account qualifies for Leaderboard calculation.
 * Strictly excludes Demo accounts, Personal (self-funded) accounts, and active Evaluation Challenge accounts.
 * Only Live/Active Funded Accounts qualify.
 */
export function isEligibleLeaderboardAccount(account?: any | null): boolean {
  if (!account) return false;
  
  const tier = (account.tier || '').toLowerCase();
  const category = (account.accountCategory || account.account_category || '').toLowerCase();
  const phase = (account.phase || '').toLowerCase();
  const id = (account.id || '').toUpperCase();

  // 1. Exclude Demo
  if (tier === 'demo' || category === 'demo' || phase === 'demo' || id.startsWith('BFT-DEMO')) {
    return false;
  }

  // 2. Exclude Personal Live (Self-Funded)
  if (tier === 'personal' || category === 'personal_live' || phase === 'personal_live' || id.includes('PERS')) {
    return false;
  }

  // 3. Exclude Active Evaluation Challenge phase
  if (phase === 'phase_1' || phase === 'phase_2' || phase === 'evaluation' || phase === 'step_1' || phase === 'step_2') {
    return false;
  }

  // 4. Require Funded status
  const isFunded = phase === 'funded' || tier === 'instant' || account.status === 'passed' || account.status === 'active_funded';
  return isFunded;
}

/**
 * Determines the user's leaderboard rank display.
 * Any trader with <= $0 profit, 0 active weekly trades, or ranked below 20th place (position 21+) displays "1000+".
 */
export function resolveUserLeaderboardPosition(
  userProfit: number,
  weeklyTradesCount: number = 0,
  traders: LeaderboardTrader[] = WEEKLY_LEADERBOARD_TRADERS,
  account?: any | null
): {
  isUnranked: boolean;
  rankLabel: string;
  verifiedWeeklyProfit: number;
} {
  // If account is supplied and not a Live Funded Account, return 1000+ unranked
  if (account && !isEligibleLeaderboardAccount(account)) {
    return {
      isUnranked: true,
      rankLabel: '1000+',
      verifiedWeeklyProfit: 0,
    };
  }

  const cleanProfit = Number.isFinite(userProfit) ? Number(userProfit.toFixed(2)) : 0;
  if (cleanProfit <= 0 || weeklyTradesCount <= 0) {
    return {
      isUnranked: true,
      rankLabel: '1000+',
      verifiedWeeklyProfit: 0,
    };
  }

  // Find where user's real profit ranks among top traders
  const higherCount = traders.filter((t) => t.profit > cleanProfit).length;
  const computedRank = higherCount + 1;

  // Position Display Logic ("1000+"): For any trader ranked below 20th place or below the leaderboard cutoff, display "1000+"
  if (computedRank > 20 || (traders.length > 0 && computedRank > traders.length)) {
    return {
      isUnranked: true,
      rankLabel: '1000+',
      verifiedWeeklyProfit: cleanProfit,
    };
  }

  return {
    isUnranked: false,
    rankLabel: `#${computedRank}`,
    verifiedWeeklyProfit: cleanProfit,
  };
}

/**
 * Keeps Yohan Siriwardhana anchored at 7th place with Sri Lankan flag (🇱🇰) and $29,456.71 profit
 * while ordering other traders by profit.
 */
export function normalizeWeeklyLeaderboard(traders: LeaderboardTrader[]): LeaderboardTrader[] {
  const others = traders
    .filter((t) => t.id !== YOHAN_SIRIWARDHANA_ENTRY.id && t.name !== 'Yohan Siriwardhana' && t.name !== 'Kasun Perera')
    .sort((a, b) => b.profit - a.profit);

  const result: LeaderboardTrader[] = [];
  let rankCounter = 1;

  for (const trader of others) {
    if (rankCounter === 7) {
      result.push({ ...YOHAN_SIRIWARDHANA_ENTRY, rank: 7 });
      rankCounter++;
    }
    result.push({ ...trader, rank: rankCounter });
    rankCounter++;
  }

  if (!result.some((t) => t.rank === 7 && t.name === 'Yohan Siriwardhana')) {
    result.splice(6, 0, { ...YOHAN_SIRIWARDHANA_ENTRY, rank: 7 });
  }

  return result.slice(0, 20).map((t, index) => ({
    ...t,
    rank: index + 1,
  }));
}

/**
 * Calculates the Monday 00:00 UTC weekly reset schedule.
 */
export function getMondayWeeklyResetInfo(nowMs: number = Date.now()): {
  weekStartIso: string;
  nextMondayIso: string;
  daysUntilMonday: number;
  hoursUntilMonday: number;
  resetScheduleLabel: string;
} {
  const now = new Date(nowMs);
  const utcDay = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const daysSinceMonday = (utcDay + 6) % 7;

  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0,
      0,
      0,
      0
    )
  );

  const nextMonday = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const diffMs = Math.max(0, nextMonday.getTime() - nowMs);
  const daysUntilMonday = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hoursUntilMonday = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return {
    weekStartIso: weekStart.toISOString().split('T')[0],
    nextMondayIso: nextMonday.toISOString().split('T')[0],
    daysUntilMonday,
    hoursUntilMonday,
    resetScheduleLabel: `Resets Monday 00:00 UTC (${daysUntilMonday}d ${hoursUntilMonday}h)`,
  };
}

/**
 * Formats a leaderboard entry strictly into the clean Quotex mobile/desktop row format:
 * Rank number, Country flag, Trader name, and Profit amount (+$...).
 */
export function formatCleanLeaderboardRow(trader: LeaderboardTrader): {
  rank: number;
  rankDisplay: string;
  flag: string;
  name: string;
  profitFormatted: string;
  isTopThree: boolean;
} {
  const cleanProfit = Number.isFinite(trader.profit) ? trader.profit : 0;
  return {
    rank: trader.rank,
    rankDisplay: `${trader.rank}`,
    flag: trader.flag,
    name: trader.name,
    profitFormatted: `+$${cleanProfit.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    isTopThree: trader.rank >= 1 && trader.rank <= 3,
  };
}

