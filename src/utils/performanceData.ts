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
  const baseWinRate = account.winRate > 0 ? account.winRate : 68;
  const currentNetProfit = account.currentBalance - account.initialBalance;

  // Generate 30 days of trading curve ending at current account state
  let cumulative = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let bestDay = -Infinity;
  let worstDay = Infinity;
  let currentStreak = 0;
  let maxStreak = 0;

  const now = new Date();

  // Distribute profit curve naturally over 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    // Weekends have zero trades or minor OTC
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const dailyTrades = isWeekend ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 4) + 2;

    let dayWins = 0;
    let dayLosses = 0;
    let dayPnL = 0;

    for (let t = 0; t < dailyTrades; t++) {
      const isWin = Math.random() * 100 <= baseWinRate;
      const stake = (account.size * 0.01) + (Math.random() * 20); // ~ 1%
      if (isWin) {
        dayWins++;
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
        const gain = stake * 0.88;
        dayPnL += gain;
        grossWins += gain;
      } else {
        dayLosses++;
        currentStreak = 0;
        dayPnL -= stake;
        grossLosses += stake;
      }
    }

    // On the last day (today), calibrate to match actual account current profit
    if (i === 0 && currentNetProfit !== 0) {
      const adjustment = currentNetProfit - cumulative;
      dayPnL = Number(adjustment.toFixed(2));
      cumulative = currentNetProfit;
    } else {
      cumulative += dayPnL;
    }

    totalWins += dayWins;
    totalLosses += dayLosses;

    if (dayPnL > bestDay) bestDay = dayPnL;
    if (dayPnL < worstDay) worstDay = dayPnL;

    const dayWinRate = dailyTrades > 0 ? Math.round((dayWins / dailyTrades) * 100) : baseWinRate;
    const drawdownPercent = Math.max(0, Number(((Math.abs(Math.min(0, dayPnL)) / account.size) * 100).toFixed(2)));

    points.push({
      date: dateStr,
      dayNumber: 30 - i,
      dailyPnL: Number(dayPnL.toFixed(2)),
      cumulativeProfit: Number(cumulative.toFixed(2)),
      winRate: dayWinRate,
      tradesCount: dailyTrades,
      wins: dayWins,
      losses: dayLosses,
      drawdownPercent,
    });
  }

  const totalTrades30Days = totalWins + totalLosses;
  const overallWinRate = totalTrades30Days > 0 ? Number(((totalWins / totalTrades30Days) * 100).toFixed(1)) : baseWinRate;
  const profitFactor = grossLosses > 0 ? Number((grossWins / grossLosses).toFixed(2)) : 2.5;

  return {
    points,
    stats: {
      totalProfit: Number(cumulative.toFixed(2)),
      averageDailyProfit: Number((cumulative / 30).toFixed(2)),
      overallWinRate,
      profitFactor,
      bestDayProfit: Number(bestDay.toFixed(2)),
      worstDayProfit: Number(worstDay.toFixed(2)),
      maxWinStreak: Math.max(maxStreak, 4),
      totalTrades30Days,
    },
  };
}
