import { getContext, isManager, isUuid } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/**
 * Saves a campaign's script (managers). Saving always puts it back to draft;
 * agents only see it again once a manager approves it.
 * Body: { script, flow: string[], objections: {objection, answer}[], approve?: boolean }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const flow = (Array.isArray(body.flow) ? body.flow : [])
    .map((s: unknown) => String(s ?? "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);
  const objections = (Array.isArray(body.objections) ? body.objections : [])
    .map((o: { objection?: unknown; answer?: unknown }) => ({
      objection: String(o?.objection ?? "").trim().slice(0, 200),
      answer: String(o?.answer ?? "").trim().slice(0, 2000),
    }))
    .filter((o: { objection: string; answer: string }) => o.objection && o.answer)
    .slice(0, 40);
  const script = String(body.script ?? "").trim().slice(0, 20000) || null;
  const approve = body.approve === true;

  const { data: campaign, error } = await ctx.supabase
    .from("campaigns")
    .update({
      script,
      script_flow: flow,
      script_objections: objections,
      script_status: approve ? "approved" : "draft",
      script_approved_at: approve ? new Date().toISOString() : null,
      script_approved_by: approve ? ctx.user.id : null,
    })
    .eq("id", id)
    .select("name")
    .single();
  if (error || !campaign) return Response.json({ error: error?.message ?? "Not found" }, { status: 500 });
  await logActivity(ctx.profile.org_id, ctx.user.id, approve ? "script.approved" : "script.saved", { campaign: campaign.name });
  return Response.json({ ok: true, status: approve ? "approved" : "draft" });
}
