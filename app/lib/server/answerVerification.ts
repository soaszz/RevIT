import "server-only";
import { createHash } from "node:crypto";
import type { ReviewerBook, ReviewerQuestion } from "../../content/reviewerContent";
import { encodeMatchingAnswers, isQuestionAnswerCorrect } from "../matchingQuestion";

export type GradingRequest = {
  questionId: string;
  response: { kind: "single_choice"; choiceIndex: number }
    | { kind: "matching"; selections: number[] }
    | { kind: "timeout" };
};

export type GradingResult = {
  questionId: string;
  book: ReviewerBook;
  questionType: "single_choice" | "matching";
  contentVersion: string;
  isCorrect: boolean;
  timedOut: boolean;
};

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };
type GradingQuestion = Pick<ReviewerQuestion, "id" | "prompt" | "choices" | "correctAnswer" | "matching" | "choiceTable">
  & Partial<Omit<ReviewerQuestion, "id" | "prompt" | "choices" | "correctAnswer" | "matching" | "choiceTable">>;
export type CanonicalQuestion = Readonly<{
  book: ReviewerBook;
  question: DeepReadonly<GradingQuestion>;
  questionType: GradingResult["questionType"];
  choiceCount: number;
  contentVersion: string;
}>;

const errors = {
  INVALID_RESPONSE: { status: 400, message: "Invalid answer response." },
  UNKNOWN_QUESTION: { status: 404, message: "Question not found." },
  CONTENT_UNAVAILABLE: { status: 503, message: "Question content is unavailable." },
} as const;

