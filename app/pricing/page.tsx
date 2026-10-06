import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PublicThemeToggle from "../components/PublicThemeToggle";
import PricingContent from "./PricingContent";
import { isSupabaseConfigured } from "../lib/supabase/config";
import { createClient } from "../lib/supabase/server";
import type { SubscriptionEntitlement } from "../lib/entitlements";
import styles from "./PricingPage.module.css";

export const metadata: Metadata = {
  title: "RevIT Free and Pro Plans | Review It Thoroughly",
  description: "Compare RevIT Free and RevIT Pro study features, question banks, and weakness analytics.",
};

export default async function PricingPage() {
  let initialUser: { id: string; email?: string } | null = null;
  let initialEntitlement: SubscriptionEntitlement | null = null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        initialUser = { id: userData.user.id, email: userData.user.email };
        const { data: entitlementRows } = await supabase.rpc("get_my_entitlement");
        if (entitlementRows) {
          const row = Array.isArray(entitlementRows) ? entitlementRows[0] : entitlementRows;
          if (row) {
            initialEntitlement = {
              storedPlan: row.stored_plan === "pro" ? "pro" : "free",
              effectivePlan: row.effective_plan === "pro" ? "pro" : "free",
              proStartedAt: typeof row.pro_started_at === "string" ? row.pro_started_at : null,
              proExpiresAt: typeof row.pro_expires_at === "string" ? row.pro_expires_at : null,
              serverNow: typeof row.server_now === "string" ? row.server_now : null,
            };
          }
        }
      }
    } catch {
      // Fallback gracefully on SSR errors or unconfigured client
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/overview" aria-label="Return to RevIT">
          <span className={styles.wordmark} aria-hidden="true">
            <Image src="/icons/neu/revit-wordmark.png" alt="" width={1086} height={362} priority />
          </span>
          <span>Review It Thoroughly.</span>
        </Link>
        <PublicThemeToggle />
      </header>

      <div className={styles.subHeaderNav}>
        <Link href="/library" className={styles.backLink}>
          ← Back to review
        </Link>
      </div>

      <PricingContent
        initialUser={initialUser}
        initialEntitlement={initialEntitlement}
      />

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} RevIT · Review It Thoroughly.</p>
        <nav aria-label="Pricing and legal links">
          <Link href="/library">Back to review</Link>
          <Link href="/overview">Study Workspace</Link>
          <Link href="/support">Support RevIT</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </footer>
    </main>
  );
}
