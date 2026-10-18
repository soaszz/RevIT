#!/usr/bin/env node

/**
 * RevIT Phase 3N-H1: Staging-Only Concurrent Persistence Test Harness
 * 
 * Target Environment: Isolated Supabase Staging Project (qnepjfcbzsycmesrcbjb) ONLY.
 * NEVER RUN AGAINST PRODUCTION (lznsdxfvxeckflxsohig).
 * 
 * Requires:
 *   - REVIT_STAGING_SUPABASE_URL (must match qnepjfcbzsycmesrcbjb.supabase.co)
 *   - REVIT_STAGING_SERVICE_ROLE_KEY
 *   - Explicit CLI flag `--run-staging` for live execution
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export const APPROVED_STAGING_REF = "qnepjfcbzsycmesrcbjb";
export const FORBIDDEN_PROD_REF = "lznsdxfvxeckflxsohig";

/**
 * Extract sanitized error code and safe message without exposing secrets.
 */
export function normalizeSupabaseResult(res, thrownError = null) {
  if (thrownError) {
    const code = thrownError.code || thrownError.errcode || "EXCEPTION";
    const msg = typeof thrownError.message === "string" ? thrownError.message : "Thrown error";
    // Sanitize message to strip any potential URLs/keys
    const sanitizedMsg = msg.replace(/ey[A-Za-z0-9_.-]{10,}/g, "[REDACTED_JWT]").replace(/https?:\/\/[^\s]+/g, "[REDACTED_URL]");
    return { data: null, error: { code: String(code), message: sanitizedMsg }, isError: true };
  }

  if (!res) {
    return { data: null, error: { code: "NULL_RESPONSE", message: "Empty RPC response" }, isError: true };
  }

  if (res.error) {
    const err = res.error;
    let code = err.code || err.errcode;
    if (!code && typeof err.message === "string") {
      const match = err.message.match(/\b([0-9]{5}|42501|23505|55000|22023)\b/);
      if (match) code = match[1];
    }
    const msg = typeof err.message === "string" ? err.message : "RPC error";
    const sanitizedMsg = msg.replace(/ey[A-Za-z0-9_.-]{10,}/g, "[REDACTED_JWT]").replace(/https?:\/\/[^\s]+/g, "[REDACTED_URL]");
    return { data: null, error: { code: String(code || "RPC_ERROR"), message: sanitizedMsg }, isError: true };
  }

  return { data: res.data ?? null, error: null, isError: false };
}

export const APPROVED_STAGING_HOSTNAME = "qnepjfcbzsycmesrcbjb.supabase.co";

/**
 * Symbol required for test-only client injection to prevent arbitrary injection in live runs.
 */
export const TEST_ONLY_CLIENT_SYMBOL = Symbol.for("revit.test.mock_client");

/**
 * Strict interval overlap calculation using performance.now() high-res timestamps.
 * Two intervals [startA, endA] and [startB, endB] strictly overlap if:
 *   startA < endB && startB < endA
 * Merely touching boundary (endA === startB or endB === startA) is NOT overlap.
 */
export function checkIntervalOverlap(startA, endA, startB, endB) {
  if (typeof startA !== "number" || typeof endA !== "number" || typeof startB !== "number" || typeof endB !== "number") {
    return false;
  }
  return startA < endB && startB < endA;
}

/**
 * Strict target validation using WHATWG URL parser.
 * Requires:
 *  - HTTPS protocol only
 *  - Hostname exactly equal to qnepjfcbzsycmesrcbjb.supabase.co
 *  - No credentials (username/password)
 *  - Default port (no custom port)
 *  - Empty or root path only ('/' or '')
 *  - No search query parameters or hash
 */
