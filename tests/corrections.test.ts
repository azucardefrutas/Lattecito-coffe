import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustStock,
  calculate,
  daySummary,
  deductIngredients,
  expectedCash,
  initialProducts,
  quoteSale,
  refundSale,
  whatsappText,
  type Store,
  type Sale,
} from '../src/lib/model.ts';
import { addCartLine, inspectCart, lineKey, restoreCart } from '../src/lib/cart.ts';
const timestamp = '2026-09-14T18:00:00Z';
function fixture(): Store {
  return {
    products: [
      {
        ...structuredClone(initialProducts[1]),
        recipes: [0, 1, 2].map(() => [{ ingredientId: 'milk', quantity: 250.125 }]),
      },
    ],
    ingredients: [
      { id: 'milk', name: 'Leche', unit: 'ml', stock: 1000, minimum: 100, costPerUnit: 3 },
      { id: 'cup', name: 'Vaso', unit: 'pieza', stock: 20, minimum: 2, costPerUnit: 200 },
    ],
    modifiers: [
      {
        id: 'extra',
        name: 'Leche extra',
        price: 1000,
        recipe: [{ ingredientId: 'milk', quantity: 50 }],
        productIds: ['matcha'],
        active: true,
      },
    ],
    sales: [],
    movements: [],
    cash: [{ id: 'shift', openedAt: timestamp, opening: 50000 }],
    settings: { phones: [], address: '', hours: '', sample: true },
  };
}
function makeSale(s: Store, payment = 'Efectivo') {
  const { needs, ...quote } = quoteSale(
    s,
    [{ productId: 'matcha', size: 2, quantity: 1, modifierIds: ['extra'] }],
    10,
  );
  deductIngredients(s, needs, 'Venta sale', timestamp);
  const sale: Sale = {
    id: 'sale',
    date: timestamp,
    sessionId: 'shift',
    ...quote,
    payment,
    received: quote.total,
    change: 0,
    number: 1,
    status: 'Pendiente',
    consumed: [...needs].map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
  };
  s.sales.push(sale);
  return sale;
}
test('public menu, POS and WhatsApp use the same extra total', () => {
  const s = fixture(),
    lines = [{ productId: 'matcha', size: 2, quantity: 2, modifierIds: ['extra'] }];
  assert.equal(calculate(s.products, lines, 0, s.modifiers).total, quoteSale(s, lines, 0).total);
  assert.match(whatsappText(s.products, lines, '', s.modifiers), /Leche extra/);
  assert.match(whatsappText(s.products, lines, '', s.modifiers), /320/);
});
test('inactive and incompatible extras are rejected in both channels', () => {
  for (const mods of [
    [{ ...fixture().modifiers[0], active: false }],
    [{ ...fixture().modifiers[0], productIds: ['latte'] }],
    [{ ...fixture().modifiers[0], productIds: [] }],
  ]) {
    const s = fixture();
    s.modifiers = mods;
    const lines = [{ productId: 'matcha', size: 2, quantity: 1, modifierIds: ['extra'] }];
    assert.throws(() => calculate(s.products, lines, 0, s.modifiers));
    assert.throws(() => quoteSale(s, lines, 0));
  }
});
test('cart keeps different extras separate and matches extras irrespective of order', () => {
  const plain = { productId: 'matcha', size: 2, quantity: 1 };
  const extra = { ...plain, modifierIds: ['extra'] };
  const lines = addCartLine(addCartLine([], plain), extra);
  assert.equal(lines.length, 2);
  assert.notEqual(lineKey(plain), lineKey(extra));
  assert.equal(
    lineKey({ ...plain, modifierIds: ['a', 'b'] }),
    lineKey({ ...plain, modifierIds: ['b', 'a'] }),
  );
  assert.throws(() => addCartLine([{ ...extra, quantity: 99 }], extra));
});
test('saved carts accept old format and reject malformed quantities or extras', () => {
  const plain = { productId: 'matcha', size: 2, quantity: 1 };
  assert.equal(restoreCart([plain]).lines.length, 1);
  assert.equal(restoreCart({ version: 2, lines: [plain] }).discarded, false);
  const result = restoreCart([
    null,
    { ...plain, quantity: 0 },
    { ...plain, modifierIds: 'extra' },
    plain,
  ]);
  assert.equal(result.lines.length, 1);
  assert.equal(result.discarded, true);
});
test('removed extras stay unavailable instead of being silently priced as a plain drink', () => {
  const s = fixture();
  const cart = [{ productId: 'matcha', size: 2, quantity: 1, modifierIds: ['extra'] }];
  assert.equal(inspectCart(s.products, [], cart).unavailable.length, 1);
});
test('stock supports exact thousandths and rejects fractional physical pieces', () => {
  const s = fixture();
  adjustStock(s, 'milk', 0.125, 'Compra', timestamp);
  adjustStock(s, 'milk', -0.125, 'Ajuste', timestamp);
  assert.equal(s.ingredients[0].stock, 1000);
  assert.throws(() => adjustStock(s, 'cup', 0.5, 'Compra', timestamp));
  assert.throws(() => adjustStock(s, 'milk', 0.0001, 'Compra', timestamp));
  assert.throws(() => adjustStock(s, 'milk', -1001, 'Merma', timestamp));
});
test('refund preserves original ticket and restores actual consumed amounts after recipe edit', () => {
  const s = fixture(),
    sale = makeSale(s);
  const before = structuredClone(sale);
  s.products[0].recipes![2][0].quantity = 900;
  s.modifiers[0].recipe[0].quantity = 800;
  const result = refundSale(s, 'sale', 'Pedido duplicado', true, timestamp);
  assert.equal(s.ingredients[0].stock, 1000);
  assert.equal(result.total, before.total);
  assert.deepEqual(result.items, before.items);
  assert.equal(expectedCash(s, s.cash[0]), 50000);
  assert.equal(result.refund?.amount, 14400);
});
test('repeated refund cannot double-return money or ingredients', () => {
  const s = fixture();
  makeSale(s);
  refundSale(s, 'sale', 'Pedido duplicado', true, timestamp);
  const before = structuredClone(s);
  refundSale(s, 'sale', 'Otro motivo', false, timestamp);
  assert.deepEqual(s, before);
});
test('prepared drink keeps ingredient consumption and cost as waste', () => {
  const s = fixture(),
    sale = makeSale(s);
  const stock = s.ingredients[0].stock;
  refundSale(s, 'sale', 'Bebida rechazada', false, timestamp);
  assert.equal(s.ingredients[0].stock, stock);
  const summary = daySummary(s, new Date(timestamp).toLocaleDateString('en-CA'));
  assert.equal(summary.net, 0);
  assert.equal(summary.cost, sale.cost);
});
test('refund in a later shift leaves closed cash snapshot unchanged', () => {
  const s = fixture();
  makeSale(s);
  s.cash[0].expected = expectedCash(s, s.cash[0]);
  s.cash[0].counted = s.cash[0].expected;
  s.cash[0].closedAt = timestamp;
  const original = structuredClone(s.cash[0]);
  s.cash.push({ id: 'next', openedAt: timestamp, opening: 50000 });
  refundSale(s, 'sale', 'Corrección posterior', true, timestamp);
  assert.deepEqual(s.cash[0], original);
  assert.equal(expectedCash(s, s.cash[0]), 64400);
  assert.equal(expectedCash(s, s.cash[1]), 35600);
});
test('card and transfer refunds do not decrease physical cash', () => {
  for (const payment of ['Tarjeta', 'Transferencia']) {
    const s = fixture();
    makeSale(s, payment);
    refundSale(s, 'sale', 'Venta duplicada', false, timestamp);
    assert.equal(expectedCash(s, s.cash[0]), 50000);
  }
});
test('refund requires open cash, a reason and enough expected cash', () => {
  const s = fixture();
  makeSale(s);
  s.cash[0].closedAt = timestamp;
  assert.throws(() => refundSale(s, 'sale', 'Venta duplicada', true, timestamp));
  s.cash.push({ id: 'next', openedAt: timestamp, opening: 0 });
  assert.throws(() => refundSale(s, 'sale', 'Venta duplicada', true, timestamp));
  s.cash[1].opening = 50000;
  assert.throws(() => refundSale(s, 'sale', 'x', true, timestamp));
  assert.equal(s.sales[0].refund, undefined);
});
test('legacy tickets restore consumed inventory using original movement history', () => {
  const s = fixture(),
    sale = makeSale(s);
  delete sale.consumed;
  refundSale(s, 'sale', 'Venta duplicada', true, timestamp);
  assert.equal(s.ingredients[0].stock, 1000);
});
