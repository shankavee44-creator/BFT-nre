import React, { useState, useEffect } from 'react';
import {
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  FileText,
} from 'lucide-react';
import { apiGetDepositHistory } from '../utils/apiClient';
import { supabase } from '../utils/supabase';

interface DepositHistoryTableProps {
  userId?: string;
  accountId?: string;
  onRefreshRequested?: () => void;
}

export const DepositHistoryTable: React.FC<DepositHistoryTableProps> = ({
  userId,
  accountId,
}) => {
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch from backend API
      const res = await apiGetDepositHistory({ userId, accountId });
      let records: any[] = [];
      if (res && res.ok) {
        records = res.cryptoDeposits || res.deposits || res.transactions || [];
      }

      // 2. Fetch from Supabase for any newly created deposits if userId is a valid UUID
      const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
      if (supabase && isUuid) {
        try {
          const { data, error } = await supabase
            .from('crypto_deposits')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(30);

          if (!error && Array.isArray(data)) {
            const combinedMap = new Map<string, any>();
            // Add DB records first
            for (const r of records) {
              combinedMap.set(String(r.id), r);
            }
            // Merge Supabase rows
            for (const s of data) {
              combinedMap.set(String(s.id), {
                ...combinedMap.get(String(s.id)),
                ...s,
              });
            }
            records = Array.from(combinedMap.values());
          }
        } catch {}
      }

      // Sort by newest created_at
      records.sort((a, b) => {
        const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
        const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setHistoryItems(records);
    } catch (err) {
      console.warn('Error loading deposit history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [userId, accountId]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (val: any) => {
    if (!val) return 'Just now';
    try {
      const d = typeof val === 'number' ? new Date(val) : new Date(val);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(val);
    }
  };

  const renderStatusBadge = (rawStatus: string) => {
    const s = String(rawStatus || 'pending').toLowerCase();
    if (s === 'completed' || s === 'finished' || s === 'active' || s === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          <span>Finished</span>
        </span>
      );
    }
    if (s === 'confirming' || s === 'confirmed' || s === 'sending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Confirming</span>
        </span>
      );
    }
    if (s === 'failed' || s === 'expired' || s === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <XCircle className="w-3 h-3" />
          <span className="capitalize">{s}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
        <Clock className="w-3 h-3" />
        <span>Pending</span>
      </span>
    );
  };

  return (
    <div className="space-y-4" data-testid="deposit-history-view">
      <div className="flex items-center justify-between pb-2 border-b border-[#2d374d]">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#00e5ff]" />
            <span>Deposit & Payment History</span>
          </h3>
          <p className="text-xs text-slate-400">
            Real-time record of all generated deposit invoices, crypto transactions, and status updates.
          </p>
        </div>

        <button
          type="button"
          data-testid="refresh-deposit-history-btn"
          disabled={isLoading}
          onClick={fetchHistory}
          className="px-3 py-1.5 rounded bg-[#2a364f] hover:bg-[#344463] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#00e5ff]" />
          <span className="text-xs">Loading transaction records...</span>
        </div>
      ) : historyItems.length === 0 ? (
        <div className="py-12 text-center text-slate-400 bg-[#19202f] rounded-lg border border-[#263248]">
          <Clock className="w-8 h-8 mx-auto text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-slate-300">No deposit transactions yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Generated invoices and confirmed crypto deposits will be displayed here in real time.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#2d374d] bg-[#1a2130]">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#141a26] text-slate-400 font-semibold border-b border-[#2d374d]">
              <tr>
                <th className="py-3 px-3.5">Date / Time</th>
                <th className="py-3 px-3.5">Reference ID</th>
                <th className="py-3 px-3.5">Gateway / Method</th>
                <th className="py-3 px-3.5">Amount</th>
                <th className="py-3 px-3.5">Destination Address</th>
                <th className="py-3 px-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#263147]">
              {historyItems.map((item, idx) => {
                const orderRef = item.id || item.order_id || `DEP-${idx}`;
                const amountVal = Number(item.amount || item.package_amount || 0);
                const gatewayLabel = item.package_name || item.network || (item.tx_hash?.includes('NOWPAYMENTS') ? 'NOWPayments Gateway' : 'Commercial Bank');
                const walletAddr = item.wallet_address || item.address || '—';

                return (
                  <tr key={`${orderRef}-${idx}`} className="hover:bg-[#20293c] transition-colors">
                    <td className="py-3 px-3.5 whitespace-nowrap text-slate-400">
                      {formatDate(item.created_at || item.createdAt)}
                    </td>
                    <td className="py-3 px-3.5 font-mono text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[120px]" title={orderRef}>
                          {orderRef}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(orderRef, `ref-${orderRef}`)}
                          className="text-slate-400 hover:text-white p-0.5"
                          title="Copy reference"
                        >
                          {copiedId === `ref-${orderRef}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-medium text-white max-w-[160px] truncate" title={gatewayLabel}>
                      {gatewayLabel}
                    </td>
                    <td className="py-3 px-3.5 font-bold font-mono text-emerald-400 whitespace-nowrap">
                      ${amountVal.toFixed(2)} USD
                    </td>
                    <td className="py-3 px-3.5 font-mono text-[11px] text-slate-400 max-w-[140px] truncate">
                      {walletAddr !== '—' ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate" title={walletAddr}>
                            {walletAddr}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(walletAddr, `addr-${idx}`)}
                            className="text-slate-400 hover:text-white p-0.5 shrink-0"
                            title="Copy address"
                          >
                            {copiedId === `addr-${idx}` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-3.5 whitespace-nowrap">
                      {renderStatusBadge(item.status)}
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
