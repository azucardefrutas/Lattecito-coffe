import { createClient } from '@supabase/supabase-js';
import snapshot from '@/data/public-menu.json';
import { catalogSchema, type PublicCatalog } from './catalog-schema';
import {
  inventoryItemInputSchema,
  inventoryRecipeInputSchema,
  validateUnitQuantity,
  type InventoryItem,
  type InventoryMovement,
  type InventoryRecipe,
  type InventoryState,
} from './inventory-schema';
import { calculate, sizes, type Line, type Product } from './model';
import {
  dailySalesBreakdown,
  type DailySalesBreakdown,
  type DetailedSaleItem,
} from './sales-summary';

type UserRole = 'admin' | 'developer';

export type MobileUser = { username: string; role: UserRole };
export type MobileSale = {
  id: string;
  number: number;
  date: string;
  createdBy: string;
  confirmedBy: string;
  customer: string;
  note: string;
  items: DetailedSaleItem[];
  subtotal: number;
  total: number;
  cost: number;
  payment: 'Efectivo' | 'Transferencia';
  paymentStatus: 'Pagado' | 'Pendiente';
  received: number;
  change: number;
};

export type ArchivedSalesDay = {
  date: string;
  tickets: number;
  total: number;
  cash: number;
  transfers: number;
  pendingTransfers: number;
  cost: number;
};

export class SupabaseConflictError extends Error {}

let ready: Promise<void> | null = null;

function serverClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('La base de datos central todavía no está conectada.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'lattecito-server' } },
  });
}

export function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function databaseError(message: string, error: { message?: string } | null) {
  if (error) console.error(message, error.message);
  return new Error(message);
}

