// Operator-run staging executor. Importing this module never connects or reads credentials.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, openSync, writeFileSync, fsyncSync, closeSync, mkdirSync, lstatSync, realpathSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { isDeepStrictEqual } from 'node:util';
import { verifySources, validateEndpoint, childEnvironment, redact } from './automated-read-only-handshake.mjs';

const PACK_SHA = '8ca23d28ced6a84c5d603629fffeceaf387c7b44810f5449d40c26f170c03a90';
const PSQL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const OWNER = '3e9a0000-3a2e-4e60-8000-000000000001';
const sha = x => createHash('sha256').update(x).digest('hex');
const stop = code => { throw Object.assign(new Error(code), { stopCode: code }); };
const requireTrue = (condition, code) => { if (!condition) stop(code); };
const norm = text => text.replaceAll('\r\n','\n').split('\n').map(x=>x.trimEnd()).join('\n').trim();
const pause = () => new Promise(r=>setTimeout(r,20));
const pairs = [
 ['RECURSIVE_INCOMING_FOREIGN_KEYS','REACHABLE_RELATIONS_AND_COUNT_READINESS'],
 ['REACHABLE_RELATIONS_AND_COUNT_READINESS','REACHABLE_COUNTS_ONLY_NO_AUTH_ROW_DUMPS'],
 ['REACHABLE_COUNTS_ONLY_NO_AUTH_ROW_DUMPS','REACHABLE_NONINTERNAL_TRIGGERS_AND_OWNER_SOURCE'],
 ['REACHABLE_NONINTERNAL_TRIGGERS_AND_OWNER_SOURCE','AUTH_PROGRESS_HELPER_PRESENCE'],
 ['MIGRATION_REGISTRY','TRUSTED_CONFIGURATION'],['TRUSTED_CONFIGURATION','TEN_TABLE_COUNTS'],
 ['TEN_TABLE_COUNTS','FOREIGN_KEYS'],['FOREIGN_KEYS','USER_TRIGGERS_AND_INSTALLED_BEHAVIOR_SOURCE'],
 ['USER_TRIGGERS_AND_INSTALLED_BEHAVIOR_SOURCE','TRUSTED_ROUTINE_DEFINITIONS_AND_KNOWN_ROUTINE_PRIVILEGES'],
 ['TRUSTED_ROUTINE_DEFINITIONS_AND_KNOWN_ROUTINE_PRIVILEGES','TABLE_COLUMN_SCHEMA_AND_DIRECT_ACLS'],
 ['TABLE_COLUMN_SCHEMA_AND_DIRECT_ACLS','STUDY_CONSTRAINTS_AND_INDEXES'],
 ['STUDY_CONSTRAINTS_AND_INDEXES','EFFECTIVE_TABLE_AND_COLUMN_WRITER_PRIVILEGES'],
 ['EFFECTIVE_TABLE_AND_COLUMN_WRITER_PRIVILEGES','PUBLIC_RLS_POLICIES'],['PUBLIC_RLS_POLICIES','ROLE_AND_MONITORING_METADATA'],
 ['N6_TRUSTED_ROUTINE_ATTRIBUTES','N6_REQUIRED_RELATION_CONSTRAINTS_INDEXES_POLICIES'],
 ['N6_REQUIRED_RELATION_CONSTRAINTS_INDEXES_POLICIES','N6_EFFECTIVE_COLUMN_PRIVILEGES'],
 ['N6_EFFECTIVE_COLUMN_PRIVILEGES','N6_OPTIONAL_XP_COUNT'],
];
const markers = ['N6_RELATION_GUARD_ROLLBACK_COMPLETE','N5_READ_ONLY_RECHECK_ROLLBACK_COMPLETE',
 'N3_READ_ONLY_PREFLIGHT_ROLLBACK_COMPLETE','N6_SCHEMA_SUPPLEMENT_ROLLBACK_COMPLETE','N6_CATALOG_RECHECK_COMPLETE'];

function canonicalRoutineAcls(section) {
 let inDefinition=false,delimiter=null;
 // Only the direct_acl column of routine result rows; never rewrite routine source/settings.
 const result=section.split('\n').map(line=>{
   if(inDefinition){
    const opening=/^AS (\$[a-zA-Z0-9_]*\$)/.exec(line);
    if(!delimiter&&opening)delimiter=opening[1];
    else if(delimiter&&line===delimiter){inDefinition=false;delimiter=null;}
    return line;
   }
   const row=/^([a-z_][a-z0-9_]*\([^|\n]*\)\|[^|\n]+\|[tf]\|[^|\n]*\|)([^|\n]*)(\|[tf]\|[tf]\|[tf]\|.*)$/.exec(line);
   if(!row)return line;
   const [,before,acl,after]=row;
   inDefinition=after.includes('|CREATE OR REPLACE FUNCTION ');
   if(acl==='<NULL>')return line;
   requireTrue(acl.startsWith('{')&&acl.endsWith('}'),'CATALOG_ACL_FORMAT');
   const body=acl.slice(1,-1),items=body.match(/"(?:[^"\\]|\\.)*"|[^,{}"\\]+/g)??[];
   requireTrue(items.join(',')===body,'CATALOG_ACL_FORMAT');
   // Keep each complete aclitem (including grantor and '*') and its multiplicity intact.
   return before+'{'+items.sort().join(',')+'}'+after;
  }).join('\n');
 requireTrue(!inDefinition,'CATALOG_ROUTINE_DEFINITION_BOUNDARY');
 return result;
}

