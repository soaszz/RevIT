import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, unlinkSync, rmdirSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  loadSources, compilePack, compareCatalog, parseCatalog,
  runScenarios, writeEnvironment, validateRestoreBody, evidenceStore, PsqlSession,
} from '../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';
import * as executor from '../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';

const drainedClients = () => ['A','B','C','D'].map((label,i)=>({label,pid:162256+i,closed:true}));
const pooledInventory = () => ({activity:[162256,162259].map(pid=>({pid,application_name:'Supavisor',usename:'postgres',state:'idle',xact_start:null,blockers:[]})),locks:[],edges:[]});
test('closed workers with retained idle Supavisor backends may drain',()=>{
 assert.equal(executor.assertWorkersDrained(pooledInventory(),drainedClients()),true);
});
for(const fault of ['test-label','open-transaction','active','blocker','blocked-by','lock','edge','not-closed','unknown-label','missing-state'])test('drain remains fail-closed: '+fault,()=>{
 const data=pooledInventory(),clients=drainedClients(),row=data.activity[0];
 if(fault==='test-label')row.application_name='revit-n2-A';
 if(fault==='open-transaction')row.xact_start='2026-10-17T03:30:00Z';
 if(fault==='active')row.state='active';
 if(fault==='blocker')row.blockers=[999];
 if(fault==='blocked-by')data.activity.push({pid:999,blockers:[row.pid]});
 if(fault==='lock')data.locks.push({pid:row.pid,granted:true});
 if(fault==='edge')data.edges.push({blocker_pid:row.pid,waiter_pid:999});
 if(fault==='not-closed')clients[0].closed=false;
 if(fault==='unknown-label')row.application_name='other-client';
 if(fault==='missing-state')delete row.xact_start;
 assert.throws(()=>executor.assertWorkersDrained(data,clients),/OWNED_WORKERS_NOT_DRAINED/);
});

const root = process.cwd();
const sources = () => loadSources(root);
const ids = { O: 50101, A: 50102, B: 50103, C: 50104, D: 50105, M: 50106 };
const connection = { host: 'fixture.pooler.supabase.com', user: 'postgres.qnepjfcbzsycmesrcbjb', password: 'private-fixture-secret', sslmode: 'require', needles: ['private-fixture-secret'] };
const expected = [connection.host, '5432', connection.user, 'postgres'];
const uri = `postgresql://${connection.user}:private-fixture-secret@${connection.host}:5432/postgres`;
const tagged = (name, value) => `${name}|${JSON.stringify(value)}\n`;

