import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import legacy from "../app/content/reviewerContent.json";
import source from "../app/content/harrCoagulationSource.json";
import { activeHarrQuestions, allHarrHistoryQuestions, legacyCoagulationIds, HARR_COAGULATION_TOPIC } from "../app/lib/harrQuestionPool";
import { harrQuestions, questionById } from "../app/content/reviewerContent";
import { getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import { buildFlashcardDeck } from "../app/lib/flashcards";
import { subjects, topics } from "../app/content/reviewerContent";

test("25 verified source questions replace 12 in active pools; all historical bytes and IDs remain", () => {
  assert.equal(legacy.questions.length,1593);
  assert.equal(legacyCoagulationIds.size,12);
  assert.equal(source.questions.length,25);
  assert.equal(activeHarrQuestions.length,1606);
  assert.equal(allHarrHistoryQuestions.length,1618);
  assert.equal(activeHarrQuestions.filter(q=>q.topicId===HARR_COAGULATION_TOPIC).length,25);
  assert.equal(activeHarrQuestions.some(q=>legacyCoagulationIds.has(q.id)),false);
  for(const old of legacy.questions) {
    assert.deepEqual(allHarrHistoryQuestions.find(q=>q.id===old.id),old);
    assert.deepEqual(questionById.get(old.id),{...old,book:"Harr"});
  }
  assert.deepEqual(activeHarrQuestions.filter(q=>q.topicId!==HARR_COAGULATION_TOPIC),legacy.questions.filter(q=>q.topicId!==HARR_COAGULATION_TOPIC));
  assert.deepEqual(activeHarrQuestions.filter(q=>q.topicId===HARR_COAGULATION_TOPIC).map(q=>q.id),Array.from({length:25},(_,i)=>`harr-hemostasis-2-1-source-${String(i+1).padStart(3,"0")}`));
});

test("library, MCQs, flashcards and historical resume lookup use the intended separate pools", () => {
  const library=getUnifiedSubjects("Harr",subjects,topics);
  assert.ok(library.find(s=>s.id==="hematology")?.topicIds.includes(HARR_COAGULATION_TOPIC));
  assert.equal(harrQuestions.filter(q=>q.topicId===HARR_COAGULATION_TOPIC).length,25);
  assert.equal(buildFlashcardDeck(harrQuestions,[HARR_COAGULATION_TOPIC]).length,25);
  for(const id of legacyCoagulationIds)assert.ok(questionById.has(id));
  const component=readFileSync("app/RevITApp.tsx","utf8");
  assert.match(component,/new Map\(\[\.\.\.freeQuestionById, \.\.\.questions\.map/);
  assert.match(readFileSync("app/lib/server/answerVerification.ts","utf8"),/book: "Harr", questions: harr.harrLegacyQuestions/);
  assert.match(readFileSync("app/lib/server/answerVerification.ts","utf8"),/book: "Harr", questions: harr.harrSourceQuestions/);
});

test("exact source pin, official key, scientific symbols and all complete rationales remain verified", () => {
  const report=JSON.parse(readFileSync("docs/mcq-retry/harr-source-verification.json","utf8"));
  assert.equal(report.status,"PASS_25_RECORD_SCOPE_ONLY");
  assert.equal(createHash("sha256").update(readFileSync("app/content/harrCoagulationSource.json")).digest("hex"),report.contentSha256);
  assert.deepEqual(source.questions.map(q=>q.correctAnswer),[1,2,1,2,0,2,2,3,2,2,3,2,1,1,2,2,3,0,1,0,1,1,3,0,3]);
  for(const q of source.questions){assert.equal(q.choices.length,4);assert.equal(q.officialAnswer,q.choices[q.correctAnswer]);assert.ok(q.explanation);assert.doesNotMatch(JSON.stringify(q),/[\uFFFD\uFFFE]/);}
  assert.match(source.questions[0].explanation,/Ca²⁺/);assert.equal(source.questions[15].choices[2],"α₂-Antiplasmin");
  assert.match(source.questions[24].explanation,/Normal D-dimer in plasma is less than 2 ng\/mL/);
});
