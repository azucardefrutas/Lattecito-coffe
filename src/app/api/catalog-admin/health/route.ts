import { NextRequest, NextResponse } from 'next/server';
import { webAdminUser } from '@/lib/mobile-auth';
import { readSystemHealth } from '@/lib/supabase-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.APP_SURFACE !== 'catalog-admin' || process.env.CATALOG_ADMIN_ENABLED !== 'true')
    return new NextResponse('No encontrado', { status: 404 });
  if (!webAdminUser(request))
    return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  try {
    return NextResponse.json(await readSystemHealth(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('No fue posible completar el diagnóstico.', error);
    return NextResponse.json(
      { error: 'La base de datos no respondió correctamente.' },
      { status: 503 },
    );
  }
}
