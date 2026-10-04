import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../lib/supabase/server";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
const OAUTH_FLOWS = new Set(["google", "link-google"]);

function safeNextPath(value: string | null, fallback = "/overview") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function oauthFailure(url: URL, flow: string | null) {
  const destination = new URL(flow === "link-google" ? "/overview" : "/auth", url.origin);
  if (flow === "link-google") destination.searchParams.set("account", "security");
  destination.searchParams.set("oauth_error", flow === "link-google" ? "google_link" : "google");
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const requestedType = url.searchParams.get("type") as EmailOtpType | null;
  const type = requestedType && EMAIL_OTP_TYPES.has(requestedType) ? requestedType : null;
  const flow = url.searchParams.get("flow");
  const next = safeNextPath(url.searchParams.get("next"));
  const supabase = await createClient();

  if (OAUTH_FLOWS.has(flow ?? "") && url.searchParams.has("error")) {
    return oauthFailure(url, flow);
  }

  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  else error = new Error("Missing authentication token.");

  if (error) {
    return OAUTH_FLOWS.has(flow ?? "")
      ? oauthFailure(url, flow)
      : NextResponse.redirect(new URL("/auth?error=verification_failed", url.origin));
  }

  if (OAUTH_FLOWS.has(flow ?? "")) {
    const { data, error: userError } = await supabase.auth.getUser();
    const hasGoogleIdentity = data.user?.identities?.some((identity) => identity.provider === "google");
    if (userError || !data.user || !hasGoogleIdentity) return oauthFailure(url, flow);
  }

  if (flow === "google") {
    const destination = new URL("/auth/oauth-complete", url.origin);
    destination.searchParams.set("next", next);
    const response = NextResponse.redirect(destination);
    response.cookies.set("revit-google-oauth", "success", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/auth/oauth-complete",
      maxAge: 60,
    });
    return response;
  }

  if (flow === "link-google") {
    const destination = new URL("/overview", url.origin);
    destination.searchParams.set("account", "security");
    destination.searchParams.set("google_linked", "true");
    return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}