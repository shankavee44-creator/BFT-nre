import { TradingAccount, WithdrawalRequest } from '../types';

export type QuotexPortalTab =
  | 'withdrawal'
  | 'payments'
  | 'trades'
  | 'account'
  | 'market'
  | 'tournaments'
  | 'analytics';

export type QuotexCryptoNetwork = 'BSC (BEP20)' | 'TRON (TRC-20)' | 'Ethereum (ERC-20)' | 'Polygon (MATIC)';

export type QuotexPaymentMethodOption =
  | 'USDT'
  | 'Binance Pay'
  | 'Bitcoin (BTC)'
  | 'Ethereum (ETH)'
  | 'Bank Transfer';

export interface QuotexTransactionItem {
  id: string;
  orderNumber: string;
  timestamp: number;
  dateFormatted: string;
  timeFormatted: string;
  status: 'Succeeded' | 'Waiting confirmation' | 'Pending' | 'Canceled';
  rawStatus: WithdrawalRequest['status'];
  type: 'Payout' | 'Deposit';
  paymentSystem: string;
  network?: string;
  purse?: string;
  txHash?: string;
  amount: number; // positive number
  signedAmountFormatted: string; // "-180.00 $" or "+150.00 $"
  feeAmount?: number;
  feeFormatted?: string; // "$0.64 fee"
  accountId: string;
}

export interface QuotexFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const QUOTEX_WITHDRAWAL_FAQS: QuotexFaqItem[] = [
  {
    id: 'q-faq-1',
    question: 'How to withdraw money from the account?',
    answer:
      'The procedure for withdrawing capital is extremely simple and is carried out through your individual account. Specify the desired withdrawal amount (USD), select your preferred payment method (such as USDT or Binance Pay), enter your wallet purse address, choose the blockchain network (BSC BEP20 or TRON TRC-20), and click the "Confirm" button.',
  },
  {
    id: 'q-faq-2',
    question: 'How long does it take to withdraw money?',
    answer:
      'We process payouts within 3 minutes; if we fail, we pay double! On BFT Prime Prop accounts using USDT (TRC-20 / BEP-20), automated payouts are dispatched within our 3-minute instant settlement SLA.',
  },
  {
    id: 'q-faq-3',
    question: 'What is the minimum withdrawal amount?',
    answer:
      'The minimum withdrawal amount is strictly $250.00 USD in realized net trading profit across all Binary Funded Trader (BFT) accounts.',
  },
  {
    id: 'q-faq-4',
    question: 'What are the withdrawal fee and first withdrawal waiting period rules?',
    answer:
      'A 10% Withdrawal Fee is clearly displayed and deducted on all payout requests. A mandatory 14-day waiting period applies for the very first withdrawal across all account types. After your first withdrawal is completed, traders who purchased the Daily Withdrawal Add-On (+15%) or Weekly Plan can proceed according to their package schedule.',
  },
  {
    id: 'q-faq-5',
    question: 'Do I need to provide any documents to make a withdrawal?',
    answer:
      'All new accounts start with an Unverified KYC status and locked withdrawals. Before requesting a payout, you must permanently lock your Full Name, Address, and Date of Birth in your profile and upload a valid Government ID, Passport, or Driver License for automated 2-minute verification.',
  },
  {
    id: 'q-faq-6',
    question: 'What is account verification and how to pass it?',
    answer:
      'Verification confirms your personal identity details. Navigate to your Profile & KYC section, save and permanently lock your Full Name, Address, and Date of Birth (these fields cannot be edited once saved), and upload your ID card, passport, or license. If the document matches your profile, our automated engine verifies your account within 2 minutes.',
  },
];

