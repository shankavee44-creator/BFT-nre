import React from 'react';
import { Zap, AlertTriangle, ArrowUp } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
  onOpenAdminDashboard?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenAdminDashboard }) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-slate-800/80 bg-[#040814] text-slate-400 text-xs py-12 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#ff8800] flex items-center justify-center text-slate-950 font-mono font-black text-sm">
                BFT
              </div>
              <span className="text-base font-black text-white font-mono">Binary Funded Trader</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Institutional proprietary trading firm specializing in binary options risk evaluation, funded capital allocation, and 3-minute guaranteed instant USDT payouts.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-amber-400 font-mono font-bold">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>3-Min Payout SLA: Double Payout Warranty</span>
            </div>
          </div>

          {/* Funding Tiers */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 font-mono">Evaluation Models</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-amber-400 transition-colors">
                  One-Step Challenge ($2.5k - $10k)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-amber-400 transition-colors">
                  Two-Step Challenge (Lowest Entry)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('home')} className="hover:text-amber-400 transition-colors">
                  Instant Funded Account (No Evaluation)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('withdrawals')} className="hover:text-amber-400 transition-colors">
                  TRC-20 Instant Withdrawal Rules
                </button>
              </li>
            </ul>
          </div>

          {/* Prop Firm Rules */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 font-mono">Trading Guidelines</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-amber-400 transition-colors">
                  30-Second Minimum Trade Duration
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-amber-400 transition-colors">
                  High-Impact News Trading Policy
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-amber-400 transition-colors">
                  Consistent Position Sizing (No 5x Spike)
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('rules')} className="hover:text-amber-400 transition-colors">
                  Martingale & Inactivity Regulations
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('faq')} className="text-amber-400 hover:text-amber-300 font-bold transition-colors">
                  FAQ & Knowledge Base
                </button>
              </li>
            </ul>
          </div>

          {/* Quick SLA & Legal */}
          <div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3 font-mono">Institutional Security</h4>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-[#080d1a] border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">Settlement Rail</span>
                <span className="font-mono text-emerald-400 font-bold">TRON TRC-20 Smart Contract</span>
                <span className="text-[10px] text-slate-400 block mt-1">Average dispatch speed: 1m 42s</span>
              </div>
              <button
                onClick={scrollToTop}
                className="w-full py-2 rounded-xl bg-[#080d1a] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center justify-center gap-1.5 transition-colors font-mono"
              >
                <span>Back to Top</span>
                <ArrowUp className="w-3.5 h-3.5 text-amber-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Regulatory & Risk Disclaimer */}
        <div className="pt-6 border-t border-slate-800 text-[11px] leading-relaxed text-slate-400 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-300">High Risk & Regulatory Notice:</strong> Binary options and leveraged prop evaluations involve significant financial risk and may not be suitable for all investors. All accounts provided by Binary Funded Trader (BFT) operate with live institutional OTC market data feeds and strict drawdown protection rules. Past trading performance does not guarantee future results.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between text-slate-500 pt-2 font-mono">
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
