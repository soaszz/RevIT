type LibrarySearchProps = {
  id: string;
  value: string;
  resultCount: number;
  onChange: (value: string) => void;
};

export default function LibrarySearch({ id, value, resultCount, onChange }: LibrarySearchProps) {
  const hasSearch = value.trim().length > 0;

  return (
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
          placeholder="Try mycology, Parasitology, or malaria"
          onChange={(event) => onChange(event.target.value)}
        />
        {hasSearch && <button type="button" onClick={() => onChange("")} aria-label="Clear library search">Clear</button>}
      </div>
    </div>
  );
}
