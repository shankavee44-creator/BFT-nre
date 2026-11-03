import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  ChevronDown,
  Eye,
  EyeOff,
  Edit2,
  RotateCcw,
  Bell,
  LogOut,
  CreditCard,
  ArrowUpRight,
  TrendingUp,
  User,
  ShieldAlert,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { TradingAccount, UserProfile } from '../types';
import { soundEngine } from '../utils/soundEffects';
import {
  validateDemoBalance,
  formatAccountBalance,
  getNumericTraderId,
  persistCustomDemoBalance,
  DEMO_BALANCE_LIMITS,
} from '../utils/demoBalanceManager';
import { isPersonalLiveAccount, isDemoAccount } from '../utils/propRules';

interface QuotexAccountSwitcherProps {
  userProfile: UserProfile;
  accounts: TradingAccount[];
  activeAccount: TradingAccount | undefined;
  onSelectAccount: (accountId: string) => void;
  onUpdateProfile?: (updated: UserProfile) => void;
  onUpdateAccount?: (updated: TradingAccount) => void;
  onOpenDepositModal?: () => void;
  onOpenWithdrawalModal?: () => void;
  onNavigateTab: (tabId: string) => void;
  onLogout?: () => void;
}

export const QuotexAccountSwitcher: React.FC<QuotexAccountSwitcherProps> = ({
  userProfile,
  accounts,
  activeAccount,
  onSelectAccount,
  onUpdateProfile,
  onUpdateAccount,
  onOpenDepositModal,
  onOpenWithdrawalModal,
  onNavigateTab,
  onLogout,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [isEditingDemo, setIsEditingDemo] = useState(false);
  const [customDemoInput, setCustomDemoInput] = useState('');
  const [demoError, setDemoError] = useState<string | null>(null);
  const [isSavingDemo, setIsSavingDemo] = useState(false);
  const [showLimitNotice, setShowLimitNotice] = useState(false);
  const [currency, setCurrency] = useState('USD');

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditingDemo(false);
        setDemoError(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const personalAccount = accounts.find((a) => isPersonalLiveAccount(a));
  const demoAccount = accounts.find((a) => isDemoAccount(a));

  // Determine current active mode
  const isDemoActive = !activeAccount || isDemoAccount(activeAccount);

  // Authoritative balances
  const liveBalance =
    userProfile.selfBalance !== undefined && userProfile.selfBalance !== null
      ? Number(userProfile.selfBalance)
      : Number(personalAccount?.currentBalance ?? 0);

  const demoBalance =
    userProfile.demoBalance !== undefined && userProfile.demoBalance !== null
      ? Number(userProfile.demoBalance)
      : Number(demoAccount?.currentBalance ?? 10000);

  const traderId = getNumericTraderId(userProfile.id || userProfile.email);

  // Handle switching to Live
  const handleSwitchToLive = () => {
    soundEngine.playUiClick();
    const targetLive = personalAccount || accounts.find((a) => !isDemoAccount(a)) || accounts[0];
    if (targetLive) {
      onSelectAccount(targetLive.id);
    }
  };

  // Handle switching to Demo
  const handleSwitchToDemo = () => {
    soundEngine.playUiClick();
    const targetDemo = demoAccount || accounts.find((a) => isDemoAccount(a));
    if (targetDemo) {
      onSelectAccount(targetDemo.id);
    } else {
      onSelectAccount('BFT-DEMO');
    }
  };

  // Start editing demo balance
  const handleStartEditDemo = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playUiClick();
    setCustomDemoInput(String(demoBalance.toFixed(2)));
    setDemoError(null);
    setIsEditingDemo(true);
  };

  // Save custom demo balance ($1 to $10,000)
  const handleSaveCustomDemo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    soundEngine.playUiClick();

    const val = validateDemoBalance(customDemoInput);
    if (!val.valid) {
      setDemoError(val.error || 'Invalid amount.');
      return;
    }

    setIsSavingDemo(true);
    setDemoError(null);

    const newBal = val.normalized;

    try {
      // 1. Persist to Supabase profiles.demo_balance & backend
      await persistCustomDemoBalance({
        userId: userProfile.id,
        userEmail: userProfile.email,
        newBalance: newBal,
      });

      // 2. Update local UserProfile state
      if (onUpdateProfile) {
        onUpdateProfile({
          ...userProfile,
          demoBalance: newBal,
        });
      }

      // 3. Update Demo Trading Account state if present
      if (demoAccount && onUpdateAccount) {
        onUpdateAccount({
          ...demoAccount,
          currentBalance: newBal,
          initialBalance: newBal,
          startingDayEquity: newBal,
          equity: newBal,
        });
      }

      soundEngine.playTradeWin();
      setIsEditingDemo(false);
    } catch (err: any) {
      setDemoError(err?.message || 'Failed to persist demo balance.');
    } finally {
      setIsSavingDemo(false);
    }
  };

  const handleResetDemoToDefault = async (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playUiClick();
    setCustomDemoInput('10000.00');
    setIsEditingDemo(true);
  };

  return (
    <div className="relative inline-flex items-center gap-2" ref={dropdownRef}>
      {/* Notification Bell with Badge */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            soundEngine.playUiClick();
            onNavigateTab('dashboard');
          }}
          className="p-2 sm:p-2.5 rounded-xl bg-[#14151b] hover:bg-[#1c1d25] border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer relative"
          title="Notifications & System Alerts"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>

      {/* Account Switcher Trigger Pill */}
      <button
        type="button"
        data-testid="account-switcher-btn"
        onClick={() => {
          soundEngine.playUiClick();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl transition-all cursor-pointer border select-none ${
          isOpen
            ? 'bg-[#1b1c24] border-[#00e676]/60 shadow-lg shadow-[#00e676]/10'
            : 'bg-[#121319] hover:bg-[#181921] border-white/15'
        }`}
      >
        {/* Paper Plane Icon */}
        <div className="w-6 h-6 rounded-lg bg-[#00e676]/15 flex items-center justify-center text-[#00e676] shrink-0">
          <Send className="w-3.5 h-3.5 rotate-[-25deg]" />
        </div>

        {/* Account Type and Balance */}
        <div className="text-left font-mono">
          <div
            className={`text-[9px] font-black uppercase tracking-wider ${
              isDemoActive ? 'text-amber-400' : 'text-[#00e676]'
            }`}
          >
            {isDemoActive ? 'DEMO ACCOUNT' : 'LIVE ACCOUNT'}
          </div>
          <div className="text-xs sm:text-sm font-black text-white leading-none">
            {formatAccountBalance(isDemoActive ? demoBalance : liveBalance, currency, hideBalance)}
          </div>
        </div>

        {/* Chevron Indicator */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Quotex-Style Two-Column Account Switcher Dropdown Menu */}
      {isOpen && (
        <div
          data-testid="account-switcher-dropdown"
          className="absolute right-0 top-full mt-2 w-[340px] sm:w-[460px] rounded-2xl bg-[#0c0d12] border border-white/15 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col sm:flex-row"
        >
          {/* Left Column: Account Details, Live & Demo Cards */}
          <div className="flex-1 p-4 border-b sm:border-b-0 sm:border-r border-white/10 space-y-4">
            {/* Top Status Pill: Standard +0% profit & Eye privacy toggle */}
            <div className="p-3 rounded-xl bg-[#14161f] border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#00e676]/15 flex items-center justify-center text-[#00e676]">
                  <Send className="w-3.5 h-3.5 rotate-[-25deg]" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">
                    STANDARD:
                  </div>
                  <div className="text-xs font-black text-[#00e676] font-mono">+0% profit</div>
                </div>
              </div>

              {/* Eye Privacy Toggle */}
              <button
                type="button"
                onClick={() => setHideBalance(!hideBalance)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title={hideBalance ? 'Show Balance' : 'Hide Balance'}
                aria-label="Toggle Balance Visibility"
              >
                {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* User Profile Info: Email, ID, Currency */}
            <div className="space-y-1 font-mono text-xs">
              <div className="text-white font-bold truncate max-w-[260px]">
                {userProfile.email || 'trader@bft.io'}
              </div>
              <div className="text-slate-400 text-[11px]">ID: {traderId}</div>
              <div className="flex items-center gap-2 text-slate-300 text-[11px] pt-1">
                <span>Currency: <strong className="text-white">{currency}</strong></span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setCurrency((prev) => (prev === 'USD' ? 'USDT' : 'USD'));
                  }}
                  className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-black text-[9px] uppercase tracking-wider cursor-pointer transition-colors"
                >
                  CHANGE
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 my-2" />

            {/* Option 1: Live Account */}
            <div
              onClick={handleSwitchToLive}
              className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
                !isDemoActive
                  ? 'bg-[#151722] border-[#00e676]/50 shadow-md shadow-[#00e676]/10'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Custom Radio Button */}
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    !isDemoActive ? 'border-white bg-transparent' : 'border-slate-500'
                  }`}
                >
                  {!isDemoActive && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                <div className="flex-1 font-mono">
                  <div className="text-xs font-bold text-white">Live Account</div>
                  <div className="text-base font-black text-white mt-0.5">
                    {formatAccountBalance(liveBalance, currency, hideBalance)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">The daily limit is not set</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      soundEngine.playUiClick();
                      setShowLimitNotice(!showLimitNotice);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase mt-1 cursor-pointer block"
                  >
                    SET LIMIT
                  </button>
                </div>
              </div>

              {showLimitNotice && (
                <div className="mt-2.5 p-2 rounded-lg bg-blue-950/40 border border-blue-500/30 text-[10px] text-blue-200 font-mono">
                  Daily risk guardrails active: 10% daily drawdown threshold enforced automatically by the institutional risk engine.
                </div>
              )}
            </div>

            {/* Option 2: Demo Account with Custom Balance ($1 to $10,000) */}
            <div
              onClick={handleSwitchToDemo}
              className={`p-3 rounded-xl border transition-all cursor-pointer select-none ${
                isDemoActive
                  ? 'bg-[#151722] border-amber-500/50 shadow-md shadow-amber-500/10'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Custom Radio Button */}
                <div
                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isDemoActive ? 'border-white bg-transparent' : 'border-slate-500'
                  }`}
                >
                  {isDemoActive && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                <div className="flex-1 font-mono">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white">Demo Account</div>
                    {/* Pencil Edit Icon */}
                    <button
                      type="button"
                      data-testid="edit-demo-balance-btn"
                      onClick={handleStartEditDemo}
                      className="p-1 rounded text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                      title="Set Custom Demo Balance ($1 to $10,000)"
                      aria-label="Edit Demo Balance"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Balance Display with Reload Icon */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-base font-black text-white">
                      {formatAccountBalance(demoBalance, currency, hideBalance)}
                    </span>
                    <button
                      type="button"
                      onClick={handleResetDemoToDefault}
                      className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title="Reset or edit demo balance"
                      aria-label="Reset Demo Balance"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Inline Custom Demo Balance Editor ($1 to $10,000) */}
              {isEditingDemo && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-3 p-3 rounded-xl bg-black/60 border border-amber-500/40 space-y-2.5 font-mono"
                >
                  <div className="text-[11px] font-bold text-amber-400 flex items-center justify-between">
                    <span>Set Custom Demo Balance</span>
                    <span className="text-[9px] text-slate-400">$1 – $10,000</span>
                  </div>

                  <form onSubmit={handleSaveCustomDemo} className="space-y-2">
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-slate-400 text-xs">$</span>
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="0.01"
                        value={customDemoInput}
                        onChange={(e) => {
                          setCustomDemoInput(e.target.value);
                          setDemoError(null);
                        }}
                        placeholder="10000.00"
                        className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-[#14151a] border border-white/20 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                        autoFocus
                      />
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="grid grid-cols-4 gap-1">
                      {[500, 1000, 5000, 10000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCustomDemoInput(String(amt))}
                          className="py-1 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 font-bold border border-white/10 cursor-pointer transition-colors"
                        >
                          ${amt.toLocaleString()}
                        </button>
                      ))}
                    </div>

                    {demoError && (
                      <div className="text-[10px] text-rose-400 font-sans">{demoError}</div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={isSavingDemo}
                        className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition-all flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isSavingDemo ? 'Saving...' : 'Set Balance'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingDemo(false)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Menu Navigation Links matching Quotex Reference */}
          <div className="w-full sm:w-44 p-3 bg-[#08090d] flex flex-col justify-between font-mono text-xs">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsOpen(false);
                  if (onOpenDepositModal) onOpenDepositModal();
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                Deposit
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsOpen(false);
                  if (onOpenWithdrawalModal) {
                    onOpenWithdrawalModal();
                  } else {
                    onNavigateTab('withdrawals');
                  }
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                Withdrawal
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsOpen(false);
                  onNavigateTab('dashboard');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                Payments
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsOpen(false);
                  onNavigateTab('terminal');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                Trades
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playUiClick();
                  setIsOpen(false);
                  onNavigateTab('dashboard');
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-200 hover:text-white hover:bg-white/5 transition-all font-bold cursor-pointer"
              >
                My account
              </button>
            </div>

            {/* Logout Option */}
            {onLogout && (
              <div className="pt-3 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playUiClick();
                    setIsOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
