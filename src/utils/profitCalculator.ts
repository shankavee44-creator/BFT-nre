export interface ProfitSimulationParams {
  accountSize: number; // 2500, 5000, 10000
  winRatePercent: number; // 55 to 85
  tradesPerDay: number; // 1 to 20
  tradingDaysPerMonth?: number; // default 20
  riskPerTradePercent: number; // e.g. 1.5%
  averagePayoutPercent?: number; // default 90%
  profitSplitPercent?: number; // default 90%
  challengeFee?: number; // e.g. 100
}

export interface ProfitSimulationResult {
  stakePerTrade: number;
  totalMonthlyTrades: number;
  winningTrades: number;
  losingTrades: number;
  grossWinsAmount: number;
  grossLossesAmount: number;
  netMonthlyProfit: number;
  monthlyGrowthPercent: number;
  traderPayout: number;
  firmShare: number;
  roiOnFeePercent: number;
  annualizedPotentialPayout: number;
}

export function calculateProfitSimulation(params: ProfitSimulationParams): ProfitSimulationResult {
  const {
    accountSize,
    winRatePercent,
    tradesPerDay,
    tradingDaysPerMonth = 20,
    riskPerTradePercent,
    averagePayoutPercent = 90,
    profitSplitPercent = 90,
    challengeFee = 100,
  } = params;

  const totalMonthlyTrades = tradesPerDay * tradingDaysPerMonth;
  const winningTrades = Math.round(totalMonthlyTrades * (winRatePercent / 100));
  const losingTrades = totalMonthlyTrades - winningTrades;

  const stakePerTrade = Number(((accountSize * riskPerTradePercent) / 100).toFixed(2));
  const grossWinsAmount = Number((winningTrades * stakePerTrade * (averagePayoutPercent / 100)).toFixed(2));
  const grossLossesAmount = Number((losingTrades * stakePerTrade).toFixed(2));

  const rawNetProfit = grossWinsAmount - grossLossesAmount;
  const netMonthlyProfit = Number(Math.max(0, rawNetProfit).toFixed(2));
  const monthlyGrowthPercent = Number(((netMonthlyProfit / accountSize) * 100).toFixed(2));

  const traderPayout = Number(((netMonthlyProfit * profitSplitPercent) / 100).toFixed(2));
  const firmShare = Number((netMonthlyProfit - traderPayout).toFixed(2));

  const roiOnFeePercent = challengeFee > 0
    ? Number((((traderPayout - challengeFee) / challengeFee) * 100).toFixed(0))
    : 0;

  const annualizedPotentialPayout = Number((traderPayout * 12).toFixed(2));

  return {
    stakePerTrade,
    totalMonthlyTrades,
    winningTrades,
    losingTrades,
    grossWinsAmount,
    grossLossesAmount,
    netMonthlyProfit,
    monthlyGrowthPercent,
    traderPayout,
    firmShare,
    roiOnFeePercent,
    annualizedPotentialPayout,
  };
}
