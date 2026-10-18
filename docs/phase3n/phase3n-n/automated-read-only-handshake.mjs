// Local preparation only. CLI execution is reserved for the authorized operator.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const labels = ['O', 'A', 'B', 'C', 'D'];
const psqlPath = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const reviewedManifestHash = '5651740733778adfbac2433afc8fdca99c90f761288272ecc0cbf5ba7eab651f';
const reviewedLauncherHash = 'fe45e016310d5a1f2bf55ed5a6ba7f3acbf81c467d51f2bba98fd13cae63efee';
const sourceNames = [
  'RELATION_READ_ONLY_GUARD.sql', 'CATALOG_READ_ONLY_RECHECK.psql', 'SCHEMA_READ_ONLY_SUPPLEMENT.sql',
  'MONITOR_TWO_PASSES.psql', 'Redact-Evidence.ps1', '../phase3n-n5/READ_ONLY_RECHECK.sql',
  '../phase3n-n5/SESSION_READ_ONLY_RECHECK.psql', '../phase3n-n5/MONITOR_READ_ONLY_RECHECK.psql',
  '../../../scratch/phase3n-n2-evidence/read-only-preflight.sql',
];
const workerPrompt = n => `Barrier ${n}: capture M monitor ${n === 1 ? 'now' : 'again'}, then press Enter: `;
const monitorPrompt = 'M pass 1 complete. Move all five sessions to Barrier 2, then press Enter here: ';
const catalogMarkers = ['N6_RELATION_GUARD_ROLLBACK_COMPLETE', 'N5_READ_ONLY_RECHECK_ROLLBACK_COMPLETE',
  'N3_READ_ONLY_PREFLIGHT_ROLLBACK_COMPLETE', 'N6_SCHEMA_SUPPLEMENT_ROLLBACK_COMPLETE', 'N6_CATALOG_RECHECK_COMPLETE'];
function stop(code) { throw Object.assign(new Error('HANDSHAKE_STOP'), { stopCode: code }); }
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hasControl = text => [...text].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

export function verifySources(repoRoot, read = readFileSync) {
  try {
    const base = join(repoRoot, 'docs/phase3n/phase3n-n6');
    const bytes = read(join(base, 'SOURCE_HASHES.json'));
    if (sha(bytes) !== reviewedManifestHash) stop('SOURCE_MANIFEST');
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (Object.keys(manifest).sort().join('\n') !== [...sourceNames].sort().join('\n')) stop('SOURCE_ALLOWLIST');
    for (const name of sourceNames) {
      if (sha(read(resolve(base, name))) !== manifest[name]) stop('SOURCE_HASH');
    }
    if (sha(read(join(base, 'run-read-only-recheck.ps1'))) !== reviewedLauncherHash) stop('LAUNCHER_HASH');
    return manifest;
  } catch { stop('SOURCE_INTEGRITY'); }
}

export function validateEndpoint(privateUri, expected) {
  try {
    const [host, port, user, database] = expected;
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(host) || port !== '5432' ||
      user !== 'postgres.qnepjfcbzsycmesrcbjb' || database !== 'postgres') stop('DASHBOARD');
    if (!privateUri || /[\s\\]/.test(privateUri) || hasControl(privateUri) || privateUri.includes('lznsdxfvxeckflxsohig')) stop('URI');
    const uri = new URL(privateUri);
    if (!['postgres:', 'postgresql:'].includes(uri.protocol) || uri.hostname !== host || uri.port !== port ||
      uri.pathname !== '/postgres' || uri.hash || !['', '?sslmode=require', '?sslmode=verify-full'].includes(uri.search) ||
      decodeURIComponent(uri.username) !== user) stop('URI');
    const password = decodeURIComponent(uri.password);
    if (!password || hasControl(password)) stop('PASSWORD');
    return { host, user, password, sslmode: uri.search === '?sslmode=verify-full' ? 'verify-full' : 'require',
      needles: [privateUri, password, uri.password, encodeURIComponent(password), decodeURIComponent(privateUri)] };
  } catch { stop('ENDPOINT'); }
}

