import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { calculate, standaloneExtraId, type Line, type Product } from './model';
import {
  dailySalesBreakdown,
  type DailySalesBreakdown,
  type DetailedSaleItem,
} from './sales-summary';
import {
  expenseTotal,
  mergeFinancialHistory,
  type FinancialHistoryDay,
  type SalesHistoryDay,
  type SupplyExpense,
} from './expenses';
import { buildWeeklyCashSummary, businessWeekStart, type WeeklyCashExpense } from './weekly-cash';
import { buildProfitMetrics } from './business-analytics';
import type {
  ShowcaseDashboard,
  ShowcaseExtra,
  ShowcaseLinkStatus,
  ShowcaseProduct,
} from './showcase';
import type { GalleryCategory, GalleryItem } from './gallery-schema';

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
  lastEditedAt: string;
  lastEditedBy: string;
  correctionReason: string;
};

export type ArchivedSalesDay = FinancialHistoryDay;

export class SupabaseConflictError extends Error {}
export class ShowcaseLinkError extends Error {}

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
  const { data, error } = await serverClient().rpc('save_catalog_with_sizes', {
    p_catalog: parsed,
    p_expected_version: Number(etag),
  });
  if (error) throw databaseError('No fue posible guardar el catálogo.', error);
  if (data === null || data === undefined)
    throw new SupabaseConflictError(
      'El menú cambió en otra pantalla. Actualiza los datos y vuelve a intentar.',
    );
  return { etag: String(data) };
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
    cost:
      costs.get(product.id) ?? Array.from({ length: Math.max(1, product.prices.length) }, () => 0),
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
    lastEditedAt: row.last_edited_at ? new Date(String(row.last_edited_at)).toISOString() : '',
    lastEditedBy: row.last_edited_by ? String(row.last_edited_by) : '',
    correctionReason: row.correction_reason ? String(row.correction_reason) : '',
  };
}

