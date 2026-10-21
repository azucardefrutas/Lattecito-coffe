import { z } from 'zod';

const cents = z.number().int().min(0).max(100_000_000);
export const DEFAULT_CUP_SIZES = ['Chico', 'Mediano', 'Grande'] as const;
const cupSizesSchema = z
  .array(z.string().trim().min(2).max(30))
  .min(1)
  .max(10)
  .default([...DEFAULT_CUP_SIZES]);
const imageUrl = z
  .url()
  .max(2_000)
  .refine((value) => value.startsWith('https://'), 'La imagen debe usar HTTPS.');

export const catalogProductSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,80}$/),
  name: z.string().trim().min(2).max(100),
  kind: z.enum(['drink', 'snack', 'merch']).default('drink'),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().min(5).max(500),
  prices: z.array(cents).min(1).max(10),
  active: z.boolean(),
  tone: z.enum(['coffee', 'matcha', 'boba', 'caramel', 'cocoa', 'dark']),
  imageUrl: imageUrl.optional(),
});

export const catalogModifierSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,80}$/),
  name: z.string().trim().min(2).max(100),
  price: cents,
  active: z.boolean().optional(),
  productIds: z.array(z.string().trim().min(1).max(80)).max(500).nullable().optional(),
});

export const catalogSettingsSchema = z.object({
  phones: z
    .array(z.string().regex(/^52\d{10}$/))
    .min(1)
    .max(2),
  address: z.string().trim().max(300),
  hours: z.string().trim().max(300),
  sample: z.boolean(),
});

export const catalogSchema = z
  .object({
    sizes: cupSizesSchema,
    products: z.array(catalogProductSchema).max(500),
    modifiers: z.array(catalogModifierSchema).max(500),
    settings: catalogSettingsSchema,
  })
  .superRefine((catalog, context) => {
    const productIds = new Set(catalog.products.map((product) => product.id));
    if (productIds.size !== catalog.products.length)
      context.addIssue({ code: 'custom', message: 'Hay identificadores de producto duplicados.' });
    const modifierIds = new Set(catalog.modifiers.map((modifier) => modifier.id));
    if (modifierIds.size !== catalog.modifiers.length)
      context.addIssue({ code: 'custom', message: 'Hay identificadores de extra duplicados.' });
    const normalizedSizes = catalog.sizes.map((size) => size.toLocaleLowerCase('es-MX'));
    if (new Set(normalizedSizes).size !== normalizedSizes.length)
      context.addIssue({ code: 'custom', message: 'Los tamaños de vaso no pueden repetirse.' });
    for (const product of catalog.products)
      if (product.kind === 'drink' && product.prices.length !== catalog.sizes.length)
        context.addIssue({
          code: 'custom',
          message: `La bebida ${product.name} debe tener un precio por cada tamaño.`,
        });
    for (const modifier of catalog.modifiers)
      if (modifier.productIds?.some((id) => !productIds.has(id)))
        context.addIssue({
          code: 'custom',
          message: `El extra ${modifier.name} apunta a un producto inexistente.`,
        });
  });

export type PublicCatalog = z.infer<typeof catalogSchema>;
export type CatalogProduct = z.infer<typeof catalogProductSchema>;
export type CatalogModifier = z.infer<typeof catalogModifierSchema>;

export function removeCatalogProduct(catalog: PublicCatalog, productId: string): PublicCatalog {
  return {
    ...catalog,
    products: catalog.products.filter((product) => product.id !== productId),
    modifiers: catalog.modifiers.map((modifier) => ({
      ...modifier,
      productIds: modifier.productIds?.filter((id) => id !== productId) ?? modifier.productIds,
    })),
  };
}
