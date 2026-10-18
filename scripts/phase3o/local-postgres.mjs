// Disposable localhost only. No Supabase URI, credential store or staging connection.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { PsqlSession } from '../../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';
import { rollbackProbe } from './staging-validation.mjs';

const root = resolve(import.meta.dirname, '../..');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
if (!existsSync(join(bin,'../share/postgres.bki'))) throw Error('LOCAL_POSTGRES_SERVER_SHARE_MISSING: client-only/incomplete installation; no server started.');
const directory = join(root, 'scratch/phase3o', randomUUID());
mkdirSync(directory, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PG|REVIT_|SUPABASE_|NODE_OPTIONS|NODE_EXTRA_CA_CERTS)/i.test(key)));
function run(name, args, input) {
  const result = spawnSync(join(bin, name + '.exe'), args, { env, input, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error || result.status !== 0) throw new Error(`${name}: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
const port = await new Promise((accept, reject) => {
  const server = createServer(); server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => accept(p)); });
});
const args = ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
run('initdb', ['-D', join(directory, 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '-E', 'UTF8']);
let started = false;
let verified;
const clients = [];
try {
  run('pg_ctl', ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  run('psql', args, `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA public, auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO anon,authenticated,service_role;`);
  const files = ['supabase/tests/staging_baseline_init.sql',
    'supabase/migrations/202610130023_strasinger_book_edition_support.sql',
    'supabase/migrations/202610150024_leaderboard_helper_privileges.sql',
    'supabase/migrations/202610150025_trusted_study_persistence.sql',
    'supabase/migrations/202610160026_trusted_persistence_idempotency_hardening.sql',
    'supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql',
    'supabase/migrations/202610170028_atomic_study_completion.sql'];
  for (const file of files) run('psql', [...args, '-f', join(root, file)]);
  const result = run('psql', [...args, '-f', join(root, 'supabase/tests/atomic_study_completion_verification.sql')]);
  writeFileSync(join(directory, 'verification.log'), result);
  if (!result.includes('O_ATOMIC_VERIFICATION_ROLLBACK_COMPLETE')) throw Error('Missing verification completion');
  // Committed fixtures and fault triggers below exist ONLY inside this disposable localhost cluster.
  run('psql', args, readFileSync(join(root, 'supabase/tests/atomic_study_completion_local_setup.sql'), 'utf8'));
  function open(label) {
    const client = new PsqlSession(label, spawn(join(bin, 'psql.exe'), [...args, '-A', '-t'], { env, windowsHide: true, stdio: ['pipe','pipe','pipe'] }), { timeoutMs: 15000 });
    clients.push(client); return client;
  }
  const a = open('B'), b = open('C'), m = open('M');
  const owner = '3e0a0000-0000-4000-8000-000000000001';
  const planned=JSON.parse(run('psql',[...args,'-A','-t'],`SELECT jsonb_build_object('session',s.id,'ids',
    (select jsonb_agg(id order by session_slot) from public.question_attempts where session_id=s.id)) FROM public.study_sessions s where user_id='${owner}';`).trim());
  const completion = `SELECT public.complete_verified_study_session('${owner}','${planned.session}','${JSON.stringify(planned.ids)}')::text;`;
  const begin=`BEGIN; SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='10s';
    SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{"role":"service_role"}'; SET LOCAL ROLE service_role;`;
  await a.command('begin', begin);
  await b.command('begin', begin);
  const first = await a.command('complete', completion);
  const pending = b.command('same-completion', completion);
  let blocked = false;
  const deadline = Date.now()+5000;
  while (Date.now()<deadline) {
    const frame = await m.command('lock-evidence', `SELECT ${a.pid}=ANY(pg_blocking_pids(${b.pid})) AS blocked;`);
    if (frame.text.trim()==='t') { blocked=true; break; }
    await new Promise(r=>setTimeout(r,25));
  }
  if (!blocked || a.pid===b.pid || a.pid===m.pid || b.pid===m.pid) throw Error('Independent lock contention missing');
  await a.command('commit', 'COMMIT;');
  const second = await pending;
  if ([first,second].some(frame=>frame.connection.current_user!=='service_role' || frame.connection.isolation!=='read committed'
    || frame.connection.read_only!=='off')) throw Error('Concurrent worker role/isolation boundary failed');
  if (first.text.trim()!==second.text.trim()) throw Error('Concurrent receipt mismatch');
  await b.command('commit', 'COMMIT;');
  const checked = await m.command('concurrent-counts', `DO $$ BEGIN
    IF (select count(*) from public.activity_events where user_id='${owner}' and event_type='study_session_completed')<>1
      OR (select total_xp from public.user_progress where user_id='${owner}')<>65 THEN RAISE EXCEPTION 'Duplicate completion'; END IF;
  END $$;`);
  // A real deferred constraint error at COMMIT must undo completion, activity, daily and XP together.
  const before = run('psql', [...args, '-A','-t'], `select row_to_json(x) from (select
    (select jsonb_agg(to_jsonb(t) order by id) from public.activity_events t) events,
    (select jsonb_agg(to_jsonb(t) order by id) from public.user_progress t) progress,
    (select jsonb_agg(to_jsonb(t) order by id) from public.study_sessions t) sessions,
    (select jsonb_agg(to_jsonb(t) order by id) from public.daily_activity t) daily) x;`);
  const fault = spawnSync(join(bin,'psql.exe'), args, { env, windowsHide:true, encoding:'utf8',timeout:15000,
    input: `\\set VERBOSITY verbose
BEGIN; SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'; SET LOCAL request.jwt.claim.role='service_role';
CREATE FUNCTION public.local_commit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'O_INJECTED_BEFORE_COMMIT' USING ERRCODE='P0001'; END $$;
CREATE CONSTRAINT TRIGGER local_commit_fault AFTER UPDATE ON public.study_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.local_commit_fault();
SELECT public.complete_verified_study_session('3e0a0000-0000-4000-8000-000000000002',
 (select id from public.study_sessions where user_id='3e0a0000-0000-4000-8000-000000000002'),
 (select jsonb_agg(id order by session_slot) from public.question_attempts where user_id='3e0a0000-0000-4000-8000-000000000002')); COMMIT;` });
  if (fault.status!==3 || !/ERROR:\s+P0001:\s+O_INJECTED_BEFORE_COMMIT/.test(fault.stderr)) throw Error('Expected COMMIT failure missing');
  const after = run('psql',[...args,'-A','-t'], `select row_to_json(x) from (select
    (select jsonb_agg(to_jsonb(t) order by id) from public.activity_events t) events,
    (select jsonb_agg(to_jsonb(t) order by id) from public.user_progress t) progress,
    (select jsonb_agg(to_jsonb(t) order by id) from public.study_sessions t) sessions,
    (select jsonb_agg(to_jsonb(t) order by id) from public.daily_activity t) daily) x;`);
  if (before!==after) throw Error('Deferred COMMIT failure changed persisted state');
  run('psql',args,'update public.trusted_study_config set enabled=false where id=1;');
  const probe=run('psql',args,rollbackProbe(readFileSync(join(root,'supabase/rollbacks/202610170028_atomic_study_completion_rollback.sql'),'utf8')));
  if (!probe.includes('O_ROLLBACK_PROBE_COMPLETE')) throw Error('Rollback probe incomplete');
  verified={ result:'PASS', port, first, second,
    pids:clients.map(c=>c.pid), lockObserved:blocked, checked, deferredCommitExit:fault.status, deferredCommitError:fault.stderr, baselineEqual:true };
} finally {
  const closure=await Promise.allSettled(clients.map(client=>client.close()));
  if (started) run('pg_ctl', ['-D', join(directory,'data'), '-m', 'fast', '-w', 'stop']);
  if (closure.some(item=>item.status==='rejected')) { console.error('Local test client closure failed; server stopped.'); process.exitCode=1; }
}
if (verified && process.exitCode!==1) {
  writeFileSync(join(directory,'engine.json'),JSON.stringify(verified,null,2));
  console.log(`PASS: SQL assertions, independent concurrent completion, deferred COMMIT rollback. Evidence: ${directory}`);
}
