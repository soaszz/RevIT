import { QUESTION_BANKS, isQuestionBankPublished } from "../lib/entitlements";
import styles from "./ReviewerLoadingState.module.css";

export default function ReviewerLoadingState({ error, onRetry }: { error?: string; onRetry: () => void }) {
  return <section className={styles.state} role={error ? "alert" : "status"} aria-busy={!error}>
    <h2>{error ? "Reviewer library unavailable" : "Preparing your reviewer library"}</h2>
    <p>{error || "Loading your authorized reviewer questions. Your selected topics are preserved."}</p>
    <p>{Object.values(QUESTION_BANKS).filter((bank) => isQuestionBankPublished(bank.label)).map((bank) => bank.label).join(" · ")}</p>
    {!error && <div className={styles.rows} aria-hidden="true">{[0, 1, 2, 3].map((row) => <div key={row} />)}</div>}
    {error && <button className="primary-button" type="button" onClick={onRetry}>Retry reviewer library</button>}
  </section>;
}
