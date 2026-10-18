import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { assertDryRun, drained, concurrent, checkFixture, inventorySql, preserveInstallation, validateSnapshot, signatures, acceptedPreservation, cliEndpoint, cliArgv, coverage, classifyCliFailure, settleInstallation, durable } from "../scripts/phase3o/staging-validation.mjs";
import { compilePack } from "../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs";

const root=resolve(import.meta.dirname,"..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");
const base=resolve(root,"scratch/phase3o");mkdirSync(base,{recursive:true});
const aid="00000000-0000-4000-8000-000000000001",bid="00000000-0000-4000-8000-000000000002",sid="00000000-0000-4000-8000-000000000003";
function seed(owner:string){
  const data:Record<string,Record<string,unknown>[]>={
    "auth.users":[{id:owner,hash:"original-auth-hash"}],"public.profiles":[{id:owner}],"public.user_preferences":[{user_id:owner}],
    "public.question_attempts":[{id:aid,user_id:owner,session_slot:0},{id:bid,user_id:owner,session_slot:1}],
    "public.user_achievements":[{id:"unlock",user_id:owner}],"public.question_reinforcement":[],
    "public.study_sessions":[{id:sid,user_id:owner,completion_contract:1,completed_at:null,completion_receipt:null}],
    "public.daily_activity":[{id:"daily",user_id:owner,questions_answered:2,correct_answers:2,review_count:0,updated_at:"before"}],
    "public.user_progress":[{id:"progress",user_id:owner,total_xp:45,updated_at:"before"}],
    "public.activity_events":[{id:"answer-a",user_id:owner},{id:"answer-b",user_id:owner},{id:"daily-award",user_id:owner}],
  };
  return {data,meta:{fenced:true},routines:["reviewed-five-routines"]};
}
function completed(original:ReturnType<typeof seed>){
  const result=structuredClone(original),owner=result.data["auth.users"][0].id as string;
  const receipt={sessionId:sid,contract:1,totalXp:65,xpAwarded:20,attemptCount:2,correctCount:2,level:1,unlocked:[],
    completedAt:"2026-10-17T07:00:00Z",fingerprint:"a".repeat(32),attemptIds:[aid,bid]};
  Object.assign(result.data["public.study_sessions"][0],{completed_at:receipt.completedAt,completion_receipt:receipt});
  result.data["public.activity_events"].push({id:"completion",user_id:owner,event_key:"study-session:"+sid,event_type:"study_session_completed",
    xp_awarded:20,leaderboard_xp:0,trusted_effect_version:1,trusted_session_id:sid,trusted_attempt_id:null,subject_id:null,subject_name:null,occurred_at:receipt.completedAt});
  Object.assign(result.data["public.daily_activity"][0],{review_count:1,updated_at:"after"});
  Object.assign(result.data["public.user_progress"][0],{total_xp:65,updated_at:"after"});return result;
}
test("only the exact Migration28 dry run is accepted",()=>{
  assertDryRun("DRY RUN: migrations will not be pushed.\nWould push these migrations:\n • 202610170028_atomic_study_completion.sql\n");
  for(const text of ["Remote database is up to date.","Would push these migrations:\n202610160027_trusted_cutover_and_attempt_numbering.sql",
    "Would push these migrations:\n202610170028_atomic_study_completion.sql\n202610160027_other.sql",
    "Would push these migrations:\n202610170028_atomic_study_completion.sql\nWould seed these files:"])
    assert.throws(()=>assertDryRun(text));
});
test("CLI uses percent-encoded password, isolated workdir, and never linked/roles/seed",()=>{
  const connection={host:"aws-1-ap-southeast-2.pooler.supabase.com",user:"postgres.qnepjfcbzsycmesrcbjb",password:"p@ss:word/x",sslmode:"require"};
  const endpoint=cliEndpoint(connection,false);
  assert.match(endpoint,/^postgresql:\/\/postgres\.qnepjfcbzsycmesrcbjb:p%40ss%3Aword%2Fx@aws-1-ap-southeast-2\.pooler\.supabase\.com:5432\/postgres\?/);
  assert.match(endpoint,/default_transaction_read_only%3Don/);
  assert.match(cliEndpoint(connection,true),/default_transaction_read_only%3Doff/);
  const argv=cliArgv(["migration","fetch"],"C:\\tmp\\cli",endpoint);
  assert.deepEqual(argv.slice(0,4),["--workdir","C:\\tmp\\cli","--yes","migration"]);
  assert.ok(!argv.includes("--linked")&&!argv.includes("--local"));
  assert.equal(argv.at(-2),"--db-url");assert.equal(argv.at(-1),endpoint);
  assert.throws(()=>cliArgv(["link"],"C:\\tmp\\cli",endpoint));
  assert.throws(()=>cliArgv(["db","push","--include-seed"],"C:\\tmp\\cli",endpoint));
});
test("original archived preservation reference decodes losslessly; no new baseline is manufactured",()=>{
  const original=acceptedPreservation();assert.equal(original.meta.registry.length,5);
  assert.deepEqual(original.data["public.trusted_study_config"],[{id:1,enabled:false,updated_at:"2026-10-16T06:16:39.2326+00:00"}]);
  assert.equal(original.meta.registry.filter((r:{version:string})=>r.version==="202610160027").length,1);
});
test("seed and legitimate completion are accepted; unknown data/ACL/membership/reward changes fail cleanup",()=>{
  const owner="10000000-0000-4000-8000-000000000001",s=seed(owner),c=completed(s);
  assert.equal(checkFixture(s,s,owner),true);assert.equal(checkFixture(s,c,owner),true);
  for(const change of [
    (v:typeof c)=>{v.data["public.question_attempts"][0].id="other";},
    (v:typeof c)=>{v.data["public.activity_events"].push({id:"untracked"});},
    (v:typeof c)=>{v.data["public.user_progress"][0].total_xp=66;},
    (v:typeof c)=>{v.data["auth.users"][0].hash="changed";},
    (v:typeof c)=>{v.data["public.user_preferences"][0].untracked=true;},
    (v:typeof c)=>{v.meta.fenced=false;},
    (v:typeof c)=>{v.routines.push("changed-source");},
  ]){const copy=structuredClone(c);change(copy);assert.throws(()=>checkFixture(s,copy,owner));}
});
test("closed idle Supavisor backends may drain; worker label, wrong role, transaction, locks, blockers or unconfirmed closure fail",()=>{
  const workers=[{pid:101,closed:true},{pid:102,closed:true}];
  const row={pid:101,application_name:"Supavisor",usename:"postgres",state:"idle",xact_start:null,blockers:[] as number[],lock_count:0};
  drained([row],workers);
  for(const patch of [{application_name:"revit-phase3o-B"},{usename:"service_role"},{state:"active"},{xact_start:"now"},
    {lock_count:1},{blockers:[102]}])assert.throws(()=>drained([{...row,...patch}],workers));
  assert.throws(()=>drained([row],[{pid:101,closed:false}]));
});
test("inventory reuses pinned closure/metadata and never exports auth credentials or unrelated managed descendants",()=>{
  const pack=compilePack(read("docs/phase3n/phase3n-n/EXECUTION_PACK.md"));
  const sql=inventorySql(pack,"10000000-0000-4000-8000-000000000001");
  assert.match(sql,/Foreign auth user/);assert.match(sql,/Untracked descendant\/prepared/);
  assert.match(sql,/md5\(to_jsonb\(u\)::text\)/);assert.doesNotMatch(sql,/jsonb_agg\(to_jsonb\(u\)/);
  assert.match(sql,/FROM public\.user_preferences x/);assert.match(sql,/ORDER BY user_id/);
  assert.throws(()=>inventorySql(pack,"';DROP TABLE public.profiles;--"));
});

test("coverage parser accepts the pinned aligned Phase 3N reference log and the unaligned live row; rejects duplicates/missing markers",()=>{
  const ref=coverage(read("scratch/phase3n-n2-evidence/coverage-readonly-Catalog-20261016T150743557Z-768ad107.log"));
  assert.ok(ref && typeof ref==="object" && "event_settings" in ref);
  const live='ROLLBACK\n {"indexes": [], "event_settings": {}}\nCOVERAGE_READ_ONLY_ROLLBACK_COMPLETE\n';
  assert.deepEqual(coverage(live),{indexes:[],event_settings:{}});
  assert.throws(()=>coverage(live+'{"event_settings":{}}\n'));
  assert.throws(()=>coverage("BEGIN;\nCOVERAGE_READ_ONLY_ROLLBACK_COMPLETE\n"));
});

test("before-install validation requires27, absent28 and exact existing foundation; no synthetic successful install row",()=>{
  const foundation=read("supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql");
  const sql=read("supabase/migrations/202610170028_atomic_study_completion.sql");
  const routines=[...foundation.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gi)].map(([,name,body])=>({name,
    signature:signatures[name as keyof typeof signatures],owner:"postgres",definer:true,leakproof:false,kind:"f",volatility:"v",parallel:"u",
    settings:["search_path=pg_catalog, public, pg_temp"],source:body,anon:false,authenticated:false,service:name!=="assert_trusted_study_enabled"}));
  const value={database:"postgres",current_user:"postgres",session_user:"postgres",read_only:"on",isolation:"read committed",prepared:0,
    config:[{id:1,enabled:false}],registry:[{version:"202610160027",name:"trusted_cutover_and_attempt_numbering"}],routines};
  validateSnapshot(value,sql,foundation,false);
  assert.throws(()=>validateSnapshot({...value,registry:[...value.registry,{version:"202610170028",name:"atomic_study_completion"}]},sql,foundation,false));
  const drift=structuredClone(value);drift.routines[0].source+="bad";assert.throws(()=>validateSnapshot(drift,sql,foundation,false));
});

