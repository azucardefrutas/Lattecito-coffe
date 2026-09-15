import { NextRequest, NextResponse } from 'next/server';
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const admin = process.env.APP_SURFACE === 'admin';
  if (
    !admin &&
    (p === '/admin' || p.startsWith('/admin/') || p === '/api/admin' || p.startsWith('/api/admin/'))
  )
    return new NextResponse('No encontrado', { status: 404 });
  if (admin) {
    if (p === '/') return NextResponse.rewrite(new URL('/admin', req.url));
    if (
      !p.startsWith('/admin') &&
      !p.startsWith('/api/admin') &&
      !p.startsWith('/_next') &&
      !p.includes('.')
    )
      return new NextResponse('No encontrado', { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
