import { TradingAccount, BinaryTrade } from '../types';

export interface DailyPerformancePoint {
  date: string;
  dayNumber: number;
  dailyPnL: number;
  cumulativeProfit: number;
  winRate: number; // percentage
  tradesCount: number;
  wins: number;
  losses: number;
  drawdownPercent: number;
}

export interface PerformanceStats {
  totalProfit: number;
  averageDailyProfit: number;
  overallWinRate: number;
  profitFactor: number;
  bestDayProfit: number;
  worstDayProfit: number;
  maxWinStreak: number;
  totalTrades30Days: number;
}

export function generate30DayPerformance(
  account: TradingAccount,
  activeTrades: BinaryTrade[] = []
): { points: DailyPerformancePoint[]; stats: PerformanceStats } {
  const points: DailyPerformancePoint[] = [];
  const now = new Date();

  const completedTrades = Array.isArray(activeTrades)
    ? activeTrades.filter((t) => t.status === 'won' || t.status === 'lost' || t.status === 'tie')
    : [];

  if (completedTrades.length === 0) {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      points.push({
        date: dateStr,
        dayNumber: 30 - i,
        dailyPnL: 0,
        cumulativeProfit: 0,
        winRate: 0,
        tradesCount: 0,
        wins: 0,
        losses: 0,
        drawdownPercent: 0,
      });
    }
    return {
      points,
      stats: {
        totalProfit: 0,
        averageDailyProfit: 0,
        overallWinRate: 0,
        profitFactor: 0,
        bestDayProfit: 0,
        worstDayProfit: 0,
        maxWinStreak: 0,
        totalTrades30Days: 0,
      },
    };
  }

  let cumulative = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let bestDay = -Infinity;
  let worstDay = Infinity;
  let currentStreak = 0;
  let maxStreak = 0;

  const sortedTrades = [...completedTrades].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  for (const t of sortedTrades) {
    if (t.status === 'won') {
      currentStreak += 1;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else if (t.status === 'lost') {
      currentStreak = 0;
    }
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const dayTrades = completedTrades.filter((t) => {
      const ts = Number(t.endTime || t.startTime || 0);
      if (!ts) return i === 0;
      const td = new Date(ts);
      return (
        td.getFullYear() === d.getFullYear() &&
        td.getMonth() === d.getMonth() &&
        td.getDate() === d.getDate()
      );
    });

    let dayWins = 0;
    let dayLosses = 0;
    let dayPnL = 0;

    for (const t of dayTrades) {
      const stake = Number(t.investment || 0);
      const tradePnl =
        typeof t.pnl === 'number'
          ? t.pnl
          : t.status === 'won'
          ? Number(t.potentialPayout ?? stake * 0.85)
          : t.status === 'lost'
          ? -stake
          : 0;

      if (t.status === 'won') {
        dayWins += 1;
        dayPnL += tradePnl;
        grossWins += Math.max(0, tradePnl);
      } else if (t.status === 'lost') {
        dayLosses += 1;
        dayPnL += tradePnl;
        grossLosses += Math.abs(Math.min(0, tradePnl));
      }
    }

    cumulative += dayPnL;
    totalWins += dayWins;
    totalLosses += dayLosses;

    if (dayTrades.length > 0) {
      if (dayPnL > bestDay) bestDay = dayPnL;
      if (dayPnL < worstDay) worstDay = dayPnL;
    }

    const daySettled = dayWins + dayLosses;
    const dayWinRate = daySettled > 0 ? Number(((dayWins / daySettled) * 100).toFixed(1)) : 0;
    const safeSize = Math.max(1, Number(account.size || account.initialBalance || 10000));
    const drawdownPercent = Math.max(0, Number(((Math.abs(Math.min(0, dayPnL)) / safeSize) * 100).toFixed(2)));

    points.push({
      date: dateStr,
      dayNumber: 30 - i,
      dailyPnL: Number(dayPnL.toFixed(2)),
      cumulativeProfit: Number(cumulative.toFixed(2)),
      winRate: dayWinRate,
      tradesCount: dayTrades.length,
      wins: dayWins,
      losses: dayLosses,
      drawdownPercent,
    });
  }

  const totalTrades30Days = completedTrades.length;
  const overallWinRate =
    totalWins + totalLosses > 0 ? Number(((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)) : 0;
  const profitFactor =
    grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : grossWins > 0 ? Number(grossWins.toFixed(2)) : 0;

  return {
    points,
    stats: {
      totalProfit: Number(cumulative.toFixed(2)),
      averageDailyProfit: Number((cumulative / 30).toFixed(2)),
      overallWinRate,
      profitFactor,
      bestDayProfit: Number.isFinite(bestDay) ? Number(bestDay.toFixed(2)) : 0,
      worstDayProfit: Number.isFinite(worstDay) ? Number(worstDay.toFixed(2)) : 0,
      maxWinStreak: maxStreak,
      totalTrades30Days,
    },
  };
}

