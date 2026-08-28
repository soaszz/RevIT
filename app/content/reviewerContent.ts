import rawContent from "./reviewerContent.json";

export type Subject = {
  id: string;
  name: string;
  description: string;
  topicIds: string[];
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
};

export type ReviewerQuestion = {
  id: string;
  subjectId: string;
  topicId: string;
  subtopic?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  prompt: string;
  choices: string[];
  correctAnswer: number;
  officialAnswer: string;
  explanation: string;
  source: {
    fileName: string;
    page: number;
    kind: string;
  };
};

const content = rawContent as {
  subjects: Subject[];
  topics: Topic[];
  questions: ReviewerQuestion[];
};

export const subjects = content.subjects;
export const topics = content.topics;
export const questions = content.questions;

export const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
export const topicById = new Map(topics.map((topic) => [topic.id, topic]));
export const questionById = new Map(questions.map((question) => [question.id, question]));
