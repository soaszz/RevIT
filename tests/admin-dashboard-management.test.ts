import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { createSalesPreview } from "../app/admin/salesPreviewTransport";
import { EMPTY_FILTERS, recordedAmount } from "../app/lib/admin/adminReportingCore";
import { PRO_PLANS } from "../app/lib/proPlans";

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
test("ten original management functions stay preserved with only the authorized planMonths transition", () => {
  const expected=JSON.parse(readFileSync("docs/admin-dashboard/original-management-functions.json","utf8"));
  const evidence=JSON.parse(readFileSync("docs/admin-dashboard/authorized-transition-functions.json","utf8"));
  const ast=ts.createSourceFile("AdminPanel.tsx",readFileSync("app/admin/AdminPanel.tsx","utf8"),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const actual:Record<string,string>={};
  function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&node.name.text in expected)actual[node.name.text]=createHash("sha256").update(node.getText(ast).replace(/\r\n/g,"\n")).digest("hex");ts.forEachChild(node,visit);}
  visit(ast);assert.equal(Object.keys(actual).length,10);
  // Historical before-hashes are immutable; the authorized file records the one new hash.
  for(const [name,before] of Object.entries<string>(expected)){
    const transition=evidence.transitions[name];
    if(transition){
      assert.equal(transition.before,before,name+" keeps the historical before-hash");
      assert.notEqual(transition.after,before,name+" is a new authorized hash");
      assert.equal(actual[name],transition.after,name);
    } else {
      assert.equal(actual[name],before,name);
    }
  }
  assert.deepEqual(Object.keys(evidence.transitions),["handleConfirmSubscriptionChange"]);
});
test("preview refuses external/unknown requests and never delegates to a network fetch",async()=>{
  const store=createSalesPreview();
  assert.equal((await store.request("https://example.invalid/api/admin/user")).status,400);
  assert.equal((await store.request("/api/admin/unknown",post({userId:store.snapshot().subscribers[0].id}))).status,404);
  assert.equal((await store.request("/api/admin/user?userId=missing")).status,404);
});
test("original targeted lookup still supports synthetic email, username and exact user ID",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[2];
  for(const q of [row.username!,`${row.username}@example.invalid`,row.id]) {
    const response=await store.request(`/api/admin/search?q=${encodeURIComponent(q)}`);
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.users[0].id,row.id);
  }
});
test("overview billing sums only recorded purchased amounts, preserving historical 49",()=>{
  const store=createSalesPreview(),rows=store.snapshot().history;
  assert.equal(store.read("summary",EMPTY_FILTERS).summary!.recordedBilling,rows.reduce((n,row)=>n+(recordedAmount(row)??0),0));
  assert.ok(rows.some(row=>row.amountPhp===49));
  assert.equal(store.read("summary",EMPTY_FILTERS).summary!.revenue,null);
});
test("synthetic notes save/reload independently and disappear in a fresh preview",async()=>{
  const store=createSalesPreview(),id=store.snapshot().subscribers[1].id;
  const before=store.snapshot();
  assert.equal((await store.request("/api/admin/note",post({userId:id,note:"Synthetic support note"}))).status,200);
  assert.equal((await(await store.request(`/api/admin/user?userId=${id}`)).json()).user.proNote,"Synthetic support note");
  assert.deepEqual(store.snapshot(),before);
  assert.equal((await(await createSalesPreview().request(`/api/admin/user?userId=${id}`)).json()).user.proNote,"");
});
test("synthetic extension preserves start and historical billing; duplicate submit appends once",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[1],before=store.snapshot();
  const body={userId:row.id,action:"extend",source:"purchased",customExpiresAt:new Date(Date.parse(row.proExpiresAt!)+90*86400000).toISOString(),expectedExpiresAt:row.proExpiresAt,idempotencyKey:"extension-one"};
  assert.equal((await store.request("/api/admin/subscription",post(body))).status,200);
  assert.equal((await(await store.request("/api/admin/subscription",post(body))).json()).deduplicated,true);
  const after=store.snapshot();assert.equal(after.history.length,before.history.length+1);
  assert.equal(after.subscribers[1].proStartedAt,row.proStartedAt);assert.equal(after.subscribers[1].proExpiresAt,body.customExpiresAt);
  assert.deepEqual(after.history.find(event=>event.amountPhp===49),before.history.find(event=>event.amountPhp===49));
  assert.equal(after.history[0].eventType,"extended");assert.equal(after.history[0].amountPhp,null);assert.equal(after.history[0].planMonths,null);
});
test("synthetic stale writes, past dates and unacknowledged shortening are rejected",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[2];const before=store.snapshot();
  const base={userId:row.id,action:"modify_expiration",source:"purchased",customExpiresAt:new Date(Date.now()+86400000).toISOString(),expectedExpiresAt:row.proExpiresAt,idempotencyKey:"modify"};
  assert.equal((await store.request("/api/admin/subscription",post({...base,expectedExpiresAt:"2000-01-01T00:00:00Z"}))).status,409);
  assert.equal((await store.request("/api/admin/subscription",post({...base,customExpiresAt:"2000-01-01"}))).status,400);
  assert.equal((await store.request("/api/admin/subscription",post(base))).status,400);
  assert.deepEqual(store.snapshot(),before);
  assert.equal((await store.request("/api/admin/subscription",post({...base,allowShorten:true}))).status,200);
});
test("synthetic grant, revoke and natural expiry remain separate recorded events",async()=>{
  const store=createSalesPreview(),expired=store.snapshot().subscribers[0],start=expired.proStartedAt;
  assert.equal(expired.status,"expired");
  const grant={userId:expired.id,action:"activate",source:"gift",customExpiresAt:new Date(Date.now()+30*86400000).toISOString(),expectedExpiresAt:expired.proExpiresAt,idempotencyKey:"grant"};
  assert.equal((await store.request("/api/admin/subscription",post(grant))).status,200);
  assert.equal(store.snapshot().subscribers[0].status,"active");
  const grantsBeforeRevoke=store.read("summary",EMPTY_FILTERS).summary!.manualGrants;
  const current=store.snapshot().subscribers[0];
  assert.equal((await store.request("/api/admin/subscription",post({userId:current.id,action:"revoke",source:"gift",expectedExpiresAt:current.proExpiresAt,idempotencyKey:"revoke"}))).status,200);
  const after=store.snapshot();assert.equal(after.subscribers[0].status,"former");
  assert.equal(store.read("summary",EMPTY_FILTERS).summary!.manualGrants,grantsBeforeRevoke);
  assert.ok(after.history.some(event=>event.userId===current.id&&event.eventType==="expired"));
  assert.ok(after.history.some(event=>event.userId===current.id&&event.eventType==="revoked"));
  assert.equal(after.history.filter(event=>event.userId===current.id&&event.eventType==="revoked").length,1);
  assert.ok(start);assert.equal(after.subscribers[0].amountPhp,0);
});
test("advertised plans and release date evidence remain the existing authoritative configuration",()=>{
  assert.deepEqual(PRO_PLANS.map(row=>[row.months,row.price]),[[1,79],[3,219],[6,399]]);
  const updates=readFileSync("app/data/siteUpdates.ts","utf8");
  assert.match(updates,/version: "v1\.14\.0",\s+date: "November 20, 2026"/);
});
test("preset grants record the selected duration and the authoritative admin-confirmed price",async()=>{
  for(const months of [1,3,6]){
    const store=createSalesPreview(),row=store.snapshot().subscribers[0],before=store.snapshot();
    const expiresAt=new Date(Date.now()+30*86400000).toISOString();
    const grant={userId:row.id,action:"activate",source:"purchased",planMonths:months,customExpiresAt:expiresAt,expectedExpiresAt:row.proExpiresAt,idempotencyKey:`grant-${months}m`};
    const callsBefore=store.calls.length;
    assert.equal((await store.request("/api/admin/subscription",post(grant))).status,200);
    // One mutation request only; no extra reporting/Auth reads.
    assert.equal(store.calls.length,callsBefore+1);
    const after=store.snapshot(),event=after.history[0];
    assert.equal(event.planMonths,months);
    // Preset pricing is admin-confirmed, never claimed as provider verification.
    assert.equal(event.amountPhp,PRO_PLANS.find(plan=>plan.months===months)!.price);
    assert.equal(event.billingStatus,"admin_confirmed");
    assert.equal(after.subscribers[0].planMonths,months);
    assert.equal(after.subscribers[0].amountPhp,event.amountPhp);
    assert.equal(after.subscribers[0].proExpiresAt,expiresAt);
    // Every pre-existing history row, including the historical 49, is untouched.
    assert.equal(after.history.length,before.history.length+1);
    for(const previous of before.history) assert.deepEqual(after.history.find(entry=>entry.id===previous.id),previous);
  }
});
test("custom expiration, revoke and modify expiration never invent a recorded duration",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[0];
  const custom={userId:row.id,action:"activate",source:"gift",customExpiresAt:new Date(Date.now()+30*86400000).toISOString(),expectedExpiresAt:row.proExpiresAt,idempotencyKey:"custom-grant"};
  assert.equal((await store.request("/api/admin/subscription",post(custom))).status,200);
  assert.equal(store.snapshot().history[0].planMonths,null);
  // A complimentary source is recorded as complimentary, never as a paid claim.
  assert.equal(store.snapshot().history[0].billingStatus,"complimentary");
  assert.equal(store.snapshot().history[0].amountPhp,0);

  const active=store.snapshot().subscribers[0];
  const modify={userId:active.id,action:"modify_expiration",source:"purchased",customExpiresAt:new Date(Date.parse(active.proExpiresAt!)+86400000).toISOString(),expectedExpiresAt:active.proExpiresAt,idempotencyKey:"modify-duration"};
  assert.equal((await store.request("/api/admin/subscription",post(modify))).status,200);
  assert.equal(store.snapshot().history[0].eventType,"expiration_modified");
  assert.equal(store.snapshot().history[0].planMonths,null);

  assert.equal((await store.request("/api/admin/subscription",post({userId:active.id,action:"revoke",source:"purchased",expectedExpiresAt:store.snapshot().subscribers[0].proExpiresAt,idempotencyKey:"revoke-duration"}))).status,200);
  assert.equal(store.snapshot().history[0].eventType,"revoked");
  assert.equal(store.snapshot().history[0].planMonths,null);
});
test("extend records the selected preset and keeps the original start date",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[1];
  const expiresAt=new Date(Date.parse(row.proExpiresAt!)+180*86400000).toISOString();
  assert.equal((await store.request("/api/admin/subscription",post({userId:row.id,action:"extend",source:"prize",planMonths:6,customExpiresAt:expiresAt,expectedExpiresAt:row.proExpiresAt,idempotencyKey:"extend-6m"}))).status,200);
  const after=store.snapshot();
  assert.equal(after.history[0].eventType,"extended");
  assert.equal(after.history[0].planMonths,6);
  assert.equal(after.history[0].billingStatus,"complimentary");
  assert.equal(after.history[0].amountPhp,0);
  assert.equal(after.subscribers[1].planMonths,6);
  assert.equal(after.subscribers[1].proStartedAt,row.proStartedAt);
  assert.equal(after.subscribers[1].proExpiresAt,expiresAt);
});
test("unsupported planMonths are rejected before any mutation",async()=>{
  const store=createSalesPreview(),row=store.snapshot().subscribers[0],before=store.snapshot();
  const base={userId:row.id,source:"purchased",customExpiresAt:new Date(Date.now()+30*86400000).toISOString(),expectedExpiresAt:row.proExpiresAt};
  for(const planMonths of [2,0,-1,1.5,"3",true]){
    const response=await store.request("/api/admin/subscription",post({...base,action:"activate",planMonths,idempotencyKey:`invalid-${String(planMonths)}`}));
    assert.equal(response.status,400);
  }
  for(const action of ["modify_expiration","revoke"]){
    const response=await store.request("/api/admin/subscription",post({...base,action,planMonths:3,idempotencyKey:`invalid-${action}`}));
    assert.equal(response.status,400);
  }
  assert.deepEqual(store.snapshot(),before);
});
test("planMonths forwarding stays additive across client, route and service",()=>{
  const panel=readFileSync("app/admin/AdminPanel.tsx","utf8");
  // Only grant/extend forwards a preset; custom dates and revoke/modify send null.
  assert.match(panel,/planMonths:\s*\n\s*\(actionType === "activate" \|\| actionType === "extend"\) && durationPreset !== "custom"/);
  assert.match(panel,/Number\(durationPreset\.replace\("m", ""\)\)/);
  const route=readFileSync("app/api/admin/subscription/route.ts","utf8");
  assert.match(route,/planMonths/);
  assert.match(route,/!\[1, 3, 6\]\.includes\(planMonths\)/);
  assert.match(route,/Number\.isInteger\(planMonths\)/);
  assert.match(route,/typeof planMonths !== "number"/);
  assert.match(route,/planMonths: hasPlanMonths \? planMonths : null/);
  assert.match(route,/amountPhp: recordedAmount\.value/);
  const service=readFileSync("app/lib/admin/adminService.ts","utf8");
  assert.match(service,/planMonths\?: number \| null/);
  assert.match(service,/amountPhp\?: number \| null/);
  assert.match(service,/p_plan_months: params\.planMonths \?\? null/);
  // Payment verification is never inferred from a selected plan or source.
  assert.match(service,/p_payment_verified: false/);
  // The same eleven named arguments plus the additive admin-confirmed amount.
  for(const arg of ["p_user_id","p_action","p_source","p_duration_days","p_custom_expires_at","p_admin_id","p_custom_message","p_expected_expires_at","p_allow_shorten","p_plan_months","p_payment_verified","p_amount_php"]) assert.ok(service.includes(`${arg}:`),arg);
  assert.ok(panel.includes("durationDays: calc.days"));
  assert.ok(panel.includes("customExpiresAt: actionType === \"revoke\" ? null : calc.dateStr"));
  assert.ok(panel.includes("expectedExpiresAt: selectedUser.proExpiresAt"));
  assert.ok(panel.includes("allowShorten: Boolean(isShorteningAccess && shortenConfirmed)"));
  assert.ok(panel.includes("amountPhp: recordedAmount"));
});