export function parseCatalog(text) {
 const lines=norm(text).split('\n');
 requireTrue(!/\b(?:ERROR|FATAL|PANIC):/.test(text),'CATALOG_SQL_ERROR');
 requireTrue(lines.filter(l=>l==='ROLLBACK').length===4 && markers.every(m=>lines.filter(l=>l===m).length===1),'CATALOG_MARKERS');
 const sections=pairs.map(([a,b])=>{const start=lines.indexOf(a),end=lines.indexOf(b);requireTrue(start>=0&&end>start,'CATALOG_SECTION');
  const section=norm(lines.slice(start,end).join('\n'));
  return a==='TRUSTED_ROUTINE_DEFINITIONS_AND_KNOWN_ROUTINE_PRIVILEGES'?canonicalRoutineAcls(section):section;
 });
 const boundary=lines.indexOf('RECURSIVE_INCOMING_FOREIGN_KEYS');
 const members=lines.slice(0,boundary).filter(l=>/^[a-z_]+\|[a-z_]+\|[a-z_]+\|[tf]\|[tf]\|[tf]$/.test(l));
 requireTrue(members.length===24,'MEMBERSHIP_COVERAGE');
 const roleStart=lines.indexOf('ROLE_AND_MONITORING_METADATA');
 const roles=lines.slice(roleStart+1,roleStart+8);
 requireTrue(roles.length===7 && roles[6]==='t|t','ROLE_MONITOR_CAPABILITIES');
 const authStart=lines.indexOf('AUTH_PROGRESS_HELPER_PRESENCE'),authEnd=lines.indexOf('ROLLBACK',authStart);
 requireTrue(authStart>=0&&authEnd>authStart,'AUTH_REGISTRY_SECTION');
 const prepared=lines.indexOf('PREPARED_TRANSACTIONS'),preparedEnd=lines.indexOf('ROLLBACK',prepared);
 requireTrue(prepared>=0&&preparedEnd===prepared+2&&/^[1-9][0-9]*$/.test(lines[prepared+1]),'PREPARED_TRANSACTION_OR_PID_DRIFT');
 return {sections,members,roles,authRegistry:norm(lines.slice(authStart,authEnd).join('\n'))};
}
export function compareCatalog(actual,expected) {
 requireTrue(isDeepStrictEqual(parseCatalog(actual),parseCatalog(expected)),'CATALOG_PRESERVATION_MISMATCH');
}
function coverageMetadata(text) {
 const lines=norm(text).split('\n');
 requireTrue(lines.filter(l=>l==='ROLLBACK').length===1&&lines.filter(l=>l==='COVERAGE_READ_ONLY_ROLLBACK_COMPLETE').length===1,'COVERAGE_ROLLBACK_COMPLETION');
 const raw=lines.find(l=>l.trim().startsWith('{')&&l.includes('"event_settings"'))?.trim();
 requireTrue(raw,'COVERAGE_METADATA_MISSING');return JSON.parse(raw);
}
export function loadSources(root,readFile=readFileSync) {
 verifySources(root,readFile);
 const pinned = {
  'docs/phase3n/phase3n-n/EXECUTION_PACK.md':PACK_SHA,
  'docs/phase3n/phase3n-n/automated-read-only-handshake.mjs':'a1ee786f6bff0024ce4d88455132fbf6c710f155f09d21cc3d9bd1067d881712',
  'docs/phase3n/phase3n-n/COVERAGE_READ_ONLY_RECHECK.psql':'b2ea404c69abdcc2a60a7e18b6e0936d9ccb29618866d2c850caeda00ba62f97',
  'supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql':'aff77404186a13eedde3c1ebe0475f43202d7339bc49f4cd811745dee4148589',
  'scratch/phase3n-n2-evidence/automated-readonly-2026-10-16T16-51-40-201Z-871a1b0e-db65-490a-baa8-d601f6e1c6a1.json':'9b41483635a6ca3a8aac9001336b49411f81f01fa41190a717ec65751937ac47',
  'scratch/phase3n-n2-evidence/coverage-readonly-Catalog-20261016T150743557Z-768ad107.log':'9695110c72a9e8e6a9405012e2aaeef3521456aac4bfffaec0d90b380359f756',
 };
 for(const [path,hash] of Object.entries(pinned))requireTrue(sha(readFile(join(root,path)))===hash,'SOURCE_HASH_DRIFT');
 const read=path=>readFile(join(root,path),'utf8');
 const capture=JSON.parse(read(Object.keys(pinned)[4]));
 requireTrue(capture.result==='HANDSHAKE_COMPLETE_CATALOG_CAPTURED_REVIEW_REQUIRED' && capture.clients.length===7 && capture.clients.every(c=>c.exitCode===0&&c.closed&&!c.killed&&!c.stderr),'ACCEPTED_HANDSHAKE');
 const catalogReference=capture.clients.find(c=>c.label==='Catalog').stdout;
 parseCatalog(catalogReference);
 // Freeze every include in memory before connecting; later disk edits never substitute SQL.
 function flatten(file,stack=[]) {
  requireTrue(!stack.includes(file),'INCLUDE_CYCLE');
  const value=readFile(file,'utf8');
  return value.replace(/^\\ir\s+(.+)$/gm,(_m,path)=>flatten(resolve(file,'..',path.trim()),[...stack,file]));
 }
 const catalogSql=flatten(join(root,'docs/phase3n/phase3n-n6/CATALOG_READ_ONLY_RECHECK.psql'));
 return Object.freeze({pack:read(Object.keys(pinned)[0]),catalogSql,catalogReference,
  coverageSql:read(Object.keys(pinned)[2]),coverageReference:coverageMetadata(read(Object.keys(pinned)[5])),
  sourceHashes:{...pinned,'docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs':sha(readFile(fileURLToPath(import.meta.url)))}});
}

