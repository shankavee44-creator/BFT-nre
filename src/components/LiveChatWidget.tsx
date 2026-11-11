import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, Bot, User, RefreshCw, ChevronDown } from 'lucide-react';
import { BftLogo } from './BftLogo';
import { soundEngine } from '../utils/soundEffects';

interface ChatMessage {
  id: string;
  sender: 'agent' | 'user';
  text: string;
  time: string;
}

export const LiveChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      sender: 'agent',
      text: 'Welcome to the BFT 24/7 AI Risk & Support Desk! I am your automated AI assistant powered to answer questions on prop trading rules, drawdown limits, promo codes (SPOOKY40 for 40% OFF), instant 3-minute USDT TRC-20 withdrawals, and custom demo balances. How may I assist you today?',
      time: 'Just now',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (e?: React.FormEvent, presetText?: string) => {
    if (e) e.preventDefault();
    const textToSend = presetText || input;
    if (!textToSend.trim() || isLoading) return;

    soundEngine.playUiClick();
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      time: 'Now',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for the AI model
      const history = messages.slice(-6).map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend.trim(),
          history,
        }),
      });

      const data = await res.json();
      const reply = data?.reply || 'Our AI Risk Desk has recorded your inquiry. For immediate challenge activation with a 40% discount, use code SPOOKY40!';

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'agent',
          text: reply,
          time: 'Now',
        },
      ]);
      soundEngine.playTradePlacement('CALL');
    } catch (err) {
      console.warn('AI Chat API fallback notice:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: 'agent',
          text: 'Our AI Risk Desk is reviewing your request. Quick Reminder: Use code SPOOKY40 for 40% OFF your first evaluation, or SPOOKY20 for 20% OFF existing orders. Withdrawals process via automated TRC-20 USDT in under 3 minutes!',
          time: 'Now',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    soundEngine.playUiClick();
    setMessages([
      {
        id: `msg-reset-${Date.now()}`,
        sender: 'agent',
        text: 'Chat history cleared. I am ready to assist with BFT evaluation rules, payouts, custom demo balance, and affiliate questions!',
        time: 'Just now',
      },
    ]);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {isOpen ? (
        <div
          data-testid="live-chat-panel"
          className="w-80 sm:w-96 rounded-3xl bg-[#111827] border border-white/[0.08] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[580px]"
        >
          {/* Header */}
          <div className="p-4 bg-[#0066ff] text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0b0f19] flex items-center justify-center p-1">
                <BftLogo
                  imgClassName="h-7 w-auto"
                  testId="chat-widget-bft-logo"
                  alt="BFT Bull Logo"
                />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <span>BFT 24/7 AI Risk Desk</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div className="text-[11px] font-bold opacity-90 flex items-center gap-1 font-mono">
                  <Bot className="w-3 h-3" /> Automated AI Support • Instant Reply
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer transition-colors"
                title="Clear Conversation"
                aria-label="Clear Conversation"
              >
                <RefreshCw className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer transition-colors"
                aria-label="Close Live Chat"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="p-4 flex-1 h-72 sm:h-80 overflow-y-auto space-y-3 bg-[#0b0f19]">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#9ca3af] font-mono">
                  {m.sender === 'user' ? (
                    <>
                      <span>Trader</span>
                      <User className="w-3 h-3 text-[#0066ff]" />
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-[#0066ff]" />
                      <span>AI Desk Specialist</span>
                    </>
                  )}
                </div>

                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    m.sender === 'user'
                      ? 'bg-[#0066ff] text-white font-bold shadow-md'
                      : 'bg-[#111827] text-slate-200 border border-white/[0.08] shadow-md font-sans'
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-[#9ca3af] mt-1 px-1 font-mono">{m.time}</span>
              </div>
            ))}

            {isLoading && (
              <div className="flex flex-col items-start animate-pulse">
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#9ca3af] font-mono">
                  <Bot className="w-3 h-3 text-[#0066ff] animate-spin" />
                  <span>AI Risk Desk is analyzing...</span>
                </div>
                <div className="bg-[#111827] text-[#9ca3af] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0066ff] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0066ff] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0066ff] animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick FAQ Suggestion Chips */}
          <div className="px-3 py-2 bg-[#111827] border-t border-white/[0.08] flex gap-1.5 overflow-x-auto no-scrollbar">
            {[
              'SPOOKY40 Code',
              'Sub-3-Min Payouts',
              'Drawdown Rules',
              'Custom Demo Balance',
              'Certificates',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(undefined, q)}
                className="px-2.5 py-1 rounded-lg bg-[#0b0f19] hover:bg-[#0066ff]/20 border border-white/[0.08] text-[10px] font-mono text-[#9ca3af] hover:text-white whitespace-nowrap cursor-pointer transition-colors shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-3 bg-[#111827] border-t border-white/[0.08] flex gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about SPOOKY40, payouts, rules..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#0b0f19] border border-white/[0.08] text-xs text-white placeholder-[#9ca3af] focus:outline-none focus:border-[#0066ff]"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-black text-xs cursor-pointer flex items-center justify-center transition-all disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      ) : (
        <button
          onClick={() => {
            soundEngine.playUiClick();
            setIsOpen(true);
          }}
          className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-black text-xs font-mono shadow-[0_4px_20px_rgba(0,102,255,0.4)] hover:scale-105 transition-all cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 fill-white" />
          <span>24/7 Live Chat</span>
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
