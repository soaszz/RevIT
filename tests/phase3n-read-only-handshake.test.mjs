import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runHandshake, validateEndpoint, childEnvironment, verifySources, redact } from '../docs/phase3n/phase3n-n/automated-read-only-handshake.mjs';

const labels = ['O', 'A', 'B', 'C', 'D'];
const pids = { O: 90101, A: 90102, B: 90103, C: 90104, D: 90105, M: 90106 };
const prompt = n => `Barrier ${n}: capture M monitor ${n === 1 ? 'now' : 'again'}, then press Enter: `;
const mPrompt = 'M pass 1 complete. Move all five sessions to Barrier 2, then press Enter here: ';
const catalog = ['N6_RELATION_GUARD_ROLLBACK_COMPLETE', 'N5_READ_ONLY_RECHECK_ROLLBACK_COMPLETE', 'N3_READ_ONLY_PREFLIGHT_ROLLBACK_COMPLETE', 'N6_SCHEMA_SUPPLEMENT_ROLLBACK_COMPLETE'].map(x => `ROLLBACK\n${x}\n`).join('') + 'N6_CATALOG_RECHECK_COMPLETE\n';

function fixture(fault = '') {
  const clients = [], events = [], saved = [];
  let clock = 0;
  function spawnClient(label, args, options) {
    const c = new EventEmitter();
    Object.assign(c, { label, args, options, stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 700 + clients.length, killed: false });
    c.stdout.setEncoding = c.stderr.setEncoding = () => {};
    const output = text => {
      // Prompt and row boundaries can cross arbitrary chunks, including CRLF.
      for (let i = 0; i < text.length; i += 13) c.stdout.emit('data', text.slice(i, i + 13));
    };
    const close = code => { c.closed = true; c.emit('close', code, null); };
    c.kill = () => { c.killed = true; events.push(`kill:${label}`); close(null); return true; };
    c.stdin = new EventEmitter();
    c.stdin.destroy = () => {};
    let pass = 1;
    const worker = n => {
      let role = ['B', 'C'].includes(label) ? 'service_role' : 'postgres';
      if (fault === 'role' && label === 'C') role = 'postgres';
      let backend = pids[label];
      if (fault === 'pid' && label === 'A' && n === 2) backend++;
      if (fault === 'duplicate' && label === 'A') backend = pids.O;
      output(`BEGIN\r\n${backend}|${role}|postgres|${fault === 'readonly' ? 'off' : 'on'}|${fault === 'isolation' ? 'repeatable read' : 'read committed'}|revit-n5-${label}|${fault === 'rows' ? '1' : '0'}\r\n${prompt(n)}`);
    };
    const monitor = n => {
      if (fault === 'monitor' || (fault === 'm-second' && n === 2)) { c.stderr.emit('data', 'ERROR: 42601 diagnostic failure\n'); close(3); return; }
      const backend = pids.M + (fault === 'mpid' && n === 2 ? 1 : 0);
      output(`BEGIN\n${backend}|postgres|postgres|on|0\n`);
      for (const l of [...labels, 'M'].sort()) {
        output(`revit-n5-${l}|${pids[l]}|postgres|postgres|revit-n5-${l}|${l === 'M' ? 'active' : 'idle in transaction'}|2026-10-17 08:00:00+00|||${fault === 'blocker' ? '{42}' : '{}'}|${fault === 'lock' ? 'f' : 't'}\n`);
      }
      output('ROLLBACK\nN5_MONITOR_RECHECK_COMPLETE\n');
      if (n === 1) output(mPrompt);
      else { if (fault !== 'm-marker') output('N6_MONITOR_TWO_PASSES_COMPLETE\n'); close(0); }
    };
    c.stdin.write = value => {
      assert.equal(value, '\n');
      events.push(`release:${label}:${pass}`);
      if (label === 'M') monitor(2);
      else if (pass++ === 1) { output('ROLLBACK\n'); worker(2); }
      else { output(`${fault === 'rollback' && label === 'D' ? '' : 'ROLLBACK\n'}${fault === 'marker' && label === 'D' ? '' : 'N5_SESSION_RECHECK_COMPLETE\n'}`); if (fault !== 'hang-close') close(0); }
      return true;
    };
    clients.push(c); events.push(`start:${label}`);
    queueMicrotask(() => {
      if (fault === 'timeout') return;
      if (fault === 'launch') { c.emit('error', new Error('private launch details')); close(-1); return; }
      if (fault === 'secret' && label === 'O') {
        c.stderr.emit('data', 'password=fixture-secret postgresql://user:fixture-secret@private.invalid/db\n'); close(3); return;
      }
      if (label === 'M') monitor(1);
      else if (label === 'Catalog') { if (fault === 'catalog-timeout') return; output(fault === 'catalog' ? catalog.replace('N6_CATALOG_RECHECK_COMPLETE', '') : catalog); close(0); }
      else worker(1);
    });
    return c;
  }
  return {
    clients, events, saved,
    options: {
      spawnClient, now: () => clock, pause: async () => { clock += 10; },
      verifyBeforeSpawn: () => {},
      saveEvidence: evidence => saved.push(evidence),
      connection: { host: 'test.pooler.supabase.com', user: 'postgres.qnepjfcbzsycmesrcbjb', password: 'fixture-secret', sslmode: 'require', needles: ['fixture-secret'] },
      repoRoot: process.cwd(), parentEnv: { PATH: 'test', PGHOST: 'forbidden', REVIT_STAGING_DB_URL: 'private', NODE_OPTIONS: '--unwanted' },
    },
  };
}

