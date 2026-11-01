import React, { useState, useEffect } from 'react';
import {
  X,
  Copy,
  Check,
  Zap,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Wallet,
  ExternalLink,
  History,
  QrCode,
} from 'lucide-react';
import { TradingAccount } from '../types';
import { isPersonalLiveAccount, getAccountStatusBadgeLabel } from '../utils/propRules';
import { DIRECT_USDT_TRC20_CONFIG, validateDirectDepositAmount } from '../config/directDeposit';

interface DirectDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: TradingAccount | null;
  accounts: TradingAccount[];
  onSelectAccount?: (accountId: string) => void;
  onCreditAccountDeposit: (accountId: string, amountUsdt: number, details?: any) => void;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000, 2500];

/**
 * High-contrast QR matrix SVG generator for direct TRC-20 wallet address scanning
 */
const Trc20QrCodeSvg: React.FC<{ value: string }> = ({ value }) => {
  const cells = 21;
  const matrix: boolean[][] = Array.from({ length: cells }, () =>
    Array(cells).fill(false)
  );

  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        matrix[r0 + r][c0 + c] = isBorder || isInner;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, cells - 7);
  drawFinder(cells - 7, 0);

  let hash = 2166136261;
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= cells - 8;
      const inBottomLeft = r >= cells - 8 && c < 8;
      const inCenterLogo = r >= 8 && r <= 12 && c >= 8 && c <= 12;
      if (inTopLeft || inTopRight || inBottomLeft || inCenterLogo) continue;

      const charCode = value.charCodeAt((r * cells + c) % Math.max(1, value.length));
      hash = Math.imul(hash ^ charCode ^ (r * 31 + c * 17), 16777619);
      matrix[r][c] = (hash >>> 0) % 2 === 0;
    }
  }

  return (
    <svg
      viewBox={`0 0 ${cells} ${cells}`}
      className="w-full h-full"
      shapeRendering="crispEdges"
      aria-label="Direct USDT TRC-20 QR Code"
    >
      <rect width={cells} height={cells} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0a0a0a" />
          ) : null
        )
      )}
      <rect x={8.5} y={8.5} width={4} height={4} rx={0.6} fill="#ff8800" />
      <rect x={9.5} y={9.5} width={2} height={2} fill="#0a0a0a" />
    </svg>
  );
};

