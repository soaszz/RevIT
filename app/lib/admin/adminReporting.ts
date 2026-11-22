import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminServiceClient } from "./adminAuth";
import { EMPTY_FILTERS, SALES_CACHE_TAG, SUMMARY_SECONDS, singleFlight, type ReportingFilters, type ReportingMode, type ReportingResult } from "./adminReportingCore";

const deduplicate = singleFlight();
async function query(mode: ReportingMode, filters: ReportingFilters, limit = 25): Promise<ReportingResult> {
  // This SELECT-only RPC is a proposal until separately reviewed/installed. Never fall back
  // to downloading tables, N+1 Auth lookups or treating a missing RPC as zero revenue.
  const { data, error } = await createAdminServiceClient().rpc("admin_read_subscriptions", {
    p_mode: mode, p_filters: filters, p_limit: limit,
  }).abortSignal(AbortSignal.timeout(8000));
  if (error || !data) throw new Error("REPORTING_UNAVAILABLE");
  return data as ReportingResult;
}
// Existing project does not enable Cache Components. Use its supported Data Cache API;
// cache only aggregate metrics, never the admin session, directory or financial rows.
const summary = unstable_cache(
  (days: number) => query("summary", { ...EMPTY_FILTERS, days }),
  ["admin-subscription-summary-v1"], { revalidate: SUMMARY_SECONDS, tags: [SALES_CACHE_TAG] },
);
export function readReporting(mode: ReportingMode, filters: ReportingFilters, limit = 25, fresh = false) {
  const key = JSON.stringify([mode, mode === "summary" ? filters.days : filters, limit, fresh]);
  // Manual refresh passes fresh=true so the active section reads live data instead of the
  // 10-minute summary cache. Bypass is bounded to the one requested call; the cache and tag
  // remain in place for every other reader, and a successful write still invalidates the tag.
  return deduplicate(key, () => mode === "summary"
    ? (fresh ? query("summary", { ...EMPTY_FILTERS, days: filters.days }) : summary(filters.days))
    : query(mode, filters, limit));
}
