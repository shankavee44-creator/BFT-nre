import React from 'react';
import { Zap, AlertTriangle, ArrowUp } from 'lucide-react';
import { BftLogo } from './BftLogo';

interface FooterProps {
  onNavigate: (tab: string) => void;
  onOpenAdminDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenAdminDashboard }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-white/[0.08] bg-[#07090e] text-[#9ca3af] text-xs py-12 relative font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BftLogo
                imgClassName="h-10 w-auto"
                testId="footer-bft-logo"
                alt="Binary Funded Trader (BFT) Bull Logo"
              />
              <div>
                <span className="text-base font-extrabold text-white tracking-tight block leading-tight">
                  Binary Funded Trader
                </span>
                <span className="text-[10px] text-[#ff8800] font-bold uppercase tracking-wider">
                  BFT Prime Prop Capital
                </span>
              </div>
            </div>
            <p className="text-[#9ca3af] text-xs leading-relaxed font-normal">
              Institutional proprietary trading firm specializing in binary options risk evaluation, funded capital allocation, and 3-minute guaranteed instant USDT payouts.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#ffaa00] font-bold">
              <Zap className="w-3.5 h-3.5 text-[#ffaa00] fill-[#ffaa00]" />
              <span>3-Min Payout SLA: Double Payout Warranty</span>
            </div>
          </div>

          {/* Funding Tiers */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Evaluation Models</h4>
            <ul className="space-y-2 font-medium">
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  One-Step Challenge ($2.5k - $100k)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  Two-Step Challenge (Lowest Entry)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-white transition-colors">
                  Instant Funded Account (No Evaluation)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('withdrawals')} className="hover:text-white transition-colors">
                  TRC-20 Instant Withdrawal Rules
                </button>
              </li>
            </ul>
          </div>

          {/* Prop Firm Rules */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Trading Guidelines</h4>
            <ul className="space-y-2 font-medium">
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-white transition-colors">
                  30-Second Minimum Trade Duration
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-white transition-colors">
                  High-Impact News Trading Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-white transition-colors">
                  Consistent Position Sizing (No 5x Spike)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-white transition-colors">
                  Martingale &amp; Inactivity Regulations
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('faq')} className="text-[#0066ff] hover:text-[#1a75ff] font-bold transition-colors">
                  FAQ &amp; Knowledge Base
                </button>
              </li>
            </ul>
          </div>

          {/* Quick SLA & Legal */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Institutional Security</h4>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#111827] border border-white/[0.08]">
                <span className="text-[10px] uppercase font-bold text-[#9ca3af] block">Settlement Rail</span>
                <span className="text-emerald-400 font-bold">TRON TRC-20 Smart Contract</span>
                <span className="text-[10px] text-[#9ca3af] block mt-1">Average dispatch speed: 1m 42s</span>
              </div>
              <button
                onClick={scrollToTop}
                className="w-full py-2 rounded-xl bg-[#111827] hover:bg-[#161f33] text-[#9ca3af] hover:text-white border border-white/[0.08] flex items-center justify-center gap-1.5 transition-colors font-semibold cursor-pointer"
              >
                <span>Back to Top</span>
                <ArrowUp className="w-3.5 h-3.5 text-[#0066ff]" />
              </button>
            </div>
          </div>
        </div>

        {/* Regulatory & Risk Disclaimer */}
        <div className="pt-6 border-t border-white/[0.08] text-[11px] leading-relaxed text-[#9ca3af] space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#ffaa00] shrink-0 mt-0.5" />
            <p>
              <strong className="text-white font-semibold">High Risk &amp; Regulatory Notice:</strong> Binary options and leveraged prop evaluations involve significant financial risk and may not be suitable for all investors. All accounts provided by Binary Funded Trader (BFT) operate with live institutional OTC market data feeds and strict drawdown protection rules. Past trading performance does not guarantee future results.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between text-[#9ca3af] pt-2 font-medium">
            <span>© {new Date().getFullYear()} Binary Funded Trader (BFT) Global Capital. All rights reserved.</span>
            <div className="flex items-center gap-3">
              <span>Platform Brand Shortcode: BFT • Institutional FTMO Edition</span>
              {onOpenAdminDashboard && (
                <button
                  type="button"
                  data-testid="footer-admin-portal-link"
                  onClick={onOpenAdminDashboard}
                  className="text-purple-400 hover:text-purple-300 hover:underline cursor-pointer transition-colors"
                >
                  Admin Portal
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
