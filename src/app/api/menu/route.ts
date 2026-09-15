import { NextResponse } from 'next/server';
import { publicMenu } from '@/lib/public-menu';
import snapshot from '@/data/public-menu.json';
import { catalogSchema } from '@/lib/catalog-schema';
export const dynamic = 'force-dynamic';
export async function GET() {
  const mode = process.env.LATTECITO_CATALOG_MODE || (process.env.VERCEL ? 'snapshot' : 'local');
  if (mode !== 'snapshot' && mode !== 'local' && mode !== 'blob')
    return NextResponse.json({ error: 'Configuración del catálogo inválida.' }, { status: 503 });
  const menu =
    mode === 'snapshot'
      ? catalogSchema.parse(snapshot)
      : mode === 'blob'
        ? (await import('@/lib/cloud-catalog')).readCloudCatalog().then((result) => result.catalog)
        : publicMenu((await import('@/lib/db')).readStore());
  return NextResponse.json(await menu, { headers: { 'Cache-Control': 'no-store' } });
}
