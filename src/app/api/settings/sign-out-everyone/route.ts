import { getContext, isManager } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

/** Signs every member of the company out of every device (managers). */
export async function POST() {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!isManager(ctx.profile)) return Response.json({ error: "Managers only" }, { status: 403 });
  await logActivity(ctx.profile.org_id, ctx.user.id, "signed_out_everyone");
  const { data, error } = await ctx.supabase.rpc("sign_out_org");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sessions: data });
}