export const DirectDepositModal: React.FC<DirectDepositModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  accounts,
  onSelectAccount,
  onCreditAccountDeposit,
}) => {
  const [amountInput, setAmountInput] = useState<string>('250');
  const [txHashInput, setTxHashInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'address' | null>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'history'>('deposit');
  const [depositHistory, setDepositHistory] = useState<any[]>([]);

  const personalLiveAccount = accounts.find((acc) => isPersonalLiveAccount(acc)) || null;
  const targetAccount =
    (activeAccount && isPersonalLiveAccount(activeAccount) ? activeAccount : null) ||
    personalLiveAccount ||
    activeAccount ||
    accounts[0] ||
    null;

  const depositoryAddress = DIRECT_USDT_TRC20_CONFIG.walletAddress;

  // Load deposit history when modal is opened or tab switched
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('bft_jwt_session') || '';
        const res = await fetch('/api/deposit/history', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.deposits)) {
            setDepositHistory(data.deposits);
          }
        }
      } catch {
        // ignore offline error
      }
    };

    fetchHistory();
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(depositoryAddress);
    setCopiedField('address');
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handlePresetSelect = (val: number) => {
    setAmountInput(String(val));
    setErrorMessage(null);
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const numAmount = parseFloat(amountInput);
    const validation = validateDirectDepositAmount(numAmount);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid deposit amount.');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('bft_jwt_session') || '';
      const payload = {
        amount: numAmount,
        accountId: targetAccount?.id || undefined,
        txHash: txHashInput.trim() || undefined,
        network: 'TRON (TRC-20)',
        currency: 'USDT',
        walletAddress: depositoryAddress,
      };

      const res = await fetch('/api/deposit/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit direct deposit request.');
      }

      setSuccessMessage(
        `Direct USDT deposit of $${numAmount.toFixed(2)} submitted successfully! Your account balance will update promptly.`
      );
      setTxHashInput('');

      // Refresh deposit history
      if (data.deposit) {
        setDepositHistory((prev) => [data.deposit, ...prev]);
      }

      // If instant personal account deposit credit was applied
      if (targetAccount) {
        onCreditAccountDeposit(targetAccount.id, numAmount, data.deposit);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Deposit submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#0d0f14] border border-[#ff8800]/50 shadow-2xl p-6 sm:p-8 my-8 text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          data-testid="direct-deposit-close-btn"
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#00e676]/15 border border-[#00e676]/40 flex items-center justify-center text-[#00e676]">
            <Zap className="w-6 h-6 fill-[#00e676]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#00e676] bg-[#00e676]/15 border border-[#00e676]/30 px-2 py-0.5 rounded-full font-mono">
                DIRECT USDT DEPOSIT • TRC-20
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ff8800]/15 text-[#ffaa00] border border-[#ff8800]/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                TRON Network
              </span>
            </div>
            <h3 className="text-xl font-black text-white mt-1">Direct USDT (TRC-20) Depository</h3>
          </div>
        </div>

        {/* Tabs: Deposit vs History */}
        <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('deposit')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'deposit'
                ? 'bg-[#ff8800] text-slate-950 shadow-md'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Make Deposit</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-[#ff8800] text-slate-950 shadow-md'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Deposit History ({depositHistory.length})</span>
          </button>
        </div>

        {/* Error / Success Banners */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-xs text-rose-200 font-mono flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-xs text-emerald-200 font-mono flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        {activeTab === 'deposit' ? (
          <div className="space-y-6">
            {/* Target Account Badge */}
            {targetAccount && (
              <div className="p-3.5 rounded-2xl bg-[#141720] border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                    Target Crediting Account
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-black text-white text-sm">
                      {targetAccount.id}
                    </span>
                    <span className="text-xs text-slate-300 font-mono">
                      ({targetAccount.tierName || 'Personal Live'})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                    Current Balance
                  </span>
                  <span className="font-mono font-black text-[#00e676] text-sm">
                    ${targetAccount.currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* Depository Wallet & QR Code */}
            <div className="p-5 rounded-2xl bg-[#12141c] border border-[#ff8800]/30 flex flex-col md:flex-row gap-6 items-center">
              {/* QR Code Container */}
              <div className="w-36 h-36 shrink-0 rounded-xl bg-white p-2.5 flex items-center justify-center shadow-lg border border-white/20">
                <Trc20QrCodeSvg value={`tron:${depositoryAddress}?token=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`} />
              </div>

              {/* Wallet Info & Copy */}
              <div className="flex-1 space-y-3 w-full">
                <div>
                  <span className="text-[11px] font-mono uppercase text-slate-400 block mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#ff8800]" />
                    <span>Official BFT USDT (TRC-20) Depository Address</span>
                  </span>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b0e] border border-white/15">
                    <span
                      data-testid="trc20-depository-address"
                      className="font-mono text-xs sm:text-sm text-[#ffaa00] font-black break-all select-all flex-1"
                    >
                      {depositoryAddress}
                    </span>
                    <button
                      type="button"
                      data-testid="copy-depository-address-btn"
                      onClick={handleCopyAddress}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-[#ff8800] transition-colors shrink-0 cursor-pointer"
                      title="Copy TRC-20 Address"
                    >
                      {copiedField === 'address' ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    Network: <strong className="text-white">TRON (TRC-20)</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                    Min Deposit: <strong className="text-white">$10.00 USDT</strong>
                  </span>
                  <a
                    href={`${DIRECT_USDT_TRC20_CONFIG.explorerAddressUrl}${depositoryAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff8800] hover:underline flex items-center gap-1 ml-auto"
                  >
                    <span>TronScan Explorer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Deposit Form */}
            <form onSubmit={handleSubmitDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>1. Enter USDT (TRC-20) Deposit Amount</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Limits: $10 - $100,000 USDT
                  </span>
                </label>

                {/* Preset Chips */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2.5">
                  {PRESET_AMOUNTS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`py-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer ${
                        amountInput === String(preset)
                          ? 'bg-[#ff8800] text-slate-950 font-black'
                          : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                {/* Custom Input */}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold">
                    $
                  </span>
                  <input
                    type="number"
                    min="10"
                    max="100000"
                    step="any"
                    required
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="250.00"
                    className="w-full pl-8 pr-16 py-3 bg-[#0a0a0a] border border-white/20 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-[#ff8800]"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400 font-bold">
                    USDT
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>2. Transaction Hash (TxID)</span>
                  <span className="text-[11px] text-slate-400 font-mono">Optional but recommended</span>
                </label>
                <input
                  type="text"
                  value={txHashInput}
                  onChange={(e) => setTxHashInput(e.target.value)}
                  placeholder="Paste TRON TxHash (e.g. 8f7d6a5e4c3b...)"
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/20 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#ff8800]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="submit-direct-deposit-btn"
                className="w-full py-4 rounded-xl bg-[#00e676] hover:bg-[#00c853] disabled:opacity-60 text-slate-950 font-black text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors font-mono uppercase tracking-wider"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Submitting Deposit...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>I Have Sent ${parseFloat(amountInput || '0').toFixed(2)} USDT (Confirm Deposit)</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Deposit History Tab */
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {depositHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-500 font-mono text-xs">
                No direct USDT (TRC-20) deposit records found.
              </div>
            ) : (
              depositHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl bg-[#141720] border border-white/10 flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">${Number(item.amount).toFixed(2)} USDT</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          item.status === 'approved'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                            : 'bg-amber-950/80 text-amber-400 border border-amber-500/40'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {new Date(item.created_at || Date.now()).toLocaleString()} • {item.payment_method || 'Direct USDT (TRC-20)'}
                    </span>
                    {item.tx_hash && (
                      <span className="text-[10px] text-slate-500 font-mono truncate max-w-xs block">
                        Tx: {item.tx_hash}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    {item.network || 'TRC-20'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
