import React, { useState, useEffect } from 'react';
import { Users, ShieldCheck, Trophy, TrendingUp, TrendingDown, ArrowRight, Check, X, AlertTriangle, Zap, DollarSign, ChevronRight, Activity, Shield, Award, Globe, UserPlus, StopCircle, Flame, Star, Lock } from 'lucide-react';
import { TradingAccount, UserProfile } from '../types';
import { soundEngine } from '../utils/soundEffects';

interface CopyTradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: TradingAccount[];
  userProfile?: UserProfile;
  onNavigateToPricing?: () => void;
}

interface CopyTrader {
  id: string;
  userId: string;
  name: string;
  country: string;
  flag: string;
  avatar: string;
  category: 'instant_funded' | 'self_capital';
  strategyName: string;
  vipLevel: string;
  startingCapital: number;
  currentBalance: number;
  lifetimeEarnings: number;
  dailyProfitDollars: number;
  dailyProfitPct: number;
  weeklyProfitDollars: number;
  weeklyProfitPct: number;
  monthlyProfitDollars: number;
  monthlyProfitPct: number;
  winRate: number;
  totalTrades: number;
  tradingTurnover: number;
  totalCopiers: number;
  maxCopiers: number;
  winRate3m: number;
}

const INSTITUTIONAL_TRADERS: CopyTrader[] = [
  // --- INSTANT FUNDED TRADERS (Top 20) ---
  {
    id: 'trd_1',
    userId: 'usr_inst_1',
    name: 'Alexander Vance',
    country: 'United States',
    flag: '🇺🇸',
    avatar: '👨‍💼',
    category: 'instant_funded',
    strategyName: 'Alpha FX Momentum $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 148500,
    lifetimeEarnings: 48500,
    dailyProfitDollars: 8445.00,
    dailyProfitPct: 8.4,
    weeklyProfitDollars: 18450.00,
    weeklyProfitPct: 18.5,
    monthlyProfitDollars: 48500.00,
    monthlyProfitPct: 45.2,
    winRate: 83.4,
    totalTrades: 382,
    tradingTurnover: 1450000,
    totalCopiers: 500, // Fully booked #1
    maxCopiers: 500,
    winRate3m: 83.4,
  },
  {
    id: 'trd_2',
    userId: 'usr_inst_2',
    name: 'Kasun Perera',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    avatar: '🇱🇰',
    category: 'instant_funded',
    strategyName: 'Colombo Gold Scalper $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 73200,
    lifetimeEarnings: 23200,
    dailyProfitDollars: 6510.50,
    dailyProfitPct: 13.0,
    weeklyProfitDollars: 14200.00,
    weeklyProfitPct: 28.4,
    monthlyProfitDollars: 23200.00,
    monthlyProfitPct: 46.4,
    winRate: 83.2,
    totalTrades: 290,
    tradingTurnover: 920000,
    totalCopiers: 500, // Fully booked #2
    maxCopiers: 500,
    winRate3m: 83.2,
  },
  {
    id: 'trd_3',
    userId: 'usr_inst_3',
    name: 'Liam Davies',
    country: 'United Kingdom',
    flag: '🇬🇧',
    avatar: '🇬🇧',
    category: 'instant_funded',
    strategyName: 'London Breakout $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 141000,
    lifetimeEarnings: 41000,
    dailyProfitDollars: 5920.00,
    dailyProfitPct: 5.9,
    weeklyProfitDollars: 12500.00,
    weeklyProfitPct: 12.5,
    monthlyProfitDollars: 41000.00,
    monthlyProfitPct: 41.0,
    winRate: 79.8,
    totalTrades: 330,
    tradingTurnover: 1150000,
    totalCopiers: 500, // Fully booked #3
    maxCopiers: 500,
    winRate3m: 79.8,
  },
  {
    id: 'trd_4',
    userId: 'usr_inst_4',
    name: 'Aarav Sharma',
    country: 'India',
    flag: '🇮🇳',
    avatar: '🇮🇳',
    category: 'instant_funded',
    strategyName: 'Mumbai Nifty FX $25K',
    vipLevel: 'VIP Pro',
    startingCapital: 25000,
    currentBalance: 36200,
    lifetimeEarnings: 11200,
    dailyProfitDollars: 4120.00,
    dailyProfitPct: 16.4,
    weeklyProfitDollars: 8900.00,
    weeklyProfitPct: 35.6,
    monthlyProfitDollars: 11200.00,
    monthlyProfitPct: 44.8,
    winRate: 82.5,
    totalTrades: 210,
    tradingTurnover: 480000,
    totalCopiers: 500, // Fully booked #4
    maxCopiers: 500,
    winRate3m: 82.5,
  },
  {
    id: 'trd_5',
    userId: 'usr_inst_5',
    name: 'Hans Weber',
    country: 'Germany',
    flag: '🇩🇪',
    avatar: '🇩🇪',
    category: 'instant_funded',
    strategyName: 'Frankfurt Dax Trend $50K',
    vipLevel: 'VIP Master',
    startingCapital: 50000,
    currentBalance: 69400,
    lifetimeEarnings: 19400,
    dailyProfitDollars: 3890.00,
    dailyProfitPct: 7.7,
    weeklyProfitDollars: 9400.00,
    weeklyProfitPct: 18.8,
    monthlyProfitDollars: 19400.00,
    monthlyProfitPct: 38.8,
    winRate: 78.5,
    totalTrades: 245,
    tradingTurnover: 760000,
    totalCopiers: 500, // Fully booked #5
    maxCopiers: 500,
    winRate3m: 78.5,
  },
  {
    id: 'trd_6',
    userId: 'usr_inst_6',
    name: 'Yuki Tanaka',
    country: 'Japan',
    flag: '🇯🇵',
    avatar: '🇯🇵',
    category: 'instant_funded',
    strategyName: 'Tokyo Yen Scalper $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 134000,
    lifetimeEarnings: 34000,
    dailyProfitDollars: 3450.00,
    dailyProfitPct: 3.4,
    weeklyProfitDollars: 8200.00,
    weeklyProfitPct: 8.2,
    monthlyProfitDollars: 34000.00,
    monthlyProfitPct: 34.0,
    winRate: 81.2,
    totalTrades: 275,
    tradingTurnover: 980000,
    totalCopiers: 320, // Available #6+
    maxCopiers: 500,
    winRate3m: 81.2,
  },
  {
    id: 'trd_7',
    userId: 'usr_inst_7',
    name: 'Pierre Dupont',
    country: 'France',
    flag: '🇫🇷',
    avatar: '🇫🇷',
    category: 'instant_funded',
    strategyName: 'Paris Euro Reversal $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 64200,
    lifetimeEarnings: 14200,
    dailyProfitDollars: 2950.00,
    dailyProfitPct: 5.9,
    weeklyProfitDollars: 6800.00,
    weeklyProfitPct: 13.6,
    monthlyProfitDollars: 14200.00,
    monthlyProfitPct: 28.4,
    winRate: 77.9,
    totalTrades: 190,
    tradingTurnover: 540000,
    totalCopiers: 280,
    maxCopiers: 500,
    winRate3m: 77.9,
  },
  {
    id: 'trd_8',
    userId: 'usr_inst_8',
    name: 'Mateo Fernandez',
    country: 'Spain',
    flag: '🇪🇸',
    avatar: '🇪🇸',
    category: 'instant_funded',
    strategyName: 'Madrid Ibex Swing $25K',
    vipLevel: 'Pro Trader',
    startingCapital: 25000,
    currentBalance: 31800,
    lifetimeEarnings: 6800,
    dailyProfitDollars: 2150.00,
    dailyProfitPct: 8.6,
    weeklyProfitDollars: 4900.00,
    weeklyProfitPct: 19.6,
    monthlyProfitDollars: 6800.00,
    monthlyProfitPct: 27.2,
    winRate: 76.2,
    totalTrades: 160,
    tradingTurnover: 390000,
    totalCopiers: 190,
    maxCopiers: 500,
    winRate3m: 76.2,
  },
  {
    id: 'trd_9',
    userId: 'usr_inst_9',
    name: 'Giovanni Rossi',
    country: 'Italy',
    flag: '🇮🇹',
    avatar: '🇮🇹',
    category: 'instant_funded',
    strategyName: 'Milan MIB Growth $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 61000,
    lifetimeEarnings: 11000,
    dailyProfitDollars: 1850.00,
    dailyProfitPct: 3.7,
    weeklyProfitDollars: 4500.00,
    weeklyProfitPct: 9.0,
    monthlyProfitDollars: 11000.00,
    monthlyProfitPct: 22.0,
    winRate: 75.8,
    totalTrades: 155,
    tradingTurnover: 410000,
    totalCopiers: 145,
    maxCopiers: 500,
    winRate3m: 75.8,
  },
  {
    id: 'trd_10',
    userId: 'usr_inst_10',
    name: 'Henrik Larsson',
    country: 'Sweden',
    flag: '🇸🇪',
    avatar: '🇸🇪',
    category: 'instant_funded',
    strategyName: 'Stockholm Nordic Trend $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 122000,
    lifetimeEarnings: 22000,
    dailyProfitDollars: 1520.00,
    dailyProfitPct: 1.5,
    weeklyProfitDollars: 7800.00,
    weeklyProfitPct: 7.8,
    monthlyProfitDollars: 22000.00,
    monthlyProfitPct: 22.0,
    winRate: 80.4,
    totalTrades: 210,
    tradingTurnover: 650000,
    totalCopiers: 210,
    maxCopiers: 500,
    winRate3m: 80.4,
  },

  // --- SELF CAPITAL TRADERS (Top 20) ---
  {
    id: 'trd_11',
    userId: 'usr_self_1',
    name: 'Marcus Sterling',
    country: 'United States',
    flag: '🇺🇸',
    avatar: '📈',
    category: 'self_capital',
    strategyName: 'Crypto OTC Breakout Pro',
    vipLevel: 'VIP Master',
    startingCapital: 5000,
    currentBalance: 29800,
    lifetimeEarnings: 24800,
    dailyProfitDollars: 5120.00,
    dailyProfitPct: 20.7,
    weeklyProfitDollars: 14200.00,
    weeklyProfitPct: 57.5,
    monthlyProfitDollars: 24800.00,
    monthlyProfitPct: 99.2,
    winRate: 84.2,
    totalTrades: 485,
    tradingTurnover: 2100000,
    totalCopiers: 500, // Fully booked #1 Self Capital
    maxCopiers: 500,
    winRate3m: 84.2,
  },
  {
    id: 'trd_12',
    userId: 'usr_self_2',
    name: 'Elena Rostova',
    country: 'Russia',
    flag: '🇷🇺',
    avatar: '🎯',
    category: 'self_capital',
    strategyName: 'Siberian Macro Swing',
    vipLevel: 'Pro Trader',
    startingCapital: 2500,
    currentBalance: 13200,
    lifetimeEarnings: 10700,
    dailyProfitDollars: 1840.50,
    dailyProfitPct: 16.2,
    weeklyProfitDollars: 5200.00,
    weeklyProfitPct: 45.8,
    monthlyProfitDollars: 10700.00,
    monthlyProfitPct: 94.2,
    winRate: 88.6,
    totalTrades: 150,
    tradingTurnover: 620000,
    totalCopiers: 500, // Fully booked #2 Self Capital
    maxCopiers: 500,
    winRate3m: 88.6,
  },
  {
    id: 'trd_13',
    userId: 'usr_self_3',
    name: 'Suresh Patel',
    country: 'India',
    flag: '🇮🇳',
    avatar: '🇮🇳',
    category: 'self_capital',
    strategyName: 'Gujarat Momentum Club',
    vipLevel: 'Pro Trader',
    startingCapital: 1500,
    currentBalance: 8400,
    lifetimeEarnings: 6900,
    dailyProfitDollars: 1210.00,
    dailyProfitPct: 16.8,
    weeklyProfitDollars: 3400.00,
    weeklyProfitPct: 47.2,
    monthlyProfitDollars: 6900.00,
    monthlyProfitPct: 95.8,
    winRate: 77.4,
    totalTrades: 140,
    tradingTurnover: 380000,
    totalCopiers: 500, // Fully booked #3 Self Capital
    maxCopiers: 500,
    winRate3m: 77.4,
  },
  {
    id: 'trd_14',
    userId: 'usr_self_4',
    name: 'Nimal Jayasinghe',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    avatar: '🇱🇰',
    category: 'self_capital',
    strategyName: 'Kandy Forex Syndicate',
    vipLevel: 'VIP Pro',
    startingCapital: 3000,
    currentBalance: 12100,
    lifetimeEarnings: 9100,
    dailyProfitDollars: 980.00,
    dailyProfitPct: 8.8,
    weeklyProfitDollars: 3100.00,
    weeklyProfitPct: 27.9,
    monthlyProfitDollars: 9100.00,
    monthlyProfitPct: 81.9,
    winRate: 80.5,
    totalTrades: 175,
    tradingTurnover: 490000,
    totalCopiers: 500, // Fully booked #4 Self Capital
    maxCopiers: 500,
    winRate3m: 80.5,
  },
  {
    id: 'trd_15',
    userId: 'usr_self_5',
    name: 'Chloe Bennett',
    country: 'Australia',
    flag: '🇦🇺',
    avatar: '🇦🇺',
    category: 'self_capital',
    strategyName: 'Sydney Session Sniper',
    vipLevel: 'Pro Trader',
    startingCapital: 2000,
    currentBalance: 9600,
    lifetimeEarnings: 7600,
    dailyProfitDollars: 840.00,
    dailyProfitPct: 9.6,
    weeklyProfitDollars: 2800.00,
    weeklyProfitPct: 32.1,
    monthlyProfitDollars: 7600.00,
    monthlyProfitPct: 87.3,
    winRate: 79.2,
    totalTrades: 130,
    tradingTurnover: 310000,
    totalCopiers: 500, // Fully booked #5 Self Capital
    maxCopiers: 500,
    winRate3m: 79.2,
  },
  {
    id: 'trd_16',
    userId: 'usr_self_6',
    name: 'Carlos Santana',
    country: 'Brazil',
    flag: '🇧🇷',
    avatar: '🇧🇷',
    category: 'self_capital',
    strategyName: 'Sao Paulo Real Yield',
    vipLevel: 'Pro Trader',
    startingCapital: 1000,
    currentBalance: 4800,
    lifetimeEarnings: 3800,
    dailyProfitDollars: 620.00,
    dailyProfitPct: 14.8,
    weeklyProfitDollars: 1800.00,
    weeklyProfitPct: 42.8,
    monthlyProfitDollars: 3800.00,
    monthlyProfitPct: 90.4,
    winRate: 76.5,
    totalTrades: 110,
    tradingTurnover: 220000,
    totalCopiers: 280, // Available #6+ Self Capital
    maxCopiers: 500,
    winRate3m: 76.5,
  },
  {
    id: 'trd_17',
    userId: 'usr_self_7',
    name: 'Fatima Al-Farsi',
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    avatar: '🇦🇪',
    category: 'self_capital',
    strategyName: 'Dubai Gold Horizon',
    vipLevel: 'VIP Pro',
    startingCapital: 5000,
    currentBalance: 16400,
    lifetimeEarnings: 11400,
    dailyProfitDollars: 550.00,
    dailyProfitPct: 3.4,
    weeklyProfitDollars: 3200.00,
    weeklyProfitPct: 19.8,
    monthlyProfitDollars: 11400.00,
    monthlyProfitPct: 70.3,
    winRate: 81.0,
    totalTrades: 145,
    tradingTurnover: 510000,
    totalCopiers: 340,
    maxCopiers: 500,
    winRate3m: 81.0,
  },
];

