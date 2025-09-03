import { NextResponse, type NextRequest } from 'next/server';

// Rutas que requieren sesión
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/sales/:path*',
    '/purchases/:path*',
    '/inventory/:path*',
    '/treasury/:path*',
    '/accounting/:path*',
  ],
};

export function middleware(req: NextRequest) {
  const token = req.cookies.get('token')?.value;
  const { pathname } = req.nextUrl;

  // si no hay token, redirige a /login y pasa el 'next'
  if (!token) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
