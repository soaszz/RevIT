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
  aliases?: string[];
}[] = [
  {
    id: "clinical-chemistry",
    name: "Clinical Chemistry",
    category: "MTAP 1",
    description: "Instrumentation, analytical principles, carbohydrates, lipids, enzymes, organ function, electrolytes, acid-base balance, endocrinology, and toxicology from Harr and Ciulla.",
    sourceSubjectIds: ["clinical-chemistry", "ciulla-clinical-chemistry", "elsevier-clinical-chemistry", "boc-chemistry"],
    aliases: ["Clinical Chemistry", "Chemistry", "Clinical Biochemistry", "Clinical Biochemical Analysis"],
  },
  {
    id: "hematology",
    name: "Hematology",
    category: "MTAP 1",
    description: "Physiology of blood, erythrocyte disorders, leukopoiesis, malignancies, and methodology from Harr, Ciulla, and Rodak.",
    sourceSubjectIds: ["hematology", "ciulla-hematology", "rodak-hematology", "elsevier-hematology", "boc-hematology"],
  },
  {
    id: "bacteriology",
    name: "Bacteriology",
    category: "MTAP 1",
    description: "Specimen collection, staining, gram-positive cocci, gram-negative bacilli, fastidious bacteria, mycobacteria, and antimicrobial susceptibility from Harr and Ciulla.",
    sourceSubjectIds: ["bacteriology", "ciulla-bacteriology", "elsevier-bacteriology"],
    aliases: ["Bacteriology", "Microbiology"],
  },
  {
    id: "aubf",
    name: "Clinical Microscopy",
    category: "MTAP 1",
    description: "Renal physiology, physical and chemical urinalysis, microscopic sediment examination, cerebrospinal fluid, and body fluids from Harr, Ciulla, and Strasinger.",
    sourceSubjectIds: ["aubf", "ciulla-urinalysis-and-body-fluids", "strasinger-aubf", "elsevier-clinical-microscopy", "boc-urinalysis-body-fluids"],
    aliases: ["Clinical Microscopy", "AUBF", "Urinalysis & Body Fluids", "Urinalysis and Body Fluids", "Urinalysis and Other Body Fluids"],
  },
  {
    id: "immunohematology",
    name: "Immunohematology",
    category: "Other Majors",
    description: "Blood collection, preservation, blood group genetics, antibody detection and identification, compatibility testing, transfusion reactions, and HDN from Harr and Ciulla.",
    sourceSubjectIds: ["immunohematology", "ciulla-immunohematology", "elsevier-immunohematology", "boc-blood-banking"],
    aliases: ["Immunohematology", "Blood Banking"],
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
    sourceSubjectIds: ["immunology", "ciulla-immunology-and-serology", "elsevier-immunology-serology", "boc-immunology"],
    aliases: ["Immunology", "Immunology and Serology", "Immunology & Serology"],
  },
  {
    id: "mycology-and-virology",
    name: "Mycology and Virology",
    category: "Other Majors",
    description: "Fungal physiology, cutaneous, subcutaneous, and systemic mycoses, opportunistic fungi, viral structure, DNA and RNA viruses, and diagnostic virology techniques from Harr and Ciulla.",
    sourceSubjectIds: ["mycology-and-virology", "ciulla-mycology-and-virology", "mycology", "virology"],
  },

  {
    id: "laboratory-operations",
    name: "Laboratory Operations",
    category: "Other Majors",
    description: "Source laboratory operations topics, retaining each edition’s mathematics, quality, safety, instrumentation and management groups.",
    sourceSubjectIds: ["laboratory-operations", "elsevier-laboratory-operations", "boc-laboratory-operations"],
  },
  {
    id: "ciulla-laboratory-calculations",
    name: "Laboratory Calculations",
    category: "Other Majors",
    description: "Separate source calculations chapters; calculations topics inside other subjects remain in their original subject.",
    sourceSubjectIds: ["ciulla-laboratory-calculations", "elsevier-laboratory-calculations"],
  },
  {
    id: "ciulla-hemostasis",
    name: "Hemostasis",
    category: "Other Majors",
    description: "Separate source hemostasis subjects; hemostasis topics within Hematology remain in Hematology.",
    sourceSubjectIds: ["ciulla-hemostasis", "boc-hemostasis"],
  },
  {
    id: "ciulla-molecular-diagnostics",
    name: "Molecular Diagnostics",
    category: "Other Majors",
    description: "Separate source molecular diagnostics chapters; hematology molecular topics remain in their original subject.",
    sourceSubjectIds: ["ciulla-molecular-diagnostics", "elsevier-molecular-diagnostics"],
  },
  {
    id: "ciulla-laboratory-management",
    name: "Laboratory Management",
    category: "Other Majors",
    description: "Ciulla’s separate laboratory management subject, distinct from Laboratory Operations and Calculations.",
    sourceSubjectIds: ["ciulla-laboratory-management"],
    aliases: ["Laboratory Management", "Clinical Laboratory Management", "Laboratory Administration"],
  },
];

