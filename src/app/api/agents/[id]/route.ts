import { getContext, isManager, isUuid } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";

/** Change an agent's access (managers). The database stops anyone touching the owner or their own role. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  const { role } = await req.json().catch(() => ({}));
  if (!isUuid(id) || !["agent", "manager"].includes(role)) return Response.json({ error: "Bad request" }, { status: 400 });
  const { data, error } = await ctx.supabase.from("profiles").update({ role }).eq("id", id).select("role, email").single();
  if (error || !data) return Response.json({ error: error?.message ?? "Not found" }, { status: 404 });
  if (data.role !== role) return Response.json({ error: "You can't change that person's access" }, { status: 403 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "agent.access_changed", { email: data.email, role });
  return Response.json({ ok: true });
}

/** Removes someone from the team and deletes their login (managers). Their past calls are kept. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id) || id === ctx.user.id) return Response.json({ error: "You can't remove yourself" }, { status: 400 });
  const { data: person } = await ctx.supabase.from("profiles").select("role, email").eq("id", id).maybeSingle();
  if (!person) return Response.json({ error: "Not found" }, { status: 404 });
  if (person.role === "owner") return Response.json({ error: "The account owner can't be removed" }, { status: 403 });
  if (person.role === "manager" && ctx.profile.role !== "owner") return Response.json({ error: "Only the owner can remove a manager" }, { status: 403 });
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "agent.removed", { email: person.email });
  return Response.json({ ok: true });
}
