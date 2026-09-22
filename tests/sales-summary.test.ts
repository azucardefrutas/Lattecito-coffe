import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySalesBreakdown, receiptText, type SaleForSummary } from '../src/lib/sales-summary.ts';

const sales: SaleForSummary[] = [
  {
    id: 'sale-1',
    number: 1,
    date: '2026-09-22T15:00:00.000Z',
    customer: 'Ana',
    items: [
      {
        productId: 'matcha',
        productName: 'Latte matcha',
        sizeIndex: 0,
        name: 'Latte matcha',
        size: 'Chico',
        quantity: 2,
        baseUnitPrice: 5000,
        extras: [{ id: 'shot', name: 'Shot extra', unitPrice: 1000 }],
        unitPrice: 6000,
        cost: 2000,
      },
    ],
    subtotal: 12000,
    total: 12000,
    payment: 'Efectivo',
    paymentStatus: 'Pagado',
    received: 15000,
    change: 3000,
  },
  {
    id: 'sale-2',
    number: 2,
    date: '2026-09-22T16:00:00.000Z',
    items: [
      {
        productId: 'strawberry',
        productName: 'Coffee strawberry cold',
        sizeIndex: 1,
        name: 'Coffee strawberry cold',
        size: 'Mediano',
        quantity: 2,
        baseUnitPrice: 6000,
        extras: [],
        unitPrice: 6000,
        cost: 2500,
      },
    ],
    subtotal: 12000,
    total: 12000,
    payment: 'Transferencia',
    paymentStatus: 'Pendiente',
    received: 12000,
    change: 0,
  },
];

test('daily sales groups paid drinks and extras without counting pending transfers', () => {
  const result = dailySalesBreakdown(sales);
  assert.deepEqual(result.products, [
    {
      key: 'matcha|0',
      productId: 'matcha',
      name: 'Latte matcha',
      size: 'Chico',
      quantity: 2,
      amount: 10000,
    },
  ]);
  assert.equal(result.extras[0].quantity, 2);
  assert.equal(result.extras[0].amount, 2000);
  assert.equal(result.total, 12000);
  assert.equal(result.pendingTransfers, 12000);
  assert.equal(result.tickets, 2);
});

test('digital receipt separates extras, payment and cash change', () => {
  const text = receiptText(sales[0], (value) => `$${(value / 100).toFixed(2)}`);
  assert.match(text, /2 × Latte matcha · Chico/);
  assert.match(text, /\+ Shot extra · \$20\.00/);
  assert.match(text, /Total: \$120\.00/);
  assert.match(text, /Cambio: \$30\.00/);
});
