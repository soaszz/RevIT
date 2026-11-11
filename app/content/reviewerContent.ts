import rawContent from "./reviewerContent.json";
import { activeHarrQuestions, allHarrHistoryQuestions, sourceHarrQuestions, HARR_COAGULATION_TOPIC } from "../lib/harrQuestionPool";

export type ReviewerBook = "Harr" | "Ciulla" | "Rodak" | "Strasinger" | "Elsevier" | "BOC";

export type Subject = {
  id: string;
  name: string;
  description: string;
  topicIds: string[];
  category: "MTAP 1" | "Other Majors";
  book?: ReviewerBook;
};

export type SourcePdf = {
  fileName: string;
  pageRange: string;
  kind: string;
};

export type Topic = {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  sourcePdfs: SourcePdf[];
  book?: ReviewerBook;
};

export type QuestionStimulus =
  | {
      kind: "table";
      caption: string;
      columns: string[];
      rows: string[][];
      sourceFormatting?: { columns?: SourceTextMarks[]; rows?: SourceTextMarks[][] };
    }
  | {
      kind: "image";
      src: string;
      alt: string;
      width: number;
      height: number;
      caption?: string;
    };

export type QuestionReference = {
  questionId: string;
  type: "figure" | "table" | "reference_intervals";
  label: string;
  sourceChapter: number;
  sourcePage: number | null;
  sourcePdfPage: number | null;
  verificationStatus: "visual_checked" | "missing_source" | "needs_review";
  stimulus?: QuestionStimulus;
};

export type SourceTextMarks = { start: number; end: number; script: "sub" | "sup" }[];

export type SourceTextFormatting = {
  prompt?: SourceTextMarks;
  promptAfterReferences?: SourceTextMarks;
  choices?: SourceTextMarks[];
  explanation?: SourceTextMarks;
};

export type QuestionSection = { kind: "text"; text: string; sourceFormatting?: SourceTextMarks } | { kind: "visual"; stimulus: QuestionStimulus };

export type ReviewerQuestion = {
  id: string;
  subjectId: string;
  topicId: string;
  subtopic?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  caseStudy?: string;
  prompt: string;
  promptAfterReferences?: string;
  questionSections?: QuestionSection[];
  stimulus?: QuestionStimulus;
  references?: QuestionReference[];
  choices: string[];
  choiceTable?: { columns: string[]; rows: string[][] };
  choiceTables?: (Extract<QuestionStimulus, { kind: "table" }> | null)[];
  correctAnswer: number;
  matching?: {
    items: string[];
    answerKey: number[];
  };
  officialAnswer: string;
  explanation: string;
  sourceFormatting?: SourceTextFormatting;
  rationaleImages?: QuestionStimulus[];
  rationaleSections?: QuestionSection[];
  source: {
    fileName: string;
    page: number;
    kind: string;
  };
  book?: ReviewerBook;
  disableShuffle?: boolean;
};

const content = rawContent as {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

export const harrSubjects: Subject[] = content.subjects.map((s) => ({ ...s, book: "Harr" as ReviewerBook }));
export const harrTopics: Topic[] = content.topics.map((t) => ({ ...t,
  sourcePdfs: t.id === HARR_COAGULATION_TOPIC ? [{ fileName: "Chapter_2_Hematology 2.pdf", pageRange: "2–9", kind: "Original supplied MCQ reviewer" }] : t.sourcePdfs,
  book: "Harr" as ReviewerBook }));
export const harrQuestions: ReviewerQuestion[] = activeHarrQuestions.map((q) => ({ ...q, book: "Harr" as ReviewerBook }));
export const harrHistoryQuestions: ReviewerQuestion[] = allHarrHistoryQuestions.map(q => ({ ...q, book: "Harr" as ReviewerBook }));
export const harrLegacyQuestions: ReviewerQuestion[] = content.questions.map(q => ({ ...q, book: "Harr" as ReviewerBook }));
export const harrSourceQuestions: ReviewerQuestion[] = sourceHarrQuestions.map(q => ({ ...q, book: "Harr" as ReviewerBook }));

export const allSubjects: Subject[] = harrSubjects;
export const allTopics: Topic[] = harrTopics;
export const allQuestions: ReviewerQuestion[] = harrQuestions;

export const subjects: Subject[] = harrSubjects;
export const topics: Topic[] = harrTopics;
export const questions: ReviewerQuestion[] = harrQuestions;

export const subjectById = new Map(harrSubjects.map((subject) => [subject.id, subject]));
export const topicById = new Map(harrTopics.map((topic) => [topic.id, topic]));
export const questionById = new Map(harrHistoryQuestions.map((question) => [question.id, question]));