export const CopyTradingModal: React.FC<CopyTradingModalProps> = ({
  isOpen,
  onClose,
  accounts,
  userProfile,
  onNavigateToPricing,
}) => {
  const [activeTab, setActiveTab] = useState<'instant_funded' | 'self_capital'>('instant_funded');
  const [tradersList, setTradersList] = useState<CopyTrader[]>(INSTITUTIONAL_TRADERS);
  const [viewingTrader, setViewingTrader] = useState<CopyTrader | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<Record<string, boolean>>({});
  
  // Modals & Alerts
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [providerErrorModal, setProviderErrorModal] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Strategy form state for joining as provider
  const [providerStrategyName, setProviderStrategyName] = useState('Elite Strategy 100K');
  const [providerCategory, setProviderCategory] = useState<'instant_funded' | 'self_capital'>('instant_funded');

  if (!isOpen) return null;

  // Filter & sort strictly by Daily Profit ($) descending (Top 20)
  const instantTraders = tradersList
    .filter((t) => t.category === 'instant_funded')
    .sort((a, b) => b.dailyProfitDollars - a.dailyProfitDollars)
    .slice(0, 20);

  const selfTraders = tradersList
    .filter((t) => t.category === 'self_capital')
    .sort((a, b) => b.dailyProfitDollars - a.dailyProfitDollars)
    .slice(0, 20);

  const displayedTraders = activeTab === 'instant_funded' ? instantTraders : selfTraders;

  // Check Copier Eligibility: Self-Capital account >= $100 OR Instant account >= $25,000
  const hasCopierEligibility = accounts.some((acc) => {
    if (acc.status !== 'active') return false;
    const isInstant25k = (acc.tier === 'instant' || acc.size >= 25000);
    const isSelfCapital100 = (acc.accountType === 'self_funded' && (acc.depositedCapital ?? acc.initialBalance) >= 100);
    return isInstant25k || isSelfCapital100;
  });

  const handleToggleCopy = (trader: CopyTrader) => {
    soundEngine.playUiClick();
    if (trader.totalCopiers >= trader.maxCopiers && !activeSubscriptions[trader.id]) {
      setSuccessNotice('This trading provider has reached the maximum cap of 500 copiers (Fully Booked).');
      setTimeout(() => setSuccessNotice(null), 4000);
      return;
    }

    if (!activeSubscriptions[trader.id]) {
      if (!hasCopierEligibility) {
        setShowEligibilityModal(true);
        return;
      }
    }

    const isCurrentlyCopying = !!activeSubscriptions[trader.id];
    setActiveSubscriptions((prev) => ({
      ...prev,
      [trader.id]: !isCurrentlyCopying,
    }));

    setTradersList((prev) =>
      prev.map((t) =>
        t.id === trader.id
          ? { ...t, totalCopiers: isCurrentlyCopying ? t.totalCopiers - 1 : t.totalCopiers + 1 }
          : t
      )
    );

    if (!isCurrentlyCopying) {
      setSuccessNotice(`Successfully connected to copy ${trader.name} (${trader.strategyName}).`);
    } else {
      setSuccessNotice(`Disconnected from copy stream of ${trader.name}.`);
    }
    setTimeout(() => setSuccessNotice(null), 5000);
    setViewingTrader(null);
  };

  const handleApplyAsProvider = () => {
    soundEngine.playUiClick();
    // Rule: Must have minimum 60% Profitability Win Rate over the last 3 months
    const userBestWinRate = accounts.reduce((max, acc) => Math.max(max, acc.winRate || 0), 72);
    const hasRequiredWinRate = userBestWinRate >= 60;

    if (!hasRequiredWinRate) {
      setProviderErrorModal(`Eligibility Error: You need a minimum 60% win rate over the past 3 months to become a Copy Trader Provider. Your win rate is ${userBestWinRate}%.`);
      return;
    }

    const newProviderId = `trd_usr_${Date.now().toString(36)}`;
    const newTraderRecord: CopyTrader = {
      id: newProviderId,
      userId: userProfile?.id || 'usr_bft_001',
      name: userProfile?.fullName || userProfile?.email || 'My Trading Strategy',
      country: userProfile?.country || 'United States',
      flag: '🇺🇸',
      avatar: '⭐',
      category: providerCategory,
      strategyName: providerStrategyName,
      vipLevel: 'VIP Provider',
      startingCapital: providerCategory === 'instant_funded' ? 50000 : 1000,
      currentBalance: providerCategory === 'instant_funded' ? 53400 : 1350,
      lifetimeEarnings: 3400,
      dailyProfitDollars: 450.00,
      dailyProfitPct: 4.5,
      weeklyProfitDollars: 2100.00,
      weeklyProfitPct: 21.0,
      monthlyProfitDollars: 4500.00,
      monthlyProfitPct: 45.0,
      winRate: userBestWinRate,
      totalTrades: 88,
      tradingTurnover: 240000,
      totalCopiers: 12,
      maxCopiers: 500,
      winRate3m: userBestWinRate,
    };

    setTradersList((prev) => [newTraderRecord, ...prev]);
    setShowProviderModal(false);
    setSuccessNotice('Congratulations! Your Copy Trading Provider application has been approved and published to the leaderboard.');
    setTimeout(() => setSuccessNotice(null), 6000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-fade-in font-sans">
      <div className="relative w-full max-w-5xl bg-[#0d0f17] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-gradient-to-r from-[#141722] via-[#0d0f17] to-[#141722]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ff8800] to-[#ffaa00] flex items-center justify-center shadow-lg shadow-[#ff8800]/25">
              <Users className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Elite Advanced Social Copy Trading
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  100% Free
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Institutional-grade algorithmic copy trading. Zero fees or profit splits.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { soundEngine.playUiClick(); setShowProviderModal(true); }}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 text-slate-950 font-black text-xs transition cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Join as Provider</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Eye-Catching Marketing Banner */}
        <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-[#ff8800]/20 via-[#1a150c] to-emerald-500/20 border border-[#ff8800]/40 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <Zap className="w-4 h-4 text-[#ffaa00]" />
            <span><strong>100% Free Copy Trading - Mirror elite performers instantly. Zero fees or profit splits.</strong></span>
          </div>
          <div className="font-mono text-[11px] text-emerald-400">
            Real-Time Supabase Sync Active
          </div>
        </div>

        {successNotice && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Top 20 Tabs */}
        <div className="px-6 mt-4 flex items-center gap-3 border-b border-white/10 pb-4">
          <button
            type="button"
            onClick={() => { soundEngine.playUiClick(); setActiveTab('instant_funded'); }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'instant_funded'
                ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-lg shadow-[#ff8800]/25'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Instant Funded Traders (Top 20)
          </button>
          <button
            type="button"
            onClick={() => { soundEngine.playUiClick(); setActiveTab('self_capital'); }}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'self_capital'
                ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-lg shadow-[#ff8800]/25'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Self Capital Traders (Top 20)
          </button>
        </div>

        {/* Vertical Feed / List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
          {displayedTraders.map((trader, index) => {
            const isCopying = !!activeSubscriptions[trader.id];
            const isFull = trader.totalCopiers >= trader.maxCopiers;
            return (
              <div
                key={trader.id}
                onClick={() => { soundEngine.playUiClick(); setViewingTrader(trader); }}
                className={`group rounded-2xl border p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer ${
                  isCopying
                    ? 'bg-[#181d18] border-emerald-500/50 shadow-md shadow-emerald-500/10'
                    : isFull
                    ? 'bg-[#13151f]/80 border-white/5 opacity-85 hover:border-white/15'
                    : 'bg-[#131622] border-white/10 hover:border-[#ff8800]/40 hover:bg-[#1a1e2e]'
                }`}
              >
                {/* Rank #, Flag & Name / Strategy */}
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-mono font-bold text-xs text-slate-500">
                    #{index + 1}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {trader.flag}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-[#ffaa00] transition">{trader.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10 font-bold">
                        {trader.category === 'instant_funded' ? 'Instant Funded' : 'Self-Capital'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{trader.strategyName}</span>
                  </div>
                </div>

                {/* Daily Profit in Dollars and Percentage, Win Rate, Copiers */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-center font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Daily Profit</span>
                    <span className="text-sm font-black text-emerald-400">
                      +${trader.dailyProfitDollars.toLocaleString(undefined, { minimumFractionDigits: 2 })} (+{trader.dailyProfitPct}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Win Rate</span>
                    <span className="text-xs font-bold text-white">{trader.winRate}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Copier Slots</span>
                    <span className={`text-xs font-bold ${isFull ? 'text-amber-400' : 'text-white'}`}>
                      {trader.totalCopiers} / {trader.maxCopiers} Copiers
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div>
                  {isCopying ? (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      Copying Active
                    </span>
                  ) : isFull ? (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Full (Waitlist)
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleCopy(trader); }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-[#ff8800]/25 flex items-center gap-1.5"
                    >
                      <span>Copy</span>
                      <ChevronRight className="w-4 h-4 stroke-[3]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#141722] flex items-center justify-between text-xs text-slate-400">
          <span>First 5 traders are fully booked to ensure low-latency execution quality.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>

      {/* Advanced Interactive Trader Profile Modal */}
      {viewingTrader && !showEligibilityModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-xl bg-[#131622] border border-[#ff8800]/40 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl shadow">
                  {viewingTrader.flag}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{viewingTrader.name}</h3>
                    <span className="text-[10px] font-mono bg-[#ff8800]/20 text-amber-300 border border-[#ff8800]/40 px-2 py-0.5 rounded-full font-bold">
                      {viewingTrader.vipLevel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">{viewingTrader.strategyName} • {viewingTrader.country}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingTrader(null)}
                className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Starting Balance ($) & Current Balance ($) in Glowing Cards */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-4 rounded-2xl bg-black/60 border border-white/10 shadow-lg shadow-black/50">
                <span className="text-[10px] text-slate-400 block uppercase mb-1">Starting Balance</span>
                <span className="text-lg sm:text-xl font-black text-slate-200">
                  {viewingTrader.category === 'self_capital' && viewingTrader.startingCapital < 1000
                    ? '$1,000+'
                    : `$${viewingTrader.startingCapital.toLocaleString()}`}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-black border border-emerald-500/50 shadow-lg shadow-emerald-500/20">
                <span className="text-[10px] text-emerald-400 block uppercase mb-1 font-bold">Current Balance</span>
                <span className="text-lg sm:text-xl font-black text-emerald-400">${viewingTrader.currentBalance.toLocaleString()}</span>
              </div>
            </div>

            {/* Dual Performance Metric View (Side-by-Side / Cleanly Formatted) */}
            <div className="space-y-3 p-4 rounded-2xl bg-black/50 border border-white/10 font-mono">
              <div className="text-xs text-slate-300 font-bold uppercase tracking-wider mb-2">Institutional Performance Breakdown</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Daily</span>
                  <span className="font-black text-emerald-400 text-xs sm:text-sm">
                    +${viewingTrader.dailyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-emerald-500 block">
                    (+{viewingTrader.dailyProfitPct}%)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Weekly</span>
                  <span className="font-black text-emerald-400 text-xs sm:text-sm">
                    +${viewingTrader.weeklyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-emerald-500 block">
                    (+{viewingTrader.weeklyProfitPct}%)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Monthly</span>
                  <span className="font-black text-emerald-400 text-xs sm:text-sm">
                    +${viewingTrader.monthlyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-emerald-500 block">
                    (+{viewingTrader.monthlyProfitPct}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Live Copier Progress Bar */}
            <div className="space-y-2 p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Copier Capacity:</span>
                <span className={`font-bold ${viewingTrader.totalCopiers >= viewingTrader.maxCopiers ? 'text-amber-400' : 'text-white'}`}>
                  {viewingTrader.totalCopiers} / {viewingTrader.maxCopiers} Copiers Max
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${viewingTrader.totalCopiers >= viewingTrader.maxCopiers ? 'bg-amber-500' : 'bg-gradient-to-r from-[#ff8800] to-emerald-400'}`}
                  style={{ width: `${Math.min(100, (viewingTrader.totalCopiers / viewingTrader.maxCopiers) * 100)}%` }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewingTrader(null)}
                className="flex-1 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
              {activeSubscriptions[viewingTrader.id] ? (
                <button
                  type="button"
                  onClick={() => handleToggleCopy(viewingTrader)}
                  className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 uppercase tracking-wide"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Cancel Copy</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={viewingTrader.totalCopiers >= viewingTrader.maxCopiers}
                  onClick={() => handleToggleCopy(viewingTrader)}
                  className={`flex-1 py-3.5 rounded-xl font-black text-xs transition uppercase tracking-wide flex items-center justify-center gap-2 ${
                    viewingTrader.totalCopiers >= viewingTrader.maxCopiers
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 shadow-lg shadow-[#ff8800]/30 cursor-pointer'
                  }`}
                >
                  <span>{viewingTrader.totalCopiers >= viewingTrader.maxCopiers ? 'Fully Booked (Max 500)' : 'COPY TRADER'}</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Join as Provider Modal */}
      {showProviderModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#161821] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-400" />
                Become a Copy Trading Provider
              </h3>
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              To publish your strategy on the Top 20 Leaderboard, our algorithm verifies that you maintain a <strong className="text-emerald-400">minimum 60% win rate</strong> over the past 3 months.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Strategy Name</label>
                <input
                  type="text"
                  value={providerStrategyName}
                  onChange={(e) => setProviderStrategyName(e.target.value)}
                  className="w-full bg-[#11131a] border border-white/15 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Trading Category</label>
                <select
                  value={providerCategory}
                  onChange={(e) => setProviderCategory(e.target.value as any)}
                  className="w-full bg-[#11131a] border border-white/15 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#ff8800] cursor-pointer"
                >
                  <option value="instant_funded">Instant Funded Trader</option>
                  <option value="self_capital">Self Capital Trader</option>
                </select>
              </div>
            </div>

            {providerErrorModal && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs leading-relaxed font-mono">
                {providerErrorModal}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyAsProvider}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 text-slate-950 font-black text-xs transition cursor-pointer shadow-lg shadow-emerald-500/30"
              >
                Verify & Publish →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copier Eligibility Modal */}
      {showEligibilityModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#161821] border border-[#ff8800]/40 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#ff8800]/20 border border-[#ff8800]/40 flex items-center justify-center mx-auto text-[#ffaa00]">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black text-white mb-1">Copy Trading Eligibility Required</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                To copy trades, you must have a Self-Capital account of $100+ or an Instant Funded account of $25,000+.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-left text-[11px] text-slate-400 space-y-1 font-mono">
              <div className="text-white font-bold mb-1">Requirement Options:</div>
              <div>• Instant Funded Account ($25,000 or higher)</div>
              <div>• Self Capital Account ($100 minimum deposit)</div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEligibilityModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEligibilityModal(false);
                  setViewingTrader(null);
                  onClose();
                  onNavigateToPricing?.();
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs transition cursor-pointer shadow-lg shadow-[#ff8800]/30"
              >
                Get Eligible Account →
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
