import React from 'react';
import { Award, CheckCircle2, ShieldCheck, Sparkles, X, ArrowRight, Download } from 'lucide-react';
import { TradingAccount } from '../types';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  traderName: string;
  certificateId: string;
  passedAccount: TradingAccount | null;
  deployedAccount: TradingAccount | null;
  onLaunchRealAccount: () => void;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  traderName,
  certificateId,
  passedAccount,
  deployedAccount,
  onLaunchRealAccount,
}) => {
  if (!isOpen || !passedAccount || !deployedAccount) return null;

  const isFundedDeployment = deployedAccount.phase === 'funded';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#0c0c0e] border-2 border-[#ff8800] shadow-[0_0_60px_rgba(255,136,0,0.3)] p-6 sm:p-10 my-8 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Certificate Frame */}
        <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#16120b] via-[#0e0e12] to-[#14100a] border border-[#ffaa00]/50 relative overflow-hidden mb-6">
          <div className="absolute -top-20 -right-20 w-56 h-56 bg-[#ff8800]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between border-b border-[#ff8800]/30 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff8800] to-[#ffaa00] flex items-center justify-center text-slate-950 font-black shadow-lg">
                <Award className="w-7 h-7 stroke-[2.5]" />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[#ffaa00] font-bold">
                  BINARY FUNDED TRADER • OFFICIAL VERIFICATION
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Certificate of Prop Achievement
                </h3>
              </div>
            </div>
            <div className="text-right font-mono hidden sm:block">
              <div className="text-[10px] text-slate-400">CERTIFICATE ID</div>
              <div className="text-xs font-bold text-[#ffaa00]">{certificateId}</div>
            </div>
          </div>

          <div className="text-center py-4">
            <p className="text-xs uppercase tracking-widest text-slate-400 font-mono mb-2">
              THIS CERTIFIES THAT INSTITUTIONAL PROP TRADER
            </p>
            <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#ff8800] via-[#ffaa00] to-amber-200 font-serif italic mb-3">
              {traderName}
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
              Has successfully completed all strict risk & profit target parameters for the{' '}
              <strong className="text-white">
                ${passedAccount.size.toLocaleString()} {passedAccount.tierName}
              </strong>{' '}
              and is hereby promoted to{' '}
              <strong className="text-emerald-400">
                {isFundedDeployment ? 'Live Real Funded Capital' : 'Evaluation Phase 2'}
              </strong>.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-[#ff8800]/25 font-mono text-xs">
            <div className="bg-black/50 p-3 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-400 block">PASSED ACCOUNT (LOCKED)</span>
              <span className="text-white font-bold">{passedAccount.id}</span>
            </div>
            <div className="bg-black/50 p-3 rounded-xl border border-emerald-500/30">
              <span className="text-[10px] text-slate-400 block">NEW DEPLOYED ACCOUNT</span>
              <span className="text-emerald-400 font-black">{deployedAccount.id}</span>
            </div>
            <div className="bg-black/50 p-3 rounded-xl border border-[#ff8800]/30">
              <span className="text-[10px] text-slate-400 block">DEPLOYED BALANCE</span>
              <span className="text-[#ffaa00] font-black">
                ${deployedAccount.currentBalance.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> Verified by BFT Risk Engine
            </span>
            <span>Issued: {new Date().toLocaleDateString()}</span>
          </div>
        </div>

        {/* Account Transition Explanation */}
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 mb-6 text-xs text-slate-200 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-white mb-0.5">
              Automated Prop Account Deployment Complete
            </div>
            <p className="text-slate-300 leading-relaxed">
              Your previous evaluation account (<strong>{passedAccount.id}</strong>) has been archived with status{' '}
              <span className="text-emerald-400 font-mono font-bold">PASSED</span>. Your new clean{' '}
              <strong>{isFundedDeployment ? 'Real Funded Account' : 'Phase 2 Account'}</strong> (
              <span className="text-[#ffaa00] font-mono font-bold">{deployedAccount.id}</span>) is now active with{' '}
              <strong>${deployedAccount.currentBalance.toLocaleString()}</strong> balance.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => window.print()}
            className="px-5 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-mono text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#ffaa00]" />
            <span>Save Certificate</span>
          </button>
          <button
            onClick={() => {
              onLaunchRealAccount();
              onClose();
            }}
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] hover:brightness-110 text-slate-950 font-black text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl glow-gold cursor-pointer"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>
              Launch {isFundedDeployment ? 'Real Funded Account' : 'Phase 2 Account'} ({deployedAccount.id})
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
