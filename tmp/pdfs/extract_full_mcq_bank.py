import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader


@dataclass(frozen=True)
class Section:
    source: Path
    subject_id: str
    code: str
    title: str
    description: str
    first_page: int
    last_page: int

    @property
    def topic_id(self) -> str:
        return f"{self.subject_id}-{self.code.replace('.', '-')}"


ROOT = Path(r"C:\Users\mypc\Downloads\RevIT MCQs")
CC = ROOT / "Clinical Chemistry.pdf"
HEMA_BACTE = ROOT / "HEMA AND BACTE.pdf"
AUBF = ROOT / "AUBF.pdf"

SECTIONS = [
    Section(CC, "clinical-chemistry", "6.1", "Instrumentation", "Spectrophotometry, analytical instrumentation, calibration, quality control, and laboratory methods.", 1, 26),
    Section(CC, "clinical-chemistry", "6.2", "Blood Gases, pH, and Electrolytes", "Acid-base interpretation, blood gases, electrolytes, osmolality, and related calculations.", 27, 49),
    Section(CC, "clinical-chemistry", "6.3", "Glucose, Hemoglobin, Iron, and Bilirubin", "Carbohydrate testing, hemoglobin derivatives, iron studies, porphyrins, and bilirubin.", 50, 73),
    Section(CC, "clinical-chemistry", "6.4", "Creatinine, Uric Acid, BUN, and Ammonia", "Renal-related analytes, nitrogenous waste products, clearances, and ammonia testing.", 74, 85),
    Section(CC, "clinical-chemistry", "6.5", "Proteins, Electrophoresis, and Lipids", "Plasma proteins, electrophoretic patterns, lipoproteins, apolipoproteins, and lipid testing.", 86, 108),
    Section(CC, "clinical-chemistry", "6.6", "Enzymes and Cardiac Markers", "Enzyme kinetics, organ-associated enzymes, cardiac biomarkers, and laboratory interpretation.", 109, 134),
    Section(CC, "clinical-chemistry", "6.7", "Clinical Endocrinology", "Pituitary, thyroid, adrenal, reproductive, and metabolic endocrine testing.", 135, 151),
    Section(CC, "clinical-chemistry", "6.8", "Toxicology and Therapeutic Drug Monitoring", "Toxicology screens, pharmacokinetics, therapeutic ranges, and drug monitoring.", 152, 165),
    Section(CC, "clinical-chemistry", "6.9", "Tumor Markers", "Tumor-associated analytes, clinical uses, limitations, and interpretation.", 166, 175),
    Section(CC, "clinical-chemistry", "6.10", "Clinical Chemistry Problem-Solving", "Integrated clinical chemistry cases, calculations, quality issues, and result correlation.", 176, 197),
    Section(HEMA_BACTE, "hematology", "1.1", "Basic Hematology Concepts and Laboratory Procedures", "Core hematology calculations, morphology, specimen handling, and laboratory procedures.", 1, 10),
    Section(HEMA_BACTE, "hematology", "1.2", "Normocytic and Normochromic Anemias", "Hemolysis, marrow failure, membrane disorders, and normocytic anemia patterns.", 11, 18),
    Section(HEMA_BACTE, "hematology", "1.3", "Hypochromic and Microcytic Anemias", "Iron deficiency, thalassemia, sideroblastic processes, and microcytic anemia evaluation.", 19, 22),
    Section(HEMA_BACTE, "hematology", "1.4", "Macrocytic and Normochromic Anemias", "Megaloblastic processes, vitamin deficiencies, and macrocytic anemia evaluation.", 23, 25),
    Section(HEMA_BACTE, "hematology", "1.5", "Qualitative and Quantitative White Blood Cell Disorders", "Leukocyte morphology, function, reactive conditions, and inherited disorders.", 26, 29),
    Section(HEMA_BACTE, "hematology", "1.6", "Acute Leukemias", "Acute leukemia classification, morphology, immunophenotyping, cytochemistry, and genetics.", 30, 37),
    Section(HEMA_BACTE, "hematology", "1.7", "Lymphoproliferative and Myeloproliferative Disorders", "Chronic leukemias, lymphomas, plasma-cell disorders, and myeloproliferative neoplasms.", 38, 44),
    Section(HEMA_BACTE, "hematology", "1.8", "Hematology Problem-Solving", "Integrated hematology cases, calculations, morphology, and laboratory result correlation.", 45, 59),
    Section(HEMA_BACTE, "bacteriology", "8.1", "Specimen Collection, Media, and Methods", "Microbiology specimens, culture media, stains, susceptibility testing, and laboratory methods.", 61, 69),
    Section(HEMA_BACTE, "bacteriology", "8.2", "Enterobacteriaceae", "Identification, biochemical reactions, virulence, and clinical significance of Enterobacteriaceae.", 70, 88),
    Section(HEMA_BACTE, "bacteriology", "8.3", "Nonfermentative Bacilli", "Pseudomonas, Acinetobacter, Burkholderia, and other nonfermentative gram-negative bacilli.", 89, 98),
    Section(HEMA_BACTE, "bacteriology", "8.4", "Miscellaneous and Fastidious Gram-Negative Rods", "Fastidious and uncommon gram-negative rods, zoonoses, and curved organisms.", 99, 114),
    Section(HEMA_BACTE, "bacteriology", "8.5", "Gram-Positive and Gram-Negative Cocci", "Staphylococci, streptococci, enterococci, Neisseria, and related cocci.", 115, 132),
    Section(HEMA_BACTE, "bacteriology", "8.6", "Aerobic Gram-Positive Rods, Spirochetes, and Mycoplasmas", "Aerobic gram-positive bacilli, spirochetes, Mycoplasma, and Ureaplasma.", 133, 142),
    Section(HEMA_BACTE, "bacteriology", "8.7", "Anaerobic Bacteria", "Anaerobic specimen handling, identification, clinical syndromes, and susceptibility.", 143, 151),
    Section(HEMA_BACTE, "bacteriology", "8.8", "Mycobacteria", "Mycobacterial culture, staining, identification, susceptibility, and clinical correlation.", 152, 163),
    Section(AUBF, "aubf", "7.1", "Routine Physical and Biochemical Urine Tests", "Renal physiology, urine collection, physical properties, reagent strips, and chemical testing.", 2, 20),
    Section(AUBF, "aubf", "7.2", "Urine Microscopy and Clinical Correlations", "Urinary cells, casts, crystals, organisms, microscopy, and clinical correlations.", 21, 34),
    Section(AUBF, "aubf", "7.3", "Cerebrospinal, Serous, and Synovial Fluids", "CSF, pleural, pericardial, peritoneal, and synovial fluid examination.", 35, 48),
    Section(AUBF, "aubf", "7.4", "Amniotic, Gastrointestinal, and Seminal Fluids", "Amniotic fluid, gastric analysis, fecal testing, and semen examination.", 49, 60),
    Section(AUBF, "aubf", "7.5", "Urinalysis and Body Fluids Problem-Solving", "Integrated urine and body-fluid cases, method evaluation, and result correlation.", 61, 73),
]

