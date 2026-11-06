import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Hash,
  DollarSign,
  ShieldCheck,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import type { TradingAccount, UserProfile } from '../types/index.ts';
import {
  P2P_SELF_CAPITAL_ONLY_ERROR,
  resolveUserNumericId,
  resolveTransferableLiveBalance,
  validateP2PTransferInput,
  executeP2PBalanceTransfer,
  loadLocalP2PTransferHistory,
  parseNumericAmount,
  type P2PTransferRecord,
} from '../utils/p2pTransfer.ts';
import { soundEngine } from '../utils/soundEffects.ts';

export interface P2PBalanceTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  accounts: TradingAccount[];
  onUpdateProfile: (profile: UserProfile) => void;
  onUpdateAccount?: (account: TradingAccount) => void;
  onRefreshBalance?: () => Promise<void> | void;
  onNotifyToast?: (toast: { type: 'success' | 'error'; title: string; message: string }) => void;
}

export const P2PBalanceTransferModal: React.FC<P2PBalanceTransferModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  accounts,
  onUpdateProfile,
  onUpdateAccount,
  onRefreshBalance,
  onNotifyToast,
}) => {
  const [receiverNumericId, setReceiverNumericId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedOwnId, setCopiedOwnId] = useState(false);
  const [modalToast, setModalToast] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [recentTransfers, setRecentTransfers] = useState<P2PTransferRecord[]>([]);

  const ownNumericId = resolveUserNumericId(userProfile);
  const { availableLiveBalance } = resolveTransferableLiveBalance(userProfile, accounts);

  useEffect(() => {
    const syncHistory = () => {
      const list = loadLocalP2PTransferHistory(userProfile.id, ownNumericId);
      setRecentTransfers(list.slice(0, 10));
    };
    syncHistory();
    window.addEventListener('bft-p2p-history-updated', syncHistory);
    return () => window.removeEventListener('bft-p2p-history-updated', syncHistory);
  }, [userProfile.id, ownNumericId, isOpen]);

  if (!isOpen) return null;

  const availableNum = parseNumericAmount(availableLiveBalance);
  const rawParsedAmount = parseNumericAmount(transferAmount);
  const hasEnteredAmount = transferAmount.trim() !== '' && Number.isFinite(rawParsedAmount);
  const validAmountNumber = hasEnteredAmount && rawParsedAmount > 0 ? Number(rawParsedAmount.toFixed(2)) : 0;
  const exceedsSelfCapitalBalance =
    hasEnteredAmount && rawParsedAmount > 0 && validAmountNumber > availableNum;

  const projectedRemainingBalance = Math.max(
    0,
    Number((availableNum - validAmountNumber).toFixed(2))
  );

  const handleCopyOwnNumericId = () => {
    soundEngine.playUiClick();
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(ownNumericId).catch(() => {});
      }
    } catch {
      // ignore clipboard error
    }
    setCopiedOwnId(true);
    setModalToast({
      type: 'success',
      title: 'Numeric ID Copied',
      message: `Your unique Trader Numeric ID (#${ownNumericId}) has been copied to clipboard.`,
    });
    if (onNotifyToast) {
      onNotifyToast({
        type: 'success',
        title: 'Numeric ID Copied',
        message: `Trader Numeric ID #${ownNumericId} copied to clipboard.`,
      });
    }
    setTimeout(() => setCopiedOwnId(false), 2500);
  };

  const handleQuickAmount = (amt: number) => {
    soundEngine.playUiClick();
    setTransferAmount(amt > 0 ? amt.toFixed(2) : String(amt));
    setModalToast(null);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setModalToast(null);
    soundEngine.playUiClick();

    const preCheck = validateP2PTransferInput({
      senderNumericId: ownNumericId,
      receiverNumericId,
      transferAmount,
      availableLiveBalance,
    });

    if (!preCheck.valid) {
      soundEngine.playErrorAlert();
      const errToast = {
        type: 'error' as const,
        title: preCheck.exceedsSelfCapitalBalance
          ? 'Self-Capital Balance Limit'
          : 'Transfer Validation Error',
        message: preCheck.error || P2P_SELF_CAPITAL_ONLY_ERROR,
      };
      setModalToast(errToast);
      if (onNotifyToast) onNotifyToast(errToast);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await executeP2PBalanceTransfer({
        userProfile,
        accounts,
        receiverNumericId: preCheck.normalizedReceiverNumericId,
        transferAmount: preCheck.normalizedAmount,
      });

      if (!result.ok) {
        soundEngine.playErrorAlert();
        const errToast = {
          type: 'error' as const,
          title: 'P2P Transfer Failed',
          message: result.error || 'Unable to process P2P balance transfer.',
        };
        setModalToast(errToast);
        if (onNotifyToast) onNotifyToast(errToast);
        return;
      }

      soundEngine.playTradeWin();

      if (result.updatedProfile) {
        onUpdateProfile(result.updatedProfile);
      }
      if (result.updatedAccount && onUpdateAccount) {
        onUpdateAccount(result.updatedAccount);
      }
      if (onRefreshBalance) {
        await Promise.resolve(onRefreshBalance()).catch(() => {});
      }

      const refreshedList = loadLocalP2PTransferHistory(userProfile.id, ownNumericId);
      setRecentTransfers(refreshedList.slice(0, 10));

      const successToast = {
        type: 'success' as const,
        title: 'P2P Transfer Sent',
        message:
          result.message ||
          `Transferred -$${result.transferAmount.toFixed(2)} USD from Self-Capital Balance to Receiver ID #${result.receiverNumericId}.`,
      };
      setModalToast(successToast);
      if (onNotifyToast) onNotifyToast(successToast);

      setReceiverNumericId('');
      setTransferAmount('');
    } catch (err: any) {
      soundEngine.playErrorAlert();
      const errToast = {
        type: 'error' as const,
        title: 'P2P Transfer Error',
        message: err?.message || 'An unexpected error occurred during the transfer.',
      };
      setModalToast(errToast);
      if (onNotifyToast) onNotifyToast(errToast);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="p2p-transfer-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        data-testid="p2p-transfer-modal"
        className="w-full max-w-lg rounded-2xl bg-[#0b0b0f] border border-[#ff8800]/45 shadow-[0_24px_60px_rgba(0,0,0,0.85)] overflow-hidden font-sans my-auto"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#111116] border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff8800]/15 border border-[#ff8800]/40 flex items-center justify-center text-[#ff8800] shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  P2P Self-Capital Transfer
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-[10px] font-mono font-bold uppercase">
                  Instant • 0% Fee
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Funds can only be transferred using your Self-Capital (Live Balance)
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="p2p-transfer-close-btn"
            disabled={isSubmitting}
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close P2P Balance Transfer Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Explicit Self-Capital Policy Banner */}
          <div
            data-testid="p2p-self-capital-policy-notice"
            className="p-3 rounded-xl bg-[#ff8800]/10 border border-[#ff8800]/35 flex items-start gap-2.5 text-xs font-mono text-amber-200"
          >
            <ShieldCheck className="w-4 h-4 text-[#ff8800] shrink-0 mt-0.5" />
            <div>
              <span className="font-black text-white">Self-Capital (Live Balance) Only:</span>{' '}
              P2P transfers strictly deduct from your personal{' '}
              <strong className="text-emerald-300">Self-Capital Balance</strong>. Challenge, Funded,
              and Demo balances cannot be transferred.
            </div>
          </div>

          {/* Sender Numeric ID + Self-Capital Balance Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#121218] border border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  Your Trader Numeric ID
                </span>
                <div
                  data-testid="p2p-modal-own-numeric-id"
                  className="text-sm sm:text-base font-mono font-black text-[#ff8800] tabular-nums truncate mt-0.5"
                >
                  #{ownNumericId}
                </div>
              </div>
              <button
                type="button"
                data-testid="p2p-modal-copy-own-id-btn"
                onClick={handleCopyOwnNumericId}
                className="px-2.5 py-1.5 rounded-lg bg-[#ff8800]/15 hover:bg-[#ff8800]/25 border border-[#ff8800]/40 text-[#ff8800] text-xs font-mono font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                title="Copy your numeric_id to share with other traders"
              >
                {copiedOwnId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#121218] border border-emerald-500/35 flex flex-col justify-center">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                  Self-Capital Balance
                </span>
                <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">
                  Live Self-Capital
                </span>
              </div>
              <div
                data-testid="p2p-modal-available-balance"
                className="text-sm sm:text-base font-mono font-black text-emerald-400 tabular-nums mt-0.5"
              >
                ${availableLiveBalance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USD
              </div>
            </div>
          </div>

          {/* Inline Error Banner when Input Amount Exceeds Self-Capital Balance */}
          {exceedsSelfCapitalBalance && (
            <div
              data-testid="p2p-self-capital-limit-error"
              role="alert"
              className="p-3 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs font-mono flex items-center gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-bold">{P2P_SELF_CAPITAL_ONLY_ERROR}</span>
            </div>
          )}

          {/* Toast Alert Banner inside Modal */}
          {modalToast && (
            <div
              data-testid={
                modalToast.type === 'success'
                  ? 'p2p-transfer-success-toast'
                  : 'p2p-transfer-error-toast'
              }
              role="status"
              className={`p-3.5 rounded-xl border text-xs font-mono flex items-start justify-between gap-3 ${
                modalToast.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {modalToast.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-black text-white">{modalToast.title}</div>
                  <p className="mt-0.5 leading-relaxed">{modalToast.message}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalToast(null)}
                className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Transfer Form */}
          <form onSubmit={handleSubmitTransfer} className="space-y-4" noValidate>
            {/* Recipient Numeric ID Input */}
            <div>
              <label
                htmlFor="p2p-receiver-numeric-id-input"
                className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 mb-1.5"
              >
                <span>Recipient Numeric ID (numeric_id) *</span>
                <span className="text-[10px] text-slate-400 font-normal">Digits only</span>
              </label>
              <div className="relative">
                <Hash className="w-4 h-4 text-[#ff8800] absolute left-3.5 top-3" />
                <input
                  id="p2p-receiver-numeric-id-input"
                  data-testid="p2p-receiver-numeric-id-input"
                  type="text"
                  inputMode="numeric"
                  required
                  disabled={isSubmitting}
                  value={receiverNumericId}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 15);
                    setReceiverNumericId(digitsOnly);
                    if (modalToast?.type === 'error') setModalToast(null);
                  }}
                  placeholder="Enter recipient numeric ID (e.g. 100201)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#14141c] border border-white/15 focus:border-[#ff8800] text-white font-mono text-sm tabular-nums focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Transfer Amount Input */}
            <div>
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 mb-1.5">
                <label htmlFor="p2p-transfer-amount-input">
                  Transfer Amount from Self-Capital (USD) *
                </label>
                <button
                  type="button"
                  data-testid="p2p-max-amount-btn"
                  disabled={isSubmitting || availableLiveBalance <= 0}
                  onClick={() => handleQuickAmount(availableLiveBalance)}
                  className="text-[11px] text-[#ff8800] hover:underline font-bold cursor-pointer disabled:opacity-40"
                >
                  Send Max (${availableLiveBalance.toFixed(2)})
                </button>
              </div>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-emerald-400 absolute left-3.5 top-3" />
                <input
                  id="p2p-transfer-amount-input"
                  data-testid="p2p-transfer-amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  disabled={isSubmitting}
                  value={transferAmount}
                  onChange={(e) => {
                    setTransferAmount(e.target.value);
                    if (modalToast?.type === 'error') setModalToast(null);
                  }}
                  placeholder="0.00"
                  className={`w-full pl-10 pr-16 py-2.5 rounded-xl bg-[#14141c] border text-white font-mono text-sm tabular-nums focus:outline-none transition-colors ${
                    exceedsSelfCapitalBalance
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-white/15 focus:border-[#ff8800]'
                  }`}
                />
                <span className="absolute right-3.5 top-2.5 text-xs font-mono font-bold text-slate-400">
                  USD
                </span>
              </div>

              {/* Quick Amount Presets */}
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {[10, 25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleQuickAmount(preset)}
                    className="py-1.5 rounded-lg bg-[#14141c] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-mono text-xs font-bold tabular-nums cursor-pointer transition-colors"
                  >
                    ${preset}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isSubmitting || availableLiveBalance <= 0}
                  onClick={() => handleQuickAmount(availableLiveBalance)}
                  className="py-1.5 rounded-lg bg-[#ff8800]/15 hover:bg-[#ff8800]/25 border border-[#ff8800]/40 text-[#ff8800] font-mono text-xs font-black uppercase cursor-pointer transition-colors disabled:opacity-40"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Live Self-Capital Transfer Calculation Preview */}
            <div className="p-3.5 rounded-xl bg-[#111116] border border-white/10 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-slate-400">
                <span>Source Wallet</span>
                <span className="text-emerald-400 font-bold">Self-Capital Balance (Live)</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Recipient Numeric ID</span>
                <span className="text-white font-bold tabular-nums">
                  {receiverNumericId ? `#${receiverNumericId}` : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Transfer Amount</span>
                <span className="text-rose-400 font-bold tabular-nums">
                  -$
                  {validAmountNumber.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  USD
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Platform P2P Transfer Fee</span>
                <span className="text-emerald-400 font-bold">$0.00 (Free)</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-slate-300 font-bold">Remaining Self-Capital Balance</span>
                <span
                  data-testid="p2p-projected-remaining-balance"
                  className="text-white font-black tabular-nums"
                >
                  $
                  {projectedRemainingBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  USD
                </span>
              </div>
            </div>

            {/* Submit & Cancel Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
              <button
                type="submit"
                data-testid="p2p-confirm-transfer-btn"
                disabled={
                  isSubmitting ||
                  !receiverNumericId.trim() ||
                  validAmountNumber <= 0 ||
                  exceedsSelfCapitalBalance
                }
                className="w-full sm:flex-1 py-3 px-5 rounded-xl bg-[#ff8800] hover:bg-[#ff9900] disabled:opacity-45 disabled:cursor-not-allowed text-slate-950 font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Transfer...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm &amp; Send Self-Capital</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="w-full sm:w-auto py-3 px-5 rounded-xl bg-[#16161d] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-mono text-xs font-bold cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </form>

          {/* P2P Payment History (Sent & Received Transfers) */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="uppercase font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#ff8800]" /> P2P Payment History
              </span>
              <span>Sent &amp; Received Ledger</span>
            </div>
            {recentTransfers.length === 0 ? (
              <div
                data-testid="p2p-history-empty"
                className="px-3 py-3 rounded-lg bg-[#13131a] border border-white/10 text-center text-xs font-mono text-slate-500"
              >
                No P2P transfers recorded yet.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {recentTransfers.map((item) => {
                  const isSent = item.direction === 'sent' || item.type === 'P2P Transfer Sent';
                  return (
                    <div
                      key={item.id}
                      data-testid={`p2p-history-row-${item.id}`}
                      className="px-3 py-2.5 rounded-lg bg-[#13131a] border border-white/10 flex items-center justify-between text-xs font-mono gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            isSent
                              ? 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                              : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                          }`}
                        >
                          {isSent ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-bold truncate">
                            {isSent ? 'P2P Transfer Sent' : 'P2P Deposit Received'}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums truncate">
                            {isSent
                              ? `Receiver ID: #${item.receiverNumericId}`
                              : `Sender ID: #${item.senderNumericId}`}{' '}
                            •{' '}
                            {new Date(item.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-black tabular-nums ${
                            isSent ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {isSent
                            ? `-$${item.amount.toFixed(2)}`
                            : `+$${item.amount.toFixed(2)}`}
                        </span>
                        <span className="block text-[9px] text-slate-400 uppercase">
                          Self-Capital
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Security Footer Note */}
          <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400 font-mono">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Protected by atomic Supabase RPC (
              <code className="text-slate-300">transfer_balance_p2p</code>) Self-Capital ledger
              verification.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
