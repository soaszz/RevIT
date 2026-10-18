import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import test from "node:test";

const source = readFileSync(new URL("../scripts/check-secrets.mjs", import.meta.url), "utf8");
const definitions = source.slice(source.indexOf("const HIGH_CONFIDENCE_PATTERNS"), source.indexOf("const tracked ="));
const api = new Function("createInterface", `${definitions}; return { scan, scanGitHistory };`)(createInterface) as {
  scan(label: string, content: string): string[];
  scanGitHistory(stream: Readable): Promise<string[]>;
};

test("streamed history uses unchanged detection patterns and retains split tokens without exposing values", async () => {
  const detectors = source.slice(source.indexOf("const HIGH_CONFIDENCE_PATTERNS"), source.indexOf("async function scanGitHistory")).replaceAll("\r\n", "\n").trim();
  assert.equal(createHash("sha256").update(detectors).digest("hex"), readFileSync(new URL("../docs/phase3n/phase3n-k/secret-detector-baseline.sha256", import.meta.url), "utf8").trim());
  const token = ["gsk", "_", "a".repeat(24)].join("");
  const text = `commit:test\n+key=${token}\r\n+-----BEGIN ${"PRIVATE"} KEY-----\n`;
  const chunks = Array.from(text, character => Buffer.from(character));
  const found = await api.scanGitHistory(Readable.from(chunks));
  assert.deepEqual(found.sort(), api.scan("Git history", text).sort());
  assert.equal(found.length, 2); assert.ok(found.every(line => !line.includes(token)));
});

test("streamed history inspects every line beyond many chunks and deduplicates findings", async () => {
  const token = ["sk", "-", "b".repeat(24)].join("");
  async function* lines() { for (let index = 0; index < 20000; index++) yield `commit:${index}\n`; yield `${token}\n${token}\n`; }
  assert.deepEqual(await api.scanGitHistory(Readable.from(lines())), ["Git history: OpenAI API key"]);
  assert.doesNotMatch(source, /maxBuffer: 256/);
});
