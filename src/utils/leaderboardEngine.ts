export interface LeaderboardTrader {
  id: string;
  rank: number;
  name: string;
  country: string;
  flag: string;
  accountTier: string;
  profit: number;
  winRate: number;
  payoutTime: string;
  recentWin?: boolean;
}

export const KASUN_PERERA_ENTRY: LeaderboardTrader = {
  id: 'usr_09',
  rank: 9,
  name: 'Kasun Perera',
  country: 'Sri Lanka',
  flag: '🇱🇰',
  accountTier: '$10,000 Instant Funded',
  profit: 18995.22,
  winRate: 77.9,
  payoutTime: '1m 12s',
};

/**
 * Verified Weekly Leaderboard Traders featuring international traders from
 * Dubai (UAE), India, Malaysia, Pakistan, Sri Lanka (Kasun Perera at #9), and global hubs.
 * Strictly zero profile photos.
 */
export const WEEKLY_LEADERBOARD_TRADERS: LeaderboardTrader[] = [
  {
    id: 'usr_01',
    rank: 1,
    name: 'Rashid Al-Maktoum',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    accountTier: '$100,000 Instant Funded',
    profit: 48990.50,
    winRate: 79.4,
    payoutTime: '1m 14s',
  },
  {
    id: 'usr_02',
    rank: 2,
    name: 'Arjun Malhotra',
    country: 'India',
    flag: '🇮🇳',
    accountTier: '$50,000 Two-Step',
    profit: 42150.80,
    winRate: 77.2,
    payoutTime: '1m 28s',
  },
  {
    id: 'usr_03',
    rank: 3,
    name: 'Faizal Zulkifli',
    country: 'Malaysia',
    flag: '🇲🇾',
    accountTier: '$50,000 One-Step',
    profit: 36508.00,
    winRate: 75.8,
    payoutTime: '1m 18s',
  },
  {
    id: 'usr_04',
    rank: 4,
    name: 'Hamza Qureshi',
    country: 'Pakistan',
    flag: '🇵🇰',
    accountTier: '$25,000 Instant Funded',
    profit: 31840.40,
    winRate: 74.1,
    payoutTime: '1m 42s',
  },
  {
    id: 'usr_05',
    rank: 5,
    name: 'Tariq Al-Mansoor',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    accountTier: '$25,000 One-Step',
    profit: 28460.00,
    winRate: 72.6,
    payoutTime: '1m 31s',
  },
  {
    id: 'usr_06',
    rank: 6,
    name: 'Vikramjit Singh',
    country: 'India',
    flag: '🇮🇳',
    accountTier: '$25,000 Two-Step',
    profit: 24404.00,
    winRate: 71.3,
    payoutTime: '1m 49s',
  },
  {
    id: 'usr_07',
    rank: 7,
    name: 'Nurul Hidayah',
    country: 'Malaysia',
    flag: '🇲🇾',
    accountTier: '$10,000 One-Step',
    profit: 21940.00,
    winRate: 70.5,
    payoutTime: '1m 15s',
  },
  {
    id: 'usr_08',
    rank: 8,
    name: 'Bilal Ahmed Khan',
    country: 'Pakistan',
    flag: '🇵🇰',
    accountTier: '$10,000 Two-Step',
    profit: 19720.20,
    winRate: 69.4,
    payoutTime: '1m 36s',
  },
  KASUN_PERERA_ENTRY,
  {
    id: 'usr_10',
    rank: 10,
    name: 'Ananya Sharma',
    country: 'India',
    flag: '🇮🇳',
    accountTier: '$10,000 One-Step',
    profit: 17380.00,
    winRate: 68.1,
    payoutTime: '1m 41s',
  },
  {
    id: 'usr_11',
    rank: 11,
    name: 'Zainab Al-Hashemi',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    accountTier: '$10,000 Instant Funded',
    profit: 15940.00,
    winRate: 67.4,
    payoutTime: '1m 29s',
  },
  {
    id: 'usr_12',
    rank: 12,
    name: 'Syed Usman Ali',
    country: 'Pakistan',
    flag: '🇵🇰',
    accountTier: '$10,000 Two-Step',
    profit: 14820.50,
    winRate: 66.8,
    payoutTime: '1m 52s',
  },
  {
    id: 'usr_13',
    rank: 13,
    name: 'Chong Wei Ming',
    country: 'Malaysia',
    flag: '🇲🇾',
    accountTier: '$5,000 One-Step',
    profit: 13750.00,
    winRate: 66.0,
    payoutTime: '1m 20s',
  },
  {
    id: 'usr_14',
    rank: 14,
    name: 'Rohan Deshmukh',
    country: 'India',
    flag: '🇮🇳',
    accountTier: '$10,000 Instant Funded',
    profit: 12890.10,
    winRate: 65.2,
    payoutTime: '1m 47s',
  },
  {
    id: 'usr_15',
    rank: 15,
    name: 'Khalid Bin Zayed',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    accountTier: '$5,000 Two-Step',
    profit: 11940.00,
    winRate: 64.5,
    payoutTime: '1m 30s',
  },
  {
    id: 'usr_16',
    rank: 16,
    name: 'Aamir Raza',
    country: 'Pakistan',
    flag: '🇵🇰',
    accountTier: '$5,000 One-Step',
    profit: 11120.40,
    winRate: 63.9,
    payoutTime: '1m 44s',
  },
  {
    id: 'usr_17',
    rank: 17,
    name: 'Aisyah Rahman',
    country: 'Malaysia',
    flag: '🇲🇾',
    accountTier: '$5,000 One-Step',
    profit: 10450.00,
    winRate: 63.1,
    payoutTime: '1m 19s',
  },
  {
    id: 'usr_18',
    rank: 18,
    name: 'Karthik Nair',
    country: 'India',
    flag: '🇮🇳',
    accountTier: '$5,000 Instant Funded',
    profit: 9940.00,
    winRate: 62.4,
    payoutTime: '1m 35s',
  },
  {
    id: 'usr_19',
    rank: 19,
    name: 'Saeed Al-Nuaimi',
    country: 'Dubai, UAE',
    flag: '🇦🇪',
    accountTier: '$5,000 Two-Step',
    profit: 9680.50,
    winRate: 61.8,
    payoutTime: '1m 50s',
  },
  {
    id: 'usr_20',
    rank: 20,
    name: 'Danial Hakim',
    country: 'Malaysia',
    flag: '🇲🇾',
    accountTier: '$2,500 One-Step',
    profit: 9600.00,
    winRate: 61.2,
    payoutTime: '1m 26s',
  },
];

