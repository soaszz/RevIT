import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'revit files/RevIT MCQs/CIULLA/Success in Clinical Laboratory Science-Ciulla.pdf';
const jsonPath = 'app/content/ciullaContent.json';

const data = new Uint8Array(fs.readFileSync(pdfPath));
const doc = await pdfjsLib.getDocument({ data }).promise;

function extractColumnLines(items) {
  const content = items.filter(i => {
    const s = i.str.trim();
    if (!s) return false;
    if (i.y > 640 && (s.includes('REVIEW') || s.includes('CHAPTER') || s.includes('ANSWERS') || s.includes('•') || /^\d+$/.test(s))) return false;
    if (i.y < 30 && /^\d+$/.test(s)) return false;
    if (i.y > 600 && i.x > 500 && /^\d+$/.test(s)) return false;
    return true;
  });

  const col1 = content.filter(it => it.x < 270).sort((a, b) => b.y - a.y);
  const col2 = content.filter(it => it.x >= 270).sort((a, b) => b.y - a.y);
  return col1.concat(col2);
}

function cleanHyphens(text) {
  if (!text) return '';
  return text.replace(/([A-Za-z]+)-\s+([A-Za-z]+)/g, (m, p1, p2) => p1 + p2);
}

function cleanMedicalText(text) {
  if (!text) return '';
  return cleanHyphens(text)
    .replace(/\bCojjnebacterium\b/g, 'Corynebacterium')
    .replace(/\banthmcis\b/g, 'anthracis')
    .replace(/\bAnthmcis\b/g, 'Anthracis')
    .replace(/\bagalaciae\b/g, 'agalactiae')
    .replace(/\bimrnuno-?\s*compromised\b/gi, 'immunocompromised')
    .replace(/\bimrnunofluorescence\b/gi, 'immunofluorescence')
    .replace(/\bimrnuno\b/gi, 'immuno')
    .replace(/\bcompli-\s*cation\b/gi, 'complication')
    .replace(/\bcharacter-\s*istic\b/gi, 'characteristic')
    .replace(/\bcharacteris-\s*tic\b/gi, 'characteristic')
    .replace(/\bpros-\s*thetic\b/gi, 'prosthetic')
    .replace(/\bcontami-\s*nant\b/gi, 'contaminant')
    .replace(/\bcom-\s*promised\b/gi, 'compromised')
    .replace(/\bendocardi-\s*tis\b/gi, 'endocarditis')
    .replace(/\bcuta-\s*neous\b/gi, 'cutaneous')
    .replace(/\bkid-\s*ney\b/gi, 'kidney')
    .replace(/\bVibrio cholerae Ol\b/g, 'Vibrio cholerae O1')
    .replace(/\bOl\b(?=\s+is|\s+strain|\s+serogroup|\s+and)/g, 'O1')
    .replace(/\s+/g, ' ')
    .trim();
}

const chapters = [
  { id: 'ciulla-clinical-chemistry', prefix: 'ciulla-cc', qStart: 2, qEnd: 51, aStart: 52, aEnd: 135 },
  { id: 'ciulla-hematology', prefix: 'ciulla-hema', qStart: 137, qEnd: 171, aStart: 172, aEnd: 221 },
  { id: 'ciulla-hemostasis', prefix: 'ciulla-hemo', qStart: 223, qEnd: 235, aStart: 236, aEnd: 246 },
  { id: 'ciulla-immunology-and-serology', prefix: 'ciulla-imm', qStart: 248, qEnd: 259, aStart: 260, aEnd: 272 },
  { id: 'ciulla-immunohematology', prefix: 'ciulla-bb', qStart: 274, qEnd: 304, aStart: 305, aEnd: 341 },
  { id: 'ciulla-bacteriology', prefix: 'ciulla-bact', qStart: 343, qEnd: 381, aStart: 382, aEnd: 428 },
  { id: 'ciulla-mycology', prefix: 'ciulla-myco', qStart: 430, qEnd: 435, aStart: 436, aEnd: 442 },
  { id: 'ciulla-parasitology', prefix: 'ciulla-para', qStart: 444, qEnd: 451, aStart: 452, aEnd: 459 },
  { id: 'ciulla-virology', prefix: 'ciulla-viro', qStart: 461, qEnd: 466, aStart: 467, aEnd: 473 },
  { id: 'ciulla-molecular-diagnostics', prefix: 'ciulla-mol', qStart: 475, qEnd: 481, aStart: 482, aEnd: 494 },
  { id: 'ciulla-urinalysis-and-body-fluids', prefix: 'ciulla-aubf', qStart: 496, qEnd: 505, aStart: 506, aEnd: 517 },
  { id: 'ciulla-laboratory-calculations', prefix: 'ciulla-calc', qStart: 519, qEnd: 526, aStart: 527, aEnd: 544 },
  { id: 'ciulla-general-laboratory-principles', prefix: 'ciulla-genlab', qStart: 546, qEnd: 556, aStart: 557, aEnd: 569 },
  { id: 'ciulla-laboratory-management', prefix: 'ciulla-mgmt', qStart: 571, qEnd: 576, aStart: 577, aEnd: 586 }
];

