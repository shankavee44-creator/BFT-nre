/**
 * Binary Funded Trader (BFT) - Cryptomus Payment Gateway Configuration
 * Official Merchant UUID and Gateway Parameters
 */
export const CRYPTOMUS_CONFIG = {
  /**
   * Official Cryptomus Merchant ID provided by the trader/merchant
   */
  merchantId: '9b16fe05-6331-49c0-a1be-d574726df832',

  /**
   * Primary settlement currency for instantaneous low-fee trader deposits
   */
  currency: 'USDT' as const,

  /**
   * Primary network for high speed & lowest network fees
   */
  network: 'tron' as const,
  networkLabel: 'TRC-20 (TRON Network)',

  /**
   * Domain verification hash matching <meta name="cryptomus" content="9b16fe05" />
   */
  domainVerificationTag: '9b16fe05',

  /**
   * Minimum and maximum USDT deposit constraints
   */
  minDepositUsdt: 10,
  maxDepositUsdt: 100000,

  /**
   * Official Cryptomus endpoints
   */
  apiEndpoint: 'https://api.cryptomus.com/v1',
  paymentBaseUrl: 'https://pay.cryptomus.com/pay',
} as const;

export type CryptomusConfig = typeof CRYPTOMUS_CONFIG;
