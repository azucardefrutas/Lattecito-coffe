import { createClient } from '@supabase/supabase-js';
import snapshot from '@/data/public-menu.json';
import { catalogSchema, type PublicCatalog } from './catalog-schema';
import { calculate, type Line, type Product } from './model';

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
  items: { name: string; size: string; quantity: number; unitPrice: number; cost: number }[];
  subtotal: number;
  total: number;
  cost: number;
  payment: 'Efectivo' | 'Transferencia';
  paymentStatus: 'Pagado' | 'Pendiente';
  received: number;
  change: number;
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
    const { data, error } = await client.from('catalog_state').select('id').eq('id', 1).maybeSingle();
    if (error) throw databaseError('No fue posible preparar el catálogo central.', error);
    if (!data) {
      const catalog = catalogSchema.parse(snapshot);
      const seeded = await client.from('catalog_state').insert({ id: 1, catalog });
      if (seeded.error) throw databaseError('No fue posible crear el catálogo central.', seeded.error);
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

export async function createMobileSale(input: {
  id: string;
  user: MobileUser;
  lines: Line[];
  payment: 'Efectivo' | 'Transferencia';
  received: number;
  customer: string;
  note: string;
}) {
  const [{ catalog }, costs] = await Promise.all([readSupabaseCatalog(), readCosts()]);
  const quote = calculate(operationalProducts(catalog, costs), input.lines, 0, catalog.modifiers);
  if (input.payment === 'Efectivo' && input.received < quote.total)
    throw new Error('El efectivo recibido es insuficiente.');
  const status = input.payment === 'Efectivo' ? 'Pagado' : 'Pendiente';
  const received = input.payment === 'Efectivo' ? input.received : quote.total;
  const change = input.payment === 'Efectivo' ? input.received - quote.total : 0;
  const client = serverClient();
  const inserted = await client
    .from('admin_sales')
    .insert({
      id: input.id,
      created_by: input.user.username,
      customer: input.customer,
      note: input.note,
      items: quote.items,
      subtotal: quote.subtotal,
      total: quote.total,
      cost: quote.cost,
      payment_method: input.payment,
      payment_status: status,
      received,
      change,
    })
    .select('*')
    .single();
  if (!inserted.error && inserted.data) return saleFromRow(inserted.data);
  if (inserted.error?.code !== '23505')
    throw databaseError('No fue posible registrar la venta.', inserted.error);
  const existing = await client.from('admin_sales').select('*').eq('id', input.id).maybeSingle();
  if (existing.error || !existing.data)
    throw databaseError('No fue posible recuperar la venta.', existing.error);
  return saleFromRow(existing.data);
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
  const [{ catalog }, costs] = await Promise.all([readSupabaseCatalog(), readCosts()]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const result = await serverClient()
    .from('admin_sales')
    .select('*')
    .eq('business_date', today)
    .order('created_at', { ascending: false })
    .limit(200);
  if (result.error) throw databaseError('No fue posible leer las ventas del día.', result.error);
  const sales = (result.data ?? []).map((row) => saleFromRow(row));
  const paid = sales.filter((sale) => sale.paymentStatus === 'Pagado');
  const total = paid.reduce((sum, sale) => sum + sale.total, 0);
  const totalCost = paid.reduce((sum, sale) => sum + sale.cost, 0);
  const missingCostCount = catalog.products.filter(
    (product) => product.active && !(costs.get(product.id) ?? []).some((cost) => cost > 0),
  ).length;
  return {
    catalog,
    costs: Object.fromEntries(catalog.products.map((p) => [p.id, costs.get(p.id) ?? [0, 0, 0]])),
    sales,
    summary: {
      total,
      cash: paid
        .filter((sale) => sale.payment === 'Efectivo')
        .reduce((sum, sale) => sum + sale.total, 0),
      transfers: paid
        .filter((sale) => sale.payment === 'Transferencia')
        .reduce((sum, sale) => sum + sale.total, 0),
      pendingTransfers: sales
        .filter((sale) => sale.paymentStatus === 'Pendiente')
        .reduce((sum, sale) => sum + sale.total, 0),
      grossProfit: total - totalCost,
      missingCostCount,
      tickets: sales.length,
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
  const { error } = await client.storage.from('product-images').upload(path, await image.arrayBuffer(), {
    contentType: image.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw databaseError('No fue posible subir la imagen.', error);
  return client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
