import { TradingAccount, UserProfile, WithdrawalRequest, BinaryTrade, AssetInfo } from '../types';

export const DEFAULT_ASSETS: AssetInfo[] = [
  // ============================================================================
  // 1. FOREX (OTC) — 26 OTC Currency Pairs
  // ============================================================================
  { symbol: 'EUR/USD (OTC)', name: 'Euro / US Dollar (OTC)', payout: 93, category: 'Forex (OTC)', basePrice: 1.08425, volatility: 0.00015, pipDecimals: 5, flag: '🇪🇺/🇺🇸' },
  { symbol: 'GBP/JPY (OTC)', name: 'British Pound / Japanese Yen (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 194.280, volatility: 0.045, pipDecimals: 3, flag: '🇬🇧/🇯🇵' },
  { symbol: 'GBP/USD (OTC)', name: 'British Pound / US Dollar (OTC)', payout: 92, category: 'Forex (OTC)', basePrice: 1.29840, volatility: 0.00020, pipDecimals: 5, flag: '🇬🇧/🇺🇸' },
  { symbol: 'USD/JPY (OTC)', name: 'US Dollar / Japanese Yen (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 152.350, volatility: 0.040, pipDecimals: 3, flag: '🇺🇸/🇯🇵' },
  { symbol: 'AUD/CAD (OTC)', name: 'Australian Dollar / Canadian Dollar (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 0.89420, volatility: 0.00018, pipDecimals: 5, flag: '🇦🇺/🇨🇦' },
  { symbol: 'AUD/CHF (OTC)', name: 'Australian Dollar / Swiss Franc (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 0.57410, volatility: 0.00014, pipDecimals: 5, flag: '🇦🇺/🇨🇭' },
  { symbol: 'NZD/USD (OTC)', name: 'New Zealand Dollar / US Dollar (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 0.59820, volatility: 0.00016, pipDecimals: 5, flag: '🇳🇿/🇺🇸' },
  { symbol: 'EUR/JPY (OTC)', name: 'Euro / Japanese Yen (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 165.180, volatility: 0.042, pipDecimals: 3, flag: '🇪🇺/🇯🇵' },
  { symbol: 'EUR/GBP (OTC)', name: 'Euro / British Pound (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 0.83510, volatility: 0.00012, pipDecimals: 5, flag: '🇪🇺/🇬🇧' },
  { symbol: 'USD/CAD (OTC)', name: 'US Dollar / Canadian Dollar (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 1.38450, volatility: 0.00017, pipDecimals: 5, flag: '🇺🇸/🇨🇦' },
  { symbol: 'USD/CHF (OTC)', name: 'US Dollar / Swiss Franc (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 0.86540, volatility: 0.00015, pipDecimals: 5, flag: '🇺🇸/🇨🇭' },
  { symbol: 'AUD/USD (OTC)', name: 'Australian Dollar / US Dollar (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 0.65890, volatility: 0.00016, pipDecimals: 5, flag: '🇦🇺/🇺🇸' },
  { symbol: 'AUD/JPY (OTC)', name: 'Australian Dollar / Japanese Yen (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 100.380, volatility: 0.036, pipDecimals: 3, flag: '🇦🇺/🇯🇵' },
  { symbol: 'CAD/JPY (OTC)', name: 'Canadian Dollar / Japanese Yen (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 110.040, volatility: 0.035, pipDecimals: 3, flag: '🇨🇦/🇯🇵' },
  { symbol: 'CHF/JPY (OTC)', name: 'Swiss Franc / Japanese Yen (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 176.050, volatility: 0.044, pipDecimals: 3, flag: '🇨🇭/🇯🇵' },
  { symbol: 'EUR/AUD (OTC)', name: 'Euro / Australian Dollar (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 1.64550, volatility: 0.00022, pipDecimals: 5, flag: '🇪🇺/🇦🇺' },
  { symbol: 'EUR/CAD (OTC)', name: 'Euro / Canadian Dollar (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 1.50120, volatility: 0.00019, pipDecimals: 5, flag: '🇪🇺/🇨🇦' },
  { symbol: 'EUR/CHF (OTC)', name: 'Euro / Swiss Franc (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 0.93830, volatility: 0.00013, pipDecimals: 5, flag: '🇪🇺/🇨🇭' },
  { symbol: 'EUR/NZD (OTC)', name: 'Euro / New Zealand Dollar (OTC)', payout: 89, category: 'Forex (OTC)', basePrice: 1.81240, volatility: 0.00025, pipDecimals: 5, flag: '🇪🇺/🇳🇿' },
  { symbol: 'GBP/AUD (OTC)', name: 'British Pound / Australian Dollar (OTC)', payout: 91, category: 'Forex (OTC)', basePrice: 1.97050, volatility: 0.00026, pipDecimals: 5, flag: '🇬🇧/🇦🇺' },
  { symbol: 'GBP/CAD (OTC)', name: 'British Pound / Canadian Dollar (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 1.79760, volatility: 0.00024, pipDecimals: 5, flag: '🇬🇧/🇨🇦' },
  { symbol: 'GBP/CHF (OTC)', name: 'British Pound / Swiss Franc (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 1.12360, volatility: 0.00018, pipDecimals: 5, flag: '🇬🇧/🇨🇭' },
  { symbol: 'GBP/NZD (OTC)', name: 'British Pound / New Zealand Dollar (OTC)', payout: 90, category: 'Forex (OTC)', basePrice: 2.17040, volatility: 0.00028, pipDecimals: 5, flag: '🇬🇧/🇳🇿' },
  { symbol: 'NZD/JPY (OTC)', name: 'New Zealand Dollar / Japanese Yen (OTC)', payout: 87, category: 'Forex (OTC)', basePrice: 91.130, volatility: 0.032, pipDecimals: 3, flag: '🇳🇿/🇯🇵' },
  { symbol: 'USD/SGD (OTC)', name: 'US Dollar / Singapore Dollar (OTC)', payout: 86, category: 'Forex (OTC)', basePrice: 1.32150, volatility: 0.00014, pipDecimals: 5, flag: '🇺🇸/🇸🇬' },
  { symbol: 'USD/MXN (OTC)', name: 'US Dollar / Mexican Peso (OTC)', payout: 88, category: 'Forex (OTC)', basePrice: 19.8450, volatility: 0.0045, pipDecimals: 4, flag: '🇺🇸/🇲🇽' },
  { symbol: 'USD/NGN (OTC)', name: 'US Dollar / Nigerian Naira (OTC)', payout: 83, category: 'Forex (OTC)', basePrice: 1645.50, volatility: 0.45, pipDecimals: 2, flag: '🇺🇸/🇳🇬' },

  // ============================================================================
  // 2. CRYPTO (OTC) — 26 OTC Digital Assets
  // ============================================================================
  { symbol: 'BTC/USD (OTC)', name: 'Bitcoin / US Dollar (OTC)', payout: 93, category: 'Crypto (OTC)', basePrice: 68450.00, volatility: 18.5, pipDecimals: 2, flag: '₿' },
  { symbol: 'ETH/USD (OTC)', name: 'Ethereum / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 2635.50, volatility: 1.85, pipDecimals: 2, flag: 'Ξ' },
  { symbol: 'SOL/USD (OTC)', name: 'Solana / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 176.40, volatility: 0.35, pipDecimals: 2, flag: '◎' },
  { symbol: 'BNB/USD (OTC)', name: 'BNB / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 594.20, volatility: 0.75, pipDecimals: 2, flag: '🔶' },
  { symbol: 'XRP/USD (OTC)', name: 'Ripple / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 0.5482, volatility: 0.0012, pipDecimals: 4, flag: '✕' },
  { symbol: 'ADA/USD (OTC)', name: 'Cardano / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 0.3645, volatility: 0.0009, pipDecimals: 4, flag: '₳' },
  { symbol: 'DOGE/USD (OTC)', name: 'Dogecoin / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 0.1428, volatility: 0.0005, pipDecimals: 4, flag: 'Ð' },
  { symbol: 'AVAX/USD (OTC)', name: 'Avalanche / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 27.85, volatility: 0.08, pipDecimals: 2, flag: '🔺' },
  { symbol: 'DOT/USD (OTC)', name: 'Polkadot / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 4.485, volatility: 0.015, pipDecimals: 3, flag: '●' },
  { symbol: 'LINK/USD (OTC)', name: 'Chainlink / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 11.92, volatility: 0.035, pipDecimals: 2, flag: '⬡' },
  { symbol: 'LTC/USD (OTC)', name: 'Litecoin / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 71.40, volatility: 0.16, pipDecimals: 2, flag: 'Ł' },
  { symbol: 'TON/USD (OTC)', name: 'Toncoin / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 5.185, volatility: 0.014, pipDecimals: 3, flag: '💎' },
  { symbol: 'TRX/USD (OTC)', name: 'TRON / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 0.1642, volatility: 0.0004, pipDecimals: 4, flag: '⚡' },
  { symbol: 'UNI/USD (OTC)', name: 'Uniswap / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 7.840, volatility: 0.022, pipDecimals: 3, flag: '🦄' },
  { symbol: 'ATOM/USD (OTC)', name: 'Cosmos / US Dollar (OTC)', payout: 87, category: 'Crypto (OTC)', basePrice: 4.720, volatility: 0.015, pipDecimals: 3, flag: '⚛' },
  { symbol: 'NEAR/USD (OTC)', name: 'NEAR Protocol / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 4.860, volatility: 0.016, pipDecimals: 3, flag: 'Ⓝ' },
  { symbol: 'APT/USD (OTC)', name: 'Aptos / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 10.24, volatility: 0.032, pipDecimals: 2, flag: '🌐' },
  { symbol: 'ARB/USD (OTC)', name: 'Arbitrum / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 0.5680, volatility: 0.0018, pipDecimals: 4, flag: '🔷' },
  { symbol: 'OP/USD (OTC)', name: 'Optimism / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 1.745, volatility: 0.005, pipDecimals: 3, flag: '🔴' },
  { symbol: 'SUI/USD (OTC)', name: 'Sui Network / US Dollar (OTC)', payout: 92, category: 'Crypto (OTC)', basePrice: 2.085, volatility: 0.007, pipDecimals: 3, flag: '💧' },
  { symbol: 'FIL/USD (OTC)', name: 'Filecoin / US Dollar (OTC)', payout: 87, category: 'Crypto (OTC)', basePrice: 3.840, volatility: 0.012, pipDecimals: 3, flag: 'Storage' },
  { symbol: 'INJ/USD (OTC)', name: 'Injective / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 21.35, volatility: 0.065, pipDecimals: 2, flag: '🗡' },
  { symbol: 'BCH/USD (OTC)', name: 'Bitcoin Cash / US Dollar (OTC)', payout: 89, category: 'Crypto (OTC)', basePrice: 368.50, volatility: 0.65, pipDecimals: 2, flag: 'Ƀ' },
  { symbol: 'RENDER/USD (OTC)', name: 'Render / US Dollar (OTC)', payout: 91, category: 'Crypto (OTC)', basePrice: 5.420, volatility: 0.018, pipDecimals: 3, flag: '🎨' },
  { symbol: 'AAVE/USD (OTC)', name: 'Aave / US Dollar (OTC)', payout: 90, category: 'Crypto (OTC)', basePrice: 154.80, volatility: 0.35, pipDecimals: 2, flag: '👻' },
  { symbol: 'ICP/USD (OTC)', name: 'Internet Computer / US Dollar (OTC)', payout: 88, category: 'Crypto (OTC)', basePrice: 8.340, volatility: 0.025, pipDecimals: 3, flag: '∞' },

  // ============================================================================
  // 3. COMMODITIES (OTC) — 26 OTC Metals, Energy & Agriculture Instruments
  // ============================================================================
  { symbol: 'XAU/USD (OTC)', name: 'Gold Spot / US Dollar (OTC)', payout: 94, category: 'Commodities (OTC)', basePrice: 2735.60, volatility: 0.85, pipDecimals: 2, flag: '🥇' },
  { symbol: 'XAG/USD (OTC)', name: 'Silver Spot / US Dollar (OTC)', payout: 92, category: 'Commodities (OTC)', basePrice: 33.840, volatility: 0.045, pipDecimals: 3, flag: '🥈' },
  { symbol: 'WTI/USD (OTC)', name: 'WTI Crude Oil (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 71.45, volatility: 0.14, pipDecimals: 2, flag: '🛢️' },
  { symbol: 'BRENT/USD (OTC)', name: 'Brent Crude Oil (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 75.20, volatility: 0.15, pipDecimals: 2, flag: '⛽' },
  { symbol: 'NGAS/USD (OTC)', name: 'Natural Gas Henry Hub (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 2.548, volatility: 0.008, pipDecimals: 3, flag: '🔥' },
  { symbol: 'XPT/USD (OTC)', name: 'Platinum Spot / US Dollar (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 1028.40, volatility: 0.65, pipDecimals: 2, flag: '⚪' },
  { symbol: 'XPD/USD (OTC)', name: 'Palladium Spot / US Dollar (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 1165.80, volatility: 0.78, pipDecimals: 2, flag: '⚙️' },
  { symbol: 'HG/USD (OTC)', name: 'High-Grade Copper (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 4.385, volatility: 0.011, pipDecimals: 3, flag: '🧱' },
  { symbol: 'ALU/USD (OTC)', name: 'Aluminum Futures (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 2635.00, volatility: 1.25, pipDecimals: 2, flag: '🔩' },
  { symbol: 'NICKEL/USD (OTC)', name: 'Nickel LME (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 16280.00, volatility: 6.50, pipDecimals: 2, flag: '🪙' },
  { symbol: 'ZINC/USD (OTC)', name: 'Zinc Spot (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 3142.50, volatility: 1.40, pipDecimals: 2, flag: '⛓️' },
  { symbol: 'WHEAT/USD (OTC)', name: 'Chicago Wheat (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 572.40, volatility: 0.45, pipDecimals: 2, flag: '🌾' },
  { symbol: 'CORN/USD (OTC)', name: 'US Corn Futures (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 418.60, volatility: 0.35, pipDecimals: 2, flag: '🌽' },
  { symbol: 'SOY/USD (OTC)', name: 'US Soybeans (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 992.80, volatility: 0.60, pipDecimals: 2, flag: '🌱' },
  { symbol: 'COFFEE/USD (OTC)', name: 'Arabica Coffee (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 252.30, volatility: 0.32, pipDecimals: 2, flag: '☕' },
  { symbol: 'COCOA/USD (OTC)', name: 'ICE Cocoa (OTC)', payout: 91, category: 'Commodities (OTC)', basePrice: 6840.00, volatility: 4.20, pipDecimals: 2, flag: '🍫' },
  { symbol: 'SUGAR/USD (OTC)', name: 'Raw Sugar #11 (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 22.14, volatility: 0.04, pipDecimals: 2, flag: '🍬' },
  { symbol: 'COTTON/USD (OTC)', name: 'US Cotton #2 (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 70.85, volatility: 0.11, pipDecimals: 2, flag: '☁️' },
  { symbol: 'HOIL/USD (OTC)', name: 'NY Harbor Heating Oil (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 2.245, volatility: 0.006, pipDecimals: 3, flag: '🛢️' },
  { symbol: 'RBOB/USD (OTC)', name: 'RBOB Gasoline (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 2.064, volatility: 0.006, pipDecimals: 3, flag: '⛽' },
  { symbol: 'URA/USD (OTC)', name: 'Uranium Spot (OTC)', payout: 90, category: 'Commodities (OTC)', basePrice: 82.40, volatility: 0.16, pipDecimals: 2, flag: '☢️' },
  { symbol: 'LITH/USD (OTC)', name: 'Battery Grade Lithium (OTC)', payout: 89, category: 'Commodities (OTC)', basePrice: 10850.00, volatility: 5.20, pipDecimals: 2, flag: '🔋' },
  { symbol: 'COBALT/USD (OTC)', name: 'Cobalt LME (OTC)', payout: 87, category: 'Commodities (OTC)', basePrice: 24300.00, volatility: 8.50, pipDecimals: 2, flag: '🧪' },
  { symbol: 'LUMBER/USD (OTC)', name: 'Random Length Lumber (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 542.00, volatility: 0.55, pipDecimals: 2, flag: '🪵' },
  { symbol: 'CATTLE/USD (OTC)', name: 'Live Cattle CME (OTC)', payout: 86, category: 'Commodities (OTC)', basePrice: 188.40, volatility: 0.22, pipDecimals: 2, flag: '🥩' },
  { symbol: 'IRON/USD (OTC)', name: 'Iron Ore 62% Fe (OTC)', payout: 88, category: 'Commodities (OTC)', basePrice: 104.80, volatility: 0.19, pipDecimals: 2, flag: '⛏️' },

  // ============================================================================
  // 4. STOCKS (OTC) — 26 OTC Global Equities
  // ============================================================================
  { symbol: 'TSLA (OTC)', name: 'Tesla Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 262.45, volatility: 0.48, pipDecimals: 2, flag: '🚗' },
  { symbol: 'AAPL (OTC)', name: 'Apple Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 231.80, volatility: 0.34, pipDecimals: 2, flag: '🍎' },
  { symbol: 'NVDA (OTC)', name: 'NVIDIA Corporation (OTC)', payout: 94, category: 'Stocks (OTC)', basePrice: 141.60, volatility: 0.32, pipDecimals: 2, flag: '🟢' },
  { symbol: 'MSFT (OTC)', name: 'Microsoft Corporation (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 428.50, volatility: 0.52, pipDecimals: 2, flag: '🪟' },
  { symbol: 'AMZN (OTC)', name: 'Amazon.com Inc. (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 189.70, volatility: 0.31, pipDecimals: 2, flag: '📦' },
  { symbol: 'GOOGL (OTC)', name: 'Alphabet Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 166.90, volatility: 0.28, pipDecimals: 2, flag: '🔍' },
  { symbol: 'META (OTC)', name: 'Meta Platforms Inc. (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 578.40, volatility: 0.76, pipDecimals: 2, flag: '♾️' },
  { symbol: 'NFLX (OTC)', name: 'Netflix Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 754.20, volatility: 0.92, pipDecimals: 2, flag: '🎬' },
  { symbol: 'AMD (OTC)', name: 'Advanced Micro Devices (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 156.40, volatility: 0.34, pipDecimals: 2, flag: '💻' },
  { symbol: 'INTC (OTC)', name: 'Intel Corporation (OTC)', payout: 88, category: 'Stocks (OTC)', basePrice: 22.85, volatility: 0.06, pipDecimals: 2, flag: '🔹' },
  { symbol: 'COIN (OTC)', name: 'Coinbase Global Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 214.60, volatility: 0.54, pipDecimals: 2, flag: '🪙' },
  { symbol: 'MSTR (OTC)', name: 'MicroStrategy Inc. (OTC)', payout: 93, category: 'Stocks (OTC)', basePrice: 238.90, volatility: 0.62, pipDecimals: 2, flag: '📊' },
  { symbol: 'JPM (OTC)', name: 'JPMorgan Chase & Co. (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 225.40, volatility: 0.30, pipDecimals: 2, flag: '🏦' },
  { symbol: 'V (OTC)', name: 'Visa Inc. (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 284.70, volatility: 0.34, pipDecimals: 2, flag: '💳' },
  { symbol: 'MA (OTC)', name: 'Mastercard Inc. (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 506.30, volatility: 0.58, pipDecimals: 2, flag: '💳' },
  { symbol: 'BA (OTC)', name: 'Boeing Company (OTC)', payout: 88, category: 'Stocks (OTC)', basePrice: 155.20, volatility: 0.32, pipDecimals: 2, flag: '✈️' },
  { symbol: 'DIS (OTC)', name: 'Walt Disney Company (OTC)', payout: 87, category: 'Stocks (OTC)', basePrice: 96.80, volatility: 0.18, pipDecimals: 2, flag: '🏰' },
  { symbol: 'PYPL (OTC)', name: 'PayPal Holdings Inc. (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 81.40, volatility: 0.17, pipDecimals: 2, flag: '💸' },
  { symbol: 'UBER (OTC)', name: 'Uber Technologies Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 78.60, volatility: 0.18, pipDecimals: 2, flag: '🚕' },
  { symbol: 'SHOP (OTC)', name: 'Shopify Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 83.20, volatility: 0.21, pipDecimals: 2, flag: '🛍️' },
  { symbol: 'BABA (OTC)', name: 'Alibaba Group Holding (OTC)', payout: 91, category: 'Stocks (OTC)', basePrice: 98.40, volatility: 0.24, pipDecimals: 2, flag: '🏮' },
  { symbol: 'PLTR (OTC)', name: 'Palantir Technologies (OTC)', payout: 92, category: 'Stocks (OTC)', basePrice: 43.80, volatility: 0.14, pipDecimals: 2, flag: '🛰️' },
  { symbol: 'SNOW (OTC)', name: 'Snowflake Inc. (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 118.50, volatility: 0.26, pipDecimals: 2, flag: '❄️' },
  { symbol: 'CRM (OTC)', name: 'Salesforce Inc. (OTC)', payout: 88, category: 'Stocks (OTC)', basePrice: 291.40, volatility: 0.38, pipDecimals: 2, flag: '☁️' },
  { symbol: 'XOM (OTC)', name: 'Exxon Mobil Corporation (OTC)', payout: 89, category: 'Stocks (OTC)', basePrice: 120.60, volatility: 0.22, pipDecimals: 2, flag: '🛢️' },
  { symbol: 'BRK.B (OTC)', name: 'Berkshire Hathaway Inc. (OTC)', payout: 90, category: 'Stocks (OTC)', basePrice: 454.80, volatility: 0.45, pipDecimals: 2, flag: '🏛️' },
];

/**
 * Computes a realistic live fluctuating payout percentage around the asset's base payout (82% - 95%).
 */
export function getLivePayoutPercentage(asset: AssetInfo, tickSeed: number = Math.floor(Date.now() / 3000)): number {
  let hash = 0;
  for (let i = 0; i < asset.symbol.length; i++) {
    hash = (hash * 31 + asset.symbol.charCodeAt(i)) | 0;
  }
  const wave = Math.sin(tickSeed * 0.7 + hash);
  const delta = Math.round(wave * 2); // -2% to +2% live institutional liquidity fluctuation
  return Math.max(82, Math.min(95, asset.payout + delta));
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

const INITIAL_PROFILE: UserProfile = {
  id: 'usr_bft_001',
  email: 'trader.pro@bft-capital.com',
  fullName: 'Alex Mercer',
  country: 'United Kingdom',
  avatarUrl: BUILTIN_AVATARS[0],
  telegramHandle: '@alex_bft_pro',
  kycStatus: 'verified',
  kycDocumentType: 'Passport',
  kycSubmittedAt: '2026-10-15',
  twoFactorEnabled: true,
  activeAccountId: 'BFT-91823',
  referralCode: 'BFT-ALEX77',
  referredBy: undefined,
  isLoggedIn: true,
};

const INITIAL_ACCOUNTS: TradingAccount[] = [
  {
    id: 'BFT-91823',
    loginId: 'BFT-91823',
    passwordHash: 'bft_v9#Sec8',
    tier: 'instant',
    tierName: 'Instant Funded',
    size: 10000,
    initialBalance: 10000,
    currentBalance: 10680.0,
    startingDayEquity: 10520.0,
    equity: 10680.0,
    dailyLossLimitPercent: 6,
    maxOverallLossPercent: 12,
    maxRiskPerTradePercent: 5,
    status: 'active',
    createdDate: '2026-07-10',
    lastActiveDate: '2026-10-24',
    phase: 'funded',
    tradingDaysCompleted: 14,
    tradesCount: 38,
    winRate: 73.6,
    dailyWithdrawalsUnlocked: false,
    monthsCompleted: 3,
    scalingActive: true,
  },
  {
    id: 'BFT-44109',
    loginId: 'BFT-44109',
    passwordHash: 'bft_x2!K98p',
    tier: 'two-step',
    tierName: 'Two-Step Challenge',
    size: 5000,
    initialBalance: 5000,
    currentBalance: 6320.0,
    startingDayEquity: 6150.0,
    equity: 6320.0,
    dailyLossLimitPercent: 8,
    maxOverallLossPercent: 20,
    maxRiskPerTradePercent: 5,
    status: 'active',
    createdDate: '2026-10-18',
    lastActiveDate: '2026-10-24',
    phase: 'phase_1',
    tradingDaysCompleted: 5,
    tradesCount: 16,
    winRate: 68.8,
    dailyWithdrawalsUnlocked: true,
    monthsCompleted: 1,
    scalingActive: false,
  },
  {
    id: 'BFT-33912',
    loginId: 'BFT-33912',
    passwordHash: 'bft_z7!Q44r',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 2500,
    initialBalance: 2500,
    currentBalance: 2235.0,
    startingDayEquity: 2500.0,
    equity: 2235.0,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    maxRiskPerTradePercent: 5,
    status: 'soft-breached',
    breachType: 'soft',
    softBreachResetTime: Date.now() + 5 * 3600 * 1000 + 18 * 60 * 1000,
    createdDate: '2026-10-15',
    lastActiveDate: '2026-10-23',
    phase: 'phase_1',
    tradingDaysCompleted: 3,
    tradesCount: 9,
    winRate: 44.4,
    breachReason: 'Daily Loss Limit Exceeded: Real-time drawdown reached 10.6% ($265.00), exceeding allowed 10.0% limit. Trading temporarily paused until next daily reset.',
    breachedAt: Date.now() - 3600000,
    violationLogs: [
      {
        id: 'VIO-DAILY-101',
        rule: 'DAILY_LOSS',
        ruleName: 'Daily Loss Limit (Soft Breach)',
        severity: 'warning',
        message: 'Daily Loss Limit Exceeded: Real-time drawdown reached 10.6% ($265.00), exceeding allowed 10.0% limit. Auto-resets next trading day.',
        timestamp: Date.now() - 3600000,
        details: 'Daily Drawdown: 10.6% / Max 10.0% (Temporary Pause)',
      },
    ],
  },
  {
    id: 'BFT-77201',
    loginId: 'BFT-77201',
    passwordHash: 'bft_h9#W62x',
    tier: 'one-step',
    tierName: 'One-Step Challenge',
    size: 2500,
    initialBalance: 2500,
    currentBalance: 2110.0,
    startingDayEquity: 2250.0,
    equity: 2110.0,
    dailyLossLimitPercent: 10,
    maxOverallLossPercent: 15,
    maxRiskPerTradePercent: 5,
    status: 'hard-breached',
    breachType: 'hard',
    discountEligible: true,
    createdDate: '2026-10-12',
    lastActiveDate: '2026-10-20',
    phase: 'phase_1',
    tradingDaysCompleted: 4,
    tradesCount: 14,
    winRate: 35.7,
    breachReason: 'Maximum Overall Loss Exceeded: Total loss reached 15.6% ($390.00), breaching the 15.0% limit. Permanent Hard Breach enforced under strict prop compliance.',
    breachedAt: Date.now() - 7200000,
    violationLogs: [
      {
        id: 'VIO-OVERALL-902',
        rule: 'OVERALL_LOSS',
        ruleName: 'Max Overall Loss (Permanent Hard Breach)',
        severity: 'critical',
        message: 'Maximum Overall Loss Exceeded: Total loss reached 15.6% ($390.00), breaching allowed 15.0% limit. No resets allowed.',
        timestamp: Date.now() - 7200000,
        details: 'Overall Drawdown: 15.6% / Max 15.0% (10% Courtesy Discount Eligible)',
      },
    ],
  },
];

const INITIAL_WITHDRAWALS: WithdrawalRequest[] = [
  {
    id: 'WD-8924',
    accountId: 'BFT-91823',
    amount: 350,
    withdrawalFee: 35,
    netReceivedAmount: 315,
    profitSplitApplied: 90,
    paymentMethod: 'crypto_trc20',
    trc20Address: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referenceNumber: 'TX-TRC20-9FB8C14D',
    requestedAt: Date.now() - 86400000 * 2,
    completedAt: Date.now() - 86400000 * 2 + 102000,
    status: 'paid',
    txHash: '9fb8c14d5e23a0781b4d0812eac92b8d4f0980598125cfb881329a1b9',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 102,
  },
  {
    id: 'WD-8410',
    accountId: 'BFT-91823',
    amount: 500,
    withdrawalFee: 50,
    netReceivedAmount: 450,
    profitSplitApplied: 90,
    paymentMethod: 'bank_transfer',
    trc20Address: 'Barclays UK • GB29NWBK60161331926819',
    bankDetails: {
      bankName: 'Barclays Bank UK PLC',
      accountHolder: 'Alex Mercer',
      accountNumber: 'GB29NWBK60161331926819',
      swiftCode: 'BARCGB22XXX',
    },
    referenceNumber: 'SWIFT-BFT-440192',
    requestedAt: Date.now() - 86400000 * 5,
    completedAt: Date.now() - 86400000 * 5 + 145000,
    status: 'paid',
    txHash: 'SWIFT-REF-8840291BFT',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 145,
  },
  {
    id: 'WD-7811',
    accountId: 'BFT-91823',
    amount: 250,
    withdrawalFee: 25,
    netReceivedAmount: 225,
    profitSplitApplied: 80,
    paymentMethod: 'crypto_trc20',
    trc20Address: 'TYsDj4BmVp8QW8r6F32Xnm9ZkE4G1A7L2',
    referenceNumber: 'TX-TRC20-E4590BA1',
    requestedAt: Date.now() - 86400000 * 9,
    completedAt: Date.now() - 86400000 * 9 + 88000,
    status: 'paid',
    txHash: 'e4590ba1fcd89028a3851b98ce319fa442981bd20a84d28430a91ec88',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 88,
  },
  {
    id: 'WD-7105',
    accountId: 'BFT-44109',
    amount: 120,
    withdrawalFee: 12,
    netReceivedAmount: 108,
    profitSplitApplied: 80,
    paymentMethod: 'crypto_trc20',
    trc20Address: 'TQr9Lm42Kp8VX2n1B87Wqm3ZjR9H5K3P8',
    referenceNumber: 'TX-TRC20-PENDING01',
    requestedAt: Date.now() - 3600000 * 4,
    status: 'pending',
    txHash: 'Awaiting Compliance Verification',
    isDoublePayoutEligible: true,
    timeElapsedSeconds: 0,
  },
  {
    id: 'WD-6590',
    accountId: 'BFT-33912',
    amount: 80,
    withdrawalFee: 8,
    netReceivedAmount: 72,
    profitSplitApplied: 80,
    paymentMethod: 'bank_transfer',
    trc20Address: 'HSBC • Invalid IBAN Checksum',
    referenceNumber: 'SWIFT-ERR-6590',
    requestedAt: Date.now() - 86400000 * 14,
    status: 'rejected',
    rejectionReason: 'Invalid SWIFT/IBAN routing checksum; funds returned to trading balance.',
    txHash: 'REJECTED-IBAN-CHECKSUM',
    isDoublePayoutEligible: false,
    timeElapsedSeconds: 45,
  },
];

const STORAGE_KEYS = {
  PROFILE: 'bft_user_profile_v2',
  ACCOUNTS: 'bft_accounts_v2',
  ACTIVE_ACCOUNT: 'bft_active_account_id_v2',
  WITHDRAWALS: 'bft_withdrawals_v3',
  TRADES: 'bft_trades_v2',
  AUTH_TOKEN: 'bft_auth_token_v2',
};

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.avatarUrl && parsed.avatarUrl.includes('unsplash.com')) {
        parsed.avatarUrl = BUILTIN_AVATARS[0];
      }
      return parsed;
    }
  } catch {
    // fallback
  }
  return INITIAL_PROFILE;
}

export function saveProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile', e);
  }
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
      const existingIds = new Set(parsed.map((a) => a.id));
      const missingDefaults = INITIAL_ACCOUNTS.filter((a) => !existingIds.has(a.id));
      const merged = missingDefaults.length > 0 ? [...parsed, ...missingDefaults] : parsed;
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(merged));
      return merged;
    }
  } catch {
    // fallback
  }
  return INITIAL_ACCOUNTS;
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
  return INITIAL_ACCOUNTS[0].id;
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
  return INITIAL_WITHDRAWALS;
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
