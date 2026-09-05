export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return { url, key };
}

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  const raw = configured ?? (vercel ? `https://${vercel}` : "http://localhost:3000");
  return raw.replace(/\/$/, "");
}
