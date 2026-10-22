export type FinancialDay = {
  date: string;
  tickets: number;
  total: number;
  cost: number;
  expenses: number;
};

export type ProfitMetrics = {
  sales: number;
  productCost: number;
  operatingExpenses: number;
  investment: number;
  grossProfit: number;
  netProfit: number;
  grossMargin: number | null;
  netMargin: number | null;
  returnOnInvestment: number | null;
  averageTicket: number;
  tickets: number;
};

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

export function buildProfitMetrics(days: FinancialDay[], additionalExpenses = 0): ProfitMetrics {
  const sales = days.reduce((sum, day) => sum + day.total, 0);
  const productCost = days.reduce((sum, day) => sum + day.cost, 0);
  const tickets = days.reduce((sum, day) => sum + day.tickets, 0);
  const operatingExpenses = days.reduce((sum, day) => sum + day.expenses, 0) + additionalExpenses;
  const investment = productCost + operatingExpenses;
  const grossProfit = sales - productCost;
  const netProfit = sales - investment;

  return {
    sales,
    productCost,
    operatingExpenses,
    investment,
    grossProfit,
    netProfit,
    grossMargin: ratio(grossProfit, sales),
    netMargin: ratio(netProfit, sales),
    returnOnInvestment: ratio(netProfit, investment),
    averageTicket: tickets ? Math.round(sales / tickets) : 0,
    tickets,
  };
}

export function percent(value: number | null) {
  return value === null ? 'Pendiente' : `${value.toLocaleString('es-MX')}%`;
}
