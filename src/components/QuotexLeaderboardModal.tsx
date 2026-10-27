import React, { useState, useEffect } from 'react';
import { X, Trophy, Medal, Award, TrendingUp, DollarSign, Activity, Sparkles } from 'lucide-react';
import { soundEngine } from '../utils/soundEffects';

export interface LeaderboardTrader {
  id: string;
  rank: number;
  name: string;
  country: string;
  flag: string;
  avatarUrl: string;
  accountTier: string;
  profit: number;
  winRate: number;
  payoutTime: string;
  recentWin?: boolean;
}

const INITIAL_TRADERS: LeaderboardTrader[] = [
  { id: 'usr_01', rank: 1, name: 'Viktor Dragov', country: 'Poland', flag: '🇵🇱', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 4890.5, winRate: 78.4, payoutTime: '1m 24s' },
  { id: 'usr_02', rank: 2, name: 'Sora Takahashi', country: 'Japan', flag: '🇯🇵', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Two-Step', profit: 4210.0, winRate: 76.1, payoutTime: '1m 45s' },
  { id: 'usr_03', rank: 3, name: 'Lucas Silva', country: 'Brazil', flag: '🇧🇷', avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 One-Step', profit: 3650.8, winRate: 74.5, payoutTime: '1m 18s' },
  { id: 'usr_04', rank: 4, name: 'Elena Rostova', country: 'Germany', flag: '🇩🇪', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 3180.0, winRate: 73.2, payoutTime: '2m 02s' },
  { id: 'usr_05', rank: 5, name: 'Alex Mercer (You)', country: 'United Kingdom', flag: '🇬🇧', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 2546.0, winRate: 71.5, payoutTime: '1m 32s' },
  { id: 'usr_06', rank: 6, name: 'Tariq Al-Mansoor', country: 'UAE', flag: '🇦🇪', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 One-Step', profit: 2240.4, winRate: 70.3, payoutTime: '1m 50s' },
  { id: 'usr_07', rank: 7, name: 'Chloe Tremblay', country: 'France', flag: '🇫🇷', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 1940.0, winRate: 69.8, payoutTime: '1m 15s' },
  { id: 'usr_08', rank: 8, name: 'David Harris', country: 'Canada', flag: '🇨🇦', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 Two-Step', profit: 1720.2, winRate: 68.4, payoutTime: '1m 38s' },
  { id: 'usr_09', rank: 9, name: 'Mateo Rossi', country: 'Italy', flag: '🇮🇹', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 1540.0, winRate: 67.9, payoutTime: '1m 29s' },
  { id: 'usr_10', rank: 10, name: 'Ananya Sharma', country: 'India', flag: '🇮🇳', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 1380.0, winRate: 67.1, payoutTime: '1m 41s' },
];

interface QuotexLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfit?: number;
}

export const QuotexLeaderboardModal: React.FC<QuotexLeaderboardModalProps> = ({
  isOpen,
  onClose,
  userProfit = 2546.0,
}) => {
  const [traders, setTraders] = useState<LeaderboardTrader[]>(INITIAL_TRADERS);
  const [lastUpdatedTraderId, setLastUpdatedTraderId] = useState<string | null>(null);

  // Dynamic simulation of live trading updates
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setTraders((prev) => {
        const next = [...prev];
        // Pick a random simulated trader (excluding "You" to keep user profit accurate)
        const eligibleIndices = next
          .map((t, idx) => (!t.name.includes('(You)') ? idx : -1))
          .filter((idx) => idx !== -1);

        const randomIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
        const target = next[randomIndex];
        const gain = Math.floor(Math.random() * 45) + 15;
        target.profit = Number((target.profit + gain).toFixed(2));
        target.recentWin = true;

        setLastUpdatedTraderId(target.id);
        setTimeout(() => setLastUpdatedTraderId(null), 2500);

        // Re-sort by profit
        next.sort((a, b) => b.profit - a.profit);
        return next.map((t, index) => ({ ...t, rank: index + 1 }));
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl bg-[#090e1a] border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] font-mono">
        {/* Header */}
        <div className="p-4 bg-[#060a14] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white font-sans flex items-center gap-2">
                Funded Traders Leaderboard
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Sync
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-sans">
                Real-time verified TRC-20 payouts & performance benchmarks
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Podium Top 3 */}
        <div className="grid grid-cols-3 gap-2 p-3.5 bg-[#070c18] border-b border-slate-800 text-center">
          <div className="p-2.5 rounded-xl bg-[#0a1020] border border-slate-800 flex flex-col items-center">
            <Medal className="w-5 h-5 text-slate-400 mb-1" />
            <img src={traders[1].avatarUrl} alt={traders[1].name} className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-400 mb-1" />
            <div className="text-[10px] text-slate-400 uppercase font-bold">2nd Place</div>
            <div className="font-bold text-white text-xs truncate max-w-[120px]">{traders[1].name} {traders[1].flag}</div>
            <div className="text-emerald-400 font-black text-xs">+${traders[1].profit.toLocaleString()}</div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 shadow-lg glow-gold flex flex-col items-center scale-105">
            <Trophy className="w-6 h-6 text-amber-400 mb-1" />
            <img src={traders[0].avatarUrl} alt={traders[0].name} className="w-9 h-9 rounded-full object-cover ring-2 ring-amber-400 mb-1" />
            <div className="text-[10px] text-amber-400 uppercase font-black">1st Place</div>
            <div className="font-black text-white text-xs truncate max-w-[130px]">{traders[0].name} {traders[0].flag}</div>
            <div className="text-amber-400 font-black text-xs">+${traders[0].profit.toLocaleString()}</div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#0a1020] border border-slate-800 flex flex-col items-center">
            <Award className="w-5 h-5 text-amber-700 mb-1" />
            <img src={traders[2].avatarUrl} alt={traders[2].name} className="w-8 h-8 rounded-full object-cover ring-2 ring-amber-700 mb-1" />
            <div className="text-[10px] text-slate-400 uppercase font-bold">3rd Place</div>
            <div className="font-bold text-white text-xs truncate max-w-[120px]">{traders[2].name} {traders[2].flag}</div>
            <div className="text-emerald-400 font-black text-xs">+${traders[2].profit.toLocaleString()}</div>
          </div>
        </div>

        {/* List of Traders */}
        <div className="p-3 overflow-y-auto divide-y divide-slate-800/60 flex-1 text-xs">
          {traders.map((user) => {
            const isMe = user.name.includes('(You)');
            const wasJustUpdated = lastUpdatedTraderId === user.id;

            return (
              <div
                key={user.id}
                className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                  isMe
                    ? 'bg-amber-500/15 border border-amber-500/30'
                    : wasJustUpdated
                    ? 'bg-emerald-950/40 border border-emerald-500/40'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-5 text-center font-black ${
                    user.rank === 1 ? 'text-amber-400' :
                    user.rank === 2 ? 'text-slate-300' :
                    user.rank === 3 ? 'text-amber-600' : 'text-slate-500'
                  }`}>
                    #{user.rank}
                  </span>

                  <img
                    src={user.avatarUrl}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover ring-1 ring-slate-700"
                  />

                  <div>
                    <div className="font-black text-white flex items-center gap-1.5">
                      <span>{user.name}</span>
                      <span>{user.flag}</span>
                      {isMe && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black">
                          YOU
                        </span>
                      )}
                      {wasJustUpdated && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40 animate-pulse">
                          +Trade
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">{user.accountTier}</span>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-right">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Win Rate</span>
                    <span className="font-bold text-amber-400">{user.winRate}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Profit Payout</span>
                    <span className="font-black text-emerald-400">+${user.profit.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#060a14] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1 text-emerald-400 font-bold">
            <Activity className="w-3.5 h-3.5" /> Payouts Dispatched in ~1m 32s
          </span>
          <span className="text-slate-400">TRON TRC-20 Real-Time Relay</span>
        </div>
      </div>
    </div>
  );
};
