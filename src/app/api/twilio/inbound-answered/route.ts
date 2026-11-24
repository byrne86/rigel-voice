import { createAdminClient } from "@/lib/supabase/admin";
import { readTwilioWebhook } from "@/lib/twilio";

/** An agent picked up an incoming call: the call becomes theirs. */
export async function POST(req: Request) {
  const params = await readTwilioWebhook(req);
  if (!params) return new Response("Invalid signature", { status: 403 });
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  const agent = url.searchParams.get("agent");
  if (callId && agent && params.CallStatus === "in-progress") {
    await createAdminClient()
      .from("calls")
      .update({ agent_id: agent, status: "in-progress", twilio_child_sid: params.CallSid })
      .eq("id", callId)
      .is("agent_id", null);
  }
  return new Response(null, { status: 204 });
}