export function compilePack(pack) {
 requireTrue(sha(Buffer.from(pack))===PACK_SHA,'PACK_HASH');
 const blocks=[...pack.matchAll(/```sql\r?\n([\s\S]*?)```/g)].map(m=>m[1].replaceAll('\r\n','\n'));
 requireTrue(blocks.length===22,'PACK_BLOCKS');
 function replaceOne(text,from,to){requireTrue(text.split(from).length===2,'PACK_ANCHOR');return text.replace(from,to);}
 const setup=replaceOne(blocks[4],"\\copy (SELECT j FROM n2_seed) TO 'scratch/phase3n-n2-evidence/seed.json' WITH (FORMAT text)","SELECT 'N2_SEED|'||j::text FROM n2_seed;");
 const commitAt=setup.lastIndexOf('\nCOMMIT;');requireTrue(commitAt>0,'SETUP_COMMIT_BOUNDARY');
 let baseline=replaceOne(blocks[3],"\\copy (SELECT j FROM n2_baseline) TO 'scratch/phase3n-n2-evidence/baseline.json' WITH (FORMAT text)","SELECT 'N2_BASELINE|'||j::text FROM n2_baseline;");
 baseline=replaceOne(baseline,"\\copy (SELECT sql FROM n2_restore ORDER BY seq,sql) TO 'scratch/phase3n-n2-evidence/restore-body.sql' WITH (FORMAT text)","SELECT 'N2_RESTORE|'||to_jsonb(string_agg(sql,E'\\n' ORDER BY seq,sql))::text FROM n2_restore;");
 const helperAt=blocks[1].indexOf('CREATE FUNCTION pg_temp.check_owner()');
 requireTrue(helperAt>0,'PRE_HELPER_BOUNDARY');
 const monitorQueries=blocks[5].replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
 requireTrue(monitorQueries.length===4,'MONITOR_QUERIES');
 // Also observe locks on retained pooler backends before treating closed workers as drained.
 monitorQueries[1]=replaceOne(monitorQueries[1],"WHERE a.application_name IN('revit-n2-A','revit-n2-B','revit-n2-C','revit-n2-D')",
  "WHERE a.application_name IN('revit-n2-A','revit-n2-B','revit-n2-C','revit-n2-D') OR (a.application_name='Supavisor' AND a.usename='postgres')");
 const monitorSql=monitorQueries.map((q,i)=>`SELECT 'N2_MONITOR_${i}|'||coalesce(jsonb_agg(${i===3?"to_jsonb(e)||jsonb_build_object('signed_key',e.signed_key::text)":'to_jsonb(e)'}),'[]'::jsonb)::text FROM (${q}) e;`).join('\n')+
  "\nSELECT 'N2_CONFIG_RELATION|'||'public.trusted_study_config'::regclass::oid;";
 return Object.freeze({blocks,init:label=>replaceOne(blocks[1],"application_name = 'revit-n2-O'",`application_name = 'revit-n2-${label}'`),
  preHelper:label=>replaceOne(blocks[1].slice(0,helperAt),"application_name = 'revit-n2-O'",`application_name = 'revit-n2-${label}'`),
  helpers:blocks[1].slice(helperAt),snapshots:blocks[2],baseline,setupPrepare:setup.slice(0,commitAt),setupCommit:setup.slice(commitAt),
  cleanup:blocks[20],cleanupSql:body=>replaceOne(blocks[20],'\\i scratch/phase3n-n2-evidence/restore-body.sql',body),monitorSql});
}
function tagged(frame,name) {
 const rows=frame.text.split('\n').filter(x=>x.startsWith(name+'|'));
 requireTrue(rows.length===1,'MISSING_OR_DUPLICATE_'+name);return rows[0].slice(name.length+1);
}
function jsonTag(frame,name){return JSON.parse(tagged(frame,name));}
function monitorData(frame) {
 return {activity:jsonTag(frame,'N2_MONITOR_0'),locks:jsonTag(frame,'N2_MONITOR_1'),edges:jsonTag(frame,'N2_MONITOR_2'),keys:jsonTag(frame,'N2_MONITOR_3'),configRelation:Number(tagged(frame,'N2_CONFIG_RELATION'))};
}
export function assertWorkersDrained(data,clients) {
 const workers=clients.filter(c=>['A','B','C','D'].includes(c.label));
 const pids=new Set(workers.map(c=>c.pid));
 const safePoolRow=a=>a.application_name==='Supavisor'&&a.usename==='postgres'&&
  a.state==='idle'&&a.xact_start===null&&Array.isArray(a.blockers)&&a.blockers.length===0;
 // Supavisor may retain a backend after the owned client exits; PID alone is not ownership.
 requireTrue(workers.length===4&&pids.size===4&&new Set(workers.map(c=>c.label)).size===4&&
  workers.every(c=>c.closed===true&&Number.isInteger(c.pid)&&c.pid>0)&&
  !data.activity.some(a=>/^revit-n2-(A|B|C|D)$/.test(a.application_name)||
   (pids.has(a.pid)&&!safePoolRow(a))||(a.blockers??[]).some(pid=>pids.has(pid)))&&
  !data.locks.some(l=>pids.has(l.pid))&&
  !data.edges.some(e=>pids.has(e.waiter_pid)||pids.has(e.blocker_pid)), 'OWNED_WORKERS_NOT_DRAINED');
 return true;
}
export function writeEnvironment(parent,connection,label) {
 const env=childEnvironment(parent,connection,label);
 env.PGAPPNAME=`revit-n2-${label}`;
 if(label!=='M' && !label.includes('catalog') && !label.includes('coverage'))
  env.PGOPTIONS='-c statement_timeout=90000 -c lock_timeout=60000 -c idle_in_transaction_session_timeout=120000';
 return env;
}
export function validateRestoreBody(body) {
 requireTrue(typeof body==='string'&&body.length>0&&!body.includes('\\'),'RESTORE_ESCAPES');
 const lines=body.trim().split('\n');let updates=0;
 for(const line of lines){
  if(/^GRANT EXECUTE ON FUNCTION (public\.)?(record_question_attempt|record_study_activity|record_progression_award|check_and_unlock_achievements)\([a-z0-9_, ]*\) TO (PUBLIC|anon|authenticated)( WITH GRANT OPTION)?;$/.test(line))continue;
  if(/^GRANT (INSERT|UPDATE|DELETE|TRUNCATE|TRIGGER) ON TABLE (public\.)?(question_attempts|activity_events|daily_activity|user_progress|user_achievements|user_xp_transactions|question_reinforcement|study_sessions|trusted_study_config) TO (PUBLIC|anon|authenticated)( WITH GRANT OPTION)?;$/.test(line))continue;
  if(/^UPDATE public\.trusted_study_config SET enabled=false,updated_at='[0-9 .:+-]+'::timestamptz WHERE id=1;$/.test(line)){updates++;continue;}
  stop('RESTORE_BODY_UNSUPPORTED');
 }
 requireTrue(updates===1,'RESTORE_CONFIG_METADATA');return body;
}
function lockEdge(data,pids,waiter,blocker,keyName) {
 const wp=pids[waiter],bp=pids[blocker];
 const edges=data.edges.filter(e=>e.waiter_pid===wp&&e.blocker_pid===bp&&e.waiter===`revit-n2-${waiter}`&&e.blocker===`revit-n2-${blocker}`);
 if(edges.length!==1)return false;
 const waitActivity=data.activity.find(a=>a.pid===wp);
 if(!waitActivity?.blockers?.includes(bp))return false;
 if(keyName){
  const key=data.keys.find(k=>k.k===`${OWNER}:${keyName}`);if(!key)return false;
  const matches=l=>l.locktype==='advisory'&&Number(l.classid)===Number(key.expected_classid)&&Number(l.objid)===Number(key.expected_objid)&&l.objsubid===1;
  return data.locks.some(w=>w.pid===wp&&!w.granted&&matches(w)&&data.locks.some(b=>b.pid===bp&&b.granted&&matches(b)&&b.database===w.database&&b.mode==='ExclusiveLock'&&w.mode==='ExclusiveLock'));
 }
 const relationship=data.locks.some(w=>w.pid===wp&&w.locktype==='transactionid'&&!w.granted&&w.mode==='ShareLock'&&
  data.locks.some(b=>b.pid===bp&&b.locktype==='transactionid'&&b.granted&&b.mode==='ExclusiveLock'&&b.transactionid===w.transactionid));
 return relationship&&[wp,bp].every(pid=>data.locks.some(l=>l.pid===pid&&l.locktype==='relation'&&l.granted&&Number(l.relation)===data.configRelation));
}
export function assertLockEvidence(data,pids,kind) {
 const labels=['O','A','B','C','D','M'];
 requireTrue(new Set(Object.values(pids)).size===6,'SIX_SQL_PIDS');
 for(const l of labels){const rows=data.activity.filter(a=>a.pid===pids[l]&&a.application_name===`revit-n2-${l}`&&a.usename==='postgres');requireTrue(rows.length===1,'MONITOR_PID_LABEL');}
 requireTrue(new Set(data.keys.map(k=>`${k.expected_classid}:${k.expected_objid}`)).size===3,'ADVISORY_KEY_COLLISION');
 const tests={
  's6-first':()=>lockEdge(data,pids,'B','A','phase3n-n2-20261016-s6')&&lockEdge(data,pids,'C','B','trusted-study'),
  's6-second':()=>lockEdge(data,pids,'C','B','trusted-study'),
  's6-guard':()=>lockEdge(data,pids,'B','A','phase3n-n2-20261016-s6'),
  'forward-guard':()=>lockEdge(data,pids,'B','A','phase3n-n2-20261016-forward'),
  'forward-first':()=>lockEdge(data,pids,'B','A','phase3n-n2-20261016-forward')&&lockEdge(data,pids,'D','B'),
  'forward-second':()=>lockEdge(data,pids,'D','B'),
  reverse:()=>lockEdge(data,pids,'B','D')&&!data.locks.some(l=>l.pid===pids.B&&l.locktype==='advisory'&&l.granted),
 };
 requireTrue(tests[kind]?.(),'LOCK_EVIDENCE_'+kind.toUpperCase().replaceAll('-','_'));return true;
}

