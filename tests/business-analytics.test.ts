import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfitMetrics } from '../src/lib/business-analytics.ts';

test('profit metrics separate sales, product cost and operating expenses', () => {
  const metrics = buildProfitMetrics(
    [
      { date: '2026-10-20', tickets: 3, total: 500_000, cost: 150_000, expenses: 20_000 },
      { date: '2026-10-21', tickets: 2, total: 300_000, cost: 90_000, expenses: 10_000 },
    ],
    30_000,
  );

  assert.equal(metrics.sales, 800_000);
  assert.equal(metrics.productCost, 240_000);
  assert.equal(metrics.operatingExpenses, 60_000);
  assert.equal(metrics.investment, 300_000);
  assert.equal(metrics.grossProfit, 560_000);
  assert.equal(metrics.netProfit, 500_000);
  assert.equal(metrics.grossMargin, 70);
  assert.equal(metrics.netMargin, 62.5);
  assert.equal(metrics.returnOnInvestment, 166.7);
  assert.equal(metrics.averageTicket, 160_000);
});

test('empty periods do not invent percentage margins', () => {
  const metrics = buildProfitMetrics([]);
  assert.equal(metrics.sales, 0);
  assert.equal(metrics.grossMargin, null);
  assert.equal(metrics.netMargin, null);
  assert.equal(metrics.returnOnInvestment, null);
});
