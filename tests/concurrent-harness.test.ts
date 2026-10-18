import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSupabaseResult as normalizeResult,
  validateStagingEnvironment,
  ConcurrencyTestHarness,
  APPROVED_STAGING_REF,
  APPROVED_STAGING_HOSTNAME,
  FORBIDDEN_PROD_REF,
  TEST_ONLY_CLIENT_SYMBOL,
  checkIntervalOverlap,
} from "../scripts/phase3n/concurrent-persistence-test.mjs";

const normalizeSupabaseResult = normalizeResult as (result: unknown, error?: Error & { code?: string }) => {
  data: unknown; error: { code: string; message: string } | null; isError: boolean;
};

test("normalizeSupabaseResult handles successful RPC responses", () => {
  const raw = { data: [{ id: "att-1", is_correct: true }], error: null };
  const res = normalizeSupabaseResult(raw);
  assert.equal(res.isError, false);
  assert.equal(res.error, null);
  assert.deepEqual(res.data, [{ id: "att-1", is_correct: true }]);
});

test("normalizeSupabaseResult handles returned Supabase RPC errors with SQLSTATE", () => {
  const raw = { data: null, error: { message: "Attempt conflict: unique violation 23505", code: "23505" } };
  const res = normalizeSupabaseResult(raw);
  assert.equal(res.isError, true);
  assert.ok(res.error);
  assert.equal(res.error.code, "23505");
  assert.match(res.error.message, /23505/);
});

test("normalizeSupabaseResult extracts code from error message if code is absent", () => {
  const raw = { data: null, error: { message: "error 42501: insufficient privilege" } };
  const res = normalizeSupabaseResult(raw);
  assert.equal(res.isError, true);
  assert.ok(res.error);
  assert.equal(res.error.code, "42501");
});

test("normalizeSupabaseResult handles thrown exceptions and sanitizes sensitive URLs/JWTs", () => {
  const thrown = Object.assign(new Error("Connection failed to https://qnepjfcbzsycmesrcbjb.supabase.co with eyJhbGciOiJIUzI1NiJ9.fakejwt"), { code: "ECONNREFUSED" });
  const res = normalizeSupabaseResult(null, thrown);
  assert.equal(res.isError, true);
  assert.ok(res.error);
  assert.equal(res.error.code, "ECONNREFUSED");
  assert.doesNotMatch(res.error.message, /eyJhbG/);
  assert.match(res.error.message, /\[REDACTED_JWT\]/);
  assert.match(res.error.message, /\[REDACTED_URL\]/);
});

test("validateStagingEnvironment accepts exact approved staging URL and key", () => {
  assert.equal(validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}`, "test-key"), true);
  assert.equal(validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}/`, "test-key"), true);
});

test("validateStagingEnvironment strictly rejects production URL and unapproved targets", () => {
  // Production URL
  assert.throws(() => validateStagingEnvironment(`https://${FORBIDDEN_PROD_REF}.supabase.co`, "test-key"), /SECURITY VIOLATION/);

  // Unknown project reference
  assert.throws(() => validateStagingEnvironment("https://random-ref.supabase.co", "test-key"), /Hostname.*does not match/);

  // Attacker domain embedding staging reference as subdomain suffix
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}.attacker.example`, "test-key"), /does not match/);

  // Staging hostname embedded in username/credentials
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}@evil.com`, "test-key"), /embedded credentials/);
  assert.throws(() => validateStagingEnvironment(`https://user:pass@${APPROVED_STAGING_HOSTNAME}`, "test-key"), /embedded credentials/);

  // Staging hostname embedded in path
  assert.throws(() => validateStagingEnvironment(`https://evil.com/${APPROVED_STAGING_HOSTNAME}`, "test-key"), /must not contain a subpath|does not match/);

  // HTTP protocol instead of HTTPS
  assert.throws(() => validateStagingEnvironment(`http://${APPROVED_STAGING_HOSTNAME}`, "test-key"), /HTTPS is strictly required/);

  // Malformed URLs
  assert.throws(() => validateStagingEnvironment("not-a-valid-url", "test-key"), /Malformed URL/);
  assert.throws(() => validateStagingEnvironment("", "test-key"), /missing or empty/);

  // Custom ports
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}:8443`, "test-key"), /Custom port/);

  // Query parameters or hash fragments
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}?query=1`, "test-key"), /query parameters/);
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}#hash`, "test-key"), /query parameters/);

  // Subpath on host
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}/rest/v1`, "test-key"), /must not contain a subpath/);

  // Empty or invalid service-role key
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}`, ""), /missing or empty/);
  assert.throws(() => validateStagingEnvironment(`https://${APPROVED_STAGING_HOSTNAME}`, "   "), /missing or empty/);
});

