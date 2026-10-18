import Image from "next/image";
import type { QuestionStimulus as QuestionStimulusData, ReviewerQuestion } from "../content/reviewerContent";
import styles from "./QuestionStimulus.module.css";

type QuestionStimulusProps = {
  stimulus?: QuestionStimulusData;
  allowEnlarge?: boolean;
};

export function QuestionReferences({ question }: { question: ReviewerQuestion }) {
  if (!question.references?.length) return <QuestionStimulus stimulus={question.stimulus} allowEnlarge />;
  return (
    <section aria-label="Question reference material" className={styles.references}>
      {question.references.map((reference, index) => (
        <div key={`${reference.questionId}-${index}`}>
          {reference.verificationStatus === "missing_source" ? (
            <p className={styles.missing} role="note">
              Required reference unavailable: {reference.label}. This question remains incomplete until the original source is verified.
            </p>
          ) : (
            <>
              <QuestionStimulus stimulus={reference.stimulus} allowEnlarge />
              <p className={styles.source}>
                Rodak’s Hematology, 6th ed., Ch. {reference.sourceChapter}, p. {reference.sourcePage}
                {reference.sourcePdfPage !== null ? ` (PDF p. ${reference.sourcePdfPage})` : ""} · {reference.label}
              </p>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

export default function QuestionStimulus({ stimulus, allowEnlarge = false }: QuestionStimulusProps) {
  if (!stimulus) return null;

  if (stimulus.kind === "table") {
    return (
      <div className={styles.root}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption>{stimulus.caption}</caption>
            <thead>
              <tr>
                {stimulus.columns.map((column, index) => (
                  <th key={`${index}:${column}`} scope="col">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stimulus.rows.map((row, rowIndex) => (
                <tr key={`${rowIndex}:${row.join(":")}`}>
                  {row.map((cell, cellIndex) => cellIndex === 0 ? (
                    <th key={`${cellIndex}:${cell}`} scope="row">{cell}</th>
                  ) : (
                    <td key={`${cellIndex}:${cell}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <figure className={`${styles.root} ${styles.figure}`}>
      <Image
        className={styles.image}
        src={stimulus.src}
        alt={stimulus.alt}
        width={stimulus.width}
        height={stimulus.height}
        sizes="(max-width: 760px) calc(100vw - 48px), 820px"
      />
      {allowEnlarge && <a className={styles.imageLink} href={stimulus.src} target="_blank" rel="noopener noreferrer">Open full-size reference image</a>}
      {stimulus.caption && <figcaption>{stimulus.caption}</figcaption>}
    </figure>
  );
}
