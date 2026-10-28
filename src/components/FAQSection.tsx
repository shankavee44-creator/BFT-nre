import React, { useState } from 'react';
import {
  ChevronDown,
  HelpCircle,
  Search,
  Zap,
  ShieldCheck,
  TrendingUp,
  Layers,
  MessageSquare,
  Send
} from 'lucide-react';

interface FAQItem {
  id: string;
  category: 'evaluation' | 'withdrawals' | 'rules' | 'technical';
  question: string;
  answer: string;
  highlight?: string;
}

const FAQ_DATA: FAQItem[] = [
  // Evaluation & Challenges
  {
    id: 'faq-1',
    category: 'evaluation',
    question: 'What is the key difference between One-Step, Two-Step, and Instant Funded accounts?',
    answer:
      'The One-Step Challenge requires hitting a 30% profit target (10% Daily DD, 15% Max DD, 5% Max Risk/Trade across 5 profitable days). The Two-Step Challenge features a 25% Phase 1 and 15% Phase 2 target (8% Daily DD, 20% Max DD, 5% Max Risk/Trade). Instant Funded accounts bypass evaluations—you receive live capital credentials immediately upon payment and can withdraw profits once net gains reach $250 after the mandatory 14-day first withdrawal waiting period.',
    highlight: 'Instant Funded bypasses all evaluations.',
  },
  {
    id: 'faq-2',
    category: 'evaluation',
    question: 'How are the Daily Drawdown and Maximum Overall Loss calculated?',
    answer:
      'Daily Drawdown is calculated based on the starting balance or equity of each trading day at 00:00 UTC. Maximum Overall Loss is calculated from the initial account balance. Additionally, risking more than 5% of your initial capital on any single trade triggers an immediate Hard Breach.',
    highlight: 'Calculated at 00:00 UTC daily.',
  },
  {
    id: 'faq-3',
    category: 'evaluation',
    question: 'What happens immediately after I pass the evaluation challenge phases?',
    answer:
      'Our risk validation engine audits your closed positions in under 60 seconds. Once confirmed compliant with duration and consistency guidelines, your account status is automatically upgraded to "Funded", and new live capital server credentials are dispatched directly to your Trader Hub and registered email.',
  },

  // Withdrawals (3-Min SLA)
  {
    id: 'faq-4',
    category: 'withdrawals',
    question: 'How does the 3-Minute Instant Withdrawal Guarantee work?',
    answer:
      'We process payouts within 3 minutes; if we fail, we pay double! All profit payout requests are routed directly into our high-throughput USDT liquidity contract with a 10% Withdrawal Fee deducted at settlement.',
    highlight: 'We process payouts within 3 minutes; if we fail, we pay double!',
  },
  {
    id: 'faq-5',
    category: 'withdrawals',
    question: 'Under what conditions is the Double Payout Guarantee activated?',
    answer:
      'We process payouts within 3 minutes; if we fail, we pay double! If our automated payout pipeline fails to complete and broadcast your withdrawal transaction within 180 seconds (3 minutes), Binary Funded Trader automatically doubles your requested withdrawal amount (2x payout).',
    highlight: 'Contractual Double Payout at > 180 seconds.',
  },
  {
    id: 'faq-6',
    category: 'withdrawals',
    question: 'What is the minimum withdrawal threshold, fee, and 14-day first withdrawal rule?',
    answer:
      'The minimum withdrawal amount is strictly $250.00 in realized net trading profits, and a 10% Withdrawal Fee is deducted on all payout requests. A mandatory 14-day waiting period applies for the very first withdrawal across all account types. After your first withdrawal, traders who purchased the Daily Withdrawal Add-On (+15%) or Weekly Plan can withdraw according to their package schedule.',
    highlight: 'Minimum $250 withdrawal • 10% Fee • 14-Day First Lock.',
  },
  {
    id: 'faq-7',
    category: 'withdrawals',
    question: 'Which cryptocurrency networks and stablecoins are supported?',
    answer:
      'To guarantee sub-3-minute settlement and near-zero gas fees, all payments and payouts are conducted exclusively in USDT via the TRON network (TRC-20). Please ensure your receiving address begins with the letter "T".',
  },

  // Trading Rules & Risk
  {
    id: 'faq-8',
    category: 'rules',
    question: 'Why is there a 30-second minimum trade duration rule?',
    answer:
      'Binary options contracts must have an expiration window of at least 30 seconds (our platform offers 30s, 60s, 3m, and 5m). This rule exists to prevent latency arbitrage, microsecond price-feed desyncs, and tick-scalping bots that exploit simulator feeds without providing genuine market directional analysis.',
    highlight: 'Trades must be held for at least 30s.',
  },
  {
    id: 'faq-9',
    category: 'rules',
    question: 'Can I trade during high-impact economic news releases?',
    answer:
      'Opening new binary positions within 2 minutes before or 2 minutes after high-impact economic announcements (red-folder events such as Non-Farm Payrolls, CPI, and FOMC rate decisions) is prohibited. Trades opened outside this 4-minute window that naturally expire through the news event remain fully compliant.',
    highlight: '2-minute freeze before & after red news.',
  },
  {
    id: 'faq-10',
    category: 'rules',
    question: 'What is the Position Size Spike rule, and how is it audited?',
    answer:
      'To promote consistent risk discipline, any individual trade stake that exceeds 5x your historical average position size is automatically flagged. For example, if your average stake is $20, opening a sudden $150 trade will violate the consistency rule.',
    highlight: 'Max 5x historical average position size.',
  },
  {
    id: 'faq-11',
    category: 'rules',
    question: 'Are Martingale and Hedging strategies allowed?',
    answer:
      'No. Both automated exponential recovery sequences (doubling up after a loss) and simultaneous opposing directional trades on identical assets and expirations are strictly prohibited to maintain professional prop standards.',
  },

  // Technical & KYC
  {
    id: 'faq-12',
    category: 'technical',
    question: 'When is KYC identity verification required?',
    answer:
      'You can purchase challenges and trade evaluations immediately without KYC. Identity verification (government ID or passport upload via our automated OCR portal) is required prior to your first approved profit withdrawal to comply with global AML/CFT standards.',
  },
  {
    id: 'faq-13',
    category: 'technical',
    question: 'Can I trade on weekends or during OTC market hours?',
    answer:
      'Yes! Crypto pairs (BTC/USD, ETH/USD, SOL/USD) trade 24/7/365 with uninterrupted liquidity. Traditional FX pairs trade during institutional forex market sessions (Sunday 5 PM EST to Friday 5 PM EST).',
  },
  {
    id: 'faq-14',
    category: 'technical',
    question: 'What happens if my account remains inactive for 14 days?',
    answer:
      'Accounts with zero trading activity for 14 consecutive calendar days are automatically suspended to reallocate liquidity pools. To keep your account active, simply execute at least one binary option contract every two weeks.',
  },
];

