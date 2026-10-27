import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import { TradingAccount, BinaryTrade } from '../types';
import { generate30DayPerformance, DailyPerformancePoint } from '../utils/performanceData';

interface PerformanceOverviewProps {
  account: TradingAccount;
  trades?: BinaryTrade[];
}

export const PerformanceOverview: React.FC<PerformanceOverviewProps> = ({ account, trades = [] }) => {
  const [chartMode, setChartMode] = useState<'cumulative' | 'winrate' | 'daily' | 'composed'>('cumulative');

  // Memoize generated 30-day performance curve
  const { points, stats } = useMemo(() => {
    return generate30DayPerformance(account, trades);
  }, [account.id, account.currentBalance, account.winRate, trades.length]);

  // Custom Recharts Dark Tooltip - Matte Black with Subtle Gold Border
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data: DailyPerformancePoint = payload[0].payload;
      return (
        <div className="p-3.5 rounded-xl bg-[#090e1a]/95 border border-amber-500/40 shadow-2xl backdrop-blur-md text-xs font-mono space-y-1 z-50">
          <div className="text-slate-200 font-bold border-b border-slate-800 pb-1 mb-1 flex items-center justify-between gap-4">
            <span>{label} (Day {data.dayNumber})</span>
            <span className="text-[10px] text-amber-400 font-sans">{data.tradesCount} Trades</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Daily P&L:</span>
            <span className={data.dailyPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {data.dailyPnL >= 0 ? '+' : ''}${data.dailyPnL.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Cumulative:</span>
            <span className={data.cumulativeProfit >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {data.cumulativeProfit >= 0 ? '+' : ''}${data.cumulativeProfit.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Win Rate:</span>
            <span className="text-amber-400 font-bold">{data.winRate}%</span>
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
            {data.wins}W / {data.losses}L • Drawdown: {data.drawdownPercent}%
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-2xl bg-[#090e1a] border border-slate-800 p-5 sm:p-6 space-y-6 shadow-xl">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2 font-mono">
                <span>30-Day Performance Overview</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Analytics
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Daily win rate consistency and cumulative net profit trend for {account.id}
              </p>
            </div>
          </div>
        </div>

        {/* Chart View Modes */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#060a14] border border-slate-800 rounded-xl self-start sm:self-auto font-mono text-xs">
          {[
            { id: 'cumulative', label: 'Cumulative Profit ($)' },
            { id: 'winrate', label: 'Win Rate (%)' },
            { id: 'daily', label: 'Daily P&L' },
            { id: 'composed', label: 'Combined Trend' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setChartMode(mode.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartMode === mode.id
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-500/20 glow-gold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6 Performance Stat Badges - Matte Black Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">30D Net Profit</span>
          <span className={`text-base font-black font-mono mt-0.5 block ${stats.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-amber-400 font-mono font-medium">
            {stats.totalProfit >= 0 ? '+' : ''}{((stats.totalProfit / account.initialBalance) * 100).toFixed(1)}% Return
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">Overall Win Rate</span>
          <span className="text-base font-black text-amber-400 font-mono mt-0.5 block">
            {stats.overallWinRate.toFixed(1)}%
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {stats.totalTrades30Days} Executed Trades
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">Profit Factor</span>
          <span className="text-base font-black text-white font-mono mt-0.5 block">
            {stats.profitFactor.toFixed(2)}
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">
            Avg: +${stats.averageDailyProfit.toFixed(1)}/day
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">Max Win Streak</span>
          <span className="text-base font-black text-amber-400 font-mono mt-0.5 block">
            {stats.maxWinStreak} Trades
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Limit: {account.maxOverallLossPercent}% DD
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">Best Day P&L</span>
          <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block">
            +${stats.bestDayProfit.toFixed(0)}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Worst: -${Math.abs(stats.worstDayProfit).toFixed(0)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-[#060a14] border border-slate-800 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block font-mono">Compliance Score</span>
          <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            100%
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">Zero Rule Breaches</span>
        </div>
      </div>

      {/* Main Recharts Visualization - Neon Gold & Mint Palette */}
      <div className="h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'cumulative' ? (
            /* Cumulative Net Profit Area Chart - Neon Gold */
            <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `$${val}`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="cumulativeProfit"
                stroke="#f59e0b"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#goldGrad)"
                name="Cumulative Profit"
              />
            </AreaChart>
          ) : chartMode === 'winrate' ? (
            /* Daily Win Rate Line Chart - Mint Green */
            <LineChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis stroke="#64748b" domain={[40, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `${val}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={65} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Target: 65%', fill: '#f59e0b', fontSize: 10 }} />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#10b981', strokeWidth: 1, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#34d399', stroke: '#ffffff' }}
                name="Win Rate"
              />
            </LineChart>
          ) : chartMode === 'daily' ? (
            /* Daily P&L Bar Chart - Mint Green & Rose Red */
            <BarChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `$${val}`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#475569" />
              <Bar dataKey="dailyPnL" name="Daily P&L" radius={[4, 4, 0, 0]}>
                {points.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.dailyPnL >= 0 ? '#10b981' : '#f43f5e'}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            /* Combined Composed Chart (Dual Axis: P&L Bars + Win Rate Line) */
            <ComposedChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(val) => `$${val}`} />
              <YAxis yAxisId="right" orientation="right" domain={[40, 100]} stroke="#f59e0b" tick={{ fontSize: 10, fill: '#f59e0b' }} tickFormatter={(val) => `${val}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine yAxisId="left" y={0} stroke="#475569" />
              <Bar yAxisId="left" dataKey="dailyPnL" name="Daily P&L ($)" radius={[3, 3, 0, 0]}>
                {points.map((entry, index) => (
                  <Cell
                    key={`cell-comp-${index}`}
                    fill={entry.dailyPnL >= 0 ? '#10b981' : '#f43f5e'}
                    fillOpacity={0.7}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="winRate"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
                name="Win Rate (%)"
              />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
