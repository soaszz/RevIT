import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = url.searchParams.get("next") ?? "/overview";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/overview";
  const supabase = await createClient();
  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  else error = new Error("Missing authentication token.");
  if (error) return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error.message)}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
