import type { Subject, Topic } from "../content/reviewerContent";

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

  const coreSubjects = visibleSubjects.filter((subject) => subject.category !== OTHER_MAJORS_CATEGORY);
  const otherMajors = visibleSubjects.filter((subject) => subject.category === OTHER_MAJORS_CATEGORY);

  return [
    { id: "core-subjects", title: null, description: null, subjects: coreSubjects },
    {
      id: "other-majors",
      title: OTHER_MAJORS_CATEGORY,
      description: "Additional Medical Technology subjects outside the NU MTAP core set.",
      subjects: otherMajors,
    },
  ].filter((section) => section.subjects.length > 0);
}
