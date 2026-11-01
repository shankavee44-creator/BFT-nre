/**
 * Binary Funded Trader (BFT) - Direct USDT TRC-20 Deposit System Configuration
 * Official Depository Wallet and Parameters for Direct Blockchain Transfers
 */
export const DIRECT_USDT_TRC20_CONFIG = {
  /**
   * Primary settlement currency for instantaneous low-fee trader deposits
   */
  currency: 'USDT' as const,

  /**
   * Primary network for high speed & lowest network fees
   */
  network: 'TRON (TRC-20)' as const,
  networkLabel: 'TRC-20 (TRON Network)',

  /**
   * Official BFT Company Direct USDT TRC-20 Depository Wallet Address
   */
  walletAddress: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',

  /**
   * Minimum and maximum USDT deposit constraints
   */
  minDepositUsdt: 10,
  maxDepositUsdt: 100000,

  /**
   * TronScan Explorer transaction verification template
   */
  explorerTxUrl: 'https://tronscan.org/#/transaction/',
  explorerAddressUrl: 'https://tronscan.org/#/address/',
} as const;

export type DirectDepositConfig = typeof DIRECT_USDT_TRC20_CONFIG;

export function isValidTrc20Address(address: string): boolean {
  return typeof address === 'string' && address.startsWith('T') && address.length === 34 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
}

export function validateDirectDepositAmount(amount: number): {
  valid: boolean;
  error?: string;
} {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return { valid: false, error: 'Please enter a valid numeric deposit amount.' };
  }
  if (amount < DIRECT_USDT_TRC20_CONFIG.minDepositUsdt) {
    return {
      valid: false,
      error: `Minimum deposit is $${DIRECT_USDT_TRC20_CONFIG.minDepositUsdt} USDT (TRC-20).`,
    };
  }
  if (amount > DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt) {
    return {
      valid: false,
      error: `Maximum single deposit is $${DIRECT_USDT_TRC20_CONFIG.maxDepositUsdt.toLocaleString()} USDT (TRC-20).`,
    };
  }
  return { valid: true };
}
