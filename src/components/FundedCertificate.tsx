import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Award,
  Download,
  FileCheck,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Eye,
  RefreshCw,
  Lock,
  Calendar,
  User,
  ArrowRight,
  Share2,
} from 'lucide-react';
import { UserProfile, TradingAccount } from '../types';
import { supabase } from '../utils/supabase';
import {
  CERTIFICATE_CONSTANTS,
  formatCertificateDate,
  formatCertificateSubtitle,
  isUserEligibleForCertificate,
  renderCertificateToCanvas,
  downloadCertificatePng,
  downloadCertificatePdf,
} from '../utils/certificateGenerator';
import { soundEngine } from '../utils/soundEffects';

interface FundedCertificateProps {
  userProfile: UserProfile;
  accounts?: TradingAccount[];
  onOpenTerminal?: () => void;
  onOpenChallengeModal?: () => void;
}

export const FundedCertificate: React.FC<FundedCertificateProps> = ({
  userProfile,
  accounts = [],
  onOpenTerminal,
  onOpenChallengeModal,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic state fetched from Supabase
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [supabaseFullName, setSupabaseFullName] = useState<string>('');
  const [supabasePassedDate, setSupabasePassedDate] = useState<string>('');
  const [supabaseStatus, setSupabaseStatus] = useState<string>('');
  const [supabaseAccounts, setSupabaseAccounts] = useState<any[]>([]);

  // Selected account for multi-account traders
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // UI state
  const [renderLoading, setRenderLoading] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // 1. Fetch user's full_name, passed_date, and trading account status dynamically from Supabase
  useEffect(() => {
    let isMounted = true;

    async function fetchSupabaseData() {
      setSupabaseLoading(true);
      try {
        const userId = userProfile.id;
        const userEmail = (userProfile.email || '').toLowerCase().trim();

        // 1. Check profiles table for full_name and passed_date
        let fetchedName = userProfile.fullName || '';
        let fetchedDate = '';
        let fetchedAccountStatus = '';

        if (userId && !userId.startsWith('usr_')) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('full_name, passed_date, account_status, is_funded, created_at, updated_at')
            .eq('id', userId)
            .maybeSingle();

          if (profileRow) {
            if (profileRow.full_name) fetchedName = profileRow.full_name;
            if (profileRow.passed_date) fetchedDate = profileRow.passed_date;
            if (profileRow.account_status) fetchedAccountStatus = profileRow.account_status;
          }
        } else if (userEmail) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('full_name, passed_date, account_status, is_funded, created_at, updated_at')
            .eq('email', userEmail)
            .maybeSingle();

          if (profileRow) {
            if (profileRow.full_name) fetchedName = profileRow.full_name;
            if (profileRow.passed_date) fetchedDate = profileRow.passed_date;
            if (profileRow.account_status) fetchedAccountStatus = profileRow.account_status;
          }
        }

        // 2. Check trading_accounts table in Supabase
        let supaAccs: any[] = [];
        if (userId) {
          const { data: accData } = await supabase
            .from('trading_accounts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (Array.isArray(accData) && accData.length > 0) {
            supaAccs = accData;
          }
        }

        if (isMounted) {
          setSupabaseFullName(fetchedName || userProfile.fullName || 'Official BFT Trader');
          setSupabasePassedDate(fetchedDate);
          setSupabaseStatus(fetchedAccountStatus);
          setSupabaseAccounts(supaAccs);
        }
      } catch (err) {
        console.warn('Supabase certificate details fetch warning:', err);
      } finally {
        if (isMounted) {
          setSupabaseLoading(false);
        }
      }
    }

    fetchSupabaseData();

    // Subscribe to realtime changes on profiles and trading_accounts
    const channel = supabase
      .channel(`realtime:certificate:${userProfile.id || 'current'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => fetchSupabaseData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trading_accounts' },
        () => fetchSupabaseData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [userProfile.id, userProfile.email, userProfile.fullName]);

  // Combine passed accounts from Supabase and client props
  const allEligibleAccounts = React.useMemo(() => {
    const list: any[] = [];
    const seenIds = new Set<string>();

    // From Supabase
    for (const a of supabaseAccounts) {
      const s = (a.status || '').toLowerCase();
      const p = (a.phase || a.challenge_phase || '').toLowerCase();
      if (s === 'funded' || s === 'passed' || s === 'active_funded' || p === 'funded') {
        if (!seenIds.has(String(a.id))) {
          seenIds.add(String(a.id));
          list.push({
            id: a.id,
            tier: a.tier || a.account_type || 'Funded',
            tierName: a.tier_name || a.tier || 'BFT Funded Account',
            size: a.starting_balance || a.initial_balance || a.size || 100000,
            passedAt: a.passed_date || a.passed_at || a.updated_at || a.created_at,
          });
        }
      }
    }

    // From local props accounts
    for (const a of accounts) {
      const s = (a.status || '').toLowerCase();
      const p = (a.phase || a.challengePhase || '').toLowerCase();
      const t = (a.tier || '').toLowerCase();
      if (s === 'funded' || s === 'passed' || s === 'active_funded' || p === 'funded' || t === 'instant') {
        if (!seenIds.has(String(a.id))) {
          seenIds.add(String(a.id));
          list.push({
            id: a.id,
            tier: a.tier,
            tierName: a.tierName || a.tier || 'BFT Funded Account',
            size: a.size || a.initialBalance || 100000,
            passedAt: a.passedAt || (a as any).passed_date || (a as any).updated_at,
          });
        }
      }
    }

    return list;
  }, [supabaseAccounts, accounts]);

  // Check overall certificate eligibility
  const eligibility = React.useMemo(() => {
    return isUserEligibleForCertificate({
      profile: {
        is_funded: userProfile.fundedBalance ? userProfile.fundedBalance > 0 : undefined,
        account_status: supabaseStatus,
        fundedBalance: userProfile.fundedBalance,
      },
      accounts: allEligibleAccounts.length > 0 ? allEligibleAccounts : accounts,
      supabaseAccountStatus: supabaseStatus,
    });
  }, [userProfile, accounts, allEligibleAccounts, supabaseStatus]);

  const isEligible = eligibility.eligible;

  // Active account selection
  const activeAccount = React.useMemo(() => {
    if (selectedAccountId) {
      const found = allEligibleAccounts.find((a) => String(a.id) === String(selectedAccountId));
      if (found) return found;
    }
    return allEligibleAccounts[0] || null;
  }, [allEligibleAccounts, selectedAccountId]);

  // Effective Full Name and Passed Date
  const effectiveFullName =
    (supabaseFullName && supabaseFullName.trim()) ||
    (userProfile.fullName && userProfile.fullName.trim()) ||
    (userProfile.email ? userProfile.email.split('@')[0] : 'Official BFT Trader');

  const effectivePassedDate =
    supabasePassedDate ||
    activeAccount?.passedAt ||
    eligibility.passedDate ||
    new Date();

  const formattedDate = formatCertificateDate(effectivePassedDate);
  const formattedSubtitle = formatCertificateSubtitle(formattedDate);
  const certificateSerial = `BFT-CERT-${(activeAccount?.id || userProfile.id || '000001')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-6)
    .toUpperCase()}`;

  // 2. Render Certificate into Canvas (1920x1357 resolution)
  const drawCertificate = useCallback(async () => {
    if (!canvasRef.current) return;
    setRenderLoading(true);

    try {
      await renderCertificateToCanvas(canvasRef.current, {
        fullName: effectiveFullName,
        passedDate: effectivePassedDate,
        templateUrl: CERTIFICATE_CONSTANTS.DEFAULT_TEMPLATE_PATH,
        canvasWidth: CERTIFICATE_CONSTANTS.WIDTH,
        canvasHeight: CERTIFICATE_CONSTANTS.HEIGHT,
      });
    } catch (err) {
      console.error('Failed to render certificate onto canvas:', err);
    } finally {
      setRenderLoading(false);
    }
  }, [effectiveFullName, effectivePassedDate]);

  // Redraw when parameters change
  useEffect(() => {
    if (isEligible) {
      const timer = setTimeout(() => {
        drawCertificate();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEligible, drawCertificate]);

  // 3. PNG High-Res Download Action
  const handleDownloadPng = async () => {
    if (!canvasRef.current) return;
    setIsExportingPng(true);
    soundEngine.playUiClick();

    try {
      // Ensure canvas is rendered
      await drawCertificate();
      downloadCertificatePng(canvasRef.current, effectiveFullName);
      soundEngine.playTradeWin();
    } catch (err) {
      console.error('PNG download error:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  // 4. Print-Ready PDF Download Action
  const handleDownloadPdf = async () => {
    if (!canvasRef.current) return;
    setIsExportingPdf(true);
    soundEngine.playUiClick();

    try {
      // Ensure canvas is rendered
      await drawCertificate();
      downloadCertificatePdf(canvasRef.current, effectiveFullName);
      soundEngine.playTradeWin();
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleCopySerial = () => {
    soundEngine.playUiClick();
    navigator.clipboard.writeText(certificateSerial);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="certificates-dashboard-tab">
      {/* Top Banner & Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#12141a] via-[#0d0e12] to-[#08090b] border border-amber-500/20 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider font-mono">
              <Award className="w-3.5 h-3.5 text-amber-400" /> Official Prop Certification
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              Certified Funded Trader
              {isEligible && (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified & Issued
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Official institutional proof of your consistency and discipline. Personalized with your legal name,
              completion date, and authenticated BFT LLC credentials.
            </p>
          </div>

          {/* Quick stats / metadata */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-slate-400 text-[10px] uppercase">Trader Name</div>
              <div className="text-white font-bold truncate max-w-[180px]">{effectiveFullName}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-slate-400 text-[10px] uppercase">Issue Date</div>
              <div className="text-amber-400 font-bold">{formattedDate}</div>
            </div>
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-slate-400 text-[10px] uppercase">Serial Number</div>
              <button
                onClick={handleCopySerial}
                className="text-white hover:text-amber-400 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Click to copy certificate serial"
              >
                <span>{certificateSerial}</span>
                <span className="text-[10px] text-slate-400">{copiedId ? '✓' : '⧉'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Certificate Display Section */}
      {isEligible ? (
        <div className="space-y-6">
          {/* Certificate Toolbar & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e1015] border border-white/10">
            {/* Account Selector if multiple */}
            <div className="flex items-center gap-3">
              {allEligibleAccounts.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Select Account:</span>
                  <select
                    value={activeAccount?.id || ''}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {allEligibleAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                        {acc.tierName || acc.id} ({acc.id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Resolution: <strong className="text-white">1920 × 1357 (Ultra-HD)</strong></span>
                </div>
              )}
            </div>

            {/* Action Buttons: High-Res PNG and Print-Ready PDF */}
            <div className="flex items-center gap-3">
              <button
                data-testid="download-certificate-png-btn"
                onClick={handleDownloadPng}
                disabled={isExportingPng || renderLoading}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                <Download className={`w-4 h-4 text-amber-400 ${isExportingPng ? 'animate-bounce' : ''}`} />
                <span>{isExportingPng ? 'Generating PNG...' : 'Download High-Res PNG'}</span>
              </button>

              <button
                data-testid="download-certificate-pdf-btn"
                onClick={handleDownloadPdf}
                disabled={isExportingPdf || renderLoading}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <FileCheck className={`w-4 h-4 text-slate-950 ${isExportingPdf ? 'animate-spin' : ''}`} />
                <span>{isExportingPdf ? 'Generating PDF...' : 'Download Print-Ready PDF'}</span>
              </button>
            </div>
          </div>

          {/* Canvas Preview Container */}
          <div className="p-3 sm:p-6 rounded-3xl bg-[#090b0e] border border-amber-500/20 shadow-2xl relative flex items-center justify-center">
            {renderLoading && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3 rounded-3xl">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                <span className="text-sm font-bold text-white font-mono">Rendering Ultra-HD Certificate Canvas...</span>
              </div>
            )}

            {/* The HTML5 Canvas: Internal resolution 1920x1357, scaled responsively via CSS */}
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl shadow-2xl border border-white/10 bg-black">
              <canvas
                ref={canvasRef}
                data-testid="certificate-preview-canvas"
                width={CERTIFICATE_CONSTANTS.WIDTH}
                height={CERTIFICATE_CONSTANTS.HEIGHT}
                className="w-full h-auto block select-none"
                style={{
                  aspectRatio: '1920 / 1357',
                }}
              />
            </div>
          </div>

          {/* Certificate Details & Verification Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[#0e1015] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                <User className="w-4 h-4" /> Recipient Name Ribbon
              </div>
              <div className="text-lg font-black text-white">{effectiveFullName.toUpperCase()}</div>
              <p className="text-xs text-slate-400">
                Rendered with a dual gold gradient (#f5b963 to #c88a32) matching official BFT corporate typography.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0e1015] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                <Calendar className="w-4 h-4" /> Date of Passage
              </div>
              <div className="text-lg font-black text-white">{formattedSubtitle}</div>
              <p className="text-xs text-slate-400">
                Synchronized directly with your Supabase completion records and timestamp logs.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0e1015] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                <ShieldCheck className="w-4 h-4" /> Signatures & Seals
              </div>
              <div className="text-sm font-bold text-white">Victoria Sterling & Yousuf Al-Mansoori</div>
              <p className="text-xs text-slate-400">
                Endorsed by BFT LLC Executive Board with high-resolution gold medallion wax seal.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Unlocked / Inactive Evaluation Card */
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-b from-[#101217] to-[#0a0b0e] border border-white/10 text-center space-y-6 max-w-2xl mx-auto shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl sm:text-2xl font-black text-white">
              Funded Trader Certificate Locked
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              To unlock your official BFT Funded Trader Certificate, successfully pass an evaluation challenge or activate
              an Instant Funded account.
            </p>
          </div>

          {/* Criteria Checklist */}
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-left space-y-3 font-mono text-xs">
            <div className="text-slate-300 font-bold uppercase text-[11px] mb-2 tracking-wider">
              Certification Criteria:
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-amber-400 font-bold">1</span>
              <span><strong>01-Step Challenge:</strong> Reach 30% profit target without exceeding 10% daily / 15% overall drawdown.</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-amber-400 font-bold">2</span>
              <span><strong>02-Step Challenge:</strong> Complete Phase 1 (25%) and Phase 2 (15%) objectives.</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-amber-400 font-bold">3</span>
              <span><strong>Instant Funded:</strong> Unlocked immediately upon activating any Instant Funded tier.</span>
            </div>
          </div>

          {/* Action Button: Start Challenge */}
          {onOpenChallengeModal && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                onClick={() => {
                  soundEngine.playUiClick();
                  onOpenChallengeModal();
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                <span>Start Evaluation Challenge</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
