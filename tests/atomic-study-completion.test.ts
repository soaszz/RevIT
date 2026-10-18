import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { resolve } from "node:path";
import { snapshot, validateSnapshot, validateSuite, verifyPins, rollbackProbe, signatures } from "../scripts/phase3o/staging-validation.mjs";

const root=resolve(import.meta.dirname,"..");
const read=(file:string)=>readFileSync(resolve(root,file),"utf8");
const sql=read("supabase/migrations/202610170028_atomic_study_completion.sql");
const definitions=[...sql.matchAll(/create function public\.([a-z_]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gi)];

test("Migration 27 remains byte-identical; additive Migration 28 leaves activation and legacy writers alone",()=>{
  assert.equal(createHash("sha256").update(readFileSync(resolve(root,"supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql"))).digest("hex"),"aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589");
  assert.equal(definitions.length,5);
  assert.doesNotMatch(sql,/update public\.trusted_study_config|revoke.*record_study_activity|create or replace|drop (?:table|column)|delete from public\.question_attempts/i);
  assert.match(sql,/completion_contract smallint check \(completion_contract = 1\)/);
  assert.match(sql,/s\.completion_contract is distinct from 1/);
  assert.match(sql,/public\.commit_verified_study_batch\(p_owner,p_session_id,p_attempts\)/);
});

test("each new routine fixes search_path and denies browser execution; internal effects stay private",()=>{
  for(const [,name] of definitions){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+from public,anon,authenticated`));
    if(name.startsWith("_")) assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^;]+authenticated,service_role`));
  }
  assert.equal((sql.match(/security definer/g)??[]).length,5);
  assert.equal((sql.match(/set search_path = pg_catalog, public, pg_temp/g)??[]).length,5);
  assert.match(sql,/set timezone = 'UTC'/);
  assert.match(sql,/actual_ids is distinct from p_attempt_ids/);
  assert.match(sql,/s\.completion_receipt->>'fingerprint' is distinct from fingerprint/);
});

test("transaction sources have one explicit outer rollback and no embedded commit or nontransactional operation",()=>{
  const suite=read("supabase/tests/atomic_study_completion_verification.sql").replace("\\ir atomic_study_completion_fixture.sql",read("supabase/tests/atomic_study_completion_fixture.sql"));
  assert.match(suite,/\\set ON_ERROR_STOP on/); assert.match(suite,/begin read write;/);
  assert.equal((suite.match(/^rollback;/gim)??[]).length,1);
  assert.doesNotMatch(suite,/^\s*commit\s*;|vacuum|concurrently|\\!|dblink|pg_terminate_backend/im);
  assert.match(suite,/snapshot = pg_temp\.state\(\)/);
  assert.match(suite,/before-rewards-rolls-back-attempts/); assert.match(suite,/during-XP-rolls-back-all-effects/);
  assert.match(suite,/receipt-write-rolls-back-completion-reward/);
  const rollback=read("supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql");
  assert.doesNotMatch(rollback,/delete from|drop column|drop table|grant execute/i);
});

function validSnapshot(){
  return {database:"postgres",current_user:"postgres",session_user:"postgres",read_only:"on",isolation:"read committed",prepared:0,
    config:[{id:1,enabled:false}],registry:[{version:"202610160027",name:"trusted_cutover_and_attempt_numbering"},{version:"202610170028",name:"atomic_study_completion"}],
    routines:definitions.map(([,name,body])=>({name,signature:signatures[name as keyof typeof signatures],owner:"postgres",definer:true,leakproof:false,kind:"f",volatility:name==="_trusted_study_metrics"?"s":"v",parallel:"u",
      settings:["search_path=pg_catalog, public, pg_temp",...(name==="complete_verified_study_session"?["TimeZone=UTC"]:[])],source:body,anon:false,authenticated:false,service:!name.startsWith("_")}))};
}
test("staging preflight accepts source-derived contract, rejects changed source/owner/grants/role/registry/config/prepared",()=>{
  validateSnapshot(validSnapshot(),sql);
  for(const alter of [
    (v:ReturnType<typeof validSnapshot>)=>{v.config[0].enabled=true;},
    (v:ReturnType<typeof validSnapshot>)=>{v.prepared=1;},
    (v:ReturnType<typeof validSnapshot>)=>{v.registry.push({...v.registry[1]});},
    (v:ReturnType<typeof validSnapshot>)=>{v.registry[1].name="wrong";},
    (v:ReturnType<typeof validSnapshot>)=>{v.current_user="authenticated";},
    (v:ReturnType<typeof validSnapshot>)=>{v.read_only="off";},
    (v:ReturnType<typeof validSnapshot>)=>{v.routines[0].owner="service_role";},
    (v:ReturnType<typeof validSnapshot>)=>{v.routines[0].source+="SELECT 1;";},
    (v:ReturnType<typeof validSnapshot>)=>{v.routines[0].service=true;},
    (v:ReturnType<typeof validSnapshot>)=>{v.routines[0].authenticated=true;},
    (v:ReturnType<typeof validSnapshot>)=>{v.routines[0].signature="_trusted_study_metrics(text)";},
  ]) {const v=validSnapshot();alter(v);assert.throws(()=>validateSnapshot(v,sql));}
});
test("capture parser requires actual rollback/marker and one snapshot, not exit-code-only success",()=>{
  const value=validSnapshot(); const text=JSON.stringify(value)+"\nROLLBACK\nO_SNAPSHOT_ROLLBACK_COMPLETE\n";
  assert.deepEqual(snapshot(text),value);
  for(const bad of [text.replace("ROLLBACK\n",""),text+JSON.stringify(value)+"\n",text+"ERROR: failed"] ) assert.throws(()=>snapshot(bad));
  const result={status:0,stdout:"service_role|postgres|read committed\nROLLBACK\nO_ATOMIC_VERIFICATION_ROLLBACK_COMPLETE\n",stderr:"O_PASS test\n".repeat(50)};
  validateSuite(result);
  for(const bad of [{...result,status:3},{...result,stdout:""},{...result,stderr:""},{...result,stderr:result.stderr+"ERROR: nope"}]) assert.throws(()=>validateSuite(bad));
});
test("source pin verification rejects drift, without regenerating expected values",()=>{
  const expected=createHash("sha256").update("reviewed").digest("hex");
  verifyPins({"example.sql":expected},()=>Buffer.from("reviewed"));
  assert.throws(()=>verifyPins({"example.sql":expected},()=>Buffer.from("changed")));
});
test("rollback probe preserves a single rollback transaction, refuses altered outer boundaries",()=>{
  const rollback=read("supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql");
  const probe=rollbackProbe(rollback);
  assert.equal((probe.match(/^BEGIN;/gm)??[]).length,1);
  assert.equal((probe.match(/^ROLLBACK;/gm)??[]).length,1);
  assert.doesNotMatch(probe,/^commit;/im);
  assert.match(probe,/O_ROLLBACK_PROBE_COMPLETE/);
  assert.throws(()=>rollbackProbe(rollback.replace(/^commit;/im,"")));
});
