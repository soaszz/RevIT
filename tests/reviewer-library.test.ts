import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ciullaQuestions,
  ciullaSubjects,
  ciullaTopics,
  harrQuestions,
  harrSubjects,
  harrTopics,
  subjects,
  topics,
} from "../app/content/reviewerContent";
import { buildSubjectSections, filterSubjectsBySearch } from "../app/lib/reviewerLibrary";

test("standard RevIT keeps every subject in one All Majors collection", () => {
  const sections = buildSubjectSections(subjects, false);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "all-majors");
  assert.equal(sections[0].title, "All Majors");
  assert.doesNotMatch(sections[0].description ?? "", /MTAP/i);
  assert.deepEqual(sections[0].subjects.map((subject) => subject.id), subjects.map((subject) => subject.id));
});

test("NU RevIT groups Harr subjects under MTAP 1 and Other Majors", () => {
  const sections = buildSubjectSections(harrSubjects, true);
  const mtapOne = sections.find((section) => section.title === "MTAP 1");
  const otherMajors = sections.find((section) => section.title === "Other Majors");

  assert.ok(mtapOne);
  assert.ok(otherMajors);
  assert.deepEqual(mtapOne.subjects.map((subject) => subject.id), [
    "clinical-chemistry",
    "hematology",
    "bacteriology",
    "aubf",
  ]);
  assert.deepEqual(otherMajors.subjects.map((subject) => subject.id), [
    "parasitology",
    "mycology-and-virology",
    "immunohematology",
    "immunology",
    "laboratory-operations",
  ]);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("NU RevIT groups Ciulla subjects under MTAP 1 and Other Majors", () => {
  const sections = buildSubjectSections(ciullaSubjects, true);
  const mtapOne = sections.find((section) => section.title === "MTAP 1");
  const otherMajors = sections.find((section) => section.title === "Other Majors");

  assert.ok(mtapOne);
  assert.ok(otherMajors);
  assert.deepEqual(mtapOne.subjects.map((subject) => subject.id), [
    "ciulla-clinical-chemistry",
    "ciulla-hematology",
    "ciulla-bacteriology",
    "ciulla-urinalysis-and-body-fluids",
  ]);
  assert.deepEqual(otherMajors.subjects.map((subject) => subject.id), [
    "ciulla-hemostasis",
    "ciulla-immunology-and-serology",
    "ciulla-immunohematology",
    "ciulla-mycology",
    "ciulla-parasitology",
    "ciulla-virology",
    "ciulla-molecular-diagnostics",
    "ciulla-laboratory-calculations",
    "ciulla-general-laboratory-principles",
    "ciulla-laboratory-management",
  ]);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("NU RevIT groups combined subjects under MTAP 1 and Other Majors", () => {
  const sections = buildSubjectSections(subjects, true);
  const mtapOne = sections.find((section) => section.title === "MTAP 1");
  const otherMajors = sections.find((section) => section.title === "Other Majors");

  assert.ok(mtapOne);
  assert.ok(otherMajors);
  assert.equal(mtapOne.subjects.length, 8);
  assert.equal(otherMajors.subjects.length, 15);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("library search matches subject and topic metadata for Harr and Ciulla", () => {
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "parasitology").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "parasitology").map((subject) => subject.id), ["ciulla-parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "malaria").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "protozoa").map((subject) => subject.id), ["ciulla-parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "yeasts").map((subject) => subject.id), ["mycology-and-virology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "fungal").map((subject) => subject.id), ["ciulla-mycology"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "hemostasis").map((subject) => subject.id), ["hematology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "hemostasis").map((subject) => subject.id), ["ciulla-hemostasis"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "MTAP 1").map((subject) => subject.id), [
    "clinical-chemistry",
    "hematology",
    "bacteriology",
    "aubf",
  ]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "MTAP 1").map((subject) => subject.id), [
    "ciulla-clinical-chemistry",
    "ciulla-hematology",
    "ciulla-bacteriology",
    "ciulla-urinalysis-and-body-fluids",
  ]);
  assert.equal(filterSubjectsBySearch(subjects, topics, "").length, subjects.length);
});

test("MCQ and flashcard libraries expose shared category choices, search, and reviewer book dropdown", async () => {
  const [app, flashcards, search] = await Promise.all([
    readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Flashcards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LibrarySearch.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /id="mcq-library-search"/);
  assert.match(app, /id="reviewer-book"/);
  assert.match(app, /value="Harr"/);
  assert.match(app, /value="Ciulla"/);
  assert.match(app, /value="all"/);
  assert.match(app, /isNuRevit=\{preferences\.mtap_features_enabled\}/);
  assert.match(app, /<Flashcards\s+isNuRevit=\{preferences\.mtap_features_enabled\}/);
  assert.match(flashcards, /id="flashcard-library-search"/);
  assert.match(flashcards, /isNuRevit=\{isNuRevit\}/);
  assert.match(flashcards, /buildSubjectSections\(visibleSubjects, isNuRevit\)/);
  assert.match(search, /type="search"/);
  assert.match(search, /STANDARD_CATEGORY_CHOICES/);
  assert.match(search, /All Majors/);
  assert.match(search, /!isNuRevit && selectedNuCategory/);
  assert.match(search, /Search subjects and topics/);
  assert.match(search, /All Subjects/);
  assert.match(search, /MTAP 1/);
  assert.match(search, /Other Majors/);
  assert.match(search, /Search subjects or topics\.\.\./);
});

test("Ciulla question count, structure, and stimuli integrity", () => {
  assert.equal(ciullaSubjects.length, 14);
  assert.equal(ciullaTopics.length, 49);
  assert.equal(ciullaQuestions.length, 1884);

  const withStimulus = ciullaQuestions.filter((q) => q.stimulus);
  assert.ok(withStimulus.length >= 17, `Expected at least 17 stimulus questions, found ${withStimulus.length}`);

  // Test 1-to-many stimulus relationships:
  // e.g. red-cell-panel-2 is shared across questions 94-96
  const panel2Questions = ciullaQuestions.filter((q) => q.stimulus?.kind === "image" && q.stimulus.src.includes("red-cell-panel-2"));
  assert.equal(panel2Questions.length, 3, "red-cell-panel-2 should be used across 3 questions (1-to-many)");

  // e.g. red-cell-panel-3 is shared across questions 124-132
  const panel3Questions = ciullaQuestions.filter((q) => q.stimulus?.kind === "image" && q.stimulus.src.includes("red-cell-panel-3"));
  assert.equal(panel3Questions.length, 9, "red-cell-panel-3 should be used across 9 questions (1-to-many)");

  // Every question must have valid choices (4 or 5), valid correctAnswer, and non-empty explanation
  for (const q of ciullaQuestions) {
    assert.ok(q.choices.length >= 4 && q.choices.length <= 5, `Question ${q.id} must have 4 or 5 choices`);
    assert.ok(q.correctAnswer >= 0 && q.correctAnswer < q.choices.length, `Question ${q.id} correctAnswer out of bounds`);
    assert.ok(q.officialAnswer && q.officialAnswer.length > 0, `Question ${q.id} missing official answer`);
    assert.ok(q.explanation && q.explanation.length > 0, `Question ${q.id} missing explanation`);
  }
});
