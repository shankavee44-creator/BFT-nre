import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Flame,
  Wallet,
  Building2,
  Hexagon,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Loader2,
  Upload,
  Ticket,
  CheckCircle2,
  BadgeDollarSign,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TradingAccount, UserProfile } from '../types';
import {
  CryptoDepositAccountType,
  NormalizedPurchaseRecord,
} from '../config/directDeposit';
import { apiSubmitCryptoDeposit } from '../utils/apiClient';
import { PaymentIcon } from './icons/PaymentLogos';

export type DepositCategoryType = 'popular' | 'epay' | 'banks' | 'crypto';

export interface DepositMethodItem {
  id: string;
  name: string;
  categories: DepositCategoryType[];
  minDeposit: string;
  rawMinDeposit: number;
  maxDeposit: number;
  icon: string;
  networkLabel?: string;
  warningText?: string;
  walletAddress?: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branch?: string;
  };
  isRegionalDisabled?: boolean;
  disabledNotice?: string;
}

export const DEPOSIT_METHODS: DepositMethodItem[] = [
  {
    id: 'usdt_trc20',
    name: 'USDT (TRC-20)',
    categories: ['popular', 'crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: '₮',
    networkLabel: 'TRC20 USDT',
    warningText: 'Only TRC20 USDT. Do not send TRX, smart contracts or other coins — they will be lost.',
    walletAddress: 'TWr3rLWrWGBcfwix5osJwAwMXmpcu4PNSp',
  },
  {
    id: 'commercial_bank',
    name: 'Sri Lanka Banks',
    categories: ['popular', 'banks'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: '🏦',
    networkLabel: 'Commercial Bank (Sri Lanka)',
    warningText: 'Transfer only to the official Commercial Bank account shown. Keep your deposit slip or screenshot for verification.',
    bankDetails: {
      bankName: 'Commercial Bank',
      accountNumber: '8174001908',
      accountName: 'A.D.H.W Kumari',
    },
  },
  {
    id: 'ipay',
    name: 'Ipay',
    categories: ['popular', 'epay'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'iPay',
    isRegionalDisabled: true,
    disabledNotice: 'Not available in your region',
  },
  {
    id: 'upay',
    name: 'UPay',
    categories: ['popular', 'epay'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'U',
    isRegionalDisabled: true,
    disabledNotice: 'Not available in your region',
  },
  {
    id: 'usdt_polygon',
    name: 'USDT (Polygon)',
    categories: ['popular', 'crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: '₮',
    networkLabel: 'Polygon (USDT)',
    warningText: 'Only Polygon network USDT. Do not send tokens via other chains — they will be lost.',
    walletAddress: '0x67517c4ff6c010e4893b2234c4628f9e56ca4575',
  },
  {
    id: 'ethereum',
    name: 'Ethereum (ERC20)',
    categories: ['popular', 'crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'Ξ',
    networkLabel: 'Ethereum (ERC20)',
    warningText: 'Only Ethereum (ERC20) USDT/ETH. Do not send unverified smart contracts — they will be lost.',
    walletAddress: '0x67517c4ff6c010e4893b2234c4628f9e56ca4575',
  },
  {
    id: 'arbitrum',
    name: 'Arbitrum One',
    categories: ['popular', 'crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'A',
    networkLabel: 'Arbitrum One',
    warningText: 'Only Arbitrum One network deposits. Sending via unsupported networks will result in permanent loss.',
    walletAddress: '0x67517c4ff6c010e4893b2234c4628f9e56ca4575',
  },
  {
    id: 'aptos',
    name: 'Aptos',
    categories: ['popular', 'crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'APT',
    networkLabel: 'Aptos Network',
    warningText: 'Ensure you only use this address for deposits on the Aptos network. Assets sent via the Sui network to this address will result in permanent loss.',
    walletAddress: '0xbd1d3f8f90be020831202ab4cfc816d1650e29c02c1f9e175497db505696db44',
  },
  {
    id: 'okt',
    name: 'OKT Chain',
    categories: ['crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'OKT',
    networkLabel: 'OKT Chain',
    warningText: 'Only OKT Chain network deposits. Verify the network before confirming your withdrawal.',
    walletAddress: '0x67517c4ff6c010e4893b2234c4628f9e56ca4575',
  },
  {
    id: 'litecoin',
    name: 'Litecoin (LTC)',
    categories: ['crypto'],
    minDeposit: 'Min. $10.00',
    rawMinDeposit: 10,
    maxDeposit: 50000,
    icon: 'Ł',
    networkLabel: 'Litecoin Network',
    warningText: 'Only Litecoin (LTC) network transfers. Do not send other coins to this address.',
    walletAddress: '0x67517c4ff6c010e4893b2234c4628f9e56ca4575',
  },
];

const CATEGORIES: Array<{
  id: DepositCategoryType;
  name: string;
  sectionTitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'popular', name: 'POPULAR', sectionTitle: 'Popular in your region', icon: Flame },
  { id: 'epay', name: 'E-PAY', sectionTitle: 'E-Pay', icon: Wallet },
  { id: 'banks', name: 'BANKS', sectionTitle: 'Banks', icon: Building2 },
  { id: 'crypto', name: 'CRYPTO', sectionTitle: 'Crypto', icon: Hexagon },
];

const QUICK_AMOUNTS = [150, 200, 300, 500];

interface DirectDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: TradingAccount | null;
  accounts: TradingAccount[];
  userProfile?: UserProfile | null;
  onSelectAccount: (accountId: string) => void;
  onCreditAccountDeposit: (accountId: string, amountUsdt: number, details?: any) => void;
  onPurchaseRecorded?: (purchase: NormalizedPurchaseRecord) => void;
}

export const DirectDepositModal: React.FC<DirectDepositModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  userProfile,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<DepositCategoryType>('popular');
  const [activeMethod, setActiveMethod] = useState<DepositMethodItem | null>(null);
  const [step, setStep] = useState<'methods' | 'amount' | 'payment'>('methods');
  const [amountInput, setAmountInput] = useState<string>('100');
  const [accountType] = useState<CryptoDepositAccountType>('self_funded');
  const [showBonusInput, setShowBonusInput] = useState<boolean>(false);
  const [bonusCode, setBonusCode] = useState<string>('');
  const [bonusApplied, setBonusApplied] = useState<boolean>(false);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyToastMessage, setCopyToastMessage] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(24 * 3600 - 5);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const contentRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const rightScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset or tick countdown timer when in Step 2 ('payment')
  useEffect(() => {
    if (!isOpen) return;
    if (step !== 'payment') {
      setRemainingSeconds(24 * 3600 - 5);
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, step]);

  if (!isOpen) return null;

  const formatCountdown = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const handleCategoryClick = (catId: DepositCategoryType) => {
    setSelectedCategory(catId);
    const targetEl = contentRefs.current[catId];
    if (targetEl && rightScrollContainerRef.current) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectMethod = (method: DepositMethodItem) => {
    if (method.isRegionalDisabled) return;
    setActiveMethod(method);
    setStep('amount');
    setSubmissionSuccess(null);
    setSubmissionError(null);
  };

  const handleBackNavigation = () => {
    setSubmissionError(null);
    if (step === 'payment') {
      setStep('amount');
    } else if (step === 'amount') {
      setStep('methods');
      setActiveMethod(null);
    }
  };

  const numericAmount = Math.max(0, Number(amountInput) || 0);
  const minRequired = activeMethod?.rawMinDeposit || 10;

  const handleProceedToPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount < minRequired) {
      setSubmissionError(`Minimum deposit amount is $${minRequired.toFixed(2)}.`);
      return;
    }
    setSubmissionError(null);
    setStep('payment');
  };

  const triggerCopy = (value: string, fieldKey: string, label: string = 'Copied!') => {
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopiedField(fieldKey);
    setCopyToastMessage(label);
    setTimeout(() => {
      setCopiedField((prev) => (prev === fieldKey ? null : prev));
      setCopyToastMessage((prev) => (prev === label ? null : prev));
    }, 2200);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setReceiptPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmDepositSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMethod) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const targetAddress =
        activeMethod.walletAddress ||
        (activeMethod.bankDetails
          ? `${activeMethod.bankDetails.bankName} - ${activeMethod.bankDetails.accountNumber} (${activeMethod.bankDetails.accountName})`
          : '');

      await apiSubmitCryptoDeposit({
        userId: userProfile?.id,
        email: userProfile?.email,
        amount: numericAmount,
        packageName: `Self-Funded Deposit via ${activeMethod.name} ($${numericAmount.toFixed(2)})`,
        sku: `DEPOSIT_${activeMethod.id.toUpperCase()}`,
        accountType,
        accountId: activeAccount?.id,
        walletAddress: targetAddress,
        network: activeMethod.name,
        receiptUrl: receiptPreviewUrl || undefined,
        txHash: txHashInput.trim() || (receiptFile ? `SLIP:${receiptFile.name}` : undefined),
        status: 'pending',
      });

      setSubmissionSuccess(
        `Deposit request for $${numericAmount.toFixed(2)} via ${activeMethod.name} submitted! Our finance team will verify and credit your account shortly.`
      );
    } catch (err: any) {
      setSubmissionError(err?.message || 'Failed to submit deposit proof. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const qrValue = activeMethod?.walletAddress
    ? activeMethod.walletAddress
    : activeMethod?.bankDetails
    ? `Bank: ${activeMethod.bankDetails.bankName} | Acc: ${activeMethod.bankDetails.accountNumber} | Name: ${activeMethod.bankDetails.accountName} | Amount: $${numericAmount.toFixed(2)}`
    : 'BFT-DEPOSIT';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid="direct-deposit-modal"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[850px] rounded-xl bg-[#212634] border border-[#32394e] shadow-2xl flex flex-col text-white overflow-hidden font-sans"
        style={{ minHeight: '540px', maxHeight: '90vh' }}
      >
        {/* Top Modal Header Bar */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-dashed border-[#363d52] shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'methods' && (
              <button
                type="button"
                data-testid="deposit-back-btn"
                onClick={handleBackNavigation}
                className="w-7 h-7 rounded-full bg-[#2c3345] hover:bg-[#374057] text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Back"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-lg sm:text-[19px] font-bold text-white tracking-tight">
              {step === 'payment' && activeMethod
                ? `Deposit $${numericAmount.toFixed(2)} via ${activeMethod.name}`
                : 'Deposit'}
            </h2>
          </div>

          <button
            type="button"
            data-testid="close-deposit-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Close deposit modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Floating Copy Notification Toast */}
        {copyToastMessage && (
          <div
            data-testid="deposit-copy-toast"
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-lg bg-[#10b969] text-white font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in duration-150"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>{copyToastMessage}</span>
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 0: MAIN CATEGORY & PAYMENT METHODS GRID (Screenshot 0 style) */}
        {/* ================================================================= */}
        {step === 'methods' && (
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left Sidebar Categories */}
            <div className="w-full md:w-[255px] bg-[#212634] p-4 sm:p-5 space-y-2.5 shrink-0 border-b md:border-b-0 md:border-r border-[#2e3548] overflow-x-auto md:overflow-y-auto flex md:block gap-2">
              {CATEGORIES.map((cat) => {
                const catMethods = DEPOSIT_METHODS.filter((m) => m.categories.includes(cat.id));
                const isSelected = selectedCategory === cat.id;
                const IconComponent = cat.icon;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid={`deposit-category-${cat.id}`}
                    onClick={() => handleCategoryClick(cat.id)}
                    className={`w-full min-w-[165px] md:min-w-0 p-3.5 rounded-[10px] text-left transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#12b76a] border-[#26d07c] text-white shadow-lg shadow-[#12b76a]/15'
                        : 'bg-[#262c3c] hover:bg-[#2c3346] border-[#384056] text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <IconComponent
                        className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-white'}`}
                      />
                      <span className="font-extrabold text-[13px] tracking-wide uppercase">
                        {cat.name}
                      </span>
                    </div>

                    <div
                      className={`text-xs mt-0.5 pl-6.5 ${
                        isSelected ? 'text-white/90 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {catMethods.length} methods
                    </div>

                    {/* Mini Method Logo Badges */}
                    <div className="flex items-center gap-1.5 mt-2.5 pl-6.5 flex-wrap">
                      {catMethods.slice(0, 5).map((m) => (
                        <div
                          key={`${cat.id}-badge-${m.id}`}
                          className="w-5 h-5 rounded-[4px] bg-white/10 backdrop-blur-xs flex items-center justify-center overflow-hidden p-0.5"
                          title={m.name}
                        >
                          <PaymentIcon id={m.id} compact className="w-4 h-4" />
                        </div>
                      ))}
                      {catMethods.length > 5 && (
                        <div
                          className={`px-1.5 h-5 rounded-[4px] text-[10px] font-bold flex items-center justify-center ${
                            isSelected
                              ? 'bg-white/25 text-white'
                              : 'bg-[#363e54] text-slate-300'
                          }`}
                        >
                          +{catMethods.length - 5}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Categorized Methods Two-Column Grid */}
            <div
              ref={rightScrollContainerRef}
              className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 bg-[#212634]"
            >
              {CATEGORIES.map((cat) => {
                const methods = DEPOSIT_METHODS.filter((m) => m.categories.includes(cat.id));
                if (methods.length === 0) return null;

                return (
                  <div
                    key={cat.id}
                    ref={(el) => {
                      contentRefs.current[cat.id] = el;
                    }}
                    data-testid={`deposit-section-${cat.id}`}
                  >
                    <h3 className="text-[15px] font-bold text-white mb-3">
                      {cat.sectionTitle} ({methods.length})
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {methods.map((m) => {
                        const isDisabled = Boolean(m.isRegionalDisabled);
                        return (
                          <button
                            key={`${cat.id}-${m.id}`}
                            type="button"
                            data-testid={`deposit-method-card-${m.id}`}
                            disabled={isDisabled}
                            onClick={() => handleSelectMethod(m)}
                            className={`w-full bg-white rounded-[8px] px-4 py-3 flex items-center justify-between text-left transition-all border border-transparent ${
                              isDisabled
                                ? 'opacity-75 cursor-not-allowed'
                                : 'hover:border-[#12b76a] hover:shadow-md cursor-pointer active:scale-[0.99]'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0 pr-2">
                              <PaymentIcon id={m.id} className="w-9 h-9 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-[14px] font-medium text-[#222735] truncate leading-snug">
                                  {m.name}
                                </div>
                                {isDisabled ? (
                                  <div className="text-[11px] font-semibold text-rose-600 leading-tight mt-0.5">
                                    {m.disabledNotice || 'Not available in your region'}
                                  </div>
                                ) : (
                                  <div className="text-[11.5px] text-slate-400 leading-tight mt-0.5">
                                    {m.minDeposit}
                                  </div>
                                )}
                              </div>
                            </div>

                            <ChevronRight
                              className={`w-4 h-4 shrink-0 ${
                                isDisabled ? 'text-slate-300' : 'text-slate-400'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 1: AMOUNT SELECTION VIEW (Screenshot 1 style)                */}
        {/* ================================================================= */}
        {step === 'amount' && activeMethod && (
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
            <div className="flex flex-col md:flex-row items-start gap-6">
              {/* Left White Selected Method Card */}
              <div className="w-full md:w-[240px] bg-white rounded-[8px] p-5 text-[#222735] shadow-md shrink-0">
                <div className="flex items-center gap-3">
                  <PaymentIcon id={activeMethod.id} className="w-8 h-8 shrink-0" />
                  <span className="font-medium text-[15px] text-[#222735] truncate">
                    {activeMethod.name}
                  </span>
                </div>

                <div className="border-b border-dashed border-slate-200 my-4" />

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Min amount:</span>
                    <span className="font-bold text-[#222735]">
                      ${activeMethod.rawMinDeposit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Max amount:</span>
                    <span className="font-bold text-[#222735]">
                      ${activeMethod.maxDeposit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="change-deposit-method-btn"
                  onClick={() => {
                    setStep('methods');
                    setActiveMethod(null);
                  }}
                  className="mt-5 inline-flex items-center gap-2 text-[#0d84ff] hover:underline text-[13px] font-medium cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-full bg-[#0d84ff] text-white flex items-center justify-center">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                  <span>Change method</span>
                </button>
              </div>

              {/* Right Amount Selection Form */}
              <form onSubmit={handleProceedToPay} className="flex-1 w-full space-y-5">
                {/* Minimum Amount Warning Notice */}
                <div className="bg-[#3a312c] border border-[#524338] rounded-[6px] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-white">
                  <span className="w-4 h-4 rounded-full bg-[#ff8a00] text-[#212634] font-black text-[11px] flex items-center justify-center shrink-0">
                    !
                  </span>
                  <div>
                    <span className="font-bold">
                      Minimum amount – {activeMethod.rawMinDeposit} $.
                    </span>{' '}
                    <span className="text-slate-200">Smaller payments won&apos;t be credited.</span>
                  </div>
                </div>

                {/* Deposit Amount Input with Floating Label */}
                <div>
                  <div className="relative mt-2">
                    <label className="absolute -top-2.5 left-3 px-1.5 bg-[#212634] text-[11px] text-slate-400">
                      Deposit amount
                    </label>
                    <div className="flex items-center border border-[#454e68] focus-within:border-[#0d84ff] rounded-[6px] px-3.5 py-3 bg-[#212634]">
                      <input
                        type="number"
                        step="any"
                        min={activeMethod.rawMinDeposit}
                        max={activeMethod.maxDeposit}
                        data-testid="deposit-amount-input"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-full bg-transparent text-white text-[15px] font-medium outline-none"
                        placeholder="100"
                      />
                      <span className="text-slate-400 text-sm font-medium ml-2">$</span>
                    </div>
                  </div>

                  {/* Quick-Select Amount Buttons */}
                  <div className="grid grid-cols-4 gap-2.5 mt-2.5 max-w-[340px]">
                    {QUICK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        data-testid={`quick-amount-${amt}`}
                        onClick={() => setAmountInput(String(amt))}
                        className={`py-2 px-3 rounded-[5px] font-bold text-xs transition-colors cursor-pointer ${
                          Number(amountInput) === amt
                            ? 'bg-[#0d84ff] text-white'
                            : 'bg-[#2b3142] hover:bg-[#353d52] text-white'
                        }`}
                      >
                        {amt} $
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bonus Code Section */}
                <div className="border border-[#343b4f] bg-[#1d222f] rounded-[8px] px-3.5 py-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Ticket className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-xs font-bold text-white">Bonus Code</span>
                      {bonusApplied && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          APPLIED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowBonusInput(!showBonusInput)}
                        className="px-2.5 py-1 rounded bg-[#1b2d48] hover:bg-[#22385a] text-[#1d8cf8] font-bold text-[11px] uppercase tracking-wider cursor-pointer transition-colors"
                      >
                        ACTIVATE
                      </button>
                      <ChevronRight
                        className={`w-4 h-4 text-[#1d8cf8] transition-transform ${
                          showBonusInput ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {showBonusInput && (
                    <div className="mt-3 pt-2.5 border-t border-[#2e3548] flex items-center gap-2">
                      <input
                        type="text"
                        value={bonusCode}
                        onChange={(e) => setBonusCode(e.target.value.toUpperCase())}
                        placeholder="Enter promo code (e.g. WELCOME50)"
                        className="flex-1 bg-[#151924] border border-[#343b4f] rounded px-3 py-1.5 text-xs text-white outline-none focus:border-[#0d84ff]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (bonusCode.trim()) setBonusApplied(true);
                        }}
                        className="px-3 py-1.5 rounded bg-[#0d84ff] text-white font-bold text-xs cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>

                {/* You Will Receive Summary Row */}
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xs text-slate-400">You will receive</span>
                  <div className="flex-1 border-b border-dotted border-slate-600 mx-2" />
                  <span className="text-[15px] font-bold text-white">
                    ${numericAmount.toFixed(2)}
                  </span>
                </div>

                {submissionError && (
                  <div className="p-3 rounded-md bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                    {submissionError}
                  </div>
                )}

                {/* Proceed to Pay Button */}
                <button
                  type="submit"
                  data-testid="proceed-to-pay-btn"
                  className="w-full py-3.5 rounded-[6px] bg-[#0d84ff] hover:bg-[#0070e6] text-white font-bold text-sm shadow-lg shadow-[#0d84ff]/20 transition-all cursor-pointer"
                >
                  Proceed to Pay
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: PAYMENT DETAILS, QR CODE & PROOF UPLOAD (Screenshot 2)    */}
        {/* ================================================================= */}
        {step === 'payment' && activeMethod && (
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
            <div className="flex flex-col md:flex-row items-start gap-5">
              {/* Left Warning & Info Notices Column */}
              <div className="w-full md:w-[270px] space-y-3 shrink-0">
                <div className="bg-[#3a312c] border border-[#524338] rounded-[6px] p-3.5 flex items-start gap-2.5 text-xs text-slate-100 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-[#ff8a00] shrink-0 mt-0.5" />
                  <span>
                    {activeMethod.warningText ||
                      `Only ${activeMethod.name}. Do not send smart contracts or other coins — they will be lost.`}
                  </span>
                </div>

                <div className="bg-[#3a312c] border border-[#524338] rounded-[6px] p-3.5 flex items-start gap-2.5 text-xs text-slate-100 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-[#ff8a00] shrink-0 mt-0.5" />
                  <span>
                    {activeMethod.bankDetails
                      ? 'Please transfer the exact amount to the Commercial Bank account shown and attach your payment receipt below.'
                      : 'A new address is generated for each transaction. Do not reuse.'}
                  </span>
                </div>

                <div className="bg-[#212b3d] border border-[#2d3c56] rounded-[6px] p-3.5 flex items-start gap-2.5 text-xs text-slate-100 leading-relaxed">
                  <BadgeDollarSign className="w-4 h-4 text-[#0d84ff] shrink-0 mt-0.5" />
                  <span>Make sure your payment covers network fees.</span>
                </div>
              </div>

              {/* Right Main QR Code, Address/Bank Details, Copy Buttons, Countdown & Upload */}
              <div className="flex-1 w-full space-y-3.5">
                {/* Main QR & Address / Bank Transfer Box */}
                <div className="bg-[#282d3c] rounded-[6px] p-5 border border-[#343b4f]">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    {/* White QR Code Container */}
                    <div
                      data-testid="deposit-qr-code"
                      className="bg-white p-2.5 rounded-[4px] shrink-0 shadow-md"
                    >
                      <QRCodeSVG value={qrValue} size={132} level="M" />
                    </div>

                    {/* Right Instructions & Copyable Details */}
                    <div className="flex-1 min-w-0 w-full space-y-3">
                      <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
                        To complete the payment transfer{' '}
                        <span className="font-bold text-white">{numericAmount} USD</span> to{' '}
                        {activeMethod.bankDetails ? 'bank account' : 'address'}
                      </p>

                      {/* Crypto Wallet Address View */}
                      {activeMethod.walletAddress && (
                        <div
                          data-testid="deposit-wallet-address"
                          className="text-sm sm:text-[16px] font-bold text-white break-all leading-snug select-all"
                        >
                          {activeMethod.walletAddress}
                        </div>
                      )}

                      {/* Sri Lanka Bank Transfer Details View */}
                      {activeMethod.bankDetails && (
                        <div
                          data-testid="deposit-bank-details"
                          className="bg-[#1e222f] border border-[#363e54] rounded-md p-3 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Bank Name:</span>
                            <span className="font-bold text-white">
                              {activeMethod.bankDetails.bankName}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Account Number:</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-[#10b969]">
                                {activeMethod.bankDetails.accountNumber}
                              </span>
                              <button
                                type="button"
                                data-testid="inline-copy-bank-account-btn"
                                onClick={() =>
                                  triggerCopy(
                                    activeMethod.bankDetails!.accountNumber,
                                    'bank_acc_inline',
                                    'Account number copied!'
                                  )
                                }
                                className="p-1 rounded bg-[#2b3142] hover:bg-[#384056] text-white cursor-pointer"
                                title="Copy Account Number"
                              >
                                {copiedField === 'bank_acc_inline' ? (
                                  <Check className="w-3.5 h-3.5 text-[#10b969]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Account Name:</span>
                            <span className="font-bold text-white">
                              {activeMethod.bankDetails.accountName}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Copy Amount & Copy Address Buttons Row */}
                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    <button
                      type="button"
                      data-testid="copy-deposit-amount-btn"
                      onClick={() =>
                        triggerCopy(String(numericAmount), 'amount', 'Amount copied!')
                      }
                      className="px-5 py-2.5 rounded-[5px] bg-[#0d84ff] hover:bg-[#0070e6] text-white font-bold text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {copiedField === 'amount' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy amount</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      data-testid="copy-deposit-address-btn"
                      onClick={() => {
                        const targetToCopy =
                          activeMethod.walletAddress ||
                          activeMethod.bankDetails?.accountNumber ||
                          '';
                        triggerCopy(
                          targetToCopy,
                          'address',
                          activeMethod.bankDetails ? 'Account number copied!' : 'Address copied!'
                        );
                      }}
                      className="px-5 py-2.5 rounded-[5px] bg-[#0d84ff] hover:bg-[#0070e6] text-white font-bold text-xs sm:text-[13px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {copiedField === 'address' ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>
                            {activeMethod.bankDetails ? 'Copy Account No.' : 'Copy Address'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Countdown Timer & Waiting Status Bar */}
                <div
                  data-testid="deposit-timer-bar"
                  className="bg-[#282d3c] rounded-[6px] px-5 py-3.5 border border-[#343b4f] flex flex-wrap items-center gap-6 text-xs sm:text-[13px]"
                >
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock className="w-4 h-4 text-[#0d84ff] shrink-0" />
                    <span>
                      Time remaining:{' '}
                      <strong className="text-white font-mono">
                        {formatCountdown(remainingSeconds)}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[#0d84ff] font-medium">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Waiting for Payment...</span>
                  </div>
                </div>

                {/* Upload Payment Screenshot / Slip Form */}
                <form
                  onSubmit={handleConfirmDepositSubmission}
                  className="bg-[#282d3c] rounded-[6px] p-4 border border-[#343b4f] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Upload className="w-3.5 h-3.5 text-[#0d84ff]" />
                      <span>Upload Payment Screenshot / Slip</span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {activeMethod.bankDetails ? 'Required for Bank Transfer' : 'Instant verification proof'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      data-testid="upload-payment-proof-label"
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-[5px] bg-[#1e222f] hover:bg-[#232838] border border-dashed border-[#454e68] text-xs text-slate-200 cursor-pointer transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#0d84ff] shrink-0" />
                      <span className="truncate">
                        {receiptFile ? receiptFile.name : 'Choose screenshot / slip...'}
                      </span>
                      <input
                        type="file"
                        data-testid="upload-payment-proof-input"
                        accept="image/*,.pdf"
                        onChange={handleReceiptFileChange}
                        className="hidden"
                      />
                    </label>

                    <input
                      type="text"
                      value={txHashInput}
                      onChange={(e) => setTxHashInput(e.target.value)}
                      placeholder={
                        activeMethod.bankDetails
                          ? 'Reference / Slip No. (Optional)'
                          : 'Transaction Hash / TXID (Optional)'
                      }
                      className="px-3 py-2 rounded-[5px] bg-[#1e222f] border border-[#363e54] focus:border-[#0d84ff] text-xs text-white outline-none"
                    />
                  </div>

                  {submissionSuccess && (
                    <div
                      data-testid="deposit-submission-success"
                      className="p-3 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{submissionSuccess}</span>
                    </div>
                  )}

                  {submissionError && (
                    <div className="p-3 rounded-md bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
                      {submissionError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      data-testid="submit-deposit-proof-btn"
                      disabled={isSubmitting}
                      className="px-5 py-2 rounded-[5px] bg-[#12b76a] hover:bg-[#10a35e] disabled:opacity-50 text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Payment Proof'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