export function childEnvironment(parent, connection, label) {
  // No libpq fallback/service/options, psql rc, URI, or Node preload inherited by clients.
  const env = Object.fromEntries(Object.entries(parent).filter(([key]) =>
    !/^PG/i.test(key) && !/^(REVIT_STAGING_DB_URL|NODE_OPTIONS|NODE_PATH|PSQLRC)$/i.test(key)));
  return Object.assign(env, { PGHOST: connection.host, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: connection.user,
    PGPASSWORD: connection.password, PGPASSFILE: 'NUL', PGSSLMODE: connection.sslmode, PGCONNECT_TIMEOUT: '10',
    PGCLIENTENCODING: 'UTF8', PGAPPNAME: `revit-readonly-auto-${label}`,
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=30000' });
}

export function redact(text, needles = []) {
  for (const needle of [...needles].filter(Boolean).sort((a, b) => b.length - a.length)) text = text.split(needle).join('[REDACTED]');
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"<>]+/gi, '[REDACTED_URI]')
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![A-Za-z0-9_-])/g, '[REDACTED_JWT]')
    .replace(/(\b(?:password|passwd|pwd|authorization|apikey|api_key|access_token|refresh_token|service_role_key|jwt_secret)\b\s*[:=]\s*)(?:Bearer\s+)?(?:'[^']*'|"[^"]*"|[^\s,;]+)/gi, '$1[REDACTED]');
}

function lines(client) {
  let text = client.out.replaceAll('\r', '');
  for (const prompt of [workerPrompt(1), workerPrompt(2), monitorPrompt]) text = text.replaceAll(prompt, '\n');
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}
const count = (client, marker) => lines(client).filter(l => l === marker).length;
function backend(text) {
  if (!/^[1-9][0-9]*$/.test(text) || Number(text) > 2147483647) stop('INVALID_SQL_PID');
  return Number(text);
}
function workerBoundary(client, pass) {
  const rows = lines(client).filter(l => /^\d+\|/.test(l)).map(l => l.split('|'));
  if (rows.length !== pass || count(client, 'ROLLBACK') !== pass - 1) stop('WORKER_SEQUENCE');
  for (const r of rows) {
    const role = ['B', 'C'].includes(client.label) ? 'service_role' : 'postgres';
    if (r.length !== 7 || r[1] !== role || r[2] !== 'postgres' || r[3] !== 'on' || r[4] !== 'read committed' ||
      r[5] !== `revit-n5-${client.label}` || r[6] !== '0') stop('WORKER_BOUNDARY');
    if (client.backendPid && backend(r[0]) !== client.backendPid) stop('WORKER_PID_CHANGED');
    client.backendPid = backend(r[0]);
  }
}
function monitorBoundary(client, pass, workers) {
  const all = lines(client);
  const own = all.filter(l => /^\d+\|/.test(l)).map(l => l.split('|'));
  if (own.length !== pass || count(client, 'ROLLBACK') !== pass || count(client, 'N5_MONITOR_RECHECK_COMPLETE') !== pass) stop('MONITOR_SEQUENCE');
  for (const row of own) {
    if (row.length !== 5 || row.slice(1).join('|') !== 'postgres|postgres|on|0') stop('MONITOR_BOUNDARY');
    if (client.backendPid && client.backendPid !== backend(row[0])) stop('MONITOR_PID_CHANGED');
    client.backendPid = backend(row[0]);
  }
  const expected = new Map([...workers, client].map(c => [`revit-n5-${c.label}`, c.backendPid]));
  if (new Set(expected.values()).size !== 6) stop('SIX_DISTINCT_SQL_PIDS');
  const rows = all.filter(l => l.startsWith('revit-n5-')).map(l => l.split('|'));
  if (rows.length !== 6 * pass) stop('MONITOR_VISIBILITY');
  for (let n = 0; n < pass; n++) {
    const seen = new Set();
    for (const r of rows.slice(n * 6, n * 6 + 6)) {
      if (r.length !== 11 || !expected.has(r[0]) || seen.has(r[0]) || backend(r[1]) !== expected.get(r[0]) ||
        r[2] !== 'postgres' || r[3] !== 'postgres' || r[4] !== r[0] ||
        r[5] !== (r[0] === 'revit-n5-M' ? 'active' : 'idle in transaction') || !r[6] ||
        r[9] !== '{}' || r[10] !== 't') stop('MONITOR_VISIBILITY_OR_LOCK');
      seen.add(r[0]);
    }
  }
}

export async function runHandshake({ repoRoot, connection, parentEnv = {}, spawnClient,
  now = () => performance.now(), pause = () => new Promise(r => setTimeout(r, 10)), saveEvidence,
  verifyBeforeSpawn = () => verifySources(repoRoot), signal }) {
  const clients = [];
  const started = now();
  const globalDeadline = started + 360000;
  let result = 'FAILED', reason = 'UNKNOWN';
  let sourceHashes = null;
  const failed = () => {
    if (signal?.aborted) stop('INTERRUPTED');
    if (now() >= globalDeadline) stop('WRAPPER_360S');
    for (const c of clients) {
      if (c.failed || c.err.trim() || (c.closed && c.exitCode !== 0) ||
        (c.label !== 'Catalog' && /(?:ERROR:|FATAL:|PANIC:|\b[A-Z_]+_STOP\b)/.test(c.out))) stop('CLIENT_FAILURE');
    }
  };
  async function waitUntil(predicate, deadline) {
    for (;;) {
      failed();
      if (now() >= Math.min(deadline, globalDeadline)) stop('STAGE_TIMEOUT');
      if (predicate()) return;
      await pause();
    }
  }
  function launch(label, workers = []) {
    failed();
    sourceHashes = verifyBeforeSpawn();
    const base = join(repoRoot, 'docs/phase3n/phase3n-n6');
    const file = label === 'Catalog' ? join(base, 'CATALOG_READ_ONLY_RECHECK.psql') : label === 'M' ? join(base, 'MONITOR_TWO_PASSES.psql') : resolve(base, '../phase3n-n5/SESSION_READ_ONLY_RECHECK.psql');
    // -f is essential: PostgreSQL documents that it routes \prompt through stdin/stdout.
    const args = ['-X', '--no-password', '--set=ON_ERROR_STOP=on', '--pset=pager=off', '-A', '-t', '--field-separator=|', '--file=' + file];
    if (labels.includes(label)) args.push(`--set=n5_label=revit-n5-${label}`);
    if (label === 'M') for (const w of workers) args.push(`--set=n5_${w.label}_pid=${w.backendPid}`);
    const child = spawnClient(label, args, { cwd: base, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: childEnvironment(parentEnv, connection, label) });
    const c = { label, child, out: '', err: '', closed: false, exitCode: null, failed: false, killed: false };
    clients.push(c);
    for (const [stream, field] of [[child.stdout, 'out'], [child.stderr, 'err']]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => {
        // Bound memory; raw streams never reach the console or disk.
        if (c.out.length + c.err.length + chunk.length > 16 * 1024 * 1024) c.failed = true;
        else c[field] += chunk;
      });
      stream.on('error', () => { c.failed = true; });
    }
    child.on('error', () => { c.failed = true; });
    child.stdin.on('error', () => { c.failed = true; });
    child.on('close', code => { c.closed = true; c.exitCode = code; });
    return c;
  }
  function release(client) {
    failed();
    if (client.closed) stop('EARLY_CLOSE');
    client.child.stdin.write('\n');
  }
  try {
    const firstDeadline = now() + 60000;
    const workers = labels.map(l => launch(l));
    await waitUntil(() => workers.every(c => c.out.includes(workerPrompt(1))), firstDeadline);
    workers.forEach(c => workerBoundary(c, 1));
    if (new Set(workers.map(c => c.backendPid)).size !== 5) stop('WORKER_PID_DUPLICATE');
    const m = launch('M', workers);
    await waitUntil(() => m.out.includes(monitorPrompt), firstDeadline);
    monitorBoundary(m, 1, workers);
    if (m.closed) stop('EARLY_MONITOR_CLOSE');
    const secondDeadline = now() + 60000;
    workers.forEach(release);
    await waitUntil(() => workers.every(c => c.out.includes(workerPrompt(2))), secondDeadline);
    workers.forEach(c => workerBoundary(c, 2));
    release(m);
    await waitUntil(() => m.closed, secondDeadline);
    monitorBoundary(m, 2, workers);
    if (count(m, 'N6_MONITOR_TWO_PASSES_COMPLETE') !== 1) stop('MONITOR_COMPLETION');
    workers.forEach(release);
    await waitUntil(() => workers.every(c => c.closed), now() + 60000);
    for (const c of workers) if (count(c, 'ROLLBACK') !== 2 || count(c, 'N5_SESSION_RECHECK_COMPLETE') !== 1) stop('WORKER_COMPLETION');
    const catalog = launch('Catalog');
    await waitUntil(() => catalog.closed, now() + 120000);
    if (count(catalog, 'ROLLBACK') !== 4 || catalogMarkers.some(x => count(catalog, x) !== 1)) stop('CATALOG_COMPLETION');
    // Catalog emits metadata for human comparison; a clean capture is not preservation approval.
    result = 'HANDSHAKE_COMPLETE_CATALOG_CAPTURED_REVIEW_REQUIRED';
    reason = 'NONE';
  } catch (error) {
    reason = /^[A-Z0-9_]+$/.test(error?.stopCode) ? error.stopCode : 'LOCAL_FAILURE';
  } finally {
    for (const c of clients) if (!c.closed) {
      c.killed = true;
      try { c.child.stdin.destroy(); c.child.kill(); } catch { /* Never address an unknown process. */ }
    }
    const cleanupDeadline = now() + 3000;
    while (clients.some(c => !c.closed) && now() < cleanupDeadline) await pause();
    if (clients.some(c => !c.closed)) { result = 'FAILED'; reason = 'OWNED_CLIENT_CLOSURE_UNCONFIRMED'; }
    const evidence = { result, reason, elapsedMs: Math.round(now() - started),
      reviewedManifestSha256: reviewedManifestHash, reviewedLauncherSha256: reviewedLauncherHash, sourceHashes,
      timeoutBounds: { statementMs: 15000, lockMs: 3000, idleTransactionMs: 120000, wrapperMs: 360000, catalogMs: 120000, stageMs: 60000 },
      endpoint: { host: connection.host, port: '5432', username: connection.user, database: 'postgres', operatorAttestation: true },
      clients: clients.map(c => ({ label: c.label, backendPid: c.backendPid ?? null, exitCode: c.exitCode, closed: c.closed, killed: c.killed,
        stdout: redact(c.out, connection.needles), stderr: redact(c.err, connection.needles) })) };
    // Redact the entire serialized object too, including metadata and cross-chunk secrets.
    await saveEvidence(JSON.parse(redact(JSON.stringify(evidence), connection.needles)));
    for (const c of clients) { c.out = ''; c.err = ''; }
  }
  if (result === 'FAILED') stop(reason);
  return result;
}

