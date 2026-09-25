import assert from 'node:assert/strict';
import test from 'node:test';
import snapshot from '../src/data/public-menu.json' with { type: 'json' };
import { catalogSchema, removeCatalogProduct } from '../src/lib/catalog-schema.ts';

test('the published snapshot is a valid editable catalog', () => {
  assert.doesNotThrow(() => catalogSchema.parse(snapshot));
});

test('catalog accepts secure product photos', () => {
  const catalog = structuredClone(catalogSchema.parse(snapshot));
  catalog.products[0] = {
    ...catalog.products[0],
    imageUrl: 'https://example.com/latte.webp',
  };
  assert.equal(catalogSchema.parse(catalog).products[0].imageUrl, catalog.products[0].imageUrl);
});

test('catalog rejects duplicate products and incompatible extras', () => {
  const duplicate = structuredClone(snapshot);
  duplicate.products.push({ ...duplicate.products[0] });
  assert.throws(() => catalogSchema.parse(duplicate), /duplicados/);

  const dangling = structuredClone(snapshot) as unknown as Record<string, unknown>;
  dangling.modifiers = [
    {
      id: 'leche-extra',
      name: 'Leche extra',
      price: 1000,
      active: true,
      productIds: ['producto-inexistente'],
    },
  ];
  assert.throws(() => catalogSchema.parse(dangling), /inexistente/);
});

test('catalog rejects non-HTTPS image addresses', () => {
  const catalog = structuredClone(catalogSchema.parse(snapshot));
  catalog.products[0] = {
    ...catalog.products[0],
    imageUrl: 'http://example.com/latte.jpg',
  };
  assert.throws(() => catalogSchema.parse(catalog), /HTTPS/);
});

test('catalog supports snacks and cleanly removes product references', () => {
  const catalog = structuredClone(catalogSchema.parse(snapshot));
  const snack = {
    ...catalog.products[0],
    id: 'brownie-cacao',
    name: 'Brownie de cacao',
    kind: 'snack' as const,
    category: 'Snacks y repostería',
    prices: [5000, 5000, 5000],
  };
  catalog.products.push(snack);
  catalog.modifiers = [
    {
      id: 'helado',
      name: 'Bola de helado',
      price: 1500,
      active: true,
      productIds: [snack.id],
    },
  ];
  const saved = catalogSchema.parse(catalog);
  assert.equal(saved.products.at(-1)?.kind, 'snack');
  const removed = removeCatalogProduct(saved, snack.id);
  assert.equal(
    removed.products.some((product) => product.id === snack.id),
    false,
  );
  assert.deepEqual(removed.modifiers[0].productIds, []);
  assert.doesNotThrow(() => catalogSchema.parse(removed));
});

test('catalog accepts merchandise with one repeated unit price', () => {
  const catalog = structuredClone(catalogSchema.parse(snapshot));
  catalog.products.push({
    ...catalog.products[0],
    id: 'llavero-lattecito',
    name: 'Llavero Lattecito',
    kind: 'merch',
    category: 'Merch de Lattecito',
    description: 'Llavero oficial de Lattecito Coffee.',
    prices: [8000, 8000, 8000],
    tone: 'dark',
  });
  const saved = catalogSchema.parse(catalog);
  assert.equal(saved.products.at(-1)?.kind, 'merch');
  assert.deepEqual(saved.products.at(-1)?.prices, [8000, 8000, 8000]);
});
