import { NextResponse } from 'next/server';
import { publicMenu } from '@/lib/public-menu';
import snapshot from '@/data/public-menu.json';
export const dynamic = 'force-dynamic';
export async function GET() {
  const mode = process.env.LATTECITO_CATALOG_MODE || (process.env.VERCEL ? 'snapshot' : 'local');
  if (mode !== 'snapshot' && mode !== 'local')
    return NextResponse.json({ error: 'Configuración del catálogo inválida.' }, { status: 503 });
  const menu = mode === 'snapshot' ? snapshot : publicMenu((await import('@/lib/db')).readStore());
  return NextResponse.json(menu, { headers: { 'Cache-Control': 'no-store' } });
}
