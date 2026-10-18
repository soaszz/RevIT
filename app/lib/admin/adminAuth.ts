import "server-only";
import { createClient as createServerAuthClient } from "../supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function getAdminAllowlist(): Set<string> {
  const envVal = process.env.REVIT_ADMIN_USER_IDS || "";
  const ids = envVal
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return new Set(ids);
}

export function isUserAdminId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowlist = getAdminAllowlist();
  if (allowlist.size === 0) {
    return false;
  }
  return allowlist.has(userId.trim().toLowerCase());
}

export async function verifyAdminSession() {
  const supabase = await createServerAuthClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();

  if (authError || !userData?.user) {
    return {
      authenticated: false as const,
      authorized: false as const,
      user: null,
      error: "Authentication required.",
    };
  }

  const user = userData.user;
  const authorized = isUserAdminId(user.id);

  if (!authorized) {
    return {
      authenticated: true as const,
      authorized: false as const,
      user,
      error: "Access denied. Administrator privileges required.",
    };
  }

  return {
    authenticated: true as const,
    authorized: true as const,
    user,
    error: null,
  };
}

export function createAdminServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local. Add your Supabase service_role secret key to enable admin search and control."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
