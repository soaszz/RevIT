import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findArchivedArtifacts } from '../docs/phase3n/phase3n-n/archive-recovered-artifacts.mjs';
import { loadRecoveryArtifacts, assertRecoverySnapshot, assertRecoveryQuiescence, recoverySql, recover } from '../docs/phase3n/phase3n-n/recover-committed-setup.mjs';
import { loadSources, compilePack, assertWorkersDrained } from '../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';

const root=process.cwd();
const artifactDirectory=existsSync(join(root,'scratch/phase3n-n2-evidence/archives'))?findArchivedArtifacts(root):undefined;
const original=loadRecoveryArtifacts(root,readFileSync,artifactDirectory),sources=loadSources(root);
const clone=x=>structuredClone(x);
const tag=(n,x)=>n+'|'+JSON.stringify(x)+'\n';
const current=()=>{const x=clone(original.seed);x.data['public.trusted_study_config'][0].enabled=false;return x;};
test('exact captured hashes, acknowledgement, original exports and source provenance verify',()=>{
 assert.equal(original.run.setup.commitAcknowledged,true);assert.equal(Object.keys(original.baseline.dependency_counts).length,28);
 assert.equal(original.seed.data['public.question_attempts'].length,2);assert.equal(original.seed.data['public.study_sessions'].length,4);
});
for(const file of ['baseline.json','seed.json','restore-body.sql','precommit-record.json','setup-commit-ack.json',original.run ? 'scenarios-6-12-2026-10-17T03-22-20-709Z-6d2d9276-205e-4689-b7e4-596b482cc719.json':''])test('changed retained artifact fails before connection: '+file,()=>{
 assert.throws(()=>loadRecoveryArtifacts(root,path=>{const b=readFileSync(path);return String(path).endsWith(file)?Buffer.concat([b,Buffer.from(' ')]):b;},artifactDirectory));
});
test('captured original A/D PIDs now idle Supavisor reproduce safe drain',()=>{
 const m=original.run.clients.find(c=>c.label==='M');const f=m.frames.filter(f=>f.name==='inventory').at(-1);
 const activity=JSON.parse(f.text.split('\n').find(l=>l.startsWith('N2_MONITOR_0|')).split('|').slice(1).join('|'));
 const workers=original.run.clients.filter(c=>['A','B','C','D'].includes(c.label)).map(c=>({label:c.label,pid:c.backendPid,closed:c.closed}));
 assert.deepEqual(activity.filter(a=>[162256,162651].includes(a.pid)).map(a=>[a.pid,a.application_name,a.state,a.xact_start,a.blockers]),[[162256,'Supavisor','idle',null,[]],[162651,'Supavisor','idle',null,[]]]);
 assertWorkersDrained({activity,locks:[],edges:[]},workers);
});
for(const drift of ['config','metadata','auth','history','session','descendant','attempt'])test('fresh run-state reconciliation rejects '+drift,()=>{
 const x=current();
 if(drift==='config')x.data['public.trusted_study_config'][0].enabled=true;
 if(drift==='metadata')x.meta.memberships=[];
 if(drift==='auth')x.data['auth.users'][0].full_row_md5='changed';
 if(drift==='history')x.data['public.question_attempts'][0].attempt_number=99;
 if(drift==='session')x.data['public.study_sessions'][0].completed_at='changed';
 if(drift==='descendant')x.dependency_counts['auth.refresh_tokens']=1;
 if(drift==='attempt')x.data['public.question_attempts'].push({id:'unknown'});
 assert.throws(()=>assertRecoverySnapshot(x,original));
});
test('disabled metadata timestamp may change; every other seed field must match',()=>assertRecoverySnapshot(current(),original));
test('recovery compiles only helpers/imports and locked exact-run cleanup; never setup or RPC',()=>{
 const s=recoverySql(compilePack(sources.pack),original);
 assert.match(s.cleanup,/SHARE ROW EXCLUSIVE/);assert.match(s.cleanup,/exact committed-run rows before first DELETE/);
 assert.ok(s.cleanup.indexOf('exact committed-run rows before first DELETE')<s.cleanup.indexOf('DELETE FROM public.question_attempts'));
 assert.match(s.cleanup,/full baseline restored/);assert.match(s.cleanup,/no prepared transactions/);
 assert.doesNotMatch(s.cleanup,/SET enabled=true|^TRUNCATE\b|commit_verified_study_batch\(/m);
 assert.doesNotMatch(s.definitions,/all accepted dependent tables empty|CREATE TEMP TABLE n2_baseline/);
 assert.doesNotMatch(s.cleanup,/\\i |\\copy /);assert.equal(s.cleanup.match(/^COMMIT;/gm).length,1);
});
for(const state of ['active','transaction','test-label','lock'])test('recovery quiescence rejects '+state,()=>{
 const a={pid:162256,application_name:'Supavisor',usename:'postgres',state:'idle',xact_start:null,blockers:[]};
 const data={activity:[a],locks:[]};
 if(state==='active')a.state='active';if(state==='transaction')a.xact_start='open';
 if(state==='test-label')a.application_name='revit-n2-A';if(state==='lock')data.locks.push({pid:a.pid});
 assert.throws(()=>assertRecoveryQuiescence(data,[999],original.run));
});

function fixture(fault='') {
 const events=[],clients=[];let saved,opens=0;
 const expected=['aws-0-ap-southeast-2.pooler.supabase.com','5432','postgres.qnepjfcbzsycmesrcbjb','postgres'];
 const open=async label=>{
  const c={label,pid:80000+(++opens),closed:false,healthy:true,exitCode:0,history:[],async close(){this.closed=true;},async command(name,sql){
   events.push(name);this.history.push({name,sql});
   if(fault===name)throw Object.assign(Error('fixture secret'),{stopCode:'MOCK_FAILURE'});
   let text='';
   if(name==='identity')text=tag('RECOVERY_IDENTITY',{database:'postgres',version:170006,user:'postgres',session_user:'postgres',read_only:'on',isolation:'read committed',pid:c.pid,prepared:fault==='prepared'?1:0,config:[{id:1,enabled:fault==='enabled'}],registry:original.baseline.meta.registry})+'ROLLBACK\n';
   if(name==='quiescence')text=tag('RECOVERY_ACTIVITY',fault==='outside-writer'?[{pid:99999,state:'active',xact_start:'open',application_name:'app',blockers:[]}]:[])+tag('RECOVERY_LOCKS',[])+'ROLLBACK\n';
   if(name==='current-run-snapshot'){const x=current();if(fault==='manifest')x.data['public.profiles']=[];text=tag('RECOVERY_SNAPSHOT',x)+'ROLLBACK\n';}
   if(name==='locked-exact-artifact-restoration')text=fault==='lost-ack'?'':'COMMIT\n';
   if(name==='independent-baseline-comparison')text=fault==='final-marker'?'ROLLBACK\n':'RECOVERY_BASELINE_MATCH\nROLLBACK\n';
   if(name==='final-catalog')text=fault==='catalog-drift'?sources.catalogReference.replace('trusted_cutover_and_attempt_numbering','drift'):sources.catalogReference;
   if(name==='final-coverage')text=JSON.stringify(fault==='coverage-drift'?{event_settings:[]}:sources.coverageReference)+'\nROLLBACK\nCOVERAGE_READ_ONLY_ROLLBACK_COMPLETE\n';
   return {text,stderr:''};
  }};clients.push(c);return c;
 };
 return {events,clients,get saved(){return saved;},options:{env:fault==='missing-uri'?{}:{REVIT_STAGING_DB_URL:`postgresql://${expected[2]}:private-fixture@${expected[0]}:5432/postgres`},expected,load:()=>({sources,original}),open,
  confirm:async()=>fault!=='decline',verify:()=>{if(fault==='source-drift')throw Object.assign(Error(),{stopCode:'SOURCE_DRIFT'});},save:e=>{saved=e;}}};
}
test('mock recovery commits cleanup then independently compares original baseline/Catalog/coverage',async()=>{
 const f=fixture(),r=await recover(f.options);assert.equal(r.result,'STAGING RESTORATION INDEPENDENTLY VERIFIED');assert.equal(r.cleanupCommitAcknowledged,true);
 assert.ok(f.events.indexOf('independent-baseline-comparison')>f.events.indexOf('locked-exact-artifact-restoration'));
 assert.ok(f.clients.every(c=>c.closed));assert.equal(f.clients.length,5);
 assert.ok(!f.events.some(n=>/scenario|s6-|forward|reverse|setup-commit/.test(n)));
});
for(const fault of ['missing-uri','source-drift','identity','prepared','enabled','outside-writer','decline','manifest','locked-exact-artifact-restoration','lost-ack','independent-baseline-comparison','final-marker','catalog-drift','coverage-drift'])test('mock recovery stops and never manufactures restoration: '+fault,async()=>{
 const f=fixture(fault),r=await recover(f.options);assert.match(r.result,/^NO-GO — RESTORATION UNRESOLVED/);assert.ok(f.clients.every(c=>c.closed));
 if(['missing-uri','source-drift','identity','prepared','enabled','outside-writer','decline','manifest'].includes(fault))assert.equal(f.events.includes('locked-exact-artifact-restoration'),false);
 if(['independent-baseline-comparison','final-marker','catalog-drift','coverage-drift'].includes(fault))assert.equal(r.cleanupCommitAcknowledged,true);
 if(fault==='lost-ack'){assert.equal(r.cleanupSent,true);assert.equal(r.cleanupCommitAcknowledged,false);}
 assert.equal(f.saved.result,r.result);
});

test('cancelled recovery closes owned clients and sends no cleanup',async()=>{
 const f=fixture(),abort=new AbortController();abort.abort();f.options.signal=abort.signal;
 const r=await recover(f.options);assert.match(r.result,/INTERRUPTED/);assert.equal(r.cleanupSent,false);assert.ok(f.clients.every(c=>c.closed));
});
