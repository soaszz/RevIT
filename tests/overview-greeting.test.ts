import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

const projectFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("overview restores the personalized greeting as its large heading", () => {
  const app = projectFile("app/RevITApp.tsx");
  const styles = projectFile("app/globals.css");

  assert.match(app, /title: `\$\{greetingFor\(new Date\(\), preferences\.timezone\)\}, \$\{firstName\}`/);
  assert.match(app, /<h1 className=\{activeView === "overview" \? "overview-greeting" : undefined\}>/);
  assert.match(styles, /\.page-heading h1\.overview-greeting \{[^}]*font-size: clamp\(42px, 5\.4vw, 68px\);[^}]*font-weight: 850;/);
});
