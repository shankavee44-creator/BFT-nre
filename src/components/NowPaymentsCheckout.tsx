import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  NowPaymentsPaymentResponse,
  NOWPAYMENTS_CURRENCIES,
} from '../utils/nowpaymentsGateway';
import { apiGetNowPaymentsPaymentStatus } from '../utils/apiClient';
import { supabase } from '../utils/supabase';

interface NowPaymentsCheckoutProps {
  payment: NowPaymentsPaymentResponse;
  numericAmount?: number;
  bonusApplied?: boolean;
  bonusCode?: string | null;
  targetAccountId?: string;
  onPaymentFinished: (amount: number, details: any) => void;
  onBack?: () => void;
  onCancel?: () => void;
}

export const NowPaymentsCheckout: React.FC<NowPaymentsCheckoutProps> = ({
  payment,
  numericAmount,
  bonusApplied = false,
  bonusCode,
  targetAccountId,
  onPaymentFinished,
  onBack,
  onCancel,
}) => {
  const handleBack = onBack || onCancel || (() => {});
  const safeAmount =
    typeof numericAmount === 'number' && !isNaN(numericAmount) && numericAmount > 0
      ? numericAmount
      : Number(payment?.price_amount || payment?.pay_amount || 0);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(payment?.payment_status || 'waiting');
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(
    payment?.payment_status === 'finished' || payment?.payment_status === 'confirmed'
  );
  const [actuallyPaid, setActuallyPaid] = useState<number>(payment?.pay_amount || safeAmount);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  // 60-Minute Countdown Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const copyToClipboard = (text: string, fieldName: string, message: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(fieldName);
    setCopyToast(message);
    setTimeout(() => {
      setCopiedField(null);
      setCopyToast(null);
    }, 2500);
  };

  // Helper when payment status changes to finished
  const handleFinishedPayment = (finalTx?: string, paidAmt?: number) => {
    if (isFinished) return;
    setIsFinished(true);
    setStatus('finished');
    const creditAmount = paidAmt && paidAmt > 0 ? paidAmt : safeAmount;
    onPaymentFinished(creditAmount, {
      gateway: 'nowpayments',
      paymentId: payment.payment_id,
      orderId: payment.order_id,
      payAddress: payment.pay_address,
      currency: payment.pay_currency,
      txHash: finalTx || `NOWPAYMENTS:${payment.payment_id}`,
      bonusApplied,
    });
  };

  // Automated Polling every 3.5 seconds
  useEffect(() => {
    if (isFinished) return;

    let isMounted = true;
    const pollInterval = setInterval(async () => {
      if (!isMounted || isFinished) return;
      try {
        const res = await apiGetNowPaymentsPaymentStatus(payment.payment_id);
        if (res && res.ok) {
          const currentStatus = String(res.status || res.paymentStatus || 'waiting').toLowerCase();
          setStatus(currentStatus);
          if (res.actuallyPaid) {
            setActuallyPaid(res.actuallyPaid);
          }
          if (res.isFinished || currentStatus === 'finished') {
            handleFinishedPayment(res.txHash, res.actuallyPaid);
          }
        }
      } catch {
        // Ignore transient poll error
      }
    }, 3500);

    // Supabase Realtime listener on crypto_deposits table
    let channel: any = null;
    if (supabase) {
      try {
        channel = supabase
          .channel(`nowpayments-deposit-${payment.payment_id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'crypto_deposits',
              filter: `id=eq.${payment.order_id}`,
            },
            (payload) => {
              const updatedStatus = String(payload?.new?.status || '').toLowerCase();
              if (updatedStatus === 'completed' || updatedStatus === 'active') {
                handleFinishedPayment(payload?.new?.tx_hash);
              }
            }
          )
          .subscribe();
      } catch {}
    }

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      if (channel && supabase) {
        supabase.removeChannel(channel).catch(() => {});
      }
    };
  }, [payment.payment_id, payment.order_id, isFinished]);

  // Manual Check Status Button
  const handleManualCheckStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const res = await apiGetNowPaymentsPaymentStatus(payment.payment_id);
      if (res && res.ok) {
        const currentStatus = String(res.status || res.paymentStatus || 'waiting').toLowerCase();
        setStatus(currentStatus);
        if (res.actuallyPaid) setActuallyPaid(res.actuallyPaid);
        if (res.isFinished || currentStatus === 'finished') {
          handleFinishedPayment(res.txHash, res.actuallyPaid);
        }
      }
    } catch (e) {
      console.warn('Manual check error:', e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const currencyMeta = NOWPAYMENTS_CURRENCIES.find(
    (c) => c.code.toLowerCase() === payment.pay_currency.toLowerCase()
  ) || {
    code: payment.pay_currency,
    name: payment.pay_currency.toUpperCase(),
    network: payment.network || 'Crypto Network',
    symbol: payment.pay_currency.toUpperCase(),
  };

  const isTrc20 = payment.pay_currency.toLowerCase().includes('trc') || payment.pay_currency.toLowerCase() === 'trx';

  return (
    <div className="space-y-4" data-testid="nowpayments-checkout-view">
      {/* Toast Notification */}
      {copyToast && (
        <div
          data-testid="nowpayments-copy-toast"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2 rounded-lg bg-[#00e5ff] text-[#0b132b] font-bold text-xs shadow-xl flex items-center gap-2 animate-in fade-in duration-150"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Header Info Banner */}
      <div className="bg-[#172033] border border-[#233554] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#00e5ff]/20 text-[#00e5ff] flex items-center justify-center font-bold">
            NP
          </div>
          <div>
            <div className="font-bold text-white flex items-center gap-2">
              <span>NOWPayments Automatic Gateway</span>
              <span className="px-2 py-0.5 rounded bg-[#00e5ff]/20 border border-[#00e5ff]/40 text-[#00e5ff] font-mono text-[11px]">
                {currencyMeta.name}
              </span>
            </div>
            <div className="text-slate-400 text-[11px] font-mono">
              Order: {payment.order_id} • ID: {payment.payment_id}
            </div>
          </div>
        </div>

        {/* Expiry Countdown Timer */}
        <div className="flex items-center gap-2 bg-[#0b132b] px-3 py-1.5 rounded border border-[#233554]">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400 text-[11px]">Expires in:</span>
          <span
            data-testid="nowpayments-countdown-timer"
            className="font-mono font-bold text-amber-300 text-xs"
          >
            {formatCountdown(remainingSeconds)}
          </span>
        </div>
      </div>

      {/* Real-Time Payment Status Tracker */}
      <div className="bg-[#1e2638] border border-[#2c3852] rounded-lg p-3.5">
        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
          <span>Real-Time Payment Status Tracker</span>
          <span
            data-testid="nowpayments-live-status-badge"
            className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] uppercase flex items-center gap-1.5 ${
              isFinished
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : status === 'confirming' || status === 'confirmed'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isFinished
                  ? 'bg-emerald-400'
                  : status === 'confirming'
                  ? 'bg-sky-400 animate-ping'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span>
              {isFinished
                ? 'Finished & Credited'
                : status === 'confirming'
                ? 'Confirming on Chain'
                : status === 'confirmed'
                ? 'Confirmed'
                : 'Pending: Awaiting Payment'}
            </span>
          </span>
        </div>

        {/* Visual Progress Steps */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
          {/* Step 1: Pending */}
          <div
            className={`p-2 rounded border transition-all ${
              !isFinished && status === 'waiting'
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold'
                : 'bg-black/20 border-white/5 text-slate-400'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Step 1</div>
            <div className="truncate">Awaiting Deposit</div>
          </div>

          {/* Step 2: Confirming */}
          <div
            className={`p-2 rounded border transition-all ${
              status === 'confirming' || status === 'confirmed'
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-bold'
                : isFinished
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-black/20 border-white/5 text-slate-400'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Step 2</div>
            <div className="truncate flex items-center justify-center gap-1">
              {status === 'confirming' && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>Confirming</span>
            </div>
          </div>

          {/* Step 3: Finished */}
          <div
            className={`p-2 rounded border transition-all ${
              isFinished
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                : 'bg-black/20 border-white/5 text-slate-400'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Step 3</div>
            <div className="truncate flex items-center justify-center gap-1">
              {isFinished && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              <span>Finished / Credited</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Payment Checkout Box */}
      <div className="bg-[#242c3f] border border-[#344059] rounded-lg p-5">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* QR Code Container */}
          <div className="bg-white p-3 rounded-lg shadow-xl shrink-0 flex flex-col items-center">
            <div data-testid="nowpayments-qr-code">
              <QRCodeSVG
                value={payment.pay_address}
                size={148}
                level="H"
                includeMargin={false}
              />
            </div>
            <span className="text-[10px] font-bold text-slate-700 uppercase mt-2 tracking-wider">
              Scan to Pay
            </span>
          </div>

          {/* Payment Details & Copy Controls */}
          <div className="flex-1 min-w-0 w-full space-y-3.5">
            {/* Amount to Send */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Exact Amount to Send:</span>
                <span className="text-emerald-400 font-bold">Zero Fee Deductions</span>
              </div>
              <div className="flex items-center gap-2 bg-[#171d2b] border border-[#2e3a52] rounded-md px-3 py-2">
                <div
                  data-testid="nowpayments-pay-amount"
                  className="font-mono font-bold text-base text-white tracking-wide truncate flex-1"
                >
                  {payment.pay_amount || safeAmount}{' '}
                  <span className="text-[#00e5ff] uppercase">{payment.pay_currency}</span>
                  <span className="text-slate-400 text-xs ml-2 font-normal">
                    (≈ ${safeAmount.toFixed(2)} USD)
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="nowpayments-copy-amount-btn"
                  onClick={() =>
                    copyToClipboard(
                      String(payment.pay_amount || safeAmount),
                      'amount',
                      'Amount copied to clipboard!'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-[#2a364f] hover:bg-[#354463] text-xs font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer"
                  title="Copy Amount"
                >
                  {copiedField === 'amount' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>{copiedField === 'amount' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Destination Wallet Address */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>Destination Wallet Address ({currencyMeta.network}):</span>
                {isTrc20 && (
                  <span className="text-amber-400 text-[11px] font-semibold">TRC-20 Network</span>
                )}
              </div>
              <div className="flex items-center gap-2 bg-[#171d2b] border border-[#2e3a52] rounded-md px-3 py-2">
                <div
                  data-testid="nowpayments-pay-address"
                  className="font-mono font-bold text-xs text-[#00e5ff] break-all leading-snug flex-1 select-all"
                >
                  {payment.pay_address}
                </div>
                <button
                  type="button"
                  data-testid="nowpayments-copy-address-btn"
                  onClick={() =>
                    copyToClipboard(
                      payment.pay_address,
                      'address',
                      'Wallet address copied to clipboard!'
                    )
                  }
                  className="px-2.5 py-1 rounded bg-[#0d84ff] hover:bg-[#0070e6] text-xs font-semibold text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Copy Address"
                >
                  {copiedField === 'address' ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-white" />
                  )}
                  <span>{copiedField === 'address' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Network Warning Badge */}
            <div className="flex items-start gap-2 bg-[#2a221d] border border-[#4d3a2e] rounded p-2.5 text-xs text-slate-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Please transfer strictly via{' '}
                <strong className="text-white font-semibold">{currencyMeta.network}</strong>. Sending
                tokens via an incompatible blockchain may result in permanent loss.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Finished Success Banner */}
      {isFinished && (
        <div
          data-testid="nowpayments-finished-banner"
          className="bg-emerald-500/15 border border-emerald-500/40 rounded-lg p-4 text-emerald-300 flex items-start gap-3 animate-in fade-in"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-sm text-white">Payment Confirmed & Credited!</div>
            <div className="text-xs text-emerald-200 leading-relaxed">
              Your blockchain deposit of{' '}
              <strong className="text-white">${safeAmount.toFixed(2)} USD</strong> has been
              verified by NOWPayments. Your active Self-Capital balance has been updated
              automatically.
              {bonusApplied && (
                <span className="block text-amber-300 font-semibold mt-1">
                  +100% BFT100 First Deposit Bonus (+${safeAmount.toFixed(2)}) activated!
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleBack}
          className="px-4 py-2 rounded-md bg-[#232b3c] hover:bg-[#2e384e] text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          ← Change Method / Amount
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="nowpayments-check-status-btn"
            disabled={isCheckingStatus || isFinished}
            onClick={handleManualCheckStatus}
            className="px-4 py-2 rounded-md bg-[#1e2a42] hover:bg-[#283959] disabled:opacity-50 text-[#00e5ff] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-[#00e5ff]/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            <span>{isCheckingStatus ? 'Checking Node...' : 'Check Payment Status'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
