import React, { useState, useEffect } from 'react';
import { Users, ShieldCheck, Trophy, TrendingUp, TrendingDown, ArrowRight, Check, X, AlertTriangle, Zap, DollarSign, ChevronRight, Activity, Shield, Award, Globe, UserPlus, StopCircle, Flame, Star, Lock, CheckCircle2 } from 'lucide-react';
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

const INSTITUTIONAL_MASTERS: CopyTrader[] = [
  // --- INSTANT FUNDED TRADERS (Top 20) ---
  {
    id: 'trd_i1',
    userId: 'usr_inst_1',
    name: 'Rajesh Kumar',
    country: 'India',
    flag: '🇮🇳',
    avatar: '🇮🇳',
    category: 'instant_funded',
    strategyName: 'Mumbai Nifty Alpha $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 154200,
    lifetimeEarnings: 54200,
    dailyProfitDollars: 9845.00,
    dailyProfitPct: 9.8,
    weeklyProfitDollars: 22100.00,
    weeklyProfitPct: 22.1,
    monthlyProfitDollars: 54200.00,
    monthlyProfitPct: 54.2,
    winRate: 85.2,
    totalTrades: 412,
    tradingTurnover: 1850000,
    totalCopiers: 500, // Fully booked #1
    maxCopiers: 500,
    winRate3m: 85.2,
  },
  {
    id: 'trd_i2',
    userId: 'usr_inst_2',
    name: 'Kasun Perera',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    avatar: '🇱🇰',
    category: 'instant_funded',
    strategyName: 'Colombo Gold Scalper $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 78400,
    lifetimeEarnings: 28400,
    dailyProfitDollars: 8120.00,
    dailyProfitPct: 16.2,
    weeklyProfitDollars: 17500.00,
    weeklyProfitPct: 35.0,
    monthlyProfitDollars: 28400.00,
    monthlyProfitPct: 56.8,
    winRate: 84.6,
    totalTrades: 320,
    tradingTurnover: 1200000,
    totalCopiers: 500, // Fully booked #2
    maxCopiers: 500,
    winRate3m: 84.6,
  },
  {
    id: 'trd_i3',
    userId: 'usr_inst_3',
    name: 'Tariq Mahmood',
    country: 'Pakistan',
    flag: '🇵🇰',
    avatar: '🇵🇰',
    category: 'instant_funded',
    strategyName: 'Lahore Forex Titan $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 145000,
    lifetimeEarnings: 45000,
    dailyProfitDollars: 7450.00,
    dailyProfitPct: 7.4,
    weeklyProfitDollars: 16200.00,
    weeklyProfitPct: 16.2,
    monthlyProfitDollars: 45000.00,
    monthlyProfitPct: 45.0,
    winRate: 81.9,
    totalTrades: 350,
    tradingTurnover: 1350000,
    totalCopiers: 500, // Fully booked #3
    maxCopiers: 500,
    winRate3m: 81.9,
  },
  {
    id: 'trd_i4',
    userId: 'usr_inst_4',
    name: 'Faizul Islam',
    country: 'Bangladesh',
    flag: '🇧🇩',
    avatar: '🇧🇩',
    category: 'instant_funded',
    strategyName: 'Dhaka FX Momentum $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 71200,
    lifetimeEarnings: 21200,
    dailyProfitDollars: 6890.00,
    dailyProfitPct: 13.7,
    weeklyProfitDollars: 14800.00,
    weeklyProfitPct: 29.6,
    monthlyProfitDollars: 21200.00,
    monthlyProfitPct: 42.4,
    winRate: 82.1,
    totalTrades: 280,
    tradingTurnover: 980000,
    totalCopiers: 500, // Fully booked #4
    maxCopiers: 500,
    winRate3m: 82.1,
  },
  {
    id: 'trd_i5',
    userId: 'usr_inst_5',
    name: 'Amir Al-Maktoum',
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    avatar: '🇦🇪',
    category: 'instant_funded',
    strategyName: 'Dubai Prime Scalper $200K',
    vipLevel: 'VIP Master',
    startingCapital: 200000,
    currentBalance: 278000,
    lifetimeEarnings: 78000,
    dailyProfitDollars: 6240.00,
    dailyProfitPct: 3.1,
    weeklyProfitDollars: 19500.00,
    weeklyProfitPct: 9.7,
    monthlyProfitDollars: 78000.00,
    monthlyProfitPct: 39.0,
    winRate: 83.0,
    totalTrades: 450,
    tradingTurnover: 2400000,
    totalCopiers: 500, // Fully booked #5
    maxCopiers: 500,
    winRate3m: 83.0,
  },
  {
    id: 'trd_i6',
    userId: 'usr_inst_6',
    name: 'Zulkifli Rahman',
    country: 'Malaysia',
    flag: '🇲🇾',
    avatar: '🇲🇾',
    category: 'instant_funded',
    strategyName: 'Kuala Lumpur Breakout $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 68500,
    lifetimeEarnings: 18500,
    dailyProfitDollars: 5410.00,
    dailyProfitPct: 10.8,
    weeklyProfitDollars: 11900.00,
    weeklyProfitPct: 23.8,
    monthlyProfitDollars: 18500.00,
    monthlyProfitPct: 37.0,
    winRate: 79.4,
    totalTrades: 240,
    tradingTurnover: 850000,
    totalCopiers: 340, // Available #6+
    maxCopiers: 500,
    winRate3m: 79.4,
  },
  {
    id: 'trd_i7',
    userId: 'usr_inst_7',
    name: 'Sheikh Al-Thani',
    country: 'Qatar',
    flag: '🇶🇦',
    avatar: '🇶🇦',
    category: 'instant_funded',
    strategyName: 'Doha Energy Hedge $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 132000,
    lifetimeEarnings: 32000,
    dailyProfitDollars: 4820.00,
    dailyProfitPct: 4.8,
    weeklyProfitDollars: 10800.00,
    weeklyProfitPct: 10.8,
    monthlyProfitDollars: 32000.00,
    monthlyProfitPct: 32.0,
    winRate: 80.5,
    totalTrades: 295,
    tradingTurnover: 1100000,
    totalCopiers: 410,
    maxCopiers: 500,
    winRate3m: 80.5,
  },
  {
    id: 'trd_i8',
    userId: 'usr_inst_8',
    name: 'Alexander Vance',
    country: 'United States',
    flag: '🇺🇸',
    avatar: '🇺🇸',
    category: 'instant_funded',
    strategyName: 'Wall Street Index Pro $100K',
    vipLevel: 'VIP Elite',
    startingCapital: 100000,
    currentBalance: 129400,
    lifetimeEarnings: 29400,
    dailyProfitDollars: 3950.00,
    dailyProfitPct: 3.9,
    weeklyProfitDollars: 9200.00,
    weeklyProfitPct: 9.2,
    monthlyProfitDollars: 29400.00,
    monthlyProfitPct: 29.4,
    winRate: 78.2,
    totalTrades: 260,
    tradingTurnover: 940000,
    totalCopiers: 290,
    maxCopiers: 500,
    winRate3m: 78.2,
  },
  {
    id: 'trd_i9',
    userId: 'usr_inst_9',
    name: 'Liam Davies',
    country: 'United Kingdom',
    flag: '🇬🇧',
    avatar: '🇬🇧',
    category: 'instant_funded',
    strategyName: 'London Forex Scalp $50K',
    vipLevel: 'VIP Pro',
    startingCapital: 50000,
    currentBalance: 61200,
    lifetimeEarnings: 11200,
    dailyProfitDollars: 3120.00,
    dailyProfitPct: 6.2,
    weeklyProfitDollars: 7400.00,
    weeklyProfitPct: 14.8,
    monthlyProfitDollars: 11200.00,
    monthlyProfitPct: 22.4,
    winRate: 76.9,
    totalTrades: 190,
    tradingTurnover: 580000,
    totalCopiers: 210,
    maxCopiers: 500,
    winRate3m: 76.9,
  },
  {
    id: 'trd_i10',
    userId: 'usr_inst_10',
    name: 'Priya Sharma',
    country: 'India',
    flag: '🇮🇳',
    avatar: '🇮🇳',
    category: 'instant_funded',
    strategyName: 'Bangalore Tech Momentum $25K',
    vipLevel: 'Pro Trader',
    startingCapital: 25000,
    currentBalance: 31400,
    lifetimeEarnings: 6400,
    dailyProfitDollars: 2450.00,
    dailyProfitPct: 9.8,
    weeklyProfitDollars: 5100.00,
    weeklyProfitPct: 20.4,
    monthlyProfitDollars: 6400.00,
    monthlyProfitPct: 25.6,
    winRate: 75.4,
    totalTrades: 165,
    tradingTurnover: 420000,
    totalCopiers: 180,
    maxCopiers: 500,
    winRate3m: 75.4,
  },

  // --- SELF CAPITAL TRADERS (Top 20) ---
  {
    id: 'trd_s1',
    userId: 'usr_self_1',
    name: 'Marcus Sterling',
    country: 'United States',
    flag: '🇺🇸',
    avatar: '📈',
    category: 'self_capital',
    strategyName: 'Crypto OTC Breakout Pro',
    vipLevel: 'VIP Master',
    startingCapital: 5000,
    currentBalance: 34200,
    lifetimeEarnings: 29200,
    dailyProfitDollars: 6840.00,
    dailyProfitPct: 27.3,
    weeklyProfitDollars: 18200.00,
    weeklyProfitPct: 72.8,
    monthlyProfitDollars: 29200.00,
    monthlyProfitPct: 116.8,
    winRate: 86.4,
    totalTrades: 510,
    tradingTurnover: 2450000,
    totalCopiers: 500, // Fully booked #1 Self-Capital
    maxCopiers: 500,
    winRate3m: 86.4,
  },
  {
    id: 'trd_s2',
    userId: 'usr_self_2',
    name: 'Suresh Patel',
    country: 'India',
    flag: '🇮🇳',
    avatar: '🇮🇳',
    category: 'self_capital',
    strategyName: 'Gujarat Momentum Club',
    vipLevel: 'VIP Master',
    startingCapital: 3000,
    currentBalance: 19800,
    lifetimeEarnings: 16800,
    dailyProfitDollars: 5210.00,
    dailyProfitPct: 34.7,
    weeklyProfitDollars: 12400.00,
    weeklyProfitPct: 82.6,
    monthlyProfitDollars: 16800.00,
    monthlyProfitPct: 112.0,
    winRate: 83.9,
    totalTrades: 380,
    tradingTurnover: 1600000,
    totalCopiers: 500, // Fully booked #2 Self-Capital
    maxCopiers: 500,
    winRate3m: 83.9,
  },
  {
    id: 'trd_s3',
    userId: 'usr_self_3',
    name: 'Nimal Jayasinghe',
    country: 'Sri Lanka',
    flag: '🇱🇰',
    avatar: '🇱🇰',
    category: 'self_capital',
    strategyName: 'Kandy Forex Syndicate',
    vipLevel: 'VIP Pro',
    startingCapital: 2500,
    currentBalance: 15400,
    lifetimeEarnings: 12900,
    dailyProfitDollars: 4120.00,
    dailyProfitPct: 27.4,
    weeklyProfitDollars: 9800.00,
    weeklyProfitPct: 65.3,
    monthlyProfitDollars: 12900.00,
    monthlyProfitPct: 86.0,
    winRate: 82.0,
    totalTrades: 290,
    tradingTurnover: 1100000,
    totalCopiers: 500, // Fully booked #3 Self-Capital
    maxCopiers: 500,
    winRate3m: 82.0,
  },
  {
    id: 'trd_s4',
    userId: 'usr_self_4',
    name: 'Bilal Ahmed',
    country: 'Pakistan',
    flag: '🇵🇰',
    avatar: '🇵🇰',
    category: 'self_capital',
    strategyName: 'Karachi Crypto Surge',
    vipLevel: 'VIP Pro',
    startingCapital: 2000,
    currentBalance: 12800,
    lifetimeEarnings: 10800,
    dailyProfitDollars: 3510.00,
    dailyProfitPct: 35.1,
    weeklyProfitDollars: 8100.00,
    weeklyProfitPct: 81.0,
    monthlyProfitDollars: 10800.00,
    monthlyProfitPct: 108.0,
    winRate: 81.5,
    totalTrades: 260,
    tradingTurnover: 950000,
    totalCopiers: 500, // Fully booked #4 Self-Capital
    maxCopiers: 500,
    winRate3m: 81.5,
  },
  {
    id: 'trd_s5',
    userId: 'usr_self_5',
    name: 'Mohamed Farhan',
    country: 'Bangladesh',
    flag: '🇧🇩',
    avatar: '🇧🇩',
    category: 'self_capital',
    strategyName: 'Chittagong Swing Trader',
    vipLevel: 'VIP Pro',
    startingCapital: 1500,
    currentBalance: 9500,
    lifetimeEarnings: 8000,
    dailyProfitDollars: 2840.00,
    dailyProfitPct: 37.8,
    weeklyProfitDollars: 6200.00,
    weeklyProfitPct: 82.6,
    monthlyProfitDollars: 8000.00,
    monthlyProfitPct: 106.6,
    winRate: 79.8,
    totalTrades: 210,
    tradingTurnover: 720000,
    totalCopiers: 500, // Fully booked #5 Self-Capital
    maxCopiers: 500,
    winRate3m: 79.8,
  },
  {
    id: 'trd_s6',
    userId: 'usr_self_6',
    name: 'Azlan Shah',
    country: 'Malaysia',
    flag: '🇲🇾',
    avatar: '🇲🇾',
    category: 'self_capital',
    strategyName: 'Penang FX Reversal',
    vipLevel: 'Pro Trader',
    startingCapital: 2000,
    currentBalance: 8900,
    lifetimeEarnings: 6900,
    dailyProfitDollars: 2150.00,
    dailyProfitPct: 21.5,
    weeklyProfitDollars: 4900.00,
    weeklyProfitPct: 49.0,
    monthlyProfitDollars: 6900.00,
    monthlyProfitPct: 69.0,
    winRate: 77.2,
    totalTrades: 180,
    tradingTurnover: 540000,
    totalCopiers: 320, // Available #6+
    maxCopiers: 500,
    winRate3m: 77.2,
  },
  {
    id: 'trd_s7',
    userId: 'usr_self_7',
    name: 'Hamdan Al-Maktoum',
    country: 'United Arab Emirates',
    flag: '🇦🇪',
    avatar: '🇦🇪',
    category: 'self_capital',
    strategyName: 'Sharjah Wealth Compounder',
    vipLevel: 'VIP Pro',
    startingCapital: 5000,
    currentBalance: 18200,
    lifetimeEarnings: 13200,
    dailyProfitDollars: 1890.00,
    dailyProfitPct: 11.3,
    weeklyProfitDollars: 6100.00,
    weeklyProfitPct: 36.6,
    monthlyProfitDollars: 13200.00,
    monthlyProfitPct: 79.2,
    winRate: 80.1,
    totalTrades: 195,
    tradingTurnover: 680000,
    totalCopiers: 390,
    maxCopiers: 500,
    winRate3m: 80.1,
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
  const [tradersList, setTradersList] = useState<CopyTrader[]>(INSTITUTIONAL_MASTERS);
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

  const handleToggleCopy = (trader: CopyTrader, index: number) => {
    soundEngine.playUiClick();
    if (index < 5) {
      setSuccessNotice('This elite trader is in the Top 5 and currently fully booked (500/500 Copiers - Waitlist Only).');
      setTimeout(() => setSuccessNotice(null), 4000);
      return;
    }

    if (trader.totalCopiers >= trader.maxCopiers && !activeSubscriptions[trader.id]) {
      setSuccessNotice('This trading provider has reached the maximum cap of 500 copiers.');
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
    const userBestWinRate = accounts.reduce((max, acc) => Math.max(max, acc.winRate || 0), 75);
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
      country: userProfile?.country || 'India',
      flag: '🇮🇳',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#090A0F]/90 backdrop-blur-md animate-fade-in font-sans">
      <div className="relative w-full max-w-5xl bg-[#0d0f17] border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-gradient-to-r from-[#141722] via-[#0d0f17] to-[#141722]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#ff8800] to-[#ffaa00] flex items-center justify-center shadow-lg shadow-[#ff8800]/25">
              <Users className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Institutional Social Copy Trading Platform
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  100% Free
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Mirror elite traders with 0% profit splits or hidden fees.
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

        {/* Top-Level Glowing Marketing Banner */}
        <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-gradient-to-r from-[#ff8800]/25 via-[#1a150c] to-emerald-500/25 border border-[#ff8800]/50 shadow-lg shadow-[#ff8800]/10 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <Zap className="w-4 h-4 text-[#ffaa00]" />
            <span><strong>100% Free Institutional Copy Trading — Mirror Top-Ranked Performers with 0% Profit Splits or Hidden Fees.</strong></span>
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
        <div className="px-6 mt-4 flex items-center gap-3 border-b border-slate-800/80 pb-4">
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
            const isTop5FullyBooked = index < 5;
            return (
              <div
                key={trader.id}
                onClick={() => { soundEngine.playUiClick(); setViewingTrader(trader); }}
                className={`group rounded-2xl border p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer ${
                  isCopying
                    ? 'bg-[#181d18] border-emerald-500/50 shadow-md shadow-emerald-500/10'
                    : isTop5FullyBooked
                    ? 'bg-[#13151f] border-amber-500/20 opacity-90 hover:border-amber-500/40'
                    : 'bg-[#131622] border-slate-800/80 hover:border-[#ff8800]/40 hover:bg-[#1a1e2e]'
                }`}
              >
                {/* Rank Position with Glowing Badge for Top 3 & Verified Checkmark */}
                <div className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-black text-xs ${
                    index === 0 ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/40' :
                    index === 1 ? 'bg-slate-300 text-slate-950 shadow-md' :
                    index === 2 ? 'bg-amber-700 text-white shadow-md' :
                    'text-slate-400 bg-white/5'
                  }`}>
                    #{index + 1}
                  </span>
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {trader.flag}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold text-white group-hover:text-[#ffaa00] transition">{trader.name}</h3>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" title="Verified Institutional Trader" />
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-amber-300 border border-white/10 font-bold">
                        {trader.category === 'instant_funded' ? 'Instant Funded' : 'Self-Capital'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{trader.strategyName}</span>
                  </div>
                </div>

                {/* Daily Profit in Both Dollar ($) & Percentage (%), Win Rate, Copiers */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-center font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Daily Profit</span>
                    <span className="text-sm font-black text-[#00e676]">
                      +${trader.dailyProfitDollars.toLocaleString(undefined, { minimumFractionDigits: 2 })} (+{trader.dailyProfitPct}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Win Rate</span>
                    <span className="text-xs font-bold text-white">{trader.winRate}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Copier Slots</span>
                    <span className={`text-xs font-bold ${isTop5FullyBooked ? 'text-amber-400' : 'text-white'}`}>
                      {isTop5FullyBooked ? '500 / 500 Copiers' : `${trader.totalCopiers} / 500 Copiers`}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <div>
                  {isCopying ? (
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-[#00e676] border border-emerald-500/40 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-[#00e676]" />
                      Copying Active
                    </span>
                  ) : isTop5FullyBooked ? (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                      <Lock className="w-3.5 h-3.5" />
                      [ 🔒 FULL - WAITLIST ONLY ]
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleToggleCopy(trader, index); }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-[#ff8800]/25 flex items-center gap-1.5 animate-pulse"
                    >
                      <span>COPY TRADER</span>
                      <ChevronRight className="w-4 h-4 stroke-[3]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800/80 bg-[#141722] flex items-center justify-between text-xs text-slate-400">
          <span>Top 5 traders are fully booked to maintain low-latency algorithmic stability.</span>
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
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#090A0F]/85 backdrop-blur-md animate-fade-in font-sans">
          <div className="relative w-full max-w-xl bg-[#0d0f17] border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl shadow">
                  {viewingTrader.flag}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{viewingTrader.name}</h3>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
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

            {/* Glowing Stat Panels: Starting Balance & Current Account Balance */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-4 rounded-2xl bg-black/60 border border-slate-800/80 shadow-lg shadow-black/50">
                <span className="text-[10px] text-slate-400 block uppercase mb-1">Starting Balance</span>
                <span className="text-lg sm:text-xl font-black text-slate-200">
                  {viewingTrader.category === 'self_capital' && viewingTrader.startingCapital < 1000
                    ? '$1,000+'
                    : `$${viewingTrader.startingCapital.toLocaleString()}`}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-black border border-emerald-500/50 shadow-lg shadow-emerald-500/20">
                <span className="text-[10px] text-[#00e676] block uppercase mb-1 font-bold">Current Account Balance</span>
                <span className="text-lg sm:text-xl font-black text-[#00e676]">${viewingTrader.currentBalance.toLocaleString()}</span>
              </div>
            </div>

            {/* Dual Performance Breakdown Grid */}
            <div className="space-y-3 p-4 rounded-2xl bg-black/50 border border-slate-800/80 font-mono">
              <div className="text-xs text-slate-300 font-bold uppercase tracking-wider mb-2">Institutional Performance Breakdown</div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Daily</span>
                  <span className="font-black text-[#00e676] text-xs sm:text-sm">
                    +${viewingTrader.dailyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-[#00e676] block">
                    (+{viewingTrader.dailyProfitPct}%)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Weekly</span>
                  <span className="font-black text-[#00e676] text-xs sm:text-sm">
                    +${viewingTrader.weeklyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-[#00e676] block">
                    (+{viewingTrader.weeklyProfitPct}%)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-[10px] text-slate-400 block uppercase">Monthly</span>
                  <span className="font-black text-[#00e676] text-xs sm:text-sm">
                    +${viewingTrader.monthlyProfitDollars.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-[#00e676] block">
                    (+{viewingTrader.monthlyProfitPct}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Copier Progress Bar */}
            <div className="space-y-2 p-3.5 rounded-xl bg-black/40 border border-slate-800/80 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Active Copiers Slot Counter:</span>
                <span className="font-bold text-white">{viewingTrader.totalCopiers} / 500 Copiers</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ff8800] to-[#00e676] transition-all duration-500"
                  style={{ width: `${Math.min(100, (viewingTrader.totalCopiers / 500) * 100)}%` }}
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
                  onClick={() => handleToggleCopy(viewingTrader, 10)}
                  className="flex-1 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition cursor-pointer shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 uppercase tracking-wide"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Cancel Copy</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={viewingTrader.totalCopiers >= viewingTrader.maxCopiers}
                  onClick={() => handleToggleCopy(viewingTrader, 10)}
                  className={`flex-1 py-3.5 rounded-xl font-black text-xs transition uppercase tracking-wide flex items-center justify-center gap-2 ${
                    viewingTrader.totalCopiers >= viewingTrader.maxCopiers
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 shadow-lg shadow-[#ff8800]/30 cursor-pointer'
                  }`}
                >
                  <span>{viewingTrader.totalCopiers >= viewingTrader.maxCopiers ? 'Fully Booked (Waitlist Only)' : 'COPY TRADER'}</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Join as Provider Modal */}
      {showProviderModal && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-[#090A0F]/85 backdrop-blur-sm animate-fade-in font-sans">
          <div className="w-full max-w-md bg-[#0d0f17] border border-slate-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
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
                  className="w-full bg-[#11131a] border border-slate-800/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 uppercase block mb-1">Trading Category</label>
                <select
                  value={providerCategory}
                  onChange={(e) => setProviderCategory(e.target.value as any)}
                  className="w-full bg-[#11131a] border border-slate-800/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#ff8800] cursor-pointer"
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
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-[#090A0F]/85 backdrop-blur-sm animate-fade-in font-sans">
          <div className="w-full max-w-md bg-[#0d0f17] border border-slate-800/80 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#ff8800]/20 border border-[#ff8800]/40 flex items-center justify-center mx-auto text-[#ffaa00]">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black text-white mb-1">Copy Trading Eligibility Required</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                To copy trades, you must have a Self-Capital account of $100+ or an Instant Funded account of $25,000+.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-slate-800/80 text-left text-[11px] text-slate-400 space-y-1 font-mono">
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