function fixture(fault = '') {
  const loaded = sources();
  const state = { enabled: false, setup: false, attempts: [], restored: false, clients: [], writes: 0, confirmed: false, pending: {}, events: [], artifacts: new Map(), failed: false };
  const scope = ['O','A','B','C','D','M'];
  const failAt = name => {
    if (!state.failed && name === fault) { state.failed = true; throw Object.assign(new Error('fixture error private-fixture-secret'), { stopCode: fault }); }
  };
  const activity = () => scope.filter(l => !state.clients.find(c => c.label === l)?.closed).map(l => ({ pid:ids[l],application_name:`revit-n2-${l}`,usename:'postgres',state:l==='M'?'active':state.pending[l]?'active':'idle',xact_start:state.pending[l]?'fixture-xact':null,blockers:[],datname:'postgres',backend_type:'client backend' })).concat(
   fault==='retained-pool'?['A','D'].filter(l=>state.clients.find(c=>c.label===l)?.closed).map(l=>({pid:ids[l],application_name:'Supavisor',usename:'postgres',state:'idle',xact_start:null,blockers:[]})):[]);
  function monitor() {
    const rows=activity(), locks=[], edges=[];
    const edge=(w,b,key) => { const a=rows.find(x=>x.pid===ids[w]); a.blockers=[ids[b]]; a.xact_start='fixture-xact';
      edges.push({waiter:`revit-n2-${w}`,waiter_pid:ids[w],blocker:`revit-n2-${b}`,blocker_pid:ids[b]});
      if(key) for(const [l,granted] of [[w,false],[b,true]]) locks.push({pid:ids[l],application_name:`revit-n2-${l}`,locktype:'advisory',mode:'ExclusiveLock',granted,database:5,classid:10,objid:key,objsubid:1});
      else { locks.push({pid:ids[w],locktype:'transactionid',transactionid:'123',mode:'ShareLock',granted:false},{pid:ids[b],locktype:'transactionid',transactionid:'123',mode:'ExclusiveLock',granted:true});
        for(const l of [w,b])locks.push({pid:ids[l],locktype:'relation',relation:99,granted:true}); }
    };
    if(state.pending.B && state.pending.A)edge('B','A',state.pending.A==='s6'?20:30);
    if(state.pending.C)edge('C','B',10);
    if(state.pending.D && state.pending.B)edge('D','B');
    if(state.pending.B==='reverse')edge('B','D');
    if(fault==='lock-identity')for(const l of locks)if(l.granted)l.database=999;
    if(fault==='unexpected-ingress')rows.push({pid:99999,application_name:'unrelated',xact_start:'open transaction',usename:'postgres'});
    return {activity:rows,locks,edges,keys:[{k:'3e9a0000-3a2e-4e60-8000-000000000001:trusted-study',expected_classid:10,expected_objid:10},{k:'3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-s6',expected_classid:10,expected_objid:20},{k:'3e9a0000-3a2e-4e60-8000-000000000001:phase3n-n2-20261016-forward',expected_classid:10,expected_objid:30}],configRelation:99};
  }
  const release = l => { const fn=state.pending[l+'Resolve']; if(fn){delete state.pending[l+'Resolve'];fn();} };
  function session(label) {
    const c={label,pid:ids[label]??50107,closed:false,healthy:true,exitCode:0,history:[],async close(){this.closed=true;release(label);delete state.pending[label];if(label==='O'&&!state.setup)state.enabled=false;},async command(name,sql){
      this.history.push({name,sql}); state.events.push(name); failAt(name);
      if(name==='s6-B-call'&&['worker-timeout','worker-disconnect'].includes(fault))throw Object.assign(Error('fixture failure'),{stopCode:fault==='worker-timeout'?'CHILD_TIMEOUT':'CHILD_DISCONNECT'});
      if(name==='s6-assertions'&&fault==='owner-lost'){this.healthy=false;this.closed=true;throw Object.assign(Error('owner disconnected'),{stopCode:'OWNER_LOST'});}
      if(name==='pre-catalog'||name==='final-catalog')return {text:fault===name+'-mismatch'?loaded.catalogReference.replaceAll('trusted_cutover_and_attempt_numbering','drift'):loaded.catalogReference};
      if(name==='pre-coverage'||name==='final-coverage')return {text:JSON.stringify(fault===name+'-mismatch'?{drift:true}:loaded.coverageReference)+'\nROLLBACK\nCOVERAGE_READ_ONLY_ROLLBACK_COMPLETE\n'};
      if(name==='baseline')return {text:tagged('N2_BASELINE',{data:{'public.trusted_study_config':[{id:1,enabled:false}]},meta:{fixture:true},dependency_counts:{fixture:0}})+tagged('N2_RESTORE',"GRANT EXECUTE ON FUNCTION public.record_question_attempt(uuid,text,text,text,text,text,text,text,text,integer,boolean,integer,text,timestamp with time zone,text) TO authenticated;\nUPDATE public.trusted_study_config SET enabled=false,updated_at='2026-10-16 06:16:39.2326+00'::timestamptz WHERE id=1;")};
      if(name==='setup-prepare'){ state.writes++; state.enabled=true; return {text:tagged('N2_SEED',{data:{fixture:true},meta:{fixture:true}})}; }
      if(name==='setup-commit'){state.setup=true;state.attempts=[1,7];return {text:fault==='lost-ack'?'COMMIT\n':'COMMIT\nN2_SETUP_COMMIT_ACKNOWLEDGED\n'};}
      if(name==='abort-setup-resolution'){if(!state.setup)state.enabled=false;return {text:tagged('N2_BASELINE_MATCH',!state.setup)};}
      if(name==='reconcile-setup')return {text:tagged('N2_COMMITTED_SETUP',state.setup)};
      if(name==='s6-block'){state.pending.A='s6';return {text:''};}
      if(name==='forward-block'){state.pending.A='forward';return {text:''};}
      if(name==='s6-B-call'||name==='s6-C-call'||name==='forward-call'||name==='reverse-call'){
        state.pending[label]=name==='reverse-call'?'reverse':name;
        return new Promise(resolve=>{state.pending[label+'Resolve']=()=>resolve({text:name==='reverse-call'?'NOTICE: observed_sqlstate=PT503 expected=PT503\n':`service_role|postgres|${ids[label]}|read committed\n`+tagged('N2_RPC',{attempt_number:name==='s6-B-call'?8:name==='s6-C-call'?9:1})});});
      }
      if(name==='release-A'){delete state.pending.A;release('B');return {text:'COMMIT\n'};}
      if(name==='commit-B'){state.attempts.push(8);delete state.pending.B;release('C');return {text:'COMMIT\n'};}
      if(name==='commit-C'){state.attempts.push(9);delete state.pending.C;return {text:'COMMIT\n'};}
      if(name==='forward-disable'){state.pending.D='disable';return new Promise(resolve=>{state.pending.DResolve=()=>resolve({text:'1|f\n'});});}
      if(name==='forward-commit'){state.attempts.push(1);delete state.pending.B;release('D');return {text:'COMMIT\n'};}
      if(name==='forward-disable-commit'){state.enabled=false;delete state.pending.D;return {text:'COMMIT\n'};}
      if(name==='fresh-disabled')return {text:'NOTICE: observed_sqlstate=PT503 expected=PT503\n'};
      if(name==='enable-reverse'){state.enabled=true;return {text:'COMMIT\n'};}
      if(name==='reverse-disable'){state.pending.D='disable';return {text:'1|f\n'};}
      if(name==='reverse-disable-commit'){state.enabled=false;delete state.pending.D;release('B');return {text:'COMMIT\n'};}
      if(name==='conflict-B'||name==='conflict-C')return {text:`NOTICE: observed_sqlstate=${fault==='sqlstate'?'PT503':'23505'} expected=23505\n`};
      if(name==='retry-B'||name==='retry-C')return {text:`service_role|postgres|${ids[label]}|read committed\n`+tagged('N2_RPC',{attempt_number:label==='B'?8:9})};
      if(name==='inventory'||name.startsWith('monitor-')){const m=monitor();return {text:tagged('N2_MONITOR_0',m.activity)+tagged('N2_MONITOR_1',m.locks)+tagged('N2_MONITOR_2',m.edges)+tagged('N2_MONITOR_3',m.keys)+'N2_CONFIG_RELATION|'+m.configRelation+'\n'};}
      if(name==='cleanup-disable'||name==='owner-lost-disable'){state.enabled=false;return {text:'COMMIT\n'};}
      if(name==='cleanup-restore'){state.attempts=[];state.setup=false;state.restored=true;return {text:'COMMIT\n'};}
      if(name==='final-snapshot')return {text:'ROLLBACK\n'};
      return {text:''};
    }};
    state.clients.push(c);return c;
  }
  const io={create(name,content){failAt('export');if(name==='seed.json')failAt('seed-export');if(name==='setup-commit-ack.json')failAt('postcommit-export');if(state.artifacts.has(name))throw Error('overwrite');state.artifacts.set(name,content);return 'hash-'+name;},verify(name){if(!state.artifacts.has(name))throw Error('missing');failAt('artifact-drift');},save(e){state.saved=e;}};
  const options={repoRoot:root,env:{REVIT_STAGING_DB_URL:uri},expected,load:()=>loaded,open:async l=>session(l),artifacts:io,confirmQuiescence:async()=>{state.confirmed=true;return fault!=='decline';},verifyFrozen:()=>failAt('source-drift'),signal:undefined,lockPause:async()=>{},lockDeadlineMs:50};
  if(fault==='missing-uri')options.env={};
  if(fault==='identity')options.expected=[...expected.slice(0,2),'postgres.wrong',expected[3]];
  return {state,options};
}

