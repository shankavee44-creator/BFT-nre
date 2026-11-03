import React, { useState, useEffect, useCallback } from 'react';
import { Users, Copy, Check, Share2, Sparkles } from 'lucide-react';
import { ReferredUser, ReferralRecord } from '../types';
import { supabase } from '../utils/supabase';
import { apiGetAffiliateDashboard } from '../utils/apiClient';
import {
  buildReferredNetworkTree,
  formatPurchasedPackageLabel,
  formatPurchaseAmountDisplay,
} from '../utils/affiliateEngine';

interface ReferralNetworkListProps {
  userId: string;
  userEmail?: string;
  referrals?: ReferralRecord[];
  referralLink?: string;
  referralCode?: string;
  onNetworkLoaded?: (count: number) => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ReferralNetworkList: React.FC<ReferralNetworkListProps> = ({
  userId,
  userEmail,
  referrals = [],
  referralLink,
  referralCode,
  onNetworkLoaded,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [network, setNetwork] = useState<ReferredUser[]>(() =>
    userId
      ? buildReferredNetworkTree({
          sponsorId: userId,
          referralsList: referrals.length > 0 ? referrals : undefined,
        })
      : []
  );

  const effectiveReferralCode =
    referralCode ||
    (userId ? `BFT-${String(userId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()}` : 'BFT-TRADER');
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

  const fetchNetwork = useCallback(async () => {
    try {
      let targetUuid: string | null = null;
      if (userId && UUID_REGEX.test(userId)) {
        targetUuid = userId;
      } else {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
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

      if (targetUuid) {
        // L1 Direct Referrals
        const { data: l1, error: l1Err } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('referred_by', targetUuid);

        if (!l1Err && Array.isArray(l1) && l1.length > 0) {
          const l1Users: ReferredUser[] = l1.map((u: any) => ({
            id: u.id,
            fullName: u.full_name || 'Trader',
            level: 1 as const,
          }));
          supaUsers.push(...l1Users);

          // L2 Sub-Referrals
          const l1Ids = l1Users.map((u) => u.id).filter((id) => UUID_REGEX.test(id));
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

          // Also check referral_commissions for package purchases by these referred users
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
    } catch (err) {
      console.warn('fetchNetwork notice:', err);
    }
  }, [userId, userEmail, referrals, onNetworkLoaded]);

  useEffect(() => {
    fetchNetwork();
    const channel = supabase
      .channel(`realtime:network:${userId || 'default'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchNetwork)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_purchases' }, fetchNetwork)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_commissions' }, fetchNetwork)
      .subscribe();

    const handleLocalUpdate = () => {
      fetchNetwork();
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
  }, [fetchNetwork, userId]);

  return (
    <div
      data-testid="referral-network-tree"
      className="p-5 sm:p-6 rounded-3xl bg-[#111115] border border-white/10 mt-8"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-black text-white font-mono flex items-center gap-2">
          <Users className="w-5 h-5 text-[#ff8800]" />
          <span>Full Referred Network Tree (L1, L2, L3)</span>
        </h3>
        <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-slate-400">
          {network.length} {network.length === 1 ? 'Trader' : 'Traders'}
        </span>
      </div>

      {network.length === 0 ? (
        <div
          data-testid="referral-network-empty-state"
          className="text-center py-10 px-4 rounded-2xl bg-[#0a0a0e] border border-white/5 font-mono"
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#ff8800]/10 border border-[#ff8800]/20 flex items-center justify-center">
            <Users className="w-7 h-7 text-[#ff8800]" />
          </div>
          <h4 className="text-base font-black text-white mb-2">No Referrals Yet</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
            Your affiliate network is currently empty. Share your unique referral link to onboard traders
            and start earning up to <strong className="text-white">15%</strong> commissions on challenge purchases plus{' '}
            <strong className="text-white">10%</strong> royalties on profit payouts.
          </p>

          <div className="max-w-md mx-auto p-2 rounded-2xl bg-[#111115] border border-white/10 flex items-center gap-2 mb-4">
            <div className="flex-1 px-3 py-2 text-left text-xs text-slate-300 font-mono truncate select-all">
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

          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-500">
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L1 Direct: 10%–15%</span>
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L2 Sub: 5%–8%</span>
            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">L3 Network: 2%–5%</span>
            <span className="px-2 py-0.5 rounded bg-[#ff8800]/10 border border-[#ff8800]/20 text-[#ffaa00]">
              Payout Bonus: 8%–10%
            </span>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase text-slate-400">
                <th className="py-3 pl-2">Trader Name</th>
                <th className="py-3">Level</th>
                <th className="py-3">Status / Purchase</th>
                <th className="py-3 text-right pr-2">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {network.map((u) => {
                const hasPurchase = Boolean(u.latestPurchase && Number(u.latestPurchase.amount) > 0);
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
                    <td className="py-3 pl-2 font-bold text-white">{u.fullName}</td>
                    <td className="py-3 text-slate-300">Level {u.level}</td>
                    <td className="py-3 text-slate-300">
                      {hasPurchase && displayPkg !== 'No Purchase' ? (
                        <span className="font-bold text-[#ff8800]">{displayPkg}</span>
                      ) : (
                        <span className="text-slate-500">No Purchase</span>
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
        </div>
      )}
    </div>
  );
};

