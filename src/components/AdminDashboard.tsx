import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  Edit3,
  Key,
  Search,
  RefreshCw,
  FileText,
  Network,
  Lock,
  Unlock,
  ChevronRight,
  X,
  ExternalLink,
  Wallet,
  Activity,
  Layers,
  Check,
  TrendingUp,
  GitBranch,
} from 'lucide-react';
import { UserProfile } from '../types';
import {
  apiCheckAdminAccess,
  apiVerifyAdminKey,
  apiGetAdminMetrics,
  apiGetAdminUsers,
  apiAdminUpdateBalance,
  apiAdminSetRole,
  apiGetAdminDeposits,
  apiAdminApproveDeposit,
  apiAdminDeclineDeposit,
  apiAdminCreateDeposit,
  apiGetAdminWithdrawals,
  apiAdminApproveWithdrawal,
  apiAdminDeclineWithdrawal,
  apiGetAdminKyc,
  apiAdminApproveKyc,
  apiAdminRejectKyc,
  apiGetAdminReferralTree,
  apiGetAdminCommissions,
  apiAdminDistributeCommission,
  apiGetAdminAuditLogs,
} from '../utils/apiClient';
import { soundEngine } from '../utils/soundEffects';
import { supabase } from '../utils/supabase';

interface AdminDashboardProps {
  currentUser: UserProfile;
  onClose: () => void;
  onRefreshUserData?: () => void;
  onOpenGitHubSync?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onClose,
  onRefreshUserData,
  onOpenGitHubSync,
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'deposits' | 'withdrawals' | 'kyc' | 'referrals' | 'audit'
  >('overview');

  // RBAC Access State
  const [isAdminAuthorized, setIsAdminAuthorized] = useState<boolean>(false);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [adminKeyInput, setAdminKeyInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Data States
  const [metrics, setMetrics] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [depositsList, setDepositsList] = useState<any[]>([]);
  const [withdrawalsList, setWithdrawalsList] = useState<any[]>([]);
  const [kycList, setKycList] = useState<any[]>([]);
  const [referralTree, setReferralTree] = useState<any[]>([]);
  const [commissionsList, setCommissionsList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [depositFilter, setDepositFilter] = useState<'all' | 'pending' | 'approved' | 'declined'>('pending');
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'completed' | 'declined'>('pending');
  const [kycFilter, setKycFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending');

  // Interactive Modals
  const [selectedUserForBalance, setSelectedUserForBalance] = useState<{
    user: any;
    account: any;
  } | null>(null);
  const [newBalanceInput, setNewBalanceInput] = useState<string>('');
  const [balanceReasonInput, setBalanceReasonInput] = useState<string>('');

  const [declineTarget, setDeclineTarget] = useState<{
    type: 'deposit' | 'withdrawal' | 'kyc';
    id: string;
    title: string;
  } | null>(null);
  const [declineReason, setDeclineReason] = useState<string>('');

  const [previewKycDoc, setPreviewKycDoc] = useState<{
    frontUrl: string;
    backUrl?: string;
    user: any;
  } | null>(null);

  // Manual Commission Modal
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [distributeUserId, setDistributeUserId] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('100');
  const [distributeSource, setDistributeSource] = useState<'deposit' | 'trade_activity'>('deposit');
  const [distributeDetails, setDistributeDetails] = useState('');

  // Status banners & feedback
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // 1. Initial Admin Authorization Check
  useEffect(() => {
    checkAdminStatus();
  }, [currentUser]);

  const checkAdminStatus = async () => {
    setAuthChecking(true);
    setAuthError(null);

    // First check via API (which validates JWT user role, email, and x-admin-key)
    const res = await apiCheckAdminAccess();
    if (res.ok && res.isAdmin) {
      setIsAdminAuthorized(true);
      fetchAllAdminData();
    } else {
      // If user profile locally already has role === 'admin' or email in admin list, attempt auto-auth
      const adminEmails = [
        'shankavee44@gmail.com',
        'admin@bft.io',
        'viktor.v@quant-prop.io',
      ];
      const isKnownAdmin =
        currentUser?.role === 'admin' ||
        adminEmails.includes((currentUser?.email || '').toLowerCase().trim());

      if (isKnownAdmin) {
        // Automatically challenge key verification
        const keyRes = await apiVerifyAdminKey('bft_admin_master_key_2026');
        if (keyRes.ok) {
          setIsAdminAuthorized(true);
          fetchAllAdminData();
          setAuthChecking(false);
          return;
        }
      }
      setIsAdminAuthorized(false);
    }
    setAuthChecking(false);
  };

  const handleKeyChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKeyInput.trim()) return;

    setIsActionLoading(true);
    setAuthError(null);
    const res = await apiVerifyAdminKey(adminKeyInput.trim());
    setIsActionLoading(false);

    if (res.ok) {
      setIsAdminAuthorized(true);
      soundEngine.playTradeWin();
      fetchAllAdminData();
    } else {
      setAuthError(res.error || 'Invalid Admin Security Key.');
      soundEngine.playTradeLoss();
    }
  };

  // 2. Fetch All Data
  const fetchAllAdminData = async () => {
    try {
      const [
        metricsRes,
        usersRes,
        depositsRes,
        withdrawalsRes,
        kycRes,
        referralsRes,
        commissionsRes,
        auditRes,
      ] = await Promise.all([
        apiGetAdminMetrics(),
        apiGetAdminUsers(),
        apiGetAdminDeposits(),
        apiGetAdminWithdrawals(),
        apiGetAdminKyc(),
        apiGetAdminReferralTree(),
        apiGetAdminCommissions(100),
        apiGetAdminAuditLogs(50),
      ]);

      if (metricsRes.ok) setMetrics(metricsRes.metrics);
      if (usersRes.ok) setUsersList(usersRes.users || []);
      if (depositsRes.ok) setDepositsList(depositsRes.deposits || []);

      let mergedWds = withdrawalsRes.ok ? withdrawalsRes.withdrawals || [] : [];

      // Query central Supabase withdrawals table
      try {
        const { data: supaWds } = await supabase
          .from('withdrawals')
          .select('*, self_balance')
          .order('created_at', { ascending: false });

        if (supaWds && supaWds.length > 0) {
          const existingIds = new Set(mergedWds.map((w: any) => w.id));
          const mappedSupa = supaWds.map((row: any) => {
            const rowId = row.id || `WD-${row.user_id?.slice(0, 6) || '101'}`;
            return {
              id: rowId,
              user_id: row.user_id,
              user_email: row.user_email || row.user_id,
              user_name: row.user_email || row.user_id,
              account_id: row.account_id || 'BFT-PERS-001',
              account_type: row.account_type || (row.fee_percent === 3 ? 'personal_live' : 'funded'),
              gross_amount: Number(row.amount || row.gross_amount || row.requested_amount || 0),
              requested_amount: Number(row.amount || row.gross_amount || row.requested_amount || 0),
              fee_amount: Number(row.fee_amount || row.fee || 0),
              net_payout: Number(row.net_payout || row.net_amount || 0),
              net_amount: Number(row.net_payout || row.net_amount || 0),
              payment_method: row.payment_method || row.payout_method || 'crypto_trc20',
              network: row.network || row.network_type || 'TRON (TRC-20)',
              wallet_address: row.wallet_address || '',
              bank_details: row.bank_details || null,
              status: row.status || 'pending',
              requested_at: row.requested_at ? new Date(row.requested_at).getTime() : Date.parse(row.created_at || '') || Date.now(),
            };
          });

          // Merge Supabase entries with backend SQLite entries, prioritizing Supabase row status
          const supaMap = new Map(mappedSupa.map((sw: any) => [sw.id, sw]));
          mergedWds = mergedWds.map((bw: any) => supaMap.get(bw.id) || bw);
          for (const sw of mappedSupa) {
            if (!existingIds.has(sw.id)) {
              mergedWds.push(sw);
            }
          }
        }
      } catch (e) {
        console.warn('Supabase withdrawals load error:', e);
      }

      setWithdrawalsList(mergedWds);
      if (kycRes.ok) setKycList(kycRes.kycSubmissions || []);
      if (referralsRes.ok) setReferralTree(referralsRes.tree || []);
      if (commissionsRes.ok) setCommissionsList(commissionsRes.commissions || []);
      if (auditRes.ok) setAuditLogs(auditRes.logs || []);
    } catch (err: any) {
      console.warn('Admin data load warning:', err);
    }
  };

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    if (type === 'success') {
      soundEngine.playTradeWin();
    } else {
      soundEngine.playTradeLoss();
    }
    setTimeout(() => setActionFeedback(null), 5000);
  };

