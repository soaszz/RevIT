import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseConfig, supabaseCookieOptions } from "./config";

const PUBLIC_PATHS = ["/auth", "/terms", "/privacy", "/icon", "/api/chat"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest, security: {
  requestHeaders: Headers;
  contentSecurityPolicy: string;
}) {
  const secure = (response: NextResponse) => {
    response.headers.set("Content-Security-Policy", security.contentSecurityPolicy);
    return response;
  };
  const nextResponse = () => NextResponse.next({ request: { headers: security.requestHeaders } });

  if (!isSupabaseConfigured()) return secure(nextResponse());

  const { url, key } = supabaseConfig();
  let response = nextResponse();
  const supabase = createServerClient(url, key, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headersToSet).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!signedIn && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/auth";
    target.searchParams.set("next", pathname === "/" ? "/overview" : pathname);
    return secure(NextResponse.redirect(target));
  }
  if (signedIn && pathname === "/auth") {
    const target = request.nextUrl.clone();
    target.pathname = "/overview";
    target.search = "";
    return secure(NextResponse.redirect(target));
  }
  return secure(response);
}
