import { Fragment } from "react";
import type { SourceTextMarks } from "../content/reviewerContent";

/** Source character ranges only; all text remains escaped by React. */
export default function SourceText({ text, marks }: { text: string; marks?: SourceTextMarks }) {
  if (!marks?.length || !marks.every((mark, index) =>
    Number.isInteger(mark.start) && Number.isInteger(mark.end)
      && mark.start >= (index ? marks[index - 1].end : 0) && mark.end > mark.start && mark.end <= text.length
      && (mark.script === "sub" || mark.script === "sup"))) return text;

  const parts = marks.map((mark, index) => {
    const before = text.slice(index ? marks[index - 1].end : 0, mark.start);
    const script = text.slice(mark.start, mark.end);
    return <Fragment key={mark.start}>{before}{mark.script === "sub" ? <sub>{script}</sub> : <sup>{script}</sup>}</Fragment>;
  });
  return <>{parts}{text.slice(marks[marks.length - 1].end)}</>;
}
