import { supabase } from './supabase';
import {
  TradingAccount,
  UserProfile,
  WithdrawalRequest,
  ReferralRecord,
  ReferralLevel,
  KYCStatus,
} from '../types';
import { isPersonalLiveAccount, isDemoAccount } from './propRules';

export interface RealtimeProfileSyncResult {
  updatedProfile: UserProfile;
  updatedAccounts: TradingAccount[];
  changed: boolean;
}

/**
 * Pure helper: applies a Supabase `profiles` row (from initial fetch or real-time UPDATE/INSERT)
 * to the current UserProfile and TradingAccount[] state, maintaining strict separation between
 * Personal Live (`self_balance`), Demo (`demo_balance`), and Funded (`funded_balance`) modes.
 */
export function applyRealtimeProfileUpdate(
  prevProfile: UserProfile,
  prevAccounts: TradingAccount[],
  row: Record<string, any> | null | undefined
): RealtimeProfileSyncResult {
  if (!row || typeof row !== 'object') {
    return { updatedProfile: prevProfile, updatedAccounts: prevAccounts, changed: false };
  }

  const parseNumeric = (val: any): number | undefined => {
    if (val === undefined || val === null || val === '') return undefined;
    const num = Number(val);
    return Number.isFinite(num) ? num : undefined;
  };

  const newSelf = parseNumeric(row.self_balance);
  const newDemo = parseNumeric(row.demo_balance);
  const newFunded = parseNumeric(row.funded_balance);

  let resolvedKycStatus: KYCStatus = prevProfile.kycStatus;
  if (typeof row.kyc_status === 'string' && row.kyc_status.trim()) {
    const raw = row.kyc_status.trim().toLowerCase();
    if (raw === 'verified' || raw === 'approved') {
      resolvedKycStatus = 'verified';
    } else if (raw === 'pending' || raw === 'pending_verification' || raw === 'pending verification') {
      resolvedKycStatus = 'pending';
    } else if (raw === 'rejected' || raw === 'declined') {
      resolvedKycStatus = 'rejected';
    } else if (raw === 'unverified') {
      resolvedKycStatus = 'unverified';
    }
  }

  const nextSelf = newSelf !== undefined ? newSelf : prevProfile.selfBalance;
  const nextDemo = newDemo !== undefined ? newDemo : prevProfile.demoBalance;
  const nextFunded = newFunded !== undefined ? newFunded : prevProfile.fundedBalance;
  const nextFullName =
    typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : prevProfile.fullName;
  const nextReferralCode =
    typeof row.referral_code === 'string' && row.referral_code.trim()
      ? row.referral_code.trim()
      : prevProfile.referralCode;
  const nextReferredBy =
    typeof row.referred_by === 'string' && row.referred_by.trim()
      ? row.referred_by.trim()
      : prevProfile.referredBy;
  const nextLocked =
    row.profile_locked !== undefined && row.profile_locked !== null
      ? Boolean(row.profile_locked)
      : prevProfile.profileLocked;

  const profileChanged =
    nextSelf !== prevProfile.selfBalance ||
    nextDemo !== prevProfile.demoBalance ||
    nextFunded !== prevProfile.fundedBalance ||
    resolvedKycStatus !== prevProfile.kycStatus ||
    nextFullName !== prevProfile.fullName ||
    nextReferralCode !== prevProfile.referralCode ||
    nextReferredBy !== prevProfile.referredBy ||
    nextLocked !== prevProfile.profileLocked;

  const updatedProfile: UserProfile = profileChanged
    ? {
        ...prevProfile,
        id: typeof row.id === 'string' && row.id ? row.id : prevProfile.id,
        email: typeof row.email === 'string' && row.email ? row.email : prevProfile.email,
        fullName: nextFullName,
        referralCode: nextReferralCode,
        referredBy: nextReferredBy,
        kycStatus: resolvedKycStatus,
        profileLocked: nextLocked,
        selfBalance: nextSelf,
        demoBalance: nextDemo,
        fundedBalance: nextFunded,
      }
    : prevProfile;

  let accountsChanged = false;
  const updatedAccounts = prevAccounts.map((acc) => {
    if (isPersonalLiveAccount(acc) && newSelf !== undefined) {
      if (acc.currentBalance !== newSelf || acc.equity !== newSelf) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newSelf,
          equity: newSelf,
          startingDayEquity: newSelf > 0 && acc.startingDayEquity === 0 ? newSelf : acc.startingDayEquity,
          initialBalance: newSelf > 0 && acc.initialBalance === 0 ? newSelf : acc.initialBalance,
        };
      }
      return acc;
    }

    if (isDemoAccount(acc) && newDemo !== undefined) {
      if (acc.currentBalance !== newDemo || acc.equity !== newDemo) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newDemo,
          equity: newDemo,
        };
      }
      return acc;
    }

    if (acc.phase === 'funded' && !isPersonalLiveAccount(acc) && !isDemoAccount(acc) && newFunded !== undefined) {
      if (acc.currentBalance !== newFunded || acc.equity !== newFunded) {
        accountsChanged = true;
        return {
          ...acc,
          currentBalance: newFunded,
          equity: newFunded,
        };
      }
      return acc;
    }

    return acc;
  });

  return {
    updatedProfile,
    updatedAccounts: accountsChanged ? updatedAccounts : prevAccounts,
    changed: profileChanged || accountsChanged,
  };
}

