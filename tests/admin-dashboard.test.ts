import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { billingEvidence, billingTone, confirmedIssueTone, CONSISTENCY_REASONS, consistencyReason, consistencyTone, csvCell, EMPTY_FILTERS, eventTone, expirationTone, EXPORT_LIMIT, manilaDate, manilaDayStart, money, recordedAmount, recordedAmountText, recordedDuration, recordedExpiry, recordedFactTone, recordedSource, SEARCH_DELAY, singleFlight, sourceTone, subscriberDuration, subscriberExpiration, subscriberStarted, subscriberStatusText, subscriberStatusTone, subscriptionStatus, SUMMARY_SECONDS, validateFilters } from "../app/lib/admin/adminReportingCore";
import { readSynthetic, syntheticExport, syntheticRecords } from "../app/admin/salesPreviewData";

const now = Date.parse("2026-11-19T12:00:00Z");
test("report filters are strict, bounded and calendar-valid", () => {
  assert.equal(validateFilters(new URLSearchParams()).days, 7);
  for (const query of ["page=NaN", "page=0", "page=401", "page=1.5", "q=a", "q=" + "a".repeat(81), "months=2", "days=31", "status=admin", "event=renewing", "userId=abc", "from=2026-02-30&to=2026-03-01", "from=2026-11-20&to=2026-11-01", "from=2020-01-01&to=2026-01-01", "from=2026-01-01"]) assert.throws(() => validateFilters(new URLSearchParams(query)), query);
  assert.equal(validateFilters(new URLSearchParams("event=renewed")).event, "renewed");
  assert.equal(validateFilters(new URLSearchParams()).event, "all");
});
test("Manila calendar boundaries include midnight at UTC+8", () => {
  assert.equal(manilaDayStart("2026-11-01"), "2026-10-31T16:00:00.000Z");
  assert.equal(manilaDayStart("2027-01-01"), "2026-12-31T16:00:00.000Z");
});
test("synthetic Pro and expiration use actual expiry, not a VIP override", () => {
  const summary = readSynthetic("summary", EMPTY_FILTERS, now).summary!;
  assert.equal(summary.totalSubscribers, 67);
  assert.equal(summary.activePro, 50);
  assert.equal(summary.expiringSoon, 17);
  assert.equal(summary.expired, 17);
  assert.equal(summary.revenue, null); assert.equal(summary.paidOrders, null);
  assert.ok(summary.renewals > 0); assert.ok(summary.manualGrants > 0);
});
test("access consistency distinguishes stale labels from real entitlement and never confirms blindly", () => {
  const future = new Date(now + 86400000).toISOString(), past = new Date(now - 86400000).toISOString();
  assert.equal(consistencyReason({ plan: "pro", proExpiresAt: future, recordedExpiresAt: future }, now), null);
  assert.equal(consistencyReason({ plan: "free", proExpiresAt: past, recordedExpiresAt: past }, now), null);
  assert.equal(consistencyReason({ plan: "pro", proExpiresAt: future, recordedExpiresAt: null }, now), "active_no_record");
  assert.equal(consistencyReason({ plan: "free", proExpiresAt: future, recordedExpiresAt: future }, now), "access_issue");
  assert.equal(consistencyReason({ plan: "pro", proExpiresAt: null, recordedExpiresAt: null }, now), "missing_expiry");
  assert.equal(consistencyReason({ plan: "pro", proExpiresAt: past, recordedExpiresAt: past }, now), "stale_label");
  assert.ok(CONSISTENCY_REASONS.active_no_record && CONSISTENCY_REASONS.stale_label);
});
test("summary consistency equals the directory review filter and claims no confirmed mismatch", () => {
  const summary = readSynthetic("summary", EMPTY_FILTERS, now).summary!;
  const review = readSynthetic("subscribers", { ...EMPTY_FILTERS, status: "review" }, now).subscribers!;
  const c = summary.consistency!;
  assert.equal(c.reviewNeeded, review.length);
  assert.ok(review.length >= 3 && review.every(row => row.consistency !== null));
  assert.equal(summary.activePro, c.activeConsistent + c.activeNoRecord);
  assert.equal(c.confirmedMismatch, 0); assert.equal(c.verified, false);
});
test("monthly recorded amount stays Unknown when no recorded paid event exists", () => {
  const records = { subscribers: [], history: [{ id: "h1", userId: "u1", eventType: "activated", source: null,
    createdAt: new Date(now).toISOString(), previousExpiresAt: null, newExpiresAt: null, planMonths: null, amountPhp: null, billingStatus: null }] };
  const monthly = readSynthetic("monthly", EMPTY_FILTERS, now, 25, records);
  assert.equal(monthly.months![0].recordedAmount, null);
  assert.equal(monthly.months![0].recordedEvents, 0);
  assert.equal(money(null), "Unknown"); assert.notEqual(money(49), "Unknown");
});
test("directory pages have 25 rows, stable IDs, no duplicates and look-ahead", () => {
  const first = readSynthetic("subscribers", EMPTY_FILTERS, now);
  const second = readSynthetic("subscribers", { ...EMPTY_FILTERS, page: 2 }, now);
  const last = readSynthetic("subscribers", { ...EMPTY_FILTERS, page: 3 }, now);
  assert.equal(first.subscribers!.length,25); assert.equal(second.subscribers!.length,25); assert.equal(last.subscribers!.length,17);
  assert.equal(first.hasMore,true); assert.equal(last.hasMore,false);
  assert.equal(new Set([...first.subscribers!,...second.subscribers!,...last.subscribers!].map(row=>row.id)).size,67);
});
test("search/status/duration/source/expiration filters select the intended records", () => {
  const rows = readSynthetic("subscribers", { ...EMPTY_FILTERS, q: "learner_02" }, now).subscribers!;
  assert.equal(rows.length,1); assert.equal(rows[0].amountPhp,49); assert.equal(rows[0].planMonths,null);
  const active = readSynthetic("subscribers", { ...EMPTY_FILTERS, status:"active", months:"3" }, now).subscribers!;
  assert.ok(active.length); assert.ok(active.every(row=>row.status==="active" && row.planMonths===3));
  const manual = readSynthetic("subscribers", { ...EMPTY_FILTERS, source:"manual" }, now).subscribers!;
  assert.ok(manual.every(row=>row.source==="gift"));
  assert.equal(readSynthetic("subscribers", { ...EMPTY_FILTERS, q:"not-a-user" }, now).subscribers!.length,0);
});
test("recorded historical 49 stays 49, manual/unknown billing cannot become paid revenue", () => {
  assert.equal(recordedAmount({ source:"purchased",billingStatus:"paid",amountPhp:49 }),49);
  assert.equal(recordedAmount({ source:"purchased",billingStatus:"admin_confirmed",amountPhp:49 }),49);
  assert.equal(recordedAmount({ source:"purchased",billingStatus:"admin_confirmed",amountPhp:0 }),0);
  assert.equal(recordedAmount({ source:"gift",billingStatus:"complimentary",amountPhp:0 }),null);
  assert.equal(recordedAmount({ source:"unknown",billingStatus:"unknown",amountPhp:null }),null);
  assert.equal(recordedAmount({ source:"purchased",billingStatus:"paid",amountPhp:-79 }),null);
  assert.equal(recordedAmount({ source:"purchased",billingStatus:"admin_confirmed",amountPhp:-1 }),null);
  assert.equal(recordedAmount({ source:"gift",billingStatus:"paid",amountPhp:79 }),null);
  assert.equal(syntheticRecords(now).subscribers[1].amountPhp,49);
});
test("revocations stay former Pro; expiration equality is not active access", () => {
  const past=new Date(now-1).toISOString(), future=new Date(now+86400000).toISOString();
  assert.equal(subscriptionStatus("free",past,true,now,"revoked"),"former");
  assert.equal(subscriptionStatus("free",past,true,now,"expired"),"expired");
  assert.equal(subscriptionStatus("pro",new Date(now).toISOString(),true,now),"expired");
  assert.equal(subscriptionStatus("free",future,true,now,"revoked"),"former");
  assert.equal(subscriptionStatus("free",null,false,now),"free");
});
test("history is scoped to one synthetic subscriber, preserving recorded events", () => {
  const { subscribers,history }=syntheticRecords(now);
  const result=readSynthetic("detail",{...EMPTY_FILTERS,userId:subscribers[0].id},now);
  assert.deepEqual(result.history,history.filter(row=>row.userId===subscribers[0].id));
});
test("monthly values are explicitly recorded billing, never verified orders", () => {
  const rows=syntheticRecords(now).history;
  const result=readSynthetic("monthly",EMPTY_FILTERS,now);
  assert.equal(result.months!.reduce((sum,row)=>sum+(row.recordedAmount??0),0),rows.reduce((sum,row)=>sum+(recordedAmount(row)??0),0));
  const filtered=readSynthetic("monthly",{...EMPTY_FILTERS,from:"2026-11-01",to:"2026-11-10"},now);
  assert.ok(filtered.months!.every(row=>row.month==="2026-11"));
});
test("CSV neutralizes formula injection, control prefixes and embedded quotes", () => {
  for (const value of ["=1+1","+cmd","-1+2","@SUM(A1)"," \t=1","\r\n@cmd"]) assert.ok(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('a,"b"'),'"a,""b"""'); assert.equal(csvCell(49),'"49"'); assert.equal(csvCell(null),'"Unknown"');
  assert.ok(syntheticExport("subscribers",EMPTY_FILTERS).rows.length<=EXPORT_LIMIT);
});
test("concurrent reports share pending work; failure can be retried deliberately", async () => {
  const run=singleFlight(); let calls=0;
  const load=async()=>{ calls++; await new Promise(resolve=>setTimeout(resolve,5)); return 7; };
  assert.deepEqual(await Promise.all([run("same",load),run("same",load)]),[7,7]); assert.equal(calls,1);
  await assert.rejects(run("bad",async()=>{throw new Error("offline");}));
  assert.equal(await run("bad",async()=>9),9);
});
test("reporting proposal includes total subscribers and remains read-only/service-role-only", () => {
  const proposal=readFileSync("docs/admin-dashboard/READ-ONLY-RPCS.PROPOSAL.sql","utf8");
  assert.match(proposal,/count\(\*\) as total/);
  assert.match(proposal,/'totalSubscribers',t\.total/);
  assert.match(proposal,/security invoker/i);
  assert.match(proposal,/v_event/);
  assert.match(proposal,/p_mode in \('detail','transactions'\)/);
  assert.match(proposal,/v_status not in \('all','active','expiring','expired','former','free','review'\)/);
  assert.match(proposal,/e\.review not in \('active_consistent','free_consistent'\)/);
  assert.match(proposal,/'consistency',jsonb_build_object/);
  assert.match(proposal,/'recordedExpiresAt',recorded_expires_at/);
  assert.match(proposal,/sum\(amount_php\) filter\(where billing_status='paid'/);
  assert.doesNotMatch(proposal,/coalesce\(sum\(amount_php\)/);
  assert.match(proposal,/'sources'/);
  assert.match(proposal,/'renewals'/);
  assert.match(proposal,/revoke all on function public\.admin_read_subscriptions\(text,jsonb,integer\) from public, anon, authenticated/);
  assert.match(proposal,/grant execute on function public\.admin_read_subscriptions\(text,jsonb,integer\) to service_role/);
  assert.doesNotMatch(proposal,/insert\s+into|update\s+public\.|delete\s+from|alter\s+table|drop\s+table/i);
  const indexes=readFileSync("docs/admin-dashboard/HISTORY-INDEXES.PROPOSAL.sql","utf8");
  assert.match(indexes,/subscription_history_user_created_idx/);
  assert.match(indexes,/subscription_history_created_idx/);
});
test("resource and preview boundaries remain explicit", () => {
  assert.equal(SEARCH_DELAY,450); assert.equal(SUMMARY_SECONDS,600); assert.equal(EXPORT_LIMIT,1000);
  const ui=readFileSync("app/admin/AdminDashboard.tsx","utf8");
  assert.doesNotMatch(ui,/setInterval|\.channel\(|\.from\(/);
  assert.match(ui,/freshOnce\.current = true/);
  assert.match(ui,/params\.set\("fresh", "1"\)/);
  const preview=readFileSync("app/offline/admin-preview/page.tsx","utf8");
  assert.match(preview,/NODE_ENV !== "development"/); assert.match(preview,/notFound\(\)/);
  for(const file of ["app/api/admin/sales/route.ts","app/api/admin/export/route.ts","app/api/admin/history/route.ts"]) {
    const route=readFileSync(file,"utf8"); assert.match(route,/verifyAdminSession\(\)/); assert.doesNotMatch(route,/readSynthetic|syntheticRecords|preview\s*===/);
  }
  const cache=readFileSync("app/lib/admin/adminReporting.ts","utf8");
  assert.match(cache,/revalidate: SUMMARY_SECONDS/);
  assert.match(cache,/fresh \? query\("summary", \{ \.\.\.EMPTY_FILTERS, days: filters\.days \}\) : summary\(filters\.days\)/);
});

// ---------------------------------------------------------------- Stage 4 UI/UX refinement

test("recorded history metadata is labelled instead of rendered as zero", () => {
  assert.equal(recordedDuration(null), "Not recorded");
  assert.equal(recordedDuration(undefined), "Not recorded");
  assert.equal(recordedDuration(1), "1 month");
  assert.equal(recordedDuration(3), "3 months");
  assert.equal(recordedAmountText(null), "Not recorded");
  assert.equal(recordedAmountText(49), money(49));
  assert.equal(recordedExpiry(null), "No expiry recorded");
  assert.notEqual(recordedExpiry("2099-01-01T00:00:00Z"), "No expiry recorded");
  // Shared summary formatters keep their meaning: revenue/orders stay Unknown, not Not recorded.
  assert.equal(money(null), "Unknown");
});

test("billing evidence wording never claims independent verification", () => {
  assert.equal(billingEvidence(null), "Not recorded");
  assert.equal(billingEvidence("complimentary"), "Complimentary");
  assert.equal(billingEvidence("unknown"), "Unverified");
  assert.equal(billingEvidence("admin_confirmed"), "Admin-confirmed");
  assert.equal(billingEvidence("paid"), "Provider-verified");
  assert.doesNotMatch(billingEvidence("admin_confirmed"), /verified revenue/i);
});

test("history subscriber column uses response identity with no per-row lookup", () => {
  const history = readFileSync("app/admin/sections/HistorySection.tsx", "utf8");
  assert.match(history, /<th scope="col">Subscriber<\/th>/);
  assert.match(history, /row\.username \|\| "Account unavailable"/);
  assert.match(history, /recordedDuration\(row\.planMonths\)/);
  assert.match(history, /recordedAmountText\(row\.amountPhp\)/);
  assert.match(history, /recordedExpiry\(row\.newExpiresAt\)/);
  assert.doesNotMatch(history, /\/api\/admin\/user|listUsers|getUserById/);
  // Existing filters, pagination and mobile data-labels preserved.
  assert.match(history, /Recorded from/);
  assert.match(history, /Event type/);
  assert.match(history, /Next events/);
  assert.match(history, /data-label="Subscriber"/);
});

test("history identity requires a separately approved proposal and stays uninstalled", () => {
  const proposal = readFileSync("docs/admin-dashboard/HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql", "utf8");
  assert.match(proposal, /PROPOSAL ONLY/i);
  assert.match(proposal, /create or replace function public\.admin_read_subscriptions/);
  assert.match(proposal, /'username', username/);
  assert.match(proposal, /left join public\.profiles p on p\.id=h\.user_id/);
  assert.match(proposal, /grant execute on function public\.admin_read_subscriptions\(text,jsonb,integer\) to service_role/);
  assert.doesNotMatch(proposal, /insert\s+into|delete\s+from|drop\s+table|alter\s+table/i);
  // The installed baseline must remain identity-free until the owner approves the proposal.
  const installed = readFileSync("docs/admin-dashboard/READ-ONLY-RPCS.PROPOSAL.sql", "utf8");
  assert.doesNotMatch(installed, /p\.id=h\.user_id/);
});

test("overview groups subscription, billing and activity without an isolated card", () => {
  const overview = readFileSync("app/admin/sections/OverviewSection.tsx", "utf8");
  for (const label of ["Subscription overview", "Sales &amp; billing summary", "Recent subscription activity",
    "Total registered users", "Active Pro", "Expiring soon", "Expired Pro", "Former Pro",
    "Admin-confirmed sales", "Verified revenue", "Total paid orders",
    "Recorded purchase events", "Renewal sales", "Complimentary grants", "Last successful refresh",
    "Confirmed access issues", "Not verified", "Review accounts"]) {
    assert.ok(overview.includes(label), label);
  }
  // Expired Pro and Former Pro are distinct metrics; no combined ambiguous card remains.
  assert.doesNotMatch(overview, /Expired \/ Former Pro/);
  assert.match(overview, /stats\.consistency\.activeNoRecord/);
  assert.match(overview, /metadata gap, not proof of unauthorized access/);
});

test("manual refresh and request budget stay untouched by the refinement", () => {
  const dashboard = readFileSync("app/admin/AdminDashboard.tsx", "utf8");
  assert.match(dashboard, /freshOnce\.current = true/);
  assert.match(dashboard, /params\.set\("fresh", "1"\)/);
  assert.match(dashboard, /load\("transactions", "transactions"/);
  assert.doesNotMatch(dashboard, /setInterval|\.channel\(|\.from\(|listUsers/);
});

// ---------------------------------------------------------------- Stage 4 subscriber presentation

test("subscriber start, duration, expiry and source labels distinguish never-Pro from missing", () => {
  const start = "2026-01-02T03:04:05Z";
  // Never-Pro (RPC status "free") -> Not applicable.
  assert.equal(subscriberStarted(null, "free"), "Not applicable");
  assert.equal(subscriberDuration(null, "free"), "Not applicable");
  assert.equal(subscriberExpiration(null, "free"), "Not applicable");
  assert.equal(recordedSource(null, "free"), "Not applicable");
  // Historical Pro with a stored value.
  assert.equal(subscriberStarted(start, "active"), manilaDate(start));
  assert.equal(subscriberStarted(start, "expired"), manilaDate(start));
  assert.equal(subscriberStarted(start, "former"), manilaDate(start));
  assert.equal(subscriberExpiration(start, "active"), manilaDate(start));
  // Historical Pro missing a value -> Not recorded (never invented).
  assert.equal(subscriberStarted(null, "active"), "Not recorded");
  assert.equal(subscriberDuration(null, "expired"), "Not recorded");
  assert.equal(subscriberExpiration(null, "former"), "Not recorded");
  assert.equal(recordedSource(null, "active"), "Not recorded");
  assert.equal(recordedSource("purchased", "active"), "purchased");
  // Recorded 1 / 3 / 6 month durations pass through exactly.
  assert.equal(subscriberDuration(1, "active"), "1 month");
  assert.equal(subscriberDuration(3, "active"), "3 months");
  assert.equal(subscriberDuration(6, "active"), "6 months");
  // No duration is derived from dates and no custom-date class is invented.
  for (const value of [subscriberDuration(null, "active"), subscriberDuration(null, "free")]) {
    assert.notEqual(value, "Custom date");
  }
  // History source (no status) uses Not recorded, not Unknown.
  assert.equal(recordedSource(null), "Not recorded");
});

test("subscriber directory shows Started date and labels without new requests", () => {
  const section = readFileSync("app/admin/sections/SubscribersSection.tsx", "utf8");
  assert.match(section, /<th scope="col">Started date<\/th>/);
  assert.match(section, /data-label="Started date"><span className=\{styles\.statusText\} data-tone=\{recordedFactTone\(row\.proStartedAt, row\.status\)\}>\{subscriberStarted\(row\.proStartedAt, row\.status\)\}<\/span>/);
  assert.match(section, /subscriberDuration\(row\.planMonths, row\.status\)/);
  assert.match(section, /recordedSource\(row\.source, row\.status\)/);
  assert.doesNotMatch(section, /\/api\/admin\/user|listUsers|getUserById|\.from\(/);
  // The bounded directory RPC already returns the stored start and plan months.
  const rpc = readFileSync("docs/admin-dashboard/READ-ONLY-RPCS.PROPOSAL.sql", "utf8");
  assert.match(rpc, /'proStartedAt',pro_started_at/);
  assert.match(rpc, /'planMonths',plan_months/);
});

test("billing summary and monthly table label missing recorded amounts as Not recorded", () => {
  const overview = readFileSync("app/admin/sections/OverviewSection.tsx", "utf8");
  assert.match(overview, /recordedAmountText\(stats\?\.recordedBilling\)/);
  assert.ok(overview.includes("Verified revenue"));
  assert.ok(overview.includes("Total paid orders"));
  const billing = readFileSync("app/admin/sections/SalesBillingSection.tsx", "utf8");
  assert.match(billing, /recordedAmountText\(row\.recordedAmount\)/);
  assert.doesNotMatch(billing, /money\(row\.recordedAmount\)/);
});

test("grant-duration recording gap documents the applied correction without touching the writer", () => {
  const gap = readFileSync("docs/admin-dashboard/PLAN-MONTHS-RECORDING-GAP.md", "utf8");
  assert.match(gap, /APPLIED \(application-side only\)/i);
  assert.match(gap, /p_plan_months integer DEFAULT NULL/);
  assert.match(gap, /p_payment_verified/);
  assert.match(gap, /adminService/);
  assert.match(gap, /bcf56ed8de8564405649685f592fc70f/);
  assert.match(gap, /p_payment_verified = false/);
  // No production SQL or writer replacement is claimed or implied.
  assert.doesNotMatch(gap, /apply.*install|already installed|create or replace function/i);
});

// ---------------------------------------------------------------- Stage 4 status tones

test("status text is explicit and colour is a supplement only", () => {
  assert.equal(subscriberStatusText("active"), "Active Pro");
  assert.equal(subscriberStatusText("expired"), "Expired");
  assert.equal(subscriberStatusText("former"), "Former Pro");
  assert.equal(subscriberStatusText("free"), "Free");
  assert.equal(subscriberStatusText(null), "Unknown");
  assert.equal(subscriberStatusTone("active"), "positive");
  assert.equal(subscriberStatusTone("expired"), "negative");
  assert.equal(subscriberStatusTone("former"), "neutral");
  assert.equal(subscriberStatusTone("free"), "neutral");
  assert.equal(subscriberStatusTone(null), "neutral");
  // Expired and reviewer-needed states never rely on colour alone: the words carry meaning.
  assert.equal(billingEvidence(null), "Not recorded");
  assert.equal(recordedDuration(null), "Not recorded");
  assert.equal(recordedSource(null, "free"), "Not applicable");
});

test("status tone mapping follows the approved minimal palette", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(expirationTone("2026-11-10T12:00:00Z", "active", now), "negative");
  assert.equal(expirationTone("2026-11-25T12:00:00Z", "active", now), "warning");
  assert.equal(expirationTone("2026-12-25T12:00:00Z", "active", now), "neutral");
  assert.equal(expirationTone(null, "active", now), "muted");
  assert.equal(expirationTone("2026-12-25T12:00:00Z", "free", now), "muted");
  assert.equal(expirationTone("not-a-date", "active", now), "muted");
  assert.equal(recordedFactTone(null), "muted");
  assert.equal(recordedFactTone(0), "neutral");
  assert.equal(recordedFactTone(null, "free"), "muted");
  assert.equal(consistencyTone(null), "positive");
  assert.equal(consistencyTone("access_issue"), "warning");
  assert.equal(confirmedIssueTone(false, 3), "neutral");
  assert.equal(confirmedIssueTone(true, 0), "neutral");
  assert.equal(confirmedIssueTone(true, 1), "negative");
  assert.equal(eventTone("renewed"), "subtlePositive");
  assert.equal(eventTone("revoked"), "negative");
  assert.equal(eventTone("expired"), "negative");
  assert.equal(eventTone("activated"), "neutral");
  assert.equal(eventTone("extended"), "neutral");
  assert.equal(sourceTone("gift"), "subtlePositive");
  assert.equal(sourceTone("prize"), "subtleBlue");
  assert.equal(sourceTone("purchased"), "neutral");
  assert.equal(billingTone(null), "muted");
  assert.equal(billingTone("paid"), "neutral");
  assert.equal(billingTone("unknown"), "neutral");
  assert.equal(billingTone("complimentary"), "subtlePositive");
});

test("status tones are rendered as text without pills, containers or decorations", () => {
  const css = readFileSync("app/admin/AdminDashboard.module.css", "utf8");
  const sections = [
    "app/admin/sections/SubscribersSection.tsx",
    "app/admin/sections/HistorySection.tsx",
    "app/admin/sections/OverviewSection.tsx",
    "app/admin/sections/SalesBillingSection.tsx",
  ].map(file => readFileSync(file, "utf8")).join("\n");
  // Colour lives on a text class selected by a tone attribute.
  for (const tone of ["positive", "warning", "negative", "neutral", "muted", "subtlePositive", "subtleBlue"]) {
    assert.match(css, new RegExp(`\\.statusText\\[data-tone="${tone}"\\]`));
  }
  assert.match(css, /\.statusText\[data-tone="positive"\] \{ color: var\(--green-dark\); \}/);
  assert.match(css, /\.statusText\[data-tone="warning"\] \{ color: var\(--warning-gold\); \}/);
  assert.match(css, /\.statusText\[data-tone="negative"\] \{ color: var\(--danger\); \}/);
  assert.match(css, /\.statusText\[data-tone="subtleBlue"\] \{ color: var\(--status-blue\); \}/);
  // Active Pro stays green; Expired stays red; warning moves from orange to muted gold.
  assert.doesNotMatch(css, /\.statusText\[data-tone="warning"\] \{ color: var\(--amber\); \}/);
  assert.match(css, /--warning-gold: #856318/);
  assert.match(css, /:global\(\[data-theme="dark"\]\) \.root \{ --status-blue: #a9cdec; --warning-gold: #d4b46b; \}/);
  // No pill, capsule, background fill, border, glow or dot is introduced by the tone rules.
  const toneBlock = css.slice(css.indexOf("/* Text-only status tones."));
  assert.doesNotMatch(toneBlock, /border-radius|background|border:|box-shadow|filter:|::before|::after|dot/i);
  for (const section of sections.split("\n").filter(line => line.includes("statusText"))) {
    assert.doesNotMatch(section, /background|border|border-radius|box-shadow/i, section);
  }
  // Every status-like label keeps its words next to the tone.
  assert.match(sections, /data-tone=\{subscriberStatusTone\(row\.status\)\}>\{subscriberStatusText\(row\.status\)\}/);
  assert.match(sections, /data-tone=\{consistencyTone\(row\.consistency\)\}>\{row\.consistency \? "Needs review" : "Consistent"\}/);
  assert.match(sections, /data-tone=\{eventTone\(row\.eventType\)\}>\{human\(row\.eventType\)\}/);
  assert.match(sections, /data-tone=\{billingTone\(row\.billingStatus\)\}>\{billingEvidence\(row\.billingStatus\)\}/);
});

test("warning gold keeps WCAG AA contrast in both themes", () => {
  const css = readFileSync("app/admin/AdminDashboard.module.css", "utf8");
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const ratio = (a: string, b: string) => {
    const x = luminance(a);
    const y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const light = "#856318";
  const dark = "#d4b46b";
  assert.match(css, new RegExp(`--warning-gold: ${light}`));
  assert.match(css, new RegExp(`--warning-gold: ${dark}`));
  // Normal-text AA is 4.5:1; both themes clear it on every dashboard surface they sit on.
  assert.ok(ratio(light, "#ffffff") >= 4.5, `light/paper ${ratio(light, "#ffffff")}`);
  assert.ok(ratio(light, "#f6f8f7") >= 4.5, `light/canvas ${ratio(light, "#f6f8f7")}`);
  assert.ok(ratio(light, "#f3f6f5") >= 4.5, `light/soft ${ratio(light, "#f3f6f5")}`);
  assert.ok(ratio(dark, "#111816") >= 4.5, `dark/paper ${ratio(dark, "#111816")}`);
  assert.ok(ratio(dark, "#090d0c") >= 4.5, `dark/canvas ${ratio(dark, "#090d0c")}`);
  assert.ok(ratio(dark, "#151e1c") >= 4.5, `dark/soft ${ratio(dark, "#151e1c")}`);
  // Warning is clearly separate from the red danger token in both themes.
  assert.notEqual(light, "#b14e3b");
  assert.notEqual(dark, "#f0a18f");
});

test("history identity proposal stays a minimal guarded diff with a matching rollback", () => {
  const proposal = readFileSync("docs/admin-dashboard/HISTORY-SUBSCRIBER-IDENTITY.PROPOSAL.sql", "utf8");
  const rollback = readFileSync("docs/admin-dashboard/HISTORY-SUBSCRIBER-IDENTITY.ROLLBACK.sql", "utf8");
  assert.match(proposal, /db9d92384058ecd509b46214b80f403f/);
  assert.match(proposal, /917e965ac4bd37436955a2b6fcc2895e/);
  assert.match(proposal, /left join public\.profiles p on p\.id=h\.user_id/);
  assert.match(proposal, /'username', username/);
  assert.match(rollback, /917e965ac4bd37436955a2b6fcc2895e/);
  assert.match(rollback, /md5\(prosrc\)/);
  assert.match(rollback, /raise exception 'Installed reporting function is not the approved identity build; stop'/);
  // The rollback reinstalls the installed baseline definition and restores the service_role ACL.
  assert.match(rollback, /revoke all on function public\.admin_read_subscriptions\(text,jsonb,integer\) from public, anon, authenticated/);
  assert.match(rollback, /grant execute on function public\.admin_read_subscriptions\(text,jsonb,integer\) to service_role/);
  for (const statement of [proposal, rollback]) {
    assert.doesNotMatch(statement, /insert\s+into|update\s+public\.|delete\s+from|drop\s+table|alter\s+table|create\s+table|create\s+index/i);
  }
});
