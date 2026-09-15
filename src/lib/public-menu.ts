import type { Store } from './model.ts';

// Explicit allowlist: never publish stock, costs, recipes, sales or authentication.
export function publicMenu(s: Store) {
  return {
    products: s.products
      .filter((p) => p.active)
      .map(({ id, name, category, description, prices, active, tone }) => ({
        id,
        name,
        category,
        description,
        prices,
        active,
        tone,
      })),
    settings: {
      phones: s.settings.phones,
      address: s.settings.address,
      hours: s.settings.hours,
      sample: s.settings.sample,
    },
    modifiers: s.modifiers
      .filter((m) => m.active !== false)
      .map(({ id, name, price, active, productIds }) => ({
        id,
        name,
        price,
        active,
        productIds,
      })),
  };
}
