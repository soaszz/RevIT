import assert from "node:assert/strict";
import test from "node:test";
import { reviewTimerProgress, reviewTimerVisualState } from "../app/lib/reviewTimer";

test("review timer urgency states preserve a calm final-quarter transition", () => {
  assert.equal(reviewTimerVisualState(60, 60), "normal");
  assert.equal(reviewTimerVisualState(16, 60), "normal");
  assert.equal(reviewTimerVisualState(15, 60), "approaching");
  assert.equal(reviewTimerVisualState(6, 30), "approaching");
  assert.equal(reviewTimerVisualState(5, 30), "critical");
  assert.equal(reviewTimerVisualState(0, 30), "critical");
});

test("review timer progress clamps safely between empty and full", () => {
  assert.equal(reviewTimerProgress(60_000, 60), 1);
  assert.equal(reviewTimerProgress(30_000, 60), 0.5);
  assert.equal(reviewTimerProgress(0, 30), 0);
  assert.equal(reviewTimerProgress(-1, 30), 0);
  assert.equal(reviewTimerProgress(31_000, 30), 1);
});