export class PsqlSession {
 constructor(label,child,{timeoutMs=90000,now=()=>Date.now()}={}) {
  Object.assign(this,{label,child,timeoutMs,now,pid:null,closed:false,healthy:true,history:[],out:'',err:'',busy:false,exitCode:null});
  for(const [stream,field] of [[child.stdout,'out'],[child.stderr,'err']]){
   stream.setEncoding('utf8');stream.on('data',chunk=>{if(this.out.length+this.err.length+chunk.length>24*1024*1024)this.healthy=false;else this[field]+=chunk;});
   stream.on('error',()=>{this.healthy=false;});
  }
  child.on('error',()=>{this.healthy=false;});child.stdin.on('error',()=>{this.healthy=false;});
  child.on('close',code=>{this.closed=true;this.exitCode=code;});
 }
 async command(name,sql,{timeoutMs=this.timeoutMs,allowNotices=false,signal}={}) {
  requireTrue(!this.closed&&this.healthy&&!this.busy,'CLIENT_UNAVAILABLE');this.busy=true;
  const id='N2_'+randomUUID().replaceAll('-','');const start=this.out.length,errStart=this.err.length;const began=this.now();
  // Only engine-reported PIDs are used. The guard runs before this frame's SQL.
  const pidGuard=this.pid?`SELECT pg_backend_pid()=${this.pid} AS n2_transport_pid_ok \\gset\n\\if :n2_transport_pid_ok\n\\else\nSELECT 1/0 AS changed_backend_stop;\n\\endif\n`:'';
  const header=`SELECT '${id}_PID|'||jsonb_build_object('pid',pg_backend_pid(),'current_user',current_user,'session_user',session_user,'read_only',current_setting('transaction_read_only'),'isolation',current_setting('transaction_isolation'))::text;`;
  try {
   if(signal?.aborted)stop('INTERRUPTED');
   this.child.stdin.write(`${pidGuard}${header}\n${sql}\n\\echo ${id}_END\n`);
   for(;;){
    if(signal?.aborted)stop('INTERRUPTED');
    const errors=this.err.slice(errStart);
    if(!this.healthy||this.closed||/\b(?:ERROR|FATAL|PANIC):/.test(errors)||(!allowNotices&&errors.trim()))stop('CHILD_SQL_OR_DISCONNECT');
    if(this.out.slice(start).split(/\r?\n/).includes(id+'_END'))break;
    if(this.now()-began>timeoutMs)stop('CHILD_TIMEOUT');await pause();
   }
   const raw=this.out.slice(start);const row=raw.split(/\r?\n/).find(l=>l.startsWith(id+'_PID|'));
   requireTrue(row,'ENGINE_PID_MISSING');const meta=JSON.parse(row.slice(id.length+5));
   requireTrue(Number.isInteger(meta.pid)&&meta.pid>0&&meta.pid<=2147483647&&(!this.pid||meta.pid===this.pid)&&meta.session_user==='postgres','ENGINE_PID_OR_SESSION');
   requireTrue(meta.current_user==='postgres'||(['B','C'].includes(this.label)&&meta.current_user==='service_role'),'FRAME_SQL_ROLE');
   this.pid=meta.pid;const text=raw.split(/\r?\n/).filter(l=>l!==id+'_END'&&!l.startsWith(id+'_PID|')).join('\n');
   const frame={name,text,stderr:this.err.slice(errStart),connection:meta};this.history.push(frame);return frame;
  } catch(error){this.healthy=false;this.history.push({name,text:this.out.slice(start),stderr:this.err.slice(errStart),failed:true});throw error;}
  finally{this.busy=false;}
 }
 async close(){
  if(!this.closed){if(this.busy||!this.healthy){this.child.stdin.destroy();this.child.kill();}else this.child.stdin.end('\\quit\n');}
  const start=this.now();while(!this.closed&&this.now()-start<3000)await pause();
  if(!this.closed){this.child.kill();await pause();}
  requireTrue(this.closed,'OWNED_CLOSURE_UNCONFIRMED');
 }
}

