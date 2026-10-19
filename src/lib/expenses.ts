export type SupplyExpense = {
  id: string;
  businessDate: string;
  date: string;
  name: string;
  quantity: number | null;
  total: number;
  createdBy: string;
  updatedBy: string;
};

export type SalesHistoryDay = {
  date: string;
  tickets: number;
  total: number;
  cash: number;
  transfers: number;
  pendingTransfers: number;
  cost: number;
};

export type FinancialHistoryDay = SalesHistoryDay & {
  expenses: number;
  net: number;
};

export function expenseTotal(expenses: Pick<SupplyExpense, 'total'>[]) {
  return expenses.reduce((sum, expense) => sum + expense.total, 0);
}

export function mergeFinancialHistory(
  salesDays: SalesHistoryDay[],
  expenses: Pick<SupplyExpense, 'businessDate' | 'total'>[],
): FinancialHistoryDay[] {
  const days = new Map<string, FinancialHistoryDay>();
  for (const day of salesDays) {
    days.set(day.date, { ...day, expenses: 0, net: day.total });
  }
  for (const expense of expenses) {
    const day = days.get(expense.businessDate) ?? {
      date: expense.businessDate,
      tickets: 0,
      total: 0,
      cash: 0,
      transfers: 0,
      pendingTransfers: 0,
      cost: 0,
      expenses: 0,
      net: 0,
    };
    day.expenses += expense.total;
    day.net = day.total - day.expenses;
    days.set(day.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
