"use client";

import { useEffect } from "react";
import Link from "next/link";
import { createClient } from "./lib/supabase/client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("RevIT Application Error:", error);
  }, [error]);

  async function clearSession() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Ignore errors if client is totally broken
    }

    // Nuke all RevIT related local storage just in case
    try {
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      localStorage.removeItem("revit-login-attempts");
      sessionStorage.clear();

      // Attempt to clear Supabase cookie manually if possible
      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch {}

    window.location.href = "/auth";
  }

  return (
    <div className="onboarding-backdrop" style={{ background: "var(--canvas)" }}>
      <div className="onboarding-card" style={{ textAlign: "center", padding: "48px 32px", maxWidth: "440px" }}>
        <div style={{
          width: "64px", height: "64px", margin: "0 auto 20px", 
          background: "var(--amber-soft)", borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--amber)"
        }}>
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h1 id="onboarding-title" style={{ margin: "0 0 8px", fontSize: "22px", color: "var(--ink)" }}>Something went wrong</h1>
        <p style={{ margin: "0 0 32px", color: "var(--muted)", fontSize: "14px", lineHeight: "1.6" }}>
          The application encountered a critical error. If you recently deleted or modified your account, your local session may be corrupted.
        </p>

        <div style={{ display: "grid", gap: "12px" }}>
          <button
            onClick={clearSession}
            className="primary-button wide"
            style={{ padding: "14px", fontSize: "14px", background: "var(--green)" }}
          >
            Clear Session & Sign In
          </button>

          <button
            onClick={() => reset()}
            className="primary-button wide"
            style={{ padding: "14px", fontSize: "14px", background: "transparent", border: "1px solid var(--line)", color: "var(--ink)", boxShadow: "none" }}
          >
            Try Again
          </button>
        </div>

        <div style={{ marginTop: "24px" }}>
          <Link href="/overview" className="text-button" style={{ color: "var(--muted)", fontSize: "13px" }}>
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