test("a real migration SQL failure surfaces as the primary operator failure and is never overwritten by a later registry assertion, while a successful install still returns its snapshot",()=>{
  assert.throws(()=>classifyCliFailure(1,null,"ERROR: syntax error at end of input (SQLSTATE 42601)\nAt statement: 8"),
    (error:Error&{code?:string;sqlstate?:string|null})=>error.code==="MIGRATION_SQL_FAILED"&&error.sqlstate==="42601"&&/42601/.test(error.message));
  assert.equal(classifyCliFailure(0,null,"dry run ok"),"dry run ok");
  assert.throws(()=>classifyCliFailure(1,null,"plain cli failure"),
    (error:Error&{code?:string;sqlstate?:string|null})=>error.code==="CLI_FAILED"&&error.sqlstate===null);
  const records:{label:string;code:string}[]=[];
  const cli=Object.assign(Error("MIGRATION_SQL_FAILED: SQLSTATE 42601"),{code:"MIGRATION_SQL_FAILED",sqlstate:"42601"});
  assert.throws(()=>settleInstallation(cli,()=>{throw Object.assign(Error("MIGRATION_REGISTRY"),{code:"MIGRATION_REGISTRY"});},records),
    (error:Error&{code?:string})=>error.code==="MIGRATION_SQL_FAILED");
  assert.deepEqual(records,[{label:"post-install-inspection",code:"MIGRATION_REGISTRY"}]);
  assert.deepEqual(settleInstallation(null,()=>({after:"snapshot",post:"coverage"}),records),{after:"snapshot",post:"coverage"});
  assert.throws(()=>settleInstallation(null,()=>{throw Object.assign(Error("MIGRATION_REGISTRY"),{code:"MIGRATION_REGISTRY"});},records),
    (error:Error&{code?:string})=>error.code==="MIGRATION_REGISTRY");
});

