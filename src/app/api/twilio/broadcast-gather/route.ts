import { createAdminClient } from "@/lib/supabase/admin";
import { readTwilioWebhook, twiml, VoiceResponse } from "@/lib/twilio";

/** Handles the key a person presses during a broadcast: 1 = call me back, 9 = opt out. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const vr = new VoiceResponse();
  const callId = new URL(req.url).searchParams.get("callId");
  const db = createAdminClient();
  const { data: call } = callId
    ? await db.from("calls").select("*, campaigns(tts_voice)").eq("id", callId).single()
    : { data: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voice = (call?.campaigns?.tts_voice ?? "Polly.Amy-Neural") as any;

  if (call && params.Digits === "9") {
    await db.from("dnc_numbers").upsert({ org_id: call.org_id, phone: call.to_number, reason: "Opted out on broadcast call" });
    await db.from("calls").update({ disposition: "dnc" }).eq("id", call.id);
    if (call.contact_id) {
      await db.from("contacts").update({ status: "dnc", last_disposition: "dnc" }).eq("id", call.contact_id);
    }
    vr.say({ voice }, "You have been removed from our list. Goodbye.");
  } else if (call && params.Digits === "1") {
    await db.from("calls").update({ disposition: "callback" }).eq("id", call.id);
    if (call.contact_id) {
      await db.from("contacts").update({ status: "completed", last_disposition: "callback" }).eq("id", call.contact_id);
    }
    vr.say({ voice }, "Thank you. One of our team will call you back shortly. Goodbye.");
  } else {
    vr.say({ voice }, "Thank you. Goodbye.");
  }
  vr.hangup();
  return twiml(vr);
}
