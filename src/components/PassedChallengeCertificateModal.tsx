import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Download, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { TradingAccount, UserProfile } from '../types';
import { BFT_BULL_LOGO_SRC } from './BftLogo';
import { soundEngine } from '../utils/soundEffects';

export interface PassedCertificateRecord {
  traderName: string;
  accountId: string;
  accountSize: number;
  passedAt: string;
  certificateId: string;
  realFundedAccountId?: string;
}

interface PassedChallengeCertificateModalProps {
  isOpen: boolean;
  record: PassedCertificateRecord | null;
  onClose: () => void;
  onOpenRealFundedAccount?: (realFundedAccountId: string) => void;
}

export function buildPassedCertificateRecord(
  account: TradingAccount,
  userProfile?: UserProfile | null,
  realFundedAccountId?: string
): PassedCertificateRecord {
  const traderName =
    (userProfile?.fullName || userProfile?.full_name || '').trim() ||
    (userProfile?.email ? userProfile.email.split('@')[0] : '') ||
    'BFT Funded Trader';
  const accountSize = Math.max(0, Number(account.size || account.initialBalance || 0));
  const rawDate = account.passed_at || account.passedAt || new Date().toISOString();
  const passedAt = String(rawDate).slice(0, 10);
  const certificateId = account.certificateId || `BFT-CERT-${account.id}`;

  return {
    traderName,
    accountId: account.sourceChallengeAccountId || account.id,
    accountSize,
    passedAt,
    certificateId,
    realFundedAccountId: realFundedAccountId || (account.account_tier === 'REAL_FUNDED' ? account.id : undefined),
  };
}

/**
 * Renders the permanent official BFT Certified Funded Trader template onto a high-res PNG canvas
 * for one-click download, faithfully preserving every border, color, seal, and signature.
 */
