import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  MessageCircle,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { soundEngine } from '../utils/soundEffects';
import {
  DEFAULT_CHAT_AVATAR_URL,
  TraderLiveChatMessage,
  fetchTraderLiveChatMessages,
  postTraderLiveChatMessage,
  subscribeToTraderLiveChatRealtime,
} from '../utils/traderLiveChat';

interface TerminalLiveChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: UserProfile;
  onUnreadIncrement?: () => void;
}

function formatMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const TerminalLiveChatDrawer: React.FC<TerminalLiveChatDrawerProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUnreadIncrement,
}) => {
  const [messages, setMessages] = useState<TraderLiveChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [inputValue, setInputValue] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [moderationNotice, setModerationNotice] = useState<string | null>(null);

  const recentOwnMessagesRef = useRef<Array<{ message: string; timestampMs: number }>>([]);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);
  isOpenRef.current = isOpen;
  const onUnreadIncrementRef = useRef(onUnreadIncrement);
  onUnreadIncrementRef.current = onUnreadIncrement;

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchTraderLiveChatMessages(80)
      .then((res) => {
        if (!active) return;
        setMessages(res.messages);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = subscribeToTraderLiveChatRealtime((incoming) => {
      if (!active) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev;
        return [...prev, incoming].slice(-100);
      });
      if (!isOpenRef.current) {
        onUnreadIncrementRef.current?.();
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 60);
    return () => clearTimeout(timer);
  }, [isOpen, messages.length]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (sending) return;

    const trimmed = inputValue.trim();
    if (!trimmed) {
      setModerationNotice('Please enter a message.');
      return;
    }

    setSending(true);
    setModerationNotice(null);

    try {
      const result = await postTraderLiveChatMessage({
        rawMessage: trimmed,
        userProfile,
        recentOwnMessages: recentOwnMessagesRef.current,
      });

      if (!result.ok || !result.message) {
        setModerationNotice(
          result.error || 'Links, numbers, and inappropriate messages are automatically blocked.'
        );
        soundEngine.playErrorAlert();
        return;
      }

      const posted = result.message;
      recentOwnMessagesRef.current = [
        ...recentOwnMessagesRef.current.filter((m) => Date.now() - m.timestampMs < 60_000),
        { message: posted.message, timestampMs: Date.now() },
      ];

      setMessages((prev) => {
        if (prev.some((m) => m.id === posted.id)) return prev;
        return [...prev, posted].slice(-100);
      });
      setInputValue('');
      soundEngine.playUiClick();
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="live-chat-drawer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 md:absolute md:inset-y-0 md:left-14 md:right-0 z-50 md:z-40 flex items-stretch justify-start bg-black/50 font-sans overflow-hidden"
          onClick={onClose}
        >
          <motion.div
            key="live-chat-drawer-panel"
            data-testid="terminal-live-chat-drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:w-80 md:w-[360px] h-full bg-[#131722] border-r border-[#2a2e39] shadow-[16px_0_48px_rgba(0,0,0,0.8)] flex flex-col will-change-transform"
          >
            {/* Header */}
            <div className="px-4 py-3.5 bg-[#0e121b] border-b border-[#2a2e39] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-400 shrink-0">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white tracking-tight truncate">
                      Live Chat
                    </h3>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[#00e676] text-[9px] font-mono font-black uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-400 truncate">
                    Traders Group Room • Auto-Moderated
                  </p>
                </div>
              </div>

              <button
                type="button"
                data-testid="close-live-chat-drawer"
                onClick={() => {
                  soundEngine.playUiClick();
                  onClose();
                }}
                aria-label="Close Live Chat"
                className="p-1.5 rounded-lg bg-[#181c27] hover:bg-[#1e2334] border border-[#2a2e39] text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Feed (Strictly Sender Name + Profile Picture + Message + Timestamp) */}
            <div
              data-testid="live-chat-messages-list"
              className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-[#11151f]"
            >
              {loading ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  Connecting to live trader chat...
                </div>
              ) : messages.length === 0 ? (
                <div
                  data-testid="live-chat-empty-state"
                  className="h-full flex flex-col items-center justify-center text-center px-4 py-8"
                >
                  <div className="w-11 h-11 rounded-2xl bg-[#181d2a] border border-[#2a2e39] flex items-center justify-center text-cyan-400 mb-3">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-white mb-1">
                    Welcome to Trader Live Chat
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Share setups and discuss markets with fellow traders. Links, phone numbers,
                    profanity, and spam are automatically blocked.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    data-testid="live-chat-message-item"
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#171c28] border border-white/[0.06] hover:border-white/[0.1] transition-colors"
                  >
                    <img
                      src={msg.sender_avatar_url || DEFAULT_CHAT_AVATAR_URL}
                      alt={msg.sender_name}
                      data-testid="live-chat-sender-avatar"
                      onError={(e) => {
                        if (e.currentTarget.src !== DEFAULT_CHAT_AVATAR_URL) {
                          e.currentTarget.src = DEFAULT_CHAT_AVATAR_URL;
                        }
                      }}
                      className="w-8 h-8 rounded-full object-cover border border-white/15 shrink-0 bg-[#0d111a]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          data-testid="live-chat-sender-name"
                          className="text-xs font-bold text-white truncate"
                        >
                          {msg.sender_name}
                        </span>
                        <span
                          data-testid="live-chat-message-time"
                          className="text-[10px] font-mono text-slate-500 shrink-0 tabular-nums"
                        >
                          {formatMessageTime(msg.created_at)}
                        </span>
                      </div>
                      <p
                        data-testid="live-chat-message-text"
                        className="text-xs text-slate-200 leading-relaxed break-words mt-0.5 select-text"
                      >
                        {msg.message}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={feedEndRef} />
            </div>

            {/* Composer & Auto-Moderation Notice */}
            <div className="p-3 bg-[#0e121b] border-t border-[#2a2e39] space-y-2 shrink-0">
              {moderationNotice && (
                <div
                  data-testid="live-chat-moderation-notice"
                  role="alert"
                  className="px-3 py-2 rounded-lg bg-rose-950/75 border border-rose-500/50 text-rose-200 text-[11px] font-mono flex items-start gap-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{moderationNotice}</span>
                </div>
              )}

              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  type="text"
                  data-testid="live-chat-input"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (moderationNotice) setModerationNotice(null);
                  }}
                  maxLength={500}
                  placeholder="Message traders..."
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[#181c27] border border-[#2a2e39] focus:border-cyan-400/70 focus:outline-none text-xs font-sans tracking-normal text-white placeholder-slate-500"
                />
                <button
                  type="submit"
                  data-testid="live-chat-send-btn"
                  disabled={sending}
                  aria-label="Send Message"
                  className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-0.5">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  No links, numbers, profanity, or spam
                </span>
                <span className="tabular-nums">{inputValue.length}/500</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
