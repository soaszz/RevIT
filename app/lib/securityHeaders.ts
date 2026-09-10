const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function configuredSupabaseOrigins() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return { http: "", websocket: "" };

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return { http: "", websocket: "" };
    }
    const websocketProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return {
      http: url.origin,
      websocket: `${websocketProtocol}//${url.host}`,
    };
  } catch {
    return { http: "", websocket: "" };
  }
}

export function contentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const supabase = configuredSupabaseOrigins();
  const connectSources = ["'self'", TURNSTILE_ORIGIN, supabase.http, supabase.websocket].filter(Boolean).join(" ");
  const imageSources = ["'self'", "data:", "blob:", supabase.http].filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources}`,
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
