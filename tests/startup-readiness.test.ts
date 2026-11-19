import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { loadCloudSnapshot } from "../app/lib/cloudService";
import { FREE_ENTITLEMENT } from "../app/lib/entitlements";
const source = readFileSync("app/RevITApp.tsx", "utf8");
const ast = ts.createSourceFile("app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function effect(marker: string, context: Record<string, unknown>) {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0].getText(ast).includes(marker)) found = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(found, marker);
  const code = ts.transpileModule(`const extracted = (${found.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(context), `${code};return extracted;`)(...Object.values(context)) as () => (() => void) | undefined;
}
function deferred<T = any>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const pro = { ...FREE_ENTITLEMENT, storedPlan: "pro" as const, effectivePlan: "pro" as const, proExpiresAt: "2027-01-01T00:00:00Z", serverNow: "2026-11-18T00:00:00Z" };
function cloudMock(entitlement: any, activity: Promise<any> = Promise.resolve({data:[],error:null})) {
  const count = { auth:0, entitlement:0, queries:[] as string[] };
  return { count, client:{auth:{ getSession:async()=>{count.auth++;return{data:{session:{user:{id:"owner"}}}};} }, rpc:()=>{count.entitlement++;return Promise.resolve(entitlement);},from:(table:string)=>{count.queries.push(table);const data=table==="profiles"?{id:"owner",first_name:"Synthetic",plan:"pro"}:[];const promise=table==="daily_activity"?activity:Promise.resolve({data,error:null});const chain:any=new Proxy({}, {get:(_t,key)=>{if(["insert","upsert","update","delete"].includes(String(key)))assert.fail("Snapshot must be read-only");return key==="then"?promise.then.bind(promise):()=>chain;}});return chain;} } };
}
for (const [label, row] of [["Free",{stored_plan:"free",effective_plan:"free"}],["Pro",{stored_plan:"pro",effective_plan:"pro"}],["expired",{stored_plan:"pro",effective_plan:"free"}] ] as const) test(`existing RPC resolves ${label} before optional activity without extra queries`,async()=>{
  const optional=deferred();const mock=cloudMock({data:[row],error:null},optional.promise);let access:any;let finished=false;const request=loadCloudSnapshot(mock.client as never,"owner",(profile,entitlement)=>{access={profile,entitlement};}).then(result=>{finished=true;return result;});await tick();assert.equal(access.entitlement.effectivePlan,row.effective_plan);assert.equal(access.entitlement.storedPlan,row.stored_plan);assert.equal(finished,false);assert.equal(mock.count.entitlement,1);assert.equal(mock.count.auth,1);optional.resolve({data:[],error:null});await request;assert.equal(mock.count.entitlement,1);
});
test("missing/failed entitlement is an error for readiness, never a Free callback",async()=>{for(const result of[{data:null,error:{code:"PGRST202"}},{data:[],error:null},{data:[{}],error:null}]){const mock=cloudMock(result);let callbacks=0;await assert.rejects(loadCloudSnapshot(mock.client as never,"owner",()=>{callbacks++;}),/Entitlement could not be verified/);assert.equal(callbacks,0);assert.equal(mock.count.entitlement,1);}});
function startup(owner="owner") {
  const request=deferred();let callback:any,ownerCheck:any;const state={access:[] as any[],entitlements:[] as any[],errors:[] as any[]};
  const context={accessGeneration:{current:0},verifiedAccessOwner:{current:owner},accessOwner:owner,cloudEnabled:true,initialUser:{id:owner,username:"Synthetic"},offlineMode:false,sessionPolicyReady:true,
    setStartupAccess:(v:any)=>state.access.push(v),setEntitlement:(v:any)=>state.entitlements.push(v),FREE_ENTITLEMENT,setCloudLoading:()=>{},setCloudError:(v:any)=>state.errors.push(v),setCloudProfile:()=>{},setProgressionReady:()=>{},createClient:()=>({}),DEFAULT_PROFILE:{name:"Synthetic"},localProfileToCloud:()=>({}),withTimeout:(p:any)=>p,
    loadCloudSnapshot:(_c:any,_u:any,cb:any,guard:any)=>{callback=cb;ownerCheck=guard;return request.promise;}};
  const cleanup=effect("let acceptingAccess = true",context)();return{state,request,cleanup,generation:context.accessGeneration,binding:context.verifiedAccessOwner,ownerCheck:()=>ownerCheck(),ready:(value:any)=>callback({},value)};
}
test("unresolved access stays loading; optional failure cannot downgrade verified Pro",async()=>{const h=startup();assert.equal(h.state.access.at(-1).status,"loading");assert.equal(h.state.entitlements.length,0);h.ready(pro);assert.equal(h.state.access.at(-1).status,"ready");h.request.reject(new Error("optional unavailable"));await tick();assert.equal(h.state.access.at(-1).status,"ready");assert.equal(h.state.entitlements.at(-1),pro);h.cleanup?.();});
test("failed verification is recoverable error and late timed-out response cannot grant access",async()=>{const h=startup();h.request.reject(new Error("Request timed out."));await tick();assert.equal(h.state.access.at(-1).status,"error");h.ready(pro);assert.equal(h.state.entitlements.length,0);h.cleanup?.();});
test("account switch/sign-out cancellation ignores stale account replies",async()=>{const first=startup("first");first.cleanup?.();first.ready(pro);first.request.reject(new Error("old response"));await tick();assert.equal(first.state.entitlements.length,0);const second=startup("second");second.ready(FREE_ENTITLEMENT);assert.equal(second.state.access.at(-1).owner,"second");assert.equal(second.state.entitlements.at(-1).effectivePlan,"free");second.cleanup?.();});
test("guest/offline branch makes no cloud call and retains existing Free rule",()=>{const state:any[]=[];effect("let acceptingAccess = true",{accessOwner:"local",setStartupAccess:(v:any)=>state.push(v),setEntitlement:(v:any)=>state.push(v),FREE_ENTITLEMENT})();assert.deepEqual(state,[{owner:"local",status:"ready"},FREE_ENTITLEMENT]);});
test("essential gate excludes optional cloud/progression, filters wait for resolved identity",()=>{const start=source.indexOf("    const ready = themeReady"),end=source.indexOf("  // Auto-open updates",start),gate=source.slice(start,end);assert.match(gate,/startupAccess.owner === accessOwner/);assert.match(gate,/startupAccess.status !== "loading"/);assert.doesNotMatch(gate,/&& progressionReady|!cloudLoading/);assert.match(source,/if \(!accessReady\) return;\s+const validIds/);assert.match(source,/if \(!accessReady \|\| proActive/);assert.match(source,/startupAccess.status === "error"\) return <RevITLoadingScreen error onRetry/);});
test("reviewer payload fetch is lazy, cancellation guarded and partial failure explicit",()=>{const start=source.indexOf('    if (!["library", "progress", "weakness"].includes(activeView)) return;'),end=source.indexOf("  const allAvailableSubjects",start);const code=source.slice(start,end);assert.ok(start>0);assert.match(code,/if \(cancelled\) return/);assert.match(code,/requiredResults.every/);assert.match(code,/setReviewerReadyOwner\(accessOwner\)/);assert.match(code,/setPremiumContentError/);assert.match(source,/reviewerPending \? <ReviewerLoadingState/);assert.match(source,/online && !wasOnline.current && startupAccess.status === "error"/);});

test("concurrent same-owner entitlement reads share only the in-flight RPC",async()=>{const pending=deferred();const mock=cloudMock({data:[],error:null});mock.client.rpc=()=>{mock.count.entitlement++;return pending.promise;};const first=loadCloudSnapshot(mock.client as never,"owner");const second=loadCloudSnapshot(mock.client as never,"owner");await tick();assert.equal(mock.count.entitlement,1);pending.resolve({data:[{effective_plan:"free",stored_plan:"free"}],error:null});await Promise.all([first,second]);await loadCloudSnapshot(mock.client as never,"owner");assert.equal(mock.count.entitlement,2,"no stale completed decision cached");});

test("invalidated verified-owner binding stops all profile and entitlement reads",async()=>{const mock=cloudMock({data:[{effective_plan:"pro"}],error:null});await assert.rejects(loadCloudSnapshot(mock.client as never,"other-owner",()=>assert.fail("stale access"),()=>false),/AUTH_SESSION_CHANGED/);assert.equal(mock.count.auth,0);assert.equal(mock.count.entitlement,0);assert.equal(mock.count.queries.length,0);});

test("existing auth notification invalidates cross-tab identities without another query",()=>{let notify:any,refresh=0,unsubscribed=false;const state:any[]=[];const generation={current:0},verifiedOwner={current:null as string|null};const cleanup=effect("accessGeneration.current++",{cloudEnabled:true,offlineMode:false,initialUser:{id:"owner"},trustedStudy:null,accessGeneration:generation,verifiedAccessOwner:verifiedOwner,FREE_ENTITLEMENT,setStartupAccess:(v:any)=>state.push(v),setEntitlement:(v:any)=>state.push(v),router:{refresh:()=>{refresh++;}},createClient:()=>({auth:{onAuthStateChange:(cb:any)=>{notify=cb;return{data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};}}})})();assert.equal(verifiedOwner.current,"owner");notify("TOKEN_REFRESHED",{user:{id:"owner"}});assert.equal(refresh,0);notify("SIGNED_IN",{user:{id:"other"}});assert.equal(generation.current,1);assert.equal(verifiedOwner.current,null);notify("SIGNED_IN",{user:{id:"owner"}});assert.equal(verifiedOwner.current,null,"events cannot re-establish server-verified identity");assert.equal(state[0].status,"loading");assert.equal(state[0].owner,"auth-change");assert.equal(refresh,1);cleanup?.();assert.equal(unsubscribed,true);});

test("snapshot never reads stored session identity, including refreshed sessions",async()=>{
  for(const refresh of [false,true]){
    const mock=cloudMock({data:[{stored_plan:"pro",effective_plan:"pro"}],error:null});
    const session={access_token:"synthetic",get user():never{throw Error("Untrusted identity read");}};
    let refreshes=0,callbacks=0;
    mock.client.auth={getSession:async()=>{mock.count.auth++;return {data:{session:refresh?null:session}};},refreshSession:async()=>{refreshes++;return {data:{session}};}} as any;
    await loadCloudSnapshot(mock.client as never,"owner",()=>{callbacks++;},()=>true);
    assert.equal(callbacks,1);assert.equal(mock.count.auth,1);assert.equal(refreshes,Number(refresh));assert.equal(mock.count.entitlement,1);
  }
});

test("owner invalidated during delayed token resolution makes no data requests",async()=>{
  const mock=cloudMock({data:[{effective_plan:"pro"}],error:null}),token=deferred();let valid=true;
  mock.client.auth.getSession=async()=>{mock.count.auth++;return token.promise;};
  const request=loadCloudSnapshot(mock.client as never,"owner",()=>assert.fail("stale access"),()=>valid);
  valid=false;token.resolve({data:{session:{access_token:"synthetic"}}});
  await assert.rejects(request,/AUTH_SESSION_CHANGED/);assert.equal(mock.count.queries.length,0);assert.equal(mock.count.entitlement,0);
});

test("server-authorized profile identity must match before entitlement publication",async()=>{
  for(const profile of [null,{id:"other-owner",plan:"pro"}]){
    const mock=cloudMock({data:[{effective_plan:"pro",stored_plan:"pro"}],error:null});
    const from=mock.client.from;
    mock.client.from=(table:string)=>table==="profiles"?{select(){return this;},eq(){return this;},maybeSingle:async()=>({data:profile,error:null})} as any:from(table);
    await assert.rejects(loadCloudSnapshot(mock.client as never,"owner",()=>assert.fail("wrong owner published"),()=>true),/AUTH_SESSION_CHANGED/);
    assert.equal(mock.count.entitlement,1);
  }
});

test("account switch during profile or entitlement wait rejects stale access",async()=>{
  for(const waitFor of ["profile","entitlement"]){
    const mock=cloudMock({data:[{effective_plan:"pro",stored_plan:"pro"}],error:null}),pending=deferred();let valid=true;
    if(waitFor==="entitlement")mock.client.rpc=()=>{mock.count.entitlement++;return pending.promise;};
    else {const from=mock.client.from;mock.client.from=(table:string)=>table==="profiles"?{select(){return this;},eq(){return this;},maybeSingle:()=>pending.promise} as any:from(table);}
    const request=loadCloudSnapshot(mock.client as never,"owner",()=>assert.fail("stale access"),()=>valid);
    await tick();valid=false;pending.resolve({data:waitFor==="profile"?{id:"owner"}:[{effective_plan:"pro",stored_plan:"pro"}],error:null});
    await assert.rejects(request,/AUTH_SESSION_CHANGED/);assert.equal(mock.count.entitlement,1);
  }
});

test("owner invalidation after access-ready still rejects remaining snapshot data",async()=>{
  const activity=deferred(),mock=cloudMock({data:[{effective_plan:"pro",stored_plan:"pro"}],error:null},activity.promise);let valid=true,ready=0;
  const request=loadCloudSnapshot(mock.client as never,"owner",()=>{ready++;},()=>valid);
  await tick();assert.equal(ready,1);valid=false;activity.resolve({data:[],error:null});
  await assert.rejects(request,/AUTH_SESSION_CHANGED/);assert.equal(mock.count.entitlement,1);
});

test("token refresh failure remains expired and cannot publish entitlement",async()=>{
  const mock=cloudMock({data:[{effective_plan:"pro"}],error:null});
  mock.client.auth={getSession:async()=>({data:{session:null}}),refreshSession:async()=>{throw Error("unavailable");}} as any;
  await assert.rejects(loadCloudSnapshot(mock.client as never,"owner",()=>assert.fail("unverified Pro"),()=>true),/AUTH_SESSION_EXPIRED/);
  assert.equal(mock.count.queries.length,0);assert.equal(mock.count.entitlement,0);
});

test("actual startup supplies its verified-owner and generation guard to snapshot reads",async()=>{
  const h=startup();assert.equal(h.ownerCheck(),true);
  h.binding.current="other";assert.equal(h.ownerCheck(),false);
  h.binding.current="owner";h.generation.current++;assert.equal(h.ownerCheck(),false);
  h.ready(pro);assert.equal(h.state.entitlements.length,0);
  h.request.reject(new Error("AUTH_SESSION_CHANGED"));await tick();assert.equal(h.state.entitlements.length,0);h.cleanup?.();
});

test("delayed authentication policy never starts a snapshot or publishes access",()=>{
  effect("let acceptingAccess = true",{accessOwner:"owner",initialUser:{id:"owner"},sessionPolicyReady:false,
    loadCloudSnapshot:()=>assert.fail("premature read"),setStartupAccess:()=>assert.fail("premature access"),setEntitlement:()=>assert.fail("premature entitlement")})();
});

test("A-B-A startup cannot reuse invalidated entitlement or evict the newer in-flight request",async()=>{
  const oldReply=deferred(),newReply=deferred(),mock=cloudMock({data:[],error:null});let originalOwnerValid=true;
  mock.client.rpc=()=>{mock.count.entitlement++;return mock.count.entitlement===1?oldReply.promise:newReply.promise;};
  const old=loadCloudSnapshot(mock.client as never,"owner",()=>assert.fail("old access"),()=>originalOwnerValid);
  await tick();originalOwnerValid=false;
  const current=loadCloudSnapshot(mock.client as never,"owner",(_p,e)=>assert.equal(e.effectivePlan,"free"),()=>true);
  await tick();assert.equal(mock.count.entitlement,2,"new verified lifecycle cannot share old owner's request");
  oldReply.resolve({data:[{stored_plan:"pro",effective_plan:"pro"}],error:null});await assert.rejects(old,/AUTH_SESSION_CHANGED/);
  const concurrent=loadCloudSnapshot(mock.client as never,"owner",(_p,e)=>assert.equal(e.effectivePlan,"free"),()=>true);
  await tick();assert.equal(mock.count.entitlement,2,"old completion cannot evict the current deduplicated request");
  newReply.resolve({data:[{stored_plan:"free",effective_plan:"free"}],error:null});
  for(const snapshot of await Promise.all([current,concurrent]))assert.equal(snapshot.entitlement.effectivePlan,"free");
});
