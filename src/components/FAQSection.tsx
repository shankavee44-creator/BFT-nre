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
    question: 'What are the Funded Challenge account sizes, prices, and completion criteria?',
    answer:
      'BFT offers a single unified Funded Challenge model across six account sizes: $5,000 ($49), $10,000 ($89), $25,000 ($199), $50,000 ($329), $100,000 ($549), and $200,000 ($1,199). To pass, reach a 30% profit target while staying within the 10% maximum overall loss limit and completing at least 5 qualifying trading days (each with ≥1% net daily profit).',
    highlight: '30% Target • 10% Max Overall Loss • 5 Days (≥1%/day).',
  },
  {
    id: 'faq-2',
    category: 'evaluation',
    question: 'How is the 10% Maximum Overall Loss Limit calculated?',
    answer:
      'Your account is protected by a single 10% maximum overall account loss limit calculated from your initial balance (there is no separate daily-only cap). Reaching 10% overall drawdown immediately triggers a permanent HARD_BREACH and disables trading on that account.',
    highlight: '10% Max Overall Loss → Immediate HARD_BREACH.',
  },
  {
    id: 'faq-3',
    category: 'evaluation',
    question: 'What happens automatically once I meet both challenge completion criteria?',
    answer:
      'As soon as your Funded Challenge reaches the 30% profit target AND completes at least 5 qualifying trading days (≥1% profit per day), our engine automatically marks your challenge as PASSED and unlocks your corresponding Real Funded trading account for that exact package balance.',
    highlight: 'Automatic graduation to your Real Funded account.',
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
    question: 'What are the minimum withdrawal threshold, 7-day waiting period, and payout frequency rules?',
    answer:
      'The minimum withdrawal amount is strictly $250.00 in realized net trading profits with a 10% Withdrawal Fee. A mandatory 7-day waiting period applies before your first funded withdrawal. Standard withdrawals are processed once per week (WEEKLY); opting for the Daily Withdrawal Add-On (+15%) unlocks daily payouts after the initial 7-day wait.',
    highlight: '7-Day 1st Wait • Weekly Standard • +15% Daily Add-On.',
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
    question: 'What are the strict 5% single-trade and 5% combined open risk rules?',
    answer:
      'On Funded Challenge and Real Funded accounts, maximum risk per single trade is 5% of your current wallet balance, and maximum combined risk across all currently open trades cannot exceed 5% in aggregate. Violating either limit immediately triggers a permanent HARD_BREACH.',
    highlight: 'Max 5% Single & Combined Risk → Immediate HARD_BREACH.',
  },
  {
    id: 'faq-9',
    category: 'rules',
    question: 'Can I open multiple trades at the same time on the same currency pair?',
    answer:
      'No. Only one open trade is allowed per currency pair at a time. You may hold multiple open trades simultaneously only across different currency pairs, provided your combined open risk stays within 5% of your current wallet balance. Opening a duplicate position on the same pair triggers an immediate HARD_BREACH.',
    highlight: 'Max 1 Open Trade Per Currency Pair.',
  },
  {
    id: 'faq-10',
    category: 'rules',
    question: 'Why is there a 30-second minimum trade duration rule?',
    answer:
      'Funded binary options contracts must have an expiration window of at least 30 seconds (Self-Capital accounts are exempt and support trades from 5 seconds). This rule prevents tick-scalping latency abuse and ensures genuine directional trading.',
    highlight: 'Funded accounts require ≥ 30s expiry.',
  },
  {
    id: 'faq-11',
    category: 'rules',
    question: 'Are Martingale and Hedging strategies allowed?',
    answer:
      'No. Both Martingale trading (stake doubling after a loss) and Hedging (simultaneous opposing CALL/PUT positions on the same currency pair) are strictly prohibited and immediately trigger a permanent HARD_BREACH.',
    highlight: 'Martingale & Hedging → Immediate HARD_BREACH.',
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
    <section id="faq" data-testid="faq-section" className="py-16 md:py-24 relative bg-[#0b0f19] border-b border-white/[0.08] font-sans">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#111827] border border-[#0066ff]/40 text-[#0066ff] text-xs font-bold mb-3 tracking-wide">
            <HelpCircle className="w-3.5 h-3.5 text-[#0066ff]" />
            <span>KNOWLEDGE BASE &amp; SUPPORT DESK</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-[-0.025em] leading-[1.1] mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-[#9ca3af] text-base sm:text-[17px] font-normal sm:font-medium leading-relaxed">
            Everything you need to know about our binary evaluation phases, 3-minute withdrawal guarantee SLA, and risk rules.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-xl mx-auto mb-8">
          <Search className="w-4 h-4 text-[#9ca3af] absolute left-4 top-3.5" />
          <input
            type="text"
            placeholder="Search rules, withdrawal speed, drawdown formulas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#111827] border border-white/[0.08] rounded-xl py-3 pl-11 pr-10 text-sm text-white placeholder-[#9ca3af] focus:outline-none focus:border-[#0066ff] focus:ring-1 focus:ring-[#0066ff] shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-3 text-xs text-[#9ca3af] hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Filter Pills - FTMO Segmented */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === cat.id
                  ? 'bg-[#0066ff] text-white font-bold shadow-[0_2px_12px_rgba(0,102,255,0.35)]'
                  : 'bg-[#111827] text-[#9ca3af] hover:text-white hover:bg-[#161f33] border border-white/[0.08]'
              }`}
            >
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeCategory === cat.id ? 'bg-[#07090e] text-white' : 'bg-[#07090e] text-[#9ca3af]'
              }`}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Accordion List - FTMO Surface Cards with Smooth Animated Dropdowns */}
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
                      ? 'bg-[#111827] border-[#0066ff]/60 shadow-xl'
                      : 'bg-[#111827]/80 hover:bg-[#111827] border-white/[0.08] hover:border-white/20'
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
                          ? 'bg-[#0066ff]/20 border-[#0066ff]/40 text-[#0066ff]'
                          : 'bg-[#07090e] border-white/[0.08] text-[#9ca3af]'
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
                        <span className="hidden sm:inline-block text-[10px] font-mono text-[#ffaa00] bg-[#ff8800]/15 border border-[#ff8800]/30 px-2 py-0.5 rounded-full font-bold">
                          {faq.highlight}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-5 h-5 text-[#9ca3af] transition-transform duration-300 ease-in-out ${
                          isExpanded ? 'rotate-180 text-[#0066ff]' : ''
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
                      <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[#9ca3af] leading-relaxed border-t border-white/[0.08] mt-1">
                        <p>{faq.answer}</p>
                        {faq.highlight && (
                          <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#07090e] border border-[#ff8800]/30 text-xs font-mono text-[#ffaa00] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ffaa00] animate-pulse" />
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
            <div className="text-center py-10 p-6 rounded-2xl bg-[#111827] border border-white/[0.08]">
              <HelpCircle className="w-8 h-8 text-[#9ca3af] mx-auto mb-2" />
              <div className="text-sm font-bold text-white">No questions match your search query</div>
              <p className="text-xs text-[#9ca3af] mt-1">Try keywords like "withdrawal", "30s", "drawdown", or "KYC".</p>
            </div>
          )}
        </div>

        {/* 24/7 Support Friction Reducer Card */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#111827] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-[#0066ff]/15 border border-[#0066ff]/30 flex items-center justify-center text-[#0066ff] shadow-md shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Still have questions before getting funded?</h3>
              <p className="text-xs text-[#9ca3af] mt-0.5">
                Our institutional risk desk and VIP trader concierges are available 24/7 around the clock.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://t.me/bft_admin"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="faq-support-desk-link"
              className="px-5 py-3 rounded-xl bg-[#0066ff] hover:bg-[#1a75ff] text-white font-black text-xs flex items-center gap-2 shadow-[0_4px_14px_rgba(0,102,255,0.35)] transition-all"
            >
              <Send className="w-4 h-4 text-white" />
              <span>Support Desk</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
