type LibrarySearchProps = {
  id: string;
  value: string;
  resultCount: number;
  onChange: (value: string) => void;
};

const CATEGORY_CHOICES = [
  { label: "All Subjects", value: "" },
  { label: "MTAP 1", value: "MTAP 1" },
  { label: "Other Majors", value: "Other Majors" },
] as const;

export default function LibrarySearch({ id, value, resultCount, onChange }: LibrarySearchProps) {
  const hasSearch = value.trim().length > 0;

  return (
    <div className="library-tools">
      <div className="library-category-filter" role="group" aria-label="Filter review library by category">
        <span>Browse categories</span>
        <div>
          {CATEGORY_CHOICES.map((choice) => (
            <button
              className={value.trim() === choice.value ? "active" : ""}
              type="button"
              aria-pressed={value.trim() === choice.value}
              key={choice.label}
              onClick={() => onChange(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <div className="library-search" role="search">
        <div>
          <label htmlFor={id}>Search subjects and topics</label>
          <span>{hasSearch ? `${resultCount} subject${resultCount === 1 ? "" : "s"} found` : "Find a subject or topic in the library"}</span>
        </div>
        <div className="library-search-control">
          <span aria-hidden="true">⌕</span>
          <input
            id={id}
            type="search"
            value={value}
            placeholder="Search Parasitology, Hematology 1, Clinical Chemistry 1, and etc."
            onChange={(event) => onChange(event.target.value)}
          />
          {hasSearch && <button type="button" onClick={() => onChange("")} aria-label="Clear library search">Clear</button>}
        </div>
      </div>
    </div>
  );
}
