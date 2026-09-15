import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mobileUser } from '@/lib/mobile-auth';
import {
  confirmMobileTransfer,
  createMobileSale,
  readMobileDashboard,
  updateProductCosts,
} from '@/lib/supabase-store';

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
