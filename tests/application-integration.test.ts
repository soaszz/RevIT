import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { QUESTION_BANKS } from "../app/lib/entitlements";
import { getPublicReviewerBooks } from "../app/lib/publicReviewerBooks";

test("AI descriptions and fallback use only the same published editions as public plan copy", () => {
  const source = readFileSync("app/api/chat/route.ts", "utf8");
  const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
  const parts = ast.statements.filter(statement => ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.some(d => ["publishedBookNames", "MEDTECH_INSTRUCTIONS"].includes(d.name.getText(ast)))
    : ts.isFunctionDeclaration(statement) && ["getRevItSystemInstructions", "demoAnswer"].includes(statement.name?.text ?? ""))
    .map(statement => statement.getText(ast)).join("\n");
  const code = ts.transpileModule(parts, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const hidden of [null, "ciulla", "rodak", "strasinger"] as const) {
    const registry = Object.fromEntries(Object.entries(QUESTION_BANKS).map(([id, bank]) => [id, { ...bank, published: bank.published !== false && id !== hidden }]));
    const books = getPublicReviewerBooks(registry);
    const result = new Function("PUBLIC_REVIEWERS", "SITE_UPDATES", `${code};return [getRevItSystemInstructions(), demoAnswer("What is RevIT?")];`)(books, []) as string[];
    for (const text of result) {
      for (const book of books.books) assert.ok(text.includes(book.label));
      if (hidden) assert.ok(!text.includes(QUESTION_BANKS[hidden].label));
      assert.doesNotMatch(text, /BOC|Elsevier/);
    }
  }
  assert.match(readFileSync("app/components/AiAcademicSettingsModal.tsx", "utf8"), /Published reviewer editions, subject structure, and available topics/);
});