// Source-established BOC section IDs only; pre/postanalytic and mixed topics stay Microbiology.
export const BOC_MICROBIOLOGY_TOPIC_SUBJECTS: Record<string, string> = {
  ...Object.fromEntries(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"]
    .map(section => [`boc-ch06-ii-${section}`, "bacteriology"])),
  "boc-ch06-iii-b": "mycology-and-virology",
  "boc-ch06-iii-c": "parasitology",
  "boc-ch06-iii-d": "mycology-and-virology",
};

// Resolve presentation only. Stored subject/topic IDs and source records never change.
export function getCanonicalSubjectId(subjectId: string, topicId?: string) {
  const displayId = subjectId === "boc-microbiology" && topicId
    ? BOC_MICROBIOLOGY_TOPIC_SUBJECTS[topicId] ?? subjectId : subjectId;
  return CANONICAL_COMBINED_SUBJECTS.find(subject => subject.sourceSubjectIds.includes(displayId))?.id ?? displayId;
}

export function getSubjectDisplayName(subjectId: string, sourceName: string, topicId?: string) {
  const canonicalId = getCanonicalSubjectId(subjectId, topicId);
  return CANONICAL_COMBINED_SUBJECTS.find(subject => subject.id === canonicalId)?.name ?? sourceName;
}

// Preserve the live four-book projection exactly until new-book data is actually present.
const legacyIds = new Set(["clinical-chemistry","hematology","bacteriology","aubf","immunohematology","parasitology","immunology","mycology-and-virology"]);
const legacyCombinations = CANONICAL_COMBINED_SUBJECTS.filter(s => legacyIds.has(s.id)).map(s => ({...s,
  sourceSubjectIds:s.sourceSubjectIds.filter(id => !id.startsWith("boc-") && !id.startsWith("elsevier-") && id!=="mycology" && id!=="virology") }));
function getPublishedLegacySubjects(
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

  for (const combo of legacyCombinations) {
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

export function getUnifiedSubjects(
  book: ReviewerBook | "all",
  allSubjects: Subject[],
  allTopics: Topic[],
): UnifiedSubject[] {
  if ((book !== "all" && book !== "BOC" && book !== "Elsevier") || !allSubjects.some(s => s.book === "BOC" || s.book === "Elsevier")) return getPublishedLegacySubjects(book,allSubjects,allTopics);
  const groups = new Map<string, UnifiedSubject>();
  for (const source of allSubjects) {
    if (book !== "all" && source.book !== book) continue;
    const sourceTopics = allTopics.filter(topic => topic.subjectId === source.id || source.topicIds?.includes(topic.id));
    for (const topic of sourceTopics.length ? sourceTopics : [undefined]) {
      const canonicalId = getCanonicalSubjectId(source.id, topic?.id);
      const splitTopic = canonicalId !== getCanonicalSubjectId(source.id);
      const id = book === "all" || splitTopic ? canonicalId : source.id;
      const canonical = CANONICAL_COMBINED_SUBJECTS.find(subject => subject.id === canonicalId);
      let group = groups.get(id);
      if (!group) {
        group = {
          ...source, id,
          name: canonical?.name ?? source.name,
          category: book === "all" ? canonical?.category ?? source.category : source.category,
          description: canonical?.description ?? source.description,
          topicIds: [], books: [], sourceSubjectIds: [],
        };
        groups.set(id, group);
      }
      if (topic && !group.topicIds.includes(topic.id)) group.topicIds.push(topic.id);
      if (source.book && !group.books.includes(source.book)) group.books.push(source.book);
      if (!group.sourceSubjectIds.includes(source.id)) group.sourceSubjectIds.push(source.id);
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (book !== "all") return 0;
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
      ...(CANONICAL_COMBINED_SUBJECTS.find(canonical => canonical.id === getCanonicalSubjectId(subject.id))?.aliases ?? []),
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
