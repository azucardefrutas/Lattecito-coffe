import test from 'node:test';
import assert from 'node:assert/strict';
import { dailySalesBreakdown, receiptText, type SaleForSummary } from '../src/lib/sales-summary.ts';
import { createCashReportPdf } from '../src/lib/cash-report-pdf.ts';
import { standaloneExtraId, standaloneExtraProductId } from '../src/lib/model.ts';

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

test('standalone extras are counted as extras and not as drinks', () => {
  const standaloneSale: SaleForSummary = {
    id: 'sale-extra',
    number: 3,
    date: '2026-09-22T17:00:00.000Z',
    items: [
      {
        standaloneExtraId: 'tapioca',
        name: 'Perlas de tapioca',
        size: 'Extra',
        quantity: 2,
        baseUnitPrice: 1500,
        extras: [],
        unitPrice: 1500,
        cost: 300,
      },
    ],
    subtotal: 3000,
    total: 3000,
    payment: 'Efectivo',
    paymentStatus: 'Pagado',
    received: 3000,
    change: 0,
  };
  const result = dailySalesBreakdown([standaloneSale]);
  assert.equal(result.products.length, 0);
  assert.deepEqual(result.extras, [
    {
      key: 'tapioca',
      id: 'tapioca',
      name: 'Perlas de tapioca',
      quantity: 2,
      amount: 3000,
    },
  ]);
});

test('standalone extra cart ids round-trip safely', () => {
  const productId = standaloneExtraProductId('tapioca');
  assert.equal(productId, 'extra:tapioca');
  assert.equal(standaloneExtraId(productId), 'tapioca');
  assert.equal(standaloneExtraId('latte'), null);
});

test('cash report generator returns a complete PDF document', () => {
  const pdf = createCashReportPdf({
    date: '2026-09-22',
    tickets: 8,
    total: 125000,
    cash: 75000,
    transfers: 50000,
    pendingTransfers: 15000,
    cost: 43000,
  });
  const text = new TextDecoder('windows-1252').decode(pdf);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /CORTE DE CAJA/);
  assert.match(text, /Tickets registrados/);
  assert.match(text, /%%EOF\s*$/);
});
