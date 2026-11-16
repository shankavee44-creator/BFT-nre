import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Download,
  FileImage,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { TradingAccount } from '../types';
import { buildChallengeCertificateData } from '../utils/fundedSimulation';
import {
  CERTIFICATE_CONSTANTS,
  downloadCertificatePdf,
  downloadCertificatePng,
  renderCertificateToCanvas,
} from '../utils/certificateGenerator';
import { soundEngine } from '../utils/soundEffects';

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  traderName: string;
  certificateId?: string;
  passedAccount: TradingAccount | null;
  deployedAccount?: TradingAccount | null;
  passDate?: string | number | Date | null;
  onLaunchRealAccount: () => void;
  claimButtonLabel?: string;
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  traderName,
  certificateId,
  passedAccount,
  deployedAccount = null,
  passDate,
  onLaunchRealAccount,
  claimButtonLabel = 'Claim Funded Account',
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<'pdf' | 'png' | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);

  const certData = useMemo(
    () =>
      buildChallengeCertificateData({
        traderName,
        passedAccount,
        deployedAccount,
        certificateId,
        passDate,
      }),
    [traderName, passedAccount, deployedAccount, certificateId, passDate]
  );

  const effectivePassDateInput = useMemo(
    () =>
      passDate ||
      (passedAccount as any)?.passedAt ||
      (passedAccount as any)?.passed_date ||
      (deployedAccount as any)?.createdDate ||
      new Date(),
    [passDate, passedAccount, deployedAccount]
  );

  const drawTemplateCertificate = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    setRenderLoading(true);
    try {
      await renderCertificateToCanvas(canvas, {
        fullName: certData.traderName,
        passedDate: effectivePassDateInput,
        templateUrl: CERTIFICATE_CONSTANTS.DEFAULT_TEMPLATE_PATH,
        canvasWidth: CERTIFICATE_CONSTANTS.WIDTH,
        canvasHeight: CERTIFICATE_CONSTANTS.HEIGHT,
      });
    } catch (err) {
      console.error('Failed to render certificate modal canvas:', err);
    } finally {
      setRenderLoading(false);
    }
  }, [certData.traderName, effectivePassDateInput]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      drawTemplateCertificate();
    }, 30);
    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, drawTemplateCertificate]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPhase2Only = deployedAccount?.phase === 'phase_2';
  const effectiveClaimLabel = isPhase2Only ? 'Launch Phase 2 Account' : claimButtonLabel;

  const handleDownloadPdf = async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    setIsExporting('pdf');
    soundEngine.playUiClick();
    try {
      await drawTemplateCertificate();
      downloadCertificatePdf(canvas, certData.traderName);
      const safeName = certData.traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
      setDownloadNotice(`PDF saved: BFT_Funded_Trader_Certificate_${safeName}.pdf`);
      soundEngine.playTradeWin();
      setTimeout(() => setDownloadNotice(null), 3500);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadPng = async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    setIsExporting('png');
    soundEngine.playUiClick();
    try {
      await drawTemplateCertificate();
      downloadCertificatePng(canvas, certData.traderName);
      const safeName = certData.traderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'Trader';
      setDownloadNotice(`Image saved: BFT_Funded_Trader_Certificate_${safeName}.png`);
      soundEngine.playTradeWin();
      setTimeout(() => setDownloadNotice(null), 3500);
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div
      data-testid="challenge-passed-certificate-modal"
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-5 bg-[#020408]/90 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl rounded-3xl bg-[#06090F] border border-[#38BDF8]/40 shadow-[0_0_70px_rgba(56,189,248,0.2)] p-4 sm:p-6 my-auto">
        <button
          type="button"
          aria-label="Close certificate modal"
          data-testid="close-certificate-modal-btn"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pr-10 mb-3.5">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/35 text-[#38BDF8] text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
              <Award className="w-3 h-3 text-[#00E5FF]" />
              <span>BFT Funded Graduation Suite</span>
            </div>
            <h2
              data-testid="certificate-modal-title"
              className="text-lg sm:text-xl font-black text-white tracking-tight"
            >
              Challenge Passed &amp; Certificate
            </h2>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-bold whitespace-nowrap shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span data-testid="certificate-verification-badge">VERIFIED • {certData.verificationId}</span>
          </div>
        </div>

        {/* High-Resolution Official Template Canvas Preview + Credential Summary Strip */}
        <div className="rounded-2xl bg-[#0B111A] border border-amber-500/30 p-3 mb-3.5 shadow-inner">
          <div className="relative w-full max-w-[540px] mx-auto overflow-hidden rounded-xl border border-amber-500/25 bg-[#04070D]">
            {renderLoading && (
              <div className="absolute inset-0 bg-[#04070D]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                <span className="text-xs font-mono font-bold text-white">Rendering Official BFT Certificate...</span>
              </div>
            )}
            <canvas
              ref={previewCanvasRef}
              data-testid="graduation-certificate-canvas"
              width={CERTIFICATE_CONSTANTS.WIDTH}
              height={CERTIFICATE_CONSTANTS.HEIGHT}
              className="w-full h-auto block select-none"
              style={{ aspectRatio: '1920 / 1357' }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 font-mono text-xs">
            <div className="p-2 rounded-xl bg-[#06090F] border border-white/10">
              <span className="text-[10px] uppercase text-slate-400 block">Trader Name</span>
              <span
                data-testid="certificate-trader-name"
                className="text-white font-bold break-words block mt-0.5 text-[11px] leading-snug"
              >
                {certData.traderName}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[#06090F] border border-[#38BDF8]/25">
              <span className="text-[10px] uppercase text-slate-400 block">Challenge Tier</span>
              <span
                data-testid="certificate-challenge-tier"
                className="text-[#38BDF8] font-bold block mt-0.5 text-[11px] leading-snug"
              >
                {certData.challengeTier}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[#06090F] border border-white/10">
              <span className="text-[10px] uppercase text-slate-400 block">Pass Date</span>
              <span
                data-testid="certificate-pass-date"
                className="text-white font-bold tabular-nums block mt-0.5 text-[11px] leading-snug"
              >
                {certData.passDateFormatted}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-[#06090F] border border-emerald-500/25">
              <span className="text-[10px] uppercase text-slate-400 block">Verification ID</span>
              <span
                data-testid="certificate-verification-id"
                className="text-emerald-400 font-bold tabular-nums break-all block mt-0.5 text-[11px] leading-snug"
              >
                {certData.verificationId}
              </span>
            </div>
          </div>
        </div>

        {/* Account Transition Notice */}
        <div className="p-3 rounded-2xl bg-[#0B111A] border border-[#38BDF8]/25 mb-3.5 text-xs text-slate-200 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-[#00E5FF] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-white">
              {isPhase2Only
                ? 'Phase 1 Evaluation Completed — Phase 2 Provisioned'
                : 'Graduation Confirmed — Live Funded Account Ready'}
            </div>
            <p className="text-slate-300 leading-snug text-[11px]">
              Credential <span className="font-mono text-[#38BDF8] font-bold">{certData.verificationId}</span> has been issued to{' '}
              <strong className="text-white">{certData.traderName}</strong> for{' '}
              <strong className="text-white">{certData.challengeTier}</strong> ({certData.profitSplitPercent}% trader profit split).
            </p>
          </div>
        </div>

        {downloadNotice && (
          <div
            data-testid="certificate-download-notice"
            className="mb-3 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold flex items-center gap-2"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{downloadNotice}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            type="button"
            data-testid="download-certificate-modal-btn"
            disabled={isExporting !== null || renderLoading}
            onClick={handleDownloadPdf}
            className="px-4 py-2.5 min-h-[42px] rounded-xl bg-[#0B111A] hover:bg-[#082F49]/70 border border-[#38BDF8]/45 hover:border-[#00E5FF] text-[#38BDF8] hover:text-white font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#00E5FF] shrink-0" />
            <span>{isExporting === 'pdf' ? 'Exporting PDF...' : 'Download Certificate'}</span>
          </button>

          <button
            type="button"
            data-testid="download-certificate-png-modal-btn"
            disabled={isExporting !== null || renderLoading}
            onClick={handleDownloadPng}
            className="px-4 py-2.5 min-h-[42px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <FileImage className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <span>{isExporting === 'png' ? 'Saving PNG...' : 'Save Image (PNG)'}</span>
          </button>

          <button
            type="button"
            data-testid="claim-funded-account-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onLaunchRealAccount();
              onClose();
            }}
            className="flex-1 py-2.5 px-5 min-h-[42px] rounded-xl bg-gradient-to-r from-[#38BDF8] to-[#00E5FF] hover:brightness-110 text-[#06090F] font-black text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(56,189,248,0.3)] transition-all whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-4 h-4 fill-[#06090F] shrink-0" />
            <span>{effectiveClaimLabel}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5] shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
