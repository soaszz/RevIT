import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPTY_GRADES, GRADE_FIELDS, PASSING_GRADE, type CustomGradebook, type GradeValues } from "./domain";
import { MTAP_2_SUBJECTS } from "./mtap2Preset";

// Grade participation is separate from the six Review Library references.
export const MTAP_2_GRADE_SUBJECTS = MTAP_2_SUBJECTS.filter(subject =>
  !["hemostasis", "mycology-virology-parasitology"].includes(subject.id));

// Identical existing preset formula; callers supply only active assessment subjects.
export function presetCategoryPercentage(matrix: Record<string, GradeValues>, field: typeof GRADE_FIELDS[number], subjects: readonly string[]) {
  const totalScore = subjects.reduce((total, subject) => total + (matrix[subject][field.key] ?? 0), 0);
  return subjects.length ? (totalScore / (field.max * subjects.length)) * field.weight * 100 : 0;
}

const PREFIX = "REVIT:MTAP2:v1:";
export const mtap2Code = (id: string) => PREFIX + id;
export const isMtap2Gradebook = (book: CustomGradebook) => book.id[14] === "8" && MTAP_2_SUBJECTS.some(s => book.subjectCode === mtap2Code(s.id));

export function mtap2Matrix(books: CustomGradebook[], owner: string): Record<string, GradeValues> {
  return Object.fromEntries(MTAP_2_GRADE_SUBJECTS.map(subject => {
    const book = books.find(b => isMtap2Gradebook(b) && b.userId === owner && b.subjectCode === mtap2Code(subject.id));
    const values = { ...EMPTY_GRADES };
    for (const [i, field] of GRADE_FIELDS.entries()) {
      values[field.key] = book?.categories.find(c => c.position === i)?.assessments.find(a => a.position === 0)?.score ?? null;
    }
    return [subject.name, values];
  }));
}

// Owner-scoped UUIDs make manual saves idempotent across devices and retries.
async function stableId(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function buildMtap2Gradebooks(matrix: Record<string, GradeValues>, owner: string): Promise<CustomGradebook[]> {
  return Promise.all(MTAP_2_GRADE_SUBJECTS.map(async (subject, position) => {
    const id = await stableId(`${PREFIX}${owner}:${subject.id}`);
    const categories = await Promise.all(GRADE_FIELDS.map(async (field, index) => {
      const categoryId = await stableId(`${id}:${field.key}`);
      const score = matrix[subject.name]?.[field.key] ?? null;
      if (score !== null && (!Number.isFinite(score) || score < 0 || score > field.max)) throw new Error("Invalid MTAP 2 score");
      return { id: categoryId, gradebookId: id, name: field.label, weight: field.weight * 100, position: index,
        assessments: [{ id: await stableId(`${categoryId}:score`), categoryId, name: field.label, score, maxScore: field.max, position: 0 }] };
    }));
    return { id, userId: owner, name: subject.name, subjectCode: mtap2Code(subject.id), templateType: "custom", passingGrade: PASSING_GRADE, position, categories };
  }));
}

export function mergeMtap2Gradebooks(existing: CustomGradebook[], next: CustomGradebook[]) {
  const ids = new Set(next.map(b => b.id));
  return [...existing.filter(b => !ids.has(b.id)), ...next];
}

export function retainPendingMtap2(cloud: CustomGradebook[], local: CustomGradebook[], owner: string) {
  const pending = local.filter(b => b.userId === owner && isMtap2Gradebook(b) && "mtap2Pending" in b && b.mtap2Pending === true);
  return mergeMtap2Gradebooks(cloud, pending);
}

// Same existing cloud tables/RLS as Custom Subjects. Three manual batched writes;
// no legacy grades writes, polling, schema changes or new read queries.
export async function syncMtap2Gradebooks(client: SupabaseClient, books: CustomGradebook[], owner: string) {
  if (books.length !== MTAP_2_GRADE_SUBJECTS.length || new Set(books.map(b => b.subjectCode)).size !== MTAP_2_GRADE_SUBJECTS.length || books.some(b => b.userId !== owner || !isMtap2Gradebook(b) || !MTAP_2_GRADE_SUBJECTS.some(s => b.subjectCode === mtap2Code(s.id)))) throw new Error("Invalid MTAP 2 owner");
  const { error: bookError } = await client.from("gradebooks").upsert(books.map(b => ({ id: b.id, user_id: owner, name: b.name, subject_code: b.subjectCode, template_type: b.templateType, passing_grade: b.passingGrade, position: b.position })));
  if (bookError) throw new Error(bookError.message);
  // Excluded subjects are never upserted; their entire historical books remain untouched.
  const activeCategories = books.flatMap(b => b.categories);
  const { error: categoryError } = await client.from("grade_categories").upsert(activeCategories.map(c => ({ id: c.id, gradebook_id: c.gradebookId, name: c.name, weight: c.weight, position: c.position })));
  if (categoryError) throw new Error(categoryError.message);
  const { error: assessmentError } = await client.from("grade_assessments").upsert(activeCategories.flatMap(c => c.assessments.map(a => ({ id: a.id, category_id: c.id, name: a.name, score: a.score, max_score: a.maxScore, position: a.position }))));
  if (assessmentError) throw new Error(assessmentError.message);
}