export const DEFAULT_QUOTEX_PAYMENT_HISTORY: QuotexTransactionItem[] = [
  {
    id: '51940284910',
    orderNumber: '51940284910',
    timestamp: Date.UTC(2026, 9, 27, 16, 42, 11),
    dateFormatted: '27/10/2026',
    timeFormatted: '16:42:11',
    status: 'Succeeded',
    rawStatus: 'paid',
    type: 'Payout',
    paymentSystem: 'USDT',
    network: 'BSC (BEP20)',
    purse: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    txHash: '0x9fb8c14d5e23a0781b4d0812eac92b8d4f0980598125cfb881329a1b9e21',
    amount: 315.0,
    signedAmountFormatted: '-315.00 $',
    feeAmount: 35.0,
    feeFormatted: '10% fee ($35.00)',
    accountId: 'BFT-91823',
  },
  {
    id: '51938810472',
    orderNumber: '51938810472',
    timestamp: Date.UTC(2026, 9, 25, 11, 18, 49),
    dateFormatted: '25/10/2026',
    timeFormatted: '11:18:49',
    status: 'Succeeded',
    rawStatus: 'paid',
    type: 'Payout',
    paymentSystem: 'USDT',
    network: 'TRON (TRC-20)',
    purse: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    txHash: 'e4590ba1fcd89028a3851b98ce319fa442981bd20a84d28430a91ec88',
    amount: 450.0,
    signedAmountFormatted: '-450.00 $',
    feeAmount: 50.0,
    feeFormatted: '10% fee ($50.00)',
    accountId: 'BFT-91823',
  },
  {
    id: '51931094821',
    orderNumber: '51931094821',
    timestamp: Date.UTC(2026, 9, 22, 9, 5, 33),
    dateFormatted: '22/10/2026',
    timeFormatted: '09:05:33',
    status: 'Succeeded',
    rawStatus: 'completed',
    type: 'Deposit',
    paymentSystem: 'Binance Pay',
    network: 'Binance Pay Instant',
    purse: 'BPAY-99284102',
    txHash: 'bpay_tx_88412095821049',
    amount: 299.0,
    signedAmountFormatted: '+299.00 $',
    feeAmount: 0.0,
    feeFormatted: '$0.00 fee',
    accountId: 'BFT-91823',
  },
  {
    id: '51927481905',
    orderNumber: '51927481905',
    timestamp: Date.UTC(2026, 9, 19, 19, 54, 12),
    dateFormatted: '19/10/2026',
    timeFormatted: '19:54:12',
    status: 'Succeeded',
    rawStatus: 'paid',
    type: 'Payout',
    paymentSystem: 'USDT',
    network: 'BSC (BEP20)',
    purse: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    txHash: '0x44a19bc823710492817fa98210bc98412094812094812904810294810294',
    amount: 270.0,
    signedAmountFormatted: '-270.00 $',
    feeAmount: 30.0,
    feeFormatted: '10% fee ($30.00)',
    accountId: 'BFT-91823',
  },
  {
    id: '51920394812',
    orderNumber: '51920394812',
    timestamp: Date.UTC(2026, 9, 16, 14, 22, 8),
    dateFormatted: '16/10/2026',
    timeFormatted: '14:22:08',
    status: 'Succeeded',
    rawStatus: 'completed',
    type: 'Deposit',
    paymentSystem: 'USDT',
    network: 'TRON (TRC-20)',
    purse: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    txHash: '7c8910234819203481092384019283401928340912834091823049182304',
    amount: 300.0,
    signedAmountFormatted: '+300.00 $',
    feeAmount: 0.0,
    feeFormatted: '$0.00 fee',
    accountId: 'BFT-91823',
  },
  {
    id: '51915829104',
    orderNumber: '51915829104',
    timestamp: Date.UTC(2026, 9, 12, 21, 10, 45),
    dateFormatted: '12/10/2026',
    timeFormatted: '21:10:45',
    status: 'Succeeded',
    rawStatus: 'paid',
    type: 'Payout',
    paymentSystem: 'Binance Pay',
    network: 'BSC (BEP20)',
    purse: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    txHash: '0x883102948102938401928304918203948102938401928304918203948102',
    amount: 360.0,
    signedAmountFormatted: '-360.00 $',
    feeAmount: 40.0,
    feeFormatted: '10% fee ($40.00)',
    accountId: 'BFT-44109',
  },
  {
    id: '51908471290',
    orderNumber: '51908471290',
    timestamp: Date.UTC(2026, 9, 8, 12, 37, 19),
    dateFormatted: '08/10/2026',
    timeFormatted: '12:37:19',
    status: 'Canceled',
    rawStatus: 'rejected',
    type: 'Payout',
    paymentSystem: 'USDT',
    network: 'TRON (TRC-20)',
    purse: 'TQr9Lm42Kp8VX2n1B87Wqm3ZjR9H5K3P8',
    txHash: 'REJECTED-BELOW-250-MIN',
    amount: 250.0,
    signedAmountFormatted: '-250.00 $',
    feeAmount: 0.0,
    feeFormatted: '$0.00 fee',
    accountId: 'BFT-33912',
  },
  {
    id: '51901928374',
    orderNumber: '51901928374',
    timestamp: Date.UTC(2026, 9, 3, 8, 15, 0),
    dateFormatted: '03/10/2026',
    timeFormatted: '08:15:00',
    status: 'Succeeded',
    rawStatus: 'completed',
    type: 'Deposit',
    paymentSystem: 'USDT',
    network: 'BSC (BEP20)',
    purse: '0x71C94F8B92E1048A3B99D2E54C1A82F901D3E84A',
    txHash: '0x119283746501928374650192837465019283746501928374650192837465',
    amount: 500.0,
    signedAmountFormatted: '+500.00 $',
    feeAmount: 0.0,
    feeFormatted: '$0.00 fee',
    accountId: 'BFT-91823',
  },
];

export function formatQuotexDateAndTime(timestampMs: number): {
  dateFormatted: string;
  timeFormatted: string;
  combined: string;
} {
  const d = new Date(timestampMs);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');

  const dateFormatted = `${day}/${month}/${year}`;
  const timeFormatted = `${hours}:${minutes}:${seconds}`;
  return {
    dateFormatted,
    timeFormatted,
    combined: `${dateFormatted} ${timeFormatted}`,
  };
}

