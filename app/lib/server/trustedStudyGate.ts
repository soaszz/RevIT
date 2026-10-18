import "server-only";
import { createAdminServiceClient } from "../admin/adminAuth";

// This selector grants no database authority. Every write also checks database configuration.
export function trustedStudyTransportEnabled() {
  return process.env.REVIT_TRUSTED_STUDY_ENABLED === "true";
}

export async function requireTrustedStudyWriter() {
  if (!trustedStudyTransportEnabled()) throw new Error("TRUSTED_STUDY_DISABLED");
  try {
    const client = createAdminServiceClient();
    const { data, error } = await client.from("trusted_study_config").select("enabled").eq("id", 1).maybeSingle();
    if (error || data?.enabled !== true) throw new Error("TRUSTED_STUDY_DISABLED");
    return client;
  } catch {
    throw new Error("TRUSTED_STUDY_DISABLED");
  }
}
