import rawContent from "./reviewerContent.json";

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

export const harrSubjects: Subject[] = content.subjects.map((s) => ({ ...s, book: "Harr" as ReviewerBook }));
export const harrTopics: Topic[] = content.topics.map((t) => ({ ...t, book: "Harr" as ReviewerBook }));
export const harrQuestions: ReviewerQuestion[] = content.questions.map((q) => ({ ...q, book: "Harr" as ReviewerBook }));

export const allSubjects: Subject[] = harrSubjects;
export const allTopics: Topic[] = harrTopics;
export const allQuestions: ReviewerQuestion[] = harrQuestions;

export const subjects: Subject[] = harrSubjects;
export const topics: Topic[] = harrTopics;
export const questions: ReviewerQuestion[] = harrQuestions;

export const subjectById = new Map(harrSubjects.map((subject) => [subject.id, subject]));
export const topicById = new Map(harrTopics.map((topic) => [topic.id, topic]));
export const questionById = new Map(harrQuestions.map((question) => [question.id, question]));


