import RevITApp from "./RevITApp";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "./lib/supabase/config";
import { createClient } from "./lib/supabase/server";
import { isTransientAuthError, retryAuthRequest } from "./lib/supabase/retryAuth";

export default async function Home() {
  const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "";
  if (!isSupabaseConfigured()) return <RevITApp cloudEnabled={false} turnstileSiteKey={turnstileSiteKey} />;
  const supabase = await createClient();
  const claimsResult = await retryAuthRequest(() => supabase.auth.getClaims())
    .catch(() => redirect("/auth?session_unavailable=true"));
  if (isTransientAuthError(claimsResult.error)) redirect("/auth?session_unavailable=true");
  const { data: claimsData } = claimsResult;
  if (!claimsData?.claims?.sub) redirect("/auth");
  const [userResult, assuranceResult] = await Promise.all([
    retryAuthRequest(() => supabase.auth.getUser()),
    retryAuthRequest(() => supabase.auth.mfa.getAuthenticatorAssuranceLevel()),
  ]).catch(() => redirect("/auth?session_unavailable=true"));
  if (isTransientAuthError(userResult.error) || assuranceResult.error) redirect("/auth?session_unavailable=true");
  const { data: userData, error } = userResult;
  const { data: assurance } = assuranceResult;
  if (error || !userData.user) redirect("/auth?clear_session=true");
  if (!userData.user.email_confirmed_at) redirect("/auth/verify");
  if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") redirect("/auth/mfa?next=/overview");
  return <RevITApp cloudEnabled turnstileSiteKey={turnstileSiteKey} initialUser={{
    id: userData.user.id,
    email: userData.user.email ?? "",
    username: typeof userData.user.user_metadata.username === "string" ? userData.user.user_metadata.username : undefined,
  }} />;
}
