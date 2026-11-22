import "server-only";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { readReporting } from "../../../lib/admin/adminReporting";
import { validateFilters, type ReportingMode } from "../../../lib/admin/adminReportingCore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  try {
    if (!isSupabaseConfigured()) return NextResponse.json({ error: "Admin sign-in required." }, { status: 401, headers });
    const auth = await verifyAdminSession();
    if (!auth.authenticated || !auth.authorized) return NextResponse.json({ error: "Admin sign-in required." }, { status: auth.authenticated ? 403 : 401, headers });
    const params = new URL(request.url).searchParams;
    const mode = params.get("mode") as ReportingMode;
    if (!["summary", "subscribers", "detail", "monthly", "transactions"].includes(mode)) return NextResponse.json({ error: "Invalid report." }, { status: 400, headers });
    let filters;
    try { filters = validateFilters(params); } catch { return NextResponse.json({ error: "Invalid report filters." }, { status: 400, headers }); }
    if (mode === "detail" && !filters.userId) return NextResponse.json({ error: "Choose a subscriber." }, { status: 400, headers });
    const fresh = params.get("fresh") === "1";
    return NextResponse.json(await readReporting(mode, filters, undefined, fresh), { headers });
  } catch {
    return NextResponse.json({ error: "Reporting unavailable. No totals have been inferred. Existing Grant/Revoke remains separate." }, { status: 503, headers });
  }
}
