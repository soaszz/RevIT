import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import PublicThemeToggle from "./PublicThemeToggle";
import { LEGAL_EFFECTIVE_DATE } from "../lib/legal";

export type LegalSection = {
  title: string;
  content: ReactNode;
};

export default function LegalPage({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="legal-brand" href="/auth" aria-label="RevIT account access">
          <span className="legal-brand-wordmark" aria-hidden="true">
            <Image src="/revit-logo.png" alt="" width={1376} height={768} priority />
          </span>
          <span>Review It Thoroughly.</span>
        </Link>
        <PublicThemeToggle />
      </header>

      <article className="legal-document">
        <div className="legal-title-block">
          <p className="eyebrow">RevIT legal</p>
          <span className="legal-draft-badge">Draft — not legal advice</span>
          <h1>{title}</h1>
          <p>{summary}</p>
          <dl className="legal-meta">
            <div><dt>Effective date</dt><dd>{LEGAL_EFFECTIVE_DATE}</dd></div>
            <div><dt>Status</dt><dd>Draft for professional review</dd></div>
          </dl>
        </div>

        <nav className="legal-index" aria-label={`${title} sections`}>
          <p className="eyebrow">Contents</p>
          <ol>
            {sections.map((section, index) => (
              <li key={section.title}><a href={`#section-${index + 1}`}>{section.title}</a></li>
            ))}
          </ol>
        </nav>

        <div className="legal-sections">
          {sections.map((section, index) => (
            <section id={`section-${index + 1}`} key={section.title}>
              <p className="legal-section-number">{String(index + 1).padStart(2, "0")}</p>
              <div><h2>{section.title}</h2>{section.content}</div>
            </section>
          ))}
        </div>
      </article>

      <footer className="legal-footer">
        <Link href="/auth">Back to account access</Link>
        <div><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link></div>
        <p>© {new Date().getFullYear()} RevIT · Review It Thoroughly.</p>
      </footer>
    </main>
  );
}
