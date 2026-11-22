import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { readReporting } from "../../../lib/admin/adminReporting";
import { validateFilters } from "../../../lib/admin/adminReportingCore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
// Paginated, bounded global subscription-event history (no per-subscriber fan-out, no counts).
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
    const auth = await verifyAdminSession();
    if (!auth.authenticated || !auth.authorized) return NextResponse.json({ error: "Admin sign-in required." }, { status: auth.authenticated ? 403 : 401, headers });
    let filters;
    try { filters = validateFilters(new URL(request.url).searchParams); } catch { return NextResponse.json({ error: "Invalid history filters." }, { status: 400, headers }); }
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await readReporting("transactions", filters, undefined, fresh), { headers });
  } catch {
    return NextResponse.json({ error: "History unavailable. No totals have been inferred. Existing Grant/Revoke remains separate." }, { status: 503, headers });
  }
}
