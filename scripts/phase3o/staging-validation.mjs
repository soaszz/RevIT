// Prepared operator. Installation and committed synthetic runtime checks require separate approval.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, readdirSync, copyFileSync, constants, lstatSync, realpathSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { validateEndpoint, childEnvironment, redact } from '../../docs/phase3n/phase3n-n/automated-read-only-handshake.mjs';
import { PsqlSession, compilePack, validateRestoreBody } from '../../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';

const root = resolve(import.meta.dirname,'../..');
const source = path => readFileSync(join(root,path),'utf8');
const requireTrue = (ok, code) => { if (!ok) throw Object.assign(Error(code), { code }); };
export const signatures = {
  _trusted_study_metrics:'_trusted_study_metrics(uuid)',
  _apply_trusted_study_effects:'_apply_trusted_study_effects(uuid,uuid,uuid[],boolean)',
  create_rewarded_study_session:'create_rewarded_study_session(uuid,uuid,jsonb,text)',
  commit_rewarded_study_batch:'commit_rewarded_study_batch(uuid,uuid,jsonb)',
  complete_verified_study_session:'complete_verified_study_session(uuid,uuid,jsonb)',
  assert_trusted_study_enabled:'assert_trusted_study_enabled()',
  create_verified_study_session:'create_verified_study_session(uuid,uuid,jsonb,text)',
  commit_verified_study_batch:'commit_verified_study_batch(uuid,uuid,jsonb)',
};
export function verifyPins(manifest, read = path => readFileSync(join(root,path))) {
  for (const [file, hash] of Object.entries(manifest)) requireTrue(createHash('sha256').update(read(file)).digest('hex')===hash,'SOURCE_HASH_DRIFT');
}
// The first CLI/SQL failure is classified from the CLI output so a real migration syntax error is
// reported as MIGRATION_SQL_FAILED rather than a generic CLI_FAILED.
export function classifyCliFailure(status, error, output) {
  if (status===0&&!error) return output;
  const sqlState=/SQLSTATE\s+([0-9A-Z]{5})/.exec(output);
  throw Object.assign(Error(sqlState?`MIGRATION_SQL_FAILED: SQLSTATE ${sqlState[1]}`:'CLI_FAILED'),
    {code:sqlState?'MIGRATION_SQL_FAILED':'CLI_FAILED',sqlstate:sqlState?sqlState[1]:null});
}
// A post-install inspection must never overwrite the first CLI/SQL failure with a later registry drift error.
export function settleInstallation(installationFailure, inspect, records) {
  if(!installationFailure) return inspect();
  try { inspect(); } catch(inspectionError){ records.push({label:'post-install-inspection',code:inspectionError.code??'INSPECTION_STOP'}); }
  throw installationFailure;
}
export function snapshot(text) {
  requireTrue(!/\b(?:ERROR|FATAL|PANIC):/.test(text),'SNAPSHOT_SQL_ERROR');
  const lines=text.replaceAll('\r','').split('\n');
  requireTrue(lines.filter(x=>x==='ROLLBACK').length===1 && lines.filter(x=>x==='O_SNAPSHOT_ROLLBACK_COMPLETE').length===1,'SNAPSHOT_MARKERS');
  const rows=lines.filter(x=>x.startsWith('{') && x.includes('"registry"'));
  requireTrue(rows.length===1,'SNAPSHOT_ROWS'); return JSON.parse(rows[0]);
}
export function validateSnapshot(value, sql, foundation = '', installed = true) {
  requireTrue(value.database==='postgres' && value.current_user==='postgres' && value.session_user==='postgres'
    && value.read_only==='on' && value.isolation==='read committed' && value.prepared===0,'SESSION_OR_PREPARED');
  requireTrue(value.config?.length===1 && value.config[0].id===1 && value.config[0].enabled===false,'DISABLED_CONFIG');
  for (const [version,name] of [['202610160027','trusted_cutover_and_attempt_numbering'],...(installed?[['202610170028','atomic_study_completion']]:[])]) {
    const rows=value.registry.filter(r=>r.version===version);
    requireTrue(rows.length===1 && rows[0].name===name,'MIGRATION_REGISTRY');
  }
  const definitions=[...sql.matchAll(/create function public\.([a-z_]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gi)];
  requireTrue(definitions.length===5,'LOCAL_DEFINITION_PARSE');
  if(!installed){
    requireTrue(foundation.length>0,'FOUNDATION_REQUIRED_BEFORE_WRITE');
    requireTrue(!value.registry.some(r=>r.version==='202610170028')&&!value.routines.some(r=>definitions.some(([,name])=>name===r.name)),'MIGRATION_28_MUST_BE_ABSENT');
    definitions.length=0;
  }
  if (foundation) {
    const original=[...foundation.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\bas \$\$([\s\S]*?)\$\$;/gi)];
    requireTrue(original.length===3,'FOUNDATION_DEFINITION_PARSE');definitions.push(...original);
  }
  for (const [,name,body] of definitions) {
    const rows=value.routines.filter(r=>r.name===name);
    requireTrue(rows.length===1,'ROUTINE_OVERLOAD'); const r=rows[0];
    const expectedSettings=['search_path=pg_catalog, public, pg_temp',...(name==='complete_verified_study_session'?['timezone=UTC']:[])];
    const settings=r.settings?.map(s=>s.replace(/^[^=]+/,key=>key.toLowerCase())).sort();
    requireTrue(r.signature?.replace(/^public\./,'')===signatures[name]
      && r.owner==='postgres' && r.definer===true && r.leakproof===false && r.kind==='f'
      && r.volatility===(name==='_trusted_study_metrics'?'s':'v') && r.parallel==='u'
      && isDeepStrictEqual(settings,expectedSettings.sort())
      && r.source.replaceAll('\r\n','\n').trim()===body.replaceAll('\r\n','\n').trim()
      && !r.anon && !r.authenticated && r.service===!(name.startsWith('_') || name==='assert_trusted_study_enabled'),'INSTALLED_ROUTINE_OR_PRIVILEGE');
  }
}
export function rollbackProbe(rollback) {
  requireTrue((rollback.match(/^begin;$/gim)??[]).length===1 && (rollback.match(/^commit;$/gim)??[]).length===1,'ROLLBACK_SOURCE_BOUNDARY');
  const body=rollback.replace(/^begin;$/im,'').replace(/^commit;$/im,'');
  return `\\set ON_ERROR_STOP on\nBEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='3s';\n${body}\n
SELECT 1/((to_regprocedure('public.complete_verified_study_session(uuid,uuid,jsonb)') IS NULL
 AND to_regprocedure('public.commit_rewarded_study_batch(uuid,uuid,jsonb)') IS NULL
 AND to_regprocedure('public.create_rewarded_study_session(uuid,uuid,jsonb,text)') IS NULL
 AND to_regprocedure('public.commit_verified_study_batch(uuid,uuid,jsonb)') IS NOT NULL)::integer);
ROLLBACK;\n\\echo O_ROLLBACK_PROBE_COMPLETE\n`;
}
export function validateSuite(result) {
  const out=result.stdout.replaceAll('\r',''); const lines=out.split('\n');
  requireTrue(result.status===0 && !result.error && !/\b(?:ERROR|FATAL|PANIC):/.test(result.stderr)
    && lines.filter(x=>x==='ROLLBACK').length===1 && lines.filter(x=>x==='O_ATOMIC_VERIFICATION_ROLLBACK_COMPLETE').length===1,'SUITE_FAILED');
  requireTrue((result.stderr.match(/O_PASS /g)??[]).length>=50,'MISSING_ASSERTIONS');
  requireTrue(out.includes('service_role|postgres|read committed'),'ACTUAL_SERVICE_ROLE_MISSING');
}
export function coverage(text) {
  const lines=text.replaceAll('\r','').split('\n');
  requireTrue(lines.filter(x=>x==='ROLLBACK').length===1 && lines.includes('COVERAGE_READ_ONLY_ROLLBACK_COMPLETE'),'COVERAGE_MARKERS');
  // Tolerate the pinned Phase 3N reference log's aligned psql format (leading space before the JSON row); live output is -A -t.
  const rows=lines.filter(x=>x.trimStart().startsWith('{')&&x.includes('"event_settings"'));
  requireTrue(rows.length===1,'COVERAGE_METADATA');return JSON.parse(rows[0].trim());
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function durable(directory,name,value) {
  const bytes=typeof value==='string'?value:JSON.stringify(value,null,2);
  const file=join(directory,name),fd=openSync(file,'wx',0o600);
  try {writeFileSync(fd,bytes);fsyncSync(fd);} finally {closeSync(fd);}
  requireTrue(sha(readFileSync(file))===sha(bytes),'DURABLE_ARTIFACT_MISMATCH');return sha(bytes);
}
function tag(frame,name) {
  const rows=frame.text.split(/\r?\n/).filter(x=>x.startsWith(name+'|'));
  requireTrue(rows.length===1,'RUNTIME_CAPTURE_'+name);return JSON.parse(rows[0].slice(name.length+1));
}
const tables=['public.profiles','public.user_preferences','public.user_progress','public.study_sessions','public.question_attempts',
  'public.activity_events','public.daily_activity','public.user_achievements','public.question_reinforcement'];
export function inventorySql(pack,owner) {
  requireTrue(/^[0-9a-f-]{36}$/.test(owner),'MANIFEST_OWNER');
  const text=pack.snapshots;
  const start=text.indexOf(" SELECT jsonb_build_object(\n 'coverage'"); const end=text.indexOf(' INTO meta;',start);
  requireTrue(start>=0&&end>start,'METADATA_SOURCE_BOUNDARY');
  const meta=text.slice(start,end).trim();
  return `DO $$ DECLARE xp_rows bigint; BEGIN
IF EXISTS(SELECT FROM auth.users WHERE id<>'${owner}') THEN RAISE EXCEPTION 'Foreign auth user'; END IF;
${tables.map(t=>`IF EXISTS(SELECT FROM ${t} WHERE ${t==='public.profiles'?'id':'user_id'}<>'${owner}') THEN RAISE EXCEPTION 'Foreign owner in ${t}'; END IF;`).join('\n')}
IF EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) d WHERE d.key NOT IN('auth.users',${tables.map(t=>`'${t}'`).join(',')}) AND d.value::bigint<>0)
 OR EXISTS(SELECT FROM pg_prepared_xacts) THEN RAISE EXCEPTION 'Untracked descendant/prepared transaction'; END IF;
IF to_regclass('public.user_xp_transactions') IS NOT NULL THEN
 IF NOT EXISTS(SELECT FROM pg_class WHERE oid='public.user_xp_transactions'::regclass AND relkind='r' AND relpersistence='p'
 AND relowner='postgres'::regrole) OR EXISTS(SELECT FROM pg_inherits WHERE inhrelid='public.user_xp_transactions'::regclass
 OR inhparent='public.user_xp_transactions'::regclass) THEN RAISE EXCEPTION 'Unsupported optional XP relation'; END IF;
 EXECUTE 'SELECT count(*) FROM public.user_xp_transactions' INTO xp_rows;
 IF xp_rows<>0 THEN RAISE EXCEPTION 'Untracked optional XP rows'; END IF;
END IF;
END $$;
SELECT 'O_INVENTORY|'||jsonb_build_object('data',jsonb_build_object(
 'auth.users',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'hash',md5(to_jsonb(u)::text)) ORDER BY id),'[]') FROM auth.users u),
 ${tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY ${t==='public.user_preferences'?'user_id':'id'}),'[]') FROM ${t} x)`).join(',')}
 ),'meta',(${meta}), 'routines',(SELECT jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,
 ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)) ORDER BY p.oid) FROM pg_proc p
 WHERE p.pronamespace='public'::regnamespace AND p.proname IN('_trusted_study_metrics','_apply_trusted_study_effects',
 'create_rewarded_study_session','commit_rewarded_study_batch','complete_verified_study_session')))::text;`;
}
export function checkFixture(seed,current,owner) {
  requireTrue(isDeepStrictEqual(seed.meta,current.meta)&&isDeepStrictEqual(seed.routines,current.routines),'RUNTIME_METADATA_DRIFT');
  const data=current.data, original=seed.data;
  for(const t of ['auth.users','public.profiles','public.user_preferences','public.question_attempts','public.user_achievements','public.question_reinforcement'])
    requireTrue(isDeepStrictEqual(original[t],data[t]),'IMMUTABLE_FIXTURE_DRIFT');
  requireTrue(data['auth.users'].length===1&&data['auth.users'][0].id===owner&&data['public.question_attempts'].length===2,'FIXTURE_MANIFEST');
  const base=original['public.study_sessions'][0],s=data['public.study_sessions'][0];
  requireTrue(data['public.study_sessions'].length===1&&s?.id===base.id,'SESSION_MANIFEST');
  const strip=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
  requireTrue(isDeepStrictEqual(strip(base,['completed_at','completion_receipt']),strip(s,['completed_at','completion_receipt'])),'SESSION_IMMUTABILITY');
  const completed=s.completed_at!==null,receipt=s.completion_receipt;
  if(completed)requireTrue(receipt?.sessionId===s.id&&receipt.contract===1&&receipt.totalXp===65&&receipt.xpAwarded===20
    &&receipt.attemptCount===2&&receipt.correctCount===2&&receipt.level===1&&receipt.unlocked?.length===0
    &&Number.isFinite(Date.parse(receipt.completedAt))&&Date.parse(receipt.completedAt)===Date.parse(s.completed_at)
    &&/^[a-f0-9]{32}$/.test(receipt.fingerprint)&&isDeepStrictEqual(receipt.attemptIds,original['public.question_attempts'].toSorted((a,b)=>a.session_slot-b.session_slot).map(a=>a.id)),'COMPLETION_RECEIPT');
  else requireTrue(receipt===null,'ORPHAN_RECEIPT');
  const events=data['public.activity_events'],old=original['public.activity_events'];
  requireTrue(old.length===3&&old.every(e=>events.some(x=>isDeepStrictEqual(e,x)))&&events.length===old.length+Number(completed),'EVENT_MANIFEST');
  const extra=events.filter(e=>!old.some(x=>x.id===e.id));
  if(completed){const e=extra[0];requireTrue(e.user_id===owner&&e.event_key==='study-session:'+s.id&&e.event_type==='study_session_completed'
    &&e.xp_awarded===20&&e.leaderboard_xp===0&&e.trusted_effect_version===1&&e.trusted_session_id===s.id
    &&e.trusted_attempt_id===null&&e.subject_id===null&&e.subject_name===null&&Number.isFinite(Date.parse(e.occurred_at))
    &&Date.parse(e.occurred_at)<=Date.parse(s.completed_at),'COMPLETION_EVENT');}
  for(const [t,key,value] of [['public.daily_activity','review_count',Number(completed)],['public.user_progress','total_xp',completed?65:45]]){
    requireTrue(data[t].length===1&&original[t].length===1&&data[t][0][key]===value
      &&isDeepStrictEqual(strip(original[t][0],[key,'updated_at']),strip(data[t][0],[key,'updated_at'])),'MUTABLE_FIXTURE_DRIFT');
  }
  return true;
}
export function drained(rows,workers) {
  requireTrue(workers.every(c=>c.closed&&Number.isInteger(c.pid)),'WORKER_CLOSURE_UNCONFIRMED');
  for(const row of rows) {
    requireTrue(!/^revit-phase3o-(B|C)$/.test(row.application_name)&&!row.blockers.some(p=>workers.some(c=>c.pid===p)),'ACTIVE_TEST_WORKER');
    if(workers.some(c=>c.pid===row.pid))requireTrue(row.application_name==='Supavisor'&&row.usename==='postgres'&&row.state==='idle'&&row.xact_start===null
      &&row.blockers.length===0&&row.lock_count===0,'POOLED_WORKER_NOT_DRAINED');
  }
}
export async function concurrent({connection,env,directory,records,fault,fixtureSource,recover=false,openClient,lockDeadlineMs=5000}) {
  const p=compilePack(source('docs/phase3n/phase3n-n/EXECUTION_PACK.md'));
  const retained=recover?JSON.parse(sourcePath(join(directory,'runtime-precommit.json'))):null;
  if(retained)requireTrue(isDeepStrictEqual(Object.keys(retained.hashes).sort(),['runtime-baseline.json','runtime-owner.json','runtime-restore.sql','runtime-seed.json'].sort()),'RECOVERY_ARTIFACT_ALLOWLIST');
  const owner=retained?.owner??randomUUID(),clients=[],hashes={...(retained?.hashes??{})};let mayCommit=recover,restored=false,seed,body,baseline;
  function open(label){
    if(openClient){const client=openClient(label);clients.push(client);return client;}
    const childEnv=childEnvironment(env,connection,label);childEnv.PGAPPNAME='revit-phase3o-'+label;
    childEnv.PGOPTIONS='-c statement_timeout=20000 -c lock_timeout=15000 -c idle_in_transaction_session_timeout=60000';
    const client=new PsqlSession(label,spawn('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-A','-t','-v','ON_ERROR_STOP=1'],
      {env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']}),{timeoutMs:25000});clients.push(client);return client;
  }
  const o=open('O'),m=open('M');let a,b;
  const inventory=inventorySql(p,owner);
  const save=(name,value)=>{hashes[name]=durable(directory,name,value);};
  const verify=()=>{for(const [file,hash] of Object.entries(hashes))requireTrue(sha(readFileSync(join(directory,file)))===hash,'ORIGINAL_ARTIFACT_DRIFT');};
  const locks="SELECT format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE;',split_part(k,'.',1),split_part(k,'.',2)) FROM (SELECT jsonb_object_keys(pg_temp.dependency_counts()) k UNION SELECT 'public.trusted_study_config' UNION SELECT 'public.user_xp_transactions' WHERE to_regclass('public.user_xp_transactions') IS NOT NULL) x ORDER BY k COLLATE \"C\" \\gexec";
  try {
    if(recover){
      verify();baseline=JSON.parse(sourcePath(join(directory,'runtime-baseline.json')));
      seed=JSON.parse(sourcePath(join(directory,'runtime-seed.json')));body=validateRestoreBody(sourcePath(join(directory,'runtime-restore.sql')));
      requireTrue(JSON.parse(sourcePath(join(directory,'runtime-owner.json'))).owner===owner,'ORIGINAL_OWNER_BINDING');
      const guard=p.snapshots.indexOf("SELECT pg_temp.require((SELECT count(*)=1 AND bool_and(id=1 AND NOT enabled)");
      requireTrue(guard>0,'RECOVERY_HELPER_BOUNDARY');
      await o.command('recovery-helpers',p.init('O')+'\n'+p.snapshots.slice(0,guard));
      await m.command('runtime-monitor-ready','BEGIN READ ONLY; SELECT pg_backend_pid(); ROLLBACK;');
      requireTrue(o.pid!==m.pid,'INDEPENDENT_OWNER_MONITOR');
      const delimiter='$o_'+randomUUID().replaceAll('-','')+'$';const json=JSON.stringify(baseline);
      requireTrue(!json.includes(delimiter),'BASELINE_LITERAL');
      await o.command('original-baseline-import',`CREATE TEMP TABLE n2_baseline AS SELECT ${delimiter}${json}${delimiter}::jsonb j;`);
      return;
    }
    // Reuse only N's accepted identity/coverage/snapshot/ACL-export helpers, never its setup/scenarios.
    await o.command('helpers',p.init('O')+'\n'+p.snapshots);
    await m.command('runtime-monitor-ready','BEGIN READ ONLY; SELECT pg_backend_pid(); ROLLBACK;');
    requireTrue(o.pid!==m.pid,'INDEPENDENT_OWNER_MONITOR');
    const captured=await o.command('original-baseline',p.baseline);
    baseline=tag(captured,'N2_BASELINE');body=validateRestoreBody(tag(captured,'N2_RESTORE'));
    save('runtime-baseline.json',baseline);save('runtime-restore.sql',body);save('runtime-owner.json',{owner});
    await o.command('setup',`BEGIN; SET LOCAL lock_timeout='3s'; ${locks}\n
SELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'original baseline under locks');
${fixtureSource}
SELECT user_id AS o_owner,id AS o_session FROM pg_temp.new_session('wrong_answers',2,'${owner}') \\gset
SELECT * FROM public.commit_rewarded_study_batch(:'o_owner',:'o_session',pg_temp.batch((SELECT s FROM public.study_sessions s WHERE id=:'o_session'),true,true));`);
    seed=tag(await o.command('seed',inventory),'O_INVENTORY');checkFixture(seed,seed,owner);
    save('runtime-seed.json',seed);save('runtime-precommit.json',{hashes:{...hashes},owner});verify();
    mayCommit=true;await o.command('setup-commit','COMMIT;');save('runtime-setup-ack.json',{committed:true});
    const session=seed.data['public.study_sessions'][0],ids=seed.data['public.question_attempts'].toSorted((x,y)=>x.session_slot-y.session_slot).map(x=>x.id);
    a=open('B');b=open('C');
    const begin="BEGIN; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{\"role\":\"service_role\"}'; SET LOCAL ROLE service_role;";
    await a.command('begin',begin);await b.command('begin',begin);
    const rpc=`SELECT public.complete_verified_study_session('${owner}','${session.id}','${JSON.stringify(ids)}')::text;`;
    const first=await a.command('complete',rpc);const waiting=b.command('identical-completion',rpc);waiting.catch(()=>{});
    let lock;const deadline=Date.now()+lockDeadlineMs;
    do {
      lock=tag(await m.command('lock-evidence',`SELECT 'O_LOCK|'||jsonb_build_object('pids',jsonb_build_array(pg_backend_pid(),${a.pid},${b.pid}),
 'blocked',${a.pid}=ANY(pg_blocking_pids(${b.pid})), 'advisory',EXISTS(SELECT FROM pg_locks w JOIN pg_locks h
 ON w.database=h.database AND w.classid=h.classid AND w.objid=h.objid AND w.objsubid=h.objsubid
 WHERE w.pid=${b.pid} AND h.pid=${a.pid} AND w.locktype='advisory' AND h.locktype='advisory' AND NOT w.granted AND h.granted
 AND w.mode='ExclusiveLock' AND h.mode='ExclusiveLock' AND w.objsubid=1
 AND w.classid=((hashtextextended('${owner}:trusted-study',0)>>32)&4294967295)::oid
 AND w.objid=(hashtextextended('${owner}:trusted-study',0)&4294967295)::oid))::text;`),'O_LOCK');
      if(lock.blocked&&lock.advisory)break;await new Promise(r=>setTimeout(r,20));
    } while(Date.now()<deadline);
    requireTrue(lock.blocked&&lock.advisory&&new Set([...lock.pids,o.pid]).size===4,'COMPLETION_ENGINE_LOCK_MISSING');
    await a.command('completion-commit','COMMIT;');const second=await waiting;
    requireTrue([first,second].every(f=>f.connection.current_user==='service_role'&&f.connection.session_user==='postgres'
      &&f.connection.isolation==='read committed'&&f.connection.read_only==='off'),'ACTUAL_SERVICE_ROLE');
    requireTrue(first.text.trim()===second.text.trim(),'CONCURRENT_RECEIPT_MISMATCH');
    await b.command('retry-rollback','ROLLBACK;');
    const completed=tag(await o.command('completed-state',inventory),'O_INVENTORY');checkFixture(seed,completed,owner);
    const faultSql=`\\set ON_ERROR_STOP on\n\\set VERBOSITY verbose\nBEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s';
