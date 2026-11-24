import { CALLING_DISABLED, callingEnabled, getContext, isUuid } from "@/lib/auth";
import { normaliseNumber } from "@/lib/dialing";
import { createAdminClient } from "@/lib/supabase/admin";

/** Starts a call to a number the agent typed in, on a chosen campaign. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { campaignId, number } = await req.json().catch(() => ({}));
  if (!isUuid(campaignId)) return Response.json({ error: "Choose a campaign" }, { status: 400 });
  if (!(await callingEnabled(ctx.profile.org_id))) return Response.json({ error: CALLING_DISABLED }, { status: 403 });

  const { data: campaign } = await ctx.supabase.from("campaigns").select("*").eq("id", campaignId).single();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const from = campaign.caller_id || process.env.TWILIO_CALLER_ID;
  if (!from) return Response.json({ error: "This campaign has no caller ID. Set one under Campaigns." }, { status: 409 });

  const to = normaliseNumber(number, campaign.default_country);
  if (!to) return Response.json({ error: "That doesn't look like a valid phone number" }, { status: 400 });

  const { data: dnc } = await ctx.supabase.from("dnc_numbers").select("phone").eq("phone", to).maybeSingle();
  if (dnc) return Response.json({ error: "This number is on your do-not-call list" }, { status: 409 });

  // Link to the contact if we already have this number in the campaign.
  const { data: contact } = await ctx.supabase
    .from("contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("phone", to)
    .limit(1)
    .maybeSingle();

  const { data: call, error } = await createAdminClient()
    .from("calls")
    .insert({
      org_id: ctx.profile.org_id,
      campaign_id: campaignId,
      contact_id: contact?.id ?? null,
      agent_id: ctx.user.id,
      kind: "agent",
      direction: "outbound",
      to_number: to,
      from_number: from,
      status: "initiated",
    })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ callId: call.id, to, contact });
}
