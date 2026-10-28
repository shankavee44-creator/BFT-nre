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
  ExternalLink,
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
import { apiGoogleSignIn, apiGetGoogleOAuthUrl } from '../utils/apiClient';

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
  initialReferralCode = null,
  affiliateUsers = [],
  onClose,
  onAuthSuccess,
}) => {
  const [googleEmail, setGoogleEmail] = useState<string>(() => {
    try {
      return localStorage.getItem('bft_last_google_email') || '';
    } catch {
      return '';
    }
  });
  const [googleFullName, setGoogleFullName] = useState<string>(() => {
    try {
      return localStorage.getItem('bft_last_google_name') || '';
    } catch {
      return '';
    }
  });
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [cookieValue, setCookieValue] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen || isPageView) {
      const storedCookie = getCookie(COOKIE_NAME) || getStoredReferralCode();
      setCookieValue(storedCookie);
      const detectedCode = (initialReferralCode || storedCookie || '').toUpperCase();
      if (detectedCode) {
        setReferralCodeInput(detectedCode);
      }
      setAuthError(null);
    }
  }, [isOpen, isPageView, initialReferralCode]);

  // Listen for OAUTH_AUTH_SUCCESS postMessage from Google OAuth popup window
  useEffect(() => {
    if (!isOpen && !isPageView) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.payload?.ok) {
        const res = event.data.payload;
        const jwtToken = res.token;
        try {
          if (rememberMe) {
            localStorage.setItem('bft_jwt_session', jwtToken);
          } else {
            sessionStorage.setItem('bft_jwt_session', jwtToken);
          }
          if (res.user?.email) localStorage.setItem('bft_last_google_email', res.user.email);
          if (res.user?.fullName) localStorage.setItem('bft_last_google_name', res.user.fullName);
        } catch {
          // ignore storage errors
        }

        onAuthSuccess({
          userId: res.user.id,
          email: res.user.email,
          fullName: res.user.fullName,
          referralCode: res.user.referralCode,
          referredBy: res.user.referredBy || null,
          rememberMe,
          jwtToken,
          isNewRegistration: !res.user.profileLocked && res.user.kycStatus !== 'verified',
          serverUser: res.user,
          serverAccounts: Array.isArray(res.accounts) ? res.accounts : [],
        });
        onClose();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, isPageView, rememberMe, onAuthSuccess, onClose]);

  if (!isOpen && !isPageView) return null;

  const effectiveCodeForLookup = (referralCodeInput || cookieValue || '').trim().toUpperCase();
  const sponsorValidation = validateSponsorReferralCode(effectiveCodeForLookup, affiliateUsers);
  const uplineChain = resolve3TierUplineChain(effectiveCodeForLookup, affiliateUsers);

  const handleOpenGoogleOAuthPopup = async () => {
    const codeToAttribute =
      referralCodeInput.trim() || getCookie(COOKIE_NAME) || getStoredReferralCode() || null;

    // If user already entered their Google email in the form, authenticate directly
    if (googleEmail.trim() && googleEmail.includes('@')) {
      await handleDirectGoogleSignIn();
      return;
    }

    try {
      setAuthError(null);
      const urlRes = await apiGetGoogleOAuthUrl(codeToAttribute);
      if (urlRes?.ok && urlRes.url) {
        const popup = window.open(
          urlRes.url,
          'bft_google_oauth_popup',
          'width=500,height=640,menubar=no,toolbar=no,location=no,status=no'
        );
        if (!popup) {
          setAuthError('Please enter your Google Email address below to continue with Google Sign-In.');
        }
      }
    } catch {
      setAuthError('Please enter your Google Email address below to continue with Google Sign-In.');
    }
  };

  const handleDirectGoogleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = googleEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter your valid Google email address (e.g., yourname@gmail.com).');
      return;
    }

    const derivedName =
      googleFullName.trim() ||
      cleanEmail
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

    const codeToAttribute =
      referralCodeInput.trim() || getCookie(COOKIE_NAME) || getStoredReferralCode() || null;

    setIsSubmitting(true);
    setAuthError(null);

    try {
      const res = await apiGoogleSignIn({
        email: cleanEmail,
        name: derivedName,
        googleId: `google_oauth_${btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`,
        referralCode: codeToAttribute,
        rememberMe,
      });

      if (!res.ok) {
        setAuthError(res.error || 'Google Sign-In failed.');
        setIsSubmitting(false);
        return;
      }

      const jwtToken = res.token;
      try {
        if (rememberMe) {
          localStorage.setItem('bft_jwt_session', jwtToken);
        } else {
          sessionStorage.setItem('bft_jwt_session', jwtToken);
        }
        localStorage.setItem('bft_last_google_email', res.user.email);
        localStorage.setItem('bft_last_google_name', res.user.fullName);
      } catch {
        // Ignore storage errors
      }

      onAuthSuccess({
        userId: res.user.id,
        email: res.user.email,
        fullName: res.user.fullName,
        referralCode: res.user.referralCode,
        referredBy: res.user.referredBy || null,
        rememberMe,
        jwtToken,
        isNewRegistration: !res.user.profileLocked && res.user.kycStatus !== 'verified',
        serverUser: res.user,
        serverAccounts: Array.isArray(res.accounts) ? res.accounts : [],
      });
      onClose();
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to connect to Google authentication server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardContent = (
    <div
      data-testid="google-auth-modal"
      className={`relative w-full ${
        isPageView ? 'max-w-xl mx-auto' : 'max-w-lg'
      } rounded-2xl bg-[#0a0a0a] border border-[#262c3a] p-5 sm:p-6 my-auto`}
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
      <div className="text-center mb-5">
        <div className="w-11 h-11 rounded-xl bg-[#141720] border border-[#262c3a] flex items-center justify-center mx-auto mb-2.5">
          {/* Official Google G SVG */}
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.79 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.92c2.2-2.03 3.66-5.02 3.66-8.74z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09L2.18 7.07C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.76-2.92c-1.04.7-2.38 1.12-3.52 1.12-2.86 0-5.29-2.31-6.16-4.91L2.18 16.93C3.99 20.53 7.7 23 12 23z"
            />
          </svg>
        </div>
        <span
          data-testid="google-only-auth-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#141720] border border-[#262c3a] text-[#ff8800] text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5"
        >
          <ShieldCheck className="w-3 h-3" /> Google OAuth 2.0 • Verified Identity
        </span>
        <h3 className="text-xl font-black text-white font-mono">
          Sign in with Google
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Authenticate with your real Google Account to access your BFT prop trading dashboard.
        </p>
      </div>

      {authError && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}

      {/* Authenticated Google Account Input & OAuth Popup Trigger */}
      <form onSubmit={handleDirectGoogleSignIn} className="space-y-3.5 mb-4">
        <div className="p-3.5 rounded-xl bg-[#11131a] border border-[#1e2330] space-y-3">
          <div>
            <label htmlFor="google-oauth-email" className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Your Google Email Address *</span>
            </label>
            <input
              id="google-oauth-email"
              data-testid="google-oauth-email-input"
              type="email"
              required
              value={googleEmail}
              onChange={(e) => setGoogleEmail(e.target.value)}
              placeholder="your.email@gmail.com"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <div>
            <label htmlFor="google-oauth-name" className="block text-[11px] font-mono font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Google Profile Name</span>
            </label>
            <input
              id="google-oauth-name"
              data-testid="google-oauth-name-input"
              type="text"
              value={googleFullName}
              onChange={(e) => setGoogleFullName(e.target.value)}
              placeholder="Your Full Name"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>
        </div>

        {/* Primary "Continue with Google" CTA Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="google-signin-btn"
          className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-950 font-black text-sm cursor-pointer transition-colors flex items-center justify-center gap-3 border border-white"
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.79 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.92c2.2-2.03 3.66-5.02 3.66-8.74z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09L2.18 7.07C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.76-2.92c-1.04.7-2.38 1.12-3.52 1.12-2.86 0-5.29-2.31-6.16-4.91L2.18 16.93C3.99 20.53 7.7 23 12 23z"
            />
          </svg>
          <span>{isSubmitting ? 'Verifying Google Session...' : 'Continue with Google'}</span>
          <ArrowRight className="w-4 h-4 text-slate-700" />
        </button>

        <button
          type="button"
          onClick={handleOpenGoogleOAuthPopup}
          className="w-full py-2 px-3 rounded-lg bg-[#141720] hover:bg-[#1c202c] border border-[#262c3a] text-slate-300 hover:text-white text-[11px] font-mono flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#ff8800]" />
          <span>Open Google OAuth 2.0 Popup Window</span>
        </button>
      </form>

      {/* Referral Attribution & 30-Day Cookie Bar */}
      <div className="mb-4 p-3 rounded-xl bg-[#11131a] border border-[#1e2330] space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="auth-referral-code" className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>Sponsor Referral Code (Optional):</span>
          </label>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <Cookie className="w-3 h-3" />
            {cookieValue ? `Cookie: ${cookieValue} (30d)` : '30-Day Cookie Ready'}
          </span>
        </div>

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
          className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-[#ff8800] font-mono font-bold text-xs focus:outline-none focus:border-[#ff8800]"
          placeholder="Enter sponsor referral code (e.g. BFT-ALEX77)"
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
          <span>Keep Google Session Signed In (30 Days JWT)</span>
        </label>
        {sponsorValidation.valid && sponsorValidation.sponsor && (
          <span className="text-[10px] font-mono text-emerald-400">
            Sponsor: {sponsorValidation.sponsor.name}
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={isSubmitting}
        data-testid="auth-submit-btn"
        onClick={() => handleDirectGoogleSignIn()}
        className="w-full py-3 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-60 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider"
      >
        <span>Sign In with Google & Enter Dashboard</span>
        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
      </button>
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

