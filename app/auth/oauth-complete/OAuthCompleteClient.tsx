"use client";

import type { UserIdentity } from "@supabase/supabase-js";
import { useEffect } from "react";
import RevITLoadingScreen from "../../components/RevITLoadingScreen";
import { createClient } from "../../lib/supabase/client";

const LAST_SIGN_IN_METHOD_KEY = "revit:lastSignInMethod";
// Bounded so a stalled verification cannot leave the loading screen up forever.
const SESSION_CHECK_TIMEOUT_MS = 15_000;
const SESSION_ERROR_DESTINATION = "/auth?oauth_error=google_session";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

export default function OAuthCompleteClient() {
  useEffect(() => {
    let finished = false;
    const finish = (destination: string) => {
      if (finished) return;
      finished = true;
      window.location.replace(destination);
    };
    const timer = window.setTimeout(() => finish(SESSION_ERROR_DESTINATION), SESSION_CHECK_TIMEOUT_MS);
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
    void createClient().auth.getUser().then((result: { data: { user: { identities?: UserIdentity[] } | null }; error: unknown }) => {
      if (result.error || !result.data.user?.identities?.some((identity) => identity.provider === "google")) {
        finish(SESSION_ERROR_DESTINATION);
        return;
      }
      try {
        localStorage.setItem(LAST_SIGN_IN_METHOD_KEY, "google");
      } catch {
        // Blocked storage only skips the sign-in-method hint; it never blocks access.
      }
      finish(next);
    }).catch(() => finish(SESSION_ERROR_DESTINATION));
    return () => window.clearTimeout(timer);
  }, []);

  return <RevITLoadingScreen status="Finishing Google sign-in..." />;
}
