import VerifyPanel from "./VerifyPanel";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return <main className="auth-shell"><VerifyPanel email={email} /></main>;
}
