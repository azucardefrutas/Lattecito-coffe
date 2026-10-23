import assert from 'node:assert/strict';
import test from 'node:test';
import { galleryMetadataSchema, galleryUpdateSchema } from '../src/lib/gallery-schema.ts';

test('gallery metadata accepts optimized public photos', () => {
  const parsed = galleryMetadataSchema.parse({
    title: 'Nuestro primer puesto',
    description: 'Preparando bebidas durante una actividad escolar.',
    altText: 'Mesa de Lattecito con bebidas frías y letrero del proyecto',
    category: 'eventos',
    width: 1600,
    height: 1200,
    published: true,
  });
  assert.equal(parsed.category, 'eventos');
  assert.equal(parsed.published, true);
});

test('gallery updates reject invalid categories and empty accessible text', () => {
  assert.throws(() =>
    galleryUpdateSchema.parse({
      id: crypto.randomUUID(),
      title: 'Foto',
      description: '',
      altText: '',
      category: 'privado',
      sortOrder: 0,
      published: true,
    }),
  );
});
