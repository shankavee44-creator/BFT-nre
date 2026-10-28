import React, { useState, useEffect } from 'react';
import { supabase } from './utils/supabase';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { FastestPayoutAwardBanner } from './components/FastestPayoutAwardBanner';
import { PricingTiers } from './components/PricingTiers';
import { TradingRules } from './components/TradingRules';
import { TradingTerminal } from './components/TradingTerminal';
import { PaymentModal } from './components/PaymentModal';
import { CryptomusDepositModal } from './components/CryptomusDepositModal';
import { WithdrawalModal } from './components/WithdrawalModal';
import { UserDashboard } from './components/UserDashboard';
import { AuthModal } from './components/AuthModal';
import { CertificateModal } from './components/CertificateModal';
import { LiveChatWidget } from './components/LiveChatWidget';
import { FAQSection } from './components/FAQSection';
import { Footer } from './components/Footer';
import {
  TradingAccount,
  UserProfile,
  WithdrawalRequest,
  BinaryTrade,
  EvaluationPackage,
  UserAccount,
  ReferralRecord,
  AffiliatePayout,
  PromoCodeType,
} from './types';
import {
  loadProfile,
  saveProfile,
  loadAccounts,
  saveAccounts,
  loadActiveAccountId,
  saveActiveAccountId,
  loadWithdrawals,
  saveWithdrawals,
  loadTrades,
  saveTrades,
  clearAuthSession,
  loadOrCreateUserProfileByEmail,
} from './utils/storage';
import {
  isRouteProtected,
  resolveTargetRoute,
} from './utils/authRouting';
import {
  checkKycTimerCompletion,
  filterAccountsForUser,
} from './utils/kycVerification';
import {
  loadAffiliateUsers,
  saveAffiliateUsers,
  loadAffiliateReferrals,
  saveAffiliateReferrals,
  loadAffiliatePayouts,
  saveAffiliatePayouts,
  checkUrlForReferralCode,
  hasDirectReferralUrlParam,
  storeReferralCode,
  process3TierCommissions,
  processWithdrawalCommission,
} from './utils/affiliateEngine';
import { PACKAGES, advanceChallengeAccountPhase } from './utils/propRules';
import {
  apiGetMe,
  apiLogout,
  apiSubmitKyc,
  apiPassChallenge,
  apiUpdateAccountState,
  apiGetWithdrawals,
} from './utils/apiClient';
import { Gift, X, UserPlus, ShieldAlert, LogIn } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('home');
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile>(loadProfile());
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [trades, setTrades] = useState<BinaryTrade[]>([]);
  const [protectedRouteNotice, setProtectedRouteNotice] = useState<string | null>(null);

  // Active BFT Promo Code ('SPOOKY40' = 40% OFF New Users, 'SPOOKY20' = 20% OFF Existing Users)
  const [activePromoCode, setActivePromoCode] = useState<PromoCodeType>('SPOOKY40');
  const [dailyWithdrawalsAddOn, setDailyWithdrawalsAddOn] = useState<boolean>(false);

  // 3-Tier Multi-Level Affiliate State
  const [affiliateUsers, setAffiliateUsers] = useState<UserAccount[]>([]);
  const [affiliateReferrals, setAffiliateReferrals] = useState<ReferralRecord[]>([]);
  const [affiliatePayouts, setAffiliatePayouts] = useState<AffiliatePayout[]>([]);
  const [activeReferralNotification, setActiveReferralNotification] = useState<string | null>(null);

  // Modals state
  const [selectedPackageToBuy, setSelectedPackageToBuy] = useState<EvaluationPackage | null>(null);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  // Certificate Modal state when passing Step 1 / Phase 2
  const [certificateModalState, setCertificateModalState] = useState<{
    isOpen: boolean;
    certificateId: string;
    passedAccount: TradingAccount | null;
    deployedAccount: TradingAccount | null;
  }>({
    isOpen: false,
    certificateId: '',
    passedAccount: null,
    deployedAccount: null,
  });

  // Initial load & Direct Referral URL Detection -> Auto-Open Registration Modal
  useEffect(() => {
    const loadedAccounts = loadAccounts();
    const activeId = loadActiveAccountId();
    setAccounts(loadedAccounts);
    setActiveAccountId(activeId);
    setWithdrawals(loadWithdrawals());
    setTrades(loadTrades());

    setAffiliateUsers(loadAffiliateUsers());
    setAffiliateReferrals(loadAffiliateReferrals());
    setAffiliatePayouts(loadAffiliatePayouts());

    // Check live database session on backend
    apiGetMe().then((res) => {
      if (res && res.ok && res.user) {
        setUserProfile((prev) => {
          const isSameUser =
            prev.email &&
            res.user.email &&
            prev.email.toLowerCase() === res.user.email.toLowerCase();
          const localAlreadyVerified = isSameUser && prev.kycStatus === 'verified';
          const effectiveKycStatus =
            res.user.kycStatus === 'verified' || localAlreadyVerified
              ? 'verified'
              : res.user.kycStatus || (isSameUser ? prev.kycStatus : 'unverified');

          if (localAlreadyVerified && res.user.kycStatus !== 'verified') {
            apiSubmitKyc({
              docType: prev.kycDocumentType || 'Passport',
              fullName: prev.fullName || res.user.fullName,
              address: prev.address || res.user.address,
              dateOfBirth: prev.dateOfBirth || res.user.dateOfBirth,
              country: prev.country || res.user.country,
            }).catch(() => {});
          }

          const synced: UserProfile = {
            ...prev,
            id: res.user.id,
            email: res.user.email,
            fullName: res.user.fullName || (isSameUser ? prev.fullName : ''),
            referralCode: res.user.referralCode || (isSameUser ? prev.referralCode : ''),
            referredBy: res.user.referredBy || (isSameUser ? prev.referredBy : undefined),
            kycStatus: effectiveKycStatus,
            profileLocked: Boolean(res.user.profileLocked || effectiveKycStatus === 'verified'),
            address: res.user.address || (isSameUser ? prev.address : ''),
            dateOfBirth: res.user.dateOfBirth || (isSameUser ? prev.dateOfBirth : ''),
            country: res.user.country || (isSameUser ? prev.country : 'United States'),
            telegramHandle: res.user.telegramHandle || (isSameUser ? prev.telegramHandle : ''),
            isLoggedIn: true,
          };
          saveProfile(synced);
          return synced;
        });

        if (Array.isArray(res.accounts)) {
          const mappedAccounts = res.accounts.map((a: TradingAccount) => ({
            ...a,
            ownerId: res.user.id,
            ownerEmail: res.user.email,
          }));
          setAccounts(mappedAccounts);
          saveAccounts(mappedAccounts);
          const nextActiveId = mappedAccounts[0]?.id || '';
          setActiveAccountId(nextActiveId);
          saveActiveAccountId(nextActiveId);
        }

        apiGetWithdrawals()
          .then((wRes) => {
            if (wRes && wRes.ok && Array.isArray(wRes.withdrawals)) {
              const mappedW: WithdrawalRequest[] = wRes.withdrawals.map((row: any) => ({
                id: row.id,
                accountId: row.account_id,
                amount: row.gross_amount,
                withdrawalFee: row.fee_amount,
                netReceivedAmount: row.net_payout,
                profitSplitApplied: Math.round((row.profit_share_rate || 0.8) * 100),
                paymentMethod: row.payment_method || 'crypto_trc20',
                trc20Address: row.wallet_address,
                referenceNumber: row.reference_number,
                requestedAt: row.requested_at,
                completedAt: row.processed_at,
                status: row.status === 'completed' ? 'paid' : row.status,
                txHash: row.tx_hash,
                isDoublePayoutEligible: false,
                timeElapsedSeconds: 92,
              }));
              setWithdrawals(mappedW);
              saveWithdrawals(mappedW);
            }
          })
          .catch(() => {});
      }
    }).catch(() => {
      // offline or storage fallback
    });

    // Check if user visited with ?ref=USERCODE
    const directUrlRef = hasDirectReferralUrlParam();
    const refCode = checkUrlForReferralCode(userProfile?.id);
    if (directUrlRef) {
      storeReferralCode(directUrlRef);
      setActiveReferralNotification(directUrlRef);
      setAuthModalMode('register');
      setIsAuthModalOpen(true);
    } else if (refCode) {
      setActiveReferralNotification(refCode);
    }
  }, []);

  const handleUpdateSingleAccount = (updated: TradingAccount) => {
    setAccounts((prev) => {
      const newAccounts = prev.map((acc) => (acc.id === updated.id ? updated : acc));
      saveAccounts(newAccounts);
      return newAccounts;
    });
    apiUpdateAccountState(updated.id, {
      currentBalance: updated.currentBalance,
      equity: updated.equity,
      startingDayEquity: updated.startingDayEquity,
      status: updated.status,
      phase: updated.phase,
      tradesCount: updated.tradesCount,
      winRate: updated.winRate,
      tradingDaysCompleted: updated.tradingDaysCompleted,
      certificateId: updated.certificateId,
    }).catch(() => {});
  };

  const handleCreditAccountDeposit = (accountId: string, amountUsdt: number) => {
    setAccounts((prev) => {
      const updated = prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        const newBal = Number((acc.currentBalance + amountUsdt).toFixed(2));
        const newEq = Number((acc.equity + amountUsdt).toFixed(2));
        const nextAcc = {
          ...acc,
          currentBalance: newBal,
          equity: newEq,
        };
        apiUpdateAccountState(acc.id, {
          currentBalance: newBal,
          equity: newEq,
        }).catch(() => {});
        return nextAcc;
      });
      saveAccounts(updated);
      return updated;
    });
  };

  const handleSelectAccount = (id: string) => {
    setActiveAccountId(id);
    saveActiveAccountId(id);
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
    saveProfile(updated);
  };

  // Periodic Supabase profile sync for Manual Admin approvals (KYC, Balance)
  useEffect(() => {
    if (!userProfile.isLoggedIn || !userProfile.id) return;
    let isMounted = true;

    async function syncSupabaseProfile() {
      try {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userProfile.id)
          .maybeSingle();

        if (p && isMounted) {
          const effectiveStatus = p.kyc_status || userProfile.kycStatus;
          const isVerified = effectiveStatus === 'verified' || effectiveStatus === 'approved';
          if (p.kyc_status !== userProfile.kycStatus) {
            const updated: UserProfile = {
              ...userProfile,
              kycStatus: isVerified ? 'verified' : effectiveStatus,
              profileLocked: isVerified ? true : userProfile.profileLocked,
            };
            setUserProfile(updated);
            saveProfile(updated);
          }
        }
      } catch {
        // Fallback
      }
    }

    syncSupabaseProfile();
    const interval = setInterval(syncSupabaseProfile, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userProfile.isLoggedIn, userProfile.id, userProfile.kycStatus]);

  const handleAddWithdrawal = (req: WithdrawalRequest) => {
    const updated = [req, ...withdrawals];
    setWithdrawals(updated);
    saveWithdrawals(updated);
  };

  const handleUpdateWithdrawal = (req: WithdrawalRequest) => {
    const updated = withdrawals.map((w) => (w.id === req.id ? req : w));
    setWithdrawals(updated);
    saveWithdrawals(updated);
  };

  const handleAddTrade = (trade: BinaryTrade) => {
    setTrades((prev) => {
      const updated = [trade, ...prev];
      saveTrades(updated);
      return updated;
    });
  };

  const handleUpdateTrade = (trade: BinaryTrade) => {
    setTrades((prev) => {
      const updated = prev.map((t) => (t.id === trade.id ? trade : t));
      saveTrades(updated);
      return updated;
    });
  };

  const handleAddAffiliatePayout = (payout: AffiliatePayout) => {
    const updated = [payout, ...affiliatePayouts];
    setAffiliatePayouts(updated);
    saveAffiliatePayouts(updated);
  };

  const handleProcessCommissions = (params: {
    buyerUserId: string;
    buyerName: string;
    buyerEmail: string;
    packageTier: any;
    packageName: string;
    packagePrice: number;
    referralCodeUsed?: string | null;
  }) => {
    const res = process3TierCommissions({
      ...params,
      users: affiliateUsers,
      existingReferrals: affiliateReferrals,
    });
    setAffiliateUsers(res.updatedUsers);
    setAffiliateReferrals(res.allReferrals);
  };

  const handleWithdrawalCommission = (payoutAmount: number) => {
    const res = processWithdrawalCommission({
      traderUserId: userProfile.id,
      traderName: userProfile.fullName,
      traderEmail: userProfile.email,
      withdrawalAmount: payoutAmount,
      users: affiliateUsers,
      existingReferrals: affiliateReferrals,
    });
    if (res.commissionRecord) {
      setAffiliateReferrals(res.allReferrals);
    }
  };

  const handlePassChallengePhase = async (accountToPass: TradingAccount) => {
    try {
      const apiRes = await apiPassChallenge({
        accountId: accountToPass.id,
        provisionLiveDirectly: false,
      });
      if (apiRes && apiRes.ok && apiRes.deployedAccount && apiRes.lockedAccount) {
        const deployed: TradingAccount = {
          ...apiRes.deployedAccount,
          ownerId: userProfile.id,
          ownerEmail: userProfile.email,
        };
        const locked: TradingAccount = {
          ...apiRes.lockedAccount,
          ownerId: userProfile.id,
          ownerEmail: userProfile.email,
        };
        const updatedList = Array.isArray(apiRes.accounts)
          ? apiRes.accounts.map((a: TradingAccount) => ({
              ...a,
              ownerId: userProfile.id,
              ownerEmail: userProfile.email,
            }))
          : [deployed, ...accounts.map((a) => (a.id === accountToPass.id ? locked : a))];

        setAccounts(updatedList);
        saveAccounts(updatedList);
        setActiveAccountId(deployed.id);
        saveActiveAccountId(deployed.id);

        setCertificateModalState({
          isOpen: true,
          certificateId: apiRes.certificateId || deployed.certificateId || `CERT-${accountToPass.id}`,
          passedAccount: locked,
          deployedAccount: deployed,
        });
        return;
      }
    } catch {
      // Fallback to client-side progression if offline
    }

    const result = advanceChallengeAccountPhase(accountToPass);
    const deployedNext: TradingAccount = {
      ...result.deployedNextAccount,
      ownerId: userProfile.id,
      ownerEmail: userProfile.email,
    };
    const lockedPrev: TradingAccount = {
      ...result.lockedPreviousAccount,
      ownerId: userProfile.id,
      ownerEmail: userProfile.email,
    };
    const updatedList = [
      deployedNext,
      ...accounts.map((a) => (a.id === accountToPass.id ? lockedPrev : a)),
    ];
    setAccounts(updatedList);
    saveAccounts(updatedList);
    setActiveAccountId(deployedNext.id);
    saveActiveAccountId(deployedNext.id);

    setCertificateModalState({
      isOpen: true,
      certificateId: result.certificateId,
      passedAccount: lockedPrev,
      deployedAccount: deployedNext,
    });
  };

  const handleNewAccountPurchased = (newAccount: TradingAccount) => {
    const ownedAccount: TradingAccount = {
      ...newAccount,
      ownerId: userProfile.id,
      ownerEmail: userProfile.email,
    };
    const updated = [ownedAccount, ...accounts];
    setAccounts(updated);
    saveAccounts(updated);
    setActiveAccountId(ownedAccount.id);
    saveActiveAccountId(ownedAccount.id);
    setSelectedPackageToBuy(null);
    handleUpdateProfile({
      ...userProfile,
      activeAccountId: ownedAccount.id,
      isLoggedIn: true,
    });
    setProtectedRouteNotice(null);
    setCurrentTab('terminal');
  };

  const handleOpenAuthModal = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const handleNavigateTab = (tabId: string) => {
    const routeCheck = resolveTargetRoute(tabId, Boolean(userProfile?.isLoggedIn));
    if (!routeCheck.allowed) {
      setProtectedRouteNotice(routeCheck.securityNotice || 'Authentication required to access this portal.');
      setCurrentTab('home');
      setAuthModalMode('login');
      setIsAuthModalOpen(true);
      return;
    }
    setProtectedRouteNotice(null);
    setCurrentTab(tabId);
  };

  // Route protection guard: redirect immediately if on a protected route while unauthenticated
  useEffect(() => {
    if (isRouteProtected(currentTab) && !userProfile.isLoggedIn) {
      const routeCheck = resolveTargetRoute(currentTab, false);
      setProtectedRouteNotice(routeCheck.securityNotice || 'Authentication required to access this portal.');
      setCurrentTab('home');
      setAuthModalMode('login');
      setIsAuthModalOpen(true);
    }
  }, [currentTab, userProfile.isLoggedIn]);

  const handleLogout = () => {
    apiLogout().catch(() => {});
    clearAuthSession();
    handleUpdateProfile({ ...userProfile, isLoggedIn: false });
    setProtectedRouteNotice(null);
    setCurrentTab('home');
  };

  const userAccounts = filterAccountsForUser(accounts, userProfile);
  const activeAccount =
    userAccounts.find((acc) => acc.id === activeAccountId) || userAccounts[0] || undefined;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-100 flex flex-col selection:bg-[#ff8800] selection:text-slate-950 w-full max-w-[100vw] overflow-x-hidden relative">
      {/* Top Header (Hidden on mobile when inside full-screen Trading Terminal) */}
      <div className={currentTab === 'terminal' ? 'hidden md:block' : 'block'}>
        <Header
          currentTab={currentTab}
          setCurrentTab={handleNavigateTab}
          accounts={userAccounts}
          activeAccount={activeAccount}
          onSelectAccount={handleSelectAccount}
          userProfile={userProfile}
          activePromoCode={activePromoCode}
          onSelectPromoCode={setActivePromoCode}
          onOpenWithdrawalModal={() => handleNavigateTab('withdrawals')}
          onOpenDepositModal={() => setIsDepositModalOpen(true)}
          onOpenAuthModal={handleOpenAuthModal}
          onLogout={handleLogout}
          onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
        />
      </div>

      {/* Security Protected Route Notice Banner */}
      {protectedRouteNotice && (
        <div className="bg-[#1c1208] border-b border-[#ff8800]/50 px-4 py-2.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex flex-wrap items-center gap-3 max-w-5xl mx-auto flex-1 justify-center">
            <ShieldAlert className="w-4 h-4 text-[#ffaa00] shrink-0" />
            <span className="font-medium font-sans">
              <strong className="text-white font-mono uppercase tracking-wider mr-1">Protected Area:</strong>
              {protectedRouteNotice}
            </span>
            <button
              onClick={() => handleOpenAuthModal('login')}
              className="px-3 py-1 rounded-lg bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer font-mono"
            >
              <LogIn className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Sign In</span>
            </button>
          </div>
          <button
            onClick={() => setProtectedRouteNotice(null)}
            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Active Referral Notification Banner with Direct Sign-Up Trigger */}
      {activeReferralNotification && (
        <div className="bg-gradient-to-r from-[#ff8800]/25 via-[#1c1208] to-emerald-500/20 border-b border-[#ff8800]/40 px-4 py-2.5 flex items-center justify-between text-xs text-amber-100">
          <div className="flex flex-wrap items-center gap-3 max-w-5xl mx-auto flex-1 justify-center">
            <Gift className="w-4 h-4 text-[#ffaa00] shrink-0 animate-bounce" />
            <span>
              <strong>Direct Referral Partner Active:</strong> Sponsor Code{' '}
              <span className="font-mono bg-[#ff8800]/25 border border-[#ff8800]/40 px-2 py-0.5 rounded text-[#ffaa00] font-bold">
                {activeReferralNotification}
              </span>{' '}
              stored in 30-day browser cookie!
            </span>
            <button
              onClick={() => handleOpenAuthModal('register')}
              className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 font-black font-mono text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3 h-3" />
              <span>Open Referral Registration</span>
            </button>
          </div>
          <button
            onClick={() => setActiveReferralNotification(null)}
            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main View Switcher */}
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {currentTab === 'home' && (
          <div>
            <HeroBanner
              activePromoCode={activePromoCode}
              onSelectPromoCode={setActivePromoCode}
              onSelectTier={() => {
                const el = document.getElementById('pricing');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenTerminal={() => handleNavigateTab('terminal')}
              onOpenWithdrawals={() => handleNavigateTab('withdrawals')}
              onOpenAuthModal={handleOpenAuthModal}
              isLoggedIn={Boolean(userProfile?.isLoggedIn)}
            />
            <FastestPayoutAwardBanner
              onClaimDiscount={() => {
                const el = document.getElementById('pricing');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onOpenWithdrawals={() => handleNavigateTab('withdrawals')}
            />
            <PricingTiers
              activePromoCode={activePromoCode}
              onSelectPromoCode={setActivePromoCode}
              onSelectPackage={(pkg, unlockDaily) => {
                setDailyWithdrawalsAddOn(Boolean(unlockDaily));
                setSelectedPackageToBuy(pkg);
              }}
              onOpenRules={() => setCurrentTab('rules')}
            />
            <TradingRules />
            <FAQSection />
          </div>
        )}

        {currentTab === 'faq' && <FAQSection />}

        {currentTab === 'terminal' && (
          <TradingTerminal
            account={activeAccount || null}
            accounts={userAccounts}
            onSelectAccount={handleSelectAccount}
            onUpdateAccount={handleUpdateSingleAccount}
            trades={activeAccount ? trades.filter((t) => t.accountId === activeAccount.id) : []}
            onAddTrade={handleAddTrade}
            onUpdateTrade={handleUpdateTrade}
            onOpenWithdrawalModal={() => setIsWithdrawalModalOpen(true)}
            onOpenDepositModal={() => setIsDepositModalOpen(true)}
            onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
            onNavigateTab={handleNavigateTab}
            userProfile={userProfile}
            onPassChallengePhase={handlePassChallengePhase}
          />
        )}

        {currentTab === 'rules' && <TradingRules />}

        {currentTab === 'withdrawals' && (
          <div className="py-4 sm:py-8 max-w-6xl mx-auto px-2 sm:px-6 lg:px-8">
            <WithdrawalModal
              account={activeAccount || null}
              accounts={userAccounts}
              onSelectAccount={handleSelectAccount}
              onClose={() => handleNavigateTab('dashboard')}
              onUpdateAccount={handleUpdateSingleAccount}
              withdrawals={withdrawals}
              onAddWithdrawal={handleAddWithdrawal}
              onUpdateWithdrawal={handleUpdateWithdrawal}
              onWithdrawalCommissionTriggered={handleWithdrawalCommission}
              inlineMode={true}
              userProfile={userProfile}
              onNavigateToKyc={() => setCurrentTab('dashboard')}
              onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
              onOpenDepositModal={() => setIsDepositModalOpen(true)}
              onNavigateTab={handleNavigateTab}
              trades={trades}
            />
          </div>
        )}

        {(currentTab === 'dashboard' || currentTab === 'affiliate') && (
          <UserDashboard
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            accounts={userAccounts}
            trades={trades}
            referrals={affiliateReferrals}
            payouts={affiliatePayouts}
            onAddPayout={handleAddAffiliatePayout}
            onSelectAccount={handleSelectAccount}
            onOpenTerminal={() => handleNavigateTab('terminal')}
            onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
            onOpenWithdrawalModal={() => handleNavigateTab('withdrawals')}
            onNavigateToPricing={() => {
              setCurrentTab('home');
              setTimeout(() => {
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            onPassChallengePhase={handlePassChallengePhase}
            initialTab={currentTab === 'affiliate' ? 'affiliate' : 'accounts'}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Modals */}
      {selectedPackageToBuy && (
        <PaymentModal
          packageToBuy={selectedPackageToBuy}
          activePromoCode={activePromoCode}
          initialDailyWithdrawals={dailyWithdrawalsAddOn}
          applyBreachDiscount={Boolean(
            activeAccount?.discountEligible || activeAccount?.breachType === 'hard'
          )}
          onClose={() => setSelectedPackageToBuy(null)}
          onSuccess={handleNewAccountPurchased}
          onCommissionsProcessed={handleProcessCommissions}
        />
      )}

      <CryptomusDepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        activeAccount={activeAccount || null}
        accounts={userAccounts}
        onSelectAccount={handleSelectAccount}
        onCreditAccountDeposit={handleCreditAccountDeposit}
      />

      {isWithdrawalModalOpen && currentTab !== 'withdrawals' && (
        <WithdrawalModal
          account={activeAccount || null}
          accounts={userAccounts}
          onSelectAccount={handleSelectAccount}
          onClose={() => setIsWithdrawalModalOpen(false)}
          onUpdateAccount={handleUpdateSingleAccount}
          withdrawals={withdrawals}
          onAddWithdrawal={handleAddWithdrawal}
          onUpdateWithdrawal={handleUpdateWithdrawal}
          onWithdrawalCommissionTriggered={handleWithdrawalCommission}
          userProfile={userProfile}
          onNavigateToKyc={() => {
            setIsWithdrawalModalOpen(false);
            setCurrentTab('dashboard');
          }}
          onOpenChallengeModal={() => {
            setIsWithdrawalModalOpen(false);
            setSelectedPackageToBuy(PACKAGES[2]);
          }}
          onOpenDepositModal={() => {
            setIsWithdrawalModalOpen(false);
            setIsDepositModalOpen(true);
          }}
          onNavigateTab={(tab) => {
            setIsWithdrawalModalOpen(false);
            handleNavigateTab(tab);
          }}
          trades={trades}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        initialMode={authModalMode}
        initialReferralCode={activeReferralNotification}
        affiliateUsers={affiliateUsers}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={({
          userId,
          email,
          fullName,
          referralCode,
          referredBy,
          rememberMe,
          isNewRegistration,
          updatedAffiliateUsers,
          serverUser,
          serverAccounts,
        }) => {
          if (updatedAffiliateUsers) {
            setAffiliateUsers(updatedAffiliateUsers);
            saveAffiliateUsers(updatedAffiliateUsers);
          }
          const loadedOrCreatedProfile = loadOrCreateUserProfileByEmail({
            userId,
            email,
            fullName,
            referralCode,
            referredBy: referredBy || undefined,
            rememberMe,
            isNewRegistration,
            kycStatus: serverUser?.kycStatus,
            kycDocType: serverUser?.kycDocType,
            profileLocked: serverUser?.profileLocked,
            address: serverUser?.address,
            dateOfBirth: serverUser?.dateOfBirth,
            country: serverUser?.country,
            telegramHandle: serverUser?.telegramHandle,
            avatarUrl: serverUser?.avatarUrl,
          });
          setUserProfile(loadedOrCreatedProfile);

          if (Array.isArray(serverAccounts)) {
            const mappedServerAccounts = serverAccounts.map((a) => ({
              ...a,
              ownerId: userId,
              ownerEmail: email,
            }));
            setAccounts(mappedServerAccounts);
            saveAccounts(mappedServerAccounts);
            if (mappedServerAccounts.length > 0) {
              setActiveAccountId(mappedServerAccounts[0].id);
              saveActiveAccountId(mappedServerAccounts[0].id);
            } else {
              setActiveAccountId('');
              saveActiveAccountId('');
            }
          } else {
            const ownedAccounts = filterAccountsForUser(accounts, loadedOrCreatedProfile);
            if (ownedAccounts.length > 0) {
              setActiveAccountId(ownedAccounts[0].id);
              saveActiveAccountId(ownedAccounts[0].id);
            } else {
              setActiveAccountId('');
              saveActiveAccountId('');
            }
          }

          // Load user's real withdrawals from SQLite (empty for new users)
          apiGetWithdrawals()
            .then((wRes) => {
              if (wRes && wRes.ok && Array.isArray(wRes.withdrawals)) {
                const mappedW: WithdrawalRequest[] = wRes.withdrawals.map((row: any) => ({
                  id: row.id,
                  accountId: row.account_id,
                  amount: row.gross_amount,
                  withdrawalFee: row.fee_amount,
                  netReceivedAmount: row.net_payout,
                  profitSplitApplied: Math.round((row.profit_share_rate || 0.8) * 100),
                  paymentMethod: row.payment_method || 'crypto_trc20',
                  trc20Address: row.wallet_address,
                  referenceNumber: row.reference_number,
                  requestedAt: row.requested_at,
                  completedAt: row.processed_at,
                  status: row.status === 'completed' ? 'paid' : row.status,
                  txHash: row.tx_hash,
                  isDoublePayoutEligible: false,
                  timeElapsedSeconds: 92,
                }));
                setWithdrawals(mappedW);
                saveWithdrawals(mappedW);
              } else {
                setWithdrawals([]);
                saveWithdrawals([]);
              }
            })
            .catch(() => {
              setWithdrawals([]);
              saveWithdrawals([]);
            });

          setProtectedRouteNotice(null);
          setIsAuthModalOpen(false);
          setCurrentTab('dashboard');
        }}
      />

      <CertificateModal
        isOpen={certificateModalState.isOpen}
        onClose={() => setCertificateModalState((prev) => ({ ...prev, isOpen: false }))}
        traderName={userProfile.fullName}
        certificateId={certificateModalState.certificateId}
        passedAccount={certificateModalState.passedAccount}
        deployedAccount={certificateModalState.deployedAccount}
        onLaunchRealAccount={() => {
          if (certificateModalState.deployedAccount) {
            handleSelectAccount(certificateModalState.deployedAccount.id);
            setCurrentTab('terminal');
          }
        }}
      />

      {/* Interactive Live Support Chat Widget (Hidden on mobile terminal where bottom nav handles Support) */}
      <div className={currentTab === 'terminal' ? 'hidden md:block' : 'block'}>
        <LiveChatWidget />
      </div>

      {/* Institutional Footer */}
      {currentTab !== 'terminal' && <Footer onNavigate={handleNavigateTab} />}
    </div>
  );
}
