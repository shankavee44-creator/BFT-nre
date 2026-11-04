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
  Crown,
  Trophy,
  CheckCircle2,
  Zap,
  Info,
  Gift,
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
  mergeCommissionLedgers,
  formatPurchasedPackageLabel,
  claimVipMilestoneReward,
  isMilestoneRewardClaimed,
  VIP_ACTIVE_TRADERS_THRESHOLD,
  VIP_MILESTONE_REWARD_AMOUNT,
  BASIC_TIER_RATES,
  VIP_TIER_RATES,
} from '../utils/affiliateEngine';
import { soundEngine } from '../utils/soundEffects';
import { apiGetAffiliateDashboard } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import { ReferralNetworkList } from './ReferralNetworkList';

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
  const referralCode =
    userProfile.referralCode ||
    (userProfile.id ? `BFT-${String(userProfile.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}` : 'BFT-TRADER');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://bft.com';
  const referralLink = `${baseUrl}/?ref=${referralCode}`;

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | '1' | '2' | '3' | 'withdrawal' | 'vip'>('all');

  const [payoutAmount, setPayoutAmount] = useState<number>(50);
  const [payoutMethod, setPayoutMethod] = useState<'USDT (TRC-20)' | 'Bank Transfer'>('USDT (TRC-20)');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccess, setPayoutSuccess] = useState<string | null>(null);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

  const [supabaseCommissions, setSupabaseCommissions] = useState<ReferralRecord[]>([]);
  const [backendCommissions, setBackendCommissions] = useState<ReferralRecord[]>([]);
  const [resolvedSupabaseUuid, setResolvedSupabaseUuid] = useState<string | null>(null);
  const [referredNetworkCount, setReferredNetworkCount] = useState(0);
  const [backendActiveFundedCount, setBackendActiveFundedCount] = useState<number>(0);

  const [milestoneClaimSuccess, setMilestoneClaimSuccess] = useState<string | null>(null);
  const [milestoneClaimError, setMilestoneClaimError] = useState<string | null>(null);

  // Query Supabase referral_commissions & network count + subscribe to real-time changes
  useEffect(() => {
    let isMounted = true;
    const targetUserId = userProfile.id;
    if (!targetUserId && !userProfile.email) return;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const mapCommissionRow = (c: any): ReferralRecord => {
      const earnerId = String(c.referrer_id || c.sponsor_id || c.earner_id || userProfile.id);
      const sourceId = String(c.referred_user_id || c.source_user_id || 'trader');
      const rawType = String(c.source_type || c.commission_type || 'package').toLowerCase();
      const isWithdrawal = rawType.includes('withdrawal');
      const level = (Number(c.level || c.tier_level || 1) as 1 | 2 | 3);

      const isVip =
        c.affiliate_tier === 'vip' ||
        c.tier === 'vip' ||
        Number(c.rate) >= 0.15 ||
        (level === 2 && Number(c.rate) >= 0.08) ||
        (level === 3 && Number(c.rate) >= 0.05) ||
        (isWithdrawal && Number(c.rate) >= 0.10);

      const tier: 'basic' | 'vip' = isVip ? 'vip' : 'basic';
      const defaultRate = isWithdrawal
        ? (isVip ? VIP_TIER_RATES.WITHDRAWAL_ROYALTY : BASIC_TIER_RATES.WITHDRAWAL_ROYALTY)
        : level === 1
        ? (isVip ? VIP_TIER_RATES.LEVEL_1 : BASIC_TIER_RATES.LEVEL_1)
        : level === 2
        ? (isVip ? VIP_TIER_RATES.LEVEL_2 : BASIC_TIER_RATES.LEVEL_2)
        : (isVip ? VIP_TIER_RATES.LEVEL_3 : BASIC_TIER_RATES.LEVEL_3);

      const rate = typeof c.rate === 'number' && c.rate > 0 ? c.rate : defaultRate;
      const pkgPrice = Number(c.package_amount ?? c.base_amount ?? c.package_price ?? 0);
      const commAmt = Number(c.amount ?? c.commission_amount ?? (pkgPrice * rate));
      const rawPkgName = String(c.description || c.package_name || 'Challenge Commission');
      const cleanPkgName = isWithdrawal
        ? rawPkgName
        : formatPurchasedPackageLabel(rawPkgName, undefined, pkgPrice) !== 'No Purchase'
        ? formatPurchasedPackageLabel(rawPkgName, undefined, pkgPrice)
        : rawPkgName;

      return {
        id: String(c.id),
        referrerId: earnerId,
        referredUserId: sourceId,
        referredUserName: c.referred_user_name || `Trader ${sourceId.slice(0, 6)}`,
        referredUserEmail: c.referred_user_email || `trader@bft.io`,
        level,
        packageTier: 'one-step',
        packageName: cleanPkgName,
        packagePrice: pkgPrice,
        commissionRate: rate,
        commissionAmount: Number(commAmt.toFixed(2)),
        commissionType: isWithdrawal ? 'withdrawal' : 'package',
        affiliateTier: tier,
        status: 'paid',
        createdAt: c.created_at
          ? typeof c.created_at === 'number'
            ? new Date(c.created_at).toISOString()
            : String(c.created_at)
          : new Date().toISOString(),
      };
    };

    async function fetchAffiliateData() {
      try {
        let validUuid: string | null = null;
        if (targetUserId && UUID_REGEX.test(targetUserId)) {
          validUuid = targetUserId;
        } else {
          const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
          if (authData?.user?.id && UUID_REGEX.test(authData.user.id)) {
            validUuid = authData.user.id;
          } else if (userProfile.email) {
            const { data: pData } = await supabase
              .from('profiles')
              .select('id')
              .ilike('email', userProfile.email)
              .maybeSingle();
            if (pData?.id && UUID_REGEX.test(pData.id)) {
              validUuid = pData.id;
            }
          }
        }

        if (isMounted && validUuid) {
          setResolvedSupabaseUuid(validUuid);
        }

        let rawComms: any[] = [];
        let rawBackendComms: any[] = [];
        let networkCount: number | null = null;
        let activeCount: number | null = null;

        // 1. Fetch Commissions from Supabase using exact referrer_id column
        if (validUuid) {
          const { data: commsData, error: commsErr } = await supabase
            .from('referral_commissions')
            .select('*')
            .eq('referrer_id', validUuid)
            .order('created_at', { ascending: false });

          if (!commsErr && Array.isArray(commsData)) {
            rawComms = commsData;
          }

          // 2. Fetch Referred Network Count (Direct + Indirect)
          const { count, error: countErr } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('referred_by', validUuid);
          if (!countErr && count !== null && count > 0) {
            networkCount = count;
          }
        }

        // 3. Also fetch backend affiliate dashboard API (recentCommissions, teamSize & activeFundedCount)
        try {
          const dashRes = await apiGetAffiliateDashboard({
            userId: validUuid || targetUserId,
            email: userProfile.email,
          });
          if (dashRes?.ok && dashRes?.stats) {
            if (Array.isArray(dashRes.stats.recentCommissions)) {
              rawBackendComms = dashRes.stats.recentCommissions;
            }
            if (networkCount === null && typeof dashRes.stats.teamSize === 'number' && dashRes.stats.teamSize > 0) {
              networkCount = dashRes.stats.teamSize;
            }
            if (typeof dashRes.stats.activeFundedCount === 'number') {
              activeCount = dashRes.stats.activeFundedCount;
            }
          }
        } catch {
          // ignore
        }

        if (isMounted) {
          setSupabaseCommissions(rawComms.map(mapCommissionRow));
          setBackendCommissions(rawBackendComms.map(mapCommissionRow));
          if (networkCount !== null) {
            setReferredNetworkCount(networkCount);
          }
          if (activeCount !== null) {
            setBackendActiveFundedCount(activeCount);
          }
        }
      } catch (err) {
        console.warn('Affiliate data sync notice:', err);
      }
    }

    fetchAffiliateData();

    const commChannel = supabase
      .channel(`realtime:referral_commissions:${targetUserId || 'session'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_commissions' }, fetchAffiliateData)
      .subscribe();

    const profileChannel = supabase
      .channel(`realtime:profiles:${targetUserId || 'session'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, fetchAffiliateData)
      .subscribe();

    const handleLocalUpdate = () => {
      fetchAffiliateData();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bft-affiliate-updated', handleLocalUpdate);
    }

    return () => {
      isMounted = false;
      supabase.removeChannel(commChannel);
      supabase.removeChannel(profileChannel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('bft-affiliate-updated', handleLocalUpdate);
      }
    };
  }, [userProfile.id, userProfile.email]);

  const allMergedCommissions = mergeCommissionLedgers({
    sponsorIds: [userProfile.id, resolvedSupabaseUuid || ''].filter(Boolean),
    localReferrals: referrals,
    supabaseReferrals: supabaseCommissions,
    backendReferrals: backendCommissions,
  });

  // Calculate unique active funded traders (referrals who made an actual funded package purchase with amount > 0)
  const uniqueFundedBuyersCount = new Set(
    allMergedCommissions
      .filter((c) => c.commissionType !== 'withdrawal' && Number(c.packagePrice) > 0)
      .map((c) => c.referredUserId)
  ).size;

  const effectiveActiveFundedCount = Math.max(
    backendActiveFundedCount,
    uniqueFundedBuyersCount
  );

  const stats = calculateAffiliateStats(
    userProfile.id,
    allMergedCommissions,
    payouts,
    undefined,
    undefined,
    effectiveActiveFundedCount
  );

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

  const handleClaimMilestone = () => {
    setMilestoneClaimError(null);
    setMilestoneClaimSuccess(null);
    const res = claimVipMilestoneReward({
      userId: userProfile.id,
      userName: userProfile.fullName || (userProfile as any).name || 'Trader',
      userEmail: userProfile.email,
      referrals: allMergedCommissions,
      activeCountOverride: stats.activeFundedCount,
    });
    if (res.success && res.rewardRecord) {
      soundEngine.playTradeWin();
      setMilestoneClaimSuccess(
        'Congratulations! $10,000 Milestone Cash Reward has been credited directly to your affiliate balance.'
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bft-affiliate-updated'));
      }
    } else {
      setMilestoneClaimError(res.error || 'Failed to claim milestone reward');
    }
  };

  const handleSubmitPayout = (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutError(null);
    setPayoutSuccess(null);

    const today = new Date();
    if (today.getDay() !== 5) {
      setPayoutError('Withdrawals are only allowed on Fridays.');
      return;
    }

    if (payoutAmount < 50) {
      setPayoutError('Minimum withdrawal threshold is $50.00 USDT');
      return;
    }

    if (payoutAmount > stats.availableBalance) {
      setPayoutError(
        `Amount exceeds your available balance ($${stats.availableBalance.toFixed(2)})`
      );
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
        referrals: allMergedCommissions,
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

  const filteredReferrals = allMergedCommissions.filter((r) => {
    if (filterLevel === 'all') return true;
    if (filterLevel === 'withdrawal') return r.commissionType === 'withdrawal';
    if (filterLevel === 'vip') return r.affiliateTier === 'vip';
    return r.level === parseInt(filterLevel, 10) && r.commissionType !== 'withdrawal';
  });

  return (
    <div
      data-testid="affiliate-dashboard"
      style={{ touchAction: 'pan-y' }}
      className="space-y-6 sm:space-y-8 font-sans w-full max-w-full overflow-y-visible touch-pan-y"
    >
      {/* 1. HERO BANNER WITH CURRENT TIER STATUS */}
      <div className="relative rounded-3xl bg-[#111115] border border-[#ff8800]/40 p-6 sm:p-8 overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff8800]/15 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-bold">
              {stats.isVipUnlocked ? (
                <>
                  <Crown className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">VIP AFFILIATE TIER ACTIVE (15% / 8% / 5% + 10%)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>BASIC AFFILIATE TIER (10% / 5% / 2% + 8%)</span>
                </>
              )}
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              "Let's trade, profit, and earn more together"
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Earn generous multi-level challenge commissions on funded account purchases across 3 tiers, plus direct payout bonuses whenever your direct referrals withdraw trading profits. Reach 1,000 active funded traders to unlock the prestigious <strong>VIP Tier</strong> and a <strong>$10,000 Cash Reward</strong>!
            </p>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#0a0a0d] border border-[#ff8800]/40 shrink-0">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-slate-950 ${stats.isVipUnlocked ? 'bg-gradient-to-br from-amber-400 to-yellow-500' : 'bg-[#ff8800]'}`}>
              {stats.isVipUnlocked ? <Crown className="w-6 h-6 stroke-[2.5]" /> : <Award className="w-6 h-6 stroke-[2.5]" />}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                {stats.isVipUnlocked ? 'VIP Tier Rates' : 'Basic Tier Rates'}
              </div>
              <div className="text-base font-black text-white">
                {stats.isVipUnlocked ? '15% L1 • 8% L2 • 5% L3 + 10% WD' : '10% L1 • 5% L2 • 2% L3 + 8% WD'}
              </div>
              <div className="text-[11px] text-emerald-400 font-mono font-bold">● Real-Time Supabase Ledger Sync</div>
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

      {/* 2. PROMINENT VIP TIER PROGRESS BAR & $10,000 MILESTONE CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Progress Bar Component */}
        <div className="lg:col-span-7 rounded-3xl bg-gradient-to-br from-[#121217] via-[#16141c] to-[#121217] border border-amber-500/30 p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>VIP Tier Qualification Progress</span>
                  {stats.isVipUnlocked && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
                      UNLOCKED
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Requirement: 1,000 Active Funded Referrals
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black text-amber-400 font-mono">
                {stats.activeFundedCount}
              </span>
              <span className="text-xs text-slate-400 font-mono"> / {stats.vipThreshold.toLocaleString()}</span>
              <div className="text-[11px] font-bold text-slate-400">
                {stats.vipProgressPercent}% Completed
              </div>
            </div>
          </div>

          {/* Progress Bar Track */}
          <div className="w-full bg-[#09090c] rounded-full h-4 p-0.5 border border-white/15 mb-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-[#ff8800] transition-all duration-700 shadow-[0_0_12px_rgba(245,158,11,0.5)]"
              style={{ width: `${Math.max(2, Math.min(100, stats.vipProgressPercent))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-4">
            <span>
              {stats.isVipUnlocked ? (
                <strong className="text-emerald-400 font-bold">✓ VIP Status Achieved! All new referrals earn VIP rates.</strong>
              ) : (
                <>
                  <strong className="text-amber-400">{stats.remainingToVip.toLocaleString()}</strong> active funded referrals remaining
                </>
              )}
            </span>
            <span className="text-slate-400">Target: 1,000 Active Funded</span>
          </div>

          {/* Definition Notice Box */}
          <div className="p-3.5 rounded-2xl bg-[#09090d] border border-white/10 flex items-start gap-2.5 text-xs leading-relaxed text-slate-300">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Active Trader Definition:</strong> An active trader counts strictly when a referred trader actually purchases an <strong className="text-amber-300">Instant Funded</strong> or <strong className="text-amber-300">Evaluation Challenge</strong> account. Free/demo signups ($0) do not count.
              <div className="mt-1 text-[11px] text-slate-400">
                <strong className="text-slate-300">Historical Rate Isolation:</strong> Referrals who registered during Basic tier remain at Basic rates. Only new referrals joined after achieving VIP status earn VIP rates.
              </div>
            </div>
          </div>
        </div>

        {/* $10,000 Milestone Cash Reward Card */}
        <div className="lg:col-span-5 rounded-3xl bg-gradient-to-br from-[#18130c] via-[#20180d] to-[#14110b] border-2 border-amber-500/50 p-6 sm:p-7 shadow-2xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[11px] font-mono font-black mb-3">
              <Trophy className="w-3.5 h-3.5" />
              <span>1,000 ACTIVE TRADERS MILESTONE</span>
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>$10,000 Cash Reward</span>
            </h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Complete the 1,000 active funded trader milestone and receive an instant, unencumbered <strong>$10,000 USD Cash Reward</strong> deposited straight into your available affiliate balance.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-amber-500/20">
            {stats.milestoneClaimed ? (
              <div className="p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>$10,000 Milestone Reward Claimed & Deposited</span>
              </div>
            ) : stats.isVipUnlocked ? (
              <div className="space-y-2">
                <button
                  onClick={handleClaimMilestone}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-[#ff8800] text-slate-950 font-black text-xs font-mono uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:brightness-110 transition-all"
                >
                  <Gift className="w-4 h-4 stroke-[2.5]" />
                  <span>Claim $10,000 Cash Reward Now</span>
                </button>
                {milestoneClaimSuccess && (
                  <p className="text-xs text-emerald-400 font-mono text-center font-bold">{milestoneClaimSuccess}</p>
                )}
                {milestoneClaimError && (
                  <p className="text-xs text-rose-400 font-mono text-center">{milestoneClaimError}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Milestone Status:</span>
                <span className="text-amber-400 font-bold">{stats.remainingToVip.toLocaleString()} Referrals Remaining</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BASIC VS. VIP COMPARISON CARD */}
      <div
        data-testid="affiliate-tier-comparison-card"
        style={{ touchAction: 'pan-y' }}
        className="rounded-3xl bg-[#111115] border border-white/10 p-4 sm:p-7 shadow-xl overflow-y-visible touch-pan-y"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#ffaa00] shrink-0" />
              <span>Affiliate Tier Comparison: Basic vs. VIP Tiers</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Contrast tier benefits side-by-side to understand commission growth and historical isolation.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0a0a0d] border border-white/15 text-xs font-mono text-slate-300 self-start sm:self-auto">
            <span>Your Active Tier:</span>
            <span className={`font-black uppercase px-2 py-0.5 rounded ${stats.isVipUnlocked ? 'bg-amber-400 text-slate-950' : 'bg-slate-700 text-white'}`}>
              {stats.affiliateTier}
            </span>
          </div>
        </div>

        {/* Mobile Stacked Comparison Cards (< 768px) - Prevents horizontal scroll trapping on mobile */}
        <div
          data-testid="mobile-affiliate-tier-comparison-cards"
          style={{ touchAction: 'pan-y' }}
          className="md:hidden space-y-2.5 touch-pan-y"
        >
          {[
            {
              stream: 'Direct Referral Challenge Purchase (L1)',
              dotColor: 'bg-emerald-400',
              basic: '10%',
              vip: '15%',
              impact: '+50% Higher Payout',
              impactColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            },
            {
              stream: 'Sub-Referral Purchase (L2)',
              dotColor: 'bg-cyan-400',
              basic: '5%',
              vip: '8%',
              impact: '+60% Higher Payout',
              impactColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            },
            {
              stream: 'Extended Network Purchase (L3)',
              dotColor: 'bg-purple-400',
              basic: '2%',
              vip: '5%',
              impact: '+150% Higher Payout',
              impactColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            },
            {
              stream: 'Direct Referral Profit Withdrawal Royalty',
              dotColor: 'bg-[#ff8800]',
              basic: '8%',
              vip: '10%',
              impact: '+25% Recurring Royalty',
              impactColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            },
            {
              stream: 'Milestone Cash Reward',
              dotColor: 'bg-amber-400',
              basic: '—',
              vip: '$10,000 USD',
              impact: 'One-Time Instant Bonus',
              impactColor: 'text-amber-300 bg-amber-500/15 border-amber-500/35',
            },
            {
              stream: 'Historical Rate Isolation',
              dotColor: 'bg-slate-400',
              basic: 'Default for all registrations',
              vip: 'Applies to all new signups after VIP',
              impact: 'Protects rate stability',
              impactColor: 'text-slate-300 bg-white/5 border-white/10',
            },
          ].map((item) => (
            <div
              key={item.stream}
              className="p-3 rounded-2xl bg-[#0b0c10] border border-white/10 space-y-2 touch-pan-y"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${item.dotColor}`} />
                  <span className="text-xs font-bold text-white leading-snug">{item.stream}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md border font-mono text-[10px] font-bold shrink-0 ${item.impactColor}`}
                >
                  {item.impact}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="p-2 rounded-xl bg-[#12141c] border border-white/5">
                  <div className="text-[9.5px] uppercase text-slate-400 font-semibold">
                    Basic (&lt;1,000 Active)
                  </div>
                  <div className="text-xs font-bold text-slate-200 mt-0.5">{item.basic}</div>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/[0.08] border border-amber-500/30">
                  <div className="text-[9.5px] uppercase text-amber-300/90 font-semibold">
                    VIP (1,000+ Active)
                  </div>
                  <div className="text-xs font-black text-amber-400 mt-0.5">{item.vip}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop & Tablet Table View (>= 768px) with Touch-Scroll Isolation */}
        <div
          data-testid="affiliate-tier-comparison-table-wrapper"
          style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
          className="hidden md:block overflow-x-auto overflow-y-visible touch-pan-x touch-pan-y"
        >
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-white/15 text-[11px] uppercase text-slate-400 bg-white/5">
                <th className="py-3 px-4 rounded-l-xl">Commission Stream</th>
                <th className="py-3 px-4">Basic Tier (&lt;1,000 Active)</th>
                <th className="py-3 px-4 text-amber-300">VIP Tier (1,000+ Active)</th>
                <th className="py-3 px-4 rounded-r-xl text-right">VIP Upgrade Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Direct Referral Challenge Purchase (L1)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-300">10%</td>
                <td className="py-3.5 px-4 font-mono font-black text-amber-400">15%</td>
                <td className="py-3.5 px-4 font-mono text-right text-emerald-400 font-bold">+50% Higher Payout</td>
              </tr>
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>Sub-Referral Purchase (L2)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-300">5%</td>
                <td className="py-3.5 px-4 font-mono font-black text-amber-400">8%</td>
                <td className="py-3.5 px-4 font-mono text-right text-emerald-400 font-bold">+60% Higher Payout</td>
              </tr>
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <span>Extended Network Purchase (L3)</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-300">2%</td>
                <td className="py-3.5 px-4 font-mono font-black text-amber-400">5%</td>
                <td className="py-3.5 px-4 font-mono text-right text-emerald-400 font-bold">+150% Higher Payout</td>
              </tr>
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#ff8800]" />
                  <span>Direct Referral Profit Withdrawal Royalty</span>
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-300">8%</td>
                <td className="py-3.5 px-4 font-mono font-black text-amber-400">10%</td>
                <td className="py-3.5 px-4 font-mono text-right text-emerald-400 font-bold">+25% Recurring Royalty</td>
              </tr>
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Milestone Cash Reward</span>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-500">—</td>
                <td className="py-3.5 px-4 font-mono font-black text-amber-300">$10,000 USD</td>
                <td className="py-3.5 px-4 font-mono text-right text-amber-400 font-bold">One-Time Instant Bonus</td>
              </tr>
              <tr className="hover:bg-white/5">
                <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Historical Rate Isolation</span>
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-400">Default for all registrations</td>
                <td className="py-3.5 px-4 text-xs text-amber-200">Applies to all new signups after VIP</td>
                <td className="py-3.5 px-4 font-mono text-right text-slate-400 text-xs">Protects rate stability</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. PRIMARY METRICS */}
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
          <div className="text-[11px] text-slate-400 mt-2">Package Commissions + Withdrawal Royalties</div>
        </div>

        <div
          data-testid="affiliate-withdrawal-royalties"
          className="p-5 rounded-2xl bg-[#111115] border border-white/10"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Direct Payout Bonus</span>
            <Percent className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-black text-emerald-400 font-mono">
            ${(stats.withdrawalEarnings ?? 0).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            {stats.isVipUnlocked ? '10%' : '8%'} earned on direct referrals' profit payouts
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#111115] border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Active Funded Referrals</span>
            <Users className="w-4 h-4 text-[#ffaa00]" />
          </div>
          <div className="text-3xl font-black text-white font-mono">
            {stats.activeFundedCount} Traders
          </div>
          <div className="text-[11px] text-slate-400 mt-2">Hold purchased Instant Funded or Challenge</div>
        </div>
      </div>

      {/* 5. COMMISSION STRUCTURE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          data-testid="affiliate-l1-card"
          className="p-5 rounded-2xl bg-[#111115] border border-emerald-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black text-xs">
            LEVEL 1 • {stats.isVipUnlocked ? '15% VIP' : '10%'}
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">
            Direct Referrals ({stats.isVipUnlocked ? '15%' : '10%'})
          </h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            {stats.isVipUnlocked ? '15%' : '10%'} instant commission on every direct referral challenge purchase.
          </p>
          <div className="text-lg font-black text-emerald-400">${stats.level1Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-l2-card"
          className="p-5 rounded-2xl bg-[#111115] border border-cyan-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-black text-xs">
            LEVEL 2 • {stats.isVipUnlocked ? '8% VIP' : '5%'}
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">
            Sub-Referrals ({stats.isVipUnlocked ? '8%' : '5%'})
          </h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            {stats.isVipUnlocked ? '8%' : '5%'} commission on challenge packages purchased by Level 2 sub-referrals.
          </p>
          <div className="text-lg font-black text-cyan-400">${stats.level2Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-l3-card"
          className="p-5 rounded-2xl bg-[#111115] border border-purple-500/40 font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-black text-xs">
            LEVEL 3 • {stats.isVipUnlocked ? '5% VIP' : '2%'}
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">
            Level 3 Network ({stats.isVipUnlocked ? '5%' : '2%'})
          </h4>
          <p className="text-xs text-slate-400 mt-1 mb-3 font-sans">
            {stats.isVipUnlocked ? '5%' : '2%'} commission on challenge packages purchased by Level 3 traders.
          </p>
          <div className="text-lg font-black text-purple-400">${stats.level3Earnings.toFixed(2)}</div>
        </div>

        <div
          data-testid="affiliate-payout-bonus-card"
          className="p-5 rounded-2xl bg-[#16120c] border-2 border-[#ff8800] font-mono"
        >
          <span className="px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 font-black text-xs">
            PAYOUT BONUS • {stats.isVipUnlocked ? '10% VIP' : '8%'}
          </span>
          <h4 className="text-sm font-black text-white mt-3 font-sans">
            Direct Payout Bonus ({stats.isVipUnlocked ? '10%' : '8%'})
          </h4>
          <p className="text-xs text-slate-300 mt-1 mb-3 font-sans">
            Extra {stats.isVipUnlocked ? '10%' : '8%'} commission on direct referrals' withdrawal amounts in real-time!
          </p>
          <div className="text-lg font-black text-[#ffaa00]">
            Recurring {stats.isVipUnlocked ? '10%' : '8%'} Bonus
          </div>
        </div>
      </div>

      {/* 6. PAYOUT FORM & AUDIT TABLE */}
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
              <span>3-Tier & Payout Bonus Ledger</span>
            </h3>
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#09090c] border border-white/10 text-[11px] font-mono">
              {[
                { id: 'all', label: 'All' },
                { id: '1', label: 'L1' },
                { id: '2', label: 'L2' },
                { id: '3', label: 'L3' },
                { id: 'withdrawal', label: 'Payout' },
                { id: 'vip', label: 'VIP Rates' },
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

          {filteredReferrals.length === 0 ? (
            <div
              data-testid="commission-ledger-empty-state"
              className="text-center py-10 px-4 rounded-2xl bg-[#0a0a0e] border border-white/5 font-mono"
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#ff8800]/10 border border-[#ff8800]/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-[#ff8800]" />
              </div>
              <h4 className="text-sm font-black text-white mb-1">No Referral Commissions Yet</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4 leading-relaxed font-sans">
                {filterLevel === 'all'
                  ? 'Commissions will appear here in real-time as your referred traders purchase challenge packages or withdraw profits.'
                  : `No commissions found matching the "${filterLevel}" filter.`}
              </p>
              {filterLevel === 'all' && (
                <div className="max-w-sm mx-auto p-1.5 rounded-xl bg-[#111115] border border-white/10 flex items-center gap-2">
                  <div className="flex-1 px-2.5 py-1 text-left text-[11px] text-slate-300 font-mono truncate select-all">
                    {referralLink}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`px-3 py-1.5 rounded-lg font-black text-[11px] font-mono uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer ${
                      copiedLink
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3 h-3 stroke-[3]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
              className="overflow-x-auto overflow-y-visible touch-pan-x touch-pan-y"
            >
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase text-slate-400">
                    <th className="py-3 pl-2">Trader</th>
                    <th className="py-3">Tier</th>
                    <th className="py-3">Type</th>
                    <th className="py-3">Source / Package</th>
                    <th className="py-3 text-right">Earned</th>
                    <th className="py-3 text-right pr-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredReferrals.map((ref) => {
                    const isVipEntry = ref.affiliateTier === 'vip';
                    return (
                      <tr key={ref.id} className="hover:bg-white/5">
                        <td className="py-3 pl-2">
                          <div className="font-bold text-white">{ref.referredUserName}</div>
                          <div className="text-[10px] text-slate-500">{ref.referredUserEmail}</div>
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              isVipEntry
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border border-white/10'
                            }`}
                          >
                            {isVipEntry && <Crown className="w-2.5 h-2.5 text-amber-400" />}
                            <span>{isVipEntry ? 'VIP' : 'BASIC'}</span>
                          </span>
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
                              ? `${(ref.commissionRate * 100).toFixed(0)}% PAYOUT BONUS`
                              : `L${ref.level} (${(ref.commissionRate * 100).toFixed(0)}%)`}
                          </span>
                        </td>
                        <td className="py-3 text-slate-300 font-sans">
                          <div className="font-bold text-white">{ref.packageName}</div>
                          <div className="text-[10px] text-slate-500">${Number(ref.packagePrice).toFixed(2)}</div>
                        </td>
                        <td className="py-3 text-right font-black text-emerald-400">
                          +${ref.commissionAmount.toFixed(2)}
                        </td>
                        <td className="py-3 text-right pr-2 text-slate-400 font-mono">
                          {new Date(ref.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ReferralNetworkList
        userId={userProfile.id}
        userEmail={userProfile.email}
        referrals={allMergedCommissions}
        referralLink={referralLink}
        referralCode={referralCode}
        onNetworkLoaded={(count) => {
          if (count > 0) setReferredNetworkCount(count);
        }}
      />

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
