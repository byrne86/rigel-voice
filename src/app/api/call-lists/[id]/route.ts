import { getContext, isManager, isUuid } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/** Deletes a call list and its contacts (managers). Calls already made are kept. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: list } = await ctx.supabase.from("call_lists").select("name").eq("id", id).single();
  const { error } = await ctx.supabase.from("call_lists").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "call_list.deleted", { name: list?.name });
  return Response.json({ ok: true });
}
