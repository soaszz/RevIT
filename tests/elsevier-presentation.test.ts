import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { ReviewerQuestion } from "../app/content/reviewerContent";
import { toFlashcard } from "../app/lib/flashcards";
import { reviewerAssetUrl } from "../app/lib/reviewerAssetPaths";
import SourceText from "../app/components/SourceText";

const questions: ReviewerQuestion[] = JSON.parse(readFileSync(".private-reviewers/runtime/books/elsevier.json", "utf8")).questions;
const question = (id: string) => questions.find(q => q.id === id)!;
const app = readFileSync("app/RevITApp.tsx", "utf8");
const cards = readFileSync("app/components/Flashcards.tsx", "utf8");
const styles = new Proxy({}, { get: (_, name) => String(name) });

// Execute the actual JSX/components. Only Next Image and CSS-module imports need Node adapters.
function execute(source: string, file: string, scope: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const localRequire = createRequire(resolve(file));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "exports", ...Object.keys(scope), code)((name: string) => name.endsWith(".css") ? { default: styles } : name === "next/image" ? { default: "img" } : localRequire(name), exports, ...Object.values(scope));
  return exports;
}
const media = execute(readFileSync("app/components/QuestionStimulus.tsx", "utf8"), "app/components/QuestionStimulus.tsx");
const choiceTable = execute(readFileSync("app/components/QuestionChoiceTable.tsx", "utf8"), "app/components/QuestionChoiceTable.tsx").default;
function element(source: string, marker: string) {
  const ast = ts.createSourceFile("view.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.getText(ast).includes(marker)) result = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(result, marker); return result;
}
function render(jsx: string, scope: Record<string, unknown>) {
  const view = execute(`export function View() { return (${jsx}); }`, "app/RevITApp.tsx", {
    QuestionStimulus: media.default, QuestionReferences: media.QuestionReferences, QuestionChoiceTable: choiceTable, SourceText, ...scope,
  }).View as () => ReturnType<typeof createElement>;
  return renderToStaticMarkup(createElement(view));
}
function mcq(q: ReviewerQuestion) {
  const start = app.indexOf('{currentQuestion.questionSections ?');
  const end = app.indexOf("{answerRevealed && (", start);
  return render(`<>${app.slice(start, end)}</>`, { currentQuestion: q, currentChoiceOrder: q.choices.map((_, i) => i), selectedChoice: null, answerRevealed: false, setSelectedChoice: () => {} });
}

test("source table notation stays safe and optional in native and choice tables", () => {
  const stimulus = { kind: "table", caption: "", columns: ["A1 cells", "weak D"],
    rows: [["<img>", "1+mf"]], sourceFormatting: {
      columns: [[{ start: 1, end: 2, script: "sub" }]],
      rows: [[[], [{ start: 2, end: 4, script: "sup" }]]],
    } };
  for (const inlineTable of [false, true]) {
    const html = render("<QuestionStimulus stimulus={stimulus} inlineTable={inlineTable} />", { stimulus, inlineTable });
    assert.match(html, /A<sub>1<\/sub> cells/);
    assert.match(html, /1\+<sup>mf<\/sup>/);
    assert.match(html, /&lt;img&gt;/);
    assert.doesNotMatch(html, /<img|dangerouslySetInnerHTML/);
    const plain = render("<QuestionStimulus stimulus={stimulus} inlineTable={inlineTable} />", {
      stimulus: { ...stimulus, sourceFormatting: undefined }, inlineTable,
    });
    assert.doesNotMatch(plain, /<sub|<sup/);
    assert.match(plain, /A1 cells/);
    assert.match(plain, /1\+mf/);
  }
});

test("Clinical Chemistry Q27 renders prose, only the source table, continuation, then normal choices in both modes", () => {
  const q = question("elsevier-ch08-027");
  assert.doesNotMatch(q.prompt, /Random glucose|Fasting glucose|HbA1c|Which of the following/);
  assert.match(q.promptAfterReferences!, /^Which of the following/);
  const card = toFlashcard(q);
  for (const html of [mcq(q), render(element(cards, "reviewerStyles.questionArea"), { currentCard: card, reviewerStyles: styles })]) {
    assert.ok(html.indexOf("A 62-year-old") < html.indexOf("<figure"));
    assert.ok(html.indexOf("</figure>") < html.indexOf("Which of the following"));
    assert.ok(html.indexOf("Which of the following") < html.indexOf("Data represents normal"));
    assert.doesNotMatch(html, /Random glucose/);
    assert.equal((html.match(/<figure/g) ?? []).length, 1);
  }
});

test("ordinary Q48 has no screenshot; broken source wraps join while meaningful hyphens remain", () => {
  const q = question("elsevier-ch08-048");
  assert.match(q.prompt, /alcoholic cirrhosis includes/);
  assert.match(q.choices[1], /elevations/);
  assert.doesNotMatch(mcq(q), /<figure/);
  assert.match(question("elsevier-ch08-049").prompt, /manifests/);
  assert.match(question("elsevier-ch01-036").prompt, /non-selective/);
  assert.match(question("elsevier-ch01-075").explanation, /non-treponemal/);
  for (const id of ["elsevier-ch07-014", "elsevier-ch07-038"]) assert.match(question(id).explanation, /anti-human/);
});

test("rationale prose and source equations render once in source order in MCQ and flashcards", () => {
  const q = question("elsevier-ch11-019");
  for (const html of [render(element(app, 'className="answer-rationale"'), { currentQuestion: q }), render(element(cards, "reviewerStyles.explanationBlock"), { currentCard: toFlashcard(q), reviewerStyles: styles })]) {
    assert.equal((html.match(/<figure/g) ?? []).length, 2);
    assert.equal((html.match(/The formula used/g) ?? []).length, 1);
    assert.equal((html.match(/Where/g) ?? []).length, 1);
    assert.ok(html.indexOf("The formula used") < html.indexOf("<figure"));
    assert.ok(html.indexOf("</figure>") < html.indexOf("Where"));
    assert.ok(html.indexOf("Where") < html.lastIndexOf("<figure"));
  }
  assert.doesNotMatch(element(cards, "reviewerStyles.questionArea"), /rationaleSections|rationaleImages/);
});

test("mock Q31 uses the existing choice-table renderer without a screenshot or duplicate headings", () => {
  const q = question("elsevier-mock-031");
  assert.doesNotMatch(q.prompt, /MCV/);
  for (const html of [mcq(q), render(element(cards, "reviewerStyles.questionArea"), { currentCard: toFlashcard(q), reviewerStyles: styles })]) {
    assert.doesNotMatch(html, /<figure/);
    assert.equal((html.match(/MCV \(fL\)/g) ?? []).length, 1);
    assert.match(html, /<td>67<\/td><td>22<\/td><td>27<\/td>/);
  }
});

test("all 830 records retain official grading, matching and complete flashcard presentation", () => {
  assert.equal(questions.length, 830);
  assert.equal(questions.filter(q => q.matching).length, 5);
  assert.equal(questions.filter(q => q.topicId === "elsevier-mock").length, 100);
  for (const q of questions) {
    const card = toFlashcard(q);
    assert.equal(card.promptAfterReferences, q.promptAfterReferences);
    assert.deepEqual(card.choiceTable, q.choiceTable);
    assert.deepEqual(card.rationaleSections, q.rationaleSections);
    if (!q.matching) assert.equal(q.officialAnswer, q.choices[q.correctAnswer]);
    for (const s of [q.prompt, q.promptAfterReferences ?? "", q.explanation, ...q.choices, ...q.matching?.items ?? []]) assert.doesNotMatch(s, /\p{L}-\s+\p{L}/u, q.id);
  }
  const q = question("elsevier-ch11-030");
  assert.deepEqual(q.choices, ["TP/(TP + FN) × 100%", "TN/(TN + FP) × 100%", "TP/(TP + FP) × 100%", "TP/(TP + FP) × 100%"]);
  assert.match(question("elsevier-ch11-007").prompt, /1\/5/);
  assert.equal((question("elsevier-ch11-007").explanation.match(/1\/5/g) ?? []).length, 2);
});

test("source notation renders in actual MCQ, shuffled answer reveal and both Flashcard faces", () => {
  const q: ReviewerQuestion = {
    id: "source-formatting-fixture", subjectId: "fixture", topicId: "fixture", prompt: "Na+",
    choices: ["First", "Rzr′", "Third", "Fourth"], correctAnswer: 1, officialAnswer: "Rzr′", explanation: "Kpa",
    source: { fileName: "fixture", page: 1, kind: "fixture" },
    sourceFormatting: { prompt: [{ start: 2, end: 3, script: "sup" }],
      choices: [[], [{ start: 1, end: 2, script: "sub" }], [], []],
      explanation: [{ start: 2, end: 3, script: "sup" }] },
  };
  const card = toFlashcard(q);
  const front = render(element(cards, "reviewerStyles.questionArea"), { currentCard: card, reviewerStyles: styles });
  for (const html of [mcq(q), front]) {
    assert.match(html, /Na<sup>\+<\/sup>/);
    assert.match(html, /R<sub>z<\/sub>r′/);
    assert.doesNotMatch(html, /<img|<figure/);
  }
  const answer = render(element(app, 'className="answer-key"'), { currentQuestion: q, currentChoiceOrder: [3, 0, 2, 1] });
  assert.match(answer, /D\. R<sub>z<\/sub>r′/);
  const back = render(element(cards, "reviewerStyles.answerBlock"), { currentCard: card, reviewerStyles: styles });
  assert.match(back, /R<sub>z<\/sub>r′/);
  for (const html of [render(element(app, 'className="answer-rationale"'), { currentQuestion: q }),
    render(element(cards, "reviewerStyles.explanationBlock"), { currentCard: card, reviewerStyles: styles })]) {
    assert.match(html, /Kp<sup>a<\/sup>/);
  }
});

const bocFields = JSON.parse(readFileSync(".private-reviewers/verification/boc-presentation-source-fixture.json", "utf8")).records;
const choiceSource = bocFields["boc-7e-ch06-062"];
const structuredChoiceQuestion: ReviewerQuestion = {
  id: "boc-7e-ch06-062", subjectId: "fixture", topicId: "fixture", prompt: choiceSource.prompt,
  choices: choiceSource.choices, choiceTables: choiceSource.choiceTables, correctAnswer: 2,
  officialAnswer: choiceSource.choices[2], explanation: choiceSource.rationale,
  source: { fileName: "BOC 7th edition.pdf", page: 427, kind: "Source-reviewed presentation fixture" },
};

test("per-choice source tables preserve row/column order without duplicate flattened text in MCQ and Flashcards", () => {
  const q = structuredChoiceQuestion;
  const card = toFlashcard(q);
  assert.deepEqual(card.choiceTables, q.choiceTables);
  assert.deepEqual(card.answerTable, q.choiceTables![2]);
  for (const html of [mcq(q), render(element(cards, "reviewerStyles.questionArea"), { currentCard: card, reviewerStyles: styles })]) {
    assert.equal((html.match(/role="table"/g) ?? []).length, 4);
    let end = -1;
    for (const table of q.choiceTables!) for (const row of table!.rows) {
      const cells = row.map(cell => `<span class="inlineCell" role="cell">${renderToStaticMarkup(createElement("span", null, cell)).slice(6, -7)}</span>`).join("");
      const position = html.indexOf(cells, end + 1);
      assert.ok(position > end, "source row/column order"); end = position;
    }
    assert.equal((html.match(/X factor/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<table|<figure|Answer choices/);
  }
  const reveal = render(element(app, 'className="answer-key"'), { currentQuestion: q, currentChoiceOrder: [3, 0, 2, 1] });
  assert.match(reveal, /C\. <span class="inlineTable"/);
  assert.equal((reveal.match(/X factor/g) ?? []).length, 1);
  const back = render(element(cards, "reviewerStyles.answerBlock"), { currentCard: card, reviewerStyles: styles });
  assert.equal((back.match(/X factor/g) ?? []).length, 1);
  for (const html of [render(element(app, 'className="answer-rationale"'), { currentQuestion: q }),
    render(element(cards, "reviewerStyles.explanationBlock"), { currentCard: card, reviewerStyles: styles })]) assert.match(html, /These are classic Gram stain/);
});

test("structured-choice buttons select original indices and reveal correctness independently of table values", () => {
  const q = structuredChoiceQuestion;
  for (const revealed of [false, true]) {
    let selected: number | null = null;
    const view = execute(`export function View() { return (${element(app, 'className="choice-list"')}); }`, "app/RevITApp.tsx", {
      QuestionStimulus: media.default, SourceText, currentQuestion: q, currentChoiceOrder: [3, 0, 2, 1], selectedChoice: 0,
      answerRevealed: revealed, setSelectedChoice: (index: number) => { selected = index; },
    }).View as () => ReturnType<typeof createElement>;
    const buttons = (view().props as { children: ReturnType<typeof createElement>[] }).children;
    (buttons[2].props as { onClick: () => void }).onClick();
    assert.equal(selected, revealed ? null : 2);
    const html = renderToStaticMarkup(createElement(view));
    assert.equal((html.match(/choice-button selected/g) ?? []).length, 1);
    assert.equal((html.match(/ correct/g) ?? []).length, revealed ? 1 : 0);
    assert.equal((html.match(/ wrong/g) ?? []).length, revealed ? 1 : 0);
    assert.equal(q.correctAnswer, 2);
    assert.equal(q.officialAnswer, q.choices[2]);
  }
});

test("choice tables safely escape source strings and ordinary choices retain simple rendering", () => {
  const table = { kind: "table", caption: "<script>bad</script>", columns: ["<img onerror=bad>"], rows: [["<svg onload=bad>"]] };
  const html = render("<QuestionStimulus stimulus={stimulus} inlineTable />", { stimulus: table });
  assert.doesNotMatch(html, /<script|<img|<svg/);
  assert.match(html, /&lt;svg onload=bad&gt;/);
  const ordinary = { ...structuredChoiceQuestion, choiceTables: undefined, choices: ["First", "Second", "Third", "Fourth"] };
  assert.doesNotMatch(mcq(ordinary), /role="table"|inlineTable/);
  assert.match(mcq(ordinary), /<b class="choice-copy">First<\/b>/);
  assert.equal(toFlashcard(ordinary).answerTable, undefined);
  const mixed = { ...ordinary, choices: ["A. source text", ...ordinary.choices.slice(1)],
    choiceTables: [null, structuredChoiceQuestion.choiceTables![1], null, null], correctAnswer: 0 };
  const mixedFront = render(element(cards, "reviewerStyles.questionArea"), { currentCard: toFlashcard(mixed), reviewerStyles: styles });
  assert.equal((mixedFront.match(/role="table"/g) ?? []).length, 1);
  assert.match(mixedFront, /A\. source text/);
  assert.equal(toFlashcard(mixed).answer, "A. source text");
});
for (const id of ["boc-7e-ch01-238", "boc-7e-ch01-308", "boc-7e-ch04-056"]) {
  test(`${id} preserves interleaved source sections and separate ordinary choices in both modes`, () => {
    const source = bocFields[id];
    const correctAnswer = source.officialLetter.charCodeAt(0) - 97;
    const q: ReviewerQuestion = {
      id, subjectId: "fixture", topicId: "fixture", prompt: source.prompt,
      questionSections: source.questionSections, choices: source.choices, correctAnswer,
      officialAnswer: source.choices[correctAnswer], explanation: source.rationale,
      source: { fileName: "BOC 7th edition.pdf", page: source.questionPdfPage, kind: "Source-reviewed presentation fixture" },
    };
    const card = toFlashcard(q);
    assert.deepEqual(card.questionSections, q.questionSections);
    assert.deepEqual(card.choices, q.choices);
    assert.equal(card.answer, q.choices[correctAnswer]);
    assert.equal(q.choiceTable, undefined);
    const front = render(element(cards, "reviewerStyles.questionArea"), { currentCard: card, reviewerStyles: styles });
    for (const html of [mcq(q), front]) {
      let end = -1;
      for (const section of q.questionSections!) {
        const token = section.kind === "text"
          ? renderToStaticMarkup(createElement("span", null, section.text)).slice(6, -7)
          : section.stimulus.kind === "image"
            ? `src="${reviewerAssetUrl(section.stimulus.src)}"`
            : render("<QuestionStimulus stimulus={stimulus} />", { stimulus: section.stimulus });
        const position = html.indexOf(token);
        assert.ok(position > end, `${id}: source section order`);
        assert.equal(html.indexOf(token, position + token.length), -1, `${id}: duplicate source section`);
        end = position;
      }
      assert.equal((html.match(/<table|<figure/g) ?? []).length, 2);
      assert.doesNotMatch(html, /QuestionChoiceTable|Answer choices/);
      assert.ok(html.indexOf(q.choices[0]) > end);
    }
    assert.equal((mcq(q).match(/class="choice-button/g) ?? []).length, 4);
    assert.equal((front.match(/role="listitem"/g) ?? []).length, 4);
    const answer = render(element(app, 'className="answer-key"'), { currentQuestion: q, currentChoiceOrder: [3, 0, 1, 2] });
    assert.ok(answer.includes(q.choices[correctAnswer]));
  });
}

test("existing-book fallback JSX is unchanged and source records do not opt in", () => {
  const snapshot = JSON.parse(readFileSync("docs/reviewer-compatibility/ordered-sections-fallback.json", "utf8"));
  for (const [name, source, condition] of [["mcq", app, "currentQuestion.questionSections"], ["flashcards", cards, "currentCard.questionSections"]]) {
    const ast = ts.createSourceFile("fallback.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let fallback = "";
    function visit(node: ts.Node) {
      if (ts.isConditionalExpression(node) && node.condition.getText(ast) === condition) fallback = node.whenFalse.getText(ast).slice(2, -3).trim();
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(fallback, name);
    assert.equal(createHash("sha256").update(fallback.replace(/\r\n/g, "\n")).digest("hex"), snapshot.sha256[name]);
  }
  for (const name of ["reviewer", "ciulla", "rodak", "strasinger", "elsevier"]) {
    const bank = JSON.parse(readFileSync(name === "elsevier" ? ".private-reviewers/runtime/books/elsevier.json" : `app/content/${name}Content.json`, "utf8"));
    for (const q of bank.questions) assert.equal(q.questionSections, undefined, q.id);
  }
});
