import React, { useState, useEffect } from 'react';
import { X, Trophy, Medal, Award, Activity, HelpCircle, ChevronDown, ChevronUp, Sparkles, UserCheck } from 'lucide-react';
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

const INITIAL_TOP_20_TRADERS: LeaderboardTrader[] = [
  { id: 'usr_01', rank: 1, name: 'Viktor Dragov', country: 'Poland', flag: '🇵🇱', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 48990.50, winRate: 78.4, payoutTime: '1m 24s' },
  { id: 'usr_02', rank: 2, name: 'Sora Takahashi', country: 'Japan', flag: '🇯🇵', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Two-Step', profit: 42100.00, winRate: 76.1, payoutTime: '1m 45s' },
  { id: 'usr_03', rank: 3, name: 'Lucas Silva', country: 'Brazil', flag: '🇧🇷', avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 One-Step', profit: 36508.00, winRate: 74.5, payoutTime: '1m 18s' },
  { id: 'usr_04', rank: 4, name: 'Elena Rostova', country: 'Germany', flag: '🇩🇪', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 31800.00, winRate: 73.2, payoutTime: '2m 02s' },
  { id: 'usr_05', rank: 5, name: 'Alex Mercer', country: 'United Kingdom', flag: '🇬🇧', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 28460.00, winRate: 71.5, payoutTime: '1m 32s' },
  { id: 'usr_06', rank: 6, name: 'Tariq Al-Mansoor', country: 'UAE', flag: '🇦🇪', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 One-Step', profit: 24404.00, winRate: 70.3, payoutTime: '1m 50s' },
  { id: 'usr_07', rank: 7, name: 'Chloe Tremblay', country: 'France', flag: '🇫🇷', avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 21940.00, winRate: 69.8, payoutTime: '1m 15s' },
  { id: 'usr_08', rank: 8, name: 'David Harris', country: 'Canada', flag: '🇨🇦', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 Two-Step', profit: 19720.20, winRate: 68.4, payoutTime: '1m 38s' },
  { id: 'usr_09', rank: 9, name: 'Kasun Perera', country: 'Sri Lanka', flag: '🇱🇰', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant Funded', profit: 18995.22, winRate: 77.9, payoutTime: '1m 12s' },
  { id: 'usr_10', rank: 10, name: 'Ananya Sharma', country: 'India', flag: '🇮🇳', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 17380.00, winRate: 67.1, payoutTime: '1m 41s' },
  { id: 'usr_11', rank: 11, name: 'Mateo Rossi', country: 'Italy', flag: '🇮🇹', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 15940.00, winRate: 66.8, payoutTime: '1m 29s' },
  { id: 'usr_12', rank: 12, name: 'Liam O’Connor', country: 'Ireland', flag: '🇮🇪', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 Two-Step', profit: 14820.50, winRate: 65.9, payoutTime: '1m 55s' },
  { id: 'usr_13', rank: 13, name: 'Yuki Tanaka', country: 'Japan', flag: '🇯🇵', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 13750.00, winRate: 65.2, payoutTime: '1m 20s' },
  { id: 'usr_14', rank: 14, name: 'Sofia Mendez', country: 'Spain', flag: '🇪🇸', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 12890.10, winRate: 64.7, payoutTime: '2m 10s' },
  { id: 'usr_15', rank: 15, name: 'Henrik Vanger', country: 'Sweden', flag: '🇸🇪', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 Two-Step', profit: 11940.00, winRate: 64.1, payoutTime: '1m 30s' },
  { id: 'usr_16', rank: 16, name: 'Amina Bello', country: 'Nigeria', flag: '🇳🇬', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 One-Step', profit: 11120.40, winRate: 63.5, payoutTime: '1m 44s' },
  { id: 'usr_17', rank: 17, name: 'Marcus Brody', country: 'Australia', flag: '🇦🇺', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 10450.00, winRate: 62.8, payoutTime: '1m 19s' },
  { id: 'usr_18', rank: 18, name: 'Jin-Woo Park', country: 'South Korea', flag: '🇰🇷', avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80', accountTier: '$10,000 Instant', profit: 9940.00, winRate: 62.1, payoutTime: '1m 35s' },
  { id: 'usr_19', rank: 19, name: 'Fatima Al-Hassan', country: 'Saudi Arabia', flag: '🇸🇦', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80', accountTier: '$5,000 Two-Step', profit: 9680.50, winRate: 61.5, payoutTime: '1m 52s' },
  { id: 'usr_20', rank: 20, name: 'Gabriel Santos', country: 'Portugal', flag: '🇵🇹', avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80', accountTier: '$2,500 One-Step', profit: 9600.00, winRate: 61.0, payoutTime: '1m 28s' },
];

interface QuotexLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfit?: number;
  userName?: string;
  userAccountId?: string;
}

export const QuotexLeaderboardModal: React.FC<QuotexLeaderboardModalProps> = ({
  isOpen,
  onClose,
  userProfit = 28460.00,
  userName = 'Alex Mercer',
  userAccountId = 'BFT-91823',
}) => {
  const [traders, setTraders] = useState<LeaderboardTrader[]>(INITIAL_TOP_20_TRADERS);
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(false);
  const [lastUpdatedTraderId, setLastUpdatedTraderId] = useState<string | null>(null);

  // Dynamic simulation of live trading updates while preserving Kasun Perera at rank 9
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setTraders((prev) => {
        const next = [...prev];
        // Pick a random trader excluding top 3 and Kasun Perera (id: 'usr_09')
        const eligibleIndices = next
          .map((t, idx) => (t.rank > 3 && t.id !== 'usr_09' ? idx : -1))
          .filter((idx) => idx !== -1);

        if (eligibleIndices.length === 0) return next;

        const randomIndex = eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)];
        const target = next[randomIndex];
        const gain = Math.floor(Math.random() * 45) + 12;
        target.profit = Number((target.profit + gain).toFixed(2));
        target.recentWin = true;

        setLastUpdatedTraderId(target.id);
        setTimeout(() => setLastUpdatedTraderId(null), 2500);

        // Sort but ensure Kasun Perera stays fixed at rank 9 ($18,995.22 reference anchor)
        const kasun = next.find((t) => t.id === 'usr_09') || INITIAL_TOP_20_TRADERS[8];
        const others = next.filter((t) => t.id !== 'usr_09');
        others.sort((a, b) => b.profit - a.profit);

        const reconstructed: LeaderboardTrader[] = [];
        let r = 1;
        for (const item of others) {
          if (r === 9) {
            reconstructed.push({ ...kasun, rank: 9 });
            r++;
          }
          reconstructed.push({ ...item, rank: r });
          r++;
        }
        if (reconstructed.length < 20 && !reconstructed.find((t) => t.id === 'usr_09')) {
          reconstructed.splice(8, 0, { ...kasun, rank: 9 });
        }
        return reconstructed.slice(0, 20).map((t, idx) => ({ ...t, rank: idx + 1 }));
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const userRank = traders.findIndex((t) => t.name.includes(userName)) + 1 || 5;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
      <div
        data-testid="quotex-leaderboard-modal"
        className="w-full max-w-3xl rounded-3xl bg-[#0a0a0a] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-mono text-slate-100"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-[#111115] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800]">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white font-sans">
                  Institutional Leaderboard & Weekly Rankings
                </h3>
                <span className="px-2 py-0.5 rounded bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40 text-[10px] font-black uppercase">
                  Leaderboard updates weekly
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verified TRC-20 weekly profits across top 20 BFT Challenge & Instant Funded traders.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-leaderboard-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onClose();
            }}
            aria-label="Close Leaderboard"
            className="p-2 rounded-xl bg-[#1a1a20] hover:bg-[#252530] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Personal Ranking Card Header */}
        <div className="p-4 bg-gradient-to-r from-[#16120b] via-[#111115] to-[#0a1a12] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ff8800] text-slate-950 font-black text-base flex items-center justify-center font-mono shadow-md">
              #{userRank}
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-white font-sans">{userName}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40 font-mono font-bold">
                  {userAccountId}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono">
                Your Weekly Profit: <strong className="text-[#00e676]">${userProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> • Win Rate: <strong className="text-white">71.5%</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="toggle-how-it-works-btn"
            onClick={() => {
              soundEngine.playUiClick();
              setShowHowItWorks(!showHowItWorks);
            }}
            className="px-3 py-2 rounded-xl bg-[#16161c] hover:bg-[#1f1f27] border border-white/15 text-xs font-mono font-bold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer self-start sm:self-center transition-colors"
          >
            <HelpCircle className="w-4 h-4 text-[#ff8800]" />
            <span>How does this rating work?</span>
            {showHowItWorks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Informative "How does this rating work?" Collapsible Section */}
        {showHowItWorks && (
          <div className="p-4 bg-[#141418] border-b border-white/10 text-xs text-slate-300 space-y-2 font-mono animate-in fade-in duration-150 shrink-0">
            <div className="font-black text-white uppercase tracking-wider text-[#ff8800] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> BFT Weekly Institutional Ranking Algorithm
            </div>
            <p className="leading-relaxed text-slate-300">
              Rankings are calculated automatically every Monday at 00:00 UTC based on verified net profit realized across BFT Challenge and Instant Funded accounts. To maintain institutional integrity, traders must adhere to maximum drawdown rules and complete KYC verification. Top 10 ranking traders receive 10% bonus scaling allocations and VIP TRC-20 priority payout routing.
            </p>
          </div>
        )}

        {/* Podium Top 3 (Gold, Silver, Bronze Badges) */}
        <div className="grid grid-cols-3 gap-3 p-4 bg-[#0e0e12] border-b border-white/10 text-center shrink-0">
          {/* 2nd Place Silver */}
          <div className="p-3 rounded-2xl bg-[#121217] border border-slate-700/60 flex flex-col items-center">
            <span className="px-2 py-0.5 rounded bg-slate-500/20 text-slate-300 border border-slate-500/40 text-[9px] font-black uppercase mb-1.5">
              🥈 2nd Place
            </span>
            <img src={traders[1].avatarUrl} alt={traders[1].name} className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-400 mb-2" />
            <div className="font-bold text-white text-xs truncate max-w-[140px]">{traders[1].name} {traders[1].flag}</div>
            <div className="text-[10px] text-slate-400">{traders[1].country}</div>
            <div className="text-[#00e676] font-black text-xs sm:text-sm mt-1">+${traders[1].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>

          {/* 1st Place Gold */}
          <div className="p-3 rounded-2xl bg-[#1a140a] border-2 border-[#ff8800] shadow-xl flex flex-col items-center scale-105">
            <span className="px-2.5 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-[10px] uppercase mb-1.5 shadow">
              🥇 1st Place
            </span>
            <img src={traders[0].avatarUrl} alt={traders[0].name} className="w-12 h-12 rounded-full object-cover ring-2 ring-[#ff8800] mb-2" />
            <div className="font-black text-white text-xs sm:text-sm truncate max-w-[150px]">{traders[0].name} {traders[0].flag}</div>
            <div className="text-[10px] text-amber-300">{traders[0].country}</div>
            <div className="text-[#ff8800] font-black text-sm sm:text-base mt-1">+${traders[0].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>

          {/* 3rd Place Bronze */}
          <div className="p-3 rounded-2xl bg-[#121217] border border-amber-800/50 flex flex-col items-center">
            <span className="px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-600/40 text-[9px] font-black uppercase mb-1.5">
              🥉 3rd Place
            </span>
            <img src={traders[2].avatarUrl} alt={traders[2].name} className="w-10 h-10 rounded-full object-cover ring-2 ring-amber-700 mb-2" />
            <div className="font-bold text-white text-xs truncate max-w-[140px]">{traders[2].name} {traders[2].flag}</div>
            <div className="text-[10px] text-slate-400">{traders[2].country}</div>
            <div className="text-[#00e676] font-black text-xs sm:text-sm mt-1">+${traders[2].profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Top 20 Traders List */}
        <div className="p-3 sm:p-4 overflow-y-auto divide-y divide-white/5 flex-1 text-xs space-y-1">
          {traders.map((trader) => {
            const isKasun = trader.id === 'usr_09';
            const isMe = trader.name.includes(userName);
            const wasJustUpdated = lastUpdatedTraderId === trader.id;

            return (
              <div
                key={trader.id}
                data-testid={`leaderboard-row-${trader.rank}`}
                className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                  isKasun
                    ? 'bg-[#121d17] border-2 border-[#00e676]/60 shadow-lg'
                    : isMe
                    ? 'bg-[#1a140a] border border-[#ff8800]/50'
                    : wasJustUpdated
                    ? 'bg-white/5 border border-white/15'
                    : 'hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span
                    className={`w-6 text-center font-black text-sm ${
                      trader.rank === 1
                        ? 'text-[#ff8800]'
                        : trader.rank === 2
                        ? 'text-slate-200'
                        : trader.rank === 3
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    #{trader.rank}
                  </span>

                  <img
                    src={trader.avatarUrl}
                    alt={trader.name}
                    className="w-9 h-9 rounded-full object-cover ring-1 ring-white/15 bg-[#141418]"
                  />

                  <div>
                    <div className="font-black text-white flex items-center gap-2">
                      <span className="font-sans text-sm">{trader.name}</span>
                      <span className="text-base" title={trader.country}>
                        {trader.flag}
                      </span>
                      {isKasun && (
                        <span
                          data-testid="kasun-perera-badge"
                          className="px-2 py-0.5 rounded bg-[#00c853]/20 text-[#00e676] border border-[#00e676]/40 text-[9px] font-black uppercase tracking-wider"
                        >
                          Featured #9
                        </span>
                      )}
                      {isMe && (
                        <span className="px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-[9px] uppercase">
                          YOU
                        </span>
                      )}
                      {wasJustUpdated && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold animate-pulse">
                          +Trade
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {trader.accountTier} • Win Rate: <strong className="text-slate-200">{trader.winRate}%</strong>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    data-testid={`trader-profit-${trader.rank}`}
                    className={`text-sm sm:text-base font-black font-mono ${
                      isKasun ? 'text-[#00e676] text-base sm:text-lg' : 'text-emerald-400'
                    }`}
                  >
                    +${trader.profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Payout SLA: {trader.payoutTime}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#111115] border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
          <span className="flex items-center gap-1.5 text-[#00e676] font-bold">
            <Activity className="w-4 h-4" /> TRC-20 Institutional Payout Gateway Active
          </span>
          <span className="text-slate-400">Leaderboard updates weekly</span>
        </div>
      </div>
    </div>
  );
};
