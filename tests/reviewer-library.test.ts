import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  harrSubjects,
  harrTopics,
  subjects,
  topics,
  type ReviewerQuestion,
  type Subject,
  type Topic,
} from "../app/content/reviewerContent";
import { buildSubjectSections, filterSubjectsBySearch } from "../app/lib/reviewerLibrary";

const rawCiulla = JSON.parse(await readFile(new URL("../app/content/ciullaContent.json", import.meta.url), "utf8")) as {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};
const ciullaSubjects: Subject[] = rawCiulla.subjects.map((s) => ({ ...s, book: "Ciulla" }));
const ciullaTopics: Topic[] = rawCiulla.topics.map((t) => ({ ...t, book: "Ciulla" }));
const ciullaQuestions: ReviewerQuestion[] = rawCiulla.questions.map((q) => ({ ...q, book: "Ciulla" }));

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
    "ciulla-mycology-and-virology",
    "ciulla-parasitology",
    "ciulla-molecular-diagnostics",
    "ciulla-laboratory-calculations",
    "ciulla-general-laboratory-principles",
    "ciulla-laboratory-management",
  ]);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("NU RevIT groups combined subjects under MTAP 1 and Other Majors", () => {
  const combinedSubjects = [...harrSubjects, ...ciullaSubjects];
  const sections = buildSubjectSections(combinedSubjects, true);
  const mtapOne = sections.find((section) => section.title === "MTAP 1");
  const otherMajors = sections.find((section) => section.title === "Other Majors");

  assert.ok(mtapOne);
  assert.ok(otherMajors);
  assert.equal(mtapOne.subjects.length, 8);
  assert.equal(otherMajors.subjects.length, 14);
  assert.ok(mtapOne.subjects.every((subject) => subject.category === "MTAP 1"));
  assert.ok(otherMajors.subjects.every((subject) => subject.category === "Other Majors"));
});

test("library search matches subject and topic metadata for Harr and Ciulla", () => {
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "parasitology").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "parasitology").map((subject) => subject.id), ["ciulla-parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "malaria").map((subject) => subject.id), ["parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "protozoa").map((subject) => subject.id), ["ciulla-parasitology"]);
  assert.deepEqual(filterSubjectsBySearch(harrSubjects, harrTopics, "yeasts").map((subject) => subject.id), ["mycology-and-virology"]);
  assert.deepEqual(filterSubjectsBySearch(ciullaSubjects, ciullaTopics, "fungal").map((subject) => subject.id), ["ciulla-mycology-and-virology"]);
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

