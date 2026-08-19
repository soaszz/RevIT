"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  questionById,
  questions,
  subjectById,
  subjects,
  topicById,
  topics,
} from "./content/reviewerContent";

type View = "overview" | "library" | "progress" | "assistant";

type Attempt = {
  questionId: string;
  topicId: string;
  subjectId: string;
  selectedAnswer: number;
  correct: boolean;
  timestamp: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  grounded?: boolean;
  mode?: "live" | "demo";
  provider?: "OpenAI";
};

type LearnerProfile = {
  name: string;
  photoDataUrl: string;
};

const DEFAULT_PROFILE: LearnerProfile = { name: "Jamie Santos", photoDataUrl: "" };

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "O" },
  { id: "library", label: "Review Library", icon: "R" },
  { id: "progress", label: "Progress", icon: "P" },
  { id: "assistant", label: "MedTech AI", icon: "AI" },
];

const viewCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Your study command center",
    title: "Ready for a focused review?",
    description: "RevIT turns your official reviewers into topic-aware practice and progress.",
  },
  library: {
    eyebrow: "Official reviewer library",
    title: "Build your review session",
    description: "Choose one topic, several topics, or the entire bacteriology and hematology library.",
  },
  progress: {
    eyebrow: "Performance analytics",
    title: "See what is strong—and what needs work",
    description: "Every answer stays attributed to its original subject and topic.",
  },
  assistant: {
    eyebrow: "General study support",
    title: "Ask RevIT AI",
    description: "Use OpenAI for general explanations while official reviewer answers remain the scoring source of truth.",
  },
};

const chatSuggestions = [
  "Why is decolorization the critical step in Gram staining?",
  "Differentiate iron deficiency anemia from anemia of chronic disease.",
  "Compare S. pneumoniae with viridans streptococci.",
];

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function percent(correct: number, total: number) {
  return total ? Math.round((correct / total) * 100) : 0;
}

function toneFor(score: number, attempts: number) {
  if (!attempts) return "unstarted";
  if (score >= 80) return "strong";
  if (score >= 60) return "developing";
  return "focus";
}