export async function ensureSupabase() {
  if (ready) return ready;
  ready = (async () => {
    const client = serverClient();
    const { data, error } = await client
      .from('catalog_state')
      .select('id')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw databaseError('No fue posible preparar el catálogo central.', error);
    if (!data) {
      const catalog = catalogSchema.parse(snapshot);
      const seeded = await client.from('catalog_state').insert({ id: 1, catalog });
      if (seeded.error)
        throw databaseError('No fue posible crear el catálogo central.', seeded.error);
    }
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function readSupabaseCatalog(): Promise<{
  catalog: PublicCatalog;
  etag: string;
  source: 'supabase';
}> {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('catalog_state')
    .select('catalog, version')
    .eq('id', 1)
    .single();
  if (error || !data) throw databaseError('No fue posible leer el catálogo central.', error);
  return {
    catalog: catalogSchema.parse(data.catalog),
    etag: String(data.version),
    source: 'supabase',
  };
}

export async function saveSupabaseCatalog(catalog: PublicCatalog, etag: string | null) {
  await ensureSupabase();
  if (!etag || !/^\d+$/.test(etag))
    throw new SupabaseConflictError('Actualiza el catálogo antes de guardar.');
  const parsed = catalogSchema.parse(catalog);
  const { data, error } = await serverClient()
    .from('catalog_state')
    .update({ catalog: parsed, version: Number(etag) + 1, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .eq('version', Number(etag))
    .select('version')
    .maybeSingle();
  if (error) throw databaseError('No fue posible guardar el catálogo.', error);
  if (!data)
    throw new SupabaseConflictError(
      'El menú cambió en otra pantalla. Actualiza los datos y vuelve a intentar.',
    );
  return { etag: String(data.version) };
}

async function readCosts() {
  await ensureSupabase();
  const { data, error } = await serverClient().from('product_costs').select('product_id, costs');
  if (error) throw databaseError('No fue posible leer los costos.', error);
  return new Map(
    (data ?? []).map((row) => [
      String(row.product_id),
      Array.isArray(row.costs) ? row.costs.map(Number) : [0, 0, 0],
    ]),
  );
}

function operationalProducts(catalog: PublicCatalog, costs: Map<string, number[]>): Product[] {
  return catalog.products.map((product) => ({
    ...product,
    cost: costs.get(product.id) ?? [0, 0, 0],
    stock: 0,
  }));
}

function saleFromRow(row: Record<string, unknown>): MobileSale {
  return {
    id: String(row.id),
    number: Number(row.order_number),
    date: new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : '',
    customer: String(row.customer),
    note: String(row.note),
    items: row.items as MobileSale['items'],
    subtotal: Number(row.subtotal),
    total: Number(row.total),
    cost: Number(row.cost),
    payment: row.payment_method as MobileSale['payment'],
    paymentStatus: row.payment_status as MobileSale['paymentStatus'],
    received: Number(row.received),
    change: Number(row.change),
  };
}

function itemFromRow(row: Record<string, unknown>): InventoryItem {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: row.unit as InventoryItem['unit'],
    stock: Number(row.stock),
    minimum: Number(row.minimum),
    costPerUnit: Number(row.cost_per_unit),
    active: Boolean(row.active),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function recipeFromRow(row: Record<string, unknown>): InventoryRecipe {
  return inventoryRecipeInputSchema.parse({
    targetType: row.target_type,
    targetId: row.target_id,
    sizeIndex: Number(row.size_index),
    ingredients: row.ingredients,
  });
}

function movementFromRow(row: Record<string, unknown>): InventoryMovement {
  return {
    id: String(row.id),
    itemId: String(row.item_id),
    quantity: Number(row.quantity),
    reason: String(row.reason),
    type: row.movement_type as InventoryMovement['type'],
    resultingStock: Number(row.resulting_stock),
    saleId: row.sale_id ? String(row.sale_id) : '',
    createdBy: String(row.created_by),
    date: new Date(String(row.created_at)).toISOString(),
  };
}

export async function readInventoryState(): Promise<InventoryState> {
  await ensureSupabase();
  const client = serverClient();
  const [itemsResult, recipesResult, movementsResult] = await Promise.all([
    client.from('inventory_items').select('*').order('name'),
    client.from('inventory_recipes').select('*').order('target_type').order('target_id'),
    client
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (itemsResult.error) throw databaseError('No fue posible leer los insumos.', itemsResult.error);
  if (recipesResult.error)
    throw databaseError('No fue posible leer las recetas.', recipesResult.error);
  if (movementsResult.error)
    throw databaseError('No fue posible leer los movimientos.', movementsResult.error);
  const items = (itemsResult.data ?? []).map((row) => itemFromRow(row));
  const recipes = (recipesResult.data ?? []).map((row) => recipeFromRow(row));
  const movements = (movementsResult.data ?? []).map((row) => movementFromRow(row));
  return {
    items,
    recipes,
    movements,
    summary: {
      itemCount: items.filter((item) => item.active).length,
      lowStockCount: items.filter((item) => item.active && item.stock <= item.minimum).length,
      inventoryValue: Math.round(
        items.reduce((sum, item) => sum + item.stock * item.costPerUnit, 0),
      ),
      configuredRecipes: recipes.filter((recipe) => recipe.ingredients.length > 0).length,
    },
  };
}

export async function saveInventoryItem(input: unknown) {
  await ensureSupabase();
  const parsed = inventoryItemInputSchema.parse(input);
  validateUnitQuantity(parsed.minimum || 1, parsed.unit);
  const payload = {
    name: parsed.name,
    unit: parsed.unit,
    minimum: parsed.minimum,
    cost_per_unit: parsed.costPerUnit,
    active: parsed.active,
    updated_at: new Date().toISOString(),
  };
  const query = parsed.id
    ? serverClient().from('inventory_items').update(payload).eq('id', parsed.id)
    : serverClient().from('inventory_items').insert(payload);
  const { data, error } = await query.select('*').maybeSingle();
  if (error || !data) throw databaseError('No fue posible guardar el insumo.', error);
  return itemFromRow(data);
}

export async function adjustInventoryStock(input: {
  itemId: string;
  quantity: number;
  reason: string;
  user: MobileUser;
}) {
  await ensureSupabase();
  const { data: current, error: currentError } = await serverClient()
    .from('inventory_items')
    .select('unit')
    .eq('id', input.itemId)
    .maybeSingle();
  if (currentError || !current) throw databaseError('Insumo no encontrado.', currentError);
  validateUnitQuantity(input.quantity, current.unit as InventoryItem['unit'], true);
  const { data, error } = await serverClient().rpc('adjust_inventory_stock', {
    p_item_id: input.itemId,
    p_quantity: input.quantity,
    p_reason: input.reason.trim(),
    p_created_by: input.user.username,
  });
  if (error) throw new Error(error.message || 'No fue posible ajustar el inventario.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No fue posible ajustar el inventario.');
  return itemFromRow(row as Record<string, unknown>);
}

export async function saveInventoryRecipe(input: unknown) {
  await ensureSupabase();
  const parsed = inventoryRecipeInputSchema.parse(input);
  if (
    (parsed.targetType === 'modifier' && parsed.sizeIndex !== -1) ||
    (parsed.targetType === 'product' && parsed.sizeIndex < 0)
  )
    throw new Error('El tamaño de la receta no es válido.');
  const { catalog } = await readSupabaseCatalog();
  const exists =
    parsed.targetType === 'product'
      ? catalog.products.some((product) => product.id === parsed.targetId)
      : catalog.modifiers.some((modifier) => modifier.id === parsed.targetId);
  if (!exists) throw new Error('El producto o extra de la receta no existe.');
  if (
    new Set(parsed.ingredients.map((ingredient) => ingredient.itemId)).size !==
    parsed.ingredients.length
  )
    throw new Error('Un insumo no puede repetirse dentro de la misma receta.');
  const inventory = await readInventoryState();
  for (const ingredient of parsed.ingredients) {
    const item = inventory.items.find(
      (candidate) => candidate.id === ingredient.itemId && candidate.active,
    );
    if (!item) throw new Error('La receta contiene un insumo inactivo o inexistente.');
    validateUnitQuantity(ingredient.quantity, item.unit);
  }
  const client = serverClient();
  if (!parsed.ingredients.length) {
    const deleted = await client
      .from('inventory_recipes')
      .delete()
      .eq('target_type', parsed.targetType)
      .eq('target_id', parsed.targetId)
      .eq('size_index', parsed.sizeIndex);
    if (deleted.error) throw databaseError('No fue posible eliminar la receta.', deleted.error);
    return parsed;
  }
  const { error } = await client.from('inventory_recipes').upsert({
    target_type: parsed.targetType,
    target_id: parsed.targetId,
    size_index: parsed.sizeIndex,
    ingredients: parsed.ingredients,
    updated_at: new Date().toISOString(),
  });
  if (error) throw databaseError('No fue posible guardar la receta.', error);
  return parsed;
}

export async function createMobileSale(input: {
  id: string;
  user: MobileUser;
  lines: Line[];
  payment: 'Efectivo' | 'Transferencia';
  received: number;
  customer: string;
  note: string;
}) {
  const client = serverClient();
  const existing = await client.from('admin_sales').select('*').eq('id', input.id).maybeSingle();
  if (existing.error) throw databaseError('No fue posible revisar la venta.', existing.error);
  if (existing.data) return saleFromRow(existing.data);
  const [{ catalog }, costs, inventory] = await Promise.all([
    readSupabaseCatalog(),
    readCosts(),
    readInventoryState(),
  ]);
  const base = calculate(operationalProducts(catalog, costs), input.lines, 0, catalog.modifiers);
  const recipes = new Map(
    inventory.recipes.map((recipe) => [
      `${recipe.targetType}:${recipe.targetId}:${recipe.sizeIndex}`,
      recipe.ingredients,
    ]),
  );
  const needs = new Map<string, number>();
  const items = base.items.map((quoted, index) => {
    const line = input.lines[index];
    const product = catalog.products.find((candidate) => candidate.id === line.productId)!;
    const recipe = recipes.get(`product:${line.productId}:${line.size}`) ?? [];
    const modifierRecipes = (line.modifierIds ?? []).flatMap(
      (id) => recipes.get(`modifier:${id}:-1`) ?? [],
    );
    let recipeCost = 0;
    for (const ingredient of [...recipe, ...modifierRecipes]) {
      const item = inventory.items.find(
        (candidate) => candidate.id === ingredient.itemId && candidate.active,
      );
      if (!item)
        throw new Error(`La receta de ${product.name} contiene un insumo inactivo o inexistente.`);
      validateUnitQuantity(ingredient.quantity, item.unit);
      needs.set(item.id, (needs.get(item.id) ?? 0) + ingredient.quantity * line.quantity);
      recipeCost += ingredient.quantity * item.costPerUnit;
    }
    return {
      ...quoted,
      cost: recipe.length || modifierRecipes.length ? Math.round(recipeCost) : quoted.cost,
    };
  });
  const quote = {
    items,
    subtotal: base.subtotal,
    total: base.total,
    cost: items.reduce((sum, item) => sum + item.cost * item.quantity, 0),
  };
  if (input.payment === 'Efectivo' && input.received < quote.total)
    throw new Error('El efectivo recibido es insuficiente.');
  const status = input.payment === 'Efectivo' ? 'Pagado' : 'Pendiente';
  const received = input.payment === 'Efectivo' ? input.received : quote.total;
  const change = input.payment === 'Efectivo' ? input.received - quote.total : 0;
  const { data, error } = await client.rpc('create_admin_sale_with_inventory', {
    p_id: input.id,
    p_created_by: input.user.username,
    p_customer: input.customer,
    p_note: input.note,
    p_items: quote.items,
    p_subtotal: quote.subtotal,
    p_total: quote.total,
    p_cost: quote.cost,
    p_payment_method: input.payment,
    p_payment_status: status,
    p_received: received,
    p_change: change,
    p_consumption: [...needs].map(([itemId, quantity]) => ({ itemId, quantity })),
  });
  if (error) throw new Error(error.message || 'No fue posible registrar la venta.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No fue posible registrar la venta.');
  return saleFromRow(row as Record<string, unknown>);
}

export async function confirmMobileTransfer(id: string, user: MobileUser) {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('admin_sales')
    .update({
      payment_status: 'Pagado',
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.username,
    })
    .eq('id', id)
    .eq('payment_method', 'Transferencia')
    .eq('payment_status', 'Pendiente')
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('No fue posible confirmar la transferencia.', error);
  if (!data) throw new Error('La transferencia no existe o ya fue confirmada.');
  return saleFromRow(data);
}

export async function updateProductCosts(productId: string, costs: number[]) {
  await ensureSupabase();
  const { catalog } = await readSupabaseCatalog();
  if (!catalog.products.some((product) => product.id === productId))
    throw new Error('El producto no existe.');
  const { error } = await serverClient()
    .from('product_costs')
    .upsert({ product_id: productId, costs, updated_at: new Date().toISOString() });
  if (error) throw databaseError('No fue posible guardar los costos.', error);
}

export async function readMobileDashboard() {
  const [{ catalog }, costs, inventory] = await Promise.all([
    readSupabaseCatalog(),
    readCosts(),
    readInventoryState(),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const client = serverClient();
  const purge = await client.rpc('purge_old_admin_sales');
  if (purge.error)
    throw databaseError('No fue posible aplicar la retención de ventas.', purge.error);
  const weekStart = new Date(`${today}T12:00:00-05:00`);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(weekStart);
  const [result, historyResult] = await Promise.all([
    client
      .from('admin_sales')
      .select('*')
      .eq('business_date', today)
      .order('created_at', { ascending: false })
      .limit(200),
    client
      .from('daily_sales_totals')
      .select(
        'business_date, ticket_count, paid_total, cash_total, transfer_total, pending_total, cost_total',
      )
      .gte('business_date', weekStartDate)
      .order('business_date', { ascending: false }),
  ]);
  if (result.error) throw databaseError('No fue posible leer las ventas del día.', result.error);
  if (historyResult.error)
    throw databaseError('No fue posible leer el historial diario.', historyResult.error);
  const sales = (result.data ?? []).map((row) => saleFromRow(row));
  const paid = sales.filter((sale) => sale.paymentStatus === 'Pagado');
  const daily: DailySalesBreakdown = dailySalesBreakdown(sales);
  const total = daily.total;
  const totalCost = paid.reduce((sum, sale) => sum + sale.cost, 0);
  const missingCostCount = catalog.products.filter(
    (product) => product.active && !(costs.get(product.id) ?? []).some((cost) => cost > 0),
  ).length;
  return {
    catalog,
    inventory,
    daily,
    history: (historyResult.data ?? []).map((row) => ({
      date: String(row.business_date),
      tickets: Number(row.ticket_count),
      total: Number(row.paid_total),
      cash: Number(row.cash_total),
      transfers: Number(row.transfer_total),
      pendingTransfers: Number(row.pending_total),
      cost: Number(row.cost_total),
    })) satisfies ArchivedSalesDay[],
    costs: Object.fromEntries(catalog.products.map((p) => [p.id, costs.get(p.id) ?? [0, 0, 0]])),
    sales,
    summary: {
      total,
      cash: daily.cash,
      transfers: daily.transfers,
      pendingTransfers: daily.pendingTransfers,
      grossProfit: total - totalCost,
      missingCostCount,
      tickets: daily.tickets,
    },
  };
}

export async function readAuthAttempts(key: string) {
  await ensureSupabase();
  const client = serverClient();
  const now = new Date().toISOString();
  await client.from('auth_attempts').delete().lt('reset_at', now);
  const { data, error } = await client
    .from('auth_attempts')
    .select('attempts')
    .eq('attempt_key', key)
    .maybeSingle();
  if (error) throw databaseError('No fue posible validar el acceso.', error);
  return data ? Number(data.attempts) : 0;
}

export async function registerAuthFailure(key: string) {
  await ensureSupabase();
  const client = serverClient();
  const current = await client
    .from('auth_attempts')
    .select('attempts, reset_at')
    .eq('attempt_key', key)
    .maybeSingle();
  if (current.error) throw databaseError('No fue posible registrar el acceso.', current.error);
  const now = Date.now();
  const active = current.data && new Date(current.data.reset_at).getTime() > now;
  const { error } = await client.from('auth_attempts').upsert({
    attempt_key: key,
    attempts: active ? Number(current.data?.attempts ?? 0) + 1 : 1,
    reset_at: new Date(active ? new Date(current.data!.reset_at).getTime() : now + 15 * 60_000),
  });
  if (error) throw databaseError('No fue posible registrar el acceso.', error);
}

export async function clearAuthFailures(key: string) {
  await ensureSupabase();
  const { error } = await serverClient().from('auth_attempts').delete().eq('attempt_key', key);
  if (error) throw databaseError('No fue posible limpiar los intentos de acceso.', error);
}

export async function uploadProductImage(image: File, extension: string) {
  await ensureSupabase();
  const path = `products/${crypto.randomUUID()}.${extension}`;
  const client = serverClient();
  const { error } = await client.storage
    .from('product-images')
    .upload(path, await image.arrayBuffer(), {
      contentType: image.type,
      cacheControl: '31536000',
      upsert: false,
    });
  if (error) throw databaseError('No fue posible subir la imagen.', error);
  return client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
