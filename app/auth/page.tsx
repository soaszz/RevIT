import type { Metadata } from "next";
import Image from "next/image";
import AuthPanel from "./AuthPanel";
import { isSupabaseConfigured } from "../lib/supabase/config";

export const metadata: Metadata = {
  title: "Account",
  description: "Sign in to RevIT or create an account to keep your Medical Technology review progress connected.",
};

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "";
  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-intro" aria-label="About RevIT">
          <a className="auth-logo" href="/overview" aria-label="RevIT home">
            <span className="auth-logo-wordmark" aria-hidden="true"><Image src="/revit-logo.png" alt="" width={1376} height={768} priority /></span>
            <span className="auth-logo-frog" aria-hidden="true"><Image src="/revit-frog.png" alt="" width={2000} height={2000} priority /></span>
            <span className="sr-only">RevIT</span>
          </a>
          <div className="auth-hero-copy">
            <p className="eyebrow">Focused MedTech review</p>
            <h2>Review It<br />Thoroughly.</h2>
            <p>A focused review platform for Medical Technology students. Practice structured reviewer questions, identify areas that need more attention, plan your studies, and track your progress in one place.</p>
          </div>
          <ul className="auth-benefits" aria-label="RevIT features">
            <li><span>01</span><div><strong>Structured Reviewer Practice</strong><p>Practice organized Medical Technology questions by subject and topic.</p></div></li>
            <li><span>02</span><div><strong>Performance &amp; Weakness Analytics</strong><p>Track accuracy, identify weaker areas, and focus future review sessions.</p></div></li>
            <li><span>03</span><div><strong>Study Planning</strong><p>Organize study schedules, exams, events, and review sessions.</p></div></li>
            <li><span>04</span><div><strong>Progress &amp; Achievement Tracking</strong><p>Track study activity, streaks, XP, levels, achievements, and long-term progress.</p></div></li>
            <li><span>05</span><div><strong>Focused MedTech AI Support</strong><p>Get educational explanations while official reviewer answers remain separate from AI-generated content.</p></div></li>
          </ul>
        </aside>
        {isSupabaseConfigured()
          ? <AuthPanel next={params.next} turnstileSiteKey={turnstileSiteKey} />
          : <section className="auth-card"><div className="auth-heading"><p className="eyebrow">Setup required</p><h1>Welcome to RevIT.</h1><p>Connect Supabase to enable secure learner accounts and synced study progress.</p></div><p className="form-status info">Add the public Supabase URL and publishable key to your environment. Local reviewer mode remains available.</p><a className="primary-button auth-button-link" href="/overview">Continue locally</a></section>}
      </div>
    </main>
  );
}
