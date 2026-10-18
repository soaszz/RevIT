# Phase 3D local PostgreSQL report

Date: 2026-10-15. **SQL execution: NOT TESTED.**

## Environment and evidence

`docker`, `psql`, `pg_ctl`, `initdb`, and `supabase` were not found on PATH. No PostgreSQL/Docker installation or service was found in the checked standard Windows installation locations, user program locations, Scoop/Chocolatey locations, or service inventory. No database was created, existing development database changed, or software installed.

Available evidence: checked-in migration history through Migration 22, current proposed Migration 23, both rollback files, application source, and synthetic application tests. No Phase 3C report or original `STATUS.md` was recovered. No claim below represents a live Supabase inspection.

## Exact contracts

All three proposed function headers, argument names/order/types, return types, volatility, security mode, and search paths match the local pre-feature Migration 22 headers.

| Function | Contract |
|---|---|
| `public.set_question_attempt_book()` | No arguments; returns `trigger`; PL/pgSQL; SECURITY DEFINER; `search_path = pg_catalog, public` |
| `public.record_question_attempt(...)` | Returns `public.question_attempts`; PL/pgSQL; SECURITY DEFINER; same search path |
| `public.leaderboard_metric_rows(text, text, text, text)` | `p_period`, `p_metric`, `p_subject_id default null`, `p_book default null`; returns table `(participant_id uuid, metric_value numeric, answered_count bigint, correct_count bigint)`; STABLE; PL/pgSQL; SECURITY DEFINER; same search path |

Attempt RPC arguments, in order:

```text
p_id uuid
p_question_id text
p_subject_id text
p_subject_name text
p_topic_id text
p_topic_name text
p_subtopic text
p_difficulty text
p_selected_answer smallint
p_is_correct boolean
p_review_mode text
p_session_id uuid
p_is_adaptive_repeat boolean
p_answered_at timestamptz
```

Direct attempt RPC EXECUTE remains revoked from `PUBLIC`/`anon`, granted to `authenticated`. Trigger function EXECUTE remains revoked from all three client/public roles. No new direct authenticated grant is needed for the raw leaderboard helper; the wrappers run as their function owners.

`CREATE OR REPLACE` preserves function identity, ownership, and existing permissions unless explicitly changed; this supports trigger compatibility but does not establish the actual live owner or effective ACL. See [PostgreSQL 17 CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).

## Attribution review

These are source-level expectations, not actual SQL outputs:

| Input | Expected Migration 23 behavior |
|---|---|
| `strasinger7-ch01-q001` | Strasinger, including null/empty subject and topic metadata |
| `strasinger7-ch17-q016` | Strasinger, including null/empty subject and topic metadata |
| Existing `strasinger-...` ID | Strasinger support preserved |
| `clinical-chemistry-6-1-001` | Harr |
| `ciulla-cc-1` | Ciulla |
| `rodak-ch02-01` | Rodak |
| Nonempty unknown/malformed ID without another book prefix | Existing Harr fallback preserved |
| Null, blank, or longer-than-240 question ID | Attempt RPC raises `22023` |

The SQL checks prefix patterns, not membership in a canonical question registry. Unknown IDs are intentionally assigned the existing Harr fallback. Conflicting subject/topic prefixes can take precedence in the existing Ciulla/Rodak-first CASE ordering. This preserves compatibility but is not proof that a supplied ID or correctness claim is genuine. Do not automatically change that contract in this feature migration.

Optional null/blank subject/topic values are normalized to `uncategorized`. The new question-ID prefix checks do not depend on those values. Trigger correction retains the prior rule: correct missing/empty books or a default Harr book; it does not overwrite every explicit non-Harr book.

## Leaderboard and data preservation review

The SQL still counts the first attempt per user/question/Manila calendar day, excludes future rows, retains existing period/subject filters, and computes accuracy from first-daily correct/answered counts. Positive event XP is aggregated separately. Strasinger is added to both question attribution and XP subject filtering. Harr, Ciulla, and Rodak branches otherwise retain their existing logic.

Neither Migration 23 nor its rollback executes table DML or removes history. The attempt RPC retains its pre-existing user-scoped metadata reconciliation, advisory lock, stable attempt-ID lookup, timestamp clamp, and attempt-number allocation. Those are inspected properties, not executed concurrency proofs. Existing incorrectly labeled history is not globally backfilled; leaderboard prefix attribution can recognize it without changing rows.

## Rollback review

Both existing rollback files now contain identical SQL. Automated string comparison confirms all three `CREATE OR REPLACE FUNCTION` definitions exactly match the local Migration 22 definitions, including bodies. Only transactional wrapping, comments, and stronger helper ACL handling differ from their entry copies.

Rollback keeps `authenticated`/`anon`/`PUBLIC` blocked from direct raw metrics; independent Migration 24 also retains restrictions on the legacy three-argument helper. It does not delete Strasinger attempts or touch RLS, constraints, subscriptions, or progress tables.

Operational consequence: rolled-back attempt recording no longer recognizes Strasinger prefixes and falls back to Harr for new Strasinger records. Existing explicit `book = 'Strasinger'` rows may still appear through the old question metric's book fallback, while old XP filtering can count Strasinger subjects as Harr. Keep feature synchronization disabled during rollback. Exact live rollback restoration cannot be claimed without saved live definitions.

## Blocking answer-storage mismatch

Local `202608280004_weakness_dashboard.sql` creates `selected_answer smallint` with `selected_answer is null or selected_answer between 0 and 3`. No later local migration alters this type/check. Migrations 22/23 retain `p_selected_answer smallint`.

Local matching encoding produces values outside that contract:

- Rodak: 2 matching questions; both correct encodings exceed 3. Example `rodak-ch12-06`: correct encoding 21.
- Strasinger: 14 matching questions; 12 correct encodings exceed 3. Example `strasinger7-ch01-q032`: correct encoding 100.
- Possible Strasinger matching selections reach 823,542, above `smallint` maximum 32,767. Correct keys alone do not cover this boundary.

Do not widen an unverified live RPC or invent a rollback that could reject retained historical encodings. First confirm live column types/check constraints and all RPC overloads. A separately reviewed storage/RPC compatibility change and isolated execution evidence are required if the local contract is the live contract.

## Unexecuted required checks

Migration apply/rollback, actual SQL attribution outputs for all representative IDs, optional null metadata, trigger firing, role grants before/after, anonymous/authenticated direct-helper denial, authorized wrappers, opted-out participant privacy, first-daily aggregation, cross-user RLS, stable-ID retry/concurrency, constraints, matching selections, retained history, and unrelated-object catalog equality are all **NOT TESTED in PostgreSQL**.
