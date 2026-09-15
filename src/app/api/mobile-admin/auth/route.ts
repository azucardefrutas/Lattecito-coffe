import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateMobileUser, issueMobileToken } from '@/lib/mobile-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const credentials = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
});

export async function POST(request: NextRequest) {
  if (process.env.APP_SURFACE !== 'public')
    return new NextResponse('No encontrado', { status: 404 });
  try {
    const size = Number(request.headers.get('content-length') ?? 0);
    if (size > 5_000)
      return NextResponse.json({ error: 'Solicitud demasiado grande.' }, { status: 413 });
    const input = credentials.parse(await request.json());
    const user = await authenticateMobileUser(request, input.username, input.password);
    return NextResponse.json(
      { token: issueMobileToken(user), user },
      { headers: { 'Cache-Control': 'no-store' } },
    );
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
