import { createAdminClient } from "@/lib/supabase/admin";
import { baseUrl, personalise, readTwilioWebhook, twiml, VoiceResponse } from "@/lib/twilio";

/** What an AI voice broadcast call says when it is answered. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const vr = new VoiceResponse();
  const callId = new URL(req.url).searchParams.get("callId");
  const db = createAdminClient();
  const { data: call } = callId
    ? await db
        .from("calls")
        .select("id, campaigns(broadcast_message, tts_voice), contacts(first_name, last_name, company)")
        .eq("id", callId)
        .single()
    : { data: null };

  // Supabase returns joined rows as an object or a one-item array depending on the relation.
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const campaign = one(call?.campaigns);
  const contact = one(call?.contacts);

  if (!call || !campaign?.broadcast_message) {
    vr.hangup();
    return twiml(vr);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voice = campaign.tts_voice as any;
  const message = personalise(campaign.broadcast_message, contact);
  const answeredBy = params.AnsweredBy ?? "";
  if (answeredBy) await db.from("calls").update({ answered_by: answeredBy }).eq("id", call.id);

  if (answeredBy.startsWith("machine") || answeredBy === "fax") {
    // Voicemail: leave the message and hang up.
    vr.say({ voice }, message);
    vr.hangup();
    return twiml(vr);
  }

  const gather = vr.gather({
    numDigits: 1,
    timeout: 6,
    action: `${baseUrl()}/api/twilio/broadcast-gather?callId=${call.id}`,
  });
  gather.say({ voice }, message);
  gather.pause({ length: 1 });
  gather.say({ voice }, "To ask for a call back, press 1. To stop receiving these calls, press 9.");
  vr.say({ voice }, "Thank you. Goodbye.");
  vr.hangup();
  return twiml(vr);
}