SUBJECTS = [
    {
        "id": "clinical-chemistry",
        "name": "Clinical Chemistry",
        "description": "Instrumentation, analytes, organ systems, toxicology, endocrinology, and integrated chemistry cases.",
    },
    {
        "id": "hematology",
        "name": "Hematology",
        "description": "Core procedures, anemias, leukocyte disorders, hematologic malignancies, and problem-solving.",
    },
    {
        "id": "bacteriology",
        "name": "Bacteriology",
        "description": "Specimens, culture and identification, clinically important bacteria, anaerobes, and mycobacteria.",
    },
    {
        "id": "aubf",
        "name": "AUBF",
        "description": "Urinalysis, urine microscopy, body-fluid analysis, and integrated laboratory cases.",
    },
]

TAXONOMY_PREFIXES = ("Chemistry/", "Hematology/", "Microbiology/", "Body fluids/")
QUESTION_RE = re.compile(r"^(\d+)\.(?:\s+(.*))?$")
CHOICE_RE = re.compile(r"^([A-D])\.\s*(.*)$")
ANSWER_RE = re.compile(r"^(\d+)\.\s*([A-D])(?:\s+(.*))?$")
ANSWER_HEADER_RE = re.compile(r"^Answers? to Questions?\s+(\d+)(?:\s*[–—-]\s*(\d+))?", re.I)


