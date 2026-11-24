import { getContext, isUuid } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Marks that the agent got through to the decision maker on this call. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Call not found" }, { status: 404 });
  const { data: call } = await ctx.supabase.from("calls").select("id, agent_id").eq("id", id).single();
  if (!call || call.agent_id !== ctx.user.id) return Response.json({ error: "Call not found" }, { status: 404 });
  await createAdminClient().from("calls").update({ reached_dm: true }).eq("id", id);
  return Response.json({ ok: true });
}