export function validateStagingEnvironment(url, key) {
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new Error("Target validation failed: REVIT_STAGING_SUPABASE_URL is missing or empty.");
  }
  if (!key || typeof key !== "string" || key.trim() === "") {
    throw new Error("Target validation failed: REVIT_STAGING_SERVICE_ROLE_KEY is missing or empty.");
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Target validation failed: Malformed URL provided.");
  }

  // 1. Enforce HTTPS
  if (parsed.protocol !== "https:") {
    throw new Error("Target validation failed: HTTPS is strictly required for Supabase staging.");
  }

  // 2. Reject credentials in URL
  if (parsed.username || parsed.password) {
    throw new Error("Target validation failed: URL must not contain embedded credentials.");
  }

  // 3. Reject custom ports
  if (parsed.port && parsed.port !== "443" && parsed.port !== "") {
    throw new Error(`Target validation failed: Custom port (${parsed.port}) is not permitted.`);
  }

  // 4. Reject search parameters or hash
  if (parsed.search || parsed.hash) {
    throw new Error("Target validation failed: URL must not contain query parameters or fragments.");
  }

  // 5. Reject paths other than root
  if (parsed.pathname && parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("Target validation failed: URL must not contain a subpath.");
  }

  // 6. Strict hostname check against production
  const hostname = parsed.hostname.toLowerCase();
  if (hostname.includes(FORBIDDEN_PROD_REF) || hostname === `${FORBIDDEN_PROD_REF}.supabase.co`) {
    throw new Error("SECURITY VIOLATION: Target configuration points to PRODUCTION database. Execution halted.");
  }

  // 7. Strict hostname equality check
  if (hostname !== APPROVED_STAGING_HOSTNAME) {
    throw new Error(`Target validation failed: Hostname (${hostname}) does not match approved staging hostname (${APPROVED_STAGING_HOSTNAME}).`);
  }

  return true;
}

