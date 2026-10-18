// Recovery of one captured committed run only. Importing this file never connects.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { isDeepStrictEqual } from 'node:util';
import { loadSources, compilePack, validateRestoreBody, assertWorkersDrained, PsqlSession,
 writeEnvironment, evidenceStore, compareCatalog } from './execute-scenarios-6-12.mjs';
import { validateEndpoint, redact } from './automated-read-only-handshake.mjs';

const RUN='scenarios-6-12-2026-10-17T03-22-20-709Z-6d2d9276-205e-4689-b7e4-596b482cc719.json';
const RUN_SHA='e24992d2d42ad0d8e2a4dec8d094413c505825cbe5591831e33f0e0f532ad12f';
const OLD_EXECUTOR='4d3419d1e20b2437b03a3759c8b949879dbc5e6a1c963ecead2390dd3d24f9db';
const REVIEWED_EXECUTOR='cf5ffd0915a750b82d5d6d6c1a84fd61517b0e8a49b67e7c0a7c23df410921ff';
const files={baseline:'baseline.json',seed:'seed.json',restore:'restore-body.sql',precommit:'precommit-record.json',commitAcknowledgement:'setup-commit-ack.json'};
const sha=x=>createHash('sha256').update(x).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{stopCode:code});};
const tag=(f,n)=>{const a=f.text.split(/\r?\n/).filter(x=>x.startsWith(n+'|'));need(a.length===1,'RECOVERY_TAG_'+n);return a[0].slice(n.length+1);};
const ro=sql=>`BEGIN READ ONLY;\nSET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';\n${sql}\nROLLBACK;`;
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const definitions=p=>p.blocks[2].split("SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND NOT enabled)")[0];
const decodeCopy=s=>{need(s.endsWith('\n')&&!s.trimEnd().includes('\n'),'COPY_SINGLE_ROW');return s.slice(0,-1).replace(/\\([\\tnr])/g,(_m,c)=>({'\\':'\\',t:'\t',n:'\n',r:'\r'}[c]));};
const encodeCopy=s=>s.replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\n','\\n').replaceAll('\r','\\r')+'\n';

