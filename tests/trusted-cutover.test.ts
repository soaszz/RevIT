import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type Row = { id: string; owner: string; question: string; session: string; slot: number; digest: string;
  number: number; mode: string; selected: number | null; verified: boolean };
// Scheduling model only. This does not execute PL/pgSQL, prove database locks or simulate PostgreSQL isolation.
class AllocationModel {
  rows: Row[] = [];
  private pending = Promise.resolve();
  commit(items: Omit<Row, "number" | "verified">[]) {
    const operation = this.pending.then(() => {
      const next = structuredClone(this.rows); const acks: Row[] = [];
      for (const item of items) {
        const existing = next.find(row => row.id === item.id);
        if (existing) {
          for (const key of ["owner", "session", "slot", "question", "digest", "selected", "mode"] as const) {
            if (!existing.verified || existing[key] !== item[key]) throw Error("CONFLICT");
          }
          acks.push(existing); continue;
        }
        if (next.some(row => row.session === item.session && row.slot === item.slot)) throw Error("CONFLICT");
        const number = Math.max(0, ...next.filter(row => row.owner === item.owner && row.question === item.question).map(row => row.number)) + 1;
        if (number > 2147483647) throw Error("EXHAUSTED");
        const row = { ...item, number, verified: true }; next.push(row); acks.push(row);
      }
      this.rows = next; return structuredClone(acks);
    });
    this.pending = operation.then(() => {}, () => {}); return operation;
  }
}
const item = (id: string, session = "session-A", slot = 0) => ({ id, owner: "owner-A", question: "question-A", session, slot, digest: id, mode: "adaptive", selected: null });

test("numbering model preserves legacy gaps, allocates repeats and re-acknowledges stable IDs without allocating again", async () => {
  const model = new AllocationModel();
  model.rows = [1, 7].map(number => ({ ...item(`legacy-${number}`, "legacy", number), number, verified: false }));
  const original = structuredClone(model.rows);
  const [first, repeat] = await model.commit([item("one"), item("two", "session-A", 1)]);
  assert.equal(first.number, 8); assert.equal(repeat.number, 9);
  assert.deepEqual(await model.commit([item("one")]), [first]);
  assert.deepEqual(model.rows.slice(0, 2), original); assert.equal(model.rows.length, 4);
  assert.equal(repeat.selected, null); assert.equal(repeat.mode, "adaptive");
});

test("serialized model allocates concurrent cross-session repeats; conflicting UUID or slot cannot consume numbering", async () => {
  const model = new AllocationModel();
  const results = await Promise.all([model.commit([item("one")]), model.commit([item("two", "session-B")]), model.commit([item("one")])]);
  assert.deepEqual(results.map(r => r[0].number), [1, 2, 1]);
  await assert.rejects(model.commit([{ ...item("one"), digest: "forged" }]), /CONFLICT/);
  await assert.rejects(model.commit([item("other")]), /CONFLICT/);
  await assert.rejects(model.commit([{ ...item("one"), owner: "owner-B" }]), /CONFLICT/);
  assert.equal(model.rows.length, 2);
  assert.equal((await model.commit([item("three", "session-C")]))[0].number, 3);
});

test("model rolls back entire failed batch and rejects integer exhaustion without rewriting history", async () => {
  const model = new AllocationModel();
  await model.commit([item("one")]);
  const original = structuredClone(model.rows);
  await assert.rejects(model.commit([item("new", "session-B"), { ...item("one"), digest: "different" }]), /CONFLICT/);
  assert.deepEqual(model.rows, original);
  model.rows[0].number = 2147483647;
  await assert.rejects(model.commit([item("overflow", "session-C")]), /EXHAUSTED/);
  assert.equal(model.rows.length, 1);
});

test("proposed SQL fences each transaction, preserves legacy writers/history and allocates under compatible locks", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const sql = read("supabase/migrations/202610160027_trusted_cutover_and_attempt_numbering.sql");
  const rollback = read("supabase/rollbacks/202610160027_trusted_cutover_and_attempt_numbering_rollback.sql");
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
  assert.doesNotMatch(sql, /if current_user/);
  assert.equal((sql.match(/perform public\.assert_trusted_study_enabled\(\)/g) ?? []).length, 2);
  assert.match(sql, /where id = 1 for share/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /has_any_column_privilege/);
  assert.match(sql, /p_owner::text \|\| ':' \|\| v_key/);
  assert.ok(sql.indexOf("pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || v_key") < sql.indexOf("max(attempt_number)"));
  assert.match(sql, /max\(attempt_number\)::bigint, 0\) \+ 1/);
  assert.match(sql, /v_number::integer,\s+v_session.mode/);
  assert.doesNotMatch(sql, /update public\.question_attempts|insert into public\.(activity_events|user_progress|user_achievements|question_reinforcement)/i);
  assert.doesNotMatch(sql, /revoke .*function public\.(record_question_attempt|record_study_activity|record_progression_award|check_and_unlock_achievements)/i);
  assert.doesNotMatch(rollback, /drop\s+(?:table|column)|delete from|grant execute/i);
  assert.match(rollback, /set enabled = false/);
  assert.match(sql, /v_item->>'response_digest'/);
  assert.match(sql, /on conflict \(id\) do update set enabled = false/);
});
