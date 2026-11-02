import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { ReferredUser } from '../types';
import { supabase } from '../utils/supabase';

interface ReferralNetworkListProps {
  userId: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ReferralNetworkList: React.FC<ReferralNetworkListProps> = ({ userId }) => {
  const [network, setNetwork] = useState<ReferredUser[]>([]);

  async function fetchNetwork() {
    try {
      let targetUuid: string | null = null;
      if (userId && UUID_REGEX.test(userId)) {
        targetUuid = userId;
      } else {
        const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        if (authData?.user?.id && UUID_REGEX.test(authData.user.id)) {
          targetUuid = authData.user.id;
        }
      }

      if (!targetUuid) {
        setNetwork([]);
        return;
      }

      // L1
      const { data: l1, error: l1Err } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('referred_by', targetUuid);

      if (l1Err || !Array.isArray(l1) || l1.length === 0) {
        setNetwork([]);
        return;
      }

      const l1Users = l1.map(u => ({ id: u.id, fullName: u.full_name || 'Trader', level: 1 as const }));

      // L2
      const l1Ids = l1Users.map(u => u.id).filter(id => UUID_REGEX.test(id));
      let l2Users: ReferredUser[] = [];
      if (l1Ids.length > 0) {
        const { data: l2 } = await supabase
          .from('profiles')
          .select('id, full_name, referred_by')
          .in('referred_by', l1Ids);
        if (Array.isArray(l2) && l2.length > 0) {
          l2Users = l2.map(u => ({ id: u.id, fullName: u.full_name || 'Trader', level: 2 as const }));
        }
      }

      // L3
      const l3Users: ReferredUser[] = [];
      const l2Ids = l2Users.map(u => u.id).filter(id => UUID_REGEX.test(id));
      if (l2Ids.length > 0) {
        const { data: l3 } = await supabase
          .from('profiles')
          .select('id, full_name, referred_by')
          .in('referred_by', l2Ids);
        if (Array.isArray(l3) && l3.length > 0) {
          l3Users.push(...l3.map(u => ({ id: u.id, fullName: u.full_name || 'Trader', level: 3 as const })));
        }
      }

      const allUsers = [...l1Users, ...l2Users, ...l3Users];
      const allIds = allUsers.map(u => u.id).filter(id => UUID_REGEX.test(id));

      if (allIds.length === 0) {
        setNetwork(allUsers);
        return;
      }

      // Purchases
      const { data: purchases } = await supabase
        .from('user_purchases')
        .select('*')
        .in('user_id', allIds);

      const networkWithPurchases = allUsers.map(u => {
        const purchase = (purchases || []).find((p: any) => p.user_id === u.id);
        return {
          ...u,
          latestPurchase: purchase
            ? {
                name: purchase.package_name || 'Challenge Package',
                sku: purchase.package_sku || 'BFT-PKG',
                amount: Number(purchase.package_amount ?? purchase.amount ?? 0),
              }
            : undefined
        };
      });
      setNetwork(networkWithPurchases);
    } catch (err) {
      console.warn('fetchNetwork notice:', err);
    }
  }

  useEffect(() => {
    fetchNetwork();
    const channel = supabase.channel('realtime:network')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchNetwork)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_purchases' }, fetchNetwork)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <div className="p-5 rounded-3xl bg-[#111115] border border-white/10 mt-8">
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
              {network.map(u => (
                <tr key={u.id} className="hover:bg-white/5">
                  <td className="py-3 pl-2 font-bold text-white">{u.fullName}</td>
                  <td className="py-3 text-slate-300">Level {u.level}</td>
                  <td className="py-3 text-slate-300">
                    {u.latestPurchase ? (
                      <>
                        <span className="font-black text-[#ff8800]">{u.latestPurchase.sku}</span>
                        <span className="text-slate-500 ml-1">({u.latestPurchase.name})</span>
                      </>
                    ) : 'No Purchase'}
                  </td>
                  <td className="py-3 text-right pr-2 font-bold text-emerald-400">
                    {u.latestPurchase ? `$${Number(u.latestPurchase.amount).toFixed(2)}` : '$0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
};
