import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMenu, publishCatalog } from '../src/lib/public-menu.ts';
import { initialProducts, type Store } from '../src/lib/model.ts';
import type { PublicCatalog } from '../src/lib/catalog-schema.ts';
import snapshot from '../src/data/public-menu.json' with { type: 'json' };

test('the published catalog excludes internal business data and hidden products/extras', () => {
  const store = {
    products: [
      { ...initialProducts[0], cost: [123, 456, 789], stock: 999 },
      { ...initialProducts[1], active: false },
    ],
    modifiers: [
      {
        id: 'extra',
        name: 'Extra público',
        price: 100,
        recipe: [{ ingredientId: 'secret', quantity: 10 }],
        productIds: ['latte'],
      },
      { id: 'hidden', name: 'Oculto', price: 100, active: false, recipe: [] },
    ],
    settings: {
      phones: ['529841651702'],
      address: '',
      hours: '',
      sample: true,
      secret: 'never-publish',
    },
    sales: [{ customer: 'never-publish' }],
    ingredients: [{ stock: 100 }],
    cash: [],
    movements: [],
  } as unknown as Store;
  const menu = publicMenu(store);
  assert.equal(menu.products.length, 1);
  assert.equal(menu.modifiers.length, 1);
  assert.equal(menu.products[0].prices[0], initialProducts[0].prices[0]);
  assert.deepEqual(Object.keys(menu).sort(), ['modifiers', 'products', 'settings']);
  assert.deepEqual(Object.keys(menu.products[0]).sort(), [
    'active',
    'category',
    'description',
    'id',
    'name',
    'prices',
    'tone',
  ]);
  assert.deepEqual(Object.keys(menu.settings).sort(), ['address', 'hours', 'phones', 'sample']);
  assert.equal(JSON.stringify(menu).includes('never-publish'), false);
  assert.equal('recipe' in menu.modifiers[0], false);
});

test('deployment snapshot contains only the public catalog fields and configured business contacts', () => {
  assert.deepEqual(Object.keys(snapshot).sort(), ['modifiers', 'products', 'settings']);
  assert.ok(snapshot.products.length > 0);
  assert.deepEqual(snapshot.settings.phones, ['529841651702', '529831137618']);
  for (const product of snapshot.products) {
    assert.deepEqual(Object.keys(product).sort(), [
      'active',
      'category',
      'description',
      'id',
      'name',
      'prices',
      'tone',
    ]);
  }
});

test('cloud publication keeps edited drinks and hides disabled drinks and extras', () => {
  const catalog = {
    ...snapshot,
    products: [
      { ...snapshot.products[0], name: 'Nuevo latte', prices: [4900, 5900, 6900] },
      { ...snapshot.products[1], active: false },
    ],
    modifiers: [
      { id: 'shot', name: 'Shot extra', price: 1000, active: true },
      { id: 'oculto', name: 'Extra oculto', price: 500, active: false },
    ],
  } as PublicCatalog;
  const published = publishCatalog(catalog);
  assert.deepEqual(published.products.map((product) => product.name), ['Nuevo latte']);
  assert.deepEqual(published.products[0].prices, [4900, 5900, 6900]);
  assert.deepEqual(published.modifiers.map((modifier) => modifier.id), ['shot']);
});