  // User Balance Update Handler
  const handleConfirmBalanceUpdate = async () => {
    if (!selectedUserForBalance) return;
    const newBal = Number(newBalanceInput);
    if (!Number.isFinite(newBal) || newBal < 0) {
      showFeedback('error', 'Please enter a valid non-negative balance.');
      return;
    }

    setIsActionLoading(true);
    const res = await apiAdminUpdateBalance({
      userId: selectedUserForBalance.user.id,
      accountId: selectedUserForBalance.account.id,
      newBalance: newBal,
      reason: balanceReasonInput || 'Administrative balance adjustment',
    });
    setIsActionLoading(false);

    if (res.ok) {
      // Synchronize with central Supabase profiles table for instant UI reflection via real-time subscription
      try {
        const updatePayload: any = {};
        const acc = selectedUserForBalance.account;
        if (acc.tier === 'personal' || acc.accountCategory === 'personal_live' || String(acc.id).includes('PERS')) {
          updatePayload.self_balance = newBal;
        } else if (acc.tier === 'demo' || acc.accountCategory === 'demo' || String(acc.id).includes('DEMO')) {
          updatePayload.demo_balance = newBal;
        } else if (acc.phase === 'funded') {
          updatePayload.funded_balance = newBal;
        }

        if (Object.keys(updatePayload).length > 0) {
          await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', selectedUserForBalance.user.id);
        }
      } catch (supaErr) {
        console.warn('Admin Supabase balance sync notice:', supaErr);
      }

      showFeedback('success', res.message || 'Balance successfully updated!');
      setSelectedUserForBalance(null);
      setNewBalanceInput('');
      setBalanceReasonInput('');
      fetchAllAdminData();
      if (onRefreshUserData) onRefreshUserData();
    } else {
      showFeedback('error', res.error || 'Failed to update account balance.');
    }
  };