function evidenceWriter(repoRoot) {
  const scratch = join(repoRoot, 'scratch');
  // Refuse symlink/junction redirection out of the ignored scratch root.
  if (lstatSync(scratch).isSymbolicLink() || realpathSync(scratch).toLowerCase() !== scratch.toLowerCase()) stop('SCRATCH_PATH');
  const dir = join(scratch, 'phase3n-n2-evidence');
  mkdirSync(dir, { recursive: true });
  if (lstatSync(dir).isSymbolicLink() || !realpathSync(dir).toLowerCase().startsWith(scratch.toLowerCase() + sep)) stop('EVIDENCE_PATH');
  const path = join(dir, `automated-readonly-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`);
  return evidence => writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', encoding: 'utf8' });
}

async function main() {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[\\/]$/, '');
  if (process.argv[2] !== '--run' || process.argv.length !== 7) stop('ARGUMENTS');
  verifySources(repoRoot);
  const connection = validateEndpoint(process.env.REVIT_STAGING_DB_URL, process.argv.slice(3));
  const saveEvidence = evidenceWriter(repoRoot);
  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try {
    const result = await runHandshake({ repoRoot, connection, parentEnv: process.env, saveEvidence, signal: abort.signal,
      spawnClient: (_label, args, options) => spawn(psqlPath, args, options) });
    process.stdout.write(result + '\nSanitized evidence: scratch/phase3n-n2-evidence/automated-readonly-*.json\n');
  } finally {
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
    connection.password = ''; connection.needles = [];
  }
}

// Importing this module (tests, source checks) never launches a client or reads credentials.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('HANDSHAKE_STOP. No automatic retry. Review sanitized evidence if created.\n');
    process.exitCode = 1;
  });
}