export function evidenceStore(directory,needles=[],{testDirectory=false,prefix='scenarios-6-12'}={}) {
 if(!testDirectory){const scratch=resolve(directory,'..');requireTrue(scratch.endsWith(sep+'scratch')&&!lstatSync(scratch).isSymbolicLink()&&realpathSync(scratch).toLowerCase()===scratch.toLowerCase(),'SCRATCH_REDIRECTION');}
 mkdirSync(directory,{recursive:true});
 const resolved=realpathSync(directory);
 requireTrue(!lstatSync(directory).isSymbolicLink()&&resolved.toLowerCase()===resolve(directory).toLowerCase(),'EVIDENCE_DIRECTORY');
 requireTrue(['scenarios-6-12','restoration'].includes(prefix),'EVIDENCE_PREFIX');
 const hashes=new Map();const journal=join(directory,`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.json`);
 function create(name,content){
  requireTrue(/^[a-z0-9.-]+$/.test(name),'ARTIFACT_NAME');requireTrue(redact(content,needles)===content,'ARTIFACT_SECRET_OR_UNSUPPORTED_TEXT');
  const path=join(directory,name);const fd=openSync(path,'wx',0o600);
  try{writeFileSync(fd,content,'utf8');fsyncSync(fd);}finally{closeSync(fd);}
  const hash=sha(readFileSync(path));requireTrue(hash===sha(content),'ARTIFACT_DURABILITY');hashes.set(name,hash);return hash;
 }
 return {path:journal,create,verify(name){requireTrue(hashes.has(name)&&sha(readFileSync(join(directory,name)))===hashes.get(name),'ARTIFACT_HASH_DRIFT');},
  save(value){const content=redact(JSON.stringify(value,null,2),needles)+'\n';const fd=openSync(journal,'wx',0o600);try{writeFileSync(fd,content,'utf8');fsyncSync(fd);}finally{closeSync(fd);}},hashes};
}

const copyText = text => text.replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\n','\\n').replaceAll('\r','\\r')+'\n';
function stateNotice(frame,expected) {
 const text=frame.text+'\n'+(frame.stderr??'');const matches=[...text.matchAll(/observed_sqlstate=([A-Z0-9]{5}) expected=([A-Z0-9]{5})/g)];
 requireTrue(matches.length===1&&matches[0][1]===expected&&matches[0][2]===expected,'OBSERVED_SQLSTATE_MISMATCH');
}
export function roleResult(frame,client) {
 // The reviewed SELECT emits current_user, session_user, PID, isolation, in that order.
 const rows=frame.text.split(/\r?\n/).filter(line=>
  !['','BEGIN','SET','service_role','{"role":"service_role"}'].includes(line)&&
  !/^N2_(?:RPC|[a-f0-9]{32}_PID)\|/.test(line));
 requireTrue(Number.isInteger(client.pid)&&client.pid>0&&rows.length===1&&
  rows[0]===`service_role|postgres|${client.pid}|read committed`,'ACTUAL_SERVICE_ROLE');
}
const readOnly = sql => `BEGIN READ ONLY;\nSET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';\n${sql}\nROLLBACK;`;