export function loadRecoveryArtifacts(root,read=readFileSync,artifactDirectory) {
 const dir=join(root,'scratch/phase3n-n2-evidence');
 if(artifactDirectory)need(resolve(artifactDirectory).toLowerCase().startsWith(resolve(dir,'archives').toLowerCase()+sep),'ARCHIVE_OUTSIDE_EVIDENCE');
 const readSafe=(name,base=dir)=>{
  const path=join(base,name);need(!lstatSync(path).isSymbolicLink()&&realpathSync(path).toLowerCase()===resolve(path).toLowerCase(),'ARTIFACT_REDIRECTION');
  return read(path);
 };
 const runBytes=readSafe(RUN);need(sha(runBytes)===RUN_SHA,'FAILED_RUN_HASH');const run=JSON.parse(runBytes);
 need(run.setup.commitSent&&run.setup.commitAcknowledged&&run.cleanup.includes('OWNED_WORKERS_NOT_DRAINED'),'CAPTURED_COMMIT_REQUIRED');
 need(run.clients.every(c=>c.closed===true),'CAPTURED_CLIENT_CLOSURE');
 const bytes=Object.fromEntries(Object.entries(files).map(([k,n])=>[k,readSafe(n,artifactDirectory??dir)]));
 for(const [k,b] of Object.entries(bytes))need(sha(b)===run.artifacts[k],'ARTIFACT_HASH_'+k);
 const pre=JSON.parse(bytes.precommit),ack=JSON.parse(bytes.commitAcknowledgement);
 need(isDeepStrictEqual(pre.sourceHashes,run.sourceHashes)&&pre.sourceHashes['docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs']===OLD_EXECUTOR,'RUN_SOURCE_PROVENANCE');
 need(isDeepStrictEqual(pre.attestation,run.attestation)&&pre.attestation.confirmed,'RUN_ATTESTATION_PROVENANCE');
 for(const k of ['baseline','seed','restore'])need(pre.exports[k]===run.artifacts[k],'PRECOMMIT_EXPORT_HASH');
 need(ack.commitAcknowledged&&ack.precommitHash===sha(bytes.precommit)&&ack.actualOutput==='COMMIT\nN2_SETUP_COMMIT_ACKNOWLEDGED\n','COMMIT_ACK_PROVENANCE');
 for(const l of ['O','A','B','C','D','M'])need(pre.backendPids[l]===run.clients.find(c=>c.label===l)?.backendPid,'RUN_PID_PROVENANCE');
 const frame=(l,n)=>run.clients.find(c=>c.label===l).frames.find(f=>f.name===n);
 need(frame('O','cleanup-disable').text==='BEGIN\n\n\nSET\nSET\nUPDATE 1\nCOMMIT\n','CAPTURED_DISABLE_COMMIT');
 need(!run.clients.some(c=>c.frames.some(f=>['commit-B','commit-C','cleanup-restore','forward-block'].includes(f.name))),'UNEXPECTED_COMMITTED_STAGE');
 const baselineRaw=decodeCopy(bytes.baseline.toString()),seedRaw=decodeCopy(bytes.seed.toString());
 need(encodeCopy(baselineRaw)===bytes.baseline.toString()&&encodeCopy(seedRaw)===bytes.seed.toString(),'COPY_ENCODING');
 need(tag(frame('O','baseline'),'N2_BASELINE')===baselineRaw&&tag(frame('O','setup-prepare'),'N2_SEED')===seedRaw,'EXPORT_FRAME_PROVENANCE');
 const restore=validateRestoreBody(bytes.restore.toString().trimEnd());
 need(JSON.parse(tag(frame('O','baseline'),'N2_RESTORE'))===restore,'RESTORE_FRAME_PROVENANCE');
 const baseline=JSON.parse(baselineRaw),seed=JSON.parse(seedRaw);
 need(Object.keys(baseline.dependency_counts).length===28&&Object.values(baseline.dependency_counts).every(n=>n===0),'ORIGINAL_EMPTY_BASELINE');
 need(baseline.data['public.trusted_study_config'].length===1&&baseline.data['public.trusted_study_config'][0].id===1&&baseline.data['public.trusted_study_config'][0].enabled===false,'ORIGINAL_DISABLED_CONFIG');
 need(isDeepStrictEqual(baseline.meta.registry,seed.meta.registry),'ORIGINAL_REGISTRY');
 need(baseline.meta.registry.filter(m=>m.version==='202610160027'&&m.name==='trusted_cutover_and_attempt_numbering').length===1,'ORIGINAL_MIGRATION_27');
 return {run,baseline,seed,baselineRaw,seedRaw,restore,hashes:{run:RUN_SHA,...run.artifacts}};
}

export function assertRecoverySnapshot(actual,original) {
 const cfg=actual.data?.['public.trusted_study_config'];
 need(cfg?.length===1&&cfg[0].id===1&&cfg[0].enabled===false,'CURRENT_CONFIG_NOT_DISABLED');
 const withoutConfig=d=>Object.fromEntries(Object.entries(d).filter(([k])=>k!=='public.trusted_study_config'));
 need(isDeepStrictEqual(actual.meta,original.seed.meta)&&isDeepStrictEqual(actual.dependency_counts,original.seed.dependency_counts)&&
  isDeepStrictEqual(withoutConfig(actual.data),withoutConfig(original.seed.data)),'CURRENT_RUN_MANIFEST_OR_METADATA_DRIFT');
}

