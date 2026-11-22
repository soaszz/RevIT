import { consistencyReason, EXPORT_LIMIT, recordedAmount, subscriptionStatus, type ConsistencySummary, type HistoryRow, type ReportingFilters, type ReportingMode, type ReportingResult, type SubscriberRow } from "../lib/admin/adminReportingCore";

// Invented fixtures only. No imported production records, identifiers, credentials or API calls.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function syntheticRecords(now = Date.now()) {
  const history: HistoryRow[] = [];
  const subscribers: SubscriberRow[] = Array.from({ length: 67 }, (_, index) => {
    const n = index + 1, months = [1, 3, 6][index % 3];
    const source = index % 7 === 0 ? "gift" : index % 11 === 0 ? null : "purchased";
    const plan = index % 4 === 0 ? "free" : "pro";
    const expires = new Date(now + (index % 4 === 0 ? -3 : index % 4 === 1 ? 3 : 60) * 86400000).toISOString();
    // Two purpose-built custom-duration purchases: a recorded amount and an explicit zero.
    const customDuration = n === 2 || n === 6;
    const amount = customDuration ? (n === 2 ? 49 : 0) : source === "gift" ? 0 : source == null ? null : [79, 219, 399][index % 3];
    // Deterministic demo of an access-consistency review: some Pro-labelled rows carry no
    // recorded grant at all. Everything else mirrors the RPC's effective-entitlement rule.
    const mismatch = plan === "pro" && index % 10 === 0;
    const recordedExpiresAt = mismatch ? null : expires;
    const row: SubscriberRow = {
      id: id(n), username: `demo_learner_${String(n).padStart(2, "0")}`, plan,
      proStartedAt: new Date(now - 86400000 * 25).toISOString(), proExpiresAt: expires,
      recordedExpiresAt, status: subscriptionStatus(plan, expires, true, now, plan === "free" ? "expired" : "activated"),
      planMonths: customDuration ? null : source ? months : null,
      amountPhp: amount, billingStatus: amount === null ? "unknown" : source === "gift" ? "complimentary" : "admin_confirmed", source,
      consistency: consistencyReason({ plan, proExpiresAt: expires, recordedExpiresAt }, now),
    };
    if (!mismatch) history.push({ id: id(1000 + n), userId: row.id, eventType: n % 3 === 0 ? "renewed" : "activated", source,
      createdAt: new Date(now - n * 86400000).toISOString(), previousExpiresAt: null, newExpiresAt: expires,
      planMonths: row.planMonths, amountPhp: amount, billingStatus: row.billingStatus });
    return row;
  });
  return { subscribers, history };
}
// Aggregates the same per-row consistency classification the RPC publishes, so the dev preview
// shows identical review counts without any per-user entitlement call.
function consistencySummary(subscribers: SubscriberRow[], now: number): ConsistencySummary {
  const reasons = subscribers.map(row => consistencyReason(row, now));
  const activeNoRecord = reasons.filter(value => value === "active_no_record").length;
  const potentialAccessIssue = reasons.filter(value => value === "access_issue").length;
  const staleProLabel = reasons.filter(value => value === "stale_label").length;
  const missingExpiryPro = reasons.filter(value => value === "missing_expiry").length;
  const reviewNeeded = activeNoRecord + potentialAccessIssue + staleProLabel + missingExpiryPro;
  const activeConsistent = subscribers.filter((row, index) => reasons[index] === null && row.status === "active").length;
  return { activeConsistent, freeConsistent: subscribers.length - activeConsistent - reviewNeeded,
    staleProLabel, missingExpiryPro, potentialAccessIssue, activeNoRecord, reviewNeeded,
    confirmedMismatch: 0, verified: false };
}
export function readSynthetic(mode: ReportingMode, filters: ReportingFilters, now = Date.now(), limit = 25, records?: ReturnType<typeof syntheticRecords>): ReportingResult {
  const { subscribers, history } = records ?? syntheticRecords(now);
  const asOf = new Date(now).toISOString();
  const grantEvents = ["activated","extended","renewed","activate","extend","renew"];
  const grantRows = history.filter(row => grantEvents.includes(row.eventType));
  const recordedRows = grantRows.filter(row => recordedAmount(row) !== null);
  const recordedBilling = recordedRows.length ? recordedRows.reduce((total, row) => total + (recordedAmount(row) ?? 0), 0) : null;
  if (mode === "summary") return { asOf, summary: { revenue: null, paidOrders: null, asOf,
    totalSubscribers: subscribers.length,
    recordedBilling,
    recordedPurchases: recordedRows.length,
    renewalSales: recordedRows.filter(row => row.eventType === "renewed" || row.eventType === "renew").length,
    activePro: subscribers.filter(row => row.status === "active").length,
    expiringSoon: subscribers.filter(row => row.status === "active" && Date.parse(row.proExpiresAt!) <= now + filters.days * 86400000).length,
    expired: subscribers.filter(row => row.status === "expired").length,
    formerPro: subscribers.filter(row => row.status === "former").length,
    renewals: grantRows.filter(row => row.eventType === "renewed" || row.eventType === "renew").length,
    manualGrants: grantRows.filter(row => row.source === "gift" || row.source === "prize").length,
    consistency: consistencySummary(subscribers, now),
  } };
  const inRange = (value: string) => (!filters.from || Date.parse(value) >= Date.parse(`${filters.from}T00:00:00+08:00`)) &&
    (!filters.to || Date.parse(value) < Date.parse(`${filters.to}T00:00:00+08:00`) + 86400000);
  if (mode === "monthly") {
    const monthly = new Map<string, { month: string; recordedAmount: number | null; recordedEvents: number; unknownAmounts: number }>();
    const plans = new Map<number | null, { months: number | null; recordedAmount: number | null; recordedEvents: number }>();
    const sources = new Map<string, { source: string; recordedAmount: number | null; events: number }>();
    let renewals = 0, renewalSales = 0;
    for (const row of grantRows.filter(row => inRange(row.createdAt))) {
      const month = new Date(Date.parse(row.createdAt) + 8 * 3600000).toISOString().slice(0, 7);
      const entry = monthly.get(month) ?? { month, recordedAmount: null, recordedEvents: 0, unknownAmounts: 0 };
      const amount = recordedAmount(row);
      if (amount !== null) { entry.recordedAmount = (entry.recordedAmount ?? 0) + amount; entry.recordedEvents++; }
      else if (row.amountPhp === null) entry.unknownAmounts++;
      monthly.set(month, entry);
      if (amount !== null) {
        const plan = plans.get(row.planMonths) ?? { months: row.planMonths, recordedAmount: null, recordedEvents: 0 };
        plan.recordedAmount = (plan.recordedAmount ?? 0) + amount; plan.recordedEvents++; plans.set(row.planMonths, plan);
      }
      if (row.eventType === "renewed" || row.eventType === "renew") { renewals++; if (amount !== null) renewalSales++; }
      const key = row.source ?? "unknown";
      const bucket = sources.get(key) ?? { source: key, recordedAmount: null, events: 0 };
      bucket.events++; if (amount !== null) bucket.recordedAmount = (bucket.recordedAmount ?? 0) + amount; sources.set(key, bucket);
    }
    return { asOf, months: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)), plans: [...plans.values()],
      sources: [...sources.values()].sort((a, b) => b.events - a.events), renewals, renewalSales };
  }
  const offset = (filters.page - 1) * limit;
  if (mode === "detail" || mode === "transactions") {
    const rows = history.filter(row => (mode !== "detail" || row.userId === filters.userId) &&
      (filters.event === "all" || row.eventType === filters.event) && inRange(row.createdAt));
    return { asOf, history: rows.slice(offset, offset + limit), hasMore: rows.length > offset + limit };
  }
  const rows = subscribers.filter(row => (!filters.q || row.username?.includes(filters.q.toLowerCase())) &&
    (filters.status === "all" || filters.status === "expiring" && row.status === "active" && Date.parse(row.proExpiresAt!) <= now + filters.days * 86400000 || filters.status === "review" && row.consistency !== null || filters.status === "former" && row.plan === "free" || row.status === filters.status) &&
    (filters.months === "all" || filters.months === "unknown" && row.planMonths === null || String(row.planMonths) === filters.months) &&
    (filters.source === "all" || filters.source === "manual" && ["gift", "prize"].includes(row.source ?? "") || filters.source === "unknown" && !row.source || row.source === filters.source) &&
    (!filters.expiresFrom || Date.parse(row.proExpiresAt!) >= Date.parse(`${filters.expiresFrom}T00:00:00+08:00`)) &&
    (!filters.expiresTo || Date.parse(row.proExpiresAt!) < Date.parse(`${filters.expiresTo}T00:00:00+08:00`) + 86400000));
  return { asOf, subscribers: rows.slice(offset, offset + limit), hasMore: rows.length > offset + limit };
}
export function syntheticExport(kind: string, filters: ReportingFilters, records?: ReturnType<typeof syntheticRecords>) {
  if (kind === "monthly") {
    const result = readSynthetic("monthly", filters, Date.now(), 25, records);
    return { headers: ["Recorded month", "Admin-confirmed PHP", "Admin-confirmed events", "Unknown amount events"], rows: (result.months ?? []).map(row => [row.month, row.recordedAmount, row.recordedEvents, row.unknownAmounts]), truncated: false };
  }
  const result = readSynthetic(kind === "subscribers" ? "subscribers" : kind === "history" ? "detail" : "transactions", { ...filters, page: 1 }, Date.now(), EXPORT_LIMIT, records);
  if (kind === "subscribers") return { headers: ["Username", "Status", "Start", "Expiration", "Recorded months", "Recorded PHP", "Billing evidence", "Source"], rows: (result.subscribers ?? []).map(row => [row.username, row.status, row.proStartedAt, row.proExpiresAt, row.planMonths, row.amountPhp, row.billingStatus, row.source]), truncated: Boolean(result.hasMore) };
  return { headers: ["Event ID (not payment ID)", "Event", "Recorded date", "Recorded months", "Recorded PHP", "Billing evidence", "Source"], rows: (result.history ?? []).map(row => [row.id, row.eventType, row.createdAt, row.planMonths, row.amountPhp, row.billingStatus, row.source]), truncated: Boolean(result.hasMore) };
}