export function mapWithdrawalRequestToQuotexTransaction(req: WithdrawalRequest): QuotexTransactionItem {
  const dt = formatQuotexDateAndTime(req.requestedAt);
  const netOrGross = req.netReceivedAmount ?? req.amount;
  const computedFee = req.withdrawalFee ?? Number((req.amount * 0.1).toFixed(2));
  const statusMap: Record<WithdrawalRequest['status'], QuotexTransactionItem['status']> = {
    paid: 'Succeeded',
    completed: 'Succeeded',
    doubled: 'Succeeded',
    processing: 'Waiting confirmation',
    pending: 'Pending',
    rejected: 'Canceled',
  };

  const isBank = req.paymentMethod === 'bank_transfer';
  const isBep20 = req.trc20Address?.startsWith('0x');

  return {
    id: req.id,
    orderNumber: req.id.replace(/^WD-/, '5194099'),
    timestamp: req.requestedAt,
    dateFormatted: dt.dateFormatted,
    timeFormatted: dt.timeFormatted,
    status: statusMap[req.status] || 'Pending',
    rawStatus: req.status,
    type: 'Payout',
    paymentSystem: isBank ? 'Bank Transfer' : 'USDT',
    network: isBank ? 'SWIFT / IBAN' : isBep20 ? 'BSC (BEP20)' : 'TRON (TRC-20)',
    purse: req.trc20Address,
    txHash: req.txHash || req.referenceNumber,
    amount: netOrGross,
    signedAmountFormatted: `-${netOrGross.toFixed(2)} $`,
    feeAmount: computedFee,
    feeFormatted: `10% fee ($${computedFee.toFixed(2)})`,
    accountId: req.accountId,
  };
}

export function buildMergedTransactionLedger(
  withdrawals: WithdrawalRequest[],
  includeDemoHistory: boolean = true
): QuotexTransactionItem[] {
  const mappedUserWithdrawals = withdrawals.map(mapWithdrawalRequestToQuotexTransaction);
  if (!includeDemoHistory) {
    return mappedUserWithdrawals.sort((a, b) => b.timestamp - a.timestamp);
  }
  const existingIds = new Set(mappedUserWithdrawals.map((w) => w.id));

  const combined = [
    ...mappedUserWithdrawals,
    ...DEFAULT_QUOTEX_PAYMENT_HISTORY.filter((item) => !existingIds.has(item.id)),
  ];

  return combined.sort((a, b) => b.timestamp - a.timestamp);
}

export function paginateTransactions(
  items: QuotexTransactionItem[],
  page: number,
  pageSize: number = 5
): {
  currentPage: number;
  totalPages: number;
  pageItems: QuotexTransactionItem[];
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);

  return {
    currentPage: safePage,
    totalPages,
    pageItems,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

export function calculateQuotexAccountSummary(account?: TradingAccount | null): {
  inTheAccount: number;
  availableForWithdrawal: number;
  commission: number;
  withdrawalFeePercent: number;
  minWithdrawalAmount: number;
  inTheAccountFormatted: string;
  availableForWithdrawalFormatted: string;
  commissionFormatted: string;
} {
  if (!account) {
    return {
      inTheAccount: 0,
      availableForWithdrawal: 0,
      commission: 10,
      withdrawalFeePercent: 10,
      minWithdrawalAmount: 250,
      inTheAccountFormatted: '0.00 $',
      availableForWithdrawalFormatted: '0.00 $',
      commissionFormatted: '10% (Withdrawal Fee)',
    };
  }

  const inTheAccount = Math.max(0, Number(account.currentBalance.toFixed(2)));
  const netProfit = Math.max(0, Number((account.currentBalance - account.initialBalance).toFixed(2)));
  return {
    inTheAccount,
    availableForWithdrawal: netProfit,
    commission: 10,
    withdrawalFeePercent: 10,
    minWithdrawalAmount: 250,
    inTheAccountFormatted: `${inTheAccount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} $`,
    availableForWithdrawalFormatted: `${netProfit.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} $`,
    commissionFormatted: '10% (Withdrawal Fee)',
  };
}

export function validateQuotexPurseAddress(
  purse: string,
  network: QuotexCryptoNetwork | string,
  paymentMethod: QuotexPaymentMethodOption | string
): { valid: boolean; reason?: string } {
  const trimmed = purse.trim();
  if (!trimmed || trimmed.length < 6) {
    return {
      valid: false,
      reason: 'Please enter a valid destination Purse / Wallet address.',
    };
  }

  if (paymentMethod === 'USDT') {
    if (network === 'TRON (TRC-20)' && !trimmed.startsWith('T') && !trimmed.startsWith('0x')) {
      return {
        valid: false,
        reason: 'Please enter a valid TRON (TRC-20) wallet address starting with "T" or EVM "0x" purse.',
      };
    }
  }

  return { valid: true };
}
