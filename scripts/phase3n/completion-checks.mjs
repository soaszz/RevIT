import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path, { dirname, join } from 'node:path';
const safe = /^(path|pathext|systemroot|windir|systemdrive|comspec|temp|tmp|userprofile|appdata|localappdata|programfiles|programfiles\(x86\)|homedrive|homepath|processor_architecture|number_of_processors|os)$/i;
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => safe.test(name)));
for (const name of readdirSync('.').filter(name => /^\.env(?:\.|$)/.test(name))) {
  for (const match of readFileSync(name, 'utf8').matchAll(/^\s*(?:export\s+)?([\w.-]+)\s*=/gm)) env[match[1]] = '';
}
Object.assign(env, { REVIT_TRUSTED_STUDY_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', __NEXT_PROCESSED_ENV: 'true',
  NEXT_PUBLIC_STRASINGER_CLOUD_SYNC_ENABLED: 'false', NEXT_PUBLIC_DISABLE_CAPTCHA: 'false', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
env.NODE_OPTIONS = '--require ' + JSON.stringify(path.resolve('scripts/phase3n/cutover-no-network.cjs'));
delete env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const focused = process.argv.includes('--focused');
const red = process.argv.includes('--red');
const repair = process.argv.includes('--repair');
const steps = focused ? [['focused', [npm, 'exec', '--no', '--', 'tsx', '--test', 'tests/trusted-study.test.ts', 'tests/client-session-adapter.test.ts', 'tests/trusted-integration.test.ts', 'tests/trusted-cutover.test.ts', 'tests/trusted-effects.test.ts', 'tests/trusted-sql-preparation.test.ts']]] : [
  ['typecheck', [npm, 'exec', '--no', '--', 'tsc', '--noEmit']],
  ['lint', [npm, 'run', 'lint']], ['build', [npm, 'run', 'build']],
  ['unit', [npm, 'exec', '--no', '--', 'tsx', '--test', ...readdirSync('tests').filter(n => n.endsWith('.test.ts')).map(n => `tests/${n}`)]],
  ['reviewer-content', ['--test', 'tests/reviewer-content.test.mjs']], ['secrets', [npm, 'run', 'security:secrets']],
];
const results = only ? JSON.parse(readFileSync('docs/phase3n/local-completion-sprint/regression-results.json', 'utf8')).filter(row => row.name !== only) : repair ? JSON.parse(readFileSync('docs/phase3n/local-completion-sprint/regression-results.json', 'utf8')).filter(row => !['typecheck', 'lint'].includes(row.name)) : [];
for (const [name, args] of steps) {
  if (only && name !== only) continue;
  if (repair && !['typecheck', 'lint'].includes(name)) continue;
  const started = Date.now();
  const childEnv = { ...env, REVIT_BUILD_FONT_FETCH: name === 'build' ? 'true' : 'false' };
  const child = spawnSync(process.execPath, args, { env: childEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const log = `docs/phase3n/local-completion-sprint/${name}${red ? '.red' : ''}.log`;
  writeFileSync(log, (child.stdout ?? '') + (child.stderr ?? '') + (child.error ? String(child.error) : ''));
  results.push({ name, exitCode: child.status, seconds: Math.round((Date.now() - started) / 100) / 10, log });
  console.log(`${name}: ${child.status === 0 ? 'PASS' : 'FAIL'} (exit ${child.status})`);
  writeFileSync(`docs/phase3n/local-completion-sprint/${focused ? (red ? 'focused.red' : 'focused') : 'regression'}-results.json`, JSON.stringify(results, null, 2) + '\n');
}
process.exitCode = results.every(r => r.exitCode === 0) ? 0 : 1;