def normalized_lines(reader: PdfReader, first_page: int, last_page: int):
    for page_number in range(first_page, last_page + 1):
        text = reader.pages[page_number - 1].extract_text() or ""
        lines = [" ".join(raw.split()).strip() for raw in text.replace("\x00", " ").splitlines()]
        index = 0
        while index < len(lines):
            line = lines[index]
            if re.fullmatch(r"\d+", line) and index + 1 < len(lines) and lines[index + 1].startswith("."):
                line += lines[index + 1]
                index += 1
            if line:
                yield page_number, line
            index += 1


def clean_join(parts):
    text = " ".join(part.strip() for part in parts if part.strip())
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:!?%)\]])", r"\1", text)
    text = re.sub(r"([(\[])\s+", r"\1", text)
    text = text.replace(" × ", " x ")
    for marker in (*TAXONOMY_PREFIXES, "BIBLIOGRAPHY"):
        if marker in text:
            text = text.split(marker, 1)[0].rstrip()
    return text.strip()


def parse_section(section: Section, reader: PdfReader):
    questions = {}
    answers = {}
    diagnostics = []
    current = None
    current_answer = None
    expected_question = 1
    answer_mode = False
    answer_range_end = None
    answer_range_next = None

    def finish_question():
        nonlocal current
        if current is None:
            return
        current["prompt"] = clean_join(current.pop("prompt_parts"))
        current["choices"] = [clean_join(choice) for choice in current["choice_parts"]]
        current.pop("choice_parts")
        current.pop("active_choice")
        current.pop("in_taxonomy")
        number = current.pop("number")
        questions[number] = current
        current = None

    def finish_answer():
        nonlocal current_answer
        if current_answer is None:
            return
        number = current_answer["number"]
        current_answer.pop("printed_number", None)
        current_answer["rationale"] = clean_join(current_answer.pop("parts"))
        answers[number] = current_answer
        current_answer = None

    for page_number, line in normalized_lines(reader, section.first_page, section.last_page):
        header = ANSWER_HEADER_RE.match(line)
        if header:
            finish_question()
            finish_answer()
            answer_mode = True
            answer_range_end = int(header.group(2) or header.group(1))
            answer_range_next = int(header.group(1))
            continue

        question_match = QUESTION_RE.match(line)

        if answer_mode:
            if (
                current_answer is not None
                and answer_range_end is not None
                and current_answer["number"] == answer_range_end
                and len(clean_join(current_answer["parts"])) >= 80
                and (CHOICE_RE.match(line) or line == "BIBLIOGRAPHY")
            ):
                finish_answer()
                answer_mode = False
                answer_range_end = None
                answer_range_next = None
                continue
            if (
                current_answer is not None
                and answer_range_end is not None
                and current_answer["number"] == answer_range_end
                and question_match
                and int(question_match.group(1)) == expected_question
            ):
                finish_answer()
                answer_mode = False
                answer_range_end = None
            else:
                answer_match = ANSWER_RE.match(line)
                if answer_match:
                    printed_number = int(answer_match.group(1))
                    if answer_range_end is not None and answer_range_next is not None and answer_range_next <= answer_range_end:
                        finish_answer()
                        current_answer = {
                            "number": answer_range_next,
                            "letter": answer_match.group(2),
                            "parts": [answer_match.group(3) or ""],
                            "page": page_number,
                            "printed_number": printed_number,
                        }
                        answer_range_next += 1
                        continue
                if current_answer is not None:
                    current_answer["parts"].append(line)
                continue

        if question_match and int(question_match.group(1)) == expected_question:
            finish_question()
            number = int(question_match.group(1))
            current = {
                "number": number,
                "prompt_parts": [question_match.group(2) or ""],
                "choice_parts": [],
                "active_choice": None,
                "in_taxonomy": False,
                "page": page_number,
            }
            expected_question += 1
            continue

        if current is None:
            continue

        choice_match = CHOICE_RE.match(line)
        expected_choice = chr(ord("A") + len(current["choice_parts"]))
        source_label_fix = (
            (section.code, current["number"], len(current["choice_parts"]), choice_match.group(1) if choice_match else "")
            in {("6.10", 39, 0, "B"), ("8.7", 8, 1, "A")}
        )
        if choice_match and len(current["choice_parts"]) < 4 and (choice_match.group(1) == expected_choice or source_label_fix):
            current["choice_parts"].append([choice_match.group(2)])
            current["active_choice"] = len(current["choice_parts"]) - 1
            current["in_taxonomy"] = False
            continue

        if line.startswith(TAXONOMY_PREFIXES):
            current["in_taxonomy"] = True
            continue

        if current["in_taxonomy"]:
            continue
        if current["active_choice"] is None:
            current["prompt_parts"].append(line)
        else:
            current["choice_parts"][current["active_choice"]].append(line)

    finish_question()
    finish_answer()

    parsed = []
    all_numbers = sorted(questions)
    for number in all_numbers:
        question = questions.get(number)
        answer = answers.get(number)
        if not question or not answer:
            diagnostics.append(f"{section.code} #{number}: missing {'question' if not question else 'answer'}")
            continue
        if len(question["choices"]) != 4 or any(not choice for choice in question["choices"]):
            diagnostics.append(f"{section.code} #{number}: invalid choices {question['choices']!r}")
            continue
        correct_index = ord(answer["letter"]) - ord("A")
        if not answer["rationale"]:
            diagnostics.append(f"{section.code} #{number}: rationale is blank")
            continue
        parsed.append({
            "id": f"{section.subject_id}-{section.code.replace('.', '-')}-{number:03d}",
            "subjectId": section.subject_id,
            "topicId": section.topic_id,
            "prompt": question["prompt"],
            "choices": question["choices"],
            "correctAnswer": correct_index,
            "officialAnswer": question["choices"][correct_index],
            "explanation": answer["rationale"],
            "source": {
                "fileName": section.source.name,
                "page": question["page"],
                "kind": "Official supplied MCQ reviewer",
            },
        })

    return parsed, diagnostics, len(questions), len(answers)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    readers = {path: PdfReader(path) for path in {section.source for section in SECTIONS}}
    topics = []
    questions = []
    report = {"sections": [], "diagnostics": []}

    for section in SECTIONS:
        parsed, diagnostics, question_count, answer_count = parse_section(section, readers[section.source])
        questions.extend(parsed)
        report["sections"].append({
            "code": section.code,
            "title": section.title,
            "subject": section.subject_id,
            "questionCandidates": question_count,
            "answerCandidates": answer_count,
            "accepted": len(parsed),
            "diagnostics": len(diagnostics),
        })
        report["diagnostics"].extend(diagnostics)
        topics.append({
            "id": section.topic_id,
            "subjectId": section.subject_id,
            "name": section.title,
            "description": section.description,
            "sourcePdfs": [{
                "fileName": section.source.name,
                "pageRange": f"{section.first_page}-{section.last_page}",
                "kind": "Official supplied MCQ reviewer",
            }],
        })

    ids = [question["id"] for question in questions]
    if len(ids) != len(set(ids)):
        raise RuntimeError("Duplicate question IDs were generated")

    subjects = []
    for subject in SUBJECTS:
        subjects.append({
            **subject,
            "topicIds": [topic["id"] for topic in topics if topic["subjectId"] == subject["id"]],
        })

    payload = {"subjects": subjects, "topics": topics, "questions": questions}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report["summary"] = {
        "subjects": len(subjects),
        "topics": len(topics),
        "questions": len(questions),
        "bySubject": {
            subject["id"]: sum(question["subjectId"] == subject["id"] for question in questions)
            for subject in subjects
        },
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