test("ConcurrencyTestHarness prevents unauthorized mock client injection bypass", () => {
  const fakeClient = {};
  // Injected client without test token must throw SECURITY VIOLATION
  assert.throws(() => new ConcurrencyTestHarness({ client: fakeClient }), /SECURITY VIOLATION.*Unauthorized client injection/);
  assert.throws(() => new ConcurrencyTestHarness({ client: fakeClient, testToken: "wrong-token" }), /SECURITY VIOLATION/);

  // Injected client with official test token succeeds
  const harness = new ConcurrencyTestHarness({ client: fakeClient, testToken: TEST_ONLY_CLIENT_SYMBOL });
  assert.equal(harness.client, fakeClient);
});

test("checkIntervalOverlap strictly computes overlapping, non-overlapping, and boundary intervals", () => {
  // 1. Clearly overlapping intervals: [100, 200] and [150, 250]
  assert.equal(checkIntervalOverlap(100, 200, 150, 250), true);
  assert.equal(checkIntervalOverlap(150, 250, 100, 200), true);

  // 2. Contained interval: [100, 300] and [150, 200]
  assert.equal(checkIntervalOverlap(100, 300, 150, 200), true);

  // 3. Disjoint non-overlapping intervals: [100, 200] and [300, 400]
  assert.equal(checkIntervalOverlap(100, 200, 300, 400), false);
  assert.equal(checkIntervalOverlap(300, 400, 100, 200), false);

  // 4. Boundary touching intervals: [100, 200] and [200, 300]
  // In a strict concurrency model, endA === startB is sequential handoff, NOT concurrent flight
  assert.equal(checkIntervalOverlap(100, 200, 200, 300), false);
  assert.equal(checkIntervalOverlap(200, 300, 100, 200), false);

  // 5. Invalid / non-number inputs
  assert.equal(checkIntervalOverlap(null, 200, 150, 250), false);
});

test("ConcurrencyTestHarness runs full scenario suite in dry-run mode with 100% pass", async () => {
  const harness = new ConcurrencyTestHarness({ dryRun: true });
  const results = await harness.runAllScenarios() as Awaited<ReturnType<typeof harness.runAllScenarios>> & { cleanup: { cleaned: boolean } };
  assert.equal(results.length, 8);
  for (const r of results) {
    assert.match(r.status, /PASS/);
  }
  assert.equal(results.cleanup.cleaned, true);
});

test("ConcurrencyTestHarness mock client exercises parallel execution and error extraction", async () => {
  const mockClient = {
    auth: { admin: { createUser: async () => ({ data: { user: { id: "mock-user" } }, error: null }), deleteUser: async () => ({ error: null }) } },
    rpc: async (_name: string, args: { p_attempts?: { response_digest?: string; id?: string }[] }) => {
      if (args?.p_attempts?.[0]?.response_digest === "digest-CONFLICTING") {
        return { data: null, error: { message: "payload mismatch", code: "23505" } };
      }
      return { data: [{ id: args?.p_attempts?.[0]?.id || "mock-attempt" }], error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ data: [{ id: "mock-id", user_id: "mock-user", session_id: "mock-session" }] }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };

  const harness = new ConcurrencyTestHarness({ client: mockClient, testToken: TEST_ONLY_CLIENT_SYMBOL });
  const scenarioB = await harness.runScenarioB();
  assert.equal(scenarioB.status, "PASS");
  assert.equal(scenarioB.rowCount, 1);
  const cleanup = await harness.cleanup();
  assert.equal(cleanup.cleaned, true);
});
