import test from "node:test";
import assert from "node:assert/strict";
import { harrSubjects, harrTopics, harrQuestions } from "../app/content/reviewerContent";
import { ciullaPreviewSubjects, ciullaPreviewTopics } from "../app/content/ciullaMetadata";
import { rodakPreviewSubjects, rodakPreviewTopics } from "../app/content/rodakMetadata";
import { strasingerPreviewSubjects, strasingerPreviewTopics } from "../app/content/strasingerMetadata";
import { bocPreviewSubjects, bocPreviewTopics } from "../app/content/bocMetadata";
import { elsevierPreviewSubjects, elsevierPreviewTopics } from "../app/content/elsevierMetadata";
import { ACADEMIC_COLLECTIONS, buildSubjectSections, filterSubjectsBySearch, getUnifiedSubjects } from "../app/lib/reviewerLibrary";
import { MTAP_2_SUBJECTS } from "../app/lib/mtap2Preset";
import { MTAP_2_GRADE_SUBJECTS, presetCategoryPercentage, buildMtap2Gradebooks, isMtap2Gradebook, mergeMtap2Gradebooks, mtap2Matrix, retainPendingMtap2, syncMtap2Gradebooks } from "../app/lib/mtap2Grades";
import { GRADE_FIELDS, EMPTY_GRADES, SUBJECTS, type GradeValues } from "../app/lib/domain";
import { calculateGrade, calculateUniversalGrade } from "../app/lib/gradeCalculator";
import { loadCustomGradebooks } from "../app/lib/cloudService";
import type { SupabaseClient } from "@supabase/supabase-js";

const allSubjects = [...harrSubjects, ...ciullaPreviewSubjects, ...rodakPreviewSubjects, ...strasingerPreviewSubjects, ...bocPreviewSubjects, ...elsevierPreviewSubjects];
const allTopics = [...harrTopics, ...ciullaPreviewTopics, ...rodakPreviewTopics, ...strasingerPreviewTopics, ...bocPreviewTopics, ...elsevierPreviewTopics];
const unified = getUnifiedSubjects("all", allSubjects, allTopics);
const values = (): Record<string, GradeValues> => Object.fromEntries(MTAP_2_GRADE_SUBJECTS.map(s => [s.name, { ...EMPTY_GRADES, pre_test: 40, comprehensive: 90 }]));

test("six MTAP 2 references preserve MTAP 1 and partition Other Majors without changing source topics", () => {
  const before = JSON.stringify({ allSubjects, allTopics });
  const sections = buildSubjectSections(unified, true);
  const preset = sections.find(s => s.id === "mtap-2")!;
  assert.deepEqual(preset.subjects.map(s => s.name), MTAP_2_SUBJECTS.map(s => s.name));
  assert.deepEqual(sections.find(s => s.id === "mtap-1")!.subjects, unified.filter(s => s.category === "MTAP 1"));
  assert.deepEqual(sections.map(s => s.id), ["mtap-1", "mtap-2", "other-majors"]);
  assert.deepEqual(sections.find(s => s.id === "other-majors")!.subjects, unified.filter(s => s.category !== "MTAP 1" && !MTAP_2_SUBJECTS.some(entry => (entry.collections as readonly string[]).includes(s.id))));
  assert.deepEqual(new Set(sections.flatMap(section => section.subjects.flatMap(subject => subject.topicIds))), new Set(unified.flatMap(subject => subject.topicIds)));
  for (const s of preset.subjects) assert.equal(new Set(s.topicIds).size, s.topicIds.length);
  assert.equal(JSON.stringify({ allSubjects, allTopics }), before);
  assert.deepEqual(buildSubjectSections(unified, false)[0].subjects, unified);
});

test("combined MVP references the approved union, and Hemostasis never absorbs Harr Hema 2", () => {
  const subjects = buildSubjectSections(unified, true).find(s => s.id === "mtap-2")!.subjects;
  const mycology = subjects[2], combined = subjects[5];
  const parasites = unified.find(s => s.id === "parasitology")!;
  assert.deepEqual(combined.topicIds, Array.from(new Set([...mycology.topicIds, ...parasites.topicIds])));
  assert.deepEqual(subjects[4].topicIds, unified.find(s => s.id === "ciulla-hemostasis")!.topicIds);
  assert.ok(!subjects[4].topicIds.some(id => id.startsWith("hematology-2-")));
  const selected = new Set([...mycology.topicIds, ...combined.topicIds]);
  assert.equal(selected.size, combined.topicIds.length);
  assert.equal(new Set(harrQuestions.map(q => q.id)).size, harrQuestions.length);
});