/**
 * Pure helper: maps a Supabase `withdrawals` row into a frontend `WithdrawalRequest`.
 */
export function mapSupabaseWithdrawalToRequest(row: Record<string, any>): WithdrawalRequest {
  const grossAmount = Number(
    row.gross_amount ?? row.requested_amount ?? row.amount ?? 0
  );
  const feeAmount = Number(
    row.fee_amount ?? row.fee ?? Number((grossAmount * 0.1).toFixed(2))
  );
  const netAmount = Number(
    row.net_payout ?? row.net_amount ?? Math.max(0, Number((grossAmount - feeAmount).toFixed(2)))
  );

  const rawStatus = String(row.status || 'pending').toLowerCase();
  let normalizedStatus: WithdrawalRequest['status'] = 'pending';
  if (rawStatus === 'completed' || rawStatus === 'approved') {
    normalizedStatus = 'completed';
  } else if (rawStatus === 'paid') {
    normalizedStatus = 'paid';
  } else if (rawStatus === 'declined' || rawStatus === 'rejected') {
    normalizedStatus = 'rejected';
  } else if (rawStatus === 'processing') {
    normalizedStatus = 'processing';
  } else if (rawStatus === 'doubled') {
    normalizedStatus = 'doubled';
  } else {
    normalizedStatus = 'pending';
  }

  let requestedAtMs = Date.now();
  if (typeof row.requested_at === 'number' && row.requested_at > 0) {
    requestedAtMs = row.requested_at;
  } else if (typeof row.created_at === 'string' && row.created_at) {
    const parsed = Date.parse(row.created_at);
    if (!Number.isNaN(parsed)) requestedAtMs = parsed;
  }

  let completedAtMs: number | undefined;
  if (typeof row.processed_at === 'number' && row.processed_at > 0) {
    completedAtMs = row.processed_at;
  } else if (typeof row.updated_at === 'string' && (normalizedStatus === 'completed' || normalizedStatus === 'paid')) {
    const parsed = Date.parse(row.updated_at);
    if (!Number.isNaN(parsed)) completedAtMs = parsed;
  } else if (normalizedStatus === 'completed' || normalizedStatus === 'paid') {
    completedAtMs = Date.now();
  }

  const paymentMethod =
    row.payment_method === 'bank_transfer' || row.payout_method === 'bank_transfer'
      ? 'bank_transfer'
      : 'crypto_trc20';

  const bankDetails =
    row.bank_details && typeof row.bank_details === 'object' && row.bank_details.bankName
      ? {
          bankName: String(row.bank_details.bankName || ''),
          accountHolder: String(row.bank_details.accountHolder || ''),
          accountNumber: String(row.bank_details.accountNumber || ''),
          swiftCode: String(row.bank_details.swiftCode || ''),
        }
      : undefined;

  return {
    id: String(row.id || `WD-${requestedAtMs}`),
    accountId: String(row.account_id || 'BFT-LIVE-001'),
    amount: grossAmount,
    withdrawalFee: feeAmount,
    netReceivedAmount: netAmount,
    profitSplitApplied: row.account_type === 'personal_live' ? 100 : 80,
    paymentMethod,
    trc20Address: String(row.wallet_address || row.trc20_address || ''),
    bankDetails,
    referenceNumber: String(row.reference_number || row.tx_hash || `REF-${String(row.id || '').slice(0, 8)}`),
    requestedAt: requestedAtMs,
    completedAt: completedAtMs,
    status: normalizedStatus,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    txHash: row.tx_hash ? String(row.tx_hash) : undefined,
    isDoublePayoutEligible: Boolean(row.is_double_payout_eligible),
    timeElapsedSeconds: Number(row.time_elapsed_seconds || 92),
  };
}

