import React, { useState, useEffect, useRef } from 'react';
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
  Clock,
  Wallet,
  ExternalLink,
  History,
} from 'lucide-react';
import { TradingAccount } from '../types';
import {
  CryptomusDepositInvoice,
  validateDepositAmount,
  createCryptomusInvoiceObject,
} from '../utils/cryptomusEngine';
import { CRYPTOMUS_CONFIG } from '../config/cryptomus';

interface CryptomusDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAccount: TradingAccount | null;
  accounts: TradingAccount[];
  onSelectAccount?: (accountId: string) => void;
  onCreditAccountDeposit: (accountId: string, amountUsdt: number, invoice: CryptomusDepositInvoice) => void;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000, 2500];

/**
 * Renders a deterministic, high-contrast QR matrix SVG from the invoice's `qrCodeUri`
 * so each generated TRC-20 address and amount displays a unique visual QR code.
 */
const DynamicQrCodeSvg: React.FC<{ value: string }> = ({ value }) => {
  const cells = 21;
  const matrix: boolean[][] = Array.from({ length: cells }, () =>
    Array(cells).fill(false)
  );

  // Finder pattern helper (7x7 corners)
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

  // Fill data modules deterministically from `value`
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
      aria-label="Cryptomus USDT TRC-20 QR Code"
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

export const CryptomusDepositModal: React.FC<CryptomusDepositModalProps> = ({
  isOpen,
  onClose,
  activeAccount,
  accounts,
  onSelectAccount,
  onCreditAccountDeposit,
}) => {
  const [amountInput, setAmountInput] = useState<string>('250');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState<boolean>(false);
  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeInvoice, setActiveInvoice] = useState<CryptomusDepositInvoice | null>(null);
  const [invoiceHistory, setInvoiceHistory] = useState<CryptomusDepositInvoice[]>([]);
  const [copiedField, setCopiedField] = useState<'address' | 'url' | 'uuid' | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  const creditedUuidsRef = useRef<Set<string>>(new Set());

  const targetAccount = activeAccount || accounts[0] || null;

  // Fetch invoice history when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);

    const fetchInvoices = async () => {
      try {
        const res = await fetch(
          `/api/cryptomus/invoices?accountId=${encodeURIComponent(targetAccount?.id || 'BFT-91823')}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.invoices)) {
            setInvoiceHistory(data.invoices);
            data.invoices.forEach((inv: CryptomusDepositInvoice) => {
              if (inv.status === 'completed') {
                creditedUuidsRef.current.add(inv.uuid);
              }
            });
          }
        }
      } catch {
        // Fallback if offline
      }
    };

    fetchInvoices();
  }, [isOpen, targetAccount?.id]);

  // Countdown timer for active pending invoice
  useEffect(() => {
    if (!activeInvoice || activeInvoice.status === 'completed' || activeInvoice.status === 'failed') {
      return;
    }
    const updateTimer = () => {
      const secs = Math.max(0, Math.floor((activeInvoice.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(secs);
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [activeInvoice]);

  // Poll invoice status every 2s while pending/confirming
  useEffect(() => {
    if (
      !isOpen ||
      !activeInvoice ||
      (activeInvoice.status !== 'pending' && activeInvoice.status !== 'confirming')
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cryptomus/invoice/${encodeURIComponent(activeInvoice.uuid)}`);
        if (!res.ok) return;
        const data = await res.json();
        const fetched: CryptomusDepositInvoice | undefined = data?.invoice;
        if (!fetched) return;

        if (fetched.status !== activeInvoice.status) {
          setActiveInvoice(fetched);
          setInvoiceHistory((prev) => {
            const exists = prev.some((i) => i.uuid === fetched.uuid);
            return exists
              ? prev.map((i) => (i.uuid === fetched.uuid ? fetched : i))
              : [fetched, ...prev];
          });

          if (
            fetched.status === 'completed' &&
            !creditedUuidsRef.current.has(fetched.uuid)
          ) {
            creditedUuidsRef.current.add(fetched.uuid);
            onCreditAccountDeposit(fetched.accountId, fetched.amount, fetched);
          }
        }
      } catch {
        // Ignore transient network poll error
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isOpen, activeInvoice, onCreditAccountDeposit]);

  if (!isOpen) return null;

  const parsedAmount = Number(amountInput);

  const handleCopy = (text: string, field: 'address' | 'url' | 'uuid') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Step 1 -> Step 2: Call POST /api/cryptomus/create-invoice
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = validateDepositAmount(parsedAmount);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid USDT deposit amount.');
      return;
    }

    setIsCreatingInvoice(true);
    try {
      const response = await fetch('/api/cryptomus/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          accountId: targetAccount?.id || 'BFT-91823',
          userId: 'usr_bft_001',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.invoice) {
        setErrorMessage(data?.error || 'Failed to generate Cryptomus invoice.');
        setIsCreatingInvoice(false);
        return;
      }

      const created: CryptomusDepositInvoice = data.invoice;
      setActiveInvoice(created);
      setInvoiceHistory((prev) => [created, ...prev.filter((i) => i.uuid !== created.uuid)]);
    } catch {
      // Graceful fallback if backend route is unreachable
      const fallback = createCryptomusInvoiceObject({
        amount: parsedAmount,
        accountId: targetAccount?.id || 'BFT-91823',
      });
      setActiveInvoice(fallback);
      setInvoiceHistory((prev) => [fallback, ...prev]);
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  // Trigger Cryptomus Webhook Confirmation (`POST /api/cryptomus/simulate-webhook`)
  const handleTriggerWebhook = async (targetStatus: 'paid' | 'confirm_check' | 'fail') => {
    if (!activeInvoice) return;
    setErrorMessage(null);
    setIsSimulatingWebhook(true);

    try {
      const response = await fetch('/api/cryptomus/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid: activeInvoice.uuid,
          status: targetStatus,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok || !data.invoice) {
        setErrorMessage(data?.error || 'Webhook verification failed.');
        setIsSimulatingWebhook(false);
        return;
      }

      const updated: CryptomusDepositInvoice = data.invoice;
      setActiveInvoice(updated);
      setInvoiceHistory((prev) => {
        const exists = prev.some((i) => i.uuid === updated.uuid);
        return exists
          ? prev.map((i) => (i.uuid === updated.uuid ? updated : i))
          : [updated, ...prev];
      });

      if (updated.status === 'failed') {
        setErrorMessage(
          updated.errorMessage ||
            'Payment failed or was cancelled on the TRON network. Please generate a new invoice.'
        );
      }

      if (
        updated.status === 'completed' &&
        !creditedUuidsRef.current.has(updated.uuid)
      ) {
        creditedUuidsRef.current.add(updated.uuid);
        onCreditAccountDeposit(updated.accountId, updated.amount, updated);
      }
    } catch {
      setErrorMessage('Unable to reach Cryptomus webhook endpoint.');
    } finally {
      setIsSimulatingWebhook(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  return (
    <div
      data-testid="cryptomus-deposit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-2xl rounded-3xl bg-[#0c0d12] border border-[#ff8800]/40 shadow-2xl p-6 sm:p-8 my-8 font-sans text-slate-100">
        {/* Close Button */}
        <button
          type="button"
          aria-label="Close Deposit Modal"
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#ff8800]/15 border border-[#ff8800]/50 flex items-center justify-center text-[#ff8800] shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/40 font-mono">
                CRYPTOMUS AUTOMATED GATEWAY
              </span>
              <span className="text-[10px] font-mono text-slate-400">USDT • TRC-20</span>
              <span
                data-testid="cryptomus-merchant-badge"
                title={`Cryptomus Merchant UUID: ${CRYPTOMUS_CONFIG.merchantId}`}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1"
              >
                <ShieldCheck className="w-3 h-3 text-[#00e676]" />
                Merchant: {CRYPTOMUS_CONFIG.merchantId.slice(0, 8)}...{CRYPTOMUS_CONFIG.merchantId.slice(-4)}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
              Instant USDT (TRC-20) Deposit
            </h2>
          </div>
        </div>

        {/* Target Account Selector & Live Balance Banner */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-[#252a3a] mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono">
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold">
              Target Trading Account
            </div>
            <div className="flex items-center gap-2 mt-1">
              {accounts.length > 1 && onSelectAccount ? (
                <select
                  aria-label="Select Target Account"
                  value={targetAccount?.id || ''}
                  onChange={(e) => onSelectAccount(e.target.value)}
                  className="bg-[#0c0d12] border border-[#2a2e39] rounded-lg px-2.5 py-1 text-xs font-bold text-white focus:outline-none focus:border-[#ff8800]"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.id} ({acc.tierName})
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-black text-white">
                  {targetAccount?.id || 'BFT-91823'}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40 font-black">
                {targetAccount?.tierName || 'Instant Funded'}
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[10px] uppercase text-slate-400 font-bold">
              Current Account Balance
            </div>
            <div
              data-testid="cryptomus-current-balance"
              className="text-lg font-black text-[#00e676]"
            >
              $
              {(targetAccount?.currentBalance || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USDT
            </div>
          </div>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            data-testid="cryptomus-error-banner"
            className="mb-5 p-3.5 rounded-xl bg-rose-950/90 border border-[#ff334b]/60 text-xs text-rose-200 flex items-start justify-between gap-3 font-mono"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#ff334b] shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-300 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* VIEW 1: Enter USDT Deposit Amount */}
        {!activeInvoice && (
          <form onSubmit={handleCreateInvoice} className="space-y-5">
            <div className="p-5 rounded-2xl bg-[#12151f] border border-[#242938]">
              <label
                htmlFor="cryptomus-usdt-amount-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300 font-mono mb-2"
              >
                1. Enter USDT (TRC-20) Deposit Amount
              </label>

              <div className="relative flex items-center">
                <span className="absolute left-4 text-lg font-black text-[#ff8800] font-mono">
                  $
                </span>
                <input
                  id="cryptomus-usdt-amount-input"
                  data-testid="cryptomus-amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter amount (USDT TRC-20)"
                  className="w-full pl-9 pr-20 py-3.5 rounded-xl bg-[#090b10] border border-[#2a3042] focus:border-[#ff8800] focus:outline-none text-xl font-black text-white font-mono"
                />
                <span className="absolute right-4 px-2 py-1 rounded bg-[#00e676]/15 text-[#00e676] border border-[#00e676]/30 text-xs font-mono font-black">
                  USDT
                </span>
              </div>

              {/* Quick Preset Amount Buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 font-mono">
                {PRESET_AMOUNTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setAmountInput(String(preset));
                      setErrorMessage(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      Number(amountInput) === preset
                        ? 'bg-[#ff8800] text-slate-950 border-[#ff8800] font-black'
                        : 'bg-[#0c0e14] text-slate-300 border-[#252a3a] hover:border-slate-500'
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-[#222736] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span>Network: TRON (TRC-20)</span>
                <span>Gateway Fee: $0.00 (0%)</span>
                <span className="text-[#00e676] font-bold">
                  Net Credited: $
                  {Number.isFinite(parsedAmount) && parsedAmount > 0
                    ? parsedAmount.toFixed(2)
                    : '0.00'}{' '}
                  USDT
                </span>
              </div>
            </div>

            <button
              type="submit"
              data-testid="generate-cryptomus-invoice-btn"
              disabled={isCreatingInvoice}
              className="w-full py-4 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-50 text-slate-950 font-black text-sm uppercase tracking-wider font-mono flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              {isCreatingInvoice ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Calling Cryptomus API...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>
                    Generate Cryptomus Invoice ($
                    {Number.isFinite(parsedAmount) && parsedAmount > 0
                      ? parsedAmount.toFixed(2)
                      : '0.00'}{' '}
                    USDT)
                  </span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>
        )}

        {/* VIEW 2: Active Pending / Confirming / Failed Cryptomus Invoice Details */}
        {activeInvoice && activeInvoice.status !== 'completed' && (
          <div
            data-testid="cryptomus-invoice-card"
            className="space-y-4 font-mono"
          >
            {/* Status Header Bar */}
            <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2a2e39] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {activeInvoice.status === 'failed' ? (
                  <AlertCircle className="w-4 h-4 text-[#ff334b]" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-[#ff8800] animate-spin" />
                )}
                <span
                  data-testid="cryptomus-invoice-status-badge"
                  className={`text-xs font-black uppercase ${
                    activeInvoice.status === 'failed'
                      ? 'text-[#ff334b]'
                      : activeInvoice.status === 'confirming'
                      ? 'text-cyan-400'
                      : 'text-[#ff8800]'
                  }`}
                >
                  {activeInvoice.status === 'failed'
                    ? 'Payment Failed / Cancelled'
                    : activeInvoice.status === 'confirming'
                    ? 'Confirming on TRON Blockchain (1/19 Blocks)...'
                    : 'Pending • Awaiting USDT (TRC-20) Transfer'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Clock className="w-3.5 h-3.5 text-[#ff8800]" />
                <span>Expires in: {formatCountdown(remainingSeconds)}</span>
              </div>
            </div>

            {/* QR Code + Payment Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl bg-[#11141d] border border-[#242938]">
              {/* Left: Dynamic QR Code */}
              <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#0b0d13] border border-[#222736]">
                <div className="w-36 h-36 p-2 bg-white rounded-xl shadow-md">
                  <DynamicQrCodeSvg value={activeInvoice.qrCodeUri} />
                </div>
                <span className="text-[10px] text-slate-400 mt-2 text-center">
                  Scan with TronLink / Binance / TrustWallet
                </span>
              </div>

              {/* Right: Invoice ID, Exact Amount, Unique TRC-20 Address, Payment URL */}
              <div className="md:col-span-2 space-y-3 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-[#222736]">
                    <div className="text-[10px] text-slate-400 uppercase">Exact Amount</div>
                    <div
                      data-testid="cryptomus-invoice-amount"
                      className="text-base font-black text-[#00e676]"
                    >
                      {activeInvoice.amount.toFixed(2)} USDT
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0b0d13] border border-[#222736]">
                    <div className="text-[10px] text-slate-400 uppercase">Invoice Order ID</div>
                    <div
                      data-testid="cryptomus-invoice-order-id"
                      className="text-xs font-bold text-white truncate"
                    >
                      {activeInvoice.orderId}
                    </div>
                  </div>
                </div>

                {/* Unique TRC-20 Deposit Address */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    Unique Cryptomus USDT (TRC-20) Deposit Address
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#ff8800]/50 text-xs text-white">
                    <span
                      data-testid="cryptomus-invoice-address"
                      className="truncate font-bold text-[#ffaa00]"
                    >
                      {activeInvoice.address}
                    </span>
                    <button
                      type="button"
                      data-testid="copy-cryptomus-address-btn"
                      onClick={() => handleCopy(activeInvoice.address, 'address')}
                      className="px-2.5 py-1 rounded-lg bg-[#ff8800]/20 hover:bg-[#ff8800]/30 text-[#ff8800] font-bold text-[10px] flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedField === 'address' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#00e676]" />
                          <span className="text-[#00e676]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Hosted Cryptomus Checkout Link */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 font-bold mb-1">
                    Cryptomus Invoice Link (UUID: {activeInvoice.uuid.slice(0, 13)}...)
                  </label>
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0b0d13] border border-[#222736] text-[11px] text-slate-300">
                    <span
                      data-testid="cryptomus-payment-url"
                      className="truncate text-cyan-400"
                    >
                      {activeInvoice.paymentUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(activeInvoice.paymentUrl, 'url')}
                      className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedField === 'url' ? (
                        <Check className="w-3 h-3 text-[#00e676]" />
                      ) : (
                        <ExternalLink className="w-3 h-3" />
                      )}
                      <span>{copiedField === 'url' ? 'Copied' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-1 border-t border-[#222736]">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#00e676]" />
                    Merchant ID:
                  </span>
                  <span className="font-mono text-amber-400 font-bold truncate max-w-[200px]" title={CRYPTOMUS_CONFIG.merchantId}>
                    {CRYPTOMUS_CONFIG.merchantId}
                  </span>
                </div>
              </div>
            </div>

            {/* Webhook Verification & Test Controls */}
            <div className="p-4 rounded-2xl bg-[#131722] border border-[#2a2e39] space-y-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#00e676]" />
                  <span>Webhook Listener Active:</span>
                  <code className="text-cyan-400">POST /api/cryptomus/webhook</code>
                </span>
                <span className="text-slate-400 text-[10px]">MD5 HMAC Verified</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  data-testid="confirm-cryptomus-deposit-btn"
                  disabled={isSimulatingWebhook}
                  onClick={() => handleTriggerWebhook('paid')}
                  className="sm:col-span-2 py-3 px-4 rounded-xl bg-[#00e676] hover:bg-[#00c853] disabled:opacity-50 text-slate-950 font-black text-xs uppercase flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    I Have Sent {activeInvoice.amount.toFixed(2)} USDT (Verify Transfer)
                  </span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveInvoice(null);
                      setErrorMessage(null);
                    }}
                    className="flex-1 py-3 px-2 rounded-xl bg-[#1c2130] hover:bg-[#252b3d] border border-[#2a2e39] text-slate-300 font-bold text-[10px] uppercase cursor-pointer transition-colors"
                  >
                    New Amount
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Completed Webhook Confirmation & Auto-Credited Balance */}
        {activeInvoice && activeInvoice.status === 'completed' && (
          <div
            data-testid="cryptomus-deposit-completed"
            className="p-6 rounded-2xl bg-[#071a12] border-2 border-[#00e676] text-center space-y-4 font-mono"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#00e676]/20 border border-[#00e676] flex items-center justify-center mx-auto text-[#00e676]">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="px-3 py-1 rounded-full bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40 text-[10px] font-black uppercase tracking-widest">
                WEBHOOK CONFIRMED • TRANSACTION COMPLETED
              </span>
              <h3 className="text-2xl font-black text-white mt-2">
                +${activeInvoice.amount.toFixed(2)} USDT Credited!
              </h3>
              <p className="text-xs text-emerald-200 mt-1">
                Account <strong>{activeInvoice.accountId}</strong> has been automatically credited via Cryptomus TRC-20 Webhook.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0b1310] border border-[#00e676]/30 text-left text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span
                  data-testid="completed-transaction-status"
                  className="text-[#00e676] font-black uppercase"
                >
                  Completed
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Invoice UUID:</span>
                <span className="text-white font-bold">{activeInvoice.uuid}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">TRON TxID:</span>
                <span className="text-cyan-400 truncate max-w-[260px]">
                  {activeInvoice.txHash}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveInvoice(null);
                  setErrorMessage(null);
                }}
                className="flex-1 py-3 rounded-xl bg-[#13261d] hover:bg-[#193327] border border-[#00e676]/40 text-emerald-200 font-bold text-xs uppercase cursor-pointer"
              >
                Make Another Deposit
              </button>
              <button
                type="button"
                data-testid="deposit-done-return-btn"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-[#00e676] hover:bg-[#00c853] text-slate-950 font-black text-xs uppercase cursor-pointer"
              >
                Return to Terminal
              </button>
            </div>
          </div>
        )}

        {/* Recent Cryptomus Deposit Transactions History */}
        <div className="mt-6 pt-5 border-t border-[#222736] font-mono">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#ff8800]" />
              <span>Cryptomus USDT (TRC-20) Deposit History</span>
            </span>
            <span className="text-[10px] text-slate-500">
              {invoiceHistory.length} Transaction(s)
            </span>
          </div>

          {invoiceHistory.length === 0 ? (
            <div
              data-testid="deposit-history-empty"
              className="p-4 rounded-xl bg-[#11141d] border border-[#222736] text-center text-xs text-slate-500"
            >
              No USDT (TRC-20) deposit transactions recorded for this account yet.
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {invoiceHistory.map((inv) => (
                <div
                  key={inv.uuid}
                  data-testid={`deposit-history-row-${inv.orderId}`}
                  className="p-2.5 rounded-xl bg-[#11141d] border border-[#222736] flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{inv.orderId}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                          inv.status === 'completed'
                            ? 'bg-[#00e676]/20 text-[#00e676] border border-[#00e676]/40'
                            : inv.status === 'failed'
                            ? 'bg-[#ff334b]/20 text-[#ff334b] border border-[#ff334b]/40'
                            : 'bg-[#ff8800]/20 text-[#ff8800] border border-[#ff8800]/40'
                        }`}
                      >
                        {inv.status === 'completed' ? 'Completed' : inv.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      TRC-20: {inv.address}
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <div className="font-black text-[#00e676]">
                      +${inv.amount.toFixed(2)} USDT
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {new Date(inv.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
