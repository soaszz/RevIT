import { useEffect } from "react";

type LibrarySearchProps = {
  id: string;
  isNuRevit: boolean;
  value: string;
  resultCount: number;
  emptyHelperText?: string;
  onChange: (value: string) => void;
};

const NU_CATEGORY_CHOICES = [
  { label: "All Subjects", value: "" },
  { label: "MTAP 1", value: "MTAP 1" },
  { label: "Other Majors", value: "Other Majors" },
] as const;

const STANDARD_CATEGORY_CHOICES = [
  { label: "All Majors", value: "" },
] as const;

export default function LibrarySearch({ id, isNuRevit, value, resultCount, emptyHelperText, onChange }: LibrarySearchProps) {
  const hasSearch = value.trim().length > 0;
  const categoryChoices = isNuRevit ? NU_CATEGORY_CHOICES : STANDARD_CATEGORY_CHOICES;

  useEffect(() => {
    const selectedNuCategory = NU_CATEGORY_CHOICES.some(
      (choice) => choice.value.length > 0 && choice.value === value.trim(),
    );
    if (!isNuRevit && selectedNuCategory) onChange("");
  }, [isNuRevit, onChange, value]);

  return (
    <div className="library-search" role="search">
      <div className="library-search-copy">
        <label htmlFor={id}>Search subjects and topics</label>
        <span>{hasSearch ? `${resultCount} subject${resultCount === 1 ? "" : "s"} found` : (emptyHelperText || "Find a subject or topic in the library")}</span>
      </div>
      <div className="library-category-filter" role="group" aria-label="Filter review library by category">
        {categoryChoices.map((choice) => (
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
      <div className="library-search-control">
        <span aria-hidden="true">⌕</span>
        <input
          id={id}
          type="search"
          value={value}
          placeholder="Search subjects or topics..."
          onChange={(event) => onChange(event.target.value)}
        />
        {hasSearch && <button type="button" onClick={() => onChange("")} aria-label="Clear library search">Clear</button>}
      </div>
    </div>
  );
}
