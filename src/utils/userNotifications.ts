import { supabase } from './supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  resolveUserNumericId,
  resolveTransferableLiveBalance,
  createP2PTransferRecord,
  saveLocalP2PTransferRecord,
  type P2PTransferRecord,
} from './p2pTransfer.ts';
import {
  recordDirectBalanceCommit,
  commitProfileBalanceToSupabase,
} from './supabaseRealtimeSync.ts';

export const USER_NOTIFICATIONS_STORAGE_KEY = 'bft_user_notifications_v1';

export type UserNotificationType =
  | 'p2p_received'
  | 'p2p_sent'
  | 'deposit'
  | 'withdrawal'
  | 'system';

export interface UserNotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: UserNotificationType;
  amount?: number;
  sender_numeric_id?: string;
  receiver_numeric_id?: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Formats the exact toast notification message when a user receives a P2P transfer:
 * e.g. "P2P Funds Received: +$50.00 from User #100201"
 */
export function formatP2PReceivedToastMessage(
  amount: number | string,
  senderNumericId: string | number
): string {
  const safeAmt = Math.max(0, Number(Number(amount || 0).toFixed(2)));
  const cleanSender = String(senderNumericId ?? '').trim().replace(/^#/, '') || '100201';
  const formattedAmt = safeAmt.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `You received $${formattedAmt} into your Self-Capital balance from User #${cleanSender}.`;
}

/**
 * Parses a raw `user_notifications` row from Supabase or localStorage into a normalized `UserNotificationItem`.
 * Also extracts `amount` and `sender_numeric_id` from the message text if not stored as separate columns.
 */
export function normalizeUserNotificationRow(
  raw: Record<string, any>,
  fallbackUserId: string = 'default'
): UserNotificationItem {
  let title = String(raw.title || raw.subject || 'Notification').trim();
  let message = String(raw.message || raw.body || raw.content || '').trim();
  const rawType = String(raw.type || raw.category || '').toLowerCase();

  let type: UserNotificationType = 'system';
  if (
    rawType.includes('p2p_received') ||
    rawType.includes('p2p_deposit') ||
    message.toLowerCase().includes('p2p funds received') ||
    message.toLowerCase().includes('you received') ||
    title.toLowerCase().includes('p2p funds received') ||
    title.toLowerCase().includes('p2p deposit received') ||
    /[\u0D80-\u0DFF]/.test(title + message)
  ) {
    type = 'p2p_received';
  } else if (rawType.includes('p2p_sent') || message.toLowerCase().includes('p2p transfer sent')) {
    type = 'p2p_sent';
  } else if (rawType.includes('deposit')) {
    type = 'deposit';
  } else if (rawType.includes('withdrawal')) {
    type = 'withdrawal';
  }

  let amount: number | undefined =
    raw.amount !== undefined && Number.isFinite(Number(raw.amount))
      ? Number(Number(raw.amount).toFixed(2))
      : undefined;

  if (amount === undefined) {
    const amtMatch = message.match(/\$([0-9,]+(?:\.[0-9]{1,2})?)/);
    if (amtMatch && amtMatch[1]) {
      amount = Number(Number(amtMatch[1].replace(/,/g, '')).toFixed(2));
    }
  }

  let senderNumericId: string | undefined = raw.sender_numeric_id
    ? String(raw.sender_numeric_id).replace(/^#/, '').trim()
    : undefined;

  if (!senderNumericId) {
    const senderMatch = message.match(/User\s*#(\d+)/i) || message.match(/#(\d{4,15})/);
    if (senderMatch && senderMatch[1]) {
      senderNumericId = senderMatch[1];
    }
  }

  const receiverNumericId: string | undefined = raw.receiver_numeric_id
    ? String(raw.receiver_numeric_id).replace(/^#/, '').trim()
    : undefined;

  if (type === 'p2p_received') {
    title = 'P2P Deposit Received! 💰';
    message = formatP2PReceivedToastMessage(amount ?? 0, senderNumericId || '100201');
  }

  return {
    id: String(raw.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    user_id: String(raw.user_id || fallbackUserId),
    title,
    message,
    type,
    amount,
    sender_numeric_id: senderNumericId,
    receiver_numeric_id: receiverNumericId,
    is_read: Boolean(raw.is_read ?? raw.read ?? false),
    created_at: String(raw.created_at || raw.createdAt || new Date().toISOString()),
  };
}

export function loadLocalUserNotifications(userId?: string | null): UserNotificationItem[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const key = `${USER_NOTIFICATIONS_STORAGE_KEY}_${userId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => !/[\u0D80-\u0DFF]/.test(String(item.title || '') + String(item.message || '')))
      .map((item) => normalizeUserNotificationRow(item, userId || 'default'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch {
    return [];
  }
}

export function saveLocalUserNotifications(
  userId: string | null | undefined,
  notifications: UserNotificationItem[]
): UserNotificationItem[] {
  const sorted = [...notifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  if (typeof window !== 'undefined' && typeof localStorage === 'undefined') return sorted;
  try {
    const key = `${USER_NOTIFICATIONS_STORAGE_KEY}_${userId || 'default'}`;
    localStorage.setItem(key, JSON.stringify(sorted));
  } catch {
    // ignore storage errors
  }
  return sorted;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fetches notifications for the authenticated user from the `user_notifications` table in Supabase,
 * merging with locally persisted notifications and syncing any received P2P transfer records into Payment History.
 */
export async function fetchUserNotificationsFromSupabase(params: {
  userId?: string | null;
  userNumericId?: string | null;
  supabaseClient?: typeof supabase;
}): Promise<UserNotificationItem[]> {
  const client = params.supabaseClient || supabase;
  const isCustomClient = Boolean(params.supabaseClient);
  const userId = String(params.userId || '').trim();
  const localList = loadLocalUserNotifications(userId);
  const byId = new Map<string, UserNotificationItem>();

  for (const item of localList) {
    byId.set(item.id, item);
  }

  if (userId && (isCustomClient || UUID_REGEX.test(userId)) && typeof client?.from === 'function') {
    try {
      const { data, error } = await (client.from('user_notifications') as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(40);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const normalized = normalizeUserNotificationRow(row, userId);
          const existingLocal = byId.get(normalized.id);
          // Preserve local is_read status if already marked read locally so it never reverts to unread on reload
          if (existingLocal?.is_read) {
            normalized.is_read = true;
          }
          byId.set(normalized.id, normalized);

          // Ensure any P2P received notification in `user_notifications` is also reflected in P2P Payment History
          if (normalized.type === 'p2p_received' && normalized.amount && normalized.amount > 0) {
            const p2pRecord = createP2PTransferRecord({
              id: `P2P-RCV-${normalized.id}`,
              direction: 'received',
              senderNumericId: normalized.sender_numeric_id || '100201',
              receiverNumericId:
                normalized.receiver_numeric_id || params.userNumericId || '100202',
              amount: normalized.amount,
              createdAt: normalized.created_at,
              status: 'completed',
            });
            saveLocalP2PTransferRecord(userId, p2pRecord, params.userNumericId);
          }
        }
      }
    } catch {
      // ignore missing table / offline error
    }
  }

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  if (userId) {
    saveLocalUserNotifications(userId, merged);
  }
  return merged;
}

/**
 * Marks a single notification or all notifications as read in `user_notifications` and local state.
 */
export async function markUserNotificationsRead(params: {
  userId?: string | null;
  notificationId?: string;
  supabaseClient?: typeof supabase;
}): Promise<UserNotificationItem[]> {
  const client = params.supabaseClient || supabase;
  const isCustomClient = Boolean(params.supabaseClient);
  const userId = String(params.userId || '').trim();
  const current = loadLocalUserNotifications(userId);

  const updated = current.map((n) => {
    if (!params.notificationId || n.id === params.notificationId) {
      return { ...n, is_read: true };
    }
    return n;
  });

  saveLocalUserNotifications(userId, updated);

  if (typeof client?.from === 'function') {
    try {
      if (params.notificationId) {
        // Send immediate update request to Supabase: .from('user_notifications').update({ is_read: true }).eq('id', notificationId)
        let query = (client.from('user_notifications') as any)
          .update({ is_read: true })
          .eq('id', params.notificationId);
        if (userId && (isCustomClient || UUID_REGEX.test(userId))) {
          query = query.eq('user_id', userId);
        }
        await query;
      } else if (userId && (isCustomClient || UUID_REGEX.test(userId))) {
        await (client.from('user_notifications') as any)
          .update({ is_read: true })
          .eq('user_id', userId);
      }
    } catch {
      // ignore offline/schema error
    }
  }

  return updated;
}

/**
 * Processes an incoming P2P transfer for the current user:
 * 1. Credits the user's live Self-Capital balance (`self_balance` / `selfBalance`) in real-time.
 * 2. Creates a `P2P Deposit Received` (`+$XX.XX`, with `Sender ID: #...`) record in Payment History.
 * 3. Adds an unread notification in `user_notifications`.
 * 4. Returns the immediate UI toast message (`P2P Funds Received: +$XX.XX from User #100201`).
 */
export async function processIncomingP2PTransfer(params: {
  userProfile: UserProfile;
  accounts?: TradingAccount[];
  amount: number;
  senderNumericId: string | number;
  notificationId?: string;
  createdAt?: string;
  skipBalanceIncrementIfAlreadySynced?: boolean;
  supabaseClient?: typeof supabase;
}): Promise<{
  toastTitle: string;
  toastMessage: string;
  notification: UserNotificationItem;
  transferRecord: P2PTransferRecord;
  updatedProfile: UserProfile;
  updatedAccount?: TradingAccount;
}> {
  const client = params.supabaseClient || supabase;
  const isDefaultClient = !params.supabaseClient;
  const receiverNumericId = resolveUserNumericId(params.userProfile);
  const cleanSenderId = String(params.senderNumericId ?? '').trim().replace(/^#/, '') || '100201';
  const safeAmount = Math.max(0, Number(Number(params.amount || 0).toFixed(2)));
  const createdAt = params.createdAt || new Date().toISOString();

  const { availableLiveBalance, targetAccount } = resolveTransferableLiveBalance(
    params.userProfile,
    params.accounts || []
  );

  const nextSelfBalance = params.skipBalanceIncrementIfAlreadySynced
    ? availableLiveBalance
    : Number((availableLiveBalance + safeAmount).toFixed(2));

  recordDirectBalanceCommit('self_balance', nextSelfBalance);

  if (isDefaultClient && !params.skipBalanceIncrementIfAlreadySynced) {
    try {
      await commitProfileBalanceToSupabase({
        userId: params.userProfile.id,
        userEmail: params.userProfile.email,
        column: 'self_balance',
        newBalance: nextSelfBalance,
      });
    } catch {
      // ignore
    }
  }

  const updatedProfile: UserProfile = {
    ...params.userProfile,
    numericId: receiverNumericId,
    numeric_id: receiverNumericId,
    selfBalance: nextSelfBalance,
  };

  const updatedAccount: TradingAccount | undefined = targetAccount
    ? {
        ...targetAccount,
        currentBalance: nextSelfBalance,
        equity: nextSelfBalance,
      }
    : undefined;

  const toastMessage = formatP2PReceivedToastMessage(safeAmount, cleanSenderId);
  const notifId =
    params.notificationId ||
    `notif-p2p-rcv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const notification: UserNotificationItem = {
    id: notifId,
    user_id: params.userProfile.id,
    title: 'P2P Funds Received',
    message: toastMessage,
    type: 'p2p_received',
    amount: safeAmount,
    sender_numeric_id: cleanSenderId,
    receiver_numeric_id: receiverNumericId,
    is_read: false,
    created_at: createdAt,
  };

  const existingNotifs = loadLocalUserNotifications(params.userProfile.id);
  const nextNotifs = [
    notification,
    ...existingNotifs.filter((n) => n.id !== notification.id),
  ];
  saveLocalUserNotifications(params.userProfile.id, nextNotifs);

  if (isDefaultClient && UUID_REGEX.test(String(params.userProfile.id || '')) && typeof client?.from === 'function') {
    try {
      await (client.from('user_notifications') as any).insert([
        {
          id: notification.id,
          user_id: params.userProfile.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          amount: safeAmount,
          sender_numeric_id: cleanSenderId,
          receiver_numeric_id: receiverNumericId,
          is_read: false,
          created_at: createdAt,
        },
      ]);
    } catch {
      // ignore if already inserted by RPC trigger
    }
  }

  const transferRecord = createP2PTransferRecord({
    id: `P2P-RCV-${notifId}`,
    direction: 'received',
    senderNumericId: cleanSenderId,
    receiverNumericId,
    amount: safeAmount,
    previousBalance: availableLiveBalance,
    newBalance: nextSelfBalance,
    createdAt,
    status: 'completed',
  });

  saveLocalP2PTransferRecord(params.userProfile.id, transferRecord, receiverNumericId);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('bft-realtime-profile-update', {
          detail: {
            id: params.userProfile.id,
            email: params.userProfile.email,
            numeric_id: receiverNumericId,
            self_balance: nextSelfBalance,
            self_capital_balance: nextSelfBalance,
          },
        })
      );
      window.dispatchEvent(
        new CustomEvent('bft-user-notification-received', {
          detail: {
            notification,
            transferRecord,
            toastTitle: 'P2P Funds Received',
            toastMessage,
          },
        })
      );
    } catch {
      // ignore
    }
  }

  return {
    toastTitle: 'P2P Funds Received',
    toastMessage,
    notification,
    transferRecord,
    updatedProfile,
    updatedAccount,
  };
}