test("migration 28 keeps its pl/pgsql IF-condition CASE parenthesised so the parser cannot truncate it at the first THEN",()=>{
  const sql=read("supabase/migrations/202610170028_atomic_study_completion.sql");
  assert.match(sql,/if \(case when s\.mode in \('adaptive','weakness_focus'\) then/);
  assert.match(sql,/end\) then\b/);
  assert.doesNotMatch(sql,/if case when/);
  assert.equal(sql.match(/create function public\./g)!.length,5);
});

test("the fetched Phase 3N history fixture normalizes to the expected pre-write set and never includes Migration 28",()=>{
  const registry=acceptedPreservation().meta.registry as {version:string;name:string}[];
  assert.equal(registry.length,5);
  const expected=registry.map(r=>`${r.version}_${r.name}.sql`).sort();
  assert.ok(expected.every(f=>/^[0-9]+_[A-Za-z0-9_]+\.sql$/.test(f)));
  assert.equal(new Set(expected).size,5);
  assert.ok(expected.includes("202610160027_trusted_cutover_and_attempt_numbering.sql"));
  assert.deepEqual(expected.filter(f=>f.startsWith("202610170028_")),[]);
});

test("the install branch fetches history, copies only Migration 28, lists, then gates on the parsed dry run before the single write",()=>{
  const source=read("scripts/phase3o/staging-validation.mjs");
  const ordered=["cliRun('history-fetch',['migration','fetch'])","constants.COPYFILE_EXCL",
    "cliRun('migration-list',['migration','list'])","assertDryRun(cliRun('dry-run',['db','push','--dry-run']))",
    "cliRun('install-28',['db','push'],true)"];
  let cursor=-1;
  for(const token of ordered){const at=source.indexOf(token);assert.ok(at>cursor,`missing or out-of-order: ${token}`);cursor=at;}
});

