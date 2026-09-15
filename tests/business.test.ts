import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate,
  initialProducts,
  quoteSale,
  deductIngredients,
  expectedCash,
  whatsappText,
  type Store,
} from '../src/lib/model.ts';
function fixture(): Store {
  return {
    products: [
      {
        ...structuredClone(initialProducts[1]),
        recipes: [
          [{ ingredientId: 'milk', quantity: 150 }],
          [{ ingredientId: 'milk', quantity: 250 }],
          [
            { ingredientId: 'milk', quantity: 300 },
            { ingredientId: 'cup', quantity: 1 },
          ],
        ],
      },
    ],
    ingredients: [
      { id: 'milk', name: 'Leche', unit: 'ml', stock: 1000, minimum: 100, costPerUnit: 3 },
      { id: 'cup', name: 'Vaso', unit: 'pieza', stock: 10, minimum: 2, costPerUnit: 200 },
    ],
    modifiers: [
      {
        id: 'extra',
        name: 'Leche extra',
        price: 1000,
        recipe: [{ ingredientId: 'milk', quantity: 50 }],
      },
    ],
    sales: [],
    cash: [],
    movements: [],
    settings: { phones: [], address: '', hours: '', sample: true },
  };
}
test('10% discount uses integer cents and original price', () => {
  const t = calculate(initialProducts, [{ productId: 'matcha', size: 2, quantity: 2 }], 10);
  assert.equal(t.subtotal, 30000);
  assert.equal(t.discount, 3000);
  assert.equal(t.total, 27000);
  assert.equal(t.items[0].unitPrice, 15000);
});
test('reject negative quantities, invalid sizes and discounts', () => {
  for (const q of [-1, 0, 100, 1.5])
    assert.throws(() =>
      calculate(initialProducts, [{ productId: 'matcha', size: 0, quantity: q }]),
    );
  assert.throws(() => calculate(initialProducts, [{ productId: 'matcha', size: 3, quantity: 1 }]));
  assert.throws(() =>
    calculate(initialProducts, [{ productId: 'matcha', size: 0, quantity: 1 }], 101),
  );
});
test('recipe aggregates ingredients, extras and cost by quantity', () => {
  const s = fixture(),
    q = quoteSale(s, [{ productId: 'matcha', size: 2, quantity: 2, modifierIds: ['extra'] }], 10);
  assert.equal(q.needs.get('milk'), 700);
  assert.equal(q.needs.get('cup'), 2);
  assert.equal(q.subtotal, 32000);
  assert.equal(q.total, 28800);
  assert.equal(q.cost, 2500);
  deductIngredients(s, q.needs, 'Venta prueba', '2026-09-14');
  assert.equal(s.ingredients[0].stock, 300);
  assert.equal(s.ingredients[1].stock, 8);
  assert.equal(s.movements.length, 2);
});
test('insufficient later ingredient leaves all stocks unchanged', () => {
  const s = fixture();
  s.ingredients[1].stock = 0;
  const before = structuredClone(s);
  assert.throws(() =>
    deductIngredients(
      s,
      new Map([
        ['milk', 300],
        ['cup', 1],
      ]),
      'test',
      'today',
    ),
  );
  assert.deepEqual(s, before);
});
test('repeated products aggregate stock across sizes', () => {
  const s = fixture();
  const q = quoteSale(
    s,
    [
      { productId: 'matcha', size: 0, quantity: 2 },
      { productId: 'matcha', size: 2, quantity: 1 },
    ],
    0,
  );
  assert.equal(q.needs.get('milk'), 600);
});
test('cannot sell missing recipe, unknown or duplicate extras', () => {
  const s = fixture();
  assert.throws(() =>
    quoteSale(
      s,
      [{ productId: 'matcha', size: 0, quantity: 1, modifierIds: ['extra', 'extra'] }],
      0,
    ),
  );
  s.products[0].recipes = [];
  assert.throws(() => quoteSale(s, [{ productId: 'matcha', size: 0, quantity: 1 }], 0));
});
test('cash excludes cards and other shifts', () => {
  const s = fixture(),
    cash = { id: 'session', openedAt: 'now', opening: 50000 };
  const base = {
    id: 'sale',
    date: 'now',
    sessionId: 'session',
    items: [],
    subtotal: 10000,
    discount: 0,
    total: 10000,
    cost: 0,
    payment: 'Efectivo' ,
    received: 10000,
    change: 0,
  };
  s.sales = [
    base,
    { ...base, id: 'card', payment: 'Tarjeta' },
    { ...base, id: 'old', sessionId: 'old' },
  ];
  assert.equal(expectedCash(s, cash), 60000);
});
test('WhatsApp has correct quantities total and confirmation wording', () => {
  const text = whatsappText(
    initialProducts,
    [{ productId: 'matcha', size: 2, quantity: 2 }],
    'Sin azúcar',
  );
  assert.match(text, /2 × Matcha latte/);
  assert.match(text, /300/);
  assert.match(text, /Sin azúcar/);
  assert.match(text, /confirman disponibilidad/);
});
