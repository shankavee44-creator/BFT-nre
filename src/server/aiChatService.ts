/**
 * 24x7 AI Live Chatbot Service
 * Uses Google Gen AI SDK (@google/genai) with gemini-3.8-flash and institutional prop knowledge.
 * Includes instant deterministic fallback for sub-50ms offline response.
 */

import { GoogleGenAI } from '@google/genai';

export const BFT_SUPPORT_SYSTEM_INSTRUCTION = `
You are the official 24/7 AI Trader Concierge & Institutional Risk Specialist for Binary Funded Trader (BFT Prime Prop Capital).
Your duty is to assist binary options prop traders with instant, accurate, highly professional, and encouraging support.

INSTITUTIONAL RULES & KNOWLEDGE BASE:
1. Challenge Models:
   - 01-Step Challenge: Profit Target: 30%, Daily Drawdown: 10%, Max Overall Drawdown: 15%, Max Risk per Trade: 5%, Minimum 5 Profitable Days (0.5% profit/day).
   - 02-Step Challenge: Phase 1 Profit Target: 25%, Phase 2 Profit Target: 15%, Daily Drawdown: 8%, Max Overall Drawdown: 20%, Max Risk per Trade: 5%, Minimum 5 Profitable Days.
   - Instant Funded Account: No profit target required! Daily Drawdown: 6%, Max Overall Drawdown: 12%, Max Risk per Trade: 5%, No minimum days. Immediate profit share eligible after 14-day hold.
   - Self-Funded (Personal Live) Accounts: Unrestricted trading of your own deposited capital. All challenge rules, daily drawdown, and overall drawdown limits are NONE / Disabled.

2. Trading Regulations:
   - Minimum Trade Duration: 30 seconds minimum contract expiration (30s, 60s, 3m, 5m). Prevents micro-latency arbitrage.
   - Red News Policy: 2-minute freeze before and after high-impact economic news releases (CPI, NFP, FOMC).
   - Position Sizing: No trade may exceed 5x your historical average position size.
   - Prohibited Strategies: Martingale (exponential doubling upon loss) and simultaneous opposite hedging are strictly prohibited.

3. Payouts & Crypto Rail:
   - Currency & Rail: Exclusively USDT via TRON network (TRC-20) for lightning-fast sub-3-minute settlement and near-zero fees.
   - Payout SLA: Guaranteed 3-Minute Instant Payout SLA. First withdrawal requires a 14-day seasoned lock. Minimum withdrawal is $250 with a standard 10% processing fee.
   - Profit Splits: Standard 80% split (Months 1-3), upgrading to 90% plus capital scaling upon consistent performance.

4. Promo Codes:
   - "SPOOKY40": Flat 40% OFF for new trader challenges.
   - "SPOOKY20": Flat 20% OFF for existing funded traders.

5. Tone & Personality:
   - Professional, concise, authoritative yet welcoming.
   - Keep answers clear and formatted with bullet points where appropriate.
   - Never give direct financial advice to buy/sell a specific market, but explain risk mechanics clearly.
`;

export function generateLocalFallbackReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('1-step') || lower.includes('one step') || lower.includes('01-step') || lower.includes('1 step')) {
    return `**01-Step Challenge Specifications:**\n• **Profit Target:** 30%\n• **Daily Drawdown Limit:** 10%\n• **Max Overall Drawdown:** 15%\n• **Max Risk Per Trade:** 5%\n• **Min Profitable Days:** 5 days (min +0.5% gain/day)\n• **Profit Split:** 80% to 90% paid via instant TRC-20 USDT.`;
  }

  if (lower.includes('2-step') || lower.includes('two step') || lower.includes('02-step') || lower.includes('2 step')) {
    return `**02-Step Challenge Specifications:**\n• **Phase 1 Target:** 25%\n• **Phase 2 Target:** 15%\n• **Daily Drawdown:** 8%\n• **Max Overall Drawdown:** 20%\n• **Max Risk Per Trade:** 5%\n• **Min Profitable Days:** 5 days\n• Best value entry for disciplined traders looking for maximum buffer.`;
  }

  if (lower.includes('instant') || lower.includes('funded account')) {
    return `**Instant Funded Account (No Evaluation):**\n• **Profit Target:** None!\n• **Daily Drawdown:** 6%\n• **Max Overall Drawdown:** 12%\n• **Max Risk Per Trade:** 5%\n• Skip the evaluation and start trading live institutional capital right away. First payout eligible after 14-day hold.`;
  }

  if (lower.includes('drawdown') || lower.includes('breach') || lower.includes('rule')) {
    return `**Drawdown & Risk Management:**\n• Calculated in real-time based on high-water equity.\n• Exceeding daily or max drawdown results in automatic position liquidation and soft/hard breach protection.\n• Self-funded accounts have zero drawdown restrictions (NONE).`;
  }

  if (lower.includes('payout') || lower.includes('withdraw') || lower.includes('usdt') || lower.includes('trc20')) {
    return `**Instant TRC-20 Payout Details:**\n• **Speed:** Sub-3-minute automated blockchain dispatch.\n• **Minimum:** $250.00 USDT (TRC-20).\n• **Processing Fee:** 10% standard liquidity fee.\n• **Initial Lock:** 14-day seasoned waiting period on first withdrawal.`;
  }

  if (lower.includes('promo') || lower.includes('code') || lower.includes('discount') || lower.includes('spooky')) {
    return `**Active Official Promos:**\n• **SPOOKY40**: Flat 40% OFF all challenge packages for new traders.\n• **SPOOKY20**: Flat 20% OFF for existing accounts.\nEnter these promo codes at checkout for instant price discounts.`;
  }

  if (lower.includes('demo') || lower.includes('balance') || lower.includes('reset')) {
    return `**Custom Demo Balance:**\nYou can customize your Demo Account simulator balance to any amount between **$1.00** and **$10,000.00** using the Account Switcher dropdown pencil icon or inside your Trader Hub Profile tab!`;
  }

  return `Welcome to BFT Prime Prop Capital support! I can help you with prop trading rules (1-Step, 2-Step, Instant Funded), drawdown limits, our 3-minute TRC-20 payout SLA, active discount codes (SPOOKY40 / SPOOKY20), and account setup. How can I assist your trading today?`;
}

export async function generateSupportChatReply(userMessage: string, chatHistory: Array<{ role: 'user' | 'model'; text: string }> = []): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

  if (!apiKey) {
    return generateLocalFallbackReply(userMessage);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Format chat history for context
    const contents: any[] = [];
    for (const msg of chatHistory.slice(-6)) {
      contents.push({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: BFT_SUPPORT_SYSTEM_INSTRUCTION,
        temperature: 0.6,
        maxOutputTokens: 600,
      },
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 0) {
      return reply;
    }
    return generateLocalFallbackReply(userMessage);
  } catch (err) {
    console.warn('[AIChatService] Gemini API call fallback triggered:', err);
    return generateLocalFallbackReply(userMessage);
  }
}
