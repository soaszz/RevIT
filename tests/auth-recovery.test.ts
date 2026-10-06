import assert from "node:assert/strict";
import test from "node:test";
import { loadCloudSnapshot } from "../app/lib/cloudService";

test("loadCloudSnapshot fails fast with AUTH_SESSION_EXPIRED when no session is available", async () => {
  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => ({ data: { session: null }, error: new Error("No refresh token") }),
    },
    from: () => {
      throw new Error("Should not query tables when session is missing");
    },
  };

  await assert.rejects(
    async () => {
      await loadCloudSnapshot(mockClient as never, "test-user-id");
    },
    (err: Error) => {
      assert.strictEqual(err.message, "AUTH_SESSION_EXPIRED");
      return true;
    },
  );
});

test("loadCloudSnapshot refreshes session when expired before querying tables", async () => {
  let refreshed = false;
  const mockClient = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      refreshSession: async () => {
        refreshed = true;
        return {
          data: {
            session: {
              access_token: "refreshed-token",
              user: { id: "test-user-id" },
            },
          },
          error: null,
        };
      },
    },
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = () => builder;
      builder.limit = async () => ({ data: [], error: null });
      builder.range = async () => ({ data: [], error: null });
      builder.maybeSingle = async () => ({ data: null, error: null });
      builder.single = async () => ({ data: null, error: null });
      return builder;
    },
    rpc: async () => ({ data: null, error: null }),
  };

  const snapshot = await loadCloudSnapshot(mockClient as never, "test-user-id");
  assert.strictEqual(refreshed, true);
  assert.ok(snapshot);
});

test("createBrowserFetch retries 401 on rest endpoint with refreshed token and stops recursion", async () => {
  const { createBrowserFetch } = await import("../app/lib/supabase/client");

  let refreshCalled = 0;
  const mockClient = {} as never;
  const refreshFn = async () => {
    refreshCalled += 1;
    return "fresh-access-token";
  };

  const calls: { url: string; headers: Record<string, string> }[] = [];
  const mockBaseFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    calls.push({ url, headers });

    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 });
    }
    return new Response(JSON.stringify([{ id: "1" }]), { status: 200 });
  };

  const browserFetch = createBrowserFetch(() => mockClient, refreshFn, mockBaseFetch as typeof fetch);

  const res = await browserFetch("https://example.supabase.co/rest/v1/profiles?id=eq.123", {
    headers: { Authorization: "Bearer expired-token" },
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(refreshCalled, 1);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].headers.authorization, "Bearer expired-token");
  assert.strictEqual(calls[1].headers.authorization, "Bearer fresh-access-token");
  assert.strictEqual(calls[1].headers["x-revit-retry"], "1");
});

test("createBrowserFetch does not retry 401 when already retried", async () => {
  const { createBrowserFetch } = await import("../app/lib/supabase/client");

  let refreshCalled = 0;
  const mockClient = {} as never;
  const refreshFn = async () => {
    refreshCalled += 1;
    return "fresh-token";
  };

  let baseFetchCalls = 0;
  const mockBaseFetch = async () => {
    baseFetchCalls += 1;
    return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
  };

  const browserFetch = createBrowserFetch(() => mockClient, refreshFn, mockBaseFetch as typeof fetch);

  const res = await browserFetch("https://example.supabase.co/rest/v1/question_attempts?user_id=eq.123", {
    headers: {
      Authorization: "Bearer token",
      "x-revit-retry": "1",
    },
  });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(refreshCalled, 0);
  assert.strictEqual(baseFetchCalls, 1);
});

