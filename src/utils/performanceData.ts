import { TradingAccount } from '../types';

export interface PerformancePoint {
  day: number;
  date: string;
  profit: number;
  cumulativeProfit: number;
  tradesCount: number;
}

export interface PerformanceStats {
  totalProfit: number;
  overallWinRate: number;
  totalTrades30Days: number;
  profitFactor: number;
}

export function generate30DayPerformance(account: TradingAccount): {
  points: PerformancePoint[];
  stats: PerformanceStats;
} {
  const targetProfit = (account.currentBalance ?? account.size) - (account.initialBalance ?? account.size);
  const points: PerformancePoint[] = [];
  const totalDays = 30;

  let currentCum = 0;
  for (let i = 1; i <= totalDays; i++) {
    const isLast = i === totalDays;
    let cum = isLast ? targetProfit : Math.round((targetProfit * (i / totalDays)) * 100) / 100;
    const dailyProfit = Math.round((cum - currentCum) * 100) / 100;
    currentCum = cum;

    points.push({
      day: i,
      date: `Day ${i}`,
      profit: dailyProfit,
      cumulativeProfit: cum,
      tradesCount: Math.max(1, Math.floor((account.tradesCount || 20) / totalDays)),
    });
  }

  const winRate = account.winRate && account.winRate > 0 ? account.winRate : 68.5;
  const totalTrades = Math.max(points.length, account.tradesCount || 30);
  const profitFactor = targetProfit >= 0 ? 1.85 : 0.65;

  return {
    points,
    stats: {
      totalProfit: targetProfit,
      overallWinRate: winRate,
      totalTrades30Days: totalTrades,
      profitFactor,
    },
  };
}