${fixtureSource}
SELECT user_id AS o_owner,id AS o_session FROM pg_temp.new_session() \\gset
SELECT * FROM public.commit_rewarded_study_batch(:'o_owner',:'o_session',pg_temp.batch((SELECT s FROM public.study_sessions s WHERE id=:'o_session'),true,true));
SELECT jsonb_agg(id ORDER BY session_slot)::text AS o_ids FROM public.question_attempts WHERE session_id=:'o_session' \\gset
CREATE FUNCTION pg_temp.o_commit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'O_INJECTED_BEFORE_COMMIT' USING ERRCODE='P0001'; END $$;
CREATE CONSTRAINT TRIGGER o_commit_fault AFTER UPDATE ON public.study_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION pg_temp.o_commit_fault();
SET LOCAL ROLE service_role;
SELECT public.complete_verified_study_session(:'o_owner',:'o_session',:'o_ids');
\\echo O_PRECOMMIT_COMPLETION_RETURNED
COMMIT;`;
    fault(faultSql);
    requireTrue(isDeepStrictEqual(completed,tag(await o.command('after-failed-commit',inventory),'O_INVENTORY')),'PRECOMMIT_BASELINE_MISMATCH');
  } finally {
    try {
    await Promise.allSettled([a,b].filter(Boolean).map(c=>c.close()));
    if(mayCommit){
      if(!o.healthy||o.closed){
        // Only the already-owned monitor may attempt the disabling fence, never a test replay.
        await m.command('emergency-disable',"BEGIN; SET LOCAL lock_timeout='3s'; UPDATE public.trusted_study_config SET enabled=false WHERE id=1; COMMIT;");
        requireTrue(false,'RESTORATION_OWNER_LOST_RETAIN_ARTIFACTS');
      }
      verify();
      await o.command('reconcile','ROLLBACK;');
      await o.command('disable',"BEGIN; SET LOCAL lock_timeout='3s'; UPDATE public.trusted_study_config SET enabled=false WHERE id=1; COMMIT;");
      const rows=tag(await m.command('drain',`SELECT 'O_DRAIN|'||coalesce(jsonb_agg(to_jsonb(x)),'[]')::text FROM
 (SELECT pid,application_name,usename,state,xact_start,pg_blocking_pids(pid) blockers,(SELECT count(*) FROM pg_locks l WHERE l.pid=s.pid) lock_count
 FROM pg_stat_activity s WHERE datname=current_database() AND pid NOT IN(${o.pid},${m.pid})) x;`),'O_DRAIN');
      drained(rows,[a,b].filter(Boolean));
      requireTrue(!rows.some(r=>r.state!=='idle'||r.xact_start!==null),'UNRELATED_WRITER_DURING_CLEANUP');
      await o.command('cleanup-locks',`BEGIN; SET LOCAL lock_timeout='3s'; ${locks}`);
      const current=tag(await o.command('cleanup-manifest',inventory),'O_INVENTORY');
      const n=current.data['auth.users'].length;
      requireTrue(n===0||n===1,'OWNERSHIP_MISMATCH');
      if(n){checkFixture(seed,current,owner);verify();
        await o.command('cleanup',`${['public.activity_events','public.daily_activity','public.user_achievements','public.question_reinforcement','public.question_attempts','public.study_sessions','public.user_progress','public.user_preferences'].map(t=>`DELETE FROM ${t} WHERE user_id='${owner}';`).join('\n')}
