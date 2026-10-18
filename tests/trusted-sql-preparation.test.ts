import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/tests/trusted_cutover_verification.sql", import.meta.url), "utf8");

test("SQL preparation requires isolated owner target, rollback, real writer fencing and valid fixtures", () => {
  assert.match(sql, /current_setting\('revit.test_target', true\)/);
  assert.match(sql, /Empty disposable staging required/);
  assert.match(sql, /set local transaction isolation level read committed/);
  assert.match(sql, /revoke all on function %s from public, anon, authenticated/);
  assert.match(sql, /revoke insert \(%s\), update \(%s\)/);
  assert.match(sql, /perform public\.assert_trusted_study_enabled\(\)/);
  assert.match(sql, /'target_count',5/);
  assert.equal((sql.match(/'question_id','(?:synthetic-[\w-]+|rodak-ch12-06)','content_version','synthetic-v1'/g) ?? []).length, 5);
  assert.doesNotMatch(sql, /on conflict \(id\) do nothing|crypt\(|gen_salt\(/i);
  assert.match(sql, /rollback;\s*$/);
  assert.doesNotMatch(sql, /^commit;/m);
});

test("SQL preparation distinguishes atomic rollback, collision states, role tests and unavailable engine evidence", () => {
  assert.match(sql, /pg_temp\.attempt\(v_atomic_id,'synthetic-q2',1\)/);
  assert.match(sql, /pg_temp\.attempt\(gen_random_uuid\(\),'synthetic-q1',3\)/);
  assert.match(sql, /v_other,v_foreign.id,jsonb_build_array\(v_item\)\), '23505'/);
  assert.match(sql, /v_other,v_session.id,jsonb_build_array\(v_item\)\), '42501'/);
  for (const role of ["service_role", "authenticated", "anon"]) assert.match(sql, new RegExp(`set local role ${role};`));
  assert.match(sql, /into strict v_result/);
  assert.match(sql, /v_result is distinct from v_before/);
  assert.match(sql, /'22003'/);
  assert.match(sql, /owner SELECT or cross-account RLS failed/);
  assert.match(sql, /commit_verified_study_batch\(v_other,v_foreign.id,/);
  assert.match(sql, /service role could change its own authority/);
  const scenarios = [...sql.matchAll(/insert into trusted_test_results values\(([^;]+);/g)]
    .flatMap(match => [...match[1].matchAll(/'([^']+)'\s*,\s*'PASS'/g)].map(row => row[1]));
  assert.equal(scenarios.length, 14); assert.equal(new Set(scenarios).size, 14);
  assert.match(sql, /Scenarios 6 \(engine overlap\), 12 \(disable race\), 14 \(rollback\) require the separate runbook/);
});

test("rollback verification uses the unchanged rollback body without committing its surrounding fixture transaction", () => {
  const rollback = readFileSync(new URL("../supabase/rollbacks/202610160027_trusted_cutover_and_attempt_numbering_rollback.sql", import.meta.url), "utf8");
  const generated = readFileSync(new URL("../supabase/tests/trusted_cutover_rollback_verification.sql", import.meta.url), "utf8");
  const body = rollback.slice(rollback.indexOf("begin;\n") + 7).replace(/\ncommit;\s*$/, "\n");
  assert.ok(generated.includes(body)); assert.ok(generated.includes(sql.replace(/\nrollback;\s*$/, "\n")));
  assert.doesNotMatch(generated, /^\s*commit;/im); assert.match(generated, /rollback;\s*$/);
  assert.match(generated, /14_rollback_stubs_preserve_data/);
  assert.match(generated, /is distinct from jsonb_build_object/);
  assert.match(generated, /leaderboard_metric_rows/);
});
