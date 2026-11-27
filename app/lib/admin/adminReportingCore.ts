// Shared presentation/validation only. No credentials, database client or authorization here.
export const PAGE_SIZE = 25;
export const SEARCH_DELAY = 450;
export const SUMMARY_SECONDS = 600;
export const EXPORT_LIMIT = 1000;
export const SALES_CACHE_TAG = "admin-subscription-summary-v1";
export const PAYMENT_LIMITATION = "Admin-confirmed sales record amounts the administrator has confirmed as received. They are not independently provider-verified payments. Verified revenue, payment references, settlement dates and refunds remain Unknown; historical events without amounts stay Unknown.";
export type ReportingMode = "summary" | "subscribers" | "detail" | "monthly" | "transactions";
export const EVENT_TYPES = ["all", "activated", "extended", "renewed", "revoked", "expired", "expiration_modified"] as const;
export type ReportingFilters = {
  q: string; status: string; months: string; source: string; page: number; days: number;
  from: string; to: string; expiresFrom: string; expiresTo: string; userId: string; event: string;
};
export type ConsistencySummary = {
  activeConsistent: number; freeConsistent: number; staleProLabel: number; missingExpiryPro: number;
  potentialAccessIssue: number; activeNoRecord: number; reviewNeeded: number;
  confirmedMismatch: number; verified: boolean;
};
// Reasons mirror the reporting RPC's access-consistency CASE exactly.
export const CONSISTENCY_REASONS: Readonly<Record<string, string>> = Object.freeze({
  access_issue: "Recorded grant is active but effective Pro access is Free.",
  active_no_record: "Effective Pro access without a matching recorded grant.",
  missing_expiry: "Stored Pro label has no expiration date.",
  stale_label: "Expired subscription still stored with a Pro label.",
});
export type ReportingSummary = {
  recordedBilling: number | null;
  recordedPurchases?: number | null; renewalSales?: number | null;
  revenue: null; paidOrders: null; totalSubscribers: number; activePro: number; expiringSoon: number;
  expired: number; formerPro: number; renewals: number; manualGrants: number; asOf: string;
  consistency?: ConsistencySummary;
};
export type SubscriberRow = {
  id: string; username: string | null; plan: string; proStartedAt: string | null;
  proExpiresAt: string | null; recordedExpiresAt: string | null; status: string; planMonths: number | null;
  amountPhp: number | null; billingStatus: string | null; source: string | null;
  consistency: string | null;
};
export type HistoryRow = {
  id: string; userId: string; eventType: string; source: string | null; createdAt: string;
  previousExpiresAt: string | null; newExpiresAt: string | null;
  planMonths: number | null; amountPhp: number | null; billingStatus: string | null;
  // Present only once the separately approved history-identity proposal is installed and the
  // read RPC returns it. Absent today, so the History table shows a neutral fallback.
  username?: string | null;
};
export type MonthlyRow = { month: string; recordedAmount: number | null; recordedEvents: number; unknownAmounts: number };
export type PlanRow = { months: number | null; recordedAmount: number | null; recordedEvents: number };
export type SourceRow = { source: string; recordedAmount: number | null; events: number };
// Active Pro grouped by the duration stored on the account's most recent recorded grant. The bucket
// is read straight from stored plan_months; "custom" is a recorded purchase whose grant carried no
// preset duration, and "unknown" is a grant with no recorded duration. Neither is derived.
export type PlanBreakdownRow = { bucket: "1" | "3" | "6" | "custom" | "unknown"; activePro: number };
export type ReportingResult = {
  summary?: ReportingSummary; subscribers?: SubscriberRow[]; history?: HistoryRow[];
  months?: MonthlyRow[]; plans?: PlanRow[]; sources?: SourceRow[]; renewals?: number;
  // Purchased renewal events with a recorded amount. All renewal events remain in `renewals`.
  renewalSales?: number;
  // Additive bounded read fields. Absent until the guarded reporting proposal is installed; the UI
  // degrades to an explicit pending state instead of guessing. Recent purchases reuse HistoryRow's
  // response identity and carry only recorded values.
  activePlanBreakdown?: PlanBreakdownRow[];
  recentPurchases?: HistoryRow[];
  hasMore?: boolean; asOf: string;
};
export const EMPTY_FILTERS: ReportingFilters = {
  q: "", status: "all", months: "all", source: "all", page: 1, days: 7,
  from: "", to: "", expiresFrom: "", expiresTo: "", userId: "", event: "all",
};
function choice(value: string, allowed: string[]) {
  if (!allowed.includes(value)) throw new Error("Invalid filter.");
  return value;
}
function day(value: string) {
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date.");
  return value;
}
export function validateFilters(params: URLSearchParams): ReportingFilters {
  const number = (name: string, fallback: number, max: number) => {
    const raw = params.get(name) ?? String(fallback);
    if (!/^\d+$/.test(raw)) throw new Error("Invalid page or window.");
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("Invalid page or window.");
    return n;
  };
  const q = (params.get("q") ?? "").trim();
  if (q.length > 80 || (q.length > 0 && q.length < 2) || /[\x00-\x1f]/.test(q)) throw new Error("Use 2–80 search characters.");
  const userId = params.get("userId") ?? "";
  if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Invalid subscriber identifier.");
  const filters: ReportingFilters = {
    q, userId, page: number("page", 1, 400), days: number("days", 7, 30),
    status: choice(params.get("status") ?? "all", ["all", "active", "expiring", "expired", "former", "free", "review"]),
    months: choice(params.get("months") ?? "all", ["all", "1", "3", "6", "unknown"]),
    source: choice(params.get("source") ?? "all", ["all", "purchased", "manual", "unknown"]),
    event: choice(params.get("event") ?? "all", [...EVENT_TYPES]),
    from: day(params.get("from") ?? ""), to: day(params.get("to") ?? ""),
    expiresFrom: day(params.get("expiresFrom") ?? ""), expiresTo: day(params.get("expiresTo") ?? ""),
  };
  for (const [start, end] of [[filters.from, filters.to], [filters.expiresFrom, filters.expiresTo]]) {
    if (start && end && (start > end || Date.parse(end) - Date.parse(start) > 731 * 86400000)) throw new Error("Choose an ordered date range of at most two years.");
  }
  if (Boolean(filters.from) !== Boolean(filters.to)) throw new Error("Choose both recorded-date boundaries.");
  return filters;
}
export function reportingParams(filters: ReportingFilters) {
  return new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
}
export function manilaDayStart(value: string) {
  return new Date(`${day(value)}T00:00:00+08:00`).toISOString();
}
export function subscriptionStatus(plan: string, expiry: string | null, hadPro: boolean, now: number, lastEvent?: string) {
  if (plan === "pro" && expiry && Date.parse(expiry) > now) return "active";
  if (expiry && Date.parse(expiry) <= now && (plan === "pro" || lastEvent === "expired")) return "expired";
  return hadPro ? "former" : "free";
}
// Mirrors the reporting RPC's access-consistency CASE. Effective Pro access is the deployed
// get_my_entitlement rule: stored plan='pro' with a future expiration. Never calls a per-user RPC.
export function consistencyReason(row: Pick<SubscriberRow, "plan" | "proExpiresAt" | "recordedExpiresAt">, now = Date.now()): string | null {
  const effective = row.plan === "pro" && row.proExpiresAt !== null && Date.parse(row.proExpiresAt) > now;
  const recordedActive = row.recordedExpiresAt != null && Date.parse(row.recordedExpiresAt) > now;
  if (effective && recordedActive) return null;
  if (!effective && recordedActive) return "access_issue";
  if (effective && !recordedActive) return "active_no_record";
  if (row.plan === "pro" && row.proExpiresAt === null) return "missing_expiry";
  if (row.plan === "pro" && row.proExpiresAt !== null && Date.parse(row.proExpiresAt) <= now) return "stale_label";
  return null;
}
export function recordedAmount(row: Pick<HistoryRow, "billingStatus" | "amountPhp" | "source">): number | null {
  if (row.source !== "purchased" || row.amountPhp === null || !Number.isFinite(row.amountPhp)) return null;
  // Admin-confirmed custom purchases may record an explicit 0; provider-verified paid events
  // keep their existing positive-amount requirement.
  if (row.billingStatus === "admin_confirmed") return row.amountPhp >= 0 ? row.amountPhp : null;
  if (row.billingStatus === "paid") return row.amountPhp > 0 ? row.amountPhp : null;
  return null;
}
export function csvCell(value: unknown): string {
  let text = value == null ? "Unknown" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvText(headers: string[], rows: unknown[][]) {
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
// Deduplication lasts only while work is pending; failures never become cached results.
export function singleFlight() {
  const pending = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const operation = Promise.resolve().then(load).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };
}
// Presentation formatters. Unknown/null financial or date values must never be rendered as zero.
export function money(value: number | null | undefined): string {
  return value == null ? "Unknown" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}
export function manilaDate(value: string | null | undefined): string {
  return value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(value)) : "Unknown";
}
export function manilaStamp(value: string | null | undefined): string {
  return value ? `${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value))} Asia/Manila` : "Not yet refreshed";
}
export function duration(value: number | null | undefined): string {
  return value == null ? "Unknown" : `${value} month${value === 1 ? "" : "s"}`;
}
// Fixed presentation order for the current-Pro duration breakdown. Counts come from the bounded
// reporting response; nothing is derived from dates or prices. Clean text labels only.
export const PLAN_BUCKETS = ["1", "3", "6", "custom", "unknown"] as const;
export function planBucketLabel(bucket: string): string {
  if (bucket === "1") return "1 Month";
  if (bucket === "3") return "3 Months";
  if (bucket === "6") return "6 Months";
  if (bucket === "custom") return "Custom";
  return "Duration not recorded";
}
export function human(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Unknown";
}
// History presentation only. Missing historical metadata is labelled, never rendered as zero,
// and never backfilled from current pricing or derived from start/expiration dates.
export function recordedDuration(value: number | null | undefined): string {
  return value == null ? "Not recorded" : `${value} month${value === 1 ? "" : "s"}`;
}
export function recordedAmountText(value: number | null | undefined): string {
  return value == null ? "Not recorded" : money(value);
}
export function recordedExpiry(value: string | null | undefined): string {
  return value ? manilaDate(value) : "No expiry recorded";
}
// Billing evidence mirrors stored billing_status and never asserts independent verification.
// 'paid' is an administrator-confirmed amount; provider verification is not collected here.
export function billingEvidence(status: string | null | undefined): string {
  if (!status) return "Not recorded";
  if (status === "admin_confirmed") return "Admin-confirmed";
  if (status === "paid") return "Provider-verified";
  if (status === "complimentary") return "Complimentary";
  if (status === "unknown") return "Unverified";
  return human(status);
}
// Subscriber labels. "free" is the RPC's never-subscribed state (no history, no start/expiry),
// so those accounts get "Not applicable"; everyone else gets their stored value or "Not recorded".
function neverSubscribed(status: string): boolean {
  return status === "free";
}
export function subscriberStarted(value: string | null | undefined, status: string): string {
  if (neverSubscribed(status)) return "Not applicable";
  return value ? manilaDate(value) : "Not recorded";
}
export function subscriberDuration(value: number | null | undefined, status: string): string {
  if (neverSubscribed(status)) return "Not applicable";
  return recordedDuration(value);
}
export function subscriberExpiration(value: string | null | undefined, status: string): string {
  if (neverSubscribed(status)) return "Not applicable";
  return value ? manilaDate(value) : "Not recorded";
}
// Shared source label. Never-Pro rows pass status="free" to become "Not applicable"; history
// rows omit status and fall back to "Not recorded". No custom-date classification exists in the
// stored record, so it is never claimed.
export function recordedSource(value: string | null | undefined, status?: string): string {
  if (status === "free") return "Not applicable";
  return value ? human(value) : "Not recorded";
}
// ---------------------------------------------------------------- status tones
// Text-only status colouring. A tone only selects a semantic token in the dashboard
// stylesheet; it never implies a pill, chip, badge, background, border or icon container.
export type StatusTone = "positive" | "warning" | "negative" | "neutral" | "muted" | "subtlePositive" | "subtleBlue";
const WEEK_MS = 7 * 86400000;
export function subscriberStatusText(status: string | null | undefined): string {
  if (status === "active") return "Active Pro";
  if (status === "expired") return "Expired";
  if (status === "former") return "Former Pro";
  if (status === "free") return "Free";
  return "Unknown";
}
export function subscriberStatusTone(status: string | null | undefined): StatusTone {
  if (status === "active") return "positive";
  if (status === "expired") return "negative";
  return "neutral";
}
// Expiration: missing or not-applicable is muted, past is negative, within seven days is
// warning, otherwise neutral. An unparseable stored value is treated as missing, never red.
export function expirationTone(value: string | null | undefined, status: string | undefined, now = Date.now()): StatusTone {
  if (status === "free" || !value) return "muted";
  const expires = Date.parse(value);
  if (!Number.isFinite(expires)) return "muted";
  if (expires <= now) return "negative";
  return expires - now <= WEEK_MS ? "warning" : "neutral";
}
export function recordedFactTone(value: unknown, status?: string): StatusTone {
  if (status === "free" || value == null || value === "") return "muted";
  return "neutral";
}
export function consistencyTone(reason: string | null | undefined): StatusTone {
  return reason ? "warning" : "positive";
}
// Red is reserved for a verified mismatch; an unverified count stays neutral.
export function confirmedIssueTone(verified: boolean, count: number): StatusTone {
  return verified && count > 0 ? "negative" : "neutral";
}
export function eventTone(eventType: string | null | undefined): StatusTone {
  if (eventType === "renewed") return "subtlePositive";
  if (eventType === "revoked" || eventType === "expired") return "negative";
  return "neutral";
}
export function sourceTone(source: string | null | undefined): StatusTone {
  if (source === "gift") return "subtlePositive";
  if (source === "prize") return "subtleBlue";
  return "neutral";
}
export function billingTone(status: string | null | undefined): StatusTone {
  if (!status) return "muted";
  if (status === "complimentary") return "subtlePositive";
  return "neutral";
}