async function extractAnswerMap(ch) {
  let ansText = '';
  for (let p = ch.aStart; p <= ch.aEnd; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.map(i => ({ str: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));
    ansText += extractColumnLines(items).map(i => i.str).join(' ') + '\n';
  }

  // Pre-normalize common OCR anomalies on question numbers
  ansText = ansText
    .replace(/(?:^|\s)L\.\s+/g, ' 1. ')
    .replace(/(?:^|\s)L\s+(?=[A-D]\.)/g, ' 1. ')
    .replace(/(?:^|\s)n\.\s+/g, ' 11. ')
    .replace(/(?:^|\s)5L\.\s+/g, ' 51. ')
    .replace(/(?:^|\s)5L\s+(?=[A-D]\.)/g, ' 51. ');

  if (ch.id === 'ciulla-clinical-chemistry') {
    ansText = ansText.replace('rationales C. A photomultiplier tube', '3. C. A photomultiplier tube');
  }

  // Find all answer blocks with explicit numbers
  const explicitRegex = /(?:^|\s)(\d{1,3})\.\s+([A-D])\.\s+/g;
  let m;
  const ansMap = new Map();
  const explicitEntries = [];
  while ((m = explicitRegex.exec(ansText)) !== null) {
    const num = parseInt(m[1]);
    explicitEntries.push({ num, letter: m[2], start: m.index, matchLen: m[0].length });
  }

  // Sort explicit entries by appearance index
  explicitEntries.sort((a, b) => a.start - b.start);

  for (let i = 0; i < explicitEntries.length; i++) {
    const curr = explicitEntries[i];
    const nextStart = explicitEntries[i + 1] ? explicitEntries[i + 1].start : ansText.length;
    const blockText = ansText.slice(curr.start, nextStart);

    // Store current explicit entry
    if (!ansMap.has(curr.num)) {
      ansMap.set(curr.num, { letter: curr.letter, rationale: '' });
    }

    // Check if an unnumbered answer [A-D]. is tucked inside this block for curr.num + 1
    const unnumberedRegex = /(?:^|\s)([A-D])\.\s+(?=[A-Z])/g;
    // Skip the first match because it belongs to curr
    unnumberedRegex.lastIndex = curr.matchLen;
    const unnumMatch = unnumberedRegex.exec(blockText);

    if (unnumMatch && !ansMap.has(curr.num + 1)) {
      const midPoint = unnumMatch.index;
      const rationaleCurr = blockText.slice(curr.matchLen, midPoint);
      const rationaleNext = blockText.slice(midPoint + unnumMatch[0].length);

      ansMap.get(curr.num).rationale = cleanMedicalText(rationaleCurr);
      ansMap.set(curr.num + 1, {
        letter: unnumMatch[1],
        rationale: cleanMedicalText(rationaleNext)
      });
    } else {
      const rationaleCurr = blockText.slice(curr.matchLen);
      ansMap.get(curr.num).rationale = cleanMedicalText(rationaleCurr);
    }
  }

  return ansMap;
}

const c = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

let totalCorrectedAnswers = 0;
let totalUpdatedRationales = 0;

for (const ch of chapters) {
  process.stdout.write('Extracting ' + ch.id + '... ');
  const ansMap = await extractAnswerMap(ch);
  const chQs = c.questions.filter(q => q.subjectId === ch.id);
  let chAnsFixed = 0;
  let chExpFixed = 0;

  for (const q of chQs) {
    const qNumMatch = q.id.match(/\d+$/);
    if (!qNumMatch) continue;
    const qNum = parseInt(qNumMatch[0]);
    const ansEntry = ansMap.get(qNum);

    if (ansEntry) {
      const targetIdx = ansEntry.letter.charCodeAt(0) - 65; // A->0, B->1, C->2, D->3
      // Fix correctAnswer index and officialAnswer
      if (q.choices && q.choices[targetIdx]) {
        if (q.correctAnswer !== targetIdx || q.officialAnswer !== q.choices[targetIdx]) {
          q.correctAnswer = targetIdx;
          q.officialAnswer = q.choices[targetIdx];
          chAnsFixed++;
          totalCorrectedAnswers++;
        }
      }

      // Update rationale if valid from PDF
      if (ansEntry.rationale && ansEntry.rationale.length > 25) {
        if (q.explanation !== ansEntry.rationale) {
          q.explanation = ansEntry.rationale;
          chExpFixed++;
          totalUpdatedRationales++;
        }
      }
    }

    // Clean text fields on question
    q.prompt = cleanMedicalText(q.prompt);
    q.choices = q.choices.map(ch => cleanMedicalText(ch));
    q.explanation = cleanMedicalText(q.explanation);
    if (q.choices[q.correctAnswer]) {
      q.officialAnswer = q.choices[q.correctAnswer];
    }
  }

  process.stdout.write('Fixed ' + chAnsFixed + ' answers, ' + chExpFixed + ' rationales\n');
}

// Fix known specific edge cases identified during audit
const qBact94 = c.questions.find(x => x.id === 'ciulla-bact-94');
if (qBact94) {
  qBact94.choices = ['E. coli', 'Haemophilus influenzae', 'Pseudomonas aeruginosa', 'Neisseria gonorrhoeae'];
  qBact94.correctAnswer = 3;
  qBact94.officialAnswer = 'Neisseria gonorrhoeae';
}

const qBact101 = c.questions.find(x => x.id === 'ciulla-bact-101');
if (qBact101) {
  qBact101.choices = ['E. coli O157:H7', 'Salmonella Typhi', 'Vibrio cholerae O1', 'Yersinia enterocolitica'];
  qBact101.correctAnswer = 0;
  qBact101.officialAnswer = 'E. coli O157:H7';
}

const qBact143 = c.questions.find(x => x.id === 'ciulla-bact-143');
if (qBact143) {
  qBact143.choices = ['E. aerogenes', 'E. cloacae', 'E. sakazakii', 'E. taylorae'];
  qBact143.correctAnswer = 2;
  qBact143.officialAnswer = 'E. sakazakii';
}

const qAubf33 = c.questions.find(x => x.id === 'ciulla-aubf-33');
if (qAubf33) {
  qAubf33.choices = ['25', '50', '65', '100'];
  qAubf33.correctAnswer = 2;
  qAubf33.officialAnswer = '65';
}

const qCalc15 = c.questions.find(x => x.id === 'ciulla-calc-15');
if (qCalc15) {
  qCalc15.choices = ['1', '2', '4', '8'];
  qCalc15.correctAnswer = 3;
  qCalc15.officialAnswer = '8';
}

const qMol48 = c.questions.find(x => x.id === 'ciulla-mol-48');
if (qMol48) {
  qMol48.officialAnswer = 'Patient 3';
}

// Final check across all questions
for (const q of c.questions) {
  q.prompt = cleanMedicalText(q.prompt);
  q.choices = q.choices.map(ch => cleanMedicalText(ch));
  q.explanation = cleanMedicalText(q.explanation);
  if (q.choices[q.correctAnswer]) {
    q.officialAnswer = q.choices[q.correctAnswer];
  }
}

// Backup existing ciullaContent.json before writing
fs.copyFileSync(jsonPath, jsonPath + '.bak');
fs.writeFileSync(jsonPath, JSON.stringify(c, null, 2), 'utf8');

console.log('\n--- SUCCESS ---');
console.log('Total answers corrected:', totalCorrectedAnswers);
console.log('Total rationales updated/restored:', totalUpdatedRationales);
