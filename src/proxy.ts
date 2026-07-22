import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = new Set(["/", "/login", "/privacy", "/support", "/terms"]);

function isRetiredAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.STACKHATCH_DEV_AUTH === "1";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/demo") {
    return new NextResponse(null, { status: 404 });
  }

  // Retired routes must reach the router so they resolve as 404s instead of auth redirects.
  if (isRetiredAdminPath(pathname)) return NextResponse.next();

  if (PUBLIC_PATHS.has(pathname) || isDevAuthEnabled()) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
