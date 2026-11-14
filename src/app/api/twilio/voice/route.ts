import { createAdminClient } from "@/lib/supabase/admin";
import { baseUrl, readTwilioWebhook, twiml, VoiceResponse } from "@/lib/twilio";

/**
 * TwiML App voice webhook. Twilio calls this when an agent's browser starts a call.
 * The number dialled always comes from our own call record, never from the browser,
 * so an agent can only ring contacts the dialer handed them.
 */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const vr = new VoiceResponse();
  const agentId = (params.From ?? "").replace(/^client:/, "");
  const callId = params.callId;

  const db = createAdminClient();
  const { data: call } = callId
    ? await db.from("calls").select("*, campaigns(record_calls)").eq("id", callId).single()
    : { data: null };

  if (!call || call.agent_id !== agentId || call.status !== "initiated" || !call.from_number) {
    vr.say("This call could not be placed.");
    vr.hangup();
    return twiml(vr);
  }

  await db.from("calls").update({ twilio_call_sid: params.CallSid, status: "dialing" }).eq("id", call.id);

  const record = call.campaigns?.record_calls !== false;
  const dial = vr.dial({
    callerId: call.from_number,
    answerOnBridge: true,
    timeout: 25,
    ...(record
      ? {
          record: "record-from-answer-dual" as const,
          recordingStatusCallback: `${baseUrl()}/api/twilio/recording?callId=${call.id}`,
          recordingStatusCallbackEvent: ["completed" as const],
        }
      : {}),
  });
  dial.number(
    {
      statusCallback: `${baseUrl()}/api/twilio/status?callId=${call.id}`,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    call.to_number,
  );
  return twiml(vr);
}
