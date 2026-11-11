// Run from a clean, owner-controlled upload checkout. No network or credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, lstatSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
const pins = JSON.parse(readFileSync("docs/private-reviewers/pins.json", "utf8"));
const master = process.argv[2] && resolve(process.argv[2]);
const root = resolve(".private-reviewers");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function checked(base, path) {
  const full = resolve(base, path);
  assert.ok(relative(base, full) && !relative(base, full).startsWith(".."), "Outside private pack");
  for (let part = full; part !== dirname(part); part = dirname(part)) {
    if (existsSync(part)) assert.ok(!lstatSync(part).isSymbolicLink(), "Linked private pack");
  }
  return full;
}
// Validate all source bytes before copying anything. Never copy source-review fixtures to upload.
const runtime = pins.files.filter(file => file.privatePath.startsWith("runtime/"));
assert.equal(runtime.length, 308);
for (const file of runtime) {
  const path = checked(master || root, file.privatePath);
  const bytes = readFileSync(path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(hash(bytes), file.sha256, file.path);
}
if (master) for (const file of runtime) {
  const dest = checked(root, file.privatePath);
  if (existsSync(dest)) assert.equal(hash(readFileSync(dest)), file.sha256, "Existing pack differs");
  else { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(checked(master, file.privatePath), dest); }
}
for (const file of runtime) assert.equal(hash(readFileSync(checked(root, file.privatePath))), file.sha256);
console.log("Private runtime pack: 2 banks and 306 images verified; no network, no source-review fixtures copied.");
