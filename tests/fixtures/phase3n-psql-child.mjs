// Offline transport fixture only: no database, sockets, files or credential access.
import { createInterface } from 'node:readline';
const label = process.argv[2];
const labels = ['O', 'A', 'B', 'C', 'D'];
const pids = { O: 90101, A: 90102, B: 90103, C: 90104, D: 90105, M: 90106 };
const output = text => process.stdout.write(text);
let pass = 1;
function worker() {
  output(`BEGIN\n${pids[label]}|${['B', 'C'].includes(label) ? 'service_role' : 'postgres'}|postgres|on|read committed|revit-n5-${label}|0\n`);
  const prompt = `Barrier ${pass}: capture M monitor ${pass === 1 ? 'now' : 'again'}, then press Enter: `;
  output(prompt.slice(0, 12));
  setImmediate(() => output(prompt.slice(12)));
}
function monitor() {
  for (const l of labels) if (!process.argv.includes(`--set=n5_${l}_pid=${pids[l]}`)) process.exit(3);
  output(`BEGIN\n${pids.M}|postgres|postgres|on|0\n`);
  for (const l of [...labels, 'M'].sort()) output(`revit-n5-${l}|${pids[l]}|postgres|postgres|revit-n5-${l}|${l === 'M' ? 'active' : 'idle in transaction'}|2026-10-17 08:00:00+00|||{}|t\n`);
  output('ROLLBACK\nN5_MONITOR_RECHECK_COMPLETE\n');
  if (pass === 1) output('M pass 1 complete. Move all five sessions to Barrier 2, then press Enter here: ');
  else output('N6_MONITOR_TWO_PASSES_COMPLETE\n');
}
const input = createInterface({ input: process.stdin, terminal: false });
input.on('line', line => {
  if (line !== '') process.exit(3);
  if (label === 'M') { pass++; monitor(); input.close(); process.stdin.destroy(); }
  else {
    output('ROLLBACK\n');
    if (pass++ === 1) worker();
    else { output('N5_SESSION_RECHECK_COMPLETE\n'); input.close(); process.stdin.destroy(); }
  }
});
if (label === 'Catalog') {
  for (const marker of ['N6_RELATION_GUARD_ROLLBACK_COMPLETE', 'N5_READ_ONLY_RECHECK_ROLLBACK_COMPLETE', 'N3_READ_ONLY_PREFLIGHT_ROLLBACK_COMPLETE', 'N6_SCHEMA_SUPPLEMENT_ROLLBACK_COMPLETE']) output(`ROLLBACK\n${marker}\n`);
  output('N6_CATALOG_RECHECK_COMPLETE\n'); input.close(); process.stdin.destroy();
} else if (label === 'M') monitor();
else if (labels.includes(label)) worker();
else process.exit(3);
