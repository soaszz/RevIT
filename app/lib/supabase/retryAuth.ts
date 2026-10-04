import { withTimeout } from "../withTimeout";

type AuthResult = { error: { status?: number } | null };

export function isTransientAuthError(error: AuthResult["error"]) {
  return Boolean(error && (error.status ?? 500) >= 500);
}

export async function retryAuthRequest<T extends AuthResult>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await withTimeout(request(), 6_000);
    const status = result.error?.status;
    const retryable = status === 502 || status === 503 || status === 504;
    if (!retryable || attempt === 1) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Authentication service unavailable.");
}