// No query text is selected. This inventory is for quiescence, never race evidence.
const inventorySql=`SELECT 'RECOVERY_ACTIVITY|'||coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)::text FROM
 (SELECT pid,application_name,usename,state,xact_start,backend_type,pg_blocking_pids(pid) AS blockers
 FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid) x;
 SELECT 'RECOVERY_LOCKS|'||coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)::text FROM
 (SELECT pid,locktype,mode,granted FROM pg_locks WHERE locktype='advisory') x;`;
export function assertRecoveryQuiescence(data,ownPids,run) {
 need(!data.activity.some(a=>!ownPids.includes(a.pid)&&
  (a.xact_start!==null||a.state==='active'||/^revit-(?:n[256]|readonly-auto)-/.test(a.application_name))),'UNRELATED_OR_OLD_TEST_SESSION');
 need(!data.locks.some(l=>!ownPids.includes(l.pid)),'OUTSIDE_ADVISORY_LOCK');
 const workers=run.clients.filter(c=>['A','B','C','D'].includes(c.label)).map(c=>({label:c.label,pid:c.backendPid,closed:c.closed}));
 // An old backend PID can now legitimately belong to our freshly verified recovery client.
 assertWorkersDrained({activity:data.activity.filter(a=>!ownPids.includes(a.pid)),locks:data.locks.filter(l=>!ownPids.includes(l.pid)),edges:[]},workers);
}

export function recoverySql(p,original) {
 const imports=`CREATE TEMP TABLE n2_baseline(j jsonb); CREATE TEMP TABLE n2_seed(j jsonb);
 INSERT INTO n2_baseline VALUES (${literal(original.baselineRaw)}::jsonb);
 INSERT INTO n2_seed VALUES (${literal(original.seedRaw)}::jsonb);`;
 const anchor='DELETE FROM public.question_attempts WHERE';
 need(p.cleanup.split(anchor).length===2,'CLEANUP_DELETE_ANCHOR');
 const locked=`SELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_prepared_xacts),'recovery no prepared transactions');
 SELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
 AND (xact_start IS NOT NULL OR state='active')),'recovery no outside transactions under cleanup locks');
 SELECT pg_temp.require((pg_temp.snapshot()->'dependency_counts')=(SELECT j->'dependency_counts' FROM n2_seed), 'exact committed-run dependency manifest');
 SELECT pg_temp.require(((pg_temp.snapshot()->'data')-'public.trusted_study_config')=
 ((SELECT j->'data' FROM n2_seed)-'public.trusted_study_config'),'exact committed-run rows before first DELETE');\n`;
 return {imports,cleanup:p.cleanupSql(original.restore).replace(anchor,locked+anchor),definitions:definitions(p)};
}

