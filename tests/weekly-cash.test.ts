import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyCashSummary,
  businessWeekEnd,
  businessWeekStart,
  type WeeklyCashExpense,
} from '../src/lib/weekly-cash.ts';

test('the weekly cash period always runs from Monday through Sunday', () => {
  assert.equal(businessWeekStart('2026-10-19'), '2026-10-19');
  assert.equal(businessWeekStart('2026-10-25'), '2026-10-19');
  assert.equal(businessWeekEnd('2026-10-21'), '2026-10-25');
});

test('weekly cash totals paid sales and subtracts daily and global supplies', () => {
  const weeklyExpense: WeeklyCashExpense = {
    id: 'weekly-1',
    weekStart: '2026-10-19',
    date: '2026-10-21T18:00:00.000Z',
    name: 'Matcha',
    quantity: 1,
    total: 50000,
    createdBy: 'Tonyhuh04',
    updatedBy: '',
  };
  const result = buildWeeklyCashSummary({
    today: '2026-10-21',
    salesDays: [
      {
        date: '2026-10-19',
        tickets: 2,
        total: 200000,
        cash: 150000,
        transfers: 50000,
        pendingTransfers: 10000,
        cost: 0,
      },
      {
        date: '2026-10-21',
        tickets: 3,
        total: 300000,
        cash: 100000,
        transfers: 200000,
        pendingTransfers: 0,
        cost: 0,
      },
    ],
    dailyExpenses: [
      { businessDate: '2026-10-19', total: 20000 },
      { businessDate: '2026-10-12', total: 999999 },
    ],
    weeklyExpenses: [weeklyExpense],
  });

  assert.equal(result.days.length, 7);
  assert.equal(result.days[0].label, 'Lunes');
  assert.equal(result.days[6].label, 'Domingo');
  assert.equal(result.salesTotal, 500000);
  assert.equal(result.cashTotal, 250000);
  assert.equal(result.transferTotal, 250000);
  assert.equal(result.pendingTotal, 10000);
  assert.equal(result.tickets, 5);
  assert.equal(result.dailyExpensesTotal, 20000);
  assert.equal(result.weeklyExpensesTotal, 50000);
  assert.equal(result.expensesTotal, 70000);
  assert.equal(result.expectedBalance, 430000);
});

test('empty dates appear as zero-value rows in the weekly register', () => {
  const result = buildWeeklyCashSummary({
    today: '2026-10-19',
    salesDays: [],
    dailyExpenses: [],
    weeklyExpenses: [],
  });
  assert.equal(
    result.days.every((day) => day.total === 0),
    true,
  );
  assert.equal(result.expectedBalance, 0);
});
