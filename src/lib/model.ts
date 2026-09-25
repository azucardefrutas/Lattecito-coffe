export type RecipeItem = { ingredientId: string; quantity: number };
export type Ingredient = {
  id: string;
  name: string;
  unit: 'g' | 'ml' | 'pieza';
  stock: number;
  minimum: number;
  costPerUnit: number;
};
export type Modifier = {
  id: string;
  name: string;
  price: number;
  recipe: RecipeItem[];
  active?: boolean;
  productIds?: string[] | null;
};
export type MenuModifier = Omit<Modifier, 'recipe'>;
export type Product = {
  id: string;
  name: string;
  kind?: 'drink' | 'snack' | 'merch';
  category: string;
  description: string;
  prices: number[];
  cost: number[];
  stock: number;
  active: boolean;
  tone: string;
  imageUrl?: string;
  recipes?: RecipeItem[][];
};
export type Line = { productId: string; size: number; quantity: number; modifierIds?: string[] };
export type Sale = {
  id: string;
  date: string;
  sessionId: string;
  items: {
    productId?: string;
    productName?: string;
    sizeIndex?: number;
    name: string;
    size: string;
    quantity: number;
    baseUnitPrice?: number;
    extras?: { id: string; name: string; unitPrice: number }[];
    unitPrice: number;
    cost: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  cost: number;
  payment: string;
  received: number;
  change: number;
  customer?: string;
  status?: 'Pendiente' | 'Preparando' | 'Listo' | 'Entregado';
  number?: number;
  consumed?: RecipeItem[];
  refund?: {
    id: string;
    date: string;
    sessionId: string;
    reason: string;
    restocked: boolean;
    amount: number;
    payment: string;
  };
};
export type Cash = {
  id: string;
  openedAt: string;
  opening: number;
  closedAt?: string;
  counted?: number;
  expected?: number;
};
export type Movement = {
  id: string;
  date: string;
  productId: string;
  quantity: number;
  reason: string;
};
export type Settings = { phones: string[]; address: string; hours: string; sample: boolean };
export type Store = {
  products: Product[];
  sales: Sale[];
  cash: Cash[];
  movements: Movement[];
  settings: Settings;
  ingredients: Ingredient[];
  modifiers: Modifier[];
};
export const sizes = ['Chico', 'Mediano', 'Grande'];
export const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const initialProducts: Product[] = [
  {
    id: 'latte',
    name: 'Latte de la casa',
    category: 'Cafés',
    description: 'Espresso, leche cremosa y una pausa que sabe bien. Frío o caliente, a tu manera.',
    prices: [5500, 7000, 8500],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'coffee',
  },
  {
    id: 'matcha',
    name: 'Matcha latte',
    category: 'Matcha',
    description: 'Un momento de calma. Matcha y leche en una mezcla suave y delicada.',
    prices: [5000, 10000, 15000],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'matcha',
  },
  {
    id: 'boba',
    name: 'Boba latte',
    category: 'Bobas',
    description: 'Leche, café y perlas de tapioca. Pequeños momentos de felicidad.',
    prices: [6500, 8500, 10000],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'boba',
  },
  {
    id: 'caramel',
    name: 'Caramel latte',
    category: 'Cafés',
    description: 'Café con leche y un toque de caramelo para endulzar tu día.',
    prices: [6000, 8000, 9500],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'caramel',
  },
  {
    id: 'frappe',
    name: 'Frappé de chocolate',
    category: 'Frappés',
    description: 'Chocolate, hielo y una textura deliciosamente cremosa.',
    prices: [6000, 8000, 9500],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'cocoa',
  },
  {
    id: 'americano',
    name: 'Americano',
    category: 'Cafés',
    description: 'El carácter del espresso, con el espacio para disfrutarlo despacio.',
    prices: [3500, 4500, 5500],
    cost: [0, 0, 0],
    stock: 0,
    active: true,
    tone: 'dark',
  },
];
export function availableModifiers(
  productId: string,
  modifiers: MenuModifier[],
  kind: Product['kind'] = 'drink',
) {
  return modifiers.filter(
    (m) =>
      m.active !== false &&
      kind !== 'merch' &&
      (m.productIds?.includes(productId) || (!m.productIds && kind !== 'snack')),
  );
}
export function resolveModifiers(
  line: Line,
  modifiers: MenuModifier[],
  kind: Product['kind'] = 'drink',
) {
  const ids = line.modifierIds ?? [];
  if (ids.length > 20 || new Set(ids).size !== ids.length)
    throw new Error('Revisa los extras: no pueden repetirse.');
  return ids.map((id) => {
    const modifier = availableModifiers(line.productId, modifiers, kind).find((m) => m.id === id);
    if (!modifier) throw new Error('Un extra ya no está disponible para esta bebida.');
    return modifier;
  });
}
export function calculate(
  products: Product[],
  lines: Line[],
  discountPercent = 0,
  modifiers: MenuModifier[] = [],
) {
  if (
    !lines.length ||
    lines.length > 100 ||
    !Number.isInteger(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  )
    throw new Error('Revisa el pedido y el descuento.');
  const items = lines.map((line) => {
    const p = products.find((p) => p.id === line.productId && p.active);
    if (
      !p ||
      !Number.isInteger(line.size) ||
      line.size < 0 ||
      line.size > 2 ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 99
    )
      throw new Error('Producto o cantidad inválidos.');
    if ((p.kind === 'snack' || p.kind === 'merch') && line.size !== 0)
      throw new Error('Los snacks y la mercancía se registran por pieza.');
    const extras = resolveModifiers(line, modifiers, p.kind);
    return {
      productId: p.id,
      productName: p.name,
      sizeIndex: line.size,
      name: p.name,
      size: p.kind === 'snack' || p.kind === 'merch' ? 'Pieza' : sizes[line.size],
      quantity: line.quantity,
      baseUnitPrice: p.prices[line.size],
      extras: extras.map((extra) => ({
        id: extra.id,
        name: extra.name,
        unitPrice: extra.price,
      })),
      unitPrice: p.prices[line.size] + extras.reduce((sum, m) => sum + m.price, 0),
      cost: p.cost[line.size],
    };
  });
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const cost = items.reduce((s, i) => s + i.cost * i.quantity, 0);
  const discount = Math.round((subtotal * discountPercent) / 100);
  return { items, subtotal, discount, total: subtotal - discount, cost };
}
export function expectedCash(store: Store, session: Cash) {
  return (
    session.opening +
    store.sales
      .filter((s) => s.sessionId === session.id && s.payment === 'Efectivo')
      .reduce((a, s) => a + s.total, 0) -
    store.sales
      .filter((s) => s.refund?.sessionId === session.id && s.refund.payment === 'Efectivo')
      .reduce((sum, s) => sum + s.refund!.amount, 0)
  );
}
export function whatsappText(
  products: Product[],
  lines: Line[],
  note: string,
  modifiers: MenuModifier[] = [],
) {
  const t = calculate(products, lines, 0, modifiers);
  return `Hola, Lattecito Coffee. Me gustaría pedir:\n\n${t.items.map((i) => `${i.quantity} × ${i.name}${i.extras?.length ? ` + ${i.extras.map((extra) => extra.name).join(', ')}` : ''} · ${i.size}`).join('\n\n')}\n\n${note.trim() ? `Notas: ${note.trim()}\n` : ''}¿Me confirman disponibilidad y tiempo de preparación?`;
}
export function quoteSale(store: Store, lines: Line[], percent: number) {
  const base = calculate(store.products, lines, percent, store.modifiers);
  const needs = new Map<string, number>();
  const items = base.items.map((item, index) => {
    const line = lines[index],
      product = store.products.find((p) => p.id === line.productId)!;
    const recipe = product.recipes?.[line.size];
    if (!recipe?.length)
      throw new Error(`Configura la receta de ${product.name} ${sizes[line.size]}.`);
    const modifiers = (line.modifierIds ?? []).map((id) => {
      const m = store.modifiers.find((m) => m.id === id);
      if (!m) throw new Error('Extra no disponible.');
      return m;
    });
    if (new Set(line.modifierIds).size !== (line.modifierIds ?? []).length)
      throw new Error('Extra duplicado.');
    let cost = 0;
    for (const r of [...recipe, ...modifiers.flatMap((m) => m.recipe)]) {
      const ingredient = store.ingredients.find((i) => i.id === r.ingredientId);
      if (!ingredient) throw new Error('La receta contiene un insumo inexistente.');
      validateQuantity(r.quantity, ingredient.unit);
      needs.set(r.ingredientId, (needs.get(r.ingredientId) ?? 0) + r.quantity * line.quantity);
      cost += r.quantity * ingredient.costPerUnit;
    }
    return {
      ...item,
      cost: Math.round(cost),
    };
  });
  const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0),
    discount = Math.round((subtotal * percent) / 100),
    cost = items.reduce((a, i) => a + i.cost * i.quantity, 0);
  return { items, subtotal, discount, total: subtotal - discount, cost, needs };
}
export function deductIngredients(
  store: Store,
  needs: Map<string, number>,
  reason: string,
  date: string,
) {
  for (const [id, quantity] of needs) {
    const ingredient = store.ingredients.find((i) => i.id === id);
    if (!ingredient || ingredient.stock + 0.000001 < quantity)
      throw new Error(`Insumo insuficiente: ${ingredient?.name ?? id}.`);
  }
  for (const [id, quantity] of needs) {
    const ingredient = store.ingredients.find((i) => i.id === id)!;
    ingredient.stock = Math.round((ingredient.stock - quantity) * 1000) / 1000;
    store.movements.unshift({
      id: crypto.randomUUID(),
      date,
      productId: id,
      quantity: -quantity,
      reason,
    });
  }
}

// Work in thousandths for stock; physical pieces always remain whole.
export function validateQuantity(
  quantity: number,
  unit: Ingredient['unit'],
  allowNegative = false,
) {
  if (
    !Number.isFinite(quantity) ||
    quantity === 0 ||
    (!allowNegative && quantity < 0) ||
    Math.abs(quantity) > 100000 ||
    Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001
  )
    throw new Error('Usa una cantidad distinta de cero, con un máximo de tres decimales.');
  if (unit === 'pieza' && !Number.isInteger(quantity))
    throw new Error('Las piezas deben registrarse en cantidades enteras.');
}
export function adjustStock(
  store: Store,
  id: string,
  quantity: number,
  reason: string,
  date: string,
) {
  const ingredient = store.ingredients.find((i) => i.id === id);
  if (!ingredient) throw new Error('Insumo no encontrado.');
  validateQuantity(quantity, ingredient.unit, true);
  const next = Math.round(ingredient.stock * 1000) + Math.round(quantity * 1000);
  if (next < 0) throw new Error('El inventario no puede quedar negativo.');
  ingredient.stock = next / 1000;
  store.movements.unshift({ id: crypto.randomUUID(), date, productId: id, quantity, reason });
}
export function refundSale(
  store: Store,
  saleId: string,
  reason: string,
  restock: boolean,
  date: string,
) {
  const sale = store.sales.find((s) => s.id === saleId);
  if (!sale) throw new Error('Venta no encontrada.');
  // A sale can be fully refunded once, including retries after connection loss.
  if (sale.refund) return sale;
  const session = store.cash.find((c) => !c.closedAt);
  if (!session) throw new Error('Abre una caja para registrar la devolución.');
  if (reason.trim().length < 5 || reason.trim().length > 300)
    throw new Error('Indica el motivo de la corrección (5 a 300 caracteres).');
  if (sale.payment === 'Efectivo' && expectedCash(store, session) < sale.total)
    throw new Error('La caja no tiene suficiente efectivo esperado para esta devolución.');
  const consumed =
    sale.consumed ??
    store.movements
      .filter((m) => m.reason === `Venta ${sale.id}` && m.quantity < 0)
      .map((m) => ({ ingredientId: m.productId, quantity: -m.quantity }));
  if (restock) {
    if (!consumed.length)
      throw new Error(
        'Esta venta no tiene un consumo recuperable. Registra la corrección sin reponer insumos.',
      );
    for (const item of consumed) {
      if (!store.ingredients.some((i) => i.id === item.ingredientId))
        throw new Error('No se pueden recuperar todos los insumos de la venta.');
    }
    for (const item of consumed) {
      const ingredient = store.ingredients.find((i) => i.id === item.ingredientId)!;
      ingredient.stock =
        (Math.round(ingredient.stock * 1000) + Math.round(item.quantity * 1000)) / 1000;
      store.movements.unshift({
        id: crypto.randomUUID(),
        date,
        productId: ingredient.id,
        quantity: item.quantity,
        reason: `Reposición por corrección ${sale.id}: ${reason.trim()}`,
      });
    }
  }
  sale.refund = {
    id: crypto.randomUUID(),
    date,
    sessionId: session.id,
    reason: reason.trim(),
    restocked: restock,
    amount: sale.total,
    payment: sale.payment,
  };
  return sale;
}
export function daySummary(store: Store, day: string) {
  const onDay = (date: string) => new Date(date).toLocaleDateString('en-CA') === day;
  const sales = store.sales.filter((s) => onDay(s.date));
  const refunds = store.sales.filter((s) => s.refund && onDay(s.refund.date));
  const gross = sales.reduce((sum, s) => sum + s.total, 0),
    returned = refunds.reduce((sum, s) => sum + s.refund!.amount, 0);
  const cost =
    sales.reduce((sum, s) => sum + s.cost, 0) -
    refunds.filter((s) => s.refund!.restocked).reduce((sum, s) => sum + s.cost, 0);
  return { sales, refunds, gross, returned, net: gross - returned, cost };
}
