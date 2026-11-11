import "server-only";
import { NextResponse } from "next/server";
import { isQuestionBankPublished } from "../entitlements";
import { isSupabaseConfigured } from "../supabase/config";
import { createClient } from "../supabase/server";

export const PRIVATE_REVIEWER_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export function privateReviewerError(status: number) {
  return NextResponse.json({ error: status === 403 ? "Active RevIT Pro subscription required." : "Reviewer content unavailable." },
    { status, headers: PRIVATE_REVIEWER_HEADERS });
}

// One authenticated-user lookup and one database-time entitlement RPC per request.
// No client clock, VIP override, cross-user cache or service-role entitlement lookup.
export async function authorizePrivateReviewer(book: "BOC" | "Elsevier"): Promise<Response | null> {
  if (!isQuestionBankPublished(book)) return privateReviewerError(404);
  if (!isSupabaseConfigured()) return privateReviewerError(503);
  try {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data?.user) return privateReviewerError(401);
    const { data: rows, error } = await supabase.rpc("get_my_entitlement");
    const entitlement = Array.isArray(rows) ? rows[0] : rows;
    if (error || !entitlement) return privateReviewerError(503);
    const now = typeof entitlement.server_now === "string" ? Date.parse(entitlement.server_now) : NaN;
    const expires = typeof entitlement.pro_expires_at === "string" ? Date.parse(entitlement.pro_expires_at) : NaN;
    if (entitlement.effective_plan !== "pro" || !Number.isFinite(now) || !Number.isFinite(expires) || expires <= now) {
      return privateReviewerError(403);
    }
    return null;
  } catch {
    return privateReviewerError(503);
  }
}
