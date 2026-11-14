import { createAdminClient } from "@/lib/supabase/admin";
import { readTwilioWebhook } from "@/lib/twilio";

const FINAL = ["completed", "busy", "no-answer", "failed", "canceled"];

/** Call progress events from Twilio for both agent calls and AI voice broadcasts. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId) return new Response(null, { status: 204 });

  const db = createAdminClient();
  const { data: call } = await db.from("calls").select("*, campaigns(retry_minutes)").eq("id", callId).single();
  if (!call) return new Response(null, { status: 204 });

  const status = params.CallStatus;
  const update: Record<string, unknown> = { status };
  if (call.kind === "agent") update.twilio_child_sid = params.CallSid;
  if (params.AnsweredBy) update.answered_by = params.AnsweredBy;
  if (status === "in-progress" && !call.started_at) update.started_at = new Date().toISOString();
  if (FINAL.includes(status)) {
    update.ended_at = new Date().toISOString();
    if (params.CallDuration) update.duration_seconds = Number(params.CallDuration);
  }
  await db.from("calls").update(update).eq("id", callId);

  // Broadcast calls have no agent to set an outcome, so close out the contact here.
  if (call.kind === "broadcast" && FINAL.includes(status) && call.contact_id) {
    const { data: contact } = await db.from("contacts").select("status").eq("id", call.contact_id).single();
    if (contact?.status === "in_progress") {
      const delivered = status === "completed";
      const retryAt = new Date(Date.now() + (call.campaigns?.retry_minutes ?? 240) * 60_000);
      await db
        .from("contacts")
        .update(
          delivered
            ? { status: "completed", last_disposition: call.disposition ?? "message_played" }
            : { status: "retry", last_disposition: status, next_attempt_at: retryAt.toISOString() },
        )
        .eq("id", call.contact_id);
      if (!call.disposition) {
        await db
          .from("calls")
          .update({ disposition: delivered ? "message_played" : status })
          .eq("id", callId);
      }
    }
  }
  return new Response(null, { status: 204 });
}
