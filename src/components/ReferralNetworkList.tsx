import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Copy,
  Check,
  TrendingUp,
  Search,
  Award,
  Wallet,
  Gift,
  BarChart3,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { ReferredUser, ReferralRecord, AffiliateReferralDetail } from '../types';
import { supabase } from '../utils/supabase';
import { apiGetAffiliateDashboard } from '../utils/apiClient';
import {
  buildReferredNetworkTree,
  formatPurchasedPackageLabel,
  formatPurchaseAmountDisplay,
  buildDetailedReferralList,
  getSelfFundedTurnoverTierStatus,
  SELF_FUNDED_TURNOVER_THRESHOLD,
} from '../utils/affiliateEngine';
import { TablePagination } from './TablePagination';
import { paginateItems } from '../utils/paginationHelper';

interface ReferralNetworkListProps {
  userId: string;
  userEmail?: string;
  referrals?: ReferralRecord[];
  referralLink?: string;
  referralCode?: string;
  onNetworkLoaded?: (count: number) => void;
  onTurnoverStatsLoaded?: (stats: {
    completedTradersCount: number;
    totalTurnover: number;
    totalTurnoverCommission: number;
    currentRatePercent: number;
  }) => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ReferralNetworkList: React.FC<ReferralNetworkListProps> = ({
  userId,
  userEmail,
  referrals = [],
  referralLink,
  referralCode,
  onNetworkLoaded,
  onTurnoverStatsLoaded,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  // Pagination & filters for Quotex Detailed Referral Table
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);
  const [tierRateFilter, setTierRateFilter] = useState<'all' | '5%' | '7%'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Pagination & filters for Multi-Level L1/L2/L3 Tree
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [levelFilter, setLevelFilter] = useState<'all' | 1 | 2 | 3>('all');

  const [network, setNetwork] = useState<ReferredUser[]>(() =>
    userId
      ? buildReferredNetworkTree({
          sponsorId: userId,
          referralsList: referrals.length > 0 ? referrals : undefined,
        })
      : []
  );

  const [liveReferralDetails, setLiveReferralDetails] = useState<AffiliateReferralDetail[]>([]);

  const effectiveReferralCode =
    referralCode ||
    (userId
      ? `BFT-${String(userId)
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 6)
          .toUpperCase()}`
      : 'BFT-TRADER');
  const effectiveReferralLink =
    referralLink ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${effectiveReferralCode}`
      : `https://bft.com/?ref=${effectiveReferralCode}`);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(effectiveReferralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const fetchNetworkAndReferralDetails = useCallback(async () => {
    setIsLoadingDetails(true);
    try {
      let targetUuid: string | null = null;
      if (userId && UUID_REGEX.test(userId)) {
        targetUuid = userId;
      } else {
        const { data: authData } = await supabase.auth
          .getUser()
          .catch(() => ({ data: { user: null } }));
        if (authData?.user?.id && UUID_REGEX.test(authData.user.id)) {
          targetUuid = authData.user.id;
        } else if (userEmail) {
          const { data: pData } = await supabase
            .from('profiles')
            .select('id')
            .ilike('email', userEmail)
            .maybeSingle();
          if (pData?.id && UUID_REGEX.test(pData.id)) {
            targetUuid = pData.id;
          }
        }
      }

      const supaUsers: ReferredUser[] = [];
      const collectedPurchases: any[] = [];
      const collectedCommissions: ReferralRecord[] = [...referrals];
      const supaDetailRows: Array<Record<string, any>> = [];

      // 1. Query `affiliate_referral_details` from Supabase securely
      try {
        const { data: rawDetails, error: detailsErr } = await supabase
          .from('affiliate_referral_details')
          .select('*')
          .limit(300);

        if (!detailsErr && Array.isArray(rawDetails) && rawDetails.length > 0) {
          const effectiveSponsor = targetUuid || userId;
          const matchingRows = rawDetails.filter((row: any) => {
            const rowSponsor = String(
              row.referrer_id ??
                row.sponsor_id ??
                row.affiliate_id ??
                row.affiliate_user_id ??
                row.referred_by ??
                ''
            ).trim();
            if (!rowSponsor) return true;
            if (effectiveSponsor && rowSponsor === effectiveSponsor) return true;
            if (userId && rowSponsor === userId) return true;
            if (
              effectiveReferralCode &&
              String(row.referrer_code ?? '').toUpperCase() === effectiveReferralCode.toUpperCase()
            ) {
              return true;
            }
            return false;
          });
          supaDetailRows.push(...matchingRows);
        }
      } catch {
        // Graceful fallback if table is not yet provisioned in remote project
      }

      if (targetUuid) {
        // L1 Direct Referrals from profiles
        const { data: l1, error: l1Err } = await supabase
          .from('profiles')
          .select('id, full_name, email, referral_code, created_at')
          .eq('referred_by', targetUuid);

        if (!l1Err && Array.isArray(l1) && l1.length > 0) {
          const l1Users: ReferredUser[] = l1.map((u: any) => ({
            id: u.id,
            fullName: u.full_name || 'Trader',
            email: u.email,
            joinedDate: u.created_at,
            level: 1 as const,
          }));
          supaUsers.push(...l1Users);

          // Fetch live balances & turnover for L1 users from trading_accounts if available
          const l1Ids = l1Users.map((u) => u.id).filter((id) => UUID_REGEX.test(id));
          if (l1Ids.length > 0) {
            try {
              const { data: acctRows } = await supabase
                .from('trading_accounts')
                .select('*')
                .in('user_id', l1Ids);

              if (Array.isArray(acctRows) && acctRows.length > 0) {
                for (let idx = 0; idx < l1.length; idx++) {
                  const u = l1[idx];
                  const userAccts = acctRows.filter((a: any) => a.user_id === u.id);
                  const liveBalance = userAccts.reduce(
                    (sum: number, a: any) =>
                      sum + Number(a.current_balance ?? a.balance ?? 0),
                    0
                  );
                  const bonusAmt = userAccts.reduce(
                    (sum: number, a: any) => sum + Number(a.bonus_amount ?? a.bonus ?? 0),
                    0
                  );
                  const turnoverAmt = userAccts.reduce(
                    (sum: number, a: any) =>
                      sum + Number(a.total_trade_turnover ?? a.total_volume ?? 0),
                    0
                  );

                  if (
                    !supaDetailRows.some(
                      (r) => String(r.referred_user_id ?? r.user_id) === String(u.id)
                    )
                  ) {
                    supaDetailRows.push({
                      id: `ARD-PROF-${u.id}`,
                      referrer_id: targetUuid,
                      referred_user_id: u.id,
                      referral_name: u.full_name || 'Trader',
                      referral_code:
                        u.referral_code ||
                        `UID-${String(u.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`,
                      trader_index: idx + 1,
                      account_balance: liveBalance,
                      bonus_amount: bonusAmt,
                      total_trade_turnover: turnoverAmt,
                      status: turnoverAmt > 0 || liveBalance > 0 ? 'completed' : 'active',
                      joined_at: u.created_at || new Date().toISOString(),
                    });
                  }
                }
              }
            } catch {
              // ignore optional trading_accounts enrichment error
            }
          }

          // L2 Sub-Referrals
          let l2Users: ReferredUser[] = [];
          if (l1Ids.length > 0) {
            const { data: l2 } = await supabase
              .from('profiles')
              .select('id, full_name, email, referred_by')
              .in('referred_by', l1Ids);
            if (Array.isArray(l2) && l2.length > 0) {
              l2Users = l2.map((u: any) => ({
                id: u.id,
                fullName: u.full_name || 'Trader',
                level: 2 as const,
              }));
              supaUsers.push(...l2Users);
            }
          }

          // L3 Extended Network
          const l2Ids = l2Users.map((u) => u.id).filter((id) => UUID_REGEX.test(id));
          if (l2Ids.length > 0) {
            const { data: l3 } = await supabase
              .from('profiles')
              .select('id, full_name, email, referred_by')
              .in('referred_by', l2Ids);
            if (Array.isArray(l3) && l3.length > 0) {
              supaUsers.push(
                ...l3.map((u: any) => ({
                  id: u.id,
                  fullName: u.full_name || 'Trader',
                  level: 3 as const,
                }))
              );
            }
          }
        }

        const allIds = supaUsers.map((u) => u.id).filter((id) => UUID_REGEX.test(id));
        if (allIds.length > 0) {
          const { data: purchases } = await supabase
            .from('user_purchases')
            .select('*')
            .in('user_id', allIds);
          if (Array.isArray(purchases)) {
            collectedPurchases.push(...purchases);
          }

          const { data: comms } = await supabase
            .from('referral_commissions')
            .select('*')
            .in('referred_user_id', allIds);
          if (Array.isArray(comms)) {
            for (const c of comms) {
              const pkgAmt = Number(c.package_amount || 0);
              if (pkgAmt > 0) {
                collectedPurchases.push({
                  user_id: c.referred_user_id,
                  package_name: c.package_name || c.description || 'Challenge Package',
                  package_sku: 'BFT-PKG',
                  package_amount: pkgAmt,
                  amount: pkgAmt,
                });
              }
            }
          }
        }
      }

      // Also fetch backend affiliate dashboard (syncs SQLite user_purchases, commissions & networkTree)
      try {
        const dashRes = await apiGetAffiliateDashboard({
          userId: targetUuid || userId,
          email: userEmail,
        });
        if (dashRes?.ok && dashRes?.stats) {
          if (Array.isArray(dashRes.stats.networkTree)) {
            for (const node of dashRes.stats.networkTree) {
              if (!supaUsers.some((u) => u.id === node.id)) {
                supaUsers.push({
                  id: node.id,
                  fullName: node.fullName || 'Trader',
                  email: node.email,
                  level: (node.level || 1) as 1 | 2 | 3,
                  latestPurchase: node.latestPurchase,
                });
              } else if (node.latestPurchase) {
                collectedPurchases.push({
                  user_id: node.id,
                  package_name: node.latestPurchase.name,
                  package_sku: node.latestPurchase.sku,
                  package_amount: node.latestPurchase.amount,
                  amount: node.latestPurchase.amount,
                });
              }
            }
          }
          if (Array.isArray(dashRes.stats.recentCommissions)) {
            for (const rc of dashRes.stats.recentCommissions) {
              if (rc.source_type !== 'withdrawal' && Number(rc.base_amount) > 0) {
                collectedPurchases.push({
                  user_id: rc.referred_user_id,
                  package_name: rc.package_name,
                  package_sku: 'BFT-PKG',
                  package_amount: Number(rc.base_amount),
                  amount: Number(rc.base_amount),
                });
              }
            }
          }
        }
      } catch {
        // ignore offline fallback
      }

      const effectiveSponsorId = targetUuid || userId || '';
      if (!effectiveSponsorId) {
        setNetwork([]);
        setLiveReferralDetails([]);
        onNetworkLoaded?.(0);
        return;
      }

      const mergedTree = buildReferredNetworkTree({
        sponsorId: effectiveSponsorId,
        externalNodes: supaUsers,
        purchasesList: collectedPurchases,
        referralsList: collectedCommissions.length > 0 ? collectedCommissions : undefined,
      });

      setNetwork(mergedTree);
      onNetworkLoaded?.(mergedTree.length);

      const detailedRows = buildDetailedReferralList({
        sponsorId: effectiveSponsorId,
        rawDetailRows: supaDetailRows,
        networkNodes: mergedTree,
        referralsList: collectedCommissions,
      });

      setLiveReferralDetails(detailedRows);

      if (onTurnoverStatsLoaded) {
        const completedCount = detailedRows.filter(
          (d) => d.totalTradeTurnover > 0 || d.accountBalance > 0 || d.status === 'completed'
        ).length;
        const totalTurnover = detailedRows.reduce((s, d) => s + d.totalTradeTurnover, 0);
        const totalTurnoverCommission = detailedRows.reduce((s, d) => s + d.commissionEarned, 0);
        const tierInfo = getSelfFundedTurnoverTierStatus(completedCount);
        onTurnoverStatsLoaded({
          completedTradersCount: completedCount,
          totalTurnover: Number(totalTurnover.toFixed(2)),
          totalTurnoverCommission: Number(totalTurnoverCommission.toFixed(2)),
          currentRatePercent: tierInfo.currentRatePercent,
        });
      }
    } catch (err) {
      console.warn('fetchNetworkAndReferralDetails notice:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  }, [userId, userEmail, referrals, effectiveReferralCode, onNetworkLoaded, onTurnoverStatsLoaded]);

  useEffect(() => {
    fetchNetworkAndReferralDetails();
    const channel = supabase
      .channel(`realtime:network:${userId || 'default'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'affiliate_referral_details' },
        fetchNetworkAndReferralDetails
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        fetchNetworkAndReferralDetails
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_purchases' },
        fetchNetworkAndReferralDetails
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referral_commissions' },
        fetchNetworkAndReferralDetails
      )
      .subscribe();

    const handleLocalUpdate = () => {
      fetchNetworkAndReferralDetails();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bft-affiliate-updated', handleLocalUpdate);
    }

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('bft-affiliate-updated', handleLocalUpdate);
      }
    };
  }, [fetchNetworkAndReferralDetails, userId]);

  // Active rows displayed in the Quotex-style Detailed Referral Table (strictly from real database records)
  const displayedReferralDetails = useMemo<AffiliateReferralDetail[]>(() => {
    return liveReferralDetails.filter((item) => {
      if (tierRateFilter === '5%' && item.turnoverCommissionRate >= 0.07) return false;
      if (tierRateFilter === '7%' && item.turnoverCommissionRate < 0.07) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = item.referralName.toLowerCase().includes(q);
        const matchId = item.referralCodeOrId.toLowerCase().includes(q);
        const matchUid = item.referredUserId.toLowerCase().includes(q);
        return matchName || matchId || matchUid;
      }
      return true;
    });
  }, [liveReferralDetails, tierRateFilter, searchQuery]);

  const paginatedDetails = useMemo(() => {
    return paginateItems(displayedReferralDetails, detailPage, detailPageSize);
  }, [displayedReferralDetails, detailPage, detailPageSize]);

  useEffect(() => {
    setDetailPage(1);
  }, [tierRateFilter, searchQuery, liveReferralDetails.length]);

  // Aggregate summary metrics for the Quotex Referral Table (strictly from live Supabase records)
  const detailSummary = useMemo(() => {
    const source = displayedReferralDetails;
    const completedCount = liveReferralDetails.filter(
      (d) => d.totalTradeTurnover > 0 || d.accountBalance > 0 || d.status === 'completed'
    ).length;
    const totalBalance = source.reduce((s, r) => s + r.accountBalance, 0);
    const totalBonus = source.reduce((s, r) => s + r.bonusAmount, 0);
    const totalTurnover = source.reduce((s, r) => s + r.totalTradeTurnover, 0);
    const totalTurnoverCommission = source.reduce((s, r) => s + r.commissionEarned, 0);
    const tierStatus = getSelfFundedTurnoverTierStatus(completedCount);
    return {
      completedCount,
      totalBalance: Number(totalBalance.toFixed(2)),
      totalBonus: Number(totalBonus.toFixed(2)),
      totalTurnover: Number(totalTurnover.toFixed(2)),
      totalTurnoverCommission: Number(totalTurnoverCommission.toFixed(2)),
      tierStatus,
    };
  }, [displayedReferralDetails, liveReferralDetails]);

  const filteredNetwork = useMemo(() => {
    if (levelFilter === 'all') return network;
    return network.filter((u) => u.level === levelFilter);
  }, [network, levelFilter]);

  const paginatedNetwork = useMemo(() => {
    return paginateItems(filteredNetwork, currentPage, pageSize);
  }, [filteredNetwork, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [levelFilter, network.length]);

  return (
    <div className="space-y-8 mt-8">
      {/* =====================================================================
          1. QUOTEX-STYLE DETAILED REFERRAL TABLE (`affiliate_referral_details`)
         ===================================================================== */}
      <div
        data-testid="quotex-referral-details-section"
        className="p-5 sm:p-7 rounded-3xl bg-[#0b0f19] border border-white/10 shadow-2xl"
      >
        {/* Top Header & Self-Funded Turnover Tier Banner */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#0ecb81]/15 border border-[#0ecb81]/30 text-[#0ecb81] text-[11px] font-mono font-bold mb-2">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>SELF-FUNDED TURNOVER COMMISSION LEDGER (5% / 7% TIER)</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5 tracking-tight">
              <Users className="w-5 h-5 text-[#0ecb81] shrink-0" />
              <span>Partner Referral Turnover & Live Account Details</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Real-time breakdown of each referred trader&apos;s live account balance, active bonus, cumulative trading turnover, and your automatic{' '}
              <strong className="text-[#0ecb81]">5%</strong> (first 200 traders) or{' '}
              <strong className="text-amber-400">7%</strong> (201st trader onwards) turnover commission.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <button
              type="button"
              data-testid="refresh-referral-details-btn"
              onClick={fetchNetworkAndReferralDetails}
              className="px-3 py-2 rounded-xl bg-[#131926] hover:bg-[#1a2234] text-slate-200 border border-white/10 text-xs font-mono font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDetails ? 'animate-spin text-[#0ecb81]' : 'text-slate-400'}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Turnover Tier Progression & Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 my-5">
          <div className="p-3.5 rounded-2xl bg-[#111726] border border-white/10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Completed Traders</span>
              <Award className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-black text-white font-mono">
              {detailSummary.completedCount} <span className="text-xs font-normal text-slate-400">/ {SELF_FUNDED_TURNOVER_THRESHOLD}</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#070a10] overflow-hidden mt-2 border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-[#0ecb81] to-amber-400 transition-all duration-300"
                style={{ width: `${detailSummary.tierStatus.progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">
              {detailSummary.tierStatus.is7PercentUnlocked
                ? '✓ 7% Turnover Rate Unlocked (201+)'
                : `${detailSummary.tierStatus.remainingToUpgrade} more to unlock 7% rate`}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111726] border border-white/10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Active Turnover Rate</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#0ecb81]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-[#0ecb81] font-mono">
                {detailSummary.tierStatus.currentRatePercent}%
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                (1–200: 5% | 201+: 7%)
              </span>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              Auto-scales per trader index
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111726] border border-white/10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Referrals Live Balance</span>
              <Wallet className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg font-black text-white font-mono">
              ${detailSummary.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              Bonus: +${detailSummary.totalBonus.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111726] border border-white/10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Total Trade Turnover</span>
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-lg font-black text-white font-mono">
              ${detailSummary.totalTurnover.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              Cumulative volume across referrals
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0ecb81]/10 border border-[#0ecb81]/30">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#0ecb81] mb-1">
              <span>Turnover Commission</span>
              <Gift className="w-3.5 h-3.5 text-[#0ecb81]" />
            </div>
            <div
              data-testid="total-turnover-commission-value"
              className="text-lg font-black text-[#0ecb81] font-mono"
            >
              +${detailSummary.totalTurnoverCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-200/80 mt-2">
              Earned from 5% / 7% turnover rules
            </div>
          </div>
        </div>

        {/* Search & Tier Rate Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-testid="referral-details-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Referral Name or Trader ID (e.g. UID-8849)..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#111726] border border-white/10 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-[#0ecb81]"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[#111726] p-1 rounded-xl border border-white/10 text-[11px] font-mono">
              {(
                [
                  { id: 'all', label: 'All Referrals' },
                  { id: '5%', label: '5% Tier (#1–#200)' },
                  { id: '7%', label: '7% Tier (#201+)' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`turnover-tier-filter-${tab.id}`}
                  onClick={() => setTierRateFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    tierRateFilter === tab.id
                      ? 'bg-[#0ecb81] text-slate-950 font-black'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quotex-Style Detailed Referral Table / Mobile Cards */}
        {displayedReferralDetails.length === 0 ? (
          <div
            data-testid="quotex-referral-empty-state"
            className="text-center py-10 px-4 rounded-2xl bg-[#111726]/70 border border-white/10 font-mono"
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#0ecb81]/10 border border-[#0ecb81]/30 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-[#0ecb81]" />
            </div>
            <h4 className="text-sm sm:text-base font-black text-white mb-1.5">
              No Referred Traders Recorded Yet
            </h4>
            <p className="text-xs text-slate-300 max-w-lg mx-auto mb-5 leading-relaxed font-sans">
              Share your partner link below to onboard self-funded and funded traders. You earn{' '}
              <strong className="text-[#0ecb81]">5% of trading turnover</strong> on your first 200 referred traders, and{' '}
              <strong className="text-amber-400">7% of trading turnover</strong> from your 201st trader onwards.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2 rounded-xl bg-[#0ecb81] hover:bg-[#0bb572] text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Referral Link Copied' : 'Copy Referral Link'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Responsive Cards (< 768px) */}
            <div
              data-testid="quotex-referral-mobile-cards"
              className="md:hidden space-y-3"
            >
              {paginatedDetails.map((row) => {
                const isUpgraded7 = row.turnoverCommissionRate >= 0.07;
                const ratePercent = Math.round(row.turnoverCommissionRate * 100);
                return (
                  <div
                    key={row.id}
                    data-testid={`referral-detail-card-${row.referredUserId}`}
                    className="p-4 rounded-2xl bg-[#111726] border border-white/10 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono font-bold text-slate-300">
                            #{row.traderIndex}
                          </span>
                          <span className="text-sm font-black text-white">{row.referralName}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          ID: <span className="text-slate-200 font-semibold">{row.referralCodeOrId}</span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black uppercase border ${
                          isUpgraded7
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-[#0ecb81]/15 text-[#0ecb81] border-[#0ecb81]/30'
                        }`}
                      >
                        {ratePercent}% Turnover Tier
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-2 border-t border-white/10">
                      <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-white/5">
                        <div className="text-[10px] text-slate-400 uppercase">Account Balance (Live)</div>
                        <div className="text-sm font-bold text-white mt-0.5">
                          ${row.accountBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-white/5">
                        <div className="text-[10px] text-slate-400 uppercase">Bonus Amount</div>
                        <div className="text-sm font-bold text-cyan-400 mt-0.5">
                          +${row.bonusAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0b0f19] border border-white/5">
                        <div className="text-[10px] text-slate-400 uppercase">Total Trade Turnover</div>
                        <div className="text-sm font-bold text-slate-200 mt-0.5">
                          ${row.totalTradeTurnover.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0ecb81]/10 border border-[#0ecb81]/30">
                        <div className="text-[10px] text-[#0ecb81] uppercase font-bold">
                          Commission ({ratePercent}%)
                        </div>
                        <div className="text-sm font-black text-[#0ecb81] mt-0.5">
                          +${row.commissionEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Quotex-Style 5-Column Detailed Referral Table (>= 768px) */}
            <div
              data-testid="quotex-referral-details-table-wrapper"
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
              className="hidden md:block overflow-x-auto rounded-2xl border border-white/10 bg-[#111726]"
            >
              <table
                data-testid="quotex-referral-details-table"
                className="w-full text-left font-mono text-xs border-collapse"
              >
                <thead>
                  <tr className="border-b border-white/10 bg-[#161f33] text-[11px] uppercase text-slate-300 tracking-wider">
                    <th className="py-3.5 px-4 font-bold">Referral Name / ID</th>
                    <th className="py-3.5 px-4 text-right font-bold">Account Balance (Live)</th>
                    <th className="py-3.5 px-4 text-right font-bold">Bonus Amount</th>
                    <th className="py-3.5 px-4 text-right font-bold">Total Trade Turnover</th>
                    <th className="py-3.5 px-4 text-right font-bold">Commission Earned From User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {paginatedDetails.map((row) => {
                    const isUpgraded7 = row.turnoverCommissionRate >= 0.07;
                    const ratePercent = Math.round(row.turnoverCommissionRate * 100);
                    return (
                      <tr
                        key={row.id}
                        data-testid={`referral-detail-row-${row.referredUserId}`}
                        className="hover:bg-white/[0.04] transition-colors"
                      >
                        {/* Column 1: Referral Name / ID */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                                isUpgraded7
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30'
                              }`}
                            >
                              #{row.traderIndex}
                            </span>
                            <div>
                              <div className="font-bold text-white font-sans text-sm leading-tight">
                                {row.referralName}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                <span>{row.referralCodeOrId}</span>
                                <span className="text-slate-600">•</span>
                                <span className={isUpgraded7 ? 'text-amber-300' : 'text-slate-400'}>
                                  {isUpgraded7 ? 'Trader #201+ (7% Tier)' : 'First 200 (5% Tier)'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Account Balance (Live) */}
                        <td className="py-3.5 px-4 text-right font-bold text-white tabular-nums">
                          ${row.accountBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Column 3: Bonus Amount */}
                        <td className="py-3.5 px-4 text-right font-bold text-cyan-400 tabular-nums">
                          +${row.bonusAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Column 4: Total Trade Turnover */}
                        <td className="py-3.5 px-4 text-right font-bold text-slate-200 tabular-nums">
                          ${row.totalTradeTurnover.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Column 5: Commission Earned From This Specific User */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                                isUpgraded7
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-[#0ecb81]/15 text-[#0ecb81] border-[#0ecb81]/30'
                              }`}
                            >
                              {ratePercent}% Rate
                            </span>
                            <span className="text-sm font-black text-[#0ecb81] tabular-nums">
                              +${row.commissionEarned.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <TablePagination
                currentPage={detailPage}
                totalItems={displayedReferralDetails.length}
                pageSize={detailPageSize}
                onPageChange={setDetailPage}
                onPageSizeChange={setDetailPageSize}
                pageSizeOptions={[5, 10, 20, 50]}
                itemLabel="referred traders"
                testIdPrefix="quotex-referral-details-pagination"
              />
            </div>
          </>
        )}
      </div>

      {/* =====================================================================
          2. MULTI-LEVEL FUNDED CHALLENGE NETWORK TREE (L1, L2, L3)
         ===================================================================== */}
      <div
        data-testid="referral-network-tree"
        className="p-5 sm:p-6 rounded-3xl bg-[#0b0f19] border border-white/10"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black text-white font-mono flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#ff8800]" />
              <span>Full Referred Network Tree (L1, L2, L3 Challenge Tier)</span>
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              Multi-level downline tree for Funded Challenge purchases (Basic: 10%/5%/2% + 8% WD | VIP: 15%/8%/5% + 10% WD)
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[#111726] p-1 rounded-xl border border-white/10 text-[10px] font-mono">
              {(['all', 1, 2, 3] as const).map((lvl) => {
                const count =
                  lvl === 'all' ? network.length : network.filter((u) => u.level === lvl).length;
                const label = lvl === 'all' ? 'All' : `L${lvl}`;
                return (
                  <button
                    key={String(lvl)}
                    type="button"
                    data-testid={`referral-level-filter-${lvl}`}
                    onClick={() => setLevelFilter(lvl)}
                    className={`px-2 py-0.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      levelFilter === lvl
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300">
              {filteredNetwork.length} {filteredNetwork.length === 1 ? 'Trader' : 'Traders'}
            </span>
          </div>
        </div>

        {network.length === 0 ? (
          <div
            data-testid="referral-network-empty-state"
            className="text-center py-10 px-4 rounded-2xl bg-[#111726]/70 border border-white/5 font-mono"
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#ff8800]/10 border border-[#ff8800]/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-[#ff8800]" />
            </div>
            <h4 className="text-base font-black text-white mb-2">No Funded Challenge Referrals Yet</h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto mb-6 leading-relaxed">
              Your affiliate network is currently empty. Share your unique referral link to onboard traders
              and earn up to <strong className="text-white">15%</strong> on challenge purchases,{' '}
              <strong className="text-white">10%</strong> on profit payouts, and up to{' '}
              <strong className="text-[#0ecb81]">7%</strong> on self-funded trading turnover.
            </p>

            <div className="max-w-md mx-auto p-2 rounded-2xl bg-[#0b0f19] border border-white/10 flex items-center gap-2 mb-4">
              <div className="flex-1 px-3 py-2 text-left text-xs text-slate-200 font-mono truncate select-all">
                {effectiveReferralLink}
              </div>
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-xl font-black text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    : 'bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950'
                }`}
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-300">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L1 Direct: 10%–15%</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L2 Sub: 5%–8%</span>
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L3 Network: 2%–5%</span>
              <span className="px-2 py-0.5 rounded bg-[#ff8800]/10 border border-[#ff8800]/20 text-[#ffaa00]">
                Payout Bonus: 8%–10%
              </span>
              <span className="px-2 py-0.5 rounded bg-[#0ecb81]/15 border border-[#0ecb81]/30 text-[#0ecb81]">
                Self-Funded Turnover: 5%–7%
              </span>
            </div>
          </div>
        ) : filteredNetwork.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-300 font-mono">
            No downline traders found matching Level {levelFilter}.
          </div>
        ) : (
          <div
            style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
            className="overflow-x-auto overflow-y-visible touch-pan-x touch-pan-y"
          >
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase text-slate-300">
                  <th className="py-3 pl-2">Trader Name</th>
                  <th className="py-3">Level</th>
                  <th className="py-3">Status / Purchase</th>
                  <th className="py-3 text-right pr-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedNetwork.map((u) => {
                  const hasPurchase = Boolean(
                    u.latestPurchase && Number(u.latestPurchase.amount) > 0
                  );
                  const displayPkg = hasPurchase
                    ? formatPurchasedPackageLabel(
                        u.latestPurchase?.name,
                        u.latestPurchase?.sku,
                        u.latestPurchase?.amount
                      )
                    : 'No Purchase';
                  const displayAmt = hasPurchase
                    ? formatPurchaseAmountDisplay(u.latestPurchase?.amount)
                    : '$0';

                  return (
                    <tr key={u.id} className="hover:bg-white/5">
                      <td className="py-3 pl-2 font-bold text-white flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.level === 1
                              ? 'bg-[#ff8800]'
                              : u.level === 2
                              ? 'bg-blue-400'
                              : 'bg-purple-400'
                          }`}
                        />
                        <span>{u.fullName}</span>
                      </td>
                      <td className="py-3 text-slate-300">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.level === 1
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : u.level === 2
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          }`}
                        >
                          Level {u.level}{' '}
                          {u.level === 1 ? '(Direct)' : u.level === 2 ? '(Sub)' : '(Network)'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-300">
                        {hasPurchase && displayPkg !== 'No Purchase' ? (
                          <span className="font-bold text-[#ff8800]">{displayPkg}</span>
                        ) : (
                          <span className="text-slate-400">No Purchase</span>
                        )}
                      </td>
                      <td className="py-3 text-right pr-2 font-bold text-emerald-400">
                        {displayAmt}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <TablePagination
              currentPage={currentPage}
              totalItems={filteredNetwork.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10, 20, 50]}
              itemLabel="traders"
              testIdPrefix="affiliate-tree-pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
};