export async function runScenarios({repoRoot,env={},expected,confirmQuiescence,artifacts,open,load=()=>loadSources(repoRoot),
 verifyFrozen=()=>loadSources(repoRoot),signal,lockPause=pause,lockDeadlineMs=55000}) {
 const clients=[];const evidence={result:'NO-GO — execution not completed',phase:'pre-write',sourceHashes:null,attestation:null,
  setup:{commitSent:false,commitAcknowledged:false},scenario6:'NOT TESTED',scenario12:'NOT TESTED',cleanup:'NOT REQUIRED',
  artifacts:{},observations:[],assertions:[],clients:[]};
 let connection,s,p,session={},pending=[],failure=null,restoreBody='',baselineRaw='',seedRaw='';
 let setupMayCommit=false,setupPrepared=false,restored=false,writeDeadline=Infinity,checkpointWritten=false;
 const command=async(c,name,sql,options={})=>{
  requireTrue(c&&!c.closed&&c.healthy,'SESSION_UNAVAILABLE');
  const restoration=evidence.phase==='cleanup'||evidence.phase==='independent preservation';
  if(!restoration&&signal?.aborted)stop('INTERRUPTED');
  if(!restoration)requireTrue(Date.now()<writeDeadline,'EXECUTION_360S');
  const result=await c.command(name,sql,{...options,signal:restoration?undefined:signal,
   timeoutMs:Math.min(options.timeoutMs??90000,restoration?90000:writeDeadline-Date.now())});
  // Fake sessions use history too; production additionally records actual command results.
  evidence.assertions.push({stage:name,completed:true,backendPid:c.pid});return result;
 };
 const start=(c,name,sql,options={})=>{
  const t={done:false,error:null,value:null,clientLabel:c.label};
  t.promise=command(c,name,sql,options).then(value=>{t.done=true;t.value=value;},error=>{t.done=true;t.error=error;});pending.push(t);return t;
 };
 const complete=async t=>{await t.promise;if(t.error)throw t.error;return t.value;};
 const verifyArtifacts=()=>{for(const name of ['baseline.json','restore-body.sql',...(seedRaw?['seed.json']:[]),...(checkpointWritten?['precommit-record.json']:[])])artifacts.verify(name);};
 const protect=()=>{if(signal?.aborted)stop('INTERRUPTED');verifyFrozen();verifyArtifacts();};
 const connect=async label=>{
  const c=await open(label,connection);clients.push(c);return c;
 };
 const noOtherTransactions=data=>{
  const owned=new Map(clients.filter(c=>c.pid).map(c=>[c.pid,`revit-n2-${c.label}`]));
  requireTrue(!data.activity.some(a=>a.xact_start&&(!owned.has(a.pid)||a.application_name!==owned.get(a.pid))),'UNRELATED_OPEN_TRANSACTION');
 };
 async function observe(name,kind) {
  const began=Date.now();
  for(;;){
   if(signal?.aborted)stop('INTERRUPTED');for(const t of pending)if(t.error)throw t.error;
   const result=await command(session.M,'monitor-'+name,readOnly(p.monitorSql),{timeoutMs:15000});const data=monitorData(result);
   noOtherTransactions(data);
   const pids=Object.fromEntries(['O','A','B','C','D','M'].map(l=>[l,session[l].pid]));
   try{assertLockEvidence(data,pids,kind);evidence.observations.push({barrier:name,engine:data});return data;}
   catch(error){
    if(!error.stopCode?.startsWith('LOCK_EVIDENCE_'))throw error;
    if(Date.now()-began>=lockDeadlineMs)throw error;
    // Bounded observation polling is not replay of any setup/RPC/failed statement.
    await lockPause();
   }
  }
 }
 const checkFull=count=>command(session.O,count===4?'s6-assertions':'s12-assertions',`\\set expected_count ${count}\n${p.blocks[17]}`);
 const rpcSql=vars=>{
  const sql=vars+p.blocks[9];
  return sql.replace('SELECT * FROM public.commit_verified_study_batch(',"SELECT 'N2_RPC|'||to_jsonb(r)::text FROM public.commit_verified_study_batch(")
   .replace(":'payload'::jsonb);",":'payload'::jsonb) r;");
 };
 function checkRpc(frame,number,client) {roleResult(frame,client);const row=jsonTag(frame,'N2_RPC');requireTrue(row.attempt_number===number,'ATTEMPT_NUMBER');return row;}
 async function cleanup() {
  evidence.phase='cleanup';evidence.cleanup='IN PROGRESS';
  // Stop/drain only owned workers; their transaction-scoped locks disappear on close.
  let drainFailed=false;
  for(const l of ['A','B','C'])if(session[l]&&!session[l].closed){try{await session[l].close();}catch{drainFailed=true;}}
  // COMMIT may never have reached the wire (deadline/cancellation). Never BEGIN cleanup
  // inside that still-open setup transaction, which would commit its fixtures accidentally.
  let originalBaselineUnchanged=false;
  if(!evidence.setup.commitAcknowledged&&session.O?.healthy&&!session.O.closed){
   try{
    const resolved=await command(session.O,'abort-setup-resolution',"ROLLBACK;\nSELECT 'N2_BASELINE_MATCH|'||(pg_temp.snapshot()=(SELECT j FROM n2_baseline))::text;",{allowNotices:true});
    originalBaselineUnchanged=tagged(resolved,'N2_BASELINE_MATCH')==='true';
   }catch{session.O.healthy=false;}
  }
  if(!session.O?.healthy||session.O.closed){
   await Promise.all(pending.filter(t=>t.clientLabel==='D').map(t=>t.promise));
   // D is already an initialized authorized owner, not a new/fallback credential or role.
   // Preserve committed false where possible, then stop: O's lost snapshots need reviewed recovery.
   if(session.D?.healthy&&!session.D.closed&&!session.D.busy){
    try{await command(session.D,'owner-lost-disable','ROLLBACK;\n'+p.blocks[19],{allowNotices:true});evidence.disabledAfterOwnerLoss=true;}catch{evidence.disabledAfterOwnerLoss=false;}
   }
   if(session.D&&!session.D.closed)await session.D.close();
   // Pack forbids automatic owner recovery after lost O. No fabricated baseline or replay.
   evidence.cleanup='OWNER LOST — original exports retained; separately reviewed recovery required';
   stop('OWNER_CONNECTION_LOST_RESTORATION_UNRESOLVED');
  }
  if(session.D&&!session.D.closed){try{await session.D.close();}catch{drainFailed=true;}}
  await Promise.all(pending.map(t=>t.promise));
  if(originalBaselineUnchanged){
   requireTrue(!drainFailed,'OWNED_DRAIN_UNCONFIRMED');verifyArtifacts();
   evidence.setup.reconciledCommitted=false;evidence.cleanup='ORIGINAL BASELINE UNCHANGED; NO COMMITTED SETUP';restored=true;return;
  }
  await command(session.O,'cleanup-disable',p.blocks[19]);
  requireTrue(!drainFailed,'OWNED_DRAIN_UNCONFIRMED');
  verifyArtifacts();
  const inventory=monitorData(await command(session.M,'inventory',readOnly(p.monitorSql),{timeoutMs:15000}));
  noOtherTransactions(inventory);
  assertWorkersDrained(inventory,clients);
  // A lost COMMIT acknowledgement is reconciled, never retried. A still-open setup rolls back.
  if(!evidence.setup.commitAcknowledged){
   const reconciled=await command(session.O,'reconcile-setup',
    "SELECT 'N2_COMMITTED_SETUP|'||EXISTS(SELECT FROM auth.users WHERE id='"+OWNER+"')::text;");
   requireTrue(tagged(reconciled,'N2_COMMITTED_SETUP')==='true','SETUP_COMMIT_UNCERTAIN');
   evidence.setup.reconciledCommitted=true;
  }
  verifyArtifacts();
  await command(session.O,'cleanup-restore',p.cleanupSql(restoreBody),{timeoutMs:90000});
  evidence.cleanup='ATOMIC RESTORATION COMMITTED';restored=true;
 }
 try {
  requireTrue(typeof env.REVIT_STAGING_DB_URL==='string'&&env.REVIT_STAGING_DB_URL.trim(),'MISSING_PRIVATE_URI');
  connection=validateEndpoint(env.REVIT_STAGING_DB_URL,expected);
  evidence.endpoint={host:connection.host,port:'5432',username:connection.user,database:'postgres',operatorAttestation:true};
  s=load();p=compilePack(s.pack);evidence.sourceHashes=s.sourceHashes;
  const runRead=async(label,name,sql)=>{const c=await connect(label);try{return await command(c,name,sql,{timeoutMs:120000});}finally{await c.close();}};
  evidence.phase='fresh pre-write gates';
  const pre=await runRead('pre-catalog','pre-catalog',s.catalogSql);compareCatalog(pre.text,s.catalogReference);
  const coverage=await runRead('pre-coverage','pre-coverage',s.coverageSql);
  requireTrue(isDeepStrictEqual(coverageMetadata(coverage.text),s.coverageReference),'COVERAGE_PRESERVATION_MISMATCH');
  // No helper DDL before the fresh event/FK/trigger checks and explicit attestation.
  for(const l of ['O','A','B','C','D']){session[l]=await connect(l);await command(session[l],'pre-helper-'+l,p.preHelper(l));}
  session.M=await connect('M');
  await command(session.M,'monitor-init',"\\set ON_ERROR_STOP on\n\\set VERBOSITY verbose\nSET application_name='revit-n2-M';\nSET statement_timeout='15s';");
  requireTrue(new Set(['O','A','B','C','D','M'].map(l=>session[l].pid)).size===6,'INDEPENDENT_BACKEND_PIDS');
  const inventory=monitorData(await command(session.M,'inventory',readOnly(p.monitorSql),{timeoutMs:15000}));noOtherTransactions(inventory);
  const confirmed=await confirmQuiescence();evidence.attestation={confirmed:confirmed===true,atUtc:new Date().toISOString()};
  requireTrue(confirmed===true,'QUIESCENCE_NOT_CONFIRMED');
  writeDeadline=Date.now()+360000;
  verifyFrozen();
  for(const l of ['O','A','B','C','D'])await command(session[l],'helpers-'+l,p.helpers);
  await command(session.O,'snapshot-helpers',p.snapshots);
  evidence.phase='durable baseline';
  const baseline=await command(session.O,'baseline',p.baseline);
  baselineRaw=tagged(baseline,'N2_BASELINE');JSON.parse(baselineRaw);
  restoreBody=validateRestoreBody(jsonTag(baseline,'N2_RESTORE'));
  evidence.artifacts.baseline=artifacts.create('baseline.json',copyText(baselineRaw));
  evidence.artifacts.restore=artifacts.create('restore-body.sql',restoreBody+'\n');verifyArtifacts();
  evidence.phase='setup';protect();
  const seed=await command(session.O,'setup-prepare',p.setupPrepare);setupPrepared=true;
  seedRaw=tagged(seed,'N2_SEED');JSON.parse(seedRaw);
  evidence.artifacts.seed=artifacts.create('seed.json',copyText(seedRaw));protect();
  evidence.artifacts.precommit=artifacts.create('precommit-record.json',JSON.stringify({atUtc:new Date().toISOString(),sourceHashes:evidence.sourceHashes,
   attestation:evidence.attestation,exports:evidence.artifacts,backendPids:Object.fromEntries(['O','A','B','C','D','M'].map(l=>[l,session[l].pid])),setupCommitSent:false},null,2)+'\n');
  checkpointWritten=true;verifyArtifacts();
  setupMayCommit=true;evidence.setup.commitSent=true;
  const ack=await command(session.O,'setup-commit',p.setupCommit);
  requireTrue(ack.text.split(/\r?\n/).includes('COMMIT')&&ack.text.includes('N2_SETUP_COMMIT_ACKNOWLEDGED'),'SETUP_COMMIT_ACK_MISSING');
  evidence.setup.commitAcknowledged=true;
  evidence.artifacts.commitAcknowledgement=artifacts.create('setup-commit-ack.json',JSON.stringify({atUtc:new Date().toISOString(),commitAcknowledged:true,
   actualOutput:ack.text,precommitHash:evidence.artifacts.precommit},null,2)+'\n');
  evidence.phase='Scenario6';
  await command(session.A,'s6-block',p.blocks[6]);
  const b=start(session.B,'s6-B-call',rpcSql(p.blocks[7]));
  await observe('s6-guard','s6-guard');
  const c=start(session.C,'s6-C-call',rpcSql(p.blocks[8]));
  await observe('s6-first','s6-first');protect();await command(session.A,'release-A','COMMIT;');
  const bRow=checkRpc(await complete(b),8,session.B);
  await observe('s6-second','s6-second');protect();await command(session.B,'commit-B','COMMIT;');
  const cRow=checkRpc(await complete(c),9,session.C);protect();await command(session.C,'commit-C','COMMIT;');
  await checkFull(4);await command(session.O,'s6-snapshot','CREATE TEMP TABLE n2_s6 AS SELECT pg_temp.snapshot() AS j;');
  for(const [l,row,vars] of [['B',bRow,p.blocks[7]],['C',cRow,p.blocks[8]]]){
   protect();const retry=await command(session[l],'retry-'+l,rpcSql(vars));
   requireTrue(isDeepStrictEqual(checkRpc(retry,row.attempt_number,session[l]),row),'RETRY_ROW_CHANGED');
   await command(session[l],'retry-commit-'+l,'COMMIT;');
   await command(session.O,'retry-snapshot-'+l,"SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_s6),'exact retry snapshot');");
   const conflict=await command(session[l],'conflict-'+l,p.blocks[10],{allowNotices:true});stateNotice(conflict,'23505');
   await command(session.O,'conflict-snapshot-'+l,"SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_s6),'exact conflict snapshot');");
  }
  evidence.scenario6='PASS';evidence.phase='Scenario12 forward';protect();
  await command(session.A,'forward-block',p.blocks[11]);
  const forward=start(session.B,'forward-call',rpcSql(p.blocks[12]));await observe('forward-guard','forward-guard');
  const disable=start(session.D,'forward-disable',p.blocks[13]);await observe('forward-first','forward-first');
  await command(session.A,'release-A','COMMIT;');checkRpc(await complete(forward),1,session.B);
  await observe('forward-second','forward-second');protect();await command(session.B,'forward-commit','COMMIT;');await complete(disable);
  await command(session.O,'forward-state',"SELECT pg_temp.require((SELECT count(*)=5 FROM public.question_attempts) AND (SELECT enabled FROM public.trusted_study_config WHERE id=1),'forward committed before disable commit');");
  await command(session.D,'forward-disable-commit','COMMIT;');
  const fresh=await command(session.B,'fresh-disabled',p.blocks[14],{allowNotices:true});stateNotice(fresh,'PT503');
  await command(session.O,'fresh-disabled-state',"SELECT pg_temp.require((SELECT count(*)=5 FROM public.question_attempts) AND NOT EXISTS(SELECT FROM public.question_attempts WHERE id='3e9a0000-3a2e-4e60-8000-000000002113'),'fresh disabled inserted nothing');");
  evidence.phase='Scenario12 reverse';protect();
  await command(session.O,'before-reverse','CREATE TEMP TABLE n2_before_reverse AS SELECT pg_temp.snapshot() AS j;');
  await command(session.O,'enable-reverse',p.blocks[15]);await command(session.D,'reverse-disable',p.blocks[13]);
  const reverseSql=p.blocks[16]+p.blocks[14].slice(p.blocks[14].indexOf('BEGIN ISOLATION LEVEL'));
  const reverse=start(session.B,'reverse-call',reverseSql,{allowNotices:true});await observe('reverse','reverse');
  await command(session.O,'reverse-held-state',"SELECT pg_temp.require((SELECT enabled FROM public.trusted_study_config WHERE id=1) AND NOT EXISTS(SELECT FROM public.question_attempts WHERE id IN('3e9a0000-3a2e-4e60-8000-000000002112','3e9a0000-3a2e-4e60-8000-000000002113')),'uncommitted disable, no forbidden attempts');");
  await command(session.D,'reverse-disable-commit','COMMIT;');stateNotice(await complete(reverse),'PT503');
  await checkFull(5);await command(session.O,'reverse-assertions',p.blocks[18]);evidence.scenario12='PASS';
 } catch(error){failure=/^[A-Z0-9_-]+$/.test(error?.stopCode)?error.stopCode:'LOCAL_OR_SQL_FAILURE';}
 finally {
  if(setupMayCommit){try{await cleanup();}catch(error){failure=error?.stopCode??'CLEANUP_FAILED';evidence.cleanup='UNRESOLVED — '+failure;}}
  else if(setupPrepared || session.O?.busy){evidence.cleanup='NO SETUP COMMIT SENT — owned transaction must roll back on closure';}
  // Close O before independent owner snapshot / Catalog, retaining M for drain evidence.
  for(const c of clients.filter(c=>c.label!=='M'))if(!c.closed){try{await c.close();}catch{failure='OWNED_CLOSURE_UNCONFIRMED';}}
  if(restored){
   try{
    evidence.phase='independent preservation';verifyArtifacts();
    const post=await connect('O-post');
    await command(post,'post-init',p.init('O-post'));
    const definitions=p.blocks[2].split("SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND NOT enabled)")[0];
    await command(post,'post-snapshot-helpers',definitions);
    await command(post,'import-original-baseline',"CREATE TEMP TABLE n2_baseline(j jsonb);\n\\copy n2_baseline(j) FROM 'scratch/phase3n-n2-evidence/baseline.json' WITH (FORMAT text)");
    const final=await command(post,'final-snapshot',readOnly("SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'independent original baseline equality');\nSELECT pg_temp.require(NOT EXISTS(SELECT FROM pg_prepared_xacts),'no prepared transactions');"));
    requireTrue(final.text.split(/\r?\n/).includes('ROLLBACK'),'FINAL_SNAPSHOT_ROLLBACK');await post.close();
    for(const [l,name,sql] of [['final-catalog','final-catalog',s.catalogSql],['final-coverage','final-coverage',s.coverageSql]]){
     const c=await connect(l);const result=await command(c,name,sql,{timeoutMs:120000});await c.close();
     if(name==='final-catalog')compareCatalog(result.text,s.catalogReference);
     else requireTrue(isDeepStrictEqual(coverageMetadata(result.text),s.coverageReference),'FINAL_COVERAGE_MISMATCH');
    }
    const remaining=monitorData(await command(session.M,'inventory',readOnly(p.monitorSql),{timeoutMs:15000}));noOtherTransactions(remaining);
    requireTrue(!remaining.activity.some(a=>/^revit-n2-(O|A|B|C|D)(?:-post)?$/.test(a.application_name)),'REMAINING_TEST_BACKENDS');
    evidence.cleanup='RESTORATION INDEPENDENTLY VERIFIED';
   }catch(error){failure=error?.stopCode??'FINAL_PRESERVATION_FAILED';evidence.cleanup='PRESERVATION UNPROVED — '+failure;}
  }
  for(const c of clients)if(!c.closed){try{await c.close();}catch{failure='OWNED_CLOSURE_UNCONFIRMED';}}
  if(!failure&&clients.some(c=>c.exitCode!==0))failure='CLIENT_EXIT_NOT_ZERO';
  evidence.clients=clients.map(c=>({label:c.label,backendPid:c.pid,closed:c.closed,exitCode:c.exitCode??null,healthy:c.healthy,frames:c.history}));
  evidence.timeoutBounds={statementMs:90000,lockMs:60000,idleTransactionMs:120000,monitorStatementMs:15000,cleanupLockMs:5000,cleanupStatementMs:15000,executionMs:360000,observationMs:lockDeadlineMs};
  if(!failure&&evidence.scenario6==='PASS'&&evidence.scenario12==='PASS'&&evidence.cleanup==='RESTORATION INDEPENDENTLY VERIFIED')
   evidence.result='PHASE 3N COMPLETE — SCENARIOS 6 AND 12 PASS; STAGING RESTORED';
  else evidence.result='NO-GO — '+(failure??'INCOMPLETE_EXECUTION');
  evidence.phase='stopped';
  const safe=JSON.parse(redact(JSON.stringify(evidence),connection?.needles??[]));await artifacts.save(safe);
 }
 return evidence;
}

