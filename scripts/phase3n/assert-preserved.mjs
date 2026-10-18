import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
// Old phase snapshots remain immutable. Authorized integration edits have exact replacement hashes.
export function assertPreserved(path, expected) {
  const hash = createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex");
  let current = expected;
  for (const phase of ["phase3n-j", "phase3n-k", "local-completion-sprint"]) {
    const changes = JSON.parse(readFileSync(new URL(`docs/phase3n/${phase}/authorized-changes.json`, root), "utf8"));
    if (changes[path]?.before === current) current = changes[path].after;
  }
  // Phase 3O extends the existing exact hash chain; no file is exempted.
  const completion = JSON.parse(readFileSync(new URL("docs/phase3o/authorized-changes.json", root), "utf8"));
  if (completion[path]) {
    assert.equal(completion[path].before, current, `${path}: broken Phase 3O preservation chain`);
    current = completion[path].after;
  }
  assert.equal(hash, current, `${path}: differs from reviewed phase hashes in ${fileURLToPath(root)}`);
}
