"use client";

import type { UserIdentity } from "@supabase/supabase-js";
import { useEffect } from "react";
import { createClient } from "../../lib/supabase/client";

const LAST_SIGN_IN_METHOD_KEY = "revit:lastSignInMethod";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

export default function OAuthCompleteClient() {
  useEffect(() => {
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    void createClient().auth.getUser().then((result: { data: { user: { identities?: UserIdentity[] } | null }; error: unknown }) => {
      if (result.error || !result.data.user?.identities?.some((identity) => identity.provider === "google")) {
        window.location.replace("/auth?oauth_error=google_session");
        return;
      }
      localStorage.setItem(LAST_SIGN_IN_METHOD_KEY, "google");
      window.location.replace(next);
    });
  }, []);

  return (
    <main className="auth-shell">
      <section className="auth-card oauth-complete-card" aria-live="polite">
        <p className="eyebrow">RevIT</p>
        <h1>Finishing Google sign-in...</h1>
        <p className="security-copy">Your account is connected. Taking you to your review.</p>
      </section>
    </main>
  );
}