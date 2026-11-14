import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCall } from "@/lib/processing";
import { readTwilioWebhook } from "@/lib/twilio";

// Transcription and scoring run after we reply to Twilio, so allow a long run.
export const maxDuration = 300;

/** Twilio tells us a recording is ready: save it, then transcribe and score in the background. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId");
  if (!callId || params.RecordingStatus !== "completed") return new Response(null, { status: 204 });

  const db = createAdminClient();
  await db
    .from("calls")
    .update({
      recording_sid: params.RecordingSid,
      recording_url: params.RecordingUrl,
      recording_duration: Number(params.RecordingDuration ?? 0),
      processing_status: "pending",
    })
    .eq("id", callId);

  after(() => processCall(callId));
  return new Response(null, { status: 204 });
}
