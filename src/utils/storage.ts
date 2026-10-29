import { TradingAccount, UserProfile, WithdrawalRequest, BinaryTrade, AssetInfo } from '../types';

export const DEFAULT_ASSETS: AssetInfo[] = [
  // ============================================================================
  // 1. FOREX (OTC) — 55 OTC Currency Pairs (Payouts 82% - 97%)
  // ============================================================================
  { symbol: 'EUR/USD (OTC)', name: 'Euro / US Dollar (OTC)', payout: 97, category: 'Forex (OTC)', basePrice: 1.08425, volatility: 0.00015, pipDecimals: 5, flag: '🇪🇺/🇺🇸' },
  { symbol: 'GBP/JPY (OTC)', name: 'British Pound / Japanese Yen (OTC)', payout: 96, category: 'Forex (OTC)', basePrice: 194.280, volatility: 0.045, pipDecimals: 3, flag: '🇬🇧/🇯🇵' },
  { symbol: 'GBP/USD (OTC)', name: 'British Pound / US Dollar (OTC)', payout: 96, category: 'Forex (OTC)', basePrice: 1.29840, volatility: 0.00020, pipDecimals: 5, flag: '🇬🇧/🇺🇸' },
  { symbol: 'USD/JPY (OTC)', name: 'US Dollar / Japanese Yen (OTC)', payout: 95, category: 'Forex (OTC)', basePrice: 152.350, volatility: 0.040, pipDecimals: 3, flag: '🇺🇸/🇯🇵' },
  { symbol: 'AUD/CAD (OTC)', name: 'Australian Dollar / Canadian Dollar (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 0.89420, volatility: 0.00018, pipDecimals: 5, flag: '🇦🇺/🇨🇦' },
  { symbol: 'AUD/CHF (OTC)', name: 'Australian Dollar / Swiss Franc (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 0.57410, volatility: 0.00014, pipDecimals: 5, flag: '🇦🇺/🇨🇭' },
  { symbol: 'NZD/USD (OTC)', name: 'New Zealand Dollar / US Dollar (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 0.59820, volatility: 0.00016, pipDecimals: 5, flag: '🇳🇿/🇺🇸' },
  { symbol: 'EUR/JPY (OTC)', name: 'Euro / Japanese Yen (OTC)', payout: 95, category: 'Forex (OTC)', basePrice: 165.180, volatility: 0.042, pipDecimals: 3, flag: '🇪🇺/🇯🇵' },
  { symbol: 'EUR/GBP (OTC)', name: 'Euro / British Pound (OTC)', payout: 93, category: 'Forex (OTC)', basePrice: 0.83510, volatility: 0.00012, pipDecimals: 5, flag: '🇪🇺/🇬🇧' },
  { symbol: 'USD/CAD (OTC)', name: 'US Dollar / Canadian Dollar (OTC)', payout: 94, category: 'Forex (OTC)', basePrice: 1.38450, volatility: 0.00017, pipDecimals: 5, flag: '🇺🇸/🇨🇦' },
  { symbol: 'USD/CHF (OTC)', name: 'US Dollar / Swiss Franc (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 0.86540, volatility: 0.00015, pipDecimals: 5, flag: '🇺🇸/🇨🇭' },
  { symbol: 'AUD/USD (OTC)', name: 'Australian Dollar / US Dollar (OTC)', payout: 94, category: 'Forex (OTC)', basePrice: 0.65890, volatility: 0.00016, pipDecimals: 5, flag: '🇦🇺/🇺🇸' },
  { symbol: 'AUD/JPY (OTC)', name: 'Australian Dollar / Japanese Yen (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 100.380, volatility: 0.036, pipDecimals: 3, flag: '🇦🇺/🇯🇵' },
  { symbol: 'CAD/JPY (OTC)', name: 'Canadian Dollar / Japanese Yen (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 110.040, volatility: 0.035, pipDecimals: 3, flag: '🇨🇦/🇯🇵' },
  { symbol: 'CHF/JPY (OTC)', name: 'Swiss Franc / Japanese Yen (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 176.050, volatility: 0.044, pipDecimals: 3, flag: '🇨🇭/🇯🇵' },
  { symbol: 'EUR/AUD (OTC)', name: 'Euro / Australian Dollar (OTC)', payout: 93, category: 'Forex (OTC)', basePrice: 1.64550, volatility: 0.00022, pipDecimals: 5, flag: '🇪🇺/🇦🇺' },
  { symbol: 'EUR/CAD (OTC)', name: 'Euro / Canadian Dollar (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 1.50120, volatility: 0.00019, pipDecimals: 5, flag: '🇪🇺/🇨🇦' },
  { symbol: 'EUR/CHF (OTC)', name: 'Euro / Swiss Franc (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 0.93830, volatility: 0.00013, pipDecimals: 5, flag: '🇪🇺/🇨🇭' },
  { symbol: 'EUR/NZD (OTC)', name: 'Euro / New Zealand Dollar (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 1.81240, volatility: 0.00025, pipDecimals: 5, flag: '🇪🇺/🇳🇿' },
  { symbol: 'GBP/AUD (OTC)', name: 'British Pound / Australian Dollar (OTC)', payout: 94, category: 'Forex (OTC)', basePrice: 1.97050, volatility: 0.00026, pipDecimals: 5, flag: '🇬🇧/🇦🇺' },
  { symbol: 'GBP/CAD (OTC)', name: 'British Pound / Canadian Dollar (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 1.79760, volatility: 0.00024, pipDecimals: 5, flag: '🇬🇧/🇨🇦' },
  { symbol: 'GBP/CHF (OTC)', name: 'British Pound / Swiss Franc (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 1.12360, volatility: 0.00018, pipDecimals: 5, flag: '🇬🇧/🇨🇭' },
  { symbol: 'GBP/NZD (OTC)', name: 'British Pound / New Zealand Dollar (OTC)', payout: 93, category: 'Forex (OTC)', basePrice: 2.17040, volatility: 0.00028, pipDecimals: 5, flag: '🇬🇧/🇳🇿' },
  { symbol: 'NZD/JPY (OTC)', name: 'New Zealand Dollar / Japanese Yen (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 91.130, volatility: 0.032, pipDecimals: 3, flag: '🇳🇿/🇯🇵' },
  { symbol: 'USD/SGD (OTC)', name: 'US Dollar / Singapore Dollar (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 1.32150, volatility: 0.00014, pipDecimals: 5, flag: '🇺🇸/🇸🇬' },
  { symbol: 'USD/MXN (OTC)', name: 'US Dollar / Mexican Peso (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 19.8450, volatility: 0.0045, pipDecimals: 4, flag: '🇺🇸/🇲🇽' },
  { symbol: 'USD/ZAR (OTC)', name: 'US Dollar / South African Rand (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 17.6420, volatility: 0.0035, pipDecimals: 4, flag: '🇺🇸/🇿🇦' },
  { symbol: 'USD/BRL (OTC)', name: 'US Dollar / Brazilian Real (OTC)', payout: 94, category: 'Forex (OTC)', basePrice: 5.7240, volatility: 0.0012, pipDecimals: 4, flag: '🇺🇸/🇧🇷' },
  { symbol: 'USD/INR (OTC)', name: 'US Dollar / Indian Rupee (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 84.120, volatility: 0.015, pipDecimals: 3, flag: '🇺🇸/🇮🇳' },
  { symbol: 'USD/TRY (OTC)', name: 'US Dollar / Turkish Lira (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 34.2850, volatility: 0.008, pipDecimals: 4, flag: '🇺🇸/🇹🇷' },
  { symbol: 'USD/PHP (OTC)', name: 'US Dollar / Philippine Peso (OTC)', payout: 86, category: 'Forex (OTC)', basePrice: 58.420, volatility: 0.012, pipDecimals: 3, flag: '🇺🇸/🇵🇭' },
  { symbol: 'USD/IDR (OTC)', name: 'US Dollar / Indonesian Rupiah (OTC)', payout: 85, category: 'Forex (OTC)', basePrice: 15680.00, volatility: 3.50, pipDecimals: 2, flag: '🇺🇸/🇮🇩' },
  { symbol: 'USD/THB (OTC)', name: 'US Dollar / Thai Baht (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 33.650, volatility: 0.008, pipDecimals: 3, flag: '🇺🇸/🇹🇭' },
  { symbol: 'USD/VND (OTC)', name: 'US Dollar / Vietnamese Dong (OTC)', payout: 84, category: 'Forex (OTC)', basePrice: 25350.00, volatility: 6.00, pipDecimals: 2, flag: '🇺🇸/🇻🇳' },
  { symbol: 'USD/PKR (OTC)', name: 'US Dollar / Pakistani Rupee (OTC)', payout: 85, category: 'Forex (OTC)', basePrice: 278.40, volatility: 0.05, pipDecimals: 2, flag: '🇺🇸/🇵🇰' },
  { symbol: 'USD/ARS (OTC)', name: 'US Dollar / Argentine Peso (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 992.50, volatility: 0.25, pipDecimals: 2, flag: '🇺🇸/🇦🇷' },
  { symbol: 'USD/CLP (OTC)', name: 'US Dollar / Chilean Peso (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 948.20, volatility: 0.22, pipDecimals: 2, flag: '🇺🇸/🇨🇱' },
  { symbol: 'USD/COP (OTC)', name: 'US Dollar / Colombian Peso (OTC)', payout: 86, category: 'Forex (OTC)', basePrice: 4235.00, volatility: 1.10, pipDecimals: 2, flag: '🇺🇸/🇨🇴' },
  { symbol: 'USD/PEN (OTC)', name: 'US Dollar / Peruvian Sol (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 3.765, volatility: 0.001, pipDecimals: 3, flag: '🇺🇸/🇵🇪' },
  { symbol: 'USD/EGP (OTC)', name: 'US Dollar / Egyptian Pound (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 48.65, volatility: 0.015, pipDecimals: 2, flag: '🇺🇸/🇪🇬' },
  { symbol: 'USD/NGN (OTC)', name: 'US Dollar / Nigerian Naira (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 1645.50, volatility: 0.45, pipDecimals: 2, flag: '🇺🇸/🇳🇬' },
  { symbol: 'USD/KES (OTC)', name: 'US Dollar / Kenyan Shilling (OTC)', payout: 85, category: 'Forex (OTC)', basePrice: 129.20, volatility: 0.03, pipDecimals: 2, flag: '🇺🇸/🇰🇪' },
  { symbol: 'USD/GHS (OTC)', name: 'US Dollar / Ghanaian Cedi (OTC)', payout: 86, category: 'Forex (OTC)', basePrice: 15.85, volatility: 0.005, pipDecimals: 2, flag: '🇺🇸/🇬🇭' },
  { symbol: 'EUR/HUF (OTC)', name: 'Euro / Hungarian Forint (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 398.40, volatility: 0.09, pipDecimals: 2, flag: '🇪🇺/🇭🇺' },
  { symbol: 'EUR/PLN (OTC)', name: 'Euro / Polish Zloty (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 4.325, volatility: 0.001, pipDecimals: 3, flag: '🇪🇺/🇵🇱' },
  { symbol: 'EUR/CZK (OTC)', name: 'Euro / Czech Koruna (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 25.24, volatility: 0.006, pipDecimals: 2, flag: '🇪🇺/🇨🇿' },
  { symbol: 'EUR/SEK (OTC)', name: 'Euro / Swedish Krona (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 11.45, volatility: 0.003, pipDecimals: 2, flag: '🇪🇺/🇸🇪' },
  { symbol: 'EUR/NOK (OTC)', name: 'Euro / Norwegian Krone (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 11.68, volatility: 0.003, pipDecimals: 2, flag: '🇪🇺/🇳🇴' },
  { symbol: 'EUR/DKK (OTC)', name: 'Euro / Danish Krone (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 7.458, volatility: 0.001, pipDecimals: 3, flag: '🇪🇺/🇩🇰' },
  { symbol: 'GBP/SEK (OTC)', name: 'British Pound / Swedish Krona (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 13.68, volatility: 0.004, pipDecimals: 2, flag: '🇬🇧/🇸🇪' },
  { symbol: 'GBP/NOK (OTC)', name: 'British Pound / Norwegian Krone (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 13.95, volatility: 0.004, pipDecimals: 2, flag: '🇬🇧/🇳🇴' },
  { symbol: 'AUD/NZD (OTC)', name: 'Australian Dollar / New Zealand Dollar (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 1.09850, volatility: 0.00015, pipDecimals: 5, flag: '🇦🇺/🇳🇿' },
  { symbol: 'AUD/SGD (OTC)', name: 'Australian Dollar / Singapore Dollar (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 0.87120, volatility: 0.00012, pipDecimals: 5, flag: '🇦🇺/🇸🇬' },
  { symbol: 'NZD/CAD (OTC)', name: 'New Zealand Dollar / Canadian Dollar (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 0.82850, volatility: 0.00016, pipDecimals: 5, flag: '🇳🇿/🇨🇦' },
  { symbol: 'SGD/JPY (OTC)', name: 'Singapore Dollar / Japanese Yen (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 115.420, volatility: 0.030, pipDecimals: 3, flag: '🇸🇬/🇯🇵' },

  // ============================================================================
  // 2. CRYPTO (OTC) — 55 OTC Digital Assets (Payouts 85% - 97%)
  // ============================================================================
  { symbol: 'BTC/USD (OTC)', name: 'Bitcoin / US Dollar (OTC)', payout: 97, category: 'Crypto (OTC)', basePrice: 68450.00, volatility: 18.5, pipDecimals: 2, flag: '₿' },
  { symbol: 'ETH/USD (OTC)', name: 'Ethereum / US Dollar (OTC)', payout: 96, category: 'Crypto (OTC)', basePrice: 2635.50, volatility: 1.85, pipDecimals: 2, flag: 'Ξ' },
  { symbol: 'SOL/USD (OTC)', name: 'Solana / US Dollar (OTC)', payout: 96, category: 'Crypto (OTC)', basePrice: 176.40, volatility: 0.35, pipDecimals: 2, flag: '◎' },
  { symbol: 'BNB/USD (OTC)', name: 'BNB / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 594.20, volatility: 0.75, pipDecimals: 2, flag: '🔶' },
  { symbol: 'XRP/USD (OTC)', name: 'Ripple / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 0.5482, volatility: 0.0012, pipDecimals: 4, flag: '✕' },
  { symbol: 'ADA/USD (OTC)', name: 'Cardano / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 0.3645, volatility: 0.0009, pipDecimals: 4, flag: '₳' },
  { symbol: 'DOGE/USD (OTC)', name: 'Dogecoin / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 0.1428, volatility: 0.0005, pipDecimals: 4, flag: 'Ð' },
  { symbol: 'AVAX/USD (OTC)', name: 'Avalanche / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 27.85, volatility: 0.08, pipDecimals: 2, flag: '🔺' },
  { symbol: 'DOT/USD (OTC)', name: 'Polkadot / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 4.485, volatility: 0.015, pipDecimals: 3, flag: '●' },
  { symbol: 'LINK/USD (OTC)', name: 'Chainlink / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 11.92, volatility: 0.035, pipDecimals: 2, flag: '⬡' },
  { symbol: 'LTC/USD (OTC)', name: 'Litecoin / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 71.40, volatility: 0.16, pipDecimals: 2, flag: 'Ł' },
  { symbol: 'TON/USD (OTC)', name: 'Toncoin / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 5.185, volatility: 0.014, pipDecimals: 3, flag: '💎' },
  { symbol: 'TRX/USD (OTC)', name: 'TRON / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 0.1642, volatility: 0.0004, pipDecimals: 4, flag: '⚡' },
  { symbol: 'UNI/USD (OTC)', name: 'Uniswap / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 7.840, volatility: 0.022, pipDecimals: 3, flag: '🦄' },
  { symbol: 'ATOM/USD (OTC)', name: 'Cosmos / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 4.720, volatility: 0.015, pipDecimals: 3, flag: '⚛' },
  { symbol: 'NEAR/USD (OTC)', name: 'NEAR Protocol / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 4.860, volatility: 0.016, pipDecimals: 3, flag: 'Ⓝ' },
  { symbol: 'APT/USD (OTC)', name: 'Aptos / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 10.24, volatility: 0.032, pipDecimals: 2, flag: '🌐' },
  { symbol: 'ARB/USD (OTC)', name: 'Arbitrum / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 0.5680, volatility: 0.0018, pipDecimals: 4, flag: '🔷' },
  { symbol: 'OP/USD (OTC)', name: 'Optimism / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 1.745, volatility: 0.005, pipDecimals: 3, flag: '🔴' },
  { symbol: 'SUI/USD (OTC)', name: 'Sui Network / US Dollar (OTC)', payout: 96, category: 'Crypto (OTC)', basePrice: 2.085, volatility: 0.007, pipDecimals: 3, flag: '💧' },
  { symbol: 'FIL/USD (OTC)', name: 'Filecoin / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 3.840, volatility: 0.012, pipDecimals: 3, flag: '📁' },
  { symbol: 'INJ/USD (OTC)', name: 'Injective / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 21.35, volatility: 0.065, pipDecimals: 2, flag: '🗡' },
  { symbol: 'BCH/USD (OTC)', name: 'Bitcoin Cash / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 368.50, volatility: 0.65, pipDecimals: 2, flag: 'Ƀ' },
  { symbol: 'RENDER/USD (OTC)', name: 'Render / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 5.420, volatility: 0.018, pipDecimals: 3, flag: '🎨' },
  { symbol: 'AAVE/USD (OTC)', name: 'Aave / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 154.80, volatility: 0.35, pipDecimals: 2, flag: '👻' },
  { symbol: 'ICP/USD (OTC)', name: 'Internet Computer / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 8.340, volatility: 0.025, pipDecimals: 3, flag: '∞' },
  { symbol: 'HBAR/USD (OTC)', name: 'Hedera / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 0.0645, volatility: 0.0003, pipDecimals: 4, flag: 'ℏ' },
  { symbol: 'TIA/USD (OTC)', name: 'Celestia / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 5.840, volatility: 0.019, pipDecimals: 3, flag: '🌌' },
  { symbol: 'SEI/USD (OTC)', name: 'Sei / US Dollar (OTC)', payout: 93, category: 'Crypto (OTC)', basePrice: 0.3840, volatility: 0.0012, pipDecimals: 4, flag: '⛵' },
  { symbol: 'PEPE/USD (OTC)', name: 'Pepe / US Dollar (OTC)', payout: 97, category: 'Crypto (OTC)', basePrice: 0.00001, volatility: 0.000001, pipDecimals: 7, flag: '🐸' },
  { symbol: 'SHIB/USD (OTC)', name: 'Shiba Inu / US Dollar (OTC)', payout: 96, category: 'Crypto (OTC)', basePrice: 0.000018, volatility: 0.000002, pipDecimals: 7, flag: '🐕' },
  { symbol: 'WIF/USD (OTC)', name: 'dogwifhat / US Dollar (OTC)', payout: 97, category: 'Crypto (OTC)', basePrice: 2.450, volatility: 0.012, pipDecimals: 3, flag: '🎩' },
  { symbol: 'BONK/USD (OTC)', name: 'Bonk / US Dollar (OTC)', payout: 96, category: 'Crypto (OTC)', basePrice: 0.000022, volatility: 0.000003, pipDecimals: 7, flag: '🦴' },
  { symbol: 'FLOKI/USD (OTC)', name: 'Floki / US Dollar (OTC)', payout: 93, category: 'Crypto (OTC)', basePrice: 0.00014, volatility: 0.00001, pipDecimals: 6, flag: '🛡️' },
  { symbol: 'JASMY/USD (OTC)', name: 'JasmyCoin / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 0.0185, volatility: 0.0006, pipDecimals: 5, flag: '🇯🇵' },
  { symbol: 'FET/USD (OTC)', name: 'Artificial Superintelligence / USD (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 1.320, volatility: 0.004, pipDecimals: 3, flag: '🤖' },
  { symbol: 'GALA/USD (OTC)', name: 'Gala / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 0.0215, volatility: 0.0007, pipDecimals: 5, flag: '🎮' },
  { symbol: 'MANA/USD (OTC)', name: 'Decentraland / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 0.3240, volatility: 0.0011, pipDecimals: 4, flag: '🌐' },
  { symbol: 'SAND/USD (OTC)', name: 'The Sandbox / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 0.3150, volatility: 0.0010, pipDecimals: 4, flag: '🏖️' },
  { symbol: 'IMX/USD (OTC)', name: 'Immutable / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 1.240, volatility: 0.004, pipDecimals: 3, flag: '⚡' },
  { symbol: 'RUNE/USD (OTC)', name: 'THORChain / US Dollar (OTC)', payout: 93, category: 'Crypto (OTC)', basePrice: 4.850, volatility: 0.016, pipDecimals: 3, flag: '⚡' },
  { symbol: 'KAS/USD (OTC)', name: 'Kaspa / US Dollar (OTC)', payout: 95, category: 'Crypto (OTC)', basePrice: 0.1245, volatility: 0.0004, pipDecimals: 4, flag: '👻' },
  { symbol: 'EGLD/USD (OTC)', name: 'MultiversX / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 28.50, volatility: 0.09, pipDecimals: 2, flag: '🛡️' },
  { symbol: 'STX/USD (OTC)', name: 'Stacks / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 1.780, volatility: 0.006, pipDecimals: 3, flag: '📚' },
  { symbol: 'AR/USD (OTC)', name: 'Arweave / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 17.40, volatility: 0.05, pipDecimals: 2, flag: '📜' },
  { symbol: 'CRV/USD (OTC)', name: 'Curve DAO / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 0.3420, volatility: 0.0012, pipDecimals: 4, flag: '🔄' },
  { symbol: 'SNX/USD (OTC)', name: 'Synthetix / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 1.480, volatility: 0.005, pipDecimals: 3, flag: '⚖️' },
  { symbol: 'COMP/USD (OTC)', name: 'Compound / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 48.20, volatility: 0.15, pipDecimals: 2, flag: '🏛️' },
  { symbol: 'MKR/USD (OTC)', name: 'Maker / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 1480.00, volatility: 4.50, pipDecimals: 2, flag: '⚒️' },
  { symbol: 'ZRO/USD (OTC)', name: 'LayerZero / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 4.120, volatility: 0.014, pipDecimals: 3, flag: '0️⃣' },
  { symbol: 'JUP/USD (OTC)', name: 'Jupiter / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 0.9850, volatility: 0.003, pipDecimals: 4, flag: '🪐' },
  { symbol: 'PYTH/USD (OTC)', name: 'Pyth Network / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 0.3640, volatility: 0.0011, pipDecimals: 4, flag: '🐍' },
  { symbol: 'W/USD (OTC)', name: 'Wormhole / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 0.2450, volatility: 0.0008, pipDecimals: 4, flag: '🕳️' },
  { symbol: 'NOT/USD (OTC)', name: 'Notcoin / US Dollar (OTC)', payout: 93, category: 'Crypto (OTC)', basePrice: 0.0084, volatility: 0.00003, pipDecimals: 5, flag: '🪙' },
  { symbol: 'TON/USD (OTC)', name: 'Toncoin / US Dollar (OTC)', payout: 94, category: 'Crypto (OTC)', basePrice: 5.240, volatility: 0.015, pipDecimals: 3, flag: '💎' },

  // ============================================================================
  // 3. COMMODITIES (OTC) — 50 Instruments (Payouts 80% - 95%)
  // ============================================================================
  { symbol: 'XAU/USD (OTC)', name: 'Gold Spot / US Dollar (OTC)', payout: 95, category: 'Commodities (OTC)', basePrice: 2735.60, volatility: 0.85, pipDecimals: 2, flag: '🥇' },
  { symbol: 'XAG/USD (OTC)', name: 'Silver Spot / US Dollar (OTC)', payout: 93, category: 'Commodities (OTC)', basePrice: 33.840, volatility: 0.045, pipDecimals: 3, flag: '🥈' },
  { symbol: 'WTI/USD (OTC)', name: 'WTI Crude Oil (OTC)', payout: 92, category: 'Commodities (OTC)', basePrice: 71.45, volatility: 0.14, pipDecimals: 2, flag: '🛢️' },
  { symbol: 'BRENT/USD (OTC)', name: 'Brent Crude Oil (OTC)', payout: 92, category: 'Commodities (OTC)', basePrice: 75.20, volatility: 0.15, pipDecimals: 2, flag: '⛽' },
  { symbol: 'NGAS/USD (OTC)', name: 'Natural Gas Henry Hub (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 2.548, volatility: 0.008, pipDecimals: 3, flag: '🔥' },
  { symbol: 'XPT/USD (OTC)', name: 'Platinum Spot / US Dollar (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 1028.40, volatility: 0.65, pipDecimals: 2, flag: '⚪' },
  { symbol: 'XPD/USD (OTC)', name: 'Palladium Spot / US Dollar (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 1165.80, volatility: 0.78, pipDecimals: 2, flag: '⚙️' },
  { symbol: 'HG/USD (OTC)', name: 'High-Grade Copper (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 4.385, volatility: 0.011, pipDecimals: 3, flag: '🧱' },
  { symbol: 'ALU/USD (OTC)', name: 'Aluminum Futures (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 2635.00, volatility: 1.25, pipDecimals: 2, flag: '🔩' },
  { symbol: 'NICKEL/USD (OTC)', name: 'Nickel LME (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 16280.00, volatility: 6.50, pipDecimals: 2, flag: '🪙' },
  { symbol: 'ZINC/USD (OTC)', name: 'Zinc Spot (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 3142.50, volatility: 1.40, pipDecimals: 2, flag: '⛓️' },
  { symbol: 'WHEAT/USD (OTC)', name: 'Chicago Wheat (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 572.40, volatility: 0.45, pipDecimals: 2, flag: '🌾' },
  { symbol: 'CORN/USD (OTC)', name: 'US Corn Futures (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 418.60, volatility: 0.35, pipDecimals: 2, flag: '🌽' },
  { symbol: 'SOY/USD (OTC)', name: 'US Soybeans (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 992.80, volatility: 0.60, pipDecimals: 2, flag: '🌱' },
  { symbol: 'COFFEE/USD (OTC)', name: 'Arabica Coffee (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 252.30, volatility: 0.32, pipDecimals: 2, flag: '☕' },
  { symbol: 'COCOA/USD (OTC)', name: 'ICE Cocoa (OTC)', payout: 93, category: 'Commodities (OTC)', basePrice: 6840.00, volatility: 4.20, pipDecimals: 2, flag: '🍫' },
  { symbol: 'SUGAR/USD (OTC)', name: 'Raw Sugar #11 (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 22.14, volatility: 0.04, pipDecimals: 2, flag: '🍬' },
  { symbol: 'COTTON/USD (OTC)', name: 'US Cotton #2 (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 70.85, volatility: 0.11, pipDecimals: 2, flag: '☁️' },
  { symbol: 'HOIL/USD (OTC)', name: 'NY Harbor Heating Oil (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 2.245, volatility: 0.006, pipDecimals: 3, flag: '🛢️' },
  { symbol: 'RBOB/USD (OTC)', name: 'RBOB Gasoline (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 2.064, volatility: 0.006, pipDecimals: 3, flag: '⛽' },
  { symbol: 'URA/USD (OTC)', name: 'Uranium Spot (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 82.40, volatility: 0.16, pipDecimals: 2, flag: '☢️' },
  { symbol: 'LITH/USD (OTC)', name: 'Battery Grade Lithium (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 10850.00, volatility: 5.20, pipDecimals: 2, flag: '🔋' },
  { symbol: 'COBALT/USD (OTC)', name: 'Cobalt LME (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 24300.00, volatility: 8.50, pipDecimals: 2, flag: '🧪' },
  { symbol: 'LUMBER/USD (OTC)', name: 'Random Length Lumber (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 542.00, volatility: 0.55, pipDecimals: 2, flag: '🪵' },
  { symbol: 'CATTLE/USD (OTC)', name: 'Live Cattle CME (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 188.40, volatility: 0.22, pipDecimals: 2, flag: '🥩' },
  { symbol: 'IRON/USD (OTC)', name: 'Iron Ore 62% Fe (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 104.80, volatility: 0.19, pipDecimals: 2, flag: '⛏️' },
  { symbol: 'ORANGE_JUICE (OTC)', name: 'Frozen Concentrated Orange Juice (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 385.00, volatility: 0.95, pipDecimals: 2, flag: '🍊' },
  { symbol: 'OATS/USD (OTC)', name: 'Chicago Oats Futures (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 345.20, volatility: 0.38, pipDecimals: 2, flag: '🌾' },
  { symbol: 'RICE/USD (OTC)', name: 'Rough Rice Futures (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 15.42, volatility: 0.03, pipDecimals: 2, flag: '🍚' },
  { symbol: 'RUBBER/USD (OTC)', name: 'RSS3 Rubber (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 178.50, volatility: 0.35, pipDecimals: 2, flag: '🚗' },
  { symbol: 'LEAD/USD (OTC)', name: 'Lead LME (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 2050.00, volatility: 0.85, pipDecimals: 2, flag: '🔋' },
  { symbol: 'TIN/USD (OTC)', name: 'Tin LME (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 28900.00, volatility: 9.50, pipDecimals: 2, flag: '🥫' },
  { symbol: 'MOLY/USD (OTC)', name: 'Molybdenum Oxide (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 21.40, volatility: 0.05, pipDecimals: 2, flag: '⚙️' },
  { symbol: 'COAL/USD (OTC)', name: 'Newcastle Thermal Coal (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 138.50, volatility: 0.40, pipDecimals: 2, flag: '⬛' },
  { symbol: 'LNG/USD (OTC)', name: 'Liquefied Natural Gas (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 12.80, volatility: 0.03, pipDecimals: 2, flag: '❄️' },
  { symbol: 'STEEL_HRC (OTC)', name: 'Hot-Rolled Coil Steel (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 710.00, volatility: 1.80, pipDecimals: 2, flag: '🏗️' },
  { symbol: 'SILICON/USD (OTC)', name: 'Silicon Metal (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 1650.00, volatility: 3.20, pipDecimals: 2, flag: '💻' },
  { symbol: 'METHANOL (OTC)', name: 'Methanol Futures (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 310.00, volatility: 0.75, pipDecimals: 2, flag: '🧪' },
  { symbol: 'ETHANOL/USD (OTC)', name: 'CBOT Ethanol (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 1.84, volatility: 0.005, pipDecimals: 3, flag: '🌽' },
  { symbol: 'PALM_OIL (OTC)', name: 'Malaysian Palm Oil (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 4250.00, volatility: 12.00, pipDecimals: 2, flag: '🌴' },
  { symbol: 'PORK/USD (OTC)', name: 'Lean Hogs CME (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 84.50, volatility: 0.22, pipDecimals: 2, flag: '🥓' },
  { symbol: 'BUTTER/USD (OTC)', name: 'CME Butter (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 285.00, volatility: 0.70, pipDecimals: 2, flag: '🧈' },
  { symbol: 'MILK/USD (OTC)', name: 'Class III Milk CME (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 19.40, volatility: 0.04, pipDecimals: 2, flag: '🥛' },
  { symbol: 'CHEDDAR (OTC)', name: 'CME Cheddar Cheese (OTC)', payout: 85, category: 'Commodities (OTC)', basePrice: 182.00, volatility: 0.45, pipDecimals: 2, flag: '🧀' },
  { symbol: 'TIMBER/USD (OTC)', name: 'Softwood Pulp (OTC)', payout: 84, category: 'Commodities (OTC)', basePrice: 890.00, volatility: 2.10, pipDecimals: 2, flag: '🌲' },
  { symbol: 'GRAIN/USD (OTC)', name: 'Sorghum Futures (OTC)', payout: 84, category: 'Commodities (OTC)', basePrice: 410.00, volatility: 0.90, pipDecimals: 2, flag: '🌾' },
  { symbol: 'CASSAVA (OTC)', name: 'Cassava Starch (OTC)', payout: 83, category: 'Commodities (OTC)', basePrice: 520.00, volatility: 1.10, pipDecimals: 2, flag: '🥔' },
  { symbol: 'FISH/USD (OTC)', name: 'Fishmeal Futures (OTC)', payout: 83, category: 'Commodities (OTC)', basePrice: 1450.00, volatility: 3.50, pipDecimals: 2, flag: '🐟' },
  { symbol: 'WINE/USD (OTC)', name: 'Bordeaux Index (OTC)', payout: 82, category: 'Commodities (OTC)', basePrice: 13500.00, volatility: 25.00, pipDecimals: 2, flag: '🍷' },
  { symbol: 'TEA/USD (OTC)', name: 'Mombasa Tea Auction (OTC)', payout: 82, category: 'Commodities (OTC)', basePrice: 240.00, volatility: 0.60, pipDecimals: 2, flag: '🍵' },

  // ============================================================================
  // 4. INDICES (OTC) — 48 Global Stock Indices (Payouts 82% - 95%)
  // ============================================================================
  { symbol: 'S&P 500 (OTC)', name: 'S&P 500 Index (OTC)', payout: 95, category: 'Indices (OTC)', basePrice: 5840.20, volatility: 4.50, pipDecimals: 2, flag: '🇺🇸' },
  { symbol: 'NASDAQ (OTC)', name: 'NASDAQ 100 Index (OTC)', payout: 96, category: 'Indices (OTC)', basePrice: 20250.00, volatility: 16.50, pipDecimals: 2, flag: '🇺🇸' },
  { symbol: 'DOW JONES (OTC)', name: 'Wall Street 30 Index (OTC)', payout: 94, category: 'Indices (OTC)', basePrice: 43250.00, volatility: 28.00, pipDecimals: 2, flag: '🇺🇸' },
  { symbol: 'DAX 40 (OTC)', name: 'Germany 40 Index (OTC)', payout: 94, category: 'Indices (OTC)', basePrice: 19480.00, volatility: 14.20, pipDecimals: 2, flag: '🇩🇪' },
  { symbol: 'FTSE 100 (OTC)', name: 'UK 100 Index (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 8250.00, volatility: 6.20, pipDecimals: 2, flag: '🇬🇧' },
  { symbol: 'CAC 40 (OTC)', name: 'France 40 Index (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 7520.00, volatility: 5.80, pipDecimals: 2, flag: '🇫🇷' },
  { symbol: 'NIKKEI 225 (OTC)', name: 'Japan 225 Index (OTC)', payout: 93, category: 'Indices (OTC)', basePrice: 38950.00, volatility: 32.00, pipDecimals: 2, flag: '🇯🇵' },
  { symbol: 'HANG SENG (OTC)', name: 'Hong Kong 50 Index (OTC)', payout: 94, category: 'Indices (OTC)', basePrice: 20580.00, volatility: 24.50, pipDecimals: 2, flag: '🇭🇰' },
  { symbol: 'EURO STOXX 50 (OTC)', name: 'Euro Stoxx 50 (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 4950.00, volatility: 3.80, pipDecimals: 2, flag: '🇪🇺' },
  { symbol: 'ASX 200 (OTC)', name: 'Australia 200 Index (OTC)', payout: 90, category: 'Indices (OTC)', basePrice: 8240.00, volatility: 5.50, pipDecimals: 2, flag: '🇦🇺' },
  { symbol: 'NIFTY 50 (OTC)', name: 'India 50 Index (OTC)', payout: 93, category: 'Indices (OTC)', basePrice: 24850.00, volatility: 18.20, pipDecimals: 2, flag: '🇮🇳' },
  { symbol: 'IBEX 35 (OTC)', name: 'Spain 35 Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 11850.00, volatility: 9.50, pipDecimals: 2, flag: '🇪🇸' },
  { symbol: 'FTSE MIB (OTC)', name: 'Italy 40 Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 34800.00, volatility: 26.00, pipDecimals: 2, flag: '🇮🇹' },
  { symbol: 'SMI (OTC)', name: 'Switzerland 20 Index (OTC)', payout: 90, category: 'Indices (OTC)', basePrice: 12240.00, volatility: 8.40, pipDecimals: 2, flag: '🇨🇭' },
  { symbol: 'AEX (OTC)', name: 'Netherlands 25 Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 910.40, volatility: 0.85, pipDecimals: 2, flag: '🇳🇱' },
  { symbol: 'OMX 30 (OTC)', name: 'Sweden 30 Index (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 2580.00, volatility: 2.20, pipDecimals: 2, flag: '🇸🇪' },
  { symbol: 'WIG 20 (OTC)', name: 'Poland 20 Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 2320.00, volatility: 2.10, pipDecimals: 2, flag: '🇵🇱' },
  { symbol: 'BUX (OTC)', name: 'Hungary 100 Index (OTC)', payout: 86, category: 'Indices (OTC)', basePrice: 74500.00, volatility: 65.00, pipDecimals: 2, flag: '🇭🇺' },
  { symbol: 'PX (OTC)', name: 'Prague Stock Index (OTC)', payout: 85, category: 'Indices (OTC)', basePrice: 1620.00, volatility: 1.50, pipDecimals: 2, flag: '🇨🇿' },
  { symbol: 'BIST 100 (OTC)', name: 'Turkey 100 Index (OTC)', payout: 91, category: 'Indices (OTC)', basePrice: 9240.00, volatility: 12.00, pipDecimals: 2, flag: '🇹🇷' },
  { symbol: 'TA 35 (OTC)', name: 'Tel Aviv 35 Index (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 2080.00, volatility: 2.40, pipDecimals: 2, flag: '🇮🇱' },
  { symbol: 'JSE TOP 40 (OTC)', name: 'South Africa 40 Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 78500.00, volatility: 55.00, pipDecimals: 2, flag: '🇿🇦' },
  { symbol: 'BOVESPA (OTC)', name: 'Brazil Bovespa Index (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 131500.00, volatility: 95.00, pipDecimals: 2, flag: '🇧🇷' },
  { symbol: 'MERVAL (OTC)', name: 'Argentina Merval Index (OTC)', payout: 93, category: 'Indices (OTC)', basePrice: 1850000.00, volatility: 1500.00, pipDecimals: 2, flag: '🇦🇷' },
  { symbol: 'IPC (OTC)', name: 'Mexico IPC Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 52400.00, volatility: 42.00, pipDecimals: 2, flag: '🇲🇽' },
  { symbol: 'SSE COMPOSITE (OTC)', name: 'Shanghai Composite (OTC)', payout: 91, category: 'Indices (OTC)', basePrice: 3280.00, volatility: 3.50, pipDecimals: 2, flag: '🇨🇳' },
  { symbol: 'CSI 300 (OTC)', name: 'CSI 300 China (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 3950.00, volatility: 4.20, pipDecimals: 2, flag: '🇨🇳' },
  { symbol: 'KOSPI (OTC)', name: 'South Korea Composite (OTC)', payout: 91, category: 'Indices (OTC)', basePrice: 2580.00, volatility: 2.80, pipDecimals: 2, flag: '🇰🇷' },
  { symbol: 'TWSE (OTC)', name: 'Taiwan Weighted Index (OTC)', payout: 92, category: 'Indices (OTC)', basePrice: 23250.00, volatility: 19.00, pipDecimals: 2, flag: '🇹🇼' },
  { symbol: 'STI (OTC)', name: 'Singapore Straits Times (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 3580.00, volatility: 3.10, pipDecimals: 2, flag: '🇸🇬' },
  { symbol: 'KLCI (OTC)', name: 'Malaysia KLCI Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 1620.00, volatility: 1.60, pipDecimals: 2, flag: '🇲🇾' },
  { symbol: 'SET (OTC)', name: 'Thailand SET Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 1475.00, volatility: 1.40, pipDecimals: 2, flag: '🇹🇭' },
  { symbol: 'PSEI (OTC)', name: 'Philippines PSEi Index (OTC)', payout: 86, category: 'Indices (OTC)', basePrice: 7150.00, volatility: 6.80, pipDecimals: 2, flag: '🇵🇭' },
  { symbol: 'IDX (OTC)', name: 'Indonesia Jakarta Composite (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 7650.00, volatility: 7.20, pipDecimals: 2, flag: '🇮🇩' },
  { symbol: 'VN-INDEX (OTC)', name: 'Vietnam Ho Chi Minh Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 1285.00, volatility: 1.80, pipDecimals: 2, flag: '🇻🇳' },
  { symbol: 'NZX 50 (OTC)', name: 'New Zealand 50 Index (OTC)', payout: 86, category: 'Indices (OTC)', basePrice: 12450.00, volatility: 9.50, pipDecimals: 2, flag: '🇳🇿' },
  { symbol: 'CSE (OTC)', name: 'Sri Lanka All Share Index (OTC)', payout: 85, category: 'Indices (OTC)', basePrice: 11850.00, volatility: 12.00, pipDecimals: 2, flag: '🇱🇰' },
  { symbol: 'DFMGI (OTC)', name: 'Dubai Financial Market Index (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 4450.00, volatility: 4.20, pipDecimals: 2, flag: '🇦🇪' },
  { symbol: 'ADX (OTC)', name: 'Abu Dhabi Securities Index (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 9350.00, volatility: 8.10, pipDecimals: 2, flag: '🇦🇪' },
  { symbol: 'QE (OTC)', name: 'Qatar Exchange Index (OTC)', payout: 86, category: 'Indices (OTC)', basePrice: 10250.00, volatility: 9.20, pipDecimals: 2, flag: '🇶🇦' },
  { symbol: 'TASI (OTC)', name: 'Saudi Arabia TADAWUL Index (OTC)', payout: 90, category: 'Indices (OTC)', basePrice: 11950.00, volatility: 11.00, pipDecimals: 2, flag: '🇸🇦' },
  { symbol: 'EGX 30 (OTC)', name: 'Egypt EGX 30 Index (OTC)', payout: 88, category: 'Indices (OTC)', basePrice: 30850.00, volatility: 28.00, pipDecimals: 2, flag: '🇪🇬' },
  { symbol: 'KSE 100 (OTC)', name: 'Pakistan KSE 100 Index (OTC)', payout: 89, category: 'Indices (OTC)', basePrice: 85400.00, volatility: 75.00, pipDecimals: 2, flag: '🇵🇰' },
  { symbol: 'IPSA (OTC)', name: 'Chile IPSA Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 6540.00, volatility: 5.80, pipDecimals: 2, flag: '🇨🇱' },
  { symbol: 'COLCAP (OTC)', name: 'Colombia COLCAP Index (OTC)', payout: 86, category: 'Indices (OTC)', basePrice: 1320.00, volatility: 1.50, pipDecimals: 2, flag: '🇨🇴' },
  { symbol: 'ASE (OTC)', name: 'Athens General Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 1425.00, volatility: 1.60, pipDecimals: 2, flag: '🇬🇷' },
  { symbol: 'WSE (OTC)', name: 'Warsaw General Index (OTC)', payout: 87, category: 'Indices (OTC)', basePrice: 68400.00, volatility: 55.00, pipDecimals: 2, flag: '🇵🇱' },
  { symbol: 'MSCI WORLD (OTC)', name: 'MSCI World Index (OTC)', payout: 91, category: 'Indices (OTC)', basePrice: 3580.00, volatility: 2.80, pipDecimals: 2, flag: '🌐' },

  // ============================================================================
  // 5. STOCKS (OTC) — 50 Mega-Cap Global Equities (Payouts 85% - 97%)
  // ============================================================================
  { symbol: 'TSLA (OTC)', name: 'Tesla Inc. (OTC)', payout: 97, category: 'Stocks (OTC)', basePrice: 262.45, volatility: 0.48, pipDecimals: 2, flag: '🚗' },
  { symbol: 'AAPL (OTC)', name: 'Apple Inc. (OTC)', payout: 96, category: 'Stocks (OTC)', basePrice: 231.80, volatility: 0.34, pipDecimals: 2, flag: '🍎' },
  { symbol: 'NVDA (OTC)', name: 'NVIDIA Corporation (OTC)', payout: 97, category: 'Stocks (OTC)', basePrice: 141.60, volatility: 0.32, pipDecimals: 2, flag: '🟢' },
  { symbol: 'MSFT (OTC)', name: 'Microsoft Corporation (OTC)', payout: 95, category: 'Stocks (OTC)', basePrice: 428.50, volatility: 0.52, pipDecimals: 2, flag: '🪟' },
  { symbol: 'AMZN (OTC)', name: 'Amazon.com Inc. (OTC)', payout: 95, category: 'Stocks (OTC)', basePrice: 189.70, volatility: 0.31, pipDecimals: 2, flag: '📦' },
  { symbol: 'GOOGL (OTC)', name: 'Alphabet Inc. (OTC)', payout: 94, category: 'Stocks (OTC)', basePrice: 166.90, volatility: 0.28, pipDecimals: 2, flag: '🔍' },
  { symbol: 'META (OTC)', name: 'Meta Platforms Inc. (OTC)', payout: 96, category: 'Stocks (OTC)', basePrice: 578.40, volatility: 0.76, pipDecimals: 2, flag: '♾️' },
  { symbol: 'NFLX (OTC)', name: 'Netflix Inc. (OTC)', payout: 94, category: 'Stocks (OTC)', basePrice: 754.20, volatility: 0.92, pipDecimals: 2, flag: '🎬' },
  { symbol: 'AMD (OTC)', name: 'Advanced Micro Devices (OTC)', payout: 95, category: 'Stocks (OTC)', basePrice: 156.40, volatility: 0.34, pipDecimals: 2, flag: '💻' },
  { symbol: 'INTC (OTC)', name: 'Intel Corporation (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 22.85, volatility: 0.06, pipDecimals: 2, flag: '🔹' },
  { symbol: 'COIN (OTC)', name: 'Coinbase Global Inc. (OTC)', payout: 97, category: 'Stocks (OTC)', basePrice: 214.60, volatility: 0.54, pipDecimals: 2, flag: '🪙' },
  { symbol: 'MSTR (OTC)', name: 'MicroStrategy Inc. (OTC)', payout: 97, category: 'Stocks (OTC)', basePrice: 238.90, volatility: 0.62, pipDecimals: 2, flag: '📊' },
  { symbol: 'JPM (OTC)', name: 'JPMorgan Chase & Co. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 225.40, volatility: 0.30, pipDecimals: 2, flag: '🏦' },
  { symbol: 'V (OTC)', name: 'Visa Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 284.70, volatility: 0.34, pipDecimals: 2, flag: '💳' },
  { symbol: 'MA (OTC)', name: 'Mastercard Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 506.30, volatility: 0.58, pipDecimals: 2, flag: '💳' },
  { symbol: 'BA (OTC)', name: 'Boeing Company (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 155.20, volatility: 0.32, pipDecimals: 2, flag: '✈️' },
  { symbol: 'DIS (OTC)', name: 'Walt Disney Company (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 96.80, volatility: 0.18, pipDecimals: 2, flag: '🏰' },
  { symbol: 'PYPL (OTC)', name: 'PayPal Holdings Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 81.40, volatility: 0.17, pipDecimals: 2, flag: '💸' },
  { symbol: 'UBER (OTC)', name: 'Uber Technologies Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 78.60, volatility: 0.18, pipDecimals: 2, flag: '🚕' },
  { symbol: 'SHOP (OTC)', name: 'Shopify Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 83.20, volatility: 0.21, pipDecimals: 2, flag: '🛍️' },
  { symbol: 'BABA (OTC)', name: 'Alibaba Group Holding (OTC)', payout: 94, category: 'Stocks (OTC)', basePrice: 98.40, volatility: 0.24, pipDecimals: 2, flag: '🏮' },
  { symbol: 'PLTR (OTC)', name: 'Palantir Technologies (OTC)', payout: 96, category: 'Stocks (OTC)', basePrice: 43.80, volatility: 0.14, pipDecimals: 2, flag: '🛰️' },
  { symbol: 'SNOW (OTC)', name: 'Snowflake Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 118.50, volatility: 0.26, pipDecimals: 2, flag: '❄️' },
  { symbol: 'CRM (OTC)', name: 'Salesforce Inc. (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 291.40, volatility: 0.38, pipDecimals: 2, flag: '☁️' },
  { symbol: 'XOM (OTC)', name: 'Exxon Mobil Corporation (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 120.60, volatility: 0.22, pipDecimals: 2, flag: '🛢️' },
  { symbol: 'BRK.B (OTC)', name: 'Berkshire Hathaway Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 454.80, volatility: 0.45, pipDecimals: 2, flag: '🏛️' },
  { symbol: 'QCOM (OTC)', name: 'Qualcomm Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 172.50, volatility: 0.35, pipDecimals: 2, flag: '📶' },
  { symbol: 'ORCL (OTC)', name: 'Oracle Corporation (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 175.20, volatility: 0.38, pipDecimals: 2, flag: '🗄️' },
  { symbol: 'CSCO (OTC)', name: 'Cisco Systems Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 55.40, volatility: 0.12, pipDecimals: 2, flag: '🌐' },
  { symbol: 'IBM (OTC)', name: 'International Business Machines (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 228.60, volatility: 0.42, pipDecimals: 2, flag: '🖥️' },
  { symbol: 'ADBE (OTC)', name: 'Adobe Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 495.00, volatility: 0.85, pipDecimals: 2, flag: '🎨' },
  { symbol: 'TXN (OTC)', name: 'Texas Instruments Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 198.40, volatility: 0.34, pipDecimals: 2, flag: '⚡' },
  { symbol: 'SBUX (OTC)', name: 'Starbucks Corporation (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 98.20, volatility: 0.18, pipDecimals: 2, flag: '☕' },
  { symbol: 'NKE (OTC)', name: 'NIKE Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 84.50, volatility: 0.19, pipDecimals: 2, flag: '👟' },
  { symbol: 'PFE (OTC)', name: 'Pfizer Inc. (OTC)', payout: 88, category: 'Stocks (OTC)', basePrice: 28.60, volatility: 0.08, pipDecimals: 2, flag: '💊' },
  { symbol: 'JNJ (OTC)', name: 'Johnson & Johnson (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 162.40, volatility: 0.22, pipDecimals: 2, flag: '🩹' },
  { symbol: 'UNH (OTC)', name: 'UnitedHealth Group Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 585.00, volatility: 0.95, pipDecimals: 2, flag: '🏥' },
  { symbol: 'WMT (OTC)', name: 'Walmart Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 81.20, volatility: 0.15, pipDecimals: 2, flag: '🛒' },
  { symbol: 'COST (OTC)', name: 'Costco Wholesale Corp. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 915.00, volatility: 1.40, pipDecimals: 2, flag: '📦' },
  { symbol: 'HD (OTC)', name: 'Home Depot Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 398.50, volatility: 0.65, pipDecimals: 2, flag: '🔨' },
  { symbol: 'BAC (OTC)', name: 'Bank of America Corp. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 42.80, volatility: 0.11, pipDecimals: 2, flag: '🏦' },
  { symbol: 'GS (OTC)', name: 'Goldman Sachs Group (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 524.00, volatility: 0.92, pipDecimals: 2, flag: '💰' },
  { symbol: 'MS (OTC)', name: 'Morgan Stanley (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 115.80, volatility: 0.25, pipDecimals: 2, flag: '📈' },
  { symbol: 'C (OTC)', name: 'Citigroup Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 64.20, volatility: 0.18, pipDecimals: 2, flag: '🏙️' },
  { symbol: 'CAT (OTC)', name: 'Caterpillar Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 384.50, volatility: 0.72, pipDecimals: 2, flag: '🚜' },
  { symbol: 'GE (OTC)', name: 'General Electric Company (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 184.20, volatility: 0.35, pipDecimals: 2, flag: '⚙️' },
  { symbol: 'HON (OTC)', name: 'Honeywell International (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 204.60, volatility: 0.32, pipDecimals: 2, flag: '🏭' },
  { symbol: 'MMM (OTC)', name: '3M Company (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 132.80, volatility: 0.26, pipDecimals: 2, flag: '📐' },
  { symbol: 'LMT (OTC)', name: 'Lockheed Martin Corp. (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 535.00, volatility: 0.88, pipDecimals: 2, flag: '🚀' },
  { symbol: 'RTX (OTC)', name: 'RTX Corporation (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 121.40, volatility: 0.24, pipDecimals: 2, flag: '🛰️' },
];

/**
 * Computes a realistic live fluctuating payout percentage around the asset's base payout (79% - 97%).
 */
export function getLivePayoutPercentage(asset: AssetInfo, tickSeed: number = Math.floor(Date.now() / 3000)): number {
  let hash = 0;
  for (let i = 0; i < asset.symbol.length; i++) {
    hash = (hash * 31 + asset.symbol.charCodeAt(i)) | 0;
  }
  const wave = Math.sin(tickSeed * 0.7 + hash);
  const delta = Math.round(wave * 2); // -2% to +2% live institutional liquidity fluctuation
  return Math.max(79, Math.min(97, asset.payout + delta));
}

export function getFlagForCountry(countryName: string): string {
  const found = SUPPORTED_COUNTRIES.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
  return found ? found.flag : '🌐';
}

export const BUILTIN_AVATARS: string[] = [
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff8800"/><stop offset="100%" stop-color="#ffaa00"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#141414"/><circle cx="60" cy="44" r="22" fill="url(#g1)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g1)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#121816"/><circle cx="60" cy="44" r="22" fill="url(#g2)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g2)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#101720"/><circle cx="60" cy="44" r="22" fill="url(#g3)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g3)"/></svg>`
  )}`,
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a855f7"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="120" height="120" rx="28" fill="#18121e"/><circle cx="60" cy="44" r="22" fill="url(#g4)"/><path d="M24 104c4-22 22-34 36-34s32 12 36 34" fill="url(#g4)"/></svg>`
  )}`,
];

export const SUPPORTED_COUNTRIES: Array<{ name: string; code: string; flag: string }> = [
  { name: 'United States', code: 'US', flag: '🇺🇸' },
  { name: 'Sri Lanka', code: 'LK', flag: '🇱🇰' },
  { name: 'United Kingdom', code: 'GB', flag: '🇬🇧' },
  { name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪' },
  { name: 'India', code: 'IN', flag: '🇮🇳' },
  { name: 'Malaysia', code: 'MY', flag: '🇲🇾' },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬' },
  { name: 'Australia', code: 'AU', flag: '🇦🇺' },
  { name: 'Canada', code: 'CA', flag: '🇨🇦' },
  { name: 'Germany', code: 'DE', flag: '🇩🇪' },
  { name: 'France', code: 'FR', flag: '🇫🇷' },
  { name: 'Japan', code: 'JP', flag: '🇯🇵' },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷' },
];

const STORAGE_KEYS = {
  PROFILE: 'bft_profile_v1',
  PROFILES_BY_EMAIL: 'bft_profiles_by_email_v1',
  ACCOUNTS: 'bft_accounts_v1',
  ACTIVE_ACCOUNT: 'bft_active_account_v1',
  WITHDRAWALS: 'bft_withdrawals_v1',
  TRADES: 'bft_trades_v1',
  AFFILIATE_USERS: 'bft_affiliate_users_v1',
  AFFILIATE_REFERRALS: 'bft_affiliate_referrals_v1',
  AFFILIATE_PAYOUTS: 'bft_affiliate_payouts_v1',
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {
    id: 'trader_' + Math.floor(Math.random() * 900000 + 100000),
    email: 'trader@bft.io',
    fullName: 'Elite Trader',
    avatarUrl: BUILTIN_AVATARS[0],
    telegramHandle: '@elitetrader',
    country: 'United States',
    kycStatus: 'unverified',
    kycDocumentType: 'Passport',
    profileLocked: false,
    twoFactorEnabled: false,
    activeAccountId: '',
    isLoggedIn: false,
  };
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    if (profile.email) {
      const emailKey = profile.email.toLowerCase().trim();
      const mapRaw = localStorage.getItem(STORAGE_KEYS.PROFILES_BY_EMAIL);
      const map: Record<string, UserProfile> = mapRaw ? JSON.parse(mapRaw) : {};
      map[emailKey] = profile;
      localStorage.setItem(STORAGE_KEYS.PROFILES_BY_EMAIL, JSON.stringify(map));
    }
  } catch (e) {
    console.error('Failed to save profile', e);
  }
}

export function clearAuthSession(): void {
  try {
    const current = loadProfile();
    const cleared: UserProfile = {
      ...current,
      isLoggedIn: false,
    };
    saveProfile(cleared);
  } catch {
    // fallback
  }
}

export function loadOrCreateUserProfileByEmail(params: {
  email: string;
  fullName: string;
  userId?: string;
  referralCode?: string;
  referredBy?: string;
  kycStatus?: 'verified' | 'pending' | 'unverified';
  kycDocType?: string;
  kycDocumentNumber?: string;
  kycFrontDocumentUrl?: string;
  kycBackDocumentUrl?: string;
  kycDocumentFileName?: string;
  kycBackDocumentFileName?: string;
  kycSubmittedAt?: string;
  address?: string;
  dateOfBirth?: string;
  country?: string;
  telegramHandle?: string;
  avatarUrl?: string;
  rememberMe?: boolean;
  profileLocked?: boolean;
  isNewRegistration?: boolean;
}): UserProfile {
  const emailKey = params.email.toLowerCase().trim();
  try {
    if (!params.isNewRegistration) {
      const mapRaw = localStorage.getItem(STORAGE_KEYS.PROFILES_BY_EMAIL);
      if (mapRaw) {
        const map: Record<string, UserProfile> = JSON.parse(mapRaw);
        const existing = map[emailKey];
        if (existing) {
          const updated: UserProfile = {
            ...existing,
            id: params.userId || existing.id,
            fullName: params.fullName || existing.fullName,
            referralCode: params.referralCode || existing.referralCode,
            referredBy: params.referredBy ?? existing.referredBy,
            kycStatus:
              params.kycStatus === 'verified' || existing.kycStatus === 'verified'
                ? 'verified'
                : params.kycStatus === 'pending' || existing.kycStatus === 'pending'
                ? 'pending'
                : 'unverified',
            kycDocumentType: params.kycDocType || existing.kycDocumentType || 'ID Card',
            kycDocumentNumber: params.kycDocumentNumber || existing.kycDocumentNumber,
            kycFrontDocumentUrl: params.kycFrontDocumentUrl || existing.kycFrontDocumentUrl,
            kycBackDocumentUrl: params.kycBackDocumentUrl || existing.kycBackDocumentUrl,
            kycDocumentFileName: params.kycDocumentFileName || existing.kycDocumentFileName,
            kycBackDocumentFileName: params.kycBackDocumentFileName || existing.kycBackDocumentFileName,
            kycSubmittedAt: params.kycSubmittedAt || existing.kycSubmittedAt,
            profileLocked: Boolean(
              params.profileLocked ||
                existing.profileLocked ||
                params.kycStatus === 'verified' ||
                params.kycStatus === 'pending'
            ),
            address: params.address || existing.address || '',
            dateOfBirth: params.dateOfBirth || existing.dateOfBirth || '',
            country: params.country || existing.country || 'United States',
            telegramHandle: params.telegramHandle || existing.telegramHandle || '',
            avatarUrl: params.avatarUrl || existing.avatarUrl || BUILTIN_AVATARS[0],
            isLoggedIn: true,
            rememberMe: params.rememberMe,
          };
          saveProfile(updated);
          return updated;
        }
      }
    }
  } catch {
    // fallback to creating fresh profile
  }

  const freshProfile: UserProfile = {
    id: params.userId || 'trader_' + Math.floor(Math.random() * 900000 + 100000),
    email: params.email.trim(),
    fullName: params.fullName.trim(),
    address: params.address || '',
    dateOfBirth: params.dateOfBirth || '',
    profileLocked: Boolean(
      params.profileLocked || params.kycStatus === 'verified' || params.kycStatus === 'pending'
    ),
    country: params.country || 'United States',
    avatarUrl: params.avatarUrl || BUILTIN_AVATARS[0],
    telegramHandle: params.telegramHandle || '',
    kycStatus:
      params.kycStatus === 'verified'
        ? 'verified'
        : params.kycStatus === 'pending'
        ? 'pending'
        : 'unverified',
    kycDocumentType: params.kycDocType || 'ID Card',
    kycDocumentNumber: params.kycDocumentNumber,
    kycFrontDocumentUrl: params.kycFrontDocumentUrl,
    kycBackDocumentUrl: params.kycBackDocumentUrl,
    kycDocumentFileName: params.kycDocumentFileName,
    kycBackDocumentFileName: params.kycBackDocumentFileName,
    kycSubmittedAt: params.kycSubmittedAt,
    twoFactorEnabled: false,
    activeAccountId: '',
    referralCode: params.referralCode,
    referredBy: params.referredBy,
    isLoggedIn: true,
    rememberMe: params.rememberMe,
  };
  saveProfile(freshProfile);
  return freshProfile;
}

export function loadAccounts(): TradingAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (raw) {
      const parsed: TradingAccount[] = JSON.parse(raw).map((a: TradingAccount) =>
        a.tier === 'instant'
          ? { ...a, dailyLossLimitPercent: 6, maxOverallLossPercent: 12 }
          : a
      );
      return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

export function saveAccounts(accounts: TradingAccount[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save accounts', e);
  }
}

export function loadActiveAccountId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.ACTIVE_ACCOUNT);
    if (id) return id;
  } catch {
    // fallback
  }
  return '';
}

export function saveActiveAccountId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_ACCOUNT, id);
  } catch (e) {
    console.error('Failed to save active account id', e);
  }
}

export function loadWithdrawals(): WithdrawalRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WITHDRAWALS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveWithdrawals(withdrawals: WithdrawalRequest[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WITHDRAWALS, JSON.stringify(withdrawals));
  } catch (e) {
    console.error('Failed to save withdrawals', e);
  }
}

export function loadTrades(): BinaryTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRADES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function saveTrades(trades: BinaryTrade[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRADES, JSON.stringify(trades));
  } catch (e) {
    console.error('Failed to save trades', e);
  }
}
