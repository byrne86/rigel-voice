import { createAdminClient } from "./supabase/admin";

/** Records an action in the company's activity log (best effort, never throws). */
export async function logActivity(orgId: string, userId: string | null, action: string, detail: Record<string, unknown> = {}) {
  try {
    await createAdminClient().from("activity_log").insert({ org_id: orgId, user_id: userId, action, detail });
  } catch {
    /* logging must never break the request */
  }
}
