import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Draft Terms of Service for the RevIT Medical Technology review platform.",
};

const sections: LegalSection[] = [
  {
    title: "Acceptance of Terms",
    content: <p>These draft Terms of Service govern access to and use of RevIT. By creating an account, accepting these terms, or using the service, you agree to follow them. If you do not agree, do not use authenticated RevIT features; you may sign out without deleting your account or existing data.</p>,
  },
  {
    title: "Eligibility",
    content: <p>You must be legally able to enter into these terms in your location. If you use RevIT for or through a school, review center, laboratory, or other organization, you are also responsible for following that organization’s rules.</p>,
  },
  {
    title: "Account Responsibilities",
    content: <><p>Provide accurate account information, protect your password and any multi-factor authentication method, and promptly report suspected unauthorized access. You are responsible for activity performed through your account.</p><p>Do not share an account in a way that misrepresents study records, grades, achievements, or leaderboard participation.</p></>,
  },
  {
    title: "Educational Purpose",
    content: <p>RevIT is an educational study platform for Medical Technology and related health-science learning. Its reviewer tools, planning features, analytics, grades, achievements, and AI features are intended to support study and self-assessment. They do not guarantee academic, examination, professional, or employment outcomes.</p>,
  },
  {
    title: "Medical Disclaimer",
    content: <><p>RevIT is not a medical diagnosis service, treatment recommendation service, replacement for a qualified healthcare professional, replacement for laboratory or institutional policies, or clinical decision-support system.</p><p>Do not use RevIT to make patient-specific diagnostic, treatment, medication, laboratory-release, or other clinical decisions. In an emergency, contact the appropriate local emergency service or qualified professional.</p></>,
  },
  {
    title: "RevIT AI",
    content: <><p>RevIT AI provides educational assistance and may make mistakes, omit context, or produce outdated or incomplete information. Verify important information against approved references, manufacturer instructions, institutional policies, and qualified instructors or professionals.</p><p>Official reviewer answers remain separate from AI-generated explanations. AI output does not change the official answer used to score reviewer questions.</p></>,
  },
  {
    title: "Reviewer and Educational Content",
    content: <p>Reviewer questions, answers, rationales, source labels, calculations, and analytics are study materials. You are responsible for deciding whether a source is suitable for your course, institution, examination, or professional setting and for checking updates or corrections.</p>,
  },
  {
    title: "Acceptable Use",
    content: <><p>Use RevIT lawfully and respectfully. Do not attempt to access another person’s account or private data, bypass authentication or security controls, disrupt the service, upload malicious content, probe the service without authorization, automate abusive traffic, or use RevIT to infringe another person’s rights.</p><p>Do not use RevIT AI to obtain patient-specific diagnosis or treatment instructions or to present generated content as verified clinical guidance.</p></>,
  },
  {
    title: "Intellectual Property",
    content: <p>RevIT’s software, branding, visual design, and original content are protected by applicable intellectual-property laws. Third-party reviewer sources, trademarks, services, and materials remain the property of their respective owners. These terms do not transfer ownership to you.</p>,
  },
  {
    title: "User-Provided Content",
    content: <p>You retain responsibility for content you submit, including profile information, study-plan notes, calendar notes, and AI prompts. Submit only content you are permitted to use. Do not enter patient-identifying information or confidential clinical records into RevIT or RevIT AI.</p>,
  },
  {
    title: "Service Availability",
    content: <p>RevIT may change, suspend, or temporarily become unavailable because of maintenance, security work, service-provider availability, internet conditions, or other operational needs. Features that depend on Supabase, Groq, or other services may be unavailable when those services are unavailable.</p>,
  },
  {
    title: "Account Suspension or Termination",
    content: <p>Access may be restricted or ended when reasonably necessary to address unlawful activity, security risks, material violations of these terms, or harm to RevIT or other users. Where practical, reasonable notice or an opportunity to correct the issue may be provided.</p>,
  },
  {
    title: "Disclaimers",
    content: <p>To the extent permitted by law, RevIT is provided on an “as available” basis without guarantees that it will always be uninterrupted, error-free, complete, current, or suitable for a particular academic, examination, laboratory, or clinical purpose.</p>,
  },
  {
    title: "Limitation of Liability",
    content: <p>To the extent permitted by applicable law, RevIT and its operators will not be liable for indirect, incidental, special, consequential, or punitive losses arising from use of or inability to use the service. Nothing in these terms excludes liability that cannot legally be excluded.</p>,
  },
  {
    title: "Changes to Terms",
    content: <p>These terms may be updated to reflect service, legal, security, or operational changes. RevIT tracks the accepted terms version. If the current version changes, signed-in users will be asked to review and accept the updated terms before continuing, or may sign out.</p>,
  },
  {
    title: "Contact",
    content: <p>A production contact address has not yet been configured in the codebase. Before publication, the RevIT operator should replace this statement with the monitored email address or support channel for legal and account questions.</p>,
  },
  {
    title: "Effective Date",
    content: <p>This draft is effective September 3, 2026. It should be reviewed and adapted by qualified legal counsel before production publication, including the governing-law, contact, jurisdiction, and operator-identity details appropriate to RevIT.</p>,
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms of Service" summary="These draft terms explain the rules for using RevIT and the limits of its educational services." sections={sections} />;
}