async function renderOfficialCertificateCanvas(
  record: PassedCertificateRecord
): Promise<HTMLCanvasElement> {
  const width = 1600;
  const height = 1132;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Deep charcoal-black background with subtle geometric facets (official template)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#17181c');
  bgGrad.addColorStop(0.5, '#121316');
  bgGrad.addColorStop(1, '#0e0f12');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.024)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(540, 0);
  ctx.lineTo(240, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
  ctx.beginPath();
  ctx.moveTo(width, 160);
  ctx.lineTo(1060, 580);
  ctx.lineTo(width, 960);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 2. Crisp double white border frame
  ctx.strokeStyle = '#F5F6F8';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, width - 72, height - 72);
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, width - 104, height - 104);

  // 3. Top-Left Title ("CERTIFIED" white + "FUNDED TRADER" orange)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '300 72px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('CERTIFIED', 108, 178);

  ctx.fillStyle = '#EA7D24';
  ctx.font = '900 94px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('FUNDED TRADER', 108, 276);

  // 4. Top-Right BFT Bull Shield + "BFT LLC"
  try {
    const logoImg = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = BFT_BULL_LOGO_SRC;
    });
    if (logoImg) {
      ctx.drawImage(logoImg, 995, 118, 140, 140);
    }
  } catch {
    // ignore logo image load fallback
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 84px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BFT LLC', 1152, 224);

  // 5. Presentation Line
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E5E7EB';
  ctx.font = '500 32px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('THIS CERTIFICATE IS PROUDLY PRESENTED TO', width / 2, 378);

  // 6. Dynamic Trader Name (centered in official blank presentation slot)
  const displayName = record.traderName.trim() || 'BFT Funded Trader';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 76px "Georgia", "Times New Roman", serif';
  ctx.fillText(displayName, width / 2, 488);

  // Subtle gold divider + completion record metadata beneath name
  ctx.strokeStyle = 'rgba(234, 125, 36, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 260, 514);
  ctx.lineTo(width / 2 + 260, 514);
  ctx.stroke();

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 21px "JetBrains Mono", monospace';
  const metaLine = `$${record.accountSize.toLocaleString('en-US')} FUNDED CHALLENGE  •  PASSED: ${record.passedAt}  •  ID: ${record.certificateId}`;
  ctx.fillText(metaLine, width / 2, 552);

  // 7. Official Template Statement (exact wording + orange accents)
  ctx.font = '500 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  const seg1 = 'HAS SUCCESSFULLY PASSED THE ';
  const seg2 = 'BFT FUNDED CHALLENGE';
  const seg3 = ' AND IS OFFICIALLY A ';
  const seg4 = 'BFT FUNDED TRADER.';
  const w1 = ctx.measureText(seg1).width;
  ctx.font = '800 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  const w2 = ctx.measureText(seg2).width;
  ctx.font = '500 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  const w3 = ctx.measureText(seg3).width;
  ctx.font = '800 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  const w4 = ctx.measureText(seg4).width;
  const totalW = w1 + w2 + w3 + w4;
  let curX = (width - totalW) / 2;
  const lineY = 636;
  ctx.textAlign = 'left';

  ctx.font = '500 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#E5E7EB';
  ctx.fillText(seg1, curX, lineY);
  curX += w1;

  ctx.font = '800 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#EA7D24';
  ctx.fillText(seg2, curX, lineY);
  curX += w2;

  ctx.font = '500 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#E5E7EB';
  ctx.fillText(seg3, curX, lineY);
  curX += w3;

  ctx.font = '800 26px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillStyle = '#EA7D24';
  ctx.fillText(seg4, curX, lineY);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#D1D5DB';
  ctx.font = '400 25px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(
    'THIS ACHIEVEMENT RECOGNIZES THEIR COMMITMENT IN MEETING THE TRADING OBJECTIVES, AS WELL AS',
    width / 2,
    702
  );
  ctx.fillText(
    'DEMONSTRATING THE FUNDAMENTAL SKILLS NECESSARY TO BEING A CONSISTENT AND DISCIPLINED TRADER.',
    width / 2,
    740
  );

  // 8. Left Signature: Yousuf Al-Mansoori (Dubai, UAE)
  ctx.strokeStyle = 'rgba(229, 231, 235, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(130, 922);
  ctx.lineTo(540, 922);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 54px "Georgia", "Brush Script MT", serif';
  ctx.fillText('Yousuf Al-Mansoori', 140, 898);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 20px "Inter", Arial, sans-serif';
  ctx.fillText('Dubai, UAE', 536, 912);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '500 32px "Inter", Arial, sans-serif';
  ctx.fillText('Yousuf Al-Mansoori', 335, 968);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 24px "Inter", Arial, sans-serif';
  ctx.fillText('SENIOR PERFORMANCE COACH', 335, 1004);

  // 9. Center Official Gold Seal ("FUNDED / BFT / FUNDED TRADER")
  const cx = width / 2;
  const cy = 918;
  ctx.save();
  // Outer scalloped gold rosette
  const goldGrad = ctx.createRadialGradient(cx - 25, cy - 25, 20, cx, cy, 130);
  goldGrad.addColorStop(0, '#FBE29D');
  goldGrad.addColorStop(0.55, '#CFA049');
  goldGrad.addColorStop(1, '#7D5A1C');
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  const spikes = 24;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 124 : 112;
    const angle = (i * Math.PI) / spikes;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Inner dark ring
  ctx.fillStyle = '#18140C';
  ctx.beginPath();
  ctx.arc(cx, cy, 98, 0, Math.PI * 2);
  ctx.fill();

  // Gold inner circle border
  ctx.strokeStyle = '#E8C272';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#F3CE7E';
  ctx.font = '800 20px "Inter", Arial, sans-serif';
  ctx.fillText('FUNDED', cx, cy - 72);
  ctx.font = '900 54px "Inter", Arial, sans-serif';
  ctx.fillText('BFT', cx, cy + 19);
  ctx.font = '700 16px "Inter", Arial, sans-serif';
  ctx.fillText('★  FUNDED TRADER  ★', cx, cy + 84);
  ctx.restore();

  // 10. Right Signature: Victoria Sterling (London, England)
  ctx.strokeStyle = 'rgba(229, 231, 235, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(1060, 922);
  ctx.lineTo(1470, 922);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'italic 54px "Georgia", "Brush Script MT", serif';
  ctx.fillText('Victoria Sterling', 1072, 898);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 20px "Inter", Arial, sans-serif';
  ctx.fillText('London, England', 1466, 912);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '500 32px "Inter", Arial, sans-serif';
  ctx.fillText('Victoria Sterling', 1265, 968);
  ctx.fillStyle = '#CBD5E1';
  ctx.font = '400 24px "Inter", Arial, sans-serif';
  ctx.fillText('FOUNDER & CEO OF BFT LLC', 1265, 1004);

  return canvas;
}

