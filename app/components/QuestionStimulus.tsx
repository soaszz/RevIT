import Image from "next/image";
import type { QuestionStimulus as QuestionStimulusData } from "../content/reviewerContent";
import styles from "./QuestionStimulus.module.css";

type QuestionStimulusProps = {
  stimulus?: QuestionStimulusData;
};

export default function QuestionStimulus({ stimulus }: QuestionStimulusProps) {
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
      {stimulus.caption && <figcaption>{stimulus.caption}</figcaption>}
    </figure>
  );
}
