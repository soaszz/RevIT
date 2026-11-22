import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_RECORDED_AMOUNT_PHP,
  parseAmountInput,
  presetAmountForMonths,
  resolveAdminRecordedAmount,
  validateRecordedAmount,
} from "../app/lib/admin/subscriptionBilling";
import { EMPTY_FILTERS, recordedAmount } from "../app/lib/admin/adminReportingCore";
import { createSalesPreview } from "../app/admin/salesPreviewTransport";
import { readSynthetic } from "../app/admin/salesPreviewData";
import { PRO_PLANS } from "../app/lib/proPlans";

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const future = () => new Date(Date.now() + 30 * 86400000).toISOString();

test("preset pricing comes from the authoritative plan configuration", () => {
  for (const plan of PRO_PLANS) {
    assert.equal(presetAmountForMonths(plan.months), plan.price);
    assert.equal(presetAmountForMonths(plan.months), resolveAdminRecordedAmount({ action: "activate", source: "purchased", planMonths: plan.months }).ok ? PRO_PLANS.find(row => row.months === plan.months)!.price : null);
  }
  assert.equal(presetAmountForMonths(null), null);
  assert.equal(presetAmountForMonths(2), null);
});

test("custom amounts accept two decimals, explicit zero and a blank not-recorded value", () => {
  assert.deepEqual(parseAmountInput("150.50"), { ok: true, value: 150.5 });
  assert.deepEqual(parseAmountInput("0"), { ok: true, value: 0 });
  assert.deepEqual(parseAmountInput("0.00"), { ok: true, value: 0 });
  assert.deepEqual(parseAmountInput("   "), { ok: true, value: null });
  assert.deepEqual(resolveAdminRecordedAmount({ action: "activate", source: "purchased", planMonths: null, amountPhp: 0 }), { ok: true, value: 0 });
  assert.deepEqual(resolveAdminRecordedAmount({ action: "activate", source: "purchased", planMonths: null }), { ok: true, value: null });
});

test("negative, malformed, non-finite, over-precise and oversized amounts are rejected", () => {
  for (const value of ["-1", "1.234", "1e3", "NaN", "Infinity", "12,50", "abc"]) {
    assert.equal(parseAmountInput(value).ok, false, value);
  }
  for (const value of [-1, NaN, Infinity, -Infinity, 1.234, MAX_RECORDED_AMOUNT_PHP + 1]) {
    assert.equal(validateRecordedAmount(value).ok, false, String(value));
  }
  assert.equal(validateRecordedAmount(MAX_RECORDED_AMOUNT_PHP).ok, true);
});

test("complimentary and non-grant actions never carry a recorded sale", () => {
  for (const source of ["gift", "prize"]) {
    assert.deepEqual(resolveAdminRecordedAmount({ action: "activate", source, planMonths: 3, amountPhp: 399 }), { ok: true, value: null });
    assert.deepEqual(resolveAdminRecordedAmount({ action: "extend", source, planMonths: null, amountPhp: 399 }), { ok: true, value: null });
  }
  for (const action of ["modify_expiration", "revoke"]) {
    assert.deepEqual(resolveAdminRecordedAmount({ action, source: "purchased", planMonths: null, amountPhp: 399 }), { ok: true, value: null });
  }
});

async function grant(store: ReturnType<typeof createSalesPreview>, body: Record<string, unknown>) {
  const row = store.snapshot().subscribers[0];
  return store.request("/api/admin/subscription", post({
    userId: row.id, action: "activate", source: "purchased", customExpiresAt: future(),
    expectedExpiresAt: row.proExpiresAt, idempotencyKey: crypto.randomUUID(), ...body,
  }));
}

test("synthetic preset grant records the authoritative admin-confirmed amount", async () => {
  for (const plan of PRO_PLANS) {
    const store = createSalesPreview();
    assert.equal((await grant(store, { planMonths: plan.months })).status, 200);
    const event = store.snapshot().history[0];
    assert.equal(event.amountPhp, plan.price);
    assert.equal(event.billingStatus, "admin_confirmed");
    assert.equal(event.planMonths, plan.months);
    assert.equal(recordedAmount(event), plan.price);
  }
});

