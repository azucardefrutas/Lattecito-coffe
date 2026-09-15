import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
mkdirSync('test-results', { recursive: true });
const dir = mkdtempSync(path.resolve('test-results', 'integration-'));
const processes = [];
for (const [surface, port] of [
  ['public', 3100],
  ['admin', 3101],
]) {
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      env: {
        ...process.env,
        APP_SURFACE: surface,
        LATTECITO_DATA_DIR: dir,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stderr.on('data', (d) => process.stderr.write(d));
  processes.push(child);
}
const base = 'http://127.0.0.1:3101';
let cookie = '';
async function call(body, expect = 200, origin = base) {
  const r = await fetch(base + '/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  assert.equal(r.status, expect, text);
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return JSON.parse(text);
}
async function state() {
  return (await fetch(base + '/api/admin', { headers: { Cookie: cookie } })).json();
}
async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await delay(300);
  }
  throw new Error('Server startup timed out');
}
try {
  await Promise.all([waitFor(base), waitFor('http://127.0.0.1:3100')]);
  assert.equal((await fetch('http://127.0.0.1:3100/admin')).status, 404);
  assert.equal((await fetch('http://127.0.0.1:3100/api/admin')).status, 404);
  assert.equal((await fetch(base + '/api/menu')).status, 404);
  assert.equal((await fetch(base + '/api/admin')).status, 401);
  await call({ action: 'login', password: 'test-only-latte-2026' }, 403, 'http://evil.invalid');
  await call({ action: 'login', password: 'test-only-latte-2026' });
  await call({
    action: 'ingredient',
    ingredient: { id: '', name: 'Leche de prueba', unit: 'ml', minimum: 100, costPerUnit: 3 },
  });
  let s = await state();
  const ingredient = s.ingredients[0];
  await call({
    action: 'stock',
    productId: ingredient.id,
    quantity: 1000,
    reason: 'Fixture de prueba aislada',
  });
  const p = s.products[1];
  p.recipes = [0, 1, 2].map(() => [{ ingredientId: ingredient.id, quantity: 250 }]);
  await call({ action: 'product', product: p });
  await call({ action: 'open', opening: 50000 });
  const sale = {
    action: 'sale',
    id: crypto.randomUUID(),
    customer: 'Prueba aislada',
    lines: [{ productId: p.id, size: 2, quantity: 2 }],
    discount: 10,
    payment: 'Efectivo',
    received: 30000,
  };
  const [a, b] = await Promise.all([call(sale), call(sale)]);
  assert.equal(a.id, b.id);
  assert.equal(a.total, 27000);
  assert.equal(a.change, 3000);
  s = await state();
  assert.equal(s.sales.length, 1);
  assert.equal(s.ingredients[0].stock, 500);
  assert.equal(s.sales[0].status, 'Pendiente');
  const failed = {
    ...sale,
    id: crypto.randomUUID(),
    lines: [{ productId: p.id, size: 2, quantity: 3 }],
    received: 50000,
  };
  await call(failed, 400);
  s = await state();
  assert.equal(s.sales.length, 1);
  assert.equal(s.ingredients[0].stock, 500);
  await call({ ...sale, id: crypto.randomUUID(), received: 100 }, 400);
  const publicMenu = await (await fetch('http://127.0.0.1:3100/api/menu')).json();
  assert.equal(publicMenu.products.find((x) => x.id === p.id).prices[2], 15000);
  assert.ok(!('cost' in publicMenu.products[0]));
  assert.ok(!('recipes' in publicMenu.products[0]));
  await call({ action: 'status', id: a.id, status: 'Preparando' });
  await call({ action: 'close', counted: 76900 });
  s = await state();
  assert.equal(s.cash[0].expected, 77000);
  assert.equal(s.cash[0].counted, 76900);
  assert.ok(s.cash[0].closedAt);
  await call({ ...sale, id: crypto.randomUUID() }, 400);
  await call({ action: 'refund', saleId: a.id, reason: 'Sin caja abierta', restock: true }, 400);
  const closedCash = structuredClone(s.cash[0]);
  await call({ action: 'open', opening: 50000 });
  await call({
    action: 'stock',
    productId: ingredient.id,
    quantity: 0.125,
    reason: 'Ajuste decimal de prueba',
  });
  await call(
    { action: 'stock', productId: ingredient.id, quantity: 0.0001, reason: 'Precisión inválida' },
    400,
  );
  await call({
    action: 'ingredient',
    ingredient: { id: '', name: 'Vaso de prueba', unit: 'pieza', minimum: 1, costPerUnit: 100 },
  });
  s = await state();
  const cup = s.ingredients.find((i) => i.unit === 'pieza');
  await call(
    { action: 'stock', productId: cup.id, quantity: 0.5, reason: 'Pieza fraccionada' },
    400,
  );
  await call(
    {
      action: 'product',
      product: { ...p, recipes: [[{ ingredientId: cup.id, quantity: 0.5 }], [], []] },
    },
    400,
  );
  await call({
    action: 'modifier',
    modifier: {
      id: '',
      name: 'Leche extra',
      price: 1000,
      recipe: [{ ingredientId: ingredient.id, quantity: 0.125 }],
      active: true,
      productIds: [p.id],
    },
  });
  s = await state();
  const extra = s.modifiers[0];
  let menu = await (await fetch('http://127.0.0.1:3100/api/menu')).json();
  assert.equal(menu.modifiers[0].price, 1000);
  assert.ok(!('recipe' in menu.modifiers[0]));
  await call({ action: 'modifier', modifier: { ...extra, active: false } });
  menu = await (await fetch('http://127.0.0.1:3100/api/menu')).json();
  assert.equal(menu.modifiers.length, 0);
  await call(
    {
      ...sale,
      id: crypto.randomUUID(),
      lines: [{ productId: p.id, size: 2, quantity: 1, modifierIds: [extra.id] }],
    },
    400,
  );
  await call({ action: 'modifier', modifier: { ...extra, active: true, productIds: null } });
  s = await state();
  assert.equal(s.modifiers[0].productIds, null);
  await call({ action: 'modifier', modifier: { ...extra, active: true } });
  // Editing the recipe must not change the amounts restored by an older ticket.
  await call({
    action: 'product',
    product: {
      ...p,
      recipes: [0, 1, 2].map(() => [{ ingredientId: ingredient.id, quantity: 500 }]),
    },
  });
  const correction = {
    action: 'refund',
    saleId: a.id,
    reason: 'Pedido duplicado en prueba',
    restock: true,
  };
  const [refund1, refund2] = await Promise.all([call(correction), call(correction)]);
  assert.equal(refund1.refund.id, refund2.refund.id);
  s = await state();
  assert.equal(s.ingredients.find((i) => i.id === ingredient.id).stock, 1000.125);
  assert.deepEqual(
    s.cash.find((c) => c.id === closedCash.id),
    closedCash,
  );
  assert.equal(s.sales[0].total, 27000);
  assert.equal(s.sales[0].refund.amount, 27000);
  await call({ action: 'status', id: a.id, status: 'Preparando' }, 400);
  await call({ action: 'close', counted: 23000 });
  s = await state();
  assert.equal(s.cash[0].expected, 23000);
  await call({ action: 'open', opening: 10000 });
  const extraSale = await call({
    ...sale,
    id: crypto.randomUUID(),
    lines: [{ productId: p.id, size: 2, quantity: 1, modifierIds: [extra.id] }],
    discount: 0,
    payment: 'Tarjeta',
    received: 16000,
  });
  assert.equal(extraSale.total, 16000);
  assert.match(extraSale.items[0].name, /Leche extra/);
  s = await state();
  assert.equal(s.ingredients.find((i) => i.id === ingredient.id).stock, 500);
  await call({
    action: 'refund',
    saleId: extraSale.id,
    reason: 'Bebida preparada rechazada',
    restock: false,
  });
  s = await state();
  assert.equal(s.ingredients.find((i) => i.id === ingredient.id).stock, 500);
  await call({ action: 'close', counted: 10000 });
  s = await state();
  assert.equal(s.cash[0].expected, 10000);
  // Keep a new unpaid-to-provider test record available for UI correction checks.
  await call({ action: 'open', opening: 50000 });
  await call({
    action: 'stock',
    productId: ingredient.id,
    quantity: 1000,
    reason: 'Insumos para revisión visual',
  });
  await call({
    ...sale,
    id: crypto.randomUUID(),
    customer: 'Verificación visual',
    lines: [{ productId: p.id, size: 2, quantity: 1, modifierIds: [extra.id] }],
    discount: 10,
    payment: 'Transferencia',
    received: 14400,
  });
  console.log(
    'PASS: port isolation, private access, CSRF, catalog and extra sync, decimal units, payment validation, concurrent sale/refund idempotency, original inventory restoration, waste, closed-cut preservation, card refunds, kitchen status.',
  );
  console.log('Test data directory:', dir);
  if (process.argv.includes('--keep')) {
    console.log(
      'Test servers kept at 3100/3101 for browser QA. Test-only login: test-only-latte-2026',
    );
    await new Promise((resolve) => process.once('SIGINT', resolve));
  }
} finally {
  for (const child of processes) child.kill();
}
