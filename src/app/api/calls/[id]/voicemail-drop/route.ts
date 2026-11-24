import { getContext, isUuid } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { personalise, twilioClient, VoiceResponse } from "@/lib/twilio";
import { voicemailAudioUrl, type VoicemailDrop } from "@/lib/types";

/**
 * Voicemail drop: hands the customer's leg of a live call to a drop from the
 * voicemail library (AI voice or a recording). The agent is freed straight away.
 * Uses the drop the agent picked, else the campaign's, else the company default.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Call not found" }, { status: 404 });
  const { dropId } = await req.json().catch(() => ({}));

  const { data: call } = await ctx.supabase
    .from("calls")
    .select("*, campaigns(voicemail_drop_id, allow_voicemail_drops), contacts(first_name, last_name, company)")
    .eq("id", id)
    .single();
  if (!call || call.agent_id !== ctx.user.id) return Response.json({ error: "Call not found" }, { status: 404 });
  if (call.campaigns?.allow_voicemail_drops === false) {
    return Response.json({ error: "Voicemail drops are switched off for this campaign" }, { status: 409 });
  }
  if (call.ended_at) return Response.json({ error: "The call has already ended" }, { status: 409 });
  if (!call.twilio_child_sid) return Response.json({ error: "The call has not connected yet" }, { status: 409 });

  // Row level security limits this lookup to the agent's own company.
  let drop: VoicemailDrop | null = null;
  for (const candidate of [dropId, call.campaigns?.voicemail_drop_id]) {
    if (!drop && isUuid(candidate)) {
      drop = (await ctx.supabase.from("voicemail_drops").select("*").eq("id", candidate).maybeSingle()).data;
    }
  }
  if (!drop) {
    // Your own message for this campaign first, then any of yours, then shared ones.
    const query = ctx.supabase.from("voicemail_drops").select("*");
    const { data: options } = isUuid(call.campaign_id)
      ? await query.or(`campaign_id.is.null,campaign_id.eq.${call.campaign_id}`)
      : await query.is("campaign_id", null);
    drop =
      (options ?? []).sort((a, b) => {
        const score = (d: VoicemailDrop) => (d.owner_id === ctx.user.id ? 0 : 2) + (d.campaign_id === call.campaign_id ? 0 : 1);
        return score(a) - score(b);
      })[0] ?? null;
  }
  if (!drop) {
    return Response.json({ error: "No voicemail message is set up. Record one under Voicemails." }, { status: 409 });
  }

  const vr = new VoiceResponse();
  vr.pause({ length: 1 });
  if (drop.kind === "audio" && drop.audio_path) {
    vr.play(voicemailAudioUrl(drop.audio_path));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vr.say({ voice: drop.tts_voice as any }, personalise(drop.message ?? "", call.contacts));
  }
  vr.hangup();

  try {
    await twilioClient().calls(call.twilio_child_sid).update({ twiml: vr.toString() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Twilio error" }, { status: 502 });
  }
  await createAdminClient()
    .from("calls")
    .update({ voicemail_drop_id: drop.id })
    .eq("id", call.id)
    .eq("org_id", ctx.profile.org_id);
  return Response.json({ ok: true, drop: drop.name });
}