test("synthetic custom purchased grant records the optional amount exactly", async () => {
  const store = createSalesPreview();
  assert.equal((await grant(store, { amountPhp: 150.5 })).status, 200);
  assert.equal(store.snapshot().history[0].amountPhp, 150.5);
  assert.equal(store.snapshot().history[0].billingStatus, "admin_confirmed");
  assert.equal(store.snapshot().history[0].planMonths, null);
});

test("synthetic blank custom amount stays unknown while explicit zero is recorded", async () => {
  const blank = createSalesPreview();
  assert.equal((await grant(blank, {})).status, 200);
  assert.equal(blank.snapshot().history[0].amountPhp, null);
  assert.equal(blank.snapshot().history[0].billingStatus, "unknown");

  const zero = createSalesPreview();
  assert.equal((await grant(zero, { amountPhp: 0 })).status, 200);
  assert.equal(zero.snapshot().history[0].amountPhp, 0);
  assert.equal(zero.snapshot().history[0].billingStatus, "admin_confirmed");
  assert.equal(recordedAmount(zero.snapshot().history[0]), 0);
  assert.equal(zero.read("summary", EMPTY_FILTERS).summary!.recordedPurchases, zero.snapshot().history.filter(row => recordedAmount(row) !== null).length);
});

test("synthetic Gift and Prize grants stay complimentary with a zero amount", async () => {
  for (const source of ["gift", "prize"]) {
    const store = createSalesPreview();
    assert.equal((await grant(store, { source, amountPhp: 399 })).status, 200);
    const event = store.snapshot().history[0];
    assert.equal(event.amountPhp, 0);
    assert.equal(event.billingStatus, "complimentary");
    assert.equal(recordedAmount(event), null);
  }
});

test("Modify Expiration and Revoke never create a recorded sale", async () => {
  const store = createSalesPreview();
  const active = store.snapshot().subscribers[0];
  assert.equal((await store.request("/api/admin/subscription", post({
    userId: active.id, action: "modify_expiration", source: "purchased", amountPhp: 399,
    customExpiresAt: future(), expectedExpiresAt: active.proExpiresAt, idempotencyKey: "modify-billing",
  }))).status, 200);
  const modified = store.snapshot().history[0];
  assert.equal(modified.eventType, "expiration_modified");
  assert.equal(modified.amountPhp, null);
  assert.equal(modified.billingStatus, "unknown");

  const current = store.snapshot().subscribers[0];
  assert.equal((await store.request("/api/admin/subscription", post({
    userId: current.id, action: "revoke", source: "purchased", amountPhp: 399,
    expectedExpiresAt: current.proExpiresAt, idempotencyKey: "revoke-billing",
  }))).status, 200);
  const revoked = store.snapshot().history[0];
  assert.equal(revoked.eventType, "revoked");
  assert.equal(revoked.amountPhp, null);
  assert.equal(revoked.billingStatus, "unknown");
});

test("rejected synthetic amounts mutate nothing", async () => {
  const store = createSalesPreview();
  const before = store.snapshot();
  for (const amountPhp of [-1, 1.234, "150", 1e9]) {
    assert.equal((await grant(store, { amountPhp })).status, 400, String(amountPhp));
  }
  assert.deepEqual(store.snapshot(), before);
});

test("reporting counts admin-confirmed purchases once and keeps unknown history separate", () => {
  const store = createSalesPreview();
  const rows = store.snapshot().history;
  const recorded = rows.filter(row => recordedAmount(row) !== null);
  const unknown = rows.filter(row => ["activated", "extended", "renewed", "activate", "extend", "renew"].includes(row.eventType) && row.amountPhp === null);
  const summary = store.read("summary", EMPTY_FILTERS).summary!;
  const monthly = store.read("monthly", EMPTY_FILTERS);
  assert.equal(summary.recordedPurchases, recorded.length);
  assert.equal(summary.recordedBilling, recorded.reduce((sum, row) => sum + (recordedAmount(row) ?? 0), 0));
  assert.equal(monthly.months!.reduce((sum, row) => sum + row.recordedEvents, 0), recorded.length);
  assert.equal(monthly.months!.reduce((sum, row) => sum + row.unknownAmounts, 0) >= unknown.length, true);
  assert.equal(monthly.renewalSales, recorded.filter(row => row.eventType === "renewed" || row.eventType === "renew").length);
  // Explicit zero is a recorded purchase but contributes exactly zero to the total.
  assert.ok(recorded.some(row => row.amountPhp === 0));
  const zeroOnly = {
    subscribers: [],
    history: [{ id: "h0", userId: "u0", eventType: "activated", source: "purchased", createdAt: new Date().toISOString(),
      previousExpiresAt: null, newExpiresAt: null, planMonths: null, amountPhp: 0, billingStatus: "admin_confirmed" }],
  };
  const zeroMonthly = readSynthetic("monthly", EMPTY_FILTERS, Date.now(), 25, zeroOnly as never);
  assert.equal(zeroMonthly.months![0].recordedAmount, 0);
  assert.equal(zeroMonthly.months![0].recordedEvents, 1);
});

