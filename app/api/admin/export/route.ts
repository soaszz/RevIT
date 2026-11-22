import "server-only";
import { verifyAdminSession } from "../../../lib/admin/adminAuth";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { readReporting } from "../../../lib/admin/adminReporting";
import { csvText, EXPORT_LIMIT, validateFilters } from "../../../lib/admin/adminReportingCore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const json = (error: string, status: number) => Response.json({ error }, { status, headers });
  try {
    if (!isSupabaseConfigured()) return json("Admin sign-in required.", 401);
    const auth = await verifyAdminSession();
    if (!auth.authenticated || !auth.authorized) return json("Admin sign-in required.", auth.authenticated ? 403 : 401);
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") ?? "subscribers";
    if (!["subscribers", "history", "recorded", "monthly"].includes(kind)) return json("Invalid export.", 400);
    let filters;
    try { filters = validateFilters(params); } catch { return json("Invalid export filters.", 400); }
    if (kind === "history" && !filters.userId) return json("Choose a subscriber.", 400);
    const rows: unknown[][] = [];
    let more = false;
    let columns: string[];
    if (kind === "monthly") {
      const result = await readReporting("monthly", filters);
      columns = ["Recorded month (Manila, not settlement)", "Admin-recorded PHP", "Recorded paid events (not verified orders)", "Unknown amount events"];
      rows.push(...(result.months ?? []).map(row => [row.month, row.recordedAmount, row.recordedEvents, row.unknownAmounts]));
    } else {
      columns = kind === "subscribers" ? ["Username", "Status", "Start", "Expiration", "Recorded months", "Recorded PHP", "Billing evidence", "Source"] :
        ["Event ID (not payment ID)", "Event", "Recorded at", "Recorded months", "Recorded PHP", "Billing evidence", "Source"];
      for (let batch = 1; batch <= 4; batch++) {
        const result = await readReporting(kind === "subscribers" ? "subscribers" : kind === "history" ? "detail" : "transactions", { ...filters, page: batch }, 250);
        if (kind === "subscribers") rows.push(...(result.subscribers ?? []).map(row => [row.username, row.status, row.proStartedAt, row.proExpiresAt, row.planMonths, row.amountPhp, row.billingStatus, row.source]));
        else rows.push(...(result.history ?? []).map(row => [row.id, row.eventType, row.createdAt, row.planMonths, row.amountPhp, row.billingStatus, row.source]));
        more = Boolean(result.hasMore);
        if (!more) break;
      }
    }
    return new Response(csvText(columns, rows.slice(0, EXPORT_LIMIT)), { headers: {
      ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="revit-${kind}.csv"`,
      "X-Export-Truncated": String(more), "X-Export-Limit": String(EXPORT_LIMIT),
    } });
  } catch { return json("Export unavailable. No file was saved.", 503); }
}