test("MTAP 2 filter is explicit and does not contaminate existing category filters", () => {
  const filtered = filterSubjectsBySearch(unified, allTopics, "MTAP 2");
  assert.deepEqual(buildSubjectSections(filtered, true, "MTAP 2").map(s => s.id), ["mtap-2"]);
  for (const query of ["MTAP 1", "Other Majors"]) assert.ok(!buildSubjectSections(filterSubjectsBySearch(unified, allTopics, query), true, query).some(s => s.id === "mtap-2"));
});

test("MTAP 2 grade IDs are stable per owner/preset; legacy subjects and formulas remain unchanged", async () => {
  const first = await buildMtap2Gradebooks(values(), "owner-A");
  const again = await buildMtap2Gradebooks(values(), "owner-A");
  const other = await buildMtap2Gradebooks(values(), "owner-B");
  assert.deepEqual(first, again);
  assert.ok(other.every(b => !first.some(a => a.id === b.id)));
  assert.deepEqual(SUBJECTS, ["Hematology", "Clinical Chemistry", "Bacteriology", "AUBF"]);
  for (const book of first) {
    assert.equal(book.passingGrade, 65);
    assert.deepEqual(book.categories.map(c => c.weight), GRADE_FIELDS.map(f => f.weight * 100));
    assert.deepEqual(book.categories.map(c => c.assessments[0].maxScore), GRADE_FIELDS.map(f => f.max));
    for (let i = 0; i < 20; i++) {
      const scores = Object.fromEntries(GRADE_FIELDS.map((f, n) => [f.key, (i + n) % 3 === 0 ? null : f.max * ((i + n) % 11) / 10])) as GradeValues;
      const [candidate] = await buildMtap2Gradebooks({ Hematology: scores }, "owner-A");
      const actual = calculateUniversalGrade(candidate.categories, 65), expected = calculateGrade(scores);
      assert.ok(Math.abs(actual.earnedPoints - expected.earnedPoints) < 1e-10);
    }
  }
  const invalid = values(); invalid.Hematology.pre_test = 51;
  await assert.rejects(buildMtap2Gradebooks(invalid, "owner-A"), /Invalid/);
});

test("save/reload and cloud refresh preserve separate presets, unsynced scores and custom grades", async () => {
  const books = await buildMtap2Gradebooks(values(), "owner-A");
  const unrelated = { ...books[0], id: "existing-custom", subjectCode: "CHEM", name: "Existing custom course" };
  const merged = mergeMtap2Gradebooks([unrelated], books);
  assert.deepEqual(merged[0], unrelated);
  assert.equal(isMtap2Gradebook({ ...unrelated, subjectCode: books[0].subjectCode }), false);
  assert.deepEqual(mtap2Matrix(JSON.parse(JSON.stringify(merged)), "owner-A"), values());
  assert.ok(Object.values(mtap2Matrix(merged, "owner-B")).every(v => Object.values(v).every(x => x === null)));
  const pending = books.map(b => ({ ...b, mtap2Pending: true })); pending[0].categories[0].assessments[0].score = 49;
  const restored = retainPendingMtap2([], JSON.parse(JSON.stringify(pending)), "owner-A");
  assert.equal(mtap2Matrix(restored, "owner-A").Hematology.pre_test, 49);
  assert.equal(retainPendingMtap2([], pending, "owner-B").length, 0);
});

test("manual cloud sync uses three existing-table batches; another device uses the existing loader", async () => {
  const data: Record<string, any[]> = {}; const writes: string[] = [], reads: string[] = [];
  const client = { from(table: string) { return {
    async upsert(rows: any[]) { writes.push(table); data[table] = structuredClone(rows); return { error: null }; },
    select() { reads.push(table); let rows = data[table] ?? []; const query = {
      eq(key: string, value: string) { rows = rows.filter(r => r[key] === value); return query; },
      in(key: string, values: string[]) { rows = rows.filter(r => values.includes(r[key])); return query; },
      async order() { return { data: rows, error: null }; },
    }; return query; },
  }; } } as unknown as SupabaseClient;
  const books = await buildMtap2Gradebooks(values(), "owner-A");
  await syncMtap2Gradebooks(client, books, "owner-A");
  assert.deepEqual(writes, ["gradebooks", "grade_categories", "grade_assessments"]);
  const loaded = await loadCustomGradebooks(client, "owner-A");
  assert.deepEqual(mtap2Matrix(loaded, "owner-A"), values());
  assert.deepEqual(reads, writes);
  await assert.rejects(syncMtap2Gradebooks(client, books, "owner-B"), /owner/);
  const failing = { from: () => ({ upsert: async () => ({ error: { message: "offline" } }) }) } as unknown as SupabaseClient;
  await assert.rejects(syncMtap2Gradebooks(failing, books, "owner-A"), /offline/);
});

