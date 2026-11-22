import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as core from "../app/lib/admin/adminReportingCore";
import * as billing from "../app/lib/admin/subscriptionBilling";
function handler(file:string, overrides:Record<string,unknown>={}) {
  const calls:{mode:string;filters:unknown;limit:number;fresh:boolean}[]=[];
  const dependencies:Record<string,unknown>={
    "server-only":{}, "next/server":{NextResponse:Response},
    "../../../lib/admin/adminAuth":{ verifyAdminSession:async()=>({authenticated:true,authorized:true}) },
    "../../../lib/supabase/config":{ isSupabaseConfigured:()=>true },
    "../../../lib/admin/adminReportingCore":core,
    "../../../lib/admin/adminReporting":{ readReporting:async(mode:string,filters:unknown,limit=25,fresh=false)=>{calls.push({mode,filters,limit,fresh});return {asOf:"2026-11-19",subscribers:[],history:[],months:[],hasMore:false};} },
    ...overrides,
  };
  const source=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:{GET?:(request:Request)=>Promise<Response>}={};
  new Function("require","exports",source)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},exports);
  return {get:exports.GET!,calls};
}
for(const file of ["app/api/admin/sales/route.ts","app/api/admin/export/route.ts","app/api/admin/history/route.ts"]) {
  test(`${file}: anonymous/Free/expired/non-admin and offline cannot read or export`, async()=>{
    for(const session of [{authenticated:false,authorized:false},{authenticated:true,authorized:false}]) {
      const h=handler(file,{"../../../lib/admin/adminAuth":{verifyAdminSession:async()=>session}});
      assert.equal((await h.get(new Request("http://localhost/api?mode=summary"))).status,session.authenticated?403:401);assert.equal(h.calls.length,0);
    }
    const h=handler(file,{"../../../lib/supabase/config":{isSupabaseConfigured:()=>false}});
    assert.equal((await h.get(new Request("http://localhost/api?mode=summary"))).status,401);assert.equal(h.calls.length,0);
  });
  test(`${file}: invalid filters never reach reporting`, async()=>{
    const h=handler(file); assert.equal((await h.get(new Request("http://localhost/api?mode=subscribers&page=NaN"))).status,400); assert.equal(h.calls.length,0);
  });
  test(`${file}: database failures stay sanitized and never become zero totals`, async()=>{
    const h=handler(file,{"../../../lib/admin/adminReporting":{readReporting:async()=>{throw new Error("sensitive SQL data");}}});
    const response=await h.get(new Request("http://localhost/api?mode=summary")); assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/sensitive SQL data/);
  });
}
function subscriptionHandler(service:Record<string,unknown>={}, session:unknown={authenticated:true,authorized:true,user:{id:"00000000-0000-4000-8000-000000000001"}}) {
  const calls:Record<string,unknown>[]=[];
  const dependencies:Record<string,unknown>={
    "server-only":{}, "next/server":{NextResponse:Response},
    "../../../lib/admin/adminAuth":{verifyAdminSession:async()=>session},
    "../../../lib/admin/adminService":{applySubscriptionChange:async(params:Record<string,unknown>)=>{calls.push(params);return {success:true};},...service},
    "next/cache":{revalidateTag:()=>{}},
    "../../../lib/admin/adminReportingCore":{SALES_CACHE_TAG:"admin-sales"},
    "../../../lib/admin/subscriptionBilling":billing,
  };
  const source=ts.transpileModule(readFileSync("app/api/admin/subscription/route.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:{POST?:(request:Request)=>Promise<Response>}={};
  new Function("require","exports",source)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},exports);
  return {post:exports.POST!,calls};
}
test("subscription route requires an authorized admin before validating or writing",async()=>{
  for(const session of [{authenticated:false,authorized:false},{authenticated:true,authorized:false}]){
    const h=subscriptionHandler({},session);
    const response=await h.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({userId:"11111111-1111-4111-8111-111111111111",action:"activate",planMonths:3})}));
    assert.equal(response.status,session.authenticated?403:401);
    assert.equal(h.calls.length,0);
  }
});
test("subscription route rejects unsupported planMonths server-side without calling the writer",async()=>{
  const h=subscriptionHandler();
  const base={userId:"11111111-1111-4111-8111-111111111111",source:"purchased",customExpiresAt:new Date(Date.now()+86400000).toISOString()};
  for(const planMonths of [2,0,-1,1.5,"3","3m",true,{},[]]){
    const response=await h.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({...base,action:"activate",planMonths})}));
    assert.equal(response.status,400,"rejects "+JSON.stringify(planMonths));
  }
  for(const action of ["modify_expiration","revoke"]){
    const response=await h.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({...base,action,planMonths:3})}));
    assert.equal(response.status,400,"rejects plan on "+action);
  }
  assert.equal(h.calls.length,0);
});
test("subscription route forwards 1/3/6 planMonths and null for custom or non-grant actions",async()=>{
  const base={userId:"11111111-1111-4111-8111-111111111111",source:"purchased",customExpiresAt:new Date(Date.now()+86400000).toISOString()};
  for(const planMonths of [1,3,6]){
    const h=subscriptionHandler();
    const response=await h.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({...base,action:"activate",planMonths,idempotencyKey:`plan-${planMonths}`})}));
    assert.equal(response.status,200);
    assert.equal(h.calls.length,1);
    assert.equal(h.calls[0].planMonths,planMonths);
    // Non-billing arguments unchanged.
    assert.equal(h.calls[0].durationDays,30);
    assert.equal(h.calls[0].expectedExpiresAt,null);
    assert.equal(h.calls[0].allowShorten,false);
  }
  const custom=subscriptionHandler();
  assert.equal((await custom.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({...base,action:"activate"})}))).status,200);
  assert.equal(custom.calls[0].planMonths,null);
  const extend=subscriptionHandler();
  assert.equal((await extend.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify({...base,action:"extend",planMonths:6})}))).status,200);
  assert.equal(extend.calls[0].planMonths,6);
  const duplicate=subscriptionHandler();
  const body={...base,action:"activate",planMonths:1,idempotencyKey:"duplicate-key"};
  assert.equal((await duplicate.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify(body)}))).status,200);
  const second=await (await duplicate.post(new Request("http://localhost/api/admin/subscription",{method:"POST",body:JSON.stringify(body)}))).json();
  assert.equal(second.deduplicated,true);
  assert.equal(duplicate.calls.length,1);
});
test("authorized summary performs only its requested query, without shared HTTP caching",async()=>{
  const h=handler("app/api/admin/sales/route.ts");const response=await h.get(new Request("http://localhost/api?mode=summary"));
  assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");assert.equal(h.calls.length,1);assert.equal(h.calls[0].mode,"summary");
});
test("manual refresh forwards a one-shot fresh flag without changing caching or bounds",async()=>{
  const h=handler("app/api/admin/sales/route.ts");
  assert.equal((await h.get(new Request("http://localhost/api?mode=summary&fresh=1"))).status,200);
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].mode,"summary");assert.equal(h.calls[0].fresh,true);
  const history=handler("app/api/admin/history/route.ts");
  assert.equal((await history.get(new Request("http://localhost/api?fresh=1"))).status,200);
  assert.equal(history.calls.length,1);assert.equal(history.calls[0].mode,"transactions");assert.equal(history.calls[0].fresh,true);
  const plain=handler("app/api/admin/sales/route.ts");
  assert.equal((await plain.get(new Request("http://localhost/api?mode=summary"))).status,200);
  assert.equal(plain.calls[0].fresh,false);
});
test("exports stop after 1000 rows and advertise truncation without a count query",async()=>{
  let calls=0;
  const h=handler("app/api/admin/export/route.ts",{"../../../lib/admin/adminReporting":{readReporting:async()=>{calls++;return {hasMore:true,subscribers:Array.from({length:250},()=>({username:"=CMD()",status:"active",amountPhp:49}))};}}});
  const response=await h.get(new Request("http://localhost/api?kind=subscribers")); const csv=await response.text();
  assert.equal(calls,4);assert.equal(response.headers.get("X-Export-Truncated"),"true");assert.equal(csv.split("\r\n").length,1002);assert.match(csv,/'=CMD\(\)/);assert.match(csv,/"49"/);
});
test("existing admin identity verification requires validated user ID, never Offline/Pro status",async()=>{
  const code=ts.transpileModule(readFileSync("app/lib/admin/adminAuth.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  let user:unknown={id:"offline-student",plan:"pro"}; let calls=0;
  const exports:{verifyAdminSession?:()=>Promise<{authorized:boolean}>}={};
  const owner="00000000-0000-4000-8000-000000000001";
  new Function("require","exports","process",code)((name:string)=>{
    if(name==="server-only")return {};
    if(name==="../supabase/server")return {createClient:async()=>({auth:{getUser:async()=>{calls++;return {data:{user},error:null};}}})};
    if(name==="@supabase/supabase-js")return {createClient:()=>{throw Error("No service reads in authorization");}};
    throw Error(name);
  },exports,{env:{REVIT_ADMIN_USER_IDS:owner}});
  assert.equal((await exports.verifyAdminSession!()).authorized,false);
  user={id:owner,app_metadata:{provider:"google"}};
  assert.equal((await exports.verifyAdminSession!()).authorized,true);
  user=null; assert.equal((await exports.verifyAdminSession!()).authorized,false); assert.equal(calls,3);
});

function existingHandler(file:string, session:unknown, service:Record<string,unknown>, calls:unknown[][]=[]) {
  const dependencies:Record<string,unknown> = {
    "server-only":{},
    "next/server":{NextResponse:Response},
    "../../../lib/admin/adminAuth":{verifyAdminSession:async()=>session},
    "../../../lib/admin/adminService":service,
  };
  const source=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:{GET?:(request:Request)=>Promise<Response>}={};
  new Function("require","exports",source)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},exports);
  return {get:exports.GET!,calls};
}
test("existing admin search keeps admin authorization, 20-row cap and no synthetic fallback",async()=>{
  for(const session of [{authenticated:false,authorized:false},{authenticated:true,authorized:false}]){
    let calls=0;const h=existingHandler("app/api/admin/search/route.ts",session,{searchUsers:async()=>{calls++;return {users:[]}}});
    assert.equal((await h.get(new Request("http://localhost/api/admin/search?q=real"))).status,session.authenticated?403:401);assert.equal(calls,0);
  }
  let args:unknown[]=[];const h=existingHandler("app/api/admin/search/route.ts",{authenticated:true,authorized:true},{searchUsers:async(...value:unknown[])=>{args=value;return {users:[{id:"11111111-1111-4111-8111-111111111111",email:"real@revit.test",username:"real",firstName:"Real",plan:"pro",proStartedAt:null,proExpiresAt:null,proNote:"note",createdAt:"2026-01-01",isEffectivePro:false}]}}});
  const response=await h.get(new Request("http://localhost/api/admin/search?q=real&page=2&limit=99"));const body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(args,["real",20,20]);assert.equal(body.limit,20);assert.equal(body.users[0].username,"real");assert.doesNotMatch(JSON.stringify(body),/demo_learner|synthetic|example\.invalid/);
});
test("existing subscriber detail returns real profile/history shape without synthetic data",async()=>{
  for(const session of [{authenticated:false,authorized:false},{authenticated:true,authorized:false}]){
    let calls=0;const h=existingHandler("app/api/admin/user/route.ts",session,{getUserDetails:async()=>{calls++;return {user:null,history:[]}}});
    assert.equal((await h.get(new Request("http://localhost/api/admin/user?userId=11111111-1111-4111-8111-111111111111"))).status,session.authenticated?403:401);assert.equal(calls,0);
  }
  let userId="";const h=existingHandler("app/api/admin/user/route.ts",{authenticated:true,authorized:true},{getUserDetails:async(value:string)=>{userId=value;return {user:{id:value,email:"real@revit.test",username:"real",firstName:"Real",plan:"pro",proStartedAt:"2026-01-01",proExpiresAt:"2099-01-01",proNote:"private note",createdAt:"2026-01-01",isEffectivePro:true},history:[{id:"h1",userId:value,eventType:"activated",source:"purchased",previousPlan:"free",newPlan:"pro",previousExpiresAt:null,newExpiresAt:"2099-01-01",adminId:null,customMessage:null,createdAt:"2026-01-01"}],summaryNote:"Currently active on RevIT Pro."}}});
  const response=await h.get(new Request("http://localhost/api/admin/user?userId=11111111-1111-4111-8111-111111111111"));const body=await response.json();
  assert.equal(response.status,200);assert.equal(userId,"11111111-1111-4111-8111-111111111111");assert.equal(body.user.username,"real");assert.equal(body.history.length,1);assert.equal(body.summaryNote,"Currently active on RevIT Pro.");assert.doesNotMatch(JSON.stringify(body),/demo_learner|synthetic|example\.invalid/);
});
