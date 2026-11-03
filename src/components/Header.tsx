import React, { useState, useEffect } from 'react';
import {
  Zap,
  ChevronDown,
  CheckCircle2,
  ArrowUpRight,
  Volume2,
  VolumeX,
  Tag,
  LogIn,
  UserPlus,
  LogOut,
  Lock,
  Menu,
  ChevronRight,
  User,
  Award,
  CreditCard,
  ShieldCheck,
  X,
} from 'lucide-react';
import { TradingAccount, UserProfile, PromoCodeType } from '../types';
import { CryptoTickerBar } from './CryptoTickerBar';
import { soundEngine } from '../utils/soundEffects';
import {
  getAccountStatusBadgeLabel,
  isLiveFundedAccount,
  isPersonalLiveAccount,
  isDemoAccount,
} from '../utils/propRules';
import { getAuthoritativeAccountBalance } from '../utils/supabaseRealtimeSync';
import { isRouteProtected } from '../utils/authRouting';
import { BUILTIN_AVATARS } from '../utils/storage';
import { BftLogo } from './BftLogo';
import { QuotexAccountSwitcher } from './QuotexAccountSwitcher';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  accounts: TradingAccount[];
  activeAccount: TradingAccount | undefined;
  onSelectAccount: (accountId: string) => void;
  onUpdateProfile?: (updated: UserProfile) => void;
  onUpdateAccount?: (updated: TradingAccount) => void;
  userProfile: UserProfile;
  activePromoCode: PromoCodeType;
  onSelectPromoCode: (code: PromoCodeType) => void;
  onOpenWithdrawalModal: () => void;
  onOpenDepositModal?: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onSimulateReferralUrl?: (refCode: string) => void;
  onLogout?: () => void;
  onOpenChallengeModal: () => void;
  onOpenAdminDashboard?: () => void;
  onOpenGitHubSync?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  accounts,
  activeAccount,
  onSelectAccount,
  onUpdateProfile,
  onUpdateAccount,
  userProfile,
  activePromoCode,
  onSelectPromoCode,
  onOpenWithdrawalModal,
  onOpenDepositModal,
  onOpenAuthModal,
  onSimulateReferralUrl,
  onLogout,
  onOpenChallengeModal,
  onOpenAdminDashboard,
  onOpenGitHubSync,
}) => {
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [soundActive, setSoundActive] = useState(soundEngine.isEnabled());

  const ADMIN_EMAILS = ['shankavee44@gmail.com', 'admin@bft.io', 'viktor.v@quant-prop.io'];
  const isUserAdmin = Boolean(
    userProfile.isLoggedIn && (
      userProfile.role === 'admin' ||
      userProfile.isAdmin ||
      ADMIN_EMAILS.includes((userProfile.email || '').toLowerCase().trim())
    )
  );

  const personalAccount = accounts.find((a) => isPersonalLiveAccount(a));
  const demoAccount = accounts.find((a) => isDemoAccount(a));
  const authoritativeActiveBalance = getAuthoritativeAccountBalance(activeAccount, userProfile);
  const personalLiveBalance =
    userProfile.selfBalance !== undefined && userProfile.selfBalance !== null
      ? Number(userProfile.selfBalance)
      : Number(personalAccount?.currentBalance ?? 0);
  const demoModeBalance =
    userProfile.demoBalance !== undefined && userProfile.demoBalance !== null
      ? Number(userProfile.demoBalance)
      : Number(demoAccount?.currentBalance ?? 10000);
  const isPersonalModeActive = isPersonalLiveAccount(activeAccount);
  const isDemoModeActive = !activeAccount || isDemoAccount(activeAccount);

  useEffect(() => {
    const handleToggle = (e: any) => {
      setSoundActive(e.detail.enabled);
    };
    window.addEventListener('bft-sound-toggle', handleToggle);
    return () => window.removeEventListener('bft-sound-toggle', handleToggle);
  }, []);

  const handleToggleSound = () => {
    const next = soundEngine.toggle();
    setSoundActive(next);
  };

  const handleNavClick = (tabId: string) => {
    soundEngine.playUiClick();
    if (isRouteProtected(tabId) && !userProfile.isLoggedIn) {
      onOpenAuthModal('login');
      return;
    }
    setCurrentTab(tabId);
  };

  return (
    <header className="sticky top-0 z-40 w-full max-w-[100vw] border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl">
      {/* Live Institutional Payout Ticker Feed */}
      <CryptoTickerBar onSelectPair={() => setCurrentTab('terminal')} />

      {/* Main Navigation Bar */}
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-16 sm:h-18 flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <div
          onClick={() => setCurrentTab('home')}
          data-testid="header-brand-lockup"
          className="flex items-center gap-2 sm:gap-3 cursor-pointer group select-none shrink-0 py-1"
        >
          <div className="relative flex items-center justify-center transition-transform group-hover:scale-105 duration-200">
            <BftLogo
              imgClassName="h-9 sm:h-10 md:h-11 w-auto"
              testId="header-bft-logo"
              alt="BFT Bull Logo"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-xl font-black tracking-wider text-white font-mono leading-none">
                BFT
              </span>
              <span className="hidden xs:inline-block sm:inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/40 uppercase tracking-widest font-mono whitespace-nowrap">
                PRIME PROP
              </span>
            </div>
            <p className="hidden sm:block text-[10px] font-bold text-slate-300 tracking-wide uppercase whitespace-nowrap mt-0.5">
              Binary Funded Trader
            </p>
          </div>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#111114] border border-white/10 rounded-xl p-1">
          {[
            { id: 'home', label: 'Challenges & Pricing' },
            { id: 'terminal', label: 'Trading Terminal' },
            { id: 'rules', label: 'Prop Rules' },
            { id: 'affiliate', label: 'Affiliate' },
            { id: 'withdrawals', label: 'Withdrawals' },
            { id: 'dashboard', label: 'Trader Hub & KYC' },
            { id: 'faq', label: 'FAQ' },
          ].map((tab) => {
            const isProtected = isRouteProtected(tab.id);
            const isLocked = isProtected && !userProfile.isLoggedIn;
            return (
              <button
                key={tab.id}
                data-testid={`nav-${tab.id}-btn`}
                onClick={() => handleNavClick(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  currentTab === tab.id
                    ? 'bg-[#ff8800] text-slate-950 font-black'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{tab.label}</span>
                {isLocked && <Lock className="w-2.5 h-2.5 text-slate-500 shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Right Action Bar */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Audio Toggle */}
          <button
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
              soundActive
                ? 'bg-[#1a130a] border-[#ff8800]/40 text-[#ffaa00]'
                : 'bg-[#121216] border-white/10 text-slate-500 hover:text-slate-300'
            }`}
            title={soundActive ? 'Mute Sound Effects' : 'Enable Sound Effects'}
          >
            {soundActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Direct USDT (TRC-20) Deposit Button */}
          {onOpenDepositModal && (
            <button
              type="button"
              data-testid="header-deposit-btn"
              onClick={onOpenDepositModal}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 text-xs font-black transition-all cursor-pointer whitespace-nowrap"
            >
              <span>+ Deposit</span>
            </button>
          )}

          {/* Instant Withdraw Button (Only visible when user is authenticated) */}
          {userProfile.isLoggedIn && (
            <button
              onClick={onOpenWithdrawalModal}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1a1c24] hover:bg-[#242834] border border-white/15 text-slate-100 text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5 text-[#ff8800] fill-[#ff8800]" />
              <span className="hidden sm:inline">Payout</span>
            </button>
          )}

          {/* Admin Command Center (Only visible for authorized admin accounts) */}
          {isUserAdmin && onOpenAdminDashboard && (
            <button
              type="button"
              data-testid="header-admin-portal-btn"
              onClick={onOpenAdminDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition-all cursor-pointer whitespace-nowrap shadow-md shadow-purple-600/30"
              title="Open Administrative Command Center"
            >
              <ShieldCheck className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {/* Dynamic Auth State: Logged-In Quotex-Style Account Switcher vs Logged-Out Sign In & Register */}
          {userProfile.isLoggedIn ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <QuotexAccountSwitcher
                userProfile={userProfile}
                accounts={accounts}
                activeAccount={activeAccount}
                onSelectAccount={onSelectAccount}
                onUpdateProfile={onUpdateProfile}
                onUpdateAccount={onUpdateAccount}
                onOpenDepositModal={onOpenDepositModal}
                onOpenWithdrawalModal={onOpenWithdrawalModal}
                onNavigateTab={handleNavClick}
                onLogout={onLogout}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                data-testid="header-login-btn"
                onClick={() => onOpenAuthModal('login')}
                className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-[#141418] hover:bg-white/10 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer font-mono whitespace-nowrap transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-[#ff8800] shrink-0" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                data-testid="header-register-btn"
                onClick={() => onOpenAuthModal('register')}
                className="hidden sm:flex px-4 py-1.5 rounded-xl bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950 text-xs font-black items-center gap-1.5 cursor-pointer font-mono whitespace-nowrap transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Register</span>
              </button>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            data-testid="mobile-menu-toggle-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-xl bg-[#141418] hover:bg-white/10 border border-white/15 text-slate-200 cursor-pointer flex items-center justify-center transition-all"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4 text-[#ff8800]" /> : <Menu className="w-4 h-4 text-white" />}
          </button>


        </div>
      </div>

      {/* Slide-Down Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#0d0d12]/98 backdrop-blur-2xl px-4 py-4 space-y-4 animate-in slide-in-from-top-4 duration-200">
          {/* Mobile Drawer Brand Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <BftLogo
                imgClassName="h-9 w-auto"
                testId="mobile-drawer-bft-logo"
                alt="BFT Bull Logo"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-white font-mono tracking-wider">
                    BINARY FUNDED TRADER
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/40 uppercase font-mono">
                    BFT
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">
                  Institutional Binary Options Prop Firm
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white"
              aria-label="Close Menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Status / Mobile Profile Popover Dropdown Menu */}
          {userProfile.isLoggedIn ? (
            <div className="rounded-2xl bg-[#14141a] border border-white/15 overflow-hidden">
              <button
                type="button"
                data-testid="mobile-profile-popover-trigger"
                onClick={() => setMobileProfileOpen(!mobileProfileOpen)}
                className="w-full p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all text-left min-h-[50px] touch-manipulation"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <img
                    src={userProfile.avatarUrl || BUILTIN_AVATARS[0]}
                    alt={userProfile.fullName || 'Trader'}
                    className="w-9 h-9 rounded-xl object-cover ring-2 ring-[#ff8800] shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white font-mono flex items-center gap-1.5 truncate">
                      <span className="truncate">{userProfile.fullName || userProfile.email}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${
                          userProfile.kycStatus === 'verified'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                        }`}
                      >
                        {userProfile.kycStatus}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                      Balance:{' '}
                      <span className="text-[#00e676] font-bold">
                        ${authoritativeActiveBalance.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>{' '}
                      ({isPersonalModeActive ? 'Live' : isDemoModeActive ? 'Demo' : activeAccount?.id})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-[10px] font-mono font-bold text-[#ff8800] uppercase hidden xs:inline">
                    {mobileProfileOpen ? 'Close Menu' : 'Profile Menu'}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                      mobileProfileOpen ? 'rotate-180 text-[#ff8800]' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Collapsible Mobile Profile Submenu Links */}
              {mobileProfileOpen && (
                <div className="p-2 border-t border-white/10 bg-[#0d0d12] space-y-1 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    data-testid="mobile-profile-details-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileProfileOpen(false);
                      handleNavClick('dashboard');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-[#ff8800] shrink-0" />
                      <span>Profile & Personal Details</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="mobile-kyc-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileProfileOpen(false);
                      handleNavClick('dashboard');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-[#ff8800] shrink-0" />
                      <span>KYC Verification</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase bg-[#ff8800]/20 text-[#ff8800] shrink-0">
                      {userProfile.kycStatus}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="mobile-certificates-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileProfileOpen(false);
                      handleNavClick('dashboard');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                  >
                    <div className="flex items-center gap-2.5">
                      <Award className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Certificates & Badges</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="mobile-security-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileProfileOpen(false);
                      handleNavClick('dashboard');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                  >
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Security & 2FA Settings</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  <button
                    type="button"
                    data-testid="mobile-[#141418]-link"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setMobileProfileOpen(false);
                      handleNavClick('withdrawals');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl hover:bg-white/10 text-slate-200 hover:text-white flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                  >
                    <div className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-[#00e676] shrink-0 fill-current" />
                      <span>Withdrawals & Payouts</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>

                  {onLogout && (
                    <div className="pt-2 border-t border-white/10 mt-1">
                      <button
                        type="button"
                        data-testid="mobile-logout-btn"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setMobileProfileOpen(false);
                          onLogout();
                        }}
                        className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center justify-between font-bold cursor-pointer touch-manipulation"
                      >
                        <div className="flex items-center gap-2.5">
                          <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>Log Out of Profile</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuthModal('login');
                }}
                className="py-3 px-3 rounded-xl bg-[#141418] border border-white/20 text-xs font-bold text-white font-mono flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation"
              >
                <LogIn className="w-3.5 h-3.5 text-[#ff8800]" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuthModal('register');
                }}
                className="py-3 px-3 rounded-xl bg-[#ff8800] text-slate-950 text-xs font-black font-mono flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation"
              >
                <UserPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Register</span>
              </button>
            </div>
          )}

          {/* Navigation Links */}
          <div className="grid grid-cols-1 gap-1 font-mono text-xs">
            {[
              { id: 'home', label: 'Challenges & Pricing' },
              { id: 'terminal', label: 'Trading Terminal' },
              { id: 'rules', label: 'Prop Rules & Objectives' },
              { id: 'affiliate', label: 'Affiliate' },
              { id: 'withdrawals', label: 'Withdrawal Portal' },
              { id: 'dashboard', label: 'Trader Hub & KYC' },
              { id: 'faq', label: 'FAQ & Support' },
            ].map((tab) => {
              const isProtected = isRouteProtected(tab.id);
              const isLocked = isProtected && !userProfile.isLoggedIn;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleNavClick(tab.id);
                  }}
                  className={`flex items-center justify-between p-3 min-h-[44px] rounded-xl text-left transition-all cursor-pointer touch-manipulation ${
                    isActive
                      ? 'bg-[#ff8800] text-slate-950 font-black'
                      : 'text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <span className="font-bold">{tab.label}</span>
                  {isLocked ? (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                      <Lock className="w-2.5 h-2.5" /> Required
                    </span>
                  ) : isActive ? (
                    <span className="text-[10px] uppercase font-mono font-black">Active</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Admin Command Center button for authorized admin accounts on mobile */}
          {isUserAdmin && onOpenAdminDashboard && (
            <button
              type="button"
              data-testid="mobile-admin-portal-btn"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAdminDashboard();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-black shadow-lg shadow-purple-600/30 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 fill-current" />
                <span>Admin Command Center</span>
              </div>
              <span className="text-[10px] uppercase font-mono font-black bg-white/20 px-2 py-0.5 rounded">
                Superadmin
              </span>
            </button>
          )}

          {/* Bottom Action inside Drawer */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenChallengeModal();
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff8800] to-[#ffaa00] text-slate-950 text-xs font-black font-mono flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <span>Get Funded Evaluation</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleToggleSound}
              className={`p-2.5 rounded-xl border flex items-center justify-center cursor-pointer ${
                soundActive
                  ? 'bg-[#1a130a] border-[#ff8800]/40 text-[#ffaa00]'
                  : 'bg-[#121216] border-white/10 text-slate-500'
              }`}
              title={soundActive ? 'Mute' : 'Enable Sound'}
            >
              {soundActive ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Mobile Submenu Bar (Scrollable Quick Strip) */}
      <div className="lg:hidden flex items-center gap-1 border-t border-white/10 bg-[#0d0d10] py-2 px-2 text-xs overflow-x-auto no-scrollbar">
        {[
          { id: 'home', label: 'Challenges' },
          { id: 'terminal', label: 'Terminal' },
          { id: 'rules', label: 'Rules' },
          { id: 'affiliate', label: 'Affiliates' },
          { id: 'withdrawals', label: 'Payouts' },
          { id: 'dashboard', label: 'Hub & KYC' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleNavClick(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs whitespace-nowrap cursor-pointer flex items-center gap-1 transition-all ${
              currentTab === tab.id
                ? 'bg-[#ff8800] text-slate-950 font-black'
                : 'text-slate-300 hover:text-white bg-white/5'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
};
