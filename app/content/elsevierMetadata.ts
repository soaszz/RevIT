import type { Subject, Topic } from "./reviewerContent";

export const ELSEVIER_TITLE = "Elsevier's Medical Laboratory Science Examination Review, First Edition";

export const elsevierPreviewSubjects: Subject[] = [
  {
    "id": "elsevier-bacteriology",
    "name": "Bacteriology",
    "description": "Bacteriology",
    "topicIds": [
      "elsevier-ch01"
    ],
    "category": "MTAP 1",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-mycology-virology-parasitology",
    "name": "Mycology, Virology, and Parasitology",
    "description": "Mycology, Virology, and Parasitology",
    "topicIds": [
      "elsevier-ch02"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-hematology",
    "name": "Hematology",
    "description": "Hematology",
    "topicIds": [
      "elsevier-ch03",
      "elsevier-ch04"
    ],
    "category": "MTAP 1",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-clinical-microscopy",
    "name": "Clinical Microscopy",
    "description": "Clinical Microscopy",
    "topicIds": [
      "elsevier-ch05"
    ],
    "category": "MTAP 1",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-immunology-serology",
    "name": "Immunology & Serology",
    "description": "Immunology & Serology",
    "topicIds": [
      "elsevier-ch06"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-immunohematology",
    "name": "Immunohematology",
    "description": "Immunohematology",
    "topicIds": [
      "elsevier-ch07"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-clinical-chemistry",
    "name": "Clinical Chemistry",
    "description": "Clinical Chemistry",
    "topicIds": [
      "elsevier-ch08"
    ],
    "category": "MTAP 1",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-molecular-diagnostics",
    "name": "Molecular Diagnostics",
    "description": "Molecular Diagnostics",
    "topicIds": [
      "elsevier-ch09"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-laboratory-operations",
    "name": "Laboratory Operations",
    "description": "Laboratory Operations",
    "topicIds": [
      "elsevier-ch10"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-laboratory-calculations",
    "name": "Laboratory Calculations",
    "description": "Laboratory Calculations",
    "topicIds": [
      "elsevier-ch11"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  },
  {
    "id": "elsevier-mock-examination",
    "name": "Mock Examination",
    "description": "Mock Examination",
    "topicIds": [
      "elsevier-mock"
    ],
    "category": "Other Majors",
    "book": "Elsevier"
  }
];

export const elsevierPreviewTopics: Topic[] = [
  {
    "id": "elsevier-ch01",
    "subjectId": "elsevier-bacteriology",
    "name": "Microbiology",
    "description": "Microbiology",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "52-63",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch02",
    "subjectId": "elsevier-mycology-virology-parasitology",
    "name": "Mycology, Virology, and Parasitology",
    "description": "Mycology, Virology, and Parasitology",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "95-103",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch03",
    "subjectId": "elsevier-hematology",
    "name": "Hematology",
    "description": "Hematology",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "142-152",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch04",
    "subjectId": "elsevier-hematology",
    "name": "Hemostasis",
    "description": "Hemostasis",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "167-172",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch05",
    "subjectId": "elsevier-clinical-microscopy",
    "name": "Clinical Fluid Analysis",
    "description": "Clinical Fluid Analysis",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "188-193",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch06",
    "subjectId": "elsevier-immunology-serology",
    "name": "Immunology and Serology",
    "description": "Immunology and Serology",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "208-213",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch07",
    "subjectId": "elsevier-immunohematology",
    "name": "Immunohematology and Blood Transfusion Medicine",
    "description": "Immunohematology and Blood Transfusion Medicine",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "233-241",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch08",
    "subjectId": "elsevier-clinical-chemistry",
    "name": "Clinical Chemistry",
    "description": "Clinical Chemistry",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "266-275",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch09",
    "subjectId": "elsevier-molecular-diagnostics",
    "name": "Molecular Diagnostics",
    "description": "Molecular Diagnostics",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "291-296",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch10",
    "subjectId": "elsevier-laboratory-operations",
    "name": "Laboratory Operations",
    "description": "Laboratory Operations",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "305-311",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-ch11",
    "subjectId": "elsevier-laboratory-calculations",
    "name": "Laboratory Calculations",
    "description": "Laboratory Calculations",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "321-325",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  },
  {
    "id": "elsevier-mock",
    "subjectId": "elsevier-mock-examination",
    "name": "Mock Examination",
    "description": "Mock Examination",
    "sourcePdfs": [
      {
        "fileName": "ELSEVIER.pdf",
        "pageRange": "371-379",
        "kind": "Elsevier's Medical Laboratory Science Examination Review, First Edition"
      }
    ],
    "book": "Elsevier"
  }
];

export const elsevierTopicQuestionCounts: Record<string, number> = {
  "elsevier-ch01": 100,
  "elsevier-ch02": 50,
  "elsevier-ch03": 100,
  "elsevier-ch04": 50,
  "elsevier-ch05": 50,
  "elsevier-ch06": 50,
  "elsevier-ch07": 100,
  "elsevier-ch08": 100,
  "elsevier-ch09": 50,
  "elsevier-ch10": 50,
  "elsevier-ch11": 30,
  "elsevier-mock": 100
};

export const elsevierSubjectQuestionCounts: Record<string, number> = {
  "elsevier-bacteriology": 100,
  "elsevier-mycology-virology-parasitology": 50,
  "elsevier-hematology": 150,
  "elsevier-clinical-microscopy": 50,
  "elsevier-immunology-serology": 50,
  "elsevier-immunohematology": 100,
  "elsevier-clinical-chemistry": 100,
  "elsevier-molecular-diagnostics": 50,
  "elsevier-laboratory-operations": 50,
  "elsevier-laboratory-calculations": 30,
  "elsevier-mock-examination": 100
};

export const ELSEVIER_TOTAL_QUESTIONS = 830;
