import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  inventoryItemInputSchema,
  inventoryRecipeInputSchema,
  stockQuantitySchema,
} from '@/lib/inventory-schema';
import { webAdminUser } from '@/lib/mobile-auth';
import {
  adjustInventoryStock,
  readInventoryState,
  saveInventoryItem,
  saveInventoryRecipe,
} from '@/lib/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('item'), item: inventoryItemInputSchema }),
  z.object({
    action: z.literal('adjust'),
    itemId: z.uuid(),
    quantity: stockQuantitySchema.refine((value) => value !== 0),
    reason: z.string().trim().min(2).max(300),
  }),
  z.object({ action: z.literal('recipe'), recipe: inventoryRecipeInputSchema }),
]);

function available() {
  return process.env.APP_SURFACE === 'catalog-admin' && process.env.CATALOG_ADMIN_ENABLED === 'true';
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request)) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(await readInventoryState(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('No fue posible leer el inventario web.', error);
    return NextResponse.json({ error: 'No fue posible cargar el inventario.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = command.parse(await request.json());
    if (input.action === 'item') return NextResponse.json(await saveInventoryItem(input.item));
    if (input.action === 'adjust')
      return NextResponse.json(await adjustInventoryStock({ ...input, user }));
    return NextResponse.json(await saveInventoryRecipe(input.recipe));
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Revisa los datos del inventario.'
        : error instanceof Error
          ? error.message
          : 'No fue posible guardar el inventario.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
