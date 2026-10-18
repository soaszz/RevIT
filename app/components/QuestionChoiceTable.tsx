"use client";

import type { ReviewerQuestion } from "../content/reviewerContent";
import styles from "./QuestionChoiceTable.module.css";

export default function QuestionChoiceTable({ question, selected, revealed, onSelect }: {
  question: ReviewerQuestion;
  selected: number | null;
  revealed: boolean;
  onSelect: (index: number) => void;
}) {
  const table = question.choiceTable;
  if (!table) return null;
  return (
    <div className={styles.scroll} role="group" aria-label="Answer choices">
      <table className={styles.table}>
        <thead><tr><th scope="col">Choice</th>{table.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index} className={revealed && index === question.correctAnswer ? styles.correct : revealed && index === selected ? styles.incorrect : ""}>
              <th scope="row">
                <button type="button" className={styles.select} onClick={() => !revealed && onSelect(index)} aria-pressed={selected === index} aria-label={`${String.fromCharCode(65 + index)}. ${row.join(", ")}`} disabled={revealed}>
                  {String.fromCharCode(65 + index)}
                </button>
              </th>
              {row.map((value, cellIndex) => <td key={cellIndex}>{value}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
