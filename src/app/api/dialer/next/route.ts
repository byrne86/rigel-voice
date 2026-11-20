import { CALLING_DISABLED, callingEnabled, getContext, isUuid } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Claims the next contact in a campaign for this agent and opens a call record for it. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { campaignId } = await req.json().catch(() => ({}));
  if (!isUuid(campaignId)) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (!(await callingEnabled(ctx.profile.org_id))) {
    return Response.json({ error: CALLING_DISABLED }, { status: 403 });
  }

  const { data: campaign } = await ctx.supabase.from("campaigns").select("*").eq("id", campaignId).single();
  if (!campaign || campaign.mode !== "agent") {
    return Response.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "active") {
    return Response.json({ error: "This campaign is not active" }, { status: 409 });
  }
  const from = campaign.caller_id || process.env.TWILIO_CALLER_ID;
  if (!from) return Response.json({ error: "No caller ID is set for this campaign" }, { status: 409 });

  const { data: claimed, error } = await ctx.supabase.rpc("claim_next_contact", { p_campaign: campaignId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const contact = claimed?.[0];
  if (!contact) return Response.json({ contact: null });

  // Created with the server key: browsers cannot create call records themselves.
  const { data: call, error: callError } = await createAdminClient()
    .from("calls")
    .insert({
      org_id: ctx.profile.org_id,
      campaign_id: campaignId,
      contact_id: contact.id,
      agent_id: ctx.user.id,
      kind: "agent",
      to_number: contact.phone,
      from_number: from,
      status: "initiated",
    })
    .select("id")
    .single();
  if (callError) return Response.json({ error: callError.message }, { status: 500 });

  return Response.json({ contact, callId: call.id });
}