test("purchased extend records the preset as admin-confirmed and keeps the start date", async () => {
  const store = createSalesPreview();
  const row = store.snapshot().subscribers[1];
  const recordedBefore = store.read("summary", EMPTY_FILTERS).summary!.recordedPurchases!;
  const expiresAt = new Date(Date.parse(row.proExpiresAt!) + 180 * 86400000).toISOString();
  const response = await store.request("/api/admin/subscription", post({
    userId: row.id, action: "extend", source: "purchased", planMonths: 6,
    customExpiresAt: expiresAt, expectedExpiresAt: row.proExpiresAt, idempotencyKey: "extend-purchased-6m",
  }));
  assert.equal(response.status, 200);
  const after = store.snapshot();
  assert.equal(after.history[0].eventType, "extended");
  assert.equal(after.history[0].planMonths, 6);
  assert.equal(after.history[0].amountPhp, 399);
  assert.equal(after.history[0].billingStatus, "admin_confirmed");
  assert.equal(after.subscribers[1].proStartedAt, row.proStartedAt);
  assert.equal(after.subscribers[1].proExpiresAt, expiresAt);
  // One recorded sale only; no duplicate or recalculated event.
  assert.equal(store.read("summary", EMPTY_FILTERS).summary!.recordedPurchases, recordedBefore + 1);
});

test("changing source, action or preset clears the custom amount input", () => {
  const panel = readFileSync("app/admin/AdminPanel.tsx", "utf8");
  assert.ok(panel.includes('if (next !== "purchased") setCustomAmount("");'));
  assert.ok(panel.includes('if (d.id !== "custom") setCustomAmount("");'));
  assert.ok(panel.includes('if (next === "revoke" || next === "modify_expiration") setCustomAmount("");'));
});

test("proposal and rollback keep one writer signature, exact baselines and guarded rollback", () => {
  const proposal = readFileSync("docs/admin-dashboard/BILLING-RECORDING.PROPOSAL.sql", "utf8");
  const rollback = readFileSync("docs/admin-dashboard/BILLING-RECORDING.ROLLBACK.sql", "utf8");
  assert.match(proposal, /drop function public\.admin_apply_subscription_change\(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean\);/);
  assert.match(proposal, /p_amount_php numeric default null/);
  assert.match(proposal, /billing_status in \('paid','complimentary','unknown','admin_confirmed'\)/);
  assert.match(proposal, /alter column amount_php type numeric\(12,2\)/);
  assert.match(proposal, /bcf56ed8de8564405649685f592fc70f/);
  assert.match(proposal, /db9d92384058ecd509b46214b80f403f/);
  assert.match(proposal, /grant execute on function public\.admin_apply_subscription_change\(uuid,text,text,integer,timestamptz,uuid,text,timestamptz,boolean,integer,boolean,numeric\) to service_role/);
  assert.match(rollback, /billing_status='admin_confirmed'/);
  assert.match(rollback, /raise exception 'Admin-confirmed history exists/);
  assert.match(rollback, /raise exception 'Fractional recorded amounts exist/);
  assert.doesNotMatch(rollback, /delete from public\.subscription_history/i);
  assert.match(rollback, /alter column amount_php type integer/);
  assert.match(rollback, /create function public\.admin_apply_subscription_change\(/);
  assert.doesNotMatch(rollback, /p_amount_php numeric default null/);
});
