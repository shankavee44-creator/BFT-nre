import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  ArrowRight,
  Zap,
  Gift,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  Link2,
  Cookie,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { UserAccount } from '../types';
import {
  COOKIE_NAME,
  getCookie,
  getStoredReferralCode,
  storeReferralCode,
  validateSponsorReferralCode,
  resolve3TierUplineChain,
  registerNewUserAccount,
} from '../utils/affiliateEngine';

interface AuthModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  initialMode?: 'login' | 'register' | 'forgot';
  initialReferralCode?: string | null;
  affiliateUsers?: UserAccount[];
  onClose: () => void;
  onSimulateReferralLink?: (refCode: string) => void;
  onAuthSuccess: (params: {
    userId: string;
    email: string;
    fullName: string;
    referralCode: string;
    referredBy: string | null;
    rememberMe: boolean;
    jwtToken: string;
    isNewRegistration?: boolean;
    updatedAffiliateUsers?: UserAccount[];
  }) => void;
}

export function createSessionJwtToken(payload: {
  userId: string;
  email: string;
  referralCode: string;
  rememberMe: boolean;
}): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const expSeconds = Math.floor(Date.now() / 1000) + (payload.rememberMe ? 30 * 86400 : 86400);
  const body = btoa(
    JSON.stringify({
      sub: payload.userId,
      email: payload.email,
      ref: payload.referralCode,
      iat: Math.floor(Date.now() / 1000),
      exp: expSeconds,
    })
  );
  const signature = btoa(`bft_sig_${payload.userId}_${expSeconds}`).replace(/=+$/, '');
  return `${header}.${body}.${signature}`;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  isPageView = false,
  initialMode = 'login',
  initialReferralCode = null,
  affiliateUsers = [],
  onClose,
  onSimulateReferralLink,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('trader.pro@bft-capital.com');
  const [password, setPassword] = useState('BftPro#2026!');
  const [confirmPassword, setConfirmPassword] = useState('BftPro#2026!');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [cookieValue, setCookieValue] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen || isPageView) {
      setMode(initialMode);
      setErrorMessage(null);
      setRecoverySuccess(null);
      const storedCookie = getCookie(COOKIE_NAME) || getStoredReferralCode();
      setCookieValue(storedCookie);
      const detectedCode = (initialReferralCode || storedCookie || '').toUpperCase();
      if (detectedCode) {
        setReferralCodeInput(detectedCode);
      }
      if (initialMode === 'register') {
        setFullName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } else if (initialMode === 'login') {
        setEmail('trader.pro@bft-capital.com');
        setPassword('BftPro#2026!');
      }
    }
  }, [isOpen, isPageView, initialMode, initialReferralCode]);

  if (!isOpen && !isPageView) return null;

  // Real-time email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = email.trim().length > 0 && emailRegex.test(email.trim());

  // Real-time password requirements check
  const pwdChecks = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const getPasswordStrength = (): { label: string; score: number; color: string } => {
    if (!password) return { label: 'Enter Password', score: 0, color: 'bg-slate-800' };
    const passed =
      Number(pwdChecks.minLength) +
      Number(pwdChecks.hasUpper) +
      Number(pwdChecks.hasNumber) +
      Number(pwdChecks.hasSpecial);

    if (passed <= 1) return { label: 'Weak', score: 25, color: 'bg-rose-500' };
    if (passed === 2) return { label: 'Fair', score: 50, color: 'bg-amber-500' };
    if (passed === 3) return { label: 'Good', score: 75, color: 'bg-cyan-400' };
    return { label: 'Strong Institutional', score: 100, color: 'bg-emerald-400' };
  };

  const pwdStrength = getPasswordStrength();
  const passwordsMatch =
    confirmPassword.length > 0 && password.length > 0 && password === confirmPassword;

  // Validate sponsor code & resolve 3-tier upline chain live
  const effectiveCodeForLookup = (referralCodeInput || cookieValue || '').trim().toUpperCase();
  const sponsorValidation = validateSponsorReferralCode(effectiveCodeForLookup, affiliateUsers);
  const uplineChain = resolve3TierUplineChain(effectiveCodeForLookup, affiliateUsers);

  const handleApplyReferralPreset = (code: string) => {
    const clean = code.trim().toUpperCase();
    storeReferralCode(clean);
    setCookieValue(clean);
    setReferralCodeInput(clean);
    setMode('register');
    setErrorMessage(null);
    if (onSimulateReferralLink) {
      onSimulateReferralLink(clean);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setRecoverySuccess(null);

    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid institutional or personal email address.');
      return;
    }

    if (mode === 'forgot') {
      setRecoverySuccess(
        `Password reset link and 6-digit recovery token dispatched to ${email.trim()}. Check your inbox.`
      );
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMessage('Please enter your Full Legal Name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match. Please verify your Confirm Password field.');
        return;
      }

      // Automatically read cookie value if input field is empty
      const codeToAttribute =
        referralCodeInput.trim() || getCookie(COOKIE_NAME) || getStoredReferralCode() || null;

      const regResult = registerNewUserAccount({
        name: fullName.trim(),
        email: email.trim(),
        password,
        referralCodeInput: codeToAttribute,
        users: affiliateUsers,
      });

      const jwtToken = createSessionJwtToken({
        userId: regResult.newUser.id,
        email: regResult.newUser.email,
        referralCode: regResult.newUser.referralCode,
        rememberMe,
      });

      try {
        if (rememberMe) {
          localStorage.setItem('bft_jwt_session', jwtToken);
        } else {
          sessionStorage.setItem('bft_jwt_session', jwtToken);
        }
      } catch {
        // Ignore storage errors
      }

      onAuthSuccess({
        userId: regResult.newUser.id,
        email: regResult.newUser.email,
        fullName: regResult.newUser.name,
        referralCode: regResult.newUser.referralCode,
        referredBy: regResult.newUser.referredBy || null,
        rememberMe,
        jwtToken,
        isNewRegistration: true,
        updatedAffiliateUsers: regResult.updatedUsers,
      });
      onClose();
      return;
    }

    // Login mode
    const existing = affiliateUsers.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    const resolvedUserId = existing ? existing.id : `usr_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const resolvedName = existing ? existing.name : fullName.trim() || 'Alex Mercer';
    const resolvedRefCode = existing ? existing.referralCode : 'BFT-ALEX77';
    const resolvedReferredBy = existing?.referredBy || null;

    const jwtToken = createSessionJwtToken({
      userId: resolvedUserId,
      email: email.trim(),
      referralCode: resolvedRefCode,
      rememberMe,
    });

    try {
      if (rememberMe) {
        localStorage.setItem('bft_jwt_session', jwtToken);
      } else {
        sessionStorage.setItem('bft_jwt_session', jwtToken);
      }
    } catch {
      // Ignore storage errors
    }

    onAuthSuccess({
      userId: resolvedUserId,
      email: email.trim(),
      fullName: resolvedName,
      referralCode: resolvedRefCode,
      referredBy: resolvedReferredBy,
      rememberMe,
      jwtToken,
      isNewRegistration: false,
    });
    onClose();
  };

  const cardContent = (
    <div
      className={`relative w-full ${
        isPageView ? 'max-w-xl mx-auto' : 'max-w-lg'
      } rounded-3xl bg-[#0a0a0a] border border-[#ff8800]/40 p-5 sm:p-6 my-auto animate-in fade-in zoom-in-95 duration-200`}
    >
      {!isPageView && (
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Top Header */}
      <div className="text-center mb-3">
        <div className="w-10 h-10 rounded-xl bg-[#141418] border border-[#ff8800] flex items-center justify-center text-[#ff8800] mx-auto mb-2">
          <Lock className="w-5 h-5" />
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ff8800]/15 border border-[#ff8800]/30 text-[#ffaa00] text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-3 h-3" /> BFT Institutional Auth & 3-Tier Attribution
        </span>
        <h3 className="text-xl font-black text-white font-mono">
          {mode === 'register'
            ? 'Create Trader Account'
            : mode === 'forgot'
            ? 'Account Password Recovery'
            : 'Trader Portal Login'}
        </h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {mode === 'register'
            ? 'Direct referral registration with 30-day cookie persistence & 3-tier sponsor hierarchy'
            : mode === 'forgot'
            ? 'Receive an encrypted password recovery link via email'
            : 'Access your Binary Funded Trader challenges, payouts & live terminal'}
        </p>
      </div>

      {/* Interactive Direct Referral Link Simulator Bar (For instant testing of ?ref=USERCODE) */}
      <div className="mb-3 p-2.5 rounded-2xl bg-[#141418] border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-[#ffaa00]" />
            <span>Test Direct Referral Link Routing (`?ref=USERCODE`):</span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <Cookie className="w-3 h-3" />
            {cookieValue ? `Cookie: ${cookieValue} (30d)` : 'No Cookie Yet'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { code: 'BFT-ALEX77', label: '?ref=BFT-ALEX77 (Alex)' },
            { code: 'BFT-MARCO101', label: '?ref=BFT-MARCO101 (Marco)' },
            { code: 'BFT-ELENA55', label: '?ref=BFT-ELENA55 (Elena)' },
          ].map((preset) => (
            <button
              key={preset.code}
              type="button"
              onClick={() => handleApplyReferralPreset(preset.code)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border ${
                referralCodeInput === preset.code
                  ? 'bg-[#ff8800]/25 text-[#ffaa00] border-[#ff8800]'
                  : 'bg-[#09090b] text-slate-300 border-white/10 hover:border-[#ff8800]/50 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Direct Referral Link Auto-Detection & 3-Tier Hierarchy Banner */}
      {effectiveCodeForLookup && mode === 'register' && (
        <div className="mb-3 p-2.5 rounded-2xl bg-gradient-to-r from-[#ff8800]/20 via-amber-500/10 to-emerald-500/15 border border-[#ff8800]/40 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-[#ffaa00] shrink-0" />
              <div>
                <div className="text-white font-bold">
                  Direct Referral Link Detected:{' '}
                  <span className="font-mono text-[#ffaa00]">{effectiveCodeForLookup}</span>
                </div>
                <div className="text-[10px] text-slate-300">
                  {sponsorValidation.valid && sponsorValidation.sponsor
                    ? `Verified Sponsor: ${sponsorValidation.sponsor.name} • 30-Day Browser Cookie Locked`
                    : '30-Day Browser Cookie Stored (`bft_ref_code`)'}
                </div>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>

          {/* 3-Tier Referral Hierarchy Attribution Preview */}
          {uplineChain.level1 && (
            <div className="pt-1.5 border-t border-white/10 grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="p-1.5 rounded-lg bg-black/40 border border-[#ff8800]/30">
                <div className="text-[#ff8800] font-bold">Level 1 (17% + 8%)</div>
                <div className="text-white truncate">{uplineChain.level1.name}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-black/40 border border-white/10">
                <div className="text-amber-300 font-bold">Level 2 (5%)</div>
                <div className="text-slate-300 truncate">
                  {uplineChain.level2 ? uplineChain.level2.name : 'Direct Root'}
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-black/40 border border-white/10">
                <div className="text-emerald-400 font-bold">Level 3 (2%)</div>
                <div className="text-slate-300 truncate">
                  {uplineChain.level3 ? uplineChain.level3.name : 'Direct Root'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode Switch Tabs */}
      {mode !== 'forgot' && (
        <div className="flex bg-[#09090b] p-1 rounded-xl mb-3 border border-white/10 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {recoverySuccess && (
        <div className="mb-3 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{recoverySuccess}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className={mode === 'register' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : ''}>
          {mode === 'register' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="auth-fullname" className="text-xs font-semibold text-slate-300">
                  Full Name
                </label>
                {fullName.trim().length >= 2 && (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                )}
              </div>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#09090b] border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-[#ff8800]"
                  placeholder="e.g. Jordan Vance"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="auth-email" className="text-xs font-semibold text-slate-300">
                Email Address
              </label>
              {email.trim().length > 0 && (
                <span
                  className={`text-[10px] font-mono flex items-center gap-0.5 ${
                    isEmailValid ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {isEmailValid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Valid
                    </>
                  ) : (
                    'Invalid format'
                  )}
                </span>
              )}
            </div>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#09090b] border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-[#ff8800] font-mono"
                placeholder="trader@domain.com"
              />
            </div>
          </div>
        </div>

        {mode !== 'forgot' && (
          <div className={mode === 'register' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2.5' : ''}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="auth-password" className="text-xs font-semibold text-slate-300">
                  Password
                </label>
                {mode === 'register' && password.length > 0 && (
                  <span className="text-[10px] font-mono text-white font-bold">
                    {pwdStrength.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 bg-[#09090b] border border-white/15 rounded-xl text-white text-xs focus:outline-none focus:border-[#ff8800]"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="auth-confirm-password" className="text-xs font-semibold text-slate-300">
                    Confirm Password
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`text-[10px] font-mono flex items-center gap-0.5 ${
                        passwordsMatch ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {passwordsMatch ? '✓ Match' : '✕ Mismatch'}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    id="auth-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`w-full pl-9 pr-3 py-2 bg-[#09090b] border rounded-xl text-white text-xs focus:outline-none ${
                      confirmPassword && !passwordsMatch
                        ? 'border-rose-500'
                        : 'border-white/15 focus:border-[#ff8800]'
                    }`}
                    placeholder="Re-enter password"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'register' && (
          <>
            <div className="space-y-1">
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${pwdStrength.color}`}
                  style={{ width: `${pwdStrength.score}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                <span className={pwdChecks.minLength ? 'text-emerald-400' : 'text-slate-500'}>
                  ✓ 8+ Chars
                </span>
                <span className={pwdChecks.hasUpper ? 'text-emerald-400' : 'text-slate-500'}>
                  ✓ Uppercase
                </span>
                <span className={pwdChecks.hasNumber ? 'text-emerald-400' : 'text-slate-500'}>
                  ✓ Number
                </span>
                <span className={pwdChecks.hasSpecial ? 'text-emerald-400' : 'text-slate-500'}>
                  ✓ Symbol
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="auth-referral-code" className="text-xs font-semibold text-slate-300">
                  Referral Code / Sponsor ID
                </label>
                <span className="text-[10px] font-mono text-[#ffaa00] flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {referralCodeInput ? 'Auto-Populated & Validated' : 'Optional / Editable'}
                </span>
              </div>
              <div className="relative">
                <Gift className="w-4 h-4 text-[#ff8800] absolute left-3 top-2.5" />
                <input
                  id="auth-referral-code"
                  type="text"
                  value={referralCodeInput}
                  onChange={(e) => {
                    const nextVal = e.target.value.toUpperCase();
                    setReferralCodeInput(nextVal);
                    if (nextVal.trim().length >= 3) {
                      storeReferralCode(nextVal);
                      setCookieValue(nextVal);
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-[#09090b] border border-[#ff8800]/40 rounded-xl text-[#ffaa00] font-mono font-bold text-xs focus:outline-none focus:border-[#ff8800]"
                  placeholder="e.g. BFT-ALEX77"
                />
              </div>
              {effectiveCodeForLookup && (
                <p className="text-[10px] font-mono mt-1 text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>
                    {sponsorValidation.valid && sponsorValidation.sponsor
                      ? `Attributed to Sponsor: ${sponsorValidation.sponsor.name} (L1: 17%, L2: 5%, L3: 2%)`
                      : `Sponsor code "${effectiveCodeForLookup}" synced with 30-day cookie`}
                  </span>
                </p>
              )}
            </div>
          </>
        )}

        {mode === 'login' && (
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded accent-[#ff8800] cursor-pointer"
              />
              <span>Remember Me (30 Days JWT Session)</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setErrorMessage(null);
                setRecoverySuccess(null);
              }}
              className="text-[#ffaa00] hover:underline font-mono text-xs cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
                setRecoverySuccess(null);
              }}
              className="text-xs font-mono text-[#ffaa00] hover:underline cursor-pointer"
            >
              ← Back to Trader Login
            </button>
          </div>
        )}

        <button
          type="submit"
          data-testid="auth-submit-btn"
          className="w-full py-3 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider"
        >
          <span>
            {mode === 'register'
              ? 'Complete Registration & Lock 3-Tier Sponsor'
              : mode === 'forgot'
              ? 'Send Recovery Link'
              : 'Sign In to Dashboard'}
          </span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </form>

      <div className="mt-3 pt-3 border-t border-white/10 text-center">
        <button
          type="button"
          onClick={() => {
            const jwtToken = createSessionJwtToken({
              userId: 'usr_bft_001',
              email: 'trader.pro@bft-capital.com',
              referralCode: 'BFT-ALEX77',
              rememberMe: true,
            });
            onAuthSuccess({
              userId: 'usr_bft_001',
              email: 'trader.pro@bft-capital.com',
              fullName: 'Alex Mercer',
              referralCode: 'BFT-ALEX77',
              referredBy: 'USR-PARENT-55',
              rememberMe: true,
              jwtToken,
            });
            onClose();
          }}
          className="text-xs text-[#ffaa00] hover:text-[#ff8800] font-bold flex items-center justify-center gap-1.5 mx-auto cursor-pointer font-mono"
        >
          <Zap className="w-3.5 h-3.5 text-[#ff8800] fill-[#ff8800]" />
          Quick Institutional Demo Auto-Login (Alex Mercer)
        </button>
      </div>
    </div>
  );

  if (isPageView) {
    return (
      <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {cardContent}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      {cardContent}
    </div>
  );
};
