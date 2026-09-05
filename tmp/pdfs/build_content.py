import json
import re
from pathlib import Path

from pypdf import PdfReader


OUTPUT = Path(__file__).with_name("reviewerContent.json")

SOURCES = {
    "bact_master": Path(r"C:\Users\mypc\Downloads\Bacteriology_Oral_Revalida_Reviewer.pdf"),
    "bact_lab": Path(r"C:\Users\mypc\Downloads\Bacteriology_Oral_Revalida_Reviewer(1).pdf"),
    "hema": Path(r"C:\Users\mypc\Downloads\HEMA1_Oral_Revalida_Master_Reviewer.pdf"),
}

SUBJECTS = [
    {
        "id": "bacteriology",
        "name": "Bacteriology",
        "description": "Laboratory practice, identification, culture, staining, and clinically important bacteria.",
        "topicIds": [
            "bact-foundations",
            "bact-staining",
            "bact-media-ast",
            "bact-gram-positive",
            "bact-gram-negative",
            "bact-special-pathogens",
        ],
    },
    {
        "id": "hematology",
        "name": "Hematology 1",
        "description": "Specimens, erythrocytes, hemoglobin, anemias, leukocytes, and analyzer principles.",
        "topicIds": [
            "hema-quality-specimens",
            "hema-erythropoiesis",
            "hema-rbc-morphology",
            "hema-anemias",
            "hema-leukocytes",
            "hema-automation",
        ],
    },
]

TOPICS = [
    {"id": "bact-foundations", "subjectId": "bacteriology", "name": "Foundations & Laboratory Safety", "description": "Taxonomy, cell structures, growth, biosafety, and core laboratory principles."},
    {"id": "bact-staining", "subjectId": "bacteriology", "name": "Microscopy, Staining & Sterilization", "description": "Gram and acid-fast stains, microscopy, spores, and sterilization methods."},
    {"id": "bact-media-ast", "subjectId": "bacteriology", "name": "Culture Media & Antimicrobial Testing", "description": "Selective and differential media, autoclaving, and Kirby-Bauer testing."},
    {"id": "bact-gram-positive", "subjectId": "bacteriology", "name": "Gram-Positive Bacteria", "description": "Staphylococci, streptococci, enterococci, and important Gram-positive rods."},
    {"id": "bact-gram-negative", "subjectId": "bacteriology", "name": "Gram-Negative Bacteria", "description": "Neisseria, Enterobacteriaceae, nonfermenters, curved rods, and fastidious organisms."},
    {"id": "bact-special-pathogens", "subjectId": "bacteriology", "name": "Mycobacteria & Special Pathogens", "description": "Mycobacteria, spirochetes, zoonotic organisms, and high-yield special pathogens."},
    {"id": "hema-quality-specimens", "subjectId": "hematology", "name": "Quality & Specimen Collection", "description": "Quality assessment, patient identification, phlebotomy, tubes, and preanalytical errors."},
    {"id": "hema-erythropoiesis", "subjectId": "hematology", "name": "Erythropoiesis & Hemoglobin", "description": "Red-cell production, hemoglobin types, oxygen affinity, and dyshemoglobins."},
    {"id": "hema-rbc-morphology", "subjectId": "hematology", "name": "RBC Morphology", "description": "Red-cell shapes, inclusions, smear findings, and morphology principles."},
    {"id": "hema-anemias", "subjectId": "hematology", "name": "Anemias & Hemoglobinopathies", "description": "Iron deficiency, megaloblastic and hemolytic anemia, sickling, and thalassemia."},
    {"id": "hema-leukocytes", "subjectId": "hematology", "name": "Leukocytes & Hematologic Disorders", "description": "White-cell identification, immunity, leukemia, and inherited leukocyte disorders."},
    {"id": "hema-automation", "subjectId": "hematology", "name": "Hematology Automation", "description": "Automated cell-counting principles and analyzer interpretation."},
]


def bact_master_topic(number):
    if number in {1, 4, 7, 8, 9}:
        return "bact-foundations"
    if number in {2, 3, 5, 6, 12}:
        return "bact-staining"
    if number in {10, 11}:
        return "bact-media-ast"
    if 13 <= number <= 20 or number in {31, 32, 35}:
        return "bact-gram-positive"
    if 21 <= number <= 30:
        return "bact-gram-negative"
    return "bact-special-pathogens"


def bact_lab_topic(number):
    if number in {1, 2}:
        return "bact-foundations"
    if 3 <= number <= 7:
        return "bact-staining"
    if 8 <= number <= 11:
        return "bact-media-ast"
    if 12 <= number <= 17:
        return "bact-gram-positive"
    if 18 <= number <= 21 or 24 <= number <= 30:
        return "bact-gram-negative"
    return "bact-special-pathogens"


