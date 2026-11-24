import { after } from "next/server";
import { getContext, isManager } from "@/lib/auth";
import { processCall } from "@/lib/processing";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Re-runs scoring for this company's calls that are stuck or failed (managers). */
export async function POST() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const stuck = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await createAdminClient()
    .from("calls")
    .select("id")
    .eq("org_id", ctx.profile.org_id)
    .or(`processing_status.eq.failed,and(processing_status.in.(pending,transcribing,scoring),created_at.lt.${stuck})`)
    .or("recording_url.not.is.null,recording_storage_path.not.is.null")
    .order("created_at", { ascending: false })
    .limit(10);
  const ids = (data ?? []).map((r) => r.id as string);
  after(async () => {
    for (const id of ids) await processCall(id);
  });
  return Response.json({ queued: ids.length });
}