test("future named collections remain ordered before Other Majors and exclude only explicit IDs", () => {
  const untouched = JSON.stringify(unified);
  const future = { id: "mtap-3", title: "MTAP 3", description: "Synthetic future mapping", entries: [
    { id: "blood", name: "Future blood collection", collections: ["immunohematology"] },
  ] };
  const similar = { ...unified[0], id: "unassigned-immunohematology", name: "Immunohematology copy", category: "Other Majors" as const, topicIds: ["synthetic-topic"] };
  const sections = buildSubjectSections([...unified, similar], true, "", [...ACADEMIC_COLLECTIONS, future]);
  assert.deepEqual(sections.map(s => s.id), ["mtap-1", "mtap-2", "mtap-3", "other-majors"]);
  assert.ok(sections.at(-1)!.subjects.some(s => s.id === similar.id));
  assert.ok(!sections.at(-1)!.subjects.some(s => s.id === "immunohematology"));
  assert.deepEqual(buildSubjectSections(unified, true, "MTAP 3", [...ACADEMIC_COLLECTIONS, future]).map(s => s.id), ["mtap-3"]);
  assert.equal(JSON.stringify(unified), untouched);
});

test("MTAP 2 uses four grading subjects in every category; history is retained and never uploaded", async () => {
  assert.equal(MTAP_2_SUBJECTS.length, 6);
  assert.equal(MTAP_2_SUBJECTS[5].name, "Mycology, Virology, and Parasitology");
  assert.deepEqual(MTAP_2_GRADE_SUBJECTS.map(s => s.name), ["Hematology", "Clinical Chemistry", "Mycology and Virology", "Immunology and Serology"]);
  const books = await buildMtap2Gradebooks(values(), "owner-A");
  const history = ["hemostasis", "mycology-virology-parasitology"].map((id, i) => ({ ...structuredClone(books[0]),
    id: `00000000-0000-8000-8000-00000000000${i + 5}`, subjectCode: `REVIT:MTAP2:v1:${id}`,
    name: id, categories: books[0].categories.map(c => ({ ...c, assessments: c.assessments.map(a => ({ ...a, score: 7 })) })) }));
  const before = JSON.stringify(history);
  const merged = mergeMtap2Gradebooks(history, books);
  assert.equal(JSON.stringify(merged.slice(0, 2)), before);
  assert.deepEqual(mtap2Matrix(JSON.parse(JSON.stringify(merged)), "owner-A"), values());
  assert.equal(Object.keys(mtap2Matrix(merged, "owner-A")).length, 4);
  for (const field of GRADE_FIELDS) {
    const matrix = Object.fromEntries(MTAP_2_GRADE_SUBJECTS.map(s => [s.name, { ...EMPTY_GRADES, [field.key]: field.max }]));
    matrix.Hemostasis = { ...EMPTY_GRADES, [field.key]: 7 };
    const subjects = MTAP_2_GRADE_SUBJECTS.map(s => s.name);
    assert.equal(presetCategoryPercentage(matrix, field, subjects), field.weight * 100);
    matrix.Hematology[field.key] = 0;
    assert.ok(Math.abs(presetCategoryPercentage(matrix, field, subjects) - field.weight * 75) < 1e-10);
    assert.equal(books.flatMap(b => b.categories.filter(c => c.name === field.label)).length, 4);
  }
  const uploads: Record<string, any[]> = {};
  const client = { from: (table: string) => ({ upsert: async (rows: any[]) => { uploads[table] = rows; return { error: null }; } }) } as unknown as SupabaseClient;
  await syncMtap2Gradebooks(client, books, "owner-A");
  assert.deepEqual(Object.values(uploads).map(rows => rows.length), [4, 20, 20]);
  assert.ok(uploads.gradebooks.every(row => !history.some(h => h.id === row.id)));
  assert.equal(JSON.stringify(history), before);
  await assert.rejects(syncMtap2Gradebooks(client, [...books.slice(0, 3), history[0]], "owner-A"), /Invalid/);
});