DELETE FROM public.profiles WHERE id='${owner}';
SELECT pg_temp.require(NOT EXISTS(SELECT FROM jsonb_each_text(pg_temp.dependency_counts()) WHERE key<>'auth.users' AND value::bigint<>0),'children empty before parent');
DELETE FROM auth.users WHERE id='${owner}';`);
      }else requireTrue((isDeepStrictEqual(current.meta,baseline.meta)||isDeepStrictEqual(current.meta,seed.meta))
        &&isDeepStrictEqual(current.routines,seed.routines),'EMPTY_SETUP_METADATA_DRIFT');
      verify();await o.command('restore',`${body}\nSELECT pg_temp.require(pg_temp.snapshot()=(SELECT j FROM n2_baseline),'ORIGINAL_BASELINE_MATCH'); COMMIT;`);
      restored=true;
    } else if(o.healthy&&!o.closed) await o.command('no-setup-commit','ROLLBACK;');
    } finally {
    const closure=await Promise.allSettled(clients.filter(c=>!c.closed).map(c=>c.close()));
    records.push({label:'concurrent-runtime',owner,restored,hashes,clients:clients.map(c=>({label:c.label,pid:c.pid,closed:c.closed,exitCode:c.exitCode,
      history:redact(JSON.stringify(c.history),connection.needles),stderr:redact(c.err,connection.needles)}))});
    requireTrue(closure.every(c=>c.status==='fulfilled'),'OWNED_CLIENT_CLOSURE_FAILED');
    }
  }
}
const sourcePath=path=>readFileSync(path,'utf8');
const acceptedNArchive='scratch/phase3n-n2-evidence/archives/recovered-6d2d9276-20261017T043455238Z-4e19355f-3564-471d-a433-ed0b892777b4';
export function acceptedPreservation() {
  const encoded=source(acceptedNArchive+'/baseline.json');
  requireTrue(encoded.endsWith('\n')&&!encoded.trimEnd().includes('\n'),'ORIGINAL_COPY_ROW');
  const decoded=encoded.slice(0,-1).replace(/\\([\\tnr])/g,(_m,c)=>({'\\':'\\',t:'\t',n:'\n',r:'\r'}[c]));
  const roundtrip=decoded.replaceAll('\\','\\\\').replaceAll('\t','\\t').replaceAll('\n','\\n').replaceAll('\r','\\r')+'\n';
  requireTrue(roundtrip===encoded,'ORIGINAL_COPY_ENCODING');
  return JSON.parse(decoded);
}
export function assertDryRun(text) {
  const clean=text;
  const files=clean.match(/\b[0-9]{12,14}_[A-Za-z0-9_]+\.sql\b/g)??[];
  requireTrue(clean.includes('Would push these migrations:')&&files.length===1&&files[0]==='202610170028_atomic_study_completion.sql'
    &&!/Would seed|Would create custom roles/i.test(clean),'DRY_RUN_NOT_EXACTLY_28');
}
export function cliEndpoint(connection, writable=false) {
  requireTrue(connection?.host&&connection.user&&connection.password&&connection.sslmode,'CLI_ENDPOINT');
  return `postgresql://${encodeURIComponent(connection.user)}:${encodeURIComponent(connection.password)}@${connection.host}:5432/postgres?sslmode=${connection.sslmode}&options=${encodeURIComponent(`-c default_transaction_read_only=${writable?'off':'on'} -c statement_timeout=20000 -c lock_timeout=3000`)}`;
}
export function cliArgv(args, workspace, endpoint) {
  requireTrue(Array.isArray(args)&&args[0]!=='link'&&!args.includes('--linked')&&!args.includes('--include-roles')&&!args.includes('--include-seed'),'CLI_SCOPE');
  // The CLI groups --linked/--local/--db-url as mutually exclusive; --db-url alone selects the isolated target.
  return ['--workdir',workspace,'--yes',...args,'--db-url',endpoint];
}
export function preserveInstallation(before,after,pre,post) {
  requireTrue(isDeepStrictEqual(before.registry,after.registry.filter(r=>r.version!=='202610170028')),'EARLIER_HISTORY_CHANGED');
  const old={...after,registry:before.registry,routines:after.routines.filter(r=>!['_trusted_study_metrics',
    '_apply_trusted_study_effects','create_rewarded_study_session','commit_rewarded_study_batch','complete_verified_study_session'].includes(r.name))};
  requireTrue(isDeepStrictEqual(before,old),'INSTALLATION_BASELINE_CHANGED');
  const view=structuredClone(post);const columns=new Map([['completion_contract',21],['completion_receipt',3802],
    ['trusted_effect_version',21],['trusted_session_id',2950],['trusted_attempt_id',2950]]);
  const allowed=new Set();let added=0;
  for(const relation of view.relations){
    const prior=pre.relations.find(r=>r.oid===relation.oid);requireTrue(prior,'NEW_RELATION');
    relation.columns=relation.columns.filter(c=>{
      if(prior.columns.some(p=>p[0]===c[0]))return true;
      requireTrue(columns.get(c[1])===c[2]&&!c[4]&&c[5]===''&&c[6]===''&&c[7]===true&&c[11]===true&&c[12]===0
        &&c[13].length===0&&c[14]===null&&
        ((relation.name.endsWith('study_sessions')&&['completion_contract','completion_receipt'].includes(c[1]))
        ||(relation.name.endsWith('activity_events')&&c[1].startsWith('trusted_'))),'UNREVIEWED_COLUMN');
      requireTrue(!allowed.has(c[1]),'DUPLICATE_NEW_COLUMN');allowed.add(c[1]);added++;return false;
    });
  }
  requireTrue(added===5,'MISSING_MIGRATION_COLUMNS');
  const constraints=new Set();view.constraints=view.constraints.filter(c=>{
    if(pre.constraints.some(p=>p[0]===c[0]))return true;
    const name={'study_sessions_completion_contract_check':'completion_contract','activity_events_trusted_effect_version_check':'trusted_effect_version'}[c[3]];
    requireTrue(name&&c[4]==='c'&&c[5]===true&&c[6]===false&&c[7]===false&&c[8]===`CHECK ((${name} = 1))`,'UNREVIEWED_CONSTRAINT');
    constraints.add(c[0]);return false;
  });
  requireTrue(constraints.size===2,'MISSING_MIGRATION_CHECKS');
  view.dependencies=view.dependencies.filter(d=>!(d[2]===2606&&constraints.has(d[3])));
  requireTrue(isDeepStrictEqual(pre,view),'UNREVIEWED_INSTALLATION_SCHEMA_CHANGE');
}
function installationReference(evidenceRoot,manifest) {
  const files=readdirSync(evidenceRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name.startsWith('staging-install-'))
    .map(d=>join(evidenceRoot,d.name,'installation-receipt.json')).filter(existsSync);
  requireTrue(files.length===1,'UNIQUE_VERIFIED_INSTALLATION_RECEIPT_REQUIRED');
  const receipt=JSON.parse(sourcePath(files[0]));const directory=resolve(files[0],'..');
  requireTrue(receipt.outcome==='MIGRATION_28_INSTALLED_DISABLED_AND_PRESERVED'
    &&receipt.migrationHash===manifest['supabase/migrations/202610170028_atomic_study_completion.sql']
    &&isDeepStrictEqual(Object.keys(receipt.hashes).sort(),['installed-coverage.json','installed-snapshot.json']),'INSTALLATION_MIGRATION_HASH');
  for(const [name,hash] of Object.entries(receipt.hashes))requireTrue(sha(readFileSync(join(directory,name)))===hash,'INSTALLATION_EVIDENCE_HASH');
  return {snapshot:JSON.parse(sourcePath(join(directory,'installed-snapshot.json'))),coverage:JSON.parse(sourcePath(join(directory,'installed-coverage.json')))};
}
export async function run(expected, env=process.env, mode='run', recoveryDirectory) {
  let directory; const records=[]; let stage='LOCAL_PRECONDITIONS';
  try {
    requireTrue(env.REVIT_STAGING_DB_URL,'MISSING_PRIVATE_URI');
    requireTrue(env.REVIT_PHASE3O_OPERATION_APPROVED===mode,'EXPLICIT_OPERATION_SCOPE_REQUIRED');
    requireTrue(env.REVIT_PHASE3O_QUIESCENT==='YES','QUIESCENCE_ATTESTATION_REQUIRED');
    const connection=validateEndpoint(env.REVIT_STAGING_DB_URL,expected);
    const manifest=JSON.parse(source('docs/phase3o/SOURCE_HASHES.json')); verifyPins(manifest);
    const migration=source('supabase/migrations/202610170028_atomic_study_completion.sql');
    const foundation=source('supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql');
    const probe=rollbackProbe(source('supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql'));
    const diagnostic=source('supabase/tests/atomic_study_completion_snapshot.sql');
    const catalog=source('docs/phase3n/phase3n-n/COVERAGE_READ_ONLY_RECHECK.psql');
    const suite=source('supabase/tests/atomic_study_completion_verification.sql').replace('\\ir atomic_study_completion_fixture.sql',source('supabase/tests/atomic_study_completion_fixture.sql'));
    requireTrue(!suite.includes('\\ir ') && !/^\s*commit\s*;/im.test(suite),'SUITE_TRANSACTION_BOUNDARY');
    requireTrue(['run','install','recover'].includes(mode),'OPERATOR_MODE');
    const evidenceRoot=join(root,'scratch/phase3o');mkdirSync(evidenceRoot,{recursive:true});
    requireTrue(!lstatSync(evidenceRoot).isSymbolicLink()&&realpathSync(evidenceRoot).toLowerCase()===evidenceRoot.toLowerCase(),'EVIDENCE_REDIRECTION');
    directory=mode==='recover'?resolve(recoveryDirectory):join(evidenceRoot,`staging-${mode}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`);
    if(mode==='recover')requireTrue(directory.toLowerCase().startsWith(evidenceRoot.toLowerCase()+'\\')&&!lstatSync(directory).isSymbolicLink()
      &&realpathSync(directory).toLowerCase()===directory.toLowerCase(),'RECOVERY_DIRECTORY');
    else mkdirSync(directory,{recursive:false});
    function execute(label,sql,writable=false,expectedFailure=false) {
      verifyPins(manifest); stage=label;
      const childEnv=childEnvironment(env,connection,'phase3o-'+label);
      // Only this rollback suite gets a writable transaction. PG defaults stay process-local.
      if (writable) childEnv.PGOPTIONS='-c default_transaction_read_only=off -c statement_timeout=20000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=60000';
      const result=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-A','-t','-v','ON_ERROR_STOP=1'],
        {env:childEnv,input:sql,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024});
      records.push({label,status:result.status,signal:result.signal,error:result.error?.code??null,
        stdout:redact(result.stdout??'',connection.needles),stderr:redact(result.stderr??'',connection.needles)});
      if(expectedFailure)requireTrue(result.status===3&&!result.error&&result.stdout.includes('O_PRECOMMIT_COMPLETION_RETURNED')
        &&/ERROR:\s+P0001:\s+O_INJECTED_BEFORE_COMMIT/.test(result.stderr)&&!/^COMMIT\r?$/m.test(result.stdout),'EXPECTED_COMMIT_FAILURE_MISSING');
      else requireTrue(result.status===0 && !result.error && !/\b(?:ERROR|FATAL|PANIC):/.test(result.stderr),'PSQL_FAILED');
      return result;
    }
    let before,metadata;
    if(mode==='recover'){
      const original=JSON.parse(sourcePath(join(directory,'original-state.json')));
      requireTrue(isDeepStrictEqual(Object.keys(original.hashes).sort(),['before-coverage.json','before-snapshot.json']),'ORIGINAL_STATE_ALLOWLIST');
      requireTrue(original.sourceManifest===sha(source('docs/phase3o/SOURCE_HASHES.json')),'RECOVERY_SOURCE_MANIFEST_CHANGED');
      for(const [file,hash] of Object.entries(original.hashes))requireTrue(sha(readFileSync(join(directory,file)))===hash,'ORIGINAL_STATE_HASH');
      before=JSON.parse(sourcePath(join(directory,'before-snapshot.json')));metadata=JSON.parse(sourcePath(join(directory,'before-coverage.json')));
    }else{
      before=snapshot(execute('before',diagnostic).stdout); validateSnapshot(before,migration,foundation,mode!=='install');
      metadata=coverage(execute('coverage-before',catalog).stdout);
      if(mode==='install'){
        const original=acceptedPreservation();
        requireTrue(isDeepStrictEqual(before.registry,original.meta.registry)&&isDeepStrictEqual(before.config,original.data['public.trusted_study_config'])
          &&isDeepStrictEqual(metadata,coverage(source('scratch/phase3n-n2-evidence/coverage-readonly-Catalog-20261016T150743557Z-768ad107.log'))),'PHASE_3N_PRESERVATION_DRIFT');
      }
      else {
        const reference=installationReference(evidenceRoot,manifest);
        requireTrue(isDeepStrictEqual(before,reference.snapshot)&&isDeepStrictEqual(metadata,reference.coverage),'INSTALLED_BASELINE_DRIFT');
      }
      const hashes={'before-snapshot.json':durable(directory,'before-snapshot.json',before),'before-coverage.json':durable(directory,'before-coverage.json',metadata)};
      durable(directory,'original-state.json',{hashes,sourceManifest:sha(source('docs/phase3o/SOURCE_HASHES.json'))});
    }
    // Fresh activity gate: no active/transactional clients. Idle pooler backends are not terminated.
    execute('quiescence', `BEGIN READ ONLY; SET LOCAL statement_timeout='15s';
SELECT 1/((NOT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()
 AND backend_type='client backend' AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)))::integer);
ROLLBACK;`);
    if(mode==='install'){
      const workspace=join(directory,'cli-workspace'),config=join(workspace,'supabase');mkdirSync(config,{recursive:true});
      durable(config,'config.toml','project_id="revit-phase3o-staging"\n[db]\nmajor_version=17\n[db.migrations]\nenabled=true\n[db.seed]\nenabled=false\n[db.vault]\n');
      const cli=join(root,'scratch/phase3n-m2-cli-workspace/bin/supabase.exe');
      const cliRun=(label,args,writable=false)=>{
        verifyPins(manifest);stage=label;
        const cliEnv=Object.fromEntries(Object.entries(childEnvironment(env,connection,label)).filter(([key])=>!/^SUPABASE_/i.test(key)));
        const endpoint=cliEndpoint(connection,writable);
        const result=spawnSync(cli,cliArgv(args,workspace,endpoint),{env:cliEnv,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024,input:''});
        records.push({label,status:result.status,error:result.error?.code??null,stdout:redact(result.stdout??'',connection.needles),stderr:redact(result.stderr??'',connection.needles)});
        return classifyCliFailure(result.status,result.error??null,(result.stdout??'')+'\n'+(result.stderr??''));
      };
      const expectedFiles=before.registry.map(r=>`${r.version}_${r.name}.sql`).sort();
      requireTrue(expectedFiles.every(f=>/^[0-9]+_[A-Za-z0-9_]+\.sql$/.test(f)),'UNSUPPORTED_HISTORY_FILENAME');
      cliRun('history-fetch',['migration','fetch']);
      const active=join(config,'migrations');
      requireTrue(isDeepStrictEqual(readdirSync(active).sort(),expectedFiles),'FETCHED_HISTORY_MISMATCH');
      const name='202610170028_atomic_study_completion.sql',destination=join(active,name);
      copyFileSync(join(root,'supabase/migrations',name),destination,constants.COPYFILE_EXCL);
      requireTrue(sha(readFileSync(destination))===manifest['supabase/migrations/'+name],'PENDING_MIGRATION_HASH');
      cliRun('migration-list',['migration','list']);assertDryRun(cliRun('dry-run',['db','push','--dry-run']));
      const finalBefore=snapshot(execute('immediate-prewrite',diagnostic).stdout);validateSnapshot(finalBefore,migration,foundation,false);
      requireTrue(isDeepStrictEqual(before,finalBefore)&&isDeepStrictEqual(metadata,coverage(execute('immediate-prewrite-coverage',catalog).stdout)),'PREWRITE_DRIFT');
      // The only migration write. --install is supplied only after separate human authorization.
      let installationFailure;
      try{cliRun('install-28',['db','push'],true);}catch(error){installationFailure=error;records.push({label:'first-installation-failure',code:error.code??'INSTALLATION_STOP'});}
      const {after,post}=settleInstallation(installationFailure,()=>{
        const after=snapshot(execute('installed',diagnostic).stdout);validateSnapshot(after,migration,foundation);
        const post=coverage(execute('installed-coverage',catalog).stdout);preserveInstallation(before,after,metadata,post);
        return {after,post};
      },records);
      const hashes={'installed-snapshot.json':durable(directory,'installed-snapshot.json',after),'installed-coverage.json':durable(directory,'installed-coverage.json',post)};
      durable(directory,'installation-receipt.json',{outcome:'MIGRATION_28_INSTALLED_DISABLED_AND_PRESERVED',migrationHash:manifest['supabase/migrations/202610170028_atomic_study_completion.sql'],hashes});
      stage='MIGRATION_28_INSTALLED_DISABLED_AND_PRESERVED';return;
    }
    let testFailure;
    try {
      if(mode!=='recover')validateSuite(execute('atomic-suite',suite,true));
      await concurrent({connection,env,directory,records,fixtureSource:source('supabase/tests/atomic_study_completion_fixture.sql'),recover:mode==='recover',
        fault:sql=>execute('deferred-commit-failure',sql,true,true)});
      if(mode!=='recover'){
      const rollback=execute('rollback-probe',probe,true).stdout.replaceAll('\r','').split('\n');
      requireTrue(rollback.filter(x=>x==='ROLLBACK').length===1 && rollback.filter(x=>x==='O_ROLLBACK_PROBE_COMPLETE').length===1,'ROLLBACK_PROBE_MARKERS');
      }
    } catch(error) { testFailure=error;records.push({label:'first-runtime-failure',code:error.code??error.stopCode??'RUNTIME_STOP'}); }
    // A failed child exits/closes its transaction. Always inspect preservation independently; never replay writes.
    const after=snapshot(execute('after',diagnostic).stdout); validateSnapshot(after,migration,foundation);
    requireTrue(isDeepStrictEqual(before,after),'INDEPENDENT_BASELINE_MISMATCH');
    const final=coverage(execute('coverage-after',catalog).stdout);
    requireTrue(isDeepStrictEqual(metadata,final),'COVERAGE_PRESERVATION_MISMATCH');
    if (testFailure) throw testFailure;
    stage=mode==='recover'?'ORIGINAL_STAGING_BASELINE_RESTORED':'ATOMIC_RUNTIME_AND_INDEPENDENT_PRESERVATION_VERIFIED';
  } catch(error) {
    stage='NO-GO — '+(error.code??'OPERATOR_STOP')+(error.sqlstate?': SQLSTATE '+error.sqlstate:''); process.exitCode=1;
  } finally {
    if (directory) {
      const fd=openSync(join(directory,mode==='recover'?`recovery-${randomUUID()}.json`:'evidence.json'),'wx',0o600);
      try { writeFileSync(fd,JSON.stringify({result:stage,records},null,2)); fsyncSync(fd); } finally {closeSync(fd);}
      console.log(`Evidence: ${directory}`);
    }
    console.log(stage);
  }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (!['--run','--install','--recover'].includes(process.argv[2])) { console.log('Prepared staging operator. Not executed.'); process.exitCode=1; }
  else await run(process.argv.slice(3,7),process.env,process.argv[2].slice(2)==='install'?'install':process.argv[2]==='--recover'?'recover':'run',process.argv[7]);
}
