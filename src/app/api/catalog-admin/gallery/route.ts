import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  galleryDeleteSchema,
  galleryMetadataSchema,
  galleryReorderSchema,
  galleryUpdateSchema,
} from '@/lib/gallery-schema';
import { webAdminUser } from '@/lib/mobile-auth';
import {
  deleteGalleryItem,
  listGalleryItems,
  reorderGalleryItems,
  updateGalleryItem,
  uploadGalleryItem,
} from '@/lib/supabase-store';

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

function errorResponse(error: unknown, fallback: string) {
  const message =
    error instanceof z.ZodError
      ? (error.issues[0]?.message ?? 'Datos inválidos.')
      : error instanceof Error
        ? error.message
        : fallback;
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(
      { items: await listGalleryItems() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('No fue posible leer la galería.', error);
    return NextResponse.json({ error: 'No fue posible cargar las fotos.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  const user = webAdminUser(request);
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const form = await request.formData();
    const image = form.get('image');
    if (!(image instanceof File)) throw new Error('Selecciona una foto.');
    if (image.size < 1 || image.size > 5 * 1024 * 1024)
      throw new Error('La foto optimizada debe pesar menos de 5 MB.');
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const extension = extensions[image.type];
    if (!extension) throw new Error('Usa una foto JPG, PNG o WebP.');
    const metadata = galleryMetadataSchema.parse({
      title: form.get('title'),
      description: form.get('description') ?? '',
      altText: form.get('altText'),
      category: form.get('category'),
      width: Number(form.get('width')),
      height: Number(form.get('height')),
      published: form.get('published') !== 'false',
    });
    return NextResponse.json(
      { item: await uploadGalleryItem(image, extension, metadata, user) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, 'No fue posible subir la foto.');
  }
}

export async function PATCH(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const body = await request.json();
    if (body?.action === 'reorder') {
      const input = galleryReorderSchema.parse(body);
      return NextResponse.json({ items: await reorderGalleryItems(input.ids) });
    }
    const input = galleryUpdateSchema.parse(body);
    return NextResponse.json({ item: await updateGalleryItem(input) });
  } catch (error) {
    return errorResponse(error, 'No fue posible actualizar la foto.');
  }
}

export async function DELETE(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const { id } = galleryDeleteSchema.parse(await request.json());
    await deleteGalleryItem(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'No fue posible eliminar la foto.');
  }
}
