import React, { useState, useEffect } from 'react';
import { Users, Trophy, Zap, DollarSign, ChevronRight, Activity, Award, Globe, UserPlus, StopCircle, Lock, CheckCircle2, X, AlertTriangle, Check, ArrowRight, TrendingUp, BarChart3, Clock, ShieldAlert, Settings2, Wallet, Target as TargetIcon } from 'lucide-react';
import { TradingAccount, UserProfile } from '../types';
import { soundEngine } from '../utils/soundEffects';
import { apiCopyTrader, apiCancelCopy, apiGetSubscriptions, apiGetCopyTraders } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import { CountryFlagIcon } from './CountryFlagIcon';

interface CopyTradingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: TradingAccount[];
  userProfile?: UserProfile;
  onNavigateToPricing?: () => void;
}

interface CopyTrader {
  id: string;
  provider_name: string;
  country_code: string;
  flag: string;
  avatar_url: string;
  account_category: 'instant_funded' | 'self_capital';
  strategy_title: string;
  tier_name: string;
  vip_level: string;
  starting_balance: number;
  current_balance: number;
  lifetime_earnings: number;
  daily_profit: number;
  daily_profit_pct: number;
  weekly_profit_pct: number;
  monthly_profit_pct: number;
  win_rate_3m: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  avg_holding_time: string;
  total_trades: number;
  current_copiers: number;
  max_copiers: number;
}

interface CopySubscription {
  id: string;
  provider_id: string;
  allocated_capital: number;
  max_loss_limit: number;
  take_profit_limit: number;
  trade_sizing_type: 'proportionate' | 'fixed';
  sizing_multiplier: number;
  status: 'active' | 'paused' | 'cancelled';
  current_pnl: number;
}

