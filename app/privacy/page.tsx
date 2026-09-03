import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "../components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Draft Privacy Policy for the RevIT Medical Technology review platform.",
};

const sections: LegalSection[] = [
  {
    title: "Scope and Status",
    content: <p>This draft Privacy Policy describes the information the current RevIT code stores or processes. It is not legal advice and should be reviewed by qualified counsel before production publication. RevIT is an educational study platform, not a clinical records system.</p>,
  },
  {
    title: "Account and Profile Information",
    content: <><p>When cloud accounts are enabled, RevIT uses Supabase Authentication to process your email address, password authentication, email-verification status, session information, and any configured multi-factor authentication. RevIT’s profile table stores your username, first name, optional avatar URL, onboarding status, and the versions and database timestamps for accepted Terms and Privacy Policy.</p><p>RevIT application code does not store your plain-text password.</p></>,
  },
  {
    title: "Study and Progress Information",
    content: <p>RevIT may store question-attempt history, selected answer index, correctness, question and topic identifiers, difficulty, review mode, adaptive-repeat status, timestamps, weakness and reinforcement state, daily activity totals, subjects studied, XP, level-related progress, achievements, grades, exam schedules, and related activity-event identifiers used to prevent duplicate rewards.</p>,
  },
  {
    title: "Plans, Calendar, and Preferences",
    content: <><p>The current Study Planner stores plan titles, dates, blocks, times, categories, subjects, topics, notes, completion state, and calendar-link state in local browser storage scoped to the signed-in user or local mode. Exam schedules and study activity used by the calendar may be stored in Supabase when cloud accounts are enabled.</p><p>RevIT also stores preferences such as timezone, theme, and optional leaderboard participation. Selected topics, sidebar state, sound preference, and session-policy markers may be kept in browser storage.</p></>,
  },
  {
    title: "RevIT AI and Saved Conversations",
    content: <><p>When you use RevIT AI, recent chat messages are sent through RevIT’s server route to Groq when a Groq API key is configured. Groq processes that text to generate an educational response. When no key is configured, the app returns a limited built-in demo response without sending the prompt to Groq.</p><p>For signed-in cloud users, RevIT stores AI conversation titles, user messages, assistant messages, and timestamps in Supabase so chat history can be reopened. Do not submit patient-identifying information, confidential clinical records, or information you are not authorized to share.</p></>,
  },
  {
    title: "How Information Is Used",
    content: <p>RevIT uses this information to authenticate accounts, verify email, maintain sessions, synchronize profiles and study records, deliver reviewer and planning features, calculate deterministic grades and learning analytics, operate adaptive repetition, track activity and achievements, save AI conversations, display optional leaderboards, protect the service, and troubleshoot failures.</p>,
  },
  {
    title: "Supabase Storage and Processing",
    content: <p>RevIT uses Supabase for authentication, database storage, and optional avatar storage. Private application tables use row-level security so authenticated users can read or change their own records under the current policies. The public avatar bucket permits public reads of uploaded avatar files, and leaderboard functions may expose the limited public profile fields described below.</p>,
  },
  {
    title: "Local Browser and Device Storage",
    content: <p>RevIT uses localStorage and sessionStorage for theme, selected topics, local or cached question attempts, adaptive-repetition state, local-mode profile and study data, Study Planner records, sound and sidebar preferences, queued sync operations, level-notice state, and remember-me or session-only markers. Browser storage remains on the device and browser profile until cleared by you, the browser, or device-management settings.</p>,
  },
  {
    title: "Leaderboard Visibility",
    content: <p>Leaderboard participation is optional and off by default. If enabled, leaderboard results may show your display name, avatar, rank, selected metric, and related eligibility or percentile information. RevIT’s leaderboard functions are designed not to expose email addresses, account UUIDs, or raw private attempt history.</p>,
  },
  {
    title: "Data Sharing and Service Providers",
    content: <p>RevIT processes data through Supabase and, when live AI is configured and used, Groq. Information may also pass through the hosting and network providers that deliver the application. RevIT does not currently contain advertising or data-broker integrations in the inspected codebase.</p>,
  },
  {
    title: "Retention and Deletion",
    content: <><p>The inspected codebase retains cloud records until they are changed or deleted through implemented features, removed by the operator, or deleted through account-cascade behavior. Deleting an authentication user is configured to cascade to related profile and user-owned database records. The current interface includes deletion for selected items such as AI chats and exam entries, but it does not include a self-service delete-account workflow.</p><p>Clearing browser site data removes local-only information from that browser but does not delete cloud records. Contact details for production account or data-deletion requests must be configured before publication.</p></>,
  },
  {
    title: "Security and Its Limits",
    content: <p>RevIT uses Supabase authentication, email verification, optional multi-factor authentication, row-level security, scoped database functions, and browser-session controls. No system can guarantee absolute security. Protect your credentials, use a trusted device, and report suspected unauthorized access through the production contact channel once configured.</p>,
  },
  {
    title: "Your Choices",
    content: <p>You can switch theme, choose remember-me or session-only access, keep leaderboard participation off, remove or change supported profile and study records, clear local browser storage, and sign out rather than accept a new policy version. Some choices may limit available features.</p>,
  },
  {
    title: "Policy Updates",
    content: <p>RevIT may update this policy as its features or processing practices change. RevIT stores the privacy-policy version you accepted. If the current version changes, signed-in users will be asked to review and accept it before continuing, or may sign out.</p>,
  },
  {
    title: "Contact",
    content: <p>A production privacy contact has not yet been configured in the codebase. Before publication, the RevIT operator should add a monitored email address or support channel for privacy, access, correction, and deletion requests and any legally required operator identity.</p>,
  },
  {
    title: "Effective Date",
    content: <p>This draft is effective September 3, 2026. Material service or data-practice changes should be reflected in a new centralized privacy version and presented to users for review.</p>,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" summary="This draft policy describes the account, study, preference, and AI information processed by the current RevIT codebase." sections={sections} />;
}
