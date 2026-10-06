import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig, supabaseCookieOptions } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(client: ReturnType<typeof createBrowserClient>): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data, error } = await client.auth.refreshSession();
      if (error || !data.session?.access_token) return null;
      return data.session.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export function createBrowserFetch(
  clientGetter: () => ReturnType<typeof createBrowserClient> | null,
  refreshFn: (client: ReturnType<typeof createBrowserClient>) => Promise<string | null> = refreshAccessToken,
  baseFetch: typeof fetch = fetch,
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await baseFetch(input, init);
    const urlString = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const isRestOrStorage = urlString.includes("/rest/v1/") || urlString.includes("/storage/v1/");
    const isRetry = Boolean(
      (init?.headers && new Headers(init.headers).get("x-revit-retry"))
      || (input instanceof Request && input.headers.get("x-revit-retry")),
    );

    const client = clientGetter();
    if (response.status === 401 && isRestOrStorage && !isRetry && client) {
      const newToken = await refreshFn(client);
      if (newToken) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set("Authorization", `Bearer ${newToken}`);
        headers.set("x-revit-retry", "1");
        if (input instanceof Request) {
          return baseFetch(new Request(input, { ...init, headers }));
        }
        return baseFetch(input, { ...init, headers });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("revit:session_expired"));
      }
    }
    return response;
  };
}

export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseConfig();
    browserClient = createBrowserClient(url, key, {
      cookieOptions: supabaseCookieOptions(),
      auth: { detectSessionInUrl: false },
      global: {
        fetch: createBrowserFetch(() => browserClient),
      },
    });
  }
  return browserClient;
}
