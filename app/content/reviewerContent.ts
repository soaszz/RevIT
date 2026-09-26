import rawContent from "./reviewerContent.json";
import ciullaRawContent from "./ciullaContent.json";

export type ReviewerBook = "Harr" | "Ciulla";

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
    }
  | {
      kind: "image";
      src: string;
      alt: string;
      width: number;
      height: number;
      caption?: string;
    };

export type ReviewerQuestion = {
  id: string;
  subjectId: string;
  topicId: string;
  subtopic?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  caseStudy?: string;
  prompt: string;
  stimulus?: QuestionStimulus;
  choices: string[];
  correctAnswer: number;
  officialAnswer: string;
  explanation: string;
  source: {
    fileName: string;
    page: number;
    kind: string;
  };
  book?: ReviewerBook;
};

const content = rawContent as {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

const ciullaContent = ciullaRawContent as {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

export const harrSubjects: Subject[] = content.subjects.map((s) => ({ ...s, book: "Harr" as ReviewerBook }));
export const harrTopics: Topic[] = content.topics.map((t) => ({ ...t, book: "Harr" as ReviewerBook }));
export const harrQuestions: ReviewerQuestion[] = content.questions.map((q) => ({ ...q, book: "Harr" as ReviewerBook }));

export const ciullaSubjects: Subject[] = ciullaContent.subjects.map((s) => ({ ...s, book: "Ciulla" as ReviewerBook }));
export const ciullaTopics: Topic[] = ciullaContent.topics.map((t) => ({ ...t, book: "Ciulla" as ReviewerBook }));
export const ciullaQuestions: ReviewerQuestion[] = ciullaContent.questions.map((q) => ({ ...q, book: "Ciulla" as ReviewerBook }));

export const allSubjects: Subject[] = [...harrSubjects, ...ciullaSubjects];
export const allTopics: Topic[] = [...harrTopics, ...ciullaTopics];
export const allQuestions: ReviewerQuestion[] = [...harrQuestions, ...ciullaQuestions];

export const subjects: Subject[] = allSubjects;
export const topics: Topic[] = allTopics;
export const questions: ReviewerQuestion[] = allQuestions;

export const subjectById = new Map(allSubjects.map((subject) => [subject.id, subject]));
export const topicById = new Map(allTopics.map((topic) => [topic.id, topic]));
export const questionById = new Map(allQuestions.map((question) => [question.id, question]));

