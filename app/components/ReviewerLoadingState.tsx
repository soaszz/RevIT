import styles from "./ReviewerLoadingState.module.css";
import library from "./ReviewLibrary.module.css";
import collection from "./CollectionHeader.module.css";

export default function ReviewerLoadingState({ error, onRetry, mtapEnabled = false }: { error?: string; onRetry: () => void; mtapEnabled?: boolean }) {
  return <section className={`${styles.state} ${mtapEnabled ? library.nuLibrary : ""}`.trim()} role={error ? "alert" : "status"} aria-busy={!error}>
    <header className={styles.heading}>
      <h2>{error ? "Reviewer library unavailable" : "Preparing your Review Library"}</h2>
      <p>{error || "Getting your subjects and topics ready."}</p>
    </header>
    {!error && <div className={styles.preview} aria-hidden="true" data-layout={mtapEnabled ? "nu" : "standard"}>
      <div className={library.searchToolbar}>
        <div className={library.searchInputWrap}><div className={`${styles.shape} ${styles.search}`} /></div>
        <div className={`${library.categoryChips} ${styles.filters}`}>
          {Array.from({ length: mtapEnabled ? 4 : 1 }, (_, index) => <span key={index} className={`${styles.shape} ${styles.filter}`} />)}
        </div>
      </div>
      <div className={library.libraryLayout}>
        <div className={library.subjectList}>
          {mtapEnabled ? ["mtap-1", "mtap-2", "other-majors"].map((id) =>
            <div key={id} className={`${collection.collectionHeader} ${styles.collection}`} data-collection={id}>
              <div className={styles.lines}>
                <span className={`${styles.shape} ${styles.title}`} />
                <span className={`${styles.shape} ${styles.description}`} />
              </div>
            </div>
          ) : [0, 1, 2].map((id) =>
            <div key={id} className={`${library.subjectCard} ${styles.subject}`} data-placeholder="subject">
              <div className={styles.lines}>
                <span className={`${styles.shape} ${styles.title}`} />
                <span className={`${styles.shape} ${styles.description}`} />
                <span className={`${styles.shape} ${styles.detail}`} />
              </div>
            </div>
          )}
        </div>
        <div className={library.sessionSidebar} data-placeholder="session-setup">
          <span className={`${styles.shape} ${styles.title}`} />
          {[0, 1, 2].map((id) => <div className={styles.field} key={id}>
            <span className={`${styles.shape} ${styles.detail}`} />
            <span className={`${styles.shape} ${styles.control}`} />
          </div>)}
          <span className={`${styles.shape} ${styles.action}`} />
        </div>
      </div>
    </div>}
    {error && <button className="primary-button" type="button" onClick={onRetry}>Retry reviewer library</button>}
  </section>;
}
