import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Info,
  Clock,
  X,
} from 'lucide-react';
import { supabase } from '../utils/supabase.ts';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  fetchUserNotificationsFromSupabase,
  markUserNotificationsRead,
  normalizeUserNotificationRow,
  processIncomingP2PTransfer,
  formatP2PReceivedToastMessage,
  type UserNotificationItem,
} from '../utils/userNotifications.ts';
import { resolveUserNumericId } from '../utils/p2pTransfer.ts';
import { soundEngine } from '../utils/soundEffects.ts';
import { fetchSupabaseProfileRow } from '../utils/supabaseRealtimeSync.ts';

export interface NotificationBellDropdownProps {
  userProfile: UserProfile;
  accounts: TradingAccount[];
  onUpdateProfile: (profile: UserProfile) => void;
  onUpdateAccount?: (account: TradingAccount) => void;
  onTriggerInstantToast?: (toast: {
    type: 'success' | 'error';
    title: string;
    message: string;
  }) => void;
}

export const NotificationBellDropdown: React.FC<NotificationBellDropdownProps> = ({
  userProfile,
  accounts,
  onUpdateProfile,
  onUpdateAccount,
  onTriggerInstantToast,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const processedRealtimeIdsRef = useRef<Set<string>>(new Set());

  const userNumericId = resolveUserNumericId(userProfile);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const syncNotifications = async () => {
    const items = await fetchUserNotificationsFromSupabase({
      userId: userProfile.id,
      userNumericId,
    });
    for (const item of items) {
      processedRealtimeIdsRef.current.add(item.id);
    }
    setNotifications(items);
  };

  useEffect(() => {
    syncNotifications();
    const interval = setInterval(syncNotifications, 15000);
    return () => clearInterval(interval);
  }, [userProfile.id, userNumericId]);

  // Listen for custom incoming P2P notification events and Supabase Realtime `user_notifications` INSERTs
  useEffect(() => {
    const handleCustomNotif = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.notification) {
        const notif = detail.notification as UserNotificationItem;
        processedRealtimeIdsRef.current.add(notif.id);
        setNotifications((prev) => [
          notif,
          ...prev.filter((n) => n.id !== notif.id),
        ]);
        if (onTriggerInstantToast && detail.toastMessage) {
          onTriggerInstantToast({
            type: 'success',
            title: detail.toastTitle || 'P2P Funds Received',
            message: detail.toastMessage,
          });
        }
      } else {
        syncNotifications();
      }
    };

    window.addEventListener('bft-user-notification-received', handleCustomNotif);

    let channel: any = null;
    if (userProfile.id && typeof supabase?.channel === 'function') {
      try {
        channel = supabase
          .channel(`user-notifications-${userProfile.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'user_notifications',
              filter: `user_id=eq.${userProfile.id}`,
            },
            async (payload: any) => {
              const rawRow = payload?.new;
              if (!rawRow) return;
              const normalized = normalizeUserNotificationRow(rawRow, userProfile.id);
              if (processedRealtimeIdsRef.current.has(normalized.id)) return;
              processedRealtimeIdsRef.current.add(normalized.id);

              setNotifications((prev) => [
                normalized,
                ...prev.filter((n) => n.id !== normalized.id),
              ]);

              if (normalized.type === 'p2p_received' && normalized.amount && normalized.amount > 0) {
                soundEngine.playTradeWin();
                const res = await processIncomingP2PTransfer({
                  userProfile,
                  accounts,
                  amount: normalized.amount,
                  senderNumericId: normalized.sender_numeric_id || '100201',
                  notificationId: normalized.id,
                  createdAt: normalized.created_at,
                  skipBalanceIncrementIfAlreadySynced: false,
                });
                onUpdateProfile(res.updatedProfile);
                try {
                  const freshRow = await fetchSupabaseProfileRow({
                    userId: userProfile.id,
                    userEmail: userProfile.email,
                  });
                  if (freshRow) {
                    const freshProfile = {
                      ...res.updatedProfile,
                      selfBalance: Number(freshRow.self_capital_balance ?? freshRow.self_balance ?? freshRow.balance ?? res.updatedProfile.selfBalance),
                    };
                    onUpdateProfile(freshProfile);
                  }
                } catch {}
                if (res.updatedAccount && onUpdateAccount) {
                  onUpdateAccount(res.updatedAccount);
                }
                if (onTriggerInstantToast) {
                  onTriggerInstantToast({
                    type: 'success',
                    title: 'P2P Funds Received',
                    message:
                      normalized.message ||
                      formatP2PReceivedToastMessage(
                        normalized.amount,
                        normalized.sender_numeric_id || '100201'
                      ),
                  });
                }
              } else if (onTriggerInstantToast) {
                soundEngine.playUiClick();
                onTriggerInstantToast({
                  type: 'success',
                  title: normalized.title,
                  message: normalized.message,
                });
              }
            }
          )
          .subscribe();
      } catch {
        // ignore channel setup error
      }
    }

    return () => {
      window.removeEventListener('bft-user-notification-received', handleCustomNotif);
      if (channel && typeof supabase?.removeChannel === 'function') {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [userProfile.id, userProfile.selfBalance, accounts]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    soundEngine.playUiClick();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const updated = await markUserNotificationsRead({
      userId: userProfile.id,
    });
    setNotifications(updated);
  };

  const handleMarkItemRead = async (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    const updated = await markUserNotificationsRead({
      userId: userProfile.id,
      notificationId: notifId,
    });
    setNotifications(updated);
  };

  return (
    <div ref={dropdownRef} className="relative inline-block">
      <button
        type="button"
        data-testid="dashboard-notification-bell-btn"
        aria-label="Open Notifications"
        onClick={() => {
          soundEngine.playUiClick();
          setIsOpen((prev) => !prev);
        }}
        className="relative min-h-[38px] sm:min-h-[42px] px-3 py-2 rounded-xl bg-[#141418] hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-mono text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Bell className="w-4 h-4 text-[#ff8800]" />
        <span className="hidden xl:inline">Notifications</span>
        {unreadCount > 0 && (
          <span
            data-testid="dashboard-notification-unread-badge"
            className="px-1.5 py-0.5 min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-slate-950 text-[10px] font-mono font-black flex items-center justify-center tabular-nums"
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="dashboard-notification-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[#0d0d13] border border-[#ff8800]/45 shadow-[0_20px_50px_rgba(0,0,0,0.85)] z-50 overflow-hidden font-mono"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-[#13131b] border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#ff8800]" />
              <span className="text-xs font-black text-white uppercase tracking-wider">
                Notifications
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] text-slate-300">
                user_notifications
              </span>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  data-testid="notifications-mark-all-read-btn"
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close Notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification Items List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
            {notifications.length === 0 ? (
              <div
                data-testid="notifications-empty-state"
                className="p-6 text-center text-xs text-slate-400 space-y-1"
              >
                <p className="font-bold text-slate-300">No notifications yet</p>
                <p className="text-[11px] text-slate-500">
                  Incoming P2P transfers and account alerts from <code className="text-slate-400">user_notifications</code> will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isP2PReceived = notif.type === 'p2p_received';
                const isP2PSent = notif.type === 'p2p_sent';
                return (
                  <div
                    key={notif.id}
                    data-testid={`notification-item-${notif.id}`}
                    onClick={() => handleMarkItemRead(notif.id)}
                    className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                      notif.is_read ? 'bg-[#0d0d13] hover:bg-white/5' : 'bg-[#151824] hover:bg-[#191d2b]'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
                        isP2PReceived
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : isP2PSent
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                          : 'bg-[#ff8800]/15 border-[#ff8800]/40 text-[#ff8800]'
                      }`}
                    >
                      {isP2PReceived ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : isP2PSent ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <Info className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-white truncate">
                          {notif.title}
                        </span>
                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        )}
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 leading-relaxed ${
                          isP2PReceived ? 'text-emerald-300 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {notif.message}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(notif.created_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
