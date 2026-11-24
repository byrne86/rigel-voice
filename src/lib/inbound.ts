import { createAdminClient } from "./supabase/admin";
import { baseUrl, VoiceResponse } from "./twilio";

type Db = ReturnType<typeof createAdminClient>;

export interface InboundCall {
  id: string;
  org_id: string;
  to_number: string | null;
  campaign_id: string | null;
  campaigns: {
    id: string;
    name: string;
    record_calls: boolean;
    ring_seconds: number;
    inbound_fallback: string;
    forward_to: string | null;
    tts_voice: string;
  } | null;
}

/** Rings one or more agents' browsers. Each agent's answer is reported to inbound-answered. */
export function ringAgents(vr: InstanceType<typeof VoiceResponse>, call: InboundCall, agentIds: string[], step: number, contactName: string) {
  const record = call.campaigns?.record_calls !== false;
  const dial = vr.dial({
    timeout: call.campaigns?.ring_seconds ?? 20,
    answerOnBridge: true,
    action: `${baseUrl()}/api/twilio/inbound-next?callId=${call.id}&step=${step}`,
    ...(record
      ? {
          record: "record-from-answer-dual" as const,
          recordingStatusCallback: `${baseUrl()}/api/twilio/recording?callId=${call.id}`,
          recordingStatusCallbackEvent: ["completed" as const],
        }
      : {}),
  });
  for (const agent of agentIds) {
    const client = dial.client({
      statusCallback: `${baseUrl()}/api/twilio/inbound-answered?callId=${call.id}&agent=${agent}`,
      statusCallbackEvent: ["answered"],
    });
    client.identity(agent);
    client.parameter({ name: "callId", value: call.id });
    client.parameter({ name: "contactName", value: contactName });
  }
}

/** What happens when no agent answers: take a voicemail, forward, or hang up. */
export function fallback(vr: InstanceType<typeof VoiceResponse>, call: InboundCall) {
  const c = call.campaigns;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voice = (c?.tts_voice ?? "Polly.Amy-Neural") as any;
  if (c?.inbound_fallback === "forward" && c.forward_to) {
    vr.dial({ timeout: 30 }, c.forward_to);
    return "forwarded";
  }
  if (c?.inbound_fallback === "hangup") {
    vr.say({ voice }, "Sorry, nobody is available to take your call. Please try again later.");
    vr.hangup();
    return "missed";
  }
  vr.say({ voice }, "Sorry we missed you. Please leave a message after the tone and we'll call you back.");
  vr.record({
    maxLength: 120,
    playBeep: true,
    timeout: 5,
    recordingStatusCallback: `${baseUrl()}/api/twilio/recording?callId=${call.id}`,
    recordingStatusCallbackEvent: ["completed"],
  });
  vr.hangup();
  return "voicemail_received";
}

/** Agents to ring for a callback: step 1 = whoever last called them, step 2 = everyone on the campaign lately. */
export async function agentsForStep(db: Db, call: InboundCall, step: number) {
  if (!call.to_number) return [];
  if (step === 1) {
    const { data } = await db
      .from("calls")
      .select("agent_id")
      .eq("org_id", call.org_id)
      .eq("to_number", call.to_number)
      .eq("direction", "outbound")
      .not("agent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0]?.agent_id ? [data[0].agent_id as string] : [];
  }
  if (step === 2 && call.campaign_id) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data } = await db
      .from("calls")
      .select("agent_id")
      .eq("campaign_id", call.campaign_id)
      .not("agent_id", "is", null)
      .gte("created_at", since)
      .limit(500);
    return [...new Set((data ?? []).map((r) => r.agent_id as string))].slice(0, 10);
  }
  return [];
}