function expenseFromRow(row: Record<string, unknown>): SupplyExpense {
  return {
    id: String(row.id),
    businessDate: String(row.business_date),
    date: new Date(String(row.created_at)).toISOString(),
    name: String(row.name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    total: Number(row.total),
    createdBy: String(row.created_by),
    updatedBy: row.updated_by ? String(row.updated_by) : '',
  };
}

function weeklyExpenseFromRow(row: Record<string, unknown>): WeeklyCashExpense {
  return {
    id: String(row.id),
    weekStart: String(row.week_start),
    date: new Date(String(row.created_at)).toISOString(),
    name: String(row.name),
    quantity: row.quantity === null || row.quantity === undefined ? null : Number(row.quantity),
    total: Number(row.total),
    createdBy: String(row.created_by),
    updatedBy: row.updated_by ? String(row.updated_by) : '',
  };
}

function cancunBusinessDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

async function quoteMobileSale(lines: Line[]) {
  const [{ catalog }, costs, inventory] = await Promise.all([
    readSupabaseCatalog(),
    readCosts(),
    readInventoryState(),
  ]);
  const products = operationalProducts(catalog, costs);
  const recipes = new Map(
    inventory.recipes.map((recipe) => [
      `${recipe.targetType}:${recipe.targetId}:${recipe.sizeIndex}`,
      recipe.ingredients,
    ]),
  );
  const needs = new Map<string, number>();
  const items = lines.map((line) => {
    const extraId = standaloneExtraId(line.productId);
    const standaloneExtra = extraId
      ? catalog.modifiers.find((modifier) => modifier.id === extraId && modifier.active !== false)
      : null;
    if (extraId && !standaloneExtra) throw new Error('Ese extra ya no está disponible.');
    if (
      extraId &&
      (line.size !== 0 ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 99 ||
        (line.modifierIds?.length ?? 0) > 0)
    )
      throw new Error('Revisa la cantidad del extra.');

    const quoted = standaloneExtra
      ? {
          standaloneExtraId: standaloneExtra.id,
          name: standaloneExtra.name,
          size: 'Extra',
          quantity: line.quantity,
          baseUnitPrice: standaloneExtra.price,
          extras: [],
          unitPrice: standaloneExtra.price,
          cost: 0,
        }
      : calculate(products, [line], 0, catalog.modifiers, catalog.sizes).items[0];
    const product = extraId
      ? null
      : (catalog.products.find((candidate) => candidate.id === line.productId) ?? null);
    const recipe = extraId
      ? (recipes.get(`modifier:${extraId}:-1`) ?? [])
      : (recipes.get(`product:${line.productId}:${line.size}`) ?? []);
    const modifierRecipes = extraId
      ? []
      : (line.modifierIds ?? []).flatMap((id) => recipes.get(`modifier:${id}:-1`) ?? []);
    let recipeCost = 0;
    for (const ingredient of [...recipe, ...modifierRecipes]) {
      const item = inventory.items.find(
        (candidate) => candidate.id === ingredient.itemId && candidate.active,
      );
      if (!item)
        throw new Error(
          `La receta de ${product?.name ?? standaloneExtra?.name ?? 'este extra'} contiene un insumo inactivo o inexistente.`,
        );
      validateUnitQuantity(ingredient.quantity, item.unit);
      needs.set(item.id, (needs.get(item.id) ?? 0) + ingredient.quantity * line.quantity);
      recipeCost += ingredient.quantity * item.costPerUnit;
    }
    return {
      ...quoted,
      cost: recipe.length || modifierRecipes.length ? Math.round(recipeCost) : quoted.cost,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const quote = {
    items,
    subtotal,
    total: subtotal,
    cost: items.reduce((sum, item) => sum + item.cost * item.quantity, 0),
  };
  return {
    quote,
    consumption: [...needs].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
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
  const { quote, consumption } = await quoteMobileSale(input.lines);
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
    p_consumption: consumption,
  });
  if (error) throw new Error(error.message || 'No fue posible registrar la venta.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No fue posible registrar la venta.');
  return saleFromRow(row as Record<string, unknown>);
}

export async function correctMobileSale(input: {
  saleId: string;
  user: MobileUser;
  reason: string;
  lines: Line[];
  payment: 'Efectivo' | 'Transferencia';
  received: number;
  customer: string;
  note: string;
}) {
  await ensureSupabase();
  const client = serverClient();
  const existing = await client
    .from('admin_sales')
    .select('*')
    .eq('id', input.saleId)
    .maybeSingle();
  if (existing.error) throw databaseError('No fue posible revisar el ticket.', existing.error);
  if (!existing.data) throw new Error('El ticket no existe.');
  const { quote, consumption } = await quoteMobileSale(input.lines);
  if (input.payment === 'Efectivo' && input.received < quote.total)
    throw new Error('El efectivo recibido es insuficiente.');
  const keepsConfirmedTransfer =
    input.payment === 'Transferencia' &&
    existing.data.payment_method === 'Transferencia' &&
    existing.data.payment_status === 'Pagado';
  const status = input.payment === 'Efectivo' || keepsConfirmedTransfer ? 'Pagado' : 'Pendiente';
  const received = input.payment === 'Efectivo' ? input.received : quote.total;
  const change = input.payment === 'Efectivo' ? input.received - quote.total : 0;
  const { data, error } = await client.rpc('correct_admin_sale_with_inventory', {
    p_id: input.saleId,
    p_editor: input.user.username,
    p_reason: input.reason,
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
    p_consumption: consumption,
  });
  if (error) throw new Error(error.message || 'No fue posible corregir el ticket.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('No fue posible corregir el ticket.');
  return saleFromRow(row as Record<string, unknown>);
}

export async function deleteMobileSale(id: string, reason: string, user: MobileUser) {
  await ensureSupabase();
  const { data, error } = await serverClient().rpc('delete_admin_sale_with_inventory', {
    p_id: id,
    p_deleted_by: user.username,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'No fue posible eliminar el ticket.');
  return { number: Number(data) };
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
  const product = catalog.products.find((candidate) => candidate.id === productId);
  if (!product) throw new Error('El producto no existe.');
  const expectedLength = product.kind === 'drink' ? catalog.sizes.length : 1;
  if (costs.length !== expectedLength)
    throw new Error('Configura un costo por cada tamaño disponible.');
  const { error } = await serverClient()
    .from('product_costs')
    .upsert({ product_id: productId, costs, updated_at: new Date().toISOString() });
  if (error) throw databaseError('No fue posible guardar los costos.', error);
}

export async function saveSupplyExpense(input: {
  id: string;
  user: MobileUser;
  name: string;
  quantity: number | null;
  total: number;
}) {
  await ensureSupabase();
  const client = serverClient();
  const today = cancunBusinessDate();
  const existing = await client
    .from('supply_expenses')
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (existing.error) throw databaseError('No fue posible revisar el gasto.', existing.error);

  if (existing.data) {
    if (String(existing.data.business_date) !== today)
      throw new Error('Sólo se pueden editar gastos del día actual.');
    const updated = await client
      .from('supply_expenses')
      .update({
        name: input.name.trim(),
        quantity: input.quantity,
        total: input.total,
        updated_by: input.user.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('business_date', today)
      .select('*')
      .single();
    if (updated.error || !updated.data)
      throw databaseError('No fue posible actualizar el gasto.', updated.error);
    return expenseFromRow(updated.data);
  }

  const inserted = await client
    .from('supply_expenses')
    .insert({
      id: input.id,
      name: input.name.trim(),
      quantity: input.quantity,
      total: input.total,
      created_by: input.user.username,
    })
    .select('*')
    .single();
  if (inserted.error || !inserted.data)
    throw databaseError('No fue posible registrar el gasto.', inserted.error);
  return expenseFromRow(inserted.data);
}

export async function deleteSupplyExpense(id: string) {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('supply_expenses')
    .delete()
    .eq('id', id)
    .eq('business_date', cancunBusinessDate())
    .select('id')
    .maybeSingle();
  if (error) throw databaseError('No fue posible eliminar el gasto.', error);
  if (!data) throw new Error('El gasto no existe o ya no corresponde al día actual.');
  return { id: String(data.id) };
}

export async function saveWeeklyCashExpense(input: {
  id: string;
  user: MobileUser;
  name: string;
  quantity: number | null;
  total: number;
}) {
  await ensureSupabase();
  const client = serverClient();
  const weekStart = businessWeekStart(cancunBusinessDate());
  const existing = await client
    .from('weekly_cash_expenses')
    .select('*')
    .eq('id', input.id)
    .maybeSingle();
  if (existing.error)
    throw databaseError('No fue posible revisar el gasto semanal.', existing.error);

  if (existing.data) {
    if (String(existing.data.week_start) !== weekStart)
      throw new Error('Sólo se pueden editar gastos de la semana actual.');
    const updated = await client
      .from('weekly_cash_expenses')
      .update({
        name: input.name.trim(),
        quantity: input.quantity,
        total: input.total,
        updated_by: input.user.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)
      .eq('week_start', weekStart)
      .select('*')
      .single();
    if (updated.error || !updated.data)
      throw databaseError('No fue posible actualizar el gasto semanal.', updated.error);
    return weeklyExpenseFromRow(updated.data);
  }

  const inserted = await client
    .from('weekly_cash_expenses')
    .insert({
      id: input.id,
      week_start: weekStart,
      name: input.name.trim(),
      quantity: input.quantity,
      total: input.total,
      created_by: input.user.username,
    })
    .select('*')
    .single();
  if (inserted.error || !inserted.data)
    throw databaseError('No fue posible registrar el gasto semanal.', inserted.error);
  return weeklyExpenseFromRow(inserted.data);
}

export async function deleteWeeklyCashExpense(id: string) {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('weekly_cash_expenses')
    .delete()
    .eq('id', id)
    .eq('week_start', businessWeekStart(cancunBusinessDate()))
    .select('id')
    .maybeSingle();
  if (error) throw databaseError('No fue posible eliminar el gasto semanal.', error);
  if (!data) throw new Error('El gasto no existe o ya no corresponde a la semana actual.');
  return { id: String(data.id) };
}

export async function readMobileDashboard() {
  const [{ catalog }, costs, inventory] = await Promise.all([
    readSupabaseCatalog(),
    readCosts(),
    readInventoryState(),
  ]);
  const today = cancunBusinessDate();
  const currentWeekStart = businessWeekStart(today);
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
  const [
    result,
    historyResult,
    expenseResult,
    weeklyExpenseResult,
    productHistoryResult,
    extraHistoryResult,
  ] = await Promise.all([
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
    client
      .from('supply_expenses')
      .select('*')
      .gte('business_date', weekStartDate)
      .order('created_at', { ascending: false }),
    client
      .from('weekly_cash_expenses')
      .select('*')
      .eq('week_start', currentWeekStart)
      .order('created_at', { ascending: false }),
    client
      .from('daily_product_totals')
      .select('business_date, product_name, size, quantity, amount')
      .gte('business_date', weekStartDate),
    client
      .from('daily_extra_totals')
      .select('business_date, extra_name, quantity, amount')
      .gte('business_date', weekStartDate),
  ]);
  if (result.error) throw databaseError('No fue posible leer las ventas del día.', result.error);
  if (historyResult.error)
    throw databaseError('No fue posible leer el historial diario.', historyResult.error);
  if (expenseResult.error)
    throw databaseError('No fue posible leer los gastos de insumos.', expenseResult.error);
  if (weeklyExpenseResult.error)
    throw databaseError('No fue posible leer los gastos semanales.', weeklyExpenseResult.error);
  if (productHistoryResult.error || extraHistoryResult.error)
    throw databaseError(
      'No fue posible leer el detalle histórico.',
      productHistoryResult.error ?? extraHistoryResult.error,
    );
  const sales = (result.data ?? []).map((row) => saleFromRow(row));
  const weekExpenses = (expenseResult.data ?? []).map((row) => expenseFromRow(row));
  const expenses = weekExpenses.filter((expense) => expense.businessDate === today);
  const paid = sales.filter((sale) => sale.paymentStatus === 'Pagado');
  const daily: DailySalesBreakdown = dailySalesBreakdown(sales);
  const total = daily.total;
  const totalCost = paid.reduce((sum, sale) => sum + sale.cost, 0);
  const missingCostCount = catalog.products.filter(
    (product) => product.active && !(costs.get(product.id) ?? []).some((cost) => cost > 0),
  ).length;
  const salesHistory = (historyResult.data ?? []).map((row) => {
    const date = String(row.business_date);
    return {
      date,
      tickets: Number(row.ticket_count),
      total: Number(row.paid_total),
      cash: Number(row.cash_total),
      transfers: Number(row.transfer_total),
      pendingTransfers: Number(row.pending_total),
      cost: Number(row.cost_total),
      products: (productHistoryResult.data ?? [])
        .filter((item) => String(item.business_date) === date)
        .map((item) => ({
          name: String(item.product_name),
          size: String(item.size),
          quantity: Number(item.quantity),
          amount: Number(item.amount),
        })),
      extras: (extraHistoryResult.data ?? [])
        .filter((item) => String(item.business_date) === date)
        .map((item) => ({
          name: String(item.extra_name),
          quantity: Number(item.quantity),
          amount: Number(item.amount),
        })),
    };
  }) satisfies Array<
    SalesHistoryDay & {
      products: Array<{ name: string; size: string; quantity: number; amount: number }>;
      extras: Array<{ name: string; quantity: number; amount: number }>;
    }
  >;
  const weeklyCash = buildWeeklyCashSummary({
    today,
    salesDays: salesHistory,
    dailyExpenses: weekExpenses,
    weeklyExpenses: (weeklyExpenseResult.data ?? []).map((row) => weeklyExpenseFromRow(row)),
  });
  const expensesTotal = expenseTotal(expenses);
  return {
    catalog,
    inventory,
    daily,
    expenses,
    history: mergeFinancialHistory(salesHistory, weekExpenses) satisfies ArchivedSalesDay[],
    weeklyCash,
    costs: Object.fromEntries(catalog.products.map((p) => [p.id, costs.get(p.id) ?? [0, 0, 0]])),
    sales,
    summary: {
      total,
      cash: daily.cash,
      transfers: daily.transfers,
      pendingTransfers: daily.pendingTransfers,
      grossProfit: total - totalCost,
      expenses: expensesTotal,
      netAfterExpenses: total - expensesTotal,
      missingCostCount,
      tickets: daily.tickets,
    },
  };
}

function showcaseLinkFromRow(row: Record<string, unknown>): ShowcaseLinkStatus {
  const expiresAt = new Date(String(row.expires_at)).toISOString();
  const revokedAt = row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : '';
  return {
    id: String(row.id),
    expiresAt,
    createdAt: new Date(String(row.created_at)).toISOString(),
    createdBy: String(row.created_by),
    revokedAt,
    viewCount: Number(row.view_count),
    lastViewedAt: row.last_viewed_at ? new Date(String(row.last_viewed_at)).toISOString() : '',
    active: !revokedAt && new Date(expiresAt).getTime() > Date.now(),
  };
}

export async function listShowcaseLinks() {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('showcase_links')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw databaseError('No fue posible leer los enlaces de exposición.', error);
  return (data ?? []).map((row) => showcaseLinkFromRow(row));
}

export async function createShowcaseLink(durationDays: number, user: MobileUser) {
  await ensureSupabase();
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 180)
    throw new Error('La vigencia debe estar entre uno y ciento ochenta días.');
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
  const { data, error } = await serverClient().rpc('create_showcase_link', {
    p_id: id,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_created_by: user.username,
  });
  if (error || !data) throw databaseError('No fue posible crear el enlace de exposición.', error);
  const row = Array.isArray(data) ? data[0] : data;
  return { link: showcaseLinkFromRow(row as Record<string, unknown>), token };
}

export async function revokeShowcaseLink(id: string) {
  await ensureSupabase();
  const { data, error } = await serverClient()
    .from('showcase_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('No fue posible revocar el enlace.', error);
  if (!data) throw new Error('El enlace ya estaba vencido o revocado.');
  return showcaseLinkFromRow(data);
}

function dateDaysAgo(today: string, amount: number) {
  const value = new Date(`${today}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - amount);
  return value.toISOString().slice(0, 10);
}

function aggregateShowcaseProducts(rows: Record<string, unknown>[]) {
  const products = new Map<string, ShowcaseProduct>();
  for (const row of rows) {
    if (String(row.size).toLocaleLowerCase('es-MX') === 'extra') continue;
    const key = String(row.product_key);
    const current = products.get(key) ?? {
      key,
      name: String(row.product_name),
      size: String(row.size),
      quantity: 0,
      amount: 0,
    };
    current.quantity += Number(row.quantity);
    current.amount += Number(row.amount);
    products.set(key, current);
  }
  return [...products.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity);
}

function aggregateShowcaseExtras(rows: Record<string, unknown>[]) {
  const extras = new Map<string, ShowcaseExtra>();
  for (const row of rows) {
    const key = String(row.extra_key);
    const current = extras.get(key) ?? {
      key,
      name: String(row.extra_name),
      quantity: 0,
      amount: 0,
    };
    current.quantity += Number(row.quantity);
    current.amount += Number(row.amount);
    extras.set(key, current);
  }
  return [...extras.values()].sort((a, b) => b.amount - a.amount || b.quantity - a.quantity);
}

export async function readShowcaseDashboard(token: string): Promise<ShowcaseDashboard> {
  await ensureSupabase();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ShowcaseLinkError('Enlace no válido.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const client = serverClient();
  const viewResult = await client.rpc('record_showcase_view', { p_token_hash: tokenHash });
  if (viewResult.error) throw databaseError('No fue posible validar el enlace.', viewResult.error);
  const viewRow = Array.isArray(viewResult.data) ? viewResult.data[0] : viewResult.data;
  if (!viewRow) throw new ShowcaseLinkError('Este enlace venció o fue revocado.');

  const today = cancunBusinessDate();
  const periodStart = dateDaysAgo(today, 29);
  const [
    { catalog },
    costs,
    inventory,
    daysResult,
    productResult,
    extraResult,
    expenseResult,
    weeklyExpenseResult,
  ] = await Promise.all([
    readSupabaseCatalog(),
    readCosts(),
    readInventoryState(),
    client
      .from('daily_sales_totals')
      .select('business_date, ticket_count, paid_total, cost_total')
      .gte('business_date', periodStart)
      .lte('business_date', today)
      .order('business_date'),
    client
      .from('daily_product_totals')
      .select('product_key, product_name, size, quantity, amount')
      .gte('business_date', periodStart)
      .lte('business_date', today),
    client
      .from('daily_extra_totals')
      .select('extra_key, extra_name, quantity, amount')
      .gte('business_date', periodStart)
      .lte('business_date', today),
    client
      .from('supply_expenses')
      .select('business_date, total')
      .gte('business_date', periodStart)
      .lte('business_date', today),
    client
      .from('weekly_cash_expenses')
      .select('total')
      .gte('week_start', businessWeekStart(periodStart))
      .lte('week_start', businessWeekStart(today)),
  ]);

  for (const result of [daysResult, productResult, extraResult, expenseResult, weeklyExpenseResult])
    if (result.error)
      throw databaseError('No fue posible preparar el informe de lectura.', result.error);

  const expensesByDate = new Map<string, number>();
  for (const row of expenseResult.data ?? []) {
    const date = String(row.business_date);
    expensesByDate.set(date, (expensesByDate.get(date) ?? 0) + Number(row.total));
  }
  const days = (daysResult.data ?? []).map((row) => {
    const sales = Number(row.paid_total);
    const cost = Number(row.cost_total);
    const expenses = expensesByDate.get(String(row.business_date)) ?? 0;
    return {
      date: String(row.business_date),
      tickets: Number(row.ticket_count),
      sales,
      cost,
      expenses,
      net: sales - cost - expenses,
    };
  });
  const weeklyExpenses = (weeklyExpenseResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0,
  );
  const metrics = buildProfitMetrics(
    days.map((day) => ({
      date: day.date,
      tickets: day.tickets,
      total: day.sales,
      cost: day.cost,
      expenses: day.expenses,
    })),
    weeklyExpenses,
  );

  const activeProducts = catalog.products.filter((product) => product.active);
  const itemById = new Map(inventory.items.map((item) => [item.id, item]));
  const missingProducts = activeProducts
    .filter((product) => {
      const requiredSizes = product.kind === 'drink' ? catalog.sizes.map((_, index) => index) : [0];
      return requiredSizes.some((sizeIndex) => {
        if ((costs.get(product.id)?.[sizeIndex] ?? 0) > 0) return false;
        const recipe = inventory.recipes.find(
          (entry) =>
            entry.targetType === 'product' &&
            entry.targetId === product.id &&
            entry.sizeIndex === sizeIndex,
        );
        return (
          !recipe?.ingredients.length ||
          recipe.ingredients.some(
            (ingredient) => (itemById.get(ingredient.itemId)?.costPerUnit ?? 0) <= 0,
          )
        );
      });
    })
    .map((product) => product.name);
  const daysWithSales = days.filter((day) => day.sales > 0).length;
  const daysWithRecordedCost = days.filter((day) => day.sales > 0 && day.cost > 0).length;
  const configuredProducts = activeProducts.length - missingProducts.length;
  const coveragePercentage = activeProducts.length
    ? Math.round((configuredProducts / activeProducts.length) * 100)
    : 100;
  const legacyExtras = (productResult.data ?? [])
    .filter((row) => String(row.size).toLocaleLowerCase('es-MX') === 'extra')
    .map((row) => ({
      extra_key: `legacy:${String(row.product_key)}`,
      extra_name: row.product_name,
      quantity: row.quantity,
      amount: row.amount,
    }));

  return {
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(String(viewRow.expires_at)).toISOString(),
    business: {
      name: 'Lattecito Coffee',
      hours: catalog.settings.hours,
      sample: catalog.settings.sample,
    },
    period: { start: periodStart, end: today, days: 30 },
    metrics,
    days,
    products: aggregateShowcaseProducts(productResult.data ?? []),
    extras: aggregateShowcaseExtras([...(extraResult.data ?? []), ...legacyExtras]),
    inventory: {
      items: inventory.items
        .filter((item) => item.active)
        .map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          stock: item.stock,
          minimum: item.minimum,
          costPerUnit: item.costPerUnit,
          value: Math.round(item.stock * item.costPerUnit),
          status:
            item.stock <= item.minimum ? ('Necesita compra' as const) : ('Disponible' as const),
        })),
      value: inventory.summary.inventoryValue,
      lowStockCount: inventory.summary.lowStockCount,
    },
    coverage: {
      configuredProducts,
      totalProducts: activeProducts.length,
      percentage: coveragePercentage,
      missingProducts,
      recipes: inventory.summary.configuredRecipes,
      inventoryItems: inventory.summary.itemCount,
      daysWithSales,
      daysWithRecordedCost,
      reliable:
        missingProducts.length === 0 &&
        (daysWithSales === 0 || daysWithRecordedCost === daysWithSales),
    },
    views: Number(viewRow.view_count),
  };
}

export async function readSystemHealth() {
  await ensureSupabase();
  const startedAt = performance.now();
  const client = serverClient();
  const today = cancunBusinessDate();
  const [catalogResult, salesResult, inventoryResult, recipeResult, costResult, shareResult] =
    await Promise.all([
      client.from('catalog_state').select('version, updated_at').eq('id', 1).single(),
      client
        .from('admin_sales')
        .select('id', { count: 'exact', head: true })
        .eq('business_date', today),
      client.from('inventory_items').select('id', { count: 'exact', head: true }),
      client.from('inventory_recipes').select('target_id', { count: 'exact', head: true }),
      client.from('product_costs').select('product_id', { count: 'exact', head: true }),
      client
        .from('showcase_links')
        .select('id', { count: 'exact', head: true })
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()),
    ]);
  const results = [
    catalogResult,
    salesResult,
    inventoryResult,
    recipeResult,
    costResult,
    shareResult,
  ];
  if (results.some((result) => result.error))
    throw databaseError(
      'No fue posible completar el diagnóstico.',
      results.find((result) => result.error)?.error ?? null,
    );
  const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
  return {
    status: latencyMs < 1_500 ? 'Saludable' : 'Lento',
    latencyMs,
    checkedAt: new Date().toISOString(),
    catalogVersion: Number(catalogResult.data?.version ?? 0),
    catalogUpdatedAt: catalogResult.data?.updated_at
      ? new Date(String(catalogResult.data.updated_at)).toISOString()
      : '',
    salesToday: salesResult.count ?? 0,
    inventoryItems: inventoryResult.count ?? 0,
    recipes: recipeResult.count ?? 0,
    productCosts: costResult.count ?? 0,
    activeShowcaseLinks: shareResult.count ?? 0,
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

const GALLERY_BUCKET = 'gallery-images';

function galleryItemFromRow(
  row: Record<string, unknown>,
  client: ReturnType<typeof serverClient>,
): GalleryItem {
  return {
    id: String(row.id),
    imageUrl: client.storage.from(GALLERY_BUCKET).getPublicUrl(String(row.storage_path)).data
      .publicUrl,
    title: String(row.title),
    description: String(row.description ?? ''),
    altText: String(row.alt_text),
    category: String(row.category) as GalleryCategory,
    width: Number(row.width),
    height: Number(row.height),
    sortOrder: Number(row.sort_order),
    published: Boolean(row.published),
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function listGalleryItems(publicOnly = false): Promise<GalleryItem[]> {
  await ensureSupabase();
  const client = serverClient();
  let query = client
    .from('gallery_items')
    .select(
      'id, storage_path, title, description, alt_text, category, width, height, sort_order, published, created_by, created_at, updated_at',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (publicOnly) query = query.eq('published', true);
  const { data, error } = await query;
  if (error) throw databaseError('No fue posible leer la galería.', error);
  return (data ?? []).map((row) => galleryItemFromRow(row, client));
}

export async function uploadGalleryItem(
  image: File,
  extension: string,
  input: {
    title: string;
    description: string;
    altText: string;
    category: GalleryCategory;
    width: number;
    height: number;
    published: boolean;
  },
  user: MobileUser,
) {
  await ensureSupabase();
  const client = serverClient();
  const id = randomUUID();
  const path = `gallery/${id}.${extension}`;
  const upload = await client.storage.from(GALLERY_BUCKET).upload(path, await image.arrayBuffer(), {
    contentType: image.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (upload.error) throw databaseError('No fue posible subir la foto.', upload.error);

  const last = await client
    .from('gallery_items')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) {
    await client.storage.from(GALLERY_BUCKET).remove([path]);
    throw databaseError('No fue posible ordenar la galería.', last.error);
  }
  const { data, error } = await client
    .from('gallery_items')
    .insert({
      id,
      storage_path: path,
      title: input.title,
      description: input.description,
      alt_text: input.altText,
      category: input.category,
      width: input.width,
      height: input.height,
      sort_order: Number(last.data?.sort_order ?? -1) + 1,
      published: input.published,
      created_by: user.username,
    })
    .select()
    .single();
  if (error || !data) {
    await client.storage.from(GALLERY_BUCKET).remove([path]);
    throw databaseError('No fue posible guardar la foto en la galería.', error);
  }
  return galleryItemFromRow(data, client);
}

export async function updateGalleryItem(input: {
  id: string;
  title: string;
  description: string;
  altText: string;
  category: GalleryCategory;
  sortOrder: number;
  published: boolean;
}) {
  await ensureSupabase();
  const client = serverClient();
  const { data, error } = await client
    .from('gallery_items')
    .update({
      title: input.title,
      description: input.description,
      alt_text: input.altText,
      category: input.category,
      sort_order: input.sortOrder,
      published: input.published,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .select()
    .single();
  if (error || !data) throw databaseError('No fue posible actualizar la foto.', error);
  return galleryItemFromRow(data, client);
}

export async function reorderGalleryItems(ids: string[]) {
  await ensureSupabase();
  const client = serverClient();
  for (const [sortOrder, id] of ids.entries()) {
    const { error } = await client
      .from('gallery_items')
      .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw databaseError('No fue posible guardar el orden de las fotos.', error);
  }
  return listGalleryItems();
}

export async function deleteGalleryItem(id: string) {
  await ensureSupabase();
  const client = serverClient();
  const current = await client
    .from('gallery_items')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (current.error) throw databaseError('No fue posible localizar la foto.', current.error);
  if (!current.data) throw new Error('La foto ya no existe.');
  const removed = await client.from('gallery_items').delete().eq('id', id);
  if (removed.error) throw databaseError('No fue posible eliminar la foto.', removed.error);
  const storage = await client.storage
    .from(GALLERY_BUCKET)
    .remove([String(current.data.storage_path)]);
  if (storage.error) console.error('La foto quedó pendiente de limpieza.', storage.error.message);
}
