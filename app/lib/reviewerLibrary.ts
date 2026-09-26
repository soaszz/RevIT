import type { ReviewerBook, Subject, Topic } from "../content/reviewerContent";

export const MTAP_1_CATEGORY = "MTAP 1" as const;
export const OTHER_MAJORS_CATEGORY = "Other Majors" as const;
export const ALL_MAJORS_CATEGORY = "All Majors" as const;

export type UnifiedSubject = Subject & {
  books: ReviewerBook[];
  sourceSubjectIds: string[];
};

export type SubjectSection<T extends Subject = UnifiedSubject> = {
  id: string;
  title: string | null;
  description: string | null;
  subjects: T[];
};

export const CANONICAL_COMBINED_SUBJECTS: {
  id: string;
  name: string;
  category: "MTAP 1" | "Other Majors";
  description: string;
  sourceSubjectIds: string[];
}[] = [
  {
    id: "clinical-chemistry",
    name: "Clinical Chemistry",
    category: "MTAP 1",
    description: "Instrumentation, analytical principles, carbohydrates, lipids, enzymes, organ function, electrolytes, acid-base balance, endocrinology, and toxicology from Harr and Ciulla.",
    sourceSubjectIds: ["clinical-chemistry", "ciulla-clinical-chemistry"],
  },
  {
    id: "hematology",
    name: "Hematology",
    category: "MTAP 1",
    description: "Physiology of blood, erythrocyte disorders, leukopoiesis, malignancies, and methodology from Harr and Ciulla.",
    sourceSubjectIds: ["hematology", "ciulla-hematology"],
  },
  {
    id: "bacteriology",
    name: "Bacteriology",
    category: "MTAP 1",
    description: "Specimen collection, staining, gram-positive cocci, gram-negative bacilli, fastidious bacteria, mycobacteria, and antimicrobial susceptibility from Harr and Ciulla.",
    sourceSubjectIds: ["bacteriology", "ciulla-bacteriology"],
  },
  {
    id: "aubf",
    name: "AUBF / Urinalysis & Body Fluids",
    category: "MTAP 1",
    description: "Renal physiology, physical and chemical urinalysis, microscopic sediment examination, cerebrospinal fluid, and body fluids from Harr and Ciulla.",
    sourceSubjectIds: ["aubf", "ciulla-urinalysis-and-body-fluids"],
  },
  {
    id: "immunohematology",
    name: "Immunohematology",
    category: "Other Majors",
    description: "Blood collection, preservation, blood group genetics, antibody detection and identification, compatibility testing, transfusion reactions, and HDN from Harr and Ciulla.",
    sourceSubjectIds: ["immunohematology", "ciulla-immunohematology"],
  },
  {
    id: "parasitology",
    name: "Parasitology",
    category: "Other Majors",
    description: "Intestinal, blood, and tissue protozoa, helminths, and clinical diagnostic methods from Harr and Ciulla.",
    sourceSubjectIds: ["parasitology", "ciulla-parasitology"],
  },
  {
    id: "immunology",
    name: "Immunology & Serology",
    category: "Other Majors",
    description: "Immune system principles, antigen-antibody interactions, serological testing, autoimmune disorders, and hypersensitivity from Harr and Ciulla.",
    sourceSubjectIds: ["immunology", "ciulla-immunology-and-serology"],
  },
];

export function getUnifiedSubjects(
  book: ReviewerBook | "all",
  allSubjects: Subject[],
  allTopics: Topic[],
): UnifiedSubject[] {
  if (book !== "all") {
    return allSubjects
      .filter((s) => s.book === book)
      .map((s) => {
        const sTopics = allTopics.filter((t) => t.subjectId === s.id || s.topicIds?.includes(t.id));
        return {
          ...s,
          topicIds: sTopics.map((t) => t.id),
          books: s.book ? [s.book] : [book],
          sourceSubjectIds: [s.id],
        };
      });
  }

  const combinedSubjects: UnifiedSubject[] = [];
  const handledSourceIds = new Set<string>();

  for (const combo of CANONICAL_COMBINED_SUBJECTS) {
    const matchedSubjects = allSubjects.filter((s) => combo.sourceSubjectIds.includes(s.id));
    if (matchedSubjects.length > 0) {
      const topicIds: string[] = [];
      const books: ReviewerBook[] = [];
      for (const subj of matchedSubjects) {
        handledSourceIds.add(subj.id);
        if (subj.book && !books.includes(subj.book)) {
          books.push(subj.book);
        }
        const sTopics = allTopics.filter((t) => t.subjectId === subj.id || subj.topicIds?.includes(t.id));
        for (const t of sTopics) {
          if (!topicIds.includes(t.id)) topicIds.push(t.id);
        }
      }
      combinedSubjects.push({
        id: combo.id,
        name: combo.name,
        category: combo.category,
        description: combo.description,
        topicIds,
        books,
        sourceSubjectIds: combo.sourceSubjectIds,
      });
    }
  }

  const remainingSubjects: UnifiedSubject[] = [];
  for (const s of allSubjects) {
    if (!handledSourceIds.has(s.id)) {
      const sTopics = allTopics.filter((t) => t.subjectId === s.id || s.topicIds?.includes(t.id));
      remainingSubjects.push({
        ...s,
        topicIds: sTopics.map((t) => t.id),
        books: s.book ? [s.book] : [],
        sourceSubjectIds: [s.id],
      });
    }
  }

  const allResult = [...combinedSubjects, ...remainingSubjects];
  return allResult.sort((a, b) => {
    if (a.category === "MTAP 1" && b.category !== "MTAP 1") return -1;
    if (a.category !== "MTAP 1" && b.category === "MTAP 1") return 1;
    return 0;
  });
}

export function filterSubjectsBySearch<T extends Subject>(
  allSubjects: T[],
  allTopics: Topic[],
  search: string,
): T[] {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return allSubjects;

  return allSubjects.filter((subject) => {
    const subjectTopics = allTopics.filter((topic) =>
      subject.topicIds ? subject.topicIds.includes(topic.id) : topic.subjectId === subject.id
    );
    return [
      subject.name,
      subject.description,
      subject.category ?? "",
      ...subjectTopics.flatMap((topic) => [topic.name, topic.description, topic.book ?? ""]),
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function buildSubjectSections<T extends Subject = UnifiedSubject>(visibleSubjects: T[], isNuRevit: boolean): SubjectSection<T>[] {
  if (!isNuRevit) {
    return [{
      id: "all-majors",
      title: ALL_MAJORS_CATEGORY,
      description: "Every available Medical Technology major in one collection.",
      subjects: visibleSubjects,
    }];
  }

  const mtapOneSubjects = visibleSubjects.filter((subject) => subject.category === MTAP_1_CATEGORY);
  const otherMajors = visibleSubjects.filter((subject) => subject.category !== MTAP_1_CATEGORY);

  return [
    {
      id: "mtap-1",
      title: MTAP_1_CATEGORY,
      description: "Core Medical Technology subjects included in NU MTAP 1.",
      subjects: mtapOneSubjects,
    },
    {
      id: "other-majors",
      title: OTHER_MAJORS_CATEGORY,
      description: "Additional Medical Technology subjects outside MTAP 1.",
      subjects: otherMajors,
    },
  ].filter((section) => section.subjects.length > 0);
}
