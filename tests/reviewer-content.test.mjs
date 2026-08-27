import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the validated four-subject MCQ library with keyed rationales", async () => {
  const raw = await readFile(new URL("../app/content/reviewerContent.json", import.meta.url), "utf8");
  const content = JSON.parse(raw);
  const topicIds = new Set(content.topics.map((topic) => topic.id));
  const ids = new Set(content.questions.map((question) => question.id));
  const bySubject = Object.groupBy(content.questions, (question) => question.subjectId);

  assert.equal(content.subjects.length, 4);
  assert.equal(content.topics.length, 31);
  assert.equal(content.questions.length, 1244);
  assert.equal(bySubject["clinical-chemistry"].length, 570);
  assert.equal(bySubject.hematology.length, 166);
  assert.equal(bySubject.bacteriology.length, 298);
  assert.equal(bySubject.aubf.length, 210);
  assert.equal(ids.size, content.questions.length);

  for (const question of content.questions) {
    assert.equal(question.choices.length, 4);
    assert.ok(Number.isInteger(question.correctAnswer));
    assert.ok(question.correctAnswer >= 0 && question.correctAnswer < 4);
    assert.equal(question.officialAnswer, question.choices[question.correctAnswer]);
    assert.ok(question.explanation.trim().length > 0);
    assert.ok(topicIds.has(question.topicId));
    assert.match(question.source.fileName, /\.pdf$/i);
    assert.ok(question.source.page > 0);
    assert.doesNotMatch(`${question.prompt}\n${question.choices.join("\n")}\n${question.explanation}`, /BIBLIOGRAPHY|(?:Chemistry|Hematology|Microbiology|Body fluids)\//);
  }
});

test("randomizes displayed choices per review session and labels the PDF rationale", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");

  assert.match(app, /sessionChoiceOrders/);
  assert.match(app, /shuffled\(\[0, 1, 2, 3\]\)/);
  assert.match(app, /Correct answer:/);
  assert.match(app, />Rationale</);
  assert.match(app, /chooseAdaptiveQuestion/);
  assert.match(app, /We’ll bring this concept back later/);
});

test("passes Turnstile tokens to protected Supabase auth operations", async () => {
  const auth = await readFile(new URL("../app/auth/AuthPanel.tsx", import.meta.url), "utf8");
  const forgot = await readFile(new URL("../app/auth/forgot/ForgotPanel.tsx", import.meta.url), "utf8");
  const widget = await readFile(new URL("../app/components/auth/TurnstileChallenge.tsx", import.meta.url), "utf8");

  assert.match(auth, /signUp\([\s\S]*captchaToken:/);
  assert.match(auth, /signInWithPassword\([\s\S]*captchaToken:/);
  assert.match(auth, /data:\s*\{ username: cleanUsername \}/);
  assert.match(forgot, /resetPasswordForEmail\([\s\S]*captchaToken/);
  assert.match(widget, /onExpire=\{\(\) => onTokenChange\(null\)\}/);
  assert.match(widget, /documentElement\.dataset\.theme/);
  assert.doesNotMatch(`${auth}\n${forgot}\n${widget}`, /TURNSTILE_SECRET|VITE_TURNSTILE_SECRET_KEY/);
});

test("hides two-factor setup from account settings without weakening existing sign-in checks", async () => {
  const auth = await readFile(new URL("../app/auth/AuthPanel.tsx", import.meta.url), "utf8");
  const account = await readFile(new URL("../app/components/AccountSettings.tsx", import.meta.url), "utf8");
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(account, /auth\.mfa|two-factor|authenticator|totp/i);
  assert.match(auth, /auth\.mfa\.getAuthenticatorAssuranceLevel/);
  assert.match(home, /\/auth\/mfa/);
});

test("calendar uses bounded cells and tablet-first full-width breakpoints", async () => {
  const calendar = await readFile(new URL("../app/components/StudyCalendar.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(calendar, /className="calendar-main"/);
  assert.match(css, /@media \(max-width: 1240px\)[\s\S]*\.content-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.calendar-day \{[^}]*min-width: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.calendar-day\.selected \{[^}]*inset/);
});

test("QnA setup stays accessible and the desktop navigation can collapse", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /label: "Home", icon: "\/icons\/home\.svg"/);
  assert.match(app, /label: "QnA", icon: "\/icons\/qna\.svg"/);
  assert.match(app, /src="\/revit-logo\.png"/);
  assert.doesNotMatch(app, /sidebar-current-view/);
  assert.match(app, /aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(app, /sidebarCollapsed \? "☰" : "«"/);
  assert.match(app, /function openNavigationView[\s\S]*setSidebarCollapsed\(true\)/);
  assert.doesNotMatch(app, /sidebar-toggle-label/);
  assert.match(app, /<option value="30">30 questions<\/option>/);
  assert.match(app, /<option value="40">40 questions<\/option>/);
  assert.match(app, /<option value="50">50 questions<\/option>/);
  assert.match(css, /\.app-shell\.sidebar-collapsed \{ grid-template-columns: 84px/);
  assert.match(css, /\.nav-link \.nav-label \{[^}]*width: auto;[^}]*border: 0;/);
  assert.match(css, /\.sidebar-toggle \{[^}]*width: 36px;[^}]*min-height: 34px;/);
  assert.match(app, /Wrong answers only/);
  assert.match(app, /wrongAnswersOnly/);
  assert.match(app, /function toggleSubject/);
  assert.match(app, /"Unselect subject"/);
  assert.match(app, /function selectAllWrongAnswers/);
  assert.match(app, />All wrong answers<\/button>/);
  assert.match(app, /sessionStrictWrongOnly/);
  assert.match(app, /const strictQuestionIds = shuffled\(poolIds\)\.slice\(0, targetCount\)/);
  assert.match(app, /latestAttempts\.values\(\)/);
  assert.doesNotMatch(app, /Official supplied reviewer/);
  assert.match(css, /\.selection-panel \{[^}]*position: sticky;[^}]*max-height: calc\(100vh - 48px\);/);
});

test("gradebook groups all subjects under assessment categories without number spinners", async () => {
  const grades = await readFile(new URL("../app/components/GradesPage.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(grades, /GRADE_FIELDS\.map/);
  assert.match(grades, /SUBJECTS\.map/);
  assert.match(grades, /Pre-Tests/);
  assert.match(grades, /Post-Tests/);
  assert.match(grades, /Oral Revalida/);
  assert.match(grades, /Written Revalida/);
  assert.match(grades, /Comprehensive Exam/);
  assert.match(grades, /SUBJECT_LABELS/);
  assert.match(grades, /Percentage/);
  assert.match(grades, /Save all grades/);
  assert.doesNotMatch(css, /\.grade-save-bar\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /grade-score-input::-webkit-inner-spin-button/);
  assert.match(css, /appearance:\s*none/);
});

test("uses RevIT and Groq branding while keeping the MedTech AI tab", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");

  assert.match(layout, /RevIT \| Medical Technology Review/i);
  assert.match(layout, /data-theme="light"/i);
  assert.match(layout, /revit-theme/i);
  assert.match(app, /Ask RevIT AI/i);
  assert.match(app, /label: "MedTech AI"/i);
  assert.match(app, /Toggle light and dark mode/i);
  assert.match(route, /from "groq-sdk"/i);
  assert.match(route, /GROQ_API_KEY/i);
  assert.match(route, /GROQ_MODEL/i);
  assert.doesNotMatch(`${layout}\n${app}\n${route}`, /MedReview|Gemini|api\.openai\.com/i);
});
