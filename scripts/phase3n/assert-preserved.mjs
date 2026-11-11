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
  const release = JSON.parse(readFileSync(new URL("docs/release-v1.12.1/authorized-changes.json", root), "utf8"));
  if (release[path]) {
    assert.equal(release[path].before, current, `${path}: broken v1.12.1 preservation chain`);
    current = release[path].after;
  }
  const hotfix = JSON.parse(readFileSync(new URL("docs/release-v1.12.2/authorized-changes.json", root), "utf8"));
  if (hotfix[path]) {
    assert.equal(hotfix[path].before, current, `${path}: broken v1.12.2 preservation chain`);
    current = hotfix[path].after;
  }
  const maintenance = JSON.parse(readFileSync(new URL("docs/release-v1.12.3/authorized-changes.json", root), "utf8"));
  if (maintenance[path]) {
    assert.equal(maintenance[path].before, current, `${path}: broken v1.12.3 preservation chain`);
    current = maintenance[path].after;
  }
  const integration = JSON.parse(readFileSync(new URL("docs/release-integration/authorized-changes.json", root), "utf8"));
  if (integration[path]) {
    assert.equal(integration[path].before, current, `${path}: broken integration preservation chain`);
    current = integration[path].after;
  }
  const security = JSON.parse(readFileSync(new URL("docs/subscription-security-repair/authorized-changes.json", root), "utf8"));
  if (security[path]) {
    assert.equal(security[path].before, current, `${path}: broken subscription-security preservation chain`);
    current = security[path].after;
  }
  const reviewer = JSON.parse(readFileSync(new URL("docs/reviewer-compatibility/authorized-changes.json", root), "utf8"));
  if (reviewer[path]) {
    assert.equal(reviewer[path].before, current, `${path}: broken reviewer-compatibility preservation chain`);
    current = reviewer[path].after;
  }
  const retry = JSON.parse(readFileSync(new URL("docs/mcq-retry/authorized-changes.json", root), "utf8"));
  if (retry[path]) {
    assert.equal(retry[path].before, current, `${path}: broken combined MCQ preservation chain`);
    current = retry[path].after;
  }
  const delivery = JSON.parse(readFileSync(new URL("docs/private-reviewers/authorized-changes.json", root), "utf8"));
  if (delivery[path]) {
    assert.equal(delivery[path].before, current, `${path}: broken private-delivery preservation chain`);
    current = delivery[path].after;
  }
  const publication = JSON.parse(readFileSync(new URL("docs/reviewer-release/authorized-changes.json", root), "utf8"));
  if (publication[path]) {
    assert.equal(publication[path].before, current, path + ": broken prepared publication preservation chain");
    current = publication[path].after;
  }
  assert.equal(hash, current, `${path}: differs from reviewed phase hashes in ${fileURLToPath(root)}`);
}