export async function recover({env={},expected,load,open,confirm,verify,save,signal}) {
 const clients=[],evidence={result:'NO-GO \u2014 RESTORATION UNRESOLVED',cleanupSent:false,cleanupCommitAcknowledged:false,checks:[],clients:[]};
 let conn,deadline=Infinity;
 try {
  need(env.REVIT_STAGING_DB_URL?.trim(),'MISSING_PRIVATE_URI');conn=validateEndpoint(env.REVIT_STAGING_DB_URL,expected);
  const {sources,original}=load(),p=compilePack(sources.pack),sql=recoverySql(p,original);
  need(original.run.endpoint.host===conn.host,'CAPTURED_STAGING_ENDPOINT');
  evidence.originalArtifacts=original.hashes;
  const connect=async l=>{verify();const c=await open(l,conn);clients.push(c);return c;};
  const command=async(c,n,q)=>{need(!signal?.aborted,'INTERRUPTED');need(Date.now()<deadline,'RECOVERY_360S');verify();
   const f=await c.command(n,q,{timeoutMs:Math.min(90000,deadline-Date.now()),signal});need(!f.stderr?.trim(),'RECOVERY_SQL_STDERR');evidence.checks.push(n);return f;};
  const preflight=async c=>{
   const f=await command(c,'identity',ro(`SELECT 'RECOVERY_IDENTITY|'||jsonb_build_object('database',current_database(),
    'version',current_setting('server_version_num')::integer,'user',current_user,'session_user',session_user,
    'read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'),
    'pid',pg_backend_pid(),'prepared',(SELECT count(*) FROM pg_prepared_xacts),
    'config',(SELECT jsonb_agg(to_jsonb(t)) FROM public.trusted_study_config t),
    'registry',(SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM supabase_migrations.schema_migrations m))::text;`));
   const id=JSON.parse(tag(f,'RECOVERY_IDENTITY'));
   need(f.text.split(/\r?\n/).includes('ROLLBACK')&&id.database==='postgres'&&id.version>=170000&&id.version<180000&&
    id.user==='postgres'&&id.session_user==='postgres'&&id.read_only==='on'&&id.isolation==='read committed'&&id.pid===c.pid&&
    id.prepared===0&&isDeepStrictEqual(id.registry,original.baseline.meta.registry),'CURRENT_STAGING_IDENTITY_REGISTRY_OR_PREPARED');
   need(id.config?.length===1&&id.config[0].id===1&&id.config[0].enabled===false,'CURRENT_CONFIG_NOT_DISABLED');
   evidence.identity=id;await command(c,'pre-helper-coverage',p.preHelper(c.label));
  };
  const o=await connect('O'),m=await connect('M');await preflight(o);
  await command(m,'monitor-init',"\\set ON_ERROR_STOP on\nSET statement_timeout='15s';");
  need(o.pid!==m.pid,'RECOVERY_INDEPENDENT_PIDS');
  const inventory=async()=>{const f=await command(m,'quiescence',ro(inventorySql));
   need(f.text.split(/\r?\n/).includes('ROLLBACK'),'INVENTORY_ROLLBACK');
   const data={activity:JSON.parse(tag(f,'RECOVERY_ACTIVITY')),locks:JSON.parse(tag(f,'RECOVERY_LOCKS'))};
   assertRecoveryQuiescence(data,clients.filter(c=>!c.closed).map(c=>c.pid),original.run);evidence.inventory=data;};
  await inventory();need(await confirm()===true,'FRESH_QUIESCENCE_ATTESTATION');evidence.attestedAt=new Date().toISOString();deadline=Date.now()+360000;
  await command(o,'helpers',p.helpers);await command(o,'snapshot-definitions',sql.definitions);
  await command(o,'import-original-artifacts',sql.imports);
  const current=await command(o,'current-run-snapshot',ro("SELECT 'RECOVERY_SNAPSHOT|'||pg_temp.snapshot()::text;"));
  assertRecoverySnapshot(JSON.parse(tag(current,'RECOVERY_SNAPSHOT')),original);await inventory();
  evidence.cleanupSent=true;
  const cleanup=await command(o,'locked-exact-artifact-restoration',sql.cleanup);
  need(cleanup.text.split(/\r?\n/).filter(l=>l==='COMMIT').length===1,'RESTORE_COMMIT_ACK');evidence.cleanupCommitAcknowledged=true;
  await o.close();
  const post=await connect('O-post');await preflight(post);
  await command(post,'post-helpers',p.helpers);await command(post,'post-snapshot-definitions',sql.definitions);
  await command(post,'post-import-original-baseline',`CREATE TEMP TABLE n2_baseline(j jsonb); INSERT INTO n2_baseline VALUES (${literal(original.baselineRaw)}::jsonb);`);
  const final=await command(post,'independent-baseline-comparison',ro("SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'independent original baseline equality'); SELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_prepared_xacts),'no prepared transactions'); SELECT 'RECOVERY_BASELINE_MATCH';"));
  need(final.text.split(/\r?\n/).includes('ROLLBACK')&&final.text.includes('RECOVERY_BASELINE_MATCH'),'INDEPENDENT_BASELINE_ROLLBACK');await post.close();
  for(const [label,text] of [['final-catalog',sources.catalogSql],['final-coverage',sources.coverageSql]]){
   const c=await connect(label),f=await command(c,label,text);await c.close();
   if(label==='final-catalog')compareCatalog(f.text,sources.catalogReference);
   else {const lines=f.text.split(/\r?\n/);need(lines.filter(l=>l==='ROLLBACK').length===1&&lines.includes('COVERAGE_READ_ONLY_ROLLBACK_COMPLETE'),'COVERAGE_FINAL_MARKERS');
    const raw=lines.find(l=>l.trim().startsWith('{')&&l.includes('"event_settings"'));need(raw&&isDeepStrictEqual(JSON.parse(raw),sources.coverageReference),'COVERAGE_FINAL_MISMATCH');}
  }
  await inventory();await m.close();need(clients.every(c=>c.closed&&c.exitCode===0),'RECOVERY_CLIENT_CLOSURE');
  evidence.result='STAGING RESTORATION INDEPENDENTLY VERIFIED';
 } catch(e){evidence.result='NO-GO \u2014 RESTORATION UNRESOLVED: '+(/^[A-Z0-9_-]+$/.test(e.stopCode??'')?e.stopCode:'LOCAL_OR_SQL_FAILURE');}
 finally {
  for(const c of clients)if(!c.closed){try{await c.close();}catch{evidence.result='NO-GO \u2014 RESTORATION UNRESOLVED: CLIENT_CLOSURE';}}
  evidence.clients=clients.map(c=>({label:c.label,pid:c.pid,closed:c.closed,exitCode:c.exitCode,frames:c.history}));
  await save(JSON.parse(redact(JSON.stringify(evidence),conn?.needles??[])));
 }
 return evidence;
}

