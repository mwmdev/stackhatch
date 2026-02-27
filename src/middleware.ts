import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth-config";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets, NextAuth routes, and login page
  if (
    pathname.startsWith("/_next/") || // Next.js static assets
    pathname.startsWith("/api/auth/") || // NextAuth routes
    pathname === "/login" || // Login page
    pathname.startsWith("/favicon") || // Favicon files
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  // Get session using NextAuth
  const session = await auth();

  // If no session, handle based on route type
  if (!session?.user) {
    // For API routes, return 401 JSON response
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // For page routes, redirect to login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // User is authenticated, allow the request
  return NextResponse.next();
}

export const config = {
  /*
   * Match all request paths except for the ones starting with:
   * - api/auth (NextAuth.js routes)
   * - _next/static (static files)
   * - _next/image (image optimization files)
   * - favicon.ico (favicon file)
   */
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};