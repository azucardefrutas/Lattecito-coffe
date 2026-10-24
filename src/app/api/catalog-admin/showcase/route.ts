import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { z } from 'zod';
import { webAdminUser } from '@/lib/mobile-auth';
import {
  createShowcaseLink,
  listShowcaseLinks,
  readShowcaseStaticAccess,
  revokeShowcaseLink,
  setShowcaseStaticAccess,
} from '@/lib/supabase-store';
import { SHOWCASE_STATIC_SLUG } from '@/lib/showcase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({ durationDays: z.number().int().min(1).max(180) });
const revokeSchema = z.object({ id: z.uuid() });
const staticAccessSchema = z.object({ enabled: z.boolean() });

async function qrDataUrl(url: string) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 3,
    width: 720,
    color: { dark: '#3b211b', light: '#fffaf4' },
  });
}

async function staticAccessPayload(request: NextRequest) {
  const url = new URL(`/lectura/${SHOWCASE_STATIC_SLUG}`, request.nextUrl.origin).toString();
  return {
    access: await readShowcaseStaticAccess(),
    url,
    qrDataUrl: await qrDataUrl(url),
  };
}

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
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(
      {
        links: await listShowcaseLinks(),
        fixed: await staticAccessPayload(request),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('No fue posible leer los enlaces de exposición.', error);
    return NextResponse.json({ error: 'No fue posible cargar los enlaces.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = createSchema.parse(await request.json());
    const created = await createShowcaseLink(input.durationDays, user);
    const url = new URL(`/lectura/${created.token}`, request.nextUrl.origin).toString();
    return NextResponse.json(
      { link: created.link, url, qrDataUrl: await qrDataUrl(url) },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Elige una vigencia válida.'
        : error instanceof Error
          ? error.message
          : 'No fue posible crear el enlace.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = staticAccessSchema.parse(await request.json());
    await setShowcaseStaticAccess(input.enabled, user);
    return NextResponse.json({ fixed: await staticAccessPayload(request) });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'El estado del acceso fijo no es válido.'
        : error instanceof Error
          ? error.message
          : 'No fue posible actualizar el acceso fijo.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = revokeSchema.parse(await request.json());
    return NextResponse.json({ link: await revokeShowcaseLink(input.id) });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Enlace inválido.'
        : error instanceof Error
          ? error.message
          : 'No fue posible cerrar el acceso.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
