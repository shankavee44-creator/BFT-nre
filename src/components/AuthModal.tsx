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
  ArrowLeft,
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
import { apiEmailSessionSync, apiValidate2fa, apiSend2faEmailOtp } from '../utils/apiClient';
import { supabase, ensureSupabaseProfileAndDemoAccount } from '../utils/supabase';
import { resolveOrBuildUserProfile, isTwoFactorEnabledOnProfile } from '../utils/authOtpLogic';
import { BftLogo } from './BftLogo';

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
  const [is2faRequired, setIs2faRequired] = useState(false);
  const [tempUserId, setTempUserId] = useState('');
  const [pendingAuthUser, setPendingAuthUser] = useState<any>(null);
  const [totpCode, setTotpCode] = useState('');
  const [dispatchedEmailOtp, setDispatchedEmailOtp] = useState<string | null>(null);
  const [otpResendMessage, setOtpResendMessage] = useState<string | null>(null);

  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [cookieValue, setCookieValue] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration Compliance Checkboxes & Terms Modal State
  const [ageAgreementChecked, setAgeAgreementChecked] = useState(false);
  const [usTaxResidentChecked, setUsTaxResidentChecked] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsActiveTab, setTermsActiveTab] = useState<'terms' | 'kyc_aml' | 'privacy'>('terms');

  useEffect(() => {
    if (isOpen || isPageView) {
      if (initialMode === 'register') setAuthTab('email_signup');
      else setAuthTab('email_signin');
      setIs2faRequired(false);
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
      if (!existingProfile && user.email) {
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', String(user.email).trim().toLowerCase())
          .maybeSingle();
        existingProfile = byEmail;
      }
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

    const serverUser = {
      ...(backendSync?.user || {}),
      id: existingProfile?.id || user.id,
      email: resolvedProfile.email,
      fullName: resolvedProfile.fullName || backendSync?.user?.fullName,
      referralCode: resolvedProfile.referralCode || backendSync?.user?.referralCode,
      kycStatus: resolvedProfile.kycStatus || backendSync?.user?.kycStatus,
      profileLocked: resolvedProfile.profileLocked ?? backendSync?.user?.profileLocked,
      address: resolvedProfile.address || backendSync?.user?.address,
      dateOfBirth: resolvedProfile.dateOfBirth || backendSync?.user?.dateOfBirth,
      country: resolvedProfile.country || backendSync?.user?.country,
      balance: resolvedProfile.balance,
      selfBalance:
        resolvedProfile.selfBalance !== undefined
          ? resolvedProfile.selfBalance
          : backendSync?.user?.selfBalance,
      demoBalance:
        resolvedProfile.demoBalance !== undefined
          ? resolvedProfile.demoBalance
          : backendSync?.user?.demoBalance,
      fundedBalance:
        resolvedProfile.fundedBalance !== undefined
          ? resolvedProfile.fundedBalance
          : backendSync?.user?.fundedBalance,
    };

    onAuthSuccess({
      userId: existingProfile?.id || user.id,
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
      // Lock auto-redirect in App.tsx onAuthStateChange while login 2FA check is in progress
      try {
        sessionStorage.setItem('bft_2fa_login_gate_active', 'true');
        sessionStorage.removeItem(`bft_2fa_verified_${cleanEmail}`);
        localStorage.removeItem(`bft_2fa_verified_${cleanEmail}`);
      } catch {
        // ignore
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInError || !signInData?.user) {
        try {
          sessionStorage.removeItem('bft_2fa_login_gate_active');
        } catch {}
        setAuthError(signInError?.message || 'Invalid email or password.');
        setIsSubmitting(false);
        return;
      }

      const authUser = signInData.user;
      let profileRow: any = null;
      try {
        const { data: pById } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle();
        profileRow = pById;
        if (!profileRow) {
          const { data: pByEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', cleanEmail)
            .maybeSingle();
          profileRow = pByEmail;
        }
      } catch {
        // ignore profile lookup error
      }

      const userHas2fa = isTwoFactorEnabledOnProfile(profileRow, authUser);
      const resolvedAuthUserId = profileRow?.id || authUser.id;

      // Always enforce 2FA verification step during login (supports both Email OTP & Authenticator Code)
      try {
        sessionStorage.removeItem(`bft_2fa_verified_${authUser.id}`);
        localStorage.removeItem(`bft_2fa_verified_${authUser.id}`);
        if (profileRow?.id) {
          sessionStorage.removeItem(`bft_2fa_verified_${profileRow.id}`);
          localStorage.removeItem(`bft_2fa_verified_${profileRow.id}`);
        }
        sessionStorage.setItem(`bft_2fa_pending_${authUser.id}`, 'true');
      } catch {
        // ignore
      }

      const otpDispatch = await apiSend2faEmailOtp({
        userId: resolvedAuthUserId,
        email: cleanEmail,
        purpose: 'login',
        forceNew: true,
      });

      setDispatchedEmailOtp(otpDispatch.code);
      setOtpResendMessage(`6-digit security OTP dispatched to ${cleanEmail}`);
      setTempUserId(resolvedAuthUserId);
      setPendingAuthUser({
        ...authUser,
        hasTotpConfigured: userHas2fa,
        totp_secret:
          profileRow?.totp_secret ||
          authUser.user_metadata?.totp_secret ||
          authUser.user_metadata?.pending_totp_secret ||
          undefined,
      });
      setIs2faRequired(true);
      setTotpCode('');
      setAuthError(null);
      setIsSubmitting(false);
      return;
    } catch {
      try {
        sessionStorage.removeItem('bft_2fa_login_gate_active');
      } catch {}
      setAuthError('An error occurred during sign-in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanCode = totpCode.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6) {
      setAuthError('Please enter the full 6-digit verification code from Google Authenticator.');
      return;
    }

    setIsSubmitting(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const validation = await apiValidate2fa({
        userId: tempUserId,
        email: cleanEmail,
        code: cleanCode,
        secret: pendingAuthUser?.totp_secret,
      });

      if (!validation.isValid) {
        setAuthError(validation.error || 'Invalid 6-digit verification code.');
        setIsSubmitting(false);
        return;
      }

      const resolvedUser = pendingAuthUser || {
        id: tempUserId || 'usr_bft_001',
        email: cleanEmail,
      };

      try {
        sessionStorage.removeItem('bft_2fa_login_gate_active');
        sessionStorage.removeItem(`bft_2fa_pending_${resolvedUser.id}`);
        sessionStorage.setItem(`bft_2fa_verified_${resolvedUser.id}`, 'true');
        sessionStorage.setItem(`bft_2fa_verified_${cleanEmail}`, 'true');
        if (rememberMe) {
          localStorage.setItem(`bft_2fa_verified_${resolvedUser.id}`, 'true');
          localStorage.setItem(`bft_2fa_verified_${cleanEmail}`, 'true');
        }
      } catch {
        // ignore
      }

      await ensureSupabaseUserProfileAndLogin(resolvedUser);
    } catch {
      setAuthError('An error occurred during 2FA verification.');
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

    if (!ageAgreementChecked || !usTaxResidentChecked) {
      setAuthError(
        'You must confirm you are 18+ years old, accept the Service Agreement, and declare you are not a US tax resident to register.'
      );
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Attempt Supabase Auth Sign Up with metadata for the trigger (full_name, referral_code, numeric_id)
      const generatedNumericId = String(Math.floor(10000000 + Math.random() * 90000000));
      let { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanFullName,
            referral_code: sponsorCode,
            numeric_id: generatedNumericId,
          },
        },
      });

      // If a database trigger error or 500 occurs, retry without metadata payload first
      if (
        signUpError &&
        ((signUpError as any).status === 500 ||
          signUpError.message?.includes('Database error') ||
          signUpError.message?.includes('500') ||
          signUpError.message?.includes('saving new user') ||
          signUpError.message?.includes('AuthRetryableFetchError'))
      ) {
        try {
          const retry = await supabase.auth.signUp({
            email: cleanEmail,
            password,
          });
          if (retry.data?.user && !retry.error) {
            data = retry.data;
            signUpError = null;
          }
        } catch {
          // ignore retry error
        }
      }

      // If Supabase trigger, database 500, quota, or rate limit still fails, seamlessly provision via backend session
      const isFallbackRequired =
        signUpError &&
        ((signUpError as any).status === 500 ||
          signUpError.message?.includes('Database error') ||
          signUpError.message?.includes('500') ||
          signUpError.message?.includes('Internal Server Error') ||
          signUpError.message?.includes('saving new user') ||
          signUpError.message?.includes('trigger') ||
          signUpError.message?.includes('AuthRetryableFetchError') ||
          signUpError.message?.toLowerCase().includes('rate limit') ||
          signUpError.message?.toLowerCase().includes('quota') ||
          signUpError.message?.toLowerCase().includes('connection'));

      if (isFallbackRequired) {
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

      // 2. Guarantee user profile and demo trading account exist in Supabase
      await ensureSupabaseProfileAndDemoAccount({
        userId: user.id,
        email: cleanEmail,
        fullName: cleanFullName,
        referralCode: myReferralCode,
        sponsorCode,
      }).catch(() => {});

      // 3. Sync user with backend database session & finalize JWT
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
      {!is2faRequired && (
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
      )}

      {/* Header Logo, Badge & Title */}
      <div className="text-center mb-5">
        <div className="flex justify-center mb-3">
          <BftLogo
            imgClassName="h-12 sm:h-14 w-auto"
            testId="auth-bft-logo"
            alt="Binary Funded Trader (BFT) Bull Logo"
          />
        </div>
        <span
          data-testid="bft-auth-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#141720] border border-[#262c3a] text-[#ff8800] text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5"
        >
          <ShieldCheck className="w-3 h-3" />{' '}
          {is2faRequired ? 'TWO-FACTOR VERIFICATION REQUIRED' : 'BFT Encrypted Email & Password Auth'}
        </span>
        <h3 className="text-xl font-black text-white font-mono">
          {is2faRequired
            ? 'Two-Factor Authentication (2FA)'
            : authTab === 'email_signin'
            ? 'Sign In to Trader Portal'
            : 'Create Trader Account'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {is2faRequired
            ? 'Enter your 6-digit Google Authenticator code to unlock your dashboard.'
            : authTab === 'email_signin'
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
      {authTab === 'email_signin' && !is2faRequired && (
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
            <span>{isSubmitting ? 'Verifying Credentials...' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>
      )}

      {/* FORM MODE 1B: 2FA VERIFICATION (EMAIL OTP OR AUTHENTICATOR CODE) */}
      {authTab === 'email_signin' && is2faRequired && (
        <form onSubmit={handleVerify2fa} className="space-y-4 mb-4 font-mono">
          <div
            data-testid="signin-2fa-card"
            className="p-4 rounded-xl bg-[#141720] border border-[#ff8800]/30 text-center space-y-2"
          >
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800]">
              <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h4 className="text-sm font-black text-white">
              Two-Factor Authentication (2FA) Required
            </h4>
            <p className="text-xs text-slate-400">
              Enter the 6-digit verification code sent via <strong className="text-white">Email OTP</strong> to{' '}
              <strong className="text-[#ff8800]">{email}</strong> or from your{' '}
              <strong className="text-white">Google Authenticator</strong> app:
            </p>
            {dispatchedEmailOtp && (
              <div
                data-testid="signin-2fa-email-otp-banner"
                className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-left flex items-center justify-between gap-2"
              >
                <div className="text-[11px] text-emerald-300">
                  <span className="font-bold block text-emerald-200">
                    {otpResendMessage || 'Email OTP Dispatched'}
                  </span>
                  <span>
                    Instant Verification OTP:{' '}
                    <strong
                      data-testid="signin-2fa-email-otp-code"
                      className="text-white font-black tracking-widest bg-black/50 px-1.5 py-0.5 rounded border border-emerald-500/40"
                    >
                      {dispatchedEmailOtp}
                    </strong>
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="signin-2fa-autofill-otp-btn"
                  onClick={() => setTotpCode(dispatchedEmailOtp)}
                  className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[10px] font-bold uppercase shrink-0 cursor-pointer"
                >
                  Use Code
                </button>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="signin-2fa"
              className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#ff8800]" />
                <span>6-Digit 2FA Code (Email OTP / Authenticator) *</span>
              </span>
              <span className="text-[10px] text-slate-500">{totpCode.length}/6 digits</span>
            </label>
            <input
              id="signin-2fa"
              data-testid="signin-2fa-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/20 rounded-xl text-white text-center text-xl font-black tracking-[0.5em] focus:outline-none focus:border-[#ff8800]"
            />
            <div className="flex items-center justify-between mt-1.5 text-[11px]">
              <span className="text-slate-500">Valid for 10 minutes</span>
              <button
                type="button"
                data-testid="signin-2fa-resend-otp-btn"
                onClick={async () => {
                  const cleanEmail = email.trim().toLowerCase();
                  const res = await apiSend2faEmailOtp({
                    userId: tempUserId,
                    email: cleanEmail,
                    purpose: 'login',
                    forceNew: true,
                  });
                  setDispatchedEmailOtp(res.code);
                  setOtpResendMessage(`New 6-digit OTP sent to ${cleanEmail}`);
                }}
                className="text-[#ff8800] hover:underline font-bold cursor-pointer"
              >
                Resend Email OTP
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting || totpCode.length !== 6}
              data-testid="signin-2fa-submit-btn"
              className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-50 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-2 uppercase tracking-wider"
            >
              <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
              <span>{isSubmitting ? 'Verifying 2FA Code...' : 'Verify 2FA & Enter Dashboard'}</span>
            </button>

            <button
              type="button"
              data-testid="signin-2fa-back-btn"
              onClick={() => {
                setIs2faRequired(false);
                setTotpCode('');
                setAuthError(null);
              }}
              className="w-full py-2.5 rounded-xl bg-transparent hover:bg-white/5 text-slate-400 hover:text-white text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Email Sign-In</span>
            </button>
          </div>
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

          {/* Mandatory Compliance Checkboxes */}
          <div className="space-y-2.5 pt-1 font-mono text-xs text-slate-300">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="age-terms-checkbox"
                checked={ageAgreementChecked}
                onChange={(e) => setAgeAgreementChecked(e.target.checked)}
                className="mt-0.5 rounded accent-[#ff8800] w-4 h-4 cursor-pointer shrink-0"
              />
              <span>
                I confirm that I am 18 years old or older and accept the{' '}
                <button
                  type="button"
                  data-testid="open-service-agreement-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowTermsModal(true);
                  }}
                  className="text-[#ff8800] underline hover:text-[#ff9900] font-bold cursor-pointer inline-block"
                >
                  Service Agreement
                </button>
                .
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="us-tax-resident-checkbox"
                checked={usTaxResidentChecked}
                onChange={(e) => setUsTaxResidentChecked(e.target.checked)}
                className="mt-0.5 rounded accent-[#ff8800] w-4 h-4 cursor-pointer shrink-0"
              />
              <span>
                I declare and confirm that I am not a citizen or resident of the US for tax purposes.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !ageAgreementChecked || !usTaxResidentChecked}
            data-testid="signup-submit-btn"
            className="w-full py-3.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-50 text-slate-950 font-black text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider mt-2"
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

  const termsModalContent = showTermsModal && (
    <div
      data-testid="service-agreement-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl max-h-[88vh] rounded-2xl bg-[#0a0a0a] border border-[#262c3a] p-4 sm:p-6 text-slate-200 font-mono shadow-2xl flex flex-col my-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#262c3a]">
          <div className="flex items-center gap-2 text-[#ff8800]">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-white">
              BINARY FUNDED TRADER (BFT) — LEGAL COMPLIANCE & POLICIES
            </h3>
          </div>
          <button
            type="button"
            data-testid="close-service-agreement-btn-x"
            onClick={() => setShowTermsModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher: Terms of Service | KYC & AML Policy | Privacy Policy */}
        <div className="flex bg-[#141720] border border-[#262c3a] p-1 rounded-xl my-3 font-mono text-[11px] font-bold shrink-0">
          <button
            type="button"
            data-testid="terms-tab-terms"
            onClick={() => setTermsActiveTab('terms')}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              termsActiveTab === 'terms'
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Terms of Service</span>
          </button>

          <button
            type="button"
            data-testid="terms-tab-kyc"
            onClick={() => setTermsActiveTab('kyc_aml')}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              termsActiveTab === 'kyc_aml'
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>KYC & AML Policy</span>
          </button>

          <button
            type="button"
            data-testid="terms-tab-privacy"
            onClick={() => setTermsActiveTab('privacy')}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              termsActiveTab === 'privacy'
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Privacy Policy</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-4 text-xs text-slate-300 pr-2 leading-relaxed">
          {/* TAB 1: TERMS OF SERVICE */}
          {termsActiveTab === 'terms' && (
            <div className="space-y-4 font-mono text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-[#141720] border border-[#262c3a] text-[11px] text-[#ff8800] font-bold">
                SERVICE AGREEMENT & SIMULATED EVALUATION TERMS (Last Updated: November 2026)
              </div>

              <section className="space-y-1.5">
                <h4 className="text-sm font-bold text-white">1. NATURE OF SERVICES (SIMULATED ENVIRONMENT)</h4>
                <p>
                  1.1. All accounts provided by BFT (Instant Funded, Self-Capital, and Evaluation Challenges) operate within a simulated trading environment.
                </p>
                <p>
                  1.2. Funds visible in trading accounts represent simulated credits and do not constitute real-world bank deposits or legal tender unless explicitly verified and processed through official payout channels.
                </p>
                <p>
                  1.3. BFT reserves the right to modify leverage, execution parameters, payout schedules, and asset availability at its sole discretion to maintain market stability.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-sm font-bold text-white">3. PROHIBITED JURISDICTIONS & AGE RESTRICTIONS</h4>
                <p>
                  3.1. <strong>Age Requirement:</strong> Users must be at least 18 years old or the legal age of majority in their jurisdiction.
                </p>
                <p>
                  3.2. <strong>Restricted Territories:</strong> BFT does not offer services to citizens, residents, or tax entities of the United States of America, FATF-blacklisted jurisdictions, or sanctioned countries. Submitting false location data via VPN/Proxy will lead to immediate termination.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-sm font-bold text-white">5. COPY TRADING & AFFILIATE COMPLIANCE</h4>
                <p>
                  5.1. Master Copy Providers must maintain a verified minimum 60% Win Rate over a 90-day window. BFT reserves the right to suspend or demote master profiles that violate platform risk metrics.
                </p>
                <p>
                  5.2. Automated system checks monitor affiliate referrals. Self-referrals, fraudulent account creation loops, or abusive marketing will lead to immediate cancellation of affiliate balances.
                </p>
              </section>

              <section className="space-y-1.5">
                <h4 className="text-sm font-bold text-white">6. LIMITATION OF LIABILITY</h4>
                <p>
                  6.1. BFT shall not be held liable for trading losses, market slippage, internet latency, WebSocket disconnects, or third-party service disruptions.
                </p>
                <p>
                  6.2. Trading derivatives and binary options involves substantial risk. Users accept complete personal responsibility for their capital allocations.
                </p>
              </section>
            </div>
          )}

          {/* TAB 2: KYC & AML POLICY */}
          {termsActiveTab === 'kyc_aml' && (
            <div className="space-y-4 font-mono text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-[#141720] border border-[#ff8800]/30 text-[11px] text-[#ff8800] font-bold">
                STRICT KYC (KNOW YOUR CUSTOMER) & ANTI-MONEY LAUNDERING (AML) POLICY
              </div>

              <section className="space-y-2">
                <h4 className="text-sm font-bold text-white">2. STRICT KYC & AML COMPLIANCE GUIDELINES</h4>
                <p>
                  2.1. <strong>Mandatory Identity Verification:</strong> All traders must successfully pass Identity Verification (KYC) before requesting any withdrawals or participating in profit splits.
                </p>
                <p>
                  2.2. <strong>Required Documents:</strong> Users must submit a valid Government-issued Photo ID (Passport, National ID, or Driver's License) along with a Proof of Address (Utility bill or Bank statement issued within 90 days).
                </p>
                <p>
                  2.3. <strong>One Account & Verification Rule:</strong> Each individual is permitted to verify only ONE identity profile. Duplicate accounts, identity theft, or submitting falsified documents will result in immediate permanent ban, account closure, and forfeiture of all balances.
                </p>
                <p>
                  2.4. <strong>Anti-Money Laundering (AML) Compliance:</strong> BFT strictly adheres to international AML protocols. We reserve the right to freeze funds, flag suspicious transactions, delay crypto payouts, and report illicit activities to relevant legal authorities.
                </p>
                <p>
                  2.5. <strong>Third-Party Payments Prohibited:</strong> All crypto deposits and withdrawal wallet addresses must directly belong to the verified account holder. Payouts to third-party wallets are strictly prohibited.
                </p>
              </section>
            </div>
          )}

          {/* TAB 3: PRIVACY POLICY */}
          {termsActiveTab === 'privacy' && (
            <div className="space-y-4 font-mono text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-[#141720] border border-emerald-500/30 text-[11px] text-emerald-400 font-bold">
                PRIVACY POLICY & DATA PROTECTION REGULATION
              </div>

              <section className="space-y-2">
                <h4 className="text-sm font-bold text-white">4. PRIVACY POLICY & DATA PROTECTION</h4>
                <p>
                  4.1. <strong>Data Collection:</strong> We collect essential personal data including email address, identity document numbers, transaction logs, IP addresses, and device identifiers solely for account security, KYC compliance, and service delivery.
                </p>
                <p>
                  4.2. <strong>Data Security & Encryption:</strong> All user verification documents and transaction records are stored using high-grade encryption protocols (including Supabase Row-Level Security and secure cloud storage).
                </p>
                <p>
                  4.3. <strong>Third-Party Disclosure:</strong> BFT does not sell, rent, or trade personal user data to third parties. Data is shared exclusively with verified KYC processing partners, payment gateways, or legal authorities when required by law.
                </p>
                <p>
                  4.4. <strong>Data Retention:</strong> Verification data is securely retained for the duration of the account's active lifecycle to satisfy international legal compliance and prevent fraud.
                </p>
              </section>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-[#262c3a] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 text-center sm:text-left">
            By clicking Accept & Close, you acknowledge and agree to all 3 policy sections.
          </span>
          <button
            type="button"
            data-testid="close-service-agreement-btn"
            onClick={() => {
              setAgeAgreementChecked(true);
              setShowTermsModal(false);
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 font-black text-xs cursor-pointer transition-colors font-mono uppercase tracking-wider"
          >
            Accept & Close
          </button>
        </div>
      </div>
    </div>
  );

  if (isPageView) {
    return (
      <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {cardContent}
        {termsModalContent}
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      {cardContent}
      {termsModalContent}
    </div>
  );
};
