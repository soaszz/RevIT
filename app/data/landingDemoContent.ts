export type LandingDemoMcq = {
  id: string;
  subject: string;
  topic: string;
  prompt: string;
  choices: string[];
  correctAnswer: number;
  explanation: string;
};

export type LandingDemoFlashcard = {
  id: string;
  subject: string;
  topic: string;
  prompt: string;
  answer: string;
  explanation: string;
};

/**
 * Curated, verified, publicly permitted demonstration questions.
 * Isolated completely from production attempt tables, user accounts, and AI APIs.
 */
export const LANDING_DEMO_MCQS: LandingDemoMcq[] = [
  {
    id: "demo-mcq-1",
    subject: "Hematology",
    topic: "Specimen Collection & Anticoagulants",
    prompt: "Which anticoagulant is preferred for routine complete blood count (CBC) testing because it preserves cellular morphology?",
    choices: [
      "Sodium citrate",
      "K2 EDTA",
      "Sodium heparin",
      "Sodium fluoride",
    ],
    correctAnswer: 1,
    explanation: "Dipotassium EDTA (K2 EDTA) chelates calcium and prevents platelet clumping without altering cell volume or morphology, making it the anticoagulant of choice for routine hematology counts and blood smears.",
  },
  {
    id: "demo-mcq-2",
    subject: "Clinical Chemistry",
    topic: "Kidney Function & Electrolytes",
    prompt: "Which chemical reaction forms the basis of the classical Jaffe method for creatinine measurement?",
    choices: [
      "Reaction of creatinine with alkaline picrate to produce an orange-red complex",
      "Coupling of creatinine with diazonium salt in an acidic buffer",
      "Oxidation of creatinine by ferric perchlorate to form a blue adduct",
      "Enzymatic degradation of creatinine into formaldehyde and ammonia",
    ],
    correctAnswer: 0,
    explanation: "The classical Jaffe reaction involves the reaction between creatinine and picric acid in an alkaline medium, producing an orange-red Janovski complex measured spectrophotometrically around 500 nm.",
  },
  {
    id: "demo-mcq-3",
    subject: "Bacteriology",
    topic: "Gram Stain & Cell Wall Structure",
    prompt: "What is the primary role of Gram's iodine in the classic Gram staining procedure?",
    choices: [
      "Decolorizing lipid-rich outer membranes",
      "Acting as a mordant to form an insoluble crystal violet-iodine complex",
      "Counterstaining Gram-negative bacterial cytoplasm",
      "Fixing bacterial smears thermally to glass slides",
    ],
    correctAnswer: 1,
    explanation: "Gram's iodine serves as a mordant that chemically binds to crystal violet within the thick peptidoglycan mesh of Gram-positive cells, forming a large insoluble dye-iodine complex resistant to alcohol decolorization.",
  },
  {
    id: "demo-mcq-4",
    subject: "Immunohematology",
    topic: "Blood Groups & Compatibility",
    prompt: "An individual who has neither A nor B antigens on their red blood cells naturally possesses which serum isohemagglutinins?",
    choices: [
      "Anti-A only",
      "Anti-B only",
      "Both Anti-A and Anti-B",
      "Neither Anti-A nor Anti-B",
    ],
    correctAnswer: 2,
    explanation: "Group O individuals lack both A and B erythrocyte surface antigens. Consequently, their serum naturally contains both Anti-A and Anti-B antibodies (predominantly IgG and IgM class).",
  },
];

/**
 * Curated active-recall flashcard examples for public landing demonstration.
 * Front displays Subject, Topic, and Prompt only (no choices, answers, or book pages).
 * Back displays clear Answer and concise Explanation.
 */
export const LANDING_DEMO_FLASHCARDS: LandingDemoFlashcard[] = [
  {
    id: "demo-fc-1",
    subject: "Hematology",
    topic: "Erythrocyte Physiology",
    prompt: "What is the primary physiological function of adult hemoglobin?",
    answer: "Reversibly bind oxygen in the lungs and deliver it to peripheral tissues",
    explanation: "Hemoglobin A (HbA) contains four iron-containing heme groups within globin polypeptide chains, facilitating efficient cooperative oxygen binding and transport while assisting in proton buffering and carbon dioxide transport.",
  },
  {
    id: "demo-fc-2",
    subject: "Clinical Chemistry",
    topic: "Liver & Biliary Enzymes",
    prompt: "Which serum enzyme is most specifically elevated in hepatobiliary obstruction and chronic alcohol intake?",
    answer: "Gamma-glutamyl transferase (GGT)",
    explanation: "GGT is highly sensitive to biliary obstruction and microsomal enzyme induction (such as from ethanol or phenytoin). Unlike alkaline phosphatase (ALP), GGT levels remain completely normal in bone disorders.",
  },
  {
    id: "demo-fc-3",
    subject: "Parasitology",
    topic: "Intestinal Protozoa",
    prompt: "What is the characteristic distinguishing nuclear morphology of Entamoeba histolytica cysts?",
    answer: "Centrally located karyosome with delicate, uniformly distributed peripheral chromatin",
    explanation: "Mature Entamoeba histolytica cysts contain 1 to 4 nuclei featuring a pinpoint centrally placed karyosome and fine, even peripheral chromatin beads, distinguishing them from Entamoeba coli which exhibits an eccentric karyosome.",
  },
  {
    id: "demo-fc-4",
    subject: "Urinalysis & Body Fluids",
    topic: "Urine Sediment & Microscopy",
    prompt: "Which urinary cast is considered virtually pathognomonic for acute glomerulonephritis?",
    answer: "Red Blood Cell (RBC) cast",
    explanation: "RBC casts form when red cells escape through damaged glomerular basement membranes into renal tubules, becoming trapped within a Tamm-Horsfall protein matrix. Their presence confirms a renal/glomerular bleeding origin.",
  },
];
