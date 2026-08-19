"use client";

import { FormEvent, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  grounded?: boolean;
  mode?: "live" | "demo";
};

const topics = [
  { name: "Cardiovascular", score: 93, tone: "strong" },
  { name: "Respiratory", score: 74, tone: "developing" },
  { name: "Nervous System", score: 58, tone: "focus" },
];

const suggestions = [
  "How does pulse oximetry estimate SpO₂?",
  "Compare ECG lead placements",
  "Explain ventilator pressure modes",
];

export default function MedReviewApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const safetyId = useRef("");

  async function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || pending) return;

    if (!safetyId.current && typeof crypto !== "undefined") {
      safetyId.current = crypto.randomUUID();
    }

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
          safetyId: safetyId.current,
        }),
      });
      const data = await response.json() as {
        answer?: string;
        citations?: string[];
        grounded?: boolean;
        mode?: "live" | "demo";
        error?: string;
      };

      if (!response.ok || !data.answer) {
        throw new Error(data.error || "The assistant could not answer right now.");
      }

      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer!,
        citations: data.citations,
        grounded: data.grounded,
        mode: data.mode,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error
          ? error.message
          : "The assistant could not answer right now. Please try again.",
      }]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MedReview</span>
        </div>
        <nav aria-label="Primary navigation">
          <a className="nav-link active" href="#overview"><span>O</span>Overview</a>
          <a className="nav-link" href="#review"><span>R</span>Review library</a>
          <a className="nav-link" href="#progress"><span>P</span>Progress</a>
          <a className="nav-link" href="#assistant"><span>A</span>MedTech AI</a>
        </nav>
        <div className="sidebar-note">
          <p>Study progress</p>
          <strong>12 day streak</strong>
          <span>Keep your momentum going.</span>
        </div>
        <button className="profile" type="button">
          <span className="avatar">JS</span>
          <span><strong>Jamie Santos</strong><small>Student reviewer</small></span>
        </button>
      </aside>

      <section className="workspace" id="overview">
        <header className="mobile-header">
          <div className="brand"><span className="brand-mark">M</span>MedReview</div>
          <a href="#assistant">Ask AI</a>
        </header>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Wednesday, August 19</p>
            <h1>Ready for a focused review?</h1>
            <p>Your dashboard adapts to what you know and what needs another look.</p>
          </div>
          <button className="primary-button" type="button">Continue reviewing</button>
        </div>

        <div className="content-grid">
          <div className="dashboard-column">
            <section className="summary-grid" aria-label="Performance summary">
              <article className="metric-card accent-card">
                <div className="metric-label"><span>Overall mastery</span><small>All topics</small></div>
                <strong>76%</strong>
                <div className="meter"><span style={{ width: "76%" }} /></div>
                <p>Up 6% from your last session</p>
              </article>
              <article className="metric-card">
                <div className="metric-label"><span>Practice accuracy</span><small>Last 30 days</small></div>
                <strong>82%</strong>
                <p>41 of 50 questions correct</p>
              </article>
              <article className="metric-card">
                <div className="metric-label"><span>Topics reviewed</span><small>This week</small></div>
                <strong>7</strong>
                <p>3 sessions completed</p>
              </article>
            </section>

            <section className="focus-card" id="review">
              <div className="section-heading">
                <div><p className="eyebrow">Recommended next</p><h2>Nervous System</h2></div>
                <span className="state-pill">Needs focus · 58%</span>
              </div>
              <p>You are consistently missing questions about action potentials and synaptic transmission. A short targeted set will help close the gap.</p>
              <div className="focus-actions">
                <button className="primary-button" type="button">Start 10-question review</button>
                <button className="text-button" type="button">View missed concepts</button>
              </div>
            </section>

            <section className="topic-card" id="progress">
              <div className="section-heading"><div><p className="eyebrow">Topic strength</p><h2>Your learning map</h2></div><button className="text-button" type="button">View all</button></div>
              <div className="topic-list">
                {topics.map((topic) => (
                  <div className="topic-row" key={topic.name}>
                    <span>{topic.name}</span>
                    <div className="topic-meter"><i className={topic.tone} style={{ width: `${topic.score}%` }} /></div>
                    <strong>{topic.score}%</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="assistant-card" id="assistant">
            <div className="assistant-header">
              <div><span className="ai-mark">AI</span><div><h2>MedTech AI</h2><p><i />Educational assistant</p></div></div>
              <button type="button" onClick={() => setMessages([])} disabled={pending}>New</button>
            </div>
            <div className={`chat-body ${messages.length ? "chat-active" : ""}`} aria-live="polite">
              {messages.length === 0 ? (
                <>
                  <div className="assistant-intro">
                    <span className="ai-mark large">AI</span>
                    <h3>Ask a medtech question</h3>
                    <p>I can explain devices, diagnostics, lab science, physiology, standards, and concepts from your study library.</p>
                  </div>
                  <div className="prompt-chips">
                    {suggestions.map((suggestion) => (
                      <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="chat-log">
                  {messages.map((message) => (
                    <article className={`chat-message ${message.role}`} key={message.id}>
                      <span className="message-role">{message.role === "user" ? "You" : "MedTech AI"}</span>
                      <p>{message.content}</p>
                      {message.role === "assistant" && (
                        <div className="answer-meta">
                          {message.mode === "demo" && <span>Demo knowledge pack</span>}
                          {message.mode === "live" && <span>{message.grounded ? "Grounded in study library" : "General AI explanation — verify with approved references"}</span>}
                          {message.citations?.map((citation) => <span key={citation}>Source: {citation}</span>)}
                        </div>
                      )}
                    </article>
                  ))}
                  {pending && <div className="thinking"><i /><i /><i /><span>Reviewing the question</span></div>}
                </div>
              )}
            </div>
            <form className="chat-form" onSubmit={submit}>
              <label className="sr-only" htmlFor="medtech-question">Ask a medtech question</label>
              <textarea
                id="medtech-question"
                rows={2}
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(draft);
                  }
                }}
                placeholder="Ask about a device, concept, or topic…"
                disabled={pending}
              />
              <div><span>Educational use only</span><button type="submit" disabled={!draft.trim() || pending}>{pending ? "Working" : "Ask"}</button></div>
            </form>
            <p className="medical-note">Not a substitute for professional medical advice, diagnosis, or treatment.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
