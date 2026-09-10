import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig, supabaseCookieOptions } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseConfig();
    browserClient = createBrowserClient(url, key, {
      cookieOptions: supabaseCookieOptions(),
      auth: { detectSessionInUrl: false },
    });
  }
  return browserClient;
}
