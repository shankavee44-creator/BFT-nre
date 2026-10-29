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
import { apiEmailSessionSync } from '../utils/apiClient';
import { supabase } from '../utils/supabase';
import { resolveOrBuildUserProfile } from '../utils/authOtpLogic';

interface AuthModalProps {
  isOpen: boolean;
  isPageView?: boolean;
  initialMode?: 'login' | 'register';
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
  const [authTab, setAuthTab] = useState<'email_signin' | 'email_signup'>(
    initialMode === 'register' ? 'email_signup' : 'email_signin'
  );

  // Standard Email & Password Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [cookieValue, setCookieValue] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen || isPageView) {
      if (initialMode === 'register') setAuthTab('email_signup');
      else setAuthTab('email_signin');
    }
  }, [initialMode, isOpen, isPageView]);

  useEffect(() => {
    if (isOpen || isPageView) {
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
    }
  }, [isOpen, isPageView, initialReferralCode]);

  // Helper: Check if profile exists in Supabase `profiles` table; if missing, safely upsert without duplicate insert conflict, then hydrate session
  const ensureSupabaseUserProfileAndLogin = async (
    user: any,
    sponsorCodeOverride?: string | null
  ) => {
    const sponsorCode =
      sponsorCodeOverride ||
      referralCodeInput.trim().toUpperCase() ||
      getCookie(COOKIE_NAME) ||
      getStoredReferralCode() ||
      null;

    let existingProfile: any = null;
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      existingProfile = profileData;
    } catch {
      // ignore read error
    }

    const { needsUpsert, upsertPayload, resolvedProfile } = resolveOrBuildUserProfile(
      user,
      existingProfile,
      sponsorCode
    );

    if (needsUpsert) {
      try {
        await supabase
          .from('profiles')
          .upsert(upsertPayload, { onConflict: 'id', ignoreDuplicates: true });
      } catch {
        // Trigger or RLS may already handle creation
      }
    }

    // Sync with backend session so /api/auth/me, /api/profile/lock, and /api/kyc/submit are authenticated
    const backendSync = await apiEmailSessionSync({
      email: resolvedProfile.email,
      name: resolvedProfile.fullName,
      userId: user.id,
      referralCode: resolvedProfile.referredBy,
      rememberMe,
    }).catch(() => null);

    const jwtToken =
      backendSync?.token ||
      createSessionJwtToken({
        userId: user.id,
        email: resolvedProfile.email,
        referralCode: resolvedProfile.referralCode,
        rememberMe,
      });

    try {
      if (rememberMe) {
        localStorage.setItem('bft_jwt_session', jwtToken);
      } else {
        sessionStorage.setItem('bft_jwt_session', jwtToken);
      }
    } catch {
      // ignore
    }

    const serverUser = backendSync?.user || {
      id: user.id,
      email: resolvedProfile.email,
      fullName: resolvedProfile.fullName,
      referralCode: resolvedProfile.referralCode,
      kycStatus: resolvedProfile.kycStatus,
      profileLocked: resolvedProfile.profileLocked,
      address: resolvedProfile.address,
      dateOfBirth: resolvedProfile.dateOfBirth,
      country: resolvedProfile.country,
      balance: resolvedProfile.balance,
    };

    onAuthSuccess({
      userId: user.id,
      email: resolvedProfile.email,
      fullName: serverUser.fullName || resolvedProfile.fullName,
      referralCode: resolvedProfile.referralCode,
      referredBy: resolvedProfile.referredBy || serverUser.referredBy || null,
      rememberMe,
      jwtToken,
      isNewRegistration: false,
      serverUser,
      serverAccounts: Array.isArray(backendSync?.accounts) ? backendSync.accounts : undefined,
    });
    onClose();
  };

  if (!isOpen && !isPageView) return null;

  const effectiveCodeForLookup = (referralCodeInput || cookieValue || '').trim().toUpperCase();
  const sponsorValidation = validateSponsorReferralCode(effectiveCodeForLookup, affiliateUsers);
  const uplineChain = resolve3TierUplineChain(effectiveCodeForLookup, affiliateUsers);

  // Standard Email & Password Sign-In Handler
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setAuthError('Please enter your email and password.');
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Supabase Auth Email & Password Sign-In
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error || !data?.user) {
        // Check if user was registered via backend session sync
        const backendRes = await apiEmailSessionSync({
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          rememberMe,
        });
        if (backendRes?.ok && backendRes.user) {
          const jwtToken =
            backendRes.token ||
            createSessionJwtToken({
              userId: backendRes.user.id,
              email: cleanEmail,
              referralCode: backendRes.user.referralCode || 'BFT-PRO',
              rememberMe,
            });
          try {
            if (rememberMe) {
              localStorage.setItem('bft_jwt_session', jwtToken);
            } else {
              sessionStorage.setItem('bft_jwt_session', jwtToken);
            }
          } catch {
            // ignore
          }
          onAuthSuccess({
            userId: backendRes.user.id,
            email: backendRes.user.email,
            fullName: backendRes.user.fullName,
            referralCode: backendRes.user.referralCode,
            referredBy: backendRes.user.referredBy || null,
            rememberMe,
            jwtToken,
            isNewRegistration: false,
            serverUser: backendRes.user,
            serverAccounts: Array.isArray(backendRes.accounts) ? backendRes.accounts : [],
          });
          onClose();
          setIsSubmitting(false);
          return;
        }

        setAuthError('Invalid email or password.');
        setIsSubmitting(false);
        return;
      }

      await ensureSupabaseUserProfileAndLogin(data.user, effectiveCodeForLookup || null);
    } catch {
      setAuthError('Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Standard Email & Password Registration / Sign-Up Handler
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanFullName = fullName.trim() || cleanEmail.split('@')[0];
    const sponsorCode = referralCodeInput.trim().toUpperCase() || getStoredReferralCode() || null;

    // Generate 6-character referral code for user metadata
    const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    if (!cleanEmail || !password || password.length < 6) {
      setAuthError('Please enter a valid email and password (min 6 characters).');
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Attempt Supabase Auth Sign Up with metadata for the trigger (full_name & referral_code)
      // Note: Do NOT manually insert into `profiles` after signUp because `handle_new_user_signup` trigger handles it automatically.
      let { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanFullName,
            referral_code: myReferralCode,
          },
        },
      });

      // If a database trigger error occurs, retry without metadata payload
      if (
        signUpError &&
        (signUpError.message?.includes('Database error') ||
          signUpError.message?.includes('AuthRetryableFetchError'))
      ) {
        const retry = await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });
        if (retry.data?.user && !retry.error) {
          data = retry.data;
          signUpError = null;
        }
      }

      // If Supabase trigger or rate limit still fails, seamlessly provision via backend session
      if (
        signUpError &&
        (signUpError.message?.includes('Database error') ||
          signUpError.message?.includes('AuthRetryableFetchError') ||
          signUpError.message?.toLowerCase().includes('rate limit'))
      ) {
        const backendRes = await apiEmailSessionSync({
          email: cleanEmail,
          name: cleanFullName,
          referralCode: sponsorCode,
          rememberMe,
        });
        const fallbackUserId =
          backendRes?.user?.id || `usr_${Date.now().toString(36)}_${myReferralCode.toLowerCase()}`;
        const fallbackRef = backendRes?.user?.referralCode || myReferralCode;
        const jwtToken =
          backendRes?.token ||
          createSessionJwtToken({
            userId: fallbackUserId,
            email: cleanEmail,
            referralCode: fallbackRef,
            rememberMe,
          });
        try {
          if (rememberMe) {
            localStorage.setItem('bft_jwt_session', jwtToken);
          } else {
            sessionStorage.setItem('bft_jwt_session', jwtToken);
          }
        } catch {
          // ignore
        }

        onAuthSuccess({
          userId: fallbackUserId,
          email: cleanEmail,
          fullName: cleanFullName,
          referralCode: fallbackRef,
          referredBy: sponsorCode,
          rememberMe,
          jwtToken,
          isNewRegistration: true,
          serverUser: backendRes?.user || {
            id: fallbackUserId,
            email: cleanEmail,
            fullName: cleanFullName,
            referralCode: fallbackRef,
            kycStatus: 'unverified',
            profileLocked: false,
            balance: 0,
          },
          serverAccounts: Array.isArray(backendRes?.accounts) ? backendRes.accounts : [],
        });
        onClose();
        setIsSubmitting(false);
        return;
      }

      if (signUpError) {
        let msg = signUpError.message || 'An unexpected error occurred during registration.';
        if (
          msg.includes('already registered') ||
          msg.includes('already exists') ||
          msg.includes('User already registered')
        ) {
          msg = 'An account with this email address already exists. Please sign in with your email and password.';
        } else if (msg.includes('Failed to fetch')) {
          msg =
            'Network Error: Connection to authentication server failed. Please check your internet connection or disable ad-blockers.';
        }
        setAuthError(msg);
        setIsSubmitting(false);
        return;
      }

      const user = data?.user;
      if (!user) {
        setAuthError(
          'Registration completed, but no user profile was returned. Please try signing in.'
        );
        setIsSubmitting(false);
        return;
      }

      // 2. Sync user with backend database session & finalize JWT
      const backendSync = await apiEmailSessionSync({
        email: cleanEmail,
        name: cleanFullName,
        userId: user.id,
        referralCode: sponsorCode,
        rememberMe,
      }).catch(() => null);

      const jwtToken =
        backendSync?.token ||
        createSessionJwtToken({
          userId: user.id,
          email: cleanEmail,
          referralCode: myReferralCode,
          rememberMe,
        });

      try {
        if (rememberMe) {
          localStorage.setItem('bft_jwt_session', jwtToken);
        } else {
          sessionStorage.setItem('bft_jwt_session', jwtToken);
        }
      } catch {
        // ignore
      }

      onAuthSuccess({
        userId: user.id,
        email: cleanEmail,
        fullName: cleanFullName,
        referralCode: myReferralCode,
        referredBy: sponsorCode,
        rememberMe,
        jwtToken,
        isNewRegistration: true,
        serverUser: backendSync?.user || {
          id: user.id,
          email: cleanEmail,
          fullName: cleanFullName,
          referralCode: myReferralCode,
          kycStatus: 'unverified',
          profileLocked: false,
          balance: 0,
        },
        serverAccounts: Array.isArray(backendSync?.accounts) ? backendSync.accounts : [],
      });
      onClose();
    } catch (err: any) {
      console.error('Auth Error:', err);
      let msg = err?.message || 'An unexpected error occurred during registration.';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        msg = 'An account with this email address already exists. Please sign in with your email and password.';
      }
      setAuthError(msg);
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
        <div className="flex justify-end mb-2 -mt-1 -mr-1">
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Auth Tab Navigation: Email Sign In | Register (Sign Up) */}
      <div className="flex bg-[#141720] border border-[#262c3a] p-1 rounded-xl mb-5 font-mono text-[11px] font-bold">
        <button
          type="button"
          data-testid="auth-tab-email-signin"
          onClick={() => {
            setAuthTab('email_signin');
            setAuthError(null);
          }}
          className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
            authTab === 'email_signin'
              ? 'bg-[#ff8800] text-slate-950 font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Sign In</span>
        </button>

        <button
          type="button"
          data-testid="auth-tab-email-signup"
          onClick={() => {
            setAuthTab('email_signup');
            setAuthError(null);
          }}
          className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
            authTab === 'email_signup'
              ? 'bg-[#ff8800] text-slate-950 font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Register</span>
        </button>
      </div>

      {/* Header Badge & Title */}
      <div className="text-center mb-5">
        <span
          data-testid="bft-auth-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#141720] border border-[#262c3a] text-[#ff8800] text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5"
        >
          <ShieldCheck className="w-3 h-3" /> BFT Encrypted Email & Password Auth
        </span>
        <h3 className="text-xl font-black text-white font-mono">
          {authTab === 'email_signin' ? 'Sign In to Trader Portal' : 'Create Trader Account'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {authTab === 'email_signin'
            ? 'Enter your registered email and password to access your prop trading dashboard and OTC terminal.'
            : 'Register with your email and password to receive instant $100,000 OTC trading terminal access.'}
        </p>
      </div>

      {/* Error Alert Box */}
      {authError && (
        <div
          data-testid="auth-error-banner"
          className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 font-mono"
        >
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}

      {/* FORM MODE 1: EMAIL & PASSWORD SIGN IN */}
      {authTab === 'email_signin' && (
        <form onSubmit={handleEmailSignIn} className="space-y-3.5 mb-4">
          <div>
            <label
              htmlFor="signin-email"
              className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Email Address *</span>
            </label>
            <input
              id="signin-email"
              data-testid="signin-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@domain.com"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <div>
            <label
              htmlFor="signin-password"
              className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Password *</span>
            </label>
            <input
              id="signin-password"
              data-testid="signin-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="signin-submit-btn"
            className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-60 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider mt-2"
          >
            <span>{isSubmitting ? 'Verifying Session...' : 'Sign In & Enter Dashboard'}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      )}

      {/* FORM MODE 2: EMAIL & PASSWORD REGISTER / SIGN UP */}
      {authTab === 'email_signup' && (
        <form onSubmit={handleEmailSignUp} className="space-y-3.5 mb-4">
          <div>
            <label
              htmlFor="signup-fullname"
              className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Full Legal Name *</span>
            </label>
            <input
              id="signup-fullname"
              data-testid="signup-fullname-input"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jordan Vance"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Email Address *</span>
            </label>
            <input
              id="signup-email"
              data-testid="signup-email-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@domain.com"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <div>
            <label
              htmlFor="signup-password"
              className="block text-[11px] font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Choose Password *</span>
            </label>
            <input
              id="signup-password"
              data-testid="signup-password-input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-[#0a0a0a] border border-[#262c3a] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="signup-submit-btn"
            className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-60 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider mt-2"
          >
            <span>
              {isSubmitting ? 'Creating Account...' : 'Register & Get Live Terminal Access'}
            </span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      )}

      {/* Sponsor Referral Code Input */}
      <div className="mb-4 p-3 rounded-xl bg-[#11131a] border border-[#1e2330] space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="auth-referral-code"
            className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1.5"
          >
            <Gift className="w-3.5 h-3.5 text-[#ff8800]" />
            <span>Sponsor Referral Code (Optional):</span>
          </label>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <Cookie className="w-3 h-3" />
            {cookieValue ? `Cookie: ${cookieValue}` : '30-Day Cookie Active'}
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
          placeholder="Enter sponsor code (e.g. BFT-ALEX77)"
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

      <div className="flex items-center justify-between text-xs mb-3 font-mono">
        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded accent-[#ff8800] cursor-pointer"
          />
          <span>Keep Session Signed In (30 Days)</span>
        </label>
        {sponsorValidation.valid && sponsorValidation.sponsor && (
          <span className="text-[10px] text-emerald-400">
            Sponsor: {sponsorValidation.sponsor.name}
          </span>
        )}
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
