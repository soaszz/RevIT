import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SourceText from "../app/components/SourceText";
import { toFlashcard } from "../app/lib/flashcards";
import type { ReviewerQuestion, SourceTextMarks } from "../app/content/reviewerContent";

const render = (text: string, marks?: SourceTextMarks) => renderToStaticMarkup(createElement(SourceText, { text, marks }));

test("source subscripts and superscripts retain every character and source order", () => {
  assert.equal(render("Rzr′", [{ start: 1, end: 2, script: "sub" }]), "R<sub>z</sub>r′");
  assert.equal(render("Kpa", [{ start: 2, end: 3, script: "sup" }]), "Kp<sup>a</sup>");
  assert.equal(render("Amod Na+", [{ start: 1, end: 4, script: "sub" }, { start: 7, end: 8, script: "sup" }]), "A<sub>mod</sub> Na<sup>+</sup>");
});

test("unformatted source text adds no DOM wrapper or style changes", () => {
  assert.equal(render("Ordinary source text ± μL"), "Ordinary source text ± μL");
  assert.equal(render("plain", []), "plain");
});

test("source strings remain escaped, including within formatted ranges", () => {
  assert.equal(render("<img src=x onerror=alert(1)>", [{ start: 0, end: 4, script: "sub" }]), "<sub>&lt;img</sub> src=x onerror=alert(1)&gt;");
  assert.equal(render("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
});

test("invalid ranges or script names cannot create arbitrary markup", () => {
  for (const marks of [
    [{ start: -1, end: 2, script: "sub" }],
    [{ start: 0, end: 4, script: "sup" }],
    [{ start: 1, end: 1, script: "sub" }],
    [{ start: 0, end: 2, script: "sub" }, { start: 1, end: 3, script: "sup" }],
    [{ start: 0.5, end: 2, script: "sub" }],
    [{ start: 0, end: 1, script: "script" }],
  ]) assert.equal(render("Rzr", marks as SourceTextMarks), "Rzr");
});

test("Flashcards preserve question, indexed choice, answer and rationale notation", () => {
  const question: ReviewerQuestion = {
    id: "formatting-fixture", subjectId: "fixture", topicId: "fixture", prompt: "Na+",
    choices: ["A. source text", "Rzr′", "Other", "Other"], correctAnswer: 1, officialAnswer: "b",
    explanation: "Kpa", source: { fileName: "fixture", page: 1, kind: "fixture" },
    sourceFormatting: {
      prompt: [{ start: 2, end: 3, script: "sup" }],
      choices: [[], [{ start: 1, end: 2, script: "sub" }], [], []],
      explanation: [{ start: 2, end: 3, script: "sup" }],
    },
  };
  const original = JSON.stringify(question);
  const card = toFlashcard(question);
  assert.equal(render(card.prompt, card.sourceFormatting?.prompt), "Na<sup>+</sup>");
  assert.equal(render(card.choices[1], card.sourceFormatting?.choices?.[1]), "R<sub>z</sub>r′");
  assert.equal(render(card.answer, card.answerFormatting), "R<sub>z</sub>r′");
  assert.equal(render(card.explanation, card.sourceFormatting?.explanation), "Kp<sup>a</sup>");
  assert.equal(JSON.stringify(question), original);
});

test("MCQ choices and answer reveal bind notation to source choice index, including shuffle", () => {
  const app = readFileSync(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  assert.match(app, /marks=\{currentQuestion\.sourceFormatting\?\.choices\?\.\[choiceIndex\]\}/);
  assert.match(app, /marks=\{currentQuestion\.sourceFormatting\.choices\?\.\[currentQuestion\.correctAnswer\]\}/);
  assert.match(app, /marks=\{currentQuestion\.sourceFormatting\?\.explanation\}/);
  assert.match(app, /marks=\{section\.sourceFormatting\}/);
});