export const PassedChallengeCertificateModal: React.FC<PassedChallengeCertificateModalProps> = ({
  isOpen,
  record,
  onClose,
  onOpenRealFundedAccount,
}) => {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !record) return null;

  const handleDownloadPng = async () => {
    if (downloading) return;
    setDownloading(true);
    soundEngine.playUiClick();
    try {
      const canvas = await renderOfficialCertificateCanvas(record);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `BFT-Passed-Certificate-${record.accountId}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      data-testid="passed-challenge-certificate-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passed-cert-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[130] flex items-center justify-center p-2.5 sm:p-5 bg-black/90 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-5xl rounded-3xl bg-[#07090E] border border-purple-500/40 shadow-[0_0_70px_rgba(168,85,247,0.2)] overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="px-4 py-3.5 sm:px-6 bg-[#0B111A] border-b border-white/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/40 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-purple-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="passed-cert-modal-title"
                  className="text-sm sm:text-base font-black text-white tracking-tight"
                >
                  Challenge Passed — Official BFT Certificate Unlocked
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-black uppercase">
                  PASSED
                </span>
                {record.realFundedAccountId && (
                  <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[10px] font-mono font-black uppercase">
                    REAL FUNDED ACTIVE
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                Verification ID: <span className="text-white font-bold">{record.certificateId}</span> · Pass Date: {record.passedAt}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-passed-certificate-modal"
            onClick={onClose}
            aria-label="Close Certificate Modal"
            className="p-2 rounded-xl bg-[#06090F] border border-white/15 text-slate-300 hover:text-white hover:border-white/40 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Official Permanent BFT Certificate Template Canvas */}
        <div className="p-3 sm:p-6 overflow-y-auto flex-1 bg-[#050608]">
          <div
            data-testid="official-bft-certificate-frame"
            className="relative w-full mx-auto bg-gradient-to-br from-[#18191d] via-[#121316] to-[#0d0e11] p-3 sm:p-5 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden"
          >
            {/* Subtle diagonal geometric background layers matching the permanent template */}
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'linear-gradient(125deg, rgba(255,255,255,0.08) 0%, transparent 32%, rgba(255,255,255,0.04) 55%, transparent 78%)',
              }}
            />

            {/* Outer & Inner Double Crisp White Frame */}
            <div className="relative border-2 border-white/90 p-1.5 sm:p-2">
              <div className="relative border border-white/75 px-4 py-5 sm:px-10 sm:py-8 flex flex-col justify-between gap-5 sm:gap-7">
                {/* Row 1: CERTIFIED FUNDED TRADER (Left) & BFT Shield + BFT LLC (Right) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="leading-none select-none">
                    <div className="text-2xl sm:text-4xl font-light tracking-[0.16em] text-white uppercase">
                      CERTIFIED
                    </div>
                    <div className="text-3xl sm:text-5xl font-black tracking-tight text-[#EA7D24] uppercase mt-1">
                      FUNDED TRADER
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start sm:self-center">
                    <img
                      src={BFT_BULL_LOGO_SRC}
                      alt="BFT LLC Official Shield"
                      className="w-12 h-12 sm:w-16 sm:h-16 object-contain drop-shadow-[0_4px_14px_rgba(234,125,36,0.35)]"
                    />
                    <span className="text-2xl sm:text-4xl font-black tracking-tight text-white">
                      BFT LLC
                    </span>
                  </div>
                </div>

                {/* Row 2: Presented To + Dynamic Trader Name + Completion Record */}
                <div className="text-center space-y-2.5 sm:space-y-3 py-2 sm:py-4">
                  <div className="text-xs sm:text-base tracking-[0.18em] text-[#E5E7EB] uppercase font-medium">
                    THIS CERTIFICATE IS PROUDLY PRESENTED TO
                  </div>

                  <div
                    data-testid="certificate-trader-name"
                    className="text-2xl sm:text-5xl font-bold text-white tracking-wide py-1 sm:py-2 font-serif"
                  >
                    {record.traderName}
                  </div>

                  <div className="w-48 sm:w-72 h-[1.5px] bg-gradient-to-r from-transparent via-[#EA7D24]/80 to-transparent mx-auto" />

                  <div
                    data-testid="certificate-account-meta"
                    className="text-[11px] sm:text-xs font-mono text-slate-300 tracking-wider uppercase"
                  >
                    ${record.accountSize.toLocaleString('en-US')} Funded Challenge · Account{' '}
                    {record.accountId} · Passed {record.passedAt} · {record.certificateId}
                  </div>
                </div>

                {/* Row 3: Exact Official Certification Copy */}
                <div className="text-center space-y-2.5 max-w-3xl mx-auto">
                  <p className="text-xs sm:text-sm md:text-[15px] tracking-[0.06em] text-[#E5E7EB] uppercase leading-relaxed">
                    HAS SUCCESSFULLY PASSED THE{' '}
                    <span className="text-[#EA7D24] font-extrabold">BFT FUNDED CHALLENGE</span> AND
                    IS OFFICIALLY A{' '}
                    <span className="text-[#EA7D24] font-extrabold">BFT FUNDED TRADER.</span>
                  </p>
                  <p className="text-[11px] sm:text-xs md:text-[13px] tracking-[0.05em] text-[#D1D5DB] uppercase leading-relaxed">
                    THIS ACHIEVEMENT RECOGNIZES THEIR COMMITMENT IN MEETING THE TRADING OBJECTIVES,
                    AS WELL AS DEMONSTRATING THE FUNDAMENTAL SKILLS NECESSARY TO BEING A CONSISTENT
                    AND DISCIPLINED TRADER.
                  </p>
                </div>

                {/* Row 4: Signatures & Gold BFT Funded Trader Seal */}
                <div className="grid grid-cols-1 sm:grid-cols-3 items-end gap-6 pt-2">
                  {/* Left Signature: Yousuf Al-Mansoori */}
                  <div className="text-center sm:px-2">
                    <div className="flex items-end justify-between gap-2 border-b border-white/40 pb-1.5 mb-2">
                      <span className="text-base sm:text-xl italic font-serif text-white tracking-wide whitespace-nowrap">
                        Yousuf Al-Mansoori
                      </span>
                      <span className="text-[10px] text-slate-300 font-sans whitespace-nowrap">
                        Dubai, UAE
                      </span>
                    </div>
                    <div className="text-sm sm:text-base font-medium text-white">
                      Yousuf Al-Mansoori
                    </div>
                    <div className="text-[10px] sm:text-xs tracking-[0.12em] text-slate-300 uppercase mt-0.5">
                      SENIOR PERFORMANCE COACH
                    </div>
                  </div>

                  {/* Center Gold Seal */}
                  <div className="flex items-center justify-center">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1.5 bg-gradient-to-br from-[#FBE29D] via-[#CFA049] to-[#7D5A1C] shadow-[0_0_24px_rgba(207,160,73,0.45)] flex items-center justify-center">
                      <div className="w-full h-full rounded-full bg-[#18140C] border-2 border-[#E8C272] flex flex-col items-center justify-center text-center px-2">
                        <span className="text-[9px] font-black tracking-[0.2em] text-[#F3CE7E] uppercase">
                          FUNDED
                        </span>
                        <span className="text-2xl sm:text-3xl font-black text-[#F3CE7E] leading-none my-0.5 tracking-tight">
                          BFT
                        </span>
                        <span className="text-[8px] font-extrabold tracking-[0.12em] text-[#E8C272] uppercase">
                          ★ FUNDED TRADER ★
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Signature: Victoria Sterling */}
                  <div className="text-center sm:px-2">
                    <div className="flex items-end justify-between gap-2 border-b border-white/40 pb-1.5 mb-2">
                      <span className="text-base sm:text-xl italic font-serif text-white tracking-wide whitespace-nowrap">
                        Victoria Sterling
                      </span>
                      <span className="text-[10px] text-slate-300 font-sans whitespace-nowrap">
                        London, England
                      </span>
                    </div>
                    <div className="text-sm sm:text-base font-medium text-white">
                      Victoria Sterling
                    </div>
                    <div className="text-[10px] sm:text-xs tracking-[0.12em] text-slate-300 uppercase mt-0.5">
                      FOUNDER &amp; CEO OF BFT LLC
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="px-4 py-3.5 sm:px-6 bg-[#0B111A] border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Real Funded Account provisioned with <strong className="text-purple-300">90% Profit Split</strong> &amp;{' '}
              <strong className="text-white">Principal Locked</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            <button
              type="button"
              data-testid="download-passed-certificate-btn"
              onClick={handleDownloadPng}
              disabled={downloading}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-mono text-xs font-black flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-[#EA7D24]" />
              <span>{downloading ? 'Generating PNG...' : 'Download Certificate (PNG)'}</span>
            </button>

            {record.realFundedAccountId && onOpenRealFundedAccount && (
              <button
                type="button"
                data-testid="open-real-funded-from-cert-btn"
                onClick={() => {
                  soundEngine.playUiClick();
                  onOpenRealFundedAccount(record.realFundedAccountId!);
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-black flex items-center gap-2 cursor-pointer shadow-[0_0_24px_rgba(168,85,247,0.35)] transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>Open REAL FUNDED ({record.realFundedAccountId})</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
