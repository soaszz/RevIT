"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("RevIT Global Fatal Error:", error);
  }, [error]);

  function clearSessionAndReload() {
    try {
      localStorage.removeItem("revit-remember-until");
      localStorage.removeItem("revit-session-policy");
      localStorage.removeItem("revit-login-attempts");
      sessionStorage.clear();

      document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch {}

    window.location.href = "/auth";
  }

  return (
    <html lang="en">
      <body>
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

            <h1 style={{ margin: "0 0 8px", fontSize: "22px", color: "var(--ink)" }}>Fatal Application Error</h1>
            <p style={{ margin: "0 0 32px", color: "var(--muted)", fontSize: "14px", lineHeight: "1.6" }}>
              RevIT failed to load entirely. If you recently modified your account, clearing your session might resolve this.
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              <button
                onClick={clearSessionAndReload}
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
          </div>
        </div>
      </body>
    </html>
  );
}
