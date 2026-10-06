import { notFound } from "next/navigation";
import RevITApp from "../../RevITApp";
export default function CapturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <RevITApp cloudEnabled={false} />;
}
