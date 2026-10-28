import React, { useState, useEffect } from 'react';
import {
  Users,
  Copy,
  Check,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  Award,
  Wallet,
  Clock,
  Share2,
  QrCode,
  Layers,
  Send,
  Building2,
  FileText,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserProfile,
  ReferralRecord,
  AffiliatePayout,
  AffiliateStats,
} from '../types';
import {
  calculateAffiliateStats,
  requestAffiliatePayout,
} from '../utils/affiliateEngine';
import { soundEngine } from '../utils/soundEffects';
import { apiGetAffiliateDashboard } from '../utils/apiClient';
import { supabase } from '../utils/supabase';

interface AffiliateDashboardProps {
  userProfile: UserProfile;
  referrals: ReferralRecord[];
  payouts: AffiliatePayout[];
  onAddPayout: (payout: AffiliatePayout) => void;
  onOpenChallengeModal?: () => void;
}

export const AffiliateDashboard: React.FC<AffiliateDashboardProps> = ({
  userProfile,
  referrals,
  payouts,
  onAddPayout,
}) => {
  const referralCode = userProfile.referralCode || 'BFT-ALEX77';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bft.com';
  const referralLink = `${baseUrl}/?ref=${referralCode}`;

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | '1' | '2' | '3' | 'withdrawal'>('all');

  const [payoutAmount, setPayoutAmount] = useState<number>(50);
  const [payoutMethod, setPayoutMethod] = useState<'USDT (TRC-20)' | 'Bank Transfer'>('USDT (TRC-20)');
  const [payoutDetails, setPayoutDetails] = useState('TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2');
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [copiedPromo, setCopiedPromo] = useState<string | null>(null);
  const [backendStats, setBackendStats] = useState<any>(null);

  const [supabaseCommissions, setSupabaseCommissions] = useState<ReferralRecord[]>([]);

  // Query Supabase referral_commissions & profiles live
  useEffect(() => {
    let isMounted = true;
    async function fetchSupabaseAffiliateData() {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = user?.id || userProfile.id;
      if (!targetUserId) return;

      const { data: comms } = await supabase
        .from('referral_commissions')
        .select('*')
        .eq('earner_id', targetUserId)
        .order('created_at', { ascending: false });

      if (comms && isMounted) {
        const records: ReferralRecord[] = comms.map((c: any) => ({
          id: c.id,
          referrerId: c.earner_id,
          referredUserId: c.source_user_id,
          referredUserName: `Trader ${c.source_user_id.slice(0, 6)}`,
          referredUserEmail: `trader.${c.source_user_id.slice(0, 4)}@client-bft.com`,
          level: (c.level === 2 ? 2 : c.level === 3 ? 3 : 1) as 1 | 2 | 3,
          packageTier: 'one-step',
          packageName: c.commission_type === 'withdrawal' ? '8% Withdrawal Bonus' : `Level ${c.level} Deposit Commission`,
          packagePrice: Number(c.amount || 0) * (c.level === 1 ? 10 : c.level === 2 ? 20 : 50),
          commissionRate: c.commission_type === 'withdrawal' ? 0.08 : c.level === 1 ? 0.10 : c.level === 2 ? 0.05 : 0.02,
          commissionAmount: Number(c.amount || 0),
          commissionType: c.commission_type === 'withdrawal' ? 'withdrawal' : 'package',
          status: 'paid',
          createdAt: c.created_at || new Date().toISOString(),
        }));
        setSupabaseCommissions(records);
      }
    }

    fetchSupabaseAffiliateData();
    const interval = setInterval(fetchSupabaseAffiliateData, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userProfile.id]);

  useEffect(() => {
    let active = true;
    const fetchStats = () => {
      apiGetAffiliateDashboard()
        .then((res) => {
          if (active && res && res.ok && res.stats) {
            setBackendStats(res.stats);
          }
        })
        .catch(() => {});
    };
    fetchStats();
    const timer = setInterval(fetchStats, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [userProfile.id]);

  // Merge real-time Supabase referral_commissions and SQLite recentCommissions into ReferralRecord format
  const backendReferralRecords: ReferralRecord[] = Array.isArray(backendStats?.recentCommissions)
    ? backendStats.recentCommissions.map((c: any) => ({
        id: c.id,
        referrerId: userProfile.id,
        referredUserId: c.from_user_id,
        referredUserName: c.from_name || 'Referred Trader',
        referredUserEmail: c.from_email || '',
        level: (c.tier_level === 2 ? 2 : c.tier_level === 3 ? 3 : 1) as 1 | 2 | 3,
        packageTier: 'one-step',
        packageName: c.description || 'Challenge Purchase',
        packagePrice: Number(c.base_amount || 0),
        commissionRate: Number(c.percentage || 10) / 100,
        commissionAmount: Number(c.commission_amount || 0),
        commissionType: c.commission_type === 'withdrawal_bonus' ? 'withdrawal' : 'package',
        status: 'paid',
        createdAt: c.created_at || new Date().toISOString(),
      }))
    : [];

  const mergedReferrals: ReferralRecord[] = [
    ...supabaseCommissions,
    ...backendReferralRecords.filter((b) => !supabaseCommissions.some((s) => s.id === b.id)),
    ...referrals.filter(
      (r) => !supabaseCommissions.some((s) => s.id === r.id) && !backendReferralRecords.some((b) => b.id === r.id)
    ),
  ];

  const rawStats: AffiliateStats = calculateAffiliateStats(userProfile.id, mergedReferrals, payouts);
  const stats: AffiliateStats = backendStats
    ? {
        ...rawStats,
        availableBalance: backendStats.paidEarnings ?? rawStats.availableBalance,
        lifetimeEarnings: backendStats.totalEarnings ?? rawStats.lifetimeEarnings,
        level1Earnings: backendStats.levelCommissions?.level1 ?? rawStats.level1Earnings,
        level2Earnings: backendStats.levelCommissions?.level2 ?? rawStats.level2Earnings,
        level3Earnings: backendStats.levelCommissions?.level3 ?? rawStats.level3Earnings,
        totalReferralsCount: backendStats.totalReferrals ?? rawStats.totalReferralsCount,
      }
    : rawStats;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    soundEngine.playUiClick();
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    soundEngine.playUiClick();
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPromo = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromo(key);
    soundEngine.playUiClick();
    setTimeout(() => setCopiedPromo(null), 2000);
  };

  const handleSubmitPayout = (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutError(null);
    setPayoutSuccess(null);

    if (payoutAmount < 50) {
      setPayoutError('Minimum withdrawal threshold is $50.00 USDT');
      return;
    }

    if (payoutAmount > stats.availableBalance) {
      setPayoutError(`Amount exceeds your available balance ($${stats.availableBalance.toFixed(2)})`);
      return;
    }

    if (!payoutDetails.trim()) {
      setPayoutError('Please provide a valid destination address or bank info');
      return;
    }

    setIsSubmittingPayout(true);
    soundEngine.playUiClick();

    setTimeout(() => {
      const res = requestAffiliatePayout({
        userId: userProfile.id,
        amount: payoutAmount,
        method: payoutMethod,
        details: payoutDetails,
        referrals,
        payouts,
      });

      setIsSubmittingPayout(false);

      if (res.success && res.payout) {
        onAddPayout(res.payout);
        soundEngine.playTradeWin();
        setPayoutSuccess(
          `Payout of $${payoutAmount.toFixed(2)} submitted! Processed via TRC-20 Smart Contract.`
        );
        setPayoutAmount(Math.min(50, Math.max(0, stats.availableBalance - payoutAmount)));
      } else {
        setPayoutError(res.error || 'Failed to submit payout request');
      }
    }, 1000);
  };

  const filteredReferrals = mergedReferrals
    .filter((r) => r.referrerId === userProfile.id)
    .filter((r) => {
      if (filterLevel === 'all') return true;
      if (filterLevel === 'withdrawal') return r.commissionType === 'withdrawal';
      return r.level === parseInt(filterLevel, 10) && r.commissionType !== 'withdrawal';
    });

  return (
    <div data-testid="affiliate-dashboard" className="space-y-8 font-sans w-full max-w-full overflow-x-hidden">
      {/* 1. HERO BANNER WITH 3-TIER PACKAGE (10% L1 / 5% L2 / 2% L3) + 8% DIRECT PAYOUT BONUS */}
      <div className="relative rounded-3xl bg-[#111115] border border-[#ff8800]/40 p-6 sm:p-8 overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff8800]/15 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>3-TIER AFFILIATE & DIRECT PAYOUT BONUS SYSTEM</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              "Let's trade, profit, and earn more together"
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Earn <strong className="text-[#ff8800]">3-Tier Challenge Commissions</strong> (<strong>10% Level 1 Direct Referrals</strong>, <strong>5% Level 2 Sub-referrals</strong>, <strong>2% Level 3 Network</strong>) on every challenge purchase, PLUS an extra{' '}
              <strong className="text-emerald-400">8% Direct Payout Bonus</strong> every time your direct referrals withdraw their trading profits!
            </p>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#0a0a0d] border border-[#ff8800]/40 shrink-0">
            <div className="w-12 h-12 rounded-xl bg-[#ff8800] flex items-center justify-center text-slate-950">
              <Award className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">3-Tier + Payout Bonus</div>
              <div className="text-base font-black text-white">10% L1 • 5% L2 • 2% L3 + 8% Payout</div>
              <div className="text-[11px] text-emerald-400 font-mono font-bold">● Real-Time Commission Ledger</div>
            </div>
          </div>
        </div>

        {/* Referral Link Bar (Routes directly to Sign-Up Modal with pre-filled code) */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1 flex items-center bg-[#09090c] border border-white/15 rounded-2xl px-4 py-2.5">
            <span className="text-xs font-mono text-slate-400 mr-2 shrink-0">Direct Sign-Up Link:</span>
            <input
              type="text"
              readOnly
              value={referralLink}
              className="w-full bg-transparent text-sm font-mono text-[#ffaa00] font-bold focus:outline-none select-all"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyLink}
              className="flex-1 md:flex-initial px-5 py-3 rounded-2xl bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950 font-black text-xs font-mono uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {copiedLink ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4 stroke-[2.5]" />}
              <span>{copiedLink ? 'Copied Link!' : 'Copy Direct Link'}</span>
            </button>

            <button
              onClick={handleCopyCode}
              className="px-4 py-3 rounded-2xl bg-[#141418] hover:bg-white/10 text-slate-200 border border-white/15 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="text-slate-400">Code:</span>
              <span className="text-[#ffaa00]">{referralCode}</span>
              {copiedCode && <Check className="w-3.5 h-3.5 text-emerald-400 ml-1" />}
            </button>

            <button
              onClick={() => setShowQrModal(true)}
              className="p-3 rounded-2xl bg-[#141418] hover:bg-white/10 text-slate-300 border border-white/15 cursor-pointer"
              title="Show Referral QR Code"
            >
              <QrCode className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. PRIMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#111115] border border-[#ff8800]/40">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Available Balance</span>
            <Wallet className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="text-3xl font-black text-[#ffaa00] font-mono">
            ${stats.availableBalance.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Ready for instant TRC-20 withdrawal</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#111115] border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Lifetime Earned</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-white font-mono">
            ${stats.lifetimeEarnings.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">10%/5%/2% Package + 8% Payout Bonus</div>
        </div>

        <div
          data-testid="affiliate-withdrawal-royalties"
          className="p-5 rounded-2xl bg-[#111115] border border-white/10"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>8% Direct Payout Bonus</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">
            $
            {(
              backendStats?.levelCommissions?.withdrawalBonus ??
              mergedReferrals
                .filter((r) => r.referrerId === userProfile.id && r.commissionType === 'withdrawal')
                .reduce((s, r) => s + r.commissionAmount, 0)
            ).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">8% earned from direct referrals' withdrawals</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#111115] border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Referred Network</span>
            <Users className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {stats.totalReferralsCount} Traders
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Active across L1, L2 & L3</div>
        </div>
      </div>

      {/* 3. COMMISSION STRUCTURE CARDS (10% L1 / 5% L2 / 2% L3 PACKAGE + 8% DIRECT PAYOUT BONUS) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          data-testid="affiliate-l1-card"
          className="p-5 rounded-2xl bg-[#111115] border border-emerald-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black text-xs">
            LEVEL 1 • 10%
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">Direct Referrals (10%)</h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            10% instant commission on every direct referral challenge purchase.
          </p>
          <div className="text-lg font-black text-emerald-400">${stats.level1Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-l2-card"
          className="p-5 rounded-2xl bg-[#111115] border border-cyan-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-black text-xs">
            LEVEL 2 • 5%
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">Sub-Referrals (5%)</h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            5% commission on challenge packages purchased by Level 2 sub-referrals.
          </p>
          <div className="text-lg font-black text-cyan-400">${stats.level2Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-l3-card"
          className="p-5 rounded-2xl bg-[#111115] border border-purple-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-black text-xs">
            LEVEL 3 • 2%
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">Level 3 Network (2%)</h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            2% commission on challenge packages purchased by Level 3 traders.
          </p>
          <div className="text-lg font-black text-purple-400">${stats.level3Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-payout-bonus-card"
          className="p-5 rounded-2xl bg-[#16120c] border-2 border-[#ff8800] font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-xs">
            PAYOUT BONUS • 8%
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">Direct Payout Bonus (8%)</h4>
          <p className="text-xs text-slate-300 mt-1 mb-3 font-sans">
            Extra 8% commission on direct referrals' withdrawal amounts in real-time!
          </p>
          <div className="text-lg font-black text-[#ffaa00]">Recurring 8% Bonus</div>
        </div>
      </div>

      {/* 4. PAYOUT FORM & AUDIT TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 rounded-3xl bg-[#111115] border border-white/10 p-6 shadow-xl">
          <h3 className="text-base font-black text-white flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-[#ffaa00]" />
            <span>Withdraw Affiliate Earnings</span>
          </h3>
          <p className="text-xs text-slate-400 mb-5">
            Instant TRC-20 USDT or Bank Transfer settlement (Min $50.00).
          </p>

          {payoutSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{payoutSuccess}</span>
            </div>
          )}

          {payoutError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{payoutError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitPayout} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayoutMethod('USDT (TRC-20)');
                  setPayoutDetails('TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2');
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer ${
                  payoutMethod === 'USDT (TRC-20)'
                    ? 'bg-[#ff8800]/20 border-[#ff8800] text-[#ffaa00]'
                    : 'bg-[#09090c] border-white/10 text-slate-400'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>USDT (TRC-20)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayoutMethod('Bank Transfer');
                  setPayoutDetails('IBAN: GB29BARC20201538492019 / Alex Mercer');
                }}
                className={`py-2.5 px-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer ${
                  payoutMethod === 'Bank Transfer'
                    ? 'bg-[#ff8800]/20 border-[#ff8800] text-[#ffaa00]'
                    : 'bg-[#09090c] border-white/10 text-slate-400'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Bank Wire</span>
              </button>
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 font-bold block mb-1">
                Amount (USD)
              </label>
              <input
                type="number"
                min="50"
                max={stats.availableBalance}
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            <div>
              <label className="text-xs font-mono text-slate-300 font-bold block mb-1">
                Destination Wallet / IBAN
              </label>
              <input
                type="text"
                value={payoutDetails}
                onChange={(e) => setPayoutDetails(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090c] border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingPayout || stats.availableBalance < 50}
              className="w-full py-3.5 rounded-2xl bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950 font-black text-xs font-mono uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[3]" />
              <span>Withdraw ${payoutAmount.toFixed(2)} Now</span>
            </button>
          </form>
        </div>

        {/* Right: Commission Ledger */}
        <div className="lg:col-span-7 rounded-3xl bg-[#111115] border border-white/10 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#ffaa00]" />
              <span>3-Tier (10% / 5% / 2%) & 8% Payout Bonus Ledger</span>
            </h3>
            <div className="flex gap-1 p-1 rounded-xl bg-[#09090c] border border-white/10 text-[11px] font-mono">
              {[
                { id: 'all', label: 'All' },
                { id: '1', label: 'L1 (10%)' },
                { id: '2', label: 'L2 (5%)' },
                { id: '3', label: 'L3 (2%)' },
                { id: 'withdrawal', label: 'Payout (8%)' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterLevel(t.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer ${
                    filterLevel === t.id
                      ? 'bg-[#ff8800] text-slate-950 font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase text-slate-400">
                  <th className="py-2.5">Trader</th>
                  <th className="py-2.5">Type</th>
                  <th className="py-2.5">Source</th>
                  <th className="py-2.5 text-right">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredReferrals.map((ref) => (
                  <tr key={ref.id}>
                    <td className="py-3">
                      <div className="font-bold text-white">{ref.referredUserName}</div>
                      <div className="text-[10px] text-slate-500">{ref.referredUserEmail}</div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          ref.commissionType === 'withdrawal'
                            ? 'bg-[#ff8800]/20 text-[#ffaa00] border border-[#ff8800]/40'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {ref.commissionType === 'withdrawal'
                          ? '8% PAYOUT BONUS'
                          : `L${ref.level} (${(ref.commissionRate * 100).toFixed(0)}%)`}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300 font-sans">{ref.packageName}</td>
                    <td className="py-3 text-right font-black text-emerald-400">
                      +${ref.commissionAmount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pure Inline SVG QR Modal (Zero External URL Dependencies) */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-sm w-full rounded-3xl bg-[#111115] border border-[#ff8800]/40 p-6 text-center font-mono shadow-2xl"
            >
              <h4 className="text-base font-black text-white font-sans mb-1">Direct Registration QR Code</h4>
              <p className="text-xs text-slate-400 mb-4 font-sans">
                Scanning opens the BFT Sign-Up form with <strong className="text-[#ffaa00]">{referralCode}</strong> pre-filled.
              </p>

              <div className="bg-white p-4 rounded-2xl inline-block mx-auto mb-4 shadow-xl">
                <svg viewBox="0 0 100 100" className="w-44 h-44">
                  <rect x="5" y="5" width="26" height="26" fill="#000" />
                  <rect x="9" y="9" width="18" height="18" fill="#fff" />
                  <rect x="13" y="13" width="10" height="10" fill="#000" />
                  <rect x="69" y="5" width="26" height="26" fill="#000" />
                  <rect x="73" y="9" width="18" height="18" fill="#fff" />
                  <rect x="77" y="13" width="10" height="10" fill="#000" />
                  <rect x="5" y="69" width="26" height="26" fill="#000" />
                  <rect x="9" y="73" width="18" height="18" fill="#fff" />
                  <rect x="13" y="77" width="10" height="10" fill="#000" />
                  <rect x="36" y="36" width="28" height="28" fill="#000" />
                  <rect x="42" y="42" width="16" height="16" fill="#ff8800" />
                  <rect x="38" y="10" width="20" height="8" fill="#000" />
                  <rect x="10" y="42" width="18" height="8" fill="#000" />
                  <rect x="72" y="42" width="18" height="8" fill="#000" />
                  <rect x="38" y="74" width="24" height="12" fill="#000" />
                </svg>
              </div>

              <div className="text-xs text-[#ffaa00] mb-4 font-mono select-all break-all bg-[#09090c] p-2.5 rounded-xl border border-white/10">
                {referralLink}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyLink}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs cursor-pointer"
                >
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => setShowQrModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-white/10 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