test("durable evidence artifacts are created exclusively, flushed, and hash-verified",()=>{
  const directory=mkdtempSync(resolve(base,"durable-"));
  const value={result:"NO-GO — MIGRATION_SQL_FAILED: SQLSTATE 42601",records:[{label:"first-installation-failure",code:"MIGRATION_SQL_FAILED"}]};
  const hash=durable(directory,"evidence.json",value);
  assert.match(hash,/^[0-9a-f]{64}$/);
  const written=readFileSync(resolve(directory,"evidence.json"),"utf8");
  assert.equal(createHash("sha256").update(written).digest("hex"),hash);
  assert.equal(written,JSON.stringify(value,null,2));
  assert.throws(()=>durable(directory,"evidence.json","again"));
});

test("installation comparison permits only five nullable typed columns and two reviewed checks",()=>{
  const before={registry:[{version:"202610160027",name:"trusted_cutover_and_attempt_numbering"}],routines:[{name:"commit_verified_study_batch"}],config:[{id:1,enabled:false}]};
  const after={...structuredClone(before),registry:[...before.registry,{version:"202610170028",name:"atomic_study_completion"}],routines:[...before.routines,
    ...["_trusted_study_metrics","_apply_trusted_study_effects","create_rewarded_study_session","commit_rewarded_study_batch","complete_verified_study_session"].map(name=>({name}))]};
  const pre={relations:[{oid:1,name:"study_sessions",columns:[[1,"id",2950]] as unknown[][]},{oid:2,name:"activity_events",columns:[[1,"id",2950]] as unknown[][]}],constraints:[] as unknown[][],dependencies:[] as unknown[][]};
  const post=structuredClone(pre);
  const col=(n:number,name:string,type:number)=>[n,name,type,-1,false,"","",true,0,"p","",true,0,[],null];
  post.relations[0].columns.push(...[col(2,"completion_contract",21),col(3,"completion_receipt",3802)]);
  post.relations[1].columns.push(...[col(2,"trusted_effect_version",21),col(3,"trusted_session_id",2950),col(4,"trusted_attempt_id",2950)]);
  post.constraints=[[11,1,0,"study_sessions_completion_contract_check","c",true,false,false,"CHECK ((completion_contract = 1))"],
    [12,2,0,"activity_events_trusted_effect_version_check","c",true,false,false,"CHECK ((trusted_effect_version = 1))"]];
  post.dependencies=[[1,2,2606,11,0,"a"],[2,2,2606,12,0,"a"]];
  preserveInstallation(before,after,pre,post);
  const extra=structuredClone(post);extra.dependencies.push([1,1,1255,999,0,"n"]);assert.throws(()=>preserveInstallation(before,after,pre,extra));
  const changed=structuredClone(post);changed.relations[0].columns[0][1]="changed";assert.throws(()=>preserveInstallation(before,after,pre,changed));
  assert.throws(()=>preserveInstallation(before,{...after,config:[{id:1,enabled:true}]},pre,post));
});