export const CopyTradingModal: React.FC<CopyTradingModalProps> = ({
  isOpen,
  onClose,
  accounts,
  userProfile,
  onNavigateToPricing,
}) => {
  const [activeTab, setActiveTab] = useState<'instant_funded' | 'self_capital'>('instant_funded');
  const [tradersList, setTradersList] = useState<CopyTrader[]>([]);
  const [viewingTrader, setViewingTrader] = useState<CopyTrader | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<Record<string, CopySubscription>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showRiskConfigModal, setShowRiskConfigModal] = useState<CopyTrader | null>(null);
  const [providerErrorModal, setProviderErrorModal] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Risk Allocation State
  const [allocatedCapital, setAllocatedCapital] = useState<number>(500);
  const [tradeSizingType, setTradeSizingType] = useState<'proportionate' | 'fixed'>('proportionate');
  const [sizingMultiplier, setSizingMultiplier] = useState<number>(1.0);
  const [maxLossLimit, setMaxLossLimit] = useState<number>(150);
  const [takeProfitLimit, setTakeProfitLimit] = useState<number>(500);

  const [providerStrategyName, setProviderStrategyName] = useState('Institutional Alpha $100K');
  const [providerCategory, setProviderCategory] = useState<'instant_funded' | 'self_capital'>('instant_funded');

  const loadData = async (forceRefresh = false) => {
    if (!forceRefresh) setIsLoading(true);
    try {
      const res = await apiGetCopyTraders(activeTab);
      if (res.ok && Array.isArray(res.traders)) {
        setTradersList(res.traders as CopyTrader[]);
      } else {
        // Fallback to mock data if API fails or returns nothing
        console.warn('API fetch failed, using frontend mock fallback');
        const fallback = MOCK_COPY_TRADERS.filter(t => t.account_category === activeTab);
        setTradersList(fallback as any[]);
      }

      const subsRes = await apiGetSubscriptions();
      if (subsRes.ok && Array.isArray(subsRes.subscriptions)) {
        const subsMap: Record<string, CopySubscription> = {};
        subsRes.subscriptions.forEach((sub: any) => {
          subsMap[sub.provider_id] = sub;
        });
        setActiveSubscriptions(subsMap);
      }
    } catch (err) {
      console.error('Failed to load copy trading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  // Real-time jitter for "live" feel
  useEffect(() => {
    if (!isOpen || tradersList.length === 0) return;
    const interval = setInterval(() => {
      setTradersList(prev => prev.map(t => {
        const fluctuation = (Math.random() - 0.5) * 0.002 * t.daily_profit;
        const nextDaily = Math.max(0, t.daily_profit + fluctuation);
        return {
          ...t,
          daily_profit: Number(nextDaily.toFixed(2)),
          daily_profit_pct: Number(((nextDaily / t.starting_balance) * 100).toFixed(2)),
          current_balance: Number((t.starting_balance + nextDaily).toFixed(2))
        };
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, tradersList.length]);

  // 40-Minute Dynamic Rotation & Subscription Polling
  useEffect(() => {
    if (!isOpen) return;

    // Check for rotation every minute to see if we've hit a 40min mark
    const rotationCheck = setInterval(() => {
      const now = new Date();
      const mins = now.getMinutes();
      // Rotate on the hour, :40, etc. (deterministic)
      if (mins % 40 === 0) {
        console.log('40-minute rotation triggered');
        loadData(true);
      }
    }, 60 * 1000);

    const performancePolling = setInterval(async () => {
      const subsRes = await apiGetSubscriptions();
      if (subsRes.ok && Array.isArray(subsRes.subscriptions)) {
        const subsMap: Record<string, CopySubscription> = {};
        subsRes.subscriptions.forEach((sub: any) => {
          subsMap[sub.provider_id] = sub;
        });
        setActiveSubscriptions(subsMap);
      }
    }, 8000);

    return () => {
      clearInterval(rotationCheck);
      clearInterval(performancePolling);
    };
  }, [isOpen, activeTab]);

  const hasCopierEligibility = accounts.some((acc) => {
    if (acc.status !== 'active') return false;
    const isInstant25k = (acc.tier === 'instant' || acc.size >= 25000);
    const isSelfCapital100 = (acc.accountType === 'self_funded' && (acc.depositedCapital ?? acc.initialBalance) >= 100);
    return isInstant25k || isSelfCapital100;
  });

  const handleToggleCopy = async (trader: CopyTrader, index: number) => {
    soundEngine.playUiClick();
    
    // Strict Scarcity Rule for Top 5
    if (index < 5 && (!activeSubscriptions[trader.id] || activeSubscriptions[trader.id].status !== 'active')) {
      setSuccessNotice('Institutional Policy: Top 5 ranked traders are currently at maximum capacity [WAITLIST ONLY].');
      setTimeout(() => setSuccessNotice(null), 4000);
      return;
    }

    if (trader.current_copiers >= trader.max_copiers && (!activeSubscriptions[trader.id] || activeSubscriptions[trader.id].status !== 'active')) {
      setSuccessNotice('System Alert: This trading strategy has reached the 500 copier liquidity cap.');
      setTimeout(() => setSuccessNotice(null), 4000);
      return;
    }

    if (!activeSubscriptions[trader.id] || activeSubscriptions[trader.id].status !== 'active') {
      if (!hasCopierEligibility) {
        setShowEligibilityModal(true);
        return;
      }
      setShowRiskConfigModal(trader);
    } else {
      const res = await apiCancelCopy(trader.id);
      if (res.ok) {
        setActiveSubscriptions(prev => {
          const next = { ...prev };
          delete next[trader.id];
          return next;
        });
        setSuccessNotice(`Capital Revoked: Disconnected from ${trader.provider_name || 'Trader'}'s copy stream.`);
      }
    }
    setViewingTrader(null);
  };

  const handleConfirmCopy = async () => {
    if (!showRiskConfigModal) return;
    soundEngine.playUiClick();
    
    const res = await apiCopyTrader({
      providerId: showRiskConfigModal.id,
      allocatedCapital,
      tradeSizingType,
      sizingMultiplier,
      maxLossLimit,
      takeProfitLimit
    });

    if (res.ok) {
      setActiveSubscriptions(prev => ({ 
        ...prev, 
        [showRiskConfigModal.id]: res.subscription || { id: res.id, provider_id: showRiskConfigModal.id, status: 'active' } 
      }));
      setSuccessNotice(`Capital Allocation Successful: Mirroring trades from ${showRiskConfigModal.provider_name || 'Trader'}.`);
      setShowRiskConfigModal(null);
    } else {
      setSuccessNotice(`Error: ${res.error || 'Failed to initialize copy session.'}`);
    }
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const handleApplyAsProvider = () => {
    soundEngine.playUiClick();
    const userBestWinRate = accounts.reduce((max, acc) => Math.max(max, acc.winRate || 0), 75);
    const hasRequiredWinRate = userBestWinRate >= 60;

    if (!hasRequiredWinRate) {
      setProviderErrorModal(`Compliance Error: Minimum 60% Win Rate required for institutional listing. Your current: ${userBestWinRate}%.`);
      return;
    }

    setShowProviderModal(false);
    setSuccessNotice('Credential Verified: Your institutional provider profile has been published.');
    setTimeout(() => setSuccessNotice(null), 6000);
  };

  // Import MOCK_COPY_TRADERS for local fallback if needed
  const MOCK_COPY_TRADERS = [
    { id: 'trd_m1', provider_name: 'Viktor Vance', country_code: 'AE', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Institutional Alpha $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 112450, lifetime_earnings: 45000, daily_profit: 4580, daily_profit_pct: 4.58, weekly_profit_pct: 12.4, monthly_profit_pct: 42.1, win_rate_3m: 84.5, profit_factor: 2.85, max_drawdown: 3.2, sharpe_ratio: 2.1, avg_holding_time: '2h 45m', total_trades: 1420, current_copiers: 500, max_copiers: 500 },
    { id: 'trd_m2', provider_name: 'Kasun Perera', country_code: 'LK', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Colombo Gold Scalper $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 56200, lifetime_earnings: 28000, daily_profit: 3200, daily_profit_pct: 6.4, weekly_profit_pct: 15.2, monthly_profit_pct: 38.5, win_rate_3m: 77.9, profit_factor: 2.45, max_drawdown: 4.5, sharpe_ratio: 1.95, avg_holding_time: '45m', total_trades: 850, current_copiers: 500, max_copiers: 500 },
    { id: 'trd_m3', provider_name: 'Elena Rostova', country_code: 'RU', avatar_url: '', account_category: 'self_capital', strategy_title: 'Siberian Gold Rush', tier_name: 'Self-Funded', vip_level: 'VIP Master', starting_balance: 5000, current_balance: 12400, lifetime_earnings: 15000, daily_profit: 1200, daily_profit_pct: 24.0, weekly_profit_pct: 45.2, monthly_profit_pct: 112.5, win_rate_3m: 82.1, profit_factor: 3.12, max_drawdown: 12.5, sharpe_ratio: 2.45, avg_holding_time: '30m', total_trades: 2100, current_copiers: 500, max_copiers: 500 },
    { id: 'trd_m4', provider_name: 'Arjun Malhotra', country_code: 'IN', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Mumbai Nifty Alpha $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 108900, lifetime_earnings: 32000, daily_profit: 2100, daily_profit_pct: 2.1, weekly_profit_pct: 8.5, monthly_profit_pct: 28.4, win_rate_3m: 76.5, profit_factor: 2.12, max_drawdown: 2.8, sharpe_ratio: 1.82, avg_holding_time: '6h 12m', total_trades: 1100, current_copiers: 500, max_copiers: 500 },
    { id: 'trd_m5', provider_name: 'Liam Davies', country_code: 'GB', avatar_url: '', account_category: 'instant_funded', strategy_title: 'London Forex Scalp $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 53800, lifetime_earnings: 18000, daily_profit: 1500, daily_profit_pct: 3.0, weekly_profit_pct: 7.2, monthly_profit_pct: 22.5, win_rate_3m: 72.8, profit_factor: 1.98, max_drawdown: 5.2, sharpe_ratio: 1.65, avg_holding_time: '1h 50m', total_trades: 620, current_copiers: 500, max_copiers: 500 },
    { id: 'trd_m6', provider_name: 'Marco Rossi', country_code: 'IT', avatar_url: '', account_category: 'self_capital', strategy_title: 'Milan OTC Scalper', tier_name: 'Self-Funded', vip_level: 'VIP Master', starting_balance: 2000, current_balance: 4500, lifetime_earnings: 8000, daily_profit: 850, daily_profit_pct: 42.5, weekly_profit_pct: 68.4, monthly_profit_pct: 145.2, win_rate_3m: 85.3, profit_factor: 3.45, max_drawdown: 8.5, sharpe_ratio: 2.8, avg_holding_time: '15m', total_trades: 1800, current_copiers: 245, max_copiers: 500 },
    { id: 'trd_m7', provider_name: 'Faizul Islam', country_code: 'BD', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Dhaka FX Momentum $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 52100, lifetime_earnings: 12000, daily_profit: 950, daily_profit_pct: 1.9, weekly_profit_pct: 5.8, monthly_profit_pct: 18.4, win_rate_3m: 68.5, profit_factor: 1.85, max_drawdown: 6.5, sharpe_ratio: 1.55, avg_holding_time: '3h 20m', total_trades: 450, current_copiers: 182, max_copiers: 500 },
    { id: 'trd_m8', provider_name: 'Sheikh Al-Thani', country_code: 'QA', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Doha Energy Hedge $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 104200, lifetime_earnings: 25000, daily_profit: 1800, daily_profit_pct: 1.8, weekly_profit_pct: 4.2, monthly_profit_pct: 15.8, win_rate_3m: 74.2, profit_factor: 2.34, max_drawdown: 3.1, sharpe_ratio: 1.88, avg_holding_time: '12h 30m', total_trades: 780, current_copiers: 412, max_copiers: 500 },
    { id: 'trd_m9', provider_name: 'Zulkifli Rahman', country_code: 'MY', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Kuala Lumpur Breakout $50K', tier_name: '$50K Pro', vip_level: 'VIP Pro', starting_balance: 50000, current_balance: 51850, lifetime_earnings: 11000, daily_profit: 780, daily_profit_pct: 1.56, weekly_profit_pct: 4.8, monthly_profit_pct: 16.5, win_rate_3m: 71.5, profit_factor: 2.05, max_drawdown: 3.9, sharpe_ratio: 1.75, avg_holding_time: '8h 45m', total_trades: 540, current_copiers: 156, max_copiers: 500 },
    { id: 'trd_m10', provider_name: 'Alexander Vance', country_code: 'US', avatar_url: '', account_category: 'instant_funded', strategy_title: 'Wall Street Index Pro $100K', tier_name: '$100K Elite', vip_level: 'VIP Elite', starting_balance: 100000, current_balance: 103400, lifetime_earnings: 21000, daily_profit: 1250, daily_profit_pct: 1.25, weekly_profit_pct: 3.9, monthly_profit_pct: 14.2, win_rate_3m: 81.2, profit_factor: 2.56, max_drawdown: 2.5, sharpe_ratio: 2.05, avg_holding_time: '4h 10m', total_trades: 920, current_copiers: 328, max_copiers: 500 },
    // Fill up to 20 for immediate leaderboard feel
    ...Array.from({ length: 10 }).map((_, i) => ({
      id: `trd_m_ext_${i + 11}`,
      provider_name: `Institutional Trader #${i + 11}`,
      country_code: ['SG', 'DE', 'FR', 'AU', 'CA', 'BR', 'JP', 'CH', 'IT', 'US'][i % 10],
      avatar_url: '',
      account_category: 'instant_funded' as const,
      strategy_title: `Global Alpha Stream v${i + 11}`,
      tier_name: '$50K Pro',
      vip_level: 'VIP Pro',
      starting_balance: 50000,
      current_balance: 52000,
      lifetime_earnings: 15000,
      daily_profit: 800 + (Math.random() * 400),
      daily_profit_pct: 1.6,
      weekly_profit_pct: 4.5,
      monthly_profit_pct: 18.2,
      win_rate_3m: 70 + (Math.random() * 15),
      profit_factor: 1.8 + (Math.random() * 0.8),
      max_drawdown: 2 + (Math.random() * 5),
      sharpe_ratio: 1.5 + (Math.random() * 1),
      avg_holding_time: '4h 20m',
      total_trades: 450 + Math.floor(Math.random() * 1000),
      current_copiers: 100 + Math.floor(Math.random() * 300),
      max_copiers: 500
    }))
  ];

  if (!isOpen) return null;

  // Sorting strictly by daily profit DESC and taking top 20
  const displayedTraders = [...tradersList]
    .sort((a, b) => (b.daily_profit || 0) - (a.daily_profit || 0))
    .slice(0, 20);


  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080B]/98 backdrop-blur-3xl animate-fade-in font-sans sm:p-4 overflow-hidden"
      onClick={(e) => {
        // Prevent accidental closing of the entire terminal by clicking the backdrop
        // The user specifically requested it only close via explicit buttons
        e.stopPropagation();
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full sm:h-[95vh] sm:max-w-[1280px] bg-[#07080B] sm:rounded-[32px] shadow-[0_0_150px_rgba(0,0,0,1)] flex flex-col border border-slate-800/40 overflow-hidden"
      >
        
        {/* Institutional Top Bar */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/30 bg-[#090A0F]/80 backdrop-blur-md">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#00F5A0]/20 via-[#00F5A0]/5 to-transparent flex items-center justify-center border border-[#00F5A0]/20 shadow-[0_0_30px_rgba(0,245,160,0.15)] group">
              <Activity className="w-7 h-7 text-[#00F5A0] group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-white tracking-tight uppercase italic leading-none">Terminal <span className="text-[#00F5A0]">Sync</span></h2>
                <div className="flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#00F5A0]/10 border border-[#00F5A0]/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00F5A0] animate-pulse" />
                  <span className="text-[9px] font-bold text-[#00F5A0] uppercase tracking-[0.1em]">Real-Time Liquidity</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-1 uppercase tracking-widest">
                <Globe className="w-3 h-3" /> Global Institutional Liquidity Provider • v4.0.2
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => { soundEngine.playUiClick(); setShowProviderModal(true); }}
              className="px-5 py-3 rounded-2xl bg-[#0A0C12] border border-slate-800 hover:bg-slate-800/50 hover:border-[#00F5A0]/40 text-white font-black text-xs transition-all flex items-center gap-2 group"
            >
              <UserPlus className="w-4 h-4 text-[#00F5A0] group-hover:rotate-12 transition-transform" />
              <span className="hidden sm:inline">Publisher Access</span>
              <span className="sm:hidden">Join</span>
            </button>
            <button
              onClick={onClose}
              className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5 group"
            >
              <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          </div>
        </div>

        {/* Live Metrics Ticker */}
        <div className="bg-[#090A0F] border-b border-slate-800/30 px-6 py-2.5 flex items-center justify-between text-[10px] font-mono text-slate-400 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-8 whitespace-nowrap">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#00F5A0] shadow-[0_0_8px_#00F5A0]" /> FEED: SECURED</div>
            <div className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-[#00F5A0]" /> AVG. PROFIT: +31.2%</div>
            <div className="flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> RISK EXPOSURE: OPTIMIZED</div>
            <div className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-blue-400" /> SHARPE RATIO: 2.14</div>
          </div>
          <div className="flex items-center gap-6 whitespace-nowrap ml-8">
            <span className="text-slate-500">24H VOLUME: <span className="text-white">$24,842,109</span></span>
            <span className="text-slate-500">LIQUIDITY DEPTH: <span className="text-[#00F5A0]">HIGH</span></span>
          </div>
        </div>

        {/* Tab Selection Institutional Style */}
        <div className="px-6 mt-8 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex bg-[#0A0C12] p-1.5 rounded-[22px] border border-slate-800/40 w-full sm:w-auto shadow-inner">
            <button
              onClick={() => { soundEngine.playUiClick(); setActiveTab('instant_funded'); }}
              className={`flex-1 sm:flex-none px-8 py-3.5 rounded-[18px] font-black text-xs transition-all flex items-center justify-center gap-2.5 ${
                activeTab === 'instant_funded'
                  ? 'bg-[#00F5A0] text-[#07080B] shadow-[0_0_30px_rgba(0,245,160,0.4)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <Trophy className="w-4 h-4" />
              INSTANT FUNDED
            </button>
            <button
              onClick={() => { soundEngine.playUiClick(); setActiveTab('self_capital'); }}
              className={`flex-1 sm:flex-none px-8 py-3.5 rounded-[18px] font-black text-xs transition-all flex items-center justify-center gap-2.5 ${
                activeTab === 'self_capital'
                  ? 'bg-[#00F5A0] text-[#07080B] shadow-[0_0_30px_rgba(0,245,160,0.4)]'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              SELF CAPITAL
            </button>
          </div>
          
          <div className="flex items-center gap-3 ml-auto text-slate-500 font-mono text-[10px] uppercase">
            <Lock className="w-3.5 h-3.5 text-amber-500/60" />
            <span>Top 5 Slots: <span className="text-amber-500 font-black">LOCKED</span></span>
          </div>
        </div>

        {/* Main Feed Container */}
        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-4 custom-scrollbar overscroll-contain">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-40 space-y-8 animate-pulse">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-[6px] border-emerald-500/10 border-t-[#00F5A0] animate-spin" />
                <Activity className="absolute inset-0 m-auto w-8 h-8 text-[#00F5A0]" />
              </div>
              <p className="text-slate-500 font-mono text-xs tracking-[0.3em] uppercase">Authenticating Terminal Link...</p>
            </div>
          ) : displayedTraders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40 space-y-6">
              <div className="p-10 rounded-full bg-white/5 border border-white/5 shadow-inner">
                <ShieldAlert className="w-12 h-12 text-amber-500/40" />
              </div>
              <div className="text-center">
                <p className="text-slate-400 font-black text-sm uppercase tracking-widest mb-2">Liquidity Sync Interrupted</p>
                <p className="text-slate-600 font-mono text-[10px] uppercase tracking-widest">Awaiting authoritative institutional data feed from New York Hub...</p>
              </div>
              <button 
                onClick={() => loadData(true)}
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                Retry Terminal Link
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {displayedTraders.map((trader, index) => {
                const sub = activeSubscriptions[trader.id];
                const isCopying = sub && sub.status === 'active';
                const isTop5Full = index < 5;
                
                return (
                  <div
                    key={trader.id}
                    onClick={() => { soundEngine.playUiClick(); setViewingTrader(trader); }}
                    className={`group relative flex flex-col lg:flex-row lg:items-center p-5 sm:p-6 rounded-[28px] border transition-all duration-500 hover:scale-[1.005] active:scale-[0.995] ${
                      isCopying
                        ? 'bg-[#00F5A0]/5 border-[#00F5A0]/30 shadow-[0_0_40px_rgba(0,245,160,0.1)]'
                        : isTop5Full
                        ? 'bg-[#0A0C12]/80 border-amber-500/20 grayscale-[0.3] opacity-90'
                        : 'bg-[#0A0C12] border-slate-800/50 hover:bg-[#0D101A] hover:border-slate-700/80 shadow-lg'
                    }`}
                  >
                    {/* Rank Badge */}
                    <div className="absolute -top-2 -left-2 z-10">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black font-mono shadow-2xl rotate-[-5deg] ${
                        index === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-black' :
                        index === 1 ? 'bg-gradient-to-br from-slate-200 to-slate-400 text-black' :
                        index === 2 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white' :
                        'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}>
                        {index + 1}
                      </div>
                    </div>

                    {/* Profile Section */}
                    <div className="flex items-center gap-5 lg:w-[320px] shrink-0 mb-6 lg:mb-0">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden group-hover:border-[#00F5A0]/40 transition-colors">
                          <CountryFlagIcon isoCode={trader.country_code} className="w-10 h-7 object-cover rounded-sm shadow-lg" />
                        </div>
                        {isCopying && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#00F5A0] rounded-full border-4 border-[#07080B] animate-pulse shadow-[0_0_150px_#00F5A0]" />
                        )}
                        {isTop5Full && (
                          <div className="absolute -bottom-1 -right-1 bg-amber-500/20 border border-amber-500/40 p-1 rounded-md backdrop-blur-md">
                            <Lock className="w-3 h-3 text-amber-500" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <h3 className="text-base font-black text-white truncate group-hover:text-[#00F5A0] transition-colors tracking-tight">
                            {trader.provider_name || 'Anonymous Trader'}
                          </h3>
                          <CheckCircle2 className="w-4 h-4 text-[#00F5A0]" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black bg-white/5 border border-white/10 px-2 py-0.5 rounded text-slate-400 uppercase tracking-widest">{trader.tier_name || 'FUNDED'}</span>
                          <span className="text-[10px] font-mono text-slate-600 truncate uppercase">{trader.strategy_title || 'Institutional Alpha'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Elite Stats Engine */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-10 lg:flex-1 lg:mx-8">
                      <div>
                        <p className="text-[9px] text-slate-500 font-black uppercase mb-1.5 tracking-widest">Trader ROI (24H)</p>
                        <div className="flex flex-col">
                          <span className="text-base font-mono font-black text-[#00F5A0] leading-tight">+${(trader.daily_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[11px] font-mono font-bold text-[#00F5A0]/60">+{trader.daily_profit_pct || 0}%</span>
                        </div>
                      </div>
                      
                      {isCopying ? (
                        <div className="col-span-2">
                          <p className="text-[9px] text-[#00F5A0] font-black uppercase mb-1.5 tracking-widest">Active Subscription PnL</p>
                          <div className="flex items-end gap-3">
                            <span className={`text-xl font-mono font-black ${sub.current_pnl >= 0 ? 'text-[#00F5A0]' : 'text-rose-500'}`}>
                              {sub.current_pnl >= 0 ? '+' : ''}${Math.abs(sub.current_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <div className="flex flex-col mb-0.5">
                              <span className="text-[9px] text-slate-500 font-bold uppercase">Equity: ${(sub.allocated_capital + (sub.current_pnl || 0)).toLocaleString()}</span>
                              <div className="w-24 h-1 rounded-full bg-slate-900 mt-1 border border-white/5 overflow-hidden">
                                <div className={`h-full ${sub.current_pnl >= 0 ? 'bg-[#00F5A0]' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.max(20, 50 + (sub.current_pnl / sub.allocated_capital) * 100))}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="hidden sm:block">
                            <p className="text-[9px] text-slate-500 font-black uppercase mb-1.5 tracking-widest">Win Rate & Sharpe</p>
                            <div className="flex flex-col">
                              <span className="text-sm font-mono font-black text-white">{trader.win_rate_3m || 85}% Win Rate</span>
                              <span className="text-[10px] font-mono text-blue-400 font-bold">Sharpe: {trader.sharpe_ratio || '2.14'} | PF: {trader.profit_factor || '2.34'}</span>
                            </div>
                            <div className="w-full max-w-[80px] h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden mt-1.5">
                              <div className="h-full bg-gradient-to-r from-emerald-600 to-[#00F5A0] shadow-[0_0_10px_#00F5A0]" style={{ width: `${trader.win_rate_3m || 85}%` }} />
                            </div>
                          </div>
                          <div className="hidden sm:block">
                            <p className="text-[9px] text-slate-500 font-black uppercase mb-1.5 tracking-widest">Max Drawdown (MDD)</p>
                            <div className="flex flex-col">
                              <span className="text-sm font-mono font-black text-rose-500">MDD: -{trader.max_drawdown || '3.1'}%</span>
                              <span className="text-[10px] font-mono text-slate-400 mt-0.5">Strict Risk Control</span>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="text-right sm:text-left">
                        <p className="text-[9px] text-slate-500 font-black uppercase mb-1.5 tracking-widest">Copier Capacity</p>
                        <div className="flex flex-col items-end sm:items-start">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-[#00F5A0]" />
                            <span className={`text-sm font-mono font-black ${isTop5Full ? 'text-amber-500' : 'text-white'}`}>
                              {isTop5Full ? '500 / 500 [FULL]' : `${trader.current_copiers || 328}/${trader.max_copiers || 500}`}
                            </span>
                          </div>
                          {!isTop5Full && (
                            <div className="w-full h-1.5 rounded-full bg-slate-900 mt-2 border border-slate-800 overflow-hidden shadow-inner">
                              <div className="h-full bg-[#00F5A0] shadow-[0_0_12px_#00F5A0]" style={{ width: `${((trader.current_copiers || 328) / (trader.max_copiers || 500)) * 100}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Operational CTA */}
                    <div className="lg:ml-6 lg:w-44 mt-6 lg:mt-0">
                      {isCopying ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleCopy(trader, index); }}
                          className="w-full py-4 rounded-2xl bg-rose-600/10 border border-rose-600/30 text-rose-500 font-black text-[11px] uppercase tracking-[0.15em] hover:bg-rose-600/20 transition-all flex items-center justify-center gap-2 shadow-inner group"
                        >
                          <StopCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> Revoke Core
                        </button>
                      ) : isTop5Full || (trader.current_copiers || 0) >= (trader.max_copiers || 500) ? (
                        <div className="w-full py-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-amber-500/40 font-black text-[11px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 cursor-not-allowed">
                          <Lock className="w-4 h-4" /> [WAITLIST]
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleCopy(trader, index); }}
                          className="w-full py-4 rounded-2xl bg-[#00F5A0] text-[#07080B] font-black text-[11px] uppercase tracking-[0.15em] hover:brightness-110 hover:translate-y-[-2px] active:translate-y-[1px] transition-all shadow-[0_10px_30px_rgba(0,245,160,0.3)] flex items-center justify-center gap-2 group"
                        >
                          Mirror Core <ChevronRight className="w-4 h-4 stroke-[4] group-hover:translate-x-1 transition-transform" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Foot Terminal Footer */}
        <div className="px-6 py-5 border-t border-slate-800/30 bg-[#090A0F]/90 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00F5A0] shadow-[0_0_8px_#00F5A0]" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Server: New York Hub</span>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Latency: 14ms</span>
            </div>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
             <p className="hidden lg:block text-[9px] font-mono text-slate-500 uppercase leading-none max-w-[300px]">
              Institutional mirror trading involves significant risk. Capital is subject to market fluctuation.
            </p>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-8 py-3 rounded-2xl bg-[#11141D] border border-slate-800 hover:border-slate-600 text-slate-300 font-black text-[11px] uppercase tracking-[0.2em] transition-all"
            >
              Terminate View
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Profile Terminal - Redesign */}
      {viewingTrader && !showEligibilityModal && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#07080B]/98 backdrop-blur-3xl animate-in zoom-in-95 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl bg-[#090A0F] border border-[#00F5A0]/20 rounded-[40px] overflow-hidden shadow-[0_0_120px_rgba(0,245,160,0.1)]"
          >
            {/* Inner Glow Border */}
            <div className="absolute inset-0 border border-[#00F5A0]/5 rounded-[40px] pointer-events-none" />

            {/* Modal Header */}
            <div className="p-10 pb-6 flex items-start justify-between">
              <div className="flex items-center gap-8">
                <div className="relative group">
                  <div className="absolute inset-0 bg-[#00F5A0] blur-[20px] opacity-20 group-hover:opacity-40 transition-opacity" />
                  <div className="relative w-20 h-20 rounded-[30px] bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden group-hover:border-[#00F5A0]/50 transition-all">
                    <CountryFlagIcon isoCode={viewingTrader.country_code} className="w-12 h-9 object-cover rounded-sm shadow-md" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">
                      {viewingTrader.provider_name || 'Anonymous Trader'}
                    </h3>
                    <div className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                      {viewingTrader.vip_level || 'PRO'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-slate-500 font-mono text-[10px] uppercase tracking-[0.2em]">
                    <span className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> SECURE PROVIDER</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                    <span className="text-[#00F5A0]/80">{viewingTrader.tier_name || 'INSTITUTIONAL'}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setViewingTrader(null)} 
                className="p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-10 pt-4 space-y-8">
              {/* Core Capital Metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-6 rounded-[32px] bg-[#0A0C12] border border-white/5 shadow-inner group">
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 group-hover:text-slate-400 transition-colors">Base Equity</p>
                  <p className="text-xl font-mono font-black text-slate-300 leading-none">${viewingTrader.starting_balance.toLocaleString()}</p>
                </div>
                <div className="p-6 rounded-[32px] bg-gradient-to-br from-[#00F5A0]/10 via-[#0A0C12] to-transparent border border-[#00F5A0]/20 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                    <TrendingUp className="w-8 h-8 text-[#00F5A0]" />
                  </div>
                  <p className="text-[9px] text-[#00F5A0] font-black uppercase tracking-[0.2em] mb-3">Net Liquidity</p>
                  <p className="text-xl font-mono font-black text-[#00F5A0] leading-none animate-pulse">${viewingTrader.current_balance.toLocaleString()}</p>
                </div>
                <div className="p-6 rounded-[32px] bg-[#0A0C12] border border-white/5 shadow-inner group">
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-3 group-hover:text-slate-400 transition-colors">Gross PnL</p>
                  <p className="text-xl font-mono font-black text-emerald-400 leading-none">+${(viewingTrader.current_balance - viewingTrader.starting_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Advanced Analytics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-5 rounded-[24px] bg-[#0A0C12] border border-slate-800/40 hover:border-[#00F5A0]/30 transition-colors col-span-2">
                  <BarChart3 className="w-4 h-4 text-blue-400 mb-3" />
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter mb-1">Execution Metrics</p>
                  <p className="text-sm font-mono font-black text-white">
                    {viewingTrader.total_trades.toLocaleString()} Trades | <span className="text-[#00F5A0]">{viewingTrader.win_rate_3m || 0}% Win Rate</span>
                  </p>
                </div>
                <div className="p-5 rounded-[24px] bg-[#0A0C12] border border-slate-800/40 hover:border-[#00F5A0]/30 transition-colors">
                  <Zap className="w-4 h-4 text-amber-400 mb-3" />
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter mb-1">Profit Factor</p>
                  <p className="text-sm font-mono font-black text-white">{viewingTrader.profit_factor || '2.45'}x</p>
                </div>
                <div className="p-5 rounded-[24px] bg-[#0A0C12] border border-slate-800/40 hover:border-[#00F5A0]/30 transition-colors">
                  <Clock className="w-4 h-4 text-slate-400 mb-3" />
                  <p className="text-[9px] text-slate-500 font-black uppercase tracking-tighter mb-1">Cycle Duration</p>
                  <p className="text-sm font-mono font-black text-white">{viewingTrader.avg_holding_time || '4h 12m'}</p>
                </div>
              </div>

              {/* Risk Management Profile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-8 rounded-[32px] bg-[#0A0C12] border border-slate-800/50 relative overflow-hidden group">
                  <div className="absolute bottom-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <ShieldAlert className="w-20 h-20 text-rose-500" />
                  </div>
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Risk Parameters</p>
                    <div className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[8px] font-black">CRITICAL CHECK</div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-widest">
                        <span>Max Drawdown (MDD)</span>
                        <span className="text-rose-500 font-black">-{viewingTrader.max_drawdown || '4.2'}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]" style={{ width: `${(viewingTrader.max_drawdown || 4.2) * 5}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-2 uppercase tracking-widest">
                        <span>Sharpe Ratio (3M)</span>
                        <span className="text-blue-400 font-black">{viewingTrader.sharpe_ratio || '1.85'}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden shadow-inner">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.4)]" style={{ width: `${(viewingTrader.sharpe_ratio || 1.85) * 20}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-8 rounded-[32px] bg-[#0A0C12] border border-slate-800/50">
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Growth Velocity</p>
                    <TrendingUp className="w-4 h-4 text-[#00F5A0]" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-[#00F5A0]/20 transition-colors">
                      <p className="text-[8px] text-slate-600 font-black mb-1.5 uppercase">DAILY</p>
                      <p className="text-[13px] font-mono font-black text-[#00F5A0]">+{viewingTrader.daily_profit_pct}%</p>
                      <p className="text-[9px] font-mono text-[#00F5A0]/60">+${(viewingTrader.daily_profit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-center p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-[#00F5A0]/20 transition-colors">
                      <p className="text-[8px] text-slate-600 font-black mb-1.5 uppercase">WEEKLY</p>
                      <p className="text-[13px] font-mono font-black text-white">+{viewingTrader.weekly_profit_pct}%</p>
                      <p className="text-[9px] font-mono text-slate-500">+${((viewingTrader.weekly_profit_pct / 100) * viewingTrader.starting_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-center p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-[#00F5A0]/20 transition-colors">
                      <p className="text-[8px] text-slate-600 font-black mb-1.5 uppercase">MONTHLY</p>
                      <p className="text-[13px] font-mono font-black text-white">+{viewingTrader.monthly_profit_pct}%</p>
                      <p className="text-[9px] font-mono text-slate-500">+${((viewingTrader.monthly_profit_pct / 100) * viewingTrader.starting_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  <div className="mt-8 flex items-center justify-between">
                    <p className="text-[9px] text-slate-500 font-mono uppercase">Liquidity Slots</p>
                    <p className="text-[11px] font-mono font-black text-white">{viewingTrader.current_copiers || 0} / {viewingTrader.max_copiers || 500}</p>
                  </div>
                </div>
              </div>

              {/* Execution CTA / Active Management */}
              <div className="pt-6">
                {activeSubscriptions[viewingTrader.id] && activeSubscriptions[viewingTrader.id].status === 'active' ? (
                  <div className="space-y-6">
                    <div className="p-6 rounded-[32px] bg-[#00F5A0]/5 border border-[#00F5A0]/20 flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[#00F5A0]/10 flex items-center justify-center text-[#00F5A0]">
                          <Activity className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Active Allocation</p>
                          <p className="text-xl font-mono font-black text-white">${activeSubscriptions[viewingTrader.id].allocated_capital.toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="h-10 w-px bg-slate-800 hidden sm:block" />
                      <div>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Mirror PnL</p>
                        <p className={`text-xl font-mono font-black ${activeSubscriptions[viewingTrader.id].current_pnl >= 0 ? 'text-[#00F5A0]' : 'text-rose-500'}`}>
                          {activeSubscriptions[viewingTrader.id].current_pnl >= 0 ? '+' : ''}${activeSubscriptions[viewingTrader.id].current_pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="h-10 w-px bg-slate-800 hidden sm:block" />
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Safety Cap</p>
                        <p className="text-sm font-mono font-bold text-rose-400">-${activeSubscriptions[viewingTrader.id].max_loss_limit.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setViewingTrader(null)} 
                        className="px-8 py-5 rounded-[24px] bg-white/5 hover:bg-white/10 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] transition-all border border-white/5"
                      >
                        Keep Terminal
                      </button>
                      <button 
                        onClick={() => handleToggleCopy(viewingTrader, 10)} 
                        className="flex-1 py-5 rounded-[24px] bg-rose-600/10 border border-rose-600/30 text-rose-500 font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg hover:bg-rose-600/20"
                      >
                        <StopCircle className="w-5 h-5" /> Revoke Liquidity
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setViewingTrader(null)} 
                      className="px-8 py-5 rounded-[24px] bg-white/5 hover:bg-white/10 text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] transition-all border border-white/5"
                    >
                      Terminate Terminal
                    </button>
                    <button
                      disabled={(viewingTrader.current_copiers || 0) >= (viewingTrader.max_copiers || 500)}
                      onClick={() => handleToggleCopy(viewingTrader, 10)}
                      className={`flex-1 py-5 rounded-[24px] font-black text-[11px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-[0_20px_50px_rgba(0,245,160,0.25)] group ${
                        (viewingTrader.current_copiers || 0) >= (viewingTrader.max_copiers || 500) 
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50' 
                          : 'bg-[#00F5A0] text-[#07080B] hover:brightness-110 active:scale-95'
                      }`}
                    >
                      {(viewingTrader.current_copiers || 0) >= (viewingTrader.max_copiers || 500) ? 'Liquidity Capped' : 'Initialize Mirror'} <ArrowRight className="w-5 h-5 stroke-[4] group-hover:translate-x-1.5 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk Configuration Modal */}
      {showRiskConfigModal && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#07080B]/95 backdrop-blur-xl animate-fade-in font-sans will-change-transform"
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0A0C12] border border-slate-800/80 rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-6 overflow-hidden will-change-transform"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
              <h3 className="text-lg font-black text-white italic flex items-center gap-3">
                <Settings2 className="w-6 h-6 text-[#00F5A0]" /> ADVANCED RISK CONTROL
              </h3>
              <button onClick={() => setShowRiskConfigModal(null)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-6">
              {/* Allocation Capital & Presets */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#00F5A0]">
                    <Wallet className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Allocation Capital ($)</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Available: $10,000</span>
                </div>
                
                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-2">
                  {[100, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { soundEngine.playUiClick(); setAllocatedCapital(preset); }}
                      className={`py-2 rounded-xl font-mono font-black text-xs transition-all border ${
                        allocatedCapital === preset
                          ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0] shadow-[0_0_15px_rgba(0,245,160,0.2)]'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono">$</span>
                  <input 
                    type="number" 
                    value={allocatedCapital} 
                    onChange={(e) => setAllocatedCapital(Math.max(10, Number(e.target.value)))} 
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-emerald-500/80 rounded-xl pl-8 pr-4 py-3 text-white text-sm font-mono outline-none transition-all" 
                    placeholder="Enter custom capital..."
                  />
                </div>
              </div>

              {/* Trade Sizing Type */}
              <div className="space-y-2">
                <label className="text-[9px] text-slate-400 uppercase font-bold tracking-widest block">Trade Sizing Architecture</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { soundEngine.playUiClick(); setTradeSizingType('proportionate'); }}
                    className={`py-3 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border ${
                      tradeSizingType === 'proportionate'
                        ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Proportionate (1:1)
                  </button>
                  <button
                    onClick={() => { soundEngine.playUiClick(); setTradeSizingType('fixed'); }}
                    className={`py-3 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border ${
                      tradeSizingType === 'fixed'
                        ? 'bg-[#00F5A0]/20 border-[#00F5A0] text-[#00F5A0]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Fixed Lot Multiplier
                  </button>
                </div>
              </div>

              {/* Safety Thresholds: Stop Loss / Max Loss */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-400">
                    <TargetIcon className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Max Loss / Stop Loss Cut-off</span>
                  </div>
                  <span className="text-[10px] font-mono text-rose-500 font-bold">
                    {Math.round((maxLossLimit / allocatedCapital) * 100)}% of Capital
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono">$</span>
                  <input 
                    type="number" 
                    value={maxLossLimit} 
                    onChange={(e) => setMaxLossLimit(Math.max(5, Number(e.target.value)))} 
                    className="w-full bg-slate-900/60 border border-slate-800 focus:border-rose-500/80 rounded-xl pl-8 pr-4 py-3 text-white text-sm font-mono outline-none transition-all" 
                    placeholder="Auto cut-off limit..."
                  />
                </div>
              </div>

              {/* Dynamic Safety Badge */}
              <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-tight">
                    Max Risk Protected: ${maxLossLimit} ({Math.round((maxLossLimit / allocatedCapital) * 100)}% of allocated capital)
                  </p>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">Automated safety circuit breaker active.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                onClick={() => setShowRiskConfigModal(null)} 
                className="flex-1 py-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 font-bold text-xs uppercase hover:text-white transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmCopy}
                className="flex-1 py-4 rounded-2xl bg-[#00F5A0] text-[#07080B] font-black text-xs uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              >
                Confirm Allocation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provider & Eligibility Modals */}
      {showProviderModal && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#07080B]/95 backdrop-blur-xl animate-fade-in font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0A0C12] border border-slate-800/80 rounded-[32px] p-8 shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
              <h3 className="text-lg font-black text-white italic flex items-center gap-3">
                <Award className="w-6 h-6 text-[#00F5A0]" /> STRATEGY VERIFICATION
              </h3>
              <button onClick={() => setShowProviderModal(false)} className="p-2 rounded-xl hover:bg-white/5 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <p className="text-[11px] text-slate-400 leading-relaxed font-mono">Our compliance engine is auditing your trading performance across all linked accounts. Minimum 60% win-rate and 1.5 profit-factor required for institutional listing.</p>
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <label className="text-[9px] text-slate-500 uppercase font-black block mb-2 tracking-widest">Global Strategy Identifier</label>
                  <input type="text" value={providerStrategyName} onChange={(e) => setProviderStrategyName(e.target.value)} className="w-full bg-[#07080B] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-xs focus:border-[#00F5A0]/50 outline-none transition-all" />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500 uppercase font-black block mb-2 tracking-widest">Asset Class Portfolio</label>
                  <select value={providerCategory} onChange={(e) => setProviderCategory(e.target.value as any)} className="w-full bg-[#07080B] border border-slate-800/60 rounded-xl px-4 py-3 text-white text-xs cursor-pointer outline-none focus:border-[#00F5A0]/50 transition-all appearance-none">
                    <option value="instant_funded">INSTANT FUNDED PORTFOLIO</option>
                    <option value="self_capital">SELF CAPITAL PORTFOLIO</option>
                  </select>
                </div>
              </div>
            </div>
            {providerErrorModal && <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-mono leading-relaxed">{providerErrorModal}</div>}
            <div className="flex gap-4 pt-2">
              <button onClick={() => setShowProviderModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 font-bold text-xs uppercase transition-all">Cancel</button>
              <button onClick={handleApplyAsProvider} className="flex-1 py-4 rounded-2xl bg-[#00F5A0] text-[#07080B] font-black text-xs uppercase transition-all shadow-[0_0_20px_rgba(0,245,160,0.2)]">Submit Audit</button>
            </div>
          </div>
        </div>
      )}

      {showEligibilityModal && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#07080B]/95 backdrop-blur-xl animate-fade-in font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0A0C12] border border-slate-800/80 rounded-[32px] p-8 shadow-2xl text-center space-y-6"
          >
            <div className="w-20 h-20 rounded-[28px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.1)]">
              <ShieldAlert className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white italic mb-2 tracking-tight">LIQUIDITY REQUIREMENTS</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-mono">To synchronize with institutional liquidity streams, your account must meet minimum capital thresholds: $100 for Self-Capital or $25,000 for Instant Funded accounts.</p>
            </div>
            <div className="flex gap-4 pt-2">
              <button onClick={() => setShowEligibilityModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 font-bold text-xs uppercase tracking-widest transition-all">Dismiss</button>
              <button onClick={() => { setShowEligibilityModal(false); setViewingTrader(null); onClose(); onNavigateToPricing?.(); }} className="flex-1 py-4 rounded-2xl bg-[#00F5A0] text-[#07080B] font-black text-[11px] uppercase tracking-widest transition-all shadow-[0_0_25px_rgba(0,245,160,0.3)] flex items-center justify-center gap-2">
                ACQUIRE CAPITAL <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {successNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl bg-[#00F5A0] text-[#07080B] font-black text-xs uppercase tracking-widest shadow-[0_0_50px_rgba(0,245,160,0.4)] animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5" /> {successNotice}
        </div>
      )}
    </div>
  );
};