export const FAQSection: React.FC = () => {
  const [expandedId, setExpandedId] = useState<string | null>('faq-4');
  const [activeCategory, setActiveCategory] = useState<'all' | 'evaluation' | 'withdrawals' | 'rules' | 'technical'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const toggleAccordion = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const categories = [
    { id: 'all', label: 'All Questions', count: FAQ_DATA.length },
    { id: 'withdrawals', label: '3-Min Withdrawals', count: FAQ_DATA.filter((f) => f.category === 'withdrawals').length },
    { id: 'evaluation', label: 'Challenges & Funding', count: FAQ_DATA.filter((f) => f.category === 'evaluation').length },
    { id: 'rules', label: 'Risk & Prop Rules', count: FAQ_DATA.filter((f) => f.category === 'rules').length },
    { id: 'technical', label: 'Technical & KYC', count: FAQ_DATA.filter((f) => f.category === 'technical').length },
  ];

  const filteredFaqs = FAQ_DATA.filter((item) => {
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.highlight && item.highlight.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <section id="faq" data-testid="faq-section" className="py-16 md:py-24 relative bg-[#0a0a0a] border-b border-zinc-800/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900 border border-amber-500/30 text-amber-400 text-xs font-bold mb-3 font-mono">
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>KNOWLEDGE BASE & SUPPORT DESK</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-zinc-300 text-base">
            Everything you need to know about our binary evaluation phases, 3-minute withdrawal guarantee SLA, and risk rules.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-xl mx-auto mb-8">
          <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-3.5" />
          <input
            type="text"
            placeholder="Search rules, withdrawal speed, drawdown formulas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-11 pr-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3 text-xs text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Filter Pills - Matte Black Segmented */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === cat.id
                  ? 'bg-amber-400 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800'
              }`}
            >
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategory === cat.id ? 'bg-zinc-950 text-amber-400' : 'bg-zinc-800 text-zinc-300'
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Accordion List - Matte Black Cards with Smooth Animated Dropdowns */}
        <div className="space-y-3 mb-14">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq) => {
              const isExpanded = expandedId === faq.id;
              return (
                <div
                  key={faq.id}
                  data-testid={`faq-item-${faq.id}`}
                  className={`rounded-2xl transition-all duration-300 border overflow-hidden ${
                    isExpanded
                      ? 'bg-zinc-900 border-amber-500/70 shadow-xl'
                      : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <button
                    onClick={() => toggleAccordion(faq.id)}
                    aria-expanded={isExpanded}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-200 ${
                        isExpanded
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}>
                        {faq.category === 'withdrawals' ? (
                          <Zap className="w-4 h-4" />
                        ) : faq.category === 'rules' ? (
                          <ShieldCheck className="w-4 h-4" />
                        ) : faq.category === 'evaluation' ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <Layers className="w-4 h-4" />
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-extrabold text-white">
                        {faq.question}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {faq.highlight && !isExpanded && (
                        <span className="hidden sm:inline-block text-[10px] font-mono text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                          {faq.highlight}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-5 h-5 text-zinc-400 transition-transform duration-300 ease-in-out ${
                          isExpanded ? 'rotate-180 text-amber-400' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Smooth Grid-based accordion transition */}
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-zinc-200 leading-relaxed border-t border-zinc-800/70 mt-1">
                        <p>{faq.answer}</p>
                        {faq.highlight && (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-amber-500/30 text-xs font-mono text-amber-400 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>Key Rule: {faq.highlight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <HelpCircle className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
              <div className="text-sm font-bold text-white">No questions match your search query</div>
              <p className="text-xs text-zinc-400 mt-1">Try keywords like "withdrawal", "30s", "drawdown", or "KYC".</p>
            </div>
          )}
        </div>

        {/* 24/7 Support Friction Reducer Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Still have questions before getting funded?</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Our institutional risk desk and VIP trader concierges are available 24/7 around the clock.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://t.me"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
            >
              <Send className="w-4 h-4 text-zinc-950" />
              <span>Telegram VIP Desk</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
