import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  adminSessionCookie,
  authenticateMobileUser,
  issueMobileToken,
  webAdminUser,
} from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const credentials = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

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
  const user = webAdminUser(request);
  return user
    ? NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } })
    : NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  try {
    const input = credentials.parse(await request.json());
    const user = await authenticateMobileUser(request, input.username, input.password);
    const response = NextResponse.json({ user });
    response.cookies.set(adminSessionCookie, issueMobileToken(user), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? 'Completa el usuario y la contraseña.'
        : error instanceof Error
          ? error.message
          : 'No fue posible iniciar sesión.';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!available()) return new NextResponse('No encontrado', { status: 404 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminSessionCookie, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
