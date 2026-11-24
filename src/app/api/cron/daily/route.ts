import { createAdminClient } from "@/lib/supabase/admin";
import { processCall } from "@/lib/processing";
import { twilioClient } from "@/lib/twilio";

export const maxDuration = 300;

/**
 * Daily housekeeping (Vercel cron): deletes recordings past each company's retention period,
 * from Twilio and storage, and retries scoring that got stuck.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorised", { status: 401 });
  const db = createAdminClient();
  let deleted = 0;

  const { data: orgs } = await db.from("organizations").select("id, recording_retention_days").not("recording_retention_days", "is", null);
  for (const org of orgs ?? []) {
    const cutoff = new Date(Date.now() - org.recording_retention_days * 86400_000).toISOString();
    const { data: old } = await db
      .from("calls")
      .select("id, recording_sid, recording_storage_path")
      .eq("org_id", org.id)
      .lt("created_at", cutoff)
      .is("recording_deleted_at", null)
      .or("recording_url.not.is.null,recording_storage_path.not.is.null")
      .limit(200);
    for (const c of old ?? []) {
      try {
        if (c.recording_sid) await twilioClient().recordings(c.recording_sid).remove();
      } catch (e) {
        // Already gone at Twilio is fine; anything else, try again tomorrow.
        if (!(e instanceof Error && /20404|not found/i.test(e.message))) continue;
      }
      if (c.recording_storage_path) await db.storage.from("recordings").remove([c.recording_storage_path]);
      await db
        .from("calls")
        .update({ recording_url: null, recording_storage_path: null, recording_deleted_at: new Date().toISOString() })
        .eq("id", c.id);
      deleted++;
    }
  }

  const stuck = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: retry } = await db
    .from("calls")
    .select("id")
    .in("processing_status", ["pending", "transcribing", "scoring"])
    .lt("created_at", stuck)
    .limit(20);
  for (const c of retry ?? []) await processCall(c.id);

  return Response.json({ deleted, retried: retry?.length ?? 0 });
}
