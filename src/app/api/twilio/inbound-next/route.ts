import { createAdminClient } from "@/lib/supabase/admin";
import { agentsForStep, fallback, ringAgents, type InboundCall } from "@/lib/inbound";
import { readTwilioWebhook, twiml, VoiceResponse } from "@/lib/twilio";

/** Runs after each ring step: stop if someone answered, otherwise try the next step. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  const step = Number(url.searchParams.get("step") ?? 1);
  const vr = new VoiceResponse();
  const db = createAdminClient();

  if (params.DialCallStatus === "completed" || params.DialCallStatus === "answered") {
    if (callId) {
      await db
        .from("calls")
        .update({ status: "completed", duration_seconds: Number(params.DialCallDuration ?? 0), ended_at: new Date().toISOString() })
        .eq("id", callId);
    }
    vr.hangup();
    return twiml(vr);
  }
  const { data } = callId
    ? await db
        .from("calls")
        .select("id, org_id, to_number, campaign_id, contact_id, campaigns(id, name, record_calls, ring_seconds, inbound_fallback, forward_to, tts_voice)")
        .eq("id", callId)
        .single()
    : { data: null };
  if (!data) {
    vr.hangup();
    return twiml(vr);
  }
  const call = { ...data, campaigns: Array.isArray(data.campaigns) ? data.campaigns[0] : data.campaigns } as InboundCall;

  if (step === 1) {
    const team = (await agentsForStep(db, call, 2)).filter(Boolean);
    if (team.length) {
      ringAgents(vr, call, team, 2, call.to_number ?? "Caller");
      return twiml(vr);
    }
  }
  const outcome = fallback(vr, call);
  await db.from("calls").update({ disposition: outcome }).eq("id", call.id);
  return twiml(vr);
}