/**
 * Pure helper: merges a real-time withdrawal event (`INSERT`, `UPDATE`, `DELETE`)
 * into the existing `WithdrawalRequest[]` list without duplicates.
 */
export function mergeRealtimeWithdrawal(
  prevWithdrawals: WithdrawalRequest[],
  row: Record<string, any> | null | undefined,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  oldRow?: Record<string, any> | null
): WithdrawalRequest[] {
  if (eventType === 'DELETE') {
    const deleteId = String(oldRow?.id || row?.id || '');
    if (!deleteId) return prevWithdrawals;
    return prevWithdrawals.filter((w) => String(w.id) !== deleteId);
  }

  if (!row || typeof row !== 'object') return prevWithdrawals;
  const incoming = mapSupabaseWithdrawalToRequest(row);

  // Check if we already have this withdrawal by exact ID or by matching accountId + amount within 15 seconds (optimistic local record)
  const existingIdx = prevWithdrawals.findIndex((w) => {
    if (String(w.id) === incoming.id) return true;
    const sameAccount = w.accountId === incoming.accountId;
    const sameAmount = Math.abs(w.amount - incoming.amount) < 0.01;
    const closeTimestamp = Math.abs(w.requestedAt - incoming.requestedAt) < 15000;
    return sameAccount && sameAmount && closeTimestamp;
  });

  if (existingIdx >= 0) {
    const next = [...prevWithdrawals];
    next[existingIdx] = {
      ...prevWithdrawals[existingIdx],
      ...incoming,
    };
    return next;
  }

  return [incoming, ...prevWithdrawals];
}

/**
 * Pure helper: maps a Supabase `referral_commissions` row into a frontend `ReferralRecord`.
 */
export function mapSupabaseCommissionToReferralRecord(row: Record<string, any>): ReferralRecord {
  const levelNum = Number(row.level);
  const validLevel: ReferralLevel = levelNum === 2 ? 2 : levelNum === 3 ? 3 : 1;
  const amount = Number(row.amount ?? row.commission_amount ?? 0);
  const rawType = String(row.commission_type || 'package').toLowerCase();
  const isWithdrawalBonus =
    rawType.includes('withdrawal') || rawType.includes('payout') || rawType.includes('royalty');

  const defaultRate = isWithdrawalBonus
    ? 0.08
    : validLevel === 1
    ? 0.1
    : validLevel === 2
    ? 0.05
    : 0.02;
  const rate = Number(row.commission_rate ?? defaultRate);
  const basePrice = Number(
    row.package_price ?? (rate > 0 ? Number((amount / rate).toFixed(2)) : amount)
  );

  const sourceId = String(row.source_user_id || row.referred_user_id || 'usr_referred');
  const createdAt =
    typeof row.created_at === 'string' && row.created_at
      ? row.created_at.split('T')[0]
      : new Date().toISOString().split('T')[0];

  return {
    id: String(row.id || `COM-${Date.now()}`),
    referrerId: String(row.earner_id || row.referrer_id || ''),
    referredUserId: sourceId,
    referredUserName: String(
      row.source_name || row.referred_user_name || `Trader #${sourceId.slice(0, 6)}`
    ),
    referredUserEmail: String(
      row.source_email || row.referred_user_email || `${sourceId.slice(0, 6)}@trader.bft`
    ),
    level: validLevel,
    commissionType: isWithdrawalBonus ? 'withdrawal' : 'package',
    packageTier: (row.package_tier as any) || 'two-step',
    packageName: String(
      row.package_name ||
        (isWithdrawalBonus ? '8% Lifetime Payout Royalty' : `Level ${validLevel} Referral Commission`)
    ),
    packagePrice: basePrice,
    commissionRate: rate,
    commissionAmount: amount,
    status: row.status === 'pending' ? 'pending' : 'paid',
    createdAt,
  };
}

