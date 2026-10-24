import assert from 'node:assert/strict';
import test from 'node:test';
import { businessPeriodDays, showcaseArchiveFromRow } from '../src/lib/business-periods.ts';

test('builds a preserved period with sales, expenses and inventory values', () => {
  const archive = showcaseArchiveFromRow({
    id: 'archive-1',
    period_start: '2026-10-20',
    period_end: '2026-10-22',
    created_at: '2026-10-23T14:00:00.000Z',
    created_by: 'Tonyhuh04',
    snapshot: {
      daily_sales: [
        {
          business_date: '2026-10-20',
          ticket_count: 2,
          paid_total: 15_000,
          cost_total: 4_000,
        },
        {
          business_date: '2026-10-22',
          ticket_count: 1,
          paid_total: 5_000,
          cost_total: 1_000,
        },
      ],
      daily_expenses: [
        { business_date: '2026-10-20', total: 2_000 },
        { business_date: '2026-10-20', total: 1_000 },
      ],
      weekly_expenses: [{ total: 500 }],
      inventory_items: [
        {
          id: 'milk',
          name: 'Leche entera',
          unit: 'ml',
          stock: 2_000,
          minimum: 1_000,
          cost_per_unit: 2,
          active: true,
        },
        {
          id: 'hidden',
          name: 'Archivado',
          unit: 'pieza',
          stock: 1,
          minimum: 1,
          cost_per_unit: 500,
          active: false,
        },
      ],
    },
  });

  assert.deepEqual(archive.period, { start: '2026-10-20', end: '2026-10-22', days: 3 });
  assert.equal(archive.metrics.sales, 20_000);
  assert.equal(archive.metrics.tickets, 3);
  assert.equal(archive.metrics.productCost, 5_000);
  assert.equal(archive.metrics.operatingExpenses, 3_500);
  assert.equal(archive.metrics.netProfit, 11_500);
  assert.equal(archive.inventory.items.length, 1);
  assert.equal(archive.inventory.value, 4_000);
  assert.equal(archive.inventory.lowStockCount, 0);
});

test('counts the first and last date in a business period', () => {
  assert.equal(businessPeriodDays('2026-10-26', '2026-10-26'), 1);
  assert.equal(businessPeriodDays('2026-10-20', '2026-10-26'), 7);
});
