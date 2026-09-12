import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const HIGH_CONFIDENCE_PATTERNS = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Groq API key", /\bgsk_[A-Za-z0-9]{20,}\b/g],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[opusr]_[A-Za-z0-9]{30,}\b/g],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/g],
];

const SENSITIVE_ASSIGNMENT = /\b(GROQ_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_ACCESS_TOKEN|TURNSTILE_SECRET_KEY|DATABASE_URL|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|NEXT_PUBLIC_GROQ_API_KEY|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_SECRET_KEY|NEXT_PUBLIC_TURNSTILE_SECRET_KEY)[ \t]*=[ \t]*["']?([^\s"'#]{8,})/g;
const JWT = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g;

function isPlaceholder(value) {
  return /^(?:your[_-]|example|placeholder|changeme|replace[_-]|xxx|test[_-])/i.test(value)
    || value.includes("${")
    || value.startsWith("<");
}

function jwtRole(token) {
  try {
    const part = token.split(".")[1];
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8")).role;
  } catch {
    return null;
  }
}

function scan(label, content) {
  const findings = [];
  for (const [kind, pattern] of HIGH_CONFIDENCE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${label}: ${kind}`);
  }
  SENSITIVE_ASSIGNMENT.lastIndex = 0;
  for (const match of content.matchAll(SENSITIVE_ASSIGNMENT)) {
    if (!isPlaceholder(match[2])) findings.push(`${label}: non-empty ${match[1]}`);
  }
  JWT.lastIndex = 0;
  for (const match of content.matchAll(JWT)) {
    if (["service_role", "supabase_admin"].includes(jwtRole(match[0]))) {
      findings.push(`${label}: privileged Supabase JWT`);
    }
  }
  return [...new Set(findings)];
}

const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];
for (const path of tracked) {
  try {
    const bytes = readFileSync(path);
    if (bytes.length <= 2 * 1024 * 1024 && !bytes.subarray(0, 8000).includes(0)) {
      findings.push(...scan(path, bytes.toString("utf8")));
    }
  } catch {
    // A file may disappear between git enumeration and reading.
  }
}

try {
  const history = execFileSync(
    "git",
    ["log", "--all", "--full-history", "--no-ext-diff", "--text", "--format=commit:%H", "-p", "--", "."],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  findings.push(...scan("Git history", history));
} catch (error) {
  console.error("Secret scan could not inspect Git history.");
  process.exitCode = 2;
  throw error;
}

if (findings.length) {
  console.error("Potential secrets found (values intentionally hidden):");
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Secret scan passed: ${tracked.length} workspace files and the full Git patch history were checked.`);
