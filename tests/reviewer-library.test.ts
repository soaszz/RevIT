import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { subjects, topics } from "../app/content/reviewerContent";
import { buildSubjectSections, filterSubjectsBySearch } from "../app/lib/reviewerLibrary";

test("standard RevIT keeps every subject in one flat collection", () => {
  const sections = buildSubjectSections(subjects, false);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, null);
  assert.deepEqual(sections[0].subjects.map((subject) => subject.id), subjects.map((subject) => subject.id));
});

test("NU RevIT groups subjects under MTAP 1 and Other Majors", () => {
  const sections = buildSubjectSections(subjects, true);
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
  assert.deepEqual(otherMajors.subjects.map((subject) => subject.id), ["parasitology", "mycology-and-virology"]);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("library search matches subject and topic metadata", () => {
  assert.deepEqual(filterSubjectsBySearch(subjects, topics, "parasitology").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(subjects, topics, "malaria").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(subjects, topics, "yeasts").map((subject) => subject.id), ["mycology-and-virology"]);
  assert.deepEqual(filterSubjectsBySearch(subjects, topics, "blood gases").map((subject) => subject.id), ["clinical-chemistry"]);
  assert.deepEqual(filterSubjectsBySearch(subjects, topics, "MTAP 1").map((subject) => subject.id), [
    "clinical-chemistry",
    "hematology",
    "bacteriology",
    "aubf",
  ]);
  assert.equal(filterSubjectsBySearch(subjects, topics, "").length, subjects.length);
});

test("MCQ and flashcard libraries both expose the shared search and NU grouping", async () => {
  const [app, flashcards, search] = await Promise.all([
    readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Flashcards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LibrarySearch.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /id="mcq-library-search"/);
  assert.match(app, /<Flashcards isNuRevit=\{preferences\.mtap_features_enabled\}/);
  assert.match(flashcards, /id="flashcard-library-search"/);
  assert.match(flashcards, /buildSubjectSections\(visibleSubjects, isNuRevit\)/);
  assert.match(search, /type="search"/);
  assert.match(search, /Search subjects and topics/);
});