async function fakeRun(options:{badLock?:boolean;badRole?:boolean;faultFailure?:boolean;drift?:boolean;lostOwner?:boolean;recoverFrom?:string}={}){
  const directory=options.recoverFrom??mkdtempSync(resolve(base,"offline-operator-")),records:unknown[]=[],trace:string[]=[];
  let original:ReturnType<typeof seed>,current:ReturnType<typeof seed>,committed=false;
  const clients:Record<string,{label:string;pid:number;closed:boolean;healthy:boolean;exitCode:number|null;err:string;history:unknown[];command:(_n:string,_s:string)=>Promise<unknown>;close:()=>Promise<void>} >={};
  const openClient=(label:string)=>{
    const client={label,pid:{O:91,M:92,B:93,C:94}[label]!,closed:false,healthy:true,exitCode:null as number|null,err:"",history:[] as unknown[],
      async close(){this.closed=true;this.exitCode=0;},
      async command(name:string,sql:string){
        trace.push(name);let text="OK";
        if(name==="recovery-helpers"){
          const retained=JSON.parse(readFileSync(resolve(directory,"runtime-owner.json"),"utf8"));original=seed(retained.owner);current=completed(original);
        }
        if(name==="original-baseline")text='N2_BASELINE|'+JSON.stringify({meta:{fenced:false},data:{}})+'\nN2_RESTORE|'+JSON.stringify("UPDATE public.trusted_study_config SET enabled=false,updated_at='2026-10-17 00:00:00+00'::timestamptz WHERE id=1;");
        if(name==="setup"){const owner=/pg_temp\.new_session\('wrong_answers',2,'([^']+)'\)/.exec(sql)![1];original=seed(owner);current=structuredClone(original);}
        if(name==="setup-commit")committed=true;
        if(name==="lock-evidence")text='O_LOCK|'+JSON.stringify({pids:[92,93,94],blocked:!options.badLock,advisory:!options.badLock});
        if(["complete","identical-completion"].includes(name)){const c=completed(original);text=JSON.stringify(c.data["public.study_sessions"][0].completion_receipt);if(name==="complete")current=c;}
        if(name==="seed"||name==="completed-state"||name==="after-failed-commit"||name==="cleanup-manifest"){
          if(options.lostOwner&&name==="completed-state"){client.healthy=false;throw Error("OWNER_LOST");}
          if(options.drift&&name==="cleanup-manifest")current.data["public.user_progress"][0].total_xp=999;
          text='O_INVENTORY|'+JSON.stringify(current);
        }
        if(name==="drain")text='O_DRAIN|[]';
        const frame={name,text,stderr:"",connection:{pid:client.pid,current_user:(["complete","identical-completion"].includes(name)&&!options.badRole)?"service_role":"postgres",
          session_user:"postgres",isolation:"read committed",read_only:"off"}};client.history.push(frame);return frame;
      }};
    clients[label]=client;return client;
  };
  let failure:unknown;
  try{await concurrent({connection:{needles:[]},env:{},directory,records,openClient,lockDeadlineMs:0,
    recover:!!options.recoverFrom,fixtureSource:read("supabase/tests/atomic_study_completion_fixture.sql"),fault:(sql:string)=>{
      trace.push("actual-commit-probe-source");assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);assert.match(sql,/O_PRECOMMIT_COMPLETION_RETURNED\nCOMMIT;/);
      if(options.faultFailure)throw Error("COMMIT_PROBE_FAILED");
    }});}catch(error){failure=error;}
  return {directory,records,trace,failure,committed,clients};
}
test("controller mock: original exports precede setup COMMIT; concurrent receipt, fault probe, disable/drain/guard/delete/restore ordered",async()=>{
  const result=await fakeRun();assert.ifError(result.failure);assert.equal(result.committed,true);
  assert.ok(result.trace.indexOf("lock-evidence")<result.trace.indexOf("completion-commit"));
  for(const [a,b] of [["disable","drain"],["drain","cleanup-locks"],["cleanup-locks","cleanup-manifest"],["cleanup-manifest","cleanup"],["cleanup","restore"]])assert.ok(result.trace.indexOf(a)<result.trace.indexOf(b));
  assert.ok(Object.values(result.clients).every(c=>c.closed));
  const pre=JSON.parse(readFileSync(resolve(result.directory,"runtime-precommit.json"),"utf8"));assert.equal(Object.keys(pre.hashes).length,4);
});
test("controller mocks: missing engine lock, wrong role or fault-probe failure still restore, never manufacture runtime PASS",async()=>{
  for(const options of [{badLock:true},{badRole:true},{faultFailure:true}]){
    const result=await fakeRun(options);assert.ok(result.failure);assert.ok(result.trace.includes("restore"));assert.ok(Object.values(result.clients).every(c=>c.closed));
  }
});
test("controller mock: unexpected rows stop before deletion; lost owner attempts only owned-monitor disable; exports retained",async()=>{
  const drift=await fakeRun({drift:true});assert.ok(drift.failure);assert.ok(!drift.trace.includes("cleanup"));
  const lost=await fakeRun({lostOwner:true});assert.ok(lost.failure);assert.ok(lost.trace.includes("emergency-disable"));assert.ok(!lost.trace.includes("cleanup"));
  assert.ok(Object.values(lost.clients).every(c=>c.closed));assert.ok(readFileSync(resolve(lost.directory,"runtime-seed.json")).length>0);
});
test("recovery mock imports retained baseline/seed, never creates fixtures or repeats tests",async()=>{
  const failed=await fakeRun({lostOwner:true});assert.ok(failed.failure);
  const before=readFileSync(resolve(failed.directory,"runtime-baseline.json"));
  const restored=await fakeRun({recoverFrom:failed.directory});assert.ifError(restored.failure);
  assert.ok(restored.trace.includes("original-baseline-import")&&restored.trace.includes("restore"));
  assert.ok(!restored.trace.includes("setup")&&!restored.trace.includes("complete")&&!restored.trace.includes("actual-commit-probe-source"));
  assert.deepEqual(readFileSync(resolve(failed.directory,"runtime-baseline.json")),before);
});
