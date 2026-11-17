import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import legacy from "../app/content/reviewerContent.json";
import source from "../app/content/harrCoagulationSource.json";
import hemostasis from "../app/content/harrHemostasisSource.json";
import { activeHarrQuestions, allHarrHistoryQuestions, legacyCoagulationIds, HARR_COAGULATION_TOPIC, HARR_SOURCE_TOPICS, HARR_SOURCE_COUNTS, sourceHarrQuestions } from "../app/lib/harrQuestionPool";
import { harrQuestions, questionById } from "../app/content/reviewerContent";
import { getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import { buildFlashcardDeck } from "../app/lib/flashcards";
import { subjects, topics } from "../app/content/reviewerContent";

test("verified source questions replace legacy hemostasis topics; all historical bytes and IDs remain", () => {
  assert.equal(legacy.questions.length,1593);
  assert.equal(legacyCoagulationIds.size,12);
  assert.equal(source.questions.length,25);
  assert.equal(hemostasis.questions.length,110);
  assert.equal(sourceHarrQuestions.length,135);
  assert.equal(activeHarrQuestions.length,1668);
  assert.equal(allHarrHistoryQuestions.length,1728);
  for(const [topic,count] of Object.entries(HARR_SOURCE_COUNTS))
    assert.equal(activeHarrQuestions.filter(q=>q.topicId===topic).length,count,topic);
  assert.equal(activeHarrQuestions.some(q=>legacyCoagulationIds.has(q.id)),false);
  for(const old of legacy.questions) {
    assert.deepEqual(allHarrHistoryQuestions.find(q=>q.id===old.id),old);
    assert.deepEqual(questionById.get(old.id),{...old,book:"Harr"});
  }
  const replaced=new Set(HARR_SOURCE_TOPICS);
  assert.deepEqual(activeHarrQuestions.filter(q=>!replaced.has(q.topicId)),legacy.questions.filter(q=>!replaced.has(q.topicId)));
  assert.deepEqual(activeHarrQuestions.filter(q=>q.topicId===HARR_COAGULATION_TOPIC).map(q=>q.id),Array.from({length:25},(_,i)=>`harr-hemostasis-2-1-source-${String(i+1).padStart(3,"0")}`));
  assert.deepEqual(activeHarrQuestions.filter(q=>q.topicId==="hematology-2-5").map(q=>q.id),Array.from({length:20},(_,i)=>`harr-hemostasis-2-5-source-${String(i+1).padStart(3,"0")}`));
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
  assert.match(source.questions[0].explanation,/Ca\u00b2\u207a/);assert.equal(source.questions[15].choices[2],"α\u2082-Antiplasmin");
  assert.match(source.questions[24].explanation,/Normal D-dimer in plasma is less than 2 ng\/mL/);
});

test("hemostasis source records preserve source counts, keys, notation and tables", () => {
  assert.deepEqual(HARR_SOURCE_COUNTS,{"hematology-2-1":25,"hematology-2-2":23,"hematology-2-3":23,"hematology-2-4":44,"hematology-2-5":20});
  for(const q of hemostasis.questions){
    assert.equal(q.choices.length,4,q.id);
    assert.equal(q.officialAnswer,q.choices[q.correctAnswer],q.id);
    assert.ok(q.prompt&&q.explanation,q.id);
    assert.equal(q.source.fileName,"Chapter_2_Hematology 2.pdf");
    assert.doesNotMatch(JSON.stringify(q),/[\uFFFD\uFFFE]/,q.id);
  }
  const withTables=hemostasis.questions.filter(q=>"stimulus" in q||"questionSections" in q);
  assert.equal(withTables.length,13);
  assert.deepEqual(withTables.map(q=>q.id),["harr-hemostasis-2-3-source-007","harr-hemostasis-2-3-source-015","harr-hemostasis-2-4-source-043","harr-hemostasis-2-5-source-001","harr-hemostasis-2-5-source-002","harr-hemostasis-2-5-source-003","harr-hemostasis-2-5-source-005","harr-hemostasis-2-5-source-006","harr-hemostasis-2-5-source-012","harr-hemostasis-2-5-source-013","harr-hemostasis-2-5-source-014","harr-hemostasis-2-5-source-019","harr-hemostasis-2-5-source-020"]);
});


test("all thirteen audited result blocks and case histories survive flashcard conversion", () => {
  const structured = hemostasis.questions.filter(q => "questionSections" in q);
  assert.equal(structured.length, 13);
  const deck = buildFlashcardDeck(harrQuestions, HARR_SOURCE_TOPICS);
  for (const q of structured) {
    const card = deck.find(card => card.id === q.id)!;
    assert.ok(card, q.id);
    assert.deepEqual(card.questionSections, q.questionSections, q.id);
    assert.equal(card.explanation, q.explanation, q.id);
    assert.equal(card.answer, q.choices[q.correctAnswer], q.id);
    if ("caseStudy" in q) assert.equal(card.caseStudy, q.caseStudy, q.id);
  }
  for (const n of [1, 14, 20]) {
    const q = hemostasis.questions.find(q => q.id === `harr-hemostasis-2-5-source-${String(n).padStart(3,"0")}`)!;
    assert.equal(q.questionSections![0].kind, "visual");
    assert.equal(q.questionSections![1].kind, "text");
  }
  for (const n of [3, 6, 18]) {
    const q = hemostasis.questions.find(q => q.id === `harr-hemostasis-2-5-source-${String(n).padStart(3,"0")}`)!;
    const card = deck.find(card => card.id === q.id)!;
    assert.deepEqual(card.sourceFormatting, q.sourceFormatting);
    assert.ok(q.sourceFormatting!.prompt!.every(mark => q.prompt.slice(mark.start, mark.end) === "9"));
  }
});
