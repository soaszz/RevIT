import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseConfig();
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
