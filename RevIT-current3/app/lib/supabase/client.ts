import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_COOKIE_MAX_AGE, supabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseConfig();
    browserClient = createBrowserClient(url, key, { cookieOptions: { maxAge: SUPABASE_COOKIE_MAX_AGE } });
  }
  return browserClient;
}
