import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  // si ya está logueado y va a /login, reenvía a /dashboard
  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // rutas que exigen autenticación
  const protectedPaths = [
   "/dashboard",
   "/items",
   "/sales",
   "/purchases",
   "/treasury",
   "/accounting",
   "/logout",
  ];
  const isProtected = protectedPaths.some((p) =>
    pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!token && isProtected) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Importante: usa "globs", sin regex con grupos
export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/items/:path*",
    "/sales/:path*",
    "/purchases/:path*",
    "/treasury/:path*",
    "/accounting/:path*",
    "/logout",
  ],
};