test('single-command success preserves numbering and restores empty disabled baseline',async()=>{
  const f=fixture();const result=await runScenarios(f.options);
  assert.equal(result.result,'PHASE 3N COMPLETE — SCENARIOS 6 AND 12 PASS; STAGING RESTORED');
  assert.equal(f.state.restored,true);assert.equal(f.state.enabled,false);assert.deepEqual(f.state.attempts,[]);
  assert.equal(f.state.clients.every(c=>c.closed),true);assert.equal(f.state.confirmed,true);
  assert.ok(f.state.events.indexOf('commit-B')>f.state.events.indexOf('monitor-s6-second'));
  assert.ok(f.state.events.indexOf('forward-commit')>f.state.events.indexOf('monitor-forward-second'));
  assert.ok(f.state.events.indexOf('final-catalog')>f.state.events.indexOf('cleanup-restore'));
});
test('full cleanup proceeds with successfully closed A/D and their retained idle pooler PIDs',async()=>{
 const f=fixture('retained-pool'),out=await runScenarios(f.options);
 assert.equal(out.cleanup,'RESTORATION INDEPENDENTLY VERIFIED');assert.equal(f.state.restored,true);
 assert.ok(f.state.clients.filter(c=>['A','D'].includes(c.label)).every(c=>c.closed&&c.exitCode===0));
});
test('declined quiescence records false/timestamp and creates no helper or fixture writes',async()=>{
 const f=fixture('decline');const out=await runScenarios(f.options);assert.equal(out.attestation.confirmed,false);assert.match(out.attestation.atUtc,/Z$/);assert.equal(f.state.events.some(x=>x.startsWith('helpers-')),false);assert.equal(f.state.writes,0);
});
test('cancellation before writes closes only owned sessions and never commits setup',async()=>{
 const f=fixture();const abort=new AbortController();f.options.signal=abort.signal;f.options.confirmQuiescence=async()=>{abort.abort();return true;};
 const out=await runScenarios(f.options);assert.match(out.result,/^NO-GO/);assert.equal(f.state.writes,0);assert.equal(f.state.clients.every(c=>c.closed),true);assert.equal(f.state.events.some(x=>x.startsWith('helpers-')),false);
});
for(const fault of ['missing-uri','identity','decline','pre-catalog','pre-coverage','export','source-drift'])test('pre-write failure never creates fixtures: '+fault,async()=>{
  const f=fixture(fault);const result=await runScenarios(f.options);assert.match(result.result,/^NO-GO/);assert.equal(f.state.writes,0);assert.equal(f.state.clients.every(c=>c.closed),true);
});
for(const fault of ['setup-prepare','setup-commit','monitor-s6-first','monitor-s6-second','monitor-forward-first','monitor-forward-second','monitor-reverse','sqlstate','s6-assertions','forward-state','reverse-assertions'])test('controlled failure attempts mandatory cleanup without resuming tests: '+fault,async()=>{
  const f=fixture(fault);const result=await runScenarios(f.options);assert.match(result.result,/^NO-GO/);assert.equal(f.state.clients.every(c=>c.closed),true);
  if(result.setup.commitAcknowledged)assert.ok(f.state.events.includes('cleanup-disable'));
  if(fault==='setup-commit'){assert.ok(f.state.events.includes('abort-setup-resolution'));assert.equal(f.state.events.includes('cleanup-disable'),false);assert.equal(f.state.setup,false);assert.equal(f.state.enabled,false);}
});
for(const fault of ['cleanup-disable','cleanup-restore','final-snapshot','final-catalog','final-coverage'])test('restoration failure never produces success: '+fault,async()=>{
  const f=fixture(fault);const result=await runScenarios(f.options);assert.match(result.result,/^NO-GO/);assert.equal(f.state.clients.every(c=>c.closed),true);
});
for(const fault of ['pre-catalog-mismatch','pre-coverage-mismatch','final-catalog-mismatch','final-coverage-mismatch'])test('actual captured catalog mismatch fails without rewriting expectations: '+fault,async()=>{
 const f=fixture(fault);const out=await runScenarios(f.options);assert.match(out.result,/^NO-GO/);if(fault.startsWith('pre-'))assert.equal(f.state.writes,0);
});
for(const fault of ['worker-timeout','worker-disconnect','lock-identity'])test('failed worker/engine evidence aborts and restores: '+fault,async()=>{
 const f=fixture(fault);const out=await runScenarios(f.options);assert.match(out.result,/^NO-GO/);assert.equal(f.state.enabled,false);assert.equal(f.state.restored,true);assert.ok(!f.state.events.includes('forward-block'));
});
test('unrelated transaction blocks setup; controller never closes unknown clients',async()=>{
 const f=fixture('unexpected-ingress');const out=await runScenarios(f.options);assert.match(out.result,/UNRELATED_OPEN_TRANSACTION/);assert.equal(f.state.writes,0);assert.ok(!f.state.clients.some(c=>c.pid===99999));
});
test('seed fsync/export failure cannot progress into setup COMMIT',async()=>{
 const f=fixture('seed-export');const out=await runScenarios(f.options);assert.match(out.result,/^NO-GO/);assert.equal(f.state.events.includes('setup-commit'),false);assert.equal(f.state.setup,false);
 assert.equal(f.state.enabled,false);
});
test('failure after actual setup commit still performs mandatory restoration',async()=>{
 const f=fixture('postcommit-export');const out=await runScenarios(f.options);assert.match(out.result,/^NO-GO/);assert.equal(out.setup.commitAcknowledged,true);assert.equal(f.state.restored,true);assert.equal(f.state.enabled,false);
});
test('lost COMMIT acknowledgement reconciles once and restores without repeating setup',async()=>{
 const f=fixture('lost-ack');const out=await runScenarios(f.options);assert.match(out.result,/SETUP_COMMIT_ACK_MISSING/);assert.equal(f.state.restored,true);assert.equal(out.setup.reconciledCommitted,true);assert.equal(f.state.events.filter(x=>x==='setup-commit').length,1);assert.equal(f.state.events.includes('s6-block'),false);
});
test('lost coordinator uses existing D only to disable, retains exports and refuses automatic recovery',async()=>{
 const f=fixture('owner-lost');const out=await runScenarios(f.options);assert.match(out.result,/OWNER_CONNECTION_LOST_RESTORATION_UNRESOLVED/);assert.equal(f.state.enabled,false);assert.equal(f.state.restored,false);assert.ok(f.state.artifacts.has('baseline.json'));assert.ok(f.state.events.includes('owner-lost-disable'));
});
test('source compilation retains exact reviewed guards and manifest-only cleanup',()=>{
 const s=sources(), p=compilePack(s.pack);
 assert.equal(p.blocks.length,22);assert.match(p.cleanup,/SHARE ROW EXCLUSIVE/);assert.doesNotMatch(p.cleanup,/\bTRUNCATE\s+(?:TABLE\s+)?public/i);
 assert.match(p.init('B'),/SET application_name = 'revit-n2-B'/);assert.match(p.cleanup,/all children empty before parent/);
 assert.match(p.monitorSql,/OR \(a.application_name='Supavisor' AND a.usename='postgres'\)/);
 assert.match(p.setupPrepare,/no untracked trigger-created children/);assert.doesNotMatch(p.setupPrepare,/^COMMIT;/m);
});
test('Catalog equality uses all 17 sections and memberships; activity/PIDs are not compared',()=>{
 const s=sources();const parsed=parseCatalog(s.catalogReference);assert.equal(parsed.sections.length,17);
 compareCatalog(s.catalogReference,s.catalogReference);
 assert.throws(()=>compareCatalog(s.catalogReference.replace('trusted_cutover_and_attempt_numbering','wrong'),s.catalogReference));
});
test('write clients never force read-only off; M remains read-only; no credentials in argv',()=>{
 const env=writeEnvironment({REVIT_STAGING_DB_URL:uri,PGHOST:'bad',NODE_OPTIONS:'bad'},connection,'B');
 assert.equal(env.REVIT_STAGING_DB_URL,undefined);assert.equal(env.NODE_OPTIONS,undefined);assert.equal(env.PGHOST,connection.host);
 assert.doesNotMatch(env.PGOPTIONS,/default_transaction_read_only=off/);assert.match(writeEnvironment({},connection,'M').PGOPTIONS,/read_only=on/);
});
test('restoration SQL rejects mutation, unsupported object, COPY escapes and transaction control',()=>{
 for(const sql of ['COMMIT;','TRUNCATE public.question_attempts;','GRANT ALL ON TABLE public.other TO anon;','UPDATE public.trusted_study_config SET enabled=true;','\\n'])assert.throws(()=>validateRestoreBody(sql));
});
test('durable create-new exports reject overwrite and changed bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'revit-scenario-local-'));try{
 const store=evidenceStore(dir,connection.needles,{testDirectory:true});store.create('baseline.json','{"x":1}\n');assert.ok(existsSync(join(dir,'baseline.json')));
 assert.throws(()=>store.create('baseline.json','{"x":2}\n'));store.verify('baseline.json');
 appendFileSync(join(dir,'baseline.json'),'changed');assert.throws(()=>store.verify('baseline.json'));
 assert.throws(()=>store.create('secret.json','private-fixture-secret'));
 store.save({stdout:'password=private-fixture-secret postgresql://user:private-fixture-secret@fixture.invalid/db'});
 assert.doesNotMatch(readFileSync(store.path,'utf8'),/private-fixture-secret|postgresql:\/\//);
 }finally{for(const name of readdirSync(dir))unlinkSync(join(dir,name));rmdirSync(dir);}
});

