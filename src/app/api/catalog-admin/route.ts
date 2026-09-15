import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { catalogSchema } from '@/lib/catalog-schema';
import { CatalogConflictError, readCloudCatalog, saveCloudCatalog } from '@/lib/cloud-catalog';
import { uploadProductImage } from '@/lib/supabase-store';
import { webAdminUser } from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const result = await readCloudCatalog();
    return NextResponse.json({ ...result, user }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('No fue posible leer el catálogo web.', error);
    return NextResponse.json({ error: 'No fue posible cargar el catálogo.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const image = form.get('image');
      if (!(image instanceof File)) throw new Error('Selecciona una imagen.');
      if (image.size < 1 || image.size > 5 * 1024 * 1024)
        throw new Error('La imagen debe pesar entre 1 byte y 5 MB.');
      const extensions: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/avif': 'avif',
      };
      const extension = extensions[image.type];
      if (!extension) throw new Error('Usa una imagen JPG, PNG, WebP o AVIF.');
      return NextResponse.json({ imageUrl: await uploadProductImage(image, extension) });
    }

    const input = z
      .object({ catalog: catalogSchema, etag: z.string().nullable() })
      .parse(await request.json());
    const current = await readCloudCatalog();
    if (current.etag !== input.etag)
      throw new CatalogConflictError(
        'El menú cambió en otra pestaña. Actualiza los datos y vuelve a intentar.',
      );
    const saved = await saveCloudCatalog(input.catalog, current.etag);
    return NextResponse.json({
      catalog: input.catalog,
      etag: saved.etag,
      source: 'supabase',
    });
  } catch (error) {
    if (error instanceof CatalogConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? 'Datos inválidos.' },
        { status: 400 },
      );
    const message = error instanceof Error ? error.message : 'No fue posible guardar el cambio.';
    console.error('No fue posible actualizar el catálogo web.', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
