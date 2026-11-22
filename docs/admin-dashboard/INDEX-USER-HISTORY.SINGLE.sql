-- SINGLE-INDEX INSTALL, separately reviewed and separately approved.
-- Installs ONLY subscription_history_user_created_idx.
-- The global subscription_history_created_idx is NOT included and must not be installed here.
-- No table, row, writer, RLS, or grant change. Plain CREATE INDEX (no CONCURRENT), own statement,
-- not wrapped in BEGIN so the ACCESS EXCLUSIVE lock releases at statement end.
-- Separate this from any other DDL. Safe to re-run (if not exists).
set lock_timeout = '2s';
set statement_timeout = '30s';
create index if not exists subscription_history_user_created_idx
  on public.subscription_history (user_id, created_at desc, id desc);

-- Post-install verification (read-only):
-- 1. indisvalid and indisready are true.
-- 2. The per-subscriber detail plan uses this index instead of a seq scan.
