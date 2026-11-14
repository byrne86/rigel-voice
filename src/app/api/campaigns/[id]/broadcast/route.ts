import { getContext, isManager } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { baseUrl, twilioClient } from "@/lib/twilio";

export const maxDuration = 60;

/** Sends the next batch of AI voice broadcast calls for a campaign (managers only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit ?? 10), 50));

  const { data: campaign } = await ctx.supabase.from("campaigns").select("*").eq("id", id).single();
  if (!campaign || campaign.mode !== "broadcast") {
    return Response.json({ error: "Broadcast campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "active") return Response.json({ error: "Set the campaign to active first" }, { status: 409 });
  if (!campaign.broadcast_message) return Response.json({ error: "Add a broadcast message first" }, { status: 409 });
  const from = campaign.caller_id || process.env.TWILIO_CALLER_ID;
  if (!from) return Response.json({ error: "No caller ID is set" }, { status: 409 });

  const db = createAdminClient();
  const { data: contacts, error } = await db.rpc("claim_contacts_batch", {
    p_campaign: id,
    p_org: ctx.profile.org_id,
    p_limit: limit,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const twilio = twilioClient();
  let started = 0;
  let failed = 0;
  for (const contact of contacts ?? []) {
    const { data: call } = await db
      .from("calls")
      .insert({
        org_id: ctx.profile.org_id,
        campaign_id: id,
        contact_id: contact.id,
        kind: "broadcast",
        to_number: contact.phone,
        from_number: from,
        status: "initiated",
      })
      .select("id")
      .single();
    if (!call) continue;
    try {
      const created = await twilio.calls.create({
        to: contact.phone,
        from,
        url: `${baseUrl()}/api/twilio/broadcast?callId=${call.id}`,
        statusCallback: `${baseUrl()}/api/twilio/status?callId=${call.id}`,
        statusCallbackEvent: ["completed"],
        machineDetection: "DetectMessageEnd",
        timeout: 25,
      });
      await db.from("calls").update({ twilio_call_sid: created.sid, status: "dialing" }).eq("id", call.id);
      started++;
    } catch (err) {
      failed++;
      await db
        .from("calls")
        .update({ status: "failed", processing_error: err instanceof Error ? err.message.slice(0, 300) : null })
        .eq("id", call.id);
      await db.from("contacts").update({ status: "failed", last_disposition: "failed" }).eq("id", contact.id);
    }
  }
  return Response.json({ started, failed });
}
