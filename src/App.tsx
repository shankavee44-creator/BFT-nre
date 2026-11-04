import React, { useState, useEffect } from 'react';
import { supabase, ensureSupabaseProfileAndDemoAccount } from './utils/supabase';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { FastestPayoutAwardBanner } from './components/FastestPayoutAwardBanner';
import { PricingTiers } from './components/PricingTiers';
import { TradingRules } from './components/TradingRules';
import { TradingTerminal } from './components/TradingTerminal';
import { PaymentModal } from './components/PaymentModal';
import { DirectDepositModal } from './components/DirectDepositModal';
import { WithdrawalModal } from './components/WithdrawalModal';
import { UserDashboard } from './components/UserDashboard';
import { AuthModal } from './components/AuthModal';
import { CertificateModal } from './components/CertificateModal';
import { AdminDashboard } from './components/AdminDashboard';
import { GitHubSyncModal } from './components/GitHubSyncModal';
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
} from './types/index.ts';
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
  getStoredReferralCode,
  process3TierCommissions,
  processWithdrawalCommission,
} from './utils/affiliateEngine';
import { registerDynamicAssets } from './utils/storage';
import { supabaseMarketSync } from './utils/supabaseMarketSync';
import {
  fetchUserTrades,
  fetchActiveOpenTradesFromSupabase,
  createSupabaseTrade,
  updateSupabaseTrade,
  subscribeUserTrades,
  mapFromSupabaseRow,
  reconcileLoadedTradesOnMount,
  mergeTradesAuthoritatively,
  filterTradesForActiveAccount,
  ensureTradeUuid,
} from './utils/supabaseTradeSync';
import {
  subscribeUserRealtimeChannels,
  applyRealtimeProfileUpdate,
  fetchSupabaseProfileRow,
  getAuthoritativeAccountBalance,
  resolveActiveTradingAccount,
  resolveAccountBalanceColumn,
  recordDirectBalanceCommit,
  commitProfileBalanceToSupabase,
  hasActiveTradesForColumn,
  rehydrateActiveTradesInLedger,
  ProfileSyncSource,
  mergeRealtimeWithdrawal,
  mapSupabaseWithdrawalToRequest,
  mergeRealtimeCommission,
  mapSupabaseCommissionToReferralRecord,
  mergeRealtimePurchase,
  NormalizedPurchaseRecord,
  insertSupabaseTradingAccount,
  updateSupabaseTradingAccountState,
} from './utils/supabaseRealtimeSync';
import {
  PACKAGES,
  advanceChallengeAccountPhase,
  createDefaultPersonalLiveAccount,
  isPersonalLiveAccount,
  isDemoAccount,
  isAccountSoftBreached,
  isAccountHardBreached,
  sanitizeAccountForAntiBreach,
} from './utils/propRules';
import {
  apiGetMe,
  apiEmailSessionSync,
  apiLogout,
  apiSubmitKyc,
  apiPassChallenge,
  apiDepositPersonalAccount,
  apiUpdateAccountState,
  apiGetWithdrawals,
  apiGetUserPurchases,
  apiPlaceTrade,
  apiSettleTrade,
  apiGetUserTrades,
} from './utils/apiClient';
import { resolveOrBuildUserProfile, isTwoFactorEnabledOnProfile } from './utils/authOtpLogic';
import { broadcastSyncEvent, subscribeToSyncEvents } from './utils/crossTabSync';
import { Gift, X, UserPlus, ShieldAlert, LogIn } from 'lucide-react';

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [currentTab, setCurrentTab] = useState<string>(isAutostart ? 'terminal' : 'home');
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('');
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const p = loadProfile();
    if (isAutostart && !p.isLoggedIn) {
      const autoProfile: UserProfile = {
        ...p,
        id: p.id || 'usr_bft_001',
        email: p.email || 'trader@binaryfunded.com',
        fullName: p.fullName || 'Pro Funded Trader',
        isLoggedIn: true,
      };
      saveProfile(autoProfile);
      return autoProfile;
    }
    return p;
  });
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [trades, setTrades] = useState<BinaryTrade[]>(() => {
    const loaded = loadTrades();
    // Reconcile loaded trades on mount: keep still-running active trades alive so countdowns resume
    // seamlessly on page refresh, and settle any trades whose expiry elapsed during refresh into history.
    const { reconciledTrades = [], newlySettledTrades = [] } = reconcileLoadedTradesOnMount(loaded);
    if (Array.isArray(newlySettledTrades) && newlySettledTrades.length > 0) {
      saveTrades(reconciledTrades);
      try {
        localStorage.setItem('bft_trades', JSON.stringify(reconciledTrades));
      } catch {}
    }
    rehydrateActiveTradesInLedger(reconciledTrades);
    return reconciledTrades;
  });
  const [protectedRouteNotice, setProtectedRouteNotice] = useState<string | null>(null);

  const userProfileRef = React.useRef<UserProfile>(userProfile);
  userProfileRef.current = userProfile;

  const applyProfileRowToState = React.useCallback(
    (profileRow: Record<string, any> | null | undefined, source: ProfileSyncSource = 'realtime') => {
      if (!profileRow || typeof profileRow !== 'object') return;
      setUserProfile((prevProfile) => {
        const { updatedProfile, changed } = applyRealtimeProfileUpdate(
          prevProfile,
          [],
          profileRow,
          {
            source,
            userId: prevProfile.id,
            userEmail: prevProfile.email,
          }
        );
        if (!changed) return prevProfile;
        userProfileRef.current = updatedProfile;
        saveProfile(updatedProfile);
        broadcastSyncEvent('PROFILE_UPDATED', updatedProfile);
        return updatedProfile;
      });
      setAccounts((prevAccounts) => {
        const { updatedAccounts, changed } = applyRealtimeProfileUpdate(
          userProfileRef.current,
          prevAccounts,
          profileRow,
          {
            source,
            userId: userProfileRef.current.id,
            userEmail: userProfileRef.current.email,
          }
        );
        if (!changed) return prevAccounts;
        saveAccounts(updatedAccounts);
        return updatedAccounts;
      });
    },
    []
  );

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
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isGitHubSyncOpen, setIsGitHubSyncOpen] = useState(false);

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

    setAffiliateUsers(loadAffiliateUsers());
    setAffiliateReferrals(loadAffiliateReferrals());
    setAffiliatePayouts(loadAffiliatePayouts());

    // Check URL for admin access challenge
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1' || window.location.pathname === '/admin') {
      setIsAdminDashboardOpen(true);
    }
    if (urlParams.get('autostart') === '1') {
      setCurrentTab('terminal');
    }

    // Check live database session on backend
    const initialStored = loadProfile();
    apiGetMe(
      initialStored?.isLoggedIn && (initialStored.id || initialStored.email)
        ? { userId: initialStored.id, email: initialStored.email }
        : undefined
    ).then((res) => {
      if (res && res.ok && res.user) {
        setUserProfile((prev) => {
          const isSameUser =
            prev.email &&
            res.user.email &&
            prev.email.toLowerCase() === res.user.email.toLowerCase();
          const localVerified = isSameUser && prev.kycStatus === 'verified';
          const localPending = isSameUser && prev.kycStatus === 'pending';

          const effectiveKycStatus =
            res.user.kycStatus === 'verified' || res.user.kycStatus === 'approved' || localVerified
              ? 'verified'
              : res.user.kycStatus === 'pending' || localPending
              ? 'pending'
              : res.user.kycStatus || (isSameUser ? prev.kycStatus : 'unverified');

          const effectiveProfileLocked = Boolean(
            res.user.profileLocked ||
              (isSameUser && prev.profileLocked) ||
              effectiveKycStatus === 'verified' ||
              effectiveKycStatus === 'pending'
          );

          if (isSameUser && (localVerified || localPending) && res.user.kycStatus === 'unverified') {
            apiSubmitKyc({
              userId: res.user.id || prev.id,
              email: res.user.email || prev.email,
              docType: prev.kycDocumentType || 'ID Card',
              documentNumber: prev.kycDocumentNumber,
              frontDocumentUrl: prev.kycFrontDocumentUrl,
              backDocumentUrl: prev.kycBackDocumentUrl,
              frontFileName: prev.kycDocumentFileName,
              backFileName: prev.kycBackDocumentFileName,
              fullName: prev.fullName || res.user.fullName,
              address: prev.address || res.user.address,
              dateOfBirth: prev.dateOfBirth || res.user.dateOfBirth,
              country: prev.country || res.user.country,
              status: localVerified ? 'verified' : 'pending',
            }).catch(() => {});
          }

          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const preserveUuid =
            isSameUser && uuidRegex.test(prev.id || '') && !uuidRegex.test(res.user.id || '');

          const synced: UserProfile = {
            ...prev,
            id: preserveUuid ? prev.id : res.user.id || prev.id,
            email: res.user.email || prev.email,
            fullName: res.user.fullName || (isSameUser ? prev.fullName : ''),
            referralCode: res.user.referralCode || (isSameUser ? prev.referralCode : ''),
            referredBy: res.user.referredBy || (isSameUser ? prev.referredBy : undefined),
            kycStatus: effectiveKycStatus,
            kycDocumentType: res.user.kycDocType || (isSameUser ? prev.kycDocumentType : 'ID Card'),
            kycDocumentNumber: res.user.kycDocumentNumber || (isSameUser ? prev.kycDocumentNumber : undefined),
            kycFrontDocumentUrl: res.user.kycFrontDocumentUrl || (isSameUser ? prev.kycFrontDocumentUrl : undefined),
            kycBackDocumentUrl: res.user.kycBackDocumentUrl || (isSameUser ? prev.kycBackDocumentUrl : undefined),
            kycDocumentFileName: res.user.kycDocumentFileName || (isSameUser ? prev.kycDocumentFileName : undefined),
            kycBackDocumentFileName: res.user.kycBackDocumentFileName || (isSameUser ? prev.kycBackDocumentFileName : undefined),
            kycSubmittedAt: res.user.kycSubmittedAt || (isSameUser ? prev.kycSubmittedAt : undefined),
            profileLocked: effectiveProfileLocked,
            address: res.user.address || (isSameUser ? prev.address : ''),
            dateOfBirth: res.user.dateOfBirth || (isSameUser ? prev.dateOfBirth : ''),
            country: res.user.country || (isSameUser ? prev.country : 'United States'),
            telegramHandle: res.user.telegramHandle || (isSameUser ? prev.telegramHandle : ''),
            selfBalance:
              prev.selfBalance !== undefined
                ? prev.selfBalance
                : res.user.selfBalance !== undefined
                ? res.user.selfBalance
                : prev.selfBalance,
            isLoggedIn: true,
          };
          saveProfile(synced);
          return synced;
        });

        if (Array.isArray(res.accounts)) {
          setAccounts((prev) => {
            const mappedAccounts = res.accounts.map((a: TradingAccount) => {
              const incoming = sanitizeAccountForAntiBreach({
                ...a,
                ownerId: res.user.id,
                ownerEmail: res.user.email,
              });
              const localAcc = prev.find(
                (p) =>
                  p.id === incoming.id ||
                  (p.supabaseAccountId && p.supabaseAccountId === incoming.id) ||
                  p.loginId === incoming.loginId
              );
              if (!localAcc) return incoming;

              const localHasMoreTrades = (localAcc.tradesCount || 0) > (incoming.tradesCount || 0);
              const localHasPostTradeBalance =
                localHasMoreTrades &&
                Math.abs(localAcc.currentBalance - localAcc.initialBalance) > 0.01 &&
                Math.abs(incoming.currentBalance - incoming.initialBalance) < 0.01;
              const localHasTerminalStatus =
                isAccountSoftBreached(localAcc) ||
                isAccountHardBreached(localAcc) ||
                localAcc.status === 'passed' ||
                localAcc.status === 'passed_phase_1';

              return sanitizeAccountForAntiBreach({
                ...incoming,
                supabaseAccountId: localAcc.supabaseAccountId || incoming.supabaseAccountId,
                currentBalance: localHasPostTradeBalance ? localAcc.currentBalance : incoming.currentBalance,
                equity: localHasPostTradeBalance ? localAcc.equity : incoming.equity,
                startingDayEquity:
                  isAccountSoftBreached(localAcc) || localHasPostTradeBalance
                    ? localAcc.startingDayEquity
                    : incoming.startingDayEquity,
                status: localHasTerminalStatus ? localAcc.status : incoming.status,
                breachType: localAcc.breachType || incoming.breachType,
                softBreachResetTime: localAcc.softBreachResetTime || incoming.softBreachResetTime,
                tradesCount: Math.max(localAcc.tradesCount || 0, incoming.tradesCount || 0),
                winRate: localAcc.winRate || incoming.winRate,
              });
            });
            saveAccounts(mappedAccounts);
            const storedActiveId = loadActiveAccountId();
            if (!storedActiveId) {
              const fundedAcc = mappedAccounts.find((a: TradingAccount) => a.currentBalance > 0);
              const nextActiveId = fundedAcc?.id || 'BFT-DEMO-001';
              setActiveAccountId(nextActiveId);
              saveActiveAccountId(nextActiveId);
            }
            return mappedAccounts;
          });
        }

        fetchSupabaseProfileRow({
          userId: res.user.id,
          userEmail: res.user.email,
        })
          .then((pRow) => {
            if (pRow) {
              applyProfileRowToState(pRow, 'poll');
            }
          })
          .catch(() => {});

        apiGetWithdrawals()
          .then((wRes) => {
            if (wRes && wRes.ok && Array.isArray(wRes.withdrawals) && wRes.withdrawals.length > 0) {
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
              setWithdrawals((prev) => {
                const existingIds = new Set(prev.map((w) => String(w.id)));
                const merged = [...prev];
                for (const item of mappedW) {
                  if (!existingIds.has(String(item.id))) {
                    merged.push(item);
                  }
                }
                saveWithdrawals(merged);
                return merged;
              });
            }
          })
          .catch(() => {});

        apiGetUserPurchases({ userId: res.user.id, email: res.user.email })
          .then((pRes) => {
            if (pRes && pRes.ok && Array.isArray(pRes.purchases) && pRes.purchases.length > 0) {
              setPurchases((prev) => {
                let next = [...prev];
                for (const row of pRes.purchases) {
                  next = mergeRealtimePurchase(next, row, 'INSERT');
                }
                return next;
              });
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

    // Initial fetch of trades from Supabase user_trades
    const mergeIncomingTrades = (fetched: BinaryTrade[]) => {
      if (!Array.isArray(fetched) || fetched.length === 0) return;
      setTrades((prev) => {
        const merged = mergeTradesAuthoritatively(prev, fetched);
        saveTrades(merged);
        try {
          localStorage.setItem('bft_trades', JSON.stringify(merged));
        } catch {}
        rehydrateActiveTradesInLedger(merged);
        return merged;
      });
    };

    fetchUserTrades(userProfile.id).then((fetchedTrades) => {
      if (fetchedTrades.length > 0) {
        mergeIncomingTrades(fetchedTrades);
      }
    });

    fetchActiveOpenTradesFromSupabase(userProfile.id).then((openTrades) => {
      if (openTrades.length > 0) {
        mergeIncomingTrades(openTrades);
      }
    });

    // Global OTC Asset Discovery & Sync
    supabaseMarketSync.fetchAllOtcAssets().then((assets) => {
      if (assets.length > 0) {
        registerDynamicAssets(assets);
        supabaseMarketSync.initGlobalMarketSync();
      }
    });
  }, [userProfile.id, userProfile.isLoggedIn]);

  const handleSyncIncomingTrades = React.useCallback((incoming: BinaryTrade[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setTrades((prev) => {
      const merged = mergeTradesAuthoritatively(prev, incoming);
      saveTrades(merged);
      try {
        localStorage.setItem('bft_trades', JSON.stringify(merged));
      } catch {}
      rehydrateActiveTradesInLedger(merged);
      return merged;
    });
  }, []);

  // Real-time Trade Subscription & Periodic Sync
  useEffect(() => {
    if (!userProfile.id && !userProfile.isLoggedIn) return;

    const subscription = subscribeUserTrades(userProfile.id, (payload) => {
      const { eventType, new: newRecord, old: oldRecord, trades: syncedTrades } = payload;

      if (eventType === 'SYNC' && Array.isArray(syncedTrades)) {
        handleSyncIncomingTrades(syncedTrades);
      } else if (eventType === 'INSERT' && newRecord) {
        const trade = mapFromSupabaseRow(newRecord);
        handleSyncIncomingTrades([trade]);
      } else if (eventType === 'UPDATE' && newRecord) {
        const trade = mapFromSupabaseRow(newRecord);
        handleSyncIncomingTrades([trade]);
      } else if (eventType === 'DELETE' && oldRecord) {
        const deletedUuid = ensureTradeUuid(String(oldRecord.id || ''));
        setTrades((prev) => {
          const next = prev.filter(
            (t) => t.id !== oldRecord.id && ensureTradeUuid(t.id) !== deletedUuid
          );
          saveTrades(next);
          return next;
        });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [userProfile.id, userProfile.isLoggedIn, handleSyncIncomingTrades]);

  // Real-time Supabase subscriptions: profiles (self_balance, demo_balance, funded_balance), withdrawals, and referral_commissions
  useEffect(() => {
    if (!userProfile.isLoggedIn && !userProfile.id && !userProfile.email) return;

    const unsubscribeRealtime = subscribeUserRealtimeChannels({
      userId: userProfile.id,
      userEmail: userProfile.email,
      accountIds: accounts.map((a) => a.id),
      onProfileRow: (profileRow, source) => {
        applyProfileRowToState(profileRow, source || 'realtime');
      },
      onWithdrawalsInitial: (rows) => {
        setWithdrawals((prev) => {
          let next = [...prev];
          for (const row of rows) {
            next = mergeRealtimeWithdrawal(next, row, 'INSERT');
          }
          saveWithdrawals(next);
          return next;
        });
      },
      onWithdrawalEvent: (eventType, newRow, oldRow) => {
        setWithdrawals((prev) => {
          const next = mergeRealtimeWithdrawal(prev, newRow, eventType, oldRow);
          saveWithdrawals(next);
          broadcastSyncEvent('WITHDRAWALS_UPDATED', next);
          return next;
        });
      },
      onCommissionsInitial: (rows) => {
        setAffiliateReferrals((prev) => {
          let next = [...prev];
          for (const row of rows) {
            next = mergeRealtimeCommission(next, row, 'INSERT');
          }
          saveAffiliateReferrals(next);
          return next;
        });
      },
      onCommissionEvent: (eventType, newRow, oldRow) => {
        setAffiliateReferrals((prev) => {
          const next = mergeRealtimeCommission(prev, newRow, eventType, oldRow);
          saveAffiliateReferrals(next);
          return next;
        });
      },
      onPurchasesInitial: (rows) => {
        setPurchases((prev) => {
          let next = [...prev];
          for (const row of rows) {
            next = mergeRealtimePurchase(next, row, 'INSERT');
          }
          return next;
        });
      },
      onPurchaseEvent: (eventType, newRow, oldRow) => {
        setPurchases((prev) => mergeRealtimePurchase(prev, newRow, eventType, oldRow));
      },
      onAccountsInitial: (supaAccounts) => {
        setAccounts((prev) => {
          let updated = [...prev];
          for (const sa of supaAccounts) {
            const idx = updated.findIndex(
              (a) =>
                a.id === sa.id ||
                (a.supabaseAccountId && a.supabaseAccountId === sa.id) ||
                a.loginId === sa.loginId ||
                (!a.supabaseAccountId &&
                  !isPersonalLiveAccount(a) &&
                  !isDemoAccount(a) &&
                  a.accountType === sa.accountType &&
                  a.size === sa.size)
            );
            if (idx >= 0) {
              const localAcc = updated[idx];
              const localHasPostTradeMutation =
                (localAcc.tradesCount || 0) > (sa.tradesCount || 0) &&
                Math.abs(localAcc.currentBalance - localAcc.initialBalance) > 0.01 &&
                Math.abs(sa.currentBalance - sa.initialBalance) < 0.01;

              const mergedBalance = localHasPostTradeMutation
                ? localAcc.currentBalance
                : sa.currentBalance;
              const mergedEquity = localHasPostTradeMutation
                ? localAcc.equity
                : sa.equity;

              updated[idx] = sanitizeAccountForAntiBreach({
                ...localAcc,
                ...sa,
                id: localAcc.id || sa.id,
                supabaseAccountId: sa.supabaseAccountId || sa.id || localAcc.supabaseAccountId,
                loginId: localAcc.loginId || sa.loginId,
                currentBalance: mergedBalance,
                equity: mergedEquity,
                startingDayEquity:
                  isAccountSoftBreached(localAcc) || localHasPostTradeMutation
                    ? localAcc.startingDayEquity
                    : sa.startingDayEquity,
                status:
                  isAccountSoftBreached(localAcc) ||
                  isAccountHardBreached(localAcc) ||
                  localAcc.status === 'passed' ||
                  localAcc.status === 'passed_phase_1'
                    ? localAcc.status
                    : sa.status,
                breachType: localAcc.breachType || sa.breachType,
                softBreachResetTime: localAcc.softBreachResetTime,
                tradesCount: Math.max(localAcc.tradesCount || 0, sa.tradesCount || 0),
                winRate: localAcc.winRate || sa.winRate,
              });
            } else {
              updated.push(sanitizeAccountForAntiBreach(sa));
            }
          }
          saveAccounts(updated);
          return updated;
        });
      },
      onAccountEvent: (eventType, account) => {
        if (!account) return;
        setAccounts((prev) => {
          let updated = [...prev];
          const idx = updated.findIndex(
            (a) =>
              a.id === account.id ||
              (a.supabaseAccountId && a.supabaseAccountId === account.id) ||
              a.loginId === account.loginId
          );
          if (eventType === 'DELETE') {
            if (idx >= 0) updated.splice(idx, 1);
          } else if (idx >= 0) {
            const localAcc = updated[idx];
            updated[idx] = sanitizeAccountForAntiBreach({
              ...localAcc,
              ...account,
              id: localAcc.id || account.id,
              supabaseAccountId: account.supabaseAccountId || account.id || localAcc.supabaseAccountId,
              loginId: localAcc.loginId || account.loginId,
              tradesCount: Math.max(localAcc.tradesCount || 0, account.tradesCount || 0),
              winRate: localAcc.winRate || account.winRate,
            });
          } else {
            updated.push(sanitizeAccountForAntiBreach(account));
          }
          saveAccounts(updated);
          return updated;
        });
      },
    });

    return () => {
      unsubscribeRealtime();
    };
  }, [userProfile.id, userProfile.email, userProfile.isLoggedIn]);

  // Multi-Tab & Multi-View State Synchronization (BroadcastChannel & Storage Event bus)
  useEffect(() => {
    const unsubscribeSync = subscribeToSyncEvents((msg) => {
      if (msg.type === 'ACCOUNT_UPDATED') {
        const payload = msg.payload;
        if (Array.isArray(payload)) {
          setAccounts(payload);
        } else if (payload && payload.id) {
          setAccounts((prev) =>
            prev.some((a) => a.id === payload.id)
              ? prev.map((a) => (a.id === payload.id ? payload : a))
              : [...prev, payload]
          );
        }
      } else if (msg.type === 'ACCOUNT_SELECTED') {
        if (typeof msg.payload === 'string') {
          setActiveAccountId(msg.payload);
        }
      } else if (msg.type === 'TRADE_ADDED') {
        if (msg.payload && msg.payload.id) {
          setTrades((prev) => (prev.some((t) => t.id === msg.payload.id) ? prev : [msg.payload, ...prev]));
        }
      } else if (msg.type === 'TRADE_UPDATED') {
        if (Array.isArray(msg.payload)) {
          setTrades(msg.payload);
        } else if (msg.payload && msg.payload.id) {
          setTrades((prev) => prev.map((t) => (t.id === msg.payload.id ? msg.payload : t)));
        }
      } else if (msg.type === 'WITHDRAWALS_UPDATED') {
        if (Array.isArray(msg.payload)) {
          setWithdrawals(msg.payload);
        }
      } else if (msg.type === 'PROFILE_UPDATED') {
        if (msg.payload) {
          setUserProfile(msg.payload);
          applyProfileRowToState({
            id: msg.payload.id,
            email: msg.payload.email,
            full_name: msg.payload.fullName,
            kyc_status: msg.payload.kycStatus,
            self_balance: msg.payload.selfBalance,
            demo_balance: msg.payload.demoBalance,
            funded_balance: msg.payload.fundedBalance,
            referral_code: msg.payload.referralCode,
            referred_by: msg.payload.referredBy,
            profile_locked: msg.payload.profileLocked,
          });
        }
      }
    });

    const handleRealtimeProfileCustomEvent = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail && typeof custom.detail === 'object') {
        applyProfileRowToState(custom.detail);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('bft-realtime-profile-update', handleRealtimeProfileCustomEvent);
    }

    return () => {
      unsubscribeSync();
      if (typeof window !== 'undefined') {
        window.removeEventListener('bft-realtime-profile-update', handleRealtimeProfileCustomEvent);
      }
    };
  }, [applyProfileRowToState]);

  // Listen for Supabase Auth state changes (Email & Password session persistence)
  useEffect(() => {
    const hydrateFromSupabaseSessionUser = async (sessionUser: any) => {
      if (!sessionUser?.id || !sessionUser?.email) return;

      if (
        typeof window !== 'undefined' &&
        sessionStorage.getItem('bft_2fa_login_gate_active') === 'true'
      ) {
        return;
      }

      let existingProfile: any = null;
      try {
        const { data: p } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .maybeSingle();
        existingProfile = p;
      } catch {
        // ignore read error
      }

      // If 2FA is enabled for this profile (two_factor_enabled or is_2fa_enabled), ensure 2FA verification was passed
      if (isTwoFactorEnabledOnProfile(existingProfile, sessionUser)) {
        const isPending2fa =
          typeof window !== 'undefined' &&
          (sessionStorage.getItem(`bft_2fa_pending_${sessionUser.id}`) === 'true' ||
            (sessionUser.email &&
              sessionStorage.getItem(`bft_2fa_pending_${sessionUser.email}`) === 'true'));
        const isVerified =
          typeof window !== 'undefined' &&
          !isPending2fa &&
          (sessionStorage.getItem(`bft_2fa_verified_${sessionUser.id}`) === 'true' ||
            localStorage.getItem(`bft_2fa_verified_${sessionUser.id}`) === 'true' ||
            (sessionUser.email &&
              sessionStorage.getItem(`bft_2fa_verified_${sessionUser.email}`) === 'true') ||
            (sessionUser.email &&
              localStorage.getItem(`bft_2fa_verified_${sessionUser.email}`) === 'true'));
        if (!isVerified) {
          return;
        }
      }

      const sponsorCode = getStoredReferralCode() || null;
      const { needsUpsert, upsertPayload, resolvedProfile } = resolveOrBuildUserProfile(
        sessionUser,
        existingProfile,
        sponsorCode
      );

      if (needsUpsert) {
        try {
          await supabase
            .from('profiles')
            .upsert(upsertPayload, { onConflict: 'id', ignoreDuplicates: true });
        } catch {
          // ignore if trigger or RLS already handled
        }
      }

      await ensureSupabaseProfileAndDemoAccount({
        userId: sessionUser.id,
        email: resolvedProfile.email,
        fullName: resolvedProfile.fullName,
        referralCode: resolvedProfile.referralCode,
        sponsorCode: resolvedProfile.referredBy,
      }).catch(() => {});

      const backendSync = await apiEmailSessionSync({
        email: resolvedProfile.email,
        name: resolvedProfile.fullName,
        userId: sessionUser.id,
        referralCode: resolvedProfile.referredBy,
        rememberMe: true,
      }).catch(() => null);

      if (backendSync?.token) {
        try {
          localStorage.setItem('bft_jwt_session', backendSync.token);
        } catch {
          // ignore
        }
      }

      const rawExistingSelfBalance =
        existingProfile?.self_capital_balance ?? existingProfile?.self_balance;
      const resolvedSelfBalance =
        rawExistingSelfBalance !== undefined && rawExistingSelfBalance !== null
          ? Number(rawExistingSelfBalance)
          : resolvedProfile.selfBalance !== undefined
          ? resolvedProfile.selfBalance
          : backendSync?.user?.selfBalance;
      const resolvedDemoBalance =
        existingProfile?.demo_balance !== undefined && existingProfile?.demo_balance !== null
          ? Number(existingProfile.demo_balance)
          : resolvedProfile.demoBalance !== undefined
          ? resolvedProfile.demoBalance
          : backendSync?.user?.demoBalance;
      const resolvedFundedBalance =
        existingProfile?.funded_balance !== undefined && existingProfile?.funded_balance !== null
          ? Number(existingProfile.funded_balance)
          : resolvedProfile.fundedBalance !== undefined
          ? resolvedProfile.fundedBalance
          : backendSync?.user?.fundedBalance;

      const loaded = loadOrCreateUserProfileByEmail({
        userId: sessionUser.id,
        email: resolvedProfile.email,
        fullName: backendSync?.user?.fullName || resolvedProfile.fullName,
        referralCode: backendSync?.user?.referralCode || resolvedProfile.referralCode,
        referredBy: resolvedProfile.referredBy || backendSync?.user?.referredBy || undefined,
        rememberMe: true,
        isNewRegistration: false,
        kycStatus: backendSync?.user?.kycStatus || resolvedProfile.kycStatus,
        profileLocked: backendSync?.user?.profileLocked ?? resolvedProfile.profileLocked,
        address: backendSync?.user?.address || resolvedProfile.address,
        dateOfBirth: backendSync?.user?.dateOfBirth || resolvedProfile.dateOfBirth,
        country: backendSync?.user?.country || resolvedProfile.country,
        selfBalance: resolvedSelfBalance,
        demoBalance: resolvedDemoBalance,
        fundedBalance: resolvedFundedBalance,
      });

      setUserProfile(loaded);
      if (existingProfile) {
        applyProfileRowToState(existingProfile);
      }
      setIsAuthModalOpen(false);
    };

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        hydrateFromSupabaseSessionUser(session.user);
      }
    });

    return () => {
      authSubscription?.subscription?.unsubscribe();
    };
  }, []);

  const handleUpdateSingleAccount = (updated: TradingAccount) => {
    setAccounts((prev) => {
      const exists = prev.some((acc) => acc.id === updated.id);
      const newAccounts = exists
        ? prev.map((acc) => (acc.id === updated.id ? updated : acc))
        : [...prev, updated];
      saveAccounts(newAccounts);
      return newAccounts;
    });

    const balanceColumn = resolveAccountBalanceColumn(updated);
    if (balanceColumn && !hasActiveTradesForColumn(balanceColumn)) {
      recordDirectBalanceCommit(balanceColumn, updated.currentBalance);
    }

    // Keep userProfile balance fields synchronized with the updated account mode
    setUserProfile((prev) => {
      let nextProfile = prev;
      if (isPersonalLiveAccount(updated)) {
        nextProfile = { ...prev, selfBalance: updated.currentBalance };
      } else if (isDemoAccount(updated)) {
        nextProfile = { ...prev, demoBalance: updated.currentBalance };
      } else if (updated.phase === 'funded') {
        nextProfile = { ...prev, fundedBalance: updated.currentBalance };
      }
      if (nextProfile !== prev) {
        userProfileRef.current = nextProfile;
        saveProfile(nextProfile);
      }
      return nextProfile;
    });

    broadcastSyncEvent('ACCOUNT_UPDATED', updated);
    if (!isDemoAccount(updated) && !isPersonalLiveAccount(updated)) {
      apiUpdateAccountState(updated.id, {
        supabaseAccountId: updated.supabaseAccountId,
        userId: userProfileRef.current.id || updated.ownerId,
        userEmail: userProfileRef.current.email || updated.ownerEmail,
        accountType: updated.accountType || updated.tier,
        startingBalance: updated.initialBalance || updated.size,
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

      updateSupabaseTradingAccountState({
        accountId: updated.id,
        supabaseAccountId: updated.supabaseAccountId,
        userId: userProfileRef.current.id || updated.ownerId,
        userEmail: userProfileRef.current.email || updated.ownerEmail,
        accountType: updated.accountType || updated.tier,
        startingBalance: updated.initialBalance || updated.size,
        currentBalance: updated.currentBalance,
        equity: updated.equity,
        startingDayEquity: updated.startingDayEquity,
        status: updated.status,
        phase: updated.phase,
        tradesCount: updated.tradesCount,
        winRate: updated.winRate,
        tradingDaysCompleted: updated.tradingDaysCompleted,
      }).catch(() => {});
    }

    // Synchronize account balances with Supabase profiles table for persistence
    if (
      balanceColumn &&
      (userProfileRef.current.id || userProfileRef.current.email) &&
      userProfileRef.current.isLoggedIn
    ) {
      commitProfileBalanceToSupabase({
        userId: userProfileRef.current.id,
        userEmail: userProfileRef.current.email,
        column: balanceColumn,
        newBalance: updated.currentBalance,
      }).catch(() => {});
    }
  };

  const handleCreditAccountDeposit = (
    accountId: string,
    amountUsdt: number,
    depositRecord?: any
  ) => {
    // Package purchases (account_type === 'challenge') must NEVER credit self_capital_balance
    const isChallengePurchase =
      depositRecord &&
      String(depositRecord.account_type || depositRecord.accountType || '')
        .toLowerCase()
        .trim() === 'challenge';
    if (isChallengePurchase) {
      return;
    }

    setAccounts((prev) => {
      let matched = false;
      const updated = prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        matched = true;
        const isPersonal = isPersonalLiveAccount(acc);
        const newBal = Number((acc.currentBalance + amountUsdt).toFixed(2));
        const newEq = Number((acc.equity + amountUsdt).toFixed(2));
        const newStartEq = Number(((acc.startingDayEquity || acc.currentBalance) + amountUsdt).toFixed(2));
        const newInit = isPersonal
          ? Number(((acc.initialBalance || 0) + amountUsdt).toFixed(2))
          : acc.initialBalance;
        const newDep = isPersonal
          ? Number(((acc.depositedCapital ?? acc.initialBalance ?? 0) + amountUsdt).toFixed(2))
          : acc.depositedCapital;

        const nextAcc: TradingAccount = {
          ...acc,
          initialBalance: newInit,
          depositedCapital: newDep,
          size: isPersonal ? newInit : acc.size,
          currentBalance: newBal,
          startingDayEquity: newStartEq,
          equity: newEq,
        };
        if (isPersonal) {
          apiDepositPersonalAccount({
            amount: amountUsdt,
            accountId: acc.id,
          }).catch(() => {});
        } else {
          apiUpdateAccountState(acc.id, {
            currentBalance: newBal,
            equity: newEq,
            startingDayEquity: newStartEq,
          }).catch(() => {});
        }
        return nextAcc;
      });

      if (!matched) {
        const personalAcc = createDefaultPersonalLiveAccount(
          userProfile.id || 'usr_bft_001',
          userProfile.email || 'trader@binaryfunded.com',
          amountUsdt
        );
        const createdWithId: TradingAccount = {
          ...personalAcc,
          id: accountId || personalAcc.id,
          loginId: accountId || personalAcc.loginId,
        };
        apiDepositPersonalAccount({
          amount: amountUsdt,
          accountId: createdWithId.id,
        }).catch(() => {});
        const nextList = [...updated, createdWithId];
        saveAccounts(nextList);

        // Synchronize fresh Personal balance to Supabase profiles (self_capital_balance & self_balance)
        if ((userProfile.id || userProfile.email) && userProfile.isLoggedIn) {
          recordDirectBalanceCommit('self_balance', amountUsdt);
          commitProfileBalanceToSupabase({
            userId: userProfile.id,
            userEmail: userProfile.email,
            column: 'self_balance',
            newBalance: amountUsdt,
          }).catch(() => {});
          setUserProfile((prevProf) => {
            const nextProf = { ...prevProf, selfBalance: amountUsdt };
            userProfileRef.current = nextProf;
            saveProfile(nextProf);
            return nextProf;
          });
        }
        return nextList;
      }

      // Synchronize fresh Personal balance to Supabase for existing account
      const matchedPersonal = updated.find((a) => a.id === accountId && isPersonalLiveAccount(a));
      if (matchedPersonal && (userProfile.id || userProfile.email) && userProfile.isLoggedIn) {
        recordDirectBalanceCommit('self_balance', matchedPersonal.currentBalance);
        commitProfileBalanceToSupabase({
          userId: userProfile.id,
          userEmail: userProfile.email,
          column: 'self_balance',
          newBalance: matchedPersonal.currentBalance,
        }).catch(() => {});

        setUserProfile((prevProf) => {
          const nextProf = { ...prevProf, selfBalance: matchedPersonal.currentBalance };
          userProfileRef.current = nextProf;
          saveProfile(nextProf);
          return nextProf;
        });
      }

      saveAccounts(updated);
      return updated;
    });
    if (accountId) {
      setActiveAccountId(accountId);
      saveActiveAccountId(accountId);
    }
  };

  const handleSelectAccount = (id: string) => {
    const resolved = resolveActiveTradingAccount(userAccounts, id, userProfile);
    const nextId = resolved ? resolved.id : id;
    setActiveAccountId(nextId);
    saveActiveAccountId(nextId);
    broadcastSyncEvent('ACCOUNT_SELECTED', nextId);
  };

  const handleUpdateProfile = (updated: UserProfile) => {
    setUserProfile(updated);
    saveProfile(updated);
    broadcastSyncEvent('PROFILE_UPDATED', updated);
  };

  // Periodic Supabase profile sync for Manual Admin approvals (KYC, self_balance, demo_balance, funded_balance)
  useEffect(() => {
    if (!userProfile.isLoggedIn && !userProfile.id && !userProfile.email) return;
    let isMounted = true;

    async function syncSupabaseProfile() {
      try {
        const p = await fetchSupabaseProfileRow({
          userId: userProfileRef.current.id,
          userEmail: userProfileRef.current.email,
        });
        if (p && isMounted) {
          applyProfileRowToState(p, 'poll');
        }
      } catch {
        // Fallback
      }
    }

    syncSupabaseProfile();
    const interval = setInterval(syncSupabaseProfile, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [userProfile.isLoggedIn, userProfile.id, userProfile.email, applyProfileRowToState]);

  const handleAddWithdrawal = (req: WithdrawalRequest) => {
    const updated = [req, ...withdrawals];
    setWithdrawals(updated);
    saveWithdrawals(updated);
    broadcastSyncEvent('WITHDRAWALS_UPDATED', updated);
  };

  const handleUpdateWithdrawal = (req: WithdrawalRequest) => {
    setWithdrawals((prev) => {
      const existingIdx = prev.findIndex((w) => {
        if (String(w.id) === String(req.id)) return true;
        const sameAmount = Math.abs(Number(w.amount || 0) - Number(req.amount || 0)) < 0.01;
        const sameAccount =
          w.accountType === req.accountType ||
          (String(w.accountId || '').includes('PERS') && req.accountType === 'self');
        const isOptimisticId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(w.id));
        return Boolean(isOptimisticId && sameAmount && sameAccount);
      });

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = req;
        saveWithdrawals(updated);
        broadcastSyncEvent('WITHDRAWALS_UPDATED', updated);
        return updated;
      }

      const updated = prev.map((w) => (String(w.id) === String(req.id) ? req : w));
      saveWithdrawals(updated);
      broadcastSyncEvent('WITHDRAWALS_UPDATED', updated);
      return updated;
    });
  };

  const handleAddTrade = (trade: BinaryTrade) => {
    setTrades((prev) => {
      const updated = [trade, ...prev.filter((t) => t.id !== trade.id)];
      saveTrades(updated);
      try {
        localStorage.setItem('bft_trades', JSON.stringify(updated));
      } catch {}
      rehydrateActiveTradesInLedger(updated);
      return updated;
    });
    broadcastSyncEvent('TRADE_ADDED', trade);

    // Persist directly to Supabase user_trades for all accounts
    createSupabaseTrade(trade, userProfileRef.current.id || userProfile.id).catch(() => {});
  };

  const handleUpdateTrade = (trade: BinaryTrade) => {
    setTrades((prev) => {
      const updated = prev.map((t) => (t.id === trade.id ? trade : t));
      saveTrades(updated);
      try {
        localStorage.setItem('bft_trades', JSON.stringify(updated));
      } catch {}
      rehydrateActiveTradesInLedger(updated);
      return updated;
    });
    broadcastSyncEvent('TRADE_UPDATED', trade);

    // Update directly in Supabase user_trades for all accounts
    updateSupabaseTrade(trade, userProfileRef.current.id || userProfile.id).catch(() => {});
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

        updateSupabaseTradingAccountState({
          accountId: locked.id,
          supabaseAccountId: locked.supabaseAccountId,
          userId: userProfile.id,
          userEmail: userProfile.email,
          accountType: locked.accountType || locked.tier,
          startingBalance: locked.initialBalance || locked.size,
          currentBalance: locked.currentBalance,
          equity: locked.equity,
          status: locked.status,
          phase: locked.phase,
        }).catch(() => {});
        insertSupabaseTradingAccount({
          account: locked,
          userId: userProfile.id,
          userEmail: userProfile.email,
        }).catch(() => {});
        insertSupabaseTradingAccount({
          account: deployed,
          userId: userProfile.id,
          userEmail: userProfile.email,
        }).catch(() => {});

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

    updateSupabaseTradingAccountState({
      accountId: lockedPrev.id,
      supabaseAccountId: lockedPrev.supabaseAccountId,
      userId: userProfile.id,
      userEmail: userProfile.email,
      accountType: lockedPrev.accountType || lockedPrev.tier,
      startingBalance: lockedPrev.initialBalance || lockedPrev.size,
      currentBalance: lockedPrev.currentBalance,
      equity: lockedPrev.equity,
      status: lockedPrev.status,
      phase: lockedPrev.phase,
    }).catch(() => {});
    insertSupabaseTradingAccount({
      account: lockedPrev,
      userId: userProfile.id,
      userEmail: userProfile.email,
    }).catch(() => {});
    insertSupabaseTradingAccount({
      account: deployedNext,
      userId: userProfile.id,
      userEmail: userProfile.email,
    }).catch(() => {});

    setCertificateModalState({
      isOpen: true,
      certificateId: result.certificateId,
      passedAccount: lockedPrev,
      deployedAccount: deployedNext,
    });
  };

  const handlePurchaseRecorded = React.useCallback((purchase: NormalizedPurchaseRecord) => {
    setPurchases((prev) => mergeRealtimePurchase(prev, purchase, 'INSERT'));
  }, []);

  const handleNewAccountPurchased = (
    newAccount: TradingAccount,
    purchaseRecord?: NormalizedPurchaseRecord
  ) => {
    if (purchaseRecord) {
      handlePurchaseRecorded(purchaseRecord);
    }
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
      window.history.replaceState(null, '', '/');
      return;
    }
    setProtectedRouteNotice(null);
    setCurrentTab(tabId);
    
    // Synchronize URL path with state-based navigation
    const path = tabId === 'home' ? '/' : `/${tabId}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  };

  // Initial URL-to-Tab Routing Synchronization
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const rawPath = window.location.pathname.replace(/^\//, '');
    const path = urlParams.get('autostart') === '1' ? 'terminal' : (rawPath || 'home');
    const validTabs = ['home', 'terminal', 'rules', 'affiliate', 'withdrawals', 'dashboard', 'certificates', 'faq'];
    if (validTabs.includes(path) && path !== currentTab) {
      handleNavigateTab(path);
    }

    const handlePopState = () => {
      const p = window.location.pathname.replace(/^\//, '') || 'home';
      if (validTabs.includes(p)) {
        setCurrentTab(p);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [userProfile.isLoggedIn]);

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

  const baseOwnedAccounts = filterAccountsForUser(accounts, userProfile);
  const userAccounts: TradingAccount[] = React.useMemo(() => {
    if (!userProfile?.isLoggedIn) return [];
    
    // Ensure every authenticated user's Personal Live and Demo accounts reflect profile balances,
    // while Prop (1-Step, 2-Step, Instant Funded) accounts preserve their own trading_accounts balance & rules.
    const list = baseOwnedAccounts.map((acc) => {
      if (isPersonalLiveAccount(acc) && userProfile.selfBalance !== undefined) {
        return {
          ...acc,
          currentBalance: userProfile.selfBalance,
          equity: userProfile.selfBalance,
          dailyLossLimitPercent: 0,
          maxOverallLossPercent: 0,
          profitTargetPercent: 0,
        };
      }
      if (isDemoAccount(acc) && userProfile.demoBalance !== undefined) {
        return {
          ...acc,
          currentBalance: userProfile.demoBalance,
          equity: userProfile.demoBalance,
        };
      }
      return sanitizeAccountForAntiBreach(acc);
    });

    // Ensure every authenticated user has a Personal Live (Self-Funded) account alongside Prop accounts
    if (!list.some((a) => isPersonalLiveAccount(a))) {
      const initialBal = userProfile.selfBalance !== undefined 
        ? userProfile.selfBalance 
        : 0;

      const defaultPersonal = createDefaultPersonalLiveAccount(
        userProfile.id || 'usr_bft_001',
        userProfile.email || 'trader@binaryfunded.com',
        initialBal
      );
      list.push(defaultPersonal);
    }

    // Ensure every authenticated user also has a Demo Practice account for effortless switching
    if (!list.some((a) => isDemoAccount(a))) {
      const today = new Date().toISOString().split('T')[0];
      const initialDemoBal = userProfile.demoBalance !== undefined ? userProfile.demoBalance : 10000;
      
      list.push({
        id: 'BFT-DEMO-001',
        ownerId: userProfile.id,
        ownerEmail: userProfile.email,
        loginId: 'BFT-DEMO-001',
        passwordHash: 'DemoPractice',
        tier: 'demo',
        tierName: 'Demo Practice Balance',
        accountCategory: 'demo',
        depositedCapital: 0,
        size: 10000,
        initialBalance: 10000,
        currentBalance: initialDemoBal,
        startingDayEquity: initialDemoBal,
        equity: initialDemoBal,
        dailyLossLimitPercent: 0,
        maxOverallLossPercent: 0,
        maxRiskPerTradePercent: 100,
        status: 'active',
        createdDate: today,
        lastActiveDate: today,
        phase: 'demo',
        tradingDaysCompleted: 0,
        tradesCount: 0,
        winRate: 0,
      });
    }

    return list;
  }, [baseOwnedAccounts, userProfile.isLoggedIn, userProfile.id, userProfile.email, userProfile.selfBalance, userProfile.demoBalance, userProfile.fundedBalance]);

  const activeAccount = React.useMemo(
    () => resolveActiveTradingAccount(userAccounts, activeAccountId, userProfile),
    [userAccounts, activeAccountId, userProfile]
  );

  const activeTerminalTrades = React.useMemo(
    () => filterTradesForActiveAccount(trades, activeAccount),
    [trades, activeAccount]
  );

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
          onUpdateProfile={handleUpdateProfile}
          onUpdateAccount={handleUpdateSingleAccount}
          userProfile={userProfile}
          activePromoCode={activePromoCode}
          onSelectPromoCode={setActivePromoCode}
          onOpenWithdrawalModal={() => handleNavigateTab('withdrawals')}
          onOpenDepositModal={() => setIsDepositModalOpen(true)}
          onOpenAuthModal={handleOpenAuthModal}
          onLogout={handleLogout}
          onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
          onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
          onOpenGitHubSync={() => setIsGitHubSyncOpen(true)}
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
            trades={activeTerminalTrades}
            onAddTrade={handleAddTrade}
            onUpdateTrade={handleUpdateTrade}
            onSyncTrades={handleSyncIncomingTrades}
            onOpenWithdrawalModal={() => setIsWithdrawalModalOpen(true)}
            onOpenDepositModal={() => setIsDepositModalOpen(true)}
            onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
            onNavigateTab={handleNavigateTab}
            userProfile={userProfile}
            onPassChallengePhase={handlePassChallengePhase}
            onNavigateToPricing={() => {
              setCurrentTab('home');
              setTimeout(() => {
                document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
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
              onUpdateProfile={handleUpdateProfile}
              onNavigateToKyc={() => setCurrentTab('dashboard')}
              onOpenChallengeModal={() => setSelectedPackageToBuy(PACKAGES[2])}
              onOpenDepositModal={() => setIsDepositModalOpen(true)}
              onNavigateTab={handleNavigateTab}
              trades={trades}
            />
          </div>
        )}

        {(currentTab === 'dashboard' || currentTab === 'affiliate' || currentTab === 'certificates') && (
          <UserDashboard
            userProfile={userProfile}
            onUpdateProfile={handleUpdateProfile}
            accounts={userAccounts}
            activeAccountId={activeAccountId}
            onUpdateAccount={handleUpdateSingleAccount}
            trades={trades}
            referrals={affiliateReferrals}
            payouts={affiliatePayouts}
            purchases={purchases}
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
            initialTab={
              currentTab === 'affiliate'
                ? 'affiliate'
                : currentTab === 'certificates'
                ? 'certificates'
                : 'accounts'
            }
            onLogout={handleLogout}
            onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
          />
        )}
      </main>

      {/* Modals */}
      {selectedPackageToBuy && (
        <PaymentModal
          packageToBuy={selectedPackageToBuy}
          userProfile={userProfile}
          activePromoCode={activePromoCode}
          initialDailyWithdrawals={dailyWithdrawalsAddOn}
          applyBreachDiscount={Boolean(
            activeAccount?.discountEligible || activeAccount?.breachType === 'hard'
          )}
          onClose={() => setSelectedPackageToBuy(null)}
          onSuccess={handleNewAccountPurchased}
          onPurchaseRecorded={handlePurchaseRecorded}
          onCommissionsProcessed={handleProcessCommissions}
        />
      )}

      <DirectDepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        userProfile={userProfile}
        activeAccount={activeAccount || null}
        accounts={userAccounts}
        onSelectAccount={handleSelectAccount}
        onCreditAccountDeposit={handleCreditAccountDeposit}
        onPurchaseRecorded={handlePurchaseRecorded}
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
          onUpdateProfile={handleUpdateProfile}
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
            kycDocumentNumber: serverUser?.kycDocumentNumber,
            kycFrontDocumentUrl: serverUser?.kycFrontDocumentUrl,
            kycBackDocumentUrl: serverUser?.kycBackDocumentUrl,
            kycDocumentFileName: serverUser?.kycDocumentFileName,
            kycBackDocumentFileName: serverUser?.kycBackDocumentFileName,
            kycSubmittedAt: serverUser?.kycSubmittedAt,
            profileLocked: serverUser?.profileLocked,
            address: serverUser?.address,
            dateOfBirth: serverUser?.dateOfBirth,
            country: serverUser?.country,
            telegramHandle: serverUser?.telegramHandle,
            avatarUrl: serverUser?.avatarUrl,
            selfBalance: serverUser?.selfBalance,
            demoBalance: serverUser?.demoBalance,
            fundedBalance: serverUser?.fundedBalance,
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

      {/* Institutional Admin Dashboard (Protected by RBAC & Key Challenge) */}
      {isAdminDashboardOpen && (
        <AdminDashboard
          currentUser={userProfile}
          onClose={() => setIsAdminDashboardOpen(false)}
          onRefreshUserData={() => {
            if (userProfile.id) {
              apiGetMe({ userId: userProfile.id, email: userProfile.email })
                .then((res) => {
                  if (res?.ok && res.user) {
                    setUserProfile((prev) => ({
                      ...prev,
                      role: res.user.role || prev.role,
                      isAdmin: res.user.isAdmin ?? prev.isAdmin,
                      kycStatus: res.user.kycStatus || prev.kycStatus,
                    }));
                  }
                })
                .catch(() => {});
            }
          }}
          onOpenGitHubSync={() => setIsGitHubSyncOpen(true)}
        />
      )}

      {/* GitHub Sync & Push Repository Modal */}
      <GitHubSyncModal
        isOpen={isGitHubSyncOpen}
        onClose={() => setIsGitHubSyncOpen(false)}
      />

      {/* Interactive Live Support Chat Widget (Hidden on mobile terminal where bottom nav handles Support) */}
      <div className={currentTab === 'terminal' ? 'hidden md:block' : 'block'}>
        <LiveChatWidget />
      </div>

      {/* Institutional Footer */}
      {currentTab !== 'terminal' && (
        <Footer
          onNavigate={handleNavigateTab}
          onOpenAdminDashboard={() => setIsAdminDashboardOpen(true)}
        />
      )}
    </div>
  );
}
