import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mobileUser } from '@/lib/mobile-auth';
import {
  adjustInventoryStock,
  confirmMobileTransfer,
  correctMobileSale,
  createMobileSale,
  deleteMobileSale,
  readMobileDashboard,
  saveInventoryItem,
  saveInventoryRecipe,
  updateProductCosts,
} from '@/lib/supabase-store';
import {
  inventoryItemInputSchema,
  inventoryRecipeInputSchema,
  stockQuantitySchema,
} from '@/lib/inventory-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cents = z.number().int().min(0).max(100_000_000);
const command = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('sale'),
    id: z.uuid(),
    customer: z.string().trim().max(100),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1).max(80),
          size: z.number().int().min(0).max(2),
          quantity: z.number().int().min(1).max(99),
          modifierIds: z.array(z.string().min(1).max(80)).max(20).optional(),
        }),
      )
      .min(1)
      .max(100),
    payment: z.enum(['Efectivo', 'Transferencia']),
    received: cents,
  }),
  z.object({ action: z.literal('confirm-transfer'), saleId: z.uuid() }),
  z.object({
    action: z.literal('edit-sale'),
    saleId: z.uuid(),
    reason: z.string().trim().min(5).max(300),
    customer: z.string().trim().max(100),
    note: z.string().trim().max(500),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1).max(80),
          size: z.number().int().min(0).max(2),
          quantity: z.number().int().min(1).max(99),
          modifierIds: z.array(z.string().min(1).max(80)).max(20).optional(),
        }),
      )
      .min(1)
      .max(100),
    payment: z.enum(['Efectivo', 'Transferencia']),
    received: cents,
  }),
  z.object({
    action: z.literal('delete-sale'),
    saleId: z.uuid(),
    reason: z.string().trim().min(5).max(300),
  }),
  z.object({ action: z.literal('inventory-item'), item: inventoryItemInputSchema }),
  z.object({
    action: z.literal('inventory-adjust'),
    itemId: z.uuid(),
    quantity: stockQuantitySchema.refine((value) => value !== 0),
    reason: z.string().trim().min(2).max(300),
  }),
  z.object({ action: z.literal('inventory-recipe'), recipe: inventoryRecipeInputSchema }),
  z.object({
    action: z.literal('costs'),
    productId: z.string().min(1).max(80),
    costs: z.array(cents).length(3),
  }),
]);

function unavailable() {
  return process.env.APP_SURFACE !== 'public' || process.env.MOBILE_ADMIN_ENABLED !== 'true';
}

export async function GET(request: NextRequest) {
  if (unavailable()) return new NextResponse('No encontrado', { status: 404 });
  const user = mobileUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(
      { ...(await readMobileDashboard()), user },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('No fue posible leer la operación móvil.', error);
    return NextResponse.json({ error: 'No fue posible cargar la operación.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (unavailable()) return new NextResponse('No encontrado', { status: 404 });
  const user = mobileUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    const size = Number(request.headers.get('content-length') ?? 0);
    if (size > 75_000)
      return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    const input = command.parse(await request.json());
    if (input.action === 'sale')
      return NextResponse.json(await createMobileSale({ ...input, user }), { status: 201 });
    if (input.action === 'confirm-transfer')
      return NextResponse.json(await confirmMobileTransfer(input.saleId, user));
    if (input.action === 'edit-sale')
      return NextResponse.json(await correctMobileSale({ ...input, user }));
    if (input.action === 'delete-sale')
      return NextResponse.json(await deleteMobileSale(input.saleId, input.reason, user));
    if (input.action === 'inventory-item')
      return NextResponse.json(await saveInventoryItem(input.item));
    if (input.action === 'inventory-adjust')
      return NextResponse.json(await adjustInventoryStock({ ...input, user }));
    if (input.action === 'inventory-recipe')
      return NextResponse.json(await saveInventoryRecipe(input.recipe));
    if (user.role !== 'developer')
      return NextResponse.json({ error: 'Se requiere acceso de desarrollador.' }, { status: 403 });
    await updateProductCosts(input.productId, input.costs);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Revisa los datos de la operación.'
        : error instanceof Error
          ? error.message
          : 'No fue posible guardar la operación.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
