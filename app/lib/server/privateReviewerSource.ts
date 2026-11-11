import "server-only";
import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import pins from "../../../docs/private-reviewers/pins.json";

// Only exact, reviewed pack entries are readable. Never resolve a caller-supplied path.
export function readPrivateReviewerSource(sourcePath: string): Buffer {
  const entry = pins.files.find(file => file.path === sourcePath);
  if (!entry || !entry.privatePath.startsWith("runtime/")) throw new Error("Unknown private reviewer source");
  const root = resolve(process.cwd(), ".private-reviewers/runtime");
  const target = resolve(root, entry.privatePath.slice("runtime/".length));
  if (relative(root, target).startsWith("..")) throw new Error("Invalid private reviewer source");
  for (let path = root; ; ) {
    if (lstatSync(path).isSymbolicLink()) throw new Error("Linked private reviewer source");
    if (path === target) break;
    path = resolve(path, relative(path, target).split(sep)[0]);
  }
  const bytes = readFileSync(target);
  if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
    throw new Error("Private reviewer source integrity failure");
  }
  return bytes;
}
