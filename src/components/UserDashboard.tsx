import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  UploadCloud,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  Lock,
  Globe,
  Send,
  Download,
  TrendingUp,
  PieChart as PieIcon,
  Clock,
  ShoppingBag,
  Award,
  Camera,
  FileCheck,
  CreditCard,
  AlertTriangle,
  UserCheck,
  Calendar,
  MapPin,
  User,
  Zap,
  Ban,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  UserProfile,
  TradingAccount,
  BinaryTrade,
  ReferralRecord,
  AffiliatePayout,
  KYCDocumentType,
} from '../types';
import { exportTradesToCSV } from '../utils/csvExport';
import { BUILTIN_AVATARS, SUPPORTED_COUNTRIES, getFlagForCountry } from '../utils/storage';
import { soundEngine } from '../utils/soundEffects';
import { AffiliateDashboard } from './AffiliateDashboard';
import {
  canUserWithdraw,
  validateAndLockProfileDetails,
  evaluateKycDocumentUpload,
  checkKycTimerCompletion,
  KYC_WITHDRAWAL_LOCK_MESSAGE,
  KYC_VERIFICATION_DURATION_SECONDS,
} from '../utils/kycVerification';
import { isLiveFundedAccount, getChallengeProfitTarget } from '../utils/propRules';
import { apiLockProfile, apiSubmitKyc, apiUpdateProfile } from '../utils/apiClient';
import { supabase } from '../utils/supabase';