export class ConcurrencyTestHarness {
  constructor(options = {}) {
    this.dryRun = options.dryRun ?? false;
    this.url = options.url || process.env.REVIT_STAGING_SUPABASE_URL;
    this.key = options.key || process.env.REVIT_STAGING_SERVICE_ROLE_KEY;

    // Guard against client injection bypass:
    // Only permit injected client if explicitly authenticated with TEST_ONLY_CLIENT_SYMBOL
    if (options.client) {
      if (options.testToken !== TEST_ONLY_CLIENT_SYMBOL) {
        throw new Error("SECURITY VIOLATION: Unauthorized client injection attempt detected. Direct client injection is restricted to test environments.");
      }
      this.client = options.client;
    } else {
      this.client = null;
    }

    if (!this.dryRun && !this.client) {
      validateStagingEnvironment(this.url, this.key);
      this.client = createClient(this.url, this.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }

    this.createdFixtures = {
      users: new Set(),
      sessions: new Set(),
      attempts: new Set(),
    };
  }

  trackUser(id) { if (id) this.createdFixtures.users.add(id); }
  trackSession(id) { if (id) this.createdFixtures.sessions.add(id); }
  trackAttempt(id) { if (id) this.createdFixtures.attempts.add(id); }

  async cleanup() {
    if (this.dryRun || !this.client) {
      return { cleaned: true, count: 0, errors: [] };
    }

    const errors = [];

    // 1. Delete attempts created by harness
    if (this.createdFixtures.attempts.size > 0) {
      const ids = Array.from(this.createdFixtures.attempts);
      const { error } = await this.client.from("question_attempts").delete().in("id", ids);
      if (error) errors.push(`Failed cleaning attempts: ${error.message}`);
    }

    // 2. Delete study sessions created by harness
    if (this.createdFixtures.sessions.size > 0) {
      const ids = Array.from(this.createdFixtures.sessions);
      const { error } = await this.client.from("study_sessions").delete().in("id", ids);
      if (error) errors.push(`Failed cleaning sessions: ${error.message}`);
    }

    // 3. Delete synthetic auth users created by harness (cascades any remaining user-owned rows)
    if (this.createdFixtures.users.size > 0) {
      for (const userId of this.createdFixtures.users) {
        try {
          const { error } = await this.client.auth.admin.deleteUser(userId);
          if (error) errors.push(`Failed deleting user ${userId}: ${error.message}`);
        } catch (e) {
          errors.push(`Exception deleting user ${userId}: ${e.message}`);
        }
      }
    }

    return {
      cleaned: errors.length === 0,
      errors,
      fixtures: {
        users: Array.from(this.createdFixtures.users),
        sessions: Array.from(this.createdFixtures.sessions),
        attempts: Array.from(this.createdFixtures.attempts),
      },
    };
  }

  /**
   * Dispatches concurrent requests, normalizes responses, and measures HTTP flight overlap.
   * Uses performance.now() consistently for high-resolution timing.
   * 
   * NOTE: HTTP request overlap demonstrates concurrent in-flight HTTP requests at the client level.
   * It does NOT prove PostgreSQL transaction-level concurrency inside the database engine.
   */
  async executeConcurrentCalls(callFns) {
    if (this.dryRun) {
      return {
        windowDurationMs: 0,
        overlapEstablished: true,
        dryRun: true,
        records: callFns.map((_, i) => ({
          correlationId: `dry-run-${i}`,
          index: i,
          perfStart: 0,
          perfEnd: 0,
          wallStart: Date.now(),
          wallEnd: Date.now(),
          durationMs: 0,
          normalized: { data: [{ id: "mock-id" }], error: null, isError: false },
        })),
      };
    }

    const tStartWindow = performance.now();
    const startWindow = Date.now();
    const records = [];

    const promises = callFns.map(async (fn, index) => {
      const correlationId = randomUUID();
      const perfStart = performance.now();
      const wallStart = Date.now();
      let rawRes = null;
      let thrown = null;

      try {
        rawRes = await fn(correlationId);
      } catch (err) {
        thrown = err;
      }

      const perfEnd = performance.now();
      const wallEnd = Date.now();
      const normalized = normalizeSupabaseResult(rawRes, thrown);

      records[index] = {
        correlationId,
        index,
        perfStart,
        perfEnd,
        wallStart,
        wallEnd,
        durationMs: Math.round((perfEnd - perfStart) * 100) / 100,
        normalized,
      };
    });

    await Promise.all(promises);

    // Compute request interval overlap strictly using performance.now() intervals:
    // startA < endB && startB < endA (boundaries merely touching does NOT count as overlap)
    let overlapEstablished = false;
    if (records.length >= 2) {
      overlapEstablished = checkIntervalOverlap(
        records[0].perfStart,
        records[0].perfEnd,
        records[1].perfStart,
        records[1].perfEnd
      );
    }

    return {
      windowDurationMs: Math.round((performance.now() - tStartWindow) * 100) / 100,
      overlapEstablished,
      records,
    };
  }

  // --- Synthetic Fixture Setup ---

  async setupSyntheticUser(emailPrefix = "concur-user") {
    if (this.dryRun) {
      const mockId = randomUUID();
      this.trackUser(mockId);
      return mockId;
    }

    const email = `${emailPrefix}-${randomUUID().slice(0, 8)}@revit.internal`;
    const { data, error } = await this.client.auth.admin.createUser({
      email,
      password: "TestPassword123!",
      email_confirm: true,
    });
    if (error || !data?.user) {
      throw new Error(`Failed creating synthetic user: ${error?.message || "Unknown"}`);
    }
    this.trackUser(data.user.id);
    return data.user.id;
  }

  async setupSyntheticSession(ownerId) {
    if (this.dryRun) {
      const mockSessionId = randomUUID();
      this.trackSession(mockSessionId);
      return mockSessionId;
    }

    const requestId = randomUUID();
    const { data, error } = await this.client.rpc("create_verified_study_session", {
      p_owner: ownerId,
      p_request_id: requestId,
      p_plan: { mode: "reviewer", target_count: 5, question_pool: [] },
      p_request_digest: `digest-${requestId}`,
    });
    if (error || !data) {
      throw new Error(`Failed creating synthetic session: ${error?.message || "Unknown"}`);
    }
    this.trackSession(data.id);
    return data.id;
  }

  // --- Eight Concurrency Scenarios ---

  async runScenarioA() {
    // Scenario A: Identical attempt ID and identical payload
    const ownerId = await this.setupSyntheticUser("user-a");
    const sessionId = await this.setupSyntheticSession(ownerId);
    const attemptId = randomUUID();
    this.trackAttempt(attemptId);

    const payload = [{
      id: attemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-original", book: "Harr"
    }];

    const runCall = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: payload
    });

    const execResult = await this.executeConcurrentCalls([runCall, runCall]);
    if (this.dryRun) {
      return { name: "Scenario A: Identical attempt ID & payload", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 1 };
    }

    const { data: rows } = await this.client.from("question_attempts").select().eq("id", attemptId);

