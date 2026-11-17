import assert from "node:assert/strict";
import test from "node:test";
import rodak from "../app/content/rodakContent.json";
import type { ReviewerQuestion } from "../app/content/reviewerContent";

const questions = rodak.questions as ReviewerQuestion[];
const q2 = questions.find((question) => question.id === "rodak-ch17-02");
const q3 = questions.find((question) => question.id === "rodak-ch17-03");

const q2Prompt = "A bone marrow biopsy was performed as part of the cancer staging protocol for a patient with Hodgkin lymphoma. Although no evidence of spread of the tumor was apparent in the bone marrow, other abnormal findings were noted, including a slightly elevated myeloid-to-erythroid ratio. WBC and RBC morphology appeared normal, however. The Prussian blue stain showed abundant stainable iron in the marrow macrophages. The patient’s CBC revealed a hemoglobin of 10.8 g/dL, but RBC indices were within reference intervals. RBC morphology was unremarkable. These findings are consistent with:";
const q2Case = q2Prompt.replace(/ These findings are consistent with:$/, "");

test("Rodak Chapter 17 Questions 2 and 3 remain separate source records", () => {
  assert.equal(questions.length, 491);
  assert.ok(q2);
  assert.ok(q3);
  assert.notEqual(q2.id, q3.id);
  assert.equal((q2 as ReviewerQuestion & { questionNumber?: number }).questionNumber, 2);
  assert.equal((q3 as ReviewerQuestion & { questionNumber?: number }).questionNumber, 3);
  assert.equal(questions.filter((question) => question.id === q2.id).length, 1);
  assert.equal(questions.filter((question) => question.id === q3.id).length, 1);
});

test("Rodak Chapter 17 Question 2 retains its original Hodgkin case and diagnosis choices", () => {
  assert.ok(q2);
  assert.equal(q2.prompt, q2Prompt);
  assert.deepEqual(q2.choices, ["Anemia of chronic inflammation", "Sideroblastic anemia", "Thalassemia", "Iron deficiency anemia"]);
  assert.equal(q2.correctAnswer, 0);
  assert.equal(q2.officialAnswer, "Anemia of chronic inflammation");
  assert.equal(q2.caseStudy, undefined);
  assert.equal(q2.choiceTable, undefined);
});

test("Rodak Chapter 17 Question 3 retains the shared patient context and exact iron-study table", () => {
  assert.ok(q3);
  assert.equal(q3.prompt, "Predict the iron study results for the patient with Hodgkin lymphoma described in question 2.");
  assert.equal(q3.caseStudy, q2Case);
  assert.equal(q3.correctAnswer, 3);
  assert.equal(q3.officialAnswer, "Decreased, Decreased, Normal, Normal");
  assert.deepEqual(q3.choiceTable, {
    columns: ["Serum Iron Level", "TIBC", "% Transferrin Saturation", "Serum Ferritin Level"],
    rows: [
      ["Decreased", "Increased", "Decreased", "Decreased"],
      ["Increased", "Normal", "Increased", "Normal"],
      ["Increased", "Increased", "Normal", "Increased"],
      ["Decreased", "Decreased", "Normal", "Normal"],
    ],
  });
  assert.deepEqual(q3.choices, q3.choiceTable?.rows.map((row) => row.join(", ")));
  assert.doesNotMatch(q3.prompt, /Stage 3|classic iron deficiency|uncomplicated/i);
});