def hema_topic(number):
    if number <= 7:
        return "hema-quality-specimens"
    if number <= 12:
        return "hema-erythropoiesis"
    if number <= 17:
        return "hema-rbc-morphology"
    if number <= 24:
        return "hema-anemias"
    if number <= 34:
        return "hema-leukocytes"
    return "hema-automation"


def clean_lines(page_text):
    ignored_prefixes = (
        "Bacteriology Oral Revalida Reviewer",
        "Hematology 1 - Oral Revalida Master Reviewer",
        "PART II",
    )
    result = []
    for raw in (page_text or "").splitlines():
        line = " ".join(raw.replace("\x7f", " ").split())
        if not line or re.fullmatch(r"Page \d+", line):
            continue
        if line.startswith(ignored_prefixes):
            continue
        result.append(line)
    return result


def parse_mcqs(source_key, first_page, last_page, subject_id, topic_for, id_prefix):
    reader = PdfReader(str(SOURCES[source_key]))
    questions = []
    current = None

    def finish():
        nonlocal current
        if not current:
            return
        if len(current["choices"]) == 4 and current.get("correctLetter"):
            index = ord(current["correctLetter"]) - ord("A")
            official = " ".join(current.pop("answerParts", [])).strip() or current["choices"][index]
            current["prompt"] = " ".join(current["promptParts"]).strip()
            current.pop("promptParts", None)
            current.pop("correctLetter", None)
            current.pop("activeChoice", None)
            current["correctAnswer"] = index
            current["officialAnswer"] = official
            current["explanation"] = f"Official reviewer answer: {chr(65 + index)}. {current['choices'][index]}"
            questions.append(current)
        current = None

    for page_number in range(first_page, last_page + 1):
        for line in clean_lines(reader.pages[page_number - 1].extract_text()):
            question_match = re.match(r"^(\d+)\.\s+(.+)$", line)
            choice_match = re.match(r"^([A-D])\.\s*(.*)$", line)
            answer_match = re.match(r"^Answer:\s*([A-D])(?:\.\s*(.*))?$", line)

            if answer_match and current:
                current["correctLetter"] = answer_match.group(1)
                current["answerParts"] = [answer_match.group(2) or ""]
                current["activeChoice"] = None
                continue

            if choice_match and current:
                current["choices"].append(choice_match.group(2).strip())
                current["activeChoice"] = len(current["choices"]) - 1
                continue

            if question_match:
                finish()
                number = int(question_match.group(1))
                current = {
                    "id": f"{id_prefix}-{number:03d}",
                    "subjectId": subject_id,
                    "topicId": topic_for(number),
                    "promptParts": [question_match.group(2)],
                    "choices": [],
                    "correctLetter": None,
                    "answerParts": [],
                    "activeChoice": None,
                    "source": {
                        "fileName": SOURCES[source_key].name,
                        "page": page_number,
                        "kind": "Official supplied reviewer",
                    },
                }
                continue

            if not current:
                continue
            if current.get("correctLetter"):
                current["answerParts"].append(line)
            elif current.get("activeChoice") is not None:
                current["choices"][current["activeChoice"]] += f" {line}"
            else:
                current["promptParts"].append(line)

    finish()
    return questions


questions = []
questions.extend(parse_mcqs("bact_master", 5, 10, "bacteriology", bact_master_topic, "bact-master"))
questions.extend(parse_mcqs("bact_lab", 6, 10, "bacteriology", bact_lab_topic, "bact-lab"))
questions.extend(parse_mcqs("hema", 6, 11, "hematology", hema_topic, "hema"))

deduplicated = []
seen = set()
for question in questions:
    key = (question["subjectId"], re.sub(r"\W+", " ", question["prompt"].lower()).strip())
    if key in seen:
        continue
    seen.add(key)
    deduplicated.append(question)

for topic in TOPICS:
    source_pages = {}
    for question in deduplicated:
        if question["topicId"] != topic["id"]:
            continue
        source = question["source"]
        source_pages.setdefault(source["fileName"], []).append(source["page"])
    topic["sourcePdfs"] = [
        {
            "fileName": file_name,
            "pageRange": f"{min(pages)}-{max(pages)}" if min(pages) != max(pages) else str(min(pages)),
            "kind": "Official supplied reviewer",
        }
        for file_name, pages in source_pages.items()
    ]

payload = {
    "subjects": SUBJECTS,
    "topics": TOPICS,
    "questions": deduplicated,
}

OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "subjects": len(SUBJECTS),
    "topics": len(TOPICS),
    "questions": len(deduplicated),
    "bySubject": {
        subject["id"]: sum(1 for q in deduplicated if q["subjectId"] == subject["id"])
        for subject in SUBJECTS
    },
}, indent=2))