export default function RevITApp() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [sessionSize, setSessionSize] = useState("10");
  const [sessionQuestionIds, setSessionQuestionIds] = useState<string[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [profile, setProfile] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileDraft, setProfileDraft] = useState<LearnerProfile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    try {
      const savedAttempts = JSON.parse(localStorage.getItem("revit-attempts-v1") ?? "[]") as Attempt[];
      const savedTopics = JSON.parse(localStorage.getItem("revit-selected-topics-v1") ?? "[]") as string[];
      const savedProfile = JSON.parse(localStorage.getItem("revit-profile-v1") ?? "null") as LearnerProfile | null;
      if (Array.isArray(savedAttempts)) setAttempts(savedAttempts);
      if (Array.isArray(savedTopics)) {
        setSelectedTopicIds(savedTopics.filter((id) => topicById.has(id)));
      }
      if (savedProfile && typeof savedProfile.name === "string" && typeof savedProfile.photoDataUrl === "string") {
        const normalizedProfile = { name: savedProfile.name.trim() || DEFAULT_PROFILE.name, photoDataUrl: savedProfile.photoDataUrl };
        setProfile(normalizedProfile);
        setProfileDraft(normalizedProfile);
      }
    } catch {
      // Invalid local data should not block a study session.
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-attempts-v1", JSON.stringify(attempts));
  }, [attempts, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-selected-topics-v1", JSON.stringify(selectedTopicIds));
  }, [selectedTopicIds, storageReady]);

  useEffect(() => {
    if (storageReady) localStorage.setItem("revit-profile-v1", JSON.stringify(profile));
  }, [profile, storageReady]);

  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedTopicIds.includes(question.topicId)),
    [selectedTopicIds],
  );

  const topicStats = useMemo(() => topics.map((topic) => {
    const topicAttempts = attempts.filter((attempt) => attempt.topicId === topic.id);
    const correct = topicAttempts.filter((attempt) => attempt.correct).length;
    return {
      ...topic,
      attempts: topicAttempts.length,
      correct,
      accuracy: percent(correct, topicAttempts.length),
    };
  }), [attempts]);

  const overallCorrect = attempts.filter((attempt) => attempt.correct).length;
  const overallAccuracy = percent(overallCorrect, attempts.length);
  const practicedTopics = topicStats.filter((topic) => topic.attempts > 0);
  const strongestTopic = [...practicedTopics].sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)[0];
  const weakestTopic = [...practicedTopics].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)[0];
  const currentQuestion = questionById.get(sessionQuestionIds[sessionIndex]);
  const sessionComplete = sessionQuestionIds.length > 0 && sessionIndex >= sessionQuestionIds.length;

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((current) => current.includes(topicId)
      ? current.filter((id) => id !== topicId)
      : [...current, topicId]);
  }

  function selectSubject(subjectId: string) {
    const subjectTopicIds = topics.filter((topic) => topic.subjectId === subjectId).map((topic) => topic.id);
    setSelectedTopicIds((current) => [...new Set([...current, ...subjectTopicIds])]);
  }

  function startSession() {
    if (!selectedQuestions.length) return;
    const limit = sessionSize === "all" ? selectedQuestions.length : Number(sessionSize);
    setSessionQuestionIds(shuffled(selectedQuestions).slice(0, Math.min(limit, selectedQuestions.length)).map((question) => question.id));
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

  function leaveSession() {
    setSessionQuestionIds([]);
    setSessionIndex(0);
    setSessionAttempts([]);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

  function submitAnswer() {
    if (!currentQuestion || selectedChoice === null || answerRevealed) return;
    const attempt: Attempt = {
      questionId: currentQuestion.id,
      topicId: currentQuestion.topicId,
      subjectId: currentQuestion.subjectId,
      selectedAnswer: selectedChoice,
      correct: selectedChoice === currentQuestion.correctAnswer,
      timestamp: new Date().toISOString(),
    };
    setAttempts((current) => [...current, attempt]);
    setSessionAttempts((current) => [...current, attempt]);
    setAnswerRevealed(true);
  }

  function nextQuestion() {
    setSessionIndex((current) => current + 1);
    setSelectedChoice(null);
    setAnswerRevealed(false);
  }

  function openView(view: View) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openProfileEditor() {
    setProfileDraft(profile);
    setProfileError("");
    setProfileOpen(true);
  }

  function chooseProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileError("Choose a PNG, JPG, WebP, or another image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Choose an image smaller than 2 MB so it can be saved on this device.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileDraft((current) => ({ ...current, photoDataUrl: reader.result as string }));
        setProfileError("");
      }
    };
    reader.onerror = () => setProfileError("That image could not be read. Please try another file.");
    reader.readAsDataURL(file);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = profileDraft.name.trim();
    if (!name) {
      setProfileError("Enter a display name.");
      return;
    }
    setProfile({ name, photoDataUrl: profileDraft.photoDataUrl });
    setProfileOpen(false);
  }

  async function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || pending) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanQuestion,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json() as {
        answer?: string;
        citations?: string[];
        grounded?: boolean;
        mode?: "live" | "demo";
        provider?: "OpenAI";
        error?: string;
      };
      if (!response.ok || !data.answer) throw new Error(data.error || "The assistant could not answer right now.");
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer!,
        citations: data.citations,
        grounded: data.grounded,
        mode: data.mode,
        provider: data.provider,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : "The assistant could not answer right now. Please try again.",
      }]);
    } finally {
      setPending(false);
    }
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  const heading = viewCopy[activeView];
  const selectedTopicNames = selectedTopicIds.map((id) => topicById.get(id)?.name).filter(Boolean);
  const profileInitials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R";
  const avatarStyle = profile.photoDataUrl ? { backgroundImage: `url(${JSON.stringify(profile.photoDataUrl)})` } : undefined;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" type="button" onClick={() => openView("overview")}>
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>RevIT</span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={`nav-link ${activeView === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => openView(item.id)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <p>Official library</p>
          <strong>{questions.length} questions</strong>
          <span>Bacteriology + Hematology 1</span>
        </div>
        <button className="profile" type="button" onClick={openProfileEditor} aria-label="Customize learner profile">
          <span className={`avatar ${profile.photoDataUrl ? "has-photo" : ""}`} style={avatarStyle}>{profile.photoDataUrl ? "" : profileInitials}</span>
          <span><strong>{profile.name}</strong><small>Customize name and photo</small></span>
        </button>
      </aside>

      <section className="workspace">
        <header className="mobile-header">
          <button className="brand brand-button" type="button" onClick={() => openView("overview")}><span className="brand-mark">R</span>RevIT</button>
          <div className="mobile-actions"><label><span className="sr-only">Choose page</span><select value={activeView} onChange={(event) => openView(event.target.value as View)}>{navItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className={`avatar mobile-profile ${profile.photoDataUrl ? "has-photo" : ""}`} style={avatarStyle} type="button" onClick={openProfileEditor} aria-label="Customize learner profile">{profile.photoDataUrl ? "" : profileInitials}</button></div>
        </header>

        <div className="page-heading">
          <div>
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <p>{heading.description}</p>
          </div>
          {activeView === "overview" && <button className="primary-button" type="button" onClick={() => openView("library")}>Choose topics</button>}
        </div>

        {activeView === "overview" && (
          <div className="content-grid">
            <div className="dashboard-column">
              <section className="summary-grid" aria-label="Performance summary">
                <article className="metric-card accent-card">
                  <div className="metric-label"><span>Overall mastery</span><small>{attempts.length ? "All attempts" : "Not started"}</small></div>
                  <strong>{attempts.length ? `${overallAccuracy}%` : "—"}</strong>
                  <div className="meter"><span style={{ width: `${overallAccuracy}%` }} /></div>
                  <p>{attempts.length ? `${overallCorrect} of ${attempts.length} answers correct` : "Complete a review to establish your baseline."}</p>
                </article>
                <article className="metric-card">
                  <div className="metric-label"><span>Official questions</span><small>Current library</small></div>
                  <strong>{questions.length}</strong>
                  <p>{subjects.length} subjects across {topics.length} selectable topics</p>
                </article>
                <article className="metric-card">
                  <div className="metric-label"><span>Topics practiced</span><small>On this device</small></div>
                  <strong>{practicedTopics.length}</strong>
                  <p>{attempts.length} total attempts saved locally</p>
                </article>
              </section>

              <section className="focus-card">
                <div className="section-heading">
                  <div><p className="eyebrow">Recommended next</p><h2>{weakestTopic?.name ?? "Start with one focused topic"}</h2></div>
                  <span className="state-pill">{weakestTopic ? `${weakestTopic.accuracy}% accuracy` : "Choose your topics"}</span>
                </div>
                <p>{weakestTopic
                  ? `This is currently your lowest-performing practiced topic across ${weakestTopic.attempts} attempt${weakestTopic.attempts === 1 ? "" : "s"}. A focused session will keep it from being hidden by stronger areas.`
                  : "Select any combination of bacteriology and hematology topics. RevIT will preserve topic attribution even in a mixed review."}</p>
                <div className="focus-actions">
                  <button className="primary-button" type="button" onClick={() => openView("library")}>{weakestTopic ? "Build focused review" : "Open review library"}</button>
                  <button className="text-button" type="button" onClick={() => openView("progress")}>View progress</button>
                </div>
              </section>

              <section className="topic-card">
                <div className="section-heading"><div><p className="eyebrow">Topic performance</p><h2>Your learning map</h2></div><button className="text-button" type="button" onClick={() => openView("progress")}>View all</button></div>
                <div className="topic-list">
                  {topicStats.slice(0, 6).map((topic) => (
                    <div className="topic-row" key={topic.id}>
                      <span>{topic.name}</span>
                      <div className="topic-meter"><i className={toneFor(topic.accuracy, topic.attempts)} style={{ width: `${topic.attempts ? Math.max(topic.accuracy, 4) : 0}%` }} /></div>
                      <strong>{topic.attempts ? `${topic.accuracy}%` : "—"}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="overview-aside">
              <div className="source-summary-card">
                <span className="ai-mark">PDF</span>
                <p className="eyebrow">Supplied sources</p>
                <h2>Three official reviewers mapped</h2>
                <p>Two bacteriology editions and one Hematology 1 master reviewer now power scoring and source references.</p>
                {subjects.map((subject) => (
                  <div className="source-stat" key={subject.id}>
                    <span>{subject.name}</span>
                    <strong>{questions.filter((question) => question.subjectId === subject.id).length} MCQs</strong>
                  </div>
                ))}
              </div>
              <div className="ai-peek-card">
                <span className="ai-mark">AI</span>
                <h2>Ask for a clearer explanation</h2>
                <p>OpenAI study support stays separate from the local official reviewer bank and never changes scoring answers.</p>
                <button className="primary-button" type="button" onClick={() => openView("assistant")}>Open RevIT AI</button>
              </div>
            </aside>
          </div>
        )}

        {activeView === "library" && (
          <div className="library-shell">
            {sessionQuestionIds.length === 0 ? (
              <div className="library-layout">
                <div className="subject-list">
                  {subjects.map((subject) => {
                    const subjectTopics = topics.filter((topic) => topic.subjectId === subject.id);
                    const subjectSelected = subjectTopics.filter((topic) => selectedTopicIds.includes(topic.id)).length;
                    return (
                      <section className="subject-card" key={subject.id}>
                        <div className="subject-heading">
                          <div><p className="eyebrow">{questions.filter((question) => question.subjectId === subject.id).length} official MCQs</p><h2>{subject.name}</h2><p>{subject.description}</p></div>
                          <button className="text-button" type="button" onClick={() => selectSubject(subject.id)}>Select subject</button>
                        </div>
                        <div className="topic-selection-grid">
                          {subjectTopics.map((topic) => {
                            const count = questions.filter((question) => question.topicId === topic.id).length;
                            const selected = selectedTopicIds.includes(topic.id);
                            return (
                              <label className={`topic-select-card ${selected ? "selected" : ""}`} key={topic.id}>
                                <input type="checkbox" checked={selected} onChange={() => toggleTopic(topic.id)} />
                                <span className="topic-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                                <span className="topic-select-copy"><strong>{topic.name}</strong><small>{topic.description}</small><em>{count} questions · {topic.sourcePdfs.length} source PDF{topic.sourcePdfs.length === 1 ? "" : "s"}</em></span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="subject-selection-note">{subjectSelected} of {subjectTopics.length} topics selected</p>
                      </section>
                    );
                  })}
                </div>

                <aside className="selection-panel">
                  <p className="eyebrow">Session setup</p>
                  <h2>{selectedTopicIds.length} topic{selectedTopicIds.length === 1 ? "" : "s"} selected</h2>
                  <p>{selectedQuestions.length} official questions are available from your selection.</p>
                  <div className="selection-controls">
                    <button className="text-button" type="button" onClick={() => setSelectedTopicIds(topics.map((topic) => topic.id))}>Select all</button>
                    <button className="text-button quiet" type="button" onClick={() => setSelectedTopicIds([])}>Clear all</button>
                  </div>
                  <label className="field-label" htmlFor="session-size">Questions this session</label>
                  <select id="session-size" value={sessionSize} onChange={(event) => setSessionSize(event.target.value)}>
                    <option value="10">10 questions</option>
                    <option value="20">20 questions</option>
                    <option value="all">All selected questions</option>
                  </select>
                  <button className="primary-button wide" type="button" onClick={startSession} disabled={!selectedQuestions.length}>Start review</button>
                  {selectedTopicNames.length > 0 && <div className="selected-tags">{selectedTopicNames.map((name) => <span key={name}>{name}</span>)}</div>}
                </aside>
              </div>
            ) : sessionComplete ? (
              <SessionSummary attempts={sessionAttempts} onDone={leaveSession} />
            ) : currentQuestion ? (
              <section className="quiz-card">
                <div className="quiz-topline">
                  <div><span>Question {sessionIndex + 1} of {sessionQuestionIds.length}</span><strong>{topicById.get(currentQuestion.topicId)?.name}</strong></div>
                  <button className="text-button quiet" type="button" onClick={leaveSession}>Exit session</button>
                </div>
                <div className="quiz-progress"><span style={{ width: `${((sessionIndex + 1) / sessionQuestionIds.length) * 100}%` }} /></div>
                <p className="question-source">{subjectById.get(currentQuestion.subjectId)?.name} · Official supplied reviewer</p>
                <h2>{currentQuestion.prompt}</h2>
                <div className="choice-list">
                  {currentQuestion.choices.map((choice, index) => {
                    const isCorrect = answerRevealed && index === currentQuestion.correctAnswer;
                    const isWrong = answerRevealed && index === selectedChoice && index !== currentQuestion.correctAnswer;
                    return (
                      <button
                        type="button"
                        className={`choice-button ${selectedChoice === index ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`}
                        key={choice}
                        onClick={() => !answerRevealed && setSelectedChoice(index)}
                        aria-pressed={selectedChoice === index}
                      >
                        <span>{String.fromCharCode(65 + index)}</span>{choice}
                      </button>
                    );
                  })}
                </div>
                {answerRevealed && (
                  <div className={`answer-panel ${selectedChoice === currentQuestion.correctAnswer ? "correct" : "wrong"}`}>
                    <strong>{selectedChoice === currentQuestion.correctAnswer ? "Correct" : "Review this one"}</strong>
                    <p>{currentQuestion.explanation}</p>
                    <small>Source: {currentQuestion.source.fileName}, page {currentQuestion.source.page}</small>
                  </div>
                )}
                <div className="quiz-actions">
                  {!answerRevealed
                    ? <button className="primary-button" type="button" onClick={submitAnswer} disabled={selectedChoice === null}>Check answer</button>
                    : <button className="primary-button" type="button" onClick={nextQuestion}>{sessionIndex + 1 === sessionQuestionIds.length ? "See results" : "Next question"}</button>}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {activeView === "progress" && (
          <div className="progress-shell">
            <section className="summary-grid progress-summary">
              <article className="metric-card accent-card"><div className="metric-label"><span>Practice accuracy</span><small>All topics</small></div><strong>{attempts.length ? `${overallAccuracy}%` : "—"}</strong><p>{attempts.length ? `${overallCorrect} correct answers` : "No attempts yet"}</p></article>
              <article className="metric-card"><div className="metric-label"><span>Strongest topic</span><small>{strongestTopic?.attempts ?? 0} attempts</small></div><strong className="metric-name">{strongestTopic?.name ?? "Not enough data"}</strong><p>{strongestTopic ? `${strongestTopic.accuracy}% accuracy` : "Complete your first review."}</p></article>
              <article className="metric-card"><div className="metric-label"><span>Needs review</span><small>{weakestTopic?.attempts ?? 0} attempts</small></div><strong className="metric-name">{weakestTopic?.name ?? "Not enough data"}</strong><p>{weakestTopic ? `${weakestTopic.accuracy}% accuracy` : "Topic guidance appears after practice."}</p></article>
            </section>
            <div className="progress-grid">
              {subjects.map((subject) => (
                <section className="analytics-card" key={subject.id}>
                  <div className="section-heading"><div><p className="eyebrow">Per-topic accuracy</p><h2>{subject.name}</h2></div><span className="source-pill">{attempts.filter((attempt) => attempt.subjectId === subject.id).length} attempts</span></div>
                  <div className="analytics-list">
                    {topicStats.filter((topic) => topic.subjectId === subject.id).map((topic) => (
                      <div className="analytics-row" key={topic.id}>
                        <div><strong>{topic.name}</strong><small>{topic.attempts ? `${topic.correct} of ${topic.attempts} correct` : "Not practiced yet"}</small></div>
                        <div className="topic-meter"><i className={toneFor(topic.accuracy, topic.attempts)} style={{ width: `${topic.attempts ? Math.max(topic.accuracy, 4) : 0}%` }} /></div>
                        <span>{topic.attempts ? `${topic.accuracy}%` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {!attempts.length && <div className="empty-progress"><h2>Your progress starts with one answer</h2><p>Choose any topic combination. RevIT will autosave every answer locally and update this page immediately.</p><button className="primary-button" type="button" onClick={() => openView("library")}>Start a review</button></div>}
          </div>
        )}

        {activeView === "assistant" && (
          <div className="assistant-page">
            <section className="context-strip">
              <div><p className="eyebrow">Current library selection</p><strong>{selectedTopicIds.length ? `${selectedTopicIds.length} selected topic${selectedTopicIds.length === 1 ? "" : "s"}` : "No topics selected"}</strong></div>
              <button className="text-button" type="button" onClick={() => openView("library")}>{selectedTopicIds.length ? "Change topics" : "Choose topics"}</button>
            </section>
            <div className="assistant-card assistant-card-wide">
              <div className="assistant-header">
                <div><span className="ai-mark">AI</span><div><h2>RevIT AI</h2><p><i />OpenAI educational support</p></div></div>
                <button type="button" onClick={() => setMessages([])} disabled={pending}>New chat</button>
              </div>
              <div className={`chat-body ${messages.length ? "chat-active" : ""}`} aria-live="polite">
                {messages.length === 0 ? (
                  <>
                    <div className="assistant-intro"><span className="ai-mark large">AI</span><h3>Ask RevIT AI a study question</h3><p>OpenAI can explain study concepts, while the supplied reviewer answers stay local and remain the only scoring source of truth.</p></div>
                    <div className="prompt-chips">{chatSuggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div>
                  </>
                ) : (
                  <div className="chat-log">
                    {messages.map((message) => (
                      <article className={`chat-message ${message.role}`} key={message.id}>
                        <span className="message-role">{message.role === "user" ? "You" : "RevIT AI"}</span>
                        <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
                        {message.role === "assistant" && <div className="answer-meta">{message.mode === "demo" && <span>Demo mode</span>}{message.mode === "live" && <span>{message.grounded ? "Source-backed explanation" : `${message.provider ?? "AI"} explanation — verify with approved references`}</span>}{message.citations?.map((citation) => <span key={citation}>Source: {citation}</span>)}</div>}
                      </article>
                    ))}
                    {pending && <div className="thinking"><i /><i /><i /><span>Reviewing the question</span></div>}
                  </div>
                )}
              </div>
              <form className="chat-form" onSubmit={submitChat}>
                <label className="sr-only" htmlFor="medtech-question">Ask a medtech question</label>
                <textarea id="medtech-question" rows={3} maxLength={4000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(draft); } }} placeholder="Ask about bacteriology, hematology, a test principle, or a reviewer concept…" disabled={pending} />
                <div><span>{draft.length}/4000</span><button type="submit" disabled={!draft.trim() || pending}>{pending ? "Thinking" : "Ask RevIT"}</button></div>
              </form>
              <p className="medical-note">Educational use only. Official supplied answers control reviewer scoring; AI explanations do not replace laboratory policy or clinical judgment.</p>
            </div>
          </div>
        )}

        {profileOpen && (
          <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
            <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
              <div className="profile-modal-heading">
                <div><p className="eyebrow">Local profile</p><h2 id="profile-title">Customize your profile</h2></div>
                <button type="button" onClick={() => setProfileOpen(false)} aria-label="Close profile editor">×</button>
              </div>
              <form onSubmit={saveProfile}>
                <div className="profile-photo-row">
                  <span className={`avatar profile-preview ${profileDraft.photoDataUrl ? "has-photo" : ""}`} style={profileDraft.photoDataUrl ? { backgroundImage: `url(${JSON.stringify(profileDraft.photoDataUrl)})` } : undefined}>
                    {profileDraft.photoDataUrl ? "" : (profileDraft.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "R")}
                  </span>
                  <div>
                    <label className="photo-upload">Choose photo<input type="file" accept="image/*" onChange={chooseProfilePhoto} /></label>
                    {profileDraft.photoDataUrl && <button className="text-button quiet" type="button" onClick={() => setProfileDraft((current) => ({ ...current, photoDataUrl: "" }))}>Remove photo</button>}
                    <small>PNG, JPG, or WebP up to 2 MB</small>
                  </div>
                </div>
                <label className="profile-name-field" htmlFor="profile-name"><span>Display name</span><input id="profile-name" maxLength={40} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                {profileError && <p className="profile-error" role="alert">{profileError}</p>}
                <p className="profile-privacy">Your name and photo are saved only in this browser on this device.</p>
                <div className="profile-modal-actions"><button className="text-button quiet" type="button" onClick={() => setProfileOpen(false)}>Cancel</button><button className="primary-button" type="submit">Save profile</button></div>
              </form>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function SessionSummary({ attempts, onDone }: { attempts: Attempt[]; onDone: () => void }) {
  const correct = attempts.filter((attempt) => attempt.correct).length;
  const topicIds = [...new Set(attempts.map((attempt) => attempt.topicId))];
  return (
    <section className="results-card">
      <span className="result-mark">{percent(correct, attempts.length)}%</span>
      <p className="eyebrow">Review complete</p>
      <h2>{correct} of {attempts.length} correct</h2>
      <p>Your answers are saved locally and have already updated Progress.</p>
      <div className="result-breakdown">
        {topicIds.map((topicId) => {
          const topicAttempts = attempts.filter((attempt) => attempt.topicId === topicId);
          const topicCorrect = topicAttempts.filter((attempt) => attempt.correct).length;
          return <div key={topicId}><span>{topicById.get(topicId)?.name}</span><strong>{topicCorrect}/{topicAttempts.length} · {percent(topicCorrect, topicAttempts.length)}%</strong></div>;
        })}
      </div>
      <button className="primary-button" type="button" onClick={onDone}>Return to topic selection</button>
    </section>
  );
}