export class AnswerVerificationError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) {
    super(errors[code].message);
    this.status = errors[code].status;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseGradingRequest(input: unknown): GradingRequest {
  const invalid = () => { throw new AnswerVerificationError("INVALID_RESPONSE"); };
  if (!record(input) || !exactKeys(input, ["questionId", "response"]) || !nonempty(input.questionId)
    || input.questionId.length > 240 || input.questionId !== input.questionId.trim() || !record(input.response)) return invalid();
  const response = input.response;
  if (response.kind === "single_choice" && exactKeys(response, ["kind", "choiceIndex"])
    && Number.isSafeInteger(response.choiceIndex) && (response.choiceIndex as number) >= 0) {
    return { questionId: input.questionId, response: { kind: "single_choice", choiceIndex: response.choiceIndex as number } };
  }
  if (response.kind === "matching" && exactKeys(response, ["kind", "selections"])
    && Array.isArray(response.selections) && response.selections.length > 0
    && Array.from(response.selections).every(value => Number.isSafeInteger(value) && value >= 0)) {
    return { questionId: input.questionId, response: { kind: "matching", selections: [...response.selections] } };
  }
  if (response.kind === "timeout" && exactKeys(response, ["kind"])) return { questionId: input.questionId, response: { kind: "timeout" } };
  return invalid();
}

function validateQuestion(value: unknown, book: ReviewerBook): asserts value is GradingQuestion {
  const invalid = () => { throw new AnswerVerificationError("CONTENT_UNAVAILABLE"); };
  if (!record(value) || !nonempty(value.id) || value.id.length > 240 || value.id !== value.id.trim()
    || (value.subjectId !== undefined && !nonempty(value.subjectId))
    || (value.topicId !== undefined && !nonempty(value.topicId)) || !nonempty(value.prompt)
    || !Array.isArray(value.choices) || value.choices.length < 2 || !Array.from(value.choices).every(nonempty)
    || (value.source !== undefined && (!record(value.source) || !nonempty(value.source.fileName)
      || !nonempty(value.source.kind) || !Number.isInteger(value.source.page)))
    || (value.book !== undefined && value.book !== book)) return invalid();
  const choices = value.choices;
  if (value.matching !== undefined) {
    const matching = value.matching;
    if (!record(matching) || value.choiceTable !== undefined || !Array.isArray(matching.items)
      || !matching.items.length || !Array.from(matching.items).every(nonempty) || !Array.isArray(matching.answerKey)
      || matching.answerKey.length !== matching.items.length
      || !Array.from(matching.answerKey).every(index => Number.isInteger(index) && index >= 0 && index < choices.length)
      || !Number.isSafeInteger(choices.length ** matching.items.length)) return invalid();
    // Matching's correctAnswer is a legacy placeholder; only its item key grades responses.
  } else if (!Number.isInteger(value.correctAnswer) || (value.correctAnswer as number) < 0
    || (value.correctAnswer as number) >= choices.length) return invalid();
  if (value.choiceTable !== undefined) {
    const table = value.choiceTable;
    if (!record(table) || !Array.isArray(table.columns) || !table.columns.length || !table.columns.every(nonempty)
      || !Array.isArray(table.rows) || table.rows.length !== choices.length
      || !table.rows.every(row => Array.isArray(row) && row.length === (table.columns as unknown[]).length && row.every(cell => typeof cell === "string"))) return invalid();
  }
}

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function createCanonicalRegistry(banks: readonly { book: ReviewerBook; questions: readonly unknown[] }[]): ReadonlyMap<string, CanonicalQuestion> {
  const entries = new Map<string, CanonicalQuestion>();
  for (const { book, questions } of banks) {
    if (!["Harr", "Ciulla", "Rodak", "Strasinger"].includes(book) || !Array.isArray(questions) || !questions.length) {
      throw new AnswerVerificationError("CONTENT_UNAVAILABLE");
    }
    for (const question of questions) {
      validateQuestion(question, book);
      if (entries.has(question.id)) throw new AnswerVerificationError("CONTENT_UNAVAILABLE");
    }
    // Sort object keys and question IDs; versions ignore JSON formatting/property ordering.
    const serialized = JSON.stringify([...questions].sort((a, b) => (a as ReviewerQuestion).id.localeCompare((b as ReviewerQuestion).id)), (_key, value) =>
      record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
    const contentVersion = `revit-grading-v1:${book.toLowerCase()}:${createHash("sha256").update(serialized).digest("hex")}`;
    for (const value of questions) {
      const question = value as ReviewerQuestion;
      if (entries.has(question.id)) throw new AnswerVerificationError("CONTENT_UNAVAILABLE");
      entries.set(question.id, Object.freeze({ book, question: freeze(structuredClone(question)),
        questionType: question.matching ? "matching" : "single_choice", choiceCount: question.choices.length, contentVersion }));
    }
  }
  return entries;
}

let canonicalRegistry: Promise<ReadonlyMap<string, CanonicalQuestion>> | undefined;
function getRegistry() {
  // One lazy initialization per server process, including concurrent first requests.
  return canonicalRegistry ??= Promise.all([
    import("../../content/reviewerContent"), import("./ciullaServerContent"),
    import("./rodakServerContent"), import("./strasingerServerContent"),
  ]).then(([harr, ciulla, rodak, strasinger]) => createCanonicalRegistry([
    { book: "Harr", questions: harr.harrQuestions }, { book: "Ciulla", questions: ciulla.ciullaQuestions },
    { book: "Rodak", questions: rodak.rodakQuestions }, { book: "Strasinger", questions: strasinger.strasingerQuestions },
  ]));
}

export async function getCanonicalQuestion(questionId: string): Promise<CanonicalQuestion> {
  const question = (await getRegistry()).get(questionId);
  if (!question) throw new AnswerVerificationError("UNKNOWN_QUESTION");
  return question;
}

export async function gradeAnswer(input: unknown): Promise<GradingResult> {
  const request = parseGradingRequest(input);
  const entry = await getCanonicalQuestion(request.questionId);
  const { question, choiceCount } = entry;
  const response = request.response;
  let selectedAnswer: number | null = null;
  if (response.kind === "single_choice") {
    if (question.matching || response.choiceIndex >= choiceCount) throw new AnswerVerificationError("INVALID_RESPONSE");
    selectedAnswer = response.choiceIndex;
  } else if (response.kind === "matching") {
    if (!question.matching || response.selections.length !== question.matching.items.length
      || response.selections.some(index => index >= choiceCount)) throw new AnswerVerificationError("INVALID_RESPONSE");
    selectedAnswer = encodeMatchingAnswers(response.selections, choiceCount);
  }
  return { questionId: question.id, book: entry.book, questionType: entry.questionType,
    contentVersion: entry.contentVersion, timedOut: response.kind === "timeout",
    isCorrect: isQuestionAnswerCorrect(question as ReviewerQuestion, selectedAnswer) };
}
