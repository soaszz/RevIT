import type { SupabaseClient } from "@supabase/supabase-js";

export type AiRateLimitReservation = {
  allowed: boolean;
  reservationId: string | null;
  tier: "free" | "subscription";
  minuteLimit: number;
  dailyLimit: number;
  minuteRemaining: number;
  dailyRemaining: number;
  retryAfterSeconds: number;
};

type ReservationRow = {
  allowed?: unknown;
  reservation_id?: unknown;
  tier?: unknown;
  minute_limit?: unknown;
  daily_limit?: unknown;
  minute_remaining?: unknown;
  daily_remaining?: unknown;
  retry_after_seconds?: unknown;
};

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function reserveAiRequest(client: SupabaseClient): Promise<AiRateLimitReservation> {
  const { data, error } = await client.rpc("reserve_ai_request");
  if (error) throw new Error("AI_RATE_LIMIT_UNAVAILABLE");
  const row = (Array.isArray(data) ? data[0] : data) as ReservationRow | null;
  const minuteLimit = integer(row?.minute_limit);
  const dailyLimit = integer(row?.daily_limit);
  const minuteRemaining = integer(row?.minute_remaining);
  const dailyRemaining = integer(row?.daily_remaining);
  const retryAfterSeconds = integer(row?.retry_after_seconds);
  const tier = row?.tier === "subscription" ? "subscription" : row?.tier === "free" ? "free" : null;
  const reservationId = typeof row?.reservation_id === "string" ? row.reservation_id : null;
  if (
    typeof row?.allowed !== "boolean"
    || !tier
    || minuteLimit === null
    || dailyLimit === null
    || minuteRemaining === null
    || dailyRemaining === null
    || retryAfterSeconds === null
    || (row.allowed && !reservationId)
  ) {
    throw new Error("AI_RATE_LIMIT_INVALID_RESPONSE");
  }
  return {
    allowed: row.allowed,
    reservationId,
    tier,
    minuteLimit,
    dailyLimit,
    minuteRemaining,
    dailyRemaining,
    retryAfterSeconds,
  };
}

export async function finalizeAiRequest(client: SupabaseClient, reservationId: string, succeeded: boolean) {
  const { data, error } = await client.rpc("finalize_ai_request", {
    p_reservation_id: reservationId,
    p_succeeded: succeeded,
  });
  if (error || data !== true) throw new Error("AI_RATE_LIMIT_FINALIZE_FAILED");
}

export function rateLimitHeaders(reservation: AiRateLimitReservation) {
  return {
    "X-RateLimit-Limit-Minute": String(reservation.minuteLimit),
    "X-RateLimit-Remaining-Minute": String(reservation.minuteRemaining),
    "X-RateLimit-Limit-Day": String(reservation.dailyLimit),
    "X-RateLimit-Remaining-Day": String(reservation.dailyRemaining),
  };
}
