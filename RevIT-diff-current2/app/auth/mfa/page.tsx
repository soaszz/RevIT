import MfaChallenge from "./MfaChallenge";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/overview" } = await searchParams;
  return <main className="auth-shell"><MfaChallenge next={next} /></main>;
}
