import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("uses the Vercel-compatible Next.js build path", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
  );

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.equal(packageJson.dependencies.next, "16.3.1");
});

test("keeps secrets out of the repository", async () => {
  const [gitignore, envExample] = await Promise.all([
    readFile(new URL(".gitignore", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(envExample, /^GEMINI_API_KEY=$/m);
  assert.doesNotMatch(envExample, /^OPENAI_API_KEY=/m);
});

test("ships the MedReview experience and server-side chat route", async () => {
  const [page, app, chatRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/MedReviewApp.tsx", root), "utf8"),
    readFile(new URL("app/api/chat/route.ts", root), "utf8"),
  ]);

  assert.match(page, /<MedReviewApp \/>/);
  assert.match(app, /MedTech AI/);
  assert.match(chatRoute, /export async function POST/);
  assert.match(chatRoute, /process\.env\.GEMINI_API_KEY/);
  assert.match(chatRoute, /generativelanguage\.googleapis\.com/);
  assert.doesNotMatch(chatRoute, /api\.openai\.com/);
  assert.doesNotMatch(chatRoute, /OPENAI_API_KEY/);
});
