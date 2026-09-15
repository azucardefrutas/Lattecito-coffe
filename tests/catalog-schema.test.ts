import assert from 'node:assert/strict';
import test from 'node:test';
import snapshot from '../src/data/public-menu.json' with { type: 'json' };
import { catalogSchema } from '../src/lib/catalog-schema.ts';

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