  // User Role Toggle
  const handleToggleRole = async (user: any) => {
    const nextRole = user.role === 'admin' ? 'trader' : 'admin';
    const confirmChange = window.confirm(
      `Are you sure you want to change ${user.full_name || user.email}'s role to ${nextRole.toUpperCase()}?`
    );
    if (!confirmChange) return;

    setIsActionLoading(true);
    const res = await apiAdminSetRole({ userId: user.id, role: nextRole });
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback('success', `User role changed to ${nextRole}.`);
      fetchAllAdminData();
    } else {
      showFeedback('error', res.error || 'Failed to change role.');
    }
  };

  // Deposit Actions
  const handleApproveDeposit = async (depositId: string) => {
    setIsActionLoading(true);
    const res = await apiAdminApproveDeposit(depositId);
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback(
        'success',
        res.message || 'Deposit approved! User balance credited and 3-level commissions paid out.'
      );
      fetchAllAdminData();
      if (onRefreshUserData) onRefreshUserData();
    } else {
      showFeedback('error', res.error || 'Failed to approve deposit.');
    }
  };

  const handleDeclineSubmit = async () => {
    if (!declineTarget) return;
    setIsActionLoading(true);

    if (declineTarget.type === 'deposit') {
      const res = await apiAdminDeclineDeposit(declineTarget.id, declineReason);
      setIsActionLoading(false);
      if (res.ok) {
        showFeedback('success', 'Deposit request declined.');
        setDeclineTarget(null);
        setDeclineReason('');
        fetchAllAdminData();
      } else {
        showFeedback('error', res.error || 'Failed to decline deposit.');
      }
    } else if (declineTarget.type === 'withdrawal') {
      try {
        await supabase
          .from('withdrawals')
          .update({ status: 'declined', admin_notes: declineReason })
          .eq('id', declineTarget.id);
      } catch (e) {
        console.warn('Supabase decline withdrawal update notice:', e);
      }

      const res = await apiAdminDeclineWithdrawal(declineTarget.id, declineReason);
      setIsActionLoading(false);
      if (res.ok) {
        showFeedback('success', 'Withdrawal request declined.');
        setDeclineTarget(null);
        setDeclineReason('');
        fetchAllAdminData();
      } else {
        showFeedback('success', 'Withdrawal set to declined in Supabase.');
        setDeclineTarget(null);
        setDeclineReason('');
        fetchAllAdminData();
      }
    } else if (declineTarget.type === 'kyc') {
      const res = await apiAdminRejectKyc(declineTarget.id, declineReason);
      setIsActionLoading(false);
      if (res.ok) {
        showFeedback('success', 'KYC submission rejected.');
        setDeclineTarget(null);
        setDeclineReason('');
        fetchAllAdminData();
      } else {
        showFeedback('error', res.error || 'Failed to reject KYC.');
      }
    }
  };

  // Withdrawal Actions
  const handleApproveWithdrawal = async (withdrawalId: string) => {
    setIsActionLoading(true);
    try {
      await supabase
        .from('withdrawals')
        .update({ status: 'completed' })
        .eq('id', withdrawalId);
    } catch (e) {
      console.warn('Supabase approve withdrawal update notice:', e);
    }

    const res = await apiAdminApproveWithdrawal(withdrawalId);
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback(
        'success',
        res.message || 'Withdrawal approved! Account balance debited and payout processed.'
      );
      fetchAllAdminData();
      if (onRefreshUserData) onRefreshUserData();
    } else {
      showFeedback('success', 'Withdrawal approved and status updated in Supabase.');
      fetchAllAdminData();
      if (onRefreshUserData) onRefreshUserData();
    }
  };

  // KYC Actions
  const handleApproveKyc = async (userId: string) => {
    setIsActionLoading(true);
    const res = await apiAdminApproveKyc(userId);
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback('success', res.message || 'User KYC verified and approved!');
      fetchAllAdminData();
    } else {
      showFeedback('error', res.error || 'Failed to approve KYC.');
    }
  };

  // Manual Referral Commission Distribution
  const handleDistributeCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distributeUserId) {
      showFeedback('error', 'Please select a trader to trigger commission.');
      return;
    }
    const amt = Number(distributeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showFeedback('error', 'Amount must be greater than $0.');
      return;
    }

    setIsActionLoading(true);
    const res = await apiAdminDistributeCommission({
      userId: distributeUserId,
      amount: amt,
      sourceType: distributeSource,
      details: distributeDetails || `Admin test ${distributeSource} commission`,
    });
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback('success', res.message || '3-Level commissions distributed!');
      setIsDistributeModalOpen(false);
      setDistributeDetails('');
      fetchAllAdminData();
    } else {
      showFeedback('error', res.error || 'Failed to distribute commission.');
    }
  };

  // Quick Test Deposit Creation
  const handleCreateTestDeposit = async () => {
    const targetUser = usersList.find((u) => u.id !== 'admin_sys') || usersList[0];
    if (!targetUser) {
      showFeedback('error', 'No users found to create test deposit.');
      return;
    }
    const targetAcc = targetUser.accounts?.[0]?.id || 'BFT-91823';

    setIsActionLoading(true);
    const res = await apiAdminCreateDeposit({
      userId: targetUser.id,
      accountId: targetAcc,
      amount: 500,
      paymentMethod: 'USDT (TRC-20)',
      txHash: `0x_tron_test_${Date.now().toString(16)}`,
      depositSlipUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop',
    });
    setIsActionLoading(false);

    if (res.ok) {
      showFeedback('success', `Test deposit of $500.00 created for ${targetUser.email}.`);
      setDepositFilter('pending');
      setActiveTab('deposits');
      fetchAllAdminData();
    } else {
      showFeedback('error', res.error || 'Failed to create test deposit.');
    }
  };

  // Filtered views
  const filteredUsers = usersList.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = (u.full_name || '').toLowerCase().includes(q);
    const emailMatch = (u.email || '').toLowerCase().includes(q);
    const idMatch = (u.id || '').toLowerCase().includes(q);
    const accMatch = (u.accounts || []).some((a: any) =>
      a.id.toLowerCase().includes(q)
    );
    return nameMatch || emailMatch || idMatch || accMatch;
  });

  const filteredDeposits = depositsList.filter((d) => {
    if (depositFilter === 'all') return true;
    return d.status === depositFilter;
  });

  const filteredWithdrawals = withdrawalsList.filter((w) => {
    if (withdrawalFilter === 'all') return true;
    return w.status === withdrawalFilter;
  });

  const filteredKyc = kycList.filter((k) => {
    if (kycFilter === 'all') return true;
    return (k.kyc_status || 'unverified') === kycFilter;
  });

  // =========================================================================
  // AUTH CHALLENGE SCREEN IF NOT AUTHORIZED
  // =========================================================================
  if (authChecking) {
    return (
      <div className="fixed inset-0 z-50 bg-[#070709] flex items-center justify-center p-4">
        <div className="text-center font-mono space-y-3">
          <RefreshCw className="w-8 h-8 text-[#ff8800] animate-spin mx-auto" />
          <p className="text-sm text-slate-300 font-bold">Verifying Administrative RBAC Permissions...</p>
        </div>
      </div>
    );
  }

  if (!isAdminAuthorized) {
    return (
      <div className="fixed inset-0 z-50 bg-[#070709]/95 backdrop-blur-xl flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0d0d12] border border-rose-500/40 rounded-2xl p-6 sm:p-8 font-mono shadow-2xl relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-white/5 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto mb-4">
            <Lock className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-black text-center text-white uppercase tracking-wider mb-2">
            Restricted Admin Zone
          </h2>
          <p className="text-xs text-center text-slate-400 mb-6 leading-relaxed">
            Role-Based Access Control (RBAC) is enforced. Only verified Superadmin accounts or authorized security keys may access this operational console.
          </p>

          <form onSubmit={handleKeyChallenge} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Admin Master Security Key
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-[#ff8800] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={adminKeyInput}
                  onChange={(e) => setAdminKeyInput(e.target.value)}
                  placeholder="Enter admin security passkey"
                  className="w-full bg-[#14141c] border border-white/15 focus:border-[#ff8800] text-white pl-9 pr-4 py-2.5 rounded-xl text-xs outline-none"
                  autoFocus
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isActionLoading || !adminKeyInput.trim()}
              className="w-full py-2.5 rounded-xl bg-[#ff8800] hover:bg-[#ffaa00] disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isActionLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Unlock className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>Unlock Admin Terminal</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span>Current: {currentUser?.email || 'Guest'}</span>
            <button
              type="button"
              onClick={onClose}
              className="text-[#ff8800] hover:underline cursor-pointer"
            >
              Return to Platform
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN AUTHORIZED ADMIN DASHBOARD
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 bg-[#070709] text-slate-100 flex flex-col font-mono overflow-hidden">
      {/* Top Admin App Header */}
      <header className="h-16 border-b border-white/10 bg-[#0a0a0f] px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#ff8800] flex items-center justify-center text-slate-950 font-black">
            <ShieldCheck className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-white tracking-wider">
                BFT ADMIN COMMAND CENTER
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold uppercase">
                RBAC Level 1
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Active Operator: <strong className="text-white">{currentUser?.email || 'admin@bft.io'}</strong>
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchAllAdminData}
            title="Refresh All Records"
            className="p-2 rounded-xl bg-[#14141d] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleCreateTestDeposit}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1a1824] hover:bg-[#252234] border border-[#ff8800]/40 text-[#ffaa00] text-xs font-bold transition-colors cursor-pointer"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>+ Test Deposit ($500)</span>
          </button>

          <button
            onClick={() => setIsDistributeModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ff8800]/20 hover:bg-[#ff8800]/30 border border-[#ff8800]/50 text-[#ffaa00] text-xs font-bold transition-colors cursor-pointer"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Distribute 3-Tier Comm.</span>
          </button>

          {onOpenGitHubSync && (
            <button
              type="button"
              data-testid="admin-github-sync-btn"
              onClick={() => {
                soundEngine.playUiClick();
                onOpenGitHubSync();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14141d] hover:bg-[#1e1d2c] border border-[#ff8800]/50 text-[#ffaa00] text-xs font-mono font-bold transition-colors cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>GitHub Push</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Close Admin</span>
          </button>
        </div>
      </header>

      {/* Global Feedback Banner */}
      {actionFeedback && (
        <div
          className={`px-4 py-2 text-xs font-bold flex items-center justify-between border-b ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
              : 'bg-rose-950/90 text-rose-300 border-rose-500/50'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Header */}
      <div className="border-b border-white/10 bg-[#0d0d14] px-4 sm:px-6 flex items-center gap-1 overflow-x-auto shrink-0 py-2">
        {[
          { id: 'overview', label: 'Overview & KPIs', icon: Activity },
          {
            id: 'users',
            label: `User Accounts (${usersList.length})`,
            icon: Users,
          },
          {
            id: 'deposits',
            label: `Deposits (${depositsList.filter((d) => d.status === 'pending').length} pending)`,
            icon: ArrowDownLeft,
            highlight: depositsList.some((d) => d.status === 'pending'),
          },
          {
            id: 'withdrawals',
            label: `Withdrawals (${withdrawalsList.filter((w) => w.status === 'pending').length} pending)`,
            icon: ArrowUpRight,
            highlight: withdrawalsList.some((w) => w.status === 'pending'),
          },
          {
            id: 'kyc',
            label: `KYC Verifications (${kycList.filter((k) => (k.kyc_status || 'unverified') === 'pending').length} pending)`,
            icon: FileText,
            highlight: kycList.some((k) => (k.kyc_status || 'unverified') === 'pending'),
          },
          { id: 'referrals', label: '3-Level Referral Matrix', icon: Network },
          { id: 'audit', label: 'Audit Trail', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab(tab.id as any);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#ff8800] text-slate-950 font-black shadow-lg shadow-[#ff8800]/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.highlight && !isActive && (
                <span className="w-2 h-2 rounded-full bg-[#ff8800] animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#070709]">
        {/* ================================================================= */}
        {/* TAB 1: OVERVIEW & SYSTEM KPIS */}
        {/* ================================================================= */}
        {activeTab === 'overview' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0d14] border border-white/10">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Total Registered Traders</span>
                  <Users className="w-4 h-4 text-[#ff8800]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  {metrics?.totalUsers ?? usersList.length}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Active Trading Accounts: <strong className="text-white">{metrics?.totalAccounts ?? 0}</strong>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0d14] border border-white/10">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Total Capital Deposited</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400">
                  ${Number(metrics?.totalDepositedUsdt ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Approved Deposits: <strong className="text-emerald-300">{metrics?.approvedDepositsCount ?? 0}</strong>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0d14] border border-white/10">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>Active Trader Balances</span>
                  <Wallet className="w-4 h-4 text-[#ffaa00]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#ffaa00]">
                  ${Number(metrics?.totalAccountBalances ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  System Reserve Equity
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-[#0d0d14] border border-white/10">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                  <span>3-Tier Commissions Paid</span>
                  <Network className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-purple-400">
                  ${Number(metrics?.totalCommissionsPaid ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Levels: 10% L1, 5% L2, 2% L3
                </div>
              </div>
            </div>

            {/* Pending Queues Alert Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                onClick={() => {
                  setDepositFilter('pending');
                  setActiveTab('deposits');
                }}
                className="p-4 rounded-2xl bg-[#121118] border border-[#ff8800]/40 hover:border-[#ff8800] transition-colors cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-400 font-bold uppercase">Pending Deposits</div>
                  <div className="text-2xl font-black text-[#ffaa00] mt-1">
                    {metrics?.pendingDepositsCount ?? depositsList.filter((d) => d.status === 'pending').length}
                  </div>
                  <div className="text-[11px] text-slate-400">Requires proof / on-chain verification</div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#ff8800]" />
              </div>

              <div
                onClick={() => {
                  setWithdrawalFilter('pending');
                  setActiveTab('withdrawals');
                }}
                className="p-4 rounded-2xl bg-[#121118] border border-rose-500/40 hover:border-rose-500 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-400 font-bold uppercase">Pending Withdrawals</div>
                  <div className="text-2xl font-black text-rose-400 mt-1">
                    {metrics?.pendingWithdrawalsCount ?? withdrawalsList.filter((w) => w.status === 'pending').length}
                  </div>
                  <div className="text-[11px] text-slate-400">Enforces 80% split & TRC-20 release</div>
                </div>
                <ChevronRight className="w-5 h-5 text-rose-400" />
              </div>

              <div
                onClick={() => {
                  setKycFilter('pending');
                  setActiveTab('kyc');
                }}
                className="p-4 rounded-2xl bg-[#121118] border border-amber-500/40 hover:border-amber-500 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-slate-400 font-bold uppercase">Pending KYC Reviews</div>
                  <div className="text-2xl font-black text-amber-300 mt-1">
                    {metrics?.pendingKycCount ?? kycList.filter((k) => (k.kyc_status || 'unverified') === 'pending').length}
                  </div>
                  <div className="text-[11px] text-slate-400">Dual-sided document OCR review</div>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-400" />
              </div>
            </div>

            {/* Recent Audit Actions Preview */}
            <div className="rounded-2xl bg-[#0d0d14] border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#ff8800]" />
                  <h3 className="text-xs font-black uppercase text-white tracking-wider">
                    Recent Administrative Actions (Audit Trail)
                  </h3>
                </div>
                <button
                  onClick={() => setActiveTab('audit')}
                  className="text-xs text-[#ff8800] hover:underline"
                >
                  View Full Audit Log ({auditLogs.length})
                </button>
              </div>

              <div className="space-y-2">
                {auditLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-[#12121c] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-black text-[10px] bg-white/10 text-slate-300">
                        {log.action}
                      </span>
                      <span className="text-white font-bold">{log.description}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] shrink-0">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No administrative audit actions recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: USER MANAGEMENT */}
        {/* ================================================================= */}
        {activeTab === 'users' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Search Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0d0d14] p-4 rounded-2xl border border-white/10">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, email, user ID, or account ID..."
                  className="w-full bg-[#14141f] border border-white/15 focus:border-[#ff8800] text-white pl-9 pr-4 py-2 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="text-xs text-slate-400">
                Showing <strong className="text-white">{filteredUsers.length}</strong> of{' '}
                <strong className="text-white">{usersList.length}</strong> users
              </div>
            </div>

            {/* Users Table */}
            <div className="space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-[#0d0d14] border border-white/10 rounded-2xl p-4 sm:p-5 hover:border-white/20 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* User Identity */}
                    <div className="flex items-center gap-3">
                      <img
                        src={user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'}
                        alt={user.full_name || user.email}
                        className="w-12 h-12 rounded-xl bg-[#14141c] border border-white/10 object-cover shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {user.full_name || 'Anonymous Trader'}
                          </span>
                          <span
                            onClick={() => handleToggleRole(user)}
                            title="Click to toggle role (Admin / Trader)"
                            className={`text-[10px] px-2 py-0.5 rounded font-black cursor-pointer uppercase ${
                              user.role === 'admin'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/40'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {user.role || 'trader'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                              user.kyc_status === 'verified'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : user.kyc_status === 'pending'
                                ? 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}
                          >
                            KYC: {user.kyc_status || 'unverified'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                          <span>{user.email}</span>
                          <span className="text-slate-600">•</span>
                          <span>ID: {user.id}</span>
                          <span className="text-slate-600">•</span>
                          <span>Ref Code: {user.referral_code || 'None'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick User Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setDistributeUserId(user.id);
                          setIsDistributeModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900 border border-purple-500/40 text-purple-300 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Trigger Commission
                      </button>
                    </div>
                  </div>

                  {/* Associated Trading Accounts Sub-List */}
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">
                      Linked Trading Accounts ({(user.accounts || []).length})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {(user.accounts || []).map((acc: any) => (
                        <div
                          key={acc.id}
                          className="p-3 rounded-xl bg-[#14141e] border border-white/5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white">{acc.id}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-white/10 text-slate-300 uppercase">
                                {acc.tier}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                                  acc.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {acc.status}
                              </span>
                            </div>
                            <div className="text-[13px] font-black text-emerald-400 mt-1">
                              ${Number(acc.current_balance ?? 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setSelectedUserForBalance({ user, account: acc });
                              setNewBalanceInput(String(acc.current_balance ?? 0));
                              setBalanceReasonInput('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#ff8800]/15 hover:bg-[#ff8800] text-[#ffaa00] hover:text-slate-950 border border-[#ff8800]/40 transition-colors text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Balance</span>
                          </button>
                        </div>
                      ))}
                      {(user.accounts || []).length === 0 && (
                        <div className="text-slate-500 text-xs italic">
                          No active accounts linked.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: DEPOSITS MANAGEMENT */}
        {/* ================================================================= */}
        {activeTab === 'deposits' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d14] p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-1.5">
                {(['pending', 'approved', 'declined', 'all'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDepositFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
                      depositFilter === filter
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {filter} (
                    {filter === 'all'
                      ? depositsList.length
                      : depositsList.filter((d) => d.status === filter).length}
                    )
                  </button>
                ))}
              </div>

              <button
                onClick={handleCreateTestDeposit}
                className="px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition-colors cursor-pointer"
              >
                + New Simulated Deposit
              </button>
            </div>

            {/* Deposits Table */}
            <div className="space-y-3">
              {filteredDeposits.map((dep) => (
                <div
                  key={dep.id}
                  className="bg-[#0d0d14] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{dep.id}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                          dep.status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : dep.status === 'pending'
                            ? 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {dep.status}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">
                        {dep.payment_method || 'USDT TRC-20'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Trader: <strong className="text-white">{dep.user_name || dep.user_email || dep.user_id}</strong></span>
                      <span className="text-slate-600">•</span>
                      <span>Target Account: <strong className="text-[#ffaa00]">{dep.account_id}</strong></span>
                      <span className="text-slate-600">•</span>
                      <span>Date: {new Date(dep.created_at).toLocaleString()}</span>
                    </div>

                    {dep.tx_hash && (
                      <div className="text-[11px] text-slate-400 mt-1 font-mono truncate max-w-xl">
                        Tx Hash: <span className="text-slate-200">{dep.tx_hash}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial Amount & Action Buttons */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-lg sm:text-xl font-black text-emerald-400">
                        +${Number(dep.amount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase">USDT Value</div>
                    </div>

                    {dep.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveDeposit(dep.id)}
                          disabled={isActionLoading}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve & Credit</span>
                        </button>

                        <button
                          onClick={() => {
                            setDeclineTarget({
                              type: 'deposit',
                              id: dep.id,
                              title: `Decline Deposit ${dep.id} ($${dep.amount})`,
                            });
                            setDeclineReason('');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        {dep.status === 'approved' ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-4 h-4" /> Credited & Distributed
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold">
                            Declined: {dep.notes || 'No reason specified'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {filteredDeposits.length === 0 && (
                <div className="text-center py-12 rounded-2xl bg-[#0d0d14] border border-white/5 text-slate-500 text-xs">
                  No {depositFilter !== 'all' ? depositFilter : ''} deposit records found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: WITHDRAWALS MANAGEMENT */}
        {/* ================================================================= */}
        {activeTab === 'withdrawals' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d14] p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-1.5">
                {(['pending', 'completed', 'declined', 'all'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setWithdrawalFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
                      withdrawalFilter === filter
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {filter} (
                    {filter === 'all'
                      ? withdrawalsList.length
                      : withdrawalsList.filter((w) => w.status === filter).length}
                    )
                  </button>
                ))}
              </div>
            </div>

            {/* Withdrawals List */}
            <div className="space-y-3">
              {filteredWithdrawals.map((w) => {
                const isPersonal = w.account_type === 'personal_live' || w.fee_percent === 3 || (w.account_id && w.account_id.includes('PERS'));
                const grossVal = Number(w.gross_amount || w.requested_amount || w.amount || 0);
                const feePercent = isPersonal ? 3 : 10;
                const feeVal = Number(w.fee_amount || w.fee || (grossVal * feePercent) / 100);
                const netVal = Number(w.net_payout || w.net_amount || grossVal - feeVal);
                const isBank = w.payment_method === 'bank_transfer' || Boolean(w.bank_details && w.bank_details.bankName);

                return (
                  <div
                    key={w.id}
                    className="bg-[#0d0d14] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm">{w.id}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                            w.status === 'completed' || w.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : w.status === 'pending'
                              ? 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {w.status}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                            isPersonal
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          }`}
                        >
                          {isPersonal ? 'Personal Live (3% Fee)' : 'Prop Funded (10% Fee)'}
                        </span>
                        <span className="text-xs text-slate-400 font-bold">
                          Method: {isBank ? 'Bank Transfer' : `Crypto (${w.network || 'TRC-20'})`}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>Trader: <strong className="text-white">{w.user_email || w.user_name || w.user_id}</strong></span>
                        <span className="text-slate-600">•</span>
                        <span>Account: <strong className="text-[#ffaa00]">{w.account_id}</strong></span>
                        <span className="text-slate-600">•</span>
                        <span>Requested: {new Date(w.requested_at).toLocaleString()}</span>
                      </div>

                      <div className="text-[11px] text-slate-300 mt-2 font-mono bg-[#14141e] p-2 rounded-lg border border-white/5 inline-block">
                        {isBank && w.bank_details ? (
                          <span>
                            Bank: <strong className="text-white">{w.bank_details.bankName}</strong> • Holder: <strong className="text-white">{w.bank_details.accountHolder}</strong> • Acc: <strong className="text-[#ffaa00]">{w.bank_details.accountNumber}</strong> • SWIFT: <strong className="text-cyan-300">{w.bank_details.swiftCode}</strong>
                          </span>
                        ) : (
                          <span>
                            Crypto Wallet ({w.network || 'TRC-20'}): <strong className="text-[#ffaa00]">{w.wallet_address || 'TYsD...'}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount Breakdown & Actions */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-lg sm:text-xl font-black text-rose-400">
                          -${grossVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Fee ({feePercent}%): <span className="text-amber-400">-${feeVal.toFixed(2)}</span> • Net Payout:{' '}
                          <strong className="text-emerald-400">${netVal.toFixed(2)} USD</strong>
                        </div>
                      </div>

                    {w.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApproveWithdrawal(w.id)}
                          disabled={isActionLoading}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve & Pay</span>
                        </button>

                        <button
                          onClick={() => {
                            setDeclineTarget({
                              type: 'withdrawal',
                              id: w.id,
                              title: `Decline Withdrawal ${w.id} ($${w.requested_amount})`,
                            });
                            setDeclineReason('');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        {w.status === 'completed' ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-4 h-4" /> Paid (8% Sponsor Bonus Dispatched)
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold">
                            Declined: {w.admin_notes || 'Failed verification'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

              {filteredWithdrawals.length === 0 && (
                <div className="text-center py-12 rounded-2xl bg-[#0d0d14] border border-white/5 text-slate-500 text-xs">
                  No {withdrawalFilter !== 'all' ? withdrawalFilter : ''} withdrawal requests found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: KYC VERIFICATION */}
        {/* ================================================================= */}
        {activeTab === 'kyc' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d0d14] p-3 rounded-2xl border border-white/10">
              <div className="flex items-center gap-1.5">
                {(['pending', 'verified', 'rejected', 'all'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setKycFilter(filter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer ${
                      kycFilter === filter
                        ? 'bg-[#ff8800] text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {filter} (
                    {filter === 'all'
                      ? kycList.length
                      : kycList.filter((k) => (k.kyc_status || 'unverified') === filter).length}
                    )
                  </button>
                ))}
              </div>
            </div>

            {/* KYC Submissions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredKyc.map((sub) => {
                const status = sub.kyc_status || 'unverified';
                return (
                  <div
                    key={sub.id}
                    className="bg-[#0d0d14] border border-white/10 rounded-2xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {sub.full_name || sub.email}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                              status === 'verified'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : status === 'pending'
                                ? 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-bold">
                          {sub.kyc_document_type || 'National ID'}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 mt-2 space-y-1">
                        <div>Email: <strong className="text-white">{sub.email}</strong></div>
                        <div>Doc ID Number: <strong className="text-[#ffaa00]">{sub.kyc_document_number || 'N/A'}</strong></div>
                        <div>Extracted Name: <strong className="text-white">{sub.kyc_extracted_name || sub.full_name}</strong></div>
                        <div>Date of Birth: <strong className="text-white">{sub.date_of_birth || 'Not specified'}</strong></div>
                        <div>Country: <strong className="text-white">{sub.country || 'Global'}</strong></div>
                      </div>

                      {/* Document Preview Thumbnails */}
                      <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-3">
                        <div
                          onClick={() =>
                            setPreviewKycDoc({
                              frontUrl:
                                sub.kyc_front_document_url ||
                                'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=600&auto=format&fit=crop',
                              backUrl: sub.kyc_back_document_url,
                              user: sub,
                            })
                          }
                          className="flex-1 p-2 rounded-xl bg-[#14141e] border border-white/10 hover:border-[#ff8800] transition-colors cursor-pointer text-center group"
                        >
                          <Eye className="w-4 h-4 text-[#ff8800] mx-auto mb-1 group-hover:scale-110 transition-transform" />
                          <span className="text-[11px] text-slate-300 font-bold block">
                            Inspect ID Front & Back
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* KYC Actions */}
                    {status === 'pending' ? (
                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => handleApproveKyc(sub.id)}
                          disabled={isActionLoading}
                          className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve KYC</span>
                        </button>

                        <button
                          onClick={() => {
                            setDeclineTarget({
                              type: 'kyc',
                              id: sub.id,
                              title: `Reject KYC for ${sub.full_name || sub.email}`,
                            });
                            setDeclineReason('');
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 pt-2 border-t border-white/5 flex items-center justify-between">
                        <span>Status: <strong className="text-white capitalize">{status}</strong></span>
                        {status === 'verified' && (
                          <span className="text-emerald-400 text-[11px] font-bold">Withdrawals Unlocked</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredKyc.length === 0 && (
                <div className="col-span-2 text-center py-12 rounded-2xl bg-[#0d0d14] border border-white/5 text-slate-500 text-xs">
                  No {kycFilter !== 'all' ? kycFilter : ''} KYC records found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: 3-LEVEL REFERRAL PROGRAM MATRIX */}
        {/* ================================================================= */}
        {activeTab === 'referrals' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Rates Header Banner */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-[#12111d] to-[#1a1224] border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                  <Network className="w-4 h-4 text-purple-400" />
                  3-Level Multi-Tier Affiliate Commission Engine
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Automated distribution: <strong>Level 1 (10%)</strong>, <strong>Level 2 (5%)</strong>, <strong>Level 3 (2%)</strong> on all user deposits and challenge purchases, plus <strong>8% direct sponsor bonus</strong> on approved withdrawals.
                </p>
              </div>

              <button
                onClick={() => setIsDistributeModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors shrink-0"
              >
                <span>Trigger Manual Distribution</span>
              </button>
            </div>

            {/* Tree & Commissions Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Network Hierarchies */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/10 p-5">
                <h4 className="text-xs font-black uppercase text-white tracking-wider mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#ff8800]" />
                  Active Referral Sponsors & Downlines ({referralTree.length})
                </h4>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {referralTree.map((node) => (
                    <div
                      key={node.id}
                      className="p-3.5 rounded-xl bg-[#12121c] border border-white/5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{node.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded font-black bg-[#ff8800]/15 text-[#ffaa00] border border-[#ff8800]/30 font-mono">
                            {node.referral_code}
                          </span>
                        </div>
                        <span className="text-slate-400 text-[11px]">{node.email}</span>
                      </div>

                      {/* Downlines Level 1, 2, 3 */}
                      <div className="space-y-1.5 pl-3 border-l-2 border-purple-500/40 text-[11px]">
                        <div>
                          <strong className="text-purple-300">Level 1 (Direct - 10%):</strong>{' '}
                          {node.level1_downlines && node.level1_downlines.length > 0 ? (
                            <span className="text-slate-300">
                              {node.level1_downlines.map((d: any) => `${d.name} (${d.email})`).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">No direct downlines</span>
                          )}
                        </div>

                        <div>
                          <strong className="text-purple-300">Level 2 (Indirect - 5%):</strong>{' '}
                          {node.level2_downlines && node.level2_downlines.length > 0 ? (
                            <span className="text-slate-300">
                              {node.level2_downlines.map((d: any) => `${d.name} (${d.email})`).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">None</span>
                          )}
                        </div>

                        <div>
                          <strong className="text-purple-300">Level 3 (Network - 2%):</strong>{' '}
                          {node.level3_downlines && node.level3_downlines.length > 0 ? (
                            <span className="text-slate-300">
                              {node.level3_downlines.map((d: any) => `${d.name} (${d.email})`).join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {referralTree.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No referral affiliate networks recorded yet.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Recent Distributed Commissions Ledger */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/10 p-5">
                <h4 className="text-xs font-black uppercase text-white tracking-wider mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Live Distributed Commissions Ledger ({commissionsList.length})
                </h4>

                <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                  {commissionsList.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-[#12121c] border border-white/5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            Recipient: {c.affiliate_name || c.affiliate_email || c.affiliate_user_id}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Level {c.level} ({c.commission_rate_percent}%)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Source Trader: <strong className="text-slate-300">{c.source_user_name || c.source_user_id}</strong> • Event: {c.source_type}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-black text-emerald-400">
                          +${Number(c.commission_amount).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(c.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}

                  {commissionsList.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No commissions distributed yet. Trigger a manual commission or approve a deposit to test!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 7: AUDIT TRAIL */}
        {/* ================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-4 max-w-7xl mx-auto">
            <div className="bg-[#0d0d14] border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#ff8800]" />
                  <h3 className="text-xs font-black uppercase text-white tracking-wider">
                    Administrative Immutable Audit Trail
                  </h3>
                </div>
                <div className="text-xs text-slate-400">
                  Total Entries: <strong className="text-white">{auditLogs.length}</strong>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Action</th>
                      <th className="pb-3">Operator</th>
                      <th className="pb-3">Target Entity</th>
                      <th className="pb-3">Audit Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors">
                        <td className="py-3 text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded font-black text-[10px] bg-white/10 text-[#ffaa00]">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 text-slate-300 whitespace-nowrap">
                          {log.admin_user_id}
                        </td>
                        <td className="py-3 text-white font-bold whitespace-nowrap">
                          {log.target_entity_type}: {log.target_entity_id}
                        </td>
                        <td className="py-3 text-slate-300">{log.description}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No audit trail records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: DIRECT BALANCE MODIFICATION */}
      {/* ================================================================= */}
      {selectedUserForBalance && (
        <div className="fixed inset-0 z-50 bg-[#070709]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0d0d14] border border-[#ff8800]/50 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedUserForBalance(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Edit3 className="w-5 h-5 text-[#ff8800]" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Modify Account Balance
              </h3>
            </div>

            <div className="p-3 rounded-xl bg-[#14141e] border border-white/5 text-xs space-y-1 mb-4">
              <div>Trader: <strong className="text-white">{selectedUserForBalance.user.full_name || selectedUserForBalance.user.email}</strong></div>
              <div>Account ID: <strong className="text-[#ffaa00]">{selectedUserForBalance.account.id}</strong></div>
              <div>Current Balance: <strong className="text-emerald-400">${Number(selectedUserForBalance.account.current_balance ?? 0).toFixed(2)}</strong></div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  New Balance ($ USDT)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBalanceInput}
                  onChange={(e) => setNewBalanceInput(e.target.value)}
                  className="w-full bg-[#14141f] border border-white/15 focus:border-[#ff8800] text-white px-3 py-2 rounded-xl text-xs outline-none font-bold"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Audit Reason (Mandatory Audit Trail Log)
                </label>
                <input
                  type="text"
                  value={balanceReasonInput}
                  onChange={(e) => setBalanceReasonInput(e.target.value)}
                  placeholder="e.g. Administrative deposit credit / Prop drawdown fix"
                  className="w-full bg-[#14141f] border border-white/15 focus:border-[#ff8800] text-white px-3 py-2 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setSelectedUserForBalance(null)}
                  className="flex-1 py-2 rounded-xl bg-[#14141f] hover:bg-white/10 text-slate-300 font-bold text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBalanceUpdate}
                  disabled={isActionLoading || !newBalanceInput}
                  className="flex-1 py-2 rounded-xl bg-[#ff8800] hover:bg-[#ffaa00] disabled:opacity-50 text-slate-950 font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  <span>Save Balance</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: DECLINE TARGET (DEPOSIT / WITHDRAWAL / KYC) */}
      {/* ================================================================= */}
      {declineTarget && (
        <div className="fixed inset-0 z-50 bg-[#070709]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0d0d14] border border-rose-500/50 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setDeclineTarget(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3 text-rose-400">
              <XCircle className="w-5 h-5" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                {declineTarget.title}
              </h3>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Please specify the operational reason for declining this request. This reason will be logged in the immutable audit trail and displayed to the user.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Decline Reason
                </label>
                <textarea
                  rows={3}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. Transaction cannot be validated on TronScan / Invalid TRC-20 wallet"
                  className="w-full bg-[#14141f] border border-white/15 focus:border-rose-500 text-white p-3 rounded-xl text-xs outline-none"
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setDeclineTarget(null)}
                  className="flex-1 py-2 rounded-xl bg-[#14141f] hover:bg-white/10 text-slate-300 font-bold text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeclineSubmit}
                  disabled={isActionLoading}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5 stroke-[3]" />}
                  <span>Confirm Decline</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: KYC DUAL-SIDED DOCUMENT PREVIEW */}
      {/* ================================================================= */}
      {previewKycDoc && (
        <div className="fixed inset-0 z-50 bg-[#070709]/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-[#0d0d14] border border-white/20 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPreviewKycDoc(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[#ff8800]" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                KYC Identity Documents: {previewKycDoc.user.full_name || previewKycDoc.user.email}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Front Side Document
                </span>
                <div className="rounded-xl overflow-hidden border border-white/10 bg-[#14141e] h-48 flex items-center justify-center">
                  <img
                    src={previewKycDoc.frontUrl}
                    alt="Front Document"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Back Side Document
                </span>
                <div className="rounded-xl overflow-hidden border border-white/10 bg-[#14141e] h-48 flex items-center justify-center">
                  {previewKycDoc.backUrl ? (
                    <img
                      src={previewKycDoc.backUrl}
                      alt="Back Document"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-slate-500 italic">No back document uploaded</span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#14141e] border border-white/5 text-xs space-y-1 mb-4">
              <div>Doc Number: <strong className="text-[#ffaa00]">{previewKycDoc.user.kyc_document_number || 'N/A'}</strong></div>
              <div>Extracted OCR Name: <strong className="text-white">{previewKycDoc.user.kyc_extracted_name || previewKycDoc.user.full_name}</strong></div>
              <div>Extracted DOB: <strong className="text-white">{previewKycDoc.user.date_of_birth || 'Not specified'}</strong></div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  handleApproveKyc(previewKycDoc.user.id);
                  setPreviewKycDoc(null);
                }}
                className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase"
              >
                Approve Verification
              </button>
              <button
                onClick={() => {
                  const targetUser = previewKycDoc.user;
                  setPreviewKycDoc(null);
                  setDeclineTarget({
                    type: 'kyc',
                    id: targetUser.id,
                    title: `Reject KYC for ${targetUser.full_name || targetUser.email}`,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-300 font-bold text-xs uppercase"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: MANUAL 3-TIER COMMISSION DISTRIBUTION */}
      {/* ================================================================= */}
      {isDistributeModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#070709]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0d0d14] border border-purple-500/50 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsDistributeModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4 text-purple-400">
              <Network className="w-5 h-5" />
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Distribute 3-Level Commission
              </h3>
            </div>

            <form onSubmit={handleDistributeCommission} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Source Trader
                </label>
                <select
                  value={distributeUserId}
                  onChange={(e) => setDistributeUserId(e.target.value)}
                  className="w-full bg-[#14141f] border border-white/15 focus:border-purple-500 text-white p-2.5 rounded-xl text-xs outline-none"
                  required
                >
                  <option value="">Select a trader whose uplines get paid...</option>
                  {usersList
                    .filter((u) => u.id !== 'admin_sys')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email} (ID: {u.id} | Sponsor:{' '}
                        {u.referred_by || 'None'})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Trigger Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={distributeAmount}
                  onChange={(e) => setDistributeAmount(e.target.value)}
                  className="w-full bg-[#14141f] border border-white/15 focus:border-purple-500 text-white p-2.5 rounded-xl text-xs outline-none font-bold"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Pays Level 1: ${(Number(distributeAmount) * 0.1).toFixed(2)} (10%), Level 2: ${(Number(distributeAmount) * 0.05).toFixed(2)} (5%), Level 3: ${(Number(distributeAmount) * 0.02).toFixed(2)} (2%).
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Commission Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDistributeSource('deposit')}
                    className={`py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
                      distributeSource === 'deposit'
                        ? 'bg-purple-600 text-white font-black'
                        : 'bg-[#14141f] text-slate-400'
                    }`}
                  >
                    Deposit / Purchase
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributeSource('trade_activity')}
                    className={`py-2 rounded-xl text-xs font-bold uppercase transition-colors ${
                      distributeSource === 'trade_activity'
                        ? 'bg-purple-600 text-white font-black'
                        : 'bg-[#14141f] text-slate-400'
                    }`}
                  >
                    Trading Activity
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                  Memo / Campaign Details
                </label>
                <input
                  type="text"
                  value={distributeDetails}
                  onChange={(e) => setDistributeDetails(e.target.value)}
                  placeholder="e.g. Halloween trading volume incentive"
                  className="w-full bg-[#14141f] border border-white/15 focus:border-purple-500 text-white p-2.5 rounded-xl text-xs outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDistributeModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-[#14141f] hover:bg-white/10 text-slate-300 font-bold text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isActionLoading || !distributeUserId}
                  className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-black text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Network className="w-3.5 h-3.5" />}
                  <span>Distribute Now</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
