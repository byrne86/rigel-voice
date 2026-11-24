import { CALLING_DISABLED, callingEnabled, getContext, isUuid } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Power dialling: claims the next contact in a call list for this agent and opens a call record. */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { listId } = await req.json().catch(() => ({}));
  if (!isUuid(listId)) return Response.json({ error: "Choose a call list" }, { status: 400 });
  if (!(await callingEnabled(ctx.profile.org_id))) return Response.json({ error: CALLING_DISABLED }, { status: 403 });

  const { data: list } = await ctx.supabase.from("call_lists").select("*, campaigns(*)").eq("id", listId).single();
  const campaign = Array.isArray(list?.campaigns) ? list?.campaigns[0] : list?.campaigns;
  if (!list || !campaign) return Response.json({ error: "Call list not found" }, { status: 404 });
  if (campaign.status !== "active") return Response.json({ error: "This list's campaign is not active" }, { status: 409 });
  const from = campaign.caller_id || process.env.TWILIO_CALLER_ID;
  if (!from) return Response.json({ error: "This campaign has no caller ID. Set one under Campaigns." }, { status: 409 });

  const { data: claimed, error } = await ctx.supabase.rpc("claim_next_from_list", { p_list: listId });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const contact = claimed?.[0];
  if (!contact) return Response.json({ contact: null });

  const { data: call, error: callError } = await createAdminClient()
    .from("calls")
    .insert({
      org_id: ctx.profile.org_id,
      campaign_id: campaign.id,
      list_id: listId,
      contact_id: contact.id,
      agent_id: ctx.user.id,
      kind: "agent",
      direction: "outbound",
      to_number: contact.phone,
      from_number: from,
      status: "initiated",
    })
    .select("id")
    .single();
  if (callError) return Response.json({ error: callError.message }, { status: 500 });
  return Response.json({ contact, callId: call.id, campaignId: campaign.id });
}
