import ForgotPanel from "./ForgotPanel";
export default function ForgotPage() {
  return <main className="auth-shell"><ForgotPanel turnstileSiteKey={process.env.VITE_TURNSTILE_SITE_KEY ?? ""} /></main>;
}
