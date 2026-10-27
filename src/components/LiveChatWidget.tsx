import React, { useState } from 'react';
import { MessageSquare, X, Send, Sparkles, Headset } from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  time: string;
}

export const LiveChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'agent',
      text: 'Welcome to Binary Funded Trader (BFT) Institutional Desk! Use code SPOOKY40 for 40% OFF your first challenge or SPOOKY20 for 20% OFF existing trader orders. How can we help you today?',
      time: 'Just now',
    },
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: input.trim(),
      time: 'Now',
    };

    const lower = input.toLowerCase();
    let replyText =
      'Our Prop Desk specialist has received your message. Remember: all funded accounts start at an 80% profit split and automatically scale to 90% + Account Scaling after 3 months!';

    if (lower.includes('promo') || lower.includes('discount') || lower.includes('code') || lower.includes('spooky')) {
      replyText =
        'Active Promo Codes: Use "SPOOKY40" for a Flat 40% OFF New User discount, or "SPOOKY20" for a Flat 20% OFF Existing User discount at checkout!';
    } else if (lower.includes('withdraw') || lower.includes('fee') || lower.includes('payout')) {
      replyText =
        'Withdrawals are processed via automated TRC-20 USDT in under 3 minutes! A flat 10% withdrawal processing fee applies (you receive 90% net of your requested payout). You can also unlock Daily Withdrawals at checkout for +15%.';
    } else if (lower.includes('affiliate') || lower.includes('referral')) {
      replyText =
        'Our Multi-Level Affiliate Program pays 17% Level 1, 5% Level 2, and 2% Level 3 package commissions PLUS an 8% withdrawal commission every time your direct referrals receive a payout!';
    }

    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: `a-${Date.now() + 1}`,
        sender: 'agent',
        text: replyText,
        time: 'Now',
      },
    ]);
    setInput('');
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {isOpen ? (
        <div className="w-80 sm:w-96 rounded-3xl bg-[#0e0e11] border border-[#ff8800]/50 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-black/15 flex items-center justify-center">
                <Headset className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1">
                  <span>BFT Live Prop Support</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-900 animate-ping" />
                </div>
                <div className="text-[11px] font-bold opacity-85">24/7 Instant Desk • Avg Reply &lt;30s</div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-black/10 text-slate-950 cursor-pointer"
              aria-label="Close Live Chat"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Messages */}
          <div className="p-4 h-72 overflow-y-auto space-y-3 bg-[#0a0a0c]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-bold'
                      : 'bg-[#16161a] text-slate-200 border border-white/10'
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-slate-500 mt-1 font-mono">{m.time}</span>
              </div>
            ))}
          </div>

          {/* Quick Replies */}
          <div className="px-3 py-2 bg-[#0e0e11] border-t border-white/5 flex gap-1.5 overflow-x-auto">
            {['Promo Codes', 'Withdrawal Fee', 'Affiliate 17% + 8%'].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-[#ff8800]/20 border border-white/10 text-[10px] font-mono text-[#ffaa00] whitespace-nowrap cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-3 bg-[#0e0e11] border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about SPOOKY40, payouts, rules..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#09090b] border border-white/15 text-xs text-white focus:outline-none focus:border-[#ff8800]"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs cursor-pointer flex items-center justify-center"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black text-xs font-mono shadow-2xl glow-gold hover:scale-105 transition-all cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 fill-slate-950" />
          <span>24/7 Live Chat</span>
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