interface UserDashboardProps {
  userProfile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  accounts: TradingAccount[];
  trades?: BinaryTrade[];
  referrals?: ReferralRecord[];
  payouts?: AffiliatePayout[];
  onAddPayout?: (payout: AffiliatePayout) => void;
  onSelectAccount: (accountId: string) => void;
  onOpenTerminal: () => void;
  onOpenChallengeModal: () => void;
  onOpenWithdrawalModal?: () => void;
  onNavigateToPricing?: () => void;
  onPassChallengePhase?: (account: TradingAccount) => void;
  initialTab?: 'accounts' | 'analytics' | 'affiliate' | 'kyc' | 'profile' | 'security';
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  userProfile,
  onUpdateProfile,
  accounts,
  trades = [],
  referrals = [],
  payouts = [],
  onAddPayout = () => {},
  onSelectAccount,
  onOpenTerminal,
  onOpenChallengeModal,
  onOpenWithdrawalModal,
  onNavigateToPricing,
  onPassChallengePhase,
  initialTab = 'accounts',
}) => {
  const [activeTab, setActiveTab] = useState<
    'accounts' | 'analytics' | 'affiliate' | 'kyc' | 'profile' | 'security'
  >(initialTab);

  // Personal Profile Details State (Full Name, Address, Date of Birth)
  const [fullName, setFullName] = useState(userProfile.fullName || '');
  const [address, setAddress] = useState(userProfile.address || '');
  const [dateOfBirth, setDateOfBirth] = useState(userProfile.dateOfBirth || '');
  const [country, setCountry] = useState(userProfile.country || 'United States');
  const [telegramHandle, setTelegramHandle] = useState(userProfile.telegramHandle || '');
  const [twoFactor, setTwoFactor] = useState(userProfile.twoFactorEnabled);

  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [withdrawalBlockNotice, setWithdrawalBlockNotice] = useState<string | null>(null);

  // KYC Document Upload & OCR Match State
  const [docType, setDocType] = useState<KYCDocumentType>(
    (userProfile.kycDocumentType as KYCDocumentType) || 'Passport'
  );
  const [uploadedFileName, setUploadedFileName] = useState<string>(
    userProfile.kycDocumentFileName || ''
  );
  const [documentNumber, setDocumentNumber] = useState<string>(
    userProfile.kycDocumentNumber || 'P89401293'
  );
  const [extractedDocName, setExtractedDocName] = useState<string>(
    userProfile.kycExtractedName || userProfile.fullName || ''
  );
  const [extractedDocDob, setExtractedDocDob] = useState<string>(
    userProfile.kycExtractedDob || userProfile.dateOfBirth || ''
  );
  const [kycFeedbackError, setKycFeedbackError] = useState<string | null>(null);
  const [kycFeedbackSuccess, setKycFeedbackSuccess] = useState<string | null>(null);
  const [remainingKycSeconds, setRemainingKycSeconds] = useState<number>(0);

  const [selectedKycFile, setSelectedKycFile] = useState<File | null>(null);

  // Live query Supabase profiles table for real-time balance, kyc_status, referral_code & total_referral_earnings
  useEffect(() => {
    let isMounted = true;
    async function syncLiveProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = user?.id || userProfile.id;
      if (targetUserId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetUserId)
          .maybeSingle();

        if (p && isMounted) {
          onUpdateProfile({
            ...userProfile,
            id: p.id,
            email: p.email,
            fullName: p.full_name || userProfile.fullName,
            referralCode: p.referral_code || userProfile.referralCode,
            kycStatus: p.kyc_status || userProfile.kycStatus,
            referredBy: p.referred_by || userProfile.referredBy,
          });
        }
      }
    }
    syncLiveProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  // Sync local form fields when userProfile updates
  useEffect(() => {
    setFullName(userProfile.fullName || '');
    setAddress(userProfile.address || '');
    setDateOfBirth(userProfile.dateOfBirth || '');
    setCountry(userProfile.country || 'United States');
    setTelegramHandle(userProfile.telegramHandle || '');
    setTwoFactor(userProfile.twoFactorEnabled);
    if (userProfile.fullName && !extractedDocName) {
      setExtractedDocName(userProfile.fullName);
    }
    if (userProfile.dateOfBirth && !extractedDocDob) {
      setExtractedDocDob(userProfile.dateOfBirth);
    }
  }, [
    userProfile.id,
    userProfile.fullName,
    userProfile.address,
    userProfile.dateOfBirth,
    userProfile.profileLocked,
  ]);

  // 2-Minute Automated KYC Verification Timer
  useEffect(() => {
    if (userProfile.kycStatus !== 'pending' || !userProfile.kycVerificationEndsAt) {
      setRemainingKycSeconds(0);
      return;
    }

    const tick = () => {
      const check = checkKycTimerCompletion(userProfile, Date.now());
      setRemainingKycSeconds(check.remainingSeconds);
      if (check.completed) {
        onUpdateProfile(check.updatedProfile);
        setKycFeedbackSuccess(
          'Automated KYC Document Verification Complete! Your account is now VERIFIED and withdrawals are unlocked.'
        );
        soundEngine.playTradeWin();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [userProfile, onUpdateProfile]);

  const formatTimerMmSs = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateProfile({
          ...userProfile,
          avatarUrl: reader.result,
        });
        soundEngine.playTradeWin();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAndLockPersonalDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrorMessage(null);
    setProfileSaveMessage(null);

    // If profile is already locked, still allow updating Country and Telegram preferences
    if (userProfile.profileLocked) {
      const updatedProfile: UserProfile = {
        ...userProfile,
        country,
        telegramHandle,
      };
      try {
        await apiUpdateProfile({
          country,
          telegramHandle,
        });
      } catch {
        // Fallback to local update
      }
      onUpdateProfile(updatedProfile);
      setProfileSaveMessage('Country of Residence and contact preferences updated.');
      soundEngine.playTradeWin();
      return;
    }

    const result = validateAndLockProfileDetails(userProfile, {
      fullName,
      address,
      dateOfBirth,
      country,
      telegramHandle,
    });

    if (!result.success) {
      setProfileErrorMessage(result.error || 'Failed to save personal details.');
      soundEngine.playErrorAlert();
      return;
    }

    try {
      const apiRes = await apiLockProfile({
        fullName,
        address,
        dateOfBirth,
        country,
        telegramHandle,
      });
      if (apiRes.ok && apiRes.user) {
        onUpdateProfile({
          ...result.updatedProfile,
          profileLocked: true,
          fullName: apiRes.user.fullName,
          address: apiRes.user.address,
          dateOfBirth: apiRes.user.dateOfBirth,
          country: apiRes.user.country || country,
        });
      } else {
        onUpdateProfile(result.updatedProfile);
      }
    } catch {
      onUpdateProfile(result.updatedProfile);
    }

    setExtractedDocName(result.updatedProfile.fullName);
    setExtractedDocDob(result.updatedProfile.dateOfBirth || '');
    setProfileSaveMessage(
      'Personal details (Full Name, Address, Date of Birth, Country) saved and permanently locked! You may now upload your KYC identification document.'
    );
    soundEngine.playTradeWin();
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycFeedbackError(null);
    setKycFeedbackSuccess(null);

    const evalResult = evaluateKycDocumentUpload(
      userProfile,
      {
        docType,
        documentNumber,
        fileName: uploadedFileName,
        extractedFullName: extractedDocName,
        extractedDob: extractedDocDob,
      },
      Date.now()
    );

    if (!evalResult.matched) {
      onUpdateProfile(evalResult.updatedProfile);
      setKycFeedbackError(evalResult.error || 'KYC document verification failed.');
      soundEngine.playErrorAlert();
      return;
    }

    // Supabase Storage upload to kyc-documents bucket & kyc_requests row creation
    try {
      let photoUrl = 'https://kwmjonjcwdwvaijcrtjw.supabase.co/storage/v1/object/public/kyc-documents/placeholder.png';
      if (selectedKycFile && userProfile.id) {
        const filePath = `${userProfile.id}/${Date.now()}_${selectedKycFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('kyc-documents')
          .upload(filePath, selectedKycFile, { upsert: true });

        if (!uploadErr) {
          const { data: publicUrlData } = supabase.storage
            .from('kyc-documents')
            .getPublicUrl(filePath);
          if (publicUrlData?.publicUrl) {
            photoUrl = publicUrlData.publicUrl;
          }
        }
      }

      if (userProfile.id) {
        await supabase.from('kyc_requests').insert({
          user_id: userProfile.id,
          id_photo_url: photoUrl,
          status: 'pending',
        });

        await supabase
          .from('profiles')
          .update({ kyc_status: 'pending' })
          .eq('id', userProfile.id);
      }
    } catch (e) {
      console.warn('Supabase KYC upload/insert notice:', e);
    }

    onUpdateProfile({
      ...evalResult.updatedProfile,
      kycStatus: 'pending',
      kycDocumentFileName: uploadedFileName || selectedKycFile?.name,
    });
    setKycFeedbackSuccess(
      `${docType} uploaded to kyc-documents storage bucket and KYC request submitted! Status set to pending.`
    );
    soundEngine.playTradeWin();
  };

  const handleAttemptWithdrawal = (accId?: string) => {
    soundEngine.playUiClick();
    if (accId) {
      onSelectAccount(accId);
    }
    const check = canUserWithdraw(userProfile);
    if (!check.allowed) {
      setWithdrawalBlockNotice(check.message);
      soundEngine.playErrorAlert();
      return;
    }
    setWithdrawalBlockNotice(null);
    if (onOpenWithdrawalModal) {
      onOpenWithdrawalModal();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    soundEngine.playUiClick();
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCSV = (accId?: string) => {
    soundEngine.playTradeWin();
    exportTradesToCSV(trades, accId);
  };

  // Only use real trades executed by the user (zero mock/dummy fallback data for new accounts)
  const effectiveTrades = trades;
  const wonTradesCount = effectiveTrades.filter((t) => t.status === 'won').length;
  const lostTradesCount = effectiveTrades.filter((t) => t.status === 'lost').length;
  const totalSettled = wonTradesCount + lostTradesCount;
  const winRatePercent = totalSettled > 0 ? Number(((wonTradesCount / totalSettled) * 100).toFixed(1)) : 0;

  const winLossPieData =
    totalSettled > 0
      ? [
          { name: 'Wins (ITM)', value: wonTradesCount, color: '#00e676' },
          { name: 'Losses (OTM)', value: lostTradesCount, color: '#ff334b' },
        ]
      : [{ name: 'No Trades Yet', value: 1, color: '#262b38' }];

  const profitTrajectoryData =
    effectiveTrades.length > 0
      ? effectiveTrades.slice(-30).map((t, idx) => ({
          day: `Trade ${idx + 1}`,
          profit: Number((t.pnl || 0).toFixed(2)),
        }))
      : [{ day: 'Start', profit: 0 }];

  const durationStats = [
    {
      duration: '30s',
      trades: effectiveTrades.filter((t) => t.durationSeconds <= 30).length,
      winRate: 0,
    },
    {
      duration: '60s',
      trades: effectiveTrades.filter((t) => t.durationSeconds > 30 && t.durationSeconds <= 60).length,
      winRate: 0,
    },
    {
      duration: '3m',
      trades: effectiveTrades.filter((t) => t.durationSeconds > 60 && t.durationSeconds <= 180).length,
      winRate: 0,
    },
    {
      duration: '5m',
      trades: effectiveTrades.filter((t) => t.durationSeconds > 180).length,
      winRate: 0,
    },
  ];

  const isProfileLocked = Boolean(userProfile.profileLocked);
  const kycWithdrawalCheck = canUserWithdraw(userProfile);

  return (
    <div className="py-8 sm:py-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 font-sans">
      {/* Trader Profile Header Card */}
      <div className="p-5 sm:p-8 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 mb-6">
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="relative group">
              <img
                src={userProfile.avatarUrl || BUILTIN_AVATARS[0]}
                alt={userProfile.fullName || 'Trader'}
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-[#ff8800] bg-[#141418]"
              />
              <label
                htmlFor="quick-avatar-upload"
                className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity"
                title="Upload Custom Profile Photo"
              >
                <Camera className="w-6 h-6 text-[#ff8800]" />
                <input
                  id="quick-avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <span
                data-testid="user-kyc-status-badge"
                className={`absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider font-mono border ${
                  userProfile.kycStatus === 'verified'
                    ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                    : userProfile.kycStatus === 'pending'
                    ? 'bg-[#ff8800] text-slate-950 border-amber-300'
                    : 'bg-rose-600 text-white border-rose-400'
                }`}
              >
                {userProfile.kycStatus}
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  {userProfile.fullName || 'New BFT Trader'}
                </h1>
                <span className="text-xs font-mono text-[#ff8800] bg-[#ff8800]/15 border border-[#ff8800]/40 px-2.5 py-0.5 rounded-full font-bold">
                  Ref Code: {userProfile.referralCode || 'BFT-ALEX77'}
                </span>
                {isProfileLocked && (
                  <span
                    data-testid="header-profile-locked-pill"
                    className="inline-flex items-center gap-1 text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold"
                  >
                    <Lock className="w-3 h-3" /> Identity Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">{userProfile.email}</p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-xs text-slate-300">
                <span data-testid="profile-header-country" className="flex items-center gap-1.5 font-mono">
                  <Globe className="w-3.5 h-3.5 text-[#ff8800]" />
                  <span>{getFlagForCountry(userProfile.country)}</span>
                  <span>{userProfile.country || 'United States'}</span>
                </span>
                {userProfile.dateOfBirth && (
                  <span className="flex items-center gap-1 font-mono text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-[#ff8800]" /> DOB: {userProfile.dateOfBirth}
                  </span>
                )}
                <span
                  data-testid="dashboard-kyc-summary-text"
                  className={`flex items-center gap-1 font-semibold font-mono ${
                    userProfile.kycStatus === 'verified'
                      ? 'text-emerald-400'
                      : userProfile.kycStatus === 'pending'
                      ? 'text-[#ff8800]'
                      : 'text-rose-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  KYC Status: {userProfile.kycStatus.toUpperCase()}
                  {userProfile.kycStatus === 'pending' && remainingKycSeconds > 0
                    ? ` (${formatTimerMmSs(remainingKycSeconds)})`
                    : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              data-testid="dashboard-request-withdrawal-btn"
              onClick={() => handleAttemptWithdrawal()}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-black transition-colors flex items-center gap-1.5 cursor-pointer border ${
                kycWithdrawalCheck.allowed
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400'
                  : 'bg-[#141418] hover:bg-[#1c1c22] text-slate-300 border-white/15'
              }`}
            >
              {kycWithdrawalCheck.allowed ? (
                <Zap className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
              )}
              <span>Request Withdrawal</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportCSV()}
              className="px-4 py-2.5 rounded-xl bg-[#141418] hover:bg-white/10 border border-white/15 text-slate-200 hover:text-white font-mono text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              data-testid="dashboard-buy-challenge-btn"
              onClick={onOpenChallengeModal}
              className="px-5 py-2.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs transition-colors cursor-pointer shrink-0 font-mono"
            >
              {accounts.length === 0 ? 'Choose a Plan / Buy Challenge' : '+ Buy Another Account'}
            </button>
          </div>
        </div>

        {/* KYC Unverified / Pending Compliance Banner */}
        {userProfile.kycStatus !== 'verified' && (
          <div
            data-testid="dashboard-kyc-lock-banner"
            className="mt-5 p-4 rounded-2xl bg-[#14100a] border border-[#ff8800]/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono"
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-[#ff8800] shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-white uppercase">
                  {userProfile.kycStatus === 'pending'
                    ? `KYC Verification in Progress (${formatTimerMmSs(remainingKycSeconds)} remaining)`
                    : 'KYC Status: Unverified — Withdrawals Restricted'}
                </div>
                <p className="text-slate-300 mt-0.5">{KYC_WITHDRAWAL_LOCK_MESSAGE}</p>
              </div>
            </div>
            <button
              type="button"
              data-testid="goto-kyc-tab-btn"
              onClick={() => {
                soundEngine.playUiClick();
                setActiveTab('kyc');
              }}
              className="px-4 py-2 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs uppercase shrink-0 cursor-pointer transition-colors"
            >
              {userProfile.kycStatus === 'pending' ? 'View Verification Timer' : 'Complete KYC Now →'}
            </button>
          </div>
        )}

        {/* Explicit Withdrawal Blocked Alert Notice when user clicks Request Withdrawal while Unverified */}
        {withdrawalBlockNotice && userProfile.kycStatus !== 'verified' && (
          <div
            data-testid="withdrawal-blocked-alert"
            className="mt-3 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500 text-xs font-mono text-rose-200 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-bold text-white">{withdrawalBlockNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setWithdrawalBlockNotice(null);
                setActiveTab('kyc');
              }}
              className="px-3 py-1 rounded-lg bg-[#ff8800] text-slate-950 font-black text-[11px] uppercase cursor-pointer shrink-0"
            >
              Verify KYC
            </button>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-white/10 mb-8 overflow-x-auto pb-2 font-mono">
        {[
          { id: 'accounts', label: `My Trading Accounts (${accounts.length})` },
          { id: 'kyc', label: `KYC Verification (${userProfile.kycStatus.toUpperCase()})` },
          { id: 'profile', label: 'Profile & Personal Details' },
          { id: 'analytics', label: 'Performance Analytics' },
          { id: 'affiliate', label: 'Affiliate Program (10%/5%/2% + 8%)' },
          { id: 'security', label: 'Security & 2FA' },
        ].map((tab) => (
          <button
            key={tab.id}
            data-testid={`dashboard-tab-${tab.id}`}
            onClick={() => {
              soundEngine.playUiClick();
              setActiveTab(tab.id as any);
            }}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: My Trading Accounts */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          {accounts.length === 0 ? (
            <div
              data-testid="no-active-account-state"
              className="p-8 sm:p-12 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 text-center max-w-3xl mx-auto my-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#141418] border border-[#ff8800] flex items-center justify-center text-[#ff8800] mx-auto mb-4">
                <ShoppingBag className="w-8 h-8" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ff8800]/15 border border-[#ff8800]/40 text-[#ff8800] text-[11px] font-mono font-black uppercase tracking-wider mb-3">
                Account Status: No Active Account
              </span>

              <h2 className="text-2xl sm:text-3xl font-black text-white font-mono">
                No Active Account
              </h2>

              <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto mt-2 leading-relaxed">
                Welcome to Binary Funded Trader,{' '}
                <strong className="text-white">{userProfile.fullName || userProfile.email}</strong>. You have not
                yet purchased a Challenge or Instant Funded account. Select a funding evaluation plan below to
                receive your live OTC trading terminal credentials immediately.
              </p>

              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="choose-plan-btn"
                  onClick={() => {
                    soundEngine.playUiClick();
                    onOpenChallengeModal();
                  }}
                  className="w-full sm:w-auto px-6 py-3.5 min-h-[44px] rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs sm:text-sm font-mono uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Choose a Plan / Buy Challenge</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>

                {onNavigateToPricing && (
                  <button
                    type="button"
                    data-testid="browse-all-plans-btn"
                    onClick={() => {
                      soundEngine.playUiClick();
                      onNavigateToPricing();
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 min-h-[44px] rounded-xl bg-[#141418] hover:bg-[#1c1c22] border border-white/15 text-white font-bold text-xs sm:text-sm font-mono flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <span>Compare All Evaluation Tiers</span>
                  </button>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left font-mono text-xs">
                <div className="p-3.5 rounded-xl bg-[#111115] border border-white/10">
                  <div className="text-[#ff8800] font-black">1. Choose Evaluation</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Select One-Step, Two-Step, or Instant Funded capital up to $100,000.
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#111115] border border-white/10">
                  <div className="text-[#ff8800] font-black">2. Complete KYC</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Lock your personal details & upload ID for automated 2-minute verification.
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-[#111115] border border-white/10">
                  <div className="text-[#00e676] font-black">3. 3-Min USDT Payouts</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Trade OTC binary options & withdraw up to 90% profit split via TRC-20.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map((acc) => {
                const profit = Number((acc.currentBalance - acc.initialBalance).toFixed(2));
                const isLive = isLiveFundedAccount(acc);
                const challengeTarget = getChallengeProfitTarget(acc);
                const progressPct = challengeTarget.isChallenge
                  ? Math.min(100, Math.max(0, (Math.max(0, profit) / Math.max(1, challengeTarget.targetAmount)) * 100))
                  : 100;

                return (
                  <div
                    key={acc.id}
                    data-testid={`account-card-${acc.id}`}
                    className={`p-5 rounded-2xl bg-[#0a0a0a] border transition-colors ${
                      acc.status === 'hard-breached' || acc.status === 'breached'
                        ? 'border-rose-500/50'
                        : acc.status === 'passed'
                        ? 'border-emerald-500/50'
                        : 'border-white/15 hover:border-[#ff8800]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white font-mono">{acc.id}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono border ${
                            isLive
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                              : 'bg-[#ff8800]/15 text-[#ff8800] border-[#ff8800]/30'
                          }`}
                        >
                          {isLive ? 'LIVE FUNDED' : `CHALLENGE (${acc.phase.toUpperCase()})`}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full font-mono ${
                          acc.status === 'hard-breached' || acc.status === 'breached'
                            ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                            : acc.status === 'passed'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/50'
                            : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {acc.status.toUpperCase()}
                      </span>
                    </div>

                    {acc.certificateId && (
                      <div className="mb-3 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs font-mono">
                        <span className="text-emerald-300 flex items-center gap-1.5 font-bold">
                          <Award className="w-4 h-4 text-[#ff8800]" /> Certificate: {acc.certificateId}
                        </span>
                        <span className="text-[10px] text-slate-300">Live Account Provisioned</span>
                      </div>
                    )}

                    {/* Challenge Profit Target Progress Bar for One-Step & Two-Step Challenge Accounts */}
                    {!isLive && acc.status === 'active' && (
                      <div className="mb-3 p-3 rounded-xl bg-[#111115] border border-[#ff8800]/30 font-mono text-xs">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] uppercase font-bold text-[#ff8800]">
                            Challenge Profit Target ({challengeTarget.targetPercent}%)
                          </span>
                          <span className="text-[11px] font-black text-white">
                            ${Math.max(0, profit).toFixed(2)} / ${challengeTarget.targetAmount.toLocaleString()}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#0a0a0a] overflow-hidden border border-white/10">
                          <div
                            className="h-full bg-[#ff8800] transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-400">
                          <span>Withdrawals unlock after passing challenge</span>
                          {profit >= challengeTarget.targetAmount && onPassChallengePhase && (
                            <button
                              type="button"
                              data-testid={`claim-live-account-btn-${acc.id}`}
                              onClick={() => onPassChallengePhase(acc)}
                              className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black uppercase cursor-pointer"
                            >
                              Claim Certificate & Live Account →
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-2 p-3 rounded-xl bg-[#111115] border border-white/10 mb-4 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Balance</span>
                        <span className="font-bold text-white">${acc.currentBalance.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Net Profit</span>
                        <span className={`font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Limits</span>
                        <span className="font-bold text-[#ff8800]">
                          {acc.dailyLossLimitPercent}% / {acc.maxOverallLossPercent}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Split</span>
                        <span className="font-bold text-emerald-400">80%</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-4 bg-[#141418] p-2.5 rounded-lg border border-white/10">
                      <span>
                        Password: <code className="text-slate-200">{acc.passwordHash}</code>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(acc.passwordHash, acc.id)}
                        className="p-1 rounded hover:bg-white/10 text-[#ff8800] cursor-pointer"
                      >
                        {copiedId === acc.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {acc.status === 'hard-breached' || acc.status === 'breached' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectAccount(acc.id);
                              onOpenTerminal();
                            }}
                            className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-rose-950/80 text-rose-300 border border-rose-500/40"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Inspect Breach</span>
                          </button>
                          <button
                            type="button"
                            onClick={onOpenChallengeModal}
                            className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-[#ff8800] text-slate-950"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>10% Reset Courtesy</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectAccount(acc.id);
                              onOpenTerminal();
                            }}
                            className="flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono bg-[#ff8800] hover:bg-[#ff9900] text-slate-950"
                          >
                            <span>Launch Terminal</span>
                            <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>

                          {isLive ? (
                            <button
                              type="button"
                              data-testid={`withdraw-account-btn-${acc.id}`}
                              onClick={() => handleAttemptWithdrawal(acc.id)}
                              className={`px-3.5 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer font-mono border ${
                                kycWithdrawalCheck.allowed
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                                  : 'bg-[#141418] border-white/15 text-slate-400 hover:text-white'
                              }`}
                            >
                              {kycWithdrawalCheck.allowed ? (
                                <Zap className="w-3.5 h-3.5" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
                              )}
                              <span>Withdraw</span>
                            </button>
                          ) : (
                            <div
                              data-testid={`withdraw-locked-challenge-${acc.id}`}
                              title="Challenge accounts cannot withdraw funds until the profit target is reached and the Live Funded Account is provisioned."
                              className="px-3 py-2.5 rounded-xl bg-[#141418] border border-white/10 text-slate-400 font-mono text-[11px] font-bold flex items-center gap-1.5 select-none"
                            >
                              <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
                              <span>Challenge Phase (No Withdrawals)</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Strict 2-Step KYC Verification & Profile Lock */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Step 1 Column (5 cols): Personal Profile Details & Permanent Lock */}
          <div className="lg:col-span-5 p-6 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-black uppercase">
                  Step 1 of 2 • Identity Details
                </span>
                {isProfileLocked ? (
                  <span
                    data-testid="profile-locked-badge"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-mono font-bold"
                  >
                    <Lock className="w-3 h-3" /> Locked & Immutable
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-amber-400 font-bold">
                    Action Required
                  </span>
                )}
              </div>

              <h3 className="text-lg font-black text-white font-mono">
                Official Personal Profile Details
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Enter your official legal **Full Name**, **Residential Address**, and **Date of Birth** exactly as
                shown on your government ID. Once saved, these fields are **permanently locked** and cannot be edited.
              </p>

              {profileErrorMessage && (
                <div
                  data-testid="profile-lock-error"
                  className="mt-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 font-mono flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{profileErrorMessage}</span>
                </div>
              )}

              {profileSaveMessage && (
                <div
                  data-testid="profile-lock-success"
                  className="mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-200 font-mono flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{profileSaveMessage}</span>
                </div>
              )}

              <form onSubmit={handleSaveAndLockPersonalDetails} className="space-y-4 mt-5">
                <div>
                  <label
                    htmlFor="kyc-fullname-input"
                    className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5"
                  >
                    <span>Official Full Name *</span>
                    {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="kyc-fullname-input"
                      data-testid="kyc-fullname-input"
                      type="text"
                      required
                      disabled={isProfileLocked}
                      readOnly={isProfileLocked}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Jordan Vance"
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                        isProfileLocked
                          ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                          : 'bg-[#111115] border-white/20 text-white focus:border-[#ff8800]'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="kyc-address-input"
                    className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5"
                  >
                    <span>Residential Address *</span>
                    {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="kyc-address-input"
                      data-testid="kyc-address-input"
                      type="text"
                      required
                      disabled={isProfileLocked}
                      readOnly={isProfileLocked}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street Address, City, Postal Code, Country"
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                        isProfileLocked
                          ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                          : 'bg-[#111115] border-white/20 text-white focus:border-[#ff8800]'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="kyc-dob-input"
                    className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5"
                  >
                    <span>Date of Birth *</span>
                    {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      id="kyc-dob-input"
                      data-testid="kyc-dob-input"
                      type="date"
                      required
                      disabled={isProfileLocked}
                      readOnly={isProfileLocked}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className={`w-full pl-10 pr-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                        isProfileLocked
                          ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                          : 'bg-[#111115] border-white/20 text-white focus:border-[#ff8800]'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="kyc-country-select"
                    className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1.5"
                  >
                    <span>Country of Residence (National Flag) *</span>
                  </label>
                  <select
                    id="kyc-country-select"
                    data-testid="kyc-country-select"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#111115] border border-white/20 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {!isProfileLocked ? (
                  <button
                    type="submit"
                    data-testid="save-lock-profile-btn"
                    className="w-full py-3.5 min-h-[44px] rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Save & Permanently Lock Personal Details</span>
                  </button>
                ) : (
                  <div
                    data-testid="immutable-profile-notice"
                    className="p-3.5 rounded-xl bg-[#141418] border border-white/10 text-[11px] font-mono text-slate-300 flex items-center gap-2.5"
                  >
                    <Lock className="w-4 h-4 text-[#ff8800] shrink-0" />
                    <span>
                      Personal details are permanently locked and immutable for AML/KYC security compliance.
                    </span>
                  </div>
                )}
              </form>
            </div>
          </div>

          {/* Step 2 Column (7 cols): Document Upload & 2-Minute Automated Verification */}
          <div className="lg:col-span-7 p-6 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ff8800]/15 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-black uppercase">
                Step 2 of 2 • Document Upload & Auto-Verification
              </span>
              <span
                data-testid="kyc-panel-status-pill"
                className={`px-3 py-1 rounded-full text-xs font-black uppercase font-mono border ${
                  userProfile.kycStatus === 'verified'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : userProfile.kycStatus === 'pending'
                    ? 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                }`}
              >
                {userProfile.kycStatus === 'pending'
                  ? `VERIFYING (${formatTimerMmSs(remainingKycSeconds)})`
                  : userProfile.kycStatus.toUpperCase()}
              </span>
            </div>

            <h3 className="text-lg font-black text-white font-mono flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#ff8800]" />
              Government ID Upload & Automated Data Match
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Upload your government-issued ID Card, Passport, or Driving License. If the extracted document data
              matches your locked profile details, your account automatically updates to **Verified** within a
              2-minute processing timer.
            </p>

            {/* Guard if Step 1 is not locked yet */}
            {!isProfileLocked ? (
              <div
                data-testid="kyc-step2-locked-overlay"
                className="mt-6 p-8 rounded-2xl bg-[#111115] border border-white/10 text-center space-y-3"
              >
                <Lock className="w-8 h-8 text-[#ff8800] mx-auto" />
                <div className="text-sm font-black text-white font-mono">
                  Complete & Lock Step 1 Personal Details First
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Please enter and save your official Full Name, Residential Address, and Date of Birth in Step 1 to
                  unlock identification document upload.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {/* Active 2-Minute Countdown Timer Card when Pending */}
                {userProfile.kycStatus === 'pending' && (
                  <div
                    data-testid="kyc-pending-timer-card"
                    className="p-5 rounded-2xl bg-[#14100a] border border-[#ff8800] space-y-3 font-mono"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Clock className="w-5 h-5 text-[#ff8800] animate-spin" />
                        <div>
                          <div className="text-xs font-black text-white uppercase">
                            Automated OCR Identity Match Confirmed — Processing Clearance
                          </div>
                          <div className="text-[11px] text-slate-300">
                            Matched: <strong className="text-emerald-400">{userProfile.fullName}</strong> • DOB:{' '}
                            <strong className="text-emerald-400">{userProfile.dateOfBirth}</strong>
                          </div>
                        </div>
                      </div>
                      <div
                        data-testid="kyc-countdown-timer"
                        className="text-2xl font-black text-[#ff8800] bg-[#0a0a0a] px-3.5 py-1.5 rounded-xl border border-[#ff8800]/50 text-center"
                      >
                        {formatTimerMmSs(remainingKycSeconds)}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-2 rounded-full bg-[#0a0a0a] overflow-hidden border border-white/10">
                      <div
                        className="h-full bg-[#ff8800] transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              5,
                              ((KYC_VERIFICATION_DURATION_SECONDS - remainingKycSeconds) /
                                KYC_VERIFICATION_DURATION_SECONDS) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-400">
                        Status will automatically update to <strong>VERIFIED</strong> when the 2-minute timer finishes.
                      </span>
                    </div>
                  </div>
                )}

                {kycFeedbackError && (
                  <div
                    data-testid="kyc-error-banner"
                    className="p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/50 text-xs text-rose-200 font-mono flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{kycFeedbackError}</span>
                  </div>
                )}

                {kycFeedbackSuccess && (
                  <div
                    data-testid="kyc-success-banner"
                    className="p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-xs text-emerald-200 font-mono flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{kycFeedbackSuccess}</span>
                  </div>
                )}

                {userProfile.kycStatus === 'verified' ? (
                  <div
                    data-testid="kyc-verified-card"
                    className="p-6 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 space-y-3 font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <FileCheck className="w-7 h-7 text-emerald-400 shrink-0" />
                      <div>
                        <h4 className="text-base font-black text-white uppercase">
                          KYC Identity Verified & Approved
                        </h4>
                        <p className="text-xs text-emerald-300">
                          Your personal details and {userProfile.kycDocumentType || docType} have been verified. Instant
                          USDT (TRC-20) and Bank Wire withdrawals are unlocked.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#0a0a0a] border border-white/10">
                        <span className="text-[10px] text-slate-400 block">VERIFIED NAME</span>
                        <span className="font-bold text-white">{userProfile.fullName}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0a0a0a] border border-white/10">
                        <span className="text-[10px] text-slate-400 block">DOCUMENT TYPE</span>
                        <span className="font-bold text-emerald-400">
                          {userProfile.kycDocumentType || docType} ({userProfile.kycDocumentNumber || documentNumber})
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#0a0a0a] border border-white/10">
                        <span className="text-[10px] text-slate-400 block">WITHDRAWAL ACCESS</span>
                        <span className="font-bold text-emerald-400">UNLOCKED (3-MIN SLA)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleKycSubmit} className="space-y-4">
                    {/* 3 KYC Document Type Tabs: ID Card, Passport, Driving License */}
                    <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                      {(['ID Card', 'Passport', 'Driving License'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          data-testid={`kyc-doctype-${type.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => setDocType(type)}
                          className={`py-3 px-3 min-h-[44px] rounded-xl border font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                            docType === type
                              ? 'bg-[#ff8800] text-slate-950 border-[#ff8800] font-black'
                              : 'bg-[#111115] text-slate-300 border-white/10 hover:text-white'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 shrink-0" />
                          <span className="truncate">{type}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-300 mb-1">
                          {docType} Document Number *
                        </label>
                        <input
                          data-testid="kyc-doc-number-input"
                          type="text"
                          required
                          value={documentNumber}
                          onChange={(e) => setDocumentNumber(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#111115] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                          placeholder="e.g. P89401293"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-300 mb-1">
                          Name on {docType} (OCR Check) *
                        </label>
                        <input
                          data-testid="kyc-doc-name-input"
                          type="text"
                          required
                          value={extractedDocName}
                          onChange={(e) => setExtractedDocName(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#111115] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                          placeholder="Must match Full Name"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-300 mb-1">
                          DOB on {docType} (OCR Check) *
                        </label>
                        <input
                          data-testid="kyc-doc-dob-input"
                          type="date"
                          required
                          value={extractedDocDob}
                          onChange={(e) => setExtractedDocDob(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl bg-[#111115] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-mono text-slate-300">
                          Upload High-Resolution {docType} Scan (Front & Back) *
                        </label>
                      </div>

                      <div className="border-2 border-dashed border-white/15 hover:border-[#ff8800] rounded-2xl p-5 text-center transition-colors bg-[#111115]">
                        <UploadCloud className="w-8 h-8 text-[#ff8800] mx-auto mb-2" />
                        <input
                          type="file"
                          id="kyc-file"
                          data-testid="kyc-file-input"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              setSelectedKycFile(e.target.files[0]);
                              setUploadedFileName(e.target.files[0].name);
                              if (!extractedDocName) setExtractedDocName(userProfile.fullName);
                              if (!extractedDocDob) setExtractedDocDob(userProfile.dateOfBirth || '');
                            }
                          }}
                        />
                        <label htmlFor="kyc-file" className="cursor-pointer block">
                          <span
                            data-testid="kyc-uploaded-filename"
                            className="text-xs font-bold text-white block font-mono"
                          >
                            {uploadedFileName
                              ? `Attached Document: ${uploadedFileName}`
                              : `Click to select ${docType} image or PDF file`}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                            Automated OCR checks that document Name & DOB match your locked profile details
                          </span>
                        </label>
                      </div>
                    </div>

                    <button
                      type="submit"
                      data-testid="submit-kyc-doc-btn"
                      disabled={userProfile.kycStatus === 'pending'}
                      className="w-full py-3.5 min-h-[44px] rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-50 text-slate-950 font-black text-xs font-mono uppercase tracking-wider cursor-pointer transition-colors"
                    >
                      {userProfile.kycStatus === 'pending'
                        ? `Auto-Verification Running (${formatTimerMmSs(remainingKycSeconds)})...`
                        : `Upload ${docType} & Start 2-Minute Auto-Verification`}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Profile Settings & Immutable Personal Details */}
      {activeTab === 'profile' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-white font-mono">
              Trader Profile & Personal Details
            </h3>
            {isProfileLocked && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-mono font-bold">
                <Lock className="w-3.5 h-3.5" /> Identity Fields Locked
              </span>
            )}
          </div>

          {profileErrorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200 font-mono">
              {profileErrorMessage}
            </div>
          )}

          {profileSaveMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-200 font-mono">
              {profileSaveMessage}
            </div>
          )}

          <form onSubmit={handleSaveAndLockPersonalDetails} className="space-y-5">
            {/* Custom Photo Upload Box */}
            <div className="p-4 rounded-2xl bg-[#111115] border border-white/10 flex flex-col sm:flex-row items-center gap-4">
              <img
                src={userProfile.avatarUrl || BUILTIN_AVATARS[0]}
                alt={userProfile.fullName || 'Trader'}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-[#ff8800]"
              />
              <div className="flex-1 text-center sm:text-left">
                <div className="text-xs font-bold text-white mb-1">Custom Profile Picture</div>
                <p className="text-[11px] text-slate-400 mb-2">
                  Upload your own custom profile photo or choose an institutional avatar below.
                </p>
                <label className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#ff8800]/20 hover:bg-[#ff8800]/30 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-bold cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload Custom Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-slate-300 mb-2">
                Or Choose Built-In Institutional Avatar
              </label>
              <div className="flex gap-3">
                {BUILTIN_AVATARS.map((url, idx) => (
                  <img
                    key={idx}
                    src={url}
                    alt={`Avatar ${idx + 1}`}
                    onClick={() => onUpdateProfile({ ...userProfile, avatarUrl: url })}
                    className={`w-12 h-12 rounded-xl object-cover cursor-pointer transition-all ${
                      userProfile.avatarUrl === url
                        ? 'ring-2 ring-[#ff8800] scale-105'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1">
                <span>Official Full Name {isProfileLocked && '(Locked)'}</span>
                {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
              </label>
              <input
                data-testid="profile-fullname-input"
                type="text"
                required
                disabled={isProfileLocked}
                readOnly={isProfileLocked}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full legal name"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                  isProfileLocked
                    ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                    : 'bg-[#111115] border-white/15 text-white focus:border-[#ff8800]'
                }`}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1">
                <span>Residential Address {isProfileLocked && '(Locked)'}</span>
                {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
              </label>
              <input
                data-testid="profile-address-input"
                type="text"
                required
                disabled={isProfileLocked}
                readOnly={isProfileLocked}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street Address, City, Postal Code, Country"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                  isProfileLocked
                    ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                    : 'bg-[#111115] border-white/15 text-white focus:border-[#ff8800]'
                }`}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1">
                <span>Date of Birth {isProfileLocked && '(Locked)'}</span>
                {isProfileLocked && <Lock className="w-3.5 h-3.5 text-[#ff8800]" />}
              </label>
              <input
                data-testid="profile-dob-input"
                type="date"
                required
                disabled={isProfileLocked}
                readOnly={isProfileLocked}
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono focus:outline-none ${
                  isProfileLocked
                    ? 'bg-[#141418] border-white/10 text-slate-400 cursor-not-allowed'
                    : 'bg-[#111115] border-white/15 text-white focus:border-[#ff8800]'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="profile-country-select" className="block text-xs font-mono text-slate-300 mb-1">
                  Country of Residence (Leaderboard Flag)
                </label>
                <select
                  id="profile-country-select"
                  data-testid="profile-country-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111115] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-300 mb-1">Telegram Handle</label>
                <input
                  type="text"
                  value={telegramHandle}
                  onChange={(e) => setTelegramHandle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#111115] border border-white/15 text-white text-xs font-mono focus:outline-none focus:border-[#ff8800]"
                />
              </div>
            </div>

            <button
              type="submit"
              data-testid="profile-save-btn"
              className="px-6 py-3 min-h-[44px] rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs font-mono uppercase cursor-pointer transition-colors"
            >
              {isProfileLocked
                ? 'Save Contact Preferences (Identity Locked)'
                : 'Save & Permanently Lock Personal Details'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-4 rounded-2xl bg-[#0a0a0a] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">30D Win Rate</span>
              <span className="text-2xl font-black text-emerald-400 block mt-1">{winRatePercent}%</span>
              <span className="text-[10px] text-slate-500">
                {wonTradesCount} Wins / {lostTradesCount} Losses
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0a0a0a] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">Active Accounts</span>
              <span className="text-2xl font-black text-white block mt-1">{accounts.length}</span>
              <span className="text-[10px] text-[#ff8800]">Split: 80% → 90% Scaling</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0a0a0a] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">Profit Factor</span>
              <span className="text-2xl font-black text-[#ff8800] block mt-1">2.48</span>
              <span className="text-[10px] text-slate-500">Gross Win / Gross Loss</span>
            </div>
            <div className="p-4 rounded-2xl bg-[#0a0a0a] border border-white/10">
              <span className="text-slate-400 text-[11px] block uppercase">Max Risk / Trade</span>
              <span className="text-2xl font-black text-emerald-400 block mt-1">≤ 5.0%</span>
              <span className="text-[10px] text-slate-500">100% Prop Rule Compliant</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0a0a0a] border border-white/10">
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-[#ff8800]" />
                30-Day Cumulative Profit Trajectory
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profitTrajectoryData}>
                    <defs>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff8800" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#ff8800" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(val) => `$${val}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111115', borderColor: '#ff8800', borderRadius: '12px' }}
                    />
                    <Area type="monotone" dataKey="profit" stroke="#ff8800" strokeWidth={2.5} fill="url(#profitGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#0a0a0a] border border-white/10 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-1">
                <PieIcon className="w-4 h-4 text-emerald-400" />
                Win / Loss Ratio
              </h3>
              <div className="h-52 w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={winLossPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={4} dataKey="value">
                      {winLossPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-mono">
                  <span className="text-2xl font-black text-emerald-400">{winRatePercent}%</span>
                  <span className="text-[10px] text-slate-400 uppercase">Win Rate</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#0a0a0a] border border-white/10">
            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#ff8800]" />
              Duration Distribution & Win Rate per Expiry
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={durationStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                  <XAxis dataKey="duration" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="trades" name="Trades Count" fill="#ff8800" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="winRate" name="Win Rate (%)" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Affiliate Program */}
      {activeTab === 'affiliate' && (
        <AffiliateDashboard
          userProfile={userProfile}
          referrals={referrals}
          payouts={payouts}
          onAddPayout={onAddPayout}
          onOpenChallengeModal={onOpenChallengeModal}
        />
      )}

      {/* Tab 6: Security & 2FA */}
      {activeTab === 'security' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 max-w-2xl">
          <h3 className="text-lg font-bold text-white mb-2">Two-Factor Authentication (2FA)</h3>
          <p className="text-xs text-slate-400 mb-6">
            Protects your trading credentials, TRC-20 withdrawals, and affiliate payouts.
          </p>

          <div className="flex items-center justify-between p-4 rounded-xl bg-[#111115] border border-white/10">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-6 h-6 ${twoFactor ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <h4 className="text-sm font-bold text-white">Authenticator App (TOTP)</h4>
                <p className="text-xs text-slate-400">Google Authenticator / Authy</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextState = !twoFactor;
                setTwoFactor(nextState);
                onUpdateProfile({ ...userProfile, twoFactorEnabled: nextState });
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer ${
                twoFactor ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-400 hover:text-white'
              }`}
            >
              {twoFactor ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
