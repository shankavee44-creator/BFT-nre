import React, { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
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
  onNetworkLoaded?: (count: number) => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ReferralNetworkList: React.FC<ReferralNetworkListProps> = ({
  userId,
  userEmail,
  referrals = [],
  onNetworkLoaded,
}) => {
  const [network, setNetwork] = useState<ReferredUser[]>(() =>
    buildReferredNetworkTree({
      sponsorId: userId || 'usr_bft_001',
      referralsList: referrals.length > 0 ? referrals : undefined,
    })
  );

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
      className="p-5 rounded-3xl bg-[#111115] border border-white/10 mt-8"
    >
      <h3 className="text-lg font-black text-white font-mono mb-4 flex items-center gap-2">
        <Users className="w-5 h-5 text-[#ff8800]" />
        Full Referred Network Tree (L1, L2, L3)
      </h3>
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
    </div>
  );
};