/**
 * Determines the user's leaderboard rank display.
 * Any trader with <= $0 profit or 0 active weekly trades is unranked and displays "1000+".
 */
export function resolveUserLeaderboardPosition(
  userProfit: number,
  weeklyTradesCount: number = 0,
  traders: LeaderboardTrader[] = WEEKLY_LEADERBOARD_TRADERS
): {
  isUnranked: boolean;
  rankLabel: string;
  verifiedWeeklyProfit: number;
} {
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

  if (computedRank > 1000) {
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
 * Keeps Kasun Perera anchored at 9th place with Sri Lankan flag (🇱🇰) and $18,995.22 profit
 * while ordering other traders by profit.
 */
export function normalizeWeeklyLeaderboard(traders: LeaderboardTrader[]): LeaderboardTrader[] {
  const others = traders
    .filter((t) => t.id !== 'usr_09' && t.name !== 'Kasun Perera')
    .sort((a, b) => b.profit - a.profit);

  const result: LeaderboardTrader[] = [];
  let rankCounter = 1;

  for (const trader of others) {
    if (rankCounter === 9) {
      result.push({ ...KASUN_PERERA_ENTRY, rank: 9 });
      rankCounter++;
    }
    result.push({ ...trader, rank: rankCounter });
    rankCounter++;
  }

  if (!result.some((t) => t.rank === 9 && t.name === 'Kasun Perera')) {
    result.splice(8, 0, { ...KASUN_PERERA_ENTRY, rank: 9 });
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

