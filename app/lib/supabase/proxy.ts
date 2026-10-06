import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseConfig, supabaseCookieOptions } from "./config";
import { isTransientAuthError, retryAuthRequest } from "./retryAuth";

const PUBLIC_PATHS = ["/auth", "/terms", "/privacy", "/pricing", "/pro", "/subscription", "/subscriptions", "/offline", "/sw.js", "/manifest.webmanifest", "/icon", "/api/chat"];

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

  const claimsResult = await retryAuthRequest(() => supabase.auth.getClaims()).catch(() => null);
  const pathname = request.nextUrl.pathname;
  if (!claimsResult || isTransientAuthError(claimsResult.error)) {
    if (isPublic(pathname)) return secure(response);
    const target = request.nextUrl.clone();
    target.pathname = "/auth";
    target.searchParams.set("session_unavailable", "true");
    target.searchParams.set("next", pathname === "/" ? "/overview" : pathname);
    return secure(NextResponse.redirect(target));
  }
  const { data } = claimsResult;
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic(pathname)) {
    const target = request.nextUrl.clone();
    target.pathname = "/auth";
    target.searchParams.set("next", pathname === "/" ? "/overview" : pathname);
    return secure(NextResponse.redirect(target));
  }
  return secure(response);
}
