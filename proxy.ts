import type { NextRequest } from "next/server";
import { contentSecurityPolicy } from "./app/lib/securityHeaders";
import { updateSession } from "./app/lib/supabase/proxy";
import { maintenanceResponse } from "./app/lib/maintenance";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const maintenance = maintenanceResponse(request, nonce);
  if (maintenance) return maintenance;
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  return updateSession(request, { requestHeaders, contentSecurityPolicy: policy });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
