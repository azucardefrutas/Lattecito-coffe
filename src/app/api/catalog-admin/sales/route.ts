import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { webAdminUser } from '@/lib/mobile-auth';
import {
  confirmMobileTransfer,
  correctMobileSale,
  createMobileSale,
  deleteMobileSale,
  readMobileDashboard,
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
]);

function available() {
  return (
    process.env.APP_SURFACE === 'catalog-admin' && process.env.CATALOG_ADMIN_ENABLED === 'true'
  );
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
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(
      { ...(await readMobileDashboard()), user },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('No fue posible leer las ventas web.', error);
    return NextResponse.json(
      { error: 'No fue posible cargar las ventas del día.' },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = command.parse(await request.json());
    if (input.action === 'sale')
      return NextResponse.json(await createMobileSale({ ...input, user }), { status: 201 });
    if (input.action === 'confirm-transfer')
      return NextResponse.json(await confirmMobileTransfer(input.saleId, user));
    if (input.action === 'edit-sale')
      return NextResponse.json(await correctMobileSale({ ...input, user }));
    return NextResponse.json(await deleteMobileSale(input.saleId, input.reason, user));
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Revisa los datos de la venta.'
        : error instanceof Error
          ? error.message
          : 'No fue posible registrar la venta.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
