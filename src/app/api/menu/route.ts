import { NextResponse } from 'next/server';
import { publicMenu, publishCatalog } from '@/lib/public-menu';
import snapshot from '@/data/public-menu.json';
import { catalogSchema } from '@/lib/catalog-schema';
export const dynamic = 'force-dynamic';
export async function GET() {
  // Both Vercel surfaces must read the same central catalog. Never fall back to
  // a build-time snapshot in production: that would silently show stale drinks.
  const mode = process.env.VERCEL ? 'supabase' : process.env.LATTECITO_CATALOG_MODE || 'local';
  if (mode !== 'snapshot' && mode !== 'local' && mode !== 'supabase')
    return NextResponse.json({ error: 'Configuración del catálogo inválida.' }, { status: 503 });
  try {
    const menu =
      mode === 'snapshot'
        ? publishCatalog(catalogSchema.parse(snapshot))
        : mode === 'supabase'
          ? (await import('@/lib/supabase-store')).readSupabaseCatalog().then((result) => publishCatalog(result.catalog))
          : publicMenu((await import('@/lib/db')).readStore());
    return NextResponse.json(await menu, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('No fue posible leer el menú central.', error);
    return NextResponse.json(
      { error: 'El menú no está disponible en este momento. Intenta de nuevo.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