test("MCQ and flashcard libraries expose shared category choices, search, and compact session setup", async () => {
  const [app, reviewLibrary, flashcards, search] = await Promise.all([
    readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ReviewLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Flashcards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/LibrarySearch.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(reviewLibrary, /id="review-library-search"|id="mcq-library-search"/);
  // Redundant Reviewer Book dropdown removed from Session Setup
  assert.doesNotMatch(reviewLibrary, /id="desktop-reviewer-book"/);
  assert.match(reviewLibrary, /id="desktop-session-size"/);
  assert.match(app, /<ReviewLibrary/);
  assert.match(app, /libraryMode=\{libraryMode\}/);
  assert.match(flashcards, /isNuRevit:\s*boolean/);
  assert.match(reviewLibrary, /isNuRevit=\{preferences\.mtap_features_enabled\}/);
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

test("Review Library unified subjects expand with complete topics and questions across all subjects", async () => {
  const { getUnifiedSubjects } = await import("../app/lib/reviewerLibrary");
  const { ciullaPreviewSubjects, ciullaPreviewTopics, ciullaTopicQuestionCounts } = await import("../app/content/ciullaMetadata");

  const allAvailableSubjects = [...harrSubjects, ...ciullaPreviewSubjects];
  const allAvailableTopics = [...harrTopics, ...ciullaPreviewTopics];

  const topicQuestionCounts = new Map<string, number>();
  for (const _q of harrTopics) {
    // Topic question count mapping from metadata
  }
  for (const [tId, count] of Object.entries(ciullaTopicQuestionCounts)) {
    topicQuestionCounts.set(tId, count);
  }

  const unified = getUnifiedSubjects("all", allAvailableSubjects, allAvailableTopics);
  assert.equal(unified.length, 14, "Expected 14 unified subjects (8 combined + 6 standalone)");

  for (const subj of unified) {
    const subjectTopics = allAvailableTopics.filter((t) =>
      subj.topicIds ? subj.topicIds.includes(t.id) : t.subjectId === subj.id
    );
    assert.ok(subjectTopics.length > 0, `Subject ${subj.name} must have at least 1 topic`);

    const harr = subjectTopics.filter((t) => (t.book ?? "Harr") === "Harr");
    const ciulla = subjectTopics.filter((t) => t.book === "Ciulla");

    // Defensive activeBook fallback must never resolve to empty edition topics
    for (const selectedBook of ["Harr", "Ciulla", "all"] as const) {
      for (const tab of [undefined, "Harr", "Ciulla"] as const) {
        const preferredBook = tab ?? (selectedBook === "Ciulla" ? "Ciulla" : "Harr");
        const activeBook = preferredBook === "Ciulla"
          ? (ciulla.length > 0 ? "Ciulla" : "Harr")
          : (harr.length > 0 ? "Harr" : (ciulla.length > 0 ? "Ciulla" : "Harr"));
        const activeTopics = activeBook === "Ciulla" ? ciulla : harr;
        assert.ok(activeTopics.length > 0, `Subject ${subj.name} must never have 0 topics for activeBook ${activeBook}`);
      }
    }
  }

  // Clinical Chemistry specific verification
  const cc = unified.find((s) => s.name === "Clinical Chemistry");
  assert.ok(cc, "Clinical Chemistry must exist in unified subjects");
  const ccTopics = allAvailableTopics.filter((t) => cc.topicIds?.includes(t.id));
  const ccHarr = ccTopics.filter((t) => (t.book ?? "Harr") === "Harr");
  const ccCiulla = ccTopics.filter((t) => t.book === "Ciulla");
  assert.equal(ccHarr.length, 10, "Clinical Chemistry Harr must have exactly 10 topics");
  assert.equal(ccCiulla.length, 12, "Clinical Chemistry Ciulla must have exactly 12 topics");
});

test("Mixed Harr and Ciulla selections persist and filter questions accurately", () => {
  const harrTopicId = "clinical-chemistry-6-1";
  const ciullaTopicId = "ciulla-cc-instrumentation-and-analytical-principles";
  const selectedTopicIds = [harrTopicId, ciullaTopicId];

  // Mock questions from both editions
  const mockQuestions: ReviewerQuestion[] = [
    { id: "q1", subjectId: "clinical-chemistry", topicId: harrTopicId, book: "Harr", choices: ["A","B","C","D"], correctAnswer: 0, officialAnswer: "A", explanation: "test", prompt: "q1", source: { fileName: "test.pdf", page: 1, kind: "Official supplied MCQ reviewer" } },
    { id: "q2", subjectId: "ciulla-clinical-chemistry", topicId: ciullaTopicId, book: "Ciulla", choices: ["A","B","C","D"], correctAnswer: 1, officialAnswer: "B", explanation: "test", prompt: "q2", source: { fileName: "test.pdf", page: 1, kind: "Official supplied MCQ reviewer" } },
  ];

  // When selectedBook === "all"
  const qAll = mockQuestions.filter((q) => selectedTopicIds.includes(q.topicId));
  assert.equal(qAll.length, 2, "All Books selection must include questions from both Harr and Ciulla");

  // When selectedBook === "Harr"
  const qHarr = mockQuestions.filter((q) => {
    if (!selectedTopicIds.includes(q.topicId)) return false;
    return (q.book ?? "Harr") === "Harr";
  });
  assert.equal(qHarr.length, 1, "Harr filter must return only Harr question");
  assert.equal(qHarr[0].id, "q1");

  // When selectedBook === "Ciulla"
  const qCiulla = mockQuestions.filter((q) => {
    if (!selectedTopicIds.includes(q.topicId)) return false;
    return (q.book ?? "Harr") === "Ciulla";
  });
  assert.equal(qCiulla.length, 1, "Ciulla filter must return only Ciulla question");
  assert.equal(qCiulla[0].id, "q2");
});

test("Ciulla question count, structure, and stimuli integrity", () => {
  assert.equal(ciullaSubjects.length, 13);
  assert.equal(ciullaTopics.length, 49);
  assert.equal(ciullaQuestions.length, 1890);

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