    const bothAcked = execResult.records.every(r => !r.normalized.isError && Array.isArray(r.normalized.data) && r.normalized.data[0]?.id === attemptId);
    const exactlyOneRow = rows?.length === 1;
    const correctOwner = rows?.[0]?.user_id === ownerId;
    const pass = bothAcked && exactlyOneRow && correctOwner;

    return {
      name: "Scenario A: Identical attempt ID & payload",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: rows?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? r.normalized.error.code : "ACK" }))
    };
  }

  async runScenarioB() {
    // Scenario B: Same attempt ID, conflicting response digest
    const ownerId = await this.setupSyntheticUser("user-b");
    const sessionId = await this.setupSyntheticSession(ownerId);
    const attemptId = randomUUID();
    this.trackAttempt(attemptId);

    const payloadValid = [{
      id: attemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-valid", book: "Harr"
    }];

    const payloadConflict = [{
      id: attemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-CONFLICTING", book: "Harr"
    }];

    const runValid = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: payloadValid
    });
    const runConflict = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: payloadConflict
    });

    const execResult = await this.executeConcurrentCalls([runValid, runConflict]);
    if (this.dryRun) {
      return { name: "Scenario B: Same attempt ID, conflicting digest", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 1 };
    }

    const { data: rows } = await this.client.from("question_attempts").select().eq("id", attemptId);

    const hasSuccess = execResult.records.some(r => !r.normalized.isError && Array.isArray(r.normalized.data));
    const hasRejected = execResult.records.some(r => r.normalized.isError && (r.normalized.error.code === "23505" || r.normalized.error.message.includes("23505")));
    const exactlyOneRow = rows?.length === 1;
    const pass = hasSuccess && hasRejected && exactlyOneRow;

    return {
      name: "Scenario B: Same attempt ID, conflicting digest",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: rows?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? r.normalized.error.code : "ACK" }))
    };
  }

  async runScenarioC() {
    // Scenario C: Same session slot, different attempt IDs
    const ownerId = await this.setupSyntheticUser("user-c");
    const sessionId = await this.setupSyntheticSession(ownerId);
    const attemptId1 = randomUUID();
    const attemptId2 = randomUUID();
    this.trackAttempt(attemptId1);
    this.trackAttempt(attemptId2);

    const payload1 = [{
      id: attemptId1, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-1", book: "Harr"
    }];
    const payload2 = [{
      id: attemptId2, question_id: "harr-cc-02", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 2, is_correct: true, session_slot: 0, // SAME SLOT 0
      content_version: "v1", response_digest: "digest-2", book: "Harr"
    }];

    const call1 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: payload1
    });
    const call2 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: payload2
    });

    const execResult = await this.executeConcurrentCalls([call1, call2]);
    if (this.dryRun) {
      return { name: "Scenario C: Slot collision, different IDs", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 1 };
    }

    const { data: rows } = await this.client.from("question_attempts").select().eq("session_id", sessionId);

    const hasSuccess = execResult.records.some(r => !r.normalized.isError && Array.isArray(r.normalized.data));
    const hasRejected = execResult.records.some(r => r.normalized.isError && (r.normalized.error.code === "23505" || r.normalized.error.message.includes("23505")));
    const exactlyOneRow = rows?.length === 1;
    const pass = hasSuccess && hasRejected && exactlyOneRow;

    return {
      name: "Scenario C: Slot collision, different IDs",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: rows?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? r.normalized.error.code : "ACK" }))
    };
  }

  async runScenarioD() {
    // Scenario D: Same session-creation idempotency key
    const ownerId = await this.setupSyntheticUser("user-d");
    const requestId = randomUUID();

    const callCreate = () => this.client.rpc("create_verified_study_session", {
      p_owner: ownerId,
      p_request_id: requestId,
      p_plan: { mode: "reviewer", target_count: 5, question_pool: [] },
      p_request_digest: `digest-${requestId}`,
    });

    const execResult = await this.executeConcurrentCalls([callCreate, callCreate]);
    if (this.dryRun) {
      return { name: "Scenario D: Session creation idempotency", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 1 };
    }

    // Track returned session ID
    if (!execResult.records[0].normalized.isError && execResult.records[0].normalized.data?.id) {
      this.trackSession(execResult.records[0].normalized.data.id);
    }
    if (!execResult.records[1].normalized.isError && execResult.records[1].normalized.data?.id) {
      this.trackSession(execResult.records[1].normalized.data.id);
    }

    const { data: sessions } = await this.client.from("study_sessions").select().eq("user_id", ownerId).eq("request_id", requestId);
    const bothSuccess = execResult.records.every(r => !r.normalized.isError);
    const sameId = execResult.records[0].normalized.data?.id === execResult.records[1].normalized.data?.id;
    const exactlyOneSession = sessions?.length === 1;
    const pass = bothSuccess && sameId && exactlyOneSession;

    return {
      name: "Scenario D: Session creation idempotency",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: sessions?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, sessionId: r.normalized.data?.id }))
    };
  }

  async runScenarioE() {
    // Scenario E: Disjoint batches within the same session
    const ownerId = await this.setupSyntheticUser("user-e");
    const sessionId = await this.setupSyntheticSession(ownerId);
    const attemptId1 = randomUUID();
    const attemptId2 = randomUUID();
    this.trackAttempt(attemptId1);
    this.trackAttempt(attemptId2);

    const batch1 = [{
      id: attemptId1, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-e1", book: "Harr"
    }];
    const batch2 = [{
      id: attemptId2, question_id: "harr-cc-02", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 2, is_correct: true, session_slot: 1, // DISJOINT SLOT 1
      content_version: "v1", response_digest: "digest-e2", book: "Harr"
    }];

    const call1 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: batch1
    });
    const call2 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerId, p_session_id: sessionId, p_attempts: batch2
    });

    const execResult = await this.executeConcurrentCalls([call1, call2]);
    if (this.dryRun) {
      return { name: "Scenario E: Disjoint batches in same session", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 2 };
    }

    const { data: rows } = await this.client.from("question_attempts").select().eq("session_id", sessionId);
    const bothSuccess = execResult.records.every(r => !r.normalized.isError);
    const bothSlotsPresent = rows?.length === 2 && rows.some(r => r.session_slot === 0) && rows.some(r => r.session_slot === 1);
    const pass = bothSuccess && bothSlotsPresent;

    return {
      name: "Scenario E: Disjoint batches in same session",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: rows?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? r.normalized.error.code : "ACK" }))
    };
  }

  async runScenarioF() {
    // Scenario F: Batches from independent sessions
    const owner1 = await this.setupSyntheticUser("user-f1");
    const owner2 = await this.setupSyntheticUser("user-f2");
    const session1 = await this.setupSyntheticSession(owner1);
    const session2 = await this.setupSyntheticSession(owner2);
    const attemptId1 = randomUUID();
    const attemptId2 = randomUUID();
    this.trackAttempt(attemptId1);
    this.trackAttempt(attemptId2);

    const batch1 = [{
      id: attemptId1, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-f1", book: "Harr"
    }];
    const batch2 = [{
      id: attemptId2, question_id: "harr-cc-02", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 2, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-f2", book: "Harr"
    }];

    const call1 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: owner1, p_session_id: session1, p_attempts: batch1
    });
    const call2 = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: owner2, p_session_id: session2, p_attempts: batch2
    });

    const execResult = await this.executeConcurrentCalls([call1, call2]);
    if (this.dryRun) {
      return { name: "Scenario F: Independent session batches", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 2 };
    }

    const { data: rows1 } = await this.client.from("question_attempts").select().eq("session_id", session1);
    const { data: rows2 } = await this.client.from("question_attempts").select().eq("session_id", session2);

    const bothSuccess = execResult.records.every(r => !r.normalized.isError);
    const isolated = rows1?.length === 1 && rows1[0].user_id === owner1
      && rows2?.length === 1 && rows2[0].user_id === owner2;
    const pass = bothSuccess && isolated;

    return {
      name: "Scenario F: Independent session batches",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: (rows1?.length ?? 0) + (rows2?.length ?? 0),
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? r.normalized.error.code : "ACK" }))
    };
  }

  async runScenarioG() {
    // Scenario G: Cross-owner attempt ID collision
    const ownerA = await this.setupSyntheticUser("user-ga");
    const ownerB = await this.setupSyntheticUser("user-gb");
    const sessionA = await this.setupSyntheticSession(ownerA);
    const sessionB = await this.setupSyntheticSession(ownerB);
    const sharedAttemptId = randomUUID();
    this.trackAttempt(sharedAttemptId);

    const batchA = [{
      id: sharedAttemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-ga", book: "Harr"
    }];
    const batchB = [{
      id: sharedAttemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-gb", book: "Harr"
    }];

    const callA = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerA, p_session_id: sessionA, p_attempts: batchA
    });
    const callB = () => this.client.rpc("commit_verified_study_batch", {
      p_owner: ownerB, p_session_id: sessionB, p_attempts: batchB
    });

    const execResult = await this.executeConcurrentCalls([callA, callB]);
    if (this.dryRun) {
      return { name: "Scenario G: Cross-owner attempt collision", status: "PASS (DRY-RUN)", overlapEstablished: true, rowCount: 1 };
    }

    const { data: rows } = await this.client.from("question_attempts").select().eq("id", sharedAttemptId);

    const oneSuccess = execResult.records.filter(r => !r.normalized.isError).length === 1;
    const oneBlocked = execResult.records.filter(r => r.normalized.isError && (r.normalized.error.code === "42501" || r.normalized.error.message.includes("42501"))).length === 1;
    const exactlyOneRow = rows?.length === 1;
    // Cross-user leak prevention: check that rejected caller got zero attempt data returned
    const rejectedRecord = execResult.records.find(r => r.normalized.isError);
    const zeroDataReturned = rejectedRecord && !rejectedRecord.normalized.data;
    const pass = oneSuccess && oneBlocked && exactlyOneRow && zeroDataReturned;

    return {
      name: "Scenario G: Cross-owner attempt collision",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: execResult.overlapEstablished,
      rowCount: rows?.length ?? 0,
      records: execResult.records.map(r => ({ correlationId: r.correlationId, status: r.normalized.isError ? (r.normalized.error.code || "BLOCKED_42501") : "ACK" }))
    };
  }

  async runScenarioH() {
    // Scenario H: Retry after committed request with lost acknowledgment (Sequential retry simulation)
    const ownerId = await this.setupSyntheticUser("user-h");
    const sessionId = await this.setupSyntheticSession(ownerId);
    const attemptId = randomUUID();
    this.trackAttempt(attemptId);

    const payload = [{
      id: attemptId, question_id: "harr-cc-01", subject_id: "cc", subject_name: "CC",
      topic_id: "inst", topic_name: "Inst", subtopic: "Spec", difficulty: "Easy",
      selected_answer: 1, is_correct: true, session_slot: 0,
      content_version: "v1", response_digest: "digest-h", book: "Harr"
    }];

    if (this.dryRun) {
      return { name: "Scenario H: Lost-ack retry idempotency", status: "PASS (DRY-RUN)", overlapEstablished: false, rowCount: 1 };
    }

    // First commit
    let firstRaw, firstErr;
    try {
      firstRaw = await this.client.rpc("commit_verified_study_batch", {
        p_owner: ownerId, p_session_id: sessionId, p_attempts: payload
      });
    } catch (e) { firstErr = e; }
    const firstNorm = normalizeSupabaseResult(firstRaw, firstErr);

    // Client lost ack, retries identical payload sequentially
    let retryRaw, retryErr;
    try {
      retryRaw = await this.client.rpc("commit_verified_study_batch", {
        p_owner: ownerId, p_session_id: sessionId, p_attempts: payload
      });
    } catch (e) { retryErr = e; }
    const retryNorm = normalizeSupabaseResult(retryRaw, retryErr);

    const { data: rows } = await this.client.from("question_attempts").select().eq("id", attemptId);

    const pass = !firstNorm.isError && !retryNorm.isError
      && Array.isArray(retryNorm.data) && retryNorm.data[0]?.id === attemptId
      && rows?.length === 1;

    return {
      name: "Scenario H: Lost-ack retry idempotency",
      status: pass ? "PASS" : "FAIL",
      overlapEstablished: false, // Sequential retry by definition
      rowCount: rows?.length ?? 0,
      records: [
        { initialAck: !firstNorm.isError ? "ACK" : firstNorm.error.message },
        { retryAck: !retryNorm.isError ? "ACK" : retryNorm.error.message }
      ]
    };
  }

  async runAllScenarios() {
    const results = [];
    try {
      results.push(await this.runScenarioA());
      results.push(await this.runScenarioB());
      results.push(await this.runScenarioC());
      results.push(await this.runScenarioD());
      results.push(await this.runScenarioE());
      results.push(await this.runScenarioF());
      results.push(await this.runScenarioG());
      results.push(await this.runScenarioH());
    } finally {
      const cleanupReport = await this.cleanup();
      results.cleanup = cleanupReport;
    }

    // If cleanup reported errors, append a failure record or mark overall status failing
    if (results.cleanup && !results.cleanup.cleaned) {
      results.cleanupFailed = true;
    }

    return results;
  }
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].endsWith("concurrent-persistence-test.mjs")) {
  const isDryRun = process.argv.includes("--dry-run");
  const isStagingLive = process.argv.includes("--run-staging");

  if (!isDryRun && !isStagingLive) {
    console.error("[RevIT Concurrency Test Harness] Missing execution mode.");
    console.error("Usage:");
    console.error("  node scripts/phase3n/concurrent-persistence-test.mjs --dry-run");
    console.error("  node scripts/phase3n/concurrent-persistence-test.mjs --run-staging");
    process.exit(1);
  }

  console.log(`[RevIT Concurrency Test Harness] Mode: ${isDryRun ? "DRY-RUN (Local Validation)" : "LIVE STAGING"}`);

  try {
    const harness = new ConcurrencyTestHarness({ dryRun: isDryRun });

    if (isDryRun) {
      console.log("Validation: Target guards active.");
      console.log("Validation: Testing URL guard with invalid targets...");

      let caught = false;
      try {
        validateStagingEnvironment("https://lznsdxfvxeckflxsohig.supabase.co", "dummy-key");
      } catch (err) {
        caught = true;
        console.log("Pass: Production URL strictly rejected:", err.message);
      }
      if (!caught) throw new Error("Security failure: Production URL was not rejected!");

      caught = false;
      try {
        validateStagingEnvironment("https://random-ref.supabase.co", "dummy-key");
      } catch (err) {
        caught = true;
        console.log("Pass: Unapproved project reference rejected:", err.message);
      }
      if (!caught) throw new Error("Security failure: Unapproved reference was not rejected!");

      validateStagingEnvironment("https://qnepjfcbzsycmesrcbjb.supabase.co", "dummy-key");
      console.log("Pass: Approved staging reference accepted.");

      console.log("\nExecuting all 8 scenarios in dry-run mode...");
      harness.runAllScenarios().then(results => {
        let allPassed = true;
        for (const res of results) {
          console.log(`[DRY-RUN RESULT] ${res.name}: ${res.status}`);
          if (!res.status.includes("PASS")) allPassed = false;
        }
        if (!allPassed) {
          console.error("Dry run failed.");
          process.exit(1);
        } else {
          console.log("\n[DRY RUN SUMMARY] All 8 test scenarios defined and ready for staging execution.");
          process.exit(0);
        }
      });
    } else {
      console.log("Live staging execution starting...");
      harness.runAllScenarios().then(results => {
        console.log("\n================ LIVE STAGING RESULTS ================");
        let anyFailed = false;
        for (const res of results) {
          console.log(`[RESULT] ${res.name}: ${res.status} (Overlap: ${res.overlapEstablished}, Rows: ${res.rowCount})`);
          if (res.status !== "PASS") anyFailed = true;
        }
        console.log("Cleanup Status:", results.cleanup?.cleaned ? "CLEAN" : "WARNING - ERRORS DETECTED");
        if (results.cleanup?.errors?.length > 0) {
          console.error("Cleanup Errors:", results.cleanup.errors);
          anyFailed = true;
        }
        if (results.cleanupFailed) {
          anyFailed = true;
        }
        process.exit(anyFailed ? 1 : 0);
      }).catch(err => {
        console.error("Fatal error during scenario execution:", err.message);
        process.exit(1);
      });
    }
  } catch (err) {
    console.error("Test Harness Preflight Error:", err.message);
    process.exit(1);
  }
}
