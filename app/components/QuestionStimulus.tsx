import Image from "next/image";
import { reviewerAssetUrl } from "../lib/reviewerAssetPaths";
import type { QuestionStimulus as QuestionStimulusData, ReviewerQuestion } from "../content/reviewerContent";
import styles from "./QuestionStimulus.module.css";
import SourceText from "./SourceText";

type QuestionStimulusProps = {
  stimulus?: QuestionStimulusData;
  allowEnlarge?: boolean;
  inlineTable?: boolean;
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

export default function QuestionStimulus({ stimulus, allowEnlarge = false, inlineTable = false }: QuestionStimulusProps) {
  if (!stimulus) return null;

  if (stimulus.kind === "table") {
    // Choice buttons and answer headings require phrasing content, not a nested native table.
    if (inlineTable) return (
      <span className={styles.inlineTable} role="table" aria-label={stimulus.caption || undefined}>
        {stimulus.caption && <span className={styles.inlineCaption}>{stimulus.caption}</span>}
        {stimulus.columns.length > 0 && <span className={styles.inlineRow} role="row">
          {stimulus.columns.map((column, index) => <span className={styles.inlineCell} role="columnheader" key={index}><SourceText text={column} marks={stimulus.sourceFormatting?.columns?.[index]} /></span>)}
        </span>}
        {stimulus.rows.map((row, rowIndex) => <span className={styles.inlineRow} role="row" key={rowIndex}>
          {row.map((cell, index) => <span className={styles.inlineCell} role="cell" key={index}><SourceText text={cell} marks={stimulus.sourceFormatting?.rows?.[rowIndex]?.[index]} /></span>)}
        </span>)}
      </span>
    );
    return (
      <div className={styles.root}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption>{stimulus.caption}</caption>
            <thead>
              <tr>
                {stimulus.columns.map((column, index) => (
                  <th key={`${index}:${column}`} scope="col"><SourceText text={column} marks={stimulus.sourceFormatting?.columns?.[index]} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stimulus.rows.map((row, rowIndex) => (
                <tr key={`${rowIndex}:${row.join(":")}`}>
                  {row.map((cell, cellIndex) => cellIndex === 0 ? (
                    <th key={`${cellIndex}:${cell}`} scope="row"><SourceText text={cell} marks={stimulus.sourceFormatting?.rows?.[rowIndex]?.[cellIndex]} /></th>
                  ) : (
                    <td key={`${cellIndex}:${cell}`}><SourceText text={cell} marks={stimulus.sourceFormatting?.rows?.[rowIndex]?.[cellIndex]} /></td>
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
        src={reviewerAssetUrl(stimulus.src)}
        unoptimized={reviewerAssetUrl(stimulus.src) !== stimulus.src}
        alt={stimulus.alt}
        width={stimulus.width}
        height={stimulus.height}
        sizes="(max-width: 760px) calc(100vw - 48px), 820px"
      />
      {allowEnlarge && <a className={styles.imageLink} href={reviewerAssetUrl(stimulus.src)} target="_blank" rel="noopener noreferrer">Open full-size reference image</a>}
      {stimulus.caption && <figcaption>{stimulus.caption}</figcaption>}
    </figure>
  );
}