async function main(){
 const repoRoot=fileURLToPath(new URL('../../../',import.meta.url)).replace(/[\\/]$/,'');
 requireTrue(process.argv[2]==='--run'&&process.argv.length===7,'ARGUMENTS');
 requireTrue(process.env.REVIT_STAGING_DB_URL,'MISSING_PRIVATE_URI');
 const connection=validateEndpoint(process.env.REVIT_STAGING_DB_URL,process.argv.slice(3));
 loadSources(repoRoot);
 const selfPath=fileURLToPath(import.meta.url),selfHash=sha(readFileSync(selfPath));
 const dir=join(repoRoot,'scratch/phase3n-n2-evidence');const store=evidenceStore(dir,connection.needles);
 for(const name of ['baseline.json','seed.json','restore-body.sql','precommit-record.json','setup-commit-ack.json'])requireTrue(!existsSync(join(dir,name)),'EXISTING_DURABLE_EXPORT_STOP');
 const abort=new AbortController();const cancel=()=>abort.abort();process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 const confirm=async()=>{const input=createInterface({input:process.stdin,output:process.stdout});try{return (await input.question('Type YES: staging ingress isolated; relevant background writers/jobs paused through restoration: ',{signal:abort.signal}))==='YES';}finally{input.close();}};
 try{
  const outcome=await runScenarios({repoRoot,env:process.env,expected:process.argv.slice(3),confirmQuiescence:confirm,artifacts:store,signal:abort.signal,
   verifyFrozen:()=>{loadSources(repoRoot);requireTrue(sha(readFileSync(selfPath))===selfHash,'EXECUTOR_SOURCE_DRIFT');},
   open:async(label,conn)=>new PsqlSession(label,spawn(PSQL,['-X','--no-password','--set=ON_ERROR_STOP=on','--pset=pager=off','-A','-t','--field-separator=|','--file=-'],
    {cwd:repoRoot,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:writeEnvironment(process.env,conn,label)}))});
  process.stdout.write(outcome.result+'\nSanitized evidence: '+store.path+'\n');
  if(outcome.result.startsWith('NO-GO'))process.exitCode=1;
 }finally{process.off('SIGINT',cancel);process.off('SIGTERM',cancel);connection.password='';connection.needles=[];}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('NO-GO — local prerequisite or evidence failure. No automatic retry.\n');process.exitCode=1;});
