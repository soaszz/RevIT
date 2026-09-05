import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, supabaseConfig } from "./config";

const PUBLIC_PATHS = ["/auth", "/api/chat"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  const { url, key } = supabaseConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(target);
  }
  if (signedIn && pathname === "/auth") {
    const target = request.nextUrl.clone();
    target.pathname = "/overview";
    target.search = "";
    return NextResponse.redirect(target);
  }
  return response;
}
