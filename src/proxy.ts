import { NextRequest, NextResponse } from 'next/server';
export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const surface = process.env.APP_SURFACE ?? 'public';
  const admin = surface === 'admin';
  const catalogAdmin = surface === 'catalog-admin';
  if (
    surface === 'public' &&
    (p === '/admin' ||
      p.startsWith('/admin/') ||
      p === '/api/admin' ||
      p.startsWith('/api/admin/') ||
      p === '/catalog-admin' ||
      p.startsWith('/catalog-admin/') ||
      p === '/api/catalog-admin' ||
      p.startsWith('/api/catalog-admin/'))
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
  if (catalogAdmin) {
    if (p === '/') return NextResponse.rewrite(new URL('/catalog-admin', req.url));
    if (
      !p.startsWith('/catalog-admin') &&
      !p.startsWith('/api/catalog-admin') &&
      !p.startsWith('/_next') &&
      !p.includes('.')
    )
      return new NextResponse('No encontrado', { status: 404 });
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
