import { buildProfitMetrics } from './business-analytics.ts';
import type { InventoryUnit } from './inventory-schema.ts';
import type { ShowcaseArchive } from './showcase.ts';

function dateSpan(start: string, end: string) {
  const startAt = Date.parse(`${start}T12:00:00Z`);
  const endAt = Date.parse(`${end}T12:00:00Z`);
  return Math.max(1, Math.round((endAt - startAt) / 86_400_000) + 1);
}

function snapshotRows(snapshot: unknown, key: string): Record<string, unknown>[] {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];
  const value = (snapshot as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];
}

export function businessPeriodDays(start: string, end: string) {
  return dateSpan(start, end);
}

export function showcaseArchiveFromRow(row: Record<string, unknown>): ShowcaseArchive {
  const start = String(row.period_start);
  const end = String(row.period_end);
  const dailyRows = snapshotRows(row.snapshot, 'daily_sales');
  const expenseRows = snapshotRows(row.snapshot, 'daily_expenses');
  const weeklyExpenseRows = snapshotRows(row.snapshot, 'weekly_expenses');
  const expensesByDate = new Map<string, number>();

  for (const expense of expenseRows) {
    const businessDate = String(expense.business_date);
    expensesByDate.set(
      businessDate,
      (expensesByDate.get(businessDate) ?? 0) + Number(expense.total ?? 0),
    );
  }

  const days = dailyRows.map((day) => ({
    date: String(day.business_date),
    tickets: Number(day.ticket_count ?? 0),
    total: Number(day.paid_total ?? 0),
    cost: Number(day.cost_total ?? 0),
    expenses: expensesByDate.get(String(day.business_date)) ?? 0,
  }));
  const inventoryItems = snapshotRows(row.snapshot, 'inventory_items')
    .filter((item) => item.active !== false)
    .map((item) => {
      const stock = Number(item.stock ?? 0);
      const minimum = Number(item.minimum ?? 0);
      const costPerUnit = Number(item.cost_per_unit ?? 0);
      return {
        id: String(item.id),
        name: String(item.name),
        unit: item.unit as InventoryUnit,
        stock,
        minimum,
        costPerUnit,
        value: Math.round(stock * costPerUnit),
        status: stock <= minimum ? ('Necesita compra' as const) : ('Disponible' as const),
      };
    });

  return {
    id: String(row.id),
    createdAt: new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
    period: { start, end, days: dateSpan(start, end) },
    metrics: buildProfitMetrics(
      days,
      weeklyExpenseRows.reduce((sum, expense) => sum + Number(expense.total ?? 0), 0),
    ),
    inventory: {
      items: inventoryItems,
      value: inventoryItems.reduce((sum, item) => sum + item.value, 0),
      lowStockCount: inventoryItems.filter((item) => item.status === 'Necesita compra').length,
    },
  };
}
