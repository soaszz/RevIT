import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { PRO_PLANS, PRO_PLAN_SUMMARY, PRO_CONTACT_URL } from "../app/lib/proPlans";
const source = readFileSync("app/admin/AdminPanel.tsx", "utf8");
const ast = ts.createSourceFile("admin.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name: string, context: Record<string, unknown>) {
  let found: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit); }
  visit(ast); assert.ok(found, name);
  const code = ts.transpileModule(`const result=(${found.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(context), `${code};return result;`)(...Object.values(context));
}
test("prepaid prices, monthly equivalents, savings and every existing price surface agree", () => {
  assert.deepEqual(PRO_PLANS.map(p => [p.months, p.price, p.price / p.months, 79 * p.months - p.price]), [[1,79,79,0],[3,219,73,18],[6,399,66.5,75]]);
  assert.equal(PRO_CONTACT_URL, "https://www.instagram.com/revithoroughly/");
  assert.equal(PRO_PLAN_SUMMARY, "₱79 / 1 month · ₱219 / 3 months · ₱399 / 6 months");
  for (const file of ["app/pricing/PricingContent.tsx", "app/pro/page.tsx", "app/auth/page.tsx", "app/components/PlanAnnouncementModal.tsx", "app/components/Onboarding.tsx"]) {
    const text = readFileSync(file,"utf8"); assert.match(text, /PRO_PLAN(?:S|_SUMMARY)|ProPlanCards/); assert.doesNotMatch(text,/₱49|early bird|Facebook/i);
  }
  assert.match(source,/"1m" \| "3m" \| "6m" \| "custom"/); assert.doesNotMatch(source,/"2m"/);
});
test("actual admin renewal preserves remaining days and calendar months, with month-end clipping", () => {
  const now = new Date(2026,0,15,12).getTime();
  class FixedDate extends Date { constructor(value?: number | string | Date) { super(value === undefined ? now : new Date(value).getTime()); } static now() { return now; } }
  const addMonths=actual("addMonths",{Date:FixedDate});
  for (const [preset, month, day] of [["1m",1,28],["3m",3,30],["6m",6,31]] as const) {
    const selectedUser = {isEffectivePro:true,proExpiresAt:new Date(2026,0,31,12).toISOString()};
    const result = actual("calculateExtension",{Date:FixedDate,selectedUser,durationPreset:preset,customDate:"",customDays:30,addMonths})();
    assert.equal(result.date.getMonth(),month); assert.equal(result.date.getDate(),day);
    assert.ok(result.date.getTime()>new Date(selectedUser.proExpiresAt).getTime());
  }
  for (const selectedUser of [null,{isEffectivePro:false,proExpiresAt:new Date(2025,11,1).toISOString()},{isEffectivePro:true,proExpiresAt:new Date(2025,11,1).toISOString()}]) {
    const result=actual("calculateExtension",{Date:FixedDate,selectedUser,durationPreset:"3m",customDate:"",customDays:30,addMonths})();
    assert.equal(result.date.getMonth(),3); assert.equal(result.date.getDate(),15);
  }
  const custom=actual("calculateExtension",{Date:FixedDate,selectedUser:{isEffectivePro:true,proExpiresAt:new Date(2026,0,31,12).toISOString()},durationPreset:"custom",customDate:"",customDays:7,addMonths})();
  assert.equal(custom.date.getMonth(),1);assert.equal(custom.date.getDate(),7);
  const exact=actual("calculateExtension",{Date:FixedDate,selectedUser:null,durationPreset:"custom",customDate:"2026-04-20",customDays:7,addMonths})();
  assert.equal(exact.date.getDate(),20);assert.equal(exact.date.getHours(),23);
});
test("actual admin confirmation synchronously prevents double submissions and uses confirmed expiration", async () => {
  let calls=0;let payload: Record<string,unknown>={};let resolve!: (value: unknown)=>void;
  const pending=new Promise(r=>{resolve=r});const expected={date:new Date("2027-04-30T12:00:00Z"),dateStr:"2027-04-30T12:00:00Z",days:180};
  const submissionRef={current:false};const requestKeyRef={current:"same-confirmation"};
  const context:Record<string,unknown>={selectedUser:{id:"11111111-1111-4111-8111-111111111111",isEffectivePro:true,proExpiresAt:"2026-10-30T12:00:00Z"},submissionRef,requestKeyRef,confirmationRef:{current:expected},getCalculatedExpiration:()=>{throw Error("Must use confirmed preview")},actionType:"extend",activationSource:"purchased",customRecipientMessage:"",shortenConfirmed:false,fetch:async (_url: string,init:RequestInit)=>{calls++;payload=JSON.parse(init.body as string);await pending;return Response.json({success:true})},handleSelectUser:async()=>{},setActionPending:()=>{},setActionMessage:()=>{},setConfirmModalOpen:()=>{},setActiveProWarningModalOpen:()=>{}};
  const apply=actual("handleConfirmSubscriptionChange",context);const first=apply();const second=apply();assert.equal(calls,1);assert.equal(payload.customExpiresAt,expected.dateStr);assert.equal(payload.idempotencyKey,"same-confirmation");resolve(null);await Promise.all([first,second]);assert.equal(submissionRef.current,false);
});
function routeRuntime(auth: {authenticated:boolean;authorized:boolean;user?:{id:string}}, change:(params:unknown)=>Promise<unknown>) {
  const code=ts.transpileModule(readFileSync("app/api/admin/subscription/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:{POST?:(request:Request)=>Promise<Response>}={};
  new Function("require","exports",code)((name:string)=>{if(name==="server-only")return {};if(name==="next/server")return {NextResponse:Response};if(name.endsWith("adminAuth"))return {verifyAdminSession:async()=>auth};if(name.endsWith("adminService"))return {applySubscriptionChange:change};throw Error(name)},exports);return exports.POST!;
}
const body={userId:"11111111-1111-4111-8111-111111111111",action:"extend",durationDays:90,customExpiresAt:"2099-04-30T12:00:00Z",expectedExpiresAt:"2099-01-31T12:00:00Z",idempotencyKey:"same-operation"};
const request=(value=body)=>new Request("http://local/api/admin/subscription",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value)});
test("subscription endpoint retains server authorization and coalesces concurrent/retried requests",async()=>{
  let calls=0;for(const auth of [{authenticated:false,authorized:false},{authenticated:true,authorized:false}]){const post=routeRuntime(auth,async()=>{calls++;return {}});assert.equal((await post(request())).status,auth.authenticated?403:401)}assert.equal(calls,0);
  let release!:(value:unknown)=>void;const pending=new Promise(r=>{release=r});const post=routeRuntime({authenticated:true,authorized:true,user:{id:"admin-one"}},async()=>{calls++;return pending});
  const first=post(request());const second=post(request());await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);release({ok:true});assert.equal((await first).status,200);assert.equal((await (await second).json()).deduplicated,true);assert.equal((await (await post(request())).json()).deduplicated,true);assert.equal(calls,1);
});
test("idempotency keys stay scoped to admin, target and action, and failures can retry",async()=>{
  let calls=0;const auth={authenticated:true,authorized:true,user:{id:"admin-one"}};const post=routeRuntime(auth,async()=>{calls++;if(calls===1)throw Error("temporary");return {ok:true}});
  assert.equal((await post(request())).status,500);assert.equal((await post(request())).status,200);assert.equal(calls,2);
  auth.user.id="admin-two";assert.equal((await post(request())).status,200);assert.equal(calls,3);
  assert.equal((await post(request({...body,userId:"22222222-2222-4222-8222-222222222222"}))).status,200);assert.equal(calls,4);
});

test("refreshing learner details preserves success feedback when explicitly requested", async () => {
  let clears=0;
  const context:Record<string,unknown>={setUserLoading:()=>{},setSelectedUser:()=>{},setActionMessage:()=>{clears++},setNoteStatus:()=>{},setNoteContent:()=>{},setActionType:()=>{},setUserHistory:()=>{},setSummaryNote:()=>{},fetch:async()=>Response.json({user:{id:'synthetic',isEffectivePro:true,proNote:null},history:[]})};
  await actual("handleSelectUser",context)({id:'synthetic',isEffectivePro:true},true);assert.equal(clears,0);
  await actual("handleSelectUser",context)({id:'synthetic',isEffectivePro:true});assert.equal(clears,1);
});

function renderAdmin(action: string, preset = "6m", customDate = "", conflict = false) {
  const user = {id:"synthetic",email:"learner@local.invalid",username:"Learner",plan:"pro",isEffectivePro:true,proExpiresAt:"2099-11-06T12:00:00Z",proNote:null};
  const states = ["",false,"",[],false,user,false,[],"",action,preset,30,customDate,"purchased","",false,!conflict,conflict,false,false,null,null,"",false,null];
  let index = 0;
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports: {default?: React.ComponentType<{adminUserId:string;adminEmail:string}>} = {};
  new Function("require","exports",code)((name:string)=>{
    if(name === "react") return {...React,useState:()=>[states[index++],()=>{}],useRef:()=>({current:null})};
    if(name === "react/jsx-runtime") return jsxRuntime;
    if(name === "../lib/proPlans") return {PRO_PLANS};
    if(name.endsWith(".module.css")) return {default:new Proxy({},{get:(_target,key)=>String(key)})};
    if(name.startsWith("next/") || name.endsWith("ProActivationModal")) return {default:()=>null};
    throw Error(name);
  },exports);
  return renderToStaticMarkup(React.createElement(exports.default!,{adminUserId:"synthetic-admin",adminEmail:"admin@local.invalid"}));
}

test("admin confirmations show selected duration separately from all remaining access", () => {
  const html = renderAdmin("extend");
  assert.match(html, /Selected duration<\/dt><dd>6 Months<\/dd>/);
  assert.match(html, /May 6, 2100/);
  assert.match(html, /November 6, 2099/);
  assert.match(html, /Confirm Extension/);
  assert.doesNotMatch(html, /days from today|\d+ days\)|New Plan:|Action Type:|<dd>purchased/);
  assert.match(html, /<dialog/);
  assert.match(html, /aria-pressed="true"/);
});

test("grant, change-date, revoke and conflict dialogs retain precise actions and readable dates", () => {
  for(const [action,label] of [["activate","Confirm Grant"],["modify_expiration","Confirm Expiration Change"],["revoke","Confirm Revocation"]]) {
    const html=renderAdmin(action);
    assert.ok(html.includes(label));
    assert.match(html,/Current access<\/dt><dd>Active RevIT Pro/);
    if(action==="revoke") assert.match(html,/Free · Pro removed/);
  }
  const custom=renderAdmin("modify_expiration","custom","2101-01-15");
  assert.match(custom,/Custom expiration date/);assert.match(custom,/January 15, 2101/);
  const conflict=renderAdmin("activate","6m","",true);
  assert.match(conflict,/Keep existing Pro access/);assert.match(conflict,/Extend Subscription/);assert.match(conflict,/Replace Expiration/);
  assert.doesNotMatch(conflict,/total days remaining|days from today/);
});