/**
 * Pure helper: merges a real-time referral commission event (`INSERT`, `UPDATE`, `DELETE`)
 * into the existing `ReferralRecord[]` list without duplicates.
 */
export function mergeRealtimeCommission(
  prevReferrals: ReferralRecord[],
  row: Record<string, any> | null | undefined,
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
  oldRow?: Record<string, any> | null
): ReferralRecord[] {
  if (eventType === 'DELETE') {
    const deleteId = String(oldRow?.id || row?.id || '');
    if (!deleteId) return prevReferrals;
    return prevReferrals.filter((r) => String(r.id) !== deleteId);
  }

  if (!row || typeof row !== 'object') return prevReferrals;
  const incoming = mapSupabaseCommissionToReferralRecord(row);

  const existingIdx = prevReferrals.findIndex((r) => String(r.id) === incoming.id);
  if (existingIdx >= 0) {
    const next = [...prevReferrals];
    next[existingIdx] = {
      ...prevReferrals[existingIdx],
      ...incoming,
    };
    return next;
  }

  return [incoming, ...prevReferrals];
}

export interface UserRealtimeSubscriptionCallbacks {
  userId: string;
  userEmail?: string;
  accountIds?: string[];
  onProfileRow: (row: Record<string, any>) => void;
  onWithdrawalsInitial?: (rows: Record<string, any>[]) => void;
  onWithdrawalEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    newRow: Record<string, any> | null,
    oldRow: Record<string, any> | null
  ) => void;
  onCommissionsInitial?: (rows: Record<string, any>[]) => void;
  onCommissionEvent?: (
    eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string,
    newRow: Record<string, any> | null,
    oldRow: Record<string, any> | null
  ) => void;
}

/**
 * Sets up comprehensive Supabase real-time subscriptions (`postgres_changes`) for:
 * 1. `profiles` table (instant `self_balance`, `demo_balance`, `funded_balance`, and `kyc_status` sync)
 * 2. `withdrawals` table (instant pending -> completed/approved/declined status sync)
 * 3. `referral_commissions` table (instant affiliate commission & 8% withdrawal royalty sync)
 */
