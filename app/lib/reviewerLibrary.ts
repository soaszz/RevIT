import type { Subject, Topic } from "../content/reviewerContent";

export const MTAP_1_CATEGORY = "MTAP 1" as const;
export const OTHER_MAJORS_CATEGORY = "Other Majors" as const;

export type SubjectSection = {
  id: string;
  title: string | null;
  description: string | null;
  subjects: Subject[];
};

export function filterSubjectsBySearch(
  allSubjects: Subject[],
  allTopics: Topic[],
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return allSubjects;

  return allSubjects.filter((subject) => {
    const subjectTopics = allTopics.filter((topic) => topic.subjectId === subject.id);
    return [
      subject.name,
      subject.description,
      subject.category ?? "",
      ...subjectTopics.flatMap((topic) => [topic.name, topic.description]),
    ].some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function buildSubjectSections(visibleSubjects: Subject[], isNuRevit: boolean): SubjectSection[] {
  if (!isNuRevit) {
    return [{ id: "all-subjects", title: null, description: null, subjects: visibleSubjects }];
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
