import AuthPanel from "./AuthPanel";
import { isSupabaseConfigured } from "../lib/supabase/config";

export default async function AuthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth-shell">
      {isSupabaseConfigured()
        ? <AuthPanel next={params.next} />
        : <section className="auth-card"><span className="brand-mark auth-brand">R</span><p className="eyebrow">Setup required</p><h1>Connect Supabase to enable accounts.</h1><p>Add the public Supabase URL and publishable key in your environment. Local reviewer mode remains available from the home page.</p><a className="primary-button auth-button-link" href="/overview">Continue locally</a></section>}
    </main>
  );
}
