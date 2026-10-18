import type { Subject, Topic } from "./reviewerContent";

export const ciullaPreviewSubjects: Subject[] = [
  {
    "id": "ciulla-clinical-chemistry",
    "name": "Clinical Chemistry",
    "description": "General laboratory principles and math, analytical procedures, instrumentation and safety, carbohydrates, lipids, proteins, nonprotein nitrogenous substances, enzymology, liver function, electrolytes and acid-base, endocrinology, toxicology, and case studies.",
    "topicIds": [
      "ciulla-cc-instrumentation-and-analytical-principles",
      "ciulla-cc-proteins-and-tumor-markers",
      "ciulla-cc-nonprotein-nitrogenous-compounds",
      "ciulla-cc-carbohydrates",
      "ciulla-cc-lipids-and-lipoproteins",
      "ciulla-cc-enzymes-and-cardiac-assessment",
      "ciulla-cc-liver-function-and-porphyrin-formation",
      "ciulla-cc-electrolytes-and-osmolality",
      "ciulla-cc-acid-base-metabolism",
      "ciulla-cc-endocrinology",
      "ciulla-cc-toxicology",
      "ciulla-cc-vitamins"
    ],
    "category": "MTAP 1",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hematology",
    "name": "Hematology",
    "description": "Erythrocyte physiology, anemias, leukocyte physiology, leukocyte disorders, hematologic malignancies, laboratory procedures, and problem solving and case studies.",
    "topicIds": [
      "ciulla-hema-physiology-of-the-blood",
      "ciulla-hema-erythrocytes-and-anemias",
      "ciulla-hema-leukocytes-and-malignancies",
      "ciulla-hema-instrumentation-and-methodology",
      "ciulla-hema-hematology-problem-solving-and-case-studies"
    ],
    "category": "MTAP 1",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hemostasis",
    "name": "Hemostasis",
    "description": "Physiology of hemostasis, coagulation factors, platelet and vascular disorders, coagulation defects, inhibitors, anticoagulants, and problem solving.",
    "topicIds": [
      "ciulla-hemo-normal-hemostasis-and-coagulation-cascade",
      "ciulla-hemo-hemostatic-disorders-and-thrombosis",
      "ciulla-hemo-laboratory-evaluation-and-coagulation-testing"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-immunology-and-serology",
    "name": "Immunology and Serology",
    "description": "Immune mechanisms, serologic procedures, infectious serology, autoimmune diseases, hypersensitivity, immunodeficiencies, and clinical problem solving.",
    "topicIds": [
      "ciulla-imm-immune-system-and-immunoglobulins",
      "ciulla-imm-antigen-antibody-reactions-and-serological-testing",
      "ciulla-imm-autoimmune-diseases-and-hypersensitivity"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-immunohematology",
    "name": "Immunohematology",
    "description": "Blood group genetics, ABO and Rh systems, antibody identification, compatibility testing, transfusion therapy, HDFN, and donor processing.",
    "topicIds": [
      "ciulla-bb-blood-collection-preservation-and-quality-control",
      "ciulla-bb-blood-groups-genetics-and-serology",
      "ciulla-bb-antibody-identification-and-transfusion-therapy",
      "ciulla-bb-hemolytic-disease-and-problem-solving"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bacteriology",
    "name": "Bacteriology",
    "description": "Specimen collection and processing, staining and morphology, gram-positive cocci, gram-negative bacilli, fastidious bacteria, anaerobes, mycobacteria, and antimicrobial susceptibility.",
    "topicIds": [
      "ciulla-bact-specimen-collection-processing-and-staining",
      "ciulla-bact-gram-positive-cocci",
      "ciulla-bact-gram-negative-bacilli-and-cocci",
      "ciulla-bact-fastidious-and-anaerobic-bacteria",
      "ciulla-bact-mycobacteria-and-spirochetes",
      "ciulla-bact-antimicrobial-susceptibility-and-case-studies"
    ],
    "category": "MTAP 1",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-mycology-and-virology",
    "name": "Mycology and Virology",
    "description": "Fungal physiology, cutaneous, subcutaneous, and systemic mycoses, opportunistic fungi, viral structure, DNA and RNA viruses, and diagnostic virology techniques.",
    "topicIds": [
      "ciulla-myco-fungal-physiology-and-taxonomy",
      "ciulla-myco-cutaneous-subcutaneous-and-systemic-mycoses",
      "ciulla-viro-viral-structure-and-taxonomy",
      "ciulla-viro-diagnostic-virology-and-serology"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-parasitology",
    "name": "Parasitology",
    "description": "Intestinal, blood, and tissue protozoa, helminths, diagnostic methods, and clinical parasitology.",
    "topicIds": [
      "ciulla-para-protozoa-intestinal-blood-and-tissue",
      "ciulla-para-helminths-and-diagnostic-methods"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-molecular-diagnostics",
    "name": "Molecular Diagnostics",
    "description": "Molecular biology principles, nucleic acid extraction, amplification techniques, sequencing, and clinical diagnostic applications.",
    "topicIds": [
      "ciulla-mol-nucleic-acid-principles-and-isolation",
      "ciulla-mol-molecular-amplification-and-sequencing"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-urinalysis-and-body-fluids",
    "name": "Urinalysis and Body Fluids",
    "description": "Renal anatomy and physiology, chemical urinalysis, microscopic examination of urinary sediment, cerebrospinal fluid, and serous and synovial fluids.",
    "topicIds": [
      "ciulla-aubf-renal-physiology-and-physical-chemical-urinalysis",
      "ciulla-aubf-microscopic-sediment-and-body-fluids"
    ],
    "category": "MTAP 1",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-laboratory-calculations",
    "name": "Laboratory Calculations",
    "description": "Solution preparation, dilutions, molarity and normality, standard curves, concentration conversions, and clinical formulas.",
    "topicIds": [
      "ciulla-calc-dilutions-solutions-and-concentration",
      "ciulla-calc-spectrophotometry-beer-s-law-and-enzymology"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-general-laboratory-principles",
    "name": "General Laboratory Principles, Quality Assessment, and Safety",
    "description": "Laboratory safety, quality control, Westgard multirules, method validation, statistics, and standard laboratory precautions.",
    "topicIds": [
      "ciulla-genlab-laboratory-safety-hazards-and-regulations",
      "ciulla-genlab-quality-control-westgard-rules-and-statistics"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  },
  {
    "id": "ciulla-laboratory-management",
    "name": "Laboratory Management",
    "description": "Laboratory leadership, budgeting and finances, staffing, workflow management, compliance, and laboratory information systems.",
    "topicIds": [
      "ciulla-mgmt-regulatory-standards-and-accreditation",
      "ciulla-mgmt-budgeting-staffing-and-operations"
    ],
    "category": "Other Majors",
    "book": "Ciulla"
  }
];

export const ciullaPreviewTopics: Topic[] = [
  {
    "id": "ciulla-cc-instrumentation-and-analytical-principles",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Instrumentation and Analytical Principles",
    "description": "Spectrophotometry, osmometry, chromatography, electrophoresis, electrochemistry, and basic analytical principles.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-proteins-and-tumor-markers",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Proteins and Tumor Markers",
    "description": "Serum protein fractions, albumin, globulins, immunofixation, acute phase reactants, and clinical tumor markers.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-nonprotein-nitrogenous-compounds",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Nonprotein Nitrogenous Compounds",
    "description": "Urea nitrogen, creatinine, uric acid, ammonia, glomerular filtration clearance, and renal assessment.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-carbohydrates",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Carbohydrates",
    "description": "Glucose metabolism, diabetes mellitus criteria, oral glucose tolerance, insulin, C-peptide, and microalbuminuria.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-lipids-and-lipoproteins",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Lipids and Lipoproteins",
    "description": "Cholesterol, triglycerides, chylomicrons, VLDL, LDL, HDL, apolipoproteins, and coronary heart disease risk.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-enzymes-and-cardiac-assessment",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Enzymes and Cardiac Assessment",
    "description": "Enzyme kinetics, CK isoenzymes, LD fractions, troponins, AST, ALT, ALP, amylase, and lipase.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-liver-function-and-porphyrin-formation",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Liver Function and Porphyrin Formation",
    "description": "Bilirubin metabolism, jaundice classification, urobilinogen, bile acids, and heme biosynthesis disorders.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-electrolytes-and-osmolality",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Electrolytes and Osmolality",
    "description": "Sodium, potassium, chloride, bicarbonate, anion gap calculations, and serum and urine osmolality.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-acid-base-metabolism",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Acid-Base Metabolism",
    "description": "Blood gas parameters, pH, pCO2, pO2, base excess, respiratory and metabolic acid-base disorders, and compensation.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-endocrinology",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Endocrinology",
    "description": "Thyroid hormones, parathyroid and calcium homeostasis, adrenal cortex, pituitary axes, and reproductive hormones.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-toxicology",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Toxicology",
    "description": "Therapeutic drug monitoring, pharmacokinetics, peak and trough levels, drugs of abuse, and clinical toxicology.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-cc-vitamins",
    "subjectId": "ciulla-clinical-chemistry",
    "name": "Vitamins",
    "description": "Fat-soluble and water-soluble vitamins, biochemical functions, deficiency states, and metabolic assessment.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "2-51",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hema-physiology-of-the-blood",
    "subjectId": "ciulla-hematology",
    "name": "Physiology of the Blood",
    "description": "Hematopoiesis, bone marrow cellularity, stem cell differentiation, and normal erythrocyte and leukocyte kinetics.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "137-171",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hema-erythrocytes-and-anemias",
    "subjectId": "ciulla-hematology",
    "name": "Erythrocytes and Anemias",
    "description": "Erythrocyte morphology, red cell indices, microcytic, macrocytic, normocytic, and hemolytic anemia evaluations.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "137-171",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hema-leukocytes-and-malignancies",
    "subjectId": "ciulla-hematology",
    "name": "Leukocytes and Malignancies",
    "description": "Granulocyte and lymphocyte kinetics, reactive changes, myeloproliferative disorders, myelodysplastic syndromes, and leukemias.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "137-171",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hema-instrumentation-and-methodology",
    "subjectId": "ciulla-hematology",
    "name": "Instrumentation and Methodology",
    "description": "Automated cell counters, electrical impedance, optical scatter, manual differentials, and staining methodologies.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "137-171",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hema-hematology-problem-solving-and-case-studies",
    "subjectId": "ciulla-hematology",
    "name": "Hematology Problem Solving and Case Studies",
    "description": "Integrated hematology case studies, peripheral blood smear correlation, cytochemistry, and diagnostic evaluations.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "137-171",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hemo-normal-hemostasis-and-coagulation-cascade",
    "subjectId": "ciulla-hemostasis",
    "name": "Normal Hemostasis and Coagulation Cascade",
    "description": "Primary hemostasis, platelet adhesion and aggregation, extrinsic, intrinsic, and common coagulation pathways.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "223-235",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hemo-hemostatic-disorders-and-thrombosis",
    "subjectId": "ciulla-hemostasis",
    "name": "Hemostatic Disorders and Thrombosis",
    "description": "Hemophilia A and B, von Willebrand disease, DIC, thrombocytopenia, thrombophilia, and lupus anticoagulants.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "223-235",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-hemo-laboratory-evaluation-and-coagulation-testing",
    "subjectId": "ciulla-hemostasis",
    "name": "Laboratory Evaluation and Coagulation Testing",
    "description": "PT, aPTT, fibrinogen, thrombin time, mixing studies, factor assays, platelet aggregometry, and anticoagulant monitoring.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "223-235",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-imm-immune-system-and-immunoglobulins",
    "subjectId": "ciulla-immunology-and-serology",
    "name": "Immune System and Immunoglobulins",
    "description": "Cellular and humoral immunity, T and B cell development, immunoglobulin structures, and complement pathways.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "248-259",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-imm-antigen-antibody-reactions-and-serological-testing",
    "subjectId": "ciulla-immunology-and-serology",
    "name": "Antigen-Antibody Reactions and Serological Testing",
    "description": "Precipitation, agglutination, ELISA, immunofluorescence, Western blot, and infectious disease serology.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "248-259",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-imm-autoimmune-diseases-and-hypersensitivity",
    "subjectId": "ciulla-immunology-and-serology",
    "name": "Autoimmune Diseases and Hypersensitivity",
    "description": "ANA patterns, systemic lupus erythematosus, rheumatoid arthritis, types I-IV hypersensitivities, and immunodeficiencies.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "248-259",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bb-blood-collection-preservation-and-quality-control",
    "subjectId": "ciulla-immunohematology",
    "name": "Blood Collection, Preservation, and Quality Control",
    "description": "Donor screening, anticoagulant preservatives, component preparation, storage conditions, and quality assurance.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "274-304",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bb-blood-groups-genetics-and-serology",
    "subjectId": "ciulla-immunohematology",
    "name": "Blood Groups, Genetics, and Serology",
    "description": "ABO and Rh genetics, secretor status, Bombay phenotype, Lewis, Kell, Duffy, Kidd systems, and serologic testing.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "274-304",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bb-antibody-identification-and-transfusion-therapy",
    "subjectId": "ciulla-immunohematology",
    "name": "Antibody Identification and Transfusion Therapy",
    "description": "Panel interpretation, unexpected antibodies, enzyme techniques, neutralization, crossmatching, and blood component selection.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "274-304",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bb-hemolytic-disease-and-problem-solving",
    "subjectId": "ciulla-immunohematology",
    "name": "Hemolytic Disease and Problem Solving",
    "description": "HDFN etiology, RhIG dosage, intrauterine transfusion, DAT evaluation, elutions, and transfusion reaction workups.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "274-304",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-specimen-collection-processing-and-staining",
    "subjectId": "ciulla-bacteriology",
    "name": "Specimen Collection, Processing, and Staining",
    "description": "Collection guidelines, media selection, gram staining, acid-fast staining, and primary specimen processing.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-gram-positive-cocci",
    "subjectId": "ciulla-bacteriology",
    "name": "Gram-Positive Cocci",
    "description": "Staphylococcus species, Streptococcus classification, Enterococcus, catalase, coagulase, and hemolysis patterns.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-gram-negative-bacilli-and-cocci",
    "subjectId": "ciulla-bacteriology",
    "name": "Gram-Negative Bacilli and Cocci",
    "description": "Enterobacteriaceae, nonfermenters, Pseudomonas, Neisseria, Moraxella, and biochemical differential pathways.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-fastidious-and-anaerobic-bacteria",
    "subjectId": "ciulla-bacteriology",
    "name": "Fastidious and Anaerobic Bacteria",
    "description": "Haemophilus, Legionella, Bordetella, Clostridium, Bacteroides, anaerobic cultivation, and identification schemes.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-mycobacteria-and-spirochetes",
    "subjectId": "ciulla-bacteriology",
    "name": "Mycobacteria and Spirochetes",
    "description": "Mycobacterium tuberculosis complex, nontuberculous mycobacteria, Treponema, Borrelia, and specialized detection.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-bact-antimicrobial-susceptibility-and-case-studies",
    "subjectId": "ciulla-bacteriology",
    "name": "Antimicrobial Susceptibility and Case Studies",
    "description": "Kirby-Bauer disk diffusion, MIC dilution testing, resistance mechanisms, ESBL, MRSA, and clinical bacteriology cases.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "343-391",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-myco-fungal-physiology-and-taxonomy",
    "subjectId": "ciulla-mycology-and-virology",
    "name": "Fungal Physiology and Taxonomy",
    "description": "Hyphae and spore morphology, asexual and sexual reproduction, fungal stains, and fungal culture media.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "430-435",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-myco-cutaneous-subcutaneous-and-systemic-mycoses",
    "subjectId": "ciulla-mycology-and-virology",
    "name": "Cutaneous, Subcutaneous, and Systemic Mycoses",
    "description": "Dermatophytes, subcutaneous sporotrichosis and chromoblastomycosis, dimorphic systemic pathogens, and opportunists.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "430-435",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-para-protozoa-intestinal-blood-and-tissue",
    "subjectId": "ciulla-parasitology",
    "name": "Protozoa: Intestinal, Blood, and Tissue",
    "description": "Amebae, flagellates, ciliates, coccidia, Plasmodium, Babesia, Trypanosoma, and Leishmania identification.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "444-451",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-para-helminths-and-diagnostic-methods",
    "subjectId": "ciulla-parasitology",
    "name": "Helminths and Diagnostic Methods",
    "description": "Nematodes, cestodes, trematodes, ova and parasite concentration techniques, and permanent stained smears.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "444-451",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-viro-viral-structure-and-taxonomy",
    "subjectId": "ciulla-mycology-and-virology",
    "name": "Viral Structure and Taxonomy",
    "description": "Viral morphology, capsid symmetry, DNA and RNA virus classifications, and viral replication strategies.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "461-466",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-viro-diagnostic-virology-and-serology",
    "subjectId": "ciulla-mycology-and-virology",
    "name": "Diagnostic Virology and Serology",
    "description": "Cell culture, cytopathic effects, rapid antigen tests, viral serology, and clinical viral syndrome evaluation.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "461-466",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-mol-nucleic-acid-principles-and-isolation",
    "subjectId": "ciulla-molecular-diagnostics",
    "name": "Nucleic Acid Principles and Isolation",
    "description": "DNA and RNA structure, extraction methods, spectrophotometric purity, electrophoresis, and hybridization probes.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "475-481",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-mol-molecular-amplification-and-sequencing",
    "subjectId": "ciulla-molecular-diagnostics",
    "name": "Molecular Amplification and Sequencing",
    "description": "PCR design, RT-PCR, real-time PCR, isothermal amplification, DNA sequencing, and clinical laboratory assays.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "475-481",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-aubf-renal-physiology-and-physical-chemical-urinalysis",
    "subjectId": "ciulla-urinalysis-and-body-fluids",
    "name": "Renal Physiology and Physical/Chemical Urinalysis",
    "description": "Renal clearance, dipstick reagent pad principles, specific gravity, protein, glucose, ketones, and bilirubin.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "496-509",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-aubf-microscopic-sediment-and-body-fluids",
    "subjectId": "ciulla-urinalysis-and-body-fluids",
    "name": "Microscopic Sediment and Body Fluids",
    "description": "Cells, casts, crystals, artifacts in urinary sediment, CSF examination, synovial, pleural, peritoneal, and pericardial fluids.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "496-509",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-calc-dilutions-solutions-and-concentration",
    "subjectId": "ciulla-laboratory-calculations",
    "name": "Dilutions, Solutions, and Concentration",
    "description": "Serial dilutions, solute-solvent ratios, molarity, normality, percent solutions, and unit conversions.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "519-526",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-calc-spectrophotometry-beer-s-law-and-enzymology",
    "subjectId": "ciulla-laboratory-calculations",
    "name": "Spectrophotometry, Beer’s Law, and Enzymology",
    "description": "Beer-Lambert law calculations, absorbance to transmittance conversions, molar absorptivity, and enzyme activity units.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "519-526",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-genlab-laboratory-safety-hazards-and-regulations",
    "subjectId": "ciulla-general-laboratory-principles",
    "name": "Laboratory Safety, Hazards, and Regulations",
    "description": "Chemical, biological, and electrical safety, SDS sheets, biosafety levels, fire extinguishers, and OSHA regulations.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "546-556",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-genlab-quality-control-westgard-rules-and-statistics",
    "subjectId": "ciulla-general-laboratory-principles",
    "name": "Quality Control, Westgard Rules, and Statistics",
    "description": "Mean, standard deviation, coefficient of variation, Levey-Jennings charts, Westgard multirules, and reference intervals.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "546-556",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-mgmt-regulatory-standards-and-accreditation",
    "subjectId": "ciulla-laboratory-management",
    "name": "Regulatory Standards and Accreditation",
    "description": "CLIA 88 complexity models, CAP accreditation, JCAHO inspections, proficiency testing, and compliance guidelines.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "571-580",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  },
  {
    "id": "ciulla-mgmt-budgeting-staffing-and-operations",
    "subjectId": "ciulla-laboratory-management",
    "name": "Budgeting, Staffing, and Operations",
    "description": "Operating and capital budgets, cost per test, staffing formulas, productivity metrics, and laboratory informatics.",
    "sourcePdfs": [
      {
        "fileName": "Success in Clinical Laboratory Science-Ciulla.pdf",
        "pageRange": "571-580",
        "kind": "Ciulla Success in Clinical Laboratory Science"
      }
    ],
    "book": "Ciulla"
  }
];

export const ciullaTopicQuestionCounts: Record<string, number> = {
  "ciulla-cc-instrumentation-and-analytical-principles": 76,
  "ciulla-cc-proteins-and-tumor-markers": 40,
  "ciulla-cc-nonprotein-nitrogenous-compounds": 28,
  "ciulla-cc-carbohydrates": 34,
  "ciulla-cc-lipids-and-lipoproteins": 33,
  "ciulla-cc-enzymes-and-cardiac-assessment": 43,
  "ciulla-cc-liver-function-and-porphyrin-formation": 35,
  "ciulla-cc-electrolytes-and-osmolality": 36,
  "ciulla-cc-acid-base-metabolism": 24,
  "ciulla-cc-endocrinology": 45,
  "ciulla-cc-toxicology": 33,
  "ciulla-cc-vitamins": 10,
  "ciulla-hema-physiology-of-the-blood": 45,
  "ciulla-hema-erythrocytes-and-anemias": 90,
  "ciulla-hema-leukocytes-and-malignancies": 95,
  "ciulla-hema-instrumentation-and-methodology": 34,
  "ciulla-hema-hematology-problem-solving-and-case-studies": 34,
  "ciulla-hemo-normal-hemostasis-and-coagulation-cascade": 28,
  "ciulla-hemo-hemostatic-disorders-and-thrombosis": 25,
  "ciulla-hemo-laboratory-evaluation-and-coagulation-testing": 20,
  "ciulla-imm-immune-system-and-immunoglobulins": 31,
  "ciulla-imm-antigen-antibody-reactions-and-serological-testing": 35,
  "ciulla-imm-autoimmune-diseases-and-hypersensitivity": 32,
  "ciulla-bb-blood-collection-preservation-and-quality-control": 33,
  "ciulla-bb-blood-groups-genetics-and-serology": 56,
  "ciulla-bb-antibody-identification-and-transfusion-therapy": 52,
  "ciulla-bb-hemolytic-disease-and-problem-solving": 38,
  "ciulla-bact-specimen-collection-processing-and-staining": 45,
  "ciulla-bact-gram-positive-cocci": 53,
  "ciulla-bact-gram-negative-bacilli-and-cocci": 88,
  "ciulla-bact-fastidious-and-anaerobic-bacteria": 70,
  "ciulla-bact-mycobacteria-and-spirochetes": 50,
  "ciulla-bact-antimicrobial-susceptibility-and-case-studies": 50,
  "ciulla-myco-fungal-physiology-and-taxonomy": 23,
  "ciulla-myco-cutaneous-subcutaneous-and-systemic-mycoses": 12,
  "ciulla-para-protozoa-intestinal-blood-and-tissue": 28,
  "ciulla-para-helminths-and-diagnostic-methods": 30,
  "ciulla-viro-viral-structure-and-taxonomy": 25,
  "ciulla-viro-diagnostic-virology-and-serology": 25,
  "ciulla-mol-nucleic-acid-principles-and-isolation": 25,
  "ciulla-mol-molecular-amplification-and-sequencing": 23,
  "ciulla-aubf-renal-physiology-and-physical-chemical-urinalysis": 34,
  "ciulla-aubf-microscopic-sediment-and-body-fluids": 32,
  "ciulla-calc-dilutions-solutions-and-concentration": 30,
  "ciulla-calc-spectrophotometry-beer-s-law-and-enzymology": 29,
  "ciulla-genlab-laboratory-safety-hazards-and-regulations": 44,
  "ciulla-genlab-quality-control-westgard-rules-and-statistics": 39,
  "ciulla-mgmt-regulatory-standards-and-accreditation": 25,
  "ciulla-mgmt-budgeting-staffing-and-operations": 25
};

export const ciullaSubjectQuestionCounts: Record<string, number> = {
  "ciulla-clinical-chemistry": 437,
  "ciulla-hematology": 298,
  "ciulla-hemostasis": 73,
  "ciulla-immunology-and-serology": 98,
  "ciulla-immunohematology": 179,
  "ciulla-bacteriology": 356,
  "ciulla-mycology-and-virology": 85,
  "ciulla-parasitology": 58,
  "ciulla-molecular-diagnostics": 48,
  "ciulla-urinalysis-and-body-fluids": 66,
  "ciulla-laboratory-calculations": 59,
  "ciulla-general-laboratory-principles": 83,
  "ciulla-laboratory-management": 50
};

export const CIULLA_TOTAL_QUESTIONS = 1890;
