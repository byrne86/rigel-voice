import { createAdminClient } from "@/lib/supabase/admin";
import { agentsForStep, fallback, ringAgents, type InboundCall } from "@/lib/inbound";
import { readTwilioWebhook, twiml, VoiceResponse } from "@/lib/twilio";

/**
 * Someone rang one of your Twilio numbers (usually calling back).
 * Set each Twilio number's "A call comes in" webhook to {APP_BASE_URL}/api/twilio/inbound.
 */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });
  const vr = new VoiceResponse();
  const db = createAdminClient();

  // The number they dialled tells us the company and campaign.
  const { data: matches } = await db
    .from("campaigns")
    .select("id, org_id, name, record_calls, ring_seconds, inbound_fallback, forward_to, tts_voice, ring_agents_on_callback, is_default_inbound")
    .eq("caller_id", params.To)
    .order("is_default_inbound", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const campaign = matches?.[0];
  if (!campaign) {
    vr.say("Sorry, this number is not in service.");
    vr.hangup();
    return twiml(vr);
  }

  const { data: contact } = await db
    .from("contacts")
    .select("id, first_name, last_name, company")
    .eq("org_id", campaign.org_id)
    .eq("phone", params.From)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: row } = await db
    .from("calls")
    .insert({
      org_id: campaign.org_id,
      campaign_id: campaign.id,
      contact_id: contact?.id ?? null,
      kind: "agent",
      direction: "inbound",
      to_number: params.From,
      from_number: params.To,
      twilio_call_sid: params.CallSid,
      status: "ringing",
      disposition: "incoming",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (!row) {
    vr.hangup();
    return twiml(vr);
  }
  const call: InboundCall = { id: row.id, org_id: campaign.org_id, to_number: params.From, campaign_id: campaign.id, campaigns: campaign };
  const name = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || params.From;

  if (campaign.ring_agents_on_callback) {
    const agents = await agentsForStep(db, call, 1);
    if (agents.length) {
      ringAgents(vr, call, agents, 1, name);
      return twiml(vr);
    }
    const team = await agentsForStep(db, call, 2);
    if (team.length) {
      ringAgents(vr, call, team, 2, name);
      return twiml(vr);
    }
  }
  const outcome = fallback(vr, call);
  await db.from("calls").update({ disposition: outcome }).eq("id", call.id);
  return twiml(vr);
}
