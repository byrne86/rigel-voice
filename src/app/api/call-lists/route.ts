import { getContext, isManager, isUuid } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { cleanContacts, type ContactRow } from "@/lib/contacts";

/** Creates a call list from uploaded spreadsheet rows (managers). */
export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const { campaignId, agentId, rows } = body as { campaignId?: string; agentId?: string; rows?: ContactRow[] };
  const name = String(body.name ?? "").trim().slice(0, 120);
  if (!isUuid(campaignId)) return Response.json({ error: "Choose a campaign" }, { status: 400 });
  if (!name) return Response.json({ error: "Give the list a name" }, { status: 400 });
  if (!Array.isArray(rows) || rows.length === 0) return Response.json({ error: "The file has no rows" }, { status: 400 });
  if (rows.length > 20000) return Response.json({ error: "Upload up to 20,000 contacts at a time" }, { status: 400 });

  const { data: campaign } = await ctx.supabase.from("campaigns").select("id, default_country").eq("id", campaignId).single();
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  if (agentId && !isUuid(agentId)) return Response.json({ error: "Unknown agent" }, { status: 400 });

  const { data: list, error } = await ctx.supabase
    .from("call_lists")
    .insert({ campaign_id: campaignId, agent_id: agentId || null, name, source: "upload" })
    .select("id")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { clean, invalid } = cleanContacts(rows, campaign.default_country);
  let imported = 0;
  for (let i = 0; i < clean.length; i += 500) {
    const { data, error: insErr } = await ctx.supabase
      .from("contacts")
      .upsert(
        clean.slice(i, i + 500).map((c) => ({ ...c, campaign_id: campaignId, list_id: list.id })),
        { onConflict: "campaign_id,phone", ignoreDuplicates: true },
      )
      .select("id");
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    imported += data?.length ?? 0;
  }
  await logActivity(ctx.profile.org_id, ctx.user.id, "call_list.created", { name, imported });
  return Response.json({ listId: list.id, imported, invalid, duplicates: rows.length - invalid - imported });
}
