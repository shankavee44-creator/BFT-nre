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
import { isRouteProtected } from '../utils/authRouting';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  accounts: TradingAccount[];
  activeAccount: TradingAccount | undefined;
  onSelectAccount: (accountId: string) => void;
  userProfile: UserProfile;
  activePromoCode: PromoCodeType;
  onSelectPromoCode: (code: PromoCodeType) => void;
  onOpenWithdrawalModal: () => void;
  onOpenDepositModal?: () => void;
  onOpenAuthModal: (mode: 'login' | 'register') => void;
  onSimulateReferralUrl?: (refCode: string) => void;
  onLogout?: () => void;
  onOpenChallengeModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  accounts,
  activeAccount,
  onSelectAccount,
  userProfile,
  activePromoCode,
  onSelectPromoCode,
  onOpenWithdrawalModal,
  onOpenDepositModal,
  onOpenAuthModal,
  onSimulateReferralUrl,
  onLogout,
  onOpenChallengeModal,
}) => {
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [soundActive, setSoundActive] = useState(soundEngine.isEnabled());

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
      {/* Top Promotional Banner & Discount Codes — BFT Institutional Amber Styling */}
      <div className="bg-[#0d0b08] border-b border-[#ff8800]/30 px-4 py-2 text-xs overflow-x-hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-[#ff8800] text-slate-950 px-2.5 py-0.5 rounded font-black font-mono tracking-wider text-[11px]">
              <Tag className="w-3 h-3 fill-slate-950" /> BFT ACTIVE PROMO
            </span>

            <button
              onClick={() => {
                soundEngine.playUiClick();
                onSelectPromoCode('SPOOKY40');
              }}
              className={`px-2.5 py-0.5 rounded font-mono text-[11px] font-bold transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY40' || activePromoCode === 'BFT40'
                  ? 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
              }`}
            >
              Code: <strong className="text-white">"SPOOKY40"</strong> (Flat 40% OFF New Users)
            </button>

            <button
              onClick={() => {
                soundEngine.playUiClick();
                onSelectPromoCode('SPOOKY20');
              }}
              className={`px-2.5 py-0.5 rounded font-mono text-[11px] font-bold transition-all cursor-pointer border ${
                activePromoCode === 'SPOOKY20' || activePromoCode === 'BFT20'
                  ? 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
              }`}
            >
              Code: <strong className="text-white">"SPOOKY20"</strong> (Flat 20% OFF Existing Users)
            </button>
          </div>

          <div className="hidden xl:flex items-center gap-4 text-slate-300 text-[11px] font-mono">
            <span>
              Split: <strong className="text-[#ffaa00]">80% (M1-3) → 90% + Scaling</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">3-Min TRC-20 SLA</span>
            </span>
          </div>
        </div>
      </div>

      {/* Live Institutional Payout Ticker Feed */}
      <CryptoTickerBar onSelectPair={() => setCurrentTab('terminal')} />

      {/* Main Navigation Bar */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-2">
        {/* Brand Logo & Name */}
        <div
          onClick={() => setCurrentTab('home')}
          className="flex items-center gap-2.5 cursor-pointer group select-none shrink-0"
        >
          <div className="relative w-10 h-10 rounded-xl bg-[#ff8800] p-[1.5px] transition-transform group-hover:scale-105 duration-200">
            <div className="w-full h-full bg-[#0a0a0a] rounded-[10px] flex items-center justify-center relative overflow-hidden">
              <svg viewBox="0 0 100 100" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="30" y1="20" x2="30" y2="80" stroke="#10b981" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
                <rect x="22" y="34" width="16" height="32" rx="2" fill="#10b981" />
                <path d="M46 22H78V31H63V78H49V22Z" fill="#ff8800" />
                <path d="M48 42H70C74 42 77.5 45.4 77.5 49.5C77.5 53.6 74 57 70 57H48" stroke="#ff8800" strokeWidth="6" strokeLinecap="round" />
                <path d="M48 60H68C72 60 75.5 63.4 75.5 67.5C75.5 71.6 72 75 68 75H48" stroke="#ff8800" strokeWidth="6" strokeLinecap="round" />
                <path d="M18 72L44 46L58 60L84 24" stroke="#10b981" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M70 24H84V38" stroke="#10b981" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black tracking-wider text-white font-mono">BFT</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ff8800]/15 text-[#ff8800] border border-[#ff8800]/40 uppercase tracking-widest font-mono">
                PRIME PROP
              </span>
            </div>
            <p className="text-[10px] font-bold text-slate-300 tracking-wide uppercase whitespace-nowrap">
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
            { id: 'affiliate', label: 'Affiliates (10%/5%/2% + 8%)' },
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
          {/* Active Account Switcher OR No Active Account Prompt (Only visible when user is authenticated) */}
          {userProfile.isLoggedIn && (
            activeAccount ? (
              <div className="relative">
                <button
                  onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                  data-testid="header-account-switcher"
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0a0a0a] border border-white/15 hover:border-[#ff8800] transition-colors text-left cursor-pointer whitespace-nowrap"
                >
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isPersonalLiveAccount(activeAccount)
                        ? 'bg-[#ff8800]'
                        : isDemoAccount(activeAccount)
                        ? 'bg-slate-400'
                        : isLiveFundedAccount(activeAccount)
                        ? 'bg-[#00e676]'
                        : 'bg-[#ff8800]'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-white font-mono leading-tight">
                      <span>
                        {isPersonalLiveAccount(activeAccount)
                          ? 'Personal Live Balance'
                          : isDemoAccount(activeAccount)
                          ? 'Demo'
                          : isLiveFundedAccount(activeAccount)
                          ? `Funded #${activeAccount.id.replace(/^BFT-/, '')}`
                          : `Challenge #${activeAccount.id.replace(/^BFT-/, '')}`}
                      </span>
                      <span
                        data-testid="header-account-status-badge"
                        className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                          isPersonalLiveAccount(activeAccount)
                            ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                            : isDemoAccount(activeAccount)
                            ? 'bg-white/10 text-slate-300 border-white/20'
                            : isLiveFundedAccount(activeAccount)
                            ? 'bg-[#00c853]/20 text-[#00e676] border-[#00e676]/50'
                            : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                        }`}
                      >
                        {getAccountStatusBadgeLabel(activeAccount)}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400 font-bold leading-tight">
                      ${Number(activeAccount.currentBalance ?? (activeAccount as any).current_balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {accountDropdownOpen && (
                  <div
                    data-testid="header-account-dropdown"
                    className="absolute right-0 mt-2 w-80 rounded-xl bg-[#0a0a0a] border border-white/20 p-2.5 z-50"
                  >
                    <div className="text-[10px] font-black text-[#ff8800] uppercase px-2 py-1 tracking-wider font-mono border-b border-white/10 mb-1.5">
                      Dual Account Switcher (Prop vs. Personal Live)
                    </div>
                    <div className="space-y-1 max-h-72 overflow-y-auto">
                      {[...accounts]
                        .sort((a, b) => {
                          const rank = (acc: TradingAccount) => {
                            if (isPersonalLiveAccount(acc)) return 0;
                            if (acc.id === 'BFT-91823') return 1;
                            if (isDemoAccount(acc)) return 2;
                            if (acc.status === 'active' && isLiveFundedAccount(acc)) return 3;
                            if (acc.status === 'active') return 4;
                            return 5;
                          };
                          return rank(a) - rank(b);
                        })
                        .map((acc) => {
                        const isPersonal = isPersonalLiveAccount(acc);
                        const isDemo = isDemoAccount(acc);
                        const isLive = isLiveFundedAccount(acc);
                        const displayTitle = isPersonal
                          ? `Personal Live Balance (${acc.id})`
                          : isDemo
                          ? `Demo (${acc.id})`
                          : isLive
                          ? `Funded #${acc.id.replace(/^BFT-/, '')} (${acc.id})`
                          : `Challenge #${acc.id.replace(/^BFT-/, '')} (${acc.id})`;
                        const subtitle = isPersonal
                          ? 'Self-Funded • No Prop Drawdown Locks'
                          : isDemo
                          ? 'Virtual Balance • Risk-Free Practice'
                          : `${acc.tierName} • ${acc.dailyLossLimitPercent}% Daily / ${acc.maxOverallLossPercent}% Max DD`;

                        return (
                          <button
                            key={acc.id}
                            data-testid={`switch-account-${acc.id}`}
                            data-account-category={isPersonal ? 'personal_live' : isDemo ? 'demo' : 'prop'}
                            onClick={() => {
                              onSelectAccount(acc.id);
                              setAccountDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors cursor-pointer border ${
                              acc.id === activeAccount.id
                                ? 'bg-[#16120b] border-[#ff8800]'
                                : 'bg-[#111115] border-white/5 hover:border-white/20'
                            }`}
                          >
                            <div>
                              <div className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                                <span>{displayTitle}</span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                                    isPersonal
                                      ? 'bg-[#ff8800] text-slate-950 border-[#ff8800]'
                                      : isDemo
                                      ? 'bg-white/10 text-slate-300 border-white/20'
                                      : isLive
                                      ? 'bg-[#00c853]/20 text-[#00e676] border-[#00e676]/50'
                                      : 'bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/50'
                                  }`}
                                >
                                  {getAccountStatusBadgeLabel(acc)}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-emerald-400 font-bold mt-0.5">
                                ${Number(acc.currentBalance ?? (acc as any).current_balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                {subtitle}
                              </div>
                            </div>
                            {acc.id === activeAccount.id && (
                              <CheckCircle2 className="w-4 h-4 text-[#ff8800] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border-t border-white/10 mt-2 pt-2 grid grid-cols-2 gap-1.5 font-mono">
                      {onOpenDepositModal && (
                        <button
                          type="button"
                          onClick={() => {
                            const personalAcc = accounts.find((a) => isPersonalLiveAccount(a));
                            if (personalAcc) onSelectAccount(personalAcc.id);
                            setAccountDropdownOpen(false);
                            onOpenDepositModal();
                          }}
                          className="py-1.5 px-2 text-[11px] text-center font-black text-slate-950 rounded bg-[#00e676] hover:bg-[#00c853] transition-colors cursor-pointer"
                        >
                          + Deposit Personal
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAccountDropdownOpen(false);
                          onOpenChallengeModal();
                        }}
                        className="py-1.5 px-2 text-[11px] text-center font-black text-slate-950 rounded bg-[#ff8800] hover:bg-[#ff9900] transition-colors cursor-pointer"
                      >
                        + Buy Prop Challenge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                data-testid="header-no-account-badge"
                onClick={onOpenChallengeModal}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#121216] border border-[#ff8800]/40 hover:border-[#ff8800] transition-colors cursor-pointer whitespace-nowrap"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[11px] font-mono font-bold text-slate-200">
                  No Active Account
                </span>
                <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-[#ff8800] text-slate-950 uppercase">
                  Buy Challenge
                </span>
              </button>
            )
          )}

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

          {/* Cryptomus USDT (TRC-20) Deposit Button (Only visible when user is authenticated) */}
          {userProfile.isLoggedIn && onOpenDepositModal && (
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

          {/* Dynamic Auth State: Logged-In User Profile & Logout vs Logged-Out Sign In & Register */}
          {userProfile.isLoggedIn ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="header-user-profile-btn"
                onClick={() => handleNavClick('dashboard')}
                className="flex items-center gap-1.5 p-1 pr-2.5 rounded-xl bg-[#121216] border border-white/10 hover:border-[#ff8800]/40 transition-all cursor-pointer whitespace-nowrap"
                title="Open Trader Profile & KYC"
              >
                <div className="relative">
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.fullName || userProfile.email}
                    className="w-6 h-6 rounded-lg object-cover ring-1 ring-[#ff8800]/50"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#0a0a0a] ${
                      userProfile.kycStatus === 'verified' ? 'bg-emerald-400' : 'bg-[#ff8800]'
                    }`}
                  />
                </div>
                <span className="hidden md:inline text-xs font-bold text-white font-mono">
                  {(userProfile.fullName || userProfile.email).split(' ')[0]}
                </span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  data-testid="header-logout-btn"
                  onClick={onLogout}
                  className="px-2.5 py-1.5 rounded-xl bg-[#121216] hover:bg-rose-950/60 border border-white/10 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 transition-all cursor-pointer flex items-center gap-1 text-xs font-mono font-bold"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Logout</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="header-login-btn"
                onClick={() => onOpenAuthModal('login')}
                className="px-3.5 py-1.5 rounded-xl bg-[#141418] hover:bg-white/10 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer font-mono whitespace-nowrap transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-[#ff8800]" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                data-testid="header-register-btn"
                onClick={() => onOpenAuthModal('register')}
                className="px-4 py-1.5 rounded-xl bg-[#ff8800] hover:bg-[#ffaa00] text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer font-mono whitespace-nowrap transition-colors"
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

          {/* Get Funded Button */}
          <button
            onClick={onOpenChallengeModal}
            className="hidden xl:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] text-slate-950 text-xs font-black cursor-pointer transition-colors whitespace-nowrap"
          >
            Get Funded
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Slide-Down Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-[#0d0d12]/98 backdrop-blur-2xl px-4 py-4 space-y-4 animate-in slide-in-from-top-4 duration-200">
          {/* User Status / Auth Quick Actions */}
          {userProfile.isLoggedIn ? (
            <div className="p-3 rounded-2xl bg-[#14141a] border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.fullName || 'Trader'}
                  className="w-9 h-9 rounded-xl object-cover ring-1 ring-[#ff8800]/50"
                />
                <div>
                  <div className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                    <span>{userProfile.fullName || userProfile.email}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase ${
                        userProfile.kycStatus === 'verified'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                      }`}
                    >
                      {userProfile.kycStatus}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Account:{' '}
                    <span className={activeAccount ? 'text-[#00e676] font-bold' : 'text-amber-400 font-bold'}>
                      {activeAccount?.id || 'No Active Account'}
                    </span>
                  </div>
                </div>
              </div>
              {onLogout && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold font-mono cursor-pointer"
                >
                  Logout
                </button>
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
                className="py-2.5 px-3 rounded-xl bg-[#141418] border border-white/20 text-xs font-bold text-white font-mono flex items-center justify-center gap-1.5"
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
                className="py-2.5 px-3 rounded-xl bg-[#ff8800] text-slate-950 text-xs font-black font-mono flex items-center justify-center gap-1.5"
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
              { id: 'affiliate', label: 'Affiliates (10%/5%/2% + 8%)' },
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
                  className={`flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
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
