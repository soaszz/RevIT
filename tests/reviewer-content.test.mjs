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

test("study planner extends the existing calendar and supports local exports", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const planner = await readFile(new URL("../app/components/StudyPlanner.tsx", import.meta.url), "utf8");
  const calendar = await readFile(new URL("../app/components/StudyCalendar.tsx", import.meta.url), "utf8");
  const exporter = await readFile(new URL("../app/lib/studyPlanExport.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /label: "Study Planner", icon: "\/icons\/planner\.svg"/);
  assert.match(app, /studyPlansStorageKey\(initialUser\?\.id\)/);
  assert.match(app, /<TodayStudyPlan/);
  assert.match(app, /<StudyCalendar[\s\S]*studyPlans=\{studyPlans\}/);
  assert.match(planner, /Add to RevIT Calendar/);
  assert.match(planner, /Duplicate day/);
  assert.match(planner, /Move up/);
  assert.match(planner, /Mark session completed/);
  assert.match(planner, /Export PDF/);
  assert.match(planner, /Export PNG/);
  assert.match(planner, /Export JPG/);
  assert.match(calendar, /planEventsByDate/);
  assert.match(exporter, /new jsPDF/);
  assert.match(exporter, /canvas\.toDataURL/);
  assert.match(css, /\.planner-shell \{[^}]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.plan-block \{ grid-template-columns: 1fr;/);
});

test("QnA setup stays accessible and the desktop navigation can collapse", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /label: "Home", icon: "\/icons\/home\.svg"/);
  assert.match(app, /label: "QnA", icon: "\/icons\/qna\.svg"/);
  assert.match(app, /src="\/revit-logo\.png"/);
  assert.match(app, /src="\/revit-frog\.png"/);
  assert.doesNotMatch(app, /sidebar-current-view/);
  assert.match(app, /aria-expanded=\{!sidebarCollapsed\}/);
  assert.match(app, /sidebarCollapsed \? "☰" : "«"/);
  assert.match(app, /function openNavigationView[\s\S]*setSidebarCollapsed\(true\)/);
  assert.doesNotMatch(app, /sidebar-toggle-label/);
  assert.match(app, /<option value="30">30 questions<\/option>/);
  assert.match(app, /<option value="40">40 questions<\/option>/);
  assert.match(app, /<option value="50">50 questions<\/option>/);
  assert.match(css, /\.app-shell\.sidebar-collapsed \{ grid-template-columns: 84px/);
  assert.match(css, /\.sidebar-collapsed \.sidebar \.brand-frog/);
  assert.match(css, /\.nav-link \.nav-label \{[^}]*width: auto;[^}]*border: 0;/);
  assert.match(css, /\.sidebar-toggle \{[^}]*width: 36px;[^}]*min-height: 34px;/);
  assert.match(app, /Wrong answers only/);
  assert.match(app, /wrongAnswersOnly/);
  assert.match(app, /function toggleSubject/);
  assert.match(app, /"Unselect subject"/);
  assert.match(app, /function selectAllWrongAnswers/);
  assert.match(app, />All wrong answers<\/button>/);
  assert.match(app, /sessionStrictWrongOnly/);
  assert.match(app, /function beginStrictSession/);
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

test("AI conversations use the existing Supabase user and preserve the Groq request flow", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../app/lib/aiChatService.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/202608270003_ai_chat_history.sql", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /loadAiChats\(createClient\(\), initialUser!/);
  assert.match(app, /await saveAiMessage\(client, persistedChatId, "user", cleanQuestion\)[\s\S]*fetch\("\/api\/chat"/);
  assert.match(app, /await saveAiMessage\(client, persistedChatId, "assistant", data\.answer\)/);
  assert.match(app, /Chat history/);
  assert.match(app, /window\.confirm/);
  assert.match(service, /\.from\("ai_chats"\)/);
  assert.match(service, /\.from\("ai_messages"\)/);
  assert.match(migration, /alter table public\.ai_chats enable row level security/);
  assert.match(migration, /alter table public\.ai_messages enable row level security/);
  assert.match(migration, /ai_chats\.user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /grant (?:select, insert|all)[^;]*ai_messages[^;]*anon/i);
  assert.match(css, /\.assistant-workspace \{ display: grid;/);
  assert.match(css, /\[data-theme="dark"\]/);
});

test("MedTech AI renders Markdown emphasis, tables, and LaTeX formulas", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const markdown = await readFile(new URL("../app/components/AiMarkdown.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /<AiMarkdown content=\{message\.content\}/);
  assert.match(markdown, /remarkPlugins=\{\[remarkGfm, remarkMath\]\}/);
  assert.match(markdown, /rehypeRaw/);
  assert.match(markdown, /rehypeSanitize/);
  assert.match(markdown, /rehypeKatex/);
  assert.match(markdown, /"sub", "sup"/);
  assert.match(markdown, /normalizeAiMarkdown\(content\)/);
  assert.match(layout, /katex\/dist\/katex\.min\.css/);
  assert.match(route, /double dollar signs/);
  assert.match(route, /Never show raw LaTeX commands outside math delimiters/);
  assert.match(route, /never \\\\kappaP_\{Cr\}/);
  assert.match(route, /Every \\\\frac command must have both a numerator and denominator/);
  assert.match(css, /\.markdown-content \.katex-display/);
  assert.match(css, /\.markdown-content strong/);
  assert.match(css, /\.markdown-content em/);
  assert.match(css, /\.markdown-content table \{[\s\S]*min-width: 480px/);
});

test("provides a responsive floating scientific calculator with undo and redo", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const calculator = await readFile(new URL("../app/components/ScientificCalculator.tsx", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/lib/scientificCalculator.ts", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /<ScientificCalculator \/>/);
  assert.match(calculator, /Undo calculator input/);
  assert.match(calculator, /Redo calculator input/);
  assert.match(calculator, /Angle mode/);
  assert.match(calculator, /Insert fraction/);
  assert.match(calculator, /Expression navigation/);
  assert.match(calculator, /Move cursor left/);
  assert.match(calculator, /Move cursor right/);
  assert.match(calculator, /findFractionRange/);
  assert.match(calculator, /window\.addEventListener\("pointermove", move\)/);
  assert.match(calculator, /Reset calculator position/);
  assert.match(calculator, /Resize calculator/);
  assert.match(calculator, /resizeWithKeyboard/);
  assert.match(calculator, /S⇔D/);
  assert.match(calculator, /currentFunction\("sin", "asin"\)/);
  assert.match(calculator, /sqrt\(/);
  assert.doesNotMatch(calculator, /Enter a valid expression/);
  assert.match(engine, /calculateExpression/);
  assert.match(engine, /calculatorExpressionToLatex/);
  assert.doesNotMatch(engine, /\beval\s*\(|new Function/);
  assert.match(css, /\.calculator-fab \{ position: fixed;/);
  assert.match(css, /\.calculator-navigation/);
  assert.match(css, /\.calculator-resize-handle/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.calculator-panel/);
  assert.match(css, /\[data-theme="dark"\] \.calculator-panel/);
});

test("gates startup behind the branded initialization screen", async () => {
  const app = await readFile(new URL("../app/RevITApp.tsx", import.meta.url), "utf8");
  const loader = await readFile(new URL("../app/components/RevITLoadingScreen.tsx", import.meta.url), "utf8");
  const routeLoader = await readFile(new URL("../app/loading.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /const \[isInitializing, setIsInitializing\] = useState\(true\)/);
  assert.match(app, /if \(isInitializing\) return <RevITLoadingScreen \/>/);
  assert.match(app, /const DEFAULT_PROFILE: LearnerProfile = \{ name: "Student"/);
  assert.doesNotMatch(app, /Jamie/);
  assert.match(loader, /<MorphingInfinity/);
  assert.match(loader, /src="\/revit-logo\.png"/);
  assert.match(loader, /src="\/revit-frog\.png"/);
  assert.match(loader, /Preparing your study space\.\.\./);
  assert.match(routeLoader, /<RevITLoadingScreen \/>/);
  assert.match(css, /\.revit-loading-screen \{[^}]*min-height: 100dvh/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.revit-loading-animation/);
});
