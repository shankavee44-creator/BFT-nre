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
  computeSelfFundedSummary,
  isPurchaseOrAccountActive,
  isSelfFundedAccountOrDeposit,
  isFundedChallengeItem,
  countCombinedActiveReferrals,
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
    totalRegisteredReferrals: number;
    activeDepositedCount: number;
    completedTradersCount: number;
    totalTurnover: number;
    totalTurnoverCommission: number;
    currentRatePercent: number;
    activeFundedCount?: number;
    activeCombinedTradersCount?: number;
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

          const l1Ids = l1Users.map((u) => u.id).filter((id) => UUID_REGEX.test(id));

          // L2 Sub-Referrals
          let l2Users: ReferredUser[] = [];
          if (l1Ids.length > 0) {
            const { data: l2 } = await supabase
              .from('profiles')
              .select('id, full_name, email, referral_code, referred_by, created_at')
              .in('referred_by', l1Ids);
            if (Array.isArray(l2) && l2.length > 0) {
              l2Users = l2.map((u: any) => ({
                id: u.id,
                fullName: u.full_name || 'Trader',
                email: u.email,
                joinedDate: u.created_at,
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
              .select('id, full_name, email, referral_code, referred_by, created_at')
              .in('referred_by', l2Ids);
            if (Array.isArray(l3) && l3.length > 0) {
              supaUsers.push(
                ...l3.map((u: any) => ({
                  id: u.id,
                  fullName: u.full_name || 'Trader',
                  email: u.email,
                  joinedDate: u.created_at,
                  level: 3 as const,
                }))
              );
            }
          }

          const allIds = supaUsers.map((u) => u.id).filter((id) => UUID_REGEX.test(id));
          const profileById = new Map<string, any>();
          for (const u of l1) profileById.set(u.id, u);

          if (allIds.length > 0) {
            // Fetch user_purchases across ALL L1, L2, L3 users
            try {
              const { data: purchases } = await supabase
                .from('user_purchases')
                .select('*')
                .in('user_id', allIds);
              if (Array.isArray(purchases)) {
                for (const p of purchases) {
                  collectedPurchases.push({
                    ...p,
                    status: p.status || 'completed',
                    account_type: p.account_type || 'challenge',
                  });
                }
              }
            } catch {
              // ignore optional error
            }

            // Fetch deposits / crypto_deposits across ALL L1, L2, L3 users so multi-deposits appear individually
            for (const depTable of ['crypto_deposits', 'deposits'] as const) {
              try {
                const { data: depRows } = await supabase
                  .from(depTable)
                  .select('*')
                  .in('user_id', allIds);
                if (Array.isArray(depRows)) {
                  for (const d of depRows) {
                    collectedPurchases.push({
                      id: d.id ? String(d.id) : undefined,
                      account_id: d.account_id || null,
                      user_id: d.user_id,
                      package_name:
                        d.package_name ||
                        (String(d.account_type || '').toLowerCase() === 'self_funded'
                          ? 'Self-Funded Deposit'
                          : 'Challenge Package'),
                      package_sku: d.package_sku || d.sku || (String(d.account_type || '').toLowerCase() === 'self_funded' ? 'BFT-SELF' : 'BFT-PKG'),
                      package_amount: Number(d.amount ?? 0),
                      amount: Number(d.amount ?? 0),
                      account_type: d.account_type || (depTable === 'deposits' ? 'self_funded' : 'challenge'),
                      status: d.status || 'pending',
                      created_at: d.created_at,
                    });
                  }
                }
              } catch {
                // table may not exist in remote schema
              }
            }

            // Fetch ALL trading_accounts across L1, L2, L3 users
            try {
              const { data: acctRows } = await supabase
                .from('trading_accounts')
                .select('*')
                .in('user_id', allIds);

              if (Array.isArray(acctRows) && acctRows.length > 0) {
                for (const a of acctRows) {
                  const tierLower = String(a.tier || a.account_type || '').toLowerCase();
                  const catLower = String(a.account_category || '').toLowerCase();
                  if (tierLower === 'demo' || catLower === 'demo') continue;
                  const isPersonal =
                    tierLower === 'personal' ||
                    tierLower === 'self_funded' ||
                    catLower === 'personal_live' ||
                    String(a.phase || '').toLowerCase() === 'personal_live';
                  const acctAmt = Number(
                    isPersonal
                      ? a.deposited_capital ?? a.starting_balance ?? a.initial_balance ?? a.current_balance ?? 0
                      : a.size ?? a.starting_balance ?? a.initial_balance ?? a.current_balance ?? 0
                  );
                  if (acctAmt > 0) {
                    collectedPurchases.push({
                      id: `TA-${a.id}`,
                      account_id: String(a.id),
                      user_id: a.user_id,
                      package_name: String(
                        a.tier_name || a.account_type || (isPersonal ? 'Self-Funded Live Wallet' : 'Funded Challenge')
                      ),
                      package_sku: isPersonal ? 'BFT-SELF' : 'BFT-CHAL',
                      package_amount: acctAmt,
                      amount: acctAmt,
                      account_type: isPersonal ? 'self_funded' : 'challenge',
                      status: a.status || 'active',
                      created_at: a.created_at,
                    });
                  }
                }

                // Enrich L1 self-funded turnover ledger rows ONLY for actual self-capital accounts/balances
                for (let idx = 0; idx < l1.length; idx++) {
                  const u = l1[idx];
                  const userAccts = acctRows.filter(
                    (a: any) =>
                      a.user_id === u.id &&
                      String(a.tier || '').toLowerCase() !== 'demo' &&
                      String(a.account_category || '').toLowerCase() !== 'demo'
                  );
                  const selfAccts = userAccts.filter((a: any) =>
                    isSelfFundedAccountOrDeposit({
                      accountType: a.tier || a.account_type,
                      accountCategory: a.account_category,
                      name: a.tier_name,
                    })
                  );
                  const liveBalance = selfAccts.reduce(
                    (sum: number, a: any) =>
                      sum + Number(a.current_balance ?? a.balance ?? 0),
                    0
                  );
                  const bonusAmt = selfAccts.reduce(
                    (sum: number, a: any) => sum + Number(a.bonus_amount ?? a.bonus ?? 0),
                    0
                  );
                  const turnoverAmt = selfAccts.reduce(
                    (sum: number, a: any) =>
                      sum + Number(a.total_trade_turnover ?? a.total_volume ?? 0),
                    0
                  );
                  const selfCapitalDeposited = selfAccts
                    .filter((a: any) => isPurchaseOrAccountActive(a.status || 'active'))
                    .reduce(
                      (sum: number, a: any) =>
                        sum + Number(a.deposited_capital ?? a.starting_balance ?? a.initial_balance ?? a.current_balance ?? 0),
                      0
                    );
                  const hasActiveSelfDeposit = selfCapitalDeposited > 0 || liveBalance > 0;

                  if (
                    !supaDetailRows.some(
                      (r) => String(r.referred_user_id ?? r.user_id) === String(u.id)
                    )
                  ) {
                    const prof = profileById.get(u.id) || u;
                    supaDetailRows.push({
                      id: `ARD-PROF-${u.id}`,
                      referrer_id: targetUuid,
                      referred_user_id: u.id,
                      referral_name: prof.full_name || 'Trader',
                      referral_code:
                        prof.referral_code ||
                        `UID-${String(u.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`,
                      account_balance: liveBalance,
                      bonus_amount: bonusAmt,
                      total_trade_turnover: turnoverAmt,
                      self_capital_deposit: selfCapitalDeposited,
                      has_active_self_capital_deposit: hasActiveSelfDeposit,
                      account_type: hasActiveSelfDeposit ? 'self_funded' : 'funded',
                      account_count: userAccts.length,
                      purchased_accounts: userAccts.map((a: any) => ({
                        id: `TA-${a.id}`,
                        accountId: String(a.id),
                        name: String(a.tier_name || a.account_type || 'Trading Account'),
                        amount: Number(a.starting_balance ?? a.initial_balance ?? a.current_balance ?? 0),
                        accountType: isSelfFundedAccountOrDeposit({
                          accountType: a.tier || a.account_type,
                          accountCategory: a.account_category,
                          name: a.tier_name,
                        })
                          ? 'self_funded'
                          : 'challenge',
                        status: a.status || 'active',
                      })),
                      status: hasActiveSelfDeposit
                        ? turnoverAmt > 0
                          ? 'completed'
                          : 'active'
                        : 'registered',
                      joined_at: prof.created_at || new Date().toISOString(),
                    });
                  }
                }
              }
            } catch {
              // ignore optional trading_accounts enrichment error
            }

            // Fallback enrichment from referral_commissions (excluding withdrawals & users already having purchase records)
            try {
              const { data: comms } = await supabase
                .from('referral_commissions')
                .select('*')
                .in('referred_user_id', allIds);
              if (Array.isArray(comms)) {
                for (const c of comms) {
                  const rawType = String(c.source_type || c.commission_type || '').toLowerCase();
                  if (rawType.includes('withdrawal')) continue;
                  const pkgAmt = Number(c.package_amount ?? c.base_amount ?? 0);
                  const uid = String(c.referred_user_id || '').trim();
                  if (
                    pkgAmt > 0 &&
                    uid &&
                    !collectedPurchases.some((p) => String(p.user_id || p.userId) === uid)
                  ) {
                    collectedPurchases.push({
                      id: c.id ? `COMMPUR-${c.id}` : undefined,
                      user_id: uid,
                      package_name: c.package_name || c.description || 'Challenge Package',
                      package_sku: 'BFT-PKG',
                      package_amount: pkgAmt,
                      amount: pkgAmt,
                      account_type: 'challenge',
                      status: c.status || 'completed',
                      created_at: c.created_at,
                    });
                  }
                }
              }
            } catch {
              // ignore optional error
            }
          }
        }
      }

      // Also fetch backend affiliate dashboard (syncs SQLite user_purchases, deposits, accounts, commissions & networkTree)
      try {
        const dashRes = await apiGetAffiliateDashboard({
          userId: targetUuid || userId,
          email: userEmail,
        });
        if (dashRes?.ok && dashRes?.stats) {
          if (Array.isArray(dashRes.stats.networkTree)) {
            for (const node of dashRes.stats.networkTree) {
              const existingIdx = supaUsers.findIndex((u) => u.id === node.id);
              if (existingIdx === -1) {
                supaUsers.push({
                  id: node.id,
                  fullName: node.fullName || 'Trader',
                  email: node.email,
                  joinedDate: node.joinedDate,
                  level: (node.level || 1) as 1 | 2 | 3,
                  latestPurchase: node.latestPurchase,
                  purchases: node.purchases,
                  accountCount: node.accountCount,
                  totalPurchaseAmount: node.totalPurchaseAmount,
                  hasActiveFunded: node.hasActiveFunded,
                  hasActiveSelfCapitalDeposit: node.hasActiveSelfCapitalDeposit,
                  selfCapitalDepositAmount: node.selfCapitalDepositAmount,
                  accountBalance: node.accountBalance,
                });
              } else {
                supaUsers[existingIdx] = {
                  ...supaUsers[existingIdx],
                  hasActiveFunded:
                    supaUsers[existingIdx].hasActiveFunded || node.hasActiveFunded,
                  hasActiveSelfCapitalDeposit:
                    supaUsers[existingIdx].hasActiveSelfCapitalDeposit ||
                    node.hasActiveSelfCapitalDeposit,
                  selfCapitalDepositAmount: Math.max(
                    Number(supaUsers[existingIdx].selfCapitalDepositAmount || 0),
                    Number(node.selfCapitalDepositAmount || 0)
                  ),
                  accountBalance: Math.max(
                    Number((supaUsers[existingIdx] as any).accountBalance || 0),
                    Number(node.accountBalance || 0)
                  ),
                };
              }
              if (Array.isArray(node.purchases) && node.purchases.length > 0) {
                for (const np of node.purchases) {
                  collectedPurchases.push({
                    id: np.id,
                    account_id: np.accountId || null,
                    user_id: node.id,
                    package_name: np.name,
                    package_sku: np.sku,
                    package_amount: np.amount,
                    amount: np.amount,
                    account_type: np.accountType || 'challenge',
                    status: np.status || 'completed',
                    created_at: np.createdAt,
                  });
                }
              } else if (node.latestPurchase) {
                collectedPurchases.push({
                  id: node.latestPurchase.id,
                  account_id: node.latestPurchase.accountId || null,
                  user_id: node.id,
                  package_name: node.latestPurchase.name,
                  package_sku: node.latestPurchase.sku,
                  package_amount: node.latestPurchase.amount,
                  amount: node.latestPurchase.amount,
                  account_type: node.latestPurchase.accountType || 'challenge',
                  status: node.latestPurchase.status || 'completed',
                });
              }
            }
          }
          if (Array.isArray(dashRes.stats.recentCommissions)) {
            for (const rc of dashRes.stats.recentCommissions) {
              if (!rc) continue;
              const commId = String(rc.id || `RC-${rc.referred_user_id}-${rc.created_at || ''}`);
              if (!collectedCommissions.some((c) => String(c.id) === commId)) {
                collectedCommissions.push({
                  id: commId,
                  referrerId: String(rc.referrer_id || userId || ''),
                  referredUserId: String(rc.referred_user_id || ''),
                  referredUserName: rc.referred_name || rc.referred_user_name || 'Trader',
                  referredUserEmail: rc.referred_email || rc.referred_user_email || '',
                  level: (Number(rc.level || rc.tier_level) === 2 ? 2 : Number(rc.level || rc.tier_level) === 3 ? 3 : 1) as 1 | 2 | 3,
                  commissionType: rc.source_type === 'withdrawal' ? 'withdrawal' : 'package',
                  packageName: rc.package_name || 'Challenge Package',
                  packagePrice: Number(rc.base_amount || 0),
                  commissionRate: Number(rc.commission_rate ?? rc.rate ?? 0),
                  commissionAmount: Number(rc.commission_amount || 0),
                  status: rc.status === 'pending' ? 'pending' : 'paid',
                  createdAt: rc.created_at ? new Date(Number(rc.created_at) || rc.created_at).toISOString() : new Date().toISOString(),
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
        const sfSummary = computeSelfFundedSummary(detailedRows);
        const activeFundedCount = mergedTree.filter((u) => u.hasActiveFunded).length;
        const activeCombinedTradersCount = countCombinedActiveReferrals(mergedTree);
        onTurnoverStatsLoaded({
          totalRegisteredReferrals: sfSummary.totalRegisteredReferrals,
          activeDepositedCount: sfSummary.activeDepositedCount,
          completedTradersCount: sfSummary.activeDepositedCount,
          totalTurnover: sfSummary.totalTurnover,
          totalTurnoverCommission: sfSummary.totalTurnoverCommission,
          currentRatePercent: sfSummary.tierStatus.currentRatePercent,
          activeFundedCount,
          activeCombinedTradersCount,
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

  // Aggregate summary metrics for the Quotex Referral Table (strictly separates Total Registered vs Active Deposited Accounts)
  const detailSummary = useMemo(() => {
    const sfAll = computeSelfFundedSummary(liveReferralDetails);
    const filteredTotals = displayedReferralDetails.reduce(
      (acc, r) => ({
        balance: acc.balance + r.accountBalance,
        bonus: acc.bonus + r.bonusAmount,
        turnover: acc.turnover + r.totalTradeTurnover,
        commission: acc.commission + r.commissionEarned,
      }),
      { balance: 0, bonus: 0, turnover: 0, commission: 0 }
    );
    return {
      totalRegisteredReferrals: sfAll.totalRegisteredReferrals,
      activeDepositedCount: sfAll.activeDepositedCount,
      completedCount: sfAll.activeDepositedCount,
      totalBalance: Number(filteredTotals.balance.toFixed(2)),
      totalBonus: Number(filteredTotals.bonus.toFixed(2)),
      totalTurnover: Number(filteredTotals.turnover.toFixed(2)),
      totalTurnoverCommission: Number(filteredTotals.commission.toFixed(2)),
      tierStatus: sfAll.tierStatus,
    };
  }, [displayedReferralDetails, liveReferralDetails]);

  // Strict Active Logic for Funded Network Tree: filter out empty $0 registered accounts
  const activeNetworkNodes = useMemo(() => {
    return network.filter((u) => {
      const items = Array.isArray(u.purchases) && u.purchases.length > 0
        ? u.purchases
        : u.latestPurchase
        ? [u.latestPurchase]
        : [];
      const hasAnyActivePurchasedAccount = items.some(
        (p) => Number(p.amount) > 0 && isPurchaseOrAccountActive(p.status)
      );
      return Boolean(
        u.hasActiveFunded || u.hasActiveSelfCapitalDeposit || hasAnyActivePurchasedAccount
      );
    });
  }, [network]);

  // Strictly count users who hold active purchased challenge accounts (for Funded Tier & Level badges)
  const activeFundedOnlyNodes = useMemo(() => {
    return network.filter((u) => Boolean(u.hasActiveFunded));
  }, [network]);

  const filteredNetwork = useMemo(() => {
    if (levelFilter === 'all') return activeNetworkNodes;
    return activeNetworkNodes.filter((u) => u.level === levelFilter);
  }, [activeNetworkNodes, levelFilter]);

  const paginatedNetwork = useMemo(() => {
    return paginateItems(filteredNetwork, currentPage, pageSize);
  }, [filteredNetwork, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [levelFilter, activeNetworkNodes.length]);

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
              <strong className="text-[#0ecb81]">5%</strong> (first 200 active deposited traders) or{' '}
              <strong className="text-amber-400">7%</strong> (201st active deposited trader onwards) turnover commission. Empty registrations ($0 deposit) do not count toward the 200-trader tier limit.
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
          <div
            data-testid="self-funded-tier-progression-card"
            className="p-3.5 rounded-2xl bg-[#111726] border border-white/10"
          >
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Active Deposited Accounts</span>
              <Award className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div
              data-testid="self-funded-active-deposited-count"
              className="text-lg font-black text-white font-mono"
            >
              {detailSummary.activeDepositedCount}{' '}
              <span className="text-xs font-normal text-slate-400">/ {SELF_FUNDED_TURNOVER_THRESHOLD}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-slate-400">Total Registered Referrals:</span>
              <span
                data-testid="self-funded-total-registered-count"
                className="font-bold text-slate-200"
              >
                {detailSummary.totalRegisteredReferrals}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#070a10] overflow-hidden mt-2 border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-[#0ecb81] to-amber-400 transition-all duration-300"
                style={{ width: `${detailSummary.tierStatus.progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">
              {detailSummary.tierStatus.is7PercentUnlocked
                ? '✓ 7% Turnover Rate Unlocked (201+ Active Deposits)'
                : `${detailSummary.tierStatus.remainingToUpgrade} more active self-capital deposits for 7%`}
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
                const isActiveDeposit = row.hasActiveSelfCapitalDeposit === true;
                return (
                  <div
                    key={row.id}
                    data-testid={`referral-detail-card-${row.referredUserId}`}
                    className="p-4 rounded-2xl bg-[#111726] border border-white/10 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isActiveDeposit
                                ? 'bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30'
                                : 'bg-white/10 text-slate-400'
                            }`}
                          >
                            {isActiveDeposit && row.traderIndex > 0 ? `#${row.traderIndex}` : 'REG'}
                          </span>
                          <span className="text-sm font-black text-white">{row.referralName}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>ID: <span className="text-slate-200 font-semibold">{row.referralCodeOrId}</span></span>
                          <span>•</span>
                          <span className={isActiveDeposit ? 'text-[#0ecb81]' : 'text-slate-400'}>
                            {isActiveDeposit
                              ? 'Active Self-Capital Deposit'
                              : row.hasActiveFundedChallenge
                              ? 'Funded Challenge Only'
                              : row.status === 'pending'
                              ? 'Deposit Pending'
                              : 'Registered ($0 Deposit)'}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-black uppercase border ${
                          !isActiveDeposit
                            ? 'bg-slate-800/70 text-slate-300 border-white/10'
                            : isUpgraded7
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-[#0ecb81]/15 text-[#0ecb81] border-[#0ecb81]/30'
                        }`}
                      >
                        {isActiveDeposit ? `${ratePercent}% Turnover Tier` : 'Not Deposited'}
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
                    const isActiveDeposit = row.hasActiveSelfCapitalDeposit === true;
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
                              className={`w-8 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                                !isActiveDeposit
                                  ? 'bg-slate-800 text-slate-400 border border-white/10'
                                  : isUpgraded7
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/30'
                              }`}
                            >
                              {isActiveDeposit && row.traderIndex > 0 ? `#${row.traderIndex}` : 'REG'}
                            </span>
                            <div>
                              <div className="font-bold text-white font-sans text-sm leading-tight flex items-center gap-2">
                                <span>{row.referralName}</span>
                                {Number(row.accountCount || 0) > 1 && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30 text-[10px] font-mono font-bold">
                                    {row.accountCount} Accounts
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                                <span>{row.referralCodeOrId}</span>
                                <span className="text-slate-600">•</span>
                                <span
                                  className={
                                    !isActiveDeposit
                                      ? 'text-slate-400'
                                      : isUpgraded7
                                      ? 'text-amber-300'
                                      : 'text-[#0ecb81]'
                                  }
                                >
                                  {!isActiveDeposit
                                    ? row.hasActiveFundedChallenge
                                      ? 'Challenge Only (No Self Deposit)'
                                      : row.status === 'pending'
                                      ? 'Self-Deposit Pending'
                                      : 'Registered ($0 Deposit)'
                                    : isUpgraded7
                                    ? 'Active #201+ (7% Tier)'
                                    : 'Active #1–#200 (5% Tier)'}
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
                                !isActiveDeposit
                                  ? 'bg-slate-800 text-slate-400 border-white/10'
                                  : isUpgraded7
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-[#0ecb81]/15 text-[#0ecb81] border-[#0ecb81]/30'
                              }`}
                            >
                              {isActiveDeposit ? `${ratePercent}% Rate` : '0% (No Deposit)'}
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
          2. MULTI-LEVEL FUNDED CHALLENGE & ACTIVE WALLET NETWORK TREE (L1, L2, L3)
         ===================================================================== */}
      <div
        data-testid="referral-network-tree"
        className="p-5 sm:p-6 rounded-3xl bg-[#0b0f19] border border-white/10"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black text-white font-mono flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#ff8800]" />
              <span>Full Referred Network Tree (L1, L2, L3 Active Accounts)</span>
            </h3>
            <p className="text-xs text-slate-300 font-mono mt-0.5">
              Strictly filters active purchased Challenge &amp; Self-Funded accounts ({activeFundedOnlyNodes.length} Active Funded Challenge Buyers • {network.length} Total Registered)
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[#111726] p-1 rounded-xl border border-white/10 text-[10px] font-mono">
              {(['all', 1, 2, 3] as const).map((lvl) => {
                const count =
                  lvl === 'all'
                    ? activeNetworkNodes.length
                    : activeNetworkNodes.filter((u) => u.level === lvl).length;
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
            <span
              data-testid="network-tree-summary-badge"
              className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-slate-300"
            >
              {filteredNetwork.length} Active {filteredNetwork.length === 1 ? 'Trader' : 'Traders'} ·{' '}
              {filteredNetwork.reduce((acc, u) => {
                const activeAccts = (u.purchases || []).filter(
                  (p) => Number(p.amount) > 0 && isPurchaseOrAccountActive(p.status)
                );
                return acc + (activeAccts.length > 0 ? activeAccts.length : u.accountCount || 0);
              }, 0)}{' '}
              Purchased Accounts/Wallets
            </span>
          </div>
        </div>

        {activeNetworkNodes.length === 0 ? (
          <div
            data-testid="referral-network-empty-state"
            className="text-center py-10 px-4 rounded-2xl bg-[#111726]/70 border border-white/5 font-mono"
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#ff8800]/10 border border-[#ff8800]/20 flex items-center justify-center">
              <Users className="w-7 h-7 text-[#ff8800]" />
            </div>
            <h4 className="text-base font-black text-white mb-2">
              {network.length > 0
                ? `${network.length} Registered Referrals — No Active Purchased Accounts Yet`
                : 'No Active Funded Challenge Referrals Yet'}
            </h4>
            <p className="text-xs text-slate-300 max-w-md mx-auto mb-6 leading-relaxed">
              Only referred traders with an active purchased Challenge or Self-Funded Deposit appear in the active network tree. Share your referral link to earn up to{' '}
              <strong className="text-white">15%</strong> on challenge purchases,{' '}
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
            No active downline traders found matching Level {levelFilter}.
          </div>
        ) : (
          <div>
            {/* Mobile Card Layout (< md) */}
            <div className="md:hidden space-y-3" data-testid="referral-network-tree-mobile">
              {paginatedNetwork.map((u) => {
                const rawPurchases =
                  Array.isArray(u.purchases) && u.purchases.length > 0
                    ? u.purchases.filter((p) => Number(p.amount) > 0)
                    : u.latestPurchase && Number(u.latestPurchase.amount) > 0
                    ? [u.latestPurchase]
                    : [];
                const activePurchases = rawPurchases.filter((p) =>
                  isPurchaseOrAccountActive(p.status)
                );
                const displayPurchases = activePurchases.length > 0 ? activePurchases : rawPurchases;
                const hasPurchase = displayPurchases.length > 0;
                const totalAmt = hasPurchase
                  ? displayPurchases.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                  : 0;
                const displayAmt = hasPurchase
                  ? formatPurchaseAmountDisplay(totalAmt)
                  : '$0';

                return (
                  <div
                    key={u.id}
                    data-testid={`network-tree-mobile-card-${u.id}`}
                    className="p-3.5 rounded-2xl bg-[#111726] border border-white/10 font-mono text-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 font-bold text-white">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              u.level === 1
                                ? 'bg-[#ff8800]'
                                : u.level === 2
                                ? 'bg-blue-400'
                                : 'bg-purple-400'
                            }`}
                          />
                          <span className="truncate">{u.fullName}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
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
                          {displayPurchases.length > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30 text-[9px] font-black">
                              {displayPurchases.length} Wallets/Accts
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-slate-400 uppercase">Volume</div>
                        <div className="text-sm font-black text-emerald-400 tabular-nums">
                          {displayAmt}
                        </div>
                      </div>
                    </div>

                    {hasPurchase ? (
                      <div className="space-y-1.5 pt-2 border-t border-white/10">
                        {displayPurchases.map((pur, idx) => {
                          const label = formatPurchasedPackageLabel(pur.name, pur.sku, pur.amount);
                          const isSelf = isSelfFundedAccountOrDeposit(pur);
                          const isChallenge = isFundedChallengeItem(pur);
                          const rawStatus = String(pur.status || 'active').trim();
                          const statusLower = rawStatus.toLowerCase();
                          const isActiveItem = isPurchaseOrAccountActive(rawStatus);
                          const displayStatus =
                            statusLower === 'completed'
                              ? 'Completed'
                              : statusLower === 'active'
                              ? 'Active'
                              : statusLower === 'funded'
                              ? 'Funded'
                              : statusLower === 'passed'
                              ? 'Passed'
                              : statusLower === 'pending'
                              ? 'Pending'
                              : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

                          return (
                            <div
                              key={pur.id || pur.accountId || `${u.id}-mob-${idx}`}
                              className="p-2 rounded-xl bg-[#0b0f19] border border-white/10 flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase border ${
                                    isSelf
                                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                      : isChallenge
                                      ? 'bg-[#ff8800]/15 text-[#ffaa00] border-[#ff8800]/30'
                                      : 'bg-white/10 text-slate-300 border-white/15'
                                  }`}
                                >
                                  {isSelf ? 'Self-Funded' : 'Challenge'}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase border ${
                                    isActiveItem
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : statusLower === 'pending'
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  }`}
                                >
                                  {displayStatus}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-white truncate">
                                  {label !== 'No Purchase' ? label : pur.name}
                                </span>
                                <span className="text-xs text-emerald-400 font-black tabular-nums shrink-0">
                                  {formatPurchaseAmountDisplay(pur.amount)}
                                </span>
                              </div>
                              {pur.accountId && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  ID: {pur.accountId}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-slate-400 pt-1">No Active Account</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table Layout (>= md) */}
            <div
              style={{ touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
              className="hidden md:block overflow-x-auto overflow-y-visible touch-pan-x touch-pan-y"
            >
              <table
                data-testid="referral-network-tree-table"
                className="w-full text-left font-mono text-xs"
              >
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase text-slate-300">
                    <th className="py-3 pl-2">Trader Name</th>
                    <th className="py-3">Level</th>
                    <th className="py-3">Purchased Accounts / Wallets (Type · Amount · Status)</th>
                    <th className="py-3 text-right pr-2">Total Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedNetwork.map((u) => {
                    const rawPurchases =
                      Array.isArray(u.purchases) && u.purchases.length > 0
                        ? u.purchases.filter((p) => Number(p.amount) > 0)
                        : u.latestPurchase && Number(u.latestPurchase.amount) > 0
                        ? [u.latestPurchase]
                        : [];
                    const activePurchases = rawPurchases.filter((p) =>
                      isPurchaseOrAccountActive(p.status)
                    );
                    const displayPurchases = activePurchases.length > 0 ? activePurchases : rawPurchases;
                    const hasPurchase = displayPurchases.length > 0;
                    const totalAmt = hasPurchase
                      ? displayPurchases.reduce((sum, p) => sum + Number(p.amount || 0), 0)
                      : 0;
                    const displayAmt = hasPurchase
                      ? formatPurchaseAmountDisplay(totalAmt)
                      : '$0';

                    return (
                      <tr
                        key={u.id}
                        data-testid={`network-tree-row-${u.id}`}
                        className="hover:bg-white/5 align-top"
                      >
                        <td className="py-3 pl-2 font-bold text-white">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                u.level === 1
                                  ? 'bg-[#ff8800]'
                                  : u.level === 2
                                  ? 'bg-blue-400'
                                  : 'bg-purple-400'
                              }`}
                            />
                            <span>{u.fullName}</span>
                            {displayPurchases.length > 1 && (
                              <span
                                data-testid={`network-tree-multi-count-${u.id}`}
                                className="px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/30 text-[9px] font-black"
                              >
                                {displayPurchases.length} Wallets/Accts
                              </span>
                            )}
                          </div>
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
                          {hasPurchase ? (
                            <div className="space-y-1.5">
                              {displayPurchases.map((pur, idx) => {
                                const label = formatPurchasedPackageLabel(pur.name, pur.sku, pur.amount);
                                const isSelf = isSelfFundedAccountOrDeposit(pur);
                                const isChallenge = isFundedChallengeItem(pur);
                                const rawStatus = String(pur.status || 'active').trim();
                                const statusLower = rawStatus.toLowerCase();
                                const isActiveItem = isPurchaseOrAccountActive(rawStatus);
                                const displayStatus =
                                  statusLower === 'completed'
                                    ? 'Completed'
                                    : statusLower === 'active'
                                    ? 'Active'
                                    : statusLower === 'funded'
                                    ? 'Funded'
                                    : statusLower === 'passed'
                                    ? 'Passed'
                                    : statusLower === 'pending'
                                    ? 'Pending'
                                    : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

                                return (
                                  <div
                                    key={pur.id || pur.accountId || `${u.id}-${idx}`}
                                    data-testid={`network-tree-item-${u.id}-${idx}`}
                                    className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#111726] border border-white/10"
                                  >
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase border ${
                                        isSelf
                                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                          : isChallenge
                                          ? 'bg-[#ff8800]/15 text-[#ffaa00] border-[#ff8800]/30'
                                          : 'bg-white/10 text-slate-300 border-white/15'
                                      }`}
                                    >
                                      {isSelf ? 'Self-Funded' : 'Challenge'}
                                    </span>
                                    <span className="font-bold text-white">
                                      {label !== 'No Purchase' ? label : pur.name}
                                    </span>
                                    <span className="text-[11px] text-emerald-400 font-black">
                                      {formatPurchaseAmountDisplay(pur.amount)}
                                    </span>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase border ${
                                        isActiveItem
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                          : statusLower === 'pending'
                                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                      }`}
                                    >
                                      {displayStatus}
                                    </span>
                                    {pur.accountId && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
                                        {pur.accountId}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-slate-400">No Active Account</span>
                          )}
                        </td>
                        <td className="py-3 text-right pr-2 font-bold text-emerald-400 tabular-nums">
                          {displayAmt}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <TablePagination
              currentPage={currentPage}
              totalItems={filteredNetwork.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[5, 10, 20, 50]}
              itemLabel="active traders"
              testIdPrefix="affiliate-tree-pagination"
            />
          </div>
        )}
      </div>
    </div>
  );
};