test('success coordinates both observations before release; uses SQL PIDs; Catalog starts after six clean exits', async () => {
  const f = fixture();
  await runHandshake(f.options);
  assert.deepEqual(f.clients.map(c => c.label), [...labels, 'M', 'Catalog']);
  for (const l of labels) assert.ok(f.clients[5].args.includes(`--set=n5_${l}_pid=${pids[l]}`));
  assert.ok(f.events.indexOf('release:M:1') > f.events.indexOf('release:D:1'));
  assert.ok(f.events.indexOf('release:O:2') > f.events.indexOf('release:M:1'));
  assert.equal(f.clients.some(c => c.killed), false);
  assert.equal(f.saved[0].result, 'HANDSHAKE_COMPLETE_CATALOG_CAPTURED_REVIEW_REQUIRED');
  for (const c of f.clients) {
    assert.equal(c.options.windowsHide, true);
    assert.equal(c.options.shell, false);
    assert.equal(c.options.env.REVIT_STAGING_DB_URL, undefined);
    assert.equal(c.options.env.NODE_OPTIONS, undefined);
    assert.equal(c.options.env.PGPASSWORD, 'fixture-secret');
    assert.doesNotMatch(c.args.join(' '), /fixture-secret|postgresql:\/\//);
  }
});

for (const fault of ['timeout', 'pid', 'duplicate', 'role', 'readonly', 'isolation', 'rows', 'mpid', 'monitor', 'm-second', 'm-marker', 'blocker', 'lock', 'marker', 'rollback', 'launch', 'hang-close', 'catalog', 'catalog-timeout', 'secret']) {
  test(`${fault}: fail closed, no retry, cleanup only owned clients, sanitized evidence`, async () => {
    const f = fixture(fault);
    await assert.rejects(runHandshake(f.options), /HANDSHAKE_STOP/);
    assert.equal(new Set(f.clients.map(c => c.label)).size, f.clients.length);
    assert.ok(f.clients.length >= 5);
    assert.ok(f.clients.every(c => c.closed));
    if (!['catalog', 'catalog-timeout'].includes(fault)) assert.equal(f.clients.some(c => c.label === 'Catalog'), false);
    if (fault === 'role') assert.equal(f.events.some(e => e.startsWith('release:')), false);
    if (['monitor', 'm-second', 'm-marker'].includes(fault)) assert.equal(f.events.some(e => /^release:[OABCD]:2$/.test(e)), false);
    const evidence = JSON.stringify(f.saved);
    assert.doesNotMatch(evidence, /fixture-secret|postgresql:\/\/user/);
    assert.equal(f.saved[0].result, 'FAILED');
    assert.notEqual(f.saved[0].reason, 'SOURCE_INTEGRITY');
  });
}

test('endpoint rejects production, transaction pooling, options, ambiguous URI, stale dashboard values', () => {
  const expected = ['fresh.pooler.supabase.com', '5432', 'postgres.qnepjfcbzsycmesrcbjb', 'postgres'];
  const uri = 'postgresql://postgres.qnepjfcbzsycmesrcbjb:pass%40word@fresh.pooler.supabase.com:5432/postgres?sslmode=require';
  assert.equal(validateEndpoint(uri, expected).password, 'pass@word');
  for (const bad of [uri.replace(':5432', ':6543'), uri.replace('fresh.pooler', 'stale.pooler'), uri.replace('/postgres?', '/other?'), uri.replace('sslmode=require', 'options=bad'), uri.replace('qnepjfcbzsycmesrcbjb', 'lznsdxfvxeckflxsohig'), uri + '#extra', uri.replace('pass%40word', ''),
    ...['%00', '%1f', '%7f', '%zz'].map(value => uri.replace('pass%40word', value)), uri + '\t']) assert.throws(() => validateEndpoint(bad, expected));
  assert.throws(() => validateEndpoint(uri, [...expected.slice(0, 3), 'other']));
});

test('redacts full and encoded secrets, URI, JWT and credential assignments before evidence', () => {
  const text = 'secret%40value secret@value postgresql://user:any@host/db password=unknown authorization=Bearer abc abcdefghijkl.abcdefghijkl.abcdefghijkl';
  const safe = redact(text, ['secret@value', 'secret%40value']);
  assert.doesNotMatch(safe, /secret@value|secret%40value|unknown|abcdefghijk|postgresql:\/\//i);
});

test('inherited libpq and runtime overrides are removed from child environment', () => {
  const env = childEnvironment({ PGOPTIONS: 'read write', pgservice: 'bad', REVIT_STAGING_DB_URL: 'hidden', NODE_OPTIONS: 'bad', PATH: 'ok' }, { host: 'h', user: 'u', password: 'p', sslmode: 'require' }, 'O');
  assert.equal(env.pgservice, undefined);
  assert.equal(env.PGOPTIONS, '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=30000');
  assert.equal(env.PGPASSFILE, 'NUL');
});

test('reviewed source hashes pass and reject mutated or missing files/anchors before spawning', () => {
  const root = process.env.REVIT_OFFLINE_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
  const checked = verifySources(root);
  assert.equal(checked['../phase3n-n5/MONITOR_READ_ONLY_RECHECK.psql'], '31fc5e1f4c2463632b799f768ca5e12d55a2b87756fe94c82b1a41cf1dc765db');
  for (const name of [...Object.keys(checked), 'SOURCE_HASHES.json', 'run-read-only-recheck.ps1']) {
    for (const missing of [false, true]) {
      assert.throws(() => verifySources(root, path => {
        if (path.replaceAll('\\', '/').endsWith(name.replace('../phase3n-n5/', '').replace('../../../scratch/phase3n-n2-evidence/', ''))) {
          if (missing) throw new Error('missing fixture');
          return Buffer.from('mutated fixture');
        }
        return readFileSync(path);
      }), /HANDSHAKE_STOP/);
    }
  }
});

test('source rejection starts no clients; wrapper deadline and cancellation close only owned clients', async () => {
  const blocked = fixture();
  blocked.options.verifyBeforeSpawn = () => { throw new Error('changed source'); };
  await assert.rejects(runHandshake(blocked.options));
  assert.equal(blocked.clients.length, 0);
  const timed = fixture('timeout');
  let clock = 0;
  timed.options.now = () => clock;
  timed.options.pause = async () => { clock += 360000; };
  await assert.rejects(runHandshake(timed.options));
  assert.equal(timed.saved[0].reason, 'WRAPPER_360S');
  assert.ok(timed.clients.every(c => c.killed));
  const canceled = fixture('timeout');
  const controller = new AbortController();
  canceled.options.signal = controller.signal;
  canceled.options.pause = async () => { controller.abort(); };
  await assert.rejects(runHandshake(canceled.options));
  assert.equal(canceled.saved[0].reason, 'INTERRUPTED');
  assert.ok(canceled.clients.every(c => c.killed));
});

test('local child-process fixture proves pipe transport and non-newline prompt handling; never spawns psql', async () => {
  const root = process.env.REVIT_OFFLINE_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
  const f = fixture();
  const actual = [];
  await runHandshake({ ...f.options, repoRoot: root, now: undefined, pause: undefined,
    spawnClient: (label, args) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/phase3n-psql-child.mjs', import.meta.url)), label, ...args.filter(a => a.startsWith('--set=n5_'))],
        { cwd: root, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH }, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      actual.push(child);
      return child;
    },
  });
  assert.equal(actual.length, 7);
  assert.ok(actual.every(c => c.exitCode === 0));
  assert.equal(f.saved[0].result, 'HANDSHAKE_COMPLETE_CATALOG_CAPTURED_REVIEW_REQUIRED');
});