async function main(){
 const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/[\\/]$/,'');
 need(process.argv[2]==='--recover'&&process.argv.length===7,'ARGUMENTS');
 const expected=process.argv.slice(3),conn=validateEndpoint(process.env.REVIT_STAGING_DB_URL,expected);
 const sources=loadSources(root),original=loadRecoveryArtifacts(root),self=fileURLToPath(import.meta.url),selfHash=sha(readFileSync(self));
 need(sources.sourceHashes['docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs']===REVIEWED_EXECUTOR,'REVIEWED_EXECUTOR_HASH');
 const store=evidenceStore(join(root,'scratch/phase3n-n2-evidence'),conn.needles,{prefix:'restoration'});
 const abort=new AbortController(),cancel=()=>abort.abort();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 const result=await recover({env:process.env,expected,load:()=>({sources,original}),
  verify:()=>{need(isDeepStrictEqual(loadSources(root).sourceHashes,sources.sourceHashes),'RECOVERY_DEPENDENCY_DRIFT');loadRecoveryArtifacts(root);need(sha(readFileSync(self))===selfHash,'RECOVERY_SOURCE_DRIFT');},
  signal:abort.signal,
  confirm:async()=>{const rl=createInterface({input:process.stdin,output:process.stdout});try{return await rl.question('Type YES: staging ingress isolated and background writers paused through restoration: ',{signal:abort.signal})==='YES';}finally{rl.close();}},
  open:async(label,c)=>new PsqlSession(label,spawn('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe',
   ['-X','--no-password','--set=ON_ERROR_STOP=on','--pset=pager=off','-A','-t','--field-separator=|','--file=-'],
   {cwd:root,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:writeEnvironment(process.env,c,label)})),save:e=>store.save(e)});
 process.off('SIGINT',cancel);process.off('SIGTERM',cancel);conn.password='';conn.needles=[];
 process.stdout.write(result.result+'\nSanitized evidence: '+store.path+'\n');if(result.result.startsWith('NO-GO'))process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('NO-GO \u2014 RESTORATION UNRESOLVED: LOCAL_PREREQUISITE. Original artifacts retained; no automatic retry.\n');process.exitCode=1;});
