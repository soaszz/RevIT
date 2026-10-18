import "server-only";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { verifyAdminSession } from "../lib/admin/adminAuth";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RevIT Admin Control",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminControlPage() {
  const auth = await verifyAdminSession();

  if (!auth.authenticated) {
    redirect(`/auth?next=${encodeURIComponent("/admin")}#account`);
  }

  if (!auth.authorized || !auth.user) {
    return (
      <main style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        padding: "24px",
        background: "var(--canvas)",
        color: "var(--ink)",
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{
          maxWidth: "420px",
          textAlign: "center",
          padding: "32px 24px",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "16px",
        }}>
          <h1 style={{ fontSize: "20px", marginBottom: "8px", fontWeight: 700 }}>Access Denied</h1>
          <p style={{ color: "var(--muted)", fontSize: "14px", lineHeight: 1.5, marginBottom: "20px" }}>
            This account does not have administrative access.
          </p>
          <a
            href="/overview"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              background: "var(--green)",
              color: "var(--accent-ink)",
              textDecoration: "none",
              borderRadius: "10px",
              fontSize: "13.5px",
              fontWeight: 600,
            }}
          >
            Back to RevIT
          </a>
        </div>
      </main>
    );
  }

  return (
    <AdminPanel
      adminUserId={auth.user.id}
      adminEmail={auth.user.email || ""}
    />
  );
}
