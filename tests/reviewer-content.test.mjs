import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the validated bacteriology and hematology library", async () => {
  const raw = await readFile(new URL("../app/content/reviewerContent.json", import.meta.url), "utf8");
  const content = JSON.parse(raw);
  const topicIds = new Set(content.topics.map((topic) => topic.id));
  const ids = new Set(content.questions.map((question) => question.id));
  const bySubject = Object.groupBy(content.questions, (question) => question.subjectId);

  assert.equal(content.subjects.length, 2);
  assert.equal(content.topics.length, 12);
  assert.equal(content.questions.length, 103);
  assert.equal(bySubject.bacteriology.length, 68);
  assert.equal(bySubject.hematology.length, 35);
  assert.equal(ids.size, content.questions.length);

  for (const question of content.questions) {
    assert.equal(question.choices.length, 4);
    assert.ok(Number.isInteger(question.correctAnswer));
    assert.ok(question.correctAnswer >= 0 && question.correctAnswer < 4);
    assert.ok(topicIds.has(question.topicId));
    assert.match(question.source.fileName, /\.pdf$/i);
    assert.ok(question.source.page > 0);
  }
});

test("uses RevIT and Groq branding while keeping the MedTech AI tab", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");

  assert.match(layout, /RevIT \| Bacteriology and hematology reviewer/i);
  assert.match(layout, /data-theme="light"/i);
  assert.match(layout, /revit-theme/i);
  assert.match(app, /Ask RevIT AI/i);
  assert.match(app, /label: "MedTech AI"/i);
  assert.match(app, /Toggle light and dark mode/i);
  assert.match(route, /from "groq-sdk"/i);
  assert.match(route, /GROQ_API_KEY/i);
  assert.match(route, /GROQ_MODEL/i);
  assert.doesNotMatch(`${layout}\n${app}\n${route}`, /MedReview|Gemini|api\.openai\.com/i);
});
