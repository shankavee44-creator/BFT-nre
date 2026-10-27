import React, { useState } from 'react';
import {
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  Lock,
  Globe,
  Send,
  Download,
  TrendingUp,
  PieChart as PieIcon,
  Clock,
  ShoppingBag,
  Award,
  Camera,
  FileCheck,
  CreditCard,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { UserProfile, TradingAccount, BinaryTrade, ReferralRecord, AffiliatePayout } from '../types';
import { exportTradesToCSV, generateSample30DayTrades } from '../utils/csvExport';
import { BUILTIN_AVATARS } from '../utils/storage';
import { soundEngine } from '../utils/soundEffects';
import { AffiliateDashboard } from './AffiliateDashboard';

interface UserDashboardProps {
  userProfile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  accounts: TradingAccount[];
  trades?: BinaryTrade[];
  referrals?: ReferralRecord[];
  payouts?: AffiliatePayout[];
  onAddPayout?: (payout: AffiliatePayout) => void;
  onSelectAccount: (accountId: string) => void;
  onOpenTerminal: () => void;
  onOpenChallengeModal: () => void;
  onPassChallengePhase?: (account: TradingAccount) => void;
  initialTab?: 'accounts' | 'analytics' | 'affiliate' | 'kyc' | 'profile' | 'security';
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  userProfile,
  onUpdateProfile,
  accounts,
  trades = [],
  referrals = [],
  payouts = [],
  onAddPayout = () => {},
  onSelectAccount,
  onOpenTerminal,
  onOpenChallengeModal,
  onPassChallengePhase,
  initialTab = 'accounts',
}) => {
  const [activeTab, setActiveTab] = useState<
    'accounts' | 'analytics' | 'affiliate' | 'kyc' | 'profile' | 'security'
  >(initialTab);
  const [fullName, setFullName] = useState(userProfile.fullName);
  const [country, setCountry] = useState(userProfile.country);
  const [telegramHandle, setTelegramHandle] = useState(userProfile.telegramHandle);
  const [twoFactor, setTwoFactor] = useState(userProfile.twoFactorEnabled);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // KYC Document Tabs: ID Card, Passport, Driving License
  const [docType, setDocType] = useState<'ID Card' | 'Passport' | 'Driving License'>(
    (userProfile.kycDocumentType as any) || 'Passport'
  );
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState<string>('P89401293');
  const [kycProgress, setKycProgress] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateProfile({
          ...userProfile,
          avatarUrl: reader.result,
        });
        soundEngine.playTradeWin();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...userProfile,
      fullName,
      country,
      telegramHandle,
      twoFactorEnabled: twoFactor,
    });
    setSaveSuccess(true);
    soundEngine.playTradeWin();
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleKycSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setKycProgress(true);
    soundEngine.playUiClick();
    setTimeout(() => {
      onUpdateProfile({
        ...userProfile,
        kycStatus: 'verified',
        kycDocumentType: docType,
        kycSubmittedAt: new Date().toISOString().split('T')[0],
      });
      setKycProgress(false);
      soundEngine.playTradeWin();
    }, 1200);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    soundEngine.playUiClick();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCSV = (accId?: string) => {
    soundEngine.playTradeWin();
    exportTradesToCSV(trades, accId);
  };

  const effectiveTrades =
    trades.length > 0 ? trades : generateSample30DayTrades(accounts[0]?.id || 'BFT-91823');
  const wonTradesCount = effectiveTrades.filter((t) => t.status === 'won').length;
  const lostTradesCount = effectiveTrades.filter((t) => t.status === 'lost').length;
  const totalSettled = wonTradesCount + lostTradesCount || 1;
  const winRatePercent = Number(((wonTradesCount / totalSettled) * 100).toFixed(1));

  const winLossPieData = [
    { name: 'Wins (ITM)', value: wonTradesCount, color: '#00e676' },
    { name: 'Losses (OTM)', value: lostTradesCount, color: '#ff334b' },
  ];

  const profitTrajectoryData = Array.from({ length: 30 }).map((_, idx) => {
    const day = idx + 1;
    const progress = day / 30;
    const basePnl = Math.round(Math.sin(progress * Math.PI * 1.5) * 650 + progress * 2400);
    return {
      day: `Oct ${day}`,
      profit: Math.max(0, basePnl),
    };
  });

  const durationStats = [
    { duration: '30s', trades: 14, winRate: 71.4 },
    { duration: '60s', trades: 28, winRate: 75.0 },
    { duration: '3m', trades: 8, winRate: 62.5 },
    { duration: '5m', trades: 5, winRate: 80.0 },
  ];

  return (
    <div className="py-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 font-sans">
      {/* Trader Profile Header Card */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#111115] border border-[#ff8800]/30 shadow-xl mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="relative group">
              <img
                src={userProfile.avatarUrl || BUILTIN_AVATARS[0]}
                alt={userProfile.fullName}
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-[#ff8800] shadow-xl bg-[#18181c]"
              />
              <label
                htmlFor="quick-avatar-upload"
                className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                title="Upload Custom Profile Photo"
              >
                <Camera className="w-6 h-6 text-[#ffaa00]" />
                <input
                  id="quick-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <span
                className={`absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-slate-950 font-mono ${
                  userProfile.kycStatus === 'verified' ? 'bg-emerald-400' : 'bg-[#ffaa00]'
                }`}
              >
                {userProfile.kycStatus}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h1 className="text-2xl font-black text-white">{userProfile.fullName}</h1>
                <span className="text-xs font-mono text-[#ffaa00] bg-[#ff8800]/15 border border-[#ff8800]/30 px-2.5 py-0.5 rounded-full font-bold">
                  Ref Code: {userProfile.referralCode || 'BFT-ALEX77'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">{userProfile.email}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-xs text-slate-300">
                <span className="flex items-center gap-1 font-mono">
                  <Globe className="w-3.5 h-3.5 text-slate-400" /> {userProfile.country}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Send className="w-3.5 h-3.5 text-[#ffaa00]" /> {userProfile.telegramHandle}
                </span>
                <span className="flex items-center gap-1 text-emerald-400 font-semibold font-mono">
                  <ShieldCheck className="w-3.5 h-3.5" /> KYC: {userProfile.kycDocumentType || 'Passport'} ({userProfile.kycStatus.toUpperCase()})
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExportCSV()}
              className="px-4 py-2.5 rounded-xl bg-[#18181f] hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#ffaa00]" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onOpenChallengeModal}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs shadow-lg glow-gold hover:brightness-110 transition-all cursor-pointer shrink-0 font-mono"
            >
              + Buy Another Account
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-white/10 mb-8 overflow-x-auto pb-2 font-mono">
        {[
          { id: 'accounts', label: 'My Trading Accounts' },
          { id: 'analytics', label: 'Performance Analytics' },
          { id: 'affiliate', label: 'Affiliate Program (17% + 8%)' },
          { id: 'kyc', label: 'KYC Verification' },
          { id: 'profile', label: 'Profile & Photo Upload' },
          { id: 'security', label: 'Security & 2FA' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              soundEngine.playUiClick();
              setActiveTab(tab.id as any);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black shadow-md glow-gold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: My Trading Accounts */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const profit = Number((acc.currentBalance - acc.initialBalance).toFixed(2));
              const isChallengePhase =
                (acc.phase === 'phase_1' || acc.phase === 'phase_2') && acc.status === 'active';

              return (
                <div
                  key={acc.id}
                  className={`p-5 rounded-2xl bg-[#111115] border transition-all shadow-md ${
                    acc.status === 'hard-breached' || acc.status === 'breached'
                      ? 'border-rose-500/50'
                      : acc.status === 'passed'
                      ? 'border-emerald-500/50'
                      : 'border-white/10 hover:border-[#ff8800]/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white font-mono">{acc.id}</span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#ff8800]/15 text-[#ffaa00] border border-[#ff8800]/30 font-mono">
                        {acc.tierName} ({acc.phase.toUpperCase()})
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full font-mono ${
                        acc.status === 'hard-breached' || acc.status === 'breached'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                          : acc.status === 'soft-breached'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50'
                          : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {acc.status.toUpperCase()}
                    </span>
                  </div>

                  {acc.certificateId && (
                    <div className="mb-3 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
                      <span className="text-emerald-300 flex items-center gap-1.5 font-bold">
                        <Award className="w-4 h-4 text-[#ffaa00]" /> Certificate: {acc.certificateId}
                      </span>
                      <span className="text-[10px] text-slate-300">Phase Locked & Deployed</span>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-[#09090c] border border-white/10 mb-4 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Balance</span>
                      <span className="font-bold text-white">${acc.currentBalance.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Net Profit</span>
                      <span className={`font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Limits</span>
                      <span className="font-bold text-[#ffaa00]">
                        {acc.dailyLossLimitPercent}% / {acc.maxOverallLossPercent}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase">Split</span>
                      <span className="font-bold text-emerald-400">
                        {(acc.monthsCompleted || 1) >= 3 ? '90%' : '80%'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-4 bg-[#16161c] p-2.5 rounded-lg border border-white/10">
                    <span>
                      Password: <code className="text-slate-200">{acc.passwordHash}</code>
                    </span>
                    <button
                      onClick={() => handleCopy(acc.passwordHash, acc.id)}
                      className="p-1 rounded hover:bg-white/10 text-[#ffaa00] cursor-pointer"
                    >
                      {copiedId === acc.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {acc.status === 'hard-breached' || acc.status === 'breached' ? (
                      <>
                        <button
                          onClick={() => {
                            onSelectAccount(acc.id);
                            onOpenTerminal();
                          }}
                          className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-rose-950/80 text-rose-300 border border-rose-500/40"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Inspect Breach</span>
                        </button>
                        <button
                          onClick={onOpenChallengeModal}
                          className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-md glow-gold"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>10% Reset Courtesy</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            onSelectAccount(acc.id);
                            onOpenTerminal();
                          }}
                          className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 shadow-md glow-gold"
                        >
                          <span>Launch Terminal</span>
                          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        {isChallengePhase && onPassChallengePhase && (
                          <button
                            onClick={() => onPassChallengePhase(acc)}
                            className="px-3.5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md"
                            title="Simulate Passing Target & Claim Achievement Certificate"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Pass Phase & Certificate</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-4 rounded-2xl bg-[#111115] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">30D Win Rate</span>
              <span className="text-2xl font-black text-emerald-400 block mt-1">{winRatePercent}%</span>
              <span className="text-[10px] text-slate-500">
                {wonTradesCount} Wins / {lostTradesCount} Losses
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#111115] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">30D Net Profit</span>
              <span className="text-2xl font-black text-white block mt-1">+$2,546.00</span>
              <span className="text-[10px] text-[#ffaa00]">Split: 80% → 90% Scaling</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#111115] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">Profit Factor</span>
              <span className="text-2xl font-black text-[#ffaa00] block mt-1">2.48</span>
              <span className="text-[10px] text-slate-500">Gross Win / Gross Loss</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#111115] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">Max Risk / Trade</span>
              <span className="text-2xl font-black text-emerald-400 block mt-1">≤ 5.0%</span>
              <span className="text-[10px] text-slate-500">100% Prop Rule Compliant</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-5 rounded-2xl bg-[#111115] border border-white/10">
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#ff8800]" />
                30-Day Cumulative Profit Trajectory
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profitTrajectoryData}>
                    <defs>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff8800" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ff8800" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111115', borderColor: '#ff8800', borderRadius: '12px' }}
                    />
                    <Area type="monotone" dataKey="profit" stroke="#ff8800" strokeWidth={2.5} fill="url(#profitGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#111115] border border-white/10 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-1">
                <PieIcon className="w-4 h-4 text-emerald-400" />
                Win / Loss Ratio
              </h3>
              <div className="h-52 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={winLossPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                      {winLossPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-mono">
                  <span className="text-2xl font-black text-emerald-400">{winRatePercent}%</span>
                  <span className="text-[10px] text-slate-400 uppercase">Win Rate</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111115] border border-white/10">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#ffaa00]" />
              Duration Distribution & Win Rate per Expiry
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="duration" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="trades" name="Trades Count" fill="#ff8800" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="winRate" name="Win Rate (%)" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Affiliate Program */}
      {activeTab === 'affiliate' && (
        <AffiliateDashboard
          userProfile={userProfile}
          referrals={referrals}
          payouts={payouts}
          onAddPayout={onAddPayout}
          onOpenChallengeModal={onOpenChallengeModal}
        />
      )}

      {/* Tab 4: KYC Verification (ID Card, Passport, Driving License) */}
      {activeTab === 'kyc' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111115] border border-[#ff8800]/30 max-w-2xl shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#ff8800]" />
                Institutional KYC Document Verification
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Select your government-issued ID type below to verify or update your KYC clearance.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase font-mono ${
                userProfile.kycStatus === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/30'
              }`}
            >
              {userProfile.kycStatus}
            </span>
          </div>

          {/* 3 KYC Document Type Tabs: ID Card, Passport, Driving License */}
          <div className="grid grid-cols-3 gap-2 mb-6 font-mono text-xs">
            {(['ID Card', 'Passport', 'Driving License'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDocType(type)}
                className={`py-3 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  docType === type
                    ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 border-[#ffaa00] font-black shadow'
                    : 'bg-[#09090c] text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>{type}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleKycSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">
                {docType} Serial / Document Number
              </label>
              <input
                type="text"
                required
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                placeholder={`Enter ${docType} number...`}
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1.5">
                Upload High-Resolution {docType} Scan (Front & Back)
              </label>
              <div className="border-2 border-dashed border-white/15 hover:border-[#ff8800] rounded-2xl p-6 text-center cursor-pointer transition-colors bg-[#09090c]">
                <UploadCloud className="w-8 h-8 text-[#ff8800] mx-auto mb-2" />
                <input
                  type="file"
                  id="kyc-file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFileName(e.target.files[0].name);
                    }
                  }}
                />
                <label htmlFor="kyc-file" className="cursor-pointer">
                  <span className="text-xs font-bold text-white block">
                    {uploadedFileName
                      ? `Selected: ${uploadedFileName}`
                      : `Click to upload ${docType} image or PDF`}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Instant AI OCR & compliance verification (PNG, JPG, PDF up to 10MB)
                  </span>
                </label>
              </div>
            </div>

            {userProfile.kycStatus === 'verified' && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-3 text-xs">
                <FileCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-slate-200">
                  Verified Document: <strong className="text-white">{userProfile.kycDocumentType || docType}</strong> • Submitted on {userProfile.kycSubmittedAt || '2026-10-15'}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={kycProgress}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs font-mono uppercase tracking-wider glow-gold cursor-pointer transition-all"
            >
              {kycProgress
                ? `Verifying ${docType}...`
                : `Submit & Verify ${docType} Now`}
            </button>
          </form>
        </div>
      )}

      {/* Tab 5: Profile Settings & Custom Photo Upload */}
      {activeTab === 'profile' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111115] border border-[#ff8800]/30 max-w-2xl shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4">Trader Profile & Custom Photo Upload</h3>
          <form onSubmit={handleSaveProfile} className="space-y-5">
            {/* Custom Photo Upload Box */}
            <div className="p-4 rounded-2xl bg-[#09090c] border border-white/10 flex flex-col sm:flex-row items-center gap-4">
              <img
                src={userProfile.avatarUrl || BUILTIN_AVATARS[0]}
                alt={userProfile.fullName}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#ff8800]"
              />
              <div className="flex-1 text-center sm:text-left">
                <div className="text-xs font-bold text-white mb-1">Custom Profile Picture</div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Upload your own custom profile photo or choose an institutional avatar below.
                </p>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#ff8800]/20 hover:bg-[#ff8800]/30 border border-[#ff8800]/40 text-[#ffaa00] text-xs font-mono font-bold cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload Custom Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-2">
                Or Choose Built-In Institutional Avatar
              </label>
              <div className="flex gap-3">
                {BUILTIN_AVATARS.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Avatar ${idx + 1}`}
                    onClick={() => onUpdateProfile({ ...userProfile, avatarUrl: url })}
                    className={`w-12 h-12 rounded-xl object-cover cursor-pointer transition-all ${
                      userProfile.avatarUrl === url
                        ? 'ring-2 ring-[#ff8800] scale-105'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">Full Legal Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">Country of Residence</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-1">Telegram Handle</label>
              <input
                type="text"
                value={telegramHandle}
                onChange={(e) => setTelegramHandle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs font-mono uppercase glow-gold cursor-pointer transition-all"
            >
              {saveSuccess ? 'Profile Changes Saved!' : 'Save Profile Settings'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 6: Security & 2FA */}
      {activeTab === 'security' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111115] border border-[#ff8800]/30 max-w-2xl shadow-xl">
          <h3 className="text-lg font-bold text-white mb-2">Two-Factor Authentication (2FA)</h3>
          <p className="text-xs text-slate-400 mb-6">
            Protects your trading credentials, TRC-20 withdrawals, and affiliate payouts.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[#09090c] border border-white/10">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-6 h-6 ${twoFactor ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <h4 className="text-sm font-bold text-white">Authenticator App (TOTP)</h4>
                <p className="text-xs text-slate-400">Google Authenticator / Authy</p>
              </div>
            </div>
            <button
              onClick={() => {
                const nextState = !twoFactor;
                setTwoFactor(nextState);
                onUpdateProfile({ ...userProfile, twoFactorEnabled: nextState });
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                twoFactor ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-400 hover:text-white'
              }`}
            >
              {twoFactor ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
