import AuthPanel from "./AuthPanel";
import { isSupabaseConfigured } from "../lib/supabase/config";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "";
  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <aside className="auth-intro" aria-label="About RevIT">
          <a className="auth-logo" href="/overview" aria-label="RevIT home"><span className="brand-mark">R</span><strong>RevIT</strong></a>
          <div>
            <p className="eyebrow">Focused MedTech review</p>
            <h2>Learn with purpose. Track every step.</h2>
            <p>Study Bacteriology and Hematology with source-aware practice, clear AI explanations, grade planning, and progress that follows you across devices.</p>
          </div>
          <ul className="auth-benefits" aria-label="RevIT features">
            <li><span>01</span>Reviewer-grounded practice</li>
            <li><span>02</span>Private cloud progress</li>
            <li><span>03</span>Focused MedTech AI support</li>
          </ul>
        </aside>
        {isSupabaseConfigured()
          ? <AuthPanel next={params.next} turnstileSiteKey={turnstileSiteKey} />
          : <section className="auth-card"><div className="auth-heading"><p className="eyebrow">Setup required</p><h1>Welcome to RevIT.</h1><p>Connect Supabase to enable secure learner accounts and synced study progress.</p></div><p className="form-status info">Add the public Supabase URL and publishable key to your environment. Local reviewer mode remains available.</p><a className="primary-button auth-button-link" href="/overview">Continue locally</a></section>}
      </div>
    </main>
  );
}
