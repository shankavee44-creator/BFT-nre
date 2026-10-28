import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  User,
  ArrowRight,
  Gift,
  AlertCircle,
  ShieldCheck,
  Cookie,
  Lock,
} from 'lucide-react';
import { UserAccount, TradingAccount } from '../types';
import {
  COOKIE_NAME,
  getCookie,
  getStoredReferralCode,
  storeReferralCode,
  validateSponsorReferralCode,
  resolve3TierUplineChain,
} from '../utils/affiliateEngine';
import { supabase } from '../utils/supabase';

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
    serverUser?: any;
    serverAccounts?: TradingAccount[];
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
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(
    initialMode === 'register' ? 'register' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [cookieValue, setCookieValue] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode === 'register' ? 'register' : 'login');
  }, [initialMode]);

  useEffect(() => {
    if (isOpen || isPageView) {
      // Check URL parameters for ref or referral_code
      const searchParams = new URLSearchParams(window.location.search);
      const urlRef = searchParams.get('ref') || searchParams.get('referral_code');

      const storedCookie = getCookie(COOKIE_NAME) || getStoredReferralCode();
      setCookieValue(storedCookie);

      const detectedCode = (urlRef || initialReferralCode || storedCookie || '').toUpperCase();
      if (detectedCode) {
        setReferralCodeInput(detectedCode);
        storeReferralCode(detectedCode);
      }
      setAuthError(null);
      setAuthNotice(null);
    }
  }, [isOpen, isPageView, initialReferralCode]);

  if (!isOpen && !isPageView) return null;

  const effectiveCodeForLookup = (referralCodeInput || cookieValue || '').trim().toUpperCase();
  const sponsorValidation = validateSponsorReferralCode(effectiveCodeForLookup, affiliateUsers);
  const uplineChain = resolve3TierUplineChain(effectiveCodeForLookup, affiliateUsers);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    const codeToAttribute = referralCodeInput.trim().toUpperCase() || getStoredReferralCode() || null;

    try {
      if (mode === 'register') {
        // Supabase Auth SignUp
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              referral_code: codeToAttribute,
              full_name: fullName.trim() || cleanEmail.split('@')[0],
            },
          },
        });

        if (error) {
          setAuthError(error.message);
          setIsSubmitting(false);
          return;
        }

        const user = data.user;
        if (!user) {
          setAuthError('Sign up succeeded but no user session was returned.');
          setIsSubmitting(false);
          return;
        }

        // Fetch or wait for profile created by Postgres trigger
        let profile = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: p } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (p) {
            profile = p;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }

        const userRefCode = profile?.referral_code || `BFT-${user.id.slice(0, 6).toUpperCase()}`;
        const jwtToken = createSessionJwtToken({
          userId: user.id,
          email: cleanEmail,
          referralCode: userRefCode,
          rememberMe,
        });

        onAuthSuccess({
          userId: user.id,
          email: cleanEmail,
          fullName: profile?.full_name || fullName || cleanEmail.split('@')[0],
          referralCode: userRefCode,
          referredBy: profile?.referred_by || null,
          rememberMe,
          jwtToken,
          isNewRegistration: true,
          serverUser: {
            id: user.id,
            email: cleanEmail,
            fullName: profile?.full_name || fullName,
            referralCode: userRefCode,
            kycStatus: profile?.kyc_status || 'unverified',
            balance: profile?.balance || 0,
          },
        });
        onClose();
      } else {
        // Supabase Auth SignInWithPassword
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          setAuthError(error.message);
          setIsSubmitting(false);
          return;
        }

        const user = data.user;
        if (!user) {
          setAuthError('Invalid credentials.');
          setIsSubmitting(false);
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const userRefCode = profile?.referral_code || `BFT-${user.id.slice(0, 6).toUpperCase()}`;
        const jwtToken = createSessionJwtToken({
          userId: user.id,
          email: cleanEmail,
          referralCode: userRefCode,
          rememberMe,
        });

        onAuthSuccess({
          userId: user.id,
          email: cleanEmail,
          fullName: profile?.full_name || user.user_metadata?.full_name || cleanEmail.split('@')[0],
          referralCode: userRefCode,
          referredBy: profile?.referred_by || null,
          rememberMe,
          jwtToken,
          isNewRegistration: false,
          serverUser: {
            id: user.id,
            email: cleanEmail,
            fullName: profile?.full_name || user.user_metadata?.full_name,
            referralCode: userRefCode,
            kycStatus: profile?.kyc_status || 'unverified',
            balance: profile?.balance || 0,
          },
        });
        onClose();
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardContent = (
    <div
      data-testid="auth-modal-card"
      className={`relative w-full ${
        isPageView ? 'max-w-xl mx-auto' : 'max-w-lg'
      } rounded-2xl bg-[#0a0a0a] border border-[#262c3a] p-5 sm:p-6 my-auto shadow-2xl`}
    >
      {!isPageView && (
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex bg-[#141720] border border-[#262c3a] p-1 rounded-xl mb-5 font-mono text-xs font-bold">
        <button
          type="button"
          data-testid="auth-mode-signin"
          onClick={() => {
            setMode('login');
            setAuthError(null);
          }}
          className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
            mode === 'login' ? 'bg-[#ff8800] text-slate-950 font-black' : 'text-slate-400 hover:text-white'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          data-testid="auth-mode-register"
          onClick={() => {
            setMode('register');
            setAuthError(null);
          }}
          className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
            mode === 'register' ? 'bg-[#ff8800] text-slate-950 font-black' : 'text-slate-400 hover:text-white'
          }`}
        >
          Register Account
        </button>
      </div>

      {/* Header Title */}
      <div className="text-center mb-5">
        <span
          data-testid="supabase-auth-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#141720] border border-[#262c3a] text-[#ff8800] text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5"
        >
          <ShieldCheck className="w-3 h-3" /> Supabase Secured Authentication
        </span>
        <h3 className="text-xl font-black text-white font-mono">
          {mode === 'register' ? 'Create Trader Account' : 'Sign In to Dashboard'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {mode === 'register'
            ? 'Sign up to receive your instant $100,000 OTC trading terminal access.'
            : 'Access your active trading evaluation, live terminal, and withdrawal portal.'}
        </p>
      </div>

      {authError && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 font-mono">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}

      {authNotice && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-300 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{authNotice}</span>
        </div>
      )}

      <form onSubmit={handleEmailAuth} className="space-y-3.5 mb-4">
        {mode === 'register' && (
          <div>
            <label htmlFor="auth-fullname" className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Full Name</span>
            </label>
            <input
              id="auth-fullname"
              type="text"
              required={mode === 'register'}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Alex Mercer"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-email" className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>Email Address *</span>
          </label>
          <input
            id="auth-email"
            data-testid="auth-email-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="trader@domain.com"
            className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>Password *</span>
          </label>
          <input
            id="auth-password"
            data-testid="auth-password-input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
          />
        </div>

        {/* Sponsor Referral Code Input */}
        <div className="p-3 rounded-xl bg-[#11131a] border border-[#1e2330] space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="auth-referral-code" className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Referral Sponsor Code (Optional):</span>
            </label>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <Cookie className="w-3 h-3" />
              {cookieValue ? `Cookie: ${cookieValue}` : '30-Day Attribution'}
            </span>
          </div>

          <input
            id="auth-referral-code"
            data-testid="auth-referral-input"
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
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-[#ff8800] font-mono font-bold text-xs focus:outline-none focus:border-[#ff8800]"
            placeholder="Enter referral code (e.g. BFT-ALEX77)"
          />

          {effectiveCodeForLookup && uplineChain.level1 && (
            <div className="pt-2 border-t border-[#1e2330] grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="p-1.5 rounded bg-[#0a0a0a] border border-[#262c3a]">
                <div className="text-[#ff8800] font-bold">L1 (10% + 8%)</div>
                <div className="text-white truncate">{uplineChain.level1.name}</div>
              </div>
              <div className="p-1.5 rounded bg-[#0a0a0a] border border-[#262c3a]">
                <div className="text-amber-300 font-bold">L2 (5%)</div>
                <div className="text-slate-300 truncate">
                  {uplineChain.level2 ? uplineChain.level2.name : 'Direct Root'}
                </div>
              </div>
              <div className="p-1.5 rounded bg-[#0a0a0a] border border-[#262c3a]">
                <div className="text-emerald-400 font-bold">L3 (2%)</div>
                <div className="text-slate-300 truncate">
                  {uplineChain.level3 ? uplineChain.level3.name : 'Direct Root'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs mb-3">
          <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded accent-[#ff8800] cursor-pointer"
            />
            <span>Keep session active (30 Days)</span>
          </label>
          {sponsorValidation.valid && sponsorValidation.sponsor && (
            <span className="text-[10px] font-mono text-emerald-400">
              Sponsor: {sponsorValidation.sponsor.name}
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="auth-submit-btn"
          className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-60 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider"
        >
          <span>
            {isSubmitting
              ? 'Processing Session...'
              : mode === 'register'
              ? 'Create Account & Enter Dashboard'
              : 'Sign In & Launch Terminal'}
          </span>
          <ArrowRight className="w-4 h-4 stroke-[2.5]" />
        </button>
      </form>
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