export function subscribeUserRealtimeChannels(callbacks: UserRealtimeSubscriptionCallbacks): () => void {
  const {
    userId,
    userEmail,
    accountIds = [],
    onProfileRow,
    onWithdrawalsInitial,
    onWithdrawalEvent,
    onCommissionsInitial,
    onCommissionEvent,
  } = callbacks;

  let isDisposed = false;
  const candidateIds = new Set<string>();
  if (userId) candidateIds.add(userId);
  const normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : '';
  const accountIdSet = new Set<string>(accountIds.filter(Boolean));

  const matchesUserProfile = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    if (row.id && candidateIds.has(String(row.id))) return true;
    if (
      normalizedEmail &&
      typeof row.email === 'string' &&
      row.email.trim().toLowerCase() === normalizedEmail
    ) {
      if (row.id) candidateIds.add(String(row.id));
      return true;
    }
    return false;
  };

  const matchesUserWithdrawal = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    if (row.user_id && candidateIds.has(String(row.user_id))) return true;
    if (
      normalizedEmail &&
      typeof row.user_email === 'string' &&
      row.user_email.trim().toLowerCase() === normalizedEmail
    ) {
      return true;
    }
    if (row.account_id && accountIdSet.has(String(row.account_id))) return true;
    return false;
  };

  const matchesUserCommission = (row: Record<string, any> | null | undefined): boolean => {
    if (!row || typeof row !== 'object') return false;
    const earnerId = String(row.earner_id || row.referrer_id || '');
    return Boolean(earnerId && candidateIds.has(earnerId));
  };

  // Initial resolution of Supabase Auth user + initial data fetch
  const initAsync = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isDisposed) return;
      if (user?.id) {
        candidateIds.add(user.id);
      }

      // 1. Fetch profile row by ID or Email
      let profileRow: Record<string, any> | null = null;
      for (const cid of Array.from(candidateIds)) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
        if (isUuid) {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, full_name, kyc_status, self_balance, demo_balance, funded_balance, address, date_of_birth, country, referral_code, referred_by, profile_locked')
            .eq('id', cid)
            .maybeSingle();
          if (data) {
            profileRow = data;
            break;
          }
        }
      }

      if (!profileRow && normalizedEmail) {
        const { data } = await supabase
          .from('profiles')
          .select('id, email, full_name, kyc_status, self_balance, demo_balance, funded_balance, address, date_of_birth, country, referral_code, referred_by, profile_locked')
          .ilike('email', normalizedEmail)
          .maybeSingle();
        if (data) {
          profileRow = data;
          if (data.id) candidateIds.add(String(data.id));
        }
      }

      if (!isDisposed && profileRow) {
        onProfileRow(profileRow);
      }

      // 2. Fetch initial withdrawals from Supabase
      if (onWithdrawalsInitial) {
        const idsArray = Array.from(candidateIds);
        if (idsArray.length > 0) {
          const { data: wRows } = await supabase
            .from('withdrawals')
            .select('*')
            .in('user_id', idsArray)
            .order('created_at', { ascending: false });
          if (!isDisposed && Array.isArray(wRows) && wRows.length > 0) {
            onWithdrawalsInitial(wRows);
          } else if (!isDisposed && normalizedEmail) {
            const { data: wByEmail } = await supabase
              .from('withdrawals')
              .select('*')
              .ilike('user_email', normalizedEmail)
              .order('created_at', { ascending: false });
            if (!isDisposed && Array.isArray(wByEmail) && wByEmail.length > 0) {
              onWithdrawalsInitial(wByEmail);
            }
          }
        }
      }

      // 3. Fetch initial referral commissions from Supabase
      if (onCommissionsInitial) {
        const idsArray = Array.from(candidateIds);
        if (idsArray.length > 0) {
          const { data: cRows } = await supabase
            .from('referral_commissions')
            .select('*')
            .in('earner_id', idsArray)
            .order('created_at', { ascending: false });
          if (!isDisposed && Array.isArray(cRows) && cRows.length > 0) {
            onCommissionsInitial(cRows);
          }
        }
      }
    } catch {
      // Ignore network/offline errors on initial sync
    }
  };

  initAsync();

  const channelKey = `realtime:user_sync:${userId}:${Date.now()}`;
  const channel = supabase
    .channel(channelKey)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
      },
      (payload) => {
        if (isDisposed) return;
        const newRow = (payload.new as Record<string, any>) || null;
        if (newRow && matchesUserProfile(newRow)) {
          onProfileRow(newRow);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'withdrawals',
      },
      (payload) => {
        if (isDisposed || !onWithdrawalEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserWithdrawal(newRow) || matchesUserWithdrawal(oldRow)) {
          onWithdrawalEvent(payload.eventType, newRow, oldRow);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'referral_commissions',
      },
      (payload) => {
        if (isDisposed || !onCommissionEvent) return;
        const newRow = (payload.new as Record<string, any>) || null;
        const oldRow = (payload.old as Record<string, any>) || null;
        if (matchesUserCommission(newRow) || matchesUserCommission(oldRow)) {
          onCommissionEvent(payload.eventType, newRow, oldRow);
        }
      }
    )
    .subscribe();

  return () => {
    isDisposed = true;
    supabase.removeChannel(channel);
  };
}
