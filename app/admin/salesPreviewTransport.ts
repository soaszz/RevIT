import { readSynthetic, syntheticRecords } from "./salesPreviewData";
import { consistencyReason, subscriptionStatus, type ReportingFilters, type ReportingMode } from "../lib/admin/adminReportingCore";
import { resolveAdminRecordedAmount } from "../lib/admin/subscriptionBilling";

// Disposable fixtures only. This adapter never delegates to fetch or a database.
// Real actions are still implemented solely by the existing protected writer.
export function createSalesPreview() {
  const records = syntheticRecords();
  for (const row of records.subscribers.filter(row => row.plan === "free")) records.history.push({
    id: crypto.randomUUID(), userId: row.id, eventType: "expired", source: "unknown", createdAt: new Date().toISOString(),
    previousExpiresAt: row.proExpiresAt, newExpiresAt: row.proExpiresAt, planMonths: null, amountPhp: null, billingStatus: "unknown",
  });
  const notes = new Map<string, string>();
  const applied = new Map<string, unknown>();
  const calls: string[] = [];
  const snapshot = () => {
    const copy = structuredClone(records);
    // Stable sort preserves newest-inserted order for same-millisecond simulations.
    copy.history.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    for (const row of copy.subscribers) {
      const last = copy.history.find(event => event.userId === row.id);
      row.status = subscriptionStatus(row.plan, row.proExpiresAt, true, Date.now(), last?.eventType ?? (row.plan === "free" ? "expired" : "activated"));
      row.recordedExpiresAt = last?.newExpiresAt ?? null;
      row.consistency = consistencyReason(row, Date.now());
    }
    return copy;
  };
  const user = (id: string) => {
    const row = snapshot().subscribers.find(row => row.id === id);
    if (!row) return null;
    return { ...row, email: `${row.username}@example.invalid`, firstName: row.username,
      createdAt: row.proStartedAt, isEffectivePro: row.status === "active", proNote: notes.get(id) ?? "" };
  };
  const request: typeof globalThis.fetch = async (input, init) => {
    if (typeof input !== "string" || !input.startsWith("/api/admin/")) return Response.json({ error: "Simulation accepts only known local admin actions." }, { status: 400 });
    const url = new URL(input, "http://synthetic.invalid");
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (method === "GET" && url.pathname === "/api/admin/search") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      return Response.json({ users: snapshot().subscribers.filter(row => row.username?.includes(q) || row.id === q || `${row.username}@example.invalid`.includes(q)).slice(0,25).map(row => user(row.id)) });
    }
    if (method === "GET" && url.pathname === "/api/admin/user") {
      const id = url.searchParams.get("userId") ?? "", current = user(id);
      if (!current) return Response.json({ error: "Synthetic subscriber not found." }, { status: 404 });
      return Response.json({ user: current, history: snapshot().history.filter(row => row.userId === id).slice(0,25),
        summaryNote: current.isEffectivePro ? "Simulated active Pro access." : "Simulated former Pro account. No real account changed." });
    }
    if (method !== "POST") return Response.json({ error: "Unsupported simulated operation." }, { status: 405 });
    let body;
    try { body = JSON.parse(String(init?.body)); } catch { return Response.json({ error: "Invalid simulation payload." }, { status: 400 }); }
    const index = records.subscribers.findIndex(row => row.id === body.userId);
    if (index < 0) return Response.json({ error: "Synthetic subscriber not found." }, { status: 404 });
    const row = records.subscribers[index];
    if (url.pathname === "/api/admin/note") {
      if (typeof body.note !== "string") return Response.json({ error: "Invalid note." }, { status: 400 });
      notes.set(row.id, body.note.slice(0,2000).trim());
      return Response.json({ success: true, simulated: true });
    }
    if (url.pathname !== "/api/admin/subscription") return Response.json({ error: "Unsupported simulation path." }, { status: 404 });
    if (!["activate","extend","modify_expiration","revoke"].includes(body.action) || !["purchased","gift","prize"].includes(body.source)) return Response.json({ error: "Invalid simulated subscription action." }, { status: 400 });
    // Mirror the writer: only grant/extend may carry a 1/3/6 preset; anything else stays null.
    const hasPlanMonths = body.planMonths !== undefined && body.planMonths !== null;
    if (hasPlanMonths && (typeof body.planMonths !== "number" || !Number.isInteger(body.planMonths) || ![1,3,6].includes(body.planMonths) || !["activate","extend"].includes(body.action))) {
      return Response.json({ error: "Invalid plan duration." }, { status: 400 });
    }
    const planMonths = hasPlanMonths ? body.planMonths : null;
    const grant = body.action === "activate" || body.action === "extend";
    const amountCheck = resolveAdminRecordedAmount({
      action: body.action,
      source: body.source,
      planMonths,
      amountPhp: body.amountPhp,
    });
    if (!amountCheck.ok) return Response.json({ error: amountCheck.error }, { status: 400 });
    const recordedAmount = !grant ? null : body.source === "purchased" ? amountCheck.value : 0;
    // Presets always auto-price. A purchased grant with an amount is admin-confirmed; a blank
    // custom amount stays unknown, and an explicit zero is a recorded zero.
    const billingStatus = !grant ? "unknown" : body.source === "purchased" ? (recordedAmount == null ? "unknown" : "admin_confirmed") : "complimentary";
    const key = `${row.id}:${body.action}:${body.idempotencyKey}`;
    if (applied.has(key)) return Response.json({ success: true, result: applied.get(key), deduplicated: true, simulated: true });
    if (body.expectedExpiresAt && body.expectedExpiresAt !== row.proExpiresAt) return Response.json({ code: "CONFLICT_STALE_STATE", error: "Synthetic subscription changed; refresh before confirming." }, { status: 409 });
    const active = row.plan === "pro" && row.proExpiresAt && Date.parse(row.proExpiresAt) > Date.now();
    if (body.action === "activate" && active) return Response.json({ code: "CONFLICT_ACTIVE_PRO", error: "Synthetic account already has active Pro; extend instead." }, { status: 409 });
    const expires = body.action === "revoke" ? new Date().toISOString() : body.customExpiresAt;
    if (!expires || !Number.isFinite(Date.parse(expires)) || body.action !== "revoke" && Date.parse(expires) <= Date.now()) return Response.json({ error: "Choose a future date." }, { status: 400 });
    if (body.action !== "revoke" && active && Date.parse(expires) < Date.parse(row.proExpiresAt!) - 60000 && !body.allowShorten) return Response.json({ code: "WARNING_SHORTEN_ACCESS", error: "Confirm shortened access." }, { status: 400 });
    if (body.action === "revoke" && row.plan === "free") return Response.json({ code: "NO_CHANGE", error: "Synthetic account is already Free." }, { status: 400 });
    const eventType = body.action === "revoke" ? "revoked" : body.action === "extend" ? "extended" : body.action === "modify_expiration" ? "expiration_modified" : row.proExpiresAt ? "renewed" : "activated";
    const next = { ...row, plan: body.action === "revoke" ? "free" : "pro", proExpiresAt: expires,
      proStartedAt: body.action === "activate" ? new Date().toISOString() : row.proStartedAt,
      // Administrator-recorded amount only for grant actions. Gift/prize are complimentary.
      ...(grant ? { amountPhp: recordedAmount, billingStatus, planMonths, source: body.source } : {}),
    };
    records.subscribers[index] = next;
    records.history.unshift({ id: crypto.randomUUID(), userId: row.id, eventType, source: body.source,
      createdAt: new Date().toISOString(), previousExpiresAt: row.proExpiresAt, newExpiresAt: expires,
      amountPhp: recordedAmount, billingStatus, planMonths });
    const result = { success: true }; applied.set(key, result);
    return Response.json({ success: true, result, simulated: true });
  };
  return { request, snapshot, calls,
    read: (mode: ReportingMode, filters: ReportingFilters) => { calls.push(`REPORT ${mode}`); return readSynthetic(mode, filters, Date.now(),25,snapshot()); },
  };
}
