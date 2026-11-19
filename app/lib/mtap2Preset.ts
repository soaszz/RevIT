// Presentation-only references. Source subjects, topics and questions never move.
export const MTAP_2_CATEGORY = "MTAP 2";
export const MTAP_2_SUBJECTS = [
  { id: "hematology", name: "Hematology", collections: ["hematology"] },
  { id: "clinical-chemistry", name: "Clinical Chemistry", collections: ["clinical-chemistry"] },
  { id: "mycology-virology", name: "Mycology and Virology", collections: ["mycology-and-virology"] },
  { id: "immunology-serology", name: "Immunology and Serology", collections: ["immunology"] },
  { id: "hemostasis", name: "Hemostasis", collections: ["ciulla-hemostasis"] },
  { id: "mycology-virology-parasitology", name: "Mycology, Virology, and Parasitology", collections: ["mycology-and-virology", "parasitology"] },
] as const;
