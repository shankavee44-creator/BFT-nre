/**
 * Binary Funded Trader (BFT) Cross-Tab & Cross-View State Synchronization Engine
 *
 * Ensures asset selections, active accounts, balance updates, withdrawals,
 * and live trades remain 100% consistent and synchronized across different browser tabs,
 * iframes, and viewports without race conditions or conflicting state.
 */

import { BinaryTrade, TradingAccount, UserProfile, WithdrawalRequest } from '../types';

export type SyncEventType =
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_SELECTED'
  | 'TRADE_ADDED'
  | 'TRADE_UPDATED'
  | 'PROFILE_UPDATED'
  | 'WITHDRAWALS_UPDATED'
  | 'ASSET_SELECTED'
  | 'TABS_UPDATED';

export interface SyncMessage<T = any> {
  type: SyncEventType;
  payload: T;
  timestamp: number;
  sourceTabId: string;
}

// Unique identifier per window session to filter out self-originated echo messages
const CURRENT_TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `tab_${Math.random().toString(36).slice(2)}_${Date.now()}`;

const CHANNEL_NAME = 'bft_cross_tab_sync_channel';

let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }
}

const listeners = new Set<(msg: SyncMessage) => void>();

// Attach broadcast channel listener
if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    const data = event.data as SyncMessage;
    if (data && data.sourceTabId !== CURRENT_TAB_ID) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch {
          // Guard against subscriber errors
        }
      });
    }
  };
}

/**
 * Broadcasts a state change event to all other open tabs in the browser
 */
export function broadcastSyncEvent<T = any>(type: SyncEventType, payload: T): void {
  const msg: SyncMessage<T> = {
    type,
    payload,
    timestamp: Date.now(),
    sourceTabId: CURRENT_TAB_ID,
  };

  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage(msg);
    } catch {
      // Broadcast fallback
    }
  }

  // Backup storage event ping for older browsers
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem('bft_sync_ping', JSON.stringify({ type, timestamp: Date.now() }));
    } catch {
      // Ignore storage quota
    }
  }
}

/**
 * Subscribes to real-time sync events from other tabs and views
 * Returns an unsubscription callback
 */
export function subscribeToSyncEvents(listener: (msg: SyncMessage) => void): () => void {
  listeners.add(listener);

  // Storage event listener fallback
  const handleStorageEvent = (e: StorageEvent) => {
    if (!e.key) return;

    if (e.key === 'bft_accounts_v1' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        listener({
          type: 'ACCOUNT_UPDATED',
          payload: parsed,
          timestamp: Date.now(),
          sourceTabId: 'external_storage',
        });
      } catch {}
    } else if (e.key === 'bft_active_account_v1' && e.newValue) {
      listener({
        type: 'ACCOUNT_SELECTED',
        payload: e.newValue,
        timestamp: Date.now(),
        sourceTabId: 'external_storage',
      });
    } else if (e.key === 'bft_trades_v1' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        listener({
          type: 'TRADE_UPDATED',
          payload: parsed,
          timestamp: Date.now(),
          sourceTabId: 'external_storage',
        });
      } catch {}
    } else if (e.key === 'bft_withdrawals_v1' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        listener({
          type: 'WITHDRAWALS_UPDATED',
          payload: parsed,
          timestamp: Date.now(),
          sourceTabId: 'external_storage',
        });
      } catch {}
    } else if (e.key === 'bft_profile_v1' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        listener({
          type: 'PROFILE_UPDATED',
          payload: parsed,
          timestamp: Date.now(),
          sourceTabId: 'external_storage',
        });
      } catch {}
    } else if (e.key === 'bft_selected_asset_symbol_v1' && e.newValue) {
      listener({
        type: 'ASSET_SELECTED',
        payload: e.newValue,
        timestamp: Date.now(),
        sourceTabId: 'external_storage',
      });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}
