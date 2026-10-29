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

export const WEEKLY_LEADERBOARD_TRADERS: LeaderboardTrader[] = [];

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

