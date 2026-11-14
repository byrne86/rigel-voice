import { getContext } from "@/lib/auth";
import { personalise, twilioClient, VoiceResponse } from "@/lib/twilio";

/**
 * Voicemail drop: hands the customer's leg of a live call to the AI voice, which leaves
 * the campaign's voicemail message. The agent is freed straight away for the next call.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const { data: call } = await ctx.supabase
    .from("calls")
    .select("*, campaigns(voicemail_message, tts_voice), contacts(first_name, last_name, company)")
    .eq("id", id)
    .single();
  if (!call || call.agent_id !== ctx.user.id) return Response.json({ error: "Call not found" }, { status: 404 });
  if (!call.campaigns?.voicemail_message) {
    return Response.json({ error: "This campaign has no voicemail message" }, { status: 409 });
  }
  if (!call.twilio_child_sid) {
    return Response.json({ error: "The call has not connected yet" }, { status: 409 });
  }

  const vr = new VoiceResponse();
  vr.pause({ length: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vr.say({ voice: call.campaigns.tts_voice as any }, personalise(call.campaigns.voicemail_message, call.contacts));
  vr.hangup();

  try {
    await twilioClient().calls(call.twilio_child_sid).update({ twiml: vr.toString() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Twilio error" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
