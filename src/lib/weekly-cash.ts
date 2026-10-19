import type { SalesHistoryDay, SupplyExpense } from './expenses';

export type WeeklyCashExpense = {
  id: string;
  weekStart: string;
  date: string;
  name: string;
  quantity: number | null;
  total: number;
  createdBy: string;
  updatedBy: string;
};

export type WeeklyCashDay = SalesHistoryDay & {
  label: string;
};

export type WeeklyCashSummary = {
  weekStart: string;
  weekEnd: string;
  days: WeeklyCashDay[];
  expenses: WeeklyCashExpense[];
  salesTotal: number;
  cashTotal: number;
  transferTotal: number;
  pendingTotal: number;
  tickets: number;
  dailyExpensesTotal: number;
  weeklyExpensesTotal: number;
  expensesTotal: number;
  expectedBalance: number;
};

const dayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function businessWeekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - weekday + 1);
  return isoDate(value);
}

export function businessWeekEnd(date: string) {
  const value = new Date(`${businessWeekStart(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 6);
  return isoDate(value);
}

export function buildWeeklyCashSummary(input: {
  today: string;
  salesDays: SalesHistoryDay[];
  dailyExpenses: Pick<SupplyExpense, 'businessDate' | 'total'>[];
  weeklyExpenses: WeeklyCashExpense[];
}): WeeklyCashSummary {
  const weekStart = businessWeekStart(input.today);
  const weekEnd = businessWeekEnd(input.today);
  const salesByDate = new Map(input.salesDays.map((day) => [day.date, day]));
  const days: WeeklyCashDay[] = [];
  const cursor = new Date(`${weekStart}T12:00:00Z`);

  for (let index = 0; index < 7; index += 1) {
    const date = isoDate(cursor);
    days.push({
      ...(salesByDate.get(date) ?? {
        date,
        tickets: 0,
        total: 0,
        cash: 0,
        transfers: 0,
        pendingTransfers: 0,
        cost: 0,
      }),
      label: dayLabels[index],
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const dailyExpensesTotal = input.dailyExpenses
    .filter((expense) => expense.businessDate >= weekStart && expense.businessDate <= weekEnd)
    .reduce((sum, expense) => sum + expense.total, 0);
  const weeklyExpensesTotal = input.weeklyExpenses.reduce((sum, expense) => sum + expense.total, 0);
  const salesTotal = days.reduce((sum, day) => sum + day.total, 0);
  const expensesTotal = dailyExpensesTotal + weeklyExpensesTotal;

  return {
    weekStart,
    weekEnd,
    days,
    expenses: [...input.weeklyExpenses].sort((a, b) => b.date.localeCompare(a.date)),
    salesTotal,
    cashTotal: days.reduce((sum, day) => sum + day.cash, 0),
    transferTotal: days.reduce((sum, day) => sum + day.transfers, 0),
    pendingTotal: days.reduce((sum, day) => sum + day.pendingTransfers, 0),
    tickets: days.reduce((sum, day) => sum + day.tickets, 0),
    dailyExpensesTotal,
    weeklyExpensesTotal,
    expensesTotal,
    expectedBalance: salesTotal - expensesTotal,
  };
}
