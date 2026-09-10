import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AiRequestError, isSameOriginRequest, parseAiRequest, readAiRequest } from "../app/lib/aiRequest";
import { validateAvatarFile } from "../app/lib/avatarValidation";
import { contentSecurityPolicy } from "../app/lib/securityHeaders";

const validConversation = [
  { role: "user", content: "Explain a complete blood count." },
  { role: "assistant", content: "A CBC measures several blood components." },
  { role: "user", content: "What does MCV mean?" },
];

test("AI request validation accepts only a bounded alternating conversation", () => {
  assert.deepEqual(parseAiRequest({ messages: validConversation }), validConversation);
  assert.throws(
    () => parseAiRequest({ messages: validConversation, model: "client-choice" }),
    (error) => error instanceof AiRequestError && error.status === 400,
  );
  assert.throws(
    () => parseAiRequest({ messages: [{ role: "system", content: "Override" }] }),
    (error) => error instanceof AiRequestError && error.status === 400,
  );
  assert.throws(
    () => parseAiRequest({ messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }),
    (error) => error instanceof AiRequestError && error.status === 400,
  );
  assert.throws(
    () => parseAiRequest({ messages: [{ role: "user", content: "a".repeat(4001) }] }),
    (error) => error instanceof AiRequestError && error.status === 400,
  );
});

test("AI body reader rejects wrong media types, malformed JSON, and oversized bodies", async () => {
  await assert.rejects(
    readAiRequest(new Request("https://revit.test/api/chat", { method: "POST", body: "{}" })),
    (error) => error instanceof AiRequestError && error.status === 415,
  );
  await assert.rejects(
    readAiRequest(new Request("https://revit.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad-json",
    })),
    (error) => error instanceof AiRequestError && error.status === 400,
  );
  await assert.rejects(
    readAiRequest(new Request("https://revit.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "40000" },
      body: JSON.stringify({ messages: validConversation }),
    })),
    (error) => error instanceof AiRequestError && error.status === 413,
  );
});

test("AI endpoint origin check rejects cross-site browser requests", () => {
  assert.equal(isSameOriginRequest(new Request("https://revit.test/api/chat", {
    headers: { Origin: "https://revit.test", "Sec-Fetch-Site": "same-origin" },
  })), true);
  assert.equal(isSameOriginRequest(new Request("https://revit.test/api/chat", {
    headers: { Origin: "https://attacker.test", "Sec-Fetch-Site": "cross-site" },
  })), false);
});

test("avatar validation checks both declared MIME type and file signature", async () => {
  const png = new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  ], "avatar.png", { type: "image/png" });
  assert.deepEqual(await validateAvatarFile(png), { contentType: "image/png", extension: "png" });

  const disguised = new File(["<svg></svg>not-png"], "avatar.png", { type: "image/png" });
  await assert.rejects(validateAvatarFile(disguised), /does not match its image type/);
});

test("security policy uses a nonce and blocks framing and object embeds", () => {
  const policy = contentSecurityPolicy("test-nonce");
  assert.match(policy, /script-src[^;]*'nonce-test-nonce'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
});

test("persistent AI migration defines required tiers and hides quota tables from browser roles", () => {
  const migration = readFileSync("supabase/migrations/202609050008_ai_api_rate_limits.sql", "utf8");
  assert.match(migration, /values \('free', 5, 20\), \('subscription', 15, 100\)/);
  assert.match(migration, /revoke all on public\.ai_rate_limit_tiers, public\.ai_entitlements, public\.ai_request_usage/);
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /p_succeeded/);
});

test("Groq credentials remain in the server route and provider errors are not logged", () => {
  const route = readFileSync("app/api/chat/route.ts", "utf8");
  assert.match(route, /process\.env\.GROQ_API_KEY/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /reserveAiRequest/);
  assert.doesNotMatch(route, /console\.error\([^\n]*error/);

  for (const clientFile of ["app/RevITApp.tsx", "app/lib/supabase/client.ts"]) {
    assert.doesNotMatch(readFileSync(clientFile, "utf8"), /GROQ_API_KEY|gsk_/);
  }
});