function fakeChild(fault='') {
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();
 child.stdout.setEncoding=child.stderr.setEncoding=()=>{};
 let calls=0;const close=code=>child.emit('close',code);child.kill=()=>{close(null);return true;};child.stdin.destroy=()=>{};child.stdin.end=()=>close(0);
 child.stdin.write=sql=>{
  calls++;const id=/\\echo (N2_[a-f0-9]+)_END/.exec(sql)?.[1];
  if(fault==='timeout')return true;
  queueMicrotask(()=>{
   if(fault==='disconnect'){close(3);return;}
   const meta={pid:fault==='pid'&&calls===2?70102:70101,current_user:fault==='role'?'anon':'postgres',session_user:'postgres',read_only:'off',isolation:'read committed'};
   const output=`${id}_PID|${JSON.stringify(meta)}\nfixture output\n${id}_END\n`;
   for(let i=0;i<output.length;i+=3)child.stdout.emit('data',output.slice(i,i+3));
  });return true;
 };
 return child;
}
test('persistent transport handles fragmented framing, actual PID and clean closure',async()=>{
 const child=fakeChild(),c=new PsqlSession('O',child);const frame=await c.command('fixture','SELECT 1;');assert.equal(c.pid,70101);assert.match(frame.text,/fixture output/);await c.close();assert.equal(c.exitCode,0);
});
for(const fault of ['pid','role','disconnect','timeout'])test('transport fails closed on '+fault,async()=>{
 const child=fakeChild(fault);let clock=0;const c=new PsqlSession('O',child,{now:()=>clock+=5,timeoutMs:5});
 if(fault==='pid')await c.command('first','SELECT 1;');
 await assert.rejects(c.command('bad','SELECT 1;'));await c.close();assert.equal(c.closed,true);
});
test('source pin detects a changed reviewed file without altering any actual file',()=>{
 const s=sources();assert.throws(()=>compilePack(s.pack+'\n'));
 assert.throws(()=>loadSources(root,(path,encoding)=>{
   const bytes=readFileSync(path,encoding);return String(path).endsWith('SOURCE_HASHES.json')?(encoding?bytes+' ':Buffer.concat([bytes,Buffer.from(' ')])):bytes;
 }));
});
