import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isEffectivePro } from "../app/lib/domain";

test("effective Pro requires plan='pro', non-null pro_expires_at, and future expiration", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  // Valid active Pro
  assert.strictEqual(
    isEffectivePro({ plan: "pro", pro_expires_at: future }),
    true,
    "Active Pro with future expiration must be true",
  );

  // Null expiration must be Free
  assert.strictEqual(
    isEffectivePro({ plan: "pro", pro_expires_at: null }),
    false,
    "Pro with null pro_expires_at must be false (Free)",
  );

  // Expired Pro must be Free
  assert.strictEqual(
    isEffectivePro({ plan: "pro", pro_expires_at: past }),
    false,
    "Pro with past pro_expires_at must be false (Free)",
  );

  // Plan = 'free' with future date must still be Free
  assert.strictEqual(
    isEffectivePro({ plan: "free", pro_expires_at: future }),
    false,
    "Free plan with future timestamp must remain Free",
  );

  // Free with null date
  assert.strictEqual(
    isEffectivePro({ plan: "free", pro_expires_at: null }),
    false,
    "Free plan with null timestamp must remain Free",
  );

  // Missing or undefined
  assert.strictEqual(isEffectivePro(null), false);
  assert.strictEqual(isEffectivePro(undefined), false);
  assert.strictEqual(isEffectivePro({} as never), false);
});

test("migration strictly adheres to required columns and security rules", () => {
  const migration = readFileSync(
    "supabase/migrations/202610050019_free_pro_entitlements.sql",
    "utf8",
  );
  const rollback = readFileSync(
    "supabase/rollbacks/202610050019_free_pro_entitlements_rollback.sql",
    "utf8",
  );

  // 1. Exact columns
  assert.match(migration, /plan text not null default 'free' check \(plan in \('free', 'pro'\)\)/);
  assert.match(migration, /pro_started_at timestamptz null/);
  assert.match(migration, /pro_expires_at timestamptz null/);
  assert.match(migration, /pro_note text null/);

  // 2. Must NOT contain discarded column names
  assert.doesNotMatch(migration, /subscription_tier/);
  assert.doesNotMatch(migration, /subscription_status/);
  assert.doesNotMatch(migration, /subscription_expires_at/);

  // 3. Pro note is excluded from SELECT for authenticated
  assert.match(migration, /grant select \([\s\S]*\) on public\.profiles to authenticated;/);
  const selectMatch = migration.match(/grant select \(([\s\S]*?)\) on public\.profiles to authenticated;/);
  assert.ok(selectMatch, "Must have column-level grant select");
  assert.doesNotMatch(selectMatch[1], /\bpro_note\b/, "pro_note must NOT be in authenticated select grant");
  assert.match(selectMatch[1], /\bplan\b/);
  assert.match(selectMatch[1], /\bpro_started_at\b/);
  assert.match(selectMatch[1], /\bpro_expires_at\b/);

  // 4. Pro fields and note excluded from authenticated INSERT & UPDATE
  const insertMatch = migration.match(/grant insert \(([\s\S]*?)\) on public\.profiles to authenticated;/);
  assert.ok(insertMatch, "Must have column-level grant insert");
  assert.doesNotMatch(insertMatch[1], /\bpro_note\b/);
  assert.doesNotMatch(insertMatch[1], /\bplan\b/);
  assert.doesNotMatch(insertMatch[1], /\bpro_started_at\b/);
  assert.doesNotMatch(insertMatch[1], /\bpro_expires_at\b/);

  const updateMatch = migration.match(/grant update \(([\s\S]*?)\) on public\.profiles to authenticated;/);
  assert.ok(updateMatch, "Must have column-level grant update");
  assert.doesNotMatch(updateMatch[1], /\bpro_note\b/);
  assert.doesNotMatch(updateMatch[1], /\bplan\b/);
  assert.doesNotMatch(updateMatch[1], /\bpro_started_at\b/);
  assert.doesNotMatch(updateMatch[1], /\bpro_expires_at\b/);

  // 5. Admin helpers defined, revoked from public/anon/authenticated, granted to service_role
  assert.match(migration, /function public\.grant_pro_month/);
  assert.match(migration, /function public\.revoke_pro/);
  assert.match(migration, /revoke all on function public\.grant_pro_month.*from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.grant_pro_month.*to service_role;/);
  assert.match(migration, /revoke all on function public\.revoke_pro.*from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.revoke_pro.*to service_role;/);

  // 6. AI rate limit tiers updated: free 2/min 3/day, subscription 5/min 15/day
  assert.match(migration, /\('free', 2, 3\)/);
  assert.match(migration, /\('subscription', 5, 15\)/);

  // 7. reserve_ai_request checks effective Pro
  assert.match(migration, /p\.plan = 'pro'/);
  assert.match(migration, /p\.pro_expires_at is not null/);
  assert.match(migration, /p\.pro_expires_at > now\(\)/);

  // 8. Rollback drops added functions and columns
  assert.match(rollback, /drop function if exists public\.grant_pro_month/);
  assert.match(rollback, /drop column if exists pro_note/);
  assert.match(rollback, /drop column if exists pro_expires_at/);
  assert.match(rollback, /drop column if exists pro_started_at/);
  assert.match(rollback, /drop column if exists plan/);
  assert.match(rollback, /\('free', 5, 20\)/);
  assert.match(rollback, /\('subscription', 15, 100\)/);
  assert.match(rollback, /create or replace function public\.reserve_ai_request\(\)/);
  assert.match(rollback, /from public\.ai_entitlements entitlement/);
  assert.match(rollback, /grant select, insert, update, delete on public\.profiles to authenticated/);
});

test("client bundle boundary: Ciulla content is strictly server-only and not imported by client code", () => {
  function getAllFiles(dir: string): string[] {
    const entries = readdirSync(dir);
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry !== "node_modules" && entry !== ".next" && entry !== "dist") {
          files.push(...getAllFiles(fullPath));
        }
      } else if (/\.(tsx?|jsx?|mjs)$/.test(entry)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const appFiles = getAllFiles("app");

  // Filter client files (exclude server API routes and server modules)
  const clientFiles = appFiles.filter((filePath) => {
    const normalized = filePath.replace(/\\/g, "/");
    return !normalized.startsWith("app/api/") && !normalized.includes("/server/");
  });

  for (const clientFile of clientFiles) {
    const code = readFileSync(clientFile, "utf8");
    assert.doesNotMatch(
      code,
      /ciullaContent\.json/i,
      `Client file ${clientFile} must NOT import ciullaContent.json!`,
    );
    assert.doesNotMatch(
      code,
      /ciullaServerContent/i,
      `Client file ${clientFile} must NOT import ciullaServerContent!`,
    );
  }

  // Verify server-only marker on server modules
  const ciullaServer = readFileSync("app/lib/server/ciullaServerContent.ts", "utf8");
  assert.match(ciullaServer, /^import "server-only";/, "ciullaServerContent must be marked server-only");

  const ciullaRoute = readFileSync("app/api/reviewer/ciulla/route.ts", "utf8");
  assert.match(ciullaRoute, /^import "server-only";/, "ciulla API route must be marked server-only");
  assert.match(ciullaRoute, /get_my_entitlement/, "Route must use database-time entitlement RPC");
  assert.match(ciullaRoute, /entitlement\.effective_plan !== "pro"/, "Route must require effective Pro");
});